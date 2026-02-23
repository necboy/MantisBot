import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ChannelField {
  key: string;
  type: 'text' | 'password' | 'textarea' | 'url' | 'boolean';
  label: string;
  labelZh: string;
  required: boolean;
  placeholder?: string;
  placeholderZh?: string;
}

interface ChannelDefinition {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  fields: ChannelField[];
}

interface Channel {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  enabled: boolean;
  config: Record<string, any>;
}

interface ChannelFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: Channel | null;
  definitions: ChannelDefinition[];
  onSave: (data: { id: string; enabled: boolean; config: Record<string, any> }) => void;
  loading: boolean;
}

export function ChannelFormModal({
  isOpen,
  onClose,
  channel,
  definitions,
  onSave,
  loading,
}: ChannelFormModalProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh-CN';

  const [selectedId, setSelectedId] = useState(channel?.id || '');
  const [enabled, setEnabled] = useState(channel?.enabled ?? true);
  const [config, setConfig] = useState<Record<string, any>>(channel?.config || {});

  useEffect(() => {
    if (channel) {
      setSelectedId(channel.id);
      setEnabled(channel.enabled);
      setConfig(channel.config);
    } else {
      setSelectedId('');
      setEnabled(true);
      setConfig({});
    }
  }, [channel, isOpen, definitions]);

  const currentDef = definitions.find(d => d.id === selectedId);

  // 如果 definitions 还没加载，但有 channel 数据，直接从 channel 构造字段
  const fields = currentDef?.fields || (channel?.config ? Object.keys(channel.config).map(key => ({
    key,
    type: 'text' as const,
    label: key,
    labelZh: key,
    required: false,
  })) : []);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) return;

    onSave({
      id: selectedId,
      enabled,
      config,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {channel ? t('channelManagement.editChannel') : t('channelManagement.addChannel')}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Channel Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('channelManagement.channelForm.selectChannel')}
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setConfig({});
              }}
              disabled={!!channel}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
            >
              <option value="">{t('channelManagement.channelForm.selectChannel')}</option>
              {definitions.map(def => (
                <option key={def.id} value={def.id}>
                  {def.icon} {isZh ? def.nameZh : def.name}
                </option>
              ))}
            </select>
          </div>

          {/* Enabled Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="enabled" className="text-sm text-gray-700 dark:text-gray-300">
              {t('channelManagement.channelForm.enabled')}
            </label>
          </div>

          {/* Config Fields */}
          {fields.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('channelManagement.channelForm.config')}
              </h4>
              {fields
                .filter(f => f.key !== 'enabled')
                .map(field => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {isZh ? field.labelZh : field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={config[field.key] ?? false}
                        onChange={(e) => setConfig(prev => ({ ...prev, [field.key]: e.target.checked }))}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                    ) : (
                      <input
                        type={field.type}
                        value={config[field.key] || ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={isZh ? (field as any).placeholderZh : (field as any).placeholder}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {t('channelManagement.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !selectedId}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {t('channelManagement.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
