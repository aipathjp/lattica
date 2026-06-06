import { describe, it, expect } from 'vitest';
import {
  drawCellText,
  textRenderer,
  numberRenderer,
  booleanRenderer,
  builtinRenderers,
  CellTypeRegistry,
  defaultCellTypes,
  type CellRenderContext,
} from './cell-types.js';
import { defaultTheme } from './theme.js';
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
