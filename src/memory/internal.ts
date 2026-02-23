// src/memory/internal.ts
// 工具函数：余弦相似度计算、Embedding 解析等
// 移植自 OpenClaw: src/memory/internal.ts

/**
 * 计算两个向量的余弦相似度
 *
 * @param a - 向量 a
 * @param b - 向量 b
 * @returns 余弦相似度（0.0 - 1.0）
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 解析 embedding 数据（从 Buffer 或 JSON 字符串）
 *
 * @param raw - 原始数据（Buffer 或字符串）
 * @returns 向量数组
 */
export function parseEmbedding(raw: unknown): number[] {
  if (!raw) {
    return [];
  }

  // 如果是 Buffer，从 Float32Array 解析
  if (Buffer.isBuffer(raw)) {
    const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
    return Array.from(float32);
  }

  // 如果是字符串，尝试 JSON 解析
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(v => typeof v === 'number')) {
        return parsed;
      }
    } catch {
      // 解析失败，返回空数组
    }
  }

  // 如果已经是数组，直接返回
  if (Array.isArray(raw) && raw.every(v => typeof v === 'number')) {
    return raw;
  }

  return [];
}

/**
 * 将向量数组转换为 Buffer（用于数据库存储）
 *
 * @param embedding - 向量数组
 * @returns Buffer
 */
export function vectorToBlob(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer);
}
