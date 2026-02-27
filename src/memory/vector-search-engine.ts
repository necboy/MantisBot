// src/memory/vector-search-engine.ts
// 向量搜索引擎 - 支持 sqlite-vec 扩展和 JavaScript 降级
// 参考: MantisBot-desktop src/memory/vector-search-engine.ts

import type Database from 'better-sqlite3';
import { cosineSimilarity, parseEmbedding, vectorToBlob } from './internal.js';

export interface VectorSearchOptions {
  agentId?: string;
  sessionKey?: string;
  limit?: number;
  minScore?: number;
}

export interface VectorSearchResult {
  id: string;
  agentId: string;
  sessionKey?: string;
  content: string;
  source?: string;
  createdAt: number;
  score: number;
}

/**
 * 向量搜索引擎
 * 支持 sqlite-vec 扩展的高性能搜索和纯 JavaScript 降级搜索
 */
export class VectorSearchEngine {
  private db: Database.Database;
  private vecExtensionLoaded: boolean;

  constructor(db: Database.Database, vecExtensionLoaded: boolean) {
    this.db = db;
    this.vecExtensionLoaded = vecExtensionLoaded;
  }

  async searchVector(
    queryEmbedding: number[],
    options: VectorSearchOptions = {}
  ): Promise<VectorSearchResult[]> {
    const { agentId, sessionKey, limit = 50, minScore = 0.1 } = options;

    if (this.vecExtensionLoaded) {
      return this.searchVectorNative(queryEmbedding, agentId, sessionKey, limit, minScore);
    }
    return this.searchVectorFallback(queryEmbedding, agentId, sessionKey, limit, minScore);
  }

  private searchVectorNative(
    embedding: number[],
    agentId: string | undefined,
    sessionKey: string | undefined,
    limit: number,
    minScore: number
  ): VectorSearchResult[] {
    try {
      const queryBuffer = vectorToBlob(embedding);
      const whereClauses: string[] = ['agent_id = ?'];
      const params: any[] = [queryBuffer, agentId];

      if (sessionKey) {
        whereClauses.push('session_key = ?');
        params.push(sessionKey);
      }

      params.push(limit);

      const sql = `
        SELECT id, agent_id, session_key, content, source, created_at,
               1 - vec_distance_cosine(embedding, ?) AS score
        FROM chunks_vec
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY score DESC
        LIMIT ?
      `;

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows
        .map(row => this.rowToResult(row))
        .filter(r => r.score >= minScore);
    } catch (error) {
      console.error('[VectorSearch] Native search failed, falling back to JS:', error);
      return this.searchVectorFallback(embedding, agentId, sessionKey, limit, minScore);
    }
  }

  private searchVectorFallback(
    embedding: number[],
    agentId: string | undefined,
    sessionKey: string | undefined,
    limit: number,
    minScore: number
  ): VectorSearchResult[] {
    const whereClauses: string[] = ['embedding IS NOT NULL'];
    const params: any[] = [];

    if (agentId) {
      whereClauses.push('agent_id = ?');
      params.push(agentId);
    }
    if (sessionKey) {
      whereClauses.push('session_key = ?');
      params.push(sessionKey);
    }

    const candidates = this.db.prepare(`
      SELECT id, agent_id, session_key, content, source, created_at, embedding
      FROM chunks_vec
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 1000
    `).all(...params) as any[];

    return candidates
      .map(chunk => {
        const stored = parseEmbedding(chunk.embedding);
        const score = stored.length > 0 ? cosineSimilarity(embedding, stored) : 0;
        return { ...this.rowToResult(chunk), score };
      })
      .filter(r => Number.isFinite(r.score) && r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private rowToResult(row: any): VectorSearchResult {
    return {
      id: String(row.id),
      agentId: row.agent_id,
      sessionKey: row.session_key || undefined,
      content: row.content,
      source: row.source || undefined,
      createdAt: row.created_at,
      score: row.score ?? 0
    };
  }

  /**
   * 批量插入向量到虚拟表（仅在 sqlite-vec 可用时）
   */
  insertVectorBatch(chunks: Array<{ id: string; embedding: number[] }>): void {
    if (!this.vecExtensionLoaded) return;
    try {
      const insertVectors = this.db.transaction((batch: typeof chunks) => {
        const stmt = this.db.prepare(
          'INSERT OR REPLACE INTO chunks_vec_search (id, embedding) VALUES (?, ?)'
        );
        for (const chunk of batch) {
          stmt.run(chunk.id, vectorToBlob(chunk.embedding));
        }
      });
      insertVectors(chunks);
    } catch (error) {
      console.error('[VectorSearch] Failed to insert vector batch:', error);
    }
  }

  deleteVector(id: string): void {
    if (!this.vecExtensionLoaded) return;
    try {
      this.db.prepare('DELETE FROM chunks_vec_search WHERE id = ?').run(id);
    } catch (error) {
      console.error('[VectorSearch] Failed to delete vector:', id, error);
    }
  }

  /**
   * 检查并修复向量表（补充缺失的向量记录）
   */
  repairVectorTable(): { repaired: number; errors: number } {
    if (!this.vecExtensionLoaded) {
      throw new Error('Vector extension not available');
    }

    let repaired = 0;
    let errors = 0;

    const missing = this.db.prepare(`
      SELECT c.id, c.embedding
      FROM chunks_vec c
      LEFT JOIN chunks_vec_search v ON CAST(c.id AS TEXT) = v.id
      WHERE v.id IS NULL AND c.embedding IS NOT NULL
      LIMIT 1000
    `).all() as any[];

    if (missing.length === 0) return { repaired: 0, errors: 0 };

    const batches: Array<{ id: string; embedding: number[] }> = [];
    for (const row of missing) {
      try {
        const embedding = parseEmbedding(row.embedding);
        if (embedding.length > 0) {
          batches.push({ id: String(row.id), embedding });
        }
      } catch {
        errors++;
      }
    }

    if (batches.length > 0) {
      this.insertVectorBatch(batches);
      repaired = batches.length;
    }

    return { repaired, errors };
  }

  getStats(): { extensionLoaded: boolean; totalChunks: number } {
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_vec').get() as any).count;
    return { extensionLoaded: this.vecExtensionLoaded, totalChunks: total };
  }
}
