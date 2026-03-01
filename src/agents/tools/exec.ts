import type { Tool } from '../../types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getConfig } from '../../config/loader.js';
import { workDirManager } from '../../workdir/manager.js';

const execAsync = promisify(exec);

// 安全限制
const MAX_OUTPUT_SIZE = 100000; // 最大输出 100KB（增加到 100KB）
const COMMAND_TIMEOUT = 30000; // 命令超时 30 秒

// 允许的命令白名单（基础命令）
const ALLOWED_COMMANDS = [
  'curl', 'wget', 'http',
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep', 'sed', 'awk',
  'echo', 'printf',
  'cd', 'pwd',
  'date', 'cal', 'uptime', 'whoami', 'hostname',
  'df', 'du', 'free',
  'git', 'gh',
  'node', 'npm', 'npx', 'yarn', 'pnpm',
  'python', 'python3', 'pip', 'pip3',
  'jq', 'yq',
  'which', 'whereis', 'type',
  'mkdir', 'touch', 'rm', 'cp', 'mv', 'ln',
  'chmod', 'chown',
  'open', 'pbcopy', 'pbpaste',
  // macOS 特定工具
  'mdfind',      // Spotlight 搜索
  'mdls',        // 元数据查看
  'screencapture', // 截图工具
  'osascript',   // AppleScript 执行
  // PDF 工具（poppler-utils / qpdf / pdftk）
  'pdftotext', 'pdftoppm', 'pdfimages', 'pdfinfo',
  'pdfseparate', 'pdfunite', 'pdftocairo',
  'qpdf', 'pdftk',
];

// 危险命令黑名单
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,  // rm -rf /
  /sudo\s/,          // sudo
  />\s*\/dev\/sd/,   // 写入磁盘
  /mkfs/,            // 格式化
  /dd\s+if=/,        // dd 命令
  /:\(\)\{\s*:\|:\s*&\s*\};\s*:/, // fork bomb
];

function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  const baseCmd = command.trim().split(/\s+/)[0];

  // 检查黑名单
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { allowed: false, reason: '命令包含危险操作' };
    }
  }

  // 检查白名单
  const isAllowed = ALLOWED_COMMANDS.some(cmd => baseCmd === cmd || baseCmd.endsWith('/' + cmd));

  if (!isAllowed) {
    return { allowed: false, reason: `命令 "${baseCmd}" 不在允许列表中` };
  }

  return { allowed: true };
}

/**
 * 检查命令中是否有路径访问权限
 * 只检查明确的绝对路径访问，不限制命令本身
 */
function isPathAccessAllowed(command: string): { allowed: boolean; reason?: string } {
  const config = getConfig();
  const allowedPaths = config.allowedPaths || [];
  const workDir = workDirManager.getCurrentWorkDir();

  // 提取命令中的绝对路径参数（只匹配以 / 开头的路径）
  // 改进：排除看起来像代码的内容（// 注释、正则表达式等）
  const pathPatterns = /(?:\s|=|^)(\/[a-zA-Z0-9_\-\.\/]+)(?:\s|$)/g;
  let match;

  while ((match = pathPatterns.exec(command)) !== null) {
    const accessedPath = match[1];

    // 跳过看起来像代码注释的路径（如 // 开头）
    // 这是常见 JS/TS/Java/C++ 注释格式
    if (accessedPath === '/' || accessedPath.startsWith('//')) {
      continue;
    }

    // 跳过看起来像正则表达式的内容（如 /pattern/）
    // 检查是否以 / 开头和结尾，中间有字母数字
    if (/^\/[a-zA-Z0-9]+\/[a-zA-Z0-9]*$/.test(accessedPath)) {
      continue;
    }

    // 跳过命令本身（如 /usr/bin/ls, /bin/cat）
    if (accessedPath.startsWith('/usr') || accessedPath.startsWith('/bin') || accessedPath.startsWith('/sbin')) {
      continue;
    }

    // 跳过常见的系统路径
    if (accessedPath.startsWith('/dev') || accessedPath.startsWith('/proc') || accessedPath.startsWith('/sys')) {
      return { allowed: false, reason: `命令访问了系统目录: ${accessedPath}` };
    }

    // 检查是否在工作目录内
    if (accessedPath.startsWith(workDir)) {
      continue;
    }

    // 检查是否在 /tmp 内
    if (accessedPath.startsWith('/tmp')) {
      continue;
    }

    // 检查是否在允许的路径内
    let isAllowed = false;
    for (const allowedPath of allowedPaths) {
      if (accessedPath.startsWith(allowedPath)) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed && allowedPaths.length > 0) {
      return { allowed: false, reason: `命令访问了未授权路径: ${accessedPath}` };
    }
  }

  return { allowed: true };
}

export const execTool: Tool = {
  name: 'exec',
  description: '执行 shell 命令。用于运行技能文件中定义的命令，如 curl 获取数据、git 操作等。只能执行白名单中的安全命令。',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: '要执行的 shell 命令'
      },
      timeout: {
        type: 'number',
        description: '命令超时时间（毫秒），默认 30000',
        default: COMMAND_TIMEOUT
      }
    },
    required: ['command']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { command, timeout = COMMAND_TIMEOUT } = params;

    if (!command || typeof command !== 'string') {
      return {
        success: false,
        error: '需要提供要执行的命令'
      };
    }

    // 安全检查 - 命令白名单
    const { allowed: cmdAllowed, reason: cmdReason } = isCommandAllowed(command);
    if (!cmdAllowed) {
      return {
        success: false,
        error: `命令被拒绝: ${cmdReason}`,
        hint: '只能执行白名单中的安全命令，如 curl, ls, git 等'
      };
    }

    // 安全检查 - 路径访问权限
    const { allowed: pathAllowed, reason: pathReason } = isPathAccessAllowed(command);
    if (!pathAllowed) {
      return {
        success: false,
        error: `命令被拒绝: ${pathReason}`,
        hint: '只能访问工作目录、/tmp 或在设置中配置的允许目录'
      };
    }

    try {
      console.log(`[Exec] Running: ${command}`);

      const workDir = workDirManager.getCurrentWorkDir();
      const { stdout, stderr } = await execAsync(command, {
        timeout: Number(timeout),
        maxBuffer: MAX_OUTPUT_SIZE * 2, // Buffer 大小是输出的 2 倍
        cwd: workDir,
        env: {
          ...process.env,
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8'
        }
      });

      // 截断输出
      let output = stdout;
      let truncated = false;

      if (output.length > MAX_OUTPUT_SIZE) {
        output = output.slice(0, MAX_OUTPUT_SIZE);
        truncated = true;
      }

      // 如果有 stderr，也包含进来
      const fullOutput = stderr
        ? `${output}\n\n[stderr]\n${stderr.slice(0, 2000)}`
        : output;

      console.log(`[Exec] Success: ${stdout.length} bytes`);

      return {
        success: true,
        output: fullOutput,
        truncated,
        command
      };

    } catch (error: unknown) {
      const err = error as { message?: string; killed?: boolean; signal?: string };

      console.error(`[Exec] Error:`, err.message);

      // 超时错误
      if (err.killed && err.signal === 'SIGTERM') {
        return {
          success: false,
          error: '命令执行超时',
          command
        };
      }

      return {
        success: false,
        error: err.message || '命令执行失败',
        command
      };
    }
  }
};
