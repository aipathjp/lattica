'use client';

/**
 * Live-data demo. Fetches the dummy `sales_records` rows from the Neon demo
 * database (via the `/api/sales` route handler) and loads them into the
 * headless {@link GridController}: each row gets a `=Units*UnitPrice` formula
 * in the Revenue column, the Active column renders as checkboxes, the numeric
 * columns are right-aligned, and a conditional-format rule highlights high
 * revenue. Toolbar buttons drive sort / filter / search / CSV+XLSX export.
 *
 * Consumer code only — imports the published `@lattica/*` packages plus a
 * fetch() to the app's own API.
 */

import { useEffect, useState } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';
import { serializeDelimited, matrixToXlsx } from '@lattica/io';

interface SaleRow {
  id: number;
  region: string;
  category: string;
  product: string;
  sales_rep: string;
  units: number;
  unit_price: number;
  order_date: string;
  active: boolean;
}

const ROW_CAP = 150;

const columns: readonly ColumnNode[] = [
  { headerName: 'ID' },
  { headerName: 'Region' },
  { headerName: 'Category' },
  { headerName: 'Product' },
  { headerName: 'Sales Rep' },
  { headerName: 'Units' },
  { headerName: 'Unit Price' },
  { headerName: 'Revenue' },
  { headerName: 'Active' },
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

export default function DataPage(): React.ReactElement {
  const controller = useGridController({ rowCount: ROW_CAP, colCount: 9 });
  const [status, setStatus] = useState<string>('loading…');
  const [summary, setSummary] = useState<{ revenue: number; units: number; regions: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    // Right-align the numeric columns, render Active as checkboxes, and
    // highlight high-revenue cells — done once up front.
    controller.setColumnAlign(5, 'right');
    controller.setColumnAlign(6, 'right');
    controller.setColumnAlign(7, 'right');
    controller.setColumnType(8, 'checkbox');
    controller.conditionalFormat.addRule({
      kind: 'gt',
      value: 5000,
      style: { background: '#d8f5d0', bold: true },
    });

    void (async () => {
      try {
        const res = await fetch('/api/sales');
        const body = (await res.json()) as { rows?: SaleRow[]; error?: string };
        if (!res.ok || body.error) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const rows = (body.rows ?? []).slice(0, ROW_CAP);
        if (cancelled) return;

        rows.forEach((row, r) => {
          const line = r + 1; // 1-based for A1 references
          controller.setCellText(r, 0, String(row.id));
          controller.setCellText(r, 1, row.region);
          controller.setCellText(r, 2, row.category);
          controller.setCellText(r, 3, row.product);
          controller.setCellText(r, 4, row.sales_rep);
          controller.setCellText(r, 5, String(row.units));
          controller.setCellText(r, 6, row.unit_price.toFixed(2));
          // Revenue is computed by the formula engine from this row's cells,
          // rounded to 2 decimals to avoid floating-point display noise.
          controller.setCellText(r, 7, `=ROUND(F${line}*G${line},2)`);
          controller.setCellText(r, 8, row.active ? 'TRUE' : 'FALSE');
        });

        const revenue = rows.reduce((acc, x) => acc + x.units * x.unit_price, 0);
        const units = rows.reduce((acc, x) => acc + x.units, 0);
        const regions = new Set(rows.map((x) => x.region)).size;
        setSummary({ revenue, units, regions });
        setStatus(`loaded ${rows.length} rows from Neon`);
      } catch (err) {
        if (!cancelled) setStatus(`error: ${(err as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [controller]);

  const snapshot = (): string[][] => {
    const rows = controller.getRowCount();
    const cols = controller.getColCount();
    const header = [
      'ID',
      'Region',
      'Category',
      'Product',
      'Sales Rep',
      'Units',
      'Unit Price',
      'Revenue',
      'Active',
    ];
    const out: string[][] = [header];
    for (let r = 0; r < rows; r++) {
      // Stop at the first empty ID — only seeded rows are exported.
      if (controller.getDisplay(r, 0) === '') break;
      const line: string[] = [];
      for (let c = 0; c < cols; c++) line.push(controller.getDisplay(r, c));
      out.push(line);
    }
    return out;
  };

  const btn: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #cbd2d9',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  };

  const yen = (n: number) => `¥${Math.round(n).toLocaleString('ja-JP')}`;

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Lattica — Live Neon Data</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Dummy <code>sales_records</code> from a Neon Postgres database, loaded
        over <code>/api/sales</code>. The <strong>Revenue</strong> column is a{' '}
        <code>=Units*UnitPrice</code> formula evaluated by Lattica; high-revenue
        cells (&gt; 5000) are highlighted.
      </p>

      <div data-testid="data-status" style={{ fontWeight: 600, color: status.startsWith('error') ? '#c0392b' : '#0b7' }}>
        {status}
      </div>

      {summary && (
        <div data-testid="data-summary" style={{ display: 'flex', gap: 24, color: '#1f2933' }}>
          <span>Total revenue: <strong>{yen(summary.revenue)}</strong></span>
          <span>Total units: <strong>{summary.units.toLocaleString('ja-JP')}</strong></span>
          <span>Regions: <strong>{summary.regions}</strong></span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={btn} onClick={() => controller.toggleSort(7)}>
          Sort by Revenue
        </button>
        <button
          style={btn}
          onClick={() => controller.setColumnFilter(1, [{ kind: 'equals', value: 'Tokyo' }])}
        >
          Filter Region = Tokyo
        </button>
        <button
          style={btn}
          onClick={() => controller.setColumnFilter(5, [{ kind: 'gte', value: 50 }])}
        >
          Filter Units ≥ 50
        </button>
        <button style={btn} onClick={() => controller.clearView()}>
          Clear view
        </button>
        <button style={btn} onClick={() => controller.runSearch('Electronics')}>
          Search &quot;Electronics&quot;
        </button>
        <button
          style={btn}
          onClick={() => download(serializeDelimited(snapshot()), 'sales.csv', 'text/csv')}
        >
          Export CSV
        </button>
        <button
          style={btn}
          onClick={() =>
            download(
              matrixToXlsx(snapshot(), 'Sales') as unknown as BlobPart,
              'sales.xlsx',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            )
          }
        >
          Export XLSX
        </button>
      </div>

      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={920} height={520} />
      </div>
    </main>
  );
}
