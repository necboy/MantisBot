export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    toolCalls?: ToolCall[];
}
export interface Session {
    id: string;
    name?: string;
    model: string;
    messages: Message[];
    createdAt: number;
    updatedAt: number;
    metadata?: Record<string, unknown>;
}
export interface LLMMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    name?: string;
    toolCallId?: string;
}
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export interface LLMResponse {
    content: string;
    toolCalls?: ToolCall[];
    finishReason?: 'stop' | 'length' | 'tool_calls';
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export interface ToolResult {
    success: boolean;
    result?: unknown;
    error?: string;
}
export interface WSMessage {
    type: string;
    payload?: unknown;
}
export interface ChatRequest {
    sessionId?: string;
    message: string;
    model?: string;
    stream?: boolean;
}
export interface ChatResponse {
    sessionId: string;
    message: Message;
}
