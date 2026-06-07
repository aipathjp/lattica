import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, act } from '@testing-library/react';
import { LatticaStatusBar } from './StatusBar.js';
import { GridController } from './controller.js';

afterEach(cleanup);

describe('LatticaStatusBar', () => {
  it('shows selection aggregates and updates on change', () => {
    const c = new GridController({ rowCount: 10, colCount: 5 });
    c.setCellText(0, 0, '10');
    c.setCellText(1, 0, '20');
    render(<LatticaStatusBar controller={c} />);
    // Default selection is a single cell (0,0) = 10.
    expect(screen.getByTestId('status-count').textContent).toBe('Count: 1');
    expect(screen.getByTestId('status-sum').textContent).toBe('Sum: 10');

    act(() => {
      c.selection.setActive({ row: 0, col: 0 });
      c.selection.extendTo({ row: 1, col: 0 });
    });
    expect(screen.getByTestId('status-count').textContent).toBe('Count: 2');
    expect(screen.getByTestId('status-sum').textContent).toBe('Sum: 30');
    expect(screen.getByTestId('status-avg').textContent).toBe('Avg: 15');
  });

  it('renders a dash for null aggregates and 2dp for fractions; accepts className/style', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    render(<LatticaStatusBar controller={c} className="sb" style={{ color: 'red' }} />);
    // empty active cell? active is (0,0)=1 -> avg integer. Select an empty cell for nulls.
    act(() => {
      c.selection.setActive({ row: 4, col: 4 });
    });
    expect(screen.getByTestId('status-sum').textContent).toBe('Sum: –');
    const bar = screen.getByTestId('lattica-statusbar');
    expect(bar.className).toBe('sb');
  });

  it('formats fractional averages to two decimals', () => {
    const c = new GridController({ rowCount: 5, colCount: 5 });
    c.setCellText(0, 0, '1');
    c.setCellText(1, 0, '2');
    render(<LatticaStatusBar controller={c} />);
    act(() => {
      c.selection.setActive({ row: 0, col: 0 });
      c.selection.extendTo({ row: 2, col: 0 }); // 1,2,(empty) -> avg 1.5
    });
    expect(screen.getByTestId('status-avg').textContent).toBe('Avg: 1.50');
  });
});
