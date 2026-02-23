// src/tunnel/cloudflare.ts

import { spawn, ChildProcess } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ITunnelService, CloudflareTunnelConfig } from './types.js';

/**
 * Cloudflare Tunnel 内网穿透服务
 *
 * 使用 cloudflared 客户端建立隧道
 *
 * 使用步骤：
 * 1. 拥有一个域名并托管到 Cloudflare
 * 2. 访问 https://one.dash.cloudflare.com/ -> Networks -> Tunnels
 * 3. 创建隧道，选择 "Cloudflared" 连接器
 * 4. 复制生成的 Token
 * 5. 在配置中填入 Token
 *
 * 优势：
 * - 完全免费，无限制
 * - 不需要公网 IP
 * - 支持自定义域名
 * - 支持 HTTPS 自动证书
 *
 * 支持的端口：
 * - HTTP: 80, 8080, 8880, 2052, 2082, 2086, 2095
 * - HTTPS: 443, 2053, 2083, 2087, 2096, 8443
 */
export class CloudflareTunnelService implements ITunnelService {
  name = 'cloudflare';
  enabled: boolean;
  private config: CloudflareTunnelConfig;
  private process: ChildProcess | null = null;
  private running = false;
  private publicUrl: string | undefined;

  constructor(config: CloudflareTunnelConfig) {
    this.enabled = config.enabled;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[Cloudflare] Service is disabled');
      return;
    }

    // 检查 cloudflared 是否可用
    try {
      await this.checkCloudflared();
    } catch (error) {
      console.error('[Cloudflare] cloudflared is not available:', error);
      throw new Error('cloudflared is required. Please install it first: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/');
    }

    console.log('[Cloudflare] Starting Cloudflare Tunnel...');

    // 使用 Token 模式（推荐）
    if (this.config.token) {
      await this.startWithToken();
    }
    // 使用配置文件模式
    else if (this.config.tunnelId && this.config.credentialsFile) {
      await this.startWithCredentials();
    }
    else {
      throw new Error('Cloudflare Tunnel requires either token or (tunnelId + credentialsFile)');
    }
  }

  /**
   * 使用 Token 启动（推荐方式）
   */
  private async startWithToken(): Promise<void> {
    const args = ['tunnel', '--no-autoupdate', 'run', '--token', this.config.token!];

    this.process = spawn('cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessHandlers();
    await this.waitForStart();
  }

  /**
   * 使用凭证文件启动
   */
  private async startWithCredentials(): Promise<void> {
    const configPath = await this.createConfigFile();

    const args = ['tunnel', '--config', configPath, 'run', this.config.tunnelId!];

    this.process = spawn('cloudflared', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupProcessHandlers();
    await this.waitForStart();
  }

  /**
   * 创建临时配置文件
   */
  private async createConfigFile(): Promise<string> {
    const { getConfig } = await import('../config/loader.js');
    const config = getConfig();
    const localPort = config.server.port;

    const configContent = `
tunnel: ${this.config.tunnelId}
credentials-file: ${this.config.credentialsFile}

ingress:
  - hostname: YOUR_DOMAIN_HERE
    service: http://localhost:${localPort}
  - service: http_status:404
`.trim();

    const configPath = path.join(config.workspace || './data', 'cloudflared-config.yml');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(configPath, configContent, 'utf-8');

    return configPath;
  }

  /**
   * 设置进程事件处理器
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log(`[Cloudflare] ${output}`);

      // 尝试从输出中提取公网 URL
      const urlMatch = output.match(/https:\/\/[^\s]+\.trycloudflare\.com/);
      if (urlMatch) {
        this.publicUrl = urlMatch[0];
        console.log(`[Cloudflare] Public URL: ${this.publicUrl}`);
      }
    });

    this.process.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      // cloudflared 有时会将正常信息输出到 stderr
      if (!output.includes('ERR') && !output.includes('error')) {
        console.log(`[Cloudflare] ${output}`);
      } else {
        console.error(`[Cloudflare] ${output}`);
      }
    });

    this.process.on('close', (code) => {
      this.running = false;
      console.log(`[Cloudflare] Process exited with code ${code}`);
    });

    this.process.on('error', (error) => {
      this.running = false;
      console.error('[Cloudflare] Process error:', error);
    });
  }

  /**
   * 等待服务启动
   */
  private async waitForStart(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout waiting for Cloudflare Tunnel to start'));
      }, 10000);

      const checkInterval = setInterval(() => {
        if (this.process && !this.process.killed) {
          this.running = true;
          clearTimeout(timeout);
          clearInterval(checkInterval);
          console.log('[Cloudflare] Service started successfully');
          resolve();
        }
      }, 500);
    });
  }

  async stop(): Promise<void> {
    if (!this.running || !this.process) {
      return;
    }

    console.log('[Cloudflare] Stopping service...');

    this.process.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      this.process?.on('close', () => {
        this.running = false;
        this.process = null;
        console.log('[Cloudflare] Service stopped');
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
   * 检查 cloudflared 是否可用
   */
  private checkCloudflared(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const process = spawn('cloudflared', ['--version']);
      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error('cloudflared is not available'));
        }
      });
      process.on('error', () => {
        reject(new Error('cloudflared is not available'));
      });
    });
  }
}
