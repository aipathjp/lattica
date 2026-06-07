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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const draggingRef = useRef(false);
  const fillDraggingRef = useRef(false);
  const fillTargetRef = useRef<{ row: number; col: number } | null>(null);
  const resizeRef = useRef<{ target: ResizeTarget; start: number; startSize: number } | null>(null);

  const [scroll, setScroll] = useState<ScrollOffset>({ left: 0, top: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
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

  // Focus the editor when an edit begins.
  useEffect(() => {
    if (edit !== null && editorRef.current !== null) {
      editorRef.current.focus();
      editorRef.current.select();
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
    (): MenuItemSpec[] => [
      { id: 'copy', label: 'Copy', action: () => void writeClipboard(controller.copySelection()) },
      { id: 'paste', label: 'Paste', action: () => void readClipboardInto(controller) },
      { id: 'clear', label: 'Clear contents', action: () => controller.deleteSelection() },
      { id: 'sep1', separator: true },
      { id: 'undo', label: 'Undo', disabled: !controller.undo.canUndo(), action: () => controller.undoLast() },
      { id: 'redo', label: 'Redo', disabled: !controller.undo.canRedo(), action: () => controller.redoLast() },
    ],
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
      const items = buildMenu(props.contextMenu ? props.contextMenu(hit) : defaultMenu());
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

      {/* Active-cell editor overlay (IME-aware). */}
      {edit !== null && editRect !== null && (
        <textarea
          ref={editorRef}
          data-testid="lattica-editor"
          value={edit.draft}
          onChange={(e) => {
            controller.updateDraft(e.target.value);
            // `edit` is non-null inside this JSX branch.
            setEdit({ ...edit, draft: e.target.value });
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(e) => {
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
              rootRef.current?.focus();
            }
          }}
          onBlur={() => controller.commitEdit()}
          style={{
            position: 'absolute',
            left: editRect.x,
            top: editRect.y,
            width: editRect.width,
            height: editRect.height,
            margin: 0,
            border: `2px solid ${theme.activeBorder}`,
            boxSizing: 'border-box',
            font: `${theme.fontSize}px ${theme.fontFamily}`,
            padding: `0 ${theme.cellPaddingX}px`,
            resize: 'none',
            outline: 'none',
          }}
        />
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
