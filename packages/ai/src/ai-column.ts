/**
 * AI columns — run a per-row prompt over a dataset to synthesize a new column.
 *
 * Each output cell pairs the model's generated `value` with the
 * {@link Provenance} of the call that produced it, so an AI-derived column is
 * fully auditable back to its prompt and token usage. The prompt for every row
 * is built by {@link renderTemplate}, which fills `{0}`, `{1}`, … (column
 * index) and `{name}` (header) placeholders from that row's cells.
 *
 * The module is provider-agnostic: it speaks only to {@link AIClient}, so tests
 * drive it with a deterministic `MockProvider` and never touch a network.
 */

import type { AIClient } from './client.js';
import type { Provenance } from './provenance.js';

/** One synthesized cell: the generated value plus its audit trail. */
export interface AiColumnCell {
  value: string;
  provenance: Provenance;
}

/** Options for {@link generateColumn}. */
export interface AiColumnOptions {
  /**
   * Per-row prompt template. Placeholders `{0}`, `{1}`, … resolve to cells by
   * column index; `{name}` resolves by header name (when `headers` is given).
   */
  template: string;
  /** Reserved for future batched execution; rows are processed in order. */
  concurrency?: number;
}

/** Matches a single `{token}` placeholder; the token is captured. */
const PLACEHOLDER_RE = /\{([^{}]*)\}/g;

/**
 * Fill `{0}`, `{1}`, … and `{name}` placeholders in `template` from `row`.
 *
 * An all-digit token is treated as a column index into `row`; any other token
 * is matched against `headers` (when supplied) to find a column index. A
 * placeholder that resolves to no cell — out-of-range index, unknown name, or
 * a missing/undefined cell — is replaced with the empty string.
 */
export function renderTemplate(
  template: string,
  row: readonly string[],
  headers?: readonly string[],
): string {
  return template.replace(PLACEHOLDER_RE, (_match, token: string) => {
    let index: number | undefined;
    if (token.length > 0 && /^\d+$/.test(token)) {
      index = Number(token);
    } else if (headers !== undefined) {
      const found = headers.indexOf(token);
      index = found === -1 ? undefined : found;
    }
    if (index === undefined) {
      return '';
    }
    return row[index] ?? '';
  });
}

/**
 * Generate a new column by running `options.template` against each row.
 *
 * For every row the rendered prompt is sent through `client.generateText`; the
 * result's text becomes the cell value and its usage is recorded in the cell's
 * {@link Provenance} (with a fixed `model: 'ai'` label — the concrete provider
 * model id is the provider's concern). An empty `rows` input yields `[]`.
 */
export async function generateColumn(
  client: AIClient,
  rows: readonly (readonly string[])[],
  options: AiColumnOptions,
  headers?: readonly string[],
): Promise<AiColumnCell[]> {
  const cells: AiColumnCell[] = [];
  for (const row of rows) {
    const prompt = renderTemplate(options.template, row, headers);
    const result = await client.generateText({ prompt });
    cells.push({
      value: result.text,
      provenance: { model: 'ai', prompt, usage: result.usage },
    });
  }
  return cells;
}
