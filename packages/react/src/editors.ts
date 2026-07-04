/**
 * Editor-kind resolution and the custom-editor registry. The grid renders a
 * different DOM editor depending on a column's cell type: a `<select>` for
 * dropdowns, a date input for dates, an autocomplete input (with a
 * `<datalist>`) for free text drawn from a list, and a plain textarea
 * otherwise. This module is the pure, framework-agnostic mapping from a column
 * type name to an {@link EditorKind}, plus the {@link EditorRegistry} used to
 * mount consumer-supplied editors (color pickers, complex selection UIs) in
 * place of the built-in ones. It is kept separate from the React component so
 * it is trivially unit-testable.
 */

/** The DOM editor variant to render for an active cell. */
export type EditorKind = 'text' | 'number' | 'checkbox' | 'date' | 'dropdown' | 'autocomplete';

/**
 * Resolve the editor variant for a column type. Unknown / undefined types fall
 * back to the plain text editor.
 */
export function editorKindForType(type: string | undefined): EditorKind {
  switch (type) {
    case 'dropdown':
    case 'select':
      return 'dropdown';
    case 'date':
      return 'date';
    case 'autocomplete':
      return 'autocomplete';
    case 'checkbox':
    case 'boolean':
      return 'checkbox';
    case 'number':
    case 'numeric':
      return 'number';
    default:
      return 'text';
  }
}

// ── Custom editor registry (P2-1) ──────────────────────────────────────────

/** Pixel rectangle of the edited cell, relative to the grid root element. */
export interface CustomEditorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Context handed to a {@link CustomEditorFactory} when an edit begins. */
export interface CustomEditorContext {
  /** Draft text of the edited cell at the moment the editor opens. */
  value: string;
  /** The cell's rectangle, relative to the grid root element. */
  rect: CustomEditorRect;
  /** Host element positioned over the cell — mount the editor UI in here. */
  container: HTMLElement;
  /**
   * Commit `next` through the grid's normal commit pipeline (draft
   * sanitization, validation, undo history, and a `cellcommit` event with
   * `source: 'edit'`).
   */
  commit(next: string): void;
  /** Abandon the edit without writing anything. */
  cancel(): void;
  /** Visual row of the edited cell. */
  row: number;
  /** Visual column of the edited cell. */
  col: number;
}

/** What a custom editor factory returns; both hooks are optional. */
export interface CustomEditorInstance {
  /** Called once after mount so the editor can take keyboard focus. */
  focus?(): void;
  /** Called when the edit ends (commit, cancel, or grid unmount). */
  destroy?(): void;
}

/** Builds a custom editor inside `ctx.container` for one edit session. */
export type CustomEditorFactory = (ctx: CustomEditorContext) => CustomEditorInstance;

export interface RegisterEditorOptions {
  /**
   * Commit the current draft when the user presses the mouse outside the
   * editor container. Defaults to false: the factory owns the lifecycle and
   * decides when to call `commit` / `cancel`.
   */
  commitOnOutsideClick?: boolean;
}

/** A registered custom editor with its resolved options. */
export interface RegisteredEditor {
  readonly factory: CustomEditorFactory;
  readonly commitOnOutsideClick: boolean;
}

/**
 * Registry of custom cell editors keyed by kind. Register a factory, point a
 * column at it (`ColumnNode.editor` or `controller.setColumnEditor`), and pass
 * the registry to `<LatticaGrid editors={registry}>`. Editing such a column
 * mounts the factory over the cell instead of a built-in editor; a kind with
 * no registration silently falls back to the built-in text editor.
 */
export class EditorRegistry {
  private readonly kinds = new Map<string, RegisteredEditor>();

  /** Register (or replace) the factory for a kind. */
  registerEditor(kind: string, factory: CustomEditorFactory, options: RegisterEditorOptions = {}): void {
    this.kinds.set(kind, { factory, commitOnOutsideClick: options.commitOnOutsideClick ?? false });
  }

  /** Remove a kind. Returns whether it was registered. */
  unregister(kind: string): boolean {
    return this.kinds.delete(kind);
  }

  /** Is a factory registered for the kind? */
  has(kind: string): boolean {
    return this.kinds.has(kind);
  }

  /** The registered editor for a kind, or undefined (→ text fallback). */
  resolve(kind: string): RegisteredEditor | undefined {
    return this.kinds.get(kind);
  }
}
