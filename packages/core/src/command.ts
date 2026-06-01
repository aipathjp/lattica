/**
 * Command pattern + UndoManager.
 *
 * A {@link Command} knows how to apply itself and produce its inverse. The
 * {@link UndoManager} keeps undo/redo stacks and supports batching multiple
 * commands into a single transaction so that a compound edit (e.g. a paste
 * spanning many cells) is undone atomically.
 */

export interface Command {
  /** A human-readable label, useful for menus / tests. */
  readonly label: string;
  /** Perform the command's effect. */
  apply(): void;
  /** Build the command that reverses this one (called after apply). */
  invert(): Command;
}

/** Compose several commands into one atomic command. */
export class CompositeCommand implements Command {
  readonly label: string;
  private readonly commands: readonly Command[];

  constructor(commands: readonly Command[], label = 'composite') {
    this.commands = commands;
    this.label = label;
  }

  apply(): void {
    for (const cmd of this.commands) {
      cmd.apply();
    }
  }

  invert(): Command {
    // Invert in reverse order.
    const inverted = [...this.commands].reverse().map((c) => c.invert());
    return new CompositeCommand(inverted, `undo:${this.label}`);
  }
}

export interface UndoManagerOptions {
  /** Maximum undo depth; older entries are discarded. Default 100. */
  limit?: number;
}

export class UndoManager {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];
  private readonly limit: number;

  private batching = false;
  private batch: Command[] = [];

  constructor(options: UndoManagerOptions = {}) {
    this.limit = options.limit ?? 100;
    if (this.limit < 1) {
      throw new RangeError('limit must be >= 1');
    }
  }

  /** Apply a command and push it onto the undo stack (clearing redo). */
  execute(command: Command): void {
    command.apply();
    this.record(command);
  }

  /** Record an already-applied command without re-applying it. */
  private record(command: Command): void {
    if (this.batching) {
      this.batch.push(command);
      return;
    }
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  /**
   * Run `fn`, grouping every command executed inside it into one transaction.
   * Nested transactions flatten into the outermost one.
   */
  transaction(fn: () => void, label = 'transaction'): void {
    if (this.batching) {
      fn();
      return;
    }
    this.batching = true;
    this.batch = [];
    try {
      fn();
    } finally {
      this.batching = false;
      // Commit whatever was applied — even on throw — so the already-applied
      // effects remain undoable.
      if (this.batch.length === 1) {
        this.record(this.batch[0]!);
      } else if (this.batch.length > 1) {
        this.record(new CompositeCommand(this.batch, label));
      }
      this.batch = [];
    }
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Undo the most recent command. Returns the undone command, or null. */
  undo(): Command | null {
    const command = this.undoStack.pop();
    if (command === undefined) {
      return null;
    }
    const inverse = command.invert();
    inverse.apply();
    this.redoStack.push(command);
    return command;
  }

  /** Redo the most recently undone command. Returns it, or null. */
  redo(): Command | null {
    const command = this.redoStack.pop();
    if (command === undefined) {
      return null;
    }
    command.apply();
    this.undoStack.push(command);
    return command;
  }

  /** Drop all history. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }
}
