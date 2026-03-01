import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Command } from 'lucide-react';
import { authFetch } from '../utils/auth';

interface Command {
  name: string;
  description: string;
  plugin: string;
}

interface CommandPaletteProps {
  onSelect: (command: string) => void;
  onClose: () => void;
}

export function CommandPalette({ onSelect, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [commands, setCommands] = useState<Command[]>([]);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 获取命令列表
    authFetch('/api/commands')
      .then(res => res.json())
      .then(data => {
        setCommands(data.commands || []);
      })
      .catch(err => console.error('Failed to fetch commands:', err));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredCommands = commands.filter(cmd =>
    cmd.name.toLowerCase().includes(search.toLowerCase()) ||
    cmd.description.toLowerCase().includes(search.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        onSelect('/' + filteredCommands[selectedIndex].name + ' ');
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 搜索框 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('command.search', '搜索命令...')}
            className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
          />
        </div>

        {/* 命令列表 */}
        <div className="max-h-80 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500">
              {t('command.noResults', '没有找到匹配的命令')}
            </div>
          ) : (
            <div className="py-2">
              {/* 系统命令 */}
              {filteredCommands.some(c => c.plugin === 'system') && (
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {t('command.system', '系统命令')}
                </div>
              )}
              {filteredCommands
                .filter(c => c.plugin === 'system')
                .map((cmd, idx) => (
                  <button
                    key={cmd.name}
                    className={`w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      selectedIndex === idx ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                    onClick={() => {
                      onSelect('/' + cmd.name + ' ');
                      onClose();
                    }}
                  >
                    <Command className="w-4 h-4 text-gray-400" />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">/{cmd.name}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">{cmd.description}</div>
                    </div>
                  </button>
                ))}

              {/* Plugin 命令 */}
              {filteredCommands.some(c => c.plugin !== 'system') && (
                <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mt-2">
                  {t('command.plugins', '插件命令')}
                </div>
              )}
              {filteredCommands
                .filter(c => c.plugin !== 'system')
                .map((cmd, idx) => {
                  const actualIndex = filteredCommands.filter(c => c.plugin === 'system').length + idx;
                  return (
                    <button
                      key={cmd.name}
                      className={`w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                        selectedIndex === actualIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
                      }`}
                      onClick={() => {
                        onSelect('/' + cmd.name + ' ');
                        onClose();
                      }}
                    >
                      <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white text-xs font-bold">
                        {cmd.plugin.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">/{cmd.name}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{cmd.description}</div>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{cmd.plugin}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* 提示 */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-4">
          <span>↑↓ {t('command.navigate', '导航')}</span>
          <span>↵ {t('command.select', '选择')}</span>
          <span>esc {t('command.close', '关闭')}</span>
        </div>
      </div>
    </div>
  );
}
