'use client';

import { useEffect, useMemo, useReducer, useState, type CSSProperties, type ReactElement } from 'react';
import type { ColumnNode } from '@ai-path/tb-core';
import {
  LatticaGrid,
  renderStaticTable,
  staticTablePrintCss,
  useGridController,
} from '@ai-path/tb-react';

const columns: readonly ColumnNode[] = [
  { headerName: 'Region' },
  {
    headerName: 'Order',
    children: [{ headerName: 'Product' }, { headerName: 'Units' }, { headerName: 'Revenue' }],
  },
];

const buttonStyle: CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #cbd2d9',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
};

export default function PrintPage(): ReactElement {
  const controller = useGridController({ rowCount: 12, colCount: 5, defaultColWidth: 112 });
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  const [preview, setPreview] = useState(true);
  const products = useMemo(
    () => [
      ['North', 'Planner', '18', '2100', 'Ready'],
      ['East', 'Binder', '9', '820', 'Review'],
      ['West', 'Notebook', '31', '4650', 'Ready'],
      ['South', 'Pen set', '14', '980', 'Hold'],
      ['North', 'Desk pad', '22', '2530', 'Ready'],
      ['East', 'Marker', '7', '420', 'Hold'],
      ['West', 'Folder', '16', '1200', 'Review'],
      ['South', 'Tape', '11', '330', 'Ready'],
      ['North', 'Label', '27', '540', 'Ready'],
      ['East', 'Clip', '40', '600', 'Review'],
      ['West', 'Envelope', '24', '720', 'Ready'],
      ['South', 'Stamp', '6', '1500', 'Hold'],
    ],
    [],
  );

  useEffect(() => {
    products.forEach((row, r) => {
      row.forEach((value, c) => controller.setCellText(r, c, value));
    });
    controller.setColumnAlign(2, 'right');
    controller.setColumnAlign(3, 'right');
    controller.setColumnFormat(3, '$#,##0');
  }, [controller, products]);

  const update = (fn: () => void) => {
    fn();
    refresh();
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{staticTablePrintCss}</style>
      <h1 style={{ margin: 0 }}>Print Static Table</h1>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} onClick={() => update(() => controller.toggleSort(3))}>
          Sort revenue
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => update(() => controller.setColumnSetFilter(4, ['Ready']))}
        >
          Ready only
        </button>
        <button type="button" style={buttonStyle} onClick={() => update(() => controller.hideColumn(4))}>
          Hide status
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => update(() => {
            controller.clearView();
            controller.showAllColumns();
          })}
        >
          Reset view
        </button>
        <button type="button" style={buttonStyle} onClick={() => setPreview((value) => !value)}>
          Print preview
        </button>
        <button type="button" style={buttonStyle} onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto' }}>
        <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
          <LatticaGrid controller={controller} columns={columns} width={650} height={360} />
        </div>
        {preview && (
          <div style={{ minWidth: 520, maxWidth: 760 }}>
            {renderStaticTable(controller, columns, {
              includeRowNumbers: true,
              maxRows: 10,
              caption: 'Current printable view',
            })}
          </div>
        )}
      </div>
    </main>
  );
}
