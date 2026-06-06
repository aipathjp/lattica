/**
 * AIClient — a thin governance layer over an {@link AIProvider}.
 *
 * It enforces a per-instance call budget, injects a default
 * `maxOutputTokens` into requests that omit one, and accumulates token usage
 * across every call so callers can meter cost. The provider itself stays
 * provider-agnostic and is injected by the caller.
 */

import type {
  AIProvider,
  AIUsage,
  GenerateObjectRequest,
  GenerateObjectResult,
  GenerateTextRequest,
  GenerateTextResult,
} from './provider.js';

/** Guard rails applied by {@link AIClient}. */
export interface AILimits {
  /** Default `maxOutputTokens` injected into requests that omit one. */
  maxOutputTokens?: number;
  /** Maximum number of provider calls allowed for this client's lifetime. */
  maxCalls?: number;
}

export class AIClient {
  private readonly provider: AIProvider;
  private readonly limits: AILimits;
  private callCount = 0;
  private usage: AIUsage = { inputTokens: 0, outputTokens: 0 };

  constructor(provider: AIProvider, limits: AILimits = {}) {
    this.provider = provider;
    this.limits = limits;
  }

  /** Reserve a call slot, throwing if the budget is exhausted. */
  private reserveCall(): void {
    if (this.limits.maxCalls !== undefined && this.callCount >= this.limits.maxCalls) {
      throw new Error(`AIClient: maxCalls (${this.limits.maxCalls}) exceeded`);
    }
    this.callCount += 1;
  }

  /** Apply the default `maxOutputTokens` when the request omits one. */
  private withDefaults<T extends { maxOutputTokens?: number }>(req: T): T {
    if (req.maxOutputTokens === undefined && this.limits.maxOutputTokens !== undefined) {
      return { ...req, maxOutputTokens: this.limits.maxOutputTokens };
    }
    return req;
  }

  private accumulate(usage: AIUsage): void {
    this.usage = {
      inputTokens: this.usage.inputTokens + usage.inputTokens,
      outputTokens: this.usage.outputTokens + usage.outputTokens,
    };
  }

  async generateText(req: GenerateTextRequest): Promise<GenerateTextResult> {
    this.reserveCall();
    const result = await this.provider.generateText(this.withDefaults(req));
    this.accumulate(result.usage);
    return result;
  }

  async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResult<T>> {
    this.reserveCall();
    const result = await this.provider.generateObject<T>(this.withDefaults(req));
    this.accumulate(result.usage);
    return result;
  }

  /** Accumulated token usage across all calls. */
  getUsage(): AIUsage {
    return { ...this.usage };
  }

  /** Number of provider calls made so far. */
  getCallCount(): number {
    return this.callCount;
  }

  /** Reset accumulated usage (call count is unaffected). */
  resetUsage(): void {
    this.usage = { inputTokens: 0, outputTokens: 0 };
  }
}
