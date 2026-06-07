'use client';

import { useEffect } from 'react';
import { LatticaGrid, LatticaChart, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const categories = ['Q1', 'Q2', 'Q3', 'Q4'];
const series = [
  { name: 'North', values: [30, 45, 28, 60] },
  { name: 'South', values: [20, 35, 50, 40] },
];

const columns: readonly ColumnNode[] = [{ headerName: 'Metric' }, { headerName: 'Trend' }];

export default function ChartsPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 6, colCount: 2, defaultColWidth: 140, defaultRowHeight: 30 });

  useEffect(() => {
    const rows: [string, number[]][] = [
      ['Revenue', [3, 5, 4, 7, 6, 9]],
      ['Users', [10, 8, 12, 11, 14, 13]],
      ['Churn', [2, 3, 1, 4, 2, 1]],
    ];
    rows.forEach(([label, vals], r) => {
      controller.setCellText(r, 0, label);
      controller.setCellSparkline(r, 1, vals, r === 2 ? 'bar' : 'line');
    });
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Charts &amp; Sparklines</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Standalone <b>charts</b> (line / bar / pie) plus in-cell <b>sparklines</b> in column B.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <LatticaChart spec={{ kind: 'line', categories, series }} width={320} height={200} />
        <LatticaChart spec={{ kind: 'bar', categories, series }} width={320} height={200} />
        <LatticaChart spec={{ kind: 'pie', categories, series: [{ name: 'Share', values: [40, 25, 20, 15] }] }} width={240} height={200} />
      </div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={290} height={140} />
      </div>
    </main>
  );
}
