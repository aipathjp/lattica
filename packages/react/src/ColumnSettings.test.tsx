import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ColumnNode } from '@ai-path/tb-core';
import { LatticaColumnSettings } from './ColumnSettings.js';
import { GridController } from './controller.js';

afterEach(cleanup);

const make = () => new GridController({ rowCount: 4, colCount: 3 });

describe('LatticaColumnSettings', () => {
  it('renders column labels from leaves and falls back to column letters', () => {
    const columns: readonly ColumnNode[] = [
      {
        headerName: 'Finance',
        children: [{ headerName: 'Revenue' }, { headerName: 'Cost' }],
      },
    ];
    render(<LatticaColumnSettings controller={make()} columns={columns} title="Fields" />);
    expect(screen.getByText('Fields')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getByText('Cost')).toBeTruthy();
    expect(screen.getByText('C')).toBeTruthy();
  });

  it('toggles physical column visibility and re-renders from controller events', () => {
    const c = make();
    render(<LatticaColumnSettings controller={c} />);

    const checkbox = screen.getByTestId('lattica-colsettings-vis-1') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(c.isColumnHidden(1)).toBe(true);
    expect(checkbox.checked).toBe(false);

    act(() => c.setColumnVisible(1, true));
    expect((screen.getByTestId('lattica-colsettings-vis-1') as HTMLInputElement).checked).toBe(true);
  });

  it('shows every column with the footer action', () => {
    const c = make();
    c.setColumnVisible(0, false);
    c.setColumnVisible(2, false);
    render(<LatticaColumnSettings controller={c} />);

    fireEvent.click(screen.getByTestId('lattica-colsettings-showall'));
    expect(c.isColumnHidden(0)).toBe(false);
    expect(c.isColumnHidden(2)).toBe(false);
  });

  it('edits widths by physical column and clamps to SizeManager minimum', () => {
    const c = make();
    c.moveColumn(0, 2);
    render(<LatticaColumnSettings controller={c} showWidths />);

    const width0 = screen.getByTestId('lattica-colsettings-width-0') as HTMLInputElement;
    fireEvent.change(width0, { target: { value: '144' } });
    expect(c.colSizes.getSize(0)).toBe(144);
    expect(width0.value).toBe('144');

    fireEvent.change(width0, { target: { value: '-8' } });
    expect(c.colSizes.getSize(0)).toBe(1);

    fireEvent.blur(width0, { target: { value: '' } });
    expect(c.colSizes.getSize(0)).toBe(1);

    Object.defineProperty(width0, 'value', { value: 'Infinity', configurable: true });
    fireEvent.blur(width0);
    expect(c.colSizes.getSize(0)).toBe(1);
  });

  it('resets customized widths with the footer action', () => {
    const c = make();
    c.setColumnWidth(1, 180);
    render(<LatticaColumnSettings controller={c} showWidths />);

    fireEvent.click(screen.getByTestId('lattica-colsettings-resetwidths'));
    expect(c.colSizes.getOverrides().size).toBe(0);
    expect((screen.getByTestId('lattica-colsettings-width-1') as HTMLInputElement).value).toBe('100');
  });

  it('supports visibility-only, widths-only, and read-only modes', () => {
    const { rerender } = render(<LatticaColumnSettings controller={make()} showWidths={false} />);
    expect(screen.getByTestId('lattica-colsettings-vis-0')).toBeTruthy();
    expect(screen.queryByTestId('lattica-colsettings-width-0')).toBeNull();
    expect(screen.getByTestId('lattica-colsettings-showall')).toBeTruthy();
    expect(screen.queryByTestId('lattica-colsettings-resetwidths')).toBeNull();

    rerender(<LatticaColumnSettings controller={make()} showVisibility={false} showWidths />);
    expect(screen.queryByTestId('lattica-colsettings-vis-0')).toBeNull();
    expect(screen.getByTestId('lattica-colsettings-width-0')).toBeTruthy();
    expect(screen.queryByTestId('lattica-colsettings-showall')).toBeNull();
    expect(screen.getByTestId('lattica-colsettings-resetwidths')).toBeTruthy();

    rerender(<LatticaColumnSettings controller={make()} showVisibility={false} showWidths={false} />);
    expect(screen.queryByTestId('lattica-colsettings-showall')).toBeNull();
    expect(screen.queryByTestId('lattica-colsettings-resetwidths')).toBeNull();
  });

  it('unsubscribes from controller events on unmount', () => {
    const c = make();
    const offChange = vi.fn();
    const offViewState = vi.fn();
    const on = vi.spyOn(c, 'on');
    on.mockReturnValueOnce(offChange).mockReturnValueOnce(offViewState);

    const view = render(<LatticaColumnSettings controller={c} theme={{ headerBackground: '#eee' }} />);
    view.unmount();

    expect(on).toHaveBeenCalledWith('change', expect.any(Function));
    expect(on).toHaveBeenCalledWith('viewstate', expect.any(Function));
    expect(offChange).toHaveBeenCalledOnce();
    expect(offViewState).toHaveBeenCalledOnce();
  });
});
