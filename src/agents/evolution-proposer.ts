// src/agents/evolution-proposer.ts

import { ProfileLoader } from './profile-loader.js';
import { UserPreference } from './preference-detector.js';

/**
 * Profile 文件类型
 */
export type ProfileFile = 'SOUL.md' | 'IDENTITY.md' | 'USER.md';

/**
 * 演变提议状态
 */
export type EvolutionStatus = 'pending' | 'approved' | 'rejected';

/**
 * 演变提议接口
 */
export interface EvolutionProposal {
  id: string;                              // 唯一标识
  profileName: string;                     // profile 名称
  file: ProfileFile;                       // 要修改的文件
  currentContent: string;                  // 当前内容
  proposedContent: string;                 // 提议的新内容
  reason: string;                          // 修改理由
  preferences: UserPreference[];           // 关联的偏好
  status: EvolutionStatus;                 // 状态
  createdAt: number;                       // 创建时间
}

/**
 * 偏好类型到目标文件的映射配置
 */
interface PreferenceFileMapping {
  file: ProfileFile;
  // 匹配规则：key 是偏好键，value 是修改内容生成函数
  generateNewContent: (currentContent: string, preference: UserPreference) => string;
}

/**
 * 演变提议生成器
 *
 * 负责基于检测到的用户偏好生成性格修改提议
 */
export class EvolutionProposer {
  private profileLoader: ProfileLoader;

  // 偏好类型到目标文件的映射
  private readonly preferenceMappings: Record<string, PreferenceFileMapping> = {
    // ======== LLM 返回的新偏好类型 ========
    // response_length → IDENTITY.md
    response_length: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        const value = pref.suggestion || 'concise';
        const isConcise = pref.description.includes('简洁');
        const isDetailed = pref.description.includes('详细');
        const style = isConcise ? '简洁、直接、切中要点' : isDetailed ? '详细、全面、解释充分' : '平衡、适度';
        const desc = isConcise ? '用户希望回复简洁明了，避免冗长' : isDetailed ? '用户希望得到详细全面的回复' : '用户对回复长度没有特别偏好';
        return EvolutionProposer.updateOrAddSection(content, '回复风格', style, `根据用户偏好：${pref.description}。${desc}。`);
      },
    },

    // explanation_level → IDENTITY.md
    explanation_level: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        const isMinimal = pref.description.includes('最少') || pref.description.includes('简洁');
        const isExtensive = pref.description.includes('详细');
        const style = isMinimal ? '简洁、减少解释、直接给答案' : isExtensive ? '详细、充分解释、步骤完整' : '适度解释、平衡信息量';
        const desc = isMinimal ? '用户希望最少解释，直接给答案' : isExtensive ? '用户希望详细的解释和说明' : '用户对解释程度没有特别偏好';
        return EvolutionProposer.updateOrAddSection(content, '回复风格', style, `根据用户偏好：${pref.description}。${desc}。`);
      },
    },

    // tone → IDENTITY.md
    tone: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        const isFormal = pref.description.includes('正式');
        const isCasual = pref.description.includes('随意') || pref.description.includes('轻松');
        const style = isFormal ? '正式、礼貌、严谨' : isCasual ? '轻松、随意、自然' : '灵活、随场景调整';
        const desc = isFormal ? '用户倾向于正式的语言' : isCasual ? '用户倾向于轻松自然的交流方式' : '用户对语气没有特别偏好';
        return EvolutionProposer.updateOrAddSection(content, '回复风格', style, `根据用户偏好：${pref.description}。${desc}。`);
      },
    },

    // format → IDENTITY.md
    format: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        const isBullet = pref.description.includes('列表');
        const isParagraph = pref.description.includes('段落');
        const style = isBullet ? '优先使用列表格式' : isParagraph ? '使用段落格式' : '根据内容选择合适格式';
        return EvolutionProposer.updateOrAddSection(content, '回复格式', style, `根据用户偏好：${pref.description}。`);
      },
    },

    // ======== 旧版偏好类型（兼容） ========
    // 语气偏好 → IDENTITY.md
    formal_tone: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '正式、礼貌、严谨',
          `根据用户偏好：${pref.description}。用户倾向于使用正式的语言（如"请"、"感谢"等），期望得到礼貌、严谨的回复。`
        );
      },
    },
    casual_tone: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '轻松、随意、自然',
          `根据用户偏好：${pref.description}。用户倾向于使用轻松自然的交流方式，回复可以更口语化。`
        );
      },
    },

    // 回复长度偏好 → IDENTITY.md
    brief_responses: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '简洁、直接、切中要点',
          `根据用户偏好：${pref.description}。用户希望回复简洁明了，避免冗长的解释，直接给出核心信息。`
        );
      },
    },
    detailed_responses: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '详细、全面、解释充分',
          `根据用户偏好：${pref.description}。用户希望得到详细全面的回复，愿意接受充分的解释说明。`
        );
      },
    },

    // 不满表达 → IDENTITY.md
    too_much_explanation: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '简洁、直接、减少解释',
          `根据用户反馈：${pref.description}。用户对过多的解释感到不满，回复应更加简洁，直接给出结论。`
        );
      },
    },
    too_brief: {
      file: 'IDENTITY.md',
      generateNewContent: (content: string, pref: UserPreference) => {
        return EvolutionProposer.updateOrAddSection(
          content,
          '回复风格',
          '适度详细、完整表达',
          `根据用户反馈：${pref.description}。用户认为回复过于简短，应提供更充分的信息和说明。`
        );
      },
    },
  };

  constructor(profileLoader?: ProfileLoader) {
    this.profileLoader = profileLoader || new ProfileLoader();
  }

  /**
   * 生成演变提议
   * @param preferences 检测到的用户偏好列表
   * @param profileName 指定的 profile 名称（可选，默认使用当前激活的 profile）
   * @returns 演变提议对象
   */
  async generateProposal(
    preferences: UserPreference[],
    profileName?: string
  ): Promise<EvolutionProposal | null> {
    // 获取目标 profile
    const targetProfileName = profileName || await this.profileLoader.getActiveProfileName();
    const profile = await this.profileLoader.getProfile(targetProfileName);

    if (!profile) {
      console.error(`[EvolutionProposer] Profile not found: ${targetProfileName}`);
      return null;
    }

    console.log(`[EvolutionProposer] Generating proposal for profile: ${targetProfileName}`);
    console.log(`[EvolutionProposer] Processing ${preferences.length} preferences`);

    // 选择最高置信度的偏好来生成提议
    if (!preferences || preferences.length === 0) {
      console.log('[EvolutionProposer] No preferences to process');
      return null;
    }

    const primaryPreference = preferences.reduce((prev, curr) =>
      curr.confidence > prev.confidence ? curr : prev
    );

    // 查找对应的映射
    const mapping = this.preferenceMappings[primaryPreference.key];

    if (!mapping) {
      console.log(`[EvolutionProposer] No mapping found for preference: ${primaryPreference.key}`);
      // 对于未映射的偏好，默认使用 IDENTITY.md
      return this.createGenericProposal(
        targetProfileName,
        'IDENTITY.md',
        profile.identity || '',
        primaryPreference,
        preferences
      );
    }

    // 获取当前文件内容
    const currentContent = this.getFileContent(profile, mapping.file);

    // 生成新的内容
    const proposedContent = mapping.generateNewContent(currentContent, primaryPreference);

    // 生成修改理由
    const reason = this.generateReason(primaryPreference, preferences);

    // 创建提议对象
    const proposal: EvolutionProposal = {
      id: crypto.randomUUID(),
      profileName: targetProfileName,
      file: mapping.file,
      currentContent,
      proposedContent,
      reason,
      preferences,
      status: 'pending',
      createdAt: Date.now(),
    };

    console.log(`[EvolutionProposer] Generated proposal: ${proposal.id}, file: ${proposal.file}`);
    return proposal;
  }

  /**
   * 创建通用的演变提议（用于未预定义的偏好）
   */
  private createGenericProposal(
    profileName: string,
    file: ProfileFile,
    currentContent: string,
    primaryPreference: UserPreference,
    allPreferences: UserPreference[]
  ): EvolutionProposal {
    // 简单地在文件末尾添加偏好信息
    const proposedContent = currentContent + '\n\n## 用户偏好更新\n' +
      allPreferences.map(p => `- ${p.description} (置信度: ${Math.round(p.confidence * 100)}%)`).join('\n');

    const reason = this.generateReason(primaryPreference, allPreferences);

    return {
      id: crypto.randomUUID(),
      profileName,
      file,
      currentContent,
      proposedContent,
      reason,
      preferences: allPreferences,
      status: 'pending',
      createdAt: Date.now(),
    };
  }

  /**
   * 从 profile 中获取指定文件的内容
   */
  private getFileContent(profile: Awaited<ReturnType<ProfileLoader['getProfile']>>, file: ProfileFile): string {
    switch (file) {
      case 'SOUL.md':
        return profile?.soul || '';
      case 'IDENTITY.md':
        return profile?.identity || '';
      case 'USER.md':
        return profile?.user || '';
      default:
        return '';
    }
  }

  /**
   * 生成修改理由
   */
  private generateReason(primaryPreference: UserPreference, allPreferences: UserPreference[]): string {
    const evidence = primaryPreference.evidence.length > 0
      ? primaryPreference.evidence.slice(0, 2).join('；')
      : '无具体证据';
    const otherPrefs = allPreferences
      .filter(p => p.key !== primaryPreference.key)
      .map(p => p.description)
      .join('、');

    let reason = `根据用户行为分析，检测到偏好"${primaryPreference.description}"（置信度 ${Math.round(primaryPreference.confidence * 100)}%）。`;
    reason += `\n证据：${evidence}。`;

    if (otherPrefs) {
      reason += `\n同时检测到其他偏好：${otherPrefs}。`;
    }

    return reason;
  }

  /**
   * 更新或添加配置项
   * 这是一个辅助方法，用于在配置文件中更新或添加特定部分
   */
  static updateOrAddSection(
    content: string,
    sectionName: string,
    summary: string,
    detail: string
  ): string {
    // 尝试找到现有部分
    const sectionRegex = new RegExp(`^##\\s*${sectionName}\\s*\\n[\\s\\S]*?(?=\\n##\\s|\\n#\\s|\\n*$)`);
    const match = content.match(sectionRegex);

    if (match) {
      // 更新现有部分
      const sectionContent = match[0];
      // 检查是否需要更新 summary 和 detail
      let updated = sectionContent;

      // 更新 summary 行（如果有）
      const summaryRegex = new RegExp(`^(${sectionName}:?\\s*)(.*)$`, 'm');
      if (summaryRegex.test(updated)) {
        updated = updated.replace(summaryRegex, `$1${summary}`);
      }

      // 如果没有 summary，直接替换整个 section
      if (!summaryRegex.test(updated)) {
        const newSection = `## ${sectionName}\n${summary}\n\n${detail}\n`;
        return content.replace(sectionRegex, newSection);
      }

      return content.replace(sectionRegex, updated);
    } else {
      // 添加新部分
      const newSection = `\n## ${sectionName}\n${summary}\n\n${detail}\n`;
      return content + newSection;
    }
  }

  /**
   * 为多个偏好生成提议
   * @param preferences 偏好列表
   * @param profileName 指定的 profile 名称
   * @returns 提议数组
   */
  async generateMultipleProposals(
    preferences: UserPreference[],
    profileName?: string
  ): Promise<EvolutionProposal[]> {
    const proposals: EvolutionProposal[] = [];
    const processedFiles = new Set<ProfileFile>();

    // 按优先级排序偏好
    const sortedPreferences = [...preferences].sort((a, b) => b.confidence - a.confidence);

    for (const pref of sortedPreferences) {
      const mapping = this.preferenceMappings[pref.key];

      if (!mapping) {
        continue;
      }

      // 避免同一文件生成多个提议
      if (processedFiles.has(mapping.file)) {
        continue;
      }

      const proposal = await this.generateProposal([pref], profileName);
      if (proposal) {
        proposals.push(proposal);
        processedFiles.add(mapping.file);
      }
    }

    return proposals;
  }
}

// 导出单例实例
export const evolutionProposer = new EvolutionProposer();
