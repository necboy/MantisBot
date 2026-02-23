// src/auto-reply/commands/help.ts

import { CommandRegistry } from './registry.js';

export function registerHelpCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'help',
    description: '显示帮助信息',
    aliases: ['h', '?'],
    async handler() {
      const commands = registry.list();
      const helpText = commands
        .map(c => `/${c.name} - ${c.description}`)
        .join('\n');

      return `可用命令:\n${helpText}`;
    },
  });
}
