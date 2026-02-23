import { Router } from 'express';
import type { CronService } from '../../cron/service.js';

export function createCronRoutes(cronService: CronService) {
  const router = Router();

  // 列出所有任务
  router.get('/list', async (req, res) => {
    try {
      const { includeDisabled } = req.query;
      const jobs = await cronService.list({
        includeDisabled: includeDisabled === 'true'
      });
      res.json({ jobs });
    } catch (err) {
      console.error('[Cron API] List failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // 获取服务状态
  router.get('/status', async (req, res) => {
    try {
      const status = await cronService.status();
      res.json(status);
    } catch (err) {
      console.error('[Cron API] Status failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  // 创建任务
  router.post('/add', async (req, res) => {
    try {
      const id = await cronService.add(req.body);
      res.json({ success: true, id });
    } catch (err) {
      console.error('[Cron API] Add failed:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  // 更新任务
  router.post('/update', async (req, res) => {
    try {
      const { id, patch } = req.body;
      await cronService.update(id, patch);
      res.json({ success: true });
    } catch (err) {
      console.error('[Cron API] Update failed:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  // 删除任务
  router.post('/remove', async (req, res) => {
    try {
      const { id } = req.body;
      await cronService.remove(id);
      res.json({ success: true });
    } catch (err) {
      console.error('[Cron API] Remove failed:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  // 手动运行任务
  router.post('/run', async (req, res) => {
    try {
      const { id } = req.body;
      await cronService.run(id, 'force');
      res.json({ success: true });
    } catch (err) {
      console.error('[Cron API] Run failed:', err);
      res.status(400).json({ error: String(err) });
    }
  });

  // 获取执行日志
  router.get('/runs', async (req, res) => {
    try {
      const { id, limit = 50 } = req.query;
      // TODO: 实现执行日志查询
      res.json({ entries: [] });
    } catch (err) {
      console.error('[Cron API] Runs failed:', err);
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
