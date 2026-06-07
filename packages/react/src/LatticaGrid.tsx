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
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { HeaderModel, type ColumnNode } from '@lattica/core';
import type { GridController, EditState } from './controller.js';
import { resolveTheme, type GridTheme } from './theme.js';
import { buildScene } from './scene.js';
import { paintScene, type Canvas2D } from './painter.js';
import { cellRect, hitTest, type HitResult } from './geometry.js';
import { interpretKey, type KeyInput } from './keyboard.js';
import { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
import { columnHeaderCells, rowHeaderCells } from './headers.js';
import { buildMenu, type MenuItem, type MenuItemSpec } from './menu.js';
import { hitResizeHandle, type ResizeTarget } from './resize.js';

export interface LatticaGridProps {
  controller: GridController;
  /** Optional multi-level column definitions; defaults to A, B, C… letters. */
  columns?: readonly ColumnNode[];
  theme?: Partial<GridTheme>;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  /** Build the right-click context menu for a hit target; defaults to the built-in menu. */
  contextMenu?: (target: HitResult) => MenuItemSpec[];
}

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function LatticaGrid(props: LatticaGridProps): ReactElement {
  const { controller, columns, width = 640, height = 400 } = props;
  const theme = resolveTheme(props.theme);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const draggingRef = useRef(false);
  const fillDraggingRef = useRef(false);
  const fillTargetRef = useRef<{ row: number; col: number } | null>(null);
  const resizeRef = useRef<{ target: ResizeTarget; start: number; startSize: number } | null>(null);

  const [scroll, setScroll] = useState<ScrollOffset>({ left: 0, top: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [filterPanel, setFilterPanel] = useState<{ col: number; x: number; y: number } | null>(null);
  const [filterChecked, setFilterChecked] = useState<Set<string>>(new Set());
  const [, force] = useReducer((n: number) => n + 1, 0);

  const headerModelRef = useRef<HeaderModel | null>(null);
  if (columns !== undefined && headerModelRef.current === null) {
    headerModelRef.current = new HeaderModel(columns);
  }

  useEffect(() => {
    const offChange = controller.on('change', () => force());
    const offEdit = controller.on('edit', (e) => setEdit(e));
    return () => {
      offChange();
      offEdit();
    };
  }, [controller]);

  // Focus the editor when an edit begins. `<select>` has no select() method.
  useEffect(() => {
    const el = editorRef.current;
    if (edit !== null && el !== null) {
      el.focus();
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.select();
      }
    }
  }, [edit]);

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
    const scene = buildScene({
      geom: controller.geometry(),
      scrollLeft: scroll.left,
      scrollTop: scroll.top,
      clientWidth: width,
      clientHeight: height,
      selection: controller.selection,
      getDisplay: (r, c) => controller.getDisplay(r, c),
      getType: (_r, c) => controller.getColumnType(c),
      getAlign: (_r, c) => controller.getColumnAlign(c),
      getValue: (r, c) => controller.getValue(r, c),
      getCfStyle: (r, c) => controller.getCellStyle(r, c),
      getMerge: (r, c) => controller.getMerge(r, c),
    });
    paintScene(ctx, scene, theme, { width, height, dpr });
  });

  const ensureVisible = useCallback(() => {
    const { active } = controller.selection.getState();
    setScroll((prev) =>
      scrollToCell(controller.geometry(), prev, width, height, active.row, active.col),
    );
  }, [controller, width, height]);

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
    [dispatchKey],
  );

  const onMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      /* v8 ignore next 3 -- root ref is always attached when handlers fire */
      if (root === null) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // A drag starting on a header border resizes that column/row instead of selecting.
      const border = hitResizeHandle(controller.geometry(), scroll.left, scroll.top, x, y);
      if (border !== null) {
        const startSize =
          border.type === 'col'
            ? controller.colSizes.getSize(border.index)
            : controller.rowSizes.getSize(border.index);
        resizeRef.current = { target: border, start: border.type === 'col' ? x : y, startSize };
        root.focus();
        return;
      }
      const hit = hitTest(controller.geometry(), scroll.left, scroll.top, x, y);
      switch (hit.region) {
        case 'cell':
          if (e.shiftKey) {
            controller.selection.extendTo({ row: hit.row, col: hit.col });
          } else {
            controller.selection.setActive({ row: hit.row, col: hit.col });
          }
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
    [controller, scroll],
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
        const hit = hitTest(controller.geometry(), scroll.left, scroll.top, x, y);
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
        const hit = hitTest(controller.geometry(), scroll.left, scroll.top, x, y);
        if (hit.region === 'cell') {
          controller.selection.extendTo({ row: hit.row, col: hit.col });
        }
        return;
      }

      // Idle hover: show a resize cursor when over a header border.
      const border = hitResizeHandle(controller.geometry(), scroll.left, scroll.top, x, y);
      root.style.cursor = border === null ? '' : border.type === 'col' ? 'col-resize' : 'row-resize';
    },
    [controller, scroll],
  );

  const onMouseUp = useCallback(() => {
    if (fillDraggingRef.current && fillTargetRef.current !== null) {
      controller.fillTo(fillTargetRef.current.row, fillTargetRef.current.col);
    }
    fillDraggingRef.current = false;
    fillTargetRef.current = null;
    draggingRef.current = false;
    resizeRef.current = null;
  }, [controller]);

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
        items.push(
          { id: 'sep2', separator: true },
          { id: 'hide-col', label: 'Hide column', action: () => controller.hideColumn(col) },
          { id: 'show-all-cols', label: 'Show all columns', action: () => controller.showAllColumns() },
        );
      }
      return items;
    },
    [controller],
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
      const hit = hitTest(controller.geometry(), scroll.left, scroll.top, x, y);
      const items = buildMenu(props.contextMenu ? props.contextMenu(hit) : defaultMenu(hit));
      setMenu({ x, y, items });
    },
    [controller, scroll, props, defaultMenu],
  );

  const runMenuItem = useCallback((item: MenuItem) => {
    if (item.disabled === true || item.action === undefined) {
      return;
    }
    item.action();
    setMenu(null);
  }, []);

  const onDoubleClick = useCallback(() => {
    const { active } = controller.selection.getState();
    controller.beginEdit(active.row, active.col);
  }, [controller]);

  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      setScroll((prev) =>
        clampScroll(
          controller.geometry(),
          { left: prev.left + e.deltaX, top: prev.top + e.deltaY },
          width,
          height,
        ),
      );
    },
    [controller, width, height],
  );

  const layout = headerModelRef.current?.getLayout() ?? null;
  const geom = controller.geometry();
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
    getCfStyle: (r, c) => controller.getCellStyle(r, c),
      getMerge: (r, c) => controller.getMerge(r, c),
  });
  const colHeaders = columnHeaderCells(geom, scroll.left, scene.visibleCols, layout);
  const rowHeaders = rowHeaderCells(geom, scroll.top, scene.visibleRows);

  const editRect =
    edit !== null ? cellRect(geom, scroll.left, scroll.top, edit.row, edit.col) : null;

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
      setEdit({ ...e, draft: value });
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
        width,
        height,
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

      {/* Column header band (DOM, multi-level). */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: geom.rowHeaderWidth,
          right: 0,
          height: geom.colHeaderHeight,
          overflow: 'hidden',
          background: theme.headerBackground,
          borderBottom: `1px solid ${theme.headerGridLineColor}`,
        }}
      >
        {colHeaders.map((h) => (
          <div
            key={h.id}
            role="columnheader"
            onClick={
              h.collapsible
                ? () => {
                    headerModelRef.current?.toggle(h.id);
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
              borderRight: `1px solid ${theme.headerGridLineColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: h.isGroup ? 'center' : 'flex-start',
              paddingLeft: h.isGroup ? 0 : theme.cellPaddingX,
              fontFamily: theme.fontFamily,
              fontSize: theme.fontSize,
              color: theme.headerTextColor,
              cursor: h.collapsible ? 'pointer' : 'default',
            }}
          >
            {h.collapsible ? (h.collapsed ? '▸ ' : '▾ ') : ''}
            {h.label}
            {!h.isGroup && h.col !== undefined && (
              <>
                <span
                  role="button"
                  aria-label={`filter column ${h.col}`}
                  data-testid={`lattica-filter-${h.col}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const facets = controller.columnFacets(h.col!);
                    setFilterChecked(new Set(facets.map((f) => f.label)));
                    setFilterPanel({
                      col: h.col!,
                      x: h.x - geom.rowHeaderWidth,
                      y: geom.colHeaderHeight,
                    });
                  }}
                  style={{ marginLeft: 'auto', paddingRight: 2, cursor: 'pointer', userSelect: 'none' }}
                >
                  ▽
                </span>
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
              </>
            )}
          </div>
        ))}
      </div>

      {/* Row-number gutter (DOM). */}
      <div
        style={{
          position: 'absolute',
          top: geom.colHeaderHeight,
          left: 0,
          width: geom.rowHeaderWidth,
          bottom: 0,
          overflow: 'hidden',
          background: theme.headerBackground,
          borderRight: `1px solid ${theme.headerGridLineColor}`,
        }}
      >
        {rowHeaders.map((h) => (
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

      {/* Top-left corner. */}
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

      {/* Active-cell editor overlay (kind depends on the column's cell type). */}
      {edit !== null && editRect !== null && renderEditor(edit, editRect)}

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
}

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
