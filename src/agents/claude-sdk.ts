// src/agents/claude-sdk.ts

import { existsSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

export type ClaudeSdkModule = typeof import('@anthropic-ai/claude-agent-sdk');

let claudeSdkPromise: Promise<ClaudeSdkModule> | null = null;

/**
 * 获取 Claude Agent SDK 的路径
 * MantisBot 是 Node.js 服务，不需要处理 Electron 打包场景
 */
function getClaudeSdkPath(): string {
  // 获取项目根目录
  const projectRoot = process.cwd();
  const sdkPath = join(projectRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs');

  console.log('[ClaudeSDK] Resolved SDK path:', sdkPath);
  return sdkPath;
}

/**
 * 加载 Claude Agent SDK
 * 使用动态 import 以便加载 ESM 模块
 */
export async function loadClaudeSdk(): Promise<ClaudeSdkModule> {
  if (!claudeSdkPromise) {
    const sdkPath = getClaudeSdkPath();
    const sdkUrl = pathToFileURL(sdkPath).href;
    const sdkExists = existsSync(sdkPath);

    console.log('[ClaudeSDK] Loading Claude Agent SDK', {
      sdkPath,
      sdkUrl,
      sdkExists,
    });

    if (!sdkExists) {
      throw new Error(`Claude Agent SDK not found at: ${sdkPath}`);
    }

    claudeSdkPromise = import(sdkUrl).catch((error) => {
      console.error('[ClaudeSDK] Failed to load Claude Agent SDK', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        sdkPath,
      });
      claudeSdkPromise = null;
      throw error;
    });
  }

  return claudeSdkPromise;
}

/**
 * 检查 SDK 是否已加载
 */
export function isSdkLoaded(): boolean {
  return claudeSdkPromise !== null;
}
