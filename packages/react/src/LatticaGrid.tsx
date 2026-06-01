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
import { cellRect, hitTest } from './geometry.js';
import { interpretKey, type KeyInput } from './keyboard.js';
import { scrollToCell, clampScroll, type ScrollOffset } from './scroll.js';
import { columnHeaderCells, rowHeaderCells } from './headers.js';

export interface LatticaGridProps {
  controller: GridController;
  /** Optional multi-level column definitions; defaults to A, B, C… letters. */
  columns?: readonly ColumnNode[];
  theme?: Partial<GridTheme>;
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

export function LatticaGrid(props: LatticaGridProps): ReactElement {
  const { controller, columns, width = 640, height = 400 } = props;
  const theme = resolveTheme(props.theme);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  const [scroll, setScroll] = useState<ScrollOffset>({ left: 0, top: 0 });
  const [edit, setEdit] = useState<EditState | null>(null);
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
    if (canvas === null) {
      return;
    }
    const ctx = canvas.getContext('2d') as Canvas2D | null;
    if (ctx === null) {
      return;
    }
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
      if (root === null) {
        return;
      }
      const rect = root.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTest(controller.geometry(), scroll.left, scroll.top, x, y);
      switch (hit.region) {
        case 'cell':
          if (e.shiftKey) {
            controller.selection.extendTo({ row: hit.row, col: hit.col });
          } else {
            controller.selection.setActive({ row: hit.row, col: hit.col });
          }
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
  });
  const colHeaders = columnHeaderCells(geom, scroll.left, scene.visibleCols, layout);
  const rowHeaders = rowHeaderCells(geom, scroll.top, scene.visibleRows);

  const editRect =
    edit !== null ? cellRect(geom, scroll.left, scroll.top, edit.row, edit.col) : null;

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
                    headerModelRef.current?.setColumns(columns ?? []);
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
            setEdit((prev) => (prev === null ? prev : { ...prev, draft: e.target.value }));
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
