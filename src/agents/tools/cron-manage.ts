import type { Tool } from '../../types.js';
import type { CronService } from '../../cron/service.js';

export function createCronManageTool(cronService: CronService): Tool {
  return {
    name: 'cron_manage',
    description: '管理定时任务（创建、更新、删除、查询、运行）',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'update', 'remove', 'run'],
          description: '操作类型: list=列出任务, add=创建任务, update=更新任务, remove=删除任务, run=立即运行'
        },
        job: {
          type: 'object',
          description: '任务配置（用于 add 操作）',
          properties: {
            name: { type: 'string', description: '任务名称' },
            description: { type: 'string', description: '任务描述' },
            enabled: { type: 'boolean', description: '是否启用', default: true },
            schedule: {
              type: 'object',
              description: '调度配置',
              properties: {
                kind: { type: 'string', enum: ['at', 'every', 'cron'] },
                at: { type: 'string', description: '执行时间（ISO 8601，用于 kind=at）' },
                everyMs: { type: 'number', description: '间隔毫秒（用于 kind=every）' },
                expr: { type: 'string', description: 'Cron 表达式（用于 kind=cron）' },
                tz: { type: 'string', description: '时区（用于 kind=cron）' }
              }
            },
            payload: {
              type: 'object',
              description: '任务内容',
              properties: {
                kind: { type: 'string', enum: ['systemEvent', 'agentTurn'] },
                text: { type: 'string', description: '通知文本（用于 kind=systemEvent）' },
                message: { type: 'string', description: 'Agent 消息（用于 kind=agentTurn）' },
                model: { type: 'string', description: '模型名称（可选）' }
              }
            },
            delivery: {
              type: 'object',
              description: '投递配置',
              properties: {
                mode: { type: 'string', enum: ['none', 'announce'] },
                channel: { type: 'string', description: '渠道 ID 或 "last"' },
                to: { type: 'string', description: '接收者' }
              }
            }
          }
        },
        jobId: {
          type: 'string',
          description: '任务 ID（用于 update/remove/run 操作）'
        },
        patch: {
          type: 'object',
          description: '更新内容（用于 update 操作）',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            enabled: { type: 'boolean' }
          }
        }
      },
      required: ['action']
    },
    execute: async (params: Record<string, unknown>) => {
      const { action } = params;

      try {
        switch (action) {
          case 'list': {
            const jobs = await cronService.list({ includeDisabled: true });
            return {
              success: true,
              jobs: jobs.map((job: any) => ({
                id: job.id,
                name: job.name,
                description: job.description,
                enabled: job.enabled,
                schedule: job.schedule,
                nextRunAt: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : null,
                lastStatus: job.state?.lastStatus,
                lastError: job.state?.lastError
              }))
            };
          }

          case 'add': {
            const jobInput = params.job as any;

            let schedule: any;
            if (jobInput.schedule.kind === 'at') {
              schedule = { kind: 'at', at: jobInput.schedule.at };
            } else if (jobInput.schedule.kind === 'every') {
              schedule = { kind: 'every', everyMs: jobInput.schedule.everyMs };
            } else {
              schedule = {
                kind: 'cron',
                expr: jobInput.schedule.expr,
                tz: jobInput.schedule.tz
              };
            }

            let payload: any;
            if (jobInput.payload.kind === 'systemEvent') {
              payload = { kind: 'systemEvent', text: jobInput.payload.text };
            } else {
              payload = {
                kind: 'agentTurn',
                message: jobInput.payload.message,
                model: jobInput.payload.model
              };
            }

            const job: any = {
              name: jobInput.name,
              description: jobInput.description,
              enabled: jobInput.enabled ?? true,
              schedule,
              sessionTarget: 'isolated',
              wakeMode: 'now',
              payload,
              delivery: jobInput.delivery ? {
                mode: jobInput.delivery.mode || 'announce',
                channel: jobInput.delivery.channel,
                to: jobInput.delivery.to
              } : undefined
            };

            const id = await cronService.add(job);
            return {
              success: true,
              id,
              message: `定时任务已创建，ID: ${id}`
            };
          }

          case 'update': {
            const { jobId, patch } = params as { jobId: string; patch: any };
            await cronService.update(jobId, patch);
            return { success: true, message: '任务已更新' };
          }

          case 'remove': {
            const { jobId } = params as { jobId: string };
            await cronService.remove(jobId);
            return { success: true, message: '任务已删除' };
          }

          case 'run': {
            const { jobId } = params as { jobId: string };
            await cronService.run(jobId, 'force');
            return { success: true, message: '任务已触发执行' };
          }

          default:
            return { success: false, error: `未知操作: ${action}` };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}
