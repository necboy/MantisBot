// src/tunnel/manager.ts

import type { TunnelConfig } from './types.js';
import type { ITunnelService } from './types.js';
import { DDNSTOService } from './ddnsto.js';
import { CloudflareTunnelService } from './cloudflare.js';
import { FRPService } from './frp.js';

/**
 * 内网穿透服务管理器
 *
 * 支持同时运行多个内网穿透服务
 */
export class TunnelManager {
  private services: Map<string, ITunnelService> = new Map();
  private config: TunnelConfig;

  constructor(config: TunnelConfig) {
    this.config = config;

    // 初始化 DDNSTO 服务
    if (config.ddnsto?.enabled) {
      this.services.set('ddnsto', new DDNSTOService(config.ddnsto));
    }

    // 初始化 Cloudflare Tunnel 服务
    if (config.cloudflare?.enabled) {
      this.services.set('cloudflare', new CloudflareTunnelService(config.cloudflare));
    }

    // 初始化 FRP 服务
    if (config.frp?.enabled) {
      this.services.set('frp', new FRPService(config.frp));
    }
  }

  /**
   * 启动所有已启用的内网穿透服务
   */
  async startAll(): Promise<void> {
    if (!this.config.enabled) {
      console.log('[TunnelManager] Tunnel is disabled');
      return;
    }

    if (this.services.size === 0) {
      console.log('[TunnelManager] No tunnel services configured');
      return;
    }

    console.log(`[TunnelManager] Starting ${this.services.size} tunnel service(s)...`);

    const results = await Promise.allSettled(
      Array.from(this.services.entries()).map(async ([name, service]) => {
        try {
          await service.start();
          return { name, success: true };
        } catch (error) {
          console.error(`[TunnelManager] Failed to start ${name}:`, error);
          return { name, success: false, error };
        }
      })
    );

    // 输出启动结果
    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as any).success);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success));

    if (succeeded.length > 0) {
      console.log(`[TunnelManager] ${succeeded.length} service(s) started successfully`);
    }

    if (failed.length > 0) {
      console.error(`[TunnelManager] ${failed.length} service(s) failed to start`);
      failed.forEach((result, index) => {
        const serviceName = this.getServiceNames()[index];
        console.error(`[TunnelManager] - ${serviceName}: failed`);
      });
    }
  }

  /**
   * 停止所有内网穿透服务
   */
  async stopAll(): Promise<void> {
    if (this.services.size === 0) {
      return;
    }

    console.log(`[TunnelManager] Stopping ${this.services.size} tunnel service(s)...`);

    await Promise.all(
      Array.from(this.services.values()).map(async (service) => {
        try {
          await service.stop();
        } catch (error) {
          console.error(`[TunnelManager] Error stopping ${service.name}:`, error);
        }
      })
    );

    console.log('[TunnelManager] All tunnel services stopped');
  }

  /**
   * 获取指定服务
   */
  getService(name: string): ITunnelService | undefined {
    return this.services.get(name);
  }

  /**
   * 获取所有服务
   */
  getAllServices(): ITunnelService[] {
    return Array.from(this.services.values());
  }

  /**
   * 获取所有服务名称
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * 获取服务的公网 URL（如果有）
   */
  getPublicUrls(): Record<string, string | undefined> {
    const urls: Record<string, string | undefined> = {};

    this.services.forEach((service, name) => {
      if (service.getPublicUrl) {
        urls[name] = service.getPublicUrl();
      }
    });

    return urls;
  }

  /**
   * 检查是否有服务正在运行
   */
  hasRunningServices(): boolean {
    return Array.from(this.services.values()).some(service => service.isRunning());
  }
}
