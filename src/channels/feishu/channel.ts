// src/channels/feishu/channel.ts

import { v4 as uuidv4 } from 'uuid';
import type { IChannel, FileAttachment, ChannelMessage } from '../channel.interface.js';
import { startFeishuWSClient, sendFeishuMessage, replyFeishuMessage, sendFeishuFile, stopFeishuWSClient, isFeishuEnabled } from './client.js';

export interface FeishuChannelOptions {
  onMessage: (message: ChannelMessage) => Promise<void>;
}

export class FeishuChannel implements IChannel {
  name = 'feishu';
  platform = 'feishu';
  enabled = false;

  private onMessage: FeishuChannelOptions['onMessage'];
  // 记录每个群聊最后一条触发消息的 ID，用于回复引用
  private lastGroupMessageId = new Map<string, string>();

  constructor(options: FeishuChannelOptions) {
    this.onMessage = options.onMessage;
    this.enabled = isFeishuEnabled();
    console.log(`[FeishuChannel] Initialized, enabled=${this.enabled}`);
  }

  async start(): Promise<void> {
    console.log(`[FeishuChannel] start() called, enabled=${this.enabled}`);
    if (!this.enabled) {
      console.log('[FeishuChannel] Disabled, skipping start');
      return;
    }

    await startFeishuWSClient(async (message, chatId, userId, messageId) => {
      // 群聊时记录原消息 ID，回复时用于引用
      this.lastGroupMessageId.set(chatId, messageId);

      const channelMessage: ChannelMessage = {
        id: uuidv4(),
        content: message,
        chatId,
        userId,
        timestamp: Date.now(),
        platform: 'feishu'
      };

      await this.onMessage(channelMessage);
    });

    console.log('[FeishuChannel] Started');
  }

  async stop(): Promise<void> {
    stopFeishuWSClient();
    console.log('[FeishuChannel] Stopped');
  }

  async sendMessage(
    chatId: string,
    message: string,
    attachments?: FileAttachment[]
  ): Promise<void> {
    // 先发送文字消息
    if (message && message.trim()) {
      const replyToId = this.lastGroupMessageId.get(chatId);
      if (replyToId) {
        // 群聊：引用原消息回复
        this.lastGroupMessageId.delete(chatId);
        await replyFeishuMessage(replyToId, message);
        console.log(`[FeishuChannel] Reply sent to ${chatId} (replyTo: ${replyToId})`);
      } else {
        await sendFeishuMessage(chatId, message);
        console.log(`[FeishuChannel] Message sent to ${chatId}`);
      }
    }

    // 再逐个发送附件
    if (attachments && attachments.length > 0) {
      console.log(`[FeishuChannel] Sending ${attachments.length} attachment(s) to ${chatId}`);
      for (const attachment of attachments) {
        try {
          await sendFeishuFile(chatId, attachment as any);
        } catch (err) {
          console.error(`[FeishuChannel] Failed to send attachment ${attachment.name}:`, err);
        }
      }
    }
  }
}
