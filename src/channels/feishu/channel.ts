// src/channels/feishu/channel.ts

import { v4 as uuidv4 } from 'uuid';
import type { IChannel, FileAttachment, ChannelMessage } from '../channel.interface.js';
import { startFeishuWSClient, sendFeishuMessage, sendFeishuFile, stopFeishuWSClient, isFeishuEnabled } from './client.js';

export interface FeishuChannelOptions {
  onMessage: (message: ChannelMessage) => Promise<void>;
}

export class FeishuChannel implements IChannel {
  name = 'feishu';
  platform = 'feishu';
  enabled = false;

  private onMessage: FeishuChannelOptions['onMessage'];

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

    await startFeishuWSClient(async (message, chatId, userId) => {
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
      await sendFeishuMessage(chatId, message);
      console.log(`[FeishuChannel] Message sent to ${chatId}`);
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
