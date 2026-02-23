// src/tunnel/ddnsto.ts

import { spawn, ChildProcess } from 'node:child_process';
import type { ITunnelService, DDNSTOConfig } from './types.js';

/**
 * DDNSTO 内网穿透服务
 *
 * 使用 Docker 容器运行 DDNSTO 客户端
 *
 * 使用步骤：
 * 1. 访问 https://www.ddnsto.com/ 注册账号
 * 2. 微信扫码登录后，在控制台获取 Token
 * 3. 在配置中填入 Token
 * 4. 启动服务后，在 DDNSTO 控制台配置域名映射
 *
 * 费用：
 * - 免费版：5 个域名映射，7 天试用期（可续期）
 * - 付费版：26 元/年，12 个域名映射
 */
export class DDNSTOService implements ITunnelService {
  name = 'ddnsto';
  enabled: boolean;
  private config: DDNSTOConfig;
  private process: ChildProcess | null = null;
  private running = false;

  constructor(config: DDNSTOConfig) {
    this.enabled = config.enabled;
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[DDNSTO] Service is disabled');
      return;
    }

    if (!this.config.token) {
      console.error('[DDNSTO] Token is required but not provided');
      throw new Error('DDNSTO token is required');
    }

    // 检查 Docker 是否可用
    try {
      await this.checkDocker();
    } catch (error) {
      console.error('[DDNSTO] Docker is not available:', error);
      throw new Error('Docker is required for DDNSTO service');
    }

    console.log('[DDNSTO] Starting DDNSTO tunnel...');

    // 使用 Docker 运行 DDNSTO 容器
    const deviceIdx = this.config.deviceIdx ?? 0;
    const deviceName = this.config.deviceName || 'MantisBot';

    const args = [
      'run',
      '-d',
      '--name', 'mantis-ddnsto',
      '--restart', 'always',
      '-e', `TOKEN=${this.config.token}`,
      '-e', `DEVICE_IDX=${deviceIdx}`,
      '-e', `DEVICE_NAME=${deviceName}`,
      'linkease/ddnsto:latest'
    ];

    this.process = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.process.stdout?.on('data', (data) => {
      console.log(`[DDNSTO] ${data.toString().trim()}`);
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[DDNSTO] ${data.toString().trim()}`);
    });

    this.process.on('close', (code) => {
      this.running = false;
      console.log(`[DDNSTO] Process exited with code ${code}`);
    });

    this.process.on('error', (error) => {
      this.running = false;
      console.error('[DDNSTO] Process error:', error);
    });

    // 等待容器启动
    await new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.running = true;
          console.log('[DDNSTO] Service started successfully');
          console.log('[DDNSTO] Please visit https://www.ddnsto.com/ to configure domain mappings');
          resolve();
        } else {
          reject(new Error('Failed to start DDNSTO container'));
        }
      }, 2000);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log('[DDNSTO] Stopping service...');

    // 停止并删除容器
    return new Promise((resolve) => {
      const stopProcess = spawn('docker', ['stop', 'mantis-ddnsto']);
      stopProcess.on('close', () => {
        const rmProcess = spawn('docker', ['rm', 'mantis-ddnsto']);
        rmProcess.on('close', () => {
          this.running = false;
          this.process = null;
          console.log('[DDNSTO] Service stopped');
          resolve();
        });
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * 检查 Docker 是否可用
   */
  private checkDocker(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const process = spawn('docker', ['--version']);
      process.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error('Docker is not available'));
        }
      });
      process.on('error', () => {
        reject(new Error('Docker is not available'));
      });
    });
  }
}
