import { describe, it, expect } from 'vitest';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';
import { summarizeValues, translateValues, classifyValues } from './text-ops.js';

function textClient(...texts: string[]): AIClient {
  return new AIClient(new MockProvider({ texts }));
}

function objectClient(...objects: unknown[]): AIClient {
  return new AIClient(new MockProvider({ objects }));
}

describe('summarizeValues', () => {
  it('returns the model text for non-empty input', async () => {
    const client = textClient('A concise summary.');
    const out = await summarizeValues(client, ['apple', 'banana', 'cherry']);
    expect(out).toBe('A concise summary.');
    expect(client.getCallCount()).toBe(1);
  });

  it('honors the maxWords option in the prompt', async () => {
    const provider = new MockProvider({ texts: ['short'] });
    const client = new AIClient(provider);
    const out = await summarizeValues(client, ['x', 'y'], { maxWords: 5 });
    expect(out).toBe('short');
  });

  it('returns an empty string for empty input without calling the model', async () => {
    const client = textClient();
    const out = await summarizeValues(client, []);
    expect(out).toBe('');
    expect(client.getCallCount()).toBe(0);
  });
});

describe('translateValues', () => {
  it('returns translations when the length matches (happy path)', async () => {
    const client = objectClient({ translations: ['りんご', 'ばなな'] });
    const out = await translateValues(client, ['apple', 'banana'], 'Japanese');
    expect(out).toEqual(['りんご', 'ばなな']);
    expect(client.getCallCount()).toBe(1);
  });

  it('falls back to the originals when the returned length mismatches', async () => {
    const client = objectClient({ translations: ['only-one'] });
    const out = await translateValues(client, ['apple', 'banana'], 'Japanese');
    expect(out).toEqual(['apple', 'banana']);
  });

  it('returns an empty array for empty input without calling the model', async () => {
    const client = objectClient();
    const out = await translateValues(client, [], 'Japanese');
    expect(out).toEqual([]);
    expect(client.getCallCount()).toBe(0);
  });
});

describe('classifyValues', () => {
  const labels = ['fruit', 'vegetable'];

  it('returns the model labels when in-set and length matches (happy path)', async () => {
    const client = objectClient({ labels: ['fruit', 'vegetable'] });
    const out = await classifyValues(client, ['apple', 'carrot'], labels);
    expect(out).toEqual(['fruit', 'vegetable']);
    expect(client.getCallCount()).toBe(1);
  });

  it('coerces out-of-set labels to the first provided label', async () => {
    const client = objectClient({ labels: ['fruit', 'mystery'] });
    const out = await classifyValues(client, ['apple', 'carrot'], labels);
    expect(out).toEqual(['fruit', 'fruit']);
  });

  it('fills with the first label when the returned length mismatches', async () => {
    const client = objectClient({ labels: ['fruit'] });
    const out = await classifyValues(client, ['apple', 'carrot'], labels);
    expect(out).toEqual(['fruit', 'fruit']);
  });

  it('returns an empty array for empty input without calling the model', async () => {
    const client = objectClient();
    const out = await classifyValues(client, [], labels);
    expect(out).toEqual([]);
    expect(client.getCallCount()).toBe(0);
  });

  it('throws when no labels are provided for non-empty input', async () => {
    const client = objectClient();
    await expect(classifyValues(client, ['apple'], [])).rejects.toThrow(
      'classifyValues: at least one label is required',
    );
    expect(client.getCallCount()).toBe(0);
  });
});
