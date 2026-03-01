// src/memory/hybrid-search-engine.ts
// 混合搜索引擎 - 结合向量搜索和全文搜索
// 参考: MantisBot-desktop src/memory/hybrid-search-engine.ts

import type { NodeSqliteDatabase } from './node-sqlite-db.js';
import { VectorSearchEngine, type VectorSearchResult } from './vector-search-engine.js';
import { FullTextSearchEngine, type TextSearchResult } from './full-text-search-engine.js';
import type { EmbeddingsService } from './embeddings.js';

export interface HybridSearchOptions {
  query: string;
  agentId?: string;
  sessionKey?: string;
  limit?: number;
  minScore?: number;
  vectorWeight?: number;
  textWeight?: number;
}

export interface HybridSearchResult {
  id: string;
  agentId: string;
  sessionKey?: string;
  content: string;
  source?: string;
  createdAt: number;
  score: number;
  vectorScore?: number;
  textScore?: number;
  snippet?: string;
}

/**
 * 混合搜索引擎
 * 并行执行向量搜索和全文搜索，通过加权融合得出最终排序
 */
export class HybridSearchEngine {
  private vectorEngine: VectorSearchEngine;
  private textEngine: FullTextSearchEngine;
  private embeddings: EmbeddingsService;

  private readonly DEFAULT_VECTOR_WEIGHT = 0.7;
  private readonly DEFAULT_TEXT_WEIGHT = 0.3;

  constructor(
    db: NodeSqliteDatabase,
    embeddings: EmbeddingsService
  ) {
    this.vectorEngine = new VectorSearchEngine(db);
    this.textEngine = new FullTextSearchEngine(db);
    this.embeddings = embeddings;
  }

  async search(options: HybridSearchOptions): Promise<HybridSearchResult[]> {
    const {
      query,
      agentId,
      sessionKey,
      limit = 20,
      minScore = 0.1,
      vectorWeight = this.DEFAULT_VECTOR_WEIGHT,
      textWeight = this.DEFAULT_TEXT_WEIGHT
    } = options;

    // 与 desktop-packing 对齐：
    // desktop 的 generateMockEmbedding() 返回 null → executeVectorSearch 返回 [] → 仅 FTS
    // 服务端等价实现：isAvailable()=false → 直接走 text-only，避免随机向量污染
    if (!this.embeddings.isAvailable()) {
      console.log('[HybridSearch] Embeddings unavailable, using text-only search');
      // 使用更大的候选池再截断，提高相关结果召回率
      const candidateCount = Math.max(50, limit * 5);
      const textResults = await this.textEngine.searchText(query, {
        agentId,
        sessionKey,
        limit: candidateCount,
        // 小语料时 BM25 因 IDF 坍缩会趋近于 0，禁用 minScore 过滤
        // 改为依赖 SQL ORDER BY rank 排序保证质量
        minScore: 0
      });
      console.log(`[HybridSearch] Text-only: ${textResults.length} candidates -> returning top ${limit}`);
      return textResults.slice(0, limit).map(r => ({
        id: r.id,
        agentId: r.agentId,
        sessionKey: r.sessionKey,
        content: r.content,
        source: r.source,
        createdAt: r.createdAt,
        score: r.score,
        textScore: r.score,
        snippet: r.snippet
      }));
    }

    const candidateCount = Math.max(200, limit * 3);

    // 并行执行两路搜索
    const [vectorResults, textResults] = await Promise.all([
      this.runVectorSearch(query, { agentId, sessionKey, limit: candidateCount }),
      this.textEngine.searchText(query, { agentId, sessionKey, limit: candidateCount, minScore: 0 })
    ]);

    console.log('[HybridSearch] Raw results:', {
      vectorCount: vectorResults.length,
      textCount: textResults.length
    });

    const merged = this.mergeResults(vectorResults, textResults, vectorWeight, textWeight);

    return merged
      .filter(r => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async runVectorSearch(
    query: string,
    options: { agentId?: string; sessionKey?: string; limit: number }
  ): Promise<VectorSearchResult[]> {
    try {
      const embedding = await this.embeddings.embed(query);
      return this.vectorEngine.searchVector(embedding.vector, {
        agentId: options.agentId,
        sessionKey: options.sessionKey,
        limit: options.limit,
        minScore: 0
      });
    } catch (error) {
      console.error('[HybridSearch] Vector search failed:', error);
      return [];
    }
  }

  private mergeResults(
    vectorResults: VectorSearchResult[],
    textResults: TextSearchResult[],
    vectorWeight: number,
    textWeight: number
  ): HybridSearchResult[] {
    const resultMap = new Map<string, HybridSearchResult>();

    for (const r of vectorResults) {
      resultMap.set(r.id, {
        id: r.id,
        agentId: r.agentId,
        sessionKey: r.sessionKey,
        content: r.content,
        source: r.source,
        createdAt: r.createdAt,
        score: vectorWeight * r.score,
        vectorScore: r.score,
        textScore: 0
      });
    }

    for (const r of textResults) {
      const existing = resultMap.get(r.id);
      if (existing) {
        existing.textScore = r.score;
        existing.score = vectorWeight * (existing.vectorScore || 0) + textWeight * r.score;
        existing.snippet = r.snippet;
      } else {
        resultMap.set(r.id, {
          id: r.id,
          agentId: r.agentId,
          sessionKey: r.sessionKey,
          content: r.content,
          source: r.source,
          createdAt: r.createdAt,
          score: textWeight * r.score,
          vectorScore: 0,
          textScore: r.score,
          snippet: r.snippet
        });
      }
    }

    return Array.from(resultMap.values());
  }

  /**
   * 将新 chunk 同时索引到 FTS 和向量表
   */
  indexChunk(chunk: {
    id: string | number;
    agentId: string;
    sessionKey?: string;
    content: string;
    embedding?: number[];
  }): void {
    this.textEngine.insertFtsRecord({
      id: String(chunk.id),
      agentId: chunk.agentId,
      sessionKey: chunk.sessionKey,
      content: chunk.content
    });

    if (chunk.embedding) {
      this.vectorEngine.insertVectorBatch([{
        id: String(chunk.id),
        embedding: chunk.embedding
      }]);
    }
  }

  removeFromIndex(id: string | number): void {
    const stringId = String(id);
    this.textEngine.deleteFtsRecord(stringId);
    this.vectorEngine.deleteVector(stringId);
  }

  rebuildIndexes(): { ftsRebuild: { rebuilt: number; errors: number } } {
    const ftsRebuild = this.textEngine.rebuildFtsIndex();
    return { ftsRebuild };
  }

  getStatus(): {
    vectorExtension: boolean;
    ftsRecordCount: number;
    totalChunks: number;
  } {
    const vectorStats = this.vectorEngine.getStats();
    const textStats = this.textEngine.getStats();
    return {
      vectorExtension: vectorStats.extensionLoaded,
      ftsRecordCount: textStats.ftsRecordCount,
      totalChunks: textStats.totalChunks
    };
  }
}
