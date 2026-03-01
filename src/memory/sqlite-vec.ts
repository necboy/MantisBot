// src/memory/sqlite-vec.ts
// sqlite-vec 扩展加载器

export interface LoadResult {
  ok: boolean;
  extensionPath?: string;
  error?: string;
}

/**
 * 加载 sqlite-vec 扩展
 *
 * @deprecated 这个函数仅为向后兼容保留，新代码应使用 NodeSqliteDatabase，
 * 它在构造时自动处理 sqlite-vec 扩展加载
 * @param params - 参数对象
 * @param params.db - 数据库实例（兼容不同数据库类型）
 * @param params.extensionPath - 可选的自定义扩展路径
 * @returns 加载结果
 */
export async function loadSqliteVecExtension(params: {
  db: any;
  extensionPath?: string;
}): Promise<LoadResult> {
  try {
    const sqliteVec = await import('sqlite-vec');
    const resolvedPath = params.extensionPath?.trim() || undefined;
    const extensionPath = resolvedPath ?? sqliteVec.getLoadablePath();

    params.db.loadExtension(extensionPath);

    return { ok: true, extensionPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
