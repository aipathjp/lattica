/** Shared structural types for the Lattica core engine. */

import type { CellAddress } from './coords.js';

export type { CellAddress } from './coords.js';

/** A primitive value a cell can hold (before formula evaluation). */
export type CellValue = string | number | boolean | null;

/** A rectangular region defined by an inclusive start and end address. */
export interface GridRange {
  readonly start: CellAddress;
  readonly end: CellAddress;
}

/** Axis discriminator used by size/virtualization utilities. */
export type Axis = 'row' | 'col';

/** A half-open visible window `[start, end)` along one axis. */
export interface IndexRange {
  /** First visible index (inclusive). */
  readonly start: number;
  /** One past the last visible index (exclusive). */
  readonly end: number;
}
