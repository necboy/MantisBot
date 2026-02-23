// src/agents/tools/types.ts

export interface Tool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  execute: (args: any) => Promise<any>;
}

export interface ToolResult {
  success: boolean;
  output?: any;
  error?: string;
}
