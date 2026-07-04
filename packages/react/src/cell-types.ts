/**
 * Cell-type rendering registry. Each cell type maps a value to a canvas
 * drawing routine, letting the grid render rich cells (numbers, checkboxes,
 * etc.) instead of plain text. Renderers target the same minimal {@link Canvas2D}
 * interface as the painter, so they are unit-testable with a recording mock.
 *
 * Editors (the DOM side of a cell type) are handled separately by the React
 * component; this module is the framework-agnostic, canvas-side half.
 */

import type { Canvas2D } from './painter.js';
import type { GridTheme } from './theme.js';
import type { Rect } from './geometry.js';

export type CellAlign = 'left' | 'center' | 'right';

export interface CellRenderContext {
  ctx: Canvas2D;
  rect: Rect;
  value: unknown;
  /** Display text (already formatted by the controller). */
  text: string;
  theme: GridTheme;
  align: CellAlign;
  /** Optional text color override (e.g. from conditional formatting). */
  color?: string;
}

export type CellRenderer = (c: CellRenderContext) => void;

/** Draw clipped, horizontally-aligned text within the cell rect. */
export function drawCellText(c: CellRenderContext, explicitColor?: string): void {
  if (c.text === '') {
    return;
  }
  const { ctx, rect, theme } = c;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.fillStyle = explicitColor ?? c.color ?? theme.textColor;
  let x: number;
  if (c.align === 'right') {
    ctx.textAlign = 'right';
    x = rect.x + rect.width - theme.cellPaddingX;
  } else if (c.align === 'center') {
    ctx.textAlign = 'center';
    x = rect.x + rect.width / 2;
  } else {
    ctx.textAlign = 'left';
    x = rect.x + theme.cellPaddingX;
  }
  ctx.fillText(c.text, x, rect.y + rect.height / 2);
  ctx.restore();
}

/** Plain text, left-aligned by default. */
export const textRenderer: CellRenderer = (c) => {
  drawCellText(c);
};

/** Numbers, right-aligned by default. */
export const numberRenderer: CellRenderer = (c) => {
  drawCellText({ ...c, align: c.align === 'left' ? 'right' : c.align });
};

/** A checkbox box, checked when the value is truthy. */
export const booleanRenderer: CellRenderer = (c) => {
  const { ctx, rect, theme } = c;
  const size = Math.min(14, rect.height - 6);
  const x = rect.x + rect.width / 2 - size / 2;
  const y = rect.y + rect.height / 2 - size / 2;
  ctx.save();
  ctx.strokeStyle = theme.headerGridLineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, size, size);
  if (isTruthy(c.value)) {
    ctx.strokeStyle = theme.activeBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.2, y + size * 0.55);
    ctx.lineTo(x + size * 0.45, y + size * 0.8);
    ctx.lineTo(x + size * 0.82, y + size * 0.25);
    ctx.stroke();
  }
  ctx.restore();
};

function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    return value.toUpperCase() === 'TRUE';
  }
  return false;
}

// ── Bar cells (pseudo-Gantt) ────────────────────────────────────────────────

/**
 * Parsed shape of a `bar` cell value. Cells accept either a JSON object
 * (`{ color?, label?, ratio? }`), a JSON string of the same shape, or a plain
 * string (treated as the label of a full-width bar).
 */
export interface BarCellSpec {
  /** Bar fill color (any CSS color); the theme accent when omitted. */
  color?: string;
  /** Text drawn on the bar (ellipsized when it overflows). */
  label?: string;
  /** Bar width as a fraction of the cell width (clamped to 0..1); 1 when omitted. */
  ratio?: number;
}

/**
 * Parse a `bar` cell value into a {@link BarCellSpec}. Returns `null` for
 * malformed JSON or unexpected values, signalling the renderer to fall back to
 * plain text rendering.
 */
export function parseBarValue(value: unknown): BarCellSpec | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    if (!trimmed.startsWith('{')) {
      return { label: value };
    }
    try {
      return specFromRecord(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return specFromRecord(value as Record<string, unknown>);
  }
  return null;
}

/** Validate field types of a candidate bar object; `null` when malformed. */
function specFromRecord(record: Record<string, unknown>): BarCellSpec | null {
  const { color, label, ratio } = record;
  if (color !== undefined && typeof color !== 'string') {
    return null;
  }
  if (label !== undefined && typeof label !== 'string') {
    return null;
  }
  if (ratio !== undefined && (typeof ratio !== 'number' || !Number.isFinite(ratio))) {
    return null;
  }
  const spec: BarCellSpec = {};
  if (color !== undefined) {
    spec.color = color;
  }
  if (label !== undefined) {
    spec.label = label;
  }
  if (ratio !== undefined) {
    spec.ratio = Math.min(1, Math.max(0, ratio));
  }
  return spec;
}

/**
 * Shorten `text` with a trailing ellipsis so it measures within `maxWidth`.
 * Returns the text unchanged when it already fits, and an empty string when
 * not even a single character plus the ellipsis fits.
 */
export function truncateWithEllipsis(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
): string {
  if (measure(text) <= maxWidth) {
    return text;
  }
  let end = text.length;
  while (end > 0 && measure(`${text.slice(0, end)}…`) > maxWidth) {
    end--;
  }
  return end === 0 ? '' : `${text.slice(0, end)}…`;
}

/** Readable label color for a bar fill: dark text on light hex fills, else white. */
function barLabelColor(color: string): string {
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (hex === null) {
    return '#ffffff';
  }
  const n = parseInt(hex[1]!, 16);
  const luminance = 0.299 * ((n >> 16) & 0xff) + 0.587 * ((n >> 8) & 0xff) + 0.114 * (n & 0xff);
  return luminance > 160 ? '#1f2937' : '#ffffff';
}

/** Real contexts expose `measureText`; the minimal {@link Canvas2D} does not. */
type MeasuringCanvas = Canvas2D & { measureText?: (text: string) => { width: number } };

/**
 * A horizontal bar (pseudo-Gantt segment) filling `ratio` of the cell width,
 * with an optional label drawn on the bar. Combined with merged cells the bar
 * spans the whole merge area, which is the building block for cell-based
 * production-plan Gantt charts. Unexpected values render as plain text.
 */
export const barRenderer: CellRenderer = (c) => {
  const spec = parseBarValue(c.value);
  if (spec === null) {
    drawCellText(c);
    return;
  }
  const { ctx, rect, theme } = c;
  const inset = 2;
  const barWidth = Math.max(0, rect.width - inset * 2) * (spec.ratio ?? 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  const color = spec.color ?? theme.activeBorder;
  if (barWidth > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x + inset, rect.y + inset, barWidth, rect.height - inset * 2);
  }
  const label = spec.label ?? '';
  if (label !== '') {
    const measurable = ctx as MeasuringCanvas;
    const measure = (text: string): number =>
      measurable.measureText !== undefined
        ? measurable.measureText(text).width
        : text.length * theme.fontSize * 0.6;
    const shown = truncateWithEllipsis(label, Math.max(0, barWidth - theme.cellPaddingX * 2), measure);
    if (shown !== '') {
      ctx.fillStyle = barLabelColor(color);
      ctx.textAlign = 'left';
      ctx.fillText(shown, rect.x + inset + theme.cellPaddingX, rect.y + rect.height / 2);
    }
  }
  ctx.restore();
};

// ── Link cells (P0-2) ───────────────────────────────────────────────────────

/**
 * Link-styled text: the display text drawn in the theme accent color
 * (`activeBorder`) with an underline, signalling a clickable in-cell action.
 * Empty cells render exactly like plain text (nothing). This is only the
 * visual half — the view layer owns the interaction (pointer cursor on hover,
 * click / Enter firing `onCellAction`).
 */
export const linkRenderer: CellRenderer = (c) => {
  if (c.text === '') {
    drawCellText(c);
    return;
  }
  const { ctx, rect, theme } = c;
  const color = theme.activeBorder;
  drawCellText(c, color);
  // Underline matching the drawn text: measured width when the context can
  // measure, an approximation otherwise, clamped to the cell's padded width.
  const measurable = ctx as MeasuringCanvas;
  const measured =
    measurable.measureText !== undefined
      ? measurable.measureText(c.text).width
      : c.text.length * theme.fontSize * 0.6;
  const lineLength = Math.min(measured, Math.max(0, rect.width - theme.cellPaddingX * 2));
  if (lineLength <= 0) {
    return;
  }
  let x0: number;
  if (c.align === 'right') {
    x0 = rect.x + rect.width - theme.cellPaddingX - lineLength;
  } else if (c.align === 'center') {
    x0 = rect.x + rect.width / 2 - lineLength / 2;
  } else {
    x0 = rect.x + theme.cellPaddingX;
  }
  // Text is painted with a 'middle' baseline at the cell's vertical center, so
  // the underline sits half a font-size below it.
  const y = rect.y + rect.height / 2 + theme.fontSize / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + lineLength, y);
  ctx.stroke();
  ctx.restore();
};

/** Built-in renderers keyed by cell-type name. */
export const builtinRenderers: Readonly<Record<string, CellRenderer>> = {
  text: textRenderer,
  number: numberRenderer,
  numeric: numberRenderer,
  boolean: booleanRenderer,
  checkbox: booleanRenderer,
  bar: barRenderer,
  link: linkRenderer,
};

/** A registry resolving cell-type names to renderers, with a text default. */
export class CellTypeRegistry {
  private readonly renderers = new Map<string, CellRenderer>(Object.entries(builtinRenderers));

  register(name: string, renderer: CellRenderer): void {
    this.renderers.set(name, renderer);
  }

  has(name: string): boolean {
    return this.renderers.has(name);
  }

  /** Resolve a renderer by name; falls back to the text renderer. */
  resolve(name?: string): CellRenderer {
    if (name === undefined) {
      return textRenderer;
    }
    return this.renderers.get(name) ?? textRenderer;
  }
}

/** A shared default registry. */
export const defaultCellTypes = new CellTypeRegistry();
