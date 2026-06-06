import { describe, it, expect } from 'vitest';
import { inferRule, applyRule, smartFill, type FillRule, type FillExample } from './smart-fill.js';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';

describe('inferRule', () => {
  it('returns null for an empty example set', () => {
    expect(inferRule([])).toBeNull();
  });

  it('infers identity', () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'abc' },
      { input: 'xyz', output: 'xyz' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'identity' });
  });

  it('infers upper', () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'ABC' },
      { input: 'de', output: 'DE' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'upper' });
  });

  it('infers lower', () => {
    const examples: FillExample[] = [
      { input: 'ABC', output: 'abc' },
      { input: 'DE', output: 'de' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'lower' });
  });

  it('infers prefix', () => {
    const examples: FillExample[] = [
      { input: '123', output: 'ID-123' },
      { input: '99', output: 'ID-99' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'prefix', text: 'ID-' });
  });

  it('infers suffix', () => {
    const examples: FillExample[] = [
      { input: 'file', output: 'file.txt' },
      { input: 'doc', output: 'doc.txt' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'suffix', text: '.txt' });
  });

  it('infers splitField', () => {
    const examples: FillExample[] = [
      { input: 'John,Doe', output: 'John' },
      { input: 'Jane,Roe', output: 'Jane' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'splitField', sep: ',', index: 0 });
  });

  it('infers splitField at a non-zero index', () => {
    const examples: FillExample[] = [
      { input: 'John,Doe', output: 'Doe' },
      { input: 'Jane,Roe', output: 'Roe' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'splitField', sep: ',', index: 1 });
  });

  it('returns null when no rule fits all examples', () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'zzz' },
      { input: 'def', output: 'qqq' },
    ];
    expect(inferRule(examples)).toBeNull();
  });

  it('does not treat an empty-prefix match as a prefix rule', () => {
    // output startsWith and endsWith input but neither up/lower nor prefix/suffix
    // is a consistent non-empty rule; identity already wins here.
    const examples: FillExample[] = [{ input: 'a', output: 'a' }];
    expect(inferRule(examples)).toEqual({ kind: 'identity' });
  });

  it('rejects prefix when one output does not end with its input', () => {
    // First example fits a prefix ("X"), second output does not end with input.
    const examples: FillExample[] = [
      { input: 'a', output: 'Xa' },
      { input: 'b', output: 'Xc' },
    ];
    expect(inferRule(examples)).toBeNull();
  });

  it('rejects prefix when the prefix is inconsistent across examples', () => {
    const examples: FillExample[] = [
      { input: 'a', output: 'Xa' },
      { input: 'b', output: 'YYb' },
    ];
    expect(inferRule(examples)).toBeNull();
  });

  it('rejects suffix when one output does not start with its input', () => {
    const examples: FillExample[] = [
      { input: 'a', output: 'aX' },
      { input: 'b', output: 'cX' },
    ];
    expect(inferRule(examples)).toBeNull();
  });

  it('rejects suffix when the suffix is inconsistent across examples', () => {
    const examples: FillExample[] = [
      { input: 'a', output: 'aX' },
      { input: 'b', output: 'bYY' },
    ];
    expect(inferRule(examples)).toBeNull();
  });

  it('falls through to splitField after rejecting an inconsistent prefix', () => {
    // Prefix candidate differs per example, but a split on "," explains both.
    const examples: FillExample[] = [
      { input: 'a,1', output: '1' },
      { input: 'b,1', output: '1' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'splitField', sep: ',', index: 1 });
  });

  it('skips separators absent from the first input', () => {
    // First input has no comma but has a space; the space separator must win.
    const examples: FillExample[] = [
      { input: 'hello world', output: 'world' },
      { input: 'foo bar', output: 'bar' },
    ];
    expect(inferRule(examples)).toEqual({ kind: 'splitField', sep: ' ', index: 1 });
  });

  it('returns null when a separator splits but no index fits', () => {
    const examples: FillExample[] = [
      { input: 'a,b', output: 'zz' },
      { input: 'c,d', output: 'yy' },
    ];
    expect(inferRule(examples)).toBeNull();
  });
});

describe('applyRule', () => {
  it('applies identity', () => {
    expect(applyRule({ kind: 'identity' }, 'keep')).toBe('keep');
  });

  it('applies upper', () => {
    expect(applyRule({ kind: 'upper' }, 'abc')).toBe('ABC');
  });

  it('applies lower', () => {
    expect(applyRule({ kind: 'lower' }, 'ABC')).toBe('abc');
  });

  it('applies prefix', () => {
    expect(applyRule({ kind: 'prefix', text: 'ID-' }, '7')).toBe('ID-7');
  });

  it('applies suffix', () => {
    expect(applyRule({ kind: 'suffix', text: '.txt' }, 'file')).toBe('file.txt');
  });

  it('applies splitField at an existing index', () => {
    expect(applyRule({ kind: 'splitField', sep: ',', index: 1 }, 'a,b')).toBe('b');
  });

  it('returns empty string when splitField index is out of range', () => {
    expect(applyRule({ kind: 'splitField', sep: ',', index: 5 }, 'a,b')).toBe('');
  });
});

describe('smartFill', () => {
  it('uses the deterministic path when a rule fits', async () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'ABC' },
      { input: 'de', output: 'DE' },
    ];
    const result = await smartFill(examples, ['hello', 'world']);
    expect(result).toEqual(['HELLO', 'WORLD']);
  });

  it('does not call the client on the deterministic path', async () => {
    const examples: FillExample[] = [{ input: 'a', output: 'A' }];
    // Provider with an empty object queue would throw if generateObject ran.
    const client = new AIClient(new MockProvider());
    const result = await smartFill(examples, ['x'], client);
    expect(result).toEqual(['X']);
    expect(client.getCallCount()).toBe(0);
  });

  it('falls back to the AI client when no rule fits', async () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'zzz' },
      { input: 'def', output: 'qqq' },
    ];
    const provider = new MockProvider({ objects: [{ values: ['mmm', 'nnn'] }] });
    const client = new AIClient(provider);
    const result = await smartFill(examples, ['ghi', 'jkl'], client);
    expect(result).toEqual(['mmm', 'nnn']);
    expect(client.getCallCount()).toBe(1);
  });

  it('throws when no rule fits and no client is given', async () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'zzz' },
      { input: 'def', output: 'qqq' },
    ];
    await expect(smartFill(examples, ['ghi'])).rejects.toThrow('no rule and no client');
  });

  it('falls back to inputs when the model returns a wrong-length array', async () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'zzz' },
      { input: 'def', output: 'qqq' },
    ];
    const client = new AIClient(new MockProvider({ objects: [{ values: ['only-one'] }] }));
    const result = await smartFill(examples, ['ghi', 'jkl'], client);
    expect(result).toEqual(['ghi', 'jkl']);
  });

  it('falls back to inputs when the model returns a non-array', async () => {
    const examples: FillExample[] = [
      { input: 'abc', output: 'zzz' },
      { input: 'def', output: 'qqq' },
    ];
    const client = new AIClient(new MockProvider({ objects: [{ values: 'nope' }] }));
    const result = await smartFill(examples, ['ghi'], client);
    expect(result).toEqual(['ghi']);
  });
});

describe('FillRule type usage', () => {
  it('exercises every rule kind through applyRule', () => {
    const rules: FillRule[] = [
      { kind: 'identity' },
      { kind: 'upper' },
      { kind: 'lower' },
      { kind: 'prefix', text: 'p' },
      { kind: 'suffix', text: 's' },
      { kind: 'splitField', sep: ',', index: 0 },
    ];
    const outputs = rules.map((r) => applyRule(r, 'a,b'));
    expect(outputs).toEqual(['a,b', 'A,B', 'a,b', 'pa,b', 'a,bs', 'a']);
  });
});
