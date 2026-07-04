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

/** Row/column delta applied by Enter (move and post-commit move). */
export interface EnterMoves {
  row: number;
  col: number;
}

/**
 * Configurable keyboard behavior for {@link interpretKey}. Every option
 * defaults to the historical behavior, so passing nothing changes nothing.
 */
export interface KeyBehaviorOptions {
  /**
   * Direction Enter moves the active cell — both when navigating and after
   * committing an edit. Shift+Enter moves the opposite way. Default
   * `{ row: 1, col: 0 }` (down); use `{ row: 0, col: 1 }` for rightward entry.
   */
  enterMoves?: EnterMoves;
  /**
   * When true, a plain Enter (no shift) on a cell begins editing instead of
   * moving. Default false: Enter only moves the selection.
   */
  enterBeginsEditing?: boolean;
  /**
   * When false, Tab is not handled by the grid at all (no in-grid move, no
   * commit-and-move) so the browser's default focus navigation applies.
   * Default true.
   */
  tabNavigation?: boolean;
}

const ARROWS: Record<string, { dRow: number; dCol: number }> = {
  ArrowUp: { dRow: -1, dCol: 0 },
  ArrowDown: { dRow: 1, dCol: 0 },
  ArrowLeft: { dRow: 0, dCol: -1 },
  ArrowRight: { dRow: 0, dCol: 1 },
};

/** Negate a delta without producing -0 (keeps equality assertions sane). */
function negate(n: number): number {
  return n === 0 ? 0 : -n;
}

/** Interpret a key press into an action. */
export function interpretKey(input: KeyInput, editing: boolean, options: KeyBehaviorOptions = {}): KeyAction {
  const mod = input.ctrlKey === true || input.metaKey === true;
  const shift = input.shiftKey === true;
  const enterMoves = options.enterMoves ?? { row: 1, col: 0 };
  const tabNavigation = options.tabNavigation ?? true;
  const enterRow = shift ? negate(enterMoves.row) : enterMoves.row;
  const enterCol = shift ? negate(enterMoves.col) : enterMoves.col;

  if (editing) {
    switch (input.key) {
      case 'Enter':
        return { type: 'commit', dRow: enterRow, dCol: enterCol };
      case 'Tab':
        return tabNavigation ? { type: 'commit', dRow: 0, dCol: shift ? -1 : 1 } : { type: 'none' };
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
      return tabNavigation ? { type: 'move', dRow: 0, dCol: shift ? -1 : 1, extend: false } : { type: 'none' };
    case 'Enter':
      if ((options.enterBeginsEditing ?? false) && !shift) {
        return { type: 'edit' };
      }
      return { type: 'move', dRow: enterRow, dCol: enterCol, extend: false };
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
