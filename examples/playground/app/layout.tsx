import type { ReactNode } from 'react';

export const metadata = {
  title: 'Lattica Playground',
  description: 'Interactive showcase of every Lattica feature.',
};

const NAV: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/kitchen-sink', label: 'Kitchen Sink' },
  { href: '/editors', label: 'Editors & Validation' },
  { href: '/formatting', label: 'Formatting & Status Bar' },
  { href: '/data-ops', label: 'Sort / Filter / Find' },
  { href: '/formulas', label: 'Formulas & Spill' },
  { href: '/pivot', label: 'Pivot Table' },
  { href: '/charts', label: 'Charts & Sparklines' },
  { href: '/master-detail', label: 'Master / Detail' },
  { href: '/themes', label: 'Themes & Density' },
  { href: '/export', label: 'Export (CSV/XLSX/PDF)' },
  { href: '/async', label: 'Async Rows' },
  { href: '/data', label: 'Live Neon Data' },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#1f2933' }}>
        <nav
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '8px 12px',
            borderBottom: '1px solid #cbd2d9',
            background: '#f5f7fa',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <strong style={{ marginRight: 12 }}>Lattica</strong>
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              data-testid={`nav-${n.href === '/' ? 'home' : n.href.slice(1)}`}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                textDecoration: 'none',
                color: '#2563eb',
                fontSize: 13,
              }}
            >
              {n.label}
            </a>
          ))}
        </nav>
        {children}
      </body>
    </html>
  );
}
