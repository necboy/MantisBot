// src/auto-reply/commands/clear.ts

import type { CommandRegistry } from './registry.js';
import type { SessionManager } from '../../session/manager.js';

/**
 * 注册 /clear 命令
 *
 * 用法：
 *   /clear          → 清空当前会话的对话历史
 *   /clear confirm  → 同上（兼容带参数的调用）
 *
 * 行为说明：
 * - 只清空消息历史（messages 数组），不删除 session 元数据
 * - 下一条消息会在空白上下文中开始，LLM 不会记得之前的内容
 * - 记忆系统（memory）不受影响，长期记忆仍然保留
 */
export function registerClearCommand(
  registry: CommandRegistry,
  sessionManager: SessionManager
): void {
  registry.register({
    name: 'clear',
    description: '清空当前会话的对话历史，开启全新上下文',
    aliases: ['reset', 'new'],
    handler: async (_args, context) => {
      if (!context?.chatId) {
        return '❌ 无法获取当前会话 ID，请稍后重试。';
      }

      const session = sessionManager.getSession(context.chatId);
      if (!session) {
        return '✅ 当前会话已经是空的，无需清除。';
      }

      const messageCount = session.messages.length;
      const cleared = sessionManager.clearSession(context.chatId);

      if (!cleared) {
        return '❌ 清除会话失败，请稍后重试。';
      }

      console.log(
        `[Command/clear] 会话 ${context.chatId} 已清除` +
        `（删除了 ${messageCount} 条消息，platform=${context.platform}）`
      );

      return `✅ 对话历史已清除（共 ${messageCount} 条消息）。\n\n` +
        `现在可以开始全新的对话了，我已经忘记之前的所有内容。\n\n` +
        `（长期记忆不受影响，如需清除记忆请联系管理员）`;
    },
  });
}
