// src/agents/tools/logger.ts
// 日志工具 - 占位实现

import type { Tool } from '../../types.js';

export const loggerTool: Tool = {
  name: 'logger',
  description: '日志记录工具',
  parameters: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        description: '日志级别: debug, info, warn, error'
      },
      message: {
        type: 'string',
        description: '日志消息'
      }
    },
    required: ['level', 'message']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { level, message } = params;
    console.log(`[${level}] ${message}`);
    return { success: true };
  }
};
