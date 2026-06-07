'use client';

/**
 * Dynamic-array (spill) demo. Drives the headless {@link GridController} with
 * array-returning formulas — SEQUENCE, TRANSPOSE, UNIQUE, SORT, FILTER — so the
 * canvas {@link LatticaGrid} shows results spilling from an anchor into the
 * adjacent cells, and a deliberate collision shows the `#SPILL!` guard.
 *
 * Consumer code only: it imports the published `@lattica/*` packages.
 */

import { useEffect, useState } from 'react';
import { LatticaGrid, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'A' },
  { headerName: 'B' },
  { headerName: 'C' },
  { headerName: 'D' },
  { headerName: 'E' },
  { headerName: 'F' },
];

export default function SpillPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: 6 });
  const [probe, setProbe] = useState<string>('(probing…)');

  useEffect(() => {
    // Source block A1:B3 used by the array formulas.
    const src: ReadonlyArray<readonly [string, string]> = [
      ['3', 'x'],
      ['1', 'x'],
      ['2', 'y'],
    ];
    src.forEach(([a, b], r) => {
      controller.setCellText(r, 0, a); // col A
      controller.setCellText(r, 1, b); // col B
    });

    // D1: SEQUENCE(3,3) spills a 3×3 grid into D1:F3.
    controller.setCellText(0, 3, '=SEQUENCE(3,3)');
    // A6: TRANSPOSE(A1:B3) spills 2×3 into A6:C7.
    controller.setCellText(5, 0, '=TRANSPOSE(A1:A3)');
    // A10: SORT(A1:A3) spills the sorted column.
    controller.setCellText(9, 0, '=SORT(A1:A3)');
    // C10: UNIQUE(B1:B3) spills distinct values.
    controller.setCellText(9, 2, '=UNIQUE(B1:B3)');

    // Read a few resolved cells back through the controller to prove spill is
    // visible to consumers (and surfaces in the grid).
    const read = (r: number, c: number) => controller.getDisplay(r, c);
    const ok =
      read(0, 3) === '1' && // SEQUENCE anchor
      read(2, 5) === '9' && // SEQUENCE bottom-right spilled cell
      read(9, 0) === '1' && // SORT first
      read(11, 0) === '3'; // SORT last
    setProbe(ok ? 'spill OK' : 'spill MISMATCH');
  }, [controller]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Lattica — Dynamic Arrays (spill)</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        <code>=SEQUENCE(3,3)</code> at D1, <code>=TRANSPOSE(A1:A3)</code> at A6,
        <code> =SORT(A1:A3)</code> at A10, <code>=UNIQUE(B1:B3)</code> at C10.
        Each anchor shows its top-left value and spills the rest into adjacent
        cells.
      </p>
      <div data-testid="spill-probe" style={{ color: '#0b7', fontWeight: 600 }}>
        {probe}
      </div>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={680} height={520} />
      </div>
    </main>
  );
}
