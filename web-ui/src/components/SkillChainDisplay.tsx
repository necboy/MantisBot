import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Sparkles, Clock, Zap } from 'lucide-react';

interface SkillCall {
  id: string;
  name: string;
  location: string;
  timestamp: number;
}

interface SkillChainDisplayProps {
  skills: SkillCall[];
}

export function SkillChainDisplay({ skills }: SkillChainDisplayProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (skills.length === 0) {
    return null;
  }

  // 按时间排序
  const sortedSkills = [...skills].sort((a, b) => a.timestamp - b.timestamp);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="my-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/10 overflow-hidden shadow-sm">
      {/* 头部 - 可点击展开/折叠 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-all"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-800 dark:text-amber-200">
            {t('skill.usedSkills', '已使用技能')}
          </span>
          <span className="px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-400 text-white text-xs font-medium rounded-full shadow-sm">
            {skills.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        )}
      </button>

      {/* 技能调用链 */}
      {expanded && (
        <div className="px-4 pb-4">
          <div className="relative">
            {/* 连接线 - 带动画 */}
            <div className="absolute left-[15px] top-8 bottom-4 w-0.5 bg-gradient-to-b from-amber-400 to-orange-400 animate-pulse" />

            {sortedSkills.map((skill, index) => (
              <div key={skill.id} className="relative flex items-start gap-3 py-2">
                {/* 节点圆点 - 最新节点有发光效果 */}
                <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                  index === sortedSkills.length - 1
                    ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/50 scale-110'
                    : 'bg-amber-200 dark:bg-amber-700 text-amber-700 dark:text-amber-200'
                }`}>
                  {index === sortedSkills.length - 1 ? (
                    <Zap className="w-4 h-4" />
                  ) : (
                    <span className="text-xs font-bold">{index + 1}</span>
                  )}
                </div>

                {/* 技能信息 */}
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium ${
                      index === sortedSkills.length - 1
                        ? 'text-amber-900 dark:text-amber-100'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}>
                      {skill.name}
                    </span>
                    {index === sortedSkills.length - 1 && (
                      <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] rounded animate-pulse">
                        最新
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-amber-600 dark:text-amber-400">
                    <Clock className="w-3 h-3" />
                    <span className="font-mono">{formatTime(skill.timestamp)}</span>
                    <span className="opacity-60 truncate max-w-[200px]" title={skill.location}>
                      {skill.location.split('/').slice(-3).join('/')}
                    </span>
                  </div>
                </div>

                {/* 箭头指示 */}
                {index < sortedSkills.length - 1 && (
                  <div className="absolute left-[14px] top-16 text-amber-500">
                    <ChevronDown className="w-3 h-3 animate-bounce" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
