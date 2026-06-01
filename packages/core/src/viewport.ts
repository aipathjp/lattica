/**
 * Viewport — computes the visible index window along one axis given a scroll
 * offset and a client extent, with optional frozen (pinned) leading indices and
 * an overscan margin to pre-render off-screen cells for smooth scrolling.
 */

import type { IndexRange } from './types.js';
import { SizeManager } from './size-manager.js';

export interface VisibleWindow {
  /** Frozen leading indices, always visible: `[0, frozenCount)`. */
  readonly frozen: IndexRange;
  /** Scrollable indices currently in view (includes overscan). */
  readonly scrollable: IndexRange;
  /** Pixel size occupied by the frozen region. */
  readonly frozenSize: number;
}

export interface ComputeWindowParams {
  /** Scroll offset (px) of the scrollable region. */
  scroll: number;
  /** Visible client extent (px) of the viewport. */
  client: number;
  /** Number of frozen leading indices. */
  frozenCount?: number;
  /** Extra indices to render beyond each edge. */
  overscan?: number;
}

/**
 * Compute the visible window for one axis.
 *
 * The scrollable window never includes frozen indices. `scroll` is measured
 * from the start of the scrollable region (i.e. after the frozen band).
 */
export function computeVisibleWindow(
  sizes: SizeManager,
  params: ComputeWindowParams,
): VisibleWindow {
  const count = sizes.getCount();
  const frozenCount = Math.min(Math.max(params.frozenCount ?? 0, 0), count);
  const overscan = Math.max(params.overscan ?? 0, 0);

  const frozenSize = sizes.getOffset(frozenCount);

  if (count === 0 || frozenCount >= count) {
    return {
      frozen: { start: 0, end: frozenCount },
      scrollable: { start: frozenCount, end: frozenCount },
      frozenSize,
    };
  }

  const client = Math.max(params.client, 0);
  // Absolute pixel offset where the scrollable viewport begins.
  const viewStart = sizes.getOffset(frozenCount) + Math.max(params.scroll, 0);
  const viewEnd = viewStart + client;

  const rawStart = sizes.getIndexAt(viewStart);
  // Exclusive end = (largest index whose leading offset < viewEnd) + 1.
  // When viewEnd lands exactly on a cell boundary that cell is not visible.
  const lastByOffset = sizes.getIndexAt(viewEnd);
  const rawEnd = sizes.getOffset(lastByOffset) >= viewEnd ? lastByOffset : lastByOffset + 1;

  // The final clamps guarantee `frozenCount <= start <= end <= count`.
  const start = Math.max(frozenCount, rawStart - overscan);
  const end = Math.min(count, Math.max(start, rawEnd + overscan));

  return {
    frozen: { start: 0, end: frozenCount },
    scrollable: { start, end },
    frozenSize,
  };
}

/** Iterate the indices of an IndexRange, invoking `fn` for each. */
export function forEachIndex(range: IndexRange, fn: (index: number) => void): void {
  for (let i = range.start; i < range.end; i++) {
    fn(i);
  }
}
