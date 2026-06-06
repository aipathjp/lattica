/** Tests for the grid tool registry, exercised against a real SheetEngine. */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from '@lattica/formula';
import { createGridTools, formatValue, type GridTool } from './tools.js';

function toolMap(engine: SheetEngine): Map<string, GridTool> {
  return new Map(createGridTools(engine).map((t) => [t.name, t]));
}

describe('formatValue', () => {
  it('formats every scalar kind and errors', () => {
    expect(formatValue(42)).toBe('42');
    expect(formatValue('hi')).toBe('hi');
    expect(formatValue(true)).toBe('TRUE');
    expect(formatValue(false)).toBe('FALSE');
    expect(formatValue(null)).toBe('');
  });

  it('formats a FormulaError as its token', () => {
    const engine = new SheetEngine();
    engine.setContent({ row: 0, col: 0 }, '=1/0');
    expect(formatValue(engine.getValue({ row: 0, col: 0 }))).toBe('#DIV/0!');
  });
});

describe('createGridTools', () => {
  it('exposes the expected tool names and metadata', () => {
    const tools = createGridTools(new SheetEngine());
    expect(tools.map((t) => t.name)).toEqual([
      'get_cell',
      'set_cell',
      'get_range',
      'evaluate',
      'define_name',
    ]);
    for (const t of tools) {
      expect(typeof t.description).toBe('string');
      expect(typeof t.inputSchema).toBe('object');
    }
  });
});

describe('get_cell', () => {
  it('returns the formatted value', () => {
    const engine = new SheetEngine();
    engine.setContent({ row: 1, col: 2 }, 7);
    const tool = toolMap(engine).get('get_cell')!;
    expect(tool.handler({ row: 1, col: 2 })).toEqual({ value: '7' });
  });

  it('returns empty string for an empty cell', () => {
    const tool = toolMap(new SheetEngine()).get('get_cell')!;
    expect(tool.handler({ row: 0, col: 0 })).toEqual({ value: '' });
  });

  it('throws on non-object input', () => {
    const tool = toolMap(new SheetEngine()).get('get_cell')!;
    expect(() => tool.handler(null)).toThrow('input must be an object');
    expect(() => tool.handler([])).toThrow('input must be an object');
    expect(() => tool.handler(5)).toThrow('input must be an object');
  });

  it('throws on a bad integer field', () => {
    const tool = toolMap(new SheetEngine()).get('get_cell')!;
    expect(() => tool.handler({ row: -1, col: 0 })).toThrow('"row" must be a non-negative integer');
    expect(() => tool.handler({ row: 1.5, col: 0 })).toThrow('"row" must be a non-negative integer');
    expect(() => tool.handler({ row: '0', col: 0 })).toThrow('"row" must be a non-negative integer');
    expect(() => tool.handler({ row: 0, col: -2 })).toThrow('"col" must be a non-negative integer');
  });
});

describe('set_cell', () => {
  it('writes a literal and round-trips via get_cell', () => {
    const engine = new SheetEngine();
    const tools = toolMap(engine);
    expect(tools.get('set_cell')!.handler({ row: 0, col: 0, content: 'hello' })).toEqual({
      ok: true,
    });
    expect(tools.get('get_cell')!.handler({ row: 0, col: 0 })).toEqual({ value: 'hello' });
  });

  it('writes each content type', () => {
    const engine = new SheetEngine();
    const set = toolMap(engine).get('set_cell')!;
    const get = toolMap(engine).get('get_cell')!;
    set.handler({ row: 0, col: 0, content: 3 });
    set.handler({ row: 0, col: 1, content: true });
    set.handler({ row: 0, col: 2, content: '=1+2' });
    set.handler({ row: 0, col: 3, content: null });
    expect(get.handler({ row: 0, col: 0 })).toEqual({ value: '3' });
    expect(get.handler({ row: 0, col: 1 })).toEqual({ value: 'TRUE' });
    expect(get.handler({ row: 0, col: 2 })).toEqual({ value: '3' });
    expect(get.handler({ row: 0, col: 3 })).toEqual({ value: '' });
  });

  it('throws on an invalid content type', () => {
    const tool = toolMap(new SheetEngine()).get('set_cell')!;
    expect(() => tool.handler({ row: 0, col: 0, content: { a: 1 } })).toThrow(
      '"content" must be a string, number, boolean, or null',
    );
  });
});

describe('get_range', () => {
  it('returns a matrix of display strings', () => {
    const engine = new SheetEngine();
    engine.setContent({ row: 0, col: 0 }, 1);
    engine.setContent({ row: 0, col: 1 }, 2);
    engine.setContent({ row: 1, col: 0 }, 3);
    engine.setContent({ row: 1, col: 1 }, '=A1+A2');
    const tool = toolMap(engine).get('get_range')!;
    expect(tool.handler({ startRow: 0, startCol: 0, endRow: 1, endCol: 1 })).toEqual({
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
    });
  });

  it('throws on an inverted range', () => {
    const tool = toolMap(new SheetEngine()).get('get_range')!;
    expect(() => tool.handler({ startRow: 2, startCol: 0, endRow: 1, endCol: 0 })).toThrow(
      'range end must be >= range start',
    );
    expect(() => tool.handler({ startRow: 0, startCol: 5, endRow: 0, endCol: 1 })).toThrow(
      'range end must be >= range start',
    );
  });

  it('throws when the requested range exceeds the cell cap', () => {
    const tool = toolMap(new SheetEngine()).get('get_range')!;
    expect(() =>
      tool.handler({ startRow: 0, startCol: 0, endRow: 999999, endCol: 999999 }),
    ).toThrow(/range too large/);
  });
});

describe('evaluate', () => {
  it('evaluates a one-off formula', () => {
    const tool = toolMap(new SheetEngine()).get('evaluate')!;
    expect(tool.handler({ formula: '=2*21' })).toEqual({ result: '42' });
  });

  it('formats a matrix result via top-left scalarisation', () => {
    const engine = new SheetEngine();
    engine.setContent({ row: 0, col: 0 }, 9);
    engine.setContent({ row: 1, col: 0 }, 8);
    const tool = toolMap(engine).get('evaluate')!;
    expect(tool.handler({ formula: '=A1:A2' })).toEqual({ result: '9' });
  });

  it('throws on a missing formula', () => {
    const tool = toolMap(new SheetEngine()).get('evaluate')!;
    expect(() => tool.handler({ formula: '' })).toThrow('"formula" must be a non-empty string');
    expect(() => tool.handler({})).toThrow('"formula" must be a non-empty string');
  });
});

describe('define_name', () => {
  it('defines a name referenced by a later formula', () => {
    const engine = new SheetEngine();
    const tools = toolMap(engine);
    expect(tools.get('define_name')!.handler({ name: 'TAX', formula: '0.1' })).toEqual({
      ok: true,
    });
    expect(tools.get('evaluate')!.handler({ formula: '=TAX*100' })).toEqual({ result: '10' });
  });

  it('throws on a missing name', () => {
    const tool = toolMap(new SheetEngine()).get('define_name')!;
    expect(() => tool.handler({ name: '', formula: '1' })).toThrow(
      '"name" must be a non-empty string',
    );
  });
});
