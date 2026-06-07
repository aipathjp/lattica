'use client';

import { useEffect } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import {
  serializeDelimited,
  matrixToXlsx,
  writeStyledXlsx,
  tableToPdf,
  type StyledCell,
} from '@lattica/io';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Item' },
  { headerName: 'Region' },
  { headerName: 'Amount' },
];

const ROWS: [string, string, number][] = [
  ['Widget', 'Tokyo', 1240.5],
  ['Gadget', 'Osaka', 880],
  ['Gizmo', 'Nagoya', 2050.75],
];

function download(bytes: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 8, colCount: 3, defaultColWidth: 130 });

  useEffect(() => {
    ROWS.forEach(([i, r, a], row) => {
      controller.setCellText(row, 0, i);
      controller.setCellText(row, 1, r);
      controller.setCellText(row, 2, String(a));
    });
  }, [controller]);

  const matrix = (): string[][] => [
    ['Item', 'Region', 'Amount'],
    ...ROWS.map(([i, r, a]) => [i, r, String(a)]),
  ];

  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const btn: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#fff', cursor: 'pointer',
  };

  const exportStyledXlsx = (): void => {
    const rows: StyledCell[][] = [
      [{ value: 'Item', style: { bold: true } }, { value: 'Region', style: { bold: true } }, { value: 'Amount', style: { bold: true } }],
      ...ROWS.map(([i, r, a]) => [
        { value: i },
        { value: r },
        { value: a, style: { numFmt: '$#,##0.00', bgColor: a > 1500 ? 'D8F5D0' : 'FFFFFF' } },
      ]),
    ];
    download(writeStyledXlsx({ sheets: [{ name: 'Sales', rows }] }) as unknown as BlobPart, 'sales-styled.xlsx', XLSX_MIME);
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Export</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        All exporters are dependency-free and run in the browser: CSV, plain XLSX, <b>styled XLSX</b>{' '}
        (number formats + fills + bold), and a minimal <b>PDF</b>.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => download(serializeDelimited(matrix()), 'sales.csv', 'text/csv')}>Export CSV</button>
        <button style={btn} onClick={() => download(matrixToXlsx(matrix(), 'Sales') as unknown as BlobPart, 'sales.xlsx', XLSX_MIME)}>Export XLSX</button>
        <button style={btn} onClick={exportStyledXlsx}>Export styled XLSX</button>
        <button style={btn} onClick={() => download(tableToPdf(matrix(), { title: 'Sales Report' }) as unknown as BlobPart, 'sales.pdf', 'application/pdf')}>Export PDF</button>
      </div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={420} height={220} />
      </div>
    </main>
  );
}
