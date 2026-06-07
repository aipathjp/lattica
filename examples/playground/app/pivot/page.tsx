'use client';

import { useEffect, useState } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import { pivot, pivotToMatrix, type AggregateFn, type CellValue } from '@lattica/core';
import type { ColumnNode } from '@lattica/core';

const RECORDS: Record<string, CellValue>[] = [
  { region: 'East', product: 'A', units: 10 },
  { region: 'East', product: 'B', units: 20 },
  { region: 'West', product: 'A', units: 5 },
  { region: 'West', product: 'B', units: 7 },
  { region: 'East', product: 'A', units: 3 },
  { region: 'North', product: 'B', units: 14 },
];

export default function PivotPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 12, colCount: 6, defaultColWidth: 110 });
  const [agg, setAgg] = useState<AggregateFn>('sum');

  useEffect(() => {
    const result = pivot(RECORDS, { rows: ['region'], columns: ['product'], value: 'units', agg });
    const matrix = pivotToMatrix(result);
    // Clear then write the pivot matrix into the grid.
    for (let r = 0; r < 12; r++) for (let c = 0; c < 6; c++) controller.setCellText(r, c, '');
    matrix.forEach((row, r) => row.forEach((cell, c) => controller.setCellText(r, c, cell === null ? '' : String(cell))));
  }, [controller, agg]);

  const columns: readonly ColumnNode[] = Array.from({ length: 6 }, () => ({ headerName: '' }));
  const btn = (a: AggregateFn): React.CSSProperties => ({
    padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, cursor: 'pointer',
    background: agg === a ? '#2563eb' : '#fff', color: agg === a ? '#fff' : '#1f2933',
  });

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Pivot Table</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Cross-tabulate <code>region × product</code> aggregating <code>units</code>, with row/column/grand
        totals. Switch the aggregation function:
      </p>
      <div style={{ display: 'flex', gap: 8 }} data-testid="pivot-aggs">
        {(['sum', 'avg', 'count', 'max'] as AggregateFn[]).map((a) => (
          <button key={a} style={btn(a)} onClick={() => setAgg(a)} data-testid={`agg-${a}`}>{a}</button>
        ))}
      </div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={680} height={280} />
      </div>
    </main>
  );
}
