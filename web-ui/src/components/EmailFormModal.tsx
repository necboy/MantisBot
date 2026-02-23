import { useState, useEffect } from 'react';
import { X, Wifi, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';

// 邮件提供商预设（与后端 schema 保持一致）
export const EMAIL_PROVIDERS: Record<string, {
  name: string;
  imap: { host: string; port: number; tls: boolean };
  smtp: { host: string; port: number; secure: boolean };
  hint?: string;
}> = {
  gmail: {
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, tls: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    hint: '需要在 Google 账户中启用"两步验证"并生成"应用专用密码"',
  },
  outlook: {
    name: 'Outlook',
    imap: { host: 'outlook.office365.com', port: 993, tls: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
  },
  '163': {
    name: '163.com',
    imap: { host: 'imap.163.com', port: 993, tls: true },
    smtp: { host: 'smtp.163.com', port: 465, secure: true },
    hint: '需要在网页端开启 IMAP/SMTP 服务，使用授权码而非登录密码',
  },
  '126': {
    name: '126.com',
    imap: { host: 'imap.126.com', port: 993, tls: true },
    smtp: { host: 'smtp.126.com', port: 465, secure: true },
    hint: '需要在网页端开启 IMAP/SMTP 服务，使用授权码而非登录密码',
  },
  qq: {
    name: 'QQ Mail',
    imap: { host: 'imap.qq.com', port: 993, tls: true },
    smtp: { host: 'smtp.qq.com', port: 465, secure: true },
    hint: '需要在网页端开启 IMAP/SMTP 服务，使用授权码而非登录密码',
  },
  feishu: {
    name: 'Feishu Mail',
    imap: { host: 'imap.feishu.cn', port: 993, tls: true },
    smtp: { host: 'smtp.feishu.cn', port: 465, secure: true },
  },
  yahoo: {
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    hint: '需要生成"应用专用密码"',
  },
  icloud: {
    name: 'iCloud',
    imap: { host: 'imap.mail.me.com', port: 993, tls: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    hint: '需要使用"应用专用密码"',
  },
  custom: {
    name: '自定义',
    imap: { host: '', port: 993, tls: true },
    smtp: { host: '', port: 465, secure: true },
  },
};

interface EmailFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  account?: {
    id: string;
    name: string;
    email: string;
    password: string;
    provider: string;
    imap: { host: string; port: number; tls: boolean };
    smtp: { host: string; port: number; secure: boolean };
  };
  onSave: (account: any) => Promise<void>;
}

interface FormData {
  name: string;
  email: string;
  password: string;
  provider: string;
  imap: { host: string; port: number; tls: boolean };
  smtp: { host: string; port: number; secure: boolean };
}

interface TestResult {
  success: boolean;
  message: string;
  results?: {
    imap: { success: boolean; message: string; durationMs?: number };
    smtp: { success: boolean; message: string; durationMs?: number };
  };
}

export function EmailFormModal({ isOpen, onClose, account, onSave }: EmailFormModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    password: '',
    provider: 'gmail',
    imap: { host: 'imap.gmail.com', port: 993, tls: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const isEdit = !!account;

  // 初始化表单数据
  useEffect(() => {
    if (account) {
      setFormData({
        name: account.name,
        email: account.email,
        password: account.password === '***' ? '' : account.password,
        provider: account.provider,
        imap: account.imap,
        smtp: account.smtp,
      });
      setShowAdvanced(account.provider === 'custom');
    } else {
      // 重置为默认值
      setFormData({
        name: '',
        email: '',
        password: '',
        provider: 'gmail',
        imap: EMAIL_PROVIDERS.gmail.imap,
        smtp: EMAIL_PROVIDERS.gmail.smtp,
      });
      setShowAdvanced(false);
    }
    setError(null);
    setTestResult(null);
  }, [account, isOpen]);

  // 处理提供商变更
  function handleProviderChange(provider: string) {
    const preset = EMAIL_PROVIDERS[provider];
    if (preset) {
      setFormData(prev => ({
        ...prev,
        provider,
        imap: { ...preset.imap },
        smtp: { ...preset.smtp },
      }));
      setShowAdvanced(provider === 'custom');
    }
  }

  // 测试连接
  async function handleTest() {
    if (!formData.email || !formData.password) {
      setError('请填写邮箱和密码');
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          imap: formData.imap,
          smtp: formData.smtp,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: '测试失败' });
    } finally {
      setIsTesting(false);
    }
  }

  // 提交表单
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.email) {
      setError('请填写邮箱地址');
      return;
    }
    if (!formData.password && !isEdit) {
      setError('请填写密码');
      return;
    }
    if (formData.provider === 'custom' && (!formData.imap.host || !formData.smtp.host)) {
      setError('请填写 IMAP 和 SMTP 服务器地址');
      return;
    }

    try {
      setLoading(true);
      const saveData: any = {
        name: formData.name || formData.email.split('@')[0],
        email: formData.email,
        provider: formData.provider,
        imap: formData.imap,
        smtp: formData.smtp,
      };

      // 只在有新密码时传递密码
      if (formData.password) {
        saveData.password = formData.password;
      }

      await onSave(saveData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const currentProvider = EMAIL_PROVIDERS[formData.provider];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            {isEdit ? '编辑邮箱账户' : '添加邮箱账户'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 提供商选择 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              邮件服务商
            </label>
            <select
              value={formData.provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {Object.entries(EMAIL_PROVIDERS).map(([key, preset]) => (
                <option key={key} value={key}>
                  {preset.name}
                </option>
              ))}
            </select>
          </div>

          {/* 提示信息 */}
          {currentProvider?.hint && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
              {currentProvider.hint}
            </div>
          )}

          {/* 账户名称 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              账户名称（可选）
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如：工作邮箱"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* 邮箱地址 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              邮箱地址
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
              placeholder="your@email.com"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {formData.provider === 'gmail' || formData.provider === '163' || formData.provider === '126' || formData.provider === 'qq'
                ? '应用专用密码 / 授权码'
                : '密码'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              placeholder={isEdit ? '留空保持不变' : '输入密码或授权码'}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* 高级设置 */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              高级设置
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                {/* IMAP 配置 */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">IMAP 配置</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={formData.imap.host}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        imap: { ...prev.imap, host: e.target.value }
                      }))}
                      placeholder="IMAP 服务器"
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <input
                      type="number"
                      value={formData.imap.port}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        imap: { ...prev.imap, port: parseInt(e.target.value) || 993 }
                      }))}
                      placeholder="端口"
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={formData.imap.tls}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        imap: { ...prev.imap, tls: e.target.checked }
                      }))}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    使用 TLS
                  </label>
                </div>

                {/* SMTP 配置 */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">SMTP 配置</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={formData.smtp.host}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, host: e.target.value }
                      }))}
                      placeholder="SMTP 服务器"
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <input
                      type="number"
                      value={formData.smtp.port}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, port: parseInt(e.target.value) || 465 }
                      }))}
                      placeholder="端口"
                      className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <input
                      type="checkbox"
                      checked={formData.smtp.secure}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        smtp: { ...prev.smtp, secure: e.target.checked }
                      }))}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    使用 SSL
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className={`flex items-center gap-2 font-medium ${testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                {testResult.success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                {testResult.message}
              </div>
              {testResult.results && (
                <div className="mt-2 text-sm space-y-1">
                  <div className={testResult.results.imap.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    • IMAP: {testResult.results.imap.message}
                  </div>
                  <div className={testResult.results.smtp.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    • SMTP: {testResult.results.smtp.message}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 按钮组 */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || !formData.email || !formData.password}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting ? (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              测试连接
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '保存中...' : isEdit ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
