import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, Edit2, Mail, CheckCircle, XCircle, Wifi, ToggleLeft, ToggleRight } from 'lucide-react';
import { EmailFormModal, EMAIL_PROVIDERS } from './EmailFormModal';
import { authFetch } from '../utils/auth';
import { cachedFetch, invalidateCache } from '../utils/configCache';

interface EmailAccount {
  id: string;
  name: string;
  email: string;
  password: string;
  provider: string;
  imap: {
    host: string;
    port: number;
    tls: boolean;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
  };
  enabled: boolean;
  isDefault: boolean;
}

interface EmailConfig {
  enabled: boolean;
  accounts: EmailAccount[];
  defaultAccountId?: string;
}

interface TestResult {
  success: boolean;
  message: string;
  results?: {
    imap: { success: boolean; message: string; durationMs?: number };
    smtp: { success: boolean; message: string; durationMs?: number };
  };
}

// 获取提供商显示名称
function getProviderDisplayName(account: EmailAccount): string {
  if (account.provider) {
    const provider = EMAIL_PROVIDERS[account.provider];
    return provider?.name || account.provider;
  }
  return '自定义';
}

export function EmailConfigSection() {
  const [config, setConfig] = useState<EmailConfig>({ enabled: false, accounts: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<EmailAccount | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);

  // Fetch config on mount
  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
    try {
      setLoading(true);
      setError(null);
      const data = await cachedFetch('/api/email/config', async () => {
        const res = await authFetch('/api/email/config');
        if (!res.ok) throw new Error('Failed to fetch email config');
        return res.json();
      }) as { enabled: boolean; accounts: EmailAccount[]; defaultAccountId?: string };
      setConfig({
        enabled: data.enabled || false,
        accounts: data.accounts || [],
        defaultAccountId: data.defaultAccountId,
      });
    } catch (err) {
      console.error('Failed to fetch email config:', err);
      setError('加载邮件配置失败');
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount(accountId: string) {
    if (!confirm('确定要删除此邮箱账户吗？')) {
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch(`/api/email/accounts/${encodeURIComponent(accountId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete account');
      invalidateCache('/api/email/config');
      await fetchConfig();
      // 清除测试结果
      setTestResults(prev => {
        const newResults = { ...prev };
        delete newResults[accountId];
        return newResults;
      });
    } catch (err) {
      console.error('Failed to delete account:', err);
      setError('删除账户失败');
    } finally {
      setLoading(false);
    }
  }

  async function setDefaultAccount(accountId: string) {
    try {
      setLoading(true);
      const res = await authFetch(`/api/email/accounts/${encodeURIComponent(accountId)}/default`, {
        method: 'PUT'
      });
      if (!res.ok) throw new Error('Failed to set default account');
      invalidateCache('/api/email/config');
      await fetchConfig();
    } catch (err) {
      console.error('Failed to set default account:', err);
      setError('设置默认账户失败');
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(accountId: string, enabled: boolean) {
    try {
      setLoading(true);
      const res = await authFetch(`/api/email/accounts/${encodeURIComponent(accountId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed to toggle account');
      invalidateCache('/api/email/config');
      await fetchConfig();
    } catch (err) {
      console.error('Failed to toggle account:', err);
      setError('切换账户状态失败');
    } finally {
      setLoading(false);
    }
  }

  async function testAccount(account: EmailAccount) {
    try {
      setTestingAccountId(account.id);
      setTestResults(prev => ({ ...prev, [account.id]: { success: false, message: '测试中...' } }));

      const res = await authFetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password === '***' ? undefined : account.password,
          imap: account.imap,
          smtp: account.smtp,
        }),
      });

      const data = await res.json();
      setTestResults(prev => ({ ...prev, [account.id]: data }));
    } catch (err) {
      console.error('Failed to test account:', err);
      setTestResults(prev => ({
        ...prev,
        [account.id]: { success: false, message: '测试失败' }
      }));
    } finally {
      setTestingAccountId(null);
    }
  }

  function openAddModal() {
    setEditingAccount(null);
    setModalOpen(true);
  }

  function openEditModal(account: EmailAccount) {
    setEditingAccount(account);
    setModalOpen(true);
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          邮箱账户
        </h3>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加账户
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {loading && config.accounts.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500">
          加载中...
        </div>
      ) : config.accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500">
          <Mail className="w-12 h-12 mb-3 text-gray-400" />
          <p>暂无邮箱账户</p>
          <p className="text-sm mt-1">点击「添加账户」配置您的邮箱</p>
        </div>
      ) : (
        <div className="space-y-4">
          {config.accounts.map((account) => {
            const testResult = testResults[account.id];
            const isTesting = testingAccountId === account.id;

            return (
              <div
                key={account.id}
                className={`p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 transition-colors ${
                  account.isDefault ? 'border-primary-300 dark:border-primary-700' : 'border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {account.name}
                      </span>
                      {account.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                          默认
                        </span>
                      )}
                      {!account.enabled && (
                        <span className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                          已禁用
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {account.email}
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">
                        {getProviderDisplayName(account)}
                      </span>
                      <span>IMAP: {account.imap.host}:{account.imap.port}</span>
                      <span>|</span>
                      <span>SMTP: {account.smtp.host}:{account.smtp.port}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 启用/禁用开关 */}
                    <button
                      onClick={() => toggleEnabled(account.id, !account.enabled)}
                      className={`p-2 transition-colors ${
                        account.enabled
                          ? 'text-green-600 hover:text-gray-500 dark:text-green-400 dark:hover:text-gray-400'
                          : 'text-gray-400 hover:text-green-600 dark:text-gray-600 dark:hover:text-green-400'
                      }`}
                      title={account.enabled ? '点击禁用' : '点击启用'}
                    >
                      {account.enabled
                        ? <ToggleRight className="w-5 h-5" />
                        : <ToggleLeft className="w-5 h-5" />
                      }
                    </button>

                    {/* 测试按钮 */}
                    <button
                      onClick={() => testAccount(account)}
                      disabled={isTesting}
                      className={`p-2 transition-colors ${
                        testResult?.success
                          ? 'text-green-600 dark:text-green-400'
                          : testResult && !testResult.success
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
                      }`}
                      title={testResult?.message || '测试连接'}
                    >
                      {isTesting ? (
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                      ) : testResult?.success ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : testResult && !testResult.success ? (
                        <XCircle className="w-4 h-4" />
                      ) : (
                        <Wifi className="w-4 h-4" />
                      )}
                    </button>

                    {/* 设为默认 */}
                    {!account.isDefault && (
                      <button
                        onClick={() => setDefaultAccount(account.id)}
                        className="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
                        title="设为默认"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}

                    {/* 编辑 */}
                    <button
                      onClick={() => openEditModal(account)}
                      className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                      title="编辑账户"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* 删除 */}
                    <button
                      onClick={() => deleteAccount(account.id)}
                      className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                      title="删除账户"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 测试结果详情 */}
                {testResult?.results && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className={`flex items-center gap-2 ${testResult.results.imap.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {testResult.results.imap.success ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>IMAP: {testResult.results.imap.message}</span>
                        {testResult.results.imap.durationMs && (
                          <span className="text-xs text-gray-400">({testResult.results.imap.durationMs}ms)</span>
                        )}
                      </div>
                      <div className={`flex items-center gap-2 ${testResult.results.smtp.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {testResult.results.smtp.success ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span>SMTP: {testResult.results.smtp.message}</span>
                        {testResult.results.smtp.durationMs && (
                          <span className="text-xs text-gray-400">({testResult.results.smtp.durationMs}ms)</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Email Form Modal */}
      <EmailFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAccount(null);
        }}
        account={editingAccount || undefined}
        onSave={async (savedAccount) => {
          try {
            setLoading(true);

            const isEdit = !!editingAccount;
            const url = isEdit
              ? `/api/email/accounts/${encodeURIComponent(editingAccount.id)}`
              : '/api/email/accounts';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await authFetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(savedAccount),
            });

            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              throw new Error(errorData.error || `Failed to ${isEdit ? 'update' : 'create'} account`);
            }

            invalidateCache('/api/email/config');
            await fetchConfig();
            setModalOpen(false);
            setEditingAccount(null);
          } catch (err) {
            console.error('Failed to save account:', err);
            setError(err instanceof Error ? err.message : '保存账户失败');
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
