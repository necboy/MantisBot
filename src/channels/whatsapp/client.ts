import { createRequire } from 'module';
import type { ChannelMessage } from '../channel.interface.js';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);

interface WhatsAppClientOptions {
  onMessage: (message: ChannelMessage) => void;
  workspace?: string;
}

export class WhatsAppClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;
  private onMessage: (message: ChannelMessage) => void;

  constructor(options: WhatsAppClientOptions) {
    this.onMessage = options.onMessage;
    const workspace = options.workspace || './data';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whatsappWeb = require('whatsapp-web.js') as any;
    const Client = whatsappWeb.Client;
    const LocalAuth = whatsappWeb.LocalAuth;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Message = whatsappWeb.Message as any;

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: `${workspace}/whatsapp`,
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox'],
      },
    });

    this.client.on('qr', async (qr: string) => {
      console.log('[WhatsAppChannel] QR Code received:');
      const qrString = await QRCode.toString(qr, { type: 'terminal', small: true });
      console.log(qrString);
    });

    this.client.on('ready', () => {
      console.log('[WhatsAppChannel] Client ready');
    });

    this.client.on('message', (message: typeof Message.prototype) => {
      if (message.fromMe) return;

      const channelMessage: ChannelMessage = {
        id: message.id._serialized,
        platform: 'whatsapp',
        userId: message.from,
        chatId: message.from,
        content: message.body,
        timestamp: message.timestamp * 1000,
      };

      this.onMessage(channelMessage);
    });
  }

  async start(): Promise<void> {
    await this.client.initialize();
  }

  async stop(): Promise<void> {
    await this.client.destroy();
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    await this.client.sendMessage(chatId, content);
  }

  isReady(): boolean {
    return this.client.info?.wid !== undefined;
  }
}
