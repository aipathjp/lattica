# @lattica/data

Index-mapping and data-source binding for Lattica. This package decouples the
*physical* order of rows/columns (how data is stored) from the *visual* order
(how it is displayed) so that sorting, filtering, and nested-row grouping can be
applied as a view transform without mutating the underlying data. The
`DataView` ties an `IndexMapper` together for both axes; `SortModel` and
`FilterModel` are the pure models that drive it.

## Install

```sh
pnpm add @lattica/data
```

## API overview

### DataView & IndexMapper

`DataView` maps between visual and physical indices on both axes.

```ts
import { DataView } from '@lattica/data';

const view = new DataView(100, 10); // rowCount, colCount
view.cols.getPhysicalIndex(0);      // physical column behind visual column 0
view.rows.getPhysicalIndex(5);      // physical row behind visual row 5
```

### Sorting

`SortModel` holds an ordered list of `SortConfig`s (each `{ col, direction }`);
`sortPhysicalOrder` produces the resulting physical order. `defaultComparator`
sorts numbers numerically and everything else lexicographically.

```ts
import { SortModel, sortPhysicalOrder, type SortDirection } from '@lattica/data';

const sort = new SortModel();
sort.toggle(2);        // cycle column 2: asc -> desc -> cleared
sort.toggle(0, true);  // additive: add column 0 as a secondary sort key
const configs = sort.getConfigs();
```

### Filtering

A `ColumnFilter` targets one column with one or more `FilterCondition`s combined
by a conjunction (default `'and'`). `matchesCondition` is the pure predicate;
`filteredHiddenRows` computes which physical rows are hidden.

```ts
import { FilterModel, matchesCondition, type FilterCondition } from '@lattica/data';

const filter = new FilterModel();
const conditions: FilterCondition[] = [
  { kind: 'gte', value: 18 },
  { kind: 'lt', value: 65 },
];
filter.set({ col: 3, conditions, conjunction: 'and' });

matchesCondition(42, { kind: 'between', min: 0, max: 100 }); // true
```

Condition kinds include `equals`, `notEquals`, `contains`, `notContains`,
`gt`/`gte`/`lt`/`lte`, `between`, `empty`/`notEmpty`, and `in`.

### Nested rows

`NestedRowModel` (with `NestedRowNode`) models hierarchical, collapsible row
trees for grouped/outline views.
