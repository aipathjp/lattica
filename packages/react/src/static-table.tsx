import { type ReactElement } from 'react';
import { columnIndexToLabel, computeHeaderLayout, type ColumnNode } from '@ai-path/tb-core';
import type { GridController } from './controller.js';
import type { CellAlign } from './cell-types.js';

export interface StaticTableOptions {
  includeHeaders?: boolean;
  includeRowNumbers?: boolean;
  maxRows?: number;
  className?: string;
  caption?: string;
}

interface StaticHeaderCell {
  id: string;
  label: string;
  rowSpan: number;
  colSpan: number;
  visualCol: number;
}

const DEFAULT_CLASS_NAME = 'lattica-static-table';

function positiveRowLimit(maxRows: number | undefined, rowCount: number): number {
  if (maxRows === undefined) {
    return rowCount;
  }
  if (!Number.isFinite(maxRows)) {
    return rowCount;
  }
  return Math.max(0, Math.min(rowCount, Math.floor(maxRows)));
}

function alignStyle(align: CellAlign | undefined): { textAlign?: CellAlign } | undefined {
  return align === undefined ? undefined : { textAlign: align };
}

function visibleLeafCount(controller: GridController, startLeaf: number, endLeaf: number): number {
  let count = 0;
  for (let leaf = startLeaf; leaf < endLeaf; leaf++) {
    if (controller.view.cols.getVisualIndex(leaf) >= 0) {
      count++;
    }
  }
  return count;
}

function firstVisibleLeaf(controller: GridController, startLeaf: number, endLeaf: number): number {
  let first = Number.POSITIVE_INFINITY;
  for (let leaf = startLeaf; leaf < endLeaf; leaf++) {
    const visual = controller.view.cols.getVisualIndex(leaf);
    if (visual >= 0 && visual < first) {
      first = visual;
    }
  }
  return first;
}

function groupedHeaders(controller: GridController, columns: readonly ColumnNode[]): StaticHeaderCell[][] {
  const layout = computeHeaderLayout(columns);
  return layout.rows.map((row) =>
    row
      .map((cell) => {
        const colSpan = visibleLeafCount(controller, cell.startLeaf, cell.endLeaf);
        if (colSpan === 0) {
          return null;
        }
        return {
          id: cell.id,
          label: cell.label,
          rowSpan: cell.rowSpan,
          colSpan,
          visualCol: firstVisibleLeaf(controller, cell.startLeaf, cell.endLeaf),
        };
      })
      .filter((cell): cell is StaticHeaderCell => cell !== null)
      .sort((a, b) => a.visualCol - b.visualCol),
  );
}

function fallbackHeaders(controller: GridController): StaticHeaderCell[][] {
  return [
    Array.from({ length: controller.getColCount() }, (_, visualCol) => ({
      id: `c${visualCol}`,
      label: columnIndexToLabel(visualCol),
      rowSpan: 1,
      colSpan: 1,
      visualCol,
    })),
  ];
}

function headerRows(controller: GridController, columns: readonly ColumnNode[] | undefined): StaticHeaderCell[][] {
  if (columns === undefined) {
    return fallbackHeaders(controller);
  }
  const rows = groupedHeaders(controller, columns).filter((row) => row.length > 0);
  return rows.length === 0 ? fallbackHeaders(controller) : rows;
}

export const staticTablePrintCss = `
.lattica-static-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font: 12px/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #111827;
  background: #ffffff;
}
.lattica-static-table caption {
  caption-side: top;
  text-align: left;
  font-weight: 600;
  margin-bottom: 8px;
}
.lattica-static-table th,
.lattica-static-table td {
  border: 1px solid #cbd5e1;
  padding: 4px 6px;
  vertical-align: top;
  overflow-wrap: anywhere;
}
.lattica-static-table th {
  background: #f8fafc;
  font-weight: 600;
}
.lattica-static-table tr {
  break-inside: avoid;
}
@media print {
  .lattica-static-table {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  .lattica-static-table thead {
    display: table-header-group;
  }
  .lattica-static-table tfoot {
    display: table-footer-group;
  }
  .lattica-static-table tr,
  .lattica-static-table th,
  .lattica-static-table td {
    break-inside: avoid;
    page-break-inside: avoid;
  }
}
`.trim();

export function renderStaticTable(
  controller: GridController,
  columns?: readonly ColumnNode[],
  options: StaticTableOptions = {},
): ReactElement {
  const {
    includeHeaders = true,
    includeRowNumbers = false,
    className = DEFAULT_CLASS_NAME,
    caption,
  } = options;
  const rowCount = controller.getRowCount();
  const colCount = controller.getColCount();
  const renderedRows = positiveRowLimit(options.maxRows, rowCount);
  const remainingRows = rowCount - renderedRows;
  const headers = includeHeaders ? headerRows(controller, columns) : [];
  const footerColSpan = colCount + (includeRowNumbers ? 1 : 0);

  return (
    <table data-testid="lattica-static-table" className={className}>
      {caption !== undefined && <caption>{caption}</caption>}
      <colgroup>
        {includeRowNumbers && <col key="row-numbers" style={{ width: controller.rowHeaderWidth }} />}
        {Array.from({ length: colCount }, (_, col) => (
          <col key={col} style={{ width: controller.getColumnWidth(col) }} />
        ))}
      </colgroup>
      {includeHeaders && (
        <thead>
          {headers.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {includeRowNumbers && rowIndex === 0 && <th scope="col" rowSpan={headers.length}>#</th>}
              {row.map((cell) => (
                <th key={cell.id} scope="col" colSpan={cell.colSpan} rowSpan={cell.rowSpan}>
                  {cell.label}
                </th>
              ))}
            </tr>
          ))}
        </thead>
      )}
      <tbody>
        {Array.from({ length: renderedRows }, (_, row) => (
          <tr key={row}>
            {includeRowNumbers && <th scope="row">{row + 1}</th>}
            {Array.from({ length: colCount }, (_, col) => (
              <td key={col} style={alignStyle(controller.getColumnAlign(col))}>
                {controller.getDisplay(row, col)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {remainingRows > 0 && (
        <tfoot>
          <tr>
            <td colSpan={footerColSpan}>{`+${remainingRows} more rows`}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
