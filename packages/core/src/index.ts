/** @lattica/core — framework-agnostic data grid engine. */

export * from './types.js';
export {
  columnIndexToLabel,
  columnLabelToIndex,
  parseA1,
  toA1,
  addressEquals,
  addressKey,
  MAX_COLUMN_INDEX,
  type A1Reference,
} from './coords.js';
export { SizeManager, type SizeManagerOptions } from './size-manager.js';
export {
  computeVisibleWindow,
  forEachIndex,
  type VisibleWindow,
  type ComputeWindowParams,
} from './viewport.js';
export {
  DataStore,
  type CellChange,
  type DataStoreListener,
  type DataStoreOptions,
} from './data-store.js';
export {
  normalizeRange,
  singleCell,
  rangeContains,
  rangeArea,
  rangesIntersect,
  rangeUnion,
  forEachCell,
  clampRange,
  type NormalizedRange,
} from './range.js';
export {
  SelectionModel,
  type SelectionState,
  type SelectionListener,
  type SelectionModelOptions,
} from './selection.js';
export {
  UndoManager,
  CompositeCommand,
  type Command,
  type UndoManagerOptions,
} from './command.js';
export {
  computeHeaderLayout,
  HeaderModel,
  isGroup,
  type ColumnDef,
  type ColumnGroupDef,
  type ColumnNode,
  type HeaderCell,
  type HeaderLayout,
  type VisibleLeaf,
  type ShowWhen,
} from './headers.js';
export { Emitter, type EventMap, type Handler } from './emitter.js';
