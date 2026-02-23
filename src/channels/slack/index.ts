// src/channels/slack/index.ts

import type { IChannel, ChannelMessage, MessageHandler, ChannelContext, ChannelStatus } from '../channel.interface.js';
import { getConfig } from '../../config/loader.js';
import { createRequire } from 'module';
import type { App as SlackApp, ExpressReceiver as SlackExpressReceiver } from '@slack/bolt';
import { v4 as uuidv4 } from 'uuid';

// 使用 createRequire 来导入 CommonJS 模块
const require = createRequire(import.meta.url);
const { App, ExpressReceiver } = require('@slack/bolt') as {
  App: typeof SlackApp;
  ExpressReceiver: typeof SlackExpressReceiver;
};

export class SlackChannel implements IChannel {
  readonly name = 'slack';
  readonly platform = 'slack';
  readonly enabled: boolean;

  private app?: InstanceType<typeof App>;
  private messageHandler?: MessageHandler;

  constructor() {
    const config = getConfig();
    this.enabled = config.slack?.enabled || false;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[SlackChannel] Disabled, skipping start');
      return;
    }

    const config = getConfig();
    const slackConfig = config.slack!;

    if (!slackConfig.botToken || !slackConfig.signingSecret) {
      console.warn('[SlackChannel] Missing config, skipping start');
      return;
    }

    console.log('[SlackChannel] Starting...');

    // Create Express receiver
    const receiver = new ExpressReceiver({
      signingSecret: slackConfig.signingSecret,
    });

    // Create app
    this.app = new App({
      token: slackConfig.botToken,
      receiver,
    });

    // Handle messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.app.message(async ({ message }: any) => {
      if (!this.messageHandler || !('user' in message) || !('channel' in message)) {
        return;
      }

      const slackMessage = message as {
        user: string;
        channel: string;
        text: string;
        ts: string;
      };

      const channelMessage: ChannelMessage = {
        id: slackMessage.ts,
        platform: this.platform,
        userId: slackMessage.user,
        chatId: slackMessage.channel,
        content: slackMessage.text || '',
        timestamp: parseInt(slackMessage.ts) * 1000,
      };

      const contextData: ChannelContext = {
        userId: slackMessage.user,
        chatId: slackMessage.channel,
        platform: this.platform,
      };

      await this.messageHandler(channelMessage, contextData);
    });

    await this.app.start(config.server.port + 1);
    console.log('[SlackChannel] Started');
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
    }
  }

  async sendMessage(chatId: string, content: string): Promise<void> {
    if (!this.app) return;

    await this.app.client.chat.postMessage({
      channel: chatId,
      text: content,
    });
  }

  async sendMessageByUser(userId: string, content: string): Promise<void> {
    if (!this.app) return;

    await this.app.client.chat.postMessage({
      channel: userId,
      text: content,
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  getStatus(): ChannelStatus {
    return this.app ? 'running' : 'stopped';
  }
}
