// src/hooks/loader.ts

export type HookEvent =
  | 'message.received'
  | 'message.sent'
  | 'session.created'
  | 'session.updated'
  | 'agent.start'
  | 'agent.end'
  | 'tool.called';

export interface HookContext {
  event: HookEvent;
  timestamp: number;
  data: Record<string, unknown>;
}

export type HookHandler = (context: HookContext) => Promise<void>;

export class HooksLoader {
  private handlers: Map<HookEvent, HookHandler[]> = new Map();

  register(event: HookEvent, handler: HookHandler): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  async emit(event: HookEvent, data: Record<string, unknown>): Promise<void> {
    const handlers = this.handlers.get(event) || [];
    const context: HookContext = {
      event,
      timestamp: Date.now(),
      data,
    };

    for (const handler of handlers) {
      try {
        await handler(context);
      } catch (error) {
        console.error(`[Hooks] Error in ${event} handler:`, error);
      }
    }
  }

  listEvents(): HookEvent[] {
    return Array.from(this.handlers.keys());
  }
}

// Global instance
let hooksLoader: HooksLoader | null = null;

export function getHooksLoader(): HooksLoader {
  if (!hooksLoader) {
    hooksLoader = new HooksLoader();
  }
  return hooksLoader;
}
