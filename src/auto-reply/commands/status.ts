// src/auto-reply/commands/status.ts

import type { CommandRegistry } from './registry.js';
import type { SessionManager } from '../../session/manager.js';
import { getConfig } from '../../config/loader.js';
import { estimateConversationTokens } from '../../utils/token-counter.js';

/**
 * 注册 /status 命令
 *
 * 参考 OpenClaw 的 buildStatusMessage()，裁剪为适合 MantisBot 的版本。
 * 显示：当前模型、会话消息数、上下文占用估算、session TTL 配置
 *
 * 用法：
 *   /status  → 显示当前会话和系统状态
 */
export function registerStatusCommand(
  registry: CommandRegistry,
  sessionManager: SessionManager
): void {
  registry.register({
    name: 'status',
    description: '查看当前模型、会话状态和上下文占用',
    aliases: ['info', 'stat'],
    handler: async (_args, context) => {
      const config = getConfig();
      const sections: string[] = [];

      // --- 模型信息 ---
      const defaultModel = config.defaultModel || config.models[0]?.name || '(未设置)';
      const modelConfig = config.models.find(m => m.name === defaultModel) || config.models[0] as any;
      const protocol = modelConfig?.protocol || 'openai';
      const modelLine = modelConfig
        ? `🤖 **当前模型**：${defaultModel}（${protocol} / ${modelConfig.model}）`
        : `🤖 **当前模型**：${defaultModel}`;
      sections.push(modelLine);

      // --- 会话信息 ---
      if (context?.chatId) {
        const session = sessionManager.getSession(context.chatId);
        if (session) {
          const msgCount = session.messages.length;
          const messages = session.messages.map(m => ({ role: m.role, content: m.content }));
          const estimatedTokens = estimateConversationTokens(messages);
          const maxInputChars = config.session?.maxInputChars ?? 80000;
          const usagePercent = Math.round((estimatedTokens * 3 / maxInputChars) * 100);
          const lastActive = new Date(session.updatedAt).toLocaleString('zh-CN');

          sections.push(`💬 **会话消息数**：${msgCount} 条`);
          sections.push(`📏 **上下文占用**：约 ${estimatedTokens.toLocaleString()} tokens（≈${usagePercent}% 预算）`);
          sections.push(`🕐 **最后活跃**：${lastActive}`);
        } else {
          sections.push(`💬 **会话**：当前会话为空`);
        }
      } else {
        sections.push(`💬 **会话**：无法获取会话信息`);
      }

      // --- 配置信息 ---
      const ttlDays = config.session?.ttlDays ?? 30;
      const maxMessages = config.session?.maxMessages ?? 100;
      sections.push(`⚙️ **会话配置**：最多 ${maxMessages} 条消息，${ttlDays} 天不活跃后归档`);

      // --- 启用的渠道 ---
      const enabledChannels: string[] = [];
      const channels = config.channels || {};
      if ((channels as any).httpWs?.enabled !== false) enabledChannels.push('Web UI');
      if ((channels as any).feishu?.enabled) enabledChannels.push('飞书');
      if ((channels as any).slack?.enabled) enabledChannels.push('Slack');
      if (enabledChannels.length > 0) {
        sections.push(`📡 **启用渠道**：${enabledChannels.join('、')}`);
      }

      return `📊 **MantisBot 状态**\n\n` + sections.join('\n\n');
    },
  });
}
