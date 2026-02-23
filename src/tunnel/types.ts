// src/tunnel/types.ts

/**
 * 内网穿透服务接口
 */
export interface ITunnelService {
  name: string;
  enabled: boolean;

  /**
   * 启动内网穿透服务
   */
  start(): Promise<void>;

  /**
   * 停止内网穿透服务
   */
  stop(): Promise<void>;

  /**
   * 检查服务状态
   */
  isRunning(): boolean;

  /**
   * 获取公网访问地址（如果可用）
   */
  getPublicUrl?(): string | undefined;
}

/**
 * DDNSTO 配置
 */
export interface DDNSTOConfig {
  enabled: boolean;
  token?: string;
  deviceIdx?: number;
  deviceName?: string;
}

/**
 * Cloudflare Tunnel 配置
 */
export interface CloudflareTunnelConfig {
  enabled: boolean;
  token?: string;
  tunnelId?: string;
  credentialsFile?: string;
}

/**
 * FRP 配置
 */
export interface FRPConfig {
  enabled: boolean;
  configPath?: string;
  serverAddr?: string;
  serverPort?: number;
  token?: string;
  localPort?: number;
  subdomain?: string;
}

/**
 * 统一内网穿透配置
 */
export interface TunnelConfig {
  enabled: boolean;
  ddnsto?: DDNSTOConfig;
  cloudflare?: CloudflareTunnelConfig;
  frp?: FRPConfig;
}
