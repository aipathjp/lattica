'use client';

/**
 * Kitchen-sink demo — a single App Router page that exercises a broad slice of
 * the Lattica public API so reviewers can see the headless {@link GridController}
 * features (formulas, column types/alignment, conditional formatting, sort,
 * filter, merge, search), the canvas {@link LatticaGrid} view, the
 * {@link serializeDelimited}/{@link matrixToXlsx} export paths from `@lattica/io`,
 * and the provider-agnostic NL→formula helper from `@lattica/ai` driven by a
 * deterministic {@link MockProvider}. It is consumer code only — it imports the
 * published `@lattica/*` packages and never reaches into their internals.
 */

import { useEffect, useState } from 'react';
import { LatticaGrid, LatticaFormulaBar, useGridController } from '@lattica/react';
import type { ColumnNode } from '@lattica/core';
import { serializeDelimited, matrixToXlsx } from '@lattica/io';
import { AIClient, MockProvider, nlToFormula } from '@lattica/ai';

const columns: readonly ColumnNode[] = [
  { headerName: 'Score', field: 'score' },
  { headerName: 'Price', field: 'price' },
  { headerName: 'Active', field: 'active' },
  { headerName: 'Total', field: 'total' },
];

/** Rows of seed data: [score, price, active]. */
const seed: ReadonlyArray<readonly [string, string, string]> = [
  ['90', '120', 'TRUE'],
  ['55', '80', 'FALSE'],
  ['72', '200', 'TRUE'],
  ['40', '60', 'FALSE'],
];

/** Trigger a browser download for a generated blob. */
function download(bytes: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function KitchenSinkPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 200, colCount: 4 });
  const [aiResult, setAiResult] = useState<string>('(not run yet)');

  useEffect(() => {
    // Seed two data columns plus a checkbox column, and a SUM formula column.
    seed.forEach(([score, price, active], r) => {
      controller.setCellText(r, 0, score);
      controller.setCellText(r, 1, price);
      controller.setCellText(r, 2, active);
      controller.setCellText(r, 3, `=SUM(A${r + 1}:B${r + 1})`);
    });

    // Column 2 renders as checkboxes; column 1 (Price) is right-aligned.
    controller.setColumnType(2, 'checkbox');
    controller.setColumnAlign(1, 'right');

    // Highlight high scores (> 70) with a green background.
    controller.conditionalFormat.addRule({
      kind: 'gt',
      value: 70,
      style: { background: '#d8f5d0', bold: true },
    });
  }, [controller]);

  /** Build the current grid as a string matrix for export. */
  const snapshot = (): string[][] => {
    const rows = controller.getRowCount();
    const cols = controller.getColCount();
    const out: string[][] = [['Score', 'Price', 'Active', 'Total']];
    for (let r = 0; r < Math.min(rows, seed.length); r++) {
      const line: string[] = [];
      for (let c = 0; c < cols; c++) {
        line.push(controller.getDisplay(r, c));
      }
      out.push(line);
    }
    return out;
  };

  const exportCsv = (): void => {
    const csv = serializeDelimited(snapshot());
    download(csv, 'kitchen-sink.csv', 'text/csv');
  };

  const exportXlsx = (): void => {
    const bytes = matrixToXlsx(snapshot(), 'KitchenSink');
    download(
      bytes as unknown as BlobPart,
      'kitchen-sink.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  const runAi = async (): Promise<void> => {
    // Provider-agnostic: a deterministic MockProvider stands in for a real LLM.
    // nlToFormula() calls generateObject(), so we queue an object result.
    const provider = new MockProvider({
      objects: [{ formula: '=SUM(A1:B1)' }],
    });
    const client = new AIClient(provider, { maxCalls: 4, maxOutputTokens: 256 });
    const result = await nlToFormula(client, 'sum the score and price in row 1');
    setAiResult(
      result.valid
        ? `${result.formula}  (valid)`
        : `${result.formula}  (invalid: ${result.error ?? 'unknown'})`,
    );
  };

  const btn: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #cbd2d9',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Lattica Kitchen Sink</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        Seeded grid with a <code>=SUM(...)</code> column, a checkbox column, a
        right-aligned column, and a conditional-format rule (score &gt; 70). Use
        the buttons to drive the headless controller and the export/AI helpers.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button style={btn} onClick={() => controller.toggleSort(0)}>
          Sort col 0
        </button>
        <button
          style={btn}
          onClick={() => controller.setColumnFilter(0, [{ kind: 'gt', value: 50 }])}
        >
          Filter col 0 &gt; 50
        </button>
        <button style={btn} onClick={() => controller.clearView()}>
          Clear view
        </button>
        <button style={btn} onClick={() => controller.mergeSelection()}>
          Merge selection
        </button>
        <button style={btn} onClick={() => controller.runSearch('TRUE')}>
          Search &quot;TRUE&quot;
        </button>
        <button style={btn} onClick={exportCsv}>
          Export CSV
        </button>
        <button style={btn} onClick={exportXlsx}>
          Export XLSX
        </button>
      </div>

      <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content', overflow: 'hidden' }}>
        <LatticaFormulaBar controller={controller} />
        <LatticaGrid controller={controller} columns={columns} width={448} height={360} />
      </div>

      <section
        style={{
          border: '1px solid #cbd2d9',
          borderRadius: 6,
          padding: 12,
          maxWidth: 640,
        }}
      >
        <h2 style={{ margin: '0 0 8px' }}>AI panel</h2>
        <button
          style={btn}
          onClick={() => {
            void runAi();
          }}
        >
          NL → formula (MockProvider)
        </button>
        <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{aiResult}</pre>
      </section>
    </main>
  );
}
