'use client';

import { useEffect } from 'react';
import { LatticaGrid, LatticaStatusBar, useGridController } from '@lattica/react';
import type { ColumnNode, IconSet } from '@lattica/core';

const columns: readonly ColumnNode[] = [
  { headerName: 'Currency' },
  { headerName: 'Percent' },
  { headerName: 'Color scale' },
  { headerName: 'Data bar' },
  { headerName: 'Icon set' },
];

const ICON_SETS: IconSet[] = ['traffic', 'signs', 'arrows', 'arrows5', 'triangles', 'ratings'];
const iconColumns: readonly ColumnNode[] = ICON_SETS.map((s) => ({ headerName: s }));

export default function FormattingPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: 5, defaultColWidth: 130 });
  const icons = useGridController({ rowCount: 12, colCount: 6, defaultColWidth: 100 });

  useEffect(() => {
    const vals = [12, 47, 88, 5, 63, 30, 99, 21];
    vals.forEach((v, r) => {
      controller.setCellText(r, 0, String(v * 137.5));
      controller.setCellText(r, 1, String(v / 100));
      controller.setCellText(r, 2, String(v));
      controller.setCellText(r, 3, String(v));
      controller.setCellText(r, 4, String(v));
    });
    controller.setColumnFormat(0, '$#,##0.00');
    controller.setColumnFormat(1, '0.0%');
    controller.setColorScale(2, ['#fee2e2', '#fca5a5', '#16a34a']);
    controller.setDataBar(3, '#5b8def');
    controller.setIconSet(4, 'traffic');
    controller.setColumnAlign(4, 'right'); // icon at left, value at right (no overlap)

    // Side-by-side gallery of every icon set.
    const series = [10, 35, 60, 85, 100, 20, 50, 95];
    ICON_SETS.forEach((set, c) => {
      series.forEach((v, r) => icons.setCellText(r, c, String(v)));
      icons.setIconSet(c, set);
      icons.setColumnAlign(c, 'right');
    });
  }, [controller, icons]);

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Formatting &amp; Status Bar</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Number formats (<code>$#,##0.00</code>, <code>0.0%</code>) and visual conditional formatting:
        a 3-color <b>color scale</b>, gradient <b>data bars</b>, and crisp vector <b>icon sets</b>.
        Select a range of numbers to see the <b>status bar</b> aggregate update.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={controller} columns={columns} width={690} height={300} />
        <LatticaStatusBar controller={controller} />
      </div>

      <h2 style={{ margin: '8px 0 0' }}>Icon set gallery</h2>
      <p style={{ margin: 0, color: '#52606d' }}>
        Excel-style vector icon sets (no emoji): traffic lights, circled signs, 3/5 directional arrows,
        triangles, and graduated rating bars.
      </p>
      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
        <LatticaGrid controller={icons} columns={iconColumns} width={648} height={290} />
      </div>
    </main>
  );
}
