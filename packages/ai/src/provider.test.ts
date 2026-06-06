import { describe, it, expect } from 'vitest';
import { MockProvider } from './provider.js';

describe('MockProvider', () => {
  it('defaults the model name to "mock"', () => {
    expect(new MockProvider().model).toBe('mock');
  });

  it('uses a custom model name when provided', () => {
    expect(new MockProvider({ model: 'gpt-test' }).model).toBe('gpt-test');
  });

  it('returns queued texts in order with deterministic usage', async () => {
    const provider = new MockProvider({ texts: ['hello', 'world'] });

    const first = await provider.generateText({ prompt: 'abcd' });
    expect(first.text).toBe('hello');
    // ceil(4/4)+1 = 2 input, ceil(5/4)+1 = 3 output
    expect(first.usage).toEqual({ inputTokens: 2, outputTokens: 3 });

    const second = await provider.generateText({ prompt: 'x' });
    expect(second.text).toBe('world');
  });

  it('counts system characters toward input usage', async () => {
    const provider = new MockProvider({ texts: ['hi'] });
    const result = await provider.generateText({ prompt: 'abcd', system: 'efgh' });
    // ceil((4+4)/4)+1 = 3
    expect(result.usage.inputTokens).toBe(3);
  });

  it('throws when the text queue is exhausted', async () => {
    const provider = new MockProvider({ texts: ['only'] });
    await provider.generateText({ prompt: 'p' });
    expect(() => provider.generateText({ prompt: 'p' })).toThrow(
      'MockProvider: text queue exhausted',
    );
  });

  it('throws when no texts were queued', () => {
    const provider = new MockProvider();
    expect(() => provider.generateText({ prompt: 'p' })).toThrow(
      'MockProvider: text queue exhausted',
    );
  });

  it('returns queued objects in order with usage from serialized output', async () => {
    const provider = new MockProvider({ objects: [{ a: 1 }, { b: 2 }] });

    const first = await provider.generateObject<{ a: number }>({
      prompt: 'p',
      schema: {},
    });
    expect(first.object).toEqual({ a: 1 });
    expect(first.usage.inputTokens).toBe(2); // ceil(1/4)+1 = 2
    expect(first.usage.outputTokens).toBe(Math.ceil(JSON.stringify({ a: 1 }).length / 4) + 1);

    const second = await provider.generateObject<{ b: number }>({ prompt: 'p', schema: {} });
    expect(second.object).toEqual({ b: 2 });
  });

  it('throws when the object queue is exhausted', () => {
    const provider = new MockProvider();
    expect(() => provider.generateObject({ prompt: 'p', schema: {} })).toThrow(
      'MockProvider: object queue exhausted',
    );
  });
});
