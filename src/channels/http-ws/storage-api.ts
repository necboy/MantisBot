// src/channels/http-ws/storage-api.ts

import express from 'express';
import { getStorageManager, hasStorageManager } from '../../storage/manager.js';
import { StorageError } from '../../storage/storage.interface.js';

const router = express.Router();

// 列出所有存储提供者
router.get('/api/storage/providers', (req, res) => {
  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();
    const providers = storageManager.listStorages();

    res.json(providers);
  } catch (error) {
    console.error('[Storage API] List providers error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list storage providers'
    });
  }
});

// 获取当前存储提供者
router.get('/api/storage/current', (req, res) => {
  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();

    try {
      const current = storageManager.getCurrentStorage();
      res.json({
        id: current.config.id,
        name: current.name,
        type: current.type,
        connected: current.isConnected()
      });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NO_STORAGE_SELECTED') {
        return res.status(404).json({
          error: 'No storage provider selected'
        });
      }
      throw error;
    }
  } catch (error) {
    console.error('[Storage API] Get current storage error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get current storage'
    });
  }
});

// 切换存储提供者
router.post('/api/storage/switch', async (req, res) => {
  const { providerId } = req.body;

  if (!providerId || typeof providerId !== 'string') {
    return res.status(400).json({
      error: 'providerId is required and must be a string'
    });
  }

  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();

    // 检查提供者是否存在
    const storage = storageManager.getStorage(providerId);
    if (!storage) {
      return res.status(404).json({
        error: `Storage provider '${providerId}' not found`
      });
    }

    // 尝试切换
    await storageManager.switchTo(providerId);

    res.json({
      success: true,
      currentProvider: providerId,
      connected: storage.isConnected()
    });
  } catch (error) {
    console.error('[Storage API] Switch storage error:', error);

    if (error instanceof StorageError) {
      const statusCode = error.code === 'CONNECTION_ERROR' ? 503 : 500;
      return res.status(statusCode).json({
        error: `Failed to switch to storage '${providerId}': ${error.message}`,
        code: error.code
      });
    }

    res.status(500).json({
      error: `Failed to switch storage: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// 测试存储连接
router.post('/api/storage/test/:providerId', async (req, res) => {
  const { providerId } = req.params;

  if (!providerId) {
    return res.status(400).json({
      error: 'providerId is required'
    });
  }

  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();

    // 检查提供者是否存在
    const storage = storageManager.getStorage(providerId);
    if (!storage) {
      return res.status(404).json({
        error: `Storage provider '${providerId}' not found`
      });
    }

    // 测试连接
    const connected = await storageManager.testConnection(providerId);

    res.json({
      success: true,
      providerId,
      connected,
      message: connected ? 'Connection successful' : 'Connection failed'
    });
  } catch (error) {
    console.error('[Storage API] Test connection error:', error);
    res.status(500).json({
      error: `Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// 获取存储健康状态
router.get('/api/storage/health', async (req, res) => {
  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();
    const healthStatus = await storageManager.healthCheck();

    const currentStorageId = storageManager.getCurrentStorageId();

    res.json({
      current: currentStorageId,
      providers: healthStatus,
      overall: Object.values(healthStatus).some(status => status) ? 'healthy' : 'unhealthy'
    });
  } catch (error) {
    console.error('[Storage API] Health check error:', error);
    res.status(500).json({
      error: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

// 获取存储配置（不包含敏感信息）
router.get('/api/storage/config', (req, res) => {
  try {
    if (!hasStorageManager()) {
      return res.status(503).json({
        error: 'Storage system not initialized'
      });
    }

    const storageManager = getStorageManager();
    const config = storageManager.getConfig();

    res.json(config);
  } catch (error) {
    console.error('[Storage API] Get config error:', error);
    res.status(500).json({
      error: `Failed to get config: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
});

export default router;