import { describe, it, expect } from 'vitest';
import { UndoManager, CompositeCommand, type Command } from './command.js';

/** A test command that pushes/pops a value on a shared log. */
function makeSetCommand(log: number[], value: number): Command {
  const cmd: Command = {
    label: `set ${value}`,
    apply() {
      log.push(value);
    },
    invert() {
      return {
        label: `unset ${value}`,
        apply() {
          log.pop();
        },
        invert() {
          return cmd;
        },
      };
    },
  };
  return cmd;
}

describe('UndoManager basics', () => {
  it('rejects invalid limit', () => {
    expect(() => new UndoManager({ limit: 0 })).toThrow(RangeError);
  });

  it('executes, undoes, and redoes', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.execute(makeSetCommand(log, 1));
    um.execute(makeSetCommand(log, 2));
    expect(log).toEqual([1, 2]);
    expect(um.canUndo()).toBe(true);
    expect(um.undoDepth).toBe(2);

    um.undo();
    expect(log).toEqual([1]);
    expect(um.canRedo()).toBe(true);

    um.redo();
    expect(log).toEqual([1, 2]);
  });

  it('returns null when nothing to undo/redo', () => {
    const um = new UndoManager();
    expect(um.undo()).toBeNull();
    expect(um.redo()).toBeNull();
  });

  it('clears the redo stack on a new command', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.execute(makeSetCommand(log, 1));
    um.undo();
    expect(um.canRedo()).toBe(true);
    um.execute(makeSetCommand(log, 9));
    expect(um.canRedo()).toBe(false);
  });

  it('honors the depth limit', () => {
    const log: number[] = [];
    const um = new UndoManager({ limit: 2 });
    um.execute(makeSetCommand(log, 1));
    um.execute(makeSetCommand(log, 2));
    um.execute(makeSetCommand(log, 3));
    expect(um.undoDepth).toBe(2);
  });

  it('clears all history', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.execute(makeSetCommand(log, 1));
    um.clear();
    expect(um.canUndo()).toBe(false);
    expect(um.redoDepth).toBe(0);
  });
});

describe('transactions', () => {
  it('groups commands into one undo step', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.transaction(() => {
      um.execute(makeSetCommand(log, 1));
      um.execute(makeSetCommand(log, 2));
      um.execute(makeSetCommand(log, 3));
    });
    expect(log).toEqual([1, 2, 3]);
    expect(um.undoDepth).toBe(1);
    um.undo();
    expect(log).toEqual([]);
    um.redo();
    expect(log).toEqual([1, 2, 3]);
  });

  it('records a single-command transaction without a composite wrapper', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.transaction(() => um.execute(makeSetCommand(log, 5)));
    expect(um.undoDepth).toBe(1);
  });

  it('does nothing for an empty transaction', () => {
    const um = new UndoManager();
    um.transaction(() => {});
    expect(um.undoDepth).toBe(0);
  });

  it('flattens nested transactions', () => {
    const log: number[] = [];
    const um = new UndoManager();
    um.transaction(() => {
      um.execute(makeSetCommand(log, 1));
      um.transaction(() => {
        um.execute(makeSetCommand(log, 2));
      });
    });
    expect(um.undoDepth).toBe(1);
    um.undo();
    expect(log).toEqual([]);
  });

  it('ends batching even if the body throws', () => {
    const log: number[] = [];
    const um = new UndoManager();
    expect(() =>
      um.transaction(() => {
        um.execute(makeSetCommand(log, 1));
        throw new Error('boom');
      }),
    ).toThrow('boom');
    // The partial command was still recorded; manager is usable again.
    expect(um.undoDepth).toBe(1);
    um.execute(makeSetCommand(log, 2));
    expect(um.undoDepth).toBe(2);
  });
});

describe('CompositeCommand', () => {
  it('applies in order and inverts in reverse', () => {
    const log: string[] = [];
    const mk = (id: string): Command => {
      const c: Command = {
        label: id,
        apply() {
          log.push(`do:${id}`);
        },
        invert() {
          return {
            label: `inv:${id}`,
            apply() {
              log.push(`undo:${id}`);
            },
            invert() {
              return c;
            },
          };
        },
      };
      return c;
    };
    const composite = new CompositeCommand([mk('a'), mk('b')], 'pair');
    composite.apply();
    expect(log).toEqual(['do:a', 'do:b']);
    composite.invert().apply();
    expect(log).toEqual(['do:a', 'do:b', 'undo:b', 'undo:a']);
  });
});
