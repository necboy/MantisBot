// web-ui/src/components/FirecrawlSettingsSection.tsx
// Firecrawl 网页搜索 API Key 配置

import { useState, useEffect } from 'react';
import { Globe, Eye, EyeOff, CheckCircle, AlertCircle, Trash2, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../utils/auth';

export function FirecrawlSettingsSection() {
  const { t } = useTranslation();
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    try {
      const res = await authFetch('/api/config/firecrawl');
      const data = await res.json();
      setConfigured(data.configured);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!apiKey.trim()) {
      setErrorMsg(t('firecrawl.emptyKeyError'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/config/firecrawl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfigured(data.configured);
        setApiKey('');
        setSuccessMsg(t('firecrawl.saveSuccess'));
      } else {
        setErrorMsg(data.error || t('firecrawl.saveFailed'));
      }
    } catch {
      setErrorMsg(t('firecrawl.networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClear() {
    setErrorMsg('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const res = await authFetch('/api/config/firecrawl', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: '' }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfigured(data.configured);
        setSuccessMsg(t('firecrawl.clearSuccess'));
      } else {
        setErrorMsg(data.error || t('firecrawl.clearFailed'));
      }
    } catch {
      setErrorMsg(t('firecrawl.networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('firecrawl.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="flex divide-x divide-gray-200 dark:divide-gray-700 h-full">
        {/* 左侧：配置区 */}
        <div className="flex-1 p-6">
          <div className="max-w-md">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-primary-500" />
              <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">{t('firecrawl.title')}</h3>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('firecrawl.description')}
            </p>

            {/* 当前状态 */}
            <div className={`flex items-center gap-2 mb-6 px-3 py-2 rounded-lg text-sm ${
              configured
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${configured ? 'bg-green-500' : 'bg-gray-400'}`} />
              {configured ? t('firecrawl.statusConfigured') : t('firecrawl.statusNotConfigured')}
            </div>

            {/* 输入表单 */}
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {configured ? t('firecrawl.updateLabel') : t('firecrawl.inputLabel')}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder={configured ? t('firecrawl.updatePlaceholder') : t('firecrawl.inputPlaceholder')}
                    autoComplete="off"
                    className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {t('firecrawl.getKeyHint')}{' '}
                  <a
                    href="https://www.firecrawl.dev/app/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400 underline"
                  >
                    firecrawl.dev
                  </a>
                  {t('firecrawl.getKeyHintSuffix') && ' ' + t('firecrawl.getKeyHintSuffix')}
                </p>
              </div>

              {/* 反馈信息 */}
              {errorMsg && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {successMsg && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting || !apiKey.trim()}
                  className="flex-1 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium rounded-lg transition-colors text-sm"
                >
                  {submitting ? t('firecrawl.saving') : t('firecrawl.save')}
                </button>
                {configured && (
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={submitting}
                    className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('firecrawl.clear')}
                  </button>
                )}
              </div>
            </form>

            <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              {t('firecrawl.storageNote')}
            </p>
          </div>
        </div>

        {/* 右侧：使用指南 */}
        <div className="w-72 flex-shrink-0 p-6 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            {t('firecrawl.guide.title')}
          </h4>

          {/* 步骤 */}
          <ol className="space-y-3 mb-6">
            {(['step1', 'step2', 'step3', 'step4'] as const).map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs flex items-center justify-center font-medium">
                  {i + 1}
                </span>
                <span>{t(`firecrawl.guide.${step}`)}</span>
              </li>
            ))}
          </ol>

          {/* 快捷链接 */}
          <div className="space-y-2 mb-6">
            <a
              href="https://www.firecrawl.dev/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
            >
              {t('firecrawl.guide.registerLink')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://www.firecrawl.dev/app/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-700 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
            >
              {t('firecrawl.guide.dashboardLink')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* 免费额度说明 */}
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 mb-4">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              {t('firecrawl.guide.freeTierNote')}
            </p>
          </div>

          {/* 什么是 Firecrawl */}
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              {t('firecrawl.guide.whatIsFirecrawl')}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 leading-relaxed">
              {t('firecrawl.guide.whatIsFirecrawlDesc')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
