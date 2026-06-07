'use client';

import { useEffect } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';
import { matrixToXlsx } from '@lattica/io';

const columns: ColumnNode[] = [
  { headerName: 'Item', field: 'item' },
  {
    headerName: 'Q1 / Q2',
    children: [{ headerName: 'Q1' }, { headerName: 'Q2' }],
  },
  {
    headerName: 'Analysis',
    collapsible: true,
    children: [
      { headerName: 'Total' },
      { headerName: 'Avg', showWhen: 'open' },
    ],
  },
];

export default function Page() {
  const controller = useGridController({ rowCount: 1000, colCount: 5 });

  useEffect(() => {
    controller.setCellText(0, 0, 'Apples');
    controller.setCellText(0, 1, '120');
    controller.setCellText(0, 2, '150');
    controller.setCellText(0, 3, '=B1+C1'); // 270
    controller.setCellText(0, 4, '=AVERAGE(B1:C1)'); // 135
  }, [controller]);

  const exportXlsx = () => {
    const matrix = [
      ['Item', 'Q1', 'Q2', 'Total', 'Avg'],
      ['Apples', '120', '150', '270', '135'],
    ];
    const bytes = matrixToXlsx(matrix, 'Sales');
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main style={{ padding: 16 }}>
      <h1>Lattica Playground</h1>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <a href="/kitchen-sink" data-testid="nav-kitchen-sink">
          Kitchen Sink
        </a>
        <a href="/spill" data-testid="nav-spill">
          Dynamic Arrays (spill)
        </a>
      </nav>
      <button onClick={exportXlsx}>Export XLSX</button>
      <div style={{ marginTop: 12, border: '1px solid #cbd2d9' }}>
        <LatticaGrid controller={controller} columns={columns} width={800} height={480} />
      </div>
    </main>
  );
}
