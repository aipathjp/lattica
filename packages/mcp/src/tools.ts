/**
 * Grid tool registry — a transport-agnostic catalogue of AI-callable operations
 * over a {@link SheetEngine}.
 *
 * Each {@link GridTool} bundles a stable name, a human-readable description, a
 * JSON-schema description of its input, and a synchronous handler. The handlers
 * here deliberately know nothing about MCP wire framing, transports, or
 * networking: they are plain functions that validate their own input and either
 * return a JSON-serialisable result or throw an `Error`. A transport layer (or
 * the {@link ToolDispatcher}) is responsible for marshalling.
 */

import {
  FormulaError,
  scalarize,
  type CellContent,
  type CellScalar,
  type FormulaValue,
  type SheetEngine,
} from '@lattica/formula';

/** Upper bound on cells a single `get_range` call may materialize. */
export const MAX_RANGE_CELLS = 100_000;

/** A single AI-callable grid operation. */
export interface GridTool {
  /** Stable, unique identifier (e.g. `get_cell`). */
  name: string;
  /** One-line human-readable summary. */
  description: string;
  /** JSON-schema object describing the accepted input shape. */
  inputSchema: object;
  /** Execute the tool; throws `Error` on invalid input. */
  handler(input: unknown): unknown;
}

/** Narrow an unknown input to a plain record, throwing on anything else. */
function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('input must be an object');
  }
  return input as Record<string, unknown>;
}

/** Read a required non-negative integer field from a record. */
function intField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`"${key}" must be a non-negative integer`);
  }
  return value;
}

/** Read a required non-empty string field from a record. */
function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`"${key}" must be a non-empty string`);
  }
  return value;
}

/**
 * Format any cell value to its display string. Numbers, booleans and `null`
 * become text; an empty cell renders as `''`; a {@link FormulaError} renders as
 * its error token (e.g. `#DIV/0!`).
 */
export function formatValue(value: CellScalar | FormulaError): string {
  if (FormulaError.is(value)) {
    return value.type;
  }
  if (value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  return String(value);
}

/** Reduce a {@link FormulaValue} (possibly a matrix) to a display string. */
function formatFormulaValue(value: FormulaValue): string {
  return formatValue(scalarize(value));
}

/**
 * Validate that `content` is an acceptable literal/formula payload for
 * {@link SheetEngine.setContent}: a string, number, boolean, or null.
 */
function asContent(value: unknown): CellContent {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new Error('"content" must be a string, number, boolean, or null');
}

/**
 * Build the standard set of grid tools bound to a particular engine instance.
 */
export function createGridTools(engine: SheetEngine): GridTool[] {
  return [
    {
      name: 'get_cell',
      description: 'Read the formatted display value of a single cell.',
      inputSchema: {
        type: 'object',
        properties: {
          row: { type: 'integer', minimum: 0 },
          col: { type: 'integer', minimum: 0 },
        },
        required: ['row', 'col'],
        additionalProperties: false,
      },
      handler(input: unknown): { value: string } {
        const record = asRecord(input);
        const row = intField(record, 'row');
        const col = intField(record, 'col');
        return { value: formatValue(engine.getValue({ row, col })) };
      },
    },
    {
      name: 'set_cell',
      description: 'Write a literal value or "=formula" into a cell.',
      inputSchema: {
        type: 'object',
        properties: {
          row: { type: 'integer', minimum: 0 },
          col: { type: 'integer', minimum: 0 },
          content: { type: ['string', 'number', 'boolean', 'null'] },
        },
        required: ['row', 'col', 'content'],
        additionalProperties: false,
      },
      handler(input: unknown): { ok: true } {
        const record = asRecord(input);
        const row = intField(record, 'row');
        const col = intField(record, 'col');
        const content = asContent(record['content']);
        engine.setContent({ row, col }, content);
        return { ok: true };
      },
    },
    {
      name: 'get_range',
      description: 'Read a rectangular block of cells as a matrix of display strings.',
      inputSchema: {
        type: 'object',
        properties: {
          startRow: { type: 'integer', minimum: 0 },
          startCol: { type: 'integer', minimum: 0 },
          endRow: { type: 'integer', minimum: 0 },
          endCol: { type: 'integer', minimum: 0 },
        },
        required: ['startRow', 'startCol', 'endRow', 'endCol'],
        additionalProperties: false,
      },
      handler(input: unknown): { rows: string[][] } {
        const record = asRecord(input);
        const startRow = intField(record, 'startRow');
        const startCol = intField(record, 'startCol');
        const endRow = intField(record, 'endRow');
        const endCol = intField(record, 'endCol');
        if (endRow < startRow || endCol < startCol) {
          throw new Error('range end must be >= range start');
        }
        // Bound the materialized area so an agent-supplied range cannot trigger
        // an unbounded allocation.
        const area = (endRow - startRow + 1) * (endCol - startCol + 1);
        if (area > MAX_RANGE_CELLS) {
          throw new Error(`range too large: ${area} cells (max ${MAX_RANGE_CELLS})`);
        }
        const rows: string[][] = [];
        for (let row = startRow; row <= endRow; row++) {
          const line: string[] = [];
          for (let col = startCol; col <= endCol; col++) {
            line.push(formatValue(engine.getValue({ row, col })));
          }
          rows.push(line);
        }
        return { rows };
      },
    },
    {
      name: 'evaluate',
      description: 'Evaluate a one-off formula without storing it, returning the formatted result.',
      inputSchema: {
        type: 'object',
        properties: {
          formula: { type: 'string' },
        },
        required: ['formula'],
        additionalProperties: false,
      },
      handler(input: unknown): { result: string } {
        const record = asRecord(input);
        const formula = stringField(record, 'formula');
        return { result: formatFormulaValue(engine.evaluateFormula(formula)) };
      },
    },
    {
      name: 'define_name',
      description: 'Define (or redefine) a named range / named value.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          formula: { type: 'string' },
        },
        required: ['name', 'formula'],
        additionalProperties: false,
      },
      handler(input: unknown): { ok: true } {
        const record = asRecord(input);
        const name = stringField(record, 'name');
        const formula = stringField(record, 'formula');
        engine.defineName(name, formula);
        return { ok: true };
      },
    },
  ];
}
