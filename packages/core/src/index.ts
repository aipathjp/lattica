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
export { MergeModel, type MergeArea } from './merge.js';
export {
  searchGrid,
  SearchState,
  type SearchMatch,
  type SearchOptions,
} from './search.js';
export { validators, ValidationModel, type Validator } from './validation.js';
export {
  toNumberOrNull,
  summarize,
  summarizeColumn,
  type SummaryFn,
} from './summary.js';
export {
  ruleMatches,
  evaluateRules,
  ConditionalFormatModel,
  type CfStyle,
  type CfRule,
} from './conditional-format.js';
export { CommentModel, type CellComment } from './comments.js';
export {
  BorderModel,
  type BorderSide,
  type BorderStyle,
  type CellBorders,
} from './borders.js';
export { HookBus, type HookMap, type HookHandler } from './hooks.js';
export {
  serializeState,
  deserializeState,
  emptyState,
  type GridStateSnapshot,
} from './persistent-state.js';
export { detectSeries, extendSeries, type SeriesKind } from './fill-series.js';
