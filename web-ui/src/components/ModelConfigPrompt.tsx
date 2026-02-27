import { useState, useEffect } from 'react';
import { Settings, AlertCircle } from 'lucide-react';

interface Model {
  name: string;
  protocol?: 'openai' | 'anthropic';
  provider?: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  baseURL?: string;
  endpoint?: string;
}

interface ModelConfigPromptProps {
  onClose: () => void;
  onOpenSettings: () => void;
}

// 检测模型是否有效配置（有 API Key）
function isModelValid(model: Model): boolean {
  return !!(model.apiKey && model.apiKey !== '***' && model.model);
}

export function ModelConfigPrompt({ onClose, onOpenSettings }: ModelConfigPromptProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 弹窗内容 */}
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* 图标 */}
        <div className="flex justify-center mb-4">
          <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full">
            <AlertCircle className="w-12 h-12 text-yellow-600 dark:text-yellow-400" />
          </div>
        </div>

        {/* 标题 */}
        <h2 className="text-xl font-bold text-center text-gray-900 dark:text-gray-100 mb-2">
          欢迎使用 MantisBot
        </h2>

        {/* 描述 */}
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6">
          尚未配置有效的 AI 模型，请先配置模型以正常使用。
        </p>

        {/* 操作按钮 */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              localStorage.setItem('mantis_has_configured_models', 'dismissed');
              onClose();
            }}
            className="flex-1 px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={onOpenSettings}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            立即配置
          </button>
        </div>
      </div>
    </div>
  );
}

// 首次启动检测 Hook
const HAS_CONFIGURED_MODELS_KEY = 'mantis_has_configured_models';

// 标记用户正在配置模型（防止配置后再次弹窗）
export function markModelConfigPending(): void {
  localStorage.setItem(HAS_CONFIGURED_MODELS_KEY, 'pending');
}

// 标记用户已配置模型
export function markModelConfigured(): void {
  localStorage.setItem(HAS_CONFIGURED_MODELS_KEY, 'true');
}

export function useModelConfigCheck(onPromptRequired: () => void) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function checkModelConfig() {
      // 检查是否已经在配置中（pending 状态）或已主动关闭（dismissed）
      const configuredStatus = localStorage.getItem(HAS_CONFIGURED_MODELS_KEY);
      if (configuredStatus === 'pending' || configuredStatus === 'dismissed') {
        setChecked(true);
        return;
      }

      try {
        const res = await fetch('/api/models');
        if (!res.ok) {
          setChecked(true);
          return;
        }

        const data = await res.json();
        const models: Model[] = data.models || [];

        // 检查是否有有效配置的模型
        const hasValidModel = models.some(m => isModelValid(m));

        if (!hasValidModel) {
          // 没有有效模型，显示提示
          onPromptRequired();
        } else {
          // 有有效模型，标记为已配置
          localStorage.setItem(HAS_CONFIGURED_MODELS_KEY, 'true');
        }
      } catch (err) {
        console.error('Failed to check model config:', err);
      } finally {
        setChecked(true);
      }
    }

    checkModelConfig();
  }, [onPromptRequired]);

  return checked;
}
