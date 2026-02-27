import React, { useState, useEffect } from 'react';
import { HardDrive, Server, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { authFetch } from '../utils/auth';

interface StorageProvider {
  id: string;
  name: string;
  type: 'local' | 'nas';
  connected: boolean;
}

interface CurrentProvider {
  id: string;
  name: string;
  type: 'local' | 'nas';
  connected: boolean;
}

interface StorageSelectorProps {
  onStorageChanged?: (providerId: string) => void;
  className?: string;
}

export const StorageSelector: React.FC<StorageSelectorProps> = ({
  onStorageChanged,
  className = ""
}) => {
  const [providers, setProviders] = useState<StorageProvider[]>([]);
  const [currentProvider, setCurrentProvider] = useState<CurrentProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 加载存储提供者列表
  const loadProviders = async () => {
    try {
      const response = await authFetch('/api/storage/providers');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setProviders(data);
    } catch (error) {
      console.error('Failed to load storage providers:', error);
      setError(error instanceof Error ? error.message : 'Failed to load storage providers');
    }
  };

  // 加载当前存储提供者
  const loadCurrentProvider = async () => {
    try {
      const response = await authFetch('/api/storage/current');
      if (response.ok) {
        const data = await response.json();
        setCurrentProvider(data);
      } else if (response.status === 404) {
        // 没有选择存储提供者
        setCurrentProvider(null);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to load current provider:', error);
      // 不设置错误，因为没有当前提供者是正常情况
    }
  };

  // 初始化加载数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);

      await Promise.all([
        loadProviders(),
        loadCurrentProvider()
      ]);

      setLoading(false);
    };

    loadData();
  }, []);

  // 切换存储提供者
  const switchProvider = async (providerId: string) => {
    setSwitching(providerId);
    setError(null);

    try {
      const response = await authFetch('/api/storage/switch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ providerId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();

      // 更新当前提供者
      setCurrentProvider({
        id: result.currentProvider,
        name: providers.find(p => p.id === result.currentProvider)?.name || 'Unknown',
        type: providers.find(p => p.id === result.currentProvider)?.type || 'local',
        connected: result.connected
      });

      // 通知父组件存储已切换
      onStorageChanged?.(providerId);

      // 重新加载提供者状态
      await loadProviders();

    } catch (error) {
      console.error('Failed to switch storage:', error);
      setError(error instanceof Error ? error.message : 'Failed to switch storage');
    } finally {
      setSwitching(null);
    }
  };

  // 测试连接
  const testConnection = async (providerId: string) => {
    try {
      const response = await authFetch(`/api/storage/test/${providerId}`, {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success && result.connected) {
        // 重新加载提供者状态
        await loadProviders();
      } else {
        setError('Connection test failed');
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      setError(error instanceof Error ? error.message : 'Connection test failed');
    }
  };

  // 刷新数据
  const refresh = async () => {
    setLoading(true);
    setError(null);
    await Promise.all([
      loadProviders(),
      loadCurrentProvider()
    ]);
    setLoading(false);
  };

  // 获取存储类型图标
  const getStorageIcon = (type: 'local' | 'nas') => {
    switch (type) {
      case 'local':
        return <HardDrive className="w-4 h-4" />;
      case 'nas':
        return <Server className="w-4 h-4" />;
      default:
        return <HardDrive className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm text-gray-600">Loading storage providers...</span>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <HardDrive className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-600">No storage providers configured</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* 当前存储状态 */}
      {currentProvider && (
        <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center space-x-2">
            {getStorageIcon(currentProvider.type)}
            <span className="text-sm font-medium text-blue-900">{currentProvider.name}</span>
            {currentProvider.connected ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
          <span className="text-xs text-blue-600">Current</span>
        </div>
      )}

      {/* 错误显示 */}
      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-800">{error}</span>
          </div>
        </div>
      )}

      {/* 存储提供者列表 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-900">Storage Providers</h4>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1">
          {providers.map((provider) => {
            const isActive = currentProvider?.id === provider.id;
            const isSwitching = switching === provider.id;

            return (
              <div
                key={provider.id}
                className={`
                  flex items-center justify-between p-2 border rounded-md transition-colors
                  ${isActive
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center space-x-3">
                  {getStorageIcon(provider.type)}
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {provider.name}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                      {provider.type} Storage
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    {provider.connected ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* 测试连接按钮 */}
                  {provider.type === 'nas' && (
                    <button
                      onClick={() => testConnection(provider.id)}
                      disabled={isSwitching}
                      className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                      title="Test Connection"
                    >
                      Test
                    </button>
                  )}

                  {/* 切换按钮 */}
                  {!isActive && (
                    <button
                      onClick={() => switchProvider(provider.id)}
                      disabled={isSwitching || !provider.connected}
                      className={`
                        px-3 py-1 text-xs rounded transition-colors
                        ${provider.connected
                          ? 'text-blue-600 bg-blue-100 hover:bg-blue-200'
                          : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                        }
                      `}
                    >
                      {isSwitching ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Switch'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};