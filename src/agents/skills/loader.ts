// src/agents/skills/loader.ts

import { readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadSkillsFromDir, type Skill, formatSkillsForPrompt } from '@mariozechner/pi-coding-agent';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../../../skills');

export interface SkillContext {
  message: string;
  userId: string;
  sessionId: string;
  args: Record<string, string>;
}

export interface SkillResult {
  response: string;
  success: boolean;
}

export interface LoadedSkill {
  skill: Skill;
  name: string;
  description: string;
}

export class SkillsLoader {
  private skills: Map<string, LoadedSkill> = new Map();
  private allSkills: Skill[] = [];

  async load(): Promise<void> {
    try {
      // Load skills from directory using pi-coding-agent
      const result = loadSkillsFromDir({ dir: SKILLS_DIR, source: 'skills' });
      this.allSkills = result.skills;

      for (const skill of this.allSkills) {
        this.skills.set(skill.name, {
          skill,
          name: skill.name,
          description: skill.description || '',
        });
      }

      console.log(`[Skills] Loaded ${this.skills.size} skills from ${SKILLS_DIR}`);
    } catch (error) {
      console.warn('[Skills] Failed to load skills:', error);
    }
  }

  /**
   * 热重载：清空缓存后重新扫描 skills 目录，无需重启服务
   */
  async reload(): Promise<{ count: number }> {
    this.skills.clear();
    this.allSkills = [];
    await this.load();
    return { count: this.skills.size };
  }

  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get skills formatted for AI prompt
   * If enabledSkills is empty, ALL skills are disabled (default disabled mode)
   * If enabledSkills has values, only those skills are enabled
   */
  getPromptContent(enabledSkills: string[] = []): string {
    let filteredSkills: Skill[];

    if (enabledSkills.length === 0) {
      // 默认禁用所有 skills
      console.log('[Skills] No enabled skills configured, all skills disabled');
      filteredSkills = [];
    } else {
      // 只启用配置的 skills
      filteredSkills = this.allSkills.filter(
        skill => enabledSkills.includes(skill.name)
      );
      console.log(`[Skills] Enabled skills: ${filteredSkills.map(s => s.name).join(', ')}`);
    }

    return formatSkillsForPrompt(filteredSkills);
  }

  /**
   * Check if a skill is available
   */
  getSkillsDir(): string {
    return SKILLS_DIR;
  }

  hasSkill(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): Skill | undefined {
    const loaded = this.skills.get(name);
    return loaded?.skill;
  }

  async execute(name: string, context: SkillContext): Promise<SkillResult> {
    const skill = this.skills.get(name);
    if (!skill) {
      return { response: `Skill not found: ${name}`, success: false };
    }

    try {
      // For now, return a placeholder - actual execution depends on skill type
      return {
        response: `Skill "${name}" is available. Description: ${skill.description}`,
        success: true,
      };
    } catch (error) {
      return { response: `Error: ${error}`, success: false };
    }
  }
}
