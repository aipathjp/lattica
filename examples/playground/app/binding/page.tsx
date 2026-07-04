'use client';

import { useState, type ReactElement } from 'react';
import { LatticaGrid, useGridController } from '@ai-path/lattica-react';
import type { ColumnNode } from '@ai-path/lattica-core';

interface ProductRecord {
  sku: string;
  item: string;
  qty: number;
  status: 'Open' | 'Closed';
  locked: boolean;
}

const richColumns: ColumnNode[] = [
  { headerName: 'SKU', field: 'sku', width: 110, type: 'text', editable: false, maxLength: 12 },
  { headerName: 'Item', field: 'item', width: 220, type: 'text', editable: true },
  { headerName: 'Qty', field: 'qty', width: 90, type: 'number', align: 'right', format: '#,##0' },
  {
    headerName: 'Status',
    field: 'status',
    width: 120,
    type: 'dropdown',
    options: ['Open', 'Closed'],
    align: 'center',
  },
  { headerName: 'Locked', field: 'locked', width: 90, type: 'checkbox', align: 'center' },
];

const initialRows: ProductRecord[] = [
  { sku: 'LT-100', item: 'Planning Board', qty: 12, status: 'Open', locked: true },
  { sku: 'LT-210', item: 'Ops Tracker', qty: 7, status: 'Open', locked: false },
  { sku: 'LT-330', item: 'Finance Sheet', qty: 3, status: 'Closed', locked: true },
];

const reloadedRows: ProductRecord[] = [
  { sku: 'LT-420', item: 'Inventory Review', qty: 18, status: 'Open', locked: false },
  { sku: 'LT-510', item: 'Quarterly Report', qty: 5, status: 'Closed', locked: true },
];

export default function BindingDemo(): ReactElement {
  const controller = useGridController({ rowCount: 1, colCount: 1 });
  const [records, setRecords] = useState<ProductRecord[]>(initialRows);

  const addRow = (): void => {
    const next = records.length + 1;
    setRecords([
      ...records,
      {
        sku: `LT-${600 + next}`,
        item: `New Work Item ${next}`,
        qty: next * 2,
        status: 'Open',
        locked: false,
      },
    ]);
  };

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1 style={{ marginTop: 0 }}>Declarative Data Binding</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={addRow}>Add row</button>
        <button type="button" onClick={() => setRecords(records.slice(0, -1))}>Remove row</button>
        <button type="button" onClick={() => setRecords(reloadedRows)}>Reload data</button>
      </div>
      <LatticaGrid controller={controller} rows={records} columns={richColumns} width={760} height={320} />
    </main>
  );
}
