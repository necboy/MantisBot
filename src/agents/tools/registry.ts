import type { Tool, ToolInfo } from '../../types.js';
import { loggerTool } from './logger.js';
import { readSkillTool } from './read-skill.js';
import { execTool } from './exec.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { sendFileTool } from './send-file.js';
import { browserTools } from './browser.js';
import { memorySearchTool } from './memory-search.js';
import { firecrawlTool } from './firecrawl.js';

const builtInTools: Record<string, Tool> = {
  logger: loggerTool,
  read_skill: readSkillTool,
  exec: execTool,
  read: readTool,
  write: writeTool,
  edit: editTool,
  send_file: sendFileTool,
  memory_search: memorySearchTool,
  firecrawl: firecrawlTool
};

// Browser 工具（数组形式）
const browserToolsArray: Tool[] = browserTools;

// 核心工具（总是可用）
const CORE_TOOLS = ['read_skill', 'exec', 'read', 'write', 'edit', 'send_file', 'memory_search', 'firecrawl'];

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(enabledPlugins: string[] = []) {
    // Load core tools (always available)
    for (const name of CORE_TOOLS) {
      if (builtInTools[name]) {
        this.tools.set(name, builtInTools[name]);
      }
    }

    // Load built-in tools from config
    for (const name of enabledPlugins) {
      if (builtInTools[name]) {
        this.tools.set(name, builtInTools[name]);
      }
    }

    // Load browser tools if 'browser' is enabled
    if (enabledPlugins.includes('browser')) {
      for (const tool of browserToolsArray) {
        this.tools.set(tool.name, tool);
      }
    }
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolInfo[] {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  /**
   * 获取工具列表（listTools 别名）
   */
  list(): ToolInfo[] {
    return this.listTools();
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(params);
  }

  /**
   * 执行工具（executeTool 别名）
   */
  async execute(name: string, params: Record<string, unknown>): Promise<unknown> {
    return this.executeTool(name, params);
  }
}
