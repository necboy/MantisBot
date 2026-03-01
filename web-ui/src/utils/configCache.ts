// web-ui/src/utils/configCache.ts
// 前端配置数据缓存：首次读取后缓存在内存中，切换 Tab 时直接返回缓存，无需重复请求
// 更新数据后调用 invalidateCache(key) 使对应缓存失效，下次读取时重新请求

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟后自动失效（防止数据过期）

interface CacheEntry {
  data: unknown;
  ts: number;
}

const store = new Map<string, CacheEntry>();

/**
 * 带缓存的异步数据获取。
 * - 缓存命中且未过期：直接返回内存数据（无网络请求）
 * - 缓存未命中或已过期：执行 fetcher，将结果写入缓存后返回
 */
export async function cachedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data as T;
  }
  const data = await fetcher();
  store.set(key, { data, ts: Date.now() });
  return data;
}

/**
 * 使指定 key 的缓存失效。写操作（增/删/改）完成后调用，确保下次读取拿到最新数据。
 */
export function invalidateCache(...keys: string[]): void {
  for (const k of keys) {
    store.delete(k);
  }
}

/**
 * 清空所有缓存（执行"重载配置"时调用）
 */
export function invalidateAllCache(): void {
  store.clear();
}
