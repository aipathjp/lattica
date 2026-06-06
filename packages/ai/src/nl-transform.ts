/**
 * Natural-language ⇄ grid operation (Part A / Phase A7).
 *
 * `nlToOperation` turns a free-form request into a *structured, validated*
 * {@link GridOperation} that the data layer can later execute — nothing is
 * executed here. The model output is funneled through {@link isValidOperation},
 * a strict structural guard, so a malformed or hallucinated response collapses
 * to a safe `{ op: 'none' }`. All model access goes through the injected
 * {@link AIClient}, making this fully testable with a mock provider.
 */

import type { AIClient } from './client.js';

/** A structured, executable-by-the-data-layer grid operation. */
export type GridOperation =
  | { op: 'sort'; col: number; direction: 'asc' | 'desc' }
  | { op: 'filter'; col: number; condition: string; value?: string }
  | { op: 'summarize'; col: number; fn: 'sum' | 'avg' | 'min' | 'max' | 'count' }
  | { op: 'none'; reason: string };

/** Allowed values for the `direction` field of a `sort` operation. */
const SORT_DIRECTIONS = ['asc', 'desc'] as const;
/** Allowed values for the `fn` field of a `summarize` operation. */
const SUMMARIZE_FNS = ['sum', 'avg', 'min', 'max', 'count'] as const;

/** True when `value` is a plain (non-null, non-array) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when `value` is a non-negative integer (a valid column index). */
function isColumnIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Structural type guard for {@link GridOperation}. Validates the discriminant,
 * every op-specific field and every enum, rejecting non-objects and any shape
 * that does not exactly match one of the four operation kinds.
 */
export function isValidOperation(value: unknown): value is GridOperation {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.op) {
    case 'sort':
      return (
        isColumnIndex(value.col) &&
        typeof value.direction === 'string' &&
        (SORT_DIRECTIONS as readonly string[]).includes(value.direction)
      );
    case 'filter':
      return (
        isColumnIndex(value.col) &&
        typeof value.condition === 'string' &&
        (value.value === undefined || typeof value.value === 'string')
      );
    case 'summarize':
      return (
        isColumnIndex(value.col) &&
        typeof value.fn === 'string' &&
        (SUMMARIZE_FNS as readonly string[]).includes(value.fn)
      );
    case 'none':
      return typeof value.reason === 'string';
    default:
      return false;
  }
}

/** JSON schema handed to the model describing the four operation shapes. */
const OPERATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['op'],
  properties: {
    op: { type: 'string', enum: ['sort', 'filter', 'summarize', 'none'] },
    col: { type: 'integer', minimum: 0 },
    direction: { type: 'string', enum: [...SORT_DIRECTIONS] },
    condition: { type: 'string' },
    value: { type: 'string' },
    fn: { type: 'string', enum: [...SUMMARIZE_FNS] },
    reason: { type: 'string' },
  },
} as const;

/**
 * Translate a natural-language `request` into a validated {@link GridOperation}.
 *
 * `columns` (header labels, in order) is supplied to the model so it can map a
 * named column to its zero-based index. The model's structured output is
 * validated with {@link isValidOperation}; anything that fails collapses to a
 * safe `{ op: 'none', reason: ... }`.
 */
export async function nlToOperation(
  client: AIClient,
  request: string,
  columns: readonly string[],
): Promise<GridOperation> {
  const columnList = columns.map((name, i) => `${i}: ${name}`).join('\n');
  const { object } = await client.generateObject<unknown>({
    system:
      'You translate a natural-language request into a single structured grid operation ' +
      '(sort, filter, summarize, or none). Columns are referenced by their zero-based index. ' +
      'If the request cannot be expressed as one of these operations, return op "none" with a reason.',
    prompt: `Columns:\n${columnList}\n\nRequest: ${request}`,
    schema: OPERATION_SCHEMA,
  });
  if (isValidOperation(object)) {
    return object;
  }
  return { op: 'none', reason: 'Model returned an invalid operation.' };
}
