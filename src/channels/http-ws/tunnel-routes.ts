// src/channels/http-ws/tunnel-routes.ts

import { Router } from 'express';
import { getConfig, loadConfig } from '../../config/loader.js';
import { TunnelManager } from '../../tunnel/index.js';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export function createTunnelRoutes(tunnelManager?: TunnelManager): Router {
  const router = Router();

  /**
   * 获取内网穿透配置
   */
  router.get('/config', (_, res) => {
    try {
      const config = getConfig();
      const tunnelConfig = config.server.tunnel;

      res.json({
        enabled: tunnelConfig?.enabled || false,
        ddnsto: tunnelConfig?.ddnsto || { enabled: false },
        cloudflare: tunnelConfig?.cloudflare || { enabled: false },
        frp: tunnelConfig?.frp || { enabled: false }
      });
    } catch (error) {
      console.error('[TunnelAPI] Get config error:', error);
      res.status(500).json({ error: 'Failed to get tunnel config' });
    }
  });

  /**
   * 更新内网穿透配置
   */
  router.post('/config', async (req, res): Promise<void> => {
    try {
      const newTunnelConfig = req.body;
      const config = getConfig();

      // 更新配置
      const updatedConfig = {
        ...config,
        server: {
          ...config.server,
          tunnel: newTunnelConfig
        }
      };

      // 保存到配置文件
      const configPath = path.join(process.cwd(), 'config', 'config.json');
      await writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

      // 重新加载配置
      loadConfig();

      res.json({
        success: true,
        message: 'Configuration updated. Please restart the service to apply changes.'
      });
    } catch (error) {
      console.error('[TunnelAPI] Update config error:', error);
      res.status(500).json({ error: 'Failed to update tunnel config' });
    }
  });

  /**
   * 获取内网穿透服务状态
   */
  router.get('/status', (_, res) => {
    try {
      if (!tunnelManager) {
        res.json({
          enabled: false,
          services: []
        });
        return;
      }

      const services = tunnelManager.getAllServices().map(service => ({
        name: service.name,
        enabled: service.enabled,
        running: service.isRunning(),
        publicUrl: service.getPublicUrl?.()
      }));

      res.json({
        enabled: true,
        services,
        publicUrls: tunnelManager.getPublicUrls()
      });
    } catch (error) {
      console.error('[TunnelAPI] Get status error:', error);
      res.status(500).json({ error: 'Failed to get tunnel status' });
    }
  });

  /**
   * 启动内网穿透服务
   */
  router.post('/start', async (_, res): Promise<void> => {
    try {
      if (!tunnelManager) {
        res.status(400).json({ error: 'Tunnel manager not initialized' });
        return;
      }

      await tunnelManager.startAll();
      res.json({ success: true, message: 'Tunnel services started' });
    } catch (error) {
      console.error('[TunnelAPI] Start error:', error);
      res.status(500).json({ error: 'Failed to start tunnel services' });
    }
  });

  /**
   * 停止内网穿透服务
   */
  router.post('/stop', async (_, res): Promise<void> => {
    try {
      if (!tunnelManager) {
        res.status(400).json({ error: 'Tunnel manager not initialized' });
        return;
      }

      await tunnelManager.stopAll();
      res.json({ success: true, message: 'Tunnel services stopped' });
    } catch (error) {
      console.error('[TunnelAPI] Stop error:', error);
      res.status(500).json({ error: 'Failed to stop tunnel services' });
    }
  });

  /**
   * 测试内网穿透连接
   */
  router.post('/test', async (req, res): Promise<void> => {
    try {
      const { type, config } = req.body;

      // 这里可以实现连接测试逻辑
      // 例如：检查依赖是否安装、配置是否正确等

      let result = { success: false, message: '' };

      switch (type) {
        case 'ddnsto':
          result = await testDDNSTO(config);
          break;
        case 'cloudflare':
          result = await testCloudflare(config);
          break;
        case 'frp':
          result = await testFRP(config);
          break;
        default:
          res.status(400).json({ error: 'Invalid tunnel type' });
          return;
      }

      res.json(result);
    } catch (error) {
      console.error('[TunnelAPI] Test error:', error);
      res.status(500).json({ error: 'Failed to test tunnel configuration' });
    }
  });

  return router;
}

/**
 * 测试 DDNSTO 配置
 */
async function testDDNSTO(config: any): Promise<{ success: boolean; message: string }> {
  if (!config.token) {
    return { success: false, message: 'Token is required' };
  }

  // 检查 Docker 是否可用
  try {
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const process = spawn('docker', ['--version']);
      process.on('close', (code) => {
        if (code === 0) resolve();
        else reject();
      });
      process.on('error', () => reject());
    });

    return { success: true, message: 'Docker is available and token is provided' };
  } catch {
    return { success: false, message: 'Docker is not available. Please install Docker first.' };
  }
}

/**
 * 测试 Cloudflare Tunnel 配置
 */
async function testCloudflare(config: any): Promise<{ success: boolean; message: string }> {
  if (!config.token) {
    return { success: false, message: 'Token is required' };
  }

  // 检查 cloudflared 是否可用
  try {
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const process = spawn('cloudflared', ['--version']);
      process.on('close', (code) => {
        if (code === 0) resolve();
        else reject();
      });
      process.on('error', () => reject());
    });

    return { success: true, message: 'cloudflared is available and token is provided' };
  } catch {
    return { success: false, message: 'cloudflared is not available. Please install cloudflared first.' };
  }
}

/**
 * 测试 FRP 配置
 */
async function testFRP(config: any): Promise<{ success: boolean; message: string }> {
  if (!config.serverAddr || !config.serverPort) {
    return { success: false, message: 'Server address and port are required' };
  }

  // 检查 frpc 是否可用
  try {
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const process = spawn('frpc', ['--version']);
      process.on('close', (code) => {
        if (code === 0) resolve();
        else reject();
      });
      process.on('error', () => reject());
    });

    return { success: true, message: 'frpc is available and server configuration is provided' };
  } catch {
    return { success: false, message: 'frpc is not available. Please install frpc first.' };
  }
}
