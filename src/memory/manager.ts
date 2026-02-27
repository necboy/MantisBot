// src/memory/manager.ts

import { getMemoryDb, initMemoryDb } from './db.js';
import { getEmbeddingsService, type Embedding } from './embeddings.js';
import { loadSqliteVecExtension } from './sqlite-vec.js';
import { HybridSearchEngine, type HybridSearchResult } from './hybrid-search-engine.js';
import { EmbeddingCache } from './embedding-cache.js';
import type Database from 'better-sqlite3';

export interface MemoryChunk {
  id?: number;
  agentId: string;
  sessionKey?: string;
  content: string;
  embedding?: Embedding;
  source?: string;
  createdAt: number;
  score?: number;
  snippet?: string;
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  sessionKey?: string;
  vectorWeight?: number;
  textWeight?: number;
}

export class MemoryManager {
  private db: Database.Database;
  private embeddings = getEmbeddingsService();
  private vecExtensionLoaded = false;
  private hybridEngine!: HybridSearchEngine;
  private embeddingCache!: EmbeddingCache;
  private initialized = false;

  constructor(workspace?: string) {
    this.db = workspace ? initMemoryDb(workspace) : getMemoryDb();
    this.init();
  }

  private async init(): Promise<void> {
    const result = await loadSqliteVecExtension({ db: this.db });
    if (result.ok) {
      this.vecExtensionLoaded = true;
      console.log('[Memory] sqlite-vec extension loaded:', result.extensionPath);
    } else {
      console.warn('[Memory] sqlite-vec unavailable, using JS fallback:', result.error);
    }

    this.hybridEngine = new HybridSearchEngine(this.db, this.vecExtensionLoaded, this.embeddings);
    this.embeddingCache = new EmbeddingCache(this.db);
    this.initialized = true;
  }

  /**
   * 保存记忆片段
   */
  async add(chunk: Omit<MemoryChunk, 'id'>): Promise<number> {
    console.log('[Memory] Saving chunk:', {
      agentId: chunk.agentId,
      sessionKey: chunk.sessionKey,
      contentPreview: chunk.content.substring(0, 50)
    });

    // 生成 embedding
    const embedding = await this.embeddings.embed(chunk.content);
    console.log('[Memory] Embedding generated, dimension:', embedding.dimension);

    // 写入主表
    const result = this.db.prepare(`
      INSERT INTO chunks_vec (agent_id, session_key, content, embedding, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      chunk.agentId,
      chunk.sessionKey || null,
      chunk.content,
      this.vectorToBlob(embedding.vector),
      chunk.source || null,
      chunk.createdAt || Date.now()
    );

    const id = result.lastInsertRowid as number;
    console.log('[Memory] Inserted into chunks_vec, ID:', id);

    // 通过 HybridSearchEngine 统一索引（FTS + 向量表）
    await this.ensureInitialized();
    this.hybridEngine.indexChunk({
      id,
      agentId: chunk.agentId,
      sessionKey: chunk.sessionKey,
      content: chunk.content,
      embedding: embedding.vector
    });

    return id;
  }

  /**
   * 混合搜索（向量 + 全文，加权融合）
   */
  async searchHybrid(
    agentId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<MemoryChunk[]> {
    await this.ensureInitialized();

    const {
      limit = 5,
      minScore = 0.1,
      sessionKey,
      vectorWeight = 0.7,
      textWeight = 0.3
    } = options;

    const results = await this.hybridEngine.search({
      query,
      agentId,
      sessionKey,
      limit,
      minScore,
      vectorWeight,
      textWeight
    });

    return results.map(r => this.hybridResultToChunk(r));
  }

  /**
   * 纯向量搜索（语义检索）
   */
  async search(
    agentId: string,
    query: string,
    limit = 5,
    sessionKey?: string
  ): Promise<MemoryChunk[]> {
    return this.searchHybrid(agentId, query, {
      limit,
      sessionKey,
      vectorWeight: 1.0,
      textWeight: 0.0
    });
  }

  async deleteBySession(agentId: string, sessionKey: string): Promise<void> {
    // 删除主表
    this.db.prepare('DELETE FROM chunks_vec WHERE agent_id = ? AND session_key = ?').run(agentId, sessionKey);
    // 同步删除 FTS（通过 agent_id 过滤后删除）
    this.db.prepare('DELETE FROM chunks_fts WHERE content_agent_id = ? AND content_session_key = ?').run(agentId, sessionKey);
  }

  async deleteByAgent(agentId: string): Promise<void> {
    this.db.prepare('DELETE FROM chunks_vec WHERE agent_id = ?').run(agentId);
    this.db.prepare('DELETE FROM chunks_fts WHERE content_agent_id = ?').run(agentId);
  }

  /**
   * 重建搜索索引
   */
  async rebuildIndexes(): Promise<{ ftsRebuild: { rebuilt: number; errors: number } }> {
    await this.ensureInitialized();
    return this.hybridEngine.rebuildIndexes();
  }

  getStatus(): { vecExtensionLoaded: boolean; ftsRecordCount: number; totalChunks: number } {
    if (!this.initialized) {
      return { vecExtensionLoaded: false, ftsRecordCount: 0, totalChunks: 0 };
    }
    const s = this.hybridEngine.getStatus();
    return {
      vecExtensionLoaded: s.vectorExtension,
      ftsRecordCount: s.ftsRecordCount,
      totalChunks: s.totalChunks
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private vectorToBlob(vector: number[]): Buffer {
    return Buffer.from(new Float32Array(vector).buffer);
  }

  private hybridResultToChunk(r: HybridSearchResult): MemoryChunk {
    return {
      id: Number(r.id),
      agentId: r.agentId,
      sessionKey: r.sessionKey,
      content: r.content,
      source: r.source,
      createdAt: r.createdAt,
      score: r.score,
      snippet: r.snippet
    };
  }
}
