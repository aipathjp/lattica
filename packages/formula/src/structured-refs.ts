/**
 * Structured (table) references — `Table[Column]` syntax. Rather than extend the
 * lexer/parser/evaluator, structured references are *expanded to ordinary A1
 * ranges before parsing*: `Sales[Amount]` becomes e.g. `C2:C100`. This keeps the
 * grammar untouched and means dependency tracking, recalculation, and every
 * existing function work for free on the resulting range.
 *
 * Supported forms (the inner specifier, after the table name):
 *   `[Amount]`, `[[Amount]]`, `[@Amount]`, `[@[Amount]]`
 * Special items (`[#Headers]`, `[#All]`, …) and unknown tables/columns expand to
 * `#REF!` so the formula surfaces a reference error rather than failing to parse.
 */

/** Resolve a table/column to an A1 range string, or null when unknown. */
export type TableRangeResolver = (table: string, column: string) => string | null;

// Table name, then a bracketed specifier that may contain one nested `[...]`.
const STRUCTURED_REF = /([A-Za-z_][\w.]*)\[((?:\[[^\]]*\]|[^\]])*)\]/g;

/** Normalize the inner specifier of a structured reference to a column name. */
function columnName(inner: string): string | null {
  let col = inner.trim();
  if (col.startsWith('@')) {
    col = col.slice(1).trim();
  }
  if (col.startsWith('[') && col.endsWith(']')) {
    col = col.slice(1, -1).trim();
  }
  if (col === '' || col.startsWith('#')) {
    return null;
  }
  return col;
}

/**
 * Replace every `Table[Column]` occurrence in `formula` with the A1 range from
 * `resolve`. Unknown references and special items become `#REF!`.
 */
export function expandStructuredRefs(formula: string, resolve: TableRangeResolver): string {
  return formula.replace(STRUCTURED_REF, (_match, table: string, inner: string) => {
    const col = columnName(inner);
    if (col === null) {
      return '#REF!';
    }
    return resolve(table, col) ?? '#REF!';
  });
}
