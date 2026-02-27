// src/memory/embedding-cache.ts
// Embedding 缓存管理器 - 避免重复计算相同的 embedding
// 参考: MantisBot-desktop src/memory/embedding-cache.ts

import type Database from 'better-sqlite3';
import * as crypto from 'crypto';

export interface EmbeddingCacheOptions {
  maxMemoryCacheSize?: number; // 内存缓存最大条目数，默认 1000
  cacheExpiryMs?: number;      // 缓存过期时间（毫秒），默认 24 小时
}

/**
 * Embedding 缓存管理器
 * 实现三级缓存策略：内存 → SQLite → 重新计算
 */
export class EmbeddingCache {
  private db: Database.Database;
  private memoryCache = new Map<string, { embedding: number[]; timestamp: number }>();
  private maxMemoryCacheSize: number;
  private cacheExpiryMs: number;

  constructor(db: Database.Database, options: EmbeddingCacheOptions = {}) {
    this.db = db;
    this.maxMemoryCacheSize = options.maxMemoryCacheSize ?? 1000;
    this.cacheExpiryMs = options.cacheExpiryMs ?? 24 * 60 * 60 * 1000;
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embedding_cache (
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        embedding TEXT NOT NULL,
        dims INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (provider, model, text_hash)
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_embedding_cache_created
      ON embedding_cache(created_at)
    `);
    console.log('[EmbeddingCache] Schema initialized');
  }

  private getCacheKey(provider: string, model: string, text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
    return `${provider}:${model}:${hash}`;
  }

  /**
   * 获取或计算 embedding（三级缓存策略）
   */
  async getOrCompute(
    text: string,
    model: string,
    provider: string,
    computeFn: () => Promise<number[]>
  ): Promise<number[]> {
    const cacheKey = this.getCacheKey(provider, model, text);

    // L1: 内存缓存
    const memEntry = this.memoryCache.get(cacheKey);
    if (memEntry && Date.now() - memEntry.timestamp < this.cacheExpiryMs) {
      return memEntry.embedding;
    }

    // L2: SQLite 缓存
    const dbEntry = this.getFromDatabase(provider, model, text);
    if (dbEntry) {
      this.updateMemoryCache(cacheKey, dbEntry);
      return dbEntry;
    }

    // L3: 重新计算
    const embedding = await computeFn();
    await this.saveToCache(provider, model, text, embedding);
    return embedding;
  }

  private getFromDatabase(provider: string, model: string, text: string): number[] | null {
    const textHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
    try {
      const row = this.db.prepare(
        'SELECT embedding, created_at FROM embedding_cache WHERE provider = ? AND model = ? AND text_hash = ?'
      ).get(provider, model, textHash) as any;

      if (!row) return null;
      if (Date.now() - row.created_at > this.cacheExpiryMs) {
        this.db.prepare('DELETE FROM embedding_cache WHERE provider = ? AND model = ? AND text_hash = ?')
          .run(provider, model, textHash);
        return null;
      }
      return JSON.parse(row.embedding);
    } catch {
      return null;
    }
  }

  private async saveToCache(provider: string, model: string, text: string, embedding: number[]): Promise<void> {
    const textHash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO embedding_cache (provider, model, text_hash, embedding, dims, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(provider, model, textHash, JSON.stringify(embedding), embedding.length, Date.now());
    } catch (error) {
      console.warn('[EmbeddingCache] Failed to save to database:', error);
    }
    this.updateMemoryCache(this.getCacheKey(provider, model, text), embedding);
  }

  private updateMemoryCache(key: string, embedding: number[]): void {
    if (this.memoryCache.size >= this.maxMemoryCacheSize) {
      let oldestKey: string | null = null;
      let oldestTs = Infinity;
      for (const [k, v] of this.memoryCache) {
        if (v.timestamp < oldestTs) { oldestTs = v.timestamp; oldestKey = k; }
      }
      if (oldestKey) this.memoryCache.delete(oldestKey);
    }
    this.memoryCache.set(key, { embedding, timestamp: Date.now() });
  }

  async cleanExpiredCache(): Promise<number> {
    try {
      const result = this.db.prepare('DELETE FROM embedding_cache WHERE created_at < ?')
        .run(Date.now() - this.cacheExpiryMs);
      return result.changes;
    } catch {
      return 0;
    }
  }

  clearCache(): void {
    this.memoryCache.clear();
    this.db.exec('DELETE FROM embedding_cache');
  }

  getStats(): { memoryCacheSize: number; databaseCacheSize: number } {
    const dbCount = (this.db.prepare('SELECT COUNT(*) as count FROM embedding_cache').get() as any).count;
    return { memoryCacheSize: this.memoryCache.size, databaseCacheSize: dbCount };
  }
}
