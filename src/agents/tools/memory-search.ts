// src/agents/tools/memory-search.ts

import type { Tool } from '../../types.js';
import { MemoryManager } from '../../memory/manager.js';

export const memorySearchTool: Tool = {
  name: 'memory_search',
  description:
    '搜索长期记忆（向量 + FTS 混合搜索）。' +
    '用于回忆之前的对话、用户偏好、重要决策等信息。' +
    '返回最相关的记忆片段。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词或自然语言描述'
      },
      limit: {
        type: 'number',
        description: '返回结果数量（默认 5）',
        default: 5
      },
      minScore: {
        type: 'number',
        description: '最小相关度分数（0.0-1.0，默认 0.3）',
        default: 0.3
      }
    },
    required: ['query']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { query, limit = 5, minScore = 0.3 } = params;

    if (!query || typeof query !== 'string') {
      return {
        success: false,
        error: '需要提供搜索关键词'
      };
    }

    try {
      const manager = new MemoryManager();

      // TODO: 从 context 获取 agentId 和 sessionKey
      // 当前使用默认值
      const agentId = 'default';
      const sessionKey = undefined; // 不限制会话

      const results = await manager.searchHybrid(agentId, query, {
        limit: Number(limit),
        minScore: Number(minScore)
      });

      // 格式化结果
      const formatted = results.map(r => ({
        content: r.content,
        score: r.score?.toFixed(3),
        timestamp: new Date(r.createdAt).toISOString(),
        sessionKey: r.sessionKey,
        snippet: r.snippet
      }));

      return {
        success: true,
        results: formatted,
        count: formatted.length
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: `搜索失败: ${err.message}`
      };
    }
  }
};
