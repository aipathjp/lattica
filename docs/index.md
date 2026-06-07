---
layout: home

hero:
  name: Lattica
  text: Data grid & spreadsheet engine
  tagline: High-performance, framework-agnostic, clean-room. Zero copyleft, MIT licensed, fully owned IP.
  actions:
    - theme: brand
      text: Get started
      link: /USAGE
    - theme: alt
      text: Architecture
      link: /ARCHITECTURE
    - theme: alt
      text: View on GitHub
      link: https://github.com/aipathjp/lattica

features:
  - title: Canvas-rendered body
    details: The cell body paints on a single <canvas>, bypassing React reconciliation so hundreds of thousands of cells scroll smoothly.
  - title: Excel-compatible formula engine
    details: Clean-room lexer → Pratt parser → evaluator with an incremental dependency graph, topological recalculation, and #CYCLE! detection.
  - title: Realtime collaboration
    details: A tombstone-free LWW table CRDT converges deterministically; fractional indexing keeps row/column order stable across concurrent inserts.
  - title: XLSX / CSV interop
    details: RFC 4180 CSV/TSV, TSV + HTML clipboard, and a dependency-free XLSX export (stored-ZIP + CRC-32).
  - title: Multi-level grouping headers
    details: Flatten arbitrary header trees into renderable spans, with sort, filter, merge, search and conditional formatting in the headless controller.
  - title: AI & MCP ready
    details: Provider-agnostic NL→formula helpers and an MCP surface so agents can drive the grid programmatically.
  - title: No license traps
    details: Independent of any GPL/commercial grid or formula library — Lattica is self-contained and MIT.
  - title: Strict, tested core
    details: TypeScript strict ESM monorepo with a 100% coverage gate on the published engine packages.
---

## Packages

Lattica is a pnpm monorepo of focused, framework-agnostic packages:

- [`@lattica/core`](/packages/core) — engine: A1 coords, virtualization math, sparse data store, selection, command/undo, header flattening.
- [`@lattica/formula`](/packages/formula) — clean-room Excel-compatible formula engine (~55 functions).
- [`@lattica/react`](/packages/react) — React bindings: canvas grid, DOM editing overlay, grouping headers, `GridController`.
- [`@lattica/io`](/packages/io) — CSV/TSV, clipboard, dependency-free XLSX export.
- [`@lattica/data`](/packages/data) — data layer utilities.
- [`@lattica/collab`](/packages/collab) — realtime LWW CRDT, fractional indexing, presence, transport abstraction.
- [`@lattica/ai`](/packages/ai) — provider-agnostic AI helpers (NL→formula).
- [`@lattica/mcp`](/packages/mcp) — Model Context Protocol surface for agent-driven grids.
