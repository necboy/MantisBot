import axios from 'axios';
import type { ChannelMessage } from '../channel.interface.js';
import { WeComCrypto } from './crypto.js';

interface WeComConfig {
  corpId: string;
  secret: string;
  agentId: string;
}

interface WeComClientOptions {
  config: WeComConfig;
  onMessage: (message: ChannelMessage) => void;
}

export class WeComClient {
  private config: WeComConfig;
  private onMessage: (message: ChannelMessage) => void;
  private accessToken?: string;
  private crypto?: WeComCrypto;

  constructor(options: WeComClientOptions) {
    this.config = options.config;
    this.onMessage = options.onMessage;
  }

  async start(): Promise<void> {
    console.log('[WeComChannel] Starting...');

    // 获取 access token
    const tokenUrl = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${this.config.corpId}&corpsecret=${this.config.secret}`;
    const response = await axios.get(tokenUrl);
    const data = response.data;

    if (data.errcode !== 0) {
      throw new Error(`Failed to get access token: ${data.errmsg}`);
    }

    this.accessToken = data.access_token;
    console.log('[WeComChannel] Started, accessToken obtained');
  }

  async stop(): Promise<void> {
    console.log('[WeComChannel] Stopped');
  }

  async sendMessage(userId: string, content: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

    await axios.post(url, {
      touser: userId,
      msgtype: 'text',
      agentid: this.config.agentId,
      text: { content },
    });
  }

  parseMessage(xml: string): ChannelMessage | null {
    // 解析企业微信回调 XML
    // 简化实现，实际需要完整的 XML 解析
    return null;
  }
}
