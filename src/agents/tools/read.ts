import type { Tool } from '../../types.js';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../../config/loader.js';
import { workDirManager } from '../../workdir/manager.js';

// 最大文件大小限制
const MAX_FILE_SIZE = 100 * 1024; // 100KB

function isPathSafe(filePath: string): boolean {
  const config = getConfig();
  const allowedPaths = config.allowedPaths || [];
  const workDir = workDirManager.getCurrentWorkDir();

  const resolved = path.resolve(filePath);

  // 先检查配置允许的路径
  for (const allowedPath of allowedPaths) {
    if (resolved.startsWith(allowedPath)) {
      return true;
    }
  }

  // 使用动态工作目录
  return resolved.startsWith(workDir) || resolved.startsWith('/tmp');
}

export const readTool: Tool = {
  name: 'read',
  description: '读取文件内容。可以读取文本文件，返回文件内容。支持读取代码、配置文件、日志等。',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要读取的文件绝对路径'
      },
      offset: {
        type: 'number',
        description: '起始行号（可选，从 1 开始）'
      },
      limit: {
        type: 'number',
        description: '读取的行数限制（可选）'
      }
    },
    required: ['file_path']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { file_path, offset, limit } = params;

    if (!file_path || typeof file_path !== 'string') {
      return { success: false, error: '需要提供文件路径' };
    }

    // 安全检查
    if (!isPathSafe(file_path)) {
      return { success: false, error: '只能读取工作目录或 /tmp 下的文件' };
    }

    try {
      if (!fs.existsSync(file_path)) {
        return { success: false, error: `文件不存在: ${file_path}` };
      }

      const stats = fs.statSync(file_path);
      if (stats.isDirectory()) {
        return { success: false, error: '不能读取目录，请使用 ls 命令' };
      }

      if (stats.size > MAX_FILE_SIZE) {
        return {
          success: false,
          error: `文件过大 (${Math.round(stats.size / 1024)}KB)，超过 100KB 限制`
        };
      }

      const content = fs.readFileSync(file_path, 'utf-8');
      const lines = content.split('\n');

      // 应用 offset 和 limit
      let selectedLines = lines;
      if (offset !== undefined || limit !== undefined) {
        const startLine = Math.max(0, (Number(offset) || 1) - 1);
        const endLine = limit !== undefined ? startLine + Number(limit) : lines.length;
        selectedLines = lines.slice(startLine, endLine);
      }

      // 添加行号
      const numberedContent = selectedLines
        .map((line, idx) => {
          const lineNum = (offset !== undefined ? Number(offset) : 1) + idx;
          return `${String(lineNum).padStart(6, ' ')}\t${line}`;
        })
        .join('\n');

      return {
        success: true,
        content: numberedContent,
        path: file_path,
        totalLines: lines.length,
        returnedLines: selectedLines.length
      };

    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: `读取失败: ${err.message}` };
    }
  }
};
