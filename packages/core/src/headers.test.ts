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

  it('returns an empty layout for no columns', () => {
    const layout = computeHeaderLayout([]);
    expect(layout).toEqual({ rows: [], leaves: [], depth: 0 });
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
