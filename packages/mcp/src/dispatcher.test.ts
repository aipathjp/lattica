/** Tests for the ToolDispatcher, exercised against real grid tools. */

import { describe, it, expect } from 'vitest';
import { SheetEngine } from '@lattica/formula';
import { createGridTools } from './tools.js';
import { ToolDispatcher } from './dispatcher.js';

function makeDispatcher(): { engine: SheetEngine; dispatcher: ToolDispatcher } {
  const engine = new SheetEngine();
  return { engine, dispatcher: new ToolDispatcher(createGridTools(engine)) };
}

describe('ToolDispatcher.list / has', () => {
  it('lists tool metadata without handlers', () => {
    const { dispatcher } = makeDispatcher();
    const list = dispatcher.list();
    expect(list.map((d) => d.name)).toEqual([
      'get_cell',
      'set_cell',
      'get_range',
      'evaluate',
      'define_name',
    ]);
    for (const d of list) {
      expect(d).not.toHaveProperty('handler');
      expect(typeof d.inputSchema).toBe('object');
    }
  });

  it('reports tool presence', () => {
    const { dispatcher } = makeDispatcher();
    expect(dispatcher.has('get_cell')).toBe(true);
    expect(dispatcher.has('nope')).toBe(false);
  });
});

describe('ToolDispatcher.call', () => {
  it('returns ok:true with output on success', () => {
    const { dispatcher } = makeDispatcher();
    expect(dispatcher.call('set_cell', { row: 0, col: 0, content: 5 })).toEqual({
      ok: true,
      output: { ok: true },
    });
    expect(dispatcher.call('get_cell', { row: 0, col: 0 })).toEqual({
      ok: true,
      output: { value: '5' },
    });
  });

  it('round-trips set_cell then get_cell', () => {
    const { dispatcher } = makeDispatcher();
    dispatcher.call('set_cell', { row: 3, col: 4, content: '=6*7' });
    expect(dispatcher.call('get_cell', { row: 3, col: 4 })).toEqual({
      ok: true,
      output: { value: '42' },
    });
  });

  it('returns a matrix from get_range', () => {
    const { dispatcher } = makeDispatcher();
    dispatcher.call('set_cell', { row: 0, col: 0, content: 1 });
    dispatcher.call('set_cell', { row: 0, col: 1, content: 2 });
    expect(dispatcher.call('get_range', { startRow: 0, startCol: 0, endRow: 0, endCol: 1 })).toEqual(
      { ok: true, output: { rows: [['1', '2']] } },
    );
  });

  it('evaluates a formula', () => {
    const { dispatcher } = makeDispatcher();
    expect(dispatcher.call('evaluate', { formula: '=SUM(1,2,3)' })).toEqual({
      ok: true,
      output: { result: '6' },
    });
  });

  it('define_name then evaluate referencing it', () => {
    const { dispatcher } = makeDispatcher();
    expect(dispatcher.call('define_name', { name: 'PI', formula: '3.14' })).toEqual({
      ok: true,
      output: { ok: true },
    });
    expect(dispatcher.call('evaluate', { formula: '=PI*2' })).toEqual({
      ok: true,
      output: { result: '6.28' },
    });
  });

  it('surfaces a handler throw as ok:false', () => {
    const { dispatcher } = makeDispatcher();
    const result = dispatcher.call('get_cell', { row: -1, col: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('"row" must be a non-negative integer');
    expect(result.output).toBeUndefined();
  });

  it('returns ok:false for an unknown tool', () => {
    const { dispatcher } = makeDispatcher();
    expect(dispatcher.call('does_not_exist', {})).toEqual({
      ok: false,
      error: 'unknown tool: does_not_exist',
    });
  });

  it('stringifies a non-Error throw', () => {
    const dispatcher = new ToolDispatcher([
      {
        name: 'boom',
        description: 'throws a non-Error',
        inputSchema: {},
        handler(): never {
          throw 'plain string failure';
        },
      },
    ]);
    expect(dispatcher.call('boom', {})).toEqual({
      ok: false,
      error: 'plain string failure',
    });
  });
});
