// src/auto-reply/commands/whoami.ts

import type { CommandRegistry } from './registry.js';

/**
 * 注册 /whoami 命令
 *
 * 参考 OpenClaw 的 handleWhoamiCommand()，显示当前用户和渠道身份信息。
 * 在多渠道场景下，有助于确认消息来源和调试权限问题。
 *
 * 用法：
 *   /whoami  → 显示当前渠道、chatId、userId
 */
export function registerWhoamiCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'whoami',
    description: '显示当前渠道、会话 ID 和用户身份信息',
    aliases: ['me', 'id'],
    handler: async (_args, context) => {
      if (!context) {
        return '❌ 无法获取身份信息，请稍后重试。';
      }

      const platformLabels: Record<string, string> = {
        'http-ws': '🌐 Web UI',
        'feishu': '🐦 飞书',
        'slack': '💬 Slack',
        'dingtalk': '📱 钉钉',
        'wecom': '🏢 企业微信',
        'whatsapp': '📲 WhatsApp',
      };

      const platformLabel = platformLabels[context.platform] || `📡 ${context.platform}`;

      const lines = [
        `📡 **渠道**：${platformLabel}`,
        `💬 **会话 ID**：\`${context.chatId}\``,
      ];

      if (context.userId && context.userId !== context.chatId) {
        lines.push(`🆔 **用户 ID**：\`${context.userId}\``);
      }

      lines.push('💡 *这些信息可用于调试消息路由问题*');

      return `👤 **身份信息**\n\n` + lines.join('\n\n');
    },
  });
}
