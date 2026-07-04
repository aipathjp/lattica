import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor, act } from '@testing-library/react';
import { createRef } from 'react';
import { LatticaGrid } from './LatticaGrid.js';
import { GridController } from './controller.js';
import type { ColumnNode } from '@ai-path/lattica-core';
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
