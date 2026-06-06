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

/** Built-in renderers keyed by cell-type name. */
export const builtinRenderers: Readonly<Record<string, CellRenderer>> = {
  text: textRenderer,
  number: numberRenderer,
  numeric: numberRenderer,
  boolean: booleanRenderer,
  checkbox: booleanRenderer,
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
