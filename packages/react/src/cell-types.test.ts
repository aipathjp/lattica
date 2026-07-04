import { describe, it, expect } from 'vitest';
import { SizeManager, SelectionModel } from '@ai-path/tb-core';
import {
  drawCellText,
  textRenderer,
  numberRenderer,
  booleanRenderer,
  barRenderer,
  parseBarValue,
  truncateWithEllipsis,
  builtinRenderers,
  CellTypeRegistry,
  defaultCellTypes,
  type CellRenderContext,
} from './cell-types.js';
import { buildScene } from './scene.js';
import { paintScene } from './painter.js';
import { defaultTheme } from './theme.js';
import type { GridGeometry } from './geometry.js';
import { createMockContext, type MockContext } from './test-utils.js';

const ctxOf = (
  over: Partial<CellRenderContext> = {},
): { ctx: MockContext; c: CellRenderContext } => {
  const ctx = createMockContext();
  const c: CellRenderContext = {
    ctx,
    rect: { x: 0, y: 0, width: 80, height: 20 },
    value: 'v',
    text: 'v',
    theme: defaultTheme,
    align: 'left',
    ...over,
  };
  return { ctx, c };
};
const methods = (ctx: MockContext) => ctx.calls.map((c) => c.method);
const lastFillText = (ctx: MockContext) =>
  [...ctx.calls].reverse().find((c) => c.method === 'fillText');

describe('drawCellText', () => {
  it('skips empty text', () => {
    const { ctx, c } = ctxOf({ text: '' });
    drawCellText(c);
    expect(methods(ctx)).not.toContain('fillText');
  });

  it('left-aligns by default', () => {
    const { ctx, c } = ctxOf({ align: 'left', text: 'hi' });
    drawCellText(c);
    expect(ctx.textAlign).toBe('left');
    expect(lastFillText(ctx)!.args[1]).toBe(defaultTheme.cellPaddingX);
  });

  it('right-aligns at the inner right edge', () => {
    const { ctx, c } = ctxOf({ align: 'right', text: 'hi' });
    drawCellText(c);
    expect(ctx.textAlign).toBe('right');
    expect(lastFillText(ctx)!.args[1]).toBe(80 - defaultTheme.cellPaddingX);
  });

  it('center-aligns at the middle', () => {
    const { ctx, c } = ctxOf({ align: 'center', text: 'hi' });
    drawCellText(c);
    expect(ctx.textAlign).toBe('center');
    expect(lastFillText(ctx)!.args[1]).toBe(40);
  });

  it('uses an explicit color when given', () => {
    const { ctx, c } = ctxOf({ text: 'hi' });
    drawCellText(c, '#ff0000');
    expect(ctx.calls.some((k) => k.method === 'clip')).toBe(true);
  });
});

describe('textRenderer', () => {
  it('draws text', () => {
    const { ctx, c } = ctxOf({ text: 'abc' });
    textRenderer(c);
    expect(methods(ctx)).toContain('fillText');
  });
});

describe('numberRenderer', () => {
  it('forces right alignment when align is left', () => {
    const { ctx, c } = ctxOf({ text: '42', align: 'left' });
    numberRenderer(c);
    expect(ctx.textAlign).toBe('right');
  });
  it('keeps an explicit center alignment', () => {
    const { ctx, c } = ctxOf({ text: '42', align: 'center' });
    numberRenderer(c);
    expect(ctx.textAlign).toBe('center');
  });
});

describe('booleanRenderer', () => {
  it('draws an empty box for falsy values', () => {
    const { ctx, c } = ctxOf({ value: false, text: '' });
    booleanRenderer(c);
    expect(methods(ctx)).toContain('strokeRect');
    expect(methods(ctx)).not.toContain('stroke'); // no check mark
  });
  it('draws a check mark for truthy values', () => {
    const { ctx, c } = ctxOf({ value: true });
    booleanRenderer(c);
    expect(methods(ctx)).toContain('strokeRect');
    expect(methods(ctx)).toContain('stroke');
  });
  it.each([
    [1, true],
    [0, false],
    ['TRUE', true],
    ['nope', false],
    [null, false],
  ])('treats %p as truthy=%p', (value, checked) => {
    const { ctx, c } = ctxOf({ value });
    booleanRenderer(c);
    expect(methods(ctx).includes('stroke')).toBe(checked);
  });
});

describe('parseBarValue', () => {
  it('accepts a full JSON object and clamps ratio into [0,1]', () => {
    expect(parseBarValue({ color: '#ff0000', label: 'A', ratio: 0.5 })).toEqual({
      color: '#ff0000',
      label: 'A',
      ratio: 0.5,
    });
    expect(parseBarValue({ ratio: 2 })).toEqual({ ratio: 1 });
    expect(parseBarValue({ ratio: -1 })).toEqual({ ratio: 0 });
    expect(parseBarValue({})).toEqual({});
  });

  it('parses a JSON string of the same shape', () => {
    expect(parseBarValue('{"label":"組立","ratio":0.25}')).toEqual({ label: '組立', ratio: 0.25 });
    expect(parseBarValue('  {"color":"#00ff00"}  ')).toEqual({ color: '#00ff00' });
  });

  it('treats a plain (non-JSON) string as the label', () => {
    expect(parseBarValue('hello')).toEqual({ label: 'hello' });
    expect(parseBarValue('[not-json-object]')).toEqual({ label: '[not-json-object]' });
  });

  it('returns null for empty or blank strings', () => {
    expect(parseBarValue('')).toBeNull();
    expect(parseBarValue('   ')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseBarValue('{oops')).toBeNull();
    expect(parseBarValue('{"label":')).toBeNull();
  });

  it.each([
    [{ color: 5 }],
    [{ label: 1 }],
    [{ ratio: 'x' }],
    [{ ratio: Number.NaN }],
    [{ ratio: Number.POSITIVE_INFINITY }],
  ])('returns null for wrong field types %p', (value) => {
    expect(parseBarValue(value)).toBeNull();
  });

  it('returns null for JSON strings with wrong field types', () => {
    expect(parseBarValue('{"ratio":"half"}')).toBeNull();
  });

  it('returns null for non-string, non-object values', () => {
    expect(parseBarValue(42)).toBeNull();
    expect(parseBarValue(true)).toBeNull();
    expect(parseBarValue(null)).toBeNull();
    expect(parseBarValue(undefined)).toBeNull();
    expect(parseBarValue([1, 2])).toBeNull();
  });
});

describe('truncateWithEllipsis', () => {
  const measure = (t: string) => t.length * 10;

  it('returns the text unchanged when it fits', () => {
    expect(truncateWithEllipsis('abc', 30, measure)).toBe('abc');
  });

  it('truncates with a trailing ellipsis', () => {
    expect(truncateWithEllipsis('abcdefgh', 50, measure)).toBe('abcd…');
  });

  it('returns an empty string when nothing fits', () => {
    expect(truncateWithEllipsis('ab', 5, measure)).toBe('');
  });
});

/** A mock context that also records the fill style active at each fill call. */
const paintingContext = () => {
  const ctx = createMockContext();
  const fills: { args: number[]; style: string }[] = [];
  const texts: { text: string; x: number; y: number; style: string }[] = [];
  const baseRect = ctx.fillRect.bind(ctx);
  const baseText = ctx.fillText.bind(ctx);
  ctx.fillRect = (x, y, w, h) => {
    baseRect(x, y, w, h);
    fills.push({ args: [x, y, w, h], style: ctx.fillStyle });
  };
  ctx.fillText = (text, x, y) => {
    baseText(text, x, y);
    texts.push({ text, x, y, style: ctx.fillStyle });
  };
  return { ctx, fills, texts };
};

describe('barRenderer', () => {
  const renderBar = (value: unknown, text = '', patch: Partial<CellRenderContext> = {}) => {
    const { ctx, fills, texts } = paintingContext();
    barRenderer({
      ctx,
      rect: { x: 0, y: 0, width: 80, height: 20 },
      value,
      text,
      theme: defaultTheme,
      align: 'left',
      ...patch,
    });
    return { ctx, fills, texts };
  };

  it('is registered as the built-in "bar" type', () => {
    expect(builtinRenderers.bar).toBe(barRenderer);
    expect(defaultCellTypes.resolve('bar')).toBe(barRenderer);
  });

  it('draws a full-width accent bar for an empty spec', () => {
    const { fills } = renderBar({});
    expect(fills).toEqual([{ args: [2, 2, 76, 16], style: defaultTheme.activeBorder }]);
  });

  it('sizes the bar by ratio and uses the given color (JSON string value)', () => {
    const { fills } = renderBar('{"ratio":0.5,"color":"#ff0000"}');
    expect(fills).toEqual([{ args: [2, 2, 38, 16], style: '#ff0000' }]);
  });

  it('treats a plain string as a label on a full-width bar (white on dark accent)', () => {
    const { fills, texts } = renderBar('Build');
    expect(fills[0]!.args).toEqual([2, 2, 76, 16]);
    expect(texts).toEqual([{ text: 'Build', x: 8, y: 10, style: '#ffffff' }]);
  });

  it('ellipsizes an overflowing label using ctx.measureText when available', () => {
    const { ctx, fills, texts } = paintingContext();
    const measuring = Object.assign(ctx, {
      measureText: (t: string) => ({ width: t.length * 10 }),
    });
    barRenderer({
      ctx: measuring,
      rect: { x: 0, y: 0, width: 80, height: 20 },
      value: { label: 'abcdefghij' },
      text: '',
      theme: defaultTheme,
      align: 'left',
    });
    expect(fills[0]!.args).toEqual([2, 2, 76, 16]);
    expect(texts[0]!.text).toBe('abcde…');
  });

  it('uses dark label text on a light hex fill', () => {
    const { texts } = renderBar({ color: '#ffff00', label: 'x' });
    expect(texts[0]!.style).toBe('#1f2937');
  });

  it('falls back to white label text for non-hex colors', () => {
    const { fills, texts } = renderBar({ color: 'red', label: 'x' });
    expect(fills[0]!.style).toBe('red');
    expect(texts[0]!.style).toBe('#ffffff');
  });

  it('skips the bar and label at ratio 0', () => {
    const { fills, texts } = renderBar({ ratio: 0, label: 'hidden' });
    expect(fills).toEqual([]);
    expect(texts).toEqual([]);
  });

  it('drops the label when the bar is too narrow for any character', () => {
    const { fills, texts } = renderBar({ ratio: 0.05, label: 'long label' });
    expect(fills).toHaveLength(1);
    expect(texts).toEqual([]);
  });

  it('falls back to plain text rendering for unexpected values', () => {
    const { fills, texts } = renderBar(42, '42');
    expect(fills).toEqual([]);
    expect(texts).toEqual([{ text: '42', x: defaultTheme.cellPaddingX, y: 10, style: defaultTheme.textColor }]);
  });

  it('falls back to plain text rendering for malformed JSON strings', () => {
    const { fills, texts } = renderBar('{oops', '{oops');
    expect(fills).toEqual([]);
    expect(texts[0]!.text).toBe('{oops');
  });
});

describe('barRenderer × mergeCells (pseudo-Gantt)', () => {
  it('spans the full merged width when painted through buildScene', () => {
    const geom: GridGeometry = {
      rowSizes: new SizeManager({ count: 10, defaultSize: 20 }),
      colSizes: new SizeManager({ count: 10, defaultSize: 50 }),
      frozenRows: 0,
      frozenCols: 0,
      rowHeaderWidth: 40,
      colHeaderHeight: 20,
    };
    const merge = { row: 0, col: 0, rowspan: 1, colspan: 2 };
    const scene = buildScene({
      geom,
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 400,
      clientHeight: 200,
      selection: new SelectionModel({ rowCount: 10, colCount: 10 }),
      getDisplay: () => '',
      getType: (r, c) => (r === 0 && c <= 1 ? 'bar' : undefined),
      getValue: (r, c) => (r === 0 && c <= 1 ? '{"ratio":0.5,"color":"#00ff00","label":"L"}' : undefined),
      getMerge: (r, c) => (r === 0 && c <= 1 ? merge : null),
    });
    // The merge anchor spans both columns (2 × 50 px).
    const anchor = scene.cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(anchor.rect.width).toBe(100);
    expect(scene.cells.some((c) => c.row === 0 && c.col === 1)).toBe(false);

    const { ctx, fills, texts } = paintingContext();
    paintScene(ctx, scene, defaultTheme, { width: 400, height: 200 });
    // Bar width = (merged 100 − 2×2 inset) × ratio 0.5 = 48, over the merge
    // area (origin offset by the 40px row header / 20px column header).
    const bar = fills.find((f) => f.style === '#00ff00')!;
    expect(bar.args).toEqual([42, 22, 48, 16]);
    expect(texts.some((t) => t.text === 'L' && t.style === '#ffffff')).toBe(true);
  });
});

describe('CellTypeRegistry', () => {
  it('resolves built-ins and defaults to text', () => {
    const r = new CellTypeRegistry();
    expect(r.resolve('number')).toBe(numberRenderer);
    expect(r.resolve('checkbox')).toBe(booleanRenderer);
    expect(r.resolve(undefined)).toBe(textRenderer);
    expect(r.resolve('unknown-type')).toBe(textRenderer);
  });

  it('registers and resolves custom types', () => {
    const r = new CellTypeRegistry();
    const custom = () => {};
    expect(r.has('stars')).toBe(false);
    r.register('stars', custom);
    expect(r.has('stars')).toBe(true);
    expect(r.resolve('stars')).toBe(custom);
  });

  it('exposes built-in renderers and a shared default registry', () => {
    expect(builtinRenderers.text).toBe(textRenderer);
    expect(defaultCellTypes.resolve('boolean')).toBe(booleanRenderer);
  });
});
