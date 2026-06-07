'use client';

import { useEffect } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = Array.from({ length: 20 }, (_, i) => ({
  headerName: i === 0 ? 'Label' : `Col ${i}`,
}));

export default function FreezePage(): React.ReactElement {
  // Freeze the first row and first column; the rest scrolls.
  const controller = useGridController({
    rowCount: 200,
    colCount: 20,
    frozenRows: 1,
    frozenCols: 1,
    defaultColWidth: 90,
  });

  useEffect(() => {
    // Frozen header row + frozen label column.
    for (let c = 1; c < 20; c++) controller.setCellText(0, c, `H${c}`);
    for (let r = 1; r < 200; r++) {
      controller.setCellText(r, 0, `Row ${r}`);
      for (let c = 1; c < 20; c++) controller.setCellText(r, c, String(r * 100 + c));
    }
    controller.setCellText(0, 0, '★');
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Frozen Panes &amp; Column Resize</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Row 1 and Column A are <b>frozen</b> — scroll the grid (wheel / arrows) and they stay put while
        the data scrolls. <b>Resize</b> any column by dragging its header's right border (the cursor
        becomes <code>col-resize</code>); row borders resize rows.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={760} height={420} />
      </div>
    </main>
  );
}
