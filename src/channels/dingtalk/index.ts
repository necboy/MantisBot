import type { IChannel, ChannelMessage, MessageHandler, FileAttachment, ChannelStatus } from '../channel.interface.js';
import { getConfig } from '../../config/loader.js';
import { DingTalkClient } from './client.js';

export class DingTalkChannel implements IChannel {
  readonly name = 'dingtalk';
  readonly platform = 'dingtalk';
  readonly enabled: boolean;

  private client?: DingTalkClient;
  private messageHandler?: MessageHandler;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[DingTalkChannel] Disabled, skipping start');
      return;
    }

    const config = getConfig();
    const dingtalkConfig = config.channels?.dingtalk;

    if (!dingtalkConfig?.enabled) {
      console.log('[DingTalkChannel] Not enabled in config, skipping');
      return;
    }

    console.log('[DingTalkChannel] Starting...');

    this.client = new DingTalkClient({
      config: {
        agentId: dingtalkConfig.agentId!,
        appKey: dingtalkConfig.appKey!,
        appSecret: dingtalkConfig.appSecret!,
        corpId: dingtalkConfig.corpId!,
      },
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
    console.log('[DingTalkChannel] Started');
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
    return this.client !== undefined;
  }
}
