import { describe, it, expect } from 'vitest';
import { nlToFormula, explainFormula, fixFormula } from './nl-formula.js';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';

const client = (opts: { texts?: string[]; objects?: unknown[] }) =>
  new AIClient(new MockProvider(opts));

describe('nlToFormula', () => {
  it('returns a validated formula and strips a leading =', async () => {
    const r = await nlToFormula(client({ objects: [{ formula: '=SUM(A1:A2)' }] }), 'sum A1 and A2');
    expect(r).toEqual({ formula: '=SUM(A1:A2)', valid: true });
  });

  it('accepts a formula without a leading =', async () => {
    const r = await nlToFormula(client({ objects: [{ formula: 'A1*2' }] }), 'double A1');
    expect(r).toEqual({ formula: '=A1*2', valid: true });
  });

  it('reports invalid formulas with the parser error', async () => {
    const r = await nlToFormula(client({ objects: [{ formula: '1+' }] }), 'broken');
    expect(r.valid).toBe(false);
    expect(r.formula).toBe('=1+');
    expect(typeof r.error).toBe('string');
  });

  it('weaves in optional context', async () => {
    const provider = new MockProvider({ objects: [{ formula: 'B1' }] });
    const c = new AIClient(provider);
    const r = await nlToFormula(c, 'the second column', { context: 'columns: A,B' });
    expect(r.valid).toBe(true);
  });
});

describe('explainFormula', () => {
  it('explains a valid formula via the model', async () => {
    const text = await explainFormula(client({ texts: ['Adds A1 and A2.'] }), '=SUM(A1:A2)');
    expect(text).toBe('Adds A1 and A2.');
  });

  it('short-circuits an invalid formula without calling the model', async () => {
    const c = client({ texts: [] }); // no texts queued; a model call would throw
    const text = await explainFormula(c, '=1+');
    expect(text).toContain('Cannot explain an invalid formula');
    expect(c.getCallCount()).toBe(0);
  });
});

describe('fixFormula', () => {
  it('returns a corrected, validated formula', async () => {
    const r = await fixFormula(
      client({ objects: [{ formula: '=SUM(A1:A2)' }] }),
      '=SUM(A1:A2',
      'missing )',
    );
    expect(r).toEqual({ formula: '=SUM(A1:A2)', valid: true });
  });

  it('flags a still-invalid correction', async () => {
    const r = await fixFormula(client({ objects: [{ formula: '=*' }] }), '=*', 'bad');
    expect(r.valid).toBe(false);
  });
});
