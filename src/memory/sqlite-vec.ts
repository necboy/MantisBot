// src/memory/sqlite-vec.ts
// sqlite-vec 扩展加载器
// 参考: OpenClaw src/memory/sqlite-vec.ts

import type Database from 'better-sqlite3';

export interface LoadResult {
  ok: boolean;
  extensionPath?: string;
  error?: string;
}

/**
 * 加载 sqlite-vec 扩展
 *
 * @param params - 参数对象
 * @param params.db - better-sqlite3 数据库实例
 * @param params.extensionPath - 可选的自定义扩展路径
 * @returns 加载结果
 */
export async function loadSqliteVecExtension(params: {
  db: Database.Database;
  extensionPath?: string;
}): Promise<LoadResult> {
  try {
    const sqliteVec = await import('sqlite-vec');
    const resolvedPath = params.extensionPath?.trim() || undefined;
    const extensionPath = resolvedPath ?? sqliteVec.getLoadablePath();

    // better-sqlite3 使用 loadExtension() API
    // 注意：与 node:sqlite 不同，better-sqlite3 不需要调用 enableLoadExtension(true)
    params.db.loadExtension(extensionPath);

    return { ok: true, extensionPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
