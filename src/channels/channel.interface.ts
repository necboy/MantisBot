// src/channels/channel.interface.ts

export interface FileAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  data?: Buffer;
}

export interface ChannelMessage {
  id: string;
  content: string;
  chatId: string;
  userId?: string;
  timestamp: number;
  platform: string;
  channel?: string;  // 渠道标识
  attachments?: FileAttachment[];
}

export interface ChannelContext {
  chatId: string;
  userId?: string;
  platform: string;
  channel?: string;
  [key: string]: unknown;
}

export type ChannelStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export type MessageHandler = (message: ChannelMessage, context: ChannelContext) => Promise<void>;

export interface IChannel {
  name: string;
  platform: string;
  enabled: boolean;

  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(
    chatId: string,
    message: string,
    attachments?: FileAttachment[]
  ): Promise<void>;

  isReady?(): boolean;
}
