import { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, AlertCircle, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../utils/auth';
import { cachedFetch, invalidateCache } from '../utils/configCache';

export function AllowedPathsSection() {
  const { t } = useTranslation();
  const [allowedPaths, setAllowedPaths] = useState<string[]>([]);
  const [newPath, setNewPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAllowedPaths();
  }, []);

  async function fetchAllowedPaths() {
    setLoading(true);
    try {
      const data = await cachedFetch('/api/config/allowed-paths', async () => {
        const res = await authFetch('/api/config/allowed-paths');
        if (!res.ok) throw new Error('Failed');
        return res.json();
      }) as { allowedPaths: string[] };
      setAllowedPaths(data.allowedPaths || []);
    } catch (err) {
      console.error('Failed to fetch allowed paths:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveAllowedPaths(paths: string[]) {
    setSaving(true);
    try {
      const res = await authFetch('/api/config/allowed-paths', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedPaths: paths })
      });
      if (res.ok) {
        const data = await res.json();
        invalidateCache('/api/config/allowed-paths');
        setAllowedPaths(data.allowedPaths || []);
        return true;
      }
    } catch (err) {
      console.error('Failed to save allowed paths:', err);
    } finally {
      setSaving(false);
    }
    return false;
  }

  async function addPath() {
    if (!newPath.trim()) return;

    const path = newPath.trim();
    if (!path.startsWith('/')) {
      alert(t('allowedPaths.invalidPath'));
      return;
    }

    if (allowedPaths.includes(path)) {
      alert(t('allowedPaths.pathExists'));
      return;
    }

    const newPaths = [...allowedPaths, path];
    const success = await saveAllowedPaths(newPaths);
    if (success) {
      setNewPath('');
    }
  }

  async function removePath(path: string) {
    const newPaths = allowedPaths.filter(p => p !== path);
    await saveAllowedPaths(newPaths);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">{t('allowedPaths.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 介绍 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">{t('allowedPaths.title')}</p>
            <p>{t('allowedPaths.description')}</p>
            <p className="mt-2 text-blue-600 dark:text-blue-400">
              <strong>{t('allowedPaths.dockerNote').split('：')[0]}：</strong>{t('allowedPaths.dockerNote').split('：')[1]}
            </p>
          </div>
        </div>
      </div>

      {/* 添加新路径 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPath()}
          placeholder={t('allowedPaths.placeholder')}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          onClick={addPath}
          disabled={saving || !newPath.trim()}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('allowedPaths.add')}
        </button>
      </div>

      {/* 路径列表 */}
      <div className="space-y-2">
        {allowedPaths.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{t('allowedPaths.noData')}</p>
            <p className="text-sm mt-1">{t('allowedPaths.noDataHint')}</p>
          </div>
        ) : (
          allowedPaths.map((path) => (
            <div
              key={path}
              className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3">
                <FolderOpen className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
                <span className="font-mono text-sm text-gray-900 dark:text-gray-100">
                  {path}
                </span>
              </div>
              <button
                onClick={() => removePath(path)}
                disabled={saving}
                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Docker 挂载提示 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-800 dark:text-yellow-300">
            <p className="font-medium mb-2">{t('allowedPaths.dockerExample')}</p>
            <p className="mb-2">{t('allowedPaths.dockerInstruction')}</p>
            <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded text-xs overflow-x-auto">
{`volumes:
  - /home/user/documents:/app/host_docs:ro`}
            </pre>
            <p className="mt-2 text-yellow-700 dark:text-yellow-400">
              {t('allowedPaths.dockerRestart')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
