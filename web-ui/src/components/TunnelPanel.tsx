import { useState, useEffect } from 'react';
import { X, Wifi, RefreshCw, Check, AlertCircle, ExternalLink } from 'lucide-react';

interface TunnelConfig {
  enabled: boolean;
  ddnsto: {
    enabled: boolean;
    token?: string;
    deviceIdx?: number;
    deviceName?: string;
  };
  cloudflare: {
    enabled: boolean;
    token?: string;
    tunnelId?: string;
    credentialsFile?: string;
  };
  frp: {
    enabled: boolean;
    configPath?: string;
    serverAddr?: string;
    serverPort?: number;
    token?: string;
    localPort?: number;
    subdomain?: string;
  };
}

interface ServiceStatus {
  name: string;
  enabled: boolean;
  running: boolean;
  publicUrl?: string;
}

interface TunnelStatus {
  enabled: boolean;
  services: ServiceStatus[];
  publicUrls: Record<string, string | undefined>;
}

interface TunnelPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TunnelPanel({ isOpen, onClose }: TunnelPanelProps) {
  const [config, setConfig] = useState<TunnelConfig | null>(null);
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'cloudflare' | 'ddnsto' | 'frp'>('cloudflare');

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      loadStatus();
    }
  }, [isOpen]);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await fetch('/api/tunnel/config');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load tunnel config:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStatus() {
    try {
      const res = await fetch('/api/tunnel/status');
      const data = await res.json();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load tunnel status:', err);
    }
  }

  async function saveConfig(newConfig: TunnelConfig) {
    setSaving(true);
    try {
      const res = await fetch('/api/tunnel/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        alert('配置已保存，重启服务后生效');
      }
    } catch (err) {
      console.error('Failed to save config:', err);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(type: string, testConfig: any) {
    setTesting(type);
    setTestResult(null);
    try {
      const res = await fetch('/api/tunnel/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, config: testConfig })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      console.error('Test failed:', err);
      setTestResult({ success: false, message: '测试失败' });
    } finally {
      setTesting(null);
    }
  }

  async function startServices() {
    try {
      await fetch('/api/tunnel/start', { method: 'POST' });
      await loadStatus();
    } catch (err) {
      console.error('Failed to start services:', err);
    }
  }

  async function stopServices() {
    try {
      await fetch('/api/tunnel/stop', { method: 'POST' });
      await loadStatus();
    } catch (err) {
      console.error('Failed to stop services:', err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            内网穿透配置
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadConfig(); loadStatus(); }}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <RefreshCw className="w-6 h-6 animate-spin mr-2" />
              加载中...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Bar */}
              {status && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium">服务状态</h3>
                    <div className="flex gap-2">
                      {status.enabled && status.services.some(s => s.running) ? (
                        <button
                          onClick={stopServices}
                          className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                        >
                          停止服务
                        </button>
                      ) : (
                        <button
                          onClick={startServices}
                          className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          启动服务
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    {status.services.length > 0 ? (
                      status.services.map(service => (
                        <div key={service.name} className="flex items-center gap-2">
                          {service.running ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-gray-400" />
                          )}
                          <span className="capitalize">{service.name}</span>
                          {service.publicUrl && (
                            <a
                              href={service.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-500">暂无运行中的服务</div>
                    )}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('cloudflare')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'cloudflare'
                      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  Cloudflare Tunnel（推荐）
                </button>
                <button
                  onClick={() => setActiveTab('ddnsto')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'ddnsto'
                      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  DDNSTO
                </button>
                <button
                  onClick={() => setActiveTab('frp')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'frp'
                      ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  FRP
                </button>
              </div>

              {/* Config Forms */}
              {config && (
                <>
                  {activeTab === 'cloudflare' && (
                    <CloudflareConfig
                      config={config.cloudflare}
                      enabled={config.enabled && config.cloudflare.enabled}
                      onSave={(cfConfig) => {
                        const newConfig = {
                          ...config,
                          enabled: true,
                          cloudflare: { ...cfConfig, enabled: true }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onDisable={() => {
                        const newConfig = {
                          ...config,
                          cloudflare: { ...config.cloudflare, enabled: false }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onTest={(testConfig) => testConnection('cloudflare', testConfig)}
                      testing={testing === 'cloudflare'}
                      testResult={testResult}
                    />
                  )}

                  {activeTab === 'ddnsto' && (
                    <DDNSTOConfig
                      config={config.ddnsto}
                      enabled={config.enabled && config.ddnsto.enabled}
                      onSave={(ddnstoConfig) => {
                        const newConfig = {
                          ...config,
                          enabled: true,
                          ddnsto: { ...ddnstoConfig, enabled: true }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onDisable={() => {
                        const newConfig = {
                          ...config,
                          ddnsto: { ...config.ddnsto, enabled: false }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onTest={(testConfig) => testConnection('ddnsto', testConfig)}
                      testing={testing === 'ddnsto'}
                      testResult={testResult}
                    />
                  )}

                  {activeTab === 'frp' && (
                    <FRPConfig
                      config={config.frp}
                      enabled={config.enabled && config.frp.enabled}
                      onSave={(frpConfig) => {
                        const newConfig = {
                          ...config,
                          enabled: true,
                          frp: { ...frpConfig, enabled: true }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onDisable={() => {
                        const newConfig = {
                          ...config,
                          frp: { ...config.frp, enabled: false }
                        };
                        setConfig(newConfig);
                        saveConfig(newConfig);
                      }}
                      onTest={(testConfig) => testConnection('frp', testConfig)}
                      testing={testing === 'frp'}
                      testResult={testResult}
                    />
                  )}
                </>
              )}

              {/* Help Text */}
              <div className="border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">使用帮助：</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                  <li>推荐使用 Cloudflare Tunnel：完全免费，不需要公网 IP</li>
                  <li>DDNSTO 需要公网 IP 和 Docker，适合有公网 IP 的用户</li>
                  <li>FRP 支持自建服务器或使用第三方服务</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {saving ? '保存中...' : '配置修改后需要重启服务才能生效'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// Cloudflare 配置组件
function CloudflareConfig({
  config,
  enabled,
  onSave,
  onDisable,
  onTest,
  testing,
  testResult
}: {
  config: any;
  enabled: boolean;
  onSave: (config: any) => void;
  onDisable: () => void;
  onTest: (config: any) => void;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [token, setToken] = useState(config.token || '');

  function handleSave() {
    onSave({ token });
  }

  function handleTest() {
    onTest({ token });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          enabled
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
        }`}>
          {enabled ? '已启用' : '未启用'}
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Cloudflare Tunnel Token</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="输入从 Cloudflare 控制台获取的 Token"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          从 Cloudflare Zero Trust → Networks → Tunnels 获取
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={!token || testing}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? '测试中...' : '测试配置'}
        </button>
        <button
          onClick={handleSave}
          disabled={!token}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          保存并启用
        </button>
        {enabled && (
          <button
            onClick={onDisable}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            禁用此服务
          </button>
        )}
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-sm">
        <p className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">配置步骤：</p>
        <ol className="list-decimal list-inside space-y-1 text-yellow-800 dark:text-yellow-200">
          <li>确保域名已托管到 Cloudflare</li>
          <li>访问 Cloudflare Zero Trust 控制台</li>
          <li>创建 Tunnel 并复制 Token</li>
          <li>粘贴 Token 到上方输入框</li>
          <li>在 Tunnel 控制台配置域名路由</li>
        </ol>
      </div>
    </div>
  );
}

// DDNSTO 配置组件
function DDNSTOConfig({
  config,
  enabled,
  onSave,
  onDisable,
  onTest,
  testing,
  testResult
}: {
  config: any;
  enabled: boolean;
  onSave: (config: any) => void;
  onDisable: () => void;
  onTest: (config: any) => void;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [token, setToken] = useState(config.token || '');
  const [deviceIdx, setDeviceIdx] = useState(config.deviceIdx || 0);
  const [deviceName, setDeviceName] = useState(config.deviceName || 'MantisBot');

  function handleSave() {
    onSave({ token, deviceIdx, deviceName });
  }

  function handleTest() {
    onTest({ token, deviceIdx, deviceName });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          enabled
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
        }`}>
          {enabled ? '已启用' : '未启用'}
        </span>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">DDNSTO Token</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="输入从 DDNSTO 控制台获取的 Token"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          从 ddnsto.com 控制台获取，需要微信扫码登录
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">设备索引</label>
        <input
          type="number"
          value={deviceIdx}
          onChange={(e) => setDeviceIdx(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">默认为 0，多设备时可设置为不同值</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">设备名称</label>
        <input
          type="text"
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="MantisBot"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">显示在 DDNSTO 控制台的设备名称，默认为 MantisBot</p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={!token || testing}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? '测试中...' : '测试配置'}
        </button>
        <button
          onClick={handleSave}
          disabled={!token}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          保存并启用
        </button>
        {enabled && (
          <button
            onClick={onDisable}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            禁用此服务
          </button>
        )}
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-sm">
        <p className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">注意事项：</p>
        <ul className="list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-200">
          <li>需要公网 IP（可联系运营商申请）</li>
          <li>需要安装并运行 Docker</li>
          <li>免费版 7 天试用期（可续期）</li>
          <li>保存配置后需在 DDNSTO 控制台配置域名映射</li>
        </ul>
      </div>
    </div>
  );
}

// FRP 配置组件
function FRPConfig({
  config,
  enabled,
  onSave,
  onDisable,
  onTest,
  testing,
  testResult
}: {
  config: any;
  enabled: boolean;
  onSave: (config: any) => void;
  onDisable: () => void;
  onTest: (config: any) => void;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}) {
  const [serverAddr, setServerAddr] = useState(config.serverAddr || '');
  const [serverPort, setServerPort] = useState(config.serverPort || 7000);
  const [token, setToken] = useState(config.token || '');
  const [localPort, setLocalPort] = useState(config.localPort || 8118);
  const [subdomain, setSubdomain] = useState(config.subdomain || '');
  const [configPath, setConfigPath] = useState(config.configPath || '');

  function handleSave() {
    onSave({
      serverAddr,
      serverPort,
      token,
      localPort,
      subdomain,
      configPath
    });
  }

  function handleTest() {
    onTest({
      serverAddr,
      serverPort,
      token,
      localPort,
      subdomain
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          enabled
            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
        }`}>
          {enabled ? '已启用' : '未启用'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">服务器地址</label>
          <input
            type="text"
            value={serverAddr}
            onChange={(e) => setServerAddr(e.target.value)}
            placeholder="frp.example.com"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">服务器端口</label>
          <input
            type="number"
            value={serverPort}
            onChange={(e) => setServerPort(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Token（可选）</label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="FRP 服务器 Token"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2">本地端口</label>
          <input
            type="number"
            value={localPort}
            onChange={(e) => setLocalPort(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">子域名</label>
          <input
            type="text"
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value)}
            placeholder="mantis"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">配置文件路径（可选）</label>
        <input
          type="text"
          value={configPath}
          onChange={(e) => setConfigPath(e.target.value)}
          placeholder="./data/frpc.ini"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          如果提供配置文件，将忽略上方参数直接使用配置文件
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleTest}
          disabled={(!serverAddr && !configPath) || testing}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {testing ? '测试中...' : '测试配置'}
        </button>
        <button
          onClick={handleSave}
          disabled={!serverAddr && !configPath}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          保存并启用
        </button>
        {enabled && (
          <button
            onClick={onDisable}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
          >
            禁用此服务
          </button>
        )}
      </div>

      {testResult && (
        <div
          className={`p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
          }`}
        >
          {testResult.message}
        </div>
      )}

      <div className="border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-sm">
        <p className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">使用建议：</p>
        <ul className="list-disc list-inside space-y-1 text-yellow-800 dark:text-yellow-200">
          <li>推荐使用第三方 FRP 服务（如 Sakura FRP）</li>
          <li>需要安装 frpc 客户端</li>
          <li>如果有配置文件，直接填写路径即可</li>
          <li>自建 FRP 需要有公网 IP 的服务器</li>
        </ul>
      </div>
    </div>
  );
}
