// src/memory/full-text-search-engine.ts
// 全文搜索引擎 - 基于 SQLite FTS5
// 参考: MantisBot-desktop src/memory/full-text-search-engine.ts

import type Database from 'better-sqlite3';

export interface TextSearchOptions {
  agentId?: string;
  sessionKey?: string;
  limit?: number;
  minScore?: number;
}

export interface TextSearchResult {
  id: string;
  agentId: string;
  sessionKey?: string;
  content: string;
  source?: string;
  createdAt: number;
  score: number;
  snippet?: string;
}

/**
 * 全文搜索引擎
 * 基于 SQLite FTS5，使用 BM25 排名算法
 * 支持中英文混合查询
 */
export class FullTextSearchEngine {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async searchText(
    query: string,
    options: TextSearchOptions = {}
  ): Promise<TextSearchResult[]> {
    const { agentId, sessionKey, limit = 50, minScore = 0.1 } = options;

    const ftsQuery = this.buildFtsQuery(query);
    if (!ftsQuery) return [];

    console.log(`[TextSearch] query="${query.substring(0, 40)}" ftsQuery="${ftsQuery.substring(0, 80)}"`);

    try {
      const whereClauses: string[] = [];
      const params: any[] = [ftsQuery];

      if (agentId) {
        whereClauses.push('content_agent_id = ?');
        params.push(agentId);
      }
      if (sessionKey) {
        whereClauses.push('content_session_key = ?');
        params.push(sessionKey);
      }

      const whereClause = whereClauses.length > 0 ? `AND ${whereClauses.join(' AND ')}` : '';

      const sql = `
        SELECT
          fts.id,
          fts.content_agent_id AS agent_id,
          fts.content_session_key AS session_key,
          c.content,
          c.source,
          c.created_at,
          bm25(chunks_fts) AS rank
        FROM chunks_fts fts
        JOIN chunks_vec c ON c.id = CAST(fts.id AS INTEGER)
        WHERE chunks_fts MATCH ? ${whereClause}
        ORDER BY rank ASC
        LIMIT ?
      `;
      params.push(limit);

      const rows = this.db.prepare(sql).all(...params) as any[];

      console.log(`[TextSearch] Found ${rows.length} rows before minScore filter (minScore=${minScore})`);

      // 按内容去重（相同内容取 BM25 最高的那条），减少重复记忆噪声
      const seenContent = new Set<string>();
      const deduped = rows.filter(row => {
        const key = (row.content ?? '').trim();
        if (seenContent.has(key)) return false;
        seenContent.add(key);
        return true;
      });

      return deduped
        .map(row => ({
          id: String(row.id),
          agentId: row.agent_id,
          sessionKey: row.session_key || undefined,
          content: row.content,
          source: row.source || undefined,
          createdAt: row.created_at,
          score: this.bm25ToScore(row.rank),
          snippet: this.generateSnippet(row.content, query)
        }))
        .filter(r => r.score >= minScore);
    } catch (error) {
      console.error('[TextSearch] FTS search failed:', error);
      return [];
    }
  }

  /**
   * 构建 FTS5 查询字符串
   * - 英文/数字：按单词分组
   * - 中文：按单字拆分
   * - 使用 OR 连接，提高跨 session 召回率
   *   （用户问句词汇与存储事实词汇往往不重叠，AND 会导致漏召回）
   * - 同时加入相邻字符短语匹配（bigrams），提升 IDF 权重
   *   （"你叫" 比 "你" 稀有，更能区分相关记忆）
   */
  buildFtsQuery(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;

    // 预处理：汉字间插入空格，再提取 token
    const processed = this.preprocessForFts(raw);
    const tokens = processed.match(/[A-Za-z0-9_\u4e00-\u9fa5]+/g)?.filter(Boolean) ?? [];

    if (tokens.length === 0) return null;

    // 去重单字 token
    const unique = [...new Set(tokens)];
    const terms: string[] = unique.map(t => `"${t.replace(/"/g, '')}"`);

    // 提取相邻汉字的短语（bigrams）加入查询
    // FTS5 phrase query "你 叫" 匹配 "你" 紧跟 "叫" 的文档，IDF 更高
    const cjkSeq = tokens.filter(t => /^[\u4e00-\u9fa5]$/.test(t));
    const seenBigrams = new Set<string>();
    for (let i = 0; i < cjkSeq.length - 1; i++) {
      const bigram = `"${cjkSeq[i]} ${cjkSeq[i + 1]}"`;
      if (!seenBigrams.has(bigram)) {
        seenBigrams.add(bigram);
        terms.push(bigram);
      }
    }

    return terms.join(' OR ');
  }

  /**
   * 在汉字间插入空格，使 FTS5 unicode61 tokenizer 能逐字索引
   * 例："我喜欢喝咖啡" → "我 喜 欢 喝 咖 啡"
   */
  private preprocessForFts(text: string): string {
    return text
      .replace(/([\u4e00-\u9fa5])/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private bm25ToScore(rank: number): number {
    // FTS5 bm25() 返回负数，越负越相关（|rank| 越大 = 越匹配）
    // 将负数取反后做 logistic 映射到 (0,1)
    if (!Number.isFinite(rank) || rank >= 0) return 0;
    const r = -rank; // 正数，越大越相关
    return r / (r + 10); // r=10→0.5, r=30→0.75, r=100→0.91
  }

  private generateSnippet(content: string, query: string, maxLength = 200): string {
    if (!content) return '';
    const keywords = query.match(/[A-Za-z0-9_\u4e00-\u9fa5]+/g) ?? [];
    if (keywords.length === 0) {
      return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    let keywordIndex = -1;
    let foundKeyword = '';
    for (const kw of keywords) {
      const idx = content.toLowerCase().indexOf(kw.toLowerCase());
      if (idx !== -1 && (keywordIndex === -1 || idx < keywordIndex)) {
        keywordIndex = idx;
        foundKeyword = kw;
      }
    }

    if (keywordIndex === -1) {
      return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
    }

    const ctx = Math.floor((maxLength - foundKeyword.length) / 2);
    const start = Math.max(0, keywordIndex - ctx);
    const end = Math.min(content.length, keywordIndex + foundKeyword.length + ctx);
    let snippet = content.slice(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }

  /**
   * 插入或更新 FTS 记录（存储时预处理中文，逐字索引）
   */
  insertFtsRecord(chunk: {
    id: string | number;
    agentId: string;
    sessionKey?: string;
    content: string;
  }): void {
    try {
      this.db.prepare(
        'INSERT OR REPLACE INTO chunks_fts (id, content, content_agent_id, content_session_key) VALUES (?, ?, ?, ?)'
      ).run(String(chunk.id), this.preprocessForFts(chunk.content), chunk.agentId, chunk.sessionKey || null);
    } catch (error) {
      console.error('[TextSearch] Failed to insert FTS record:', chunk.id, error);
    }
  }

  deleteFtsRecord(id: string | number): void {
    try {
      this.db.prepare('DELETE FROM chunks_fts WHERE id = ?').run(String(id));
    } catch (error) {
      console.error('[TextSearch] Failed to delete FTS record:', id, error);
    }
  }

  insertFtsBatch(chunks: Array<{
    id: string | number;
    agentId: string;
    sessionKey?: string;
    content: string;
  }>): void {
    const insertBatch = this.db.transaction((batch: typeof chunks) => {
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO chunks_fts (id, content, content_agent_id, content_session_key) VALUES (?, ?, ?, ?)'
      );
      for (const chunk of batch) {
        stmt.run(String(chunk.id), this.preprocessForFts(chunk.content), chunk.agentId, chunk.sessionKey || null);
      }
    });
    insertBatch(chunks);
  }

  /**
   * 重建 FTS 索引（全量）
   */
  rebuildFtsIndex(): { rebuilt: number; errors: number } {
    let rebuilt = 0;
    let errors = 0;

    this.db.exec('DELETE FROM chunks_fts');
    const chunks = this.db.prepare(
      "SELECT id, agent_id, session_key, content FROM chunks_vec WHERE content IS NOT NULL AND content != ''"
    ).all() as any[];

    const batchSize = 100;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      try {
        this.insertFtsBatch(batch.map(c => ({
          id: c.id,
          agentId: c.agent_id,
          sessionKey: c.session_key,
          content: c.content
        })));
        rebuilt += batch.length;
      } catch {
        errors += batch.length;
      }
    }

    console.log('[TextSearch] FTS index rebuild complete:', { rebuilt, errors });
    return { rebuilt, errors };
  }

  getStats(): { ftsRecordCount: number; totalChunks: number } {
    const ftsCount = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_fts').get() as any).count;
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM chunks_vec').get() as any).count;
    return { ftsRecordCount: ftsCount, totalChunks: total };
  }
}
