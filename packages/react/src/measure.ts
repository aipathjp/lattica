/**
 * Pure text measurement & autosize helpers. The actual width computation is
 * abstracted behind a {@link MeasureText} function so these helpers can be unit
 * tested without a real `<canvas>` / `CanvasRenderingContext2D`. In the React
 * component a canvas-backed measurer is injected; tests pass a deterministic
 * mock (e.g. `(t) => t.length * 7`).
 */

import type { Canvas2D } from './painter.js';

/** Measures the rendered pixel width of `text` in the given CSS `font`. */
export type MeasureText = (text: string, font: string) => number;

/**
 * The line height (px) used when painting wrapped cell text at `fontSize`.
 * Shared by the painter and row auto-sizing so a row sized with
 * {@link autoRowHeight} exactly fits its wrapped lines.
 */
export function wrapLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.4);
}

/**
 * A {@link MeasureText} backed by a real canvas context, or `undefined` when
 * the context has no `measureText` (e.g. a minimal recording mock). The
 * context's font is synced lazily — repeated calls with the same font are
 * a single `measureText` each.
 */
export function canvasMeasurer(ctx: Canvas2D): MeasureText | undefined {
  const c = ctx as Canvas2D & { measureText?: (text: string) => { width: number } };
  const fn = c.measureText;
  if (typeof fn !== 'function') {
    return undefined;
  }
  return (text, font) => {
    if (c.font !== font) {
      c.font = font;
    }
    return fn.call(c, text).width;
  };
}

/**
 * Greedy word wrap to fit within `maxWidth`.
 *
 * - Explicit `\n` newlines are always preserved as hard breaks.
 * - Words are packed greedily; a word that, joined to the current line, would
 *   exceed `maxWidth` starts a new line.
 * - A single word wider than `maxWidth` is kept on its own line (never split).
 * - An empty string yields a single empty line.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  font: string,
  measure: MeasureText,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current === '' ? word : `${current} ${word}`;
      if (current !== '' && measure(candidate, font) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Width for a column sized to its widest entry: the maximum measured width over
 * `texts` plus `padding`, clamped to `[min, max]`. An empty list measures as 0.
 */
export function autoColumnWidth(
  texts: readonly string[],
  font: string,
  measure: MeasureText,
  opts?: { padding?: number; min?: number; max?: number },
): number {
  const padding = opts?.padding ?? 0;
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.POSITIVE_INFINITY;
  let widest = 0;
  for (const text of texts) {
    const width = measure(text, font);
    if (width > widest) {
      widest = width;
    }
  }
  return Math.min(max, Math.max(min, widest + padding));
}

/**
 * Height for a row whose cell wraps `text` to `colWidth`: the wrapped line count
 * times `lineHeight`, plus `padding`.
 */
export function autoRowHeight(
  text: string,
  colWidth: number,
  font: string,
  lineHeight: number,
  measure: MeasureText,
  opts?: { padding?: number },
): number {
  const padding = opts?.padding ?? 0;
  const lines = wrapText(text, colWidth, font, measure);
  return lines.length * lineHeight + padding;
}
