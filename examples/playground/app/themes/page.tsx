'use client';

import { useEffect, useState } from 'react';
import {
  LatticaGrid,
  LatticaStatusBar,
  useGridController,
  buildTheme,
  densityOptions,
  type Density,
  type PaletteName,
} from '@lattica/react';
import type { ColumnNode } from '@lattica/core';

const PALETTES: PaletteName[] = ['light', 'dark', 'highContrast', 'midnight', 'sepia', 'solarizedLight', 'solarizedDark'];
const DENSITIES: Density[] = ['compact', 'comfortable', 'spacious'];

const columns: readonly ColumnNode[] = ['Item', 'Q1', 'Q2', 'Q3', 'Q4', 'Total'].map((h) => ({
  headerName: h,
}));

/** Inner grid; keyed by density in the parent so a new controller mounts on change. */
function ThemedGrid({ palette, density }: { palette: PaletteName; density: Density }): React.ReactElement {
  const controller = useGridController({ rowCount: 40, colCount: 6, ...densityOptions(density) });
  useEffect(() => {
    for (let r = 0; r < 8; r++) {
      controller.setCellText(r, 0, `Product ${r + 1}`);
      for (let c = 1; c <= 4; c++) controller.setCellText(r, c, String(((r + 1) * c * 7) % 100));
      controller.setCellText(r, 5, `=SUM(B${r + 1}:E${r + 1})`);
    }
    controller.setColorScale(5, ['#fee2e2', '#fde68a', '#16a34a']);
  }, [controller]);
  const theme = buildTheme({ palette, density });
  return (
    <div style={{ border: `1px solid ${theme.headerGridLineColor}`, borderRadius: 6, width: 'fit-content' }}>
      <LatticaGrid controller={controller} columns={columns} theme={theme} width={620} height={300} />
      <LatticaStatusBar controller={controller} theme={theme} />
    </div>
  );
}

export default function ThemesPage(): React.ReactElement {
  const [palette, setPalette] = useState<PaletteName>('light');
  const [density, setDensity] = useState<Density>('comfortable');

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '5px 10px', border: '1px solid #cbd2d9', borderRadius: 6, cursor: 'pointer',
    background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#1f2933',
  });

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Themes &amp; Density</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Compose a theme with <code>buildTheme(&#123; palette, density &#125;)</code>. Pick a color
        palette (light/dark families) and a spacing density — the grid, status bar, and conditional
        formatting all retheme live.
      </p>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13, color: '#52606d' }}>Palette</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="palette-chips">
          {PALETTES.map((p) => (
            <button key={p} style={chip(p === palette)} onClick={() => setPalette(p)} data-testid={`palette-${p}`}>{p}</button>
          ))}
        </div>
      </div>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13, color: '#52606d' }}>Density</div>
        <div style={{ display: 'flex', gap: 6 }} data-testid="density-chips">
          {DENSITIES.map((d) => (
            <button key={d} style={chip(d === density)} onClick={() => setDensity(d)} data-testid={`density-${d}`}>{d}</button>
          ))}
        </div>
      </div>
      <ThemedGrid key={density} palette={palette} density={density} />
    </main>
  );
}
