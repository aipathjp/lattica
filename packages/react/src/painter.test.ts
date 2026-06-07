import { describe, it, expect } from 'vitest';
import { paintScene } from './painter.js';
import { defaultTheme } from './theme.js';
import { createMockContext } from './test-utils.js';
import type { Scene } from './scene.js';

const scene = (over: Partial<Scene> = {}): Scene => ({
  cells: [
    { row: 0, col: 0, rect: { x: 0, y: 0, width: 50, height: 20 }, text: 'hi', selected: false, active: false },
    { row: 0, col: 1, rect: { x: 50, y: 0, width: 50, height: 20 }, text: '', selected: true, active: true },
  ],
  activeRect: { x: 50, y: 0, width: 50, height: 20 },
  visibleRows: [0],
  visibleCols: [0, 1],
  ...over,
});

const methods = (ctx: ReturnType<typeof createMockContext>) => ctx.calls.map((c) => c.method);

describe('paintScene', () => {
  it('clears and fills the background', () => {
    const ctx = createMockContext();
    paintScene(ctx, scene(), defaultTheme, { width: 200, height: 100 });
    expect(methods(ctx)).toContain('clearRect');
    expect(methods(ctx)).toContain('fillRect');
  });

  it('draws gridlines via stroke', () => {
    const ctx = createMockContext();
    paintScene(ctx, scene(), defaultTheme, { width: 200, height: 100 });
    expect(methods(ctx)).toContain('moveTo');
    expect(methods(ctx)).toContain('lineTo');
    expect(methods(ctx)).toContain('stroke');
  });

  it('fills selected cells and clips text', () => {
    const ctx = createMockContext();
    paintScene(ctx, scene(), defaultTheme, { width: 200, height: 100 });
    expect(methods(ctx)).toContain('clip');
    expect(methods(ctx)).toContain('fillText');
  });

  it('draws the active-cell border', () => {
    const ctx = createMockContext();
    paintScene(ctx, scene(), defaultTheme, { width: 200, height: 100 });
    expect(methods(ctx)).toContain('strokeRect');
  });

  it('omits text drawing when there is no text', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          { row: 0, col: 0, rect: { x: 0, y: 0, width: 50, height: 20 }, text: '', selected: false, active: false },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    expect(methods(ctx)).not.toContain('fillText');
    expect(methods(ctx)).not.toContain('strokeRect');
  });

  it('paints a conditional-format background and text color', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0,
            col: 0,
            rect: { x: 0, y: 0, width: 50, height: 20 },
            text: 'hi',
            selected: false,
            active: false,
            cfStyle: { background: '#fee', color: '#a00' },
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    expect(methods(ctx)).toContain('fillRect');
    expect(methods(ctx)).toContain('fillText');
  });

  it('renders typed cells via the registry (checkbox)', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0,
            col: 0,
            rect: { x: 0, y: 0, width: 50, height: 20 },
            text: '',
            selected: false,
            active: false,
            type: 'checkbox',
            value: true,
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    expect(methods(ctx)).toContain('strokeRect');
    expect(methods(ctx)).toContain('stroke');
  });

  it('applies a DPR scale when provided', () => {
    const ctx = createMockContext();
    paintScene(ctx, scene(), defaultTheme, { width: 200, height: 100, dpr: 2 });
    expect(methods(ctx)).toContain('scale');
  });

  it('tolerates a context without scale() at dpr=1', () => {
    const ctx = createMockContext();
    // dpr defaults to 1 -> scaleForDpr not invoked.
    paintScene(ctx, scene(), defaultTheme, { width: 10, height: 10 });
    expect(methods(ctx)).not.toContain('scale');
  });

  it('skips scaling at dpr>1 when the context lacks scale()', () => {
    const ctx = createMockContext();
    // Remove scale to exercise the guard's false branch.
    delete (ctx as { scale?: unknown }).scale;
    expect(() => paintScene(ctx, scene(), defaultTheme, { width: 10, height: 10, dpr: 2 })).not.toThrow();
    expect(methods(ctx)).not.toContain('scale');
  });
});

describe('paintScene visual conditional formatting', () => {
  it('draws an in-cell data bar (fillRect with the ratio width)', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0,
            col: 0,
            rect: { x: 0, y: 0, width: 50, height: 20 },
            text: '5',
            selected: false,
            active: false,
            bar: { ratio: 0.5, color: '#39f' },
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    // A bar fillRect of width (50-4)*0.5 = 23 at x=2,y=2 is recorded.
    const bar = ctx.calls.find(
      (c) => c.method === 'fillRect' && c.args[0] === 2 && c.args[1] === 2 && c.args[2] === 23,
    );
    expect(bar).toBeTruthy();
  });

  it('draws an icon-set glyph via fillText', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0,
            col: 0,
            rect: { x: 0, y: 0, width: 50, height: 20 },
            text: '9',
            selected: false,
            active: false,
            icon: '🟢',
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    const icon = ctx.calls.find((c) => c.method === 'fillText' && c.args[0] === '🟢');
    expect(icon).toBeTruthy();
  });
});

describe('paintScene sparklines', () => {
  it('strokes a line sparkline through its points', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0, col: 0, rect: { x: 0, y: 0, width: 50, height: 20 },
            text: '', selected: false, active: false,
            sparkline: { kind: 'line', points: [{ x: 2, y: 18 }, { x: 48, y: 2 }] },
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    const m = methods(ctx);
    expect(m).toContain('moveTo');
    expect(m).toContain('lineTo');
    expect(m).toContain('stroke');
  });

  it('fills bar/winloss sparkline bars (positive and negative colors)', () => {
    const ctx = createMockContext();
    paintScene(
      ctx,
      scene({
        cells: [
          {
            row: 0, col: 0, rect: { x: 0, y: 0, width: 50, height: 20 },
            text: '', selected: false, active: false,
            sparkline: {
              kind: 'winloss',
              bars: [
                { x: 2, y: 2, width: 4, height: 8, positive: true },
                { x: 8, y: 10, width: 4, height: 8, positive: false },
              ],
            },
          },
        ],
        activeRect: null,
      }),
      defaultTheme,
      { width: 200, height: 100 },
    );
    // Two bar fillRects translated by the cell origin (x=0,y=0).
    const fills = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 4 && c.args[3] === 8);
    expect(fills.length).toBe(2);
  });
});
