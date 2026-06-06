import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, renderHook } from '@testing-library/react';
import { useGridController } from './useGridController.js';
import { GridController } from './controller.js';

afterEach(cleanup);

describe('useGridController', () => {
  it('returns a GridController instance', () => {
    const { result } = renderHook(() => useGridController({ rowCount: 10, colCount: 5 }));
    expect(result.current).toBeInstanceOf(GridController);
    expect(result.current.getRowCount()).toBe(10);
  });

  it('keeps the same controller across re-renders (stable identity)', () => {
    const { result, rerender } = renderHook(() =>
      useGridController({ rowCount: 10, colCount: 5 }),
    );
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('works when used inside a component', () => {
    function Host() {
      const c = useGridController({ rowCount: 3, colCount: 3 });
      return <div data-testid="count">{c.getColCount()}</div>;
    }
    const { getByTestId } = render(<Host />);
    expect(getByTestId('count').textContent).toBe('3');
  });
});
