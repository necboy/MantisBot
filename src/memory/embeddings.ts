// src/memory/embeddings.ts

import { getConfig } from '../config/loader.js';
import { getLLMClient } from '../agents/llm-client.js';

export interface Embedding {
  vector: number[];
  dimension: number;
}

export interface EmbeddingsService {
  embed(text: string): Promise<Embedding>;
  embedBatch(texts: string[]): Promise<Embedding[]>;
  /** 是否有真实的 embedding 模型可用（false = 占位符，跳过向量搜索） */
  isAvailable(): boolean;
}

export class DefaultEmbeddingsService implements EmbeddingsService {
  private dimension: number;
  private embeddingModelName: string | null;

  constructor() {
    const config = getConfig();
    this.dimension = config.memory?.vectorDimension || 1536;
    this.embeddingModelName = config.memory?.embeddingModel || null;
  }

  /**
   * 当 config.memory.embeddingModel 有配置时，才认为 embedding 可用。
   * 否则降级为纯全文搜索（跳过向量部分）。
   */
  isAvailable(): boolean {
    return !!this.embeddingModelName;
  }

  async embed(text: string): Promise<Embedding> {
    if (!this.embeddingModelName) {
      // 无真实模型，返回占位符（isAvailable() 已 false，正常不会走到向量搜索）
      const vector = Array(this.dimension).fill(0).map(() => Math.random());
      return { vector, dimension: this.dimension };
    }

    return this.embedWithModel(text, this.embeddingModelName);
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    if (!this.embeddingModelName) {
      return Promise.all(texts.map(text => this.embed(text)));
    }

    // 批量调用：OpenAI embeddings API 支持一次传入多条文本
    try {
      const config = getConfig();
      const modelConfig = config.models.find(m => m.name === this.embeddingModelName);
      const apiModel = modelConfig?.model || this.embeddingModelName;

      const client = getLLMClient().getOpenAIClient(this.embeddingModelName!);
      if (!client) {
        console.warn('[Embeddings] OpenAI client not found for:', this.embeddingModelName);
        return Promise.all(texts.map(t => this.embed(t)));
      }

      const response = await client.embeddings.create({
        model: apiModel!,
        input: texts,
      });

      return response.data.map(item => ({
        vector: item.embedding,
        dimension: item.embedding.length,
      }));
    } catch (error) {
      console.error('[Embeddings] Batch embed failed, falling back to sequential:', error);
      return Promise.all(texts.map(t => this.embed(t)));
    }
  }

  private async embedWithModel(text: string, modelName: string): Promise<Embedding> {
    const config = getConfig();
    const modelConfig = config.models.find(m => m.name === modelName);
    const apiModel = modelConfig?.model || modelName;

    const client = getLLMClient().getOpenAIClient(modelName);
    if (!client) {
      console.warn('[Embeddings] OpenAI client not found for:', modelName, '— using placeholder');
      const vector = Array(this.dimension).fill(0).map(() => Math.random());
      return { vector, dimension: this.dimension };
    }

    try {
      const response = await client.embeddings.create({
        model: apiModel,
        input: text,
      });

      const vector = response.data[0].embedding;
      return { vector, dimension: vector.length };
    } catch (error: any) {
      console.error('[Embeddings] embed() failed:', error?.message || error);
      throw error;
    }
  }
}

let instance: DefaultEmbeddingsService | null = null;

export function getEmbeddingsService(): EmbeddingsService {
  if (!instance) {
    instance = new DefaultEmbeddingsService();
  }
  return instance;
}

/**
 * 配置变更后重置单例（热加载时调用）
 */
export function resetEmbeddingsService(): void {
  instance = null;
}
