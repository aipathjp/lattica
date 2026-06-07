'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LatticaGrid, LatticaFormulaBar, LatticaStatusBar, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

type Mode = 'fitWidth' | 'fullScreen' | 'resizable' | 'fixed';

const columns: readonly ColumnNode[] = [
  { headerName: 'Item' },
  { headerName: 'Region' },
  { headerName: 'Amount ($)' },
  { headerName: 'Margin (%)' },
];

export default function FullscreenPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 500, colCount: 4, defaultColWidth: 160 });
  const [mode, setMode] = useState<Mode>('fitWidth');
  const gridBoxRef = useRef<HTMLDivElement | null>(null);

  // Stretch the 4 columns to always fill the container width — a fill-mode
  // showcase should leave no dead space right of the last column in any mode.
  useEffect(() => {
    const el = gridBoxRef.current;
    if (el === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w === undefined) {
        return;
      }
      // Inner width minus the row-number gutter (48px), split across 4 columns;
      // the last column absorbs the rounding remainder.
      const inner = Math.max(320, Math.floor(w) - 48);
      const base = Math.floor(inner / 4);
      for (let c = 0; c < 4; c++) {
        controller.resizeCol(c, c === 3 ? inner - base * 3 : base);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [controller]);

  useEffect(() => {
    controller.setColumnFormat(2, '$#,##0.00');
    controller.setColumnFormat(3, '0.0%');
    for (let r = 0; r < 60; r++) {
      controller.setCellText(r, 0, `SKU-${1000 + r}`);
      controller.setCellText(r, 1, ['Tokyo', 'Osaka', 'Nagoya'][r % 3]!);
      controller.setCellText(r, 2, String(1000 + r * 137.5));
      controller.setCellText(r, 3, String((r % 40) / 100));
    }
  }, [controller]);

  // The container size; the grid fills it via `fill`.
  const containerStyle: CSSProperties =
    mode === 'fitWidth'
      ? { width: '100%', height: '70vh' }
      : mode === 'fullScreen'
        ? { width: '100%', height: 'calc(100vh - 120px)' }
        : mode === 'resizable'
          ? { width: 700, height: 360, resize: 'both', overflow: 'hidden' }
          : { width: 520, height: 320 };

  const chip = (m: Mode, label: string): React.ReactElement => (
    <button
      onClick={() => setMode(m)}
      data-testid={`mode-${m}`}
      style={{
        padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, cursor: 'pointer',
        background: mode === m ? '#2563eb' : '#fff', color: mode === m ? '#fff' : '#1f2933',
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Full-size &amp; Resizable Grid</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        The grid uses <code>&lt;LatticaGrid fill /&gt;</code> to expand to its container. Switch the
        container below — <b>Fit width</b>, <b>Full screen</b>, a <b>drag-resizable</b> box (grab the
        bottom-right corner), or a fixed size. Number formats also accept human input: type{' '}
        <code>1,234</code> or <code>$2,000</code> in the Amount column, or <code>50%</code> in Margin.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {chip('fitWidth', 'Fit width')}
        {chip('fullScreen', 'Full screen')}
        {chip('resizable', 'Resizable box')}
        {chip('fixed', 'Fixed')}
      </div>
      <div
        data-testid="grid-container"
        style={{
          ...containerStyle,
          border: '1px solid #cbd2d9',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        <LatticaFormulaBar controller={controller} />
        <div ref={gridBoxRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
          <LatticaGrid controller={controller} columns={columns} fill />
        </div>
        <LatticaStatusBar controller={controller} />
      </div>
    </main>
  );
}
