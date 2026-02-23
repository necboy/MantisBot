// src/agents/preference-detector.ts

import { Message } from '../types.js';
import { getLLMClient } from './llm-client.js';

/**
 * 用户偏好接口
 */
export interface UserPreference {
  key: string;           // 偏好标识，如 "response_length", "tone"
  description: string;    // 偏好描述
  evidence: string[];     // 支持证据（用户表达）
  confidence: number;     // 置信度 0-1
  suggestion?: string;    // 建议的调整
}

/**
 * LLM 返回的偏好分析结果
 */
interface LLMPreferenceResult {
  type: string;
  value: string;
  confidence: number;
  evidence: string[];
  suggestion?: string;
}

interface LLMAnalysisResult {
  preferences: LLMPreferenceResult[];
  summary: string;
}

/**
 * 偏好检测器
 *
 * 使用 LLM 智能分析用户对话历史，检测用户偏好变化，
 * 为 Agent 性格自动演变提供数据支持
 */
export class PreferenceDetector {
  // 置信度阈值
  private readonly EVOLUTION_THRESHOLD = 0.7;

  /**
   * 使用 LLM 检测用户偏好
   * @param messages 消息历史
   * @returns 检测到的偏好列表
   */
  async detectPreferences(messages: Message[]): Promise<UserPreference[]> {
    // 转换为简化格式，只保留 user 和 assistant 角色
    const chatMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    console.log('[PreferenceDetector] Analyzing', chatMessages.length, 'messages with LLM');

    // 构建对话历史文本
    const conversationText = chatMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    // 构建分析提示词
    const analysisPrompt = this.buildAnalysisPrompt(conversationText);

    try {
      // 调用 LLM 进行分析
      const llm = getLLMClient();
      const result = await llm.simpleChat(analysisPrompt);

      // 解析 LLM 返回的 JSON
      const parsed = this.parseLLMResult(result);

      // 转换为 UserPreference 格式
      const preferences: UserPreference[] = parsed.preferences.map((p) => ({
        key: p.type,
        description: this.formatDescription(p.type, p.value),
        evidence: p.evidence,
        confidence: p.confidence,
        suggestion: p.suggestion,
      }));

      console.log('[PreferenceDetector] LLM detected', preferences.length, 'preferences');
      return preferences;
    } catch (error) {
      console.error('[PreferenceDetector] LLM analysis failed:', error);
      // LLM 分析失败时返回空数组
      return [];
    }
  }

  /**
   * 构建分析提示词
   */
  private buildAnalysisPrompt(conversation: string): string {
    return `你是一个用户偏好分析专家。请分析以下对话历史，识别用户的偏好模式。

## 对话历史
${conversation}

## 分析要求

请分析并返回 JSON 格式的结果，包含以下偏好类型：

1. **response_length** (回复长度): concise(简洁) / detailed(详细) / balanced(平衡)
2. **explanation_level** (解释程度): minimal(最少) / moderate(适度) / extensive(详细)
3. **tone** (语气): formal(正式) / casual(随意) / flexible(灵活)
4. **format** (格式): bullet(列表) / paragraph(段落) / code(代码) / mixed(混合)

## 输出格式

请返回以下 JSON 格式：

{
  "preferences": [
    {
      "type": "response_length",
      "value": "concise|detailed|balanced",
      "confidence": 0.0-1.0,
      "evidence": ["用户表达1", "用户表达2"],
      "suggestion": "具体的调整建议"
    }
  ],
  "summary": "一句话总结用户偏好"
}

## 注意事项

- 只返回检测到明确偏好的项，没有偏好时返回空数组
- confidence 表示置信度，基于证据的强度
- evidence 应该包含用户明确表达偏好的具体语句
- 如果没有检测到明确偏好，返回空偏好数组
- 只返回 JSON，不要其他内容`;
  }

  /**
   * 解析 LLM 返回的结果
   */
  private parseLLMResult(result: string): LLMAnalysisResult {
    try {
      // 尝试提取 JSON（可能有 markdown 包裹）
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return { preferences: [], summary: '' };
    } catch (error) {
      console.error('[PreferenceDetector] Failed to parse LLM result:', error);
      return { preferences: [], summary: '' };
    }
  }

  /**
   * 格式化偏好描述
   */
  private formatDescription(type: string, value: string): string {
    const descriptions: Record<string, Record<string, string>> = {
      response_length: {
        concise: '偏好简洁、直接的回复',
        detailed: '偏好详细、全面的回复',
        balanced: '偏好平衡适中的回复',
      },
      explanation_level: {
        minimal: '偏好最少的解释，直接给答案',
        moderate: '偏好适度的解释',
        extensive: '偏好详细的解释和说明',
      },
      tone: {
        formal: '偏好正式、礼貌的回复风格',
        casual: '偏好轻松、随意的回复风格',
        flexible: '对语气没有特别偏好',
      },
      format: {
        bullet: '偏好使用列表格式',
        paragraph: '偏好使用段落格式',
        code: '偏好包含代码示例',
        mixed: '对格式没有特别偏好',
      },
    };

    return descriptions[type]?.[value] || `${type}: ${value}`;
  }

  /**
   * 检查是否需要触发演变提议
   * @param preferences 偏好列表
   * @returns 是否应该触发演变
   */
  shouldTriggerEvolution(preferences: UserPreference[]): boolean {
    // 检查是否有高置信度的偏好
    const highConfidencePrefs = preferences.filter((p) => p.confidence >= this.EVOLUTION_THRESHOLD);

    if (highConfidencePrefs.length > 0) {
      console.log('[PreferenceDetector] Evolution recommended for preferences:', highConfidencePrefs.map(p => p.key).join(', '));
      return true;
    }

    return false;
  }

  /**
   * 获取需要演变的偏好（用于提示 Agent）
   * @param preferences 偏好列表
   * @returns 演变建议文本
   */
  getEvolutionSuggestion(preferences: UserPreference[]): string {
    const highConfidencePrefs = preferences.filter((p) => p.confidence >= this.EVOLUTION_THRESHOLD);

    if (highConfidencePrefs.length === 0) {
      return '';
    }

    const suggestions = highConfidencePrefs.map((pref) => {
      return `- ${pref.description} (置信度: ${Math.round(pref.confidence * 100)}%)\n  建议: ${pref.suggestion || '无'}\n  证据: ${pref.evidence.slice(0, 2).join('; ')}`;
    });

    return `根据对话分析，检测到以下用户偏好:\n${suggestions.join('\n')}`;
  }
}

// 导出单例实例
export const preferenceDetector = new PreferenceDetector();
