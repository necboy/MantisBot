// src/storage/local-storage.ts

import fs from 'fs';
import path from 'path';
import type {
  IStorage,
  StorageConfig,
  FileSystemItem,
  FileStats
} from './storage.interface.js';
import {
  StorageError,
  StorageNotFoundError,
  StoragePermissionError
} from './storage.interface.js';

export class LocalStorage implements IStorage {
  name: string;
  type: 'local' = 'local';
  config: StorageConfig;

  private basePath: string;

  constructor(config: StorageConfig) {
    this.config = config;
    this.name = config.name;
    this.basePath = path.resolve(config.path || './data/uploads');

    // 确保目录存在
    if (!fs.existsSync(this.basePath)) {
      try {
        fs.mkdirSync(this.basePath, { recursive: true });
      } catch (error) {
        throw new StoragePermissionError(
          `Failed to create storage directory: ${this.basePath}`,
          config.id,
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  async connect(): Promise<void> {
    // 本地存储无需连接，但验证目录访问权限
    try {
      fs.accessSync(this.basePath, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new StoragePermissionError(
        `Cannot access storage directory: ${this.basePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    // 本地存储无需断开
  }

  isConnected(): boolean {
    try {
      return fs.existsSync(this.basePath) &&
             fs.statSync(this.basePath).isDirectory();
    } catch {
      return false;
    }
  }

  async ping(): Promise<boolean> {
    return this.isConnected();
  }

  private getFullPath(relativePath: string): string {
    // 清理路径并确保安全
    const cleanPath = relativePath.replace(/^\/+/, '');
    const fullPath = path.resolve(this.basePath, cleanPath);

    // 安全检查：防止路径遍历攻击
    if (!fullPath.startsWith(this.basePath)) {
      throw new StoragePermissionError(
        'Path traversal detected',
        this.config.id
      );
    }

    return fullPath;
  }

  async listDirectory(dirPath: string): Promise<FileSystemItem[]> {
    const fullPath = this.getFullPath(dirPath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(dirPath, this.config.id);
    }

    if (!fs.statSync(fullPath).isDirectory()) {
      throw new StorageError(
        `Path is not a directory: ${dirPath}`,
        'NOT_DIRECTORY',
        this.config.id
      );
    }

    try {
      const items: FileSystemItem[] = [];
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });

      for (const entry of entries) {
        const itemPath = path.join(dirPath, entry.name).replace(/\\/g, '/');
        const itemFullPath = path.join(fullPath, entry.name);
        const stats = fs.statSync(itemFullPath);

        items.push({
          name: entry.name,
          path: itemPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          modified: stats.mtime,
          mimeType: this.getMimeType(entry.name)
        });
      }

      return items.sort((a, b) => {
        // 目录在前，然后按名称排序
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to read directory: ${dirPath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);

    try {
      fs.mkdirSync(fullPath, { recursive: true });
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to create directory: ${dirPath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    const fullPath = this.getFullPath(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(filePath, this.config.id);
    }

    try {
      return fs.readFileSync(fullPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to read file: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async writeFile(filePath: string, content: Buffer): Promise<void> {
    const fullPath = this.getFullPath(filePath);

    try {
      // 确保父目录存在
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      fs.writeFileSync(fullPath, content);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to write file: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = this.getFullPath(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(filePath, this.config.id);
    }

    try {
      fs.unlinkSync(fullPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to delete file: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteDirectory(dirPath: string): Promise<void> {
    const fullPath = this.getFullPath(dirPath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(dirPath, this.config.id);
    }

    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to delete directory: ${dirPath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    const fullOldPath = this.getFullPath(oldPath);
    const fullNewPath = this.getFullPath(newPath);

    if (!fs.existsSync(fullOldPath)) {
      throw new StorageNotFoundError(oldPath, this.config.id);
    }

    if (fs.existsSync(fullNewPath)) {
      throw new StorageError(
        `Target already exists: ${newPath}`,
        'ALREADY_EXISTS',
        this.config.id
      );
    }

    try {
      fs.renameSync(fullOldPath, fullNewPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to rename '${oldPath}' to '${newPath}'`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    const fullSourcePath = this.getFullPath(sourcePath);
    const fullDestPath = this.getFullPath(destPath);

    if (!fs.existsSync(fullSourcePath)) {
      throw new StorageNotFoundError(sourcePath, this.config.id);
    }

    try {
      // 确保目标目录存在
      const destDir = path.dirname(fullDestPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      fs.copyFileSync(fullSourcePath, fullDestPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to copy '${sourcePath}' to '${destPath}'`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = this.getFullPath(filePath);
      return fs.existsSync(fullPath);
    } catch {
      return false;
    }
  }

  async getStats(filePath: string): Promise<FileStats> {
    const fullPath = this.getFullPath(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(filePath, this.config.id);
    }

    try {
      const stats = fs.statSync(fullPath);

      return {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        modified: stats.mtime,
        created: stats.birthtime
      };
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to get stats for: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createReadStream(filePath: string): Promise<NodeJS.ReadableStream> {
    const fullPath = this.getFullPath(filePath);

    if (!fs.existsSync(fullPath)) {
      throw new StorageNotFoundError(filePath, this.config.id);
    }

    try {
      return fs.createReadStream(fullPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to create read stream for: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createWriteStream(filePath: string): Promise<NodeJS.WritableStream> {
    const fullPath = this.getFullPath(filePath);

    try {
      // 确保父目录存在
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      return fs.createWriteStream(fullPath);
    } catch (error) {
      throw new StoragePermissionError(
        `Failed to create write stream for: ${filePath}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  private getMimeType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const mimeTypes: Record<string, string> = {
      txt: 'text/plain',
      md: 'text/markdown',
      json: 'application/json',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
  }
}