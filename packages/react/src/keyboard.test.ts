import { describe, it, expect } from 'vitest';
import { interpretKey } from './keyboard.js';

describe('interpretKey — navigation', () => {
  it('maps arrow keys to moves', () => {
    expect(interpretKey({ key: 'ArrowUp' }, false)).toEqual({ type: 'move', dRow: -1, dCol: 0, extend: false });
    expect(interpretKey({ key: 'ArrowDown' }, false)).toMatchObject({ dRow: 1, dCol: 0 });
    expect(interpretKey({ key: 'ArrowLeft' }, false)).toMatchObject({ dRow: 0, dCol: -1 });
    expect(interpretKey({ key: 'ArrowRight' }, false)).toMatchObject({ dRow: 0, dCol: 1 });
  });
  it('extends with shift', () => {
    expect(interpretKey({ key: 'ArrowRight', shiftKey: true }, false)).toMatchObject({ extend: true });
  });
  it('maps Tab and Enter', () => {
    expect(interpretKey({ key: 'Tab' }, false)).toMatchObject({ type: 'move', dCol: 1 });
    expect(interpretKey({ key: 'Tab', shiftKey: true }, false)).toMatchObject({ dCol: -1 });
    expect(interpretKey({ key: 'Enter' }, false)).toMatchObject({ type: 'move', dRow: 1 });
    expect(interpretKey({ key: 'Enter', shiftKey: true }, false)).toMatchObject({ dRow: -1 });
  });
});

describe('interpretKey — editing entry', () => {
  it('F2 begins editing without initial text', () => {
    expect(interpretKey({ key: 'F2' }, false)).toEqual({ type: 'edit' });
  });
  it('a printable char begins editing with that char', () => {
    expect(interpretKey({ key: 'a' }, false)).toEqual({ type: 'edit', initial: 'a' });
    expect(interpretKey({ key: '5' }, false)).toEqual({ type: 'edit', initial: '5' });
  });
  it('ignores printable chars with alt', () => {
    expect(interpretKey({ key: 'a', altKey: true }, false)).toEqual({ type: 'none' });
  });
  it('Backspace/Delete clear', () => {
    expect(interpretKey({ key: 'Backspace' }, false)).toEqual({ type: 'delete' });
    expect(interpretKey({ key: 'Delete' }, false)).toEqual({ type: 'delete' });
  });
  it('non-printable keys do nothing', () => {
    expect(interpretKey({ key: 'Shift' }, false)).toEqual({ type: 'none' });
  });
});

describe('interpretKey — clipboard and history', () => {
  it('maps ctrl/meta shortcuts', () => {
    expect(interpretKey({ key: 'z', ctrlKey: true }, false)).toEqual({ type: 'undo' });
    expect(interpretKey({ key: 'z', metaKey: true, shiftKey: true }, false)).toEqual({ type: 'redo' });
    expect(interpretKey({ key: 'y', ctrlKey: true }, false)).toEqual({ type: 'redo' });
    expect(interpretKey({ key: 'c', metaKey: true }, false)).toEqual({ type: 'copy' });
    expect(interpretKey({ key: 'v', ctrlKey: true }, false)).toEqual({ type: 'paste' });
  });
  it('unknown modified keys do nothing', () => {
    expect(interpretKey({ key: 'q', ctrlKey: true }, false)).toEqual({ type: 'none' });
  });
});

describe('interpretKey — while editing', () => {
  it('Enter commits and moves down (up with shift)', () => {
    expect(interpretKey({ key: 'Enter' }, true)).toEqual({ type: 'commit', dRow: 1, dCol: 0 });
    expect(interpretKey({ key: 'Enter', shiftKey: true }, true)).toMatchObject({ dRow: -1 });
  });
  it('Tab commits and moves sideways', () => {
    expect(interpretKey({ key: 'Tab' }, true)).toEqual({ type: 'commit', dRow: 0, dCol: 1 });
    expect(interpretKey({ key: 'Tab', shiftKey: true }, true)).toMatchObject({ dCol: -1 });
  });
  it('Escape cancels', () => {
    expect(interpretKey({ key: 'Escape' }, true)).toEqual({ type: 'cancel' });
  });
  it('other keys pass through to the input', () => {
    expect(interpretKey({ key: 'a' }, true)).toEqual({ type: 'none' });
  });
});
