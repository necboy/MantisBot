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

      console.log(`[Skills] Total skills found by loadSkillsFromDir: ${result.skills.length}`);
      console.log(`[Skills] Skills directory: ${SKILLS_DIR}`);

      // 打印前 10 个和后 10 个 skill 名称
      const skillNames = result.skills.map(s => s.name);
      console.log('[Skills] First 10 skills:', skillNames.slice(0, 10).join(', '));
      console.log('[Skills] Last 10 skills:', skillNames.slice(-10).join(', '));

      // 检查 Office skills 是否存在
      const officeSkills = ['word-editor', 'excel-editor', 'ppt-editor'];
      for (const name of officeSkills) {
        const found = result.skills.find(s => s.name === name);
        console.log(`[Skills] ${name}: ${found ? '✅ Found' : '❌ Not found'}`);
      }

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

  get(name: string): LoadedSkill | undefined {
    return this.skills.get(name);
  }

  list(): LoadedSkill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Get all skills formatted for AI prompt
   */
  getPromptContent(): string {
    return formatSkillsForPrompt(this.allSkills);
  }

  /**
   * Check if a skill is available
   */
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
