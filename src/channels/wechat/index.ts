import type { IChannel, ChannelMessage, MessageHandler, FileAttachment, ChannelStatus } from '../channel.interface.js';
import { getConfig } from '../../config/loader.js';
import { WeChatClient } from './client.js';

export class WeChatChannel implements IChannel {
  readonly name = 'wechat';
  readonly platform = 'wechat';
  readonly enabled: boolean;

  private client?: WeChatClient;
  private messageHandler?: MessageHandler;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[WeChatChannel] Disabled, skipping start');
      return;
    }

    const config = getConfig();
    const wechatConfig = config.channels?.wechat;

    if (!wechatConfig?.enabled) {
      console.log('[WeChatChannel] Not enabled in config, skipping');
      return;
    }

    if (!wechatConfig?.token) {
      console.log('[WeChatChannel] Token not configured, skipping');
      return;
    }

    console.log('[WeChatChannel] Starting...');

    this.client = new WeChatClient({
      token: wechatConfig.token,
      onMessage: (message) => {
        if (this.messageHandler) {
          this.messageHandler(message, {
            userId: message.userId,
            chatId: message.chatId,
            platform: this.platform,
          });
        }
      },
    });

    await this.client.start();
    console.log('[WeChatChannel] Started');
  }

  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
    }
  }

  async sendMessage(
    chatId: string,
    message: string,
    attachments?: FileAttachment[]
  ): Promise<void> {
    if (!this.client) return;
    await this.client.sendMessage(chatId, message);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isReady(): boolean {
    return this.client?.isReady() ?? false;
  }
}
