import { Tool } from '../../types.js';
import { getStorageManager, hasStorageManager } from '../../storage/manager.js';
import { StorageError } from '../../storage/storage.interface.js';

// NAS文件列表工具
export const nasListTool: Tool = {
  name: 'nas_list',
  description: '列出NAS存储中指定目录的文件和文件夹',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要列出的目录路径，默认为根目录',
        default: '/'
      }
    },
    required: []
  },
  execute: async (params: Record<string, unknown>) => {
    const path = (params.path as string) || '/';
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();
      const currentStorage = storageManager.getCurrentStorage();

      if (currentStorage.type !== 'nas') {
        return {
          success: false,
          error: `Current storage is ${currentStorage.type}, not NAS. Please switch to a NAS storage first.`
        };
      }

      const items = await currentStorage.listDirectory(path);

      return {
        success: true,
        path,
        items: items.map(item => ({
          name: item.name,
          path: item.path,
          type: item.type,
          size: item.size,
          modified: item.modified.toISOString(),
          mimeType: item.mimeType
        })),
        count: items.length
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof StorageError) {
        return {
          success: false,
          error: `NAS operation failed: ${errorMessage}`,
          code: error.code
        };
      }

      return {
        success: false,
        error: `Failed to list NAS directory: ${errorMessage}`
      };
    }
  }
};

// NAS文件读取工具
export const nasReadTool: Tool = {
  name: 'nas_read',
  description: '从NAS存储读取文件内容',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要读取的文件路径'
      }
    },
    required: ['path']
  },
  execute: async (params: Record<string, unknown>) => {
    const path = params.path as string;
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();
      const currentStorage = storageManager.getCurrentStorage();

      if (currentStorage.type !== 'nas') {
        return {
          success: false,
          error: `Current storage is ${currentStorage.type}, not NAS. Please switch to a NAS storage first.`
        };
      }

      // 检查文件是否存在
      const exists = await currentStorage.exists(path);
      if (!exists) {
        return {
          success: false,
          error: `File not found: ${path}`
        };
      }

      // 检查是否为文件
      const stats = await currentStorage.getStats(path);
      if (stats.isDirectory) {
        return {
          success: false,
          error: `Path is a directory, not a file: ${path}`
        };
      }

      // 检查文件大小
      if (stats.size > 10 * 1024 * 1024) { // 10MB limit
        return {
          success: false,
          error: `File too large (${Math.round(stats.size / 1024 / 1024)}MB). Maximum size is 10MB.`
        };
      }

      const content = await currentStorage.readFile(path);

      return {
        success: true,
        path,
        content: content.toString('utf-8'),
        size: stats.size,
        modified: stats.modified.toISOString()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof StorageError) {
        return {
          success: false,
          error: `NAS read failed: ${errorMessage}`,
          code: error.code
        };
      }

      return {
        success: false,
        error: `Failed to read file from NAS: ${errorMessage}`
      };
    }
  }
};

// NAS文件写入工具
export const nasWriteTool: Tool = {
  name: 'nas_write',
  description: '向NAS存储写入文件',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要写入的文件路径'
      },
      content: {
        type: 'string',
        description: '要写入的文件内容'
      }
    },
    required: ['path', 'content']
  },
  execute: async (params: Record<string, unknown>) => {
    const path = params.path as string;
    const content = params.content as string;
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();
      const currentStorage = storageManager.getCurrentStorage();

      if (currentStorage.type !== 'nas') {
        return {
          success: false,
          error: `Current storage is ${currentStorage.type}, not NAS. Please switch to a NAS storage first.`
        };
      }

      // 检查内容大小
      const contentSize = Buffer.byteLength(content, 'utf-8');
      if (contentSize > 10 * 1024 * 1024) { // 10MB limit
        return {
          success: false,
          error: `Content too large (${Math.round(contentSize / 1024 / 1024)}MB). Maximum size is 10MB.`
        };
      }

      const buffer = Buffer.from(content, 'utf-8');
      await currentStorage.writeFile(path, buffer);

      // 验证文件是否写入成功
      const stats = await currentStorage.getStats(path);

      return {
        success: true,
        path,
        size: stats.size,
        created: stats.created.toISOString(),
        modified: stats.modified.toISOString()
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof StorageError) {
        return {
          success: false,
          error: `NAS write failed: ${errorMessage}`,
          code: error.code
        };
      }

      return {
        success: false,
        error: `Failed to write file to NAS: ${errorMessage}`
      };
    }
  }
};

// NAS文件删除工具
export const nasDeleteTool: Tool = {
  name: 'nas_delete',
  description: '删除NAS存储中的文件或文件夹',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要删除的文件或文件夹路径'
      }
    },
    required: ['path']
  },
  execute: async (params: Record<string, unknown>) => {
    const path = params.path as string;
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();
      const currentStorage = storageManager.getCurrentStorage();

      if (currentStorage.type !== 'nas') {
        return {
          success: false,
          error: `Current storage is ${currentStorage.type}, not NAS. Please switch to a NAS storage first.`
        };
      }

      // 检查文件/文件夹是否存在
      const exists = await currentStorage.exists(path);
      if (!exists) {
        return {
          success: false,
          error: `File or directory not found: ${path}`
        };
      }

      // 检查是文件还是目录
      const stats = await currentStorage.getStats(path);

      if (stats.isDirectory) {
        await currentStorage.deleteDirectory(path);
      } else {
        await currentStorage.deleteFile(path);
      }

      return {
        success: true,
        path,
        type: stats.isDirectory ? 'directory' : 'file'
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof StorageError) {
        return {
          success: false,
          error: `NAS delete failed: ${errorMessage}`,
          code: error.code
        };
      }

      return {
        success: false,
        error: `Failed to delete from NAS: ${errorMessage}`
      };
    }
  }
};

// NAS目录创建工具
export const nasMkdirTool: Tool = {
  name: 'nas_mkdir',
  description: '在NAS存储中创建目录',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: '要创建的目录路径'
      }
    },
    required: ['path']
  },
  execute: async (params: Record<string, unknown>) => {
    const path = params.path as string;
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();
      const currentStorage = storageManager.getCurrentStorage();

      if (currentStorage.type !== 'nas') {
        return {
          success: false,
          error: `Current storage is ${currentStorage.type}, not NAS. Please switch to a NAS storage first.`
        };
      }

      // 检查目录是否已存在
      const exists = await currentStorage.exists(path);
      if (exists) {
        return {
          success: false,
          error: `Directory already exists: ${path}`
        };
      }

      await currentStorage.createDirectory(path);

      // 验证目录是否创建成功
      const stats = await currentStorage.getStats(path);

      return {
        success: true,
        path,
        created: stats.created.toISOString(),
        isDirectory: stats.isDirectory
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof StorageError) {
        return {
          success: false,
          error: `NAS mkdir failed: ${errorMessage}`,
          code: error.code
        };
      }

      return {
        success: false,
        error: `Failed to create directory on NAS: ${errorMessage}`
      };
    }
  }
};

// NAS存储状态工具
export const nasStatusTool: Tool = {
  name: 'nas_status',
  description: '获取NAS存储的连接状态和信息',
  parameters: {
    type: 'object',
    properties: {},
    required: []
  },
  execute: async (params: Record<string, unknown>) => {
    try {
      if (!hasStorageManager()) {
        return {
          success: false,
          error: 'Storage system not initialized'
        };
      }

      const storageManager = getStorageManager();

      // 获取当前存储
      try {
        const currentStorage = storageManager.getCurrentStorage();
        const isNAS = currentStorage.type === 'nas';

        return {
          success: true,
          currentStorage: {
            id: currentStorage.config.id,
            name: currentStorage.name,
            type: currentStorage.type,
            connected: currentStorage.isConnected(),
            isNAS
          },
          allProviders: storageManager.listStorages().map(provider => ({
            id: provider.id,
            name: provider.name,
            type: provider.type,
            connected: provider.connected
          }))
        };
      } catch (error) {
        if (error instanceof StorageError && error.code === 'NO_STORAGE_SELECTED') {
          return {
            success: true,
            currentStorage: null,
            allProviders: storageManager.listStorages().map(provider => ({
              id: provider.id,
              name: provider.name,
              type: provider.type,
              connected: provider.connected
            }))
          };
        }
        throw error;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: `Failed to get NAS status: ${errorMessage}`
      };
    }
  }
};

// 导出所有NAS工具
export const nasTools: Tool[] = [
  nasListTool,
  nasReadTool,
  nasWriteTool,
  nasDeleteTool,
  nasMkdirTool,
  nasStatusTool
];