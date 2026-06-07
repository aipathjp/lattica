'use client';

import { useEffect, useState } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Region' },
  { headerName: 'Product' },
  { headerName: 'Units' },
];

const SEED: [string, string, number][] = [
  ['Tokyo', 'Widget', 30],
  ['Osaka', 'Gadget', 12],
  ['Tokyo', 'Gizmo', 45],
  ['Nagoya', 'Widget', 7],
  ['Osaka', 'Widget', 22],
  ['Tokyo', 'Gadget', 60],
];

export default function DataOpsPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: 3, defaultColWidth: 130 });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    SEED.forEach(([r, p, u], i) => {
      controller.setCellText(i, 0, r);
      controller.setCellText(i, 1, p);
      controller.setCellText(i, 2, String(u));
    });
  }, [controller]);

  const sum = () => setMsg(`Sum(Units) over visible rows = ${controller.aggregateColumn(2, 'sum')}`);

  const btn: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#fff', cursor: 'pointer',
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Sort / Filter / Find</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Click the <b>▽</b> on a column header for the faceted <b>filter dropdown</b>; click <b>⇅/▲/▼</b> to
        sort (Shift = multi-sort). Right-click a header to <b>Hide column</b> / <b>Show all columns</b>.
        Buttons below drive find &amp; replace and a column aggregate.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => { const n = controller.replaceAll('Widget', 'WIDGET'); setMsg(`Replaced ${n} cells`); }}>
          Replace &quot;Widget&quot; → &quot;WIDGET&quot;
        </button>
        <button style={btn} onClick={() => controller.toggleSort(2)}>Sort Units</button>
        <button style={btn} onClick={() => controller.clearView()}>Clear sort/filter</button>
        <button style={btn} onClick={sum}>Sum Units (visible)</button>
      </div>
      <div data-testid="data-ops-msg" style={{ color: '#0b7', minHeight: 18 }}>{msg}</div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={420} height={360} />
      </div>
    </main>
  );
}
