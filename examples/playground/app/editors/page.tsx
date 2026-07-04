'use client';

import { useEffect, useState } from 'react';
import { LatticaGrid, useGridController } from '@ai-path/lattica-react';
import type { ColumnNode } from '@ai-path/lattica-core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Region (dropdown)' },
  { headerName: 'Hired (date)' },
  { headerName: 'Skill (autocomplete)' },
  { headerName: 'Score (validated > 0)' },
  { headerName: 'Active (checkbox)' },
];

export default function EditorsPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: 5, defaultColWidth: 150 });
  const [cellOverlay, setCellOverlay] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    controller.setColumnType(0, 'dropdown');
    controller.setColumnOptions(0, ['Tokyo', 'Osaka', 'Nagoya', 'Fukuoka', 'Sapporo']);
    controller.setColumnType(1, 'date');
    controller.setColumnType(2, 'autocomplete');
    controller.setColumnOptions(2, ['React', 'TypeScript', 'Rust', 'Go', 'Python']);
    controller.setColumnType(4, 'checkbox');
    // Column 3: numeric > 0 validator — invalid commits turn the cell red.
    controller.setColumnValidator(3, (v) => typeof v === 'number' && v > 0);

    controller.setCellText(0, 0, 'Tokyo');
    controller.setCellText(0, 1, '2024-04-01');
    controller.setCellText(0, 2, 'TypeScript');
    controller.setCellText(0, 3, '88');
    controller.setCellText(0, 4, 'TRUE');
    controller.setCellText(1, 3, '-5'); // invalid → red on (re)commit
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Editors &amp; Validation</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Double-click a cell to edit. Column A is a <b>dropdown</b>, B a <b>date picker</b>, C an{' '}
        <b>autocomplete</b> input, E a <b>checkbox</b>. Column D requires a number &gt; 0 — type{' '}
        <code>-1</code> and commit to see the cell flagged <span style={{ color: '#b00020' }}>red</span>.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid
          controller={controller}
          columns={columns}
          width={798}
          height={420}
          cellOverlay={cellOverlay}
          onCellOverlayClose={() => setCellOverlay(null)}
          onCellClick={(hit) => setCellOverlay(hit)}
          renderCellOverlay={({ row, col, close }) => (
            <div
              style={{
                minWidth: 180,
                padding: 10,
                background: '#fff',
                border: '1px solid #94a3b8',
                boxShadow: '0 8px 20px rgba(15, 23, 42, 0.16)',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Row {row + 1}, Col {col + 1}
              </div>
              <div style={{ marginBottom: 10 }}>Value: {controller.getDisplay(row, col) || '(empty)'}</div>
              <button type="button" onClick={close}>
                Close
              </button>
            </div>
          )}
        />
      </div>
    </main>
  );
}
