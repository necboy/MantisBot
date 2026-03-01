import { useState, useRef, useEffect } from 'react';
import { Bot, Lock, CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { setAuthToken } from '../utils/auth';

type HealthStatus = 'checking' | 'online' | 'offline';

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('checking');
  const [healthError, setHealthError] = useState('');
  const [showHealthDetail, setShowHealthDetail] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const checkHealth = async () => {
      try {
        const res = await fetch('/health', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          setHealthStatus('online');
          setHealthError('');
        } else {
          setHealthStatus('offline');
          setHealthError(`HTTP ${res.status} ${res.statusText}`);
        }
      } catch (err: unknown) {
        setHealthStatus('offline');
        const msg = err instanceof Error ? err.message : String(err);
        setHealthError(msg.includes('AbortError') || msg.includes('abort') ? '连接超时' : msg);
      }
      timer = setTimeout(checkHealth, 5000);
    };

    checkHealth();
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const data = await res.json();
        // authEnabled: false 表示后端未开启鉴权，无需 token
        if (!data.authEnabled || data.token) {
          if (data.token) setAuthToken(data.token);
          onLogin();
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.message || '账户或密码错误，请重试');
      }
    } catch {
      setError('无法连接到服务器，请检查网络');
    } finally {
      setLoading(false);
    }
  };

  const healthIndicator = {
    checking: {
      icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />,
      dot: 'bg-gray-400',
      label: '检查中...',
      labelClass: 'text-gray-500 dark:text-gray-400',
    },
    online: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />,
      dot: 'bg-green-500',
      label: '后端在线',
      labelClass: 'text-green-600 dark:text-green-400',
    },
    offline: {
      icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,
      dot: 'bg-red-500',
      label: '后端离线',
      labelClass: 'text-red-600 dark:text-red-400',
    },
  }[healthStatus];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="p-4 bg-primary-100 dark:bg-primary-900/30 rounded-2xl mb-4">
            <Bot className="w-10 h-10 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">MantisBot</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">请登录以继续使用</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              账户名
            </label>
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入账户名"
              required
              autoComplete="username"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || healthStatus === 'offline'}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium rounded-lg transition-colors"
          >
            <Lock className="w-4 h-4" />
            {loading ? '登录中...' : '登录'}
          </button>

          {/* Health status bar */}
          <div className="pt-1 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={() => healthStatus === 'offline' && setShowHealthDetail(v => !v)}
              className={`w-full flex items-center justify-between gap-2 text-xs py-1 rounded transition-colors ${
                healthStatus === 'offline'
                  ? 'cursor-pointer hover:bg-red-50 dark:hover:bg-red-950/30 px-1 -mx-1'
                  : 'cursor-default'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {healthIndicator.icon}
                <span className={healthIndicator.labelClass}>{healthIndicator.label}</span>
                {healthStatus === 'offline' && healthError && (
                  <span className="text-red-400 dark:text-red-500 truncate max-w-[160px]">— {healthError}</span>
                )}
              </span>
              {healthStatus === 'offline' && (
                showHealthDetail
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              )}
            </button>

            {/* Offline guidance panel */}
            {healthStatus === 'offline' && showHealthDetail && (
              <div className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-3 space-y-2">
                <p className="text-xs text-red-700 dark:text-red-300 font-medium">后端服务未启动</p>
                <p className="text-xs text-red-600 dark:text-red-400">
                  请在项目根目录执行以下命令启动后端：
                </p>
                <div className="flex items-start gap-2 bg-gray-900 dark:bg-black rounded-md px-3 py-2">
                  <Terminal className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                  <code className="text-xs text-green-400 font-mono break-all">npm start</code>
                </div>
                {healthError && (
                  <div className="text-xs text-red-500 dark:text-red-400 font-mono bg-red-100 dark:bg-red-950/40 rounded px-2 py-1 break-all">
                    {healthError}
                  </div>
                )}
                <p className="text-xs text-red-500 dark:text-red-400">
                  启动后页面将自动检测并恢复登录。
                </p>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
