/** @lattica/data — index mapping (physical↔visual) and data-source binding. */

export { IndexMapper } from './index-mapper.js';
export { DataSource, type ColumnDef } from './data-source.js';
export {
  SortModel,
  sortPhysicalOrder,
  defaultComparator,
  type SortDirection,
  type SortConfig,
  type CellComparator,
} from './sort.js';
export {
  FilterModel,
  matchesCondition,
  filteredHiddenRows,
  type FilterCondition,
  type ColumnFilter,
} from './filter.js';
export { NestedRowModel, type NestedRowNode } from './nested-rows.js';
export { DataView, type PhysicalCell } from './data-view.js';
export {
  AsyncRowModel,
  type RowBlock,
  type RowFetcher,
  type AsyncRowModelOptions,
} from './async-rows.js';
