import { describe, it, expect } from 'vitest';
import { AIClient } from './client.js';
import { MockProvider, type AIProvider, type GenerateTextRequest } from './provider.js';

describe('AIClient', () => {
  it('generates text, counts the call, and accumulates usage', async () => {
    const provider = new MockProvider({ texts: ['hi'] });
    const client = new AIClient(provider);

    const result = await client.generateText({ prompt: 'abcd' });
    expect(result.text).toBe('hi');
    expect(client.getCallCount()).toBe(1);
    expect(client.getUsage()).toEqual(result.usage);
  });

  it('generates objects and accumulates usage across mixed calls', async () => {
    const provider = new MockProvider({ texts: ['hi'], objects: [{ ok: true }] });
    const client = new AIClient(provider);

    const text = await client.generateText({ prompt: 'a' });
    const obj = await client.generateObject<{ ok: boolean }>({ prompt: 'b', schema: {} });

    expect(obj.object).toEqual({ ok: true });
    expect(client.getCallCount()).toBe(2);
    expect(client.getUsage()).toEqual({
      inputTokens: text.usage.inputTokens + obj.usage.inputTokens,
      outputTokens: text.usage.outputTokens + obj.usage.outputTokens,
    });
  });

  it('returns a usage copy that is not affected by later calls', async () => {
    const provider = new MockProvider({ texts: ['a', 'b'] });
    const client = new AIClient(provider);

    await client.generateText({ prompt: 'p' });
    const snapshot = client.getUsage();
    await client.generateText({ prompt: 'p' });

    expect(snapshot).not.toEqual(client.getUsage());
  });

  it('throws when maxCalls is exceeded (text)', async () => {
    const provider = new MockProvider({ texts: ['a', 'b'] });
    const client = new AIClient(provider, { maxCalls: 1 });

    await client.generateText({ prompt: 'p' });
    await expect(client.generateText({ prompt: 'p' })).rejects.toThrow(
      'AIClient: maxCalls (1) exceeded',
    );
    expect(client.getCallCount()).toBe(1);
  });

  it('throws when maxCalls is exceeded (object)', async () => {
    const provider = new MockProvider({ objects: [{}, {}] });
    const client = new AIClient(provider, { maxCalls: 1 });

    await client.generateObject({ prompt: 'p', schema: {} });
    await expect(client.generateObject({ prompt: 'p', schema: {} })).rejects.toThrow(
      'AIClient: maxCalls (1) exceeded',
    );
  });

  it('injects the default maxOutputTokens when omitted', async () => {
    const seen: GenerateTextRequest[] = [];
    const provider: AIProvider = {
      model: 'spy',
      generateText(req) {
        seen.push(req);
        return Promise.resolve({ text: 't', usage: { inputTokens: 1, outputTokens: 1 } });
      },
      generateObject<T>() {
        return Promise.resolve({
          object: {} as T,
          usage: { inputTokens: 1, outputTokens: 1 },
        });
      },
    };
    const client = new AIClient(provider, { maxOutputTokens: 256 });

    await client.generateText({ prompt: 'p' });
    expect(seen[0]?.maxOutputTokens).toBe(256);
  });

  it('does not override an explicit maxOutputTokens', async () => {
    const seen: GenerateTextRequest[] = [];
    const provider: AIProvider = {
      model: 'spy',
      generateText(req) {
        seen.push(req);
        return Promise.resolve({ text: 't', usage: { inputTokens: 1, outputTokens: 1 } });
      },
      generateObject<T>() {
        return Promise.resolve({
          object: {} as T,
          usage: { inputTokens: 1, outputTokens: 1 },
        });
      },
    };
    const client = new AIClient(provider, { maxOutputTokens: 256 });

    await client.generateText({ prompt: 'p', maxOutputTokens: 10 });
    expect(seen[0]?.maxOutputTokens).toBe(10);
  });

  it('leaves maxOutputTokens unset when no default is configured', async () => {
    const seen: GenerateTextRequest[] = [];
    const provider: AIProvider = {
      model: 'spy',
      generateText(req) {
        seen.push(req);
        return Promise.resolve({ text: 't', usage: { inputTokens: 1, outputTokens: 1 } });
      },
      generateObject<T>() {
        return Promise.resolve({
          object: {} as T,
          usage: { inputTokens: 1, outputTokens: 1 },
        });
      },
    };
    const client = new AIClient(provider);

    await client.generateText({ prompt: 'p' });
    expect(seen[0]?.maxOutputTokens).toBeUndefined();
  });

  it('propagates MockProvider exhaustion', async () => {
    const provider = new MockProvider({ texts: ['only'] });
    const client = new AIClient(provider);

    await client.generateText({ prompt: 'p' });
    await expect(client.generateText({ prompt: 'p' })).rejects.toThrow(
      'MockProvider: text queue exhausted',
    );
  });

  it('resetUsage zeroes usage but keeps the call count', async () => {
    const provider = new MockProvider({ texts: ['a'] });
    const client = new AIClient(provider);

    await client.generateText({ prompt: 'p' });
    expect(client.getUsage().inputTokens).toBeGreaterThan(0);

    client.resetUsage();
    expect(client.getUsage()).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(client.getCallCount()).toBe(1);
  });
});
