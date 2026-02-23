// src/storage/nas-storage.ts

import { createClient, WebDAVClient } from 'webdav';
import type {
  IStorage,
  StorageConfig,
  FileSystemItem,
  FileStats
} from './storage.interface.js';
import {
  StorageError,
  StorageConnectionError,
  StorageNotFoundError,
  StoragePermissionError
} from './storage.interface.js';

export class NasStorage implements IStorage {
  name: string;
  type: 'nas' = 'nas';
  config: StorageConfig;

  private client: WebDAVClient;
  private connected: boolean = false;

  constructor(config: StorageConfig) {
    this.config = config;
    this.name = config.name;

    if (!config.url || !config.username || !config.password) {
      throw new StorageError(
        'NAS storage requires url, username, and password',
        'INVALID_CONFIG',
        config.id
      );
    }

    try {
      this.client = createClient(
        config.url,
        {
          username: config.username,
          password: config.password
        }
      );
    } catch (error) {
      throw new StorageError(
        `Failed to create WebDAV client: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CLIENT_CREATION_FAILED',
        config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async connect(): Promise<void> {
    try {
      // 测试连接 - 尝试访问根目录
      await this.client.getDirectoryContents('/');
      this.connected = true;
      console.log(`[NasStorage] Connected to: ${this.config.url}`);
    } catch (error: unknown) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new StorageConnectionError(
        `Failed to connect to NAS '${this.name}': ${errorMessage}`,
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    console.log(`[NasStorage] Disconnected from: ${this.config.url}`);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async ping(): Promise<boolean> {
    if (!this.connected) {
      return false;
    }

    try {
      await this.client.stat('/');
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  private getFullPath(relativePath: string): string {
    const basePath = this.config.basePath || '';
    const cleanBase = basePath.replace(/\/+$/, '');
    const cleanPath = relativePath.replace(/^\/+/, '');
    return `${cleanBase}/${cleanPath}`.replace(/\/+/g, '/');
  }

  private stripBasePath(fullPath: string): string {
    const basePath = this.config.basePath || '';
    if (!basePath) return fullPath;

    const cleanBase = basePath.replace(/\/+$/, '');
    return fullPath.replace(new RegExp(`^${this.escapeRegExp(cleanBase)}`), '') || '/';
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new StorageConnectionError(
        'Not connected to NAS storage',
        this.config.id
      );
    }
  }

  async listDirectory(path: string): Promise<FileSystemItem[]> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      const contents = await this.client.getDirectoryContents(fullPath);

      return (contents as any[])
        .map(item => ({
          name: String(item.basename),
          path: this.stripBasePath(String(item.filename)),
          type: item.type === 'directory' ? 'directory' as const : 'file' as const,
          size: Number(item.size) || 0,
          modified: new Date(item.lastmod),
          mimeType: this.getMimeType(String(item.basename))
        }))
        .sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(path, this.config.id);
      }
      throw new StorageError(
        `Failed to list directory '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createDirectory(path: string): Promise<void> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      await this.client.createDirectory(fullPath);
    } catch (error: unknown) {
      throw new StorageError(
        `Failed to create directory '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_DIRECTORY_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async readFile(path: string): Promise<Buffer> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      const content = await this.client.getFileContents(fullPath);

      if (content instanceof Buffer) {
        return content;
      } else if (content instanceof ArrayBuffer) {
        return Buffer.from(content);
      } else if (typeof content === 'string') {
        return Buffer.from(content, 'utf-8');
      } else {
        return Buffer.from(String(content));
      }
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(path, this.config.id);
      }
      throw new StorageError(
        `Failed to read file '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'READ_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async writeFile(path: string, content: Buffer): Promise<void> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);

      // 确保父目录存在
      const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (parentDir && !(await this.exists(this.stripBasePath(parentDir)))) {
        await this.createDirectory(this.stripBasePath(parentDir));
      }

      await this.client.putFileContents(fullPath, content);
    } catch (error: unknown) {
      throw new StorageError(
        `Failed to write file '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WRITE_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteFile(path: string): Promise<void> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      await this.client.deleteFile(fullPath);
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(path, this.config.id);
      }
      throw new StorageError(
        `Failed to delete file '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteDirectory(path: string): Promise<void> {
    return this.deleteFile(path);
  }

  async renameFile(oldPath: string, newPath: string): Promise<void> {
    this.ensureConnected();

    try {
      const fullOldPath = this.getFullPath(oldPath);
      const fullNewPath = this.getFullPath(newPath);
      await this.client.moveFile(fullOldPath, fullNewPath);
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(oldPath, this.config.id);
      }
      throw new StorageError(
        `Failed to rename '${oldPath}' to '${newPath}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RENAME_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async copyFile(sourcePath: string, destPath: string): Promise<void> {
    this.ensureConnected();

    try {
      const fullSourcePath = this.getFullPath(sourcePath);
      const fullDestPath = this.getFullPath(destPath);
      await this.client.copyFile(fullSourcePath, fullDestPath);
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(sourcePath, this.config.id);
      }
      throw new StorageError(
        `Failed to copy '${sourcePath}' to '${destPath}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'COPY_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      await this.client.stat(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  async getStats(path: string): Promise<FileStats> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      const stat = await this.client.stat(fullPath) as any;

      return {
        size: stat.size || 0,
        isDirectory: stat.type === 'directory',
        isFile: stat.type === 'file',
        modified: new Date(stat.lastmod),
        created: new Date(stat.lastmod)
      };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(path, this.config.id);
      }
      throw new StorageError(
        `Failed to get stats for '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STAT_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createReadStream(path: string): Promise<NodeJS.ReadableStream> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      return this.client.createReadStream(fullPath) as NodeJS.ReadableStream;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        throw new StorageNotFoundError(path, this.config.id);
      }
      throw new StorageError(
        `Failed to create read stream for '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_READ_STREAM_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  async createWriteStream(path: string): Promise<NodeJS.WritableStream> {
    this.ensureConnected();

    try {
      const fullPath = this.getFullPath(path);
      return this.client.createWriteStream(fullPath) as NodeJS.WritableStream;
    } catch (error: unknown) {
      throw new StorageError(
        `Failed to create write stream for '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_WRITE_STREAM_FAILED',
        this.config.id,
        error instanceof Error ? error : undefined
      );
    }
  }

  private isNotFoundError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('not found') ||
             message.includes('404') ||
             message.includes('does not exist');
    }
    return false;
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