// web-ui/src/components/PermissionModal.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface QuestionOption {
  label: string;
  description?: string;
  notes?: string;
}

interface Question {
  header?: string;
  multiSelect?: boolean;
  options: QuestionOption[];
  question: string;
}

interface PermissionRequest {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  isDangerous: boolean;
  reason?: string;
}

interface PermissionModalProps {
  permission: PermissionRequest;
  onRespond: (approved: boolean, updatedInput?: Record<string, unknown>) => void;
}

const PermissionModal: React.FC<PermissionModalProps> = ({
  permission,
  onRespond,
}) => {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number[]>>({});
  const [countdown, setCountdown] = useState(60);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 检查是否为 AskUserQuestion
  const isAskUserQuestion = permission.toolName === 'AskUserQuestion' || permission.toolName === 'askuserquestion';

  // 权限确认弹窗：启动60秒倒计时，超时自动通过
  useEffect(() => {
    if (isAskUserQuestion) return;

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          onRespond(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isAskUserQuestion, onRespond]);

  const clearCountdown = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };
  const questions: Question[] = isAskUserQuestion && permission.toolInput.questions
    ? (permission.toolInput.questions as Question[])
    : [];

  // 处理选项选择
  const handleOptionSelect = (questionIndex: number, optionIndex: number) => {
    const question = questions[questionIndex];
    if (!question) return;

    setSelectedAnswers(prev => {
      const current = prev[questionIndex] || [];
      if (question.multiSelect) {
        // 多选：切换选项
        if (current.includes(optionIndex)) {
          return { ...prev, [questionIndex]: current.filter(i => i !== optionIndex) };
        } else {
          return { ...prev, [questionIndex]: [...current, optionIndex] };
        }
      } else {
        // 单选：只选一个
        return { ...prev, [questionIndex]: [optionIndex] };
      }
    });
  };

  // 提交答案
  const handleSubmitAnswers = async () => {
    setIsSubmitting(true);
    try {
      // 构建答案格式
      const answers: Record<string, unknown> = {};
      questions.forEach((q, qIndex) => {
        const selected = selectedAnswers[qIndex];
        if (selected && selected.length > 0) {
          if (q.multiSelect) {
            answers[qIndex.toString()] = selected.map(i => q.options[i].label);
          } else {
            answers[qIndex.toString()] = q.options[selected[0]].label;
          }
        }
      });

      onRespond(true, { answers });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatToolInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  const handleApprove = async () => {
    clearCountdown();
    setIsSubmitting(true);
    try {
      onRespond(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    clearCountdown();
    setIsSubmitting(true);
    try {
      onRespond(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getToolIcon = (toolName: string): string => {
    const toolIcons: Record<string, string> = {
      exec: '⚡',
      bash: '⚡',
      write: '📝',
      edit: '✏️',
      delete: '🗑️',
      remove: '🗑️',
      unlink: '🔗',
    };
    return toolIcons[toolName.toLowerCase()] || '🔧';
  };

  const getDangerLevel = (toolName: string): 'high' | 'medium' | 'low' => {
    const highDanger = ['delete', 'remove', 'unlink', 'rmdir'];
    const mediumDanger = ['exec', 'bash', 'shell'];

    if (highDanger.includes(toolName.toLowerCase())) {
      return 'high';
    }
    if (mediumDanger.includes(toolName.toLowerCase())) {
      return 'medium';
    }
    return 'low';
  };

  const dangerLevel = getDangerLevel(permission.toolName);

  // 渲染 AskUserQuestion UI
  if (isAskUserQuestion && questions.length > 0) {
    const allAnswered = questions.every((_, qIndex) =>
      selectedAnswers[qIndex] && selectedAnswers[qIndex].length > 0
    );

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/50" />

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
            <div className="flex items-center gap-3">
              <span className="text-2xl">💬</span>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('permission.askQuestion')}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Claude 需要您提供一些信息
                </p>
              </div>
            </div>
          </div>

          {/* Content - 问题列表 */}
          <div className="px-6 py-4 overflow-y-auto flex-1">
            {questions.map((question, qIndex) => (
              <div key={qIndex} className="mb-6 last:mb-0">
                <div className="flex items-center gap-2 mb-3">
                  {question.header && (
                    <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 rounded">
                      {question.header}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                  {question.question}
                </p>
                <div className="space-y-2">
                  {question.options.map((option, oIndex) => {
                    const isSelected = selectedAnswers[qIndex]?.includes(oIndex);
                    return (
                      <button
                        key={oIndex}
                        onClick={() => handleOptionSelect(qIndex, oIndex)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                            : 'border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            isSelected
                              ? 'border-purple-500 bg-purple-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {isSelected && (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            )}
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">
                            {option.label}
                          </span>
                        </div>
                        {option.description && (
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 ml-7">
                            {option.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
            <button
              onClick={handleDeny}
              disabled={isSubmitting}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              跳过
            </button>
            <button
              onClick={handleSubmitAnswers}
              disabled={!allAnswered || isSubmitting}
              className="px-4 py-2 text-white bg-purple-600 hover:bg-purple-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '提交中...' : '提交答案'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 渲染原始的危险工具权限请求 UI
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleDeny} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${
          dangerLevel === 'high'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
            : dangerLevel === 'medium'
            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{getToolIcon(permission.toolName)}</span>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('permission.title')}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {dangerLevel === 'high'
                  ? t('permission.dangerHigh')
                  : dangerLevel === 'medium'
                  ? t('permission.dangerMedium')
                  : t('permission.dangerLow')}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permission.tool')}
            </label>
            <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono">
              {permission.toolName}
            </div>
          </div>

          {permission.reason && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('permission.reason')}
              </label>
              <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white">
                {permission.reason}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('permission.parameters')}
            </label>
            <div className="max-h-48 overflow-y-auto px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-white font-mono text-sm whitespace-pre-wrap">
              {formatToolInput(permission.toolInput)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-900 flex justify-end gap-3">
          <button
            onClick={handleDeny}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('permission.deny')}
          </button>
          <button
            onClick={handleApprove}
            disabled={isSubmitting}
            className={`px-4 py-2 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              dangerLevel === 'high'
                ? 'bg-red-600 hover:bg-red-700'
                : dangerLevel === 'medium'
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubmitting ? t('permission.processing') : t('permission.allow')}
            {!isSubmitting && (
              <span className="text-xs opacity-75 bg-white/20 rounded px-1.5 py-0.5 font-mono">
                {countdown}s
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionModal;
