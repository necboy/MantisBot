import type { IChannel, ChannelMessage, MessageHandler, FileAttachment, ChannelStatus } from '../channel.interface.js';
import { getConfig } from '../../config/loader.js';
import { WeComClient } from './client.js';

export class WeComChannel implements IChannel {
  readonly name = 'wecom';
  readonly platform = 'wecom';
  readonly enabled: boolean;

  private client?: WeComClient;
  private messageHandler?: MessageHandler;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[WeComChannel] Disabled, skipping start');
      return;
    }

    const config = getConfig();
    const wecomConfig = config.channels?.wecom;

    if (!wecomConfig?.enabled) {
      console.log('[WeComChannel] Not enabled in config, skipping');
      return;
    }

    console.log('[WeComChannel] Starting...');

    this.client = new WeComClient({
      config: {
        corpId: wecomConfig.corpId!,
        secret: wecomConfig.secret!,
        agentId: wecomConfig.agentId!,
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
    console.log('[WeComChannel] Started');
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
