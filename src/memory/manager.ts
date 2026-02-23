// src/memory/manager.ts

import { getMemoryDb, initMemoryDb } from './db.js';
import { getEmbeddingsService, type Embedding } from './embeddings.js';
import { loadSqliteVecExtension } from './sqlite-vec.js';
import { cosineSimilarity, parseEmbedding, vectorToBlob } from './internal.js';
import { mergeHybridResults, buildFtsQuery, type HybridSearchOptions } from './hybrid.js';
import type Database from 'better-sqlite3';

export interface MemoryChunk {
  id?: number;
  agentId: string;
  sessionKey?: string;
  content: string;
  embedding?: Embedding;
  source?: string;
  createdAt: number;
  score?: number;  // 搜索相关度分数
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  sessionKey?: string;
  useHybrid?: boolean;
  hybridWeights?: HybridSearchOptions;
}

export class MemoryManager {
  private db: Database.Database;
  private embeddings = getEmbeddingsService();
  private vecExtensionLoaded = false;

  constructor(workspace?: string) {
    this.db = workspace ? initMemoryDb(workspace) : getMemoryDb();
    this.tryLoadVecExtension();
  }

  private async tryLoadVecExtension(): Promise<void> {
    const result = await loadSqliteVecExtension({ db: this.db });
    if (result.ok) {
      this.vecExtensionLoaded = true;
      console.log('[Memory] sqlite-vec extension loaded:', result.extensionPath);
    } else {
      console.warn('[Memory] sqlite-vec unavailable, using JS fallback:', result.error);
    }
  }

  async add(chunk: Omit<MemoryChunk, 'id'>): Promise<number> {
    console.log('[Memory] Saving chunk:', {
      agentId: chunk.agentId,
      sessionKey: chunk.sessionKey,
      contentPreview: chunk.content.substring(0, 50)
    });

    try {
      // Generate embedding
      const embedding = await this.embeddings.embed(chunk.content);
      console.log('[Memory] Embedding generated, dimension:', embedding.dimension);

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO chunks_vec (agent_id, session_key, content, embedding, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        chunk.agentId,
        chunk.sessionKey || null,
        chunk.content,
        vectorToBlob(embedding.vector),
        chunk.source || null,
        chunk.createdAt || Date.now()
      );

      console.log('[Memory] Inserted into chunks_vec, ID:', result.lastInsertRowid);

      // Also add to FTS
      const ftsStmt = this.db.prepare(`
        INSERT INTO chunks_fts (content, content_agent_id, content_session_key)
        VALUES (?, ?, ?)
      `);
      ftsStmt.run(chunk.content, chunk.agentId, chunk.sessionKey || null);

      console.log('[Memory] Inserted into chunks_fts');

      return result.lastInsertRowid as number;
    } catch (error) {
      console.error('[Memory] Error saving chunk:', error);
      throw error;
    }
  }

  async search(
    agentId: string,
    query: string,
    limit: number = 5,
    sessionKey?: string  // 新增参数
  ): Promise<MemoryChunk[]> {
    // Generate query embedding
    const queryEmbedding = await this.embeddings.embed(query);

    // Use vector search
    const results = await this.searchVector(
      queryEmbedding.vector,
      agentId,
      limit,
      sessionKey
    );

    return results;
  }

  private async searchVector(
    queryVec: number[],
    agentId: string,
    limit: number,
    sessionKey?: string
  ): Promise<MemoryChunk[]> {
    if (this.vecExtensionLoaded) {
      // Strategy 1: Use SQL vector search (faster)
      return this.searchVectorSQL(queryVec, agentId, limit, sessionKey);
    } else {
      // Strategy 2: Use JavaScript calculation (fallback)
      return this.searchVectorJS(queryVec, agentId, limit, sessionKey);
    }
  }

  private searchVectorSQL(
    queryVec: number[],
    agentId: string,
    limit: number,
    sessionKey?: string
  ): MemoryChunk[] {
    const queryBuffer = vectorToBlob(queryVec);

    let sql = `
      SELECT id, agent_id, session_key, content, source, created_at,
             1 - vec_distance_cosine(embedding, ?) AS score
      FROM chunks_vec
      WHERE agent_id = ?
    `;
    const params: any[] = [queryBuffer, agentId];

    if (sessionKey) {
      sql += ` AND session_key = ?`;
      params.push(sessionKey);
    }

    sql += ` ORDER BY score DESC LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.rowToChunk(row));
  }

  private searchVectorJS(
    queryVec: number[],
    agentId: string,
    limit: number,
    sessionKey?: string
  ): MemoryChunk[] {
    // 1. Read all candidate chunks
    let sql = `
      SELECT id, agent_id, session_key, content, embedding, source, created_at
      FROM chunks_vec
      WHERE agent_id = ?
    `;
    const params: any[] = [agentId];

    if (sessionKey) {
      sql += ` AND session_key = ?`;
      params.push(sessionKey);
    }

    const candidates = this.db.prepare(sql).all(...params) as any[];

    // 2. Calculate cosine similarity
    const scored = candidates.map(chunk => ({
      ...chunk,
      score: cosineSimilarity(queryVec, parseEmbedding(chunk.embedding))
    }));

    // 3. Filter invalid scores, sort, and return top-k
    return scored
      .filter(r => Number.isFinite(r.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(row => this.rowToChunk(row));
  }

  private rowToChunk(row: any): MemoryChunk {
    return {
      id: row.id,
      agentId: row.agent_id,
      sessionKey: row.session_key || undefined,
      content: row.content,
      source: row.source || undefined,
      createdAt: row.created_at,
      score: row.score
    };
  }

  async searchBySession(agentId: string, sessionKey: string, limit: number = 10): Promise<MemoryChunk[]> {
    // Reuse the new search method with sessionKey
    return this.search(agentId, '', limit, sessionKey);
  }

  async deleteBySession(agentId: string, sessionKey: string): Promise<void> {
    this.db.prepare('DELETE FROM chunks_vec WHERE agent_id = ? AND session_key = ?').run(agentId, sessionKey);
    this.db.prepare('DELETE FROM chunks_fts WHERE content_agent_id = ? AND content_session_key = ?').run(agentId, sessionKey);
  }

  async deleteByAgent(agentId: string): Promise<void> {
    this.db.prepare('DELETE FROM chunks_vec WHERE agent_id = ?').run(agentId);
    this.db.prepare('DELETE FROM chunks_fts WHERE content_agent_id = ?').run(agentId);
  }

  async searchKeyword(
    agentId: string,
    query: string,
    limit: number,
    sessionKey?: string
  ): Promise<MemoryChunk[]> {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) {
      return [];
    }

    try {
      let sql = `
        SELECT
          v.id, v.agent_id, v.session_key, v.content, v.source, v.created_at,
          bm25(chunks_fts) AS rank
        FROM chunks_fts
        JOIN chunks_vec v ON chunks_fts.rowid = v.id
        WHERE chunks_fts MATCH ? AND v.agent_id = ?
      `;
      const params: any[] = [ftsQuery, agentId];

      if (sessionKey) {
        sql += ` AND v.session_key = ?`;
        params.push(sessionKey);
      }

      sql += ` ORDER BY rank ASC LIMIT ?`;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as any[];

      // BM25 rank 转换为分数（rank 越小越好）
      return rows.map(row => ({
        ...this.rowToChunk(row),
        score: 1 / (1 + Math.abs(row.rank))  // 转换为 0-1 分数
      }));
    } catch (error) {
      console.error('[Memory] FTS search failed:', error);
      return [];
    }
  }

  async searchHybrid(
    agentId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<MemoryChunk[]> {
    const {
      limit = 5,
      sessionKey,
      useHybrid = true,
      hybridWeights = { vectorWeight: 0.7, keywordWeight: 0.3 },
      minScore
    } = options;

    if (!useHybrid) {
      // 仅使用向量搜索
      const results = await this.search(agentId, query, limit, sessionKey);
      return minScore ? results.filter(r => (r.score || 0) >= minScore) : results;
    }

    // 并行执行向量和关键词搜索
    const [vectorResults, keywordResults] = await Promise.all([
      this.search(agentId, query, limit * 2, sessionKey),
      this.searchKeyword(agentId, query, limit * 2, sessionKey)
    ]);

    // 合并结果
    const merged = mergeHybridResults(vectorResults, keywordResults, hybridWeights);

    // 应用 limit 和 minScore 过滤
    return merged
      .filter(r => !minScore || (r.score || 0) >= minScore)
      .slice(0, limit);
  }
}
