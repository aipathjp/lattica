/**
 * Pure keyboard interpretation. Maps a key event (reduced to plain fields) plus
 * the current editing state to a high-level {@link KeyAction}. Keeping this pure
 * makes the (otherwise hard-to-test) keyboard wiring fully unit-testable; the
 * React component just dispatches the returned action against the controller.
 */

export interface KeyInput {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type KeyAction =
  | { type: 'none' }
  | { type: 'move'; dRow: number; dCol: number; extend: boolean }
  | { type: 'edit'; initial?: string }
  | { type: 'commit'; dRow: number; dCol: number }
  | { type: 'cancel' }
  | { type: 'delete' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'undo' }
  | { type: 'redo' };

const ARROWS: Record<string, { dRow: number; dCol: number }> = {
  ArrowUp: { dRow: -1, dCol: 0 },
  ArrowDown: { dRow: 1, dCol: 0 },
  ArrowLeft: { dRow: 0, dCol: -1 },
  ArrowRight: { dRow: 0, dCol: 1 },
};

/** Interpret a key press into an action. */
export function interpretKey(input: KeyInput, editing: boolean): KeyAction {
  const mod = input.ctrlKey === true || input.metaKey === true;
  const shift = input.shiftKey === true;

  if (editing) {
    switch (input.key) {
      case 'Enter':
        return { type: 'commit', dRow: shift ? -1 : 1, dCol: 0 };
      case 'Tab':
        return { type: 'commit', dRow: 0, dCol: shift ? -1 : 1 };
      case 'Escape':
        return { type: 'cancel' };
      default:
        return { type: 'none' };
    }
  }

  const arrow = ARROWS[input.key];
  if (arrow !== undefined) {
    return { type: 'move', dRow: arrow.dRow, dCol: arrow.dCol, extend: shift };
  }

  switch (input.key) {
    case 'Tab':
      return { type: 'move', dRow: 0, dCol: shift ? -1 : 1, extend: false };
    case 'Enter':
      return { type: 'move', dRow: shift ? -1 : 1, dCol: 0, extend: false };
    case 'F2':
      return { type: 'edit' };
    case 'Backspace':
    case 'Delete':
      return { type: 'delete' };
  }

  if (mod) {
    const lower = input.key.toLowerCase();
    if (lower === 'z') {
      return shift ? { type: 'redo' } : { type: 'undo' };
    }
    if (lower === 'y') {
      return { type: 'redo' };
    }
    if (lower === 'c') {
      return { type: 'copy' };
    }
    if (lower === 'v') {
      return { type: 'paste' };
    }
    return { type: 'none' };
  }

  // A single printable character starts editing with that character.
  if (input.key.length === 1 && !input.altKey) {
    return { type: 'edit', initial: input.key };
  }
  return { type: 'none' };
}
