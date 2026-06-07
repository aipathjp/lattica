/**
 * Editor-kind resolution. The grid renders a different DOM editor depending on
 * a column's cell type: a `<select>` for dropdowns, a date input for dates, an
 * autocomplete input (with a `<datalist>`) for free text drawn from a list, and
 * a plain textarea otherwise. This module is the pure, framework-agnostic
 * mapping from a column type name to an {@link EditorKind}, kept separate from
 * the React component so it is trivially unit-testable.
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
