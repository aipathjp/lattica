/**
 * LatticaGrid — the React view over a {@link GridController}.
 *
 * The cell body is painted on a single `<canvas>` (bypassing React's
 * reconciliation for the hot path), while headers, the row-number gutter, and
 * the active-cell editor are DOM for accessibility, multi-level grouping, and
 * IME-aware Japanese input. Scrolling is wheel/keyboard driven and clamped via
 * pure helpers; all non-trivial math lives in the tested pure modules.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { HeaderModel, isGroup, type ColumnDef, type ColumnNode, type GridStateSnapshot } from '@ai-path/tb-core';
import type { CellCommitEvent, GridController, EditState } from './controller.js';
import {
  DEFAULT_HEADER_LINE_HEIGHT,
  DEFAULT_HEADER_PADDING_Y,
  resolveTheme,
  type GridTheme,
} from './theme.js';
import { buildScene } from './scene.js';
import { canvasMeasurer } from './measure.js';
import { paintScene, type Canvas2D } from './painter.js';
import { cellRect, columnX, hitTest, type GridGeometry, type HitResult } from './geometry.js';
import { interpretKey, type KeyInput } from './keyboard.js';
import { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
import { columnHeaderCells, computeHeaderRowHeights, rowHeaderCells } from './headers.js';
import type { EditorRegistry } from './editors.js';
import { buildMenu, type MenuItem, type MenuItemSpec } from './menu.js';
import { hitResizeHandle, type ResizeTarget } from './resize.js';

export interface LatticaGridProps {
  controller: GridController;
  /** Optional multi-level column definitions; defaults to A, B, C… letters. */
  columns?: readonly ColumnNode[];
  /** Controlled record rows bound through leaf column `field` values. */
  rows?: ReadonlyArray<object>;
  theme?: Partial<GridTheme>;
  /** Fixed pixel width (ignored when `autoSize` or `fill` is set). Defaults to 640. */
  width?: number;
  /** Fixed pixel height (ignored when `autoSize` or `fill` is set). Defaults to 400. */
  height?: number;
  /** Size to grid content. When set, `width`, `height`, and `fill` are ignored. */
  autoSize?: 'content';
  /** Maximum auto-sized width; overflow remains scrollable. */
  maxWidth?: number;
  /** Maximum auto-sized height; overflow remains scrollable. */
  maxHeight?: number;
  /** Expand to fill the parent element (measured via ResizeObserver). Size the
   *  parent however you like — e.g. `width:100%; height:100vh`. Ignored when
   *  `autoSize` is set. */
  fill?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Build the right-click context menu for a hit target; defaults to the built-in menu. */
  contextMenu?: (target: HitResult) => MenuItemSpec[];
  /** Render the detail panel for an expanded master row (by physical row index). */
  renderDetail?: (physicalRow: number) => ReactNode;
  /** Show the auto-numbered row header gutter. Defaults to true. */
  showRowNumbers?: boolean;
  /** Enable the header sort UI. Defaults to true. */
  sortable?: boolean;
  /** Show clickable sort icons when sorting is enabled. Defaults to true. */
  showSortIcons?: boolean;
  /** Enable the header filter UI. Defaults to true. */
  filterable?: boolean;
  /** Show filter icons when filtering is enabled. Defaults to true. */
  showFilterIcons?: boolean;
  /** セル領域クリック時（選択更新後） */
  onCellClick?: (hit: { row: number; col: number }, event: ReactMouseEvent<HTMLDivElement>) => void;
  /** スクロール位置が変わったとき */
  onScrollChange?: (scroll: ScrollOffset) => void;
  /** Fired once a column-border drag is committed and the width actually changed. */
  onColumnResize?: (change: { col: number; physicalCol: number; width: number }) => void;
  /** Fired when controller view state changes through user-facing view operations. */
  onViewStateChange?: (snapshot: GridStateSnapshot) => void;
  /** Fired after user-facing cell writes are committed. */
  onCellCommit?: (event: CellCommitEvent) => void;
  /** How to place the text cursor when editing begins. Defaults to selecting all text. */
  editSelection?: 'all' | 'end' | 'preserve';
  /**
   * Registry of custom cell editors. Columns whose `editor` kind is registered
   * here mount the registered factory over the cell instead of a built-in
   * editor; unregistered kinds silently fall back to the text editor.
   */
  editors?: EditorRegistry;
  /** Controlled visual cell anchor for a root-local overlay. */
  cellOverlay?: { row: number; col: number } | null;
  /** Render a controlled overlay anchored to `cellOverlay`. */
  renderCellOverlay?: (ctx: {
    row: number;
    col: number;
    rect: { left: number; top: number; width: number; height: number };
    close: () => void;
  }) => ReactNode;
  /** Called when the grid requests that the controlled cell overlay close. */
  onCellOverlayClose?: () => void;
}

export interface LatticaGridHandle {
  getCellClientRect(row: number, col: number): DOMRect | null;
  focus(): void;
  scrollCellIntoView(row: number, col: number): void;
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

function leafColumnDefs(nodes: readonly ColumnNode[]): ColumnDef[] {
  const out: ColumnDef[] = [];
  const visit = (node: ColumnNode): void => {
    if (isGroup(node)) {
      node.children.forEach(visit);
    } else {
      out.push(node);
    }
  };
  nodes.forEach(visit);
  return out;
}

function effectiveGeometry(geom: GridGeometry, showRowNumbers: boolean): GridGeometry {
  return showRowNumbers ? geom : { ...geom, rowHeaderWidth: 0 };
}

function rectIsVisibleInGrid(rect: { x: number; y: number; width: number; height: number }, geom: GridGeometry, width: number, height: number): boolean {
  return rect.x + rect.width > geom.rowHeaderWidth && rect.y + rect.height > geom.colHeaderHeight && rect.x < width && rect.y < height;
}

function clampAutoSize(size: number, max: number | undefined): number {
  return max === undefined ? size : Math.min(size, Math.max(0, max));
}

const LatticaGridImpl = forwardRef<LatticaGridHandle, LatticaGridProps>(function LatticaGrid(
  props,
  ref,
): ReactElement {
  const {
    controller,
    columns,
    rows,
    onCellClick,
    onScrollChange,
    onColumnResize,
    onViewStateChange,
    onCellCommit,
    cellOverlay,
    renderCellOverlay,
    onCellOverlayClose,
    editors,
  } = props;
  const theme = resolveTheme(props.theme);
  const autoSize = props.autoSize;
  const fill = props.fill ?? false;
  const fixedWidth = props.width ?? 640;
  const fixedHeight = props.height ?? 400;
  const showRowNumbers = props.showRowNumbers ?? true;
  const sortable = props.sortable ?? true;
  const showSortIcons = props.showSortIcons ?? true;
  const filterable = props.filterable ?? true;
  const showFilterIcons = props.showFilterIcons ?? true;
  const editSelection = props.editSelection ?? 'all';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const customContainerRef = useRef<HTMLDivElement | null>(null);
  const activeCustomRef = useRef<{ commitOnOutsideClick: boolean } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const draggingRef = useRef(false);
  const fillDraggingRef = useRef(false);
  const fillTargetRef = useRef<{ row: number; col: number } | null>(null);
  const resizeRef = useRef<{
    target: ResizeTarget;
    start: number;
    startSize: number;
    physicalIndex: number;
  } | null>(null);

  const [scroll, setScroll] = useState<ScrollOffset>({ left: 0, top: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [filterPanel, setFilterPanel] = useState<{ col: number; x: number; y: number } | null>(null);
  const [filterChecked, setFilterChecked] = useState<Set<string>>(new Set());
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const [, force] = useReducer((n: number) => n + 1, 0);

  const headerModelRef = useRef<HeaderModel | null>(null);
  if (columns !== undefined && headerModelRef.current === null) {
    headerModelRef.current = new HeaderModel(columns);
  }
  const layout = headerModelRef.current?.getLayout() ?? null;

  // Multi-line header labels ("\n" in headerName) expand their header row by
  // headerLineHeight per extra line; single-line layouts keep the base band.
  const headerLineHeight = theme.headerLineHeight ?? DEFAULT_HEADER_LINE_HEIGHT;
  const headerPaddingY = theme.headerPaddingY ?? DEFAULT_HEADER_PADDING_Y;
  const headerHeights = computeHeaderRowHeights(layout, {
    baseHeight: controller.getBaseHeaderHeight(),
    lineHeight: headerLineHeight,
    paddingY: headerPaddingY,
  });
  const geom = {
    ...effectiveGeometry(controller.geometry(), showRowNumbers),
    colHeaderHeight: headerHeights.total,
  };

  // Keep the controller's effective header height in sync so external strip
  // UIs can align via controller.getHeaderHeight(). No-op when unchanged.
  useEffect(() => {
    controller.setHeaderHeight(headerHeights.total);
  }, [controller, headerHeights.total]);
  const contentWidth = geom.rowHeaderWidth + geom.colSizes.getTotalSize();
  const contentHeight = geom.colHeaderHeight + geom.rowSizes.getTotalSize();
  // Sizing priority: autoSize='content' ignores width/height/fill, then fill,
  // then fixed width/height. Clamped auto-size keeps normal scrolling active.
  const width =
    autoSize === 'content'
      ? clampAutoSize(contentWidth, props.maxWidth)
      : fill && measured !== null
        ? measured.w
        : fixedWidth;
  const height =
    autoSize === 'content'
      ? clampAutoSize(contentHeight, props.maxHeight)
      : fill && measured !== null
        ? measured.h
        : fixedHeight;

  const getVisibleCellRect = useCallback(
    (row: number, col: number): { x: number; y: number; width: number; height: number } | null => {
      if (row < 0 || col < 0 || row >= controller.getRowCount() || col >= controller.getColCount()) {
        return null;
      }
      const rect = cellRect(geom, scroll.left, scroll.top, row, col);
      return rectIsVisibleInGrid(rect, geom, width, height) ? rect : null;
    },
    [controller, geom, height, scroll.left, scroll.top, width],
  );

  // Measure the container when filling, so the canvas matches its parent.
  useEffect(() => {
    const el = rootRef.current;
    /* v8 ignore next 3 -- ResizeObserver is present in browsers; absent only in some envs */
    if (autoSize === 'content' || !fill || el === null || typeof ResizeObserver === 'undefined') {
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr !== undefined) {
        setMeasured({ w: Math.max(0, Math.floor(cr.width)), h: Math.max(0, Math.floor(cr.height)) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoSize, fill]);

  useEffect(() => {
    if (rows === undefined || columns === undefined) {
      return;
    }
    const fields = leafColumnDefs(columns).map((def) => def.field ?? '');
    controller.setRecords(rows, fields);
  }, [columns, controller, rows]);

  useEffect(() => {
    if (columns === undefined) {
      headerModelRef.current = null;
      force();
      return;
    }
    headerModelRef.current?.setColumns(columns);
    controller.applyColumnDefs(leafColumnDefs(columns));
    force();
  }, [columns, controller]);

  useEffect(() => {
    const offChange = controller.on('change', () => force());
    const offEdit = controller.on('edit', (e) => setEdit(e));
    return () => {
      offChange();
      offEdit();
    };
  }, [controller]);

  useEffect(() => {
    if (onViewStateChange === undefined) {
      return;
    }
    return controller.on('viewstate', onViewStateChange);
  }, [controller, onViewStateChange]);

  useEffect(() => {
    if (onCellCommit === undefined) {
      return;
    }
    return controller.on('cellcommit', onCellCommit);
  }, [controller, onCellCommit]);

  // Focus the editor when an edit begins. `<select>` has no select() method.
  useEffect(() => {
    const el = editorRef.current;
    if (edit !== null && el !== null) {
      el.focus();
      if (editSelection === 'all' && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
        el.select();
      } else if (
        editSelection === 'end' &&
        // Date inputs don't support the selection API (throws in Chrome).
        (el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === 'text'))
      ) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }
  }, [edit, editSelection]);

  useEffect(() => {
    onScrollChange?.(scroll);
  }, [scroll, onScrollChange]);

  useEffect(() => {
    if (cellOverlay === null || cellOverlay === undefined || onCellOverlayClose === undefined) {
      return;
    }
    return controller.on('change', () => {
      const { active } = controller.selection.getState();
      if (active.row !== cellOverlay.row || active.col !== cellOverlay.col) {
        onCellOverlayClose();
      }
    });
  }, [cellOverlay, controller, onCellOverlayClose]);

  useImperativeHandle(
    ref,
    () => ({
      getCellClientRect(row, col) {
        const root = rootRef.current;
        /* v8 ignore next 3 -- the imperative handle is only observable after the root ref is attached */
        if (root === null) {
          return null;
        }
        const rect = getVisibleCellRect(row, col);
        if (rect === null) {
          return null;
        }
        const rootRect = root.getBoundingClientRect();
        return new DOMRect(rootRect.left + rect.x, rootRect.top + rect.y, rect.width, rect.height);
      },
      focus() {
        rootRef.current?.focus();
      },
      scrollCellIntoView(row, col) {
        if (row < 0 || col < 0 || row >= controller.getRowCount() || col >= controller.getColCount()) {
          return;
        }
        setScroll((prev) => scrollToCell(geom, prev, width, height, row, col));
      },
    }),
    [controller, geom, getVisibleCellRect, height, width],
  );

  // Paint on every render (cheap: only visible cells).
  useEffect(() => {
    const canvas = canvasRef.current;
    /* v8 ignore next 3 -- canvas ref is always attached after mount */
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d') as Canvas2D | null;
    /* v8 ignore next 3 -- a 2D context is always available in supported envs */
    if (ctx === null) {
      return;
    }
    /* v8 ignore next -- device pixel ratio is environment-dependent glue */
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const getBaseStyle =
      theme.readOnlyCellBackground === undefined && theme.editableCellBackground === undefined
        ? undefined
        : (r: number, c: number) => {
            const editable = controller.isCellEditable(r, c);
            const background = editable ? theme.editableCellBackground : theme.readOnlyCellBackground;
            return background === undefined ? null : { background };
          };
    // Wrap wiring is only assembled when a wrap column exists — otherwise the
    // scene builder sees no wrap accessor and pays zero extra cost per cell.
    const wrapEnabled = controller.hasWrapColumns();
    const scene = buildScene({
      geom,
      scrollLeft: scroll.left,
      scrollTop: scroll.top,
      clientWidth: width,
      clientHeight: height,
      selection: controller.selection,
      getDisplay: (r, c) => controller.getDisplay(r, c),
      getType: (_r, c) => controller.getColumnType(c),
      getAlign: (_r, c) => controller.getColumnAlign(c),
      getValue: (r, c) => controller.getValue(r, c),
      getBaseStyle,
      getCfStyle: (r, c) => controller.getCellStyle(r, c),
      getVisual: (r, c) => controller.getCellVisual(r, c),
      getSparkline: (r, c, w, h) => controller.getCellSparkline(r, c, w, h),
      getMerge: (r, c) => controller.getMerge(r, c),
      getWrap: wrapEnabled ? (_r, c) => controller.getColumnWrap(c) : undefined,
      measureText: wrapEnabled ? canvasMeasurer(ctx) : undefined,
      font: `${theme.fontSize}px ${theme.fontFamily}`,
      wrapPaddingX: theme.cellPaddingX,
    });
    paintScene(ctx, scene, theme, { width, height, dpr });
  });

  const ensureVisible = useCallback(() => {
    const { active } = controller.selection.getState();
    setScroll((prev) =>
      scrollToCell(geom, prev, width, height, active.row, active.col),
    );
  }, [controller, geom, width, height]);

  const dispatchKey = useCallback(
    (input: KeyInput): boolean => {
      const action = interpretKey(input, controller.getEdit() !== null);
      switch (action.type) {
        case 'move':
          if (action.extend) {
            controller.selection.extend(action.dRow, action.dCol);
          } else {
            controller.selection.move(action.dRow, action.dCol);
          }
          ensureVisible();
          return true;
        case 'edit': {
          const { active } = controller.selection.getState();
          controller.beginEdit(active.row, active.col, action.initial);
          return true;
        }
        case 'commit':
          controller.commitEdit();
          controller.selection.move(action.dRow, action.dCol);
          ensureVisible();
          return true;
        case 'cancel':
          controller.cancelEdit();
          return true;
        case 'delete':
          controller.deleteSelection();
          return true;
        case 'undo':
          controller.undoLast();
          return true;
        case 'redo':
          controller.redoLast();
          return true;
        case 'copy':
          void writeClipboard(controller.copySelection());
          return true;
        case 'paste':
          void readClipboardInto(controller);
          return true;
        case 'none':
          return false;
      }
    },
    [controller, ensureVisible],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (composingRef.current) {
        return;
      }
      if (e.key === 'Escape' && cellOverlay !== null && cellOverlay !== undefined && renderCellOverlay !== undefined) {
        onCellOverlayClose?.();
        e.preventDefault();
        return;
      }
      const handled = dispatchKey({
        key: e.key,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });
      if (handled) {
        e.preventDefault();
      }
    },
    [cellOverlay, dispatchKey, onCellOverlayClose, renderCellOverlay],
  );

  /**
   * The data's edge in view coordinates. Pointer interactions and the header
   * chrome stop here rather than at the canvas edge, so the area past the last
   * column/row reads as empty space instead of a phantom column/row.
   */
  const contentEdge = useCallback((): { right: number; bottom: number } => {
    const g = geom;
    return {
      right: g.rowHeaderWidth + g.colSizes.getTotalSize() - scroll.left,
      bottom: g.colHeaderHeight + g.rowSizes.getTotalSize() - scroll.top,
    };
  }, [geom, scroll]);

  const onMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      /* v8 ignore next 3 -- root ref is always attached when handlers fire */
      if (root === null) {
        return;
      }
      // A custom editor that opted in commits its draft on any mouse-down
      // outside its container (inside clicks stop propagation and never reach
      // this handler). Without the option, the factory owns the lifecycle.
      const activeCustom = activeCustomRef.current;
      if (activeCustom !== null && activeCustom.commitOnOutsideClick) {
        controller.commitEdit();
      }
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // A drag starting on a header border resizes that column/row instead of selecting.
      const border = hitResizeHandle(geom, scroll.left, scroll.top, x, y);
      if (border !== null) {
        const startSize =
          border.type === 'col'
            ? controller.getColumnWidth(border.index)
            : controller.getRowHeight(border.index);
        const physicalIndex =
          border.type === 'col'
            ? controller.getPhysicalCol(border.index)
            : controller.getPhysicalRow(border.index);
        resizeRef.current = { target: border, start: border.type === 'col' ? x : y, startSize, physicalIndex };
        root.focus();
        return;
      }
      // Clicks past the last column/row hit nothing — keep focus, keep selection.
      const edge = contentEdge();
      if (x >= edge.right || y >= edge.bottom) {
        root.focus();
        return;
      }
      const hit = hitTest(geom, scroll.left, scroll.top, x, y);
      switch (hit.region) {
        case 'cell':
          if (e.shiftKey) {
            controller.selection.extendTo({ row: hit.row, col: hit.col });
          } else {
            controller.selection.setActive({ row: hit.row, col: hit.col });
          }
          onCellClick?.({ row: hit.row, col: hit.col }, e);
          // Begin a drag-select from this cell.
          draggingRef.current = true;
          break;
        case 'colHeader':
          controller.selection.selectColumn(hit.col);
          break;
        case 'rowHeader':
          controller.selection.selectRow(hit.row);
          break;
        case 'corner':
          controller.selection.selectAll();
          break;
      }
      rootRef.current?.focus();
    },
    [controller, geom, scroll, contentEdge, onCellClick],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      /* v8 ignore next 3 -- root ref is always attached during a drag */
      if (root === null) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (fillDraggingRef.current) {
        const hit = hitTest(geom, scroll.left, scroll.top, x, y);
        if (hit.region === 'cell') {
          fillTargetRef.current = { row: hit.row, col: hit.col };
        }
        return;
      }

      const resizing = resizeRef.current;
      if (resizing !== null) {
        const delta = (resizing.target.type === 'col' ? x : y) - resizing.start;
        const next = Math.max(8, resizing.startSize + delta);
        if (resizing.target.type === 'col') {
          controller.resizeCol(resizing.target.index, next);
        } else {
          controller.resizeRow(resizing.target.index, next);
        }
        return;
      }

      if (draggingRef.current) {
        const hit = hitTest(geom, scroll.left, scroll.top, x, y);
        if (hit.region === 'cell') {
          controller.selection.extendTo({ row: hit.row, col: hit.col });
        }
        return;
      }

      // Idle hover: show a resize cursor when over a header border.
      const border = hitResizeHandle(geom, scroll.left, scroll.top, x, y);
      root.style.cursor = border === null ? '' : border.type === 'col' ? 'col-resize' : 'row-resize';
    },
    [controller, geom, scroll],
  );

  const onMouseUp = useCallback(() => {
    const resizing = resizeRef.current;
    if (fillDraggingRef.current && fillTargetRef.current !== null) {
      controller.fillTo(fillTargetRef.current.row, fillTargetRef.current.col);
    }
    if (resizing !== null && resizing.target.type === 'col') {
      const width = controller.getColumnWidth(resizing.target.index);
      if (width !== resizing.startSize) {
        onColumnResize?.({
          col: resizing.target.index,
          physicalCol: resizing.physicalIndex,
          width,
        });
      }
    }
    fillDraggingRef.current = false;
    fillTargetRef.current = null;
    draggingRef.current = false;
    resizeRef.current = null;
  }, [controller, onColumnResize]);

  const openFilterPanel = useCallback(
    (col: number, x: number, y: number): void => {
      const facets = controller.columnFacets(col);
      setFilterChecked(new Set(facets.map((f) => f.label)));
      setFilterPanel({ col, x, y });
    },
    [controller],
  );

  const defaultMenu = useCallback(
    (hit: HitResult): MenuItemSpec[] => {
      const items: MenuItemSpec[] = [
        { id: 'copy', label: 'Copy', action: () => void writeClipboard(controller.copySelection()) },
        { id: 'paste', label: 'Paste', action: () => void readClipboardInto(controller) },
        { id: 'clear', label: 'Clear contents', action: () => controller.deleteSelection() },
        { id: 'sep1', separator: true },
        { id: 'undo', label: 'Undo', disabled: !controller.undo.canUndo(), action: () => controller.undoLast() },
        { id: 'redo', label: 'Redo', disabled: !controller.undo.canRedo(), action: () => controller.redoLast() },
      ];
      // Column-header actions: hide the clicked column / reveal all.
      if (hit.region === 'colHeader' && hit.col >= 0) {
        const col = hit.col;
        const colX = columnX(geom, scroll.left, col);
        items.push({ id: 'sep2', separator: true });
        if (filterable && !showFilterIcons) {
          items.push({
            id: 'filter-col',
            label: 'Filter…',
            action: () => openFilterPanel(col, colX - geom.rowHeaderWidth, geom.colHeaderHeight),
          });
        }
        items.push(
          { id: 'hide-col', label: 'Hide column', action: () => controller.hideColumn(col) },
          { id: 'show-all-cols', label: 'Show all columns', action: () => controller.showAllColumns() },
        );
      }
      return items;
    },
    [controller, filterable, geom, openFilterPanel, scroll.left, showFilterIcons],
  );

  const onContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      const root = rootRef.current;
      /* v8 ignore next 3 -- root ref is always attached when handlers fire */
      if (root === null) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // No menu for the empty space past the last column/row.
      const edge = contentEdge();
      if (x >= edge.right || y >= edge.bottom) {
        return;
      }
      const hit = hitTest(geom, scroll.left, scroll.top, x, y);
      const items = buildMenu(props.contextMenu ? props.contextMenu(hit) : defaultMenu(hit));
      setMenu({ x, y, items });
    },
    [controller, geom, scroll, props, defaultMenu, contentEdge],
  );

  const runMenuItem = useCallback((item: MenuItem) => {
    if (item.disabled === true || item.action === undefined) {
      return;
    }
    item.action();
    setMenu(null);
  }, []);

  const onDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      /* v8 ignore next 3 -- root ref is always attached when handlers fire */
      if (root === null) {
        return;
      }
      // Ignore double-clicks past the last column/row (the mousedown was ignored
      // there too, so editing would target an unrelated cell).
      const rect = root.getBoundingClientRect();
      const edge = contentEdge();
      if (e.clientX - rect.left >= edge.right || e.clientY - rect.top >= edge.bottom) {
        return;
      }
      const { active } = controller.selection.getState();
      controller.beginEdit(active.row, active.col);
    },
    [controller, contentEdge],
  );

  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      setScroll((prev) =>
        clampScroll(
          geom,
          { left: prev.left + e.deltaX, top: prev.top + e.deltaY },
          width,
          height,
        ),
      );
    },
    [geom, width, height],
  );

  const scene = buildScene({
    geom,
    scrollLeft: scroll.left,
    scrollTop: scroll.top,
    clientWidth: width,
    clientHeight: height,
    selection: controller.selection,
    getDisplay: (r, c) => controller.getDisplay(r, c),
    getType: (_r, c) => controller.getColumnType(c),
    getAlign: (_r, c) => controller.getColumnAlign(c),
    getValue: (r, c) => controller.getValue(r, c),
    getBaseStyle:
      theme.readOnlyCellBackground === undefined && theme.editableCellBackground === undefined
        ? undefined
        : (r, c) => {
            const editable = controller.isCellEditable(r, c);
            const background = editable ? theme.editableCellBackground : theme.readOnlyCellBackground;
            return background === undefined ? null : { background };
          },
    getCfStyle: (r, c) => controller.getCellStyle(r, c),
    getMerge: (r, c) => controller.getMerge(r, c),
  });
  const colHeaders = columnHeaderCells(
    geom,
    scroll.left,
    scene.visibleCols,
    layout,
    (leaf) => controller.view.cols.getVisualIndex(leaf),
    headerHeights.rows,
  );
  const rowHeaders = rowHeaderCells(geom, scroll.top, scene.visibleRows);

  // Frozen header cells paint last (and opaque) so scrolled headers slide
  // beneath them instead of overlapping their text — the DOM mirror of the
  // canvas painter's two-pass frozen-over-scrolled order.
  const orderedColHeaders = [
    ...colHeaders.filter((h) => !(h.col !== undefined && h.col < geom.frozenCols)),
    ...colHeaders.filter((h) => h.col !== undefined && h.col < geom.frozenCols),
  ];
  const orderedRowHeaders = [
    ...rowHeaders.filter((h) => h.row >= geom.frozenRows),
    ...rowHeaders.filter((h) => h.row < geom.frozenRows),
  ];

  // The header band and the row gutter stop at the data's edge (not the canvas
  // edge) so a grid wider/taller than its content shows plain background — not
  // a phantom header strip or gutter — past the last column/row.
  const headerBandWidth = Math.max(
    0,
    Math.min(width, geom.rowHeaderWidth + geom.colSizes.getTotalSize() - scroll.left) -
      geom.rowHeaderWidth,
  );
  const gutterHeight = Math.max(
    0,
    Math.min(height, geom.colHeaderHeight + geom.rowSizes.getTotalSize() - scroll.top) -
      geom.colHeaderHeight,
  );

  const editRect =
    edit !== null ? cellRect(geom, scroll.left, scroll.top, edit.row, edit.col) : null;

  // Resolve a custom editor for the edited column: the column must name an
  // editor kind and the registry must have it. Otherwise the built-in editors
  // below render as usual (unknown kinds fall back to the plain text editor).
  const customEditorKind = edit !== null ? controller.getColumnEditor(edit.col) : undefined;
  const customEntry =
    customEditorKind !== undefined && editors !== undefined
      ? (editors.resolve(customEditorKind) ?? null)
      : null;

  // Mount the custom editor factory into its host container for one edit
  // session. Commit/cancel run through the controller so custom editors join
  // the normal pipeline (sanitization, validation, undo, cellcommit 'edit').
  // `editRect` is intentionally not a dependency: it is a fresh object every
  // render and only the mount-time rectangle is handed to the factory.
  useEffect(() => {
    if (customEntry === null) {
      return;
    }
    const container = customContainerRef.current;
    /* v8 ignore next 3 -- an active custom entry implies a live edit, its rect, and an attached container */
    if (edit === null || editRect === null || container === null) {
      return;
    }
    const instance = customEntry.factory({
      value: edit.draft,
      rect: editRect,
      container,
      row: edit.row,
      col: edit.col,
      commit: (next) => {
        controller.updateDraft(next);
        controller.commitEdit();
        rootRef.current?.focus();
      },
      cancel: () => {
        controller.cancelEdit();
        rootRef.current?.focus();
      },
    });
    activeCustomRef.current = { commitOnOutsideClick: customEntry.commitOnOutsideClick };
    instance.focus?.();
    return () => {
      activeCustomRef.current = null;
      instance.destroy?.();
      container.replaceChildren();
    };
  }, [controller, customEntry, edit]);
  const overlayRect =
    cellOverlay !== null && cellOverlay !== undefined && renderCellOverlay !== undefined
      ? getVisibleCellRect(cellOverlay.row, cellOverlay.col)
      : null;

  // Fill handle nub at the bottom-right corner of the selection (hidden while editing).
  const selBounds = controller.selection.getSelectionBounds();
  const fillNubRect =
    edit === null
      ? cellRect(geom, scroll.left, scroll.top, selBounds.end.row, selBounds.end.col)
      : null;

  /**
   * Render the active-cell editor. The DOM widget varies by the column's editor
   * kind: a `<select>` for dropdowns, a date input, an autocomplete input backed
   * by a `<datalist>`, or the default IME-aware textarea.
   */
  const renderEditor = (e: EditState, rect: { x: number; y: number; width: number; height: number }) => {
    const kind = controller.getEditorKind(e.col);
    const options = controller.getColumnOptions(e.col) ?? [];
    const baseStyle: CSSProperties = {
      position: 'absolute',
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      margin: 0,
      border: `2px solid ${theme.activeBorder}`,
      boxSizing: 'border-box',
      font: `${theme.fontSize}px ${theme.fontFamily}`,
      padding: `0 ${theme.cellPaddingX}px`,
      outline: 'none',
      background: '#fff',
    };
    const change = (value: string): void => {
      controller.updateDraft(value);
      setEdit(controller.getEdit());
    };
    const keyDown = (key: string, shiftKey = false): boolean => {
      const handled = dispatchKey({ key, shiftKey, ctrlKey: false, metaKey: false, altKey: false });
      if (handled) {
        rootRef.current?.focus();
      }
      return handled;
    };

    if (kind === 'dropdown') {
      return (
        <select
          ref={(el) => { editorRef.current = el; }}
          data-testid="lattica-editor-select"
          value={e.draft}
          onChange={(ev) => {
            controller.updateDraft(ev.target.value);
            controller.commitEdit();
          }}
          onKeyDown={(ev) => {
            if (keyDown(ev.key, ev.shiftKey)) ev.preventDefault();
          }}
          onBlur={() => controller.commitEdit()}
          style={baseStyle}
        >
          <option value="" />
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    }

    if (kind === 'date') {
      return (
        <input
          ref={(el) => { editorRef.current = el; }}
          type="date"
          data-testid="lattica-editor-date"
          value={e.draft}
          onChange={(ev) => change(ev.target.value)}
          onKeyDown={(ev) => {
            if (keyDown(ev.key, ev.shiftKey)) ev.preventDefault();
          }}
          onBlur={() => controller.commitEdit()}
          style={baseStyle}
        />
      );
    }

    if (kind === 'autocomplete') {
      const listId = 'lattica-editor-options';
      return (
        <>
          <input
            ref={(el) => { editorRef.current = el; }}
            list={listId}
            data-testid="lattica-editor-autocomplete"
            value={e.draft}
            onChange={(ev) => change(ev.target.value)}
            onKeyDown={(ev) => {
              if (composingRef.current) return;
              if (keyDown(ev.key, ev.shiftKey)) ev.preventDefault();
            }}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            onBlur={() => controller.commitEdit()}
            style={baseStyle}
          />
          <datalist id={listId} data-testid="lattica-editor-datalist">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }

    // Default: IME-aware textarea (text / number / checkbox columns).
    return (
      <textarea
        ref={(el) => { editorRef.current = el; }}
        data-testid="lattica-editor"
        value={e.draft}
        onChange={(ev) => change(ev.target.value)}
        onCompositionStart={() => {
          composingRef.current = true;
        }}
        onCompositionEnd={() => {
          composingRef.current = false;
        }}
        onKeyDown={(ev) => {
          if (composingRef.current) {
            return;
          }
          const handled = dispatchKey({
            key: ev.key,
            shiftKey: ev.shiftKey,
            ctrlKey: ev.ctrlKey,
            metaKey: ev.metaKey,
            altKey: ev.altKey,
          });
          if (handled) {
            ev.preventDefault();
            rootRef.current?.focus();
          }
        }}
        onBlur={() => controller.commitEdit()}
        style={{ ...baseStyle, resize: 'none' }}
      />
    );
  };

  return (
    <div
      ref={rootRef}
      role="grid"
      aria-rowcount={controller.getRowCount()}
      aria-colcount={controller.getColCount()}
      tabIndex={0}
      data-testid="lattica-grid"
      className={props.className}
      style={{
        position: 'relative',
        width: autoSize !== 'content' && fill ? '100%' : width,
        height: autoSize !== 'content' && fill ? '100%' : height,
        overflow: 'hidden',
        outline: 'none',
        background: theme.background,
        userSelect: 'none',
        ...props.style,
      }}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />

      {/* Column header band (DOM, multi-level). Ends at the last column. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: geom.rowHeaderWidth,
          width: headerBandWidth,
          height: geom.colHeaderHeight,
          overflow: 'hidden',
          background: theme.headerBackground,
          borderBottom: `1px solid ${theme.headerGridLineColor}`,
        }}
      >
        {orderedColHeaders.map((h) => (
          <div
            key={h.id}
            role="columnheader"
            onClick={
              h.collapsible
                ? () => {
                    headerModelRef.current?.toggle(h.id);
                    force();
                  }
                : sortable && !showSortIcons && h.col !== undefined
                  ? (e) => {
                      controller.toggleSort(h.col!, e.shiftKey);
                      force();
                    }
                : undefined
            }
            style={{
              position: 'absolute',
              left: h.x - geom.rowHeaderWidth,
              top: h.y,
              width: h.width,
              height: h.height,
              boxSizing: 'border-box',
              background: theme.headerBackground,
              borderRight: `1px solid ${theme.headerGridLineColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: h.isGroup ? 'center' : 'flex-start',
              paddingLeft: h.isGroup ? 0 : theme.cellPaddingX,
              paddingTop: headerPaddingY,
              paddingBottom: headerPaddingY,
              whiteSpace: 'pre-line',
              lineHeight: `${headerLineHeight}px`,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
              color: theme.headerTextColor,
              cursor: h.collapsible || (sortable && !showSortIcons && h.col !== undefined) ? 'pointer' : 'default',
            }}
          >
            {h.collapsible ? (h.collapsed ? '▸ ' : '▾ ') : ''}
            {h.label}
            {!h.isGroup && h.col !== undefined && (
              <>
                {filterable && showFilterIcons && (
                  <span
                    role="button"
                    aria-label={`filter column ${h.col}`}
                    data-testid={`lattica-filter-${h.col}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openFilterPanel(h.col!, h.x - geom.rowHeaderWidth, geom.colHeaderHeight);
                    }}
                    style={{ marginLeft: 'auto', paddingRight: 2, cursor: 'pointer', userSelect: 'none' }}
                  >
                    ▽
                  </span>
                )}
                {sortable && showSortIcons && (
                  <span
                    role="button"
                    aria-label={`sort column ${h.col}`}
                    data-testid={`lattica-sort-${h.col}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      controller.toggleSort(h.col!, e.shiftKey);
                      force();
                    }}
                    style={{ paddingRight: 4, cursor: 'pointer', userSelect: 'none' }}
                  >
                    {controller.getSortDirection(h.col) === 'asc'
                      ? '▲'
                      : controller.getSortDirection(h.col) === 'desc'
                        ? '▼'
                        : '⇅'}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Row-number gutter (DOM). Ends at the last row. */}
      {showRowNumbers && (
        <div
          style={{
            position: 'absolute',
            top: geom.colHeaderHeight,
            left: 0,
            width: geom.rowHeaderWidth,
            height: gutterHeight,
            overflow: 'hidden',
            background: theme.headerBackground,
            borderRight: `1px solid ${theme.headerGridLineColor}`,
          }}
        >
          {orderedRowHeaders.map((h) => (
            <div
              key={h.row}
              role="rowheader"
              style={{
                position: 'absolute',
                top: h.y - geom.colHeaderHeight,
                left: 0,
                width: geom.rowHeaderWidth,
                height: h.height,
                boxSizing: 'border-box',
                background: theme.headerBackground,
                borderBottom: `1px solid ${theme.headerGridLineColor}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: theme.fontFamily,
                fontSize: theme.fontSize,
                color: theme.headerTextColor,
              }}
            >
              {controller.isRowParent(h.row) && (
                <span
                  role="button"
                  aria-label={`toggle row group ${h.row}`}
                  data-testid={`lattica-rowgroup-${h.row}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    controller.toggleRowGroup(h.row);
                    force();
                  }}
                  style={{
                    marginLeft: 2 + controller.getRowDepth(h.row) * 8,
                    marginRight: 2,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {controller.isRowCollapsed(h.row) ? '▸' : '▾'}
                </span>
              )}
              {h.label}
            </div>
          ))}
        </div>
      )}

      {/* Top-left corner. */}
      {showRowNumbers && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: geom.rowHeaderWidth,
            height: geom.colHeaderHeight,
            background: theme.headerBackground,
            borderRight: `1px solid ${theme.headerGridLineColor}`,
            borderBottom: `1px solid ${theme.headerGridLineColor}`,
          }}
        />
      )}

      {/* Master/detail panels for expanded, visible rows. */}
      {props.renderDetail !== undefined &&
        scene.visibleRows
          .filter((row) => controller.isDetailExpanded(row))
          .map((row) => {
            // Only the row's y/height matter here, so column 0 is sufficient.
            const rect = cellRect(geom, scroll.left, scroll.top, row, 0);
            const dh = controller.getDetailHeight();
            const top = rect.y + rect.height - dh;
            return (
              <div
                key={`detail-${row}`}
                data-testid={`lattica-detail-${controller.getPhysicalRow(row)}`}
                style={{
                  position: 'absolute',
                  left: geom.rowHeaderWidth,
                  top,
                  width: width - geom.rowHeaderWidth,
                  height: dh,
                  boxSizing: 'border-box',
                  background: theme.background,
                  borderTop: `1px solid ${theme.headerGridLineColor}`,
                  overflow: 'auto',
                }}
              >
                {props.renderDetail!(controller.getPhysicalRow(row))}
              </div>
            );
          })}

      {/* Active-cell editor overlay (kind depends on the column's cell type).
          A registered custom editor mounts into a host container instead;
          key events inside it stay with the factory (no grid Enter/Escape). */}
      {edit !== null &&
        editRect !== null &&
        (customEntry !== null ? (
          <div
            ref={customContainerRef}
            data-testid="lattica-editor-custom"
            onKeyDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: editRect.x,
              top: editRect.y,
              width: editRect.width,
              height: editRect.height,
              boxSizing: 'border-box',
              zIndex: 6,
            }}
          />
        ) : (
          renderEditor(edit, editRect)
        ))}

      {/* Controlled cell overlay, anchored to the target cell's bottom-left. */}
      {cellOverlay !== null && cellOverlay !== undefined && renderCellOverlay !== undefined && overlayRect !== null && (
        <div
          data-testid="lattica-cell-overlay"
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          style={{
            position: 'absolute',
            left: overlayRect.x,
            top: overlayRect.y + overlayRect.height,
            zIndex: 6,
          }}
        >
          {renderCellOverlay({
            row: cellOverlay.row,
            col: cellOverlay.col,
            rect: {
              left: overlayRect.x,
              top: overlayRect.y,
              width: overlayRect.width,
              height: overlayRect.height,
            },
            close: () => onCellOverlayClose?.(),
          })}
        </div>
      )}

      {/* Fill handle nub at the selection's bottom-right corner. */}
      {fillNubRect !== null && (
        <div
          data-testid="lattica-fill-handle"
          onMouseDown={(e) => {
            e.stopPropagation();
            fillDraggingRef.current = true;
            fillTargetRef.current = null;
          }}
          style={{
            position: 'absolute',
            left: fillNubRect.x + fillNubRect.width - 4,
            top: fillNubRect.y + fillNubRect.height - 4,
            width: 7,
            height: 7,
            background: theme.activeBorder,
            border: '1px solid #fff',
            boxSizing: 'border-box',
            cursor: 'crosshair',
            zIndex: 5,
          }}
        />
      )}

      {/* Context menu overlay. */}
      {menu !== null && (
        <>
          <div
            data-testid="lattica-menu-backdrop"
            onMouseDown={() => setMenu(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div
            role="menu"
            data-testid="lattica-menu"
            style={{
              position: 'absolute',
              left: menu.x,
              top: menu.y,
              zIndex: 11,
              minWidth: 160,
              background: '#fff',
              border: `1px solid ${theme.headerGridLineColor}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              padding: '4px 0',
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
            }}
          >
            {menu.items.map((item) =>
              item.separator === true ? (
                <div
                  key={item.id}
                  style={{ height: 1, background: theme.headerGridLineColor, margin: '4px 0' }}
                />
              ) : (
                <div
                  key={item.id}
                  role="menuitem"
                  aria-disabled={item.disabled === true}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    runMenuItem(item);
                  }}
                  style={{
                    padding: '4px 12px',
                    cursor: item.disabled === true ? 'default' : 'pointer',
                    color: item.disabled === true ? theme.headerGridLineColor : theme.textColor,
                  }}
                >
                  {item.label}
                </div>
              ),
            )}
          </div>
        </>
      )}

      {/* Faceted (set) filter panel for a column. */}
      {filterPanel !== null && (
        <>
          <div
            data-testid="lattica-filter-backdrop"
            onMouseDown={() => setFilterPanel(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          />
          <div
            data-testid="lattica-filter-panel"
            style={{
              position: 'absolute',
              left: filterPanel.x,
              top: filterPanel.y,
              zIndex: 11,
              minWidth: 160,
              maxHeight: 240,
              overflow: 'auto',
              background: '#fff',
              border: `1px solid ${theme.headerGridLineColor}`,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              padding: 6,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
            }}
          >
            {controller.columnFacets(filterPanel.col).map((f) => (
              <label
                key={f.label}
                style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  data-testid={`lattica-filter-opt-${f.label}`}
                  checked={filterChecked.has(f.label)}
                  onChange={() => {
                    setFilterChecked((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.label)) {
                        next.delete(f.label);
                      } else {
                        next.add(f.label);
                      }
                      return next;
                    });
                  }}
                />
                {f.label === '' ? '(blank)' : f.label}
              </label>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                type="button"
                data-testid="lattica-filter-apply"
                onClick={() => {
                  const facets = controller.columnFacets(filterPanel.col);
                  if (filterChecked.size === facets.length) {
                    controller.setColumnSetFilter(filterPanel.col, []); // all → no filter
                  } else {
                    const values = facets.filter((f) => filterChecked.has(f.label)).map((f) => f.value);
                    controller.setColumnSetFilter(filterPanel.col, values);
                  }
                  setFilterPanel(null);
                }}
              >
                Apply
              </button>
              <button
                type="button"
                data-testid="lattica-filter-clear"
                onClick={() => {
                  controller.setColumnSetFilter(filterPanel.col, []);
                  setFilterPanel(null);
                }}
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export const LatticaGrid = LatticaGridImpl;

async function writeClipboard(matrix: string[][]): Promise<void> {
  /* v8 ignore next 8 -- exercised only with a real async Clipboard API */
  const text = matrix.map((row) => row.join('\t')).join('\n');
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  } catch {
    // Clipboard access denied; ignore.
  }
}

async function readClipboardInto(controller: GridController): Promise<void> {
  /* v8 ignore next 10 -- exercised only with a real async Clipboard API */
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      const matrix = text.split(/\r?\n/).map((line) => line.split('\t'));
      controller.paste(matrix);
    }
  } catch {
    // Clipboard access denied; ignore.
  }
}
