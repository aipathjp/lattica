/**
 * Pure keyboard-shortcut registry. Chords are reduced to a canonical string
 * (e.g. `mod+shift+z`) so they can be compared, stored, and looked up without a
 * DOM. `mod` is the platform-agnostic primary modifier — `ctrl` OR `meta` —
 * which lets the same binding work on Windows/Linux (Ctrl) and macOS (Cmd).
 *
 * The registry is context-aware: a binding may target a named context (e.g.
 * `'editing'`) and lookup falls back to `'global'` when the active context has
 * no match. All logic is side-effect free apart from invoking the registered
 * action, making it fully unit-testable.
 */

/** A reduced keyboard event: only the fields a chord depends on. */
export interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** A registered shortcut handler. */
export type ShortcutAction = () => void;

/** The default context, used when none is supplied and as the fallback. */
const GLOBAL_CONTEXT = 'global';

/**
 * Reduce a key event to its canonical chord string. Modifiers are emitted in
 * canonical order `alt < mod < shift`; `mod` represents ctrl OR meta; the key is
 * lowercased and appended last (arrow keys keep their full name, e.g.
 * `arrowdown`).
 */
export function normalizeChord(e: ShortcutEvent): string {
  const tokens: string[] = [];
  if (e.altKey === true) {
    tokens.push('alt');
  }
  if (e.ctrlKey === true || e.metaKey === true) {
    tokens.push('mod');
  }
  if (e.shiftKey === true) {
    tokens.push('shift');
  }
  tokens.push(e.key.toLowerCase());
  return tokens.join('+');
}

/**
 * Parse a chord string into the same canonical form {@link normalizeChord}
 * produces, so registration and lookup keys always agree. Recognised modifier
 * tokens (`alt`, `mod`, `ctrl`, `meta`, `shift`, `cmd`, `command`, `control`,
 * `option`) are collapsed; everything else is treated as the base key.
 */
function parseChord(chord: string): string {
  const event: ShortcutEvent = { key: '' };
  for (const raw of chord.split('+')) {
    const part = raw.trim().toLowerCase();
    if (part === '') {
      continue;
    }
    switch (part) {
      case 'alt':
      case 'option':
        event.altKey = true;
        break;
      case 'mod':
      case 'ctrl':
      case 'control':
      case 'meta':
      case 'cmd':
      case 'command':
        event.ctrlKey = true;
        break;
      case 'shift':
        event.shiftKey = true;
        break;
      default:
        event.key = part;
        break;
    }
  }
  return normalizeChord(event);
}

/**
 * A context-aware keyboard-shortcut registry. Bindings live under a named
 * context (default `'global'`); {@link handle} consults the active context first
 * and then falls back to `'global'`.
 */
export class ShortcutRegistry {
  private readonly contexts = new Map<string, Map<string, ShortcutAction>>();
  private active = GLOBAL_CONTEXT;

  /**
   * Register `action` for `chord` within `context` (default `'global'`). If the
   * same chord is already registered in that context, the new action replaces it
   * (last wins). Returns an unregister function that removes this exact binding
   * if it is still the one installed.
   */
  register(chord: string, action: ShortcutAction, context: string = GLOBAL_CONTEXT): () => void {
    const normalized = parseChord(chord);
    let bindings = this.contexts.get(context);
    if (bindings === undefined) {
      bindings = new Map<string, ShortcutAction>();
      this.contexts.set(context, bindings);
    }
    bindings.set(normalized, action);
    return () => {
      const current = this.contexts.get(context);
      if (current !== undefined && current.get(normalized) === action) {
        current.delete(normalized);
      }
    };
  }

  /** Set the active context consulted before `'global'`. */
  setContext(context: string): void {
    this.active = context;
  }

  /** Get the active context. */
  getContext(): string {
    return this.active;
  }

  /**
   * Look up the chord for the current event: active context first, then
   * `'global'`. Runs the matching action and returns `true`; returns `false`
   * when nothing matches.
   */
  handle(e: ShortcutEvent): boolean {
    const chord = normalizeChord(e);
    const action = this.lookup(this.active, chord) ?? this.lookup(GLOBAL_CONTEXT, chord);
    if (action === undefined) {
      return false;
    }
    action();
    return true;
  }

  /** List the canonical chords registered in `context` (default active). */
  list(context: string = this.active): string[] {
    const bindings = this.contexts.get(context);
    return bindings === undefined ? [] : [...bindings.keys()];
  }

  private lookup(context: string, chord: string): ShortcutAction | undefined {
    return this.contexts.get(context)?.get(chord);
  }
}
