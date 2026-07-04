'use client';

import { useCallback, useEffect } from 'react';
import { LatticaGrid, useGridController } from '@ai-path/lattica-react';
import { deserializeState, serializeState, type ColumnNode, type GridStateSnapshot } from '@ai-path/lattica-core';

const columns: readonly ColumnNode[] = Array.from({ length: 20 }, (_, i) => ({
  headerName: i === 0 ? 'Label' : `Col ${i}`,
}));

const STORAGE_KEY = 'lattica-freeze-view';
const defaultViewState: GridStateSnapshot = {
  version: 1,
  columnWidths: {},
  rowHeights: {},
  hiddenColumns: [],
  hiddenRows: [],
  columnOrder: Array.from({ length: 20 }, (_, i) => i),
  sort: [],
  frozenRows: 1,
  frozenCols: 1,
};

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

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return;
    }
    try {
      controller.applyViewState(deserializeState(saved));
    } catch {
      // Ignore stale or hand-edited demo state.
    }
  }, [controller]);

  const saveViewState = useCallback((snapshot: GridStateSnapshot) => {
    window.localStorage.setItem(STORAGE_KEY, serializeState(snapshot));
  }, []);

  const resetSavedView = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    controller.applyViewState(defaultViewState);
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Frozen Panes &amp; Column Resize</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Row 1 and Column A are <b>frozen</b> — scroll the grid (wheel / arrows) and they stay put while
        the data scrolls. <b>Resize</b> any column by dragging its header's right border (the cursor
        becomes <code>col-resize</code>); row borders resize rows. Column widths are saved to
        localStorage, so drag a column wider and reload to see the view restored.
      </p>
      <button type="button" onClick={resetSavedView} style={{ width: 'fit-content' }}>
        Reset saved view
      </button>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid
          controller={controller}
          columns={columns}
          width={760}
          height={420}
          onViewStateChange={saveViewState}
        />
      </div>
    </main>
  );
}
