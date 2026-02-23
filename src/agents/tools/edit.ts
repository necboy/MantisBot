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

export const editTool: Tool = {
  name: 'edit',
  description: '编辑文件内容。通过查找��替换来修改文件的部分内容。如果要完全重写文件，请使用 write 工具。',
  parameters: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: '要编辑的文件绝对路径'
      },
      old_string: {
        type: 'string',
        description: '要查找的文本（必须精确匹配）'
      },
      new_string: {
        type: 'string',
        description: '替换后的文本'
      },
      replace_all: {
        type: 'boolean',
        description: '是否替换所有匹配项（默认只替换第一个）',
        default: false
      }
    },
    required: ['file_path', 'old_string', 'new_string']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { file_path, old_string, new_string, replace_all = false } = params;

    if (!file_path || typeof file_path !== 'string') {
      return { success: false, error: '需要提供文件路径' };
    }

    if (typeof old_string !== 'string' || old_string === '') {
      return { success: false, error: '需要提供要查找的文本' };
    }

    if (typeof new_string !== 'string') {
      return { success: false, error: '需要提供替换后的文本' };
    }

    // 安全检查
    if (!isPathSafe(file_path)) {
      return { success: false, error: '只能编辑工作目录或 /tmp 下的文件' };
    }

    try {
      if (!fs.existsSync(file_path)) {
        return { success: false, error: `文件不存在: ${file_path}` };
      }

      const content = fs.readFileSync(file_path, 'utf-8');

      // 检查是否能找到 old_string
      if (!content.includes(old_string)) {
        return {
          success: false,
          error: `未找到要替换的文本。请确保 old_string 与文件内容完全匹配（包括空格和换行）`
        };
      }

      // 执行替换
      let newContent: string;
      let replacementCount: number;

      if (replace_all) {
        // 统计匹配次数
        replacementCount = content.split(old_string).length - 1;
        newContent = content.split(old_string).join(new_string);
      } else {
        // 只替换第一个匹配
        const index = content.indexOf(old_string);
        if (index === -1) {
          return { success: false, error: '未找到要替换的文本' };
        }
        newContent = content.slice(0, index) + new_string + content.slice(index + old_string.length);
        replacementCount = 1;

        // 检查是否有多个匹配
        const remainingMatches = content.slice(index + old_string.length).includes(old_string);
        if (remainingMatches) {
          return {
            success: false,
            error: '文件中有多个匹配项，但 replace_all 为 false。请提供更具体的 old_string 或设置 replace_all 为 true'
          };
        }
      }

      // 写入文件
      fs.writeFileSync(file_path, newContent, 'utf-8');

      return {
        success: true,
        path: file_path,
        replacements: replacementCount
      };

    } catch (error: unknown) {
      const err = error as { message?: string };
      return { success: false, error: `编辑失败: ${err.message}` };
    }
  }
};
