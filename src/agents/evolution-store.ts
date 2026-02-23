// src/agents/evolution-store.ts

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { EvolutionProposal, ProfileFile } from './evolution-proposer.js';
import { ProfileLoader } from './profile-loader.js';
import type { AgentProfile } from '../config/profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data');

/**
 * 演变存储模块
 *
 * 负责持久化演变提议，包括：
 * - 提议的增删改查
 * - 批准提议后写入 profile 文件
 */
export class EvolutionStore {
  private proposals: EvolutionProposal[] = [];
  private profileLoader: ProfileLoader;
  private dataDir: string;
  private evolutionFile: string;

  constructor(profileLoader?: ProfileLoader, workspace?: string) {
    this.profileLoader = profileLoader || new ProfileLoader();
    this.dataDir = workspace || DEFAULT_DATA_DIR;
    this.evolutionFile = path.join(this.dataDir, 'evolution-proposals.json');
  }

  /**
   * 从 JSON 文件加载提议
   */
  async load(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      const data = await fs.readFile(this.evolutionFile, 'utf-8');
      this.proposals = JSON.parse(data);
      console.log(`[EvolutionStore] Loaded ${this.proposals.length} proposals`);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        // 文件不存在，初始化为空数组
        this.proposals = [];
        console.log('[EvolutionStore] No existing proposals file, starting fresh');
      } else if (err instanceof SyntaxError) {
        // JSON 解析错误，记录严重错误
        console.error('[EvolutionStore] Corrupted proposals file (JSON parse error), starting fresh:', err.message);
        this.proposals = [];
      } else {
        // 其他 IO 错误或其他错误
        console.error('[EvolutionStore] Error loading proposals:', err);
        throw err;
      }
    }
  }

  /**
   * 保存到 JSON 文件
   */
  async save(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(this.evolutionFile, JSON.stringify(this.proposals, null, 2), 'utf-8');
      console.log(`[EvolutionStore] Saved ${this.proposals.length} proposals`);
    } catch (err) {
      console.error('[EvolutionStore] Error saving proposals:', err);
      throw err;
    }
  }

  /**
   * 获取所有提议（按时间倒序）
   */
  async getProposals(): Promise<EvolutionProposal[]> {
    return [...this.proposals].sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * 获取单个提议
   */
  async getProposal(id: string): Promise<EvolutionProposal | null> {
    return this.proposals.find(p => p.id === id) || null;
  }

  /**
   * 添加新提议
   */
  async addProposal(proposal: EvolutionProposal): Promise<void> {
    this.proposals.push(proposal);
    await this.save();
    console.log(`[EvolutionStore] Added proposal: ${proposal.id}`);
  }

  /**
   * 更新提议状态
   */
  async updateProposal(id: string, updates: Partial<EvolutionProposal>): Promise<void> {
    const index = this.proposals.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Proposal not found: ${id}`);
    }

    this.proposals[index] = { ...this.proposals[index], ...updates };
    await this.save();
    console.log(`[EvolutionStore] Updated proposal: ${id}`);
  }

  /**
   * 删除提议
   */
  async deleteProposal(id: string): Promise<void> {
    const index = this.proposals.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Proposal not found: ${id}`);
    }

    this.proposals.splice(index, 1);
    await this.save();
    console.log(`[EvolutionStore] Deleted proposal: ${id}`);
  }

  /**
   * 批准提议并写入 profile 文件
   * @param id 提议 ID
   * @returns 是否成功
   */
  async approveProposal(id: string): Promise<boolean> {
    const proposal = await this.getProposal(id);
    if (!proposal) {
      console.error(`[EvolutionStore] Proposal not found: ${id}`);
      return false;
    }

    if (proposal.status !== 'pending') {
      console.error(`[EvolutionStore] Proposal already processed: ${id}, status: ${proposal.status}`);
      return false;
    }

    try {
      // 获取当前的 profile
      const profile = await this.profileLoader.getProfile(proposal.profileName);
      if (!profile) {
        console.error(`[EvolutionStore] Profile not found: ${proposal.profileName}`);
        return false;
      }

      // 根据文件类型更新对应的内容
      // 注意：profile 对象的 soul/identity/user 字段可能是 undefined（如果对应的文件不存在）
      // 我们需要确保只有目标文件被更新，其他文件保持原值（如果存在）或设为空字符串
      const fileKey = this.getFileKey(proposal.file);
      const updatedProfile: AgentProfile = {
        name: profile.name,
        description: profile.description,
        createdAt: profile.createdAt,
        updatedAt: Date.now(),
        soul: fileKey === 'soul' ? proposal.proposedContent : (profile.soul ?? ''),
        identity: fileKey === 'identity' ? proposal.proposedContent : (profile.identity ?? ''),
        user: fileKey === 'user' ? proposal.proposedContent : (profile.user ?? ''),
      };

      // 保存更新后的 profile
      await this.profileLoader.saveProfile(updatedProfile);

      // 更新提议状态
      await this.updateProposal(id, { status: 'approved' });

      console.log(`[EvolutionStore] Approved proposal: ${id}, written to ${proposal.file}`);
      return true;
    } catch (err) {
      console.error('[EvolutionStore] Error approving proposal:', err);
      return false;
    }
  }

  /**
   * 将 ProfileFile 转换为 Profile 的键名
   */
  private getFileKey(file: ProfileFile): 'soul' | 'identity' | 'user' {
    switch (file) {
      case 'SOUL.md':
        return 'soul';
      case 'IDENTITY.md':
        return 'identity';
      case 'USER.md':
        return 'user';
      default:
        return 'identity';
    }
  }
}

// 单例实例（延迟初始化）
let evolutionStoreInstance: EvolutionStore | null = null;

export function getEvolutionStore(workspace?: string): EvolutionStore {
  if (!evolutionStoreInstance) {
    evolutionStoreInstance = new EvolutionStore(undefined, workspace);
  }
  return evolutionStoreInstance;
}

// 兼容旧代码的默认导出
export const evolutionStore = new EvolutionStore();
