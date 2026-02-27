// src/agents/skills/github-installer.ts
// Download and install Skills from GitHub repositories.
// Strategy: git clone --depth 1 first; fall back to GitHub Archive ZIP if git is unavailable.

import { spawn } from 'child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, mkdirSync, readdirSync, statSync, createWriteStream } from 'fs';
import { join, resolve, basename, sep } from 'path';
import { tmpdir } from 'os';
import * as https from 'https';
import * as http from 'http';
import extractZip from 'extract-zip';

const SKILL_FILE_NAME = 'SKILL.md';

// ── Types ──────────────────────────────────────────────────────────────────

interface NormalizedGitSource {
  repoUrl: string;
  ref?: string;
  sourceSubpath?: string;
}

interface GithubRepoSource {
  owner: string;
  repo: string;
}

// ── Safety helpers ─────────────────────────────────────────────────────────

/** Resolve `target` relative to `root`, throwing if it escapes root. */
function resolveWithin(root: string, target: string): string {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(root, target);
  if (!resolvedTarget.startsWith(resolvedRoot + sep)) {
    throw new Error('Invalid target path');
  }
  return resolvedTarget;
}

/** Strip characters that are illegal in folder names. */
function normalizeFolderName(name: string): string {
  const normalized = name.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'skill';
}

// ── GitHub URL parsing ─────────────────────────────────────────────────────

function parseGithubRepoSource(repoUrl: string): GithubRepoSource | null {
  const trimmed = repoUrl.trim();

  // SSH: git@github.com:owner/repo[.git]
  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

  // HTTPS: https://github.com/owner/repo[.git]
  try {
    const url = new URL(trimmed);
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
    const segments = url.pathname.replace(/\.git$/i, '').split('/').filter(Boolean);
    if (segments.length < 2) return null;
    return { owner: segments[0], repo: segments[1] };
  } catch {
    return null;
  }
}

/** Parse GitHub tree/blob URL, extracting the subdirectory path and ref. */
function parseGithubTreeOrBlobUrl(source: string): NormalizedGitSource | null {
  let url: URL;
  try { url = new URL(source.trim()); } catch { return null; }

  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 4) return null;

  const [owner, repoRaw, mode, ref, ...rest] = segments;
  if (mode !== 'tree' && mode !== 'blob') return null;

  const repo = repoRaw.replace(/\.git$/i, '');
  return {
    repoUrl: `https://github.com/${owner}/${repo}.git`,
    sourceSubpath: rest.length > 0 ? rest.join('/') : undefined,
    ref: decodeURIComponent(ref),
  };
}

/**
 * Normalize various GitHub source formats into a canonical form.
 *
 * Supported formats:
 *   owner/repo
 *   https://github.com/owner/repo[.git]
 *   git@github.com:owner/repo.git
 *   https://github.com/owner/repo/tree/branch/path/to/skill
 */
export function normalizeGitSource(source: string): NormalizedGitSource | null {
  const trimmed = source.trim();

  const treeOrBlob = parseGithubTreeOrBlobUrl(trimmed);
  if (treeOrBlob) return treeOrBlob;

  if (/^[\w.-]+\/[\w.-]+$/.test(trimmed)) {
    return { repoUrl: `https://github.com/${trimmed}.git` };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('git@')) {
    return { repoUrl: trimmed };
  }

  return null;
}

// ── Process / network helpers ──────────────────────────────────────────────

function runCommand(command: string, args: string[], opts?: { env?: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: opts?.env,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Command failed: exit ${code}`));
    });
  });
}

/** Download `url` to `destPath`, following redirects. */
function downloadFile(url: string, destPath: string, extraHeaders?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'MantisBot-SkillInstaller', ...extraHeaders };

    const request = (reqUrl: string) => {
      const protocol = reqUrl.startsWith('https:') ? https : http;
      protocol.get(reqUrl, { headers }, res => {
        const { statusCode, headers: resHeaders } = res;

        if (statusCode && statusCode >= 300 && statusCode < 400 && resHeaders.location) {
          res.resume();
          return request(resHeaders.location);
        }
        if (statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${statusCode} from ${reqUrl}`));
        }

        const file = createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
        file.on('error', err => { rmSync(destPath, { force: true }); reject(err); });
      }).on('error', reject);
    };

    request(url);
  });
}

// ── Archive download ───────────────────────────────────────────────────────

async function downloadGithubArchive(
  src: GithubRepoSource,
  tempRoot: string,
  ref?: string,
): Promise<string> {
  const { owner, repo } = src;
  const enc = ref ? encodeURIComponent(ref) : '';

  const candidates: Array<{ url: string; headers?: Record<string, string> }> = [];

  if (enc) {
    candidates.push(
      { url: `https://github.com/${owner}/${repo}/archive/refs/heads/${enc}.zip` },
      { url: `https://github.com/${owner}/${repo}/archive/refs/tags/${enc}.zip` },
      { url: `https://github.com/${owner}/${repo}/archive/${enc}.zip` },
    );
  }

  candidates.push({
    url: `https://api.github.com/repos/${owner}/${repo}/zipball/${enc}`,
    headers: {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const zipPath = join(tempRoot, 'archive.zip');
  let lastError: Error | null = null;

  for (const { url, headers } of candidates) {
    try {
      await downloadFile(url, zipPath, headers);
      lastError = null;
      break;
    } catch (err) {
      if (existsSync(zipPath)) rmSync(zipPath, { force: true });
      lastError = err as Error;
    }
  }

  if (lastError) throw lastError;

  const extractRoot = join(tempRoot, 'extracted');
  mkdirSync(extractRoot, { recursive: true });
  await extractZip(zipPath, { dir: extractRoot });

  return extractRoot;
}

// ── Skill discovery ────────────────────────────────────────────────────────

function listSkillDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .map(n => join(dir, n))
      .filter(p => {
        try { return statSync(p).isDirectory() && existsSync(join(p, SKILL_FILE_NAME)); }
        catch { return false; }
      });
  } catch { return []; }
}

function collectSkillDirsRecursively(dir: string, depth = 0): string[] {
  if (depth > 3 || !existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      try {
        if (!statSync(full).isDirectory()) continue;
        if (existsSync(join(full, SKILL_FILE_NAME))) {
          results.push(full);
        } else {
          results.push(...collectSkillDirsRecursively(full, depth + 1));
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

/**
 * Find all skill directories under `sourceRoot`, optionally restricted to `subpath`.
 * Search order: direct SKILL.md → SKILLs/skills/ subdirs → direct children → recursive.
 */
function collectSkillDirs(sourceRoot: string, subpath?: string): string[] {
  const root = subpath ? resolve(join(sourceRoot, subpath)) : resolve(sourceRoot);

  // Guard against path traversal in subpath
  if (!root.startsWith(resolve(sourceRoot))) throw new Error('Invalid subpath');
  if (!existsSync(root)) return [];

  if (existsSync(join(root, SKILL_FILE_NAME))) return [root];

  for (const subdir of ['SKILLs', 'skills']) {
    const found = listSkillDirs(join(root, subdir));
    if (found.length > 0) return found;
  }

  const direct = listSkillDirs(root);
  if (direct.length > 0) return direct;

  return collectSkillDirsRecursively(root);
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface InstallResult {
  success: boolean;
  installed?: string[];
  error?: string;
}

/**
 * Download and install Skills from a GitHub source into `skillsDir`.
 *
 * @param source   GitHub URL, owner/repo shorthand, or tree/blob URL
 * @param skillsDir  Destination directory (the project's `skills/` folder)
 */
export async function installSkillFromSource(
  source: string,
  skillsDir: string,
): Promise<InstallResult> {
  const normalized = normalizeGitSource(source.trim());
  if (!normalized) {
    return { success: false, error: 'Invalid source. Use owner/repo or a GitHub URL.' };
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'mantisbot-skill-'));

  try {
    let localSource: string;

    // ── Phase 1: git clone ──────────────────────────────────────────────
    try {
      const cloneDir = join(tempRoot, 'repo');
      const args = ['clone', '--depth', '1'];
      if (normalized.ref) args.push('--branch', normalized.ref);
      args.push(normalized.repoUrl, cloneDir);

      await runCommand('git', args);
      localSource = cloneDir;
    } catch (gitErr) {
      // ── Phase 2: GitHub Archive API fallback ───────────────────────
      const gh = parseGithubRepoSource(normalized.repoUrl);
      if (!gh) {
        throw new Error(
          `git clone failed and source is not a GitHub URL: ${(gitErr as Error).message}`,
        );
      }
      console.log('[SkillInstaller] git not available, using GitHub Archive API');
      const extractedRoot = await downloadGithubArchive(gh, tempRoot, normalized.ref);

      // Archives extract to a single `owner-repo-hash/` directory
      const entries = readdirSync(extractedRoot).filter(n => {
        try { return statSync(join(extractedRoot, n)).isDirectory(); } catch { return false; }
      });
      localSource = entries.length === 1 ? join(extractedRoot, entries[0]) : extractedRoot;
    }

    // ── Discover skills ─────────────────────────────────────────────────
    const skillDirs = collectSkillDirs(localSource, normalized.sourceSubpath);
    if (skillDirs.length === 0) {
      return { success: false, error: 'No SKILL.md found in the repository.' };
    }

    // ── Install ──────────────────────────────────────────────────────────
    mkdirSync(skillsDir, { recursive: true });
    const installed: string[] = [];

    for (const skillDir of skillDirs) {
      let folderName = normalizeFolderName(basename(skillDir));

      // Conflict: add numeric suffix
      let candidate = join(skillsDir, folderName);
      let suffix = 1;
      while (existsSync(candidate)) {
        candidate = join(skillsDir, `${folderName}-${suffix++}`);
      }

      // Safety check
      try {
        resolveWithin(skillsDir, basename(candidate));
      } catch {
        continue;
      }

      cpSync(skillDir, candidate, { recursive: true, dereference: false });
      installed.push(basename(candidate));
    }

    if (installed.length === 0) {
      return { success: false, error: 'No skills could be installed.' };
    }

    console.log(`[SkillInstaller] Installed: ${installed.join(', ')}`);
    return { success: true, installed };
  } catch (err) {
    const message = (err as Error).message ?? 'Unknown error';
    console.error('[SkillInstaller] Failed:', message);
    return { success: false, error: message };
  } finally {
    try { rmSync(tempRoot, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
