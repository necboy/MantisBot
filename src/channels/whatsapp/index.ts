import type { IChannel, ChannelMessage, MessageHandler, FileAttachment } from '../channel.interface.js';
import { getConfig } from '../../config/loader.js';
import { WhatsAppClient } from './client.js';

export class WhatsAppChannel implements IChannel {
  readonly name = 'whatsapp';
  readonly platform = 'whatsapp';
  readonly enabled: boolean;

  private client?: WhatsAppClient;
  private messageHandler?: MessageHandler;

  constructor(config?: { enabled?: boolean }) {
    this.enabled = config?.enabled ?? false;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[WhatsAppChannel] Disabled, skipping start');
      return;
    }

    const config = getConfig();
    const whatsappConfig = config.channels?.whatsapp;

    if (!whatsappConfig?.enabled) {
      console.log('[WhatsAppChannel] Not enabled in config, skipping');
      return;
    }

    console.log('[WhatsAppChannel] Starting...');

    this.client = new WhatsAppClient({
      onMessage: (message) => {
        if (this.messageHandler) {
          this.messageHandler(message, {
            userId: message.userId,
            chatId: message.chatId,
            platform: this.platform,
          });
        }
      },
      workspace: config.workspace,
    });

    await this.client.start();
    console.log('[WhatsAppChannel] Started');
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

    if (message && message.trim()) {
      await this.client.sendMessage(chatId, message);
    }

    // TODO: 处理附件发送
    if (attachments && attachments.length > 0) {
      console.log(`[WhatsAppChannel] Sending ${attachments.length} attachment(s)`);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  isReady(): boolean {
    return this.client?.isReady() ?? false;
  }
}
