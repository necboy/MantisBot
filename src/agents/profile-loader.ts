// src/agents/profile-loader.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { AgentProfile, ProfileMeta } from '../config/profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILES_DIR = path.resolve(__dirname, '../../data/agent-profiles');
const PROFILE_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md'] as const;

export class ProfileLoader {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || DEFAULT_PROFILES_DIR;
  }

  /**
   * 获取所有配置
   */
  async listProfiles(): Promise<ProfileMeta[]> {
    try {
      const entries = await fs.readdir(this.baseDir, { withFileTypes: true });
      const profiles: ProfileMeta[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const meta = await this.getProfileMeta(entry.name);
          if (meta) {
            profiles.push(meta);
          }
        }
      }

      return profiles;
    } catch (err) {
      console.error('[ProfileLoader] Error listing profiles:', err);
      return [];
    }
  }

  /**
   * 获取单个配置
   */
  async getProfile(name: string): Promise<AgentProfile | null> {
    try {
      const profileDir = path.join(this.baseDir, name);
      await fs.access(profileDir);

      const profile: AgentProfile = {
        name,
        description: '',
        createdAt: 0,
        updatedAt: 0,
      };

      for (const file of PROFILE_FILES) {
        const filePath = path.join(profileDir, file);
        try {
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          const key = file.toLowerCase().replace('.md', '') as 'soul' | 'identity' | 'user';
          profile[key] = content;

          if (profile.createdAt === 0 || stat.birthtimeMs < (profile.createdAt ?? 0)) {
            profile.createdAt = stat.birthtimeMs;
          }
          if (stat.mtimeMs > (profile.updatedAt ?? 0)) {
            profile.updatedAt = stat.mtimeMs;
          }
        } catch {
          // File doesn't exist, skip
        }
      }

      return profile;
    } catch {
      return null;
    }
  }

  /**
   * 获取配置元信息
   */
  private async getProfileMeta(name: string): Promise<ProfileMeta | null> {
    try {
      const profileDir = path.join(this.baseDir, name);
      const stat = await fs.stat(profileDir);

      return {
        name,
        description: '',
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
      };
    } catch {
      return null;
    }
  }

  /**
   * 保存配置
   */
  async saveProfile(profile: AgentProfile): Promise<void> {
    const profileDir = path.join(this.baseDir, profile.name);
    await fs.mkdir(profileDir, { recursive: true });

    if (profile.soul !== undefined) {
      await fs.writeFile(path.join(profileDir, 'SOUL.md'), profile.soul, 'utf-8');
    }
    if (profile.identity !== undefined) {
      await fs.writeFile(path.join(profileDir, 'IDENTITY.md'), profile.identity, 'utf-8');
    }
    if (profile.user !== undefined) {
      await fs.writeFile(path.join(profileDir, 'USER.md'), profile.user, 'utf-8');
    }
  }

  /**
   * 创建新配置（从模板复制）
   */
  async createProfile(name: string, template: string = 'default'): Promise<void> {
    const sourceDir = path.join(this.baseDir, template);
    const targetDir = path.join(this.baseDir, name);

    // 检查模板是否存在
    try {
      await fs.access(sourceDir);
    } catch {
      throw new Error(`Template not found: ${template}`);
    }

    await fs.mkdir(targetDir, { recursive: true });

    for (const file of PROFILE_FILES) {
      const sourcePath = path.join(sourceDir, file);
      const targetPath = path.join(targetDir, file);
      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch {
        // 文件不存在，跳过
      }
    }
  }

  /**
   * 删除配置
   */
  async deleteProfile(name: string): Promise<void> {
    if (name === 'default' || name === 'developer') {
      throw new Error('Cannot delete default profiles');
    }

    const profileDir = path.join(this.baseDir, name);
    await fs.rm(profileDir, { recursive: true, force: true });
  }

  /**
   * 获取当前激活的配置名称
   */
  async getActiveProfileName(): Promise<string> {
    const configPath = path.join(this.baseDir, '.active');
    try {
      return (await fs.readFile(configPath, 'utf-8')).trim();
    } catch {
      return 'default';
    }
  }

  /**
   * 设置当前激活的配置
   */
  async setActiveProfileName(name: string): Promise<void> {
    // 验证配置目录存在
    const profileDir = path.join(this.baseDir, name);

    // 直接使用同步方法检查
    const fsSync = require('fs');
    const exists = fsSync.existsSync(profileDir);

    if (!exists) {
      throw new Error(`Profile not found: ${name}`);
    }

    const configPath = path.join(this.baseDir, '.active');
    await fs.writeFile(configPath, name, 'utf-8');
  }

  /**
   * 获取当前激活的完整配置
   */
  async getActiveProfile(): Promise<AgentProfile | null> {
    const activeName = await this.getActiveProfileName();
    return this.getProfile(activeName);
  }

  /**
   * 获取用于注入到系统提示词的 Profile 内容
   */
  async getProfilePrompt(): Promise<string> {
    const profile = await this.getActiveProfile();
    if (!profile) {
      return '';
    }

    let prompt = '\n\n## Agent Profile\n';

    if (profile.soul) {
      prompt += '\n### Soul\n' + profile.soul + '\n';
    }
    if (profile.identity) {
      prompt += '\n### Identity\n' + profile.identity + '\n';
    }
    if (profile.user) {
      prompt += '\n### User Context\n' + profile.user + '\n';
    }

    return prompt;
  }
}

// 单例实例（延迟初始化）
let profileLoaderInstance: ProfileLoader | null = null;

export function getProfileLoader(workspace?: string): ProfileLoader {
  if (!profileLoaderInstance) {
    const profilesDir = workspace ? path.join(workspace, 'agent-profiles') : undefined;
    profileLoaderInstance = new ProfileLoader(profilesDir);
  }
  return profileLoaderInstance;
}

// 兼容旧代码的默认导出
export const profileLoader = new ProfileLoader();
