import { useState, useRef, useEffect } from 'react';
import { X, Github, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../utils/auth';

interface InstallSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a successful install + optional enable, so the list can refresh. */
  onInstalled: (skillNames: string[]) => void;
}

type ModalState =
  | { kind: 'input' }
  | { kind: 'loading' }
  | { kind: 'success'; installed: string[] }
  | { kind: 'error'; message: string };

export function InstallSkillModal({ isOpen, onClose, onInstalled }: InstallSkillModalProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ModalState>({ kind: 'input' });
  const [source, setSource] = useState('');
  const [enabling, setEnabling] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setState({ kind: 'input' });
      setSource('');
      setEnabling(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleInstall() {
    if (!source.trim()) return;
    setState({ kind: 'loading' });
    try {
      const res = await authFetch('/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.trim() }),
      });
      const data = await res.json();
      if (data.success && data.installed?.length > 0) {
        setState({ kind: 'success', installed: data.installed });
      } else {
        setState({ kind: 'error', message: data.error || t('skills.install.unknownError') });
      }
    } catch {
      setState({ kind: 'error', message: t('skills.install.networkError') });
    }
  }

  async function handleEnableNow(skillNames: string[]) {
    setEnabling(true);
    try {
      await Promise.all(
        skillNames.map(name =>
          authFetch(`/api/skills/${name}/toggle`, { method: 'POST' }).catch(() => {/* best effort */})
        )
      );
    } finally {
      setEnabling(false);
      onInstalled(skillNames);
      onClose();
    }
  }

  function handleLater(skillNames: string[]) {
    onInstalled(skillNames);
    onClose();
  }

  function handleRetry() {
    setState({ kind: 'input' });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {t('skills.install.title')}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={state.kind === 'loading'}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* ── INPUT state ── */}
          {state.kind === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('skills.install.sourceLabel')}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInstall()}
                  placeholder={t('skills.install.sourcePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                <div className="font-medium text-gray-600 dark:text-gray-300 mb-1">{t('skills.install.supportedFormats')}</div>
                <div><code className="font-mono">owner/repo</code></div>
                <div><code className="font-mono">https://github.com/owner/repo</code></div>
                <div><code className="font-mono">https://github.com/owner/repo/tree/main/skill</code></div>
              </div>
            </div>
          )}

          {/* ── LOADING state ── */}
          {state.kind === 'loading' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('skills.install.installing')}</p>
            </div>
          )}

          {/* ── SUCCESS state ── */}
          {state.kind === 'success' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{t('skills.install.success')}</span>
              </div>
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-3 py-2">
                <p className="text-xs text-green-700 dark:text-green-300 font-medium mb-1">
                  {t('skills.install.installedLabel')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {state.installed.map(name => (
                    <span
                      key={name}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('skills.install.enablePrompt')}
              </p>
            </div>
          )}

          {/* ── ERROR state ── */}
          {state.kind === 'error' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="font-medium text-sm">{t('skills.install.failed')}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 break-words">
                {state.message}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-end gap-2">
          {state.kind === 'input' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                {t('skills.install.cancel')}
              </button>
              <button
                onClick={handleInstall}
                disabled={!source.trim()}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('skills.install.install')}
              </button>
            </>
          )}

          {state.kind === 'success' && (
            <>
              <button
                onClick={() => handleLater(state.installed)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                {t('skills.install.later')}
              </button>
              <button
                onClick={() => handleEnableNow(state.installed)}
                disabled={enabling}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {enabling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('skills.install.enableNow')}
              </button>
            </>
          )}

          {state.kind === 'error' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
              >
                {t('skills.install.close')}
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                {t('skills.install.retry')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
