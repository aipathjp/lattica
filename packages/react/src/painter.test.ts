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
