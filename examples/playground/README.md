# Lattica Playground (Next.js App Router)

A minimal Next.js App Router page that consumes the published Lattica packages:
a virtualized 1000-row grid with multi-level grouping headers, live formulas
(`=B1+C1`, `=AVERAGE(...)`), and one-click XLSX export.

```tsx
'use client';
import { LatticaGrid, useGridController } from '@lattica/react';
```

The example is type-checked against the built package type declarations
(`pnpm --filter @lattica/example-playground typecheck`), proving the public API
is consumable from a real Next.js project. Drop these files into any Next.js 15/16
App Router app (add `next`, `react`, `react-dom`) and run `next dev`.
