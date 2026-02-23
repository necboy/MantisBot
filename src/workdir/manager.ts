/**
 * 工作目录管理器
 * 用于全局管理和切换当前工作目录
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from '../config/loader.js';

/**
 * 检测是否在 Docker 容器中运行
 */
function isRunningInDocker(): boolean {
  // 检查 /.dockerenv 文件是否存在
  if (fs.existsSync('/.dockerenv')) {
    return true;
  }
  // 检查 cgroup 是否包含 docker 关键字
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
    return cgroup.includes('docker') || cgroup.includes('kubepods');
  } catch {
    return false;
  }
}

/**
 * 获取 Docker 环境下的默认工作目录
 * 宿主机主目录通常挂载到 /app/host-home
 */
function getDockerDefaultWorkDir(): string | null {
  const hostHomeMount = '/app/host-home';
  if (fs.existsSync(hostHomeMount)) {
    try {
      const stats = fs.statSync(hostHomeMount);
      if (stats.isDirectory()) {
        return hostHomeMount;
      }
    } catch {
      // 忽略错误
    }
  }
  return null;
}

class WorkDirManager {
  private currentWorkDir: string;

  constructor() {
    // 在 Docker 环境中，优先使用挂载的宿主机主目录
    if (isRunningInDocker()) {
      const dockerDefault = getDockerDefaultWorkDir();
      if (dockerDefault) {
        this.currentWorkDir = dockerDefault;
        console.log(`[WorkDirManager] Running in Docker, using mounted host home: ${dockerDefault}`);
        return;
      }
    }
    // 默认使用用户主目录
    this.currentWorkDir = os.homedir();
  }

  /**
   * 获取系统默认允许的路径列表（不受用户配置影响）
   */
  private getSystemDefaultAllowedPaths(): string[] {
    const defaultPaths: string[] = [];

    // /tmp 目录
    defaultPaths.push('/tmp');

    // 用户主目录
    defaultPaths.push(os.homedir());

    // 在 Docker 环境中添加特定目录
    if (isRunningInDocker()) {
      // Docker 容器内的 root 目录
      defaultPaths.push('/root');
      // 应用目录
      defaultPaths.push('/app');
      // 挂载的宿主机主目录
      const dockerDefault = getDockerDefaultWorkDir();
      if (dockerDefault) {
        defaultPaths.push(dockerDefault);
      }
    }

    return defaultPaths;
  }

  /**
   * 检查路径是否在允许的路径列表中
   */
  private isPathAllowed(resolvedPath: string): { allowed: boolean; reason?: string } {
    const config = getConfig();
    const userAllowedPaths = config.allowedPaths || [];

    // 获取系统默认允许路径
    const systemDefaultPaths = this.getSystemDefaultAllowedPaths();

    // 首先检查系统默认允许路径
    for (const defaultPath of systemDefaultPaths) {
      if (resolvedPath.startsWith(defaultPath)) {
        return { allowed: true };
      }
    }

    // 然后检查用户配置的允许路径
    for (const allowedPath of userAllowedPaths) {
      if (resolvedPath.startsWith(allowedPath)) {
        return { allowed: true };
      }
    }

    // 构建用于显示的完整允许列表
    const allAllowedPaths = [...systemDefaultPaths, ...userAllowedPaths];

    // 不在允许列表中
    return {
      allowed: false,
      reason: `目录不在允许列表中。当前允许的目录: ${allAllowedPaths.join(', ')}`
    };
  }

  /**
   * 获取当前工作目录
   */
  getCurrentWorkDir(): string {
    return this.currentWorkDir;
  }

  /**
   * 设置当前工作目录
   * @param newDir 新的工作目录路径
   * @returns 是否设置成功，以及是否需要添加权限
   */
  setCurrentWorkDir(newDir: string): { success: boolean; error?: string; needsPermission?: boolean; suggestedPath?: string } {
    try {
      // 解析绝对路径
      const resolvedPath = path.resolve(newDir);

      // 检查目录是否存在
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: `目录不存在: ${resolvedPath}` };
      }

      // 检查是否是目录
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        return { success: false, error: `路径不是目录: ${resolvedPath}` };
      }

      // 检查读取权限
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
      } catch {
        return { success: false, error: `没有读取权限: ${resolvedPath}` };
      }

      // 检查是否在允许的路径列表中
      const { allowed, reason } = this.isPathAllowed(resolvedPath);
      if (!allowed) {
        return {
          success: false,
          error: reason,
          needsPermission: true,
          suggestedPath: resolvedPath
        };
      }

      // 设置新的工作目录
      this.currentWorkDir = resolvedPath;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `设置工作目录失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取用户主目录
   * 在 Docker 环境中返回挂载的宿主机主目录
   */
  getHomeDir(): string {
    if (isRunningInDocker()) {
      const dockerDefault = getDockerDefaultWorkDir();
      if (dockerDefault) {
        return dockerDefault;
      }
    }
    return os.homedir();
  }

  /**
   * 获取工作目录信息
   */
  getWorkDirInfo() {
    const inDocker = isRunningInDocker();
    const dockerHostHome = inDocker ? getDockerDefaultWorkDir() : null;

    return {
      current: this.currentWorkDir,
      home: this.getHomeDir(),
      platform: process.platform,
      isDocker: inDocker,
      // Docker 环境下的挂载信息
      dockerMount: dockerHostHome ? {
        containerPath: dockerHostHome,
        hostPathHint: '~ (宿主机主目录)'
      } : null
    };
  }
}

// 单例实例
export const workDirManager = new WorkDirManager();
