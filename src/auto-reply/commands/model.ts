// src/auto-reply/commands/model.ts

import type { CommandRegistry } from './registry.js';
import { getConfig, saveConfig } from '../../config/loader.js';

/**
 * 注册 /model 命令
 *
 * 参考 OpenClaw 的 /model 命令逻辑，适配 MantisBot 的单一 defaultModel 设计。
 *
 * 用法：
 *   /model            → 列出所有已配置的模型，标注当前默认
 *   /model <名称>     → 切换默认模型（立即生效，持久化到 config.json）
 */
export function registerModelCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'model',
    description: '查看所有模型或切换当前默认模型（/model 或 /model <名称>）',
    aliases: ['models', 'llm'],
    handler: async (args, _context) => {
      const config = getConfig();
      const currentDefault = config.defaultModel || config.models[0]?.name;

      // 无参数：列出所有模型
      if (args.length === 0) {
        const modelLines: string[] = [];

        for (const m of config.models) {
          const isCurrent = m.name === currentDefault;
          const marker = isCurrent ? '▶ ' : '　';
          modelLines.push(`- ${marker}**${m.name}** \`${m.provider || m.protocol || 'openai'} / ${m.model}\``);
        }

        return [
          '🤖 **已配置的模型**',
          '',
          modelLines.join('\n'),
          '',
          `💡 切换模型：\`/model <名称>\`，例如 \`/model claude\``,
        ].join('\n');
      }

      // 有参数：切换模型
      const targetName = args[0].toLowerCase();
      const targetModel = config.models.find(
        m => m.name.toLowerCase() === targetName
      );

      if (!targetModel) {
        const available = config.models.map(m => m.name).join('、');
        return `❌ 找不到模型 \`${args[0]}\`。\n\n可用模型：${available}`;
      }

      if (targetModel.name === currentDefault) {
        return `ℹ️ 当前已经在使用 **${targetModel.name}**（${targetModel.provider || targetModel.protocol || 'openai'} / ${targetModel.model}）。`;
      }

      // 持久化保存
      await saveConfig({ ...config, defaultModel: targetModel.name });

      console.log(`[Command/model] 默认模型切换：${currentDefault} → ${targetModel.name}`);

      return `✅ 已切换到 **${targetModel.name}**（${targetModel.provider || targetModel.protocol || 'openai'} / ${targetModel.model}）。\n\n下一条消息起生效。`;
    },
  });
}
