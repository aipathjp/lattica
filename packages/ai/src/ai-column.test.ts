import { describe, it, expect } from 'vitest';
import { renderTemplate, generateColumn } from './ai-column.js';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';

describe('renderTemplate', () => {
  it('fills indexed placeholders from the row', () => {
    expect(renderTemplate('{0}-{1}', ['a', 'b'])).toBe('a-b');
  });

  it('fills named placeholders from headers', () => {
    expect(renderTemplate('Hi {name} ({city})', ['Ann', 'Paris'], ['name', 'city'])).toBe(
      'Hi Ann (Paris)',
    );
  });

  it('replaces an out-of-range index with empty string', () => {
    expect(renderTemplate('[{5}]', ['only'])).toBe('[]');
  });

  it('replaces an unknown header name with empty string', () => {
    expect(renderTemplate('[{missing}]', ['v'], ['name'])).toBe('[]');
  });

  it('replaces a named placeholder with empty string when no headers given', () => {
    expect(renderTemplate('[{name}]', ['v'])).toBe('[]');
  });

  it('treats a missing cell (undefined) as empty string', () => {
    const sparse = ['x'];
    // index 1 exists in template but the cell is undefined under noUncheckedIndexedAccess
    expect(renderTemplate('{0}|{1}', sparse, ['a', 'b'])).toBe('x|');
  });

  it('handles an empty token placeholder as empty string', () => {
    expect(renderTemplate('[{}]', ['v'], ['v'])).toBe('[]');
  });

  it('returns a template with no placeholders unchanged', () => {
    expect(renderTemplate('static text', ['ignored'])).toBe('static text');
  });
});

describe('generateColumn', () => {
  it('generates a value + provenance for each row', async () => {
    const provider = new MockProvider({ texts: ['RESULT-1', 'RESULT-2'] });
    const client = new AIClient(provider);
    const rows = [
      ['Ann', 'Paris'],
      ['Bob', 'Rome'],
    ];

    const cells = await generateColumn(
      client,
      rows,
      { template: 'Describe {name} in {city}' },
      ['name', 'city'],
    );

    expect(cells).toHaveLength(2);
    expect(cells[0]?.value).toBe('RESULT-1');
    expect(cells[0]?.provenance.model).toBe('ai');
    expect(cells[0]?.provenance.prompt).toBe('Describe Ann in Paris');
    expect(cells[0]?.provenance.usage.inputTokens).toBeGreaterThan(0);
    expect(cells[0]?.provenance.usage.outputTokens).toBeGreaterThan(0);
    expect(cells[1]?.value).toBe('RESULT-2');
    expect(cells[1]?.provenance.prompt).toBe('Describe Bob in Rome');
  });

  it('works with indexed placeholders and no headers', async () => {
    const client = new AIClient(new MockProvider({ texts: ['ok'] }));
    const cells = await generateColumn(client, [['x', 'y']], { template: '{0}+{1}' });
    expect(cells[0]?.provenance.prompt).toBe('x+y');
    expect(cells[0]?.value).toBe('ok');
  });

  it('handles a template with no placeholders', async () => {
    const client = new AIClient(new MockProvider({ texts: ['c'] }));
    const cells = await generateColumn(client, [['a']], { template: 'constant' });
    expect(cells[0]?.provenance.prompt).toBe('constant');
  });

  it('accepts an optional concurrency option', async () => {
    const client = new AIClient(new MockProvider({ texts: ['z'] }));
    const cells = await generateColumn(client, [['a']], { template: '{0}', concurrency: 4 });
    expect(cells[0]?.value).toBe('z');
  });

  it('returns [] for empty rows without calling the provider', async () => {
    const client = new AIClient(new MockProvider({ texts: [] }));
    const cells = await generateColumn(client, [], { template: '{0}' });
    expect(cells).toEqual([]);
    expect(client.getCallCount()).toBe(0);
  });
});
