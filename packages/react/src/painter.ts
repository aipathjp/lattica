/**
 * Canvas painter. Issues 2D drawing calls for a {@link Scene}. It targets a
 * minimal {@link Canvas2D} interface (a structural subset of
 * `CanvasRenderingContext2D`) so it works with a real context at runtime and a
 * lightweight recording mock in tests.
 */

import { iconColor, lerpColor, type IconMark } from '@lattica/core';
import type { GridTheme } from './theme.js';
import type { Scene } from './scene.js';
import { defaultCellTypes, type CellTypeRegistry } from './cell-types.js';

export interface Canvas2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  /** Arc drawing — used by the pie chart renderer. */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  closePath(): void;
  fill(): void;
}

export interface PaintOptions {
  width: number;
  height: number;
  dpr?: number;
  /** Cell-type registry for resolving renderers; defaults to the built-ins. */
  cellTypes?: CellTypeRegistry;
}

/** Paint a scene onto the context. */
export function paintScene(
  ctx: Canvas2D,
  scene: Scene,
  theme: GridTheme,
  options: PaintOptions,
): void {
  const dpr = options.dpr ?? 1;
  ctx.save();
  if (dpr !== 1) {
    // Scale for high-DPI displays; the component sizes the backing store.
    scaleForDpr(ctx, dpr);
  }

  ctx.fillStyle = theme.background;
  ctx.clearRect(0, 0, options.width, options.height);
  ctx.fillRect(0, 0, options.width, options.height);

  ctx.font = `${theme.fontSize}px ${theme.fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const registry = options.cellTypes ?? defaultCellTypes;

  for (const cell of scene.cells) {
    const { rect } = cell;
    // Conditional-format background sits below the selection tint.
    if (cell.cfStyle?.background !== undefined) {
      ctx.fillStyle = cell.cfStyle.background;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    if (cell.selected) {
      ctx.fillStyle = theme.selectionFill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    // In-cell data bar (drawn behind the text) with a softer top + thin border.
    if (cell.bar !== undefined && cell.bar.ratio > 0) {
      const inset = 2;
      const barWidth = Math.max(2, (rect.width - inset * 2) * cell.bar.ratio);
      const bx = rect.x + inset;
      const by = rect.y + inset;
      const bh = rect.height - inset * 2;
      // Two-tone fill (lighter top half) approximates Excel's gradient bar.
      ctx.fillStyle = lerpColor(cell.bar.color, '#ffffff', 0.35);
      ctx.fillRect(bx, by, barWidth, bh);
      ctx.fillStyle = cell.bar.color;
      ctx.fillRect(bx, by + bh / 2, barWidth, bh / 2);
      ctx.strokeStyle = lerpColor(cell.bar.color, '#000000', 0.25);
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, barWidth - 1, bh - 1);
    }

    // Gridlines (right + bottom edge).
    ctx.strokeStyle = theme.gridLineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x, rect.y + rect.height);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
    ctx.moveTo(rect.x + rect.width, rect.y);
    ctx.lineTo(rect.x + rect.width, rect.y + rect.height);
    ctx.stroke();

    // In-cell sparkline (cell-local coords translated by the cell origin).
    if (cell.sparkline !== undefined) {
      const sk = cell.sparkline;
      if (sk.points !== undefined && sk.points.length > 0) {
        ctx.strokeStyle = theme.activeBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        sk.points.forEach((p, i) => {
          const x = rect.x + p.x;
          const y = rect.y + p.y;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
      if (sk.bars !== undefined) {
        for (const b of sk.bars) {
          ctx.fillStyle = b.positive ? theme.activeBorder : '#c0392b';
          ctx.fillRect(rect.x + b.x, rect.y + b.y, b.width, b.height);
        }
      }
    }

    // Crisp vector icon-set mark at the cell's left edge (before the text).
    if (cell.icon !== undefined) {
      drawIcon(ctx, cell.icon, rect.x + theme.cellPaddingX, rect.y + rect.height / 2, theme);
    }

    registry.resolve(cell.type)({
      ctx,
      rect,
      value: cell.value ?? cell.text,
      text: cell.text,
      theme,
      align: cell.align ?? 'left',
      color: cell.cfStyle?.color,
    });
  }

  if (scene.activeRect !== null) {
    const r = scene.activeRect;
    ctx.strokeStyle = theme.activeBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x + 1, r.y + 1, r.width - 1, r.height - 1);
  }

  ctx.restore();
}

/** Apply a DPR scale by drawing scaled gridlines — kept tiny and overridable. */
function scaleForDpr(ctx: Canvas2D, dpr: number): void {
  // Real CanvasRenderingContext2D exposes scale(); guard for the mock.
  const scalable = ctx as Canvas2D & { scale?: (x: number, y: number) => void };
  if (typeof scalable.scale === 'function') {
    scalable.scale(dpr, dpr);
  }
}

/** Draw a filled triangle through three points. */
function triangle(ctx: Canvas2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

/** Draw an arrow (shaft + head) of radius `r` at angle `a` (radians, y-down). */
function arrow(ctx: Canvas2D, cx: number, cy: number, r: number, a: number, color: string): void {
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const hx = cx + dx * r;
  const hy = cy + dy * r;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.32);
  ctx.beginPath();
  ctx.moveTo(cx - dx * r, cy - dy * r);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  const hl = r * 0.8;
  const la = a + Math.PI * 0.78;
  const ra = a - Math.PI * 0.78;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(la) * hl, hy + Math.sin(la) * hl);
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + Math.cos(ra) * hl, hy + Math.sin(ra) * hl);
  ctx.stroke();
}

/**
 * Draw an Excel-style icon-set mark, vertically centered at `cy`, starting at
 * left edge `x`. Crisp vector shapes — no emoji.
 */
function drawIcon(ctx: Canvas2D, mark: IconMark, x: number, cy: number, theme: GridTheme): void {
  const size = Math.min(14, theme.fontSize + 2);
  const color = iconColor(mark.set, mark.level, mark.total) ?? theme.activeBorder;
  const r = size / 2;
  const ccx = x + r;

  if (mark.set === 'traffic') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ccx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (mark.set === 'signs') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(ccx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.4, r * 0.32);
    const u = r * 0.5;
    if (mark.level >= mark.total - 1) {
      // check
      ctx.beginPath();
      ctx.moveTo(ccx - u, cy);
      ctx.lineTo(ccx - u * 0.2, cy + u * 0.8);
      ctx.lineTo(ccx + u, cy - u * 0.8);
      ctx.stroke();
    } else if (mark.level === 0) {
      // cross
      ctx.beginPath();
      ctx.moveTo(ccx - u, cy - u);
      ctx.lineTo(ccx + u, cy + u);
      ctx.moveTo(ccx + u, cy - u);
      ctx.lineTo(ccx - u, cy + u);
      ctx.stroke();
    } else {
      // exclamation
      ctx.beginPath();
      ctx.moveTo(ccx, cy - u);
      ctx.lineTo(ccx, cy + u * 0.3);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ccx - 0.8, cy + u * 0.7, 1.6, 1.6);
    }
    return;
  }

  if (mark.set === 'arrows' || mark.set === 'arrows5') {
    // level 0 (low) → down (PI/2); high → up (-PI/2); linear via diagonals.
    const a = mark.total <= 1 ? 0 : Math.PI / 2 - (mark.level / (mark.total - 1)) * Math.PI;
    arrow(ctx, ccx, cy, r * 0.85, a, color);
    return;
  }

  if (mark.set === 'triangles') {
    ctx.fillStyle = color;
    if (mark.level >= mark.total - 1) {
      triangle(ctx, ccx, cy - r, ccx + r, cy + r, ccx - r, cy + r); // up
    } else if (mark.level === 0) {
      triangle(ctx, ccx, cy + r, ccx + r, cy - r, ccx - r, cy - r); // down
    } else {
      ctx.fillRect(ccx - r, cy - r * 0.28, size, r * 0.56); // dash
    }
    return;
  }

  // ratings: graduated bars filled up to the level, rest faint.
  const bars = mark.total;
  const gap = 1.5;
  const bw = (size + 4 - gap * (bars - 1)) / bars;
  for (let i = 0; i < bars; i++) {
    const bh = ((i + 1) / bars) * size;
    ctx.fillStyle = i <= mark.level ? theme.activeBorder : lerpColor(theme.headerGridLineColor, '#ffffff', 0.3);
    ctx.fillRect(x + i * (bw + gap), cy + size / 2 - bh, bw, bh);
  }
}
