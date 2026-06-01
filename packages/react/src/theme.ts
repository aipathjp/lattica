/** Visual theme for the canvas-rendered grid. All values are plain data so a
 * theme can be serialized, overridden, or swapped at runtime. */

export interface GridTheme {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  background: string;
  gridLineColor: string;
  headerBackground: string;
  headerTextColor: string;
  headerGridLineColor: string;
  selectionFill: string;
  selectionBorder: string;
  activeBorder: string;
  cellPaddingX: number;
  rowHeaderWidth: number;
  colHeaderHeight: number;
  defaultRowHeight: number;
  defaultColWidth: number;
}

export const defaultTheme: GridTheme = {
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  textColor: '#1f2933',
  background: '#ffffff',
  gridLineColor: '#e4e7eb',
  headerBackground: '#f5f7fa',
  headerTextColor: '#52606d',
  headerGridLineColor: '#cbd2d9',
  selectionFill: 'rgba(37, 99, 235, 0.12)',
  selectionBorder: '#2563eb',
  activeBorder: '#2563eb',
  cellPaddingX: 6,
  rowHeaderWidth: 48,
  colHeaderHeight: 24,
  defaultRowHeight: 24,
  defaultColWidth: 100,
};

/** Merge a partial override onto the default theme. */
export function resolveTheme(override?: Partial<GridTheme>): GridTheme {
  return override ? { ...defaultTheme, ...override } : defaultTheme;
}
