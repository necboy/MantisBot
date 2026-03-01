// src/agents/tools/remember.ts

import type { Tool } from '../../types.js';
import { MemoryManager } from '../../memory/manager.js';

export const rememberTool: Tool = {
  name: 'remember',
  description:
    '将值得长期记住的信息保存到记忆库。' +
    '仅在你学到对未来对话有价值的信息时调用：用户偏好、项目事实、重要决策、个人上下文。' +
    '不要用于记录普通问答、调试步骤或仅与当前任务相关的内容。',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '要记住的具体事实、偏好或决策，应简洁明确'
      },
      category: {
        type: 'string',
        enum: ['user_preference', 'fact', 'decision', 'context'],
        description: '记忆类型：user_preference=用户偏好，fact=项目事实，decision=重要决策，context=个人上下文'
      }
    },
    required: ['content', 'category']
  },
  execute: async (params: Record<string, unknown>): Promise<unknown> => {
    const { content, category } = params;

    if (!content || typeof content !== 'string') {
      return { success: false, error: '需要提供要记住的内容' };
    }

    if (!category || typeof category !== 'string') {
      return { success: false, error: '需要提供记忆类型' };
    }

    try {
      const manager = new MemoryManager();
      const id = await manager.add({
        agentId: 'default',
        content: String(content),
        source: String(category),
        createdAt: Date.now(),
      });

      console.log('[RememberTool] Saved memory id:', id, 'content:', content.substring(0, 50));

      return {
        success: true,
        id,
        content,
        category,
        message: '已保存到长期记忆'
      };
    } catch (error) {
      const err = error as Error;
      return { success: false, error: `保存失败: ${err.message}` };
    }
  }
};
