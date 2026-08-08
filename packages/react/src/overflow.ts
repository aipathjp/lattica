/**
 * Truncation ("does the painted text actually fit?") detection.
 *
 * Canvas cell text is **hard-clipped** to the cell rectangle — unlike a DOM
 * table there is no `text-overflow: ellipsis` and no `scrollWidth` to compare
 * against, so an over-long value is cut with no visual cue. These pure helpers
 * reproduce the painter's own layout arithmetic (same font string, same
 * `cellPaddingX`, same {@link wrapText} call the scene builder uses) to answer
 * whether a given cell's or header's text is being clipped. The view layer
 * feeds the answer to the shared hover tooltip so that — and only that — text
 * gets a tooltip.
 *
 * Everything here is measured through an injected {@link MeasureText}, so the
 * module is unit-testable without a real `<canvas>`.
 */

import { wrapText, type MeasureText } from './measure.js';
import type { CellAlign } from './cell-types.js';

/**
 * Cell types whose renderer paints no display text (a checkbox glyph, a filled
 * bar). Their text can never be "clipped", so they never get an overflow
 * tooltip. Every other type — including the ones with no dedicated renderer
 * (`dropdown`, `date`, `time`, `elapsed`, `autocomplete`) — falls back to the
 * text renderer and is eligible.
 */
const NON_TEXT_CELL_TYPES: ReadonlySet<string> = new Set(['boolean', 'checkbox', 'bar']);

/** Does the renderer for `type` paint the cell's display text? */
export function paintsCellText(type: string | undefined): boolean {
  return type === undefined || !NON_TEXT_CELL_TYPES.has(type);
}

export interface CellTextFit {
  /** The display text the painter draws (after any display override). */
  text: string;
  /** Cell width in px (merge-expanded when the cell is a merge anchor). */
  width: number;
  /** Cell height in px (merge-expanded when the cell is a merge anchor). */
  height: number;
  /** `theme.cellPaddingX` — the painter's horizontal inset. */
  paddingX: number;
  /** Column alignment; only `'center'` changes the available width. */
  align?: CellAlign;
  /** CSS font string the cell is painted with. */
  font: string;
  measure: MeasureText;
  /** Present for wrap-enabled columns; `lineHeight` is {@link wrapLineHeight}. */
  wrap?: { lineHeight: number };
}

/**
 * True when the cell's text does not fully fit the cell it is painted in.
 *
 * Single-line cells: the painter starts the text one `paddingX` inside the
 * cell (left- and right-aligned alike) and clips at the cell edge, so the
 * visible width is `width - paddingX`. Centered text is clipped symmetrically
 * and gets the full `width`.
 *
 * Wrapped cells: the scene wraps to `width - 2 * paddingX` and the painter
 * clips the line block to the cell height, so the text is truncated when the
 * lines overflow the row, or when a single unbreakable line is wider than the
 * wrap width (`wrapText` never splits a word).
 */
export function isCellTextClipped(fit: CellTextFit): boolean {
  if (fit.text === '') {
    return false;
  }
  if (fit.wrap !== undefined) {
    const maxWidth = Math.max(1, fit.width - fit.paddingX * 2);
    const lines = wrapText(fit.text, maxWidth, fit.font, fit.measure);
    if (lines.length * fit.wrap.lineHeight > fit.height) {
      return true;
    }
    return lines.some((line) => fit.measure(line, fit.font) > maxWidth);
  }
  const available = fit.align === 'center' ? fit.width : fit.width - fit.paddingX;
  return fit.measure(fit.text, fit.font) > available;
}

export interface HeaderChrome {
  /** The header cell renders a collapse caret before its label. */
  collapsible: boolean;
  /** Caret direction (`▸` collapsed / `▾` expanded) — both are measured. */
  collapsed: boolean;
  /** A filter (`▽`) button is rendered at the header's right edge. */
  filterIcon: boolean;
  /** A sort (`⇅` / `▲` / `▼`) button is rendered at the header's right edge. */
  sortIcon: boolean;
  font: string;
  measure: MeasureText;
}

/** Right padding of the filter button (`paddingRight: 2` in the header cell). */
const FILTER_ICON_PADDING = 2;
/** Right padding of the sort button (`paddingRight: 4` in the header cell). */
const SORT_ICON_PADDING = 4;

/**
 * Horizontal space the header cell's non-label chrome occupies: the collapse
 * caret drawn before the label plus the sort / filter buttons pinned to the
 * right edge. Subtracted from the header width before the label is measured.
 */
export function headerChromeWidth(chrome: HeaderChrome): number {
  let used = 0;
  if (chrome.collapsible) {
    used += chrome.measure(chrome.collapsed ? '▸ ' : '▾ ', chrome.font);
  }
  if (chrome.filterIcon) {
    used += chrome.measure('▽', chrome.font) + FILTER_ICON_PADDING;
  }
  if (chrome.sortIcon) {
    used += chrome.measure('⇅', chrome.font) + SORT_ICON_PADDING;
  }
  return used;
}

export interface HeaderLabelFit {
  label: string;
  /** Header cell width in px. */
  width: number;
  /** `padding-left` of the header cell (0 for centered group headers). */
  paddingX: number;
  /** Result of {@link headerChromeWidth}. */
  chromeWidth: number;
  font: string;
  measure: MeasureText;
}

/**
 * True when a column-header label does not fit its header box. Header cells
 * are DOM with `white-space: pre-line`, so an explicit `"\n"` is a real line
 * break and the band grows vertically to fit — only the widest single line
 * decides whether the label is cut horizontally.
 */
export function isHeaderLabelClipped(fit: HeaderLabelFit): boolean {
  if (fit.label === '') {
    return false;
  }
  const available = fit.width - fit.paddingX - fit.chromeWidth;
  let widest = 0;
  for (const line of fit.label.split('\n')) {
    const w = fit.measure(line, fit.font);
    if (w > widest) {
      widest = w;
    }
  }
  return widest > available;
}
