import axios from 'axios';
import type { ChannelMessage } from '../channel.interface.js';

interface DingTalkConfig {
  agentId: string;
  appKey: string;
  appSecret: string;
  corpId: string;
}

interface DingTalkClientOptions {
  config: DingTalkConfig;
  onMessage: (message: ChannelMessage) => void;
}

interface AccessTokenResponse {
  errcode: number;
  errmsg: string;
  access_token: string;
  expires_in: number;
}

interface SendMessageResponse {
  errcode: number;
  errmsg: string;
  task_id?: number;
}

export class DingTalkClient {
  private config: DingTalkConfig;
  private onMessage: (message: ChannelMessage) => void;
  private accessToken?: string;
  private tokenExpiresAt?: number;
  private baseURL = 'https://oapi.dingtalk.com';

  constructor(options: DingTalkClientOptions) {
    this.config = options.config;
    this.onMessage = options.onMessage;
  }

  async start(): Promise<void> {
    console.log('[DingTalkChannel] Starting...');

    // 获取 access token
    await this.refreshAccessToken();

    console.log('[DingTalkChannel] Started, accessToken obtained');
  }

  async stop(): Promise<void> {
    console.log('[DingTalkChannel] Stopped');
  }

  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await axios.get<AccessTokenResponse>(
        `${this.baseURL}/gettoken`,
        {
          params: {
            appkey: this.config.appKey,
            appsecret: this.config.appSecret,
          },
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`Failed to get access token: ${response.data.errmsg}`);
      }

      this.accessToken = response.data.access_token;
      // 提前 5 分钟过期，避免临界情况
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;

      console.log('[DingTalkChannel] Access token refreshed, expires in', response.data.expires_in, 'seconds');
    } catch (error) {
      console.error('[DingTalkChannel] Failed to refresh access token:', error);
      throw error;
    }
  }

  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken || !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new Error('Failed to obtain access token');
    }

    return this.accessToken;
  }

  async sendMessage(userId: string, content: string): Promise<void> {
    const accessToken = await this.ensureValidToken();

    try {
      const response = await axios.post<SendMessageResponse>(
        `${this.baseURL}/topapi/message/corpconversation/asyncsend_v2`,
        {
          agent_id: this.config.agentId,
          userid_list: userId,
          msg: {
            msgtype: 'text',
            text: {
              content: content,
            },
          },
        },
        {
          params: {
            access_token: accessToken,
          },
        }
      );

      if (response.data.errcode !== 0) {
        throw new Error(`Failed to send message: ${response.data.errmsg}`);
      }

      console.log('[DingTalkChannel] Message sent successfully, task_id:', response.data.task_id);
    } catch (error) {
      console.error('[DingTalkChannel] Failed to send message:', error);
      throw error;
    }
  }
}
