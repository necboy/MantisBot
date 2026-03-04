import { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal, X, Trash2, ChevronDown, ChevronUp, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface LogEntry {
  id: string;
  level: 'log' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  category: 'agent' | 'system';
  timestamp: number;
}

interface LogDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: LogEntry[];
  onClear: () => void;
}

const LEVEL_STYLES: Record<LogEntry['level'], string> = {
  log:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  info:  'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  warn:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const LEVEL_DOT: Record<LogEntry['level'], string> = {
  log:   'text-blue-400',
  info:  'text-gray-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
};

function formatTime(ts: number): string {
  return new Date(ts).toTimeString().slice(0, 8);
}

export function LogDrawer({ isOpen, onClose, entries, onClear }: LogDrawerProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'agent' | 'system'>('agent');
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [height, setHeight] = useState(220);
  const [isMinimized, setIsMinimized] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // 拖拽调整高度
  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    e.preventDefault();
  }, [height]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = dragStartY.current - e.clientY;
      setHeight(Math.min(500, Math.max(100, dragStartH.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const filtered = entries.filter(e =>
    e.category === activeTab &&
    (filter === '' || e.message.toLowerCase().includes(filter.toLowerCase()) || e.source.toLowerCase().includes(filter.toLowerCase()))
  );

  const agentCount = entries.filter(e => e.category === 'agent').length;
  const systemCount = entries.filter(e => e.category === 'system').length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex flex-col shadow-lg"
      style={{ height: isMinimized ? 36 : height }}
    >
      {/* 拖拽把手 */}
      {!isMinimized && (
        <div
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-blue-400/40 transition-colors"
          onMouseDown={onDragStart}
        />
      )}

      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 h-9 min-h-[36px] border-b border-gray-200 dark:border-gray-700 select-none">
        <Terminal size={14} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 mr-1">{t('log.title')}</span>

        {/* Tabs */}
        {!isMinimized && (
          <>
            <button
              onClick={() => setActiveTab('agent')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                activeTab === 'agent'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Agent
              {agentCount > 0 && (
                <span className="ml-1 text-xs opacity-60">{agentCount}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                activeTab === 'system'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t('log.system')}
              {systemCount > 0 && (
                <span className="ml-1 text-xs opacity-60">{systemCount}</span>
              )}
            </button>

            {/* 搜索框 */}
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={t('log.filter')}
              className="ml-2 text-xs px-2 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-transparent text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-blue-400 w-32"
            />

            {/* 自动滚动 */}
            <button
              onClick={() => setAutoScroll(v => !v)}
              title={autoScroll ? t('log.autoScrollOff') : t('log.autoScrollOn')}
              className={`text-xs px-2 py-0.5 rounded transition-colors ml-1 ${
                autoScroll
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400'
              }`}
            >
              ↓{t('log.autoScroll')}
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {!isMinimized && (
            <button
              onClick={onClear}
              title={t('log.clear')}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Trash2 size={12} />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(v => !v)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            {isMinimized ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* 日志列表 */}
      {!isMinimized && (
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto font-mono text-xs"
          onScroll={e => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
            if (atBottom !== autoScroll) setAutoScroll(atBottom);
          }}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-xs">
              {t('log.noLogs')}
            </div>
          ) : (
            filtered.map(entry => (
              <div
                key={entry.id}
                className="flex items-start gap-2 px-3 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800"
              >
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 pt-px w-16 text-right">
                  {formatTime(entry.timestamp)}
                </span>
                <Circle size={6} className={`mt-1.5 flex-shrink-0 fill-current ${LEVEL_DOT[entry.level]}`} />
                <span className={`flex-shrink-0 text-[10px] px-1 rounded font-medium uppercase ${LEVEL_STYLES[entry.level]}`}>
                  {entry.level}
                </span>
                <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 max-w-[100px] truncate">
                  [{entry.source}]
                </span>
                <span className="text-gray-700 dark:text-gray-300 break-all whitespace-pre-wrap leading-relaxed">
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
