/**
 * LatticaFormulaBar — an Excel-style formula bar: a name box (the active cell's
 * A1 reference, with Go-To navigation) and a formula input bound to the active
 * cell. Typing `=…` enters a formula; Enter commits and moves down, Escape
 * reverts. It two-way syncs with the grid: moving the selection or editing a
 * cell updates the bar, and committing the bar updates the cell.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { GridController } from './controller.js';
import { resolveTheme, type GridTheme } from './theme.js';

export interface LatticaFormulaBarProps {
  controller: GridController;
  theme?: Partial<GridTheme>;
  className?: string;
  style?: CSSProperties;
}

export function LatticaFormulaBar({
  controller,
  theme: themeProp,
  className,
  style,
}: LatticaFormulaBarProps): ReactElement {
  const theme = resolveTheme(themeProp);
  const [name, setName] = useState('');
  const [formula, setFormula] = useState('');
  const editingRef = useRef(false);

  useEffect(() => {
    const sync = (): void => {
      setName(controller.getActiveRef());
      if (!editingRef.current) {
        setFormula(controller.getActiveEditText());
      }
    };
    sync();
    return controller.on('change', sync);
  }, [controller]);

  const commit = (): void => {
    editingRef.current = false;
    controller.setActiveCellText(formula);
  };

  const inputStyle: CSSProperties = {
    font: `${theme.fontSize}px ${theme.fontFamily}`,
    color: theme.textColor,
    background: theme.background,
    border: 'none',
    outline: 'none',
    padding: '0 6px',
    height: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div
      data-testid="lattica-formula-bar"
      className={className}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        height: 26,
        background: theme.headerBackground,
        borderBottom: `1px solid ${theme.headerGridLineColor}`,
        ...style,
      }}
    >
      <input
        data-testid="lattica-name-box"
        aria-label="active cell reference"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            controller.goToRef(name); // sync resets name on success/failure
            (e.target as HTMLInputElement).blur();
            e.preventDefault();
          }
        }}
        onBlur={() => setName(controller.getActiveRef())}
        style={{
          ...inputStyle,
          width: 76,
          textAlign: 'center',
          borderRight: `1px solid ${theme.headerGridLineColor}`,
          flex: '0 0 auto',
        }}
      />
      <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', color: theme.headerTextColor, fontStyle: 'italic' }}>
        fx
      </span>
      <input
        data-testid="lattica-formula-input"
        aria-label="formula"
        value={formula}
        onFocus={() => {
          editingRef.current = true;
        }}
        onChange={(e) => setFormula(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            controller.selection.move(1, 0); // emits change → sync next cell
            e.preventDefault();
          } else if (e.key === 'Escape') {
            editingRef.current = false;
            setFormula(controller.getActiveEditText());
            (e.target as HTMLInputElement).blur();
            e.preventDefault();
          }
        }}
        onBlur={() => {
          if (editingRef.current) {
            commit();
          }
        }}
        style={{ ...inputStyle, flex: '1 1 auto' }}
      />
    </div>
  );
}
