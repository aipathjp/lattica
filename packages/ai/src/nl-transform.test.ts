import { describe, it, expect } from 'vitest';
import { isValidOperation, nlToOperation, type GridOperation } from './nl-transform.js';
import { AIClient } from './client.js';
import { MockProvider } from './provider.js';

const client = (objects: unknown[]) => new AIClient(new MockProvider({ objects }));

describe('isValidOperation', () => {
  it('accepts a valid sort operation', () => {
    expect(isValidOperation({ op: 'sort', col: 0, direction: 'asc' })).toBe(true);
    expect(isValidOperation({ op: 'sort', col: 3, direction: 'desc' })).toBe(true);
  });

  it('accepts a valid filter operation, with and without value', () => {
    expect(isValidOperation({ op: 'filter', col: 1, condition: 'gt', value: '10' })).toBe(true);
    expect(isValidOperation({ op: 'filter', col: 1, condition: 'empty' })).toBe(true);
  });

  it('accepts every summarize fn', () => {
    for (const fn of ['sum', 'avg', 'min', 'max', 'count'] as const) {
      expect(isValidOperation({ op: 'summarize', col: 2, fn })).toBe(true);
    }
  });

  it('accepts a valid none operation', () => {
    expect(isValidOperation({ op: 'none', reason: 'unsupported' })).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isValidOperation(null)).toBe(false);
    expect(isValidOperation(undefined)).toBe(false);
    expect(isValidOperation('sort')).toBe(false);
    expect(isValidOperation(42)).toBe(false);
    expect(isValidOperation([{ op: 'none', reason: 'x' }])).toBe(false);
  });

  it('rejects an unknown op discriminant', () => {
    expect(isValidOperation({ op: 'delete', col: 0 })).toBe(false);
    expect(isValidOperation({})).toBe(false);
    expect(isValidOperation({ op: 5 })).toBe(false);
  });

  it('rejects a sort with a bad column index', () => {
    expect(isValidOperation({ op: 'sort', col: -1, direction: 'asc' })).toBe(false);
    expect(isValidOperation({ op: 'sort', col: 1.5, direction: 'asc' })).toBe(false);
    expect(isValidOperation({ op: 'sort', col: '0', direction: 'asc' })).toBe(false);
  });

  it('rejects a sort with a missing or bad direction', () => {
    expect(isValidOperation({ op: 'sort', col: 0 })).toBe(false);
    expect(isValidOperation({ op: 'sort', col: 0, direction: 'up' })).toBe(false);
    expect(isValidOperation({ op: 'sort', col: 0, direction: 1 })).toBe(false);
  });

  it('rejects a filter with bad fields', () => {
    expect(isValidOperation({ op: 'filter', col: 0 })).toBe(false);
    expect(isValidOperation({ op: 'filter', col: 0, condition: 5 })).toBe(false);
    expect(isValidOperation({ op: 'filter', col: -1, condition: 'gt' })).toBe(false);
    expect(isValidOperation({ op: 'filter', col: 0, condition: 'gt', value: 10 })).toBe(false);
  });

  it('rejects a summarize with bad fields', () => {
    expect(isValidOperation({ op: 'summarize', col: 0 })).toBe(false);
    expect(isValidOperation({ op: 'summarize', col: 0, fn: 'median' })).toBe(false);
    expect(isValidOperation({ op: 'summarize', col: 0, fn: 3 })).toBe(false);
    expect(isValidOperation({ op: 'summarize', col: -1, fn: 'sum' })).toBe(false);
  });

  it('rejects a none with a missing or bad reason', () => {
    expect(isValidOperation({ op: 'none' })).toBe(false);
    expect(isValidOperation({ op: 'none', reason: 5 })).toBe(false);
  });
});

describe('nlToOperation', () => {
  const columns = ['Name', 'Amount', 'Date'] as const;

  it('returns a validated sort operation', async () => {
    const op: GridOperation = { op: 'sort', col: 1, direction: 'desc' };
    const r = await nlToOperation(client([op]), 'sort by amount descending', columns);
    expect(r).toEqual(op);
  });

  it('returns a validated filter operation', async () => {
    const op: GridOperation = { op: 'filter', col: 1, condition: 'gt', value: '100' };
    const r = await nlToOperation(client([op]), 'amount over 100', columns);
    expect(r).toEqual(op);
  });

  it('returns a validated summarize operation', async () => {
    const op: GridOperation = { op: 'summarize', col: 1, fn: 'sum' };
    const r = await nlToOperation(client([op]), 'total the amount', columns);
    expect(r).toEqual(op);
  });

  it('passes through a model-produced none operation', async () => {
    const op: GridOperation = { op: 'none', reason: 'not a grid op' };
    const r = await nlToOperation(client([op]), 'tell me a joke', columns);
    expect(r).toEqual(op);
  });

  it('collapses invalid model output to none', async () => {
    const r = await nlToOperation(
      client([{ op: 'sort', col: 0, direction: 'sideways' }]),
      'sort somehow',
      columns,
    );
    expect(r).toEqual({ op: 'none', reason: 'Model returned an invalid operation.' });
  });

  it('handles an empty column list', async () => {
    const op: GridOperation = { op: 'none', reason: 'no columns' };
    const r = await nlToOperation(client([op]), 'do something', []);
    expect(r).toEqual(op);
  });
});
