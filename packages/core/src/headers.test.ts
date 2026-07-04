import { describe, it, expect, vi } from 'vitest';
import {
  computeHeaderLayout,
  HeaderModel,
  isGroup,
  type ColumnNode,
} from './headers.js';

const leaf = (headerName: string, extra: Partial<ColumnNode> = {}): ColumnNode => ({
  headerName,
  ...extra,
});

describe('isGroup', () => {
  it('discriminates groups from leaves', () => {
    expect(isGroup({ headerName: 'a' })).toBe(false);
    expect(isGroup({ headerName: 'g', children: [] })).toBe(true);
  });
});

describe('computeHeaderLayout — flat columns', () => {
  it('produces a single row of leaves', () => {
    const layout = computeHeaderLayout([leaf('A'), leaf('B'), leaf('C')]);
    expect(layout.depth).toBe(1);
    expect(layout.rows).toHaveLength(1);
    expect(layout.leaves.map((l) => l.def.headerName)).toEqual(['A', 'B', 'C']);
    expect(layout.rows[0]!.map((c) => c.colSpan)).toEqual([1, 1, 1]);
  });

  it('keeps rich leaf metadata without changing layout', () => {
    const layout = computeHeaderLayout([
      leaf('Amount', {
        field: 'amount',
        width: 120,
        type: 'number',
        editable: false,
        align: 'right',
        format: '#,##0',
        options: ['1', '2'],
        maxLength: 8,
      }),
    ]);
    expect(layout.depth).toBe(1);
    expect(layout.rows[0]![0]).toMatchObject({ label: 'Amount', colSpan: 1, rowSpan: 1 });
    expect(layout.leaves[0]!.def).toMatchObject({
      field: 'amount',
      width: 120,
      type: 'number',
      editable: false,
      align: 'right',
      format: '#,##0',
      maxLength: 8,
    });
  });

  it('returns an empty layout for no columns', () => {
    const layout = computeHeaderLayout([]);
    expect(layout).toEqual({ rows: [], leaves: [], depth: 0, rowLineCounts: [] });
  });
});

describe('computeHeaderLayout — nested groups', () => {
  const cols: ColumnNode[] = [
    leaf('ID'),
    {
      headerName: 'Name',
      children: [leaf('First'), leaf('Last')],
    },
    {
      headerName: 'Address',
      children: [
        leaf('Street'),
        { headerName: 'Region', children: [leaf('City'), leaf('Zip')] },
      ],
    },
  ];

  it('computes correct depth', () => {
    // ID(1), Name(2), Address->Region(3) => 3 rows
    expect(computeHeaderLayout(cols).depth).toBe(3);
  });

  it('orders leaves left to right', () => {
    const layout = computeHeaderLayout(cols);
    expect(layout.leaves.map((l) => l.def.headerName)).toEqual([
      'ID',
      'First',
      'Last',
      'Street',
      'City',
      'Zip',
    ]);
  });

  it('spans groups across their leaves', () => {
    const layout = computeHeaderLayout(cols);
    const name = layout.rows[0]!.find((c) => c.label === 'Name')!;
    expect(name.colSpan).toBe(2);
    expect(name.startLeaf).toBe(1);
    expect(name.endLeaf).toBe(3);
    const address = layout.rows[0]!.find((c) => c.label === 'Address')!;
    expect(address.colSpan).toBe(3);
    const region = layout.rows[1]!.find((c) => c.label === 'Region')!;
    expect(region.colSpan).toBe(2);
  });

  it('gives top-level leaves a rowSpan covering all header rows', () => {
    const layout = computeHeaderLayout(cols);
    const id = layout.rows[0]!.find((c) => c.label === 'ID')!;
    expect(id.rowSpan).toBe(3);
    expect(id.isGroup).toBe(false);
  });
});

describe('computeHeaderLayout — 3-tier group/item/unit headers', () => {
  // 大分類 / 項目 / 単位 の 3 段。単位が無い列は leaf を浅い段に直接置く
  // (省略形) か、`group('項目') → leaf('')` (空文字 leaf は吸収される)。
  const cols: ColumnNode[] = [
    leaf('No'), // 単位なし: トップ直下 leaf → 3 段ぶち抜き
    {
      headerName: '寸法',
      children: [
        { headerName: '幅', children: [leaf('mm', { field: 'w' })] },
        { headerName: '高さ', children: [leaf('mm', { field: 'h' })] },
        { headerName: '数量', field: 'qty' }, // 単位なし (省略形) → 2-3 段結合
      ],
    },
    {
      headerName: '検査',
      children: [
        { headerName: '判定', children: [leaf('', { field: 'result' })] }, // 空文字 leaf → 吸収
      ],
    },
  ];

  it('fixes the 3-tier layout: units on row 2, unit-less items span rows 1-2', () => {
    const layout = computeHeaderLayout(cols);
    expect(layout.depth).toBe(3);
    expect(layout.leaves.map((l) => l.def.field)).toEqual([undefined, 'w', 'h', 'qty', 'result']);

    // Row 0: No (rowSpan 3), 寸法 (colSpan 3), 検査 (colSpan 1).
    expect(layout.rows[0]!.map((c) => [c.label, c.rowSpan, c.colSpan])).toEqual([
      ['No', 3, 1],
      ['寸法', 1, 3],
      ['検査', 1, 1],
    ]);
    // Row 1: 幅/高さ (1 row each), 数量 (spans rows 1-2), 判定 (absorbed, spans rows 1-2).
    expect(layout.rows[1]!.map((c) => [c.label, c.rowSpan, c.isGroup])).toEqual([
      ['幅', 1, true],
      ['高さ', 1, true],
      ['数量', 2, false],
      ['判定', 2, false],
    ]);
    // Row 2: only the real unit cells remain — no empty placeholder cells.
    expect(layout.rows[2]!.map((c) => c.label)).toEqual(['mm', 'mm']);
  });

  it('keeps the absorbed leaf metadata and covers exactly one leaf', () => {
    const layout = computeHeaderLayout(cols);
    const hantei = layout.rows[1]!.find((c) => c.label === '判定')!;
    expect(hantei.isGroup).toBe(false);
    expect(hantei.collapsible).toBe(false);
    expect(hantei.startLeaf).toBe(4);
    expect(hantei.endLeaf).toBe(5);
    expect(layout.leaves[4]!.def).toMatchObject({ field: 'result', headerName: '' });
  });

  it('absorbs a top-level unit-less group down to depth 1', () => {
    const layout = computeHeaderLayout([
      { headerName: 'Only', children: [leaf('', { field: 'x' })] },
    ]);
    expect(layout.depth).toBe(1);
    expect(layout.rows[0]!.map((c) => [c.label, c.rowSpan, c.isGroup])).toEqual([['Only', 1, false]]);
    expect(layout.leaves[0]!.def.field).toBe('x');
  });

  it('does not absorb collapsible groups (chevron stays reachable)', () => {
    const layout = computeHeaderLayout([
      { headerName: 'G', collapsible: true, children: [leaf('', { field: 'x' })] },
    ]);
    expect(layout.depth).toBe(2);
    const g = layout.rows[0]![0]!;
    expect(g.isGroup).toBe(true);
    expect(g.collapsible).toBe(true);
    expect(layout.rows[1]!.map((c) => c.label)).toEqual(['']);
  });

  it('does not absorb groups with multiple children or a non-empty leaf label', () => {
    const multi = computeHeaderLayout([
      { headerName: 'G', children: [leaf('', { field: 'a' }), leaf('kg', { field: 'b' })] },
    ]);
    expect(multi.rows[0]![0]!.isGroup).toBe(true);
    const named = computeHeaderLayout([
      { headerName: 'G', children: [leaf('kg', { field: 'a' })] },
    ]);
    expect(named.rows[0]![0]!.isGroup).toBe(true);
    expect(named.rows[1]![0]!.label).toBe('kg');
  });

  it('does not absorb a group whose only child is itself a group', () => {
    const layout = computeHeaderLayout([
      { headerName: 'Outer', children: [{ headerName: 'Inner', children: [leaf('', { field: 'x' })] }] },
    ]);
    expect(layout.depth).toBe(2);
    expect(layout.rows[0]![0]!).toMatchObject({ label: 'Outer', isGroup: true, rowSpan: 1 });
    // Inner is absorbed at depth 1 and spans to the bottom.
    expect(layout.rows[1]![0]!).toMatchObject({ label: 'Inner', isGroup: false, rowSpan: 1 });
  });
});

describe('computeHeaderLayout — rowLineCounts (multi-line labels)', () => {
  it('reports 1 for every row of single-line layouts', () => {
    const layout = computeHeaderLayout([
      leaf('A'),
      { headerName: 'G', children: [leaf('B'), leaf('C')] },
    ]);
    expect(layout.rowLineCounts).toEqual([1, 1]);
  });

  it('counts "\\n" lines per header row', () => {
    const layout = computeHeaderLayout([
      { headerName: 'グループ', children: [leaf('項目名\n(単位)'), leaf('短い')] },
    ]);
    expect(layout.rowLineCounts).toEqual([1, 2]);
  });

  it('takes the max across cells in the same row', () => {
    const layout = computeHeaderLayout([leaf('a\nb\nc'), leaf('x\ny'), leaf('z')]);
    expect(layout.rowLineCounts).toEqual([3]);
  });

  it('distributes a spanning cell\'s lines across its covered rows', () => {
    // Leaf at depth 0 spanning 2 rows with 3 lines -> ceil(3/2) = 2 per row.
    const layout = computeHeaderLayout([
      leaf('一\n二\n三'),
      { headerName: 'G', children: [leaf('B')] },
    ]);
    expect(layout.depth).toBe(2);
    expect(layout.rowLineCounts).toEqual([2, 2]);
  });
});

describe('collapsing', () => {
  const cols: ColumnNode[] = [
    {
      id: 'g1',
      headerName: 'Group',
      collapsible: true,
      children: [
        leaf('Summary', { showWhen: 'always' }),
        leaf('Detail1', { showWhen: 'open' }),
        leaf('Detail2', { showWhen: 'open' }),
      ],
    },
  ];

  it('shows all "always"/"open" children when expanded', () => {
    const layout = computeHeaderLayout(cols, new Set());
    expect(layout.leaves.map((l) => l.def.headerName)).toEqual(['Summary', 'Detail1', 'Detail2']);
  });

  it('hides "open" children when collapsed', () => {
    const layout = computeHeaderLayout(cols, new Set(['g1']));
    expect(layout.leaves.map((l) => l.def.headerName)).toEqual(['Summary']);
    const group = layout.rows[0]!.find((c) => c.label === 'Group')!;
    expect(group.collapsed).toBe(true);
    expect(group.collapsible).toBe(true);
  });

  it('shows "closed" children only when collapsed', () => {
    const cols2: ColumnNode[] = [
      {
        id: 'g',
        headerName: 'G',
        collapsible: true,
        children: [leaf('Always'), leaf('WhenClosed', { showWhen: 'closed' })],
      },
    ];
    expect(computeHeaderLayout(cols2, new Set()).leaves.map((l) => l.def.headerName)).toEqual([
      'Always',
    ]);
    expect(computeHeaderLayout(cols2, new Set(['g'])).leaves.map((l) => l.def.headerName)).toEqual([
      'Always',
      'WhenClosed',
    ]);
  });

  it('drops a group with no visible children', () => {
    const cols3: ColumnNode[] = [
      { id: 'g', headerName: 'G', collapsible: true, children: [leaf('X', { showWhen: 'open' })] },
      leaf('Y'),
    ];
    const layout = computeHeaderLayout(cols3, new Set(['g']));
    expect(layout.leaves.map((l) => l.def.headerName)).toEqual(['Y']);
    expect(layout.rows[0]!.some((c) => c.label === 'G')).toBe(false);
  });

  it('honors collapsedByDefault', () => {
    const cols4: ColumnNode[] = [
      {
        id: 'g',
        headerName: 'G',
        collapsible: true,
        collapsedByDefault: true,
        children: [leaf('A'), leaf('B', { showWhen: 'open' })],
      },
    ];
    // Default collapsed -> B hidden.
    expect(computeHeaderLayout(cols4).leaves.map((l) => l.def.headerName)).toEqual(['A']);
    // Explicitly expanded via "!g" marker.
    expect(computeHeaderLayout(cols4, new Set(['!g'])).leaves.map((l) => l.def.headerName)).toEqual([
      'A',
      'B',
    ]);
  });

  it('does not collapse non-collapsible groups', () => {
    const cols5: ColumnNode[] = [
      { id: 'g', headerName: 'G', children: [leaf('A'), leaf('B', { showWhen: 'open' })] },
    ];
    expect(computeHeaderLayout(cols5, new Set(['g'])).leaves).toHaveLength(2);
  });
});

describe('HeaderModel', () => {
  const cols: ColumnNode[] = [
    {
      id: 'g1',
      headerName: 'Group',
      collapsible: true,
      children: [leaf('Summary'), leaf('Detail', { showWhen: 'open' })],
    },
  ];

  it('toggles collapse and notifies', () => {
    const model = new HeaderModel(cols);
    const listener = vi.fn();
    const off = model.subscribe(listener);
    expect(model.getLayout().leaves).toHaveLength(2);

    model.toggle('g1');
    expect(model.getLayout().leaves).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);

    model.toggle('g1');
    expect(model.getLayout().leaves).toHaveLength(2);

    off();
    model.toggle('g1');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('setCollapsed sets explicit state', () => {
    const model = new HeaderModel(cols);
    model.setCollapsed('g1', true);
    expect(model.getLayout().leaves).toHaveLength(1);
    model.setCollapsed('g1', false);
    expect(model.getLayout().leaves).toHaveLength(2);
  });

  it('toggle works against collapsedByDefault groups', () => {
    const c: ColumnNode[] = [
      {
        id: 'gd',
        headerName: 'GD',
        collapsible: true,
        collapsedByDefault: true,
        children: [leaf('A'), leaf('B', { showWhen: 'open' })],
      },
    ];
    const model = new HeaderModel(c);
    expect(model.getLayout().leaves).toHaveLength(1); // collapsed by default
    model.toggle('gd');
    expect(model.getLayout().leaves).toHaveLength(2); // now expanded
  });

  it('toggling an unknown group id falls back to the collapsed set', () => {
    const model = new HeaderModel(cols);
    // No cell with this id exists in the layout -> currentlyCollapsed defaults
    // to membership in the (empty) collapsed set = false, so it collapses.
    model.toggle('does-not-exist');
    // Layout is unaffected (id matches no real group) but no throw occurs.
    expect(model.getLayout().leaves).toHaveLength(2);
  });

  it('setColumns replaces and notifies', () => {
    const model = new HeaderModel(cols);
    const listener = vi.fn();
    model.subscribe(listener);
    model.setColumns([leaf('Solo')]);
    expect(model.getLayout().leaves.map((l) => l.def.headerName)).toEqual(['Solo']);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
