/**
 * Pinned summary (footer) rows — declarative aggregation specs for the band
 * that renderers pin to the grid's bottom edge. A {@link SummaryRowSpec}
 * declares, per column, either a built-in aggregate name or a custom formatter
 * over the column's visible values. {@link computeSummaryCell} turns one cell
 * rule into display text, applying an optional Excel-style number format to
 * built-in aggregate results. Pure and value-typed; the controller supplies
 * the (filter-applied) visible values and column formats.
 */

import { aggregate } from './aggregate.js';
import { formatNumber } from './number-format.js';
import type { CellValue } from './types.js';

/** Built-in aggregate functions available to a summary-row cell. */
export type SummaryRowAggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';

/**
 * One summary cell: a built-in aggregate name, or a custom formatter that
 * receives the column's visible values and returns the display text.
 */
export type SummaryCellRule = SummaryRowAggregate | ((values: unknown[]) => string);

/**
 * Declarative spec for one pinned summary (footer) row. `cells` keys are
 * physical column indices (numbers or numeric strings) or leaf column `field`
 * names; the renderer resolves them. `label` renders in `labelCol` (same key
 * forms), defaulting to the first visible column, whenever that column has no
 * aggregation rule of its own.
 */
export interface SummaryRowSpec {
  /** Row caption, e.g. `合計`. Shown in the label column. */
  label?: string;
  /** Column that shows the label; defaults to the first visible column. */
  labelCol?: number | string;
  /** Aggregation rules keyed by column index or leaf `field` name. */
  cells: Record<string | number, SummaryCellRule>;
}

/**
 * Compute the display text of one summary cell. Custom functions receive a
 * copy of the values and their return value is used verbatim. Built-in
 * aggregates run through {@link aggregate}; a `null` result (no numeric
 * values) renders as an empty string, otherwise the optional Excel-style
 * `format` pattern is applied.
 */
export function computeSummaryCell(
  values: readonly CellValue[],
  rule: SummaryCellRule,
  format?: string,
): string {
  if (typeof rule === 'function') {
    return rule([...values]);
  }
  const result = aggregate(values, rule);
  if (result === null) {
    return '';
  }
  return format === undefined ? String(result) : formatNumber(result, format);
}
