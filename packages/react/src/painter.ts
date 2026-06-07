/**
 * Canvas painter. Issues 2D drawing calls for a {@link Scene}. It targets a
 * minimal {@link Canvas2D} interface (a structural subset of
 * `CanvasRenderingContext2D`) so it works with a real context at runtime and a
 * lightweight recording mock in tests.
 */

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

    // In-cell data bar (drawn behind the text).
    if (cell.bar !== undefined) {
      const inset = 2;
      const barWidth = Math.max(0, (rect.width - inset * 2) * cell.bar.ratio);
      ctx.fillStyle = cell.bar.color;
      ctx.fillRect(rect.x + inset, rect.y + inset, barWidth, rect.height - inset * 2);
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

    // Icon-set glyph at the cell's left edge (drawn before the text).
    if (cell.icon !== undefined) {
      ctx.fillStyle = theme.textColor;
      ctx.textAlign = 'left';
      ctx.fillText(cell.icon, rect.x + theme.cellPaddingX, rect.y + rect.height / 2);
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
