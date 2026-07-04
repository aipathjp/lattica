import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { createRef } from 'react';
import { LatticaGrid } from './LatticaGrid.js';
import { GridController } from './controller.js';
import { EditorRegistry, type CustomEditorContext } from './editors.js';
import { createMockContext } from './test-utils.js';
import type { ColumnNode } from '@ai-path/tb-core';
import type { LatticaGridHandle, LatticaGridProps } from './LatticaGrid.js';

afterEach(cleanup);

const renderGrid = (
  controller: GridController,
  columns?: ColumnNode[],
  props?: Partial<Omit<LatticaGridProps, 'controller' | 'columns'>>,
) => render(<LatticaGrid controller={controller} columns={columns} width={400} height={200} {...props} />);

describe('LatticaGrid rendering', () => {
  it('renders an ARIA grid with a canvas and headers', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('aria-rowcount')).toBe('20');
    expect(grid.querySelector('canvas')).not.toBeNull();
    // Default column letters present.
    expect(screen.getByText('A')).toBeTruthy();
    // Row numbers present.
    expect(screen.getByText('1')).toBeTruthy();
  });

  it('removes the DOM header of a hidden column when explicit columns are given', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    renderGrid(c, [{ headerName: 'One' }, { headerName: 'Two' }, { headerName: 'Three' }]);
    expect(screen.getByText('Two')).toBeTruthy();
    act(() => c.hideColumn(1));
    expect(screen.queryByText('Two')).toBeNull();
    expect(screen.getByText('Three')).toBeTruthy();
  });

  it('renders row numbers plus sort and filter icons by default', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    renderGrid(c);
    expect(screen.getAllByRole('rowheader').length).toBeGreaterThan(0);
    expect(screen.getByTestId('lattica-sort-0')).toBeTruthy();
    expect(screen.getByTestId('lattica-filter-0')).toBeTruthy();
  });

  it('hides row numbers and shifts cell coordinates flush-left', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    renderGrid(c, undefined, { showRowNumbers: false });
    expect(screen.queryByRole('rowheader')).toBeNull();
    const grid = screen.getByTestId('lattica-grid');
    const zeroWidthCorner = Array.from(grid.children).find(
      (el) => el instanceof HTMLElement && el.style.width === '0px' && el.style.height === '24px',
    );
    expect(zeroWidthCorner).toBeUndefined();
    const band = screen.getAllByRole('columnheader')[0]!.parentElement!;
    expect(band.style.left).toBe('0px');
    c.selection.setActive({ row: 1, col: 1 });
    fireEvent.mouseDown(grid, { clientX: 10, clientY: 40 });
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
  });

  it('applies rich column definitions to the controller', async () => {
    const c = new GridController({ rowCount: 2, colCount: 3 });
    const columns: ColumnNode[] = [
      {
        headerName: 'SKU',
        field: 'sku',
        width: 160,
        type: 'text',
        editable: false,
        align: 'left',
        maxLength: 4,
      },
      {
        headerName: 'Qty',
        field: 'qty',
        width: 90,
        type: 'number',
        align: 'right',
        format: '#,##0',
      },
      {
        headerName: 'Status',
        field: 'status',
        type: 'dropdown',
        options: ['Open', 'Closed'],
        align: 'center',
      },
    ];
    renderGrid(c, columns);

    await waitFor(() => expect(c.getColumnWidth(0)).toBe(160));
    expect(c.getColumnType(0)).toBe('text');
    expect(c.isCellEditable(0, 0)).toBe(false);
    expect(c.getColumnAlign(0)).toBe('left');
    expect(c.getColumnType(1)).toBe('number');
    expect(c.getColumnAlign(1)).toBe('right');
    expect(c.getColumnFormat(1)).toBe('#,##0');
    expect(c.getColumnType(2)).toBe('dropdown');
    expect(c.getColumnOptions(2)).toEqual(['Open', 'Closed']);
    expect(c.getColumnAlign(2)).toBe('center');

    c.beginEdit(0, 1, '123456');
    c.updateDraft('123456');
    expect(c.getEdit()?.draft).toBe('123456');
    c.cancelEdit();
    c.setColumnEditable(0, true);
    c.beginEdit(0, 0, '');
    c.updateDraft('abcdef');
    expect(c.getEdit()?.draft).toBe('abcd');
  });

  it('does not reapply column definitions when the columns reference is stable', async () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    const spy = vi.spyOn(c, 'applyColumnDefs');
    const columns: ColumnNode[] = [{ headerName: 'Name', field: 'name', width: 140 }];
    const { rerender } = renderGrid(c, columns, {
      rows: [{ name: 'Apple' }],
    });

    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender(<LatticaGrid controller={c} columns={columns} rows={[{ name: 'Pear' }]} width={400} height={200} />);
    await waitFor(() => expect(c.getDisplay(0, 0)).toBe('Pear'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('binds rows through leaf fields and leaves fieldless columns empty', async () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    const columns: ColumnNode[] = [
      { headerName: 'Name', field: 'name' },
      { headerName: 'Empty' },
    ];
    const { rerender } = renderGrid(c, columns, {
      rows: [{ name: 'Apple' }],
    });

    await waitFor(() => expect(c.getDisplay(0, 0)).toBe('Apple'));
    expect(c.getColCount()).toBe(2);
    expect(c.getDisplay(0, 1)).toBe('');

    rerender(<LatticaGrid controller={c} columns={columns} rows={[{ name: 'Pear' }]} width={400} height={200} />);
    await waitFor(() => expect(c.getDisplay(0, 0)).toBe('Pear'));
    expect(c.getDisplay(0, 1)).toBe('');
  });

  it('can attach columns after initially rendering default headers', async () => {
    const c = new GridController({ rowCount: 1, colCount: 1 });
    const { rerender } = render(<LatticaGrid controller={c} width={400} height={200} />);
    expect(screen.getByText('A')).toBeTruthy();

    rerender(<LatticaGrid controller={c} columns={[{ headerName: 'Late', width: 150 }]} width={400} height={200} />);
    await waitFor(() => expect(c.getColumnWidth(0)).toBe(150));
    expect(screen.getByText('Late')).toBeTruthy();
  });
});

describe('LatticaGrid interaction', () => {
  it('exposes a cell-geometry imperative handle', async () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    const ref = createRef<LatticaGridHandle>();
    const onScrollChange = vi.fn();
    render(
      <LatticaGrid
        ref={ref}
        controller={c}
        width={180}
        height={90}
        onScrollChange={onScrollChange}
      />,
    );
    const grid = screen.getByTestId('lattica-grid');
    grid.getBoundingClientRect = vi.fn(() => ({
      left: 10,
      top: 20,
      right: 190,
      bottom: 110,
      width: 180,
      height: 90,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }));

    expect(ref.current?.getCellClientRect(0, 0)).toMatchObject({
      left: 58,
      top: 44,
      width: 100,
      height: 24,
    });
    expect(ref.current?.getCellClientRect(-1, 0)).toBeNull();
    expect(ref.current?.getCellClientRect(0, 99)).toBeNull();

    ref.current?.focus();
    expect(document.activeElement).toBe(grid);

    act(() => ref.current?.scrollCellIntoView(10, 4));
    await waitFor(() => {
      expect(onScrollChange).toHaveBeenLastCalledWith(expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }));
    });
    const last = onScrollChange.mock.calls.at(-1)?.[0];
    expect(last.left).toBeGreaterThan(0);
    expect(last.top).toBeGreaterThan(0);
    const calls = onScrollChange.mock.calls.length;
    act(() => ref.current?.scrollCellIntoView(-1, 0));
    expect(onScrollChange).toHaveBeenCalledTimes(calls);
  });

  it('reports flush-left client rects when row numbers are hidden', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    const ref = createRef<LatticaGridHandle>();
    render(<LatticaGrid ref={ref} controller={c} width={300} height={160} showRowNumbers={false} />);
    const grid = screen.getByTestId('lattica-grid');
    grid.getBoundingClientRect = vi.fn(() => ({
      left: 7,
      top: 11,
      right: 307,
      bottom: 171,
      width: 300,
      height: 160,
      x: 7,
      y: 11,
      toJSON: () => ({}),
    }));

    expect(ref.current?.getCellClientRect(0, 0)).toMatchObject({ left: 7, top: 35, width: 100, height: 24 });
  });

  it('selects a cell on mouse down', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 60 });
    const { active } = c.selection.getState();
    expect(active.row).toBeGreaterThanOrEqual(1);
    expect(active.col).toBe(0);
  });

  it('emits cell clicks and scroll changes through optional callbacks', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    const onCellClick = vi.fn();
    const onScrollChange = vi.fn();
    renderGrid(c, undefined, { onCellClick, onScrollChange });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 40 });
    expect(onCellClick).toHaveBeenCalledWith({ row: 0, col: 0 }, expect.any(Object));
    fireEvent.wheel(grid, { deltaX: 20, deltaY: 20 });
    expect(onScrollChange).toHaveBeenCalledWith({ left: 20, top: 20 });
  });

  it('extends the selection with shift+mouse down', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.mouseDown(grid, { clientX: 200, clientY: 100, shiftKey: true });
    expect(c.selection.getState().ranges[0]).toBeDefined();
  });

  it('selects a whole row from the row-number gutter', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    // x < rowHeaderWidth(48), y > colHeaderHeight(24) -> row header
    fireEvent.mouseDown(grid, { clientX: 10, clientY: 60 });
    const range = c.selection.getState().ranges[0]!;
    expect(range.start.row).toBe(range.end.row);
    expect(range.start.col).toBe(0);
  });

  it('extends the selection with shift+arrow keys', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(grid, { key: 'ArrowRight', shiftKey: true });
    const range = c.selection.getState().ranges[0]!;
    expect(range.end).toEqual({ row: 1, col: 1 });
    expect(range.start).toEqual({ row: 0, col: 0 });
  });

  it('selects a whole column from the header', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 10 });
    const range = c.selection.getState().ranges[0]!;
    expect(range.start.col).toBe(range.end.col);
  });

  it('drag-selects a range with mousedown → mousemove → mouseup', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseMove(grid, { clientX: 260, clientY: 120 });
    fireEvent.mouseUp(grid);
    const range = c.selection.getState().ranges[0]!;
    expect(range.end.row).toBeGreaterThan(range.start.row);
    expect(range.end.col).toBeGreaterThan(range.start.col);
    // After release, moving no longer extends the selection.
    const before = JSON.stringify(c.selection.getState());
    fireEvent.mouseMove(grid, { clientX: 300, clientY: 160 });
    expect(JSON.stringify(c.selection.getState())).toBe(before);
  });

  it('ignores mousemove when not dragging', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    const before = JSON.stringify(c.selection.getState());
    fireEvent.mouseMove(grid, { clientX: 200, clientY: 120 });
    expect(JSON.stringify(c.selection.getState())).toBe(before);
  });

  it('selects everything from the corner', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 10, clientY: 10 });
    expect(c.selection.getState().ranges[0]).toMatchObject({
      start: { row: 0, col: 0 },
    });
  });

  it('moves the active cell with arrow keys', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowRight' });
    expect(c.selection.getState().active).toEqual({ row: 1, col: 1 });
  });

  it('renders a controlled cell overlay with root-relative rect and close callback', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setCellText(0, 0, 'Tokyo');
    const onCellOverlayClose = vi.fn();
    const renderCellOverlay = vi.fn(({ row, col, rect, close }) => (
      <button type="button" data-testid="overlay-close" onClick={close}>
        {row}:{col}:{rect.left}:{rect.top}:{rect.width}:{rect.height}
      </button>
    ));
    renderGrid(c, undefined, {
      cellOverlay: { row: 0, col: 0 },
      onCellOverlayClose,
      renderCellOverlay,
    });

    const overlay = screen.getByTestId('lattica-cell-overlay');
    expect(overlay.style.left).toBe('48px');
    expect(overlay.style.top).toBe('48px');
    expect(screen.getByTestId('overlay-close').textContent).toBe('0:0:48:24:100:24');
    fireEvent.click(screen.getByTestId('overlay-close'));
    expect(onCellOverlayClose).toHaveBeenCalledTimes(1);
  });

  it('does not render a cell overlay without a renderer or when offscreen', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    const { rerender } = render(<LatticaGrid controller={c} width={220} height={100} cellOverlay={{ row: 0, col: 0 }} />);
    expect(screen.queryByTestId('lattica-cell-overlay')).toBeNull();

    rerender(
      <LatticaGrid
        controller={c}
        width={220}
        height={100}
        cellOverlay={{ row: 15, col: 8 }}
        renderCellOverlay={() => <div>hidden</div>}
      />,
    );
    expect(screen.queryByTestId('lattica-cell-overlay')).toBeNull();
  });

  it('requests overlay close on Escape and active-cell movement', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    const onCellOverlayClose = vi.fn();
    renderGrid(c, undefined, {
      cellOverlay: { row: 0, col: 0 },
      onCellOverlayClose,
      renderCellOverlay: () => <div>overlay</div>,
    });
    const grid = screen.getByTestId('lattica-grid');

    fireEvent.keyDown(grid, { key: 'Escape' });
    expect(onCellOverlayClose).toHaveBeenCalledTimes(1);

    act(() => c.setCellText(0, 0, 'same active'));
    expect(onCellOverlayClose).toHaveBeenCalledTimes(1);

    act(() => c.selection.setActive({ row: 1, col: 0 }));
    expect(onCellOverlayClose).toHaveBeenCalledTimes(2);
  });

  it('keeps overlay mouse down from changing grid selection', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.selection.setActive({ row: 2, col: 2 });
    renderGrid(c, undefined, {
      cellOverlay: { row: 0, col: 0 },
      renderCellOverlay: () => <div>overlay</div>,
    });

    fireEvent.mouseDown(screen.getByTestId('lattica-cell-overlay'), { clientX: 60, clientY: 50 });
    expect(c.selection.getState().active).toEqual({ row: 2, col: 2 });
  });

  it('deletes the selection with Delete', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setCellText(0, 0, 'x');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'Delete' });
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it('scrolls on wheel', () => {
    const c = new GridController({ rowCount: 200, colCount: 50 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    expect(() => fireEvent.wheel(grid, { deltaX: 100, deltaY: 100 })).not.toThrow();
  });

  it('ignores unhandled keys without error', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    expect(() => fireEvent.keyDown(grid, { key: 'Shift' })).not.toThrow();
  });
});

describe('LatticaGrid clipboard', () => {
  const installClipboard = (overrides: Partial<{ writeText: unknown; readText: unknown }>) => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(), readText: vi.fn(), ...overrides },
      configurable: true,
      writable: true,
    });
  };

  it('writes the selection to the clipboard on Ctrl+C', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    installClipboard({ writeText });
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, 'copyme');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'c', ctrlKey: true });
    expect(writeText).toHaveBeenCalledWith('copyme');
  });

  it('pastes clipboard text on Ctrl+V', async () => {
    const readText = vi.fn().mockResolvedValue('x\ty\nz\tw');
    installClipboard({ readText });
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'v', ctrlKey: true });
    await waitFor(() => expect(c.getDisplay(1, 1)).toBe('w'));
    expect(c.getDisplay(0, 0)).toBe('x');
  });
});

describe('LatticaGrid editing', () => {
  it('opens an editor on double click and commits with Enter', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.doubleClick(grid);
    const editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '123' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(c.getDisplay(0, 0)).toBe('123');
  });

  it('starts editing when a printable key is pressed', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'a' });
    const editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('a');
    // A normal key inside the editor passes through (no commit/cancel).
    fireEvent.keyDown(editor, { key: 'b' });
    expect(screen.queryByTestId('lattica-editor')).not.toBeNull();
  });

  it('cancels editing with Escape', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'F2' });
    const editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'nope' } });
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByTestId('lattica-editor')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it('ignores keys during IME composition', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'F2' });
    const editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    fireEvent.compositionStart(editor);
    // Enter during composition should NOT commit.
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(screen.queryByTestId('lattica-editor')).not.toBeNull();
    fireEvent.compositionEnd(editor);
    fireEvent.change(editor, { target: { value: 'あ' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(c.getDisplay(0, 0)).toBe('あ');
  });

  it('commits on blur', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'F2' });
    const editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'blurred' } });
    fireEvent.blur(editor);
    expect(c.getDisplay(0, 0)).toBe('blurred');
  });

  it('subscribes and unsubscribes onCellCommit', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    const onCellCommit = vi.fn();
    const view = renderGrid(c, undefined, { onCellCommit });
    c.beginEdit(0, 0, 'x');
    c.commitEdit();
    expect(onCellCommit).toHaveBeenCalledWith({
      source: 'edit',
      changes: [{ row: 0, col: 0, physicalRow: 0, physicalCol: 0, prev: '', next: 'x' }],
    });
    onCellCommit.mockClear();
    view.rerender(<LatticaGrid controller={c} width={400} height={200} />);
    c.beginEdit(0, 0, 'y');
    c.commitEdit();
    expect(onCellCommit).not.toHaveBeenCalled();
  });

  it('subscribes and unsubscribes onInputReject', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setColumnType(0, 'number');
    c.setColumnFullWidthMode(0, 'reject');
    const onInputReject = vi.fn();
    const view = renderGrid(c, undefined, { onInputReject });
    c.beginEdit(0, 0, '１２３');
    c.commitEdit();
    expect(onInputReject).toHaveBeenCalledWith({ row: 0, col: 0, raw: '１２３', reason: 'fullwidth' });
    onInputReject.mockClear();
    view.rerender(<LatticaGrid controller={c} width={400} height={200} />);
    c.beginEdit(0, 0, '４５６');
    c.commitEdit();
    expect(onInputReject).not.toHaveBeenCalled();
  });

  it('supports all, end, and preserve edit selection modes', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setCellText(0, 0, 'abc');
    const view = renderGrid(c, undefined, { editSelection: 'all' });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.keyDown(grid, { key: 'F2' });
    let editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(0);
    expect(editor.selectionEnd).toBe(3);

    fireEvent.keyDown(editor, { key: 'Escape' });
    view.rerender(<LatticaGrid controller={c} width={400} height={200} editSelection="end" />);
    fireEvent.keyDown(grid, { key: 'F2' });
    editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(3);
    expect(editor.selectionEnd).toBe(3);

    fireEvent.keyDown(editor, { key: 'Escape' });
    view.rerender(<LatticaGrid controller={c} width={400} height={200} editSelection="preserve" />);
    const selectSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'select');
    const rangeSpy = vi.spyOn(HTMLTextAreaElement.prototype, 'setSelectionRange');
    fireEvent.keyDown(grid, { key: 'F2' });
    editor = screen.getByTestId('lattica-editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('abc');
    expect(selectSpy).not.toHaveBeenCalled();
    expect(rangeSpy).not.toHaveBeenCalled();
    selectSpy.mockRestore();
    rangeSpy.mockRestore();
  });

  it('skips the end selection range on date inputs (no selection API support)', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setColumnType(0, 'date');
    const rangeSpy = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange');
    renderGrid(c, undefined, { editSelection: 'end' });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.getByTestId('lattica-editor-date')).toBeTruthy();
    expect(rangeSpy).not.toHaveBeenCalled();
    rangeSpy.mockRestore();
  });

  it('places the caret at the end of text inputs (autocomplete) in end mode', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setColumnType(0, 'autocomplete');
    c.setColumnOptions(0, ['Alpha']);
    c.setCellText(0, 0, 'Alpha');
    renderGrid(c, undefined, { editSelection: 'end' });
    fireEvent.keyDown(screen.getByTestId('lattica-grid'), { key: 'F2' });
    const editor = screen.getByTestId('lattica-editor-autocomplete') as HTMLInputElement;
    expect(editor.selectionStart).toBe(5);
    expect(editor.selectionEnd).toBe(5);
  });

  it('focuses select editors without setting an end selection range', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    c.setColumnType(0, 'dropdown');
    c.setColumnOptions(0, ['A']);
    const rangeSpy = vi.spyOn(HTMLInputElement.prototype, 'setSelectionRange');
    renderGrid(c, undefined, { editSelection: 'end' });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.getByTestId('lattica-editor-select')).toBeTruthy();
    expect(rangeSpy).not.toHaveBeenCalled();
    rangeSpy.mockRestore();
  });

  it('uses read-only background tokens only when configured', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    const spy = vi.spyOn(c, 'isCellEditable');
    const view = renderGrid(c);
    expect(spy).not.toHaveBeenCalled();
    c.setColumnEditable(0, false);
    view.rerender(
      <LatticaGrid
        controller={c}
        width={400}
        height={200}
        theme={{ readOnlyCellBackground: '#eeeeee' }}
      />,
    );
    expect(spy).toHaveBeenCalled();
  });
});

describe('LatticaGrid multi-level headers', () => {
  const columns: ColumnNode[] = [
    { headerName: 'ID', field: 'id' },
    {
      id: 'grp',
      headerName: 'Name',
      collapsible: true,
      children: [{ headerName: 'First' }, { headerName: 'Last', showWhen: 'open' }],
    },
  ];

  it('renders group headers and toggles collapse on click', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c, columns);
    expect(screen.getByText(/Name/)).toBeTruthy();
    expect(screen.getByText('First')).toBeTruthy();
    // Toggling the collapsible group hides the 'open'-only child.
    const group = screen.getByText(/Name/);
    fireEvent.click(group);
    expect(screen.queryByText('Last')).toBeNull();
  });
});

describe('LatticaGrid multi-line headers and unit rows', () => {
  // 3段 (大分類 / 項目 / 単位)。単位なし列は leaf を浅い段に直接置くか
  // `group → leaf('')` (吸収) で表し、上段セルが下まで縦に伸びる。
  const unitColumns: ColumnNode[] = [
    { headerName: 'No', field: 'no' },
    {
      headerName: '寸法',
      children: [
        { headerName: '幅\n(外寸)', children: [{ headerName: 'mm', field: 'w' }] },
        { headerName: '数量', field: 'qty' },
      ],
    },
    { headerName: '判定', children: [{ headerName: '', field: 'result' }] },
  ];

  const headerByText = (text: string): HTMLElement =>
    screen.getAllByRole('columnheader').find((el) => el.textContent!.startsWith(text))! as HTMLElement;

  it('auto-expands the header band for "\\n" labels and merges unit-less columns', () => {
    const c = new GridController({ rowCount: 3, colCount: 5 });
    const { rerender } = render(
      <LatticaGrid controller={c} columns={unitColumns} width={640} height={300} />,
    );
    // Base 24 over 3 bands of 8; the 2-line row expands to 2*16 + 2*3 = 38.
    expect(c.getHeaderHeight()).toBe(54);
    expect(c.getBaseHeaderHeight()).toBe(24);

    const band = screen.getAllByRole('columnheader')[0]!.parentElement!;
    expect(band.style.height).toBe('54px');

    const multiline = headerByText('幅');
    expect(multiline.style.top).toBe('8px');
    expect(multiline.style.height).toBe('38px');
    expect(multiline.style.whiteSpace).toBe('pre-line');
    expect(multiline.style.lineHeight).toBe('16px');
    expect(multiline.style.paddingTop).toBe('3px');
    expect(multiline.style.paddingBottom).toBe('3px');

    // Unit-less leaf (数量) spans the item and unit rows: 38 + 8.
    const qty = headerByText('数量');
    expect(qty.style.top).toBe('8px');
    expect(qty.style.height).toBe('46px');
    // Absorbed group (判定 → leaf('')) spans all three rows.
    const result = headerByText('判定');
    expect(result.style.top).toBe('0px');
    expect(result.style.height).toBe('54px');
    // The unit cell sits in the bottom band.
    const unit = headerByText('mm');
    expect(unit.style.top).toBe('46px');
    expect(unit.style.height).toBe('8px');
    // Top-level leaf spans the full band.
    expect(headerByText('No').style.height).toBe('54px');

    // Removing columns returns the header band (and the controller) to base.
    rerender(<LatticaGrid controller={c} width={640} height={300} />);
    expect(c.getHeaderHeight()).toBe(24);
  });

  it('honors headerLineHeight/headerPaddingY theme tokens', () => {
    const c = new GridController({ rowCount: 3, colCount: 5 });
    render(
      <LatticaGrid
        controller={c}
        columns={unitColumns}
        width={640}
        height={300}
        theme={{ headerLineHeight: 20, headerPaddingY: 5 }}
      />,
    );
    // 2-line row: max(8, 2*20 + 2*5) = 50 -> total 8 + 50 + 8 = 66.
    expect(c.getHeaderHeight()).toBe(66);
    const multiline = headerByText('幅');
    expect(multiline.style.height).toBe('50px');
    expect(multiline.style.lineHeight).toBe('20px');
    expect(multiline.style.paddingTop).toBe('5px');
  });

  it('falls back to default tokens when a theme sets them to undefined', () => {
    const c = new GridController({ rowCount: 3, colCount: 5 });
    render(
      <LatticaGrid
        controller={c}
        columns={unitColumns}
        width={640}
        height={300}
        theme={{ headerLineHeight: undefined, headerPaddingY: undefined }}
      />,
    );
    expect(c.getHeaderHeight()).toBe(54);
    expect(headerByText('幅').style.lineHeight).toBe('16px');
  });
});

describe('LatticaGrid undo via keyboard', () => {
  it('undoes and redoes edits', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.setCellText(0, 0, 'first');
    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true });
    expect(c.getDisplay(0, 0)).toBe('');
    fireEvent.keyDown(grid, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(c.getDisplay(0, 0)).toBe('first');
  });
});

describe('LatticaGrid context menu', () => {
  it('opens a menu on right-click with default items', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    expect(screen.getByTestId('lattica-menu')).toBeTruthy();
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Clear contents')).toBeTruthy();
  });

  it('runs a menu item and closes the menu', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, 'x');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('Clear contents'));
    expect(c.getDisplay(0, 0)).toBe('');
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
  });

  it('does not act on a disabled item', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    // Undo is disabled when there is no history; clicking is a no-op and keeps the menu open.
    const undo = screen.getByText('Undo');
    fireEvent.mouseDown(undo);
    expect(screen.queryByTestId('lattica-menu')).not.toBeNull();
  });

  it('closes on backdrop click', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByTestId('lattica-menu-backdrop'));
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
  });

  it('uses a custom contextMenu builder with a separator', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    const onPick = vi.fn();
    render(
      <LatticaGrid
        controller={c}
        width={400}
        height={200}
        contextMenu={(target) => [
          { id: 'info', label: `cell ${target.row},${target.col}`, action: onPick },
          { id: 's', separator: true },
          { id: 'x', label: 'Extra' },
        ]}
      />,
    );
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    expect(screen.getByText(/^cell /)).toBeTruthy();
    expect(screen.getByText('Extra')).toBeTruthy();
    fireEvent.mouseDown(screen.getByText(/^cell /));
    expect(onPick).toHaveBeenCalled();
  });

  it('runs a no-action item without error (just closes)', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    render(
      <LatticaGrid
        controller={c}
        width={400}
        height={200}
        contextMenu={() => [{ id: 'noop', label: 'NoOp' }]}
      />,
    );
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('NoOp'));
    // no-action item: runMenuItem returns early, menu stays open
    expect(screen.queryByTestId('lattica-menu')).not.toBeNull();
  });
});

describe('LatticaGrid context-menu actions', () => {
  const withClipboard = () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('z');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
      writable: true,
    });
    return { writeText, readText };
  };

  it('Copy and Paste menu items invoke the clipboard', async () => {
    const { writeText, readText } = withClipboard();
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, 'hi');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });

    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('Copy'));
    expect(writeText).toHaveBeenCalled();

    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('Paste'));
    expect(readText).toHaveBeenCalled();
  });

  it('Undo and Redo menu items run when history exists', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, 'v1');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');

    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('Undo'));
    expect(c.getDisplay(0, 0)).toBe('');

    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    fireEvent.mouseDown(screen.getByText('Redo'));
    expect(c.getDisplay(0, 0)).toBe('v1');
  });
});

describe('LatticaGrid resize handles', () => {
  it('resizes a column by dragging its header border', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    // col 0 right border at rowHeaderWidth(48)+colWidth(100)=148, within the header band (y<24)
    fireEvent.mouseDown(grid, { clientX: 148, clientY: 10 });
    fireEvent.mouseMove(grid, { clientX: 180, clientY: 10 });
    fireEvent.mouseUp(grid);
    expect(c.colSizes.getSize(0)).toBe(132);
  });

  it('resizes a row by dragging its gutter border', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    // row 0 bottom border at colHeaderHeight(24)+rowHeight(24)=48, within the gutter (x<48)
    fireEvent.mouseDown(grid, { clientX: 10, clientY: 48 });
    fireEvent.mouseMove(grid, { clientX: 10, clientY: 70 });
    fireEvent.mouseUp(grid);
    expect(c.rowSizes.getSize(0)).toBe(46);
  });

  it('clamps a column to a minimum width', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 148, clientY: 10 });
    fireEvent.mouseMove(grid, { clientX: 0, clientY: 10 });
    fireEvent.mouseUp(grid);
    expect(c.colSizes.getSize(0)).toBe(8);
  });

  it('shows a resize cursor when hovering a border and clears it otherwise', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid') as HTMLElement;
    fireEvent.mouseMove(grid, { clientX: 148, clientY: 10 });
    expect(grid.style.cursor).toBe('col-resize');
    fireEvent.mouseMove(grid, { clientX: 10, clientY: 48 });
    expect(grid.style.cursor).toBe('row-resize');
    fireEvent.mouseMove(grid, { clientX: 200, clientY: 120 });
    expect(grid.style.cursor).toBe('');
  });
});

describe('LatticaGrid fill handle', () => {
  it('renders a fill handle and fills by dragging it', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    // select A1:A2 via drag
    c.selection.setActive({ row: 0, col: 0 });
    c.selection.extendTo({ row: 1, col: 0 });
    const nub = screen.getByTestId('lattica-fill-handle');
    fireEvent.mouseDown(nub);
    // drag down to row 4 (y within row 4: colHeaderHeight 24 + 4*24=120 .. +24)
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 130 });
    fireEvent.mouseUp(grid);
    expect(c.getDisplay(2, 0)).toBe('3');
    expect(c.getDisplay(4, 0)).toBe('5');
  });

  it('mouseup without a fill target does nothing', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, '1');
    renderGrid(c);
    const nub = screen.getByTestId('lattica-fill-handle');
    fireEvent.mouseDown(nub); // start fill but never move
    fireEvent.mouseUp(screen.getByTestId('lattica-grid'));
    expect(c.getDisplay(1, 0)).toBe('');
  });

  it('hides the fill handle while editing', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'F2' });
    expect(screen.queryByTestId('lattica-fill-handle')).toBeNull();
  });
});

describe('LatticaGrid header sort', () => {
  it('sorts a column by clicking its header sort control', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    c.setCellText(0, 0, '3');
    c.setCellText(1, 0, '1');
    c.setCellText(2, 0, '2');
    renderGrid(c);
    const sortBtn = screen.getByTestId('lattica-sort-0');
    fireEvent.click(sortBtn); // asc
    expect(c.getSortDirection(0)).toBe('asc');
    expect([c.getDisplay(0, 0), c.getDisplay(1, 0), c.getDisplay(2, 0)]).toEqual(['1', '2', '3']);
    fireEvent.click(screen.getByTestId('lattica-sort-0')); // desc
    expect(c.getSortDirection(0)).toBe('desc');
  });

  it('supports additive sort via shift-click', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    c.setCellText(0, 0, '1');
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-sort-0'));
    fireEvent.click(screen.getByTestId('lattica-sort-1'), { shiftKey: true });
    expect(c.getSortDirection(0)).toBe('asc');
    expect(c.getSortDirection(1)).toBe('asc');
  });

  it('disables sort UI and header-click sorting when sortable is false', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    renderGrid(c, undefined, { sortable: false });
    expect(screen.queryByTestId('lattica-sort-0')).toBeNull();
    fireEvent.click(screen.getAllByRole('columnheader')[0]!);
    expect(c.getSortDirection(0)).toBe(null);
  });

  it('sorts by header clicks when sort icons are hidden, including additive shift-click', () => {
    const c = new GridController({ rowCount: 3, colCount: 3 });
    renderGrid(c, undefined, { showSortIcons: false });
    expect(screen.queryByTestId('lattica-sort-0')).toBeNull();
    const headers = screen.getAllByRole('columnheader');
    fireEvent.click(headers[0]!);
    expect(c.getSortDirection(0)).toBe('asc');
    fireEvent.click(headers[1]!, { shiftKey: true });
    expect(c.getSortDirection(0)).toBe('asc');
    expect(c.getSortDirection(1)).toBe('asc');
  });
});

describe('LatticaGrid nested rows', () => {
  it('renders a row-group toggle and collapses descendants on click', () => {
    const c = new GridController({ rowCount: 5, colCount: 1 });
    for (let r = 0; r < 5; r++) c.setCellText(r, 0, `r${r}`);
    c.setRowTree([{ row: 0, children: [{ row: 1 }, { row: 2 }] }]);
    renderGrid(c);
    const toggle = screen.getByTestId('lattica-rowgroup-0');
    fireEvent.click(toggle);
    expect(c.isRowCollapsed(0)).toBe(true);
    expect(c.getRowCount()).toBe(3);
  });
});

describe('LatticaGrid rich editors (Phase A)', () => {
  it('renders a dropdown <select> and commits on change', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setColumnType(0, 'dropdown');
    c.setColumnOptions(0, ['Tokyo', 'Osaka']);
    const { container } = renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.doubleClick(grid);
    const select = screen.getByTestId('lattica-editor-select') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    // option list (blank + 2 options)
    expect(select.querySelectorAll('option').length).toBe(3);
    fireEvent.change(select, { target: { value: 'Osaka' } });
    // committed -> editor gone, value stored
    expect(screen.queryByTestId('lattica-editor-select')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('Osaka');
    expect(container).toBeTruthy();
  });

  it('cancels a dropdown edit on Escape', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setColumnType(0, 'dropdown');
    c.setColumnOptions(0, ['A', 'B']);
    renderGrid(c);
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    const select = screen.getByTestId('lattica-editor-select');
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(screen.queryByTestId('lattica-editor-select')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it('renders a date input and commits on Enter', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setColumnType(0, 'date');
    renderGrid(c);
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    const input = screen.getByTestId('lattica-editor-date') as HTMLInputElement;
    expect(input.getAttribute('type')).toBe('date');
    fireEvent.change(input, { target: { value: '2025-03-04' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('lattica-editor-date')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('2025-03-04');
  });

  it('renders an autocomplete input with a datalist and is IME-aware', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setColumnType(0, 'autocomplete');
    c.setColumnOptions(0, ['apple', 'apricot']);
    renderGrid(c);
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    const input = screen.getByTestId('lattica-editor-autocomplete') as HTMLInputElement;
    expect(input.getAttribute('list')).toBe('lattica-editor-options');
    const datalist = screen.getByTestId('lattica-editor-datalist');
    expect(datalist.querySelectorAll('option').length).toBe(2);
    // During IME composition, keydown is ignored (no commit).
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('lattica-editor-autocomplete')).not.toBeNull();
    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: 'apple' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByTestId('lattica-editor-autocomplete')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('apple');
  });

  it('paints invalid cells after a failed validation (no throw)', async () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setColumnType(0, 'dropdown');
    c.setColumnOptions(0, ['X', 'Y']);
    renderGrid(c);
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    const select = screen.getByTestId('lattica-editor-select') as HTMLSelectElement;
    // Force an out-of-list value via the underlying option set is impossible from
    // the select UI, so drive an invalid commit through the controller directly.
    c.beginEdit(0, 0, 'ZZZ');
    c.commitEdit();
    await waitFor(() => expect(c.isInvalid(0, 0)).toBe(true));
    expect(select).toBeTruthy();
  });
});

describe('LatticaGrid filter UI & column menu (Phase B-UI)', () => {
  const seed = (c: GridController) => {
    ['x', 'y', 'x', 'z'].forEach((v, r) => c.setCellText(r, 0, v));
  };

  it('opens a faceted filter panel and applies a set filter', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    const panel = screen.getByTestId('lattica-filter-panel');
    expect(panel).toBeTruthy();
    // distinct values x,y,z all checked initially -> uncheck y and z, keep x
    fireEvent.click(screen.getByTestId('lattica-filter-opt-y'));
    fireEvent.click(screen.getByTestId('lattica-filter-opt-z'));
    fireEvent.click(screen.getByTestId('lattica-filter-apply'));
    expect(screen.queryByTestId('lattica-filter-panel')).toBeNull();
    expect(c.getRowCount()).toBe(2); // only the two 'x' rows
  });

  it('all-checked apply clears the filter', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    // leave all checked -> apply -> no filter
    fireEvent.click(screen.getByTestId('lattica-filter-apply'));
    expect(c.getRowCount()).toBe(4);
  });

  it('toggling a checkbox back on re-includes the value', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    const optY = screen.getByTestId('lattica-filter-opt-y') as HTMLInputElement;
    fireEvent.click(optY); // uncheck
    expect(optY.checked).toBe(false);
    fireEvent.click(optY); // re-check
    expect(optY.checked).toBe(true);
  });

  it('Clear button removes the filter and closes the panel', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    c.setColumnSetFilter(0, ['x']);
    expect(c.getRowCount()).toBe(2);
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    fireEvent.click(screen.getByTestId('lattica-filter-clear'));
    expect(screen.queryByTestId('lattica-filter-panel')).toBeNull();
    expect(c.getRowCount()).toBe(4);
  });

  it('closes the filter panel on backdrop click', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    fireEvent.mouseDown(screen.getByTestId('lattica-filter-backdrop'));
    expect(screen.queryByTestId('lattica-filter-panel')).toBeNull();
  });

  it('renders a (blank) facet label for empty cells', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setCellText(0, 0, 'a'); // rows 1,2 empty
    renderGrid(c);
    fireEvent.click(screen.getByTestId('lattica-filter-0'));
    expect(screen.getByText('(blank)')).toBeTruthy();
  });

  it('context menu on a column header hides the column and reveals all', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    c.setCellText(0, 1, 'B0');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    // Right-click within the column header band (y < colHeaderHeight=24).
    fireEvent.contextMenu(grid, { clientX: 80, clientY: 8 });
    const hide = screen.getByText('Hide column');
    fireEvent.mouseDown(hide);
    expect(c.getColCount()).toBe(2);
    // Reveal all via a fresh menu.
    fireEvent.contextMenu(grid, { clientX: 80, clientY: 8 });
    fireEvent.mouseDown(screen.getByText('Show all columns'));
    expect(c.getColCount()).toBe(3);
  });

  it('disables filter icons and prevents opening the filter panel when filterable is false', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c, undefined, { filterable: false });
    expect(screen.queryByTestId('lattica-filter-0')).toBeNull();
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 80, clientY: 8 });
    expect(screen.queryByText('Filter…')).toBeNull();
    expect(screen.queryByTestId('lattica-filter-panel')).toBeNull();
  });

  it('opens the filter panel from the column menu when filter icons are hidden', () => {
    const c = new GridController({ rowCount: 4, colCount: 3 });
    seed(c);
    renderGrid(c, undefined, { showFilterIcons: false });
    expect(screen.queryByTestId('lattica-filter-0')).toBeNull();
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 80, clientY: 8 });
    fireEvent.mouseDown(screen.getByText('Filter…'));
    expect(screen.getByTestId('lattica-filter-panel')).toBeTruthy();
  });
});

describe('LatticaGrid master/detail (Phase E-7)', () => {
  it('renders a detail panel for an expanded row when renderDetail is given', () => {
    const c = new GridController({ rowCount: 10, colCount: 4 });
    c.setCellText(0, 0, 'master');
    render(
      <LatticaGrid
        controller={c}
        width={400}
        height={300}
        renderDetail={(physRow) => <div>detail for {physRow}</div>}
      />,
    );
    // Nothing expanded yet.
    expect(screen.queryByTestId('lattica-detail-0')).toBeNull();
    act(() => c.toggleDetail(0));
    const panel = screen.getByTestId('lattica-detail-0');
    expect(panel.textContent).toContain('detail for 0');
  });

  it('renders no detail panels without a renderDetail prop', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    render(<LatticaGrid controller={c} width={300} height={200} />);
    act(() => c.toggleDetail(0));
    expect(screen.queryByTestId('lattica-detail-0')).toBeNull();
  });
});

describe('LatticaGrid fill (auto-size to container)', () => {
  it('fixed size by default: root uses px width/height', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    render(<LatticaGrid controller={c} width={400} height={200} />);
    const root = screen.getByTestId('lattica-grid');
    expect(root.style.width).toBe('400px');
    expect(root.style.height).toBe('200px');
  });

  it('fill: root is 100% and the canvas matches the measured container', () => {
    let cb: ((entries: { contentRect: { width: number; height: number } }[]) => void) | null = null;
    class MockRO {
      constructor(handler: typeof cb) {
        cb = handler;
      }
      observe(): void {}
      disconnect(): void {}
    }
    const prev = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockRO as unknown;
    try {
      const c = new GridController({ rowCount: 5, colCount: 5 });
      render(<LatticaGrid controller={c} fill />);
      const root = screen.getByTestId('lattica-grid');
      expect(root.style.width).toBe('100%');
      expect(root.style.height).toBe('100%');
      // Empty entries → no change (covers the guard); then a real measurement.
      act(() => cb!([]));
      act(() => cb!([{ contentRect: { width: 800, height: 600 } }]));
      const canvas = root.querySelector('canvas')!;
      expect(canvas.style.width).toBe('800px');
      expect(canvas.style.height).toBe('600px');
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = prev;
    }
  });
});

describe('LatticaGrid autoSize content', () => {
  it('uses the content width and height and follows column visibility changes', () => {
    const c = new GridController({ rowCount: 2, colCount: 3 });
    render(<LatticaGrid controller={c} autoSize="content" />);
    const root = screen.getByTestId('lattica-grid');
    const canvas = root.querySelector('canvas')!;
    expect(root.style.width).toBe('348px');
    expect(root.style.height).toBe('72px');
    expect(canvas.style.width).toBe('348px');
    expect(canvas.style.height).toBe('72px');

    act(() => c.hideColumn(1));
    expect(root.style.width).toBe('248px');
    expect(canvas.style.width).toBe('248px');
  });

  it('follows column width changes and setRowCount changes', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    render(<LatticaGrid controller={c} autoSize="content" />);
    const root = screen.getByTestId('lattica-grid');
    expect(root.style.width).toBe('248px');
    expect(root.style.height).toBe('72px');

    act(() => c.setColumnWidth(1, 160));
    expect(root.style.width).toBe('308px');

    act(() => c.setRowCount(4));
    expect(root.style.height).toBe('120px');
  });

  it('clamps auto-sized dimensions with maxWidth and maxHeight', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    render(<LatticaGrid controller={c} autoSize="content" maxWidth={320} maxHeight={90} />);
    const root = screen.getByTestId('lattica-grid');
    const canvas = root.querySelector('canvas')!;
    expect(root.style.width).toBe('320px');
    expect(root.style.height).toBe('90px');
    expect(canvas.style.width).toBe('320px');
    expect(canvas.style.height).toBe('90px');
  });

  it('shrinks width when row numbers are hidden', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    render(<LatticaGrid controller={c} autoSize="content" showRowNumbers={false} />);
    const root = screen.getByTestId('lattica-grid');
    expect(root.style.width).toBe('200px');
    expect(root.style.height).toBe('72px');
  });

  it('ignores width, height, and fill when autoSize is content', () => {
    const c = new GridController({ rowCount: 1, colCount: 2 });
    render(<LatticaGrid controller={c} autoSize="content" width={999} height={888} fill />);
    const root = screen.getByTestId('lattica-grid');
    expect(root.style.width).toBe('248px');
    expect(root.style.height).toBe('48px');
  });
});

describe('LatticaGrid content edge (area past the last column/row)', () => {
  // A 2×2 grid in a 400×200 container: content ends at x = 48 + 2×100 = 248
  // and y = 24 + 2×24 = 72, leaving empty space to the right and below.
  const smallGrid = () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    renderGrid(c);
    return c;
  };

  it('stops the header band at the last column and the gutter at the last row', () => {
    smallGrid();
    const band = screen.getAllByRole('columnheader')[0]!.parentElement!;
    expect(band.style.width).toBe('200px'); // 248 - rowHeaderWidth(48)
    const gutter = screen.getAllByRole('rowheader')[0]!.parentElement!;
    expect(gutter.style.height).toBe('48px'); // 72 - colHeaderHeight(24)
  });

  it('keeps the chrome full-size while the content overflows the container', () => {
    const c = new GridController({ rowCount: 20, colCount: 10 });
    renderGrid(c);
    const band = screen.getAllByRole('columnheader')[0]!.parentElement!;
    expect(band.style.width).toBe('352px'); // 400 - rowHeaderWidth(48)
    const gutter = screen.getAllByRole('rowheader')[0]!.parentElement!;
    expect(gutter.style.height).toBe('176px'); // 200 - colHeaderHeight(24)
  });

  it('ignores mouse down past the last column and past the last row', () => {
    const c = smallGrid();
    c.selection.setActive({ row: 0, col: 0 });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 300, clientY: 40 }); // right of content
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 150 }); // below content
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
  });

  it('does not open a context menu past the last column/row', () => {
    smallGrid();
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.contextMenu(grid, { clientX: 300, clientY: 40 });
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 150 });
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
  });

  it('does not begin an edit on double-click past the last column/row', () => {
    const c = smallGrid();
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.doubleClick(grid, { clientX: 300, clientY: 40 });
    expect(c.getEdit()).toBeNull();
    fireEvent.doubleClick(grid, { clientX: 60, clientY: 150 });
    expect(c.getEdit()).toBeNull();
  });
});

describe('LatticaGrid frozen header z-order', () => {
  it('renders frozen col/row headers last (opaque) so scrolled ones slide beneath', () => {
    const c = new GridController({ rowCount: 50, colCount: 20, frozenRows: 1, frozenCols: 1 });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.wheel(grid, { deltaX: 150, deltaY: 150 });
    const colHeaders = screen.getAllByRole('columnheader');
    const lastCol = colHeaders[colHeaders.length - 1]!;
    expect(lastCol.textContent).toContain('A'); // frozen column A paints on top
    expect(lastCol.style.background).not.toBe('');
    const rowHeaders = screen.getAllByRole('rowheader');
    const lastRow = rowHeaders[rowHeaders.length - 1]!;
    expect(lastRow.textContent).toBe('1'); // frozen row 1 paints on top
    expect(lastRow.style.background).not.toBe('');
  });
});

describe('LatticaGrid view-state callbacks', () => {
  it('fires onColumnResize only when a column drag changes width', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    const onColumnResize = vi.fn();
    renderGrid(c, undefined, { onColumnResize });
    const grid = screen.getByTestId('lattica-grid');

    fireEvent.mouseDown(grid, { clientX: 148, clientY: 10 });
    fireEvent.mouseMove(grid, { clientX: 168, clientY: 10 });
    fireEvent.mouseUp(grid);
    expect(onColumnResize).toHaveBeenCalledTimes(1);
    expect(onColumnResize).toHaveBeenCalledWith({ col: 0, physicalCol: 0, width: 120 });

    fireEvent.mouseDown(grid, { clientX: 168, clientY: 10 });
    fireEvent.mouseUp(grid);
    expect(onColumnResize).toHaveBeenCalledTimes(1);
  });

  it('subscribes onViewStateChange and unsubscribes on unmount', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    const onViewStateChange = vi.fn();
    const { unmount } = renderGrid(c, undefined, { onViewStateChange });
    act(() => {
      c.resizeCol(0, 130);
    });
    expect(onViewStateChange).toHaveBeenCalledWith({
      version: 1,
      columnWidths: { 0: 130 },
    });
    unmount();
    act(() => {
      c.resizeCol(1, 140);
    });
    expect(onViewStateChange).toHaveBeenCalledTimes(1);
  });
});

describe('LatticaGrid text wrapping', () => {
  it('paints wrap-column text as multiple lines through the canvas', () => {
    const shared = createMockContext();
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => shared as unknown as CanvasRenderingContext2D);
    try {
      const c = new GridController({ rowCount: 2, colCount: 2 });
      c.setCellText(0, 0, 'foo bar baz');
      c.setColumnWrap(0, true);
      c.setColumnWidth(0, 60); // 60 - 2*6 padding = 48px; mock measures 7px/char
      renderGrid(c);
      const texts = shared.calls.filter((k) => k.method === 'fillText').map((k) => k.args[0]);
      expect(texts).toContain('foo');
      expect(texts).toContain('bar');
      expect(texts).toContain('baz');
      expect(texts).not.toContain('foo bar baz');
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the single-line paint path when no column wraps', () => {
    const shared = createMockContext();
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => shared as unknown as CanvasRenderingContext2D);
    try {
      const c = new GridController({ rowCount: 2, colCount: 2 });
      c.setCellText(0, 0, 'foo bar baz');
      c.setColumnWidth(0, 60);
      renderGrid(c);
      const texts = shared.calls.filter((k) => k.method === 'fillText').map((k) => k.args[0]);
      expect(texts).toContain('foo bar baz');
      // No measurement happens at all without wrap columns (zero extra cost).
      expect(shared.calls.some((k) => k.method === 'measureText')).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('LatticaGrid custom editors (P2-1)', () => {
  /** A dummy editor: an <input> mounted into the host container. */
  const makeDummyEditor = () => {
    const focus = vi.fn();
    const destroy = vi.fn();
    let ctx: CustomEditorContext | null = null;
    const factory = (context: CustomEditorContext) => {
      ctx = context;
      const input = context.container.ownerDocument.createElement('input');
      input.value = context.value;
      context.container.appendChild(input);
      return { focus, destroy };
    };
    return { factory, focus, destroy, ctx: () => ctx! };
  };

  it('mounts a registered editor and commits through the normal pipeline', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    const onCellCommit = vi.fn();
    renderGrid(c, undefined, { editors, onCellCommit });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.doubleClick(grid);

    const host = screen.getByTestId('lattica-editor-custom');
    expect(host.querySelector('input')).not.toBeNull();
    expect(screen.queryByTestId('lattica-editor')).toBeNull();
    expect(dummy.focus).toHaveBeenCalledTimes(1);
    const ctx = dummy.ctx();
    expect(ctx.row).toBe(0);
    expect(ctx.col).toBe(0);
    expect(ctx.value).toBe('');
    expect(ctx.rect.width).toBeGreaterThan(0);
    expect(ctx.rect.height).toBeGreaterThan(0);

    act(() => ctx.commit('#ff0000'));
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(dummy.destroy).toHaveBeenCalledTimes(1);
    expect(c.getDisplay(0, 0)).toBe('#ff0000');
    expect(onCellCommit).toHaveBeenCalledWith({
      source: 'edit',
      changes: [{ row: 0, col: 0, physicalRow: 0, physicalCol: 0, prev: '', next: '#ff0000' }],
    });

    // Undo joins the normal history.
    act(() => c.undoLast());
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it('cancels a custom edit without writing', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    const onCellCommit = vi.fn();
    renderGrid(c, undefined, { editors, onCellCommit });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    screen.getByTestId('lattica-editor-custom');

    act(() => dummy.ctx().cancel());
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(dummy.destroy).toHaveBeenCalledTimes(1);
    expect(c.getDisplay(0, 0)).toBe('');
    expect(onCellCommit).not.toHaveBeenCalled();
  });

  it('receives the initial typed character as the draft value', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    renderGrid(c, undefined, { editors });
    fireEvent.keyDown(screen.getByTestId('lattica-grid'), { key: 'x' });
    expect(dummy.ctx().value).toBe('x');
    act(() => dummy.ctx().cancel());
  });

  it('leaves grid Enter/Escape handling to the factory inside the container', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    renderGrid(c, undefined, { editors });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    const input = screen.getByTestId('lattica-editor-custom').querySelector('input')!;

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(c.getEdit()).not.toBeNull();
    expect(screen.getByTestId('lattica-editor-custom')).toBeTruthy();

    // Mouse-down inside the container also stays with the editor.
    fireEvent.mouseDown(input);
    expect(c.getEdit()).not.toBeNull();
  });

  it('commits on an outside mouse-down when the kind opts in', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory, { commitOnOutsideClick: true });
    renderGrid(c, undefined, { editors });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.keyDown(grid, { key: 'a' });
    screen.getByTestId('lattica-editor-custom');

    fireEvent.mouseDown(grid, { clientX: 160, clientY: 60 });
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('a');
  });

  it('does not commit on an outside mouse-down by default', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    renderGrid(c, undefined, { editors });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.keyDown(grid, { key: 'a' });
    screen.getByTestId('lattica-editor-custom');

    fireEvent.mouseDown(grid, { clientX: 160, clientY: 60 });
    expect(screen.getByTestId('lattica-editor-custom')).toBeTruthy();
    expect(c.getEdit()).not.toBeNull();
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it('supports factories without focus/destroy hooks', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'bare');
    const editors = new EditorRegistry();
    let ctx: CustomEditorContext | null = null;
    editors.registerEditor('bare', (context) => {
      ctx = context;
      return {};
    });
    renderGrid(c, undefined, { editors });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    screen.getByTestId('lattica-editor-custom');
    act(() => ctx!.commit('done'));
    expect(c.getDisplay(0, 0)).toBe('done');
  });

  it('falls back to the text editor for an unregistered kind', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'nope');
    const editors = new EditorRegistry();
    renderGrid(c, undefined, { editors });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(screen.getByTestId('lattica-editor')).toBeTruthy();
  });

  it('falls back to the text editor when no registry is passed', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    renderGrid(c);
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(screen.getByTestId('lattica-editor')).toBeTruthy();
  });

  it('uses built-in editors for columns without an editor kind', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    renderGrid(c, undefined, { editors });
    c.selection.setActive({ row: 0, col: 1 });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.queryByTestId('lattica-editor-custom')).toBeNull();
    expect(screen.getByTestId('lattica-editor')).toBeTruthy();
  });

  it('destroys the editor when the grid unmounts mid-edit', () => {
    const c = new GridController({ rowCount: 5, colCount: 3 });
    c.setColumnEditor(0, 'color');
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    const { unmount } = renderGrid(c, undefined, { editors });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    screen.getByTestId('lattica-editor-custom');
    unmount();
    expect(dummy.destroy).toHaveBeenCalledTimes(1);
  });

  it('binds the editor via ColumnNode editor metadata', () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    const editors = new EditorRegistry();
    const dummy = makeDummyEditor();
    editors.registerEditor('color', dummy.factory);
    const columns: ColumnNode[] = [
      { headerName: 'Color', field: 'color', editor: 'color' },
      { headerName: 'Name', field: 'name' },
    ];
    renderGrid(c, columns, { editors, rows: [{ color: '#00ff00', name: 'green' }] });
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.doubleClick(screen.getByTestId('lattica-grid'));
    expect(screen.getByTestId('lattica-editor-custom')).toBeTruthy();
    expect(dummy.ctx().value).toBe('#00ff00');
    act(() => dummy.ctx().cancel());
  });
});

describe('displayValue prop', () => {
  it('wires the prop to the controller override and repaints on prop change', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setCellText(0, 0, 'a');
    const { rerender } = renderGrid(c, undefined, {
      displayValue: (row, col, base) => (row === 0 && col === 0 ? `*${base}` : null),
    });
    expect(c.getDisplay(0, 0)).toBe('*a');
    expect(c.getDisplay(0, 1)).toBe('');
    expect(c.getEditText(0, 0)).toBe('a');

    const change = vi.fn();
    c.on('change', change);
    rerender(
      <LatticaGrid controller={c} width={400} height={200} displayValue={() => 'X'} />,
    );
    expect(change).toHaveBeenCalled();
    expect(c.getDisplay(1, 1)).toBe('X');
  });

  it('clears the override via null and on unmount', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setCellText(0, 0, 'a');
    const { rerender, unmount } = renderGrid(c, undefined, { displayValue: () => 'X' });
    expect(c.getDisplay(0, 0)).toBe('X');
    rerender(<LatticaGrid controller={c} width={400} height={200} displayValue={null} />);
    expect(c.getDisplay(0, 0)).toBe('a');
    rerender(
      <LatticaGrid controller={c} width={400} height={200} displayValue={() => 'Y'} />,
    );
    expect(c.getDisplay(0, 0)).toBe('Y');
    unmount();
    expect(c.getDisplayOverride()).toBeNull();
    expect(c.getDisplay(0, 0)).toBe('a');
  });

  it('leaves a controller-set override alone when the prop is undefined', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    act(() => c.setDisplayOverride(() => 'Z'));
    const { unmount } = renderGrid(c);
    expect(c.getDisplay(0, 0)).toBe('Z');
    unmount();
    expect(c.getDisplay(0, 0)).toBe('Z');
  });
});

describe('LatticaGrid tooltips', () => {
  // Default geometry: rowHeaderWidth 48, colHeaderHeight 24, rows 24px, cols 100px.
  // Cell (0,0) spans x∈[48,148), y∈[24,48); cell (1,0) spans y∈[48,72).
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a comment tooltip after the hover delay and hides it on an empty cell', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, '異常値検知');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('lattica-tooltip').textContent).toBe('異常値検知');
    // Moving to a cell without content hides it immediately.
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 54 });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });

  it('keeps the pending delay and visible tooltip while moving within the same cell', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, 'note');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    fireEvent.mouseMove(grid, { clientX: 100, clientY: 40 }); // same cell
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByTestId('lattica-tooltip').textContent).toBe('note');
    fireEvent.mouseMove(grid, { clientX: 120, clientY: 44 }); // still same cell
    expect(screen.getByTestId('lattica-tooltip')).toBeTruthy();
  });

  it('renders generic cellTooltip content and prefers comments when both exist', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, 'comment wins');
    renderGrid(c, undefined, {
      cellTooltip: (row, col) => (row === 0 ? (col === 1 ? 'warn' : 'generic') : null),
    });
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 160, clientY: 30 }); // (0,1): cellTooltip only
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('lattica-tooltip').textContent).toBe('warn');
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 }); // (0,0): comment beats cellTooltip
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('lattica-tooltip').textContent).toBe('comment wins');
    fireEvent.mouseMove(grid, { clientX: 160, clientY: 54 }); // (1,1): cellTooltip → null
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });

  it('cancels a pending tooltip and hides a visible one when the pointer leaves', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, 'bye');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 });
    fireEvent.mouseLeave(grid);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('lattica-tooltip')).toBeTruthy();
    fireEvent.mouseLeave(grid);
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });

  it('ignores hover past the content edge, on headers, and on resize borders', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, 'never');
    renderGrid(c); // content: right = 48+200 = 248, bottom = 24+72 = 96
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 300, clientY: 30 }); // past the last column
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 150 }); // past the last row
    fireEvent.mouseMove(grid, { clientX: 10, clientY: 40 }); // row-header gutter
    fireEvent.mouseMove(grid, { clientX: 148, clientY: 10 }); // column resize border
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });

  it('hides the tooltip element when the anchor cell scrolls out of view', () => {
    const c = new GridController({ rowCount: 50, colCount: 2 });
    c.setComment(0, 0, 'scrolled');
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseMove(grid, { clientX: 60, clientY: 30 });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('lattica-tooltip')).toBeTruthy();
    fireEvent.wheel(grid, { deltaX: 0, deltaY: 200 });
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });

  it('clears a pending tooltip timer on unmount', () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setComment(0, 0, 'pending');
    const { unmount } = renderGrid(c);
    fireEvent.mouseMove(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 30 });
    unmount();
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
    expect(screen.queryByTestId('lattica-tooltip')).toBeNull();
  });
});

describe('summary (footer) rows', () => {
  it('binds the summaryRows prop to the controller', async () => {
    const c = new GridController({ rowCount: 3, colCount: 2 });
    c.setData([
      ['A', 10],
      ['B', 20],
      ['C', 30],
    ]);
    renderGrid(
      c,
      [
        { headerName: 'Item', field: 'item' },
        { headerName: 'Qty', field: 'qty' },
      ],
      { summaryRows: [{ label: '合計', cells: { qty: 'sum' } }] },
    );
    await waitFor(() => expect(c.getSummaryRowCount()).toBe(1));
    expect(c.getSummaryDisplay(0, 1)).toBe('60');
    expect(c.getSummaryDisplay(0, 0)).toBe('合計');
    expect(c.geometry().summaryRows).toBe(1);
  });

  it('rebinds when the summaryRows prop changes', async () => {
    const c = new GridController({ rowCount: 2, colCount: 2 });
    const { rerender } = renderGrid(c, undefined, {
      summaryRows: [{ cells: { 1: 'sum' } }],
    });
    await waitFor(() => expect(c.getSummaryRowCount()).toBe(1));
    rerender(
      <LatticaGrid
        controller={c}
        width={400}
        height={200}
        summaryRows={[{ cells: { 1: 'sum' } }, { label: 'avg', cells: { 1: 'avg' } }]}
      />,
    );
    await waitFor(() => expect(c.getSummaryRowCount()).toBe(2));
  });

  it('keeps clicks on the pinned band away from selection and editing', async () => {
    const c = new GridController({ rowCount: 50, colCount: 3 });
    renderGrid(c, undefined, { summaryRows: [{ cells: { 1: 'count' } }] });
    await waitFor(() => expect(c.getSummaryRowCount()).toBe(1));
    const grid = screen.getByTestId('lattica-grid');
    // Band top = 200 - 24 = 176; a click below it must not move the selection.
    fireEvent.mouseDown(grid, { clientX: 100, clientY: 190 });
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
    fireEvent.doubleClick(grid, { clientX: 100, clientY: 190 });
    expect(c.getEdit()).toBeNull();
    // A click above the band still selects normally.
    fireEvent.mouseDown(grid, { clientX: 100, clientY: 100 });
    expect(c.selection.getState().active).not.toEqual({ row: 0, col: 0 });
  });
});

describe('LatticaGrid navigation options (P1-4)', () => {
  it('Enter moves by the enterMoves prop when navigating (shift reverses)', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { enterMoves: { row: 0, col: 1 } });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(c.selection.getState().active).toEqual({ row: 0, col: 1 });
    fireEvent.keyDown(grid, { key: 'Enter', shiftKey: true });
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
  });

  it('commits an edit and moves by the enterMoves prop', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { enterMoves: { row: 0, col: 1 } });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 1, col: 1 });
    fireEvent.keyDown(grid, { key: 'F2' });
    const editor = screen.getByTestId('lattica-editor');
    fireEvent.change(editor, { target: { value: 'abc' } });
    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(c.getDisplay(1, 1)).toBe('abc');
    expect(c.selection.getState().active).toEqual({ row: 1, col: 2 });
  });

  it('Enter begins editing when the enterBeginsEditing prop is set', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { enterBeginsEditing: true });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 1, col: 1 });
    fireEvent.keyDown(grid, { key: 'Enter' });
    expect(c.getEdit()).toMatchObject({ row: 1, col: 1 });
    expect(screen.getByTestId('lattica-editor')).toBeTruthy();
  });

  it('leaves Tab to the browser when the tabNavigation prop is false', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { tabNavigation: false });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    const notPrevented = fireEvent.keyDown(grid, { key: 'Tab' });
    expect(notPrevented).toBe(true); // default not prevented → browser focus nav
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
  });

  it('honors controller-level navigation options when no props are given', () => {
    const c = new GridController({
      rowCount: 5,
      colCount: 5,
      enterMoves: { row: 0, col: 1 },
      enterBeginsEditing: true,
      tabNavigation: false,
    });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'Enter' }); // begins editing
    expect(c.getEdit()).toMatchObject({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'Enter' }); // commits, then moves right
    expect(c.getEdit()).toBeNull();
    expect(c.selection.getState().active).toEqual({ row: 0, col: 1 });
    fireEvent.keyDown(grid, { key: 'Tab' }); // tabNavigation off
    expect(c.selection.getState().active).toEqual({ row: 0, col: 1 });
  });
});

describe('LatticaGrid outside-click deselect (P1-4)', () => {
  it('hides selection visuals on an outside click by default and restores on re-click', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c);
    c.selection.setActive({ row: 1, col: 1 });
    expect(screen.getByTestId('lattica-fill-handle')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('lattica-fill-handle')).toBeNull();

    const grid = screen.getByTestId('lattica-grid');
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 40 });
    expect(screen.getByTestId('lattica-fill-handle')).toBeTruthy();
  });

  it('re-shows the selection on a programmatic selection change', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('lattica-fill-handle')).toBeNull();
    act(() => c.selection.setActive({ row: 2, col: 2 }));
    expect(screen.getByTestId('lattica-fill-handle')).toBeTruthy();
  });

  it('keeps selection visuals when outsideClickDeselects is false', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { outsideClickDeselects: false });
    c.selection.setActive({ row: 1, col: 1 });
    fireEvent.mouseDown(document.body);
    expect(screen.getByTestId('lattica-fill-handle')).toBeTruthy();
  });
});

describe('LatticaGrid selectionDisabled (view-only, P1-4)', () => {
  it('disables UI selection, keyboard, and editing while reporting cell clicks', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    const onCellClick = vi.fn();
    renderGrid(c, undefined, { selectionDisabled: true, onCellClick });
    const grid = screen.getByTestId('lattica-grid');

    // No fill handle in view-only mode.
    expect(screen.queryByTestId('lattica-fill-handle')).toBeNull();

    // Cell click is reported but the selection does not move.
    fireEvent.mouseDown(grid, { clientX: 160, clientY: 40 }); // cell (0,1)
    expect(onCellClick).toHaveBeenCalledWith({ row: 0, col: 1 }, expect.anything());
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });

    // Header click does not select the column.
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 10 });
    expect(c.selection.getState().ranges).toEqual([
      { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } },
    ]);

    // Keyboard is inert (nothing handled, nothing prevented).
    expect(fireEvent.keyDown(grid, { key: 'ArrowDown' })).toBe(true);
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
    fireEvent.keyDown(grid, { key: 'F2' });
    expect(c.getEdit()).toBeNull();

    // Double-click does not begin editing.
    fireEvent.doubleClick(grid, { clientX: 60, clientY: 40 });
    expect(c.getEdit()).toBeNull();
  });

  it('honors controller-level selectionDisabled (no onCellClick given)', () => {
    const c = new GridController({ rowCount: 5, colCount: 5, selectionDisabled: true });
    renderGrid(c);
    const grid = screen.getByTestId('lattica-grid');
    expect(screen.queryByTestId('lattica-fill-handle')).toBeNull();
    fireEvent.mouseDown(grid, { clientX: 60, clientY: 40 }); // no crash without onCellClick
    expect(c.selection.getState().active).toEqual({ row: 0, col: 0 });
  });
});

describe('LatticaGrid context menu presets (P1-5)', () => {
  const withClipboard = () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('z');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
      writable: true,
    });
    return { writeText, readText };
  };

  it("contextMenu='none' shows no grid menu and leaves the event to the browser", () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { contextMenu: 'none' });
    const notPrevented = fireEvent.contextMenu(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 40 });
    expect(notPrevented).toBe(true);
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
  });

  it("contextMenu='clipboard-only' shows Copy and Cut only, and Cut cuts", () => {
    const { writeText } = withClipboard();
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellText(0, 0, 'x');
    renderGrid(c, undefined, { contextMenu: 'clipboard-only' });
    const grid = screen.getByTestId('lattica-grid');
    c.selection.setActive({ row: 0, col: 0 });
    fireEvent.contextMenu(grid, { clientX: 60, clientY: 40 });
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.queryByText('Paste')).toBeNull();
    expect(screen.queryByText('Clear contents')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
    expect(screen.queryByText('Redo')).toBeNull();

    fireEvent.mouseDown(screen.getByText('Cut'));
    expect(writeText).toHaveBeenCalled();
    expect(c.getDisplay(0, 0)).toBe('');
  });

  it("omits Cut in 'clipboard-only' when the active cell is read-only", () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setColumnEditable(0, false);
    renderGrid(c, undefined, { contextMenu: 'clipboard-only' });
    fireEvent.contextMenu(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 40 });
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.queryByText('Cut')).toBeNull();
  });

  it("contextMenu='full' shows the built-in menu including Cut", () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { contextMenu: 'full' });
    fireEvent.contextMenu(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 40 });
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Cut')).toBeTruthy();
    expect(screen.getByText('Paste')).toBeTruthy();
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('hides edit items in the default menu when the active cell is read-only', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellReadOnly(0, 0, true);
    renderGrid(c);
    fireEvent.contextMenu(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 40 });
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.queryByText('Cut')).toBeNull();
    expect(screen.queryByText('Paste')).toBeNull();
    expect(screen.queryByText('Clear contents')).toBeNull();
    // Undo/Redo remain listed but are disabled without history.
    expect(screen.getByText('Undo')).toBeTruthy();
  });

  it('does not open an empty custom menu', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    renderGrid(c, undefined, { contextMenu: () => [] });
    fireEvent.contextMenu(screen.getByTestId('lattica-grid'), { clientX: 60, clientY: 40 });
    expect(screen.queryByTestId('lattica-menu')).toBeNull();
  });
});
