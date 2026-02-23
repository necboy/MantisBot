import { useState, useEffect } from 'react';
import { X, Play, Pause, Trash2, Plus, Clock, RefreshCw } from 'lucide-react';

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: {
    kind: 'at' | 'every' | 'cron';
    at?: string;
    everyMs?: number;
    expr?: string;
    tz?: string;
  };
  payload: {
    kind: 'systemEvent' | 'agentTurn';
    text?: string;
    message?: string;
  };
  delivery?: {
    mode: 'none' | 'announce';
    channel?: string;
    to?: string;
  };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped';
    lastError?: string;
  };
}

interface CronPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CronPanel({ isOpen, onClose }: CronPanelProps) {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scheduleKind: 'cron' as 'at' | 'every' | 'cron',
    scheduleAt: '',
    everyAmount: 1,
    everyUnit: 'hours' as 'minutes' | 'hours' | 'days',
    cronExpr: '0 9 * * *',
    cronTz: 'Asia/Shanghai',
    payloadKind: 'agentTurn' as 'systemEvent' | 'agentTurn',
    payloadText: '',
    enabled: true
  });

  useEffect(() => {
    if (isOpen) {
      loadJobs();
    }
  }, [isOpen]);

  async function loadJobs() {
    setLoading(true);
    try {
      const res = await fetch('/api/cron/list?includeDisabled=true');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleJob(job: CronJob) {
    try {
      await fetch('/api/cron/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: job.id,
          patch: { enabled: !job.enabled }
        })
      });
      await loadJobs();
    } catch (err) {
      console.error('Failed to toggle job:', err);
    }
  }

  async function runJob(job: CronJob) {
    try {
      await fetch('/api/cron/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id })
      });
      await loadJobs();
    } catch (err) {
      console.error('Failed to run job:', err);
    }
  }

  async function removeJob(job: CronJob) {
    if (!confirm(`确定删除任务 "${job.name}"？`)) return;

    try {
      await fetch('/api/cron/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id })
      });
      await loadJobs();
    } catch (err) {
      console.error('Failed to remove job:', err);
    }
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault();

    try {
      // 构建 schedule
      let schedule: any;
      if (formData.scheduleKind === 'at') {
        schedule = { kind: 'at', at: new Date(formData.scheduleAt).toISOString() };
      } else if (formData.scheduleKind === 'every') {
        const mult = formData.everyUnit === 'minutes' ? 60000 :
                     formData.everyUnit === 'hours' ? 3600000 : 86400000;
        schedule = { kind: 'every', everyMs: formData.everyAmount * mult };
      } else {
        schedule = { kind: 'cron', expr: formData.cronExpr, tz: formData.cronTz };
      }

      // 构建 payload
      const payload = formData.payloadKind === 'systemEvent'
        ? { kind: 'systemEvent', text: formData.payloadText }
        : { kind: 'agentTurn', message: formData.payloadText };

      await fetch('/api/cron/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          enabled: formData.enabled,
          schedule,
          sessionTarget: 'isolated',
          wakeMode: 'now',
          payload,
          delivery: {
            mode: 'announce',
            channel: 'last'
          }
        })
      });

      setShowForm(false);
      setFormData({
        name: '',
        description: '',
        scheduleKind: 'cron',
        scheduleAt: '',
        everyAmount: 1,
        everyUnit: 'hours',
        cronExpr: '0 9 * * *',
        cronTz: 'Asia/Shanghai',
        payloadKind: 'agentTurn',
        payloadText: '',
        enabled: true
      });
      await loadJobs();
    } catch (err) {
      console.error('Failed to create job:', err);
    }
  }

  function formatNextRun(ms?: number) {
    if (!ms) return '-';
    return new Date(ms).toLocaleString('zh-CN');
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold">定时任务管理</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={loadJobs}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center text-gray-500">加载中...</div>
          ) : (
            <div className="space-y-4">
              {/* Job List */}
              {jobs.map(job => (
                <div
                  key={job.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{job.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          job.enabled
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {job.enabled ? '已启用' : '已禁用'}
                        </span>
                        {job.state.lastStatus && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            job.state.lastStatus === 'ok'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                          }`}>
                            {job.state.lastStatus}
                          </span>
                        )}
                      </div>
                      {job.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {job.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          <span>下次运行: {formatNextRun(job.state.nextRunAtMs)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runJob(job)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        title="立即运行"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleJob(job)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                        title={job.enabled ? '禁用' : '启用'}
                      >
                        {job.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => removeJob(job)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-red-500"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Create Button */}
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center gap-2 hover:border-primary-500 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  创建新任务
                </button>
              )}

              {/* Create Form */}
              {showForm && (
                <form onSubmit={createJob} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                  <h3 className="font-medium">创建定时任务</h3>

                  <div>
                    <label className="block text-sm font-medium mb-1">任务名称</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">描述</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">调度方式</label>
                    <select
                      value={formData.scheduleKind}
                      onChange={e => setFormData({ ...formData, scheduleKind: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="cron">Cron 表达式</option>
                      <option value="every">间隔执行</option>
                      <option value="at">指定时间</option>
                    </select>
                  </div>

                  {formData.scheduleKind === 'cron' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1">Cron 表达式</label>
                        <input
                          type="text"
                          value={formData.cronExpr}
                          onChange={e => setFormData({ ...formData, cronExpr: e.target.value })}
                          placeholder="0 9 * * *"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">时区</label>
                        <input
                          type="text"
                          value={formData.cronTz}
                          onChange={e => setFormData({ ...formData, cronTz: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                        />
                      </div>
                    </>
                  )}

                  {formData.scheduleKind === 'every' && (
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">间隔</label>
                        <input
                          type="number"
                          value={formData.everyAmount}
                          onChange={e => setFormData({ ...formData, everyAmount: parseInt(e.target.value) })}
                          min="1"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-1">单位</label>
                        <select
                          value={formData.everyUnit}
                          onChange={e => setFormData({ ...formData, everyUnit: e.target.value as any })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                        >
                          <option value="minutes">分钟</option>
                          <option value="hours">小时</option>
                          <option value="days">天</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {formData.scheduleKind === 'at' && (
                    <div>
                      <label className="block text-sm font-medium mb-1">执行时间</label>
                      <input
                        type="datetime-local"
                        value={formData.scheduleAt}
                        onChange={e => setFormData({ ...formData, scheduleAt: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1">任务类型</label>
                    <select
                      value={formData.payloadKind}
                      onChange={e => setFormData({ ...formData, payloadKind: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="agentTurn">Agent 消息</option>
                      <option value="systemEvent">用户通知</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      {formData.payloadKind === 'agentTurn' ? '消息内容' : '通知内容'}
                    </label>
                    <textarea
                      value={formData.payloadText}
                      onChange={e => setFormData({ ...formData, payloadText: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                      id="enabled"
                    />
                    <label htmlFor="enabled" className="text-sm">立即启用</label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      创建任务
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      取消
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
