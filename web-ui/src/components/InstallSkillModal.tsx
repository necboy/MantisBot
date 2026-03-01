import { useState, useRef, useEffect } from 'react';
import { X, Github, Loader2, CheckCircle, AlertCircle, Upload } from 'lucide-react';
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

type InstallTab = 'github' | 'file';

export function InstallSkillModal({ isOpen, onClose, onInstalled }: InstallSkillModalProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<ModalState>({ kind: 'input' });
  const [tab, setTab] = useState<InstallTab>('github');
  const [source, setSource] = useState('');
  const [enabling, setEnabling] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setState({ kind: 'input' });
      setSource('');
      setEnabling(false);
      setDragOver(false);
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

  async function handleFileUpload(file: File) {
    if (!file.name.endsWith('.skill')) {
      setState({ kind: 'error', message: '只支持 .skill 格式的文件' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authFetch('/api/skills/upload', {
        method: 'POST',
        body: formData,
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

  function handleTabChange(newTab: InstallTab) {
    setTab(newTab);
    setState({ kind: 'input' });
    setSource('');
  }

  const isInputState = state.kind === 'input';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {t('skills.install.title')}
          </h3>
          <button
            onClick={onClose}
            disabled={state.kind === 'loading'}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Bar - only show in input state */}
        {isInputState && (
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => handleTabChange('github')}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'github'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Github className="w-4 h-4" />
              GitHub
            </button>
            <button
              onClick={() => handleTabChange('file')}
              className={`flex items-center gap-1.5 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === 'file'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Upload className="w-4 h-4" />
              从文件导入
            </button>
          </div>
        )}

        {/* Body */}
        <div className="px-6 py-5">
          {/* ── INPUT state ── */}
          {state.kind === 'input' && tab === 'github' && (
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

          {/* ── FILE UPLOAD tab ── */}
          {state.kind === 'input' && tab === 'file' && (
            <div className="space-y-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFileUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500'
                }`}
              >
                <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  拖拽 .skill 文件到此处
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  或点击选择文件
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".skill"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                只接受 <code className="font-mono">.skill</code> 格式文件（由 package_skill.py 打包生成）
              </p>
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
          {state.kind === 'input' && tab === 'github' && (
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

          {state.kind === 'input' && tab === 'file' && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              {t('skills.install.cancel')}
            </button>
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
