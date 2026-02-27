// web-ui/src/components/AuthSettingsSection.tsx
// 鉴权设置：修改用户名和密码

import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { authFetch, setAuthToken } from '../utils/auth';

export function AuthSettingsSection() {
  const [authEnabled, setAuthEnabled] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('');
  const [loading, setLoading] = useState(true);

  const [formUsername, setFormUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  async function fetchAuthStatus() {
    try {
      const res = await authFetch('/api/auth/check');
      const data = await res.json();
      setAuthEnabled(data.authEnabled);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }

    try {
      const res = await authFetch('/api/config');
      const data = await res.json();
      const username = data.server?.auth?.username || 'admin';
      setCurrentUsername(username);
      setFormUsername(username);
    } catch {
      // ignore
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的新密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('新密码长度不能少于 6 位');
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch('/api/config/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formUsername.trim() || currentUsername,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // 更新本地存储的 token，避免重新登录
        if (data.token) {
          setAuthToken(data.token);
        }
        setSuccessMsg('凭据已更新');
        setCurrentUsername(formUsername.trim() || currentUsername);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setErrorMsg(data.message || '更新失败，请重试');
      }
    } catch {
      setErrorMsg('网络错误，请检查连接');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">加载中...</p>
      </div>
    );
  }

  if (!authEnabled) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md">
          <div className="flex items-center gap-3 mb-4">
            <Lock className="w-5 h-5 text-gray-400" />
            <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">访问鉴权</h3>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              当前鉴权未启用。如需开启访问保护，请在 <code className="font-mono text-xs bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">config.json</code> 中配置：
            </p>
            <pre className="mt-2 text-xs font-mono bg-yellow-100 dark:bg-yellow-900/40 rounded p-2 text-yellow-900 dark:text-yellow-200 overflow-x-auto">{`"server": {
  "auth": {
    "enabled": true,
    "username": "admin",
    "password": "your-password"
  }
}`}</pre>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Lock className="w-5 h-5 text-primary-500" />
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">修改登录凭据</h3>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          当前用户名：<span className="font-medium text-gray-700 dark:text-gray-300">{currentUsername}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 新用户名（可选） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              新用户名 <span className="text-gray-400 font-normal">（留空保持不变）</span>
            </label>
            <input
              type="text"
              value={formUsername}
              onChange={e => setFormUsername(e.target.value)}
              placeholder={currentUsername}
              autoComplete="username"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
            />
          </div>

          {/* 当前密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              当前密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="请输入当前密码"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 新密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              新密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 6 位"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 确认新密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              确认新密码 <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="再次输入新密码"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
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

          <button
            type="submit"
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium rounded-lg transition-colors text-sm"
          >
            {submitting ? '更新中...' : '更新凭据'}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-400 dark:text-gray-500">
          密码将以 SHA-256 哈希值存储在 config.json 中，更新后旧会话 token 自动失效。
        </p>
      </div>
    </div>
  );
}
