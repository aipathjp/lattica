/**
 * Lattica canvas-free hot-path benchmark.
 *
 * This is a runnable Node ESM *script* (NOT a TypeScript source under `src/**`,
 * so it is excluded from the coverage `include` glob and from Vitest). It
 * measures the per-frame cost of the grid's render pipeline *without* a real
 * canvas: it drives `buildScene` (visibility math + selection lookups) and
 * `paintScene` (the full draw-call sequence) against a no-op 2D context so the
 * numbers reflect engine work, not GPU/raster time.
 *
 * Run it AFTER building the workspace:
 *
 *     pnpm build && node packages/react/bench/bench.mjs
 *
 * Imports resolve from each package's built `dist`, exactly as a consumer would.
 */

import { performance } from 'node:perf_hooks';
import { SizeManager, SelectionModel } from '@lattica/core';
import { buildScene, paintScene } from '@lattica/react';

/** A no-op, recording-free Canvas2D mock: every method is empty, props settable. */
function createNoopContext() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textBaseline: 'middle',
    textAlign: 'left',
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    // dpr path is skipped (dpr = 1) but kept harmless if ever invoked.
    scale() {},
  };
}

/** Format a number with thousands separators. */
function n(x) {
  return x.toLocaleString('en-US');
}

const ROWS = 1_000_000;
const COLS = 1_000;
const CLIENT_WIDTH = 1400;
const CLIENT_HEIGHT = 900;
const ITERATIONS = 300;

// --- Geometry over a very large sheet -------------------------------------
const rowSizes = new SizeManager({ count: ROWS, defaultSize: 24 });
const colSizes = new SizeManager({ count: COLS, defaultSize: 110 });

// Sprinkle some overrides so the prefix-sum / binary-search paths are exercised
// rather than the trivial all-default arithmetic fast path.
for (let i = 0; i < 5000; i++) {
  rowSizes.setSize((i * 197) % ROWS, 24 + (i % 7) * 6);
}
for (let i = 0; i < 100; i++) {
  colSizes.setSize((i * 13) % COLS, 110 + (i % 5) * 20);
}

/** @type {import('@lattica/react').GridGeometry} */
const geom = {
  rowSizes,
  colSizes,
  frozenRows: 1,
  frozenCols: 1,
  rowHeaderWidth: 48,
  colHeaderHeight: 28,
};

const selection = new SelectionModel({ rowCount: ROWS, colCount: COLS });

const theme = {
  background: '#ffffff',
  gridLineColor: '#e0e0e0',
  selectionFill: 'rgba(33,150,243,0.15)',
  activeBorder: '#2196f3',
  headerBackground: '#f5f5f5',
  headerText: '#333333',
  cellText: '#222222',
  fontFamily: 'sans-serif',
  fontSize: 13,
};

// Deterministic pseudo-content; no allocation churn beyond the returned string.
const getDisplay = (row, col) => `R${row}C${col}`;

const ctx = createNoopContext();
const paintOptions = { width: CLIENT_WIDTH, height: CLIENT_HEIGHT, dpr: 1 };

/** One frame of work: visibility + scene build + full paint call sequence. */
function frame(scrollTop, scrollLeft) {
  selection.setActive({ row: geom.rowSizes.getIndexAt(scrollTop) + 2, col: 3 });
  const scene = buildScene({
    geom,
    scrollLeft,
    scrollTop,
    clientWidth: CLIENT_WIDTH,
    clientHeight: CLIENT_HEIGHT,
    selection,
    getDisplay,
  });
  paintScene(ctx, scene, theme, paintOptions);
  return scene;
}

// --- Warm-up (JIT) --------------------------------------------------------
const totalH = rowSizes.getTotalSize();
const totalW = colSizes.getTotalSize();
let lastScene = frame(0, 0);
for (let i = 0; i < 30; i++) {
  frame((i / 30) * (totalH - CLIENT_HEIGHT), (i / 30) * (totalW - CLIENT_WIDTH));
}

// --- Measured loop: scroll across the whole sheet -------------------------
let cellSum = 0;
const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  const t = i / ITERATIONS;
  const scrollTop = Math.floor(t * Math.max(0, totalH - CLIENT_HEIGHT));
  const scrollLeft = Math.floor(t * Math.max(0, totalW - CLIENT_WIDTH));
  lastScene = frame(scrollTop, scrollLeft);
  cellSum += lastScene.cells.length;
}
const elapsed = performance.now() - start;

const msPerFrame = elapsed / ITERATIONS;
const fps = 1000 / msPerFrame;
const avgCells = Math.round(cellSum / ITERATIONS);

// --- SizeManager.getIndexAt micro-bench (O(log n) over 1e6 rows) ----------
const LOOKUPS = 1_000_000;
const offsets = new Float64Array(LOOKUPS);
let seed = 123456789;
for (let i = 0; i < LOOKUPS; i++) {
  // xorshift for cheap deterministic randomness
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  offsets[i] = (Math.abs(seed) % totalH);
}
// warm-up
let sink = 0;
for (let i = 0; i < 50_000; i++) sink += rowSizes.getIndexAt(offsets[i]);
const lookupStart = performance.now();
for (let i = 0; i < LOOKUPS; i++) {
  sink += rowSizes.getIndexAt(offsets[i]);
}
const lookupElapsed = performance.now() - lookupStart;
const nsPerLookup = (lookupElapsed * 1e6) / LOOKUPS;
const lookupsPerSec = LOOKUPS / (lookupElapsed / 1000);

// --- Report ----------------------------------------------------------------
console.log('Lattica canvas-free hot-path benchmark');
console.log('======================================');
console.log(`Sheet:            ${n(ROWS)} rows x ${n(COLS)} cols  (${n(ROWS * COLS)} cells)`);
console.log(`Viewport:         ${CLIENT_WIDTH} x ${CLIENT_HEIGHT} px`);
console.log(`Frames measured:  ${n(ITERATIONS)}`);
console.log('');
console.log('buildScene + paintScene (per frame):');
console.log(`  visible cells/frame:  ${n(avgCells)}`);
console.log(`  ms/frame (avg):       ${msPerFrame.toFixed(4)}`);
console.log(`  frames/sec:           ${fps.toFixed(0)}`);
console.log('');
console.log(`SizeManager.getIndexAt over ${n(ROWS)}-row axis (O(log n)):`);
console.log(`  lookups:              ${n(LOOKUPS)}`);
console.log(`  ns/lookup (avg):      ${nsPerLookup.toFixed(1)}`);
console.log(`  lookups/sec:          ${n(Math.round(lookupsPerSec))}`);
console.log('');
console.log(`(sink=${sink === 0 ? 0 : 1})`);
