import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';
import { LatticaFormulaBar } from './FormulaBar.js';
import { GridController } from './controller.js';

afterEach(cleanup);

const setup = () => {
  const c = new GridController({ rowCount: 20, colCount: 10 });
  c.setCellText(0, 0, '=1+2');
  c.selection.setActive({ row: 0, col: 0 });
  render(<LatticaFormulaBar controller={c} theme={{ headerBackground: '#222' }} />);
  return c;
};

const nameBox = () => screen.getByTestId('lattica-name-box') as HTMLInputElement;
const formula = () => screen.getByTestId('lattica-formula-input') as HTMLInputElement;

describe('LatticaFormulaBar', () => {
  it('shows the active cell ref and edit text, and applies theme', () => {
    setup();
    expect(nameBox().value).toBe('A1');
    expect(formula().value).toBe('=1+2');
    expect(screen.getByTestId('lattica-formula-bar').style.background).toBe('#222');
  });

  it('commits a typed formula on Enter and moves down', () => {
    const c = setup();
    const f = formula();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '=5*5' } });
    fireEvent.keyDown(f, { key: 'Enter' });
    expect(c.getDisplay(0, 0)).toBe('25');
    // selection moved to A2; bar now reflects the (empty) next cell
    expect(c.getActiveCell()).toEqual({ row: 1, col: 0 });
    expect(nameBox().value).toBe('A2');
  });

  it('commits on blur', () => {
    const c = setup();
    const f = formula();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: 'hello' } });
    fireEvent.blur(f);
    expect(c.getDisplay(0, 0)).toBe('hello');
  });

  it('reverts on Escape without changing the cell', () => {
    const c = setup();
    const f = formula();
    fireEvent.focus(f);
    fireEvent.change(f, { target: { value: '=9' } });
    fireEvent.keyDown(f, { key: 'Escape' });
    expect(c.getDisplay(0, 0)).toBe('3'); // original =1+2
    expect(formula().value).toBe('=1+2');
  });

  it('updates when the selection moves (sync)', () => {
    const c = setup();
    c.setCellText(2, 3, 'D3val');
    act(() => c.selection.setActive({ row: 2, col: 3 }));
    expect(nameBox().value).toBe('D3');
    expect(formula().value).toBe('D3val');
  });

  it('name box navigates to a typed reference on Enter', () => {
    const c = setup();
    const n = nameBox();
    fireEvent.change(n, { target: { value: 'C5' } });
    fireEvent.keyDown(n, { key: 'Enter' });
    expect(c.getActiveCell()).toEqual({ row: 4, col: 2 });
    expect(nameBox().value).toBe('C5');
  });

  it('name box reverts on blur', () => {
    setup();
    const n = nameBox();
    fireEvent.change(n, { target: { value: 'ZZ9' } });
    fireEvent.blur(n);
    expect(nameBox().value).toBe('A1'); // reverted to the active ref
  });

  it('ignores a non-Enter keydown in the inputs', () => {
    const c = setup();
    fireEvent.keyDown(formula(), { key: 'a' });
    fireEvent.keyDown(nameBox(), { key: 'a' });
    expect(c.getDisplay(0, 0)).toBe('3'); // unchanged
  });
});
