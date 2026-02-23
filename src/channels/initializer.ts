// src/channels/initializer.ts

import { getChannelRegistry } from './registry.js';
import { HTTPWSChannel } from './http-ws/channel.js';
import { FeishuChannel } from './feishu/channel.js';
import { SlackChannel } from './slack/index.js';
import { WhatsAppChannel } from './whatsapp/index.js';
import { DingTalkChannel } from './dingtalk/index.js';
import { WeComChannel } from './wecom/index.js';
import { WeChatChannel } from './wechat/index.js';
import type { SessionManager } from '../session/manager.js';
import type { ToolRegistry } from '../agents/tools/registry.js';
import { getConfig, saveConfig } from '../config/loader.js';
import type { CronService } from '../cron/service.js';
import type { TunnelManager } from '../tunnel/index.js';
import type { SkillsLoader } from '../agents/skills/loader.js';
import type { PluginLoader } from '../plugins/loader.js';
import type { GlobalErrorHandler } from '../reliability/global-error-handler.js';
import type { ChannelMessage } from './channel.interface.js';

// 存储初始化依赖，用于后续热加载
interface ChannelDependencies {
  sessionManager: SessionManager;
  toolRegistry: ToolRegistry;
  skillsLoader: SkillsLoader;
  pluginLoader: PluginLoader | undefined;
  onMessage: (message: ChannelMessage) => Promise<void>;
  cronService?: CronService;
  tunnelManager?: TunnelManager;
  errorHandler?: GlobalErrorHandler;
}

let channelDeps: ChannelDependencies | null = null;

export async function initializeChannels(
  sessionManager: SessionManager,
  toolRegistry: ToolRegistry,
  skillsLoader: SkillsLoader,
  pluginLoader: PluginLoader | undefined,
  onMessage: (message: ChannelMessage) => Promise<void>,
  cronService?: CronService,
  tunnelManager?: TunnelManager,
  errorHandler?: GlobalErrorHandler
): Promise<void> {
  // 存储依赖用于后续热加载
  channelDeps = {
    sessionManager,
    toolRegistry,
    skillsLoader,
    pluginLoader,
    onMessage,
    cronService,
    tunnelManager,
    errorHandler
  };

  const config = getConfig();
  const registry = getChannelRegistry();

  // Initialize HTTP/WS channel
  if (config.channels?.httpWs?.enabled !== false) {
    const httpWsChannel = new HTTPWSChannel(
      sessionManager,
      toolRegistry,
      skillsLoader,
      pluginLoader,
      onMessage,
      cronService,
      tunnelManager,
      errorHandler
    );
    registry.register(httpWsChannel);
  }

  // Initialize Feishu channel
  if (config.channels?.feishu?.enabled) {
    const feishuChannel = new FeishuChannel({
      onMessage: async (message) => {
        await onMessage(message);
      }
    });
    registry.register(feishuChannel);
  }

  // Initialize Slack channel
  if (config.channels?.slack?.enabled) {
    const slackChannel = new SlackChannel();
    slackChannel.onMessage(async (message) => {
      await onMessage(message);
    });
    registry.register(slackChannel);
  }

  // Initialize WhatsApp channel
  if (config.channels?.whatsapp?.enabled) {
    const whatsappChannel = new WhatsAppChannel({ enabled: true });
    whatsappChannel.onMessage(async (message) => {
      await onMessage(message);
    });
    registry.register(whatsappChannel);
  }

  // Initialize DingTalk channel
  if (config.channels?.dingtalk?.enabled) {
    const dingtalkChannel = new DingTalkChannel({ enabled: true });
    dingtalkChannel.onMessage(async (message) => {
      await onMessage(message);
    });
    registry.register(dingtalkChannel);
  }

  // Initialize WeCom channel
  if (config.channels?.wecom?.enabled) {
    const wecomChannel = new WeComChannel({ enabled: true });
    wecomChannel.onMessage(async (message) => {
      await onMessage(message);
    });
    registry.register(wecomChannel);
  }

  // Initialize WeChat channel
  if (config.channels?.wechat?.enabled) {
    const wechatChannel = new WeChatChannel({ enabled: true });
    wechatChannel.onMessage(async (message) => {
      await onMessage(message);
    });
    registry.register(wechatChannel);
  }

  console.log(`[Channels] Initialized ${registry.getAll().length} channels`);
}

export async function startChannels(): Promise<void> {
  const registry = getChannelRegistry();
  const allChannels = registry.getAll();
  const enabledChannels = registry.getEnabled();

  console.log(`[Channels] Total registered channels: ${allChannels.length}`);
  for (const ch of allChannels) {
    console.log(`[Channels]   - ${ch.name} (platform: ${ch.platform}, enabled: ${ch.enabled})`);
  }
  console.log(`[Channels] Starting ${enabledChannels.length} enabled channel(s)...`);

  for (const channel of enabledChannels) {
    try {
      console.log(`[Channels] Starting channel: ${channel.name}...`);
      await channel.start();
      console.log(`[Channels] Started channel: ${channel.name}`);
    } catch (error) {
      console.error(`[Channels] Failed to start channel ${channel.name}:`, error);
    }
  }
}

export async function stopChannels(): Promise<void> {
  const registry = getChannelRegistry();
  const allChannels = registry.getAll();

  for (const channel of allChannels) {
    try {
      await channel.stop();
      console.log(`[Channels] Stopped channel: ${channel.name}`);
    } catch (error) {
      console.error(`[Channels] Failed to stop channel ${channel.name}:`, error);
    }
  }
}

/**
 * 动态启动一个频道（热加载）
 * @param channelId 频道 ID（如 'feishu', 'slack' 等）
 * @returns 是否成功启动
 */
export async function hotStartChannel(channelId: string): Promise<{ success: boolean; message: string }> {
  if (!channelDeps) {
    return { success: false, message: 'Channel dependencies not initialized' };
  }

  const registry = getChannelRegistry();

  // 检查是否已经注册
  const existingChannel = registry.getByPlatform(channelId);
  if (existingChannel) {
    return { success: false, message: `Channel ${channelId} is already running` };
  }

  const config = getConfig();

  try {
    let channel;

    switch (channelId) {
      case 'feishu':
        channel = new FeishuChannel({
          onMessage: channelDeps.onMessage
        });
        break;

      case 'slack':
        channel = new SlackChannel();
        channel.onMessage(async (message) => {
          await channelDeps!.onMessage(message);
        });
        break;

      case 'whatsapp':
        channel = new WhatsAppChannel({ enabled: true });
        channel.onMessage(async (message) => {
          await channelDeps!.onMessage(message);
        });
        break;

      case 'dingtalk':
        channel = new DingTalkChannel({ enabled: true });
        channel.onMessage(async (message) => {
          await channelDeps!.onMessage(message);
        });
        break;

      case 'wecom':
        channel = new WeComChannel({ enabled: true });
        channel.onMessage(async (message) => {
          await channelDeps!.onMessage(message);
        });
        break;

      case 'wechat':
        channel = new WeChatChannel({ enabled: true });
        channel.onMessage(async (message) => {
          await channelDeps!.onMessage(message);
        });
        break;

      case 'httpWs':
        return { success: false, message: 'httpWs channel cannot be hot-reloaded' };

      default:
        return { success: false, message: `Unknown channel: ${channelId}` };
    }

    // 注册并启动
    registry.register(channel);
    await channel.start();

    // 更新配置文件
    if (!config.channels) {
      config.channels = {};
    }
    if (!config.channels[channelId as keyof typeof config.channels]) {
      (config.channels as Record<string, unknown>)[channelId] = {};
    }
    (config.channels as Record<string, { enabled?: boolean }>)[channelId].enabled = true;
    saveConfig(config);

    console.log(`[Channels] Hot-started channel: ${channelId}`);
    return { success: true, message: `Channel ${channelId} started successfully` };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Channels] Failed to hot-start channel ${channelId}:`, error);
    return { success: false, message: `Failed to start channel: ${errorMsg}` };
  }
}

/**
 * 动态停止一个频道（热卸载）
 * @param channelId 频道 ID
 * @returns 是否成功停止
 */
export async function hotStopChannel(channelId: string): Promise<{ success: boolean; message: string }> {
  const registry = getChannelRegistry();

  // httpWs 不允许热停止
  if (channelId === 'httpWs') {
    return { success: false, message: 'httpWs channel cannot be stopped' };
  }

  const channel = registry.getByPlatform(channelId);
  if (!channel) {
    return { success: false, message: `Channel ${channelId} is not running` };
  }

  try {
    // 停止并注销
    await channel.stop();
    registry.unregister(channel.name);

    // 更新配置文件
    const config = getConfig();
    if (config.channels?.[channelId as keyof typeof config.channels]) {
      (config.channels as Record<string, { enabled?: boolean }>)[channelId].enabled = false;
      saveConfig(config);
    }

    console.log(`[Channels] Hot-stopped channel: ${channelId}`);
    return { success: true, message: `Channel ${channelId} stopped successfully` };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Channels] Failed to hot-stop channel ${channelId}:`, error);
    return { success: false, message: `Failed to stop channel: ${errorMsg}` };
  }
}
