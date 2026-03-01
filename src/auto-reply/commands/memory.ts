// src/auto-reply/commands/memory.ts

import type { CommandRegistry } from './registry.js';
import { MemoryManager } from '../../memory/manager.js';

/**
 * 注册 /memory 命令
 *
 * 用法：
 *   /memory <内容>             → 强制保存内容到长期记忆（默认 fact 类型）
 *   /memory pref <内容>        → 保存为用户偏好
 *   /memory decision <内容>    → 保存为重要决策
 *   /memory context <内容>     → 保存为个人上下文
 */
export function registerMemoryCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'memory',
    description: '强制保存内容到长期记忆，用法：/memory <内容>',
    aliases: ['remember', 'mem'],
    handler: async (args) => {
      if (args.length === 0) {
        return '❌ 用法：`/memory <要记住的内容>`\n\n示例：\n- `/memory 我的技术栈是 Next.js + PostgreSQL`\n- `/memory pref 我喜欢简洁的代码风格`\n- `/memory decision 暂不引入微服务`';
      }

      // 检查第一个词是否是类型标记
      const categoryMap: Record<string, string> = {
        pref: 'user_preference',
        preference: 'user_preference',
        fact: 'fact',
        decision: 'decision',
        context: 'context',
        ctx: 'context',
      };

      let category = 'fact';
      let contentArgs = args;

      if (args.length > 1 && categoryMap[args[0].toLowerCase()]) {
        category = categoryMap[args[0].toLowerCase()];
        contentArgs = args.slice(1);
      }

      const content = contentArgs.join(' ');

      try {
        const manager = new MemoryManager();
        const id = await manager.add({
          agentId: 'default',
          content,
          source: category,
          createdAt: Date.now(),
        });

        const categoryLabel: Record<string, string> = {
          user_preference: '用户偏好',
          fact: '事实',
          decision: '决策',
          context: '上下文',
        };

        return `📌 **已保存到长期记忆**\n\n内容：${content}\n类型：${categoryLabel[category] || category}\nID：${id}`;
      } catch (error) {
        const err = error as Error;
        return `❌ 保存失���：${err.message}`;
      }
    },
  });
}
