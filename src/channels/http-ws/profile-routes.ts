// src/channels/http-ws/profile-routes.ts

import { Router } from 'express';
import { ProfileLoader } from '../../agents/profile-loader.js';

const router = Router();
const profileLoader = new ProfileLoader();

// 获取所有配置
router.get('/profiles', async (req, res) => {
  try {
    const profiles = await profileLoader.listProfiles();
    const activeName = await profileLoader.getActiveProfileName();
    res.json({ profiles, activeProfile: activeName });
  } catch (err) {
    console.error('[Profile API] Error listing profiles:', err);
    res.status(500).json({ error: 'Failed to list profiles' });
  }
});

// 获取单个配置
router.get('/profiles/:name', async (req, res) => {
  try {
    const profile = await profileLoader.getProfile(req.params.name);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (err) {
    console.error('[Profile API] Error getting profile:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// 创建新配置
router.post('/profiles', async (req, res) => {
  try {
    const { name, template = 'default' } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    await profileLoader.createProfile(name, template);
    const profile = await profileLoader.getProfile(name);
    res.json(profile);
  } catch (err) {
    console.error('[Profile API] Error creating profile:', err);
    res.status(500).json({ error: (err as Error).message || 'Failed to create profile' });
  }
});

// 更新配置
router.put('/profiles/:name', async (req, res) => {
  try {
    const { soul, identity, user, description } = req.body;
    const existing = await profileLoader.getProfile(req.params.name);

    if (!existing) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    await profileLoader.saveProfile({
      name: req.params.name,
      description,
      soul: soul !== undefined ? soul : existing.soul,
      identity: identity !== undefined ? identity : existing.identity,
      user: user !== undefined ? user : existing.user,
    });

    const profile = await profileLoader.getProfile(req.params.name);
    res.json(profile);
  } catch (err) {
    console.error('[Profile API] Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// 删除配置
router.delete('/profiles/:name', async (req, res) => {
  try {
    await profileLoader.deleteProfile(req.params.name);
    res.json({ success: true });
  } catch (err) {
    console.error('[Profile API] Error deleting profile:', err);
    res.status(400).json({ error: (err as Error).message });
  }
});

// 设置激活的配置
router.put('/profiles/active', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    await profileLoader.setActiveProfileName(name);
    res.json({ activeProfile: name });
  } catch (err) {
    console.error('[Profile API] Error setting active profile:', err);
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
