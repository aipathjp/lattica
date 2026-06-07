'use client';

import { useEffect } from 'react';
import { LatticaGrid, LatticaStatusBar, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Currency' },
  { headerName: 'Percent' },
  { headerName: 'Color scale' },
  { headerName: 'Data bar' },
  { headerName: 'Icon set' },
];

export default function FormattingPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: 5, defaultColWidth: 130 });

  useEffect(() => {
    const vals = [12, 47, 88, 5, 63, 30, 99, 21];
    vals.forEach((v, r) => {
      controller.setCellText(r, 0, String(v * 137.5));
      controller.setCellText(r, 1, String(v / 100));
      controller.setCellText(r, 2, String(v));
      controller.setCellText(r, 3, String(v));
      controller.setCellText(r, 4, String(v));
    });
    controller.setColumnFormat(0, '$#,##0.00');
    controller.setColumnFormat(1, '0.0%');
    controller.setColorScale(2, ['#fee2e2', '#fca5a5', '#16a34a']);
    controller.setDataBar(3, '#93c5fd');
    controller.setIconSet(4, ['🔴', '🟡', '🟢']);
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Formatting &amp; Status Bar</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Number formats (<code>$#,##0.00</code>, <code>0.0%</code>) and visual conditional formatting:
        a 3-color <b>color scale</b>, in-cell <b>data bars</b>, and an <b>icon set</b>. Select a range
        of numbers to see the <b>status bar</b> aggregate update.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={690} height={380} />
        <LatticaStatusBar controller={controller} />
      </div>
    </main>
  );
}
