/**
 * Visual conditional formatting — color scales, data bars, and icon sets, the
 * way Excel and Google Sheets render them. All pure: given a value and the
 * column's numeric domain `[min, max]`, produce a {@link CellVisual} the
 * renderer can draw (a background color, an in-cell bar ratio, or an icon).
 */

import type { CellValue } from './types.js';

/**
 * Named, Excel-style icon sets. Rendered as crisp vector shapes (not emoji):
 *  - `traffic`  : 3 filled circles (red / amber / green)
 *  - `signs`    : 3 circled symbols (✗ / ! / ✓)
 *  - `arrows`   : 3 directional arrows (down / right / up)
 *  - `arrows5`  : 5 arrows (down → up, via diagonals)
 *  - `triangles`: down triangle / dash / up triangle
 *  - `ratings`  : 4 graduated bars filled to the value's level
 */
export type IconSet = 'traffic' | 'signs' | 'arrows' | 'arrows5' | 'triangles' | 'ratings';

/** A resolved icon to draw: which set, the value's level, and the level count. */
export interface IconMark {
  set: IconSet;
  level: number;
  total: number;
}

/** A visual conditional-format rule applied to a column. */
export type CfVisualRule =
  | { kind: 'colorScale'; colors: string[] }
  | { kind: 'dataBar'; color: string }
  | { kind: 'iconSet'; set: IconSet };

/** The drawable result for a single cell. */
export interface CellVisual {
  background?: string;
  bar?: { ratio: number; color: string };
  icon?: IconMark;
}

/** Number of levels (icons) in a set. */
export function iconSetSize(set: IconSet): number {
  if (set === 'arrows5') return 5;
  if (set === 'ratings') return 4;
  return 3;
}

/**
 * Semantic color for a colored icon set's level (red→amber→green ramp), or
 * `null` for sets drawn with the theme accent (e.g. `ratings`).
 */
export function iconColor(set: IconSet, level: number, total: number): string | null {
  if (set === 'ratings') {
    return null;
  }
  return colorScaleAt(['#e02d2d', '#f6b21b', '#2ca02c'], total <= 1 ? 0 : level / (total - 1));
}

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Position of `value` within `[min, max]`, clamped to [0,1] (0 when min===max). */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return clamp01((value - min) / (max - min));
}

/** Parse `#rrggbb` (or `#rgb`) to an [r,g,b] triple. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linearly interpolate between two hex colors. */
export function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = clamp01(t);
  return rgbToHex(ar + (br - ar) * k, ag + (bg - ag) * k, ab + (bb - ab) * k);
}

/**
 * Color along an N-stop scale (2 or 3+ colors) at position `t` in [0,1].
 * `colors` must hold at least two entries.
 */
export function colorScaleAt(colors: readonly string[], t: number): string {
  const n = colors.length;
  const seg = clamp01(t) * (n - 1);
  const i = Math.min(Math.floor(seg), n - 2);
  return lerpColor(colors[i]!, colors[i + 1]!, seg - i);
}

/** Compute the drawable visual for a cell value, or null when not applicable. */
export function computeCellVisual(
  value: CellValue,
  min: number,
  max: number,
  rule: CfVisualRule,
): CellVisual | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const t = normalize(value, min, max);
  switch (rule.kind) {
    case 'colorScale':
      return rule.colors.length >= 2 ? { background: colorScaleAt(rule.colors, t) } : null;
    case 'dataBar':
      return { bar: { ratio: t, color: rule.color } };
    case 'iconSet': {
      const total = iconSetSize(rule.set);
      const level = Math.min(Math.floor(t * total), total - 1);
      return { icon: { set: rule.set, level, total } };
    }
  }
}
