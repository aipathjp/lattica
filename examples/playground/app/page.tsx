import type { ReactElement } from 'react';

const FEATURES: { href: string; title: string; desc: string }[] = [
  { href: '/kitchen-sink', title: 'Kitchen Sink', desc: 'Formulas, checkbox/right-align, conditional format, sort, filter, merge, search, export, AI.' },
  { href: '/editors', title: 'Editors & Validation', desc: 'Dropdown / date / autocomplete editors and data validation (invalid cells turn red).' },
  { href: '/formatting', title: 'Formatting & Status Bar', desc: 'Number formats, color scales, data bars, icon sets, and a live selection status bar.' },
  { href: '/data-ops', title: 'Sort / Filter / Find', desc: 'Multi-sort, faceted filter dropdown, column hide/move, find & replace, column aggregates.' },
  { href: '/formulas', title: 'Formulas & Spill', desc: 'Dynamic arrays, XLOOKUP, LET, LAMBDA/MAP, SORTBY, structured references (150 functions).' },
  { href: '/pivot', title: 'Pivot Table', desc: 'Cross-tabulate records by row/column fields with aggregates and totals.' },
  { href: '/charts', title: 'Charts & Sparklines', desc: 'Line / bar / pie charts and in-cell sparklines.' },
  { href: '/master-detail', title: 'Master / Detail', desc: 'Expandable detail panels under master rows.' },
  { href: '/freeze', title: 'Freeze & Resize', desc: 'Freeze the title row & column while data scrolls; drag header borders to resize columns/rows.' },
  { href: '/fullscreen', title: 'Full-size Grid', desc: 'Fill the container with <LatticaGrid fill/> — fit width, full screen, or a drag-resizable box.' },
  { href: '/themes', title: 'Themes & Density', desc: '7 palettes × 3 densities composed with buildTheme; live light/dark switcher.' },
  { href: '/export', title: 'Export', desc: 'CSV, plain & styled XLSX, and dependency-free PDF — all client-side.' },
  { href: '/async', title: 'Async Rows', desc: 'Server-side / lazy block-loaded row model with a mock fetcher.' },
  { href: '/data', title: 'Live Neon Data', desc: 'Real Postgres (Neon) data loaded over an API route into the grid.' },
];

export default function Home(): ReactElement {
  return (
    <main style={{ padding: 24, maxWidth: 1000 }}>
      <h1 style={{ marginTop: 0 }}>Lattica — Feature Showcase</h1>
      <p style={{ color: '#52606d' }}>
        A clean-room, MIT-licensed data grid &amp; spreadsheet engine for React. Every page below
        demonstrates a feature you can interact with. Source: <code>examples/playground</code>.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 12,
          marginTop: 16,
        }}
      >
        {FEATURES.map((f) => (
          <a
            key={f.href}
            href={f.href}
            data-testid={`card-${f.href.slice(1)}`}
            style={{
              display: 'block',
              padding: 14,
              border: '1px solid #cbd2d9',
              borderRadius: 10,
              textDecoration: 'none',
              color: '#1f2933',
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 600, color: '#2563eb' }}>{f.title}</div>
            <div style={{ fontSize: 13, color: '#52606d', marginTop: 4 }}>{f.desc}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
