// src/auto-reply/commands/registry.ts

export interface CommandContext {
  chatId: string;
  userId: string;
  platform: string;
}

export interface Command {
  name: string;
  description: string;
  aliases: string[];
  handler: (args: string[], context?: CommandContext) => Promise<string>;
}

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  register(command: Command): void {
    // Register main name
    this.commands.set(command.name, command);

    // Register aliases
    for (const alias of command.aliases) {
      this.commands.set(alias, command);
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name);
  }

  list(): Command[] {
    const seen = new Set<string>();
    const result: Command[] = [];

    for (const cmd of this.commands.values()) {
      if (!seen.has(cmd.name)) {
        seen.add(cmd.name);
        result.push(cmd);
      }
    }

    return result;
  }

  parse(message: string): { command: string; args: string[] } | null {
    const trimmed = message.trim();
    if (!trimmed.startsWith('/')) {
      return null;
    }

    const parts = trimmed.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    return { command, args };
  }
}

/**
 * 注册帮助命令
 */
export function registerHelpCommand(registry: CommandRegistry): void {
  registry.register({
    name: 'help',
    description: '显示可用命令列表',
    aliases: ['h', '?'],
    handler: async () => {
      const commands = registry.list();
      const lines = ['**可用命令**', ''];
      for (const cmd of commands) {
        const aliases = cmd.aliases.length > 0 ? ` *(${cmd.aliases.join(', ')})*` : '';
        lines.push(`- \`/${cmd.name}\`${aliases} — ${cmd.description}`);
      }
      return lines.join('\n');
    }
  });
}
