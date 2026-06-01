/**
 * Canvas painter. Issues 2D drawing calls for a {@link Scene}. It targets a
 * minimal {@link Canvas2D} interface (a structural subset of
 * `CanvasRenderingContext2D`) so it works with a real context at runtime and a
 * lightweight recording mock in tests.
 */

import type { GridTheme } from './theme.js';
import type { Scene } from './scene.js';

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
}

export interface PaintOptions {
  width: number;
  height: number;
  dpr?: number;
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

  for (const cell of scene.cells) {
    const { rect } = cell;
    if (cell.selected) {
      ctx.fillStyle = theme.selectionFill;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
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

    if (cell.text !== '') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
      ctx.fillStyle = theme.textColor;
      ctx.fillText(cell.text, rect.x + theme.cellPaddingX, rect.y + rect.height / 2);
      ctx.restore();
    }
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
