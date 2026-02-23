import { useState, useEffect } from 'react';
import { Plus, Trash2, Star, Edit2 } from 'lucide-react';
import { ModelFormModal, MODEL_PROVIDERS } from './ModelFormModal';

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

// 获取提供商显示名称
function getProviderDisplayName(model: Model): string {
  if (model.provider) {
    const provider = MODEL_PROVIDERS[model.provider];
    return provider?.name || model.provider;
  }
  return '未知';
}

// 获取协议显示名称
function getProtocolDisplayName(model: Model): string {
  if (model.protocol) {
    return model.protocol === 'anthropic' ? 'Anthropic' : 'OpenAI';
  }
  return 'OpenAI';
}

export function ModelConfigSection() {
  const [models, setModels] = useState<Model[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<Model | null>(null);

  // Fetch models on mount
  useEffect(() => {
    fetchModels();
  }, []);

  async function fetchModels() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/models');
      if (!res.ok) throw new Error('Failed to fetch models');
      const data = await res.json();
      setModels(data.models || []);
      setDefaultModel(data.defaultModel || null);
    } catch (err) {
      console.error('Failed to fetch models:', err);
      setError('Failed to load models');
    } finally {
      setLoading(false);
    }
  }

  async function deleteModel(modelName: string) {
    if (!confirm(`确定要删除模型 "${modelName}" 吗？`)) {
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete model');
      await fetchModels();
    } catch (err) {
      console.error('Failed to delete model:', err);
      setError('Failed to delete model');
    } finally {
      setLoading(false);
    }
  }

  async function setDefault(modelName: string) {
    try {
      setLoading(true);
      const res = await fetch(`/api/models/${encodeURIComponent(modelName)}/default`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to set default model');
      setDefaultModel(modelName);
    } catch (err) {
      console.error('Failed to set default model:', err);
      setError('Failed to set default model');
    } finally {
      setLoading(false);
    }
  }

  function openAddModal() {
    setEditingModel(null);
    setModalOpen(true);
  }

  function openEditModal(model: Model) {
    setEditingModel(model);
    setModalOpen(true);
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          模型列表
        </h3>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加模型
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {loading && models.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500">
          加载中...
        </div>
      ) : models.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-gray-500">
          暂无配置模型，点击「添加模型」开始配置
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model.name}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {model.name}
                  </span>
                  {defaultModel === model.name && (
                    <span className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded">
                      默认
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">
                    {getProviderDisplayName(model)}
                  </span>
                  <span className="text-gray-400">/</span>
                  <span>{model.model}</span>
                  <span className="text-gray-400">/</span>
                  <span className="text-xs text-gray-400">
                    {getProtocolDisplayName(model)} 协议
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {defaultModel !== model.name && (
                  <button
                    onClick={() => setDefault(model.name)}
                    className="p-2 text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400 transition-colors"
                    title="设为默认"
                  >
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => openEditModal(model)}
                  className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
                  title="编辑模型"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteModel(model.name)}
                  className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                  title="删除模型"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Model Modal */}
      <ModelFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingModel(null);
        }}
        model={editingModel || undefined}
        onSave={async (savedModel) => {
          try {
            setLoading(true);

            // Determine if this is an add or edit operation
            const isEdit = !!editingModel;
            const url = isEdit
              ? `/api/models/${encodeURIComponent(savedModel.name)}`
              : '/api/models';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
              method,
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(savedModel),
            });

            if (!res.ok) {
              const errorData = await res.json().catch(() => ({}));
              throw new Error(errorData.error || `Failed to ${isEdit ? 'update' : 'create'} model`);
            }

            // Refresh models list and close modal
            await fetchModels();
            setModalOpen(false);
            setEditingModel(null);
          } catch (err) {
            console.error('Failed to save model:', err);
            setError(err instanceof Error ? err.message : 'Failed to save model');
            throw err; // Re-throw to let modal handle it
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}
