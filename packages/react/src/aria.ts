/**
 * Pure ARIA attribute computation for the grid's DOM accessibility layer. Each
 * function returns a plain attribute object the React component spreads onto an
 * element so screen readers can navigate the grid. Keeping this pure makes the
 * (otherwise DOM-coupled) accessibility wiring fully unit-testable.
 *
 * ARIA grid indices are 1-based, while the grid's internal coordinates are
 * 0-based, so every index emitted here is the visual coordinate plus one.
 */

export interface AriaAttrs {
  [k: string]: string | number | boolean | undefined;
}

/** Attributes for the grid container element. */
export function gridAria(rowCount: number, colCount: number): AriaAttrs {
  return {
    role: 'grid',
    'aria-rowcount': rowCount,
    'aria-colcount': colCount,
  };
}

/** Attributes for a body row element (1-based row index). */
export function rowAria(visualRow: number): AriaAttrs {
  return {
    role: 'row',
    'aria-rowindex': visualRow + 1,
  };
}

/** Attributes for a body cell element (1-based row/col indices). */
export function cellAria(
  visualRow: number,
  visualCol: number,
  opts?: { selected?: boolean; readonly?: boolean },
): AriaAttrs {
  const attrs: AriaAttrs = {
    role: 'gridcell',
    'aria-rowindex': visualRow + 1,
    'aria-colindex': visualCol + 1,
  };
  if (opts?.selected !== undefined) {
    attrs['aria-selected'] = opts.selected;
  }
  if (opts?.readonly !== undefined) {
    attrs['aria-readonly'] = opts.readonly;
  }
  return attrs;
}

/** Attributes for a column header cell (1-based col index). */
export function columnHeaderAria(
  visualCol: number,
  opts?: { sort?: 'asc' | 'desc' | 'none' },
): AriaAttrs {
  return {
    role: 'columnheader',
    'aria-colindex': visualCol + 1,
    'aria-sort': opts?.sort ?? 'none',
  };
}

/** Attributes for a row header cell (1-based row index). */
export function rowHeaderAria(visualRow: number): AriaAttrs {
  return {
    role: 'rowheader',
    'aria-rowindex': visualRow + 1,
  };
}
