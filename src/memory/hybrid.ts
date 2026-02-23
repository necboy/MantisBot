// src/memory/hybrid.ts
// 混合搜索：向量 + FTS 融合算法
// 参考: OpenClaw src/memory/hybrid.ts

import type { MemoryChunk } from './manager.js';

export interface HybridSearchOptions {
  vectorWeight?: number;    // 默认 0.7
  keywordWeight?: number;   // 默认 0.3
}

/**
 * 合并向量搜索和关键词搜索的结果
 * 使用加权平均算法（类似 RRF - Reciprocal Rank Fusion）
 *
 * @param vectorResults - 向量搜索结果
 * @param keywordResults - 关键词搜索结果
 * @param options - 权重配置
 * @returns 合并后的结果
 */
export function mergeHybridResults(
  vectorResults: MemoryChunk[],
  keywordResults: MemoryChunk[],
  options: HybridSearchOptions = {}
): MemoryChunk[] {
  const { vectorWeight = 0.7, keywordWeight = 0.3 } = options;

  // 使用 Map 按 ID 合并结果
  const byId = new Map<string | number, MemoryChunk>();

  // 添加向量搜索结果
  for (const r of vectorResults) {
    const key = r.id ?? `${r.agentId}:${r.content}`;
    byId.set(key, {
      ...r,
      score: (r.score || 0) * vectorWeight
    });
  }

  // 合并关键词搜索结果
  for (const r of keywordResults) {
    const key = r.id ?? `${r.agentId}:${r.content}`;
    const existing = byId.get(key);

    if (existing) {
      // 如果已存在，累加分数
      existing.score! += (r.score || 0) * keywordWeight;
    } else {
      // 如果不存在，添加新结果
      byId.set(key, {
        ...r,
        score: (r.score || 0) * keywordWeight
      });
    }
  }

  // 按合并后的分数排序
  return Array.from(byId.values())
    .sort((a, b) => (b.score || 0) - (a.score || 0));
}

/**
 * 构建 FTS5 查询字符串
 *
 * @param raw - 原始查询字符串
 * @returns FTS5 查询字符串，如果无法构建则返回 null
 */
export function buildFtsQuery(raw: string): string | null {
  // 提取有效的 token（支持中英文）
  const tokens = raw
    .match(/[A-Za-z0-9_\u4e00-\u9fa5]+/g)
    ?.map(t => t.trim())
    .filter(Boolean) ?? [];

  if (tokens.length === 0) {
    return null;
  }

  // FTS5 查询格式：使用 AND 连接
  const quoted = tokens.map(t => `"${t.replace(/"/g, '')}"`);
  return quoted.join(' AND ');
}
