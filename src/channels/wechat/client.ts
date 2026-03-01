import { createRequire } from 'module';
import type { ChannelMessage } from '../channel.interface.js';

const require = createRequire(import.meta.url);

interface WeChatClientOptions {
  token: string;
  onMessage: (message: ChannelMessage) => void;
}

export class WeChatClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bot: any;
  private onMessage: (message: ChannelMessage) => void;
  private isLoggedIn: boolean = false;

  constructor(options: WeChatClientOptions) {
    this.onMessage = options.onMessage;

    // Lazy-load wechaty to avoid crashing on platforms without native builds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wechaty = require('wechaty') as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wechatyPuppetPadlocal = require('wechaty-puppet-padlocal') as any;
    const WechatyBuilder = wechaty.WechatyBuilder;
    const ScanStatus = wechaty.ScanStatus;
    const PuppetPadlocal = wechatyPuppetPadlocal.PuppetPadlocal;

    // 创建 Puppet 实例
    const puppet = new PuppetPadlocal({
      token: options.token,
    });

    // 创建 Bot 实例
    this.bot = WechatyBuilder.build({
      name: 'mantisbot-wechat',
      puppet,
    });

    // 设置事件监听
    this.bot.on('scan', (qrcode: any, status: any) => {
      if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
        // 打印二维码 URL 或使用控制台二维码
        console.log('[WeChatChannel] Scan QR code to login:', qrcode);
        console.log('[WeChatChannel] QR Code URL:', qrcode);
      }
    });

    this.bot.on('login', (user: any) => {
      console.log('[WeChatChannel] User logged in:', user.name());
      this.isLoggedIn = true;
    });

    this.bot.on('logout', (user: any) => {
      console.log('[WeChatChannel] User logged out:', user.name());
      this.isLoggedIn = false;
    });

    this.bot.on('message', async (message: any) => {
      // 忽略自己发送的消息
      if (message.self()) return;

      const talker = message.talker();
      const room = message.room();

      const channelMessage: ChannelMessage = {
        id: message.id,
        platform: 'wechat',
        userId: talker.id,
        chatId: room ? room.id : talker.id,
        content: message.text(),
        timestamp: Date.now(),
      };

      this.onMessage(channelMessage);
    });

    this.bot.on('error', (error: any) => {
      console.error('[WeChatChannel] Error:', error);
    });
  }

  async start(): Promise<void> {
    await this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot.stop();
    this.isLoggedIn = false;
  }

  async sendMessage(contactId: string, content: string): Promise<void> {
    const contact = await this.bot.Contact.find({ id: contactId });
    if (contact) {
      await contact.say(content);
    }
  }

  isReady(): boolean {
    return this.isLoggedIn;
  }
}
