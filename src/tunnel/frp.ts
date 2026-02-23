// src/tunnel/frp.ts

import { spawn, ChildProcess } from 'node:child_process';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type { ITunnelService, FRPConfig } from './types.js';

/**
 * FRP (Fast Reverse Proxy) 内网穿透服务
 *
 * FRP 是一个高性能的反向代理应用，需要自建服务器或使用第三方 FRP 服务
 *
 * 使用场景：
 * 1. 自建 FRP 服务器（需要一台有公网 IP 的服务器）
 * 2. 使用第三方 FRP 服务（如：sakura frp、openfrp 等）
 *
 * 配置方式：
 * - 方式 1: 提供配置文件路径（推荐）
 * - 方式 2: 在配置中直接填写参数（会自动生成配置文件）
 *
 * 第三方 FRP 服务推荐：
 * - Sakura FRP: https://openfrp.net/
 * - OpenFrp: https://www.openfrp.net/
 * - SolarFrp: https://www.solarfrp.com/
 */
export class FRPService implements ITunnelService {
  name = 'frp';
  enabled: boolean;
  private config: FRPConfig;
  private process: ChildProcess | null = null;
  private running = false;
  private publicUrl: string | undefined;

  constructor(config: FRPConfig) {
    this.enabled = config.enabled;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[FRP] Service is disabled');
      return;
    }

    // 检查 frpc 是否可用
    try {
      await this.checkFRP();
    } catch (error) {
      console.error('[FRP] frpc is not available:', error);
      throw new Error('frpc is required. Please install it first: https://github.com/fatedier/frp/releases');
    }

    console.log('[FRP] Starting FRP tunnel...');

    // 获取配置文件路径
    const configPath = await this.getConfigPath();

    // 启动 frpc
    const args = ['-c', configPath];
    this.process = spawn('frpc', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[FRP] ${output}`);

      // 尝试从输出中提取公网 URL
      const urlMatch = output.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        this.publicUrl = urlMatch[0];
        console.log(`[FRP] Public URL: ${this.publicUrl}`);
      }
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[FRP] ${data.toString().trim()}`);
    });

    this.process.on('close', (code) => {
      this.running = false;
      console.log(`[FRP] Process exited with code ${code}`);
    });

    this.process.on('error', (error) => {
      this.running = false;
      console.error('[FRP] Process error:', error);
    });

    // 等待启动
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for FRP to start'));
      }, 10000);

      const checkInterval = setInterval(() => {
        if (this.process && !this.process.killed) {
          this.running = true;
          clearTimeout(timeout);
          clearInterval(checkInterval);
          console.log('[FRP] Service started successfully');
          resolve();
        }
      }, 500);
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.process) {
      return;
    }

    console.log('[FRP] Stopping service...');

    this.process.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      this.process?.on('close', () => {
        this.running = false;
        this.process = null;
        console.log('[FRP] Service stopped');
        resolve();
      });

      // 强制退出
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  getPublicUrl(): string | undefined {
    return this.publicUrl;
  }

  /**
   * 获取配置文件路径
   */
  private async getConfigPath(): Promise<string> {
    // 如果提供了配置文件路径，直接使用
    if (this.config.configPath) {
      try {
        await access(this.config.configPath);
        return this.config.configPath;
      } catch {
        throw new Error(`FRP config file not found: ${this.config.configPath}`);
      }
    }

    // 否则自动生成配置文件
    return this.generateConfig();
  }

  /**
   * 自动生成 FRP 配置文件
   */
  private async generateConfig(): Promise<string> {
    const { getConfig } = await import('../config/loader.js');
    const config = getConfig();

    if (!this.config.serverAddr || !this.config.serverPort) {
      throw new Error('FRP serverAddr and serverPort are required when configPath is not provided');
    }

    const localPort = this.config.localPort || config.server.port;
    const frpConfig = `[common]
server_addr = ${this.config.serverAddr}
server_port = ${this.config.serverPort}
${this.config.token ? `token = ${this.config.token}` : ''}

[mantis-web]
type = http
local_ip = 127.0.0.1
local_port = ${localPort}
${this.config.subdomain ? `subdomain = ${this.config.subdomain}` : 'custom_domains = YOUR_DOMAIN_HERE'}
`;

    const configPath = path.join(config.workspace || './data', 'frpc.ini');
    await writeFile(configPath, frpConfig, 'utf-8');
    console.log(`[FRP] Generated config file: ${configPath}`);

    return configPath;
  }

  /**
   * 检查 frpc 是否可用
   */
  private checkFRP(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const process = spawn('frpc', ['--version']);
      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error('frpc is not available'));
        }
      });
      process.on('error', () => {
        reject(new Error('frpc is not available'));
      });
    });
  }
}
