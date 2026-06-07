'use client';

import { useEffect } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = Array.from({ length: 7 }, (_, i) => ({
  headerName: String.fromCharCode(65 + i),
}));

export default function FormulasPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 24, colCount: 7, defaultColWidth: 110 });

  useEffect(() => {
    const e = controller.engine;
    // Source data A1:B4 (key/value) for lookups + structured refs.
    const data: [string, number][] = [
      ['apple', 120],
      ['banana', 80],
      ['cherry', 200],
    ];
    data.forEach(([k, v], r) => {
      controller.setCellText(r, 0, k);
      controller.setCellText(r, 1, String(v));
    });
    // Register a table "Fruit" with columns Name/Price (data at A1, 3 rows).
    e.defineTable('Fruit', { row: 0, col: 0, rowCount: 3, headers: ['Name', 'Price'] });

    // D1: dynamic array spill (SEQUENCE) ; D5: SORT ; F1: XLOOKUP ; F3: LET ;
    // F5: SUM over a structured reference ; A7: MAP via LAMBDA.
    controller.setCellText(0, 3, '=SEQUENCE(3,2,1)'); // spills D1:E3
    controller.setCellText(4, 3, '=SORT(B1:B3,1,-1)'); // spills sorted prices
    controller.setCellText(0, 5, '=XLOOKUP("cherry",A1:A3,B1:B3)'); // 200
    controller.setCellText(2, 5, '=LET(x,B1,y,B3,x+y)'); // 320
    controller.setCellText(4, 5, '=SUM(Fruit[Price])'); // 400 (structured ref)
    controller.setCellText(6, 0, '=MAP(B1:B3,LAMBDA(p,p*1.1))'); // spills 132/88/220
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Formulas &amp; Dynamic Arrays</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        150 Excel-compatible functions, dynamic-array <b>spill</b>, and structured references. Here:
        <code> SEQUENCE</code> (D1), <code>SORT</code> (D5), <code>XLOOKUP</code> (F1),
        <code> LET</code> (F3), <code>SUM(Fruit[Price])</code> structured ref (F5), and
        <code> MAP(…,LAMBDA(…))</code> (A7). Click a spilled cell to confirm it is virtual.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={790} height={420} />
      </div>
    </main>
  );
}
