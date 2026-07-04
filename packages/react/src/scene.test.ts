import { describe, it, expect } from 'vitest';
import { SizeManager, SelectionModel } from '@ai-path/tb-core';
import { buildScene, visibleIndices, type BuildSceneParams } from './scene.js';
import type { GridGeometry } from './geometry.js';
import type { MeasureText } from './measure.js';

const geom = (overrides: Partial<GridGeometry> = {}): GridGeometry => ({
  rowSizes: new SizeManager({ count: 100, defaultSize: 20 }),
  colSizes: new SizeManager({ count: 100, defaultSize: 50 }),
  frozenRows: 0,
  frozenCols: 0,
  rowHeaderWidth: 40,
  colHeaderHeight: 20,
  ...overrides,
});

describe('visibleIndices', () => {
  it('returns the window plus frozen leading indices', () => {
    const sizes = new SizeManager({ count: 100, defaultSize: 20 });
    const idx = visibleIndices(sizes, 0, 100, 0, 0);
    expect(idx[0]).toBe(0);
    expect(idx).toContain(4);
  });
  it('always includes frozen indices', () => {
    const sizes = new SizeManager({ count: 100, defaultSize: 20 });
    const idx = visibleIndices(sizes, 500, 100, 2, 0);
    expect(idx.slice(0, 2)).toEqual([0, 1]);
  });
});

describe('buildScene', () => {
  it('produces cells for the visible window', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 240,
      clientHeight: 120,
      selection: sel,
      getDisplay: (r, c) => `${r},${c}`,
    });
    expect(scene.cells.length).toBeGreaterThan(0);
    expect(scene.cells[0]!.text).toBe('0,0');
    expect(scene.visibleRows[0]).toBe(0);
    expect(scene.visibleCols[0]).toBe(0);
  });

  it('marks the active cell and selection', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 1, col: 1 });
    sel.extendTo({ row: 2, col: 2 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 400,
      clientHeight: 200,
      selection: sel,
      getDisplay: () => '',
    });
    const active = scene.cells.find((c) => c.active);
    expect(active).toMatchObject({ row: 2, col: 2 });
    expect(scene.activeRect).not.toBeNull();
    expect(scene.cells.some((c) => c.selected && c.row === 1 && c.col === 1)).toBe(true);
  });

  it('suppresses selection visuals when hideSelection is set', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 1, col: 1 });
    sel.extendTo({ row: 2, col: 2 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 400,
      clientHeight: 200,
      selection: sel,
      getDisplay: () => '',
      hideSelection: true,
    });
    expect(scene.cells.some((c) => c.active)).toBe(false);
    expect(scene.cells.some((c) => c.selected)).toBe(false);
    expect(scene.activeRect).toBeNull();
  });

  it('populates type/align/value/cfStyle from accessors when provided', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 60,
      selection: sel,
      getDisplay: () => 'x',
      getType: (_r, c) => (c === 0 ? 'checkbox' : undefined),
      getAlign: () => 'right',
      getValue: () => true,
      getCfStyle: (r) => (r === 0 ? { background: '#fee' } : null),
    });
    const a = scene.cells.find((k) => k.row === 0 && k.col === 0)!;
    expect(a.type).toBe('checkbox');
    expect(a.align).toBe('right');
    expect(a.value).toBe(true);
    expect(a.cfStyle).toEqual({ background: '#fee' });
    const b = scene.cells.find((k) => k.row === 1 && k.col === 1)!;
    expect(b.type).toBeUndefined();
    expect(b.cfStyle).toBeUndefined();
  });

  it('has a null active rect when the active cell is scrolled out of view', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 0, col: 0 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 1000, // active row 0 not visible
      clientWidth: 240,
      clientHeight: 120,
      selection: sel,
      getDisplay: () => '',
    });
    expect(scene.activeRect).toBeNull();
  });

  it('flags frozen cells and the both-axis frozen corner', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom({ frozenRows: 1, frozenCols: 1 }),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 240,
      clientHeight: 120,
      selection: sel,
      getDisplay: () => '',
    });
    const corner = scene.cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(corner).toMatchObject({ frozen: true, frozenCorner: true });
    const pinnedRow = scene.cells.find((c) => c.row === 0 && c.col === 1)!;
    expect(pinnedRow).toMatchObject({ frozen: true, frozenCorner: false });
    const pinnedCol = scene.cells.find((c) => c.row === 1 && c.col === 0)!;
    expect(pinnedCol).toMatchObject({ frozen: true, frozenCorner: false });
    const plain = scene.cells.find((c) => c.row === 1 && c.col === 1)!;
    expect(plain).toMatchObject({ frozen: false, frozenCorner: false });
  });
});

describe('buildScene merges', () => {
  it('spans the anchor and skips covered cells', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 400,
      clientHeight: 200,
      selection: sel,
      getDisplay: () => '',
      getMerge: (r, c) =>
        r <= 1 && c <= 1 ? { row: 0, col: 0, rowspan: 2, colspan: 2 } : null,
    });
    const anchor = scene.cells.find((k) => k.row === 0 && k.col === 0)!;
    expect(anchor.rect.width).toBe(100); // 2 * 50
    expect(anchor.rect.height).toBe(40); // 2 * 20
    // covered cells are not painted
    expect(scene.cells.find((k) => k.row === 0 && k.col === 1)).toBeUndefined();
    expect(scene.cells.find((k) => k.row === 1 && k.col === 1)).toBeUndefined();
  });
});

describe('buildScene visual conditional formatting', () => {
  it('populates bar/icon and applies a color-scale background', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 100,
      selection: sel,
      getDisplay: () => '5',
      getVisual: (r, c) =>
        c === 0
          ? { background: '#808080' }
          : c === 1
            ? { bar: { ratio: 0.5, color: '#39f' } }
            : c === 2
              ? { icon: { set: 'traffic' as const, level: 2, total: 3 } }
              : null,
    });
    expect(scene.cells.find((k) => k.col === 0)!.cfStyle?.background).toBe('#808080');
    expect(scene.cells.find((k) => k.col === 1)!.bar).toEqual({ ratio: 0.5, color: '#39f' });
    expect(scene.cells.find((k) => k.col === 2)!.icon).toEqual({ set: 'traffic', level: 2, total: 3 });
  });

  it('explicit cf background wins over a color-scale background', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 100,
      selection: sel,
      getDisplay: () => '5',
      getCfStyle: () => ({ background: '#ffd6d6' }),
      getVisual: () => ({ background: '#808080' }),
    });
    expect(scene.cells[0]!.cfStyle?.background).toBe('#ffd6d6');
  });

  it('keeps base backgrounds below visual and explicit styles', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 100,
      selection: sel,
      getDisplay: () => '5',
      getBaseStyle: () => ({ background: '#f8f8f8' }),
      getCfStyle: (_r, c) => (c === 1 ? { background: '#fee', color: '#900' } : null),
      getVisual: (_r, c) => (c === 0 ? { background: '#808080' } : null),
    });
    expect(scene.cells.find((k) => k.col === 0)!.cfStyle).toEqual({ background: '#808080' });
    expect(scene.cells.find((k) => k.col === 1)!.cfStyle).toEqual({ background: '#fee', color: '#900' });
  });
});

describe('buildScene cell meta (P0-1)', () => {
  const base = (over: Partial<BuildSceneParams> = {}): BuildSceneParams => ({
    geom: geom(),
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 200,
    clientHeight: 100,
    selection: new SelectionModel({ rowCount: 100, colCount: 100 }),
    getDisplay: () => '5',
    ...over,
  });

  it('meta background/color override cf, visual, and base styles; fontWeight propagates', () => {
    const scene = buildScene(
      base({
        getBaseStyle: () => ({ background: '#f8f8f8' }),
        getCfStyle: () => ({ background: '#fee', color: '#900' }),
        getVisual: () => ({ background: '#808080' }),
        getCellMeta: (r, c) =>
          r === 0 && c === 0
            ? { background: '#dbeafe', color: '#1e3a8a', fontWeight: 'bold' }
            : null,
      }),
    );
    const meta = scene.cells.find((k) => k.row === 0 && k.col === 0)!;
    expect(meta.cfStyle).toEqual({ background: '#dbeafe', color: '#1e3a8a' });
    expect(meta.fontWeight).toBe('bold');
    // Cells without meta keep the cf/visual layering untouched.
    const plain = scene.cells.find((k) => k.row === 1 && k.col === 1)!;
    expect(plain.cfStyle).toEqual({ background: '#fee', color: '#900' });
    expect(plain.fontWeight).toBeUndefined();
  });

  it('partial meta merges over the existing style instead of replacing it', () => {
    const scene = buildScene(
      base({
        getCfStyle: () => ({ background: '#fee', color: '#900' }),
        getCellMeta: (_r, c) =>
          c === 0 ? { background: '#fef9c3' } : c === 1 ? { color: '#1d4ed8' } : null,
      }),
    );
    expect(scene.cells.find((k) => k.row === 0 && k.col === 0)!.cfStyle).toEqual({
      background: '#fef9c3',
      color: '#900',
    });
    expect(scene.cells.find((k) => k.row === 0 && k.col === 1)!.cfStyle).toEqual({
      background: '#fee',
      color: '#1d4ed8',
    });
  });

  it('creates a style for meta-only cells and keeps selection flags intact', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    sel.setActive({ row: 0, col: 0 });
    const scene = buildScene(
      base({
        selection: sel,
        getCellMeta: (r, c) =>
          r === 0 && c === 0
            ? { background: '#fecaca' }
            : r === 0 && c === 1
              ? { color: '#7f1d1d' }
              : null,
      }),
    );
    const cell = scene.cells.find((k) => k.row === 0 && k.col === 0)!;
    expect(cell.cfStyle).toEqual({ background: '#fecaca' });
    // A color-only meta on an otherwise unstyled cell also creates the style.
    expect(scene.cells.find((k) => k.row === 0 && k.col === 1)!.cfStyle).toEqual({ color: '#7f1d1d' });
    // Selection/active visuals stay above cell meta: flags are untouched, so
    // the painter still draws the tint and border over the meta background.
    expect(cell.selected).toBe(true);
    expect(cell.active).toBe(true);
    expect(scene.activeRect).not.toBeNull();
  });

  it('re-reads the provider each build, so external-state changes repaint on the next frame', () => {
    const pending = new Map<string, string>();
    const params = base({
      getCellMeta: (r, c) => {
        const background = pending.get(`${r},${c}`);
        return background === undefined ? null : { background };
      },
    });
    expect(buildScene(params).cells[0]!.cfStyle).toBeUndefined();
    pending.set('0,0', '#dbeafe');
    expect(buildScene(params).cells[0]!.cfStyle).toEqual({ background: '#dbeafe' });
    pending.set('0,0', '#fecaca');
    expect(buildScene(params).cells[0]!.cfStyle).toEqual({ background: '#fecaca' });
  });
});

describe('buildScene text wrapping', () => {
  /** Deterministic measurer: 7px per character. Column width is 50. */
  const measure: MeasureText = (t) => t.length * 7;
  const wrapParams = (over: Partial<BuildSceneParams> = {}): BuildSceneParams => ({
    geom: geom(),
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 200,
    clientHeight: 60,
    selection: new SelectionModel({ rowCount: 100, colCount: 100 }),
    getDisplay: () => 'foo bar baz',
    getWrap: () => true,
    measureText: measure,
    font: '13px x',
    ...over,
  });

  it('splits wrap-column text into lines (snapshot of the line division)', () => {
    // 50px wide, no padding: "foo bar" = 49px fits, "+ baz" = 77px breaks.
    const scene = buildScene(wrapParams());
    expect(scene.cells[0]!.lines).toEqual(['foo bar', 'baz']);
    // The unwrapped display text is still present for consumers.
    expect(scene.cells[0]!.text).toBe('foo bar baz');
  });

  it('subtracts wrapPaddingX per side from the wrap width', () => {
    // 50 - 2*10 = 30px: every 21px word gets its own line.
    const scene = buildScene(wrapParams({ wrapPaddingX: 10 }));
    expect(scene.cells[0]!.lines).toEqual(['foo', 'bar', 'baz']);
  });

  it('omits lines when the text fits on a single line', () => {
    const scene = buildScene(wrapParams({ getDisplay: () => 'ab' }));
    expect(scene.cells[0]!.lines).toBeUndefined();
  });

  it('omits lines for empty text', () => {
    const scene = buildScene(wrapParams({ getDisplay: () => '' }));
    expect(scene.cells[0]!.lines).toBeUndefined();
  });

  it('wraps only the default text path: plain and "text" cells, not typed cells', () => {
    const scene = buildScene(
      wrapParams({ getType: (_r, c) => (c === 0 ? 'checkbox' : c === 1 ? 'text' : undefined) }),
    );
    expect(scene.cells.find((k) => k.col === 0)!.lines).toBeUndefined();
    expect(scene.cells.find((k) => k.col === 1)!.lines).toEqual(['foo bar', 'baz']);
    expect(scene.cells.find((k) => k.col === 2)!.lines).toEqual(['foo bar', 'baz']);
  });

  it('does not wrap cells whose column has wrap disabled', () => {
    const scene = buildScene(wrapParams({ getWrap: (_r, c) => c === 1 }));
    expect(scene.cells.find((k) => k.col === 0)!.lines).toBeUndefined();
    expect(scene.cells.find((k) => k.col === 1)!.lines).toEqual(['foo bar', 'baz']);
  });

  it('stays inert when measureText is missing', () => {
    const scene = buildScene(wrapParams({ measureText: undefined }));
    expect(scene.cells[0]!.lines).toBeUndefined();
  });

  it('stays inert when the font is missing', () => {
    const scene = buildScene(wrapParams({ font: undefined }));
    expect(scene.cells[0]!.lines).toBeUndefined();
  });

  it('stays inert when no wrap accessor is provided (zero-cost default)', () => {
    const scene = buildScene(wrapParams({ getWrap: undefined }));
    expect(scene.cells[0]!.lines).toBeUndefined();
  });
});

describe('buildScene sparklines', () => {
  it('populates the sparkline shape from the accessor', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 100,
      selection: sel,
      getDisplay: () => '',
      getSparkline: (r, c) => (c === 0 ? { kind: 'line', points: [{ x: 1, y: 1 }] } : null),
    });
    expect(scene.cells.find((k) => k.col === 0)!.sparkline).toEqual({ kind: 'line', points: [{ x: 1, y: 1 }] });
    expect(scene.cells.find((k) => k.col === 1)!.sparkline).toBeUndefined();
  });
});

describe('buildScene comments', () => {
  it('flags commented cells via hasComment and leaves others undefined', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 60,
      selection: sel,
      getDisplay: () => '',
      hasComment: (r, c) => r === 0 && c === 0,
    });
    expect(scene.cells.find((k) => k.row === 0 && k.col === 0)!.comment).toBe(true);
    expect(scene.cells.find((k) => k.row === 0 && k.col === 1)!.comment).toBeUndefined();
  });
});

describe('buildScene summary (footer) cells', () => {
  const sel = () => new SelectionModel({ rowCount: 100, colCount: 100 });
  const base = {
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 240,
    clientHeight: 120,
    getDisplay: () => '',
  };

  it('omits summaryCells when the geometry declares no summary rows', () => {
    const scene = buildScene({ ...base, geom: geom(), selection: sel() });
    expect(scene.summaryCells).toBeUndefined();
  });

  it('omits summaryCells without a getSummaryDisplay accessor', () => {
    const scene = buildScene({
      ...base,
      geom: geom({ summaryRows: 1, summaryRowHeight: 20 }),
      selection: sel(),
    });
    expect(scene.summaryCells).toBeUndefined();
  });

  it('pins the band to the viewport bottom when content overflows', () => {
    const scene = buildScene({
      ...base,
      geom: geom({ summaryRows: 2, summaryRowHeight: 20 }),
      selection: sel(),
      getSummaryDisplay: (s, c) => `S${s}:${c}`,
    });
    const cells = scene.summaryCells!;
    expect(cells.length).toBeGreaterThan(0);
    // 100 rows x 20px overflow a 120px viewport -> band top = 120 - 40 = 80.
    const first = cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(first.rect).toMatchObject({ x: 40, y: 80, width: 50, height: 20 });
    expect(first.text).toBe('S0:0');
    expect(first.summary).toBe(true);
    expect(first.selected).toBe(false);
    expect(first.active).toBe(false);
    const second = cells.find((c) => c.row === 1 && c.col === 0)!;
    expect(second.rect.y).toBe(100);
    expect(second.text).toBe('S1:0');
  });

  it('sits directly below the last data row when content is short', () => {
    const scene = buildScene({
      ...base,
      geom: geom({
        rowSizes: new SizeManager({ count: 2, defaultSize: 20 }),
        summaryRows: 1,
        summaryRowHeight: 20,
      }),
      selection: sel(),
      getSummaryDisplay: () => 'total',
    });
    // content bottom = 20 (header) + 40 (2 rows) = 60 < 120 - 20.
    expect(scene.summaryCells![0]!.rect.y).toBe(60);
  });

  it('marks frozen-column summary cells and keeps them at their pinned x', () => {
    const scene = buildScene({
      ...base,
      scrollLeft: 100,
      geom: geom({ frozenCols: 1, summaryRows: 1, summaryRowHeight: 20 }),
      selection: sel(),
      getSummaryDisplay: () => '',
    });
    const cells = scene.summaryCells!;
    const frozen = cells.find((c) => c.col === 0)!;
    expect(frozen.frozen).toBe(true);
    expect(frozen.rect.x).toBe(40); // pinned despite scrollLeft
    expect(cells.find((c) => c.col === 2)!.frozen).toBe(false);
  });

  it('resolves column alignment through getAlign', () => {
    const scene = buildScene({
      ...base,
      geom: geom({ summaryRows: 1, summaryRowHeight: 20 }),
      selection: sel(),
      getSummaryDisplay: () => '1',
      getAlign: (_r, c) => (c === 1 ? 'right' : undefined),
    });
    const cells = scene.summaryCells!;
    expect(cells.find((c) => c.col === 1)!.align).toBe('right');
    expect(cells.find((c) => c.col === 0)!.align).toBeUndefined();
  });

  it('treats a missing summaryRowHeight as zero-height rows', () => {
    const scene = buildScene({
      ...base,
      geom: geom({ summaryRows: 1 }),
      selection: sel(),
      getSummaryDisplay: () => '',
    });
    expect(scene.summaryCells![0]!.rect.height).toBe(0);
  });
});

describe('buildScene placeholders (P0-4)', () => {
  it('attaches the hint only to empty cells', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 60,
      selection: sel,
      getDisplay: (r, c) => (r === 0 && c === 0 ? '12.50' : ''),
      getPlaceholder: (_r, c) => (c === 0 ? '0.00' : undefined),
    });
    // Value cell: display text wins, no placeholder.
    expect(scene.cells.find((k) => k.row === 0 && k.col === 0)!.placeholder).toBeUndefined();
    // Empty cell in the placeholder column: hint attached.
    expect(scene.cells.find((k) => k.row === 1 && k.col === 0)!.placeholder).toBe('0.00');
    // Empty cell in another column: accessor returned undefined.
    expect(scene.cells.find((k) => k.row === 0 && k.col === 1)!.placeholder).toBeUndefined();
  });

  it('leaves cells untouched when no accessor is supplied', () => {
    const sel = new SelectionModel({ rowCount: 100, colCount: 100 });
    const scene = buildScene({
      geom: geom(),
      scrollLeft: 0,
      scrollTop: 0,
      clientWidth: 200,
      clientHeight: 60,
      selection: sel,
      getDisplay: () => '',
    });
    expect(scene.cells.every((k) => k.placeholder === undefined)).toBe(true);
  });
});
