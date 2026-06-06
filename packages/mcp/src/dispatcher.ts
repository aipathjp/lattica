/**
 * ToolDispatcher — a thin, transport-agnostic router over a set of
 * {@link GridTool}s.
 *
 * It owns the name → tool index and turns the handlers' throw-on-error contract
 * into a uniform {@link ToolCallResult} envelope. This is the seam a real MCP
 * server (or any other transport) plugs into: it stays free of wire framing,
 * networking, and SDK dependencies, so it is fully testable offline.
 */

import type { GridTool } from './tools.js';

/** The uniform result of invoking a tool through the dispatcher. */
export interface ToolCallResult {
  /** Whether the call succeeded. */
  ok: boolean;
  /** The handler's return value (present only on success). */
  output?: unknown;
  /** A human-readable failure reason (present only on failure). */
  error?: string;
}

/** A tool's public metadata, without its handler. */
interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: object;
}

export class ToolDispatcher {
  private readonly tools = new Map<string, GridTool>();

  constructor(tools: GridTool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /** List the registered tools' metadata (handlers omitted). */
  list(): ToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /** Whether a tool with the given name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Invoke a tool by name. An unknown tool, or a handler that throws, both
   * surface as `{ ok: false, error }`; success yields `{ ok: true, output }`.
   */
  call(name: string, input: unknown): ToolCallResult {
    const tool = this.tools.get(name);
    if (tool === undefined) {
      return { ok: false, error: `unknown tool: ${name}` };
    }
    try {
      return { ok: true, output: tool.handler(input) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}
