'use client';

import { useEffect, useReducer } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Order' },
  { headerName: 'Customer' },
  { headerName: 'Total' },
];

const ORDERS = [
  { id: 'A-1001', customer: 'Acme', total: 1240, items: ['2× Widget', '1× Gadget'] },
  { id: 'A-1002', customer: 'Globex', total: 880, items: ['4× Gizmo'] },
  { id: 'A-1003', customer: 'Initech', total: 2050, items: ['1× Sprocket', '3× Cog', '2× Widget'] },
];

export default function MasterDetailPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 10, colCount: 3, defaultColWidth: 140 });
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    controller.setDetailHeight(90);
    ORDERS.forEach((o, r) => {
      controller.setCellText(r, 0, o.id);
      controller.setCellText(r, 1, o.customer);
      controller.setCellText(r, 2, String(o.total));
    });
    const off = controller.on('change', () => force());
    return off;
  }, [controller]);

  const btn: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#fff', cursor: 'pointer',
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Master / Detail</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Expand a row to reveal a custom detail panel (the order's line items). Toggle below or call
        <code> controller.toggleDetail(row)</code>.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {ORDERS.map((o, r) => (
          <button key={o.id} style={btn} onClick={() => controller.toggleDetail(r)}>
            Toggle {o.id}
          </button>
        ))}
      </div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid
          controller={controller}
          columns={columns}
          width={440}
          height={420}
          renderDetail={(physRow) => {
            const o = ORDERS[physRow];
            return (
              <div style={{ padding: 8, fontSize: 13 }}>
                <strong>Line items for {o?.id}</strong>
                <ul style={{ margin: '4px 0 0 16px' }}>
                  {(o?.items ?? []).map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            );
          }}
        />
      </div>
    </main>
  );
}
