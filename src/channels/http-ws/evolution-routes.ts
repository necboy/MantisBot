// src/channels/http-ws/evolution-routes.ts

import { Router } from 'express';
import { evolutionStore } from '../../agents/evolution-store.js';
import { profileLoader } from '../../agents/profile-loader.js';
import type { EvolutionProposal } from '../../agents/evolution-proposer.js';
import type { UserPreference } from '../../agents/preference-detector.js';

const router = Router();

// 初始化：加载存储的提议
evolutionStore.load().catch(err => {
  console.error('[Evolution API] Failed to load evolution store:', err);
});

// 获取所有演变提议
router.get('/', async (req, res) => {
  try {
    const proposals = await evolutionStore.getProposals();
    res.json({ proposals });
  } catch (err) {
    console.error('[Evolution API] Error getting proposals:', err);
    res.status(500).json({ error: 'Failed to get proposals' });
  }
});

// 获取单个提议详情
router.get('/:id', async (req, res) => {
  try {
    const proposal = await evolutionStore.getProposal(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(proposal);
  } catch (err) {
    console.error('[Evolution API] Error getting proposal:', err);
    res.status(500).json({ error: 'Failed to get proposal' });
  }
});

// 创建新提议（由 Agent 调用）
router.post('/', async (req, res) => {
  try {
    const proposalData: Omit<EvolutionProposal, 'id' | 'status' | 'createdAt'> = req.body;

    // 验证必填字段
    if (!proposalData.profileName || !proposalData.file || !proposalData.currentContent || !proposalData.proposedContent || !proposalData.reason || !Array.isArray(proposalData.preferences)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 验证 preferences 数组中每个元素的结构
    const isValidPreference = (pref: unknown): pref is UserPreference => {
      if (typeof pref !== 'object' || pref === null) return false;
      const p = pref as Record<string, unknown>;
      return (
        typeof p.key === 'string' &&
        typeof p.description === 'string' &&
        Array.isArray(p.evidence) &&
        typeof p.confidence === 'number'
      );
    };

    if (!proposalData.preferences.every(isValidPreference)) {
      return res.status(400).json({ error: 'Invalid preferences format' });
    }

    // 验证 profile 是否存在
    const profile = await profileLoader.getProfile(proposalData.profileName);
    if (!profile) {
      return res.status(400).json({ error: 'Profile not found' });
    }

    // 创建新提议
    const proposal: EvolutionProposal = {
      ...proposalData,
      id: crypto.randomUUID(),
      status: 'pending',
      createdAt: Date.now(),
    };

    await evolutionStore.addProposal(proposal);
    res.status(201).json(proposal);
  } catch (err) {
    console.error('[Evolution API] Error creating proposal:', err);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// 批准提议
router.put('/:id/approve', async (req, res) => {
  try {
    const success = await evolutionStore.approveProposal(req.params.id);
    if (!success) {
      return res.status(400).json({ error: 'Failed to approve proposal' });
    }

    const proposal = await evolutionStore.getProposal(req.params.id);
    res.json({ success: true, proposal });
  } catch (err) {
    console.error('[Evolution API] Error approving proposal:', err);
    res.status(500).json({ error: 'Failed to approve proposal' });
  }
});

// 拒绝提议
router.put('/:id/reject', async (req, res) => {
  try {
    await evolutionStore.updateProposal(req.params.id, { status: 'rejected' });
    const proposal = await evolutionStore.getProposal(req.params.id);
    res.json({ success: true, proposal });
  } catch (err) {
    console.error('[Evolution API] Error rejecting proposal:', err);
    res.status(500).json({ error: 'Failed to reject proposal' });
  }
});

// 删除提议
router.delete('/:id', async (req, res) => {
  try {
    await evolutionStore.deleteProposal(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[Evolution API] Error deleting proposal:', err);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

export default router;
