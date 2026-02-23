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
}

export class DefaultEmbeddingsService implements EmbeddingsService {
  private dimension: number;
  private client: ReturnType<typeof getLLMClient>;

  constructor() {
    const config = getConfig();
    this.dimension = config.memory?.vectorDimension || 1536;
    this.client = getLLMClient();
  }

  async embed(text: string): Promise<Embedding> {
    // TODO: Use actual embedding model
    // For now, return placeholder
    const vector = Array(this.dimension).fill(0).map(() => Math.random());
    return { vector, dimension: this.dimension };
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    // TODO: Batch embedding
    return Promise.all(texts.map(text => this.embed(text)));
  }
}

let instance: DefaultEmbeddingsService | null = null;

export function getEmbeddingsService(): EmbeddingsService {
  if (!instance) {
    instance = new DefaultEmbeddingsService();
  }
  return instance;
}
