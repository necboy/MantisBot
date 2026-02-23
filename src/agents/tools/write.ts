import type { Tool } from '../../types.js';
import fs from 'fs';
import path from 'path';
import { getConfig } from '../../config/loader.js';
import { workDirManager } from '../../workdir/manager.js';

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

export const writeTool: Tool = {
  name: 'write',
  description: '写入文件内容。创建新文件或完全覆盖现有文件。如果要编辑文件的部分内容，请使用 edit 工具。',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要写入的文件绝对路径'
      },
      content: {
        type: 'string',
        description: '要写入的完整内容'
      }
    },
    required: ['file_path', 'content']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { file_path, content } = params;

    if (!file_path || typeof file_path !== 'string') {
      return { success: false, error: '需要提供文件路径' };
    }

    if (content === undefined || content === null) {
      return { success: false, error: '需要提供文件内容' };
    }

    // 安全检查
    if (!isPathSafe(file_path)) {
      return { success: false, error: '只能写入工作目录或 /tmp 下的文件' };
    }

    try {
      const contentStr = String(content);

      // 确保目录存在
      const dir = path.dirname(file_path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 检查文件是否已存在
      const exists = fs.existsSync(file_path);

      // 写入文件
      fs.writeFileSync(file_path, contentStr, 'utf-8');

      return {
        success: true,
        path: file_path,
        bytesWritten: Buffer.byteLength(contentStr, 'utf-8'),
        action: exists ? 'overwritten' : 'created'
      };

    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: `写入失败: ${err.message}` };
    }
  }
};
