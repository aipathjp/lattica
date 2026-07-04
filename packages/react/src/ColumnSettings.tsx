import { useEffect, useReducer, type CSSProperties, type ReactElement } from 'react';
import { columnIndexToLabel, type ColumnNode } from '@ai-path/lattica-core';
import type { GridController } from './controller.js';
import { resolveTheme, type GridTheme } from './theme.js';

const MIN_COLUMN_WIDTH = 1;

export interface LatticaColumnSettingsProps {
  controller: GridController;
  columns?: readonly ColumnNode[];
  theme?: Partial<GridTheme>;
  showVisibility?: boolean;
  showWidths?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

function leafLabels(nodes: readonly ColumnNode[]): string[] {
  const labels: string[] = [];
  for (const node of nodes) {
    if ('children' in node) {
      labels.push(...leafLabels(node.children));
    } else {
      labels.push(node.headerName);
    }
  }
  return labels;
}

function columnLabel(labels: readonly string[], physicalCol: number): string {
  return labels[physicalCol] ?? columnIndexToLabel(physicalCol);
}

function parseWidth(raw: string): number | null {
  if (raw.trim() === '') {
    return null;
  }
  const width = Number(raw);
  return Number.isFinite(width) ? Math.max(MIN_COLUMN_WIDTH, width) : null;
}

export function LatticaColumnSettings({
  controller,
  columns,
  theme: themeProp,
  showVisibility = true,
  showWidths = false,
  title = 'Columns',
  className,
  style,
}: LatticaColumnSettingsProps): ReactElement {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const offChange = controller.on('change', () => force());
    const offViewState = controller.on('viewstate', () => force());
    return () => {
      offChange();
      offViewState();
    };
  }, [controller]);

  const theme = resolveTheme(themeProp);
  const labels = columns === undefined ? [] : leafLabels(columns);
  const order = controller.view.cols.getOrder();
  const buttonStyle: CSSProperties = {
    padding: '4px 8px',
    border: `1px solid ${theme.headerGridLineColor}`,
    borderRadius: 4,
    background: theme.background,
    color: theme.textColor,
    cursor: 'pointer',
    font: 'inherit',
  };

  const commitWidth = (physicalCol: number, raw: string) => {
    const width = parseWidth(raw);
    if (width !== null) {
      controller.setColumnWidth(physicalCol, width);
    }
  };

  return (
    <div
      data-testid="lattica-colsettings"
      className={className}
      style={{
        width: 240,
        border: `1px solid ${theme.headerGridLineColor}`,
        background: theme.background,
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        fontSize: theme.fontSize,
        ...style,
      }}
    >
      <div
        style={{
          padding: '6px 8px',
          borderBottom: `1px solid ${theme.headerGridLineColor}`,
          background: theme.headerBackground,
          color: theme.headerTextColor,
          fontWeight: 600,
        }}
      >
        {title}
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto' }}>
        {order.map((physicalCol) => {
          const visible = !controller.isColumnHidden(physicalCol);
          const width = controller.colSizes.getSize(physicalCol);
          return (
            <div
              key={physicalCol}
              style={{
                display: 'grid',
                gridTemplateColumns: `${showVisibility ? '24px ' : ''}1fr${showWidths ? ' 72px' : ''}`,
                gap: 6,
                alignItems: 'center',
                padding: '5px 8px',
                borderBottom: `1px solid ${theme.gridLineColor}`,
              }}
            >
              {showVisibility && (
                <input
                  type="checkbox"
                  aria-label={`Show ${columnLabel(labels, physicalCol)}`}
                  data-testid={`lattica-colsettings-vis-${physicalCol}`}
                  checked={visible}
                  onChange={(e) => controller.setColumnVisible(physicalCol, e.target.checked)}
                />
              )}
              <span>{columnLabel(labels, physicalCol)}</span>
              {showWidths && (
                <input
                  type="number"
                  min={MIN_COLUMN_WIDTH}
                  data-testid={`lattica-colsettings-width-${physicalCol}`}
                  value={width}
                  onChange={(e) => commitWidth(physicalCol, e.target.value)}
                  onBlur={(e) => commitWidth(physicalCol, e.target.value)}
                  style={{
                    width: 64,
                    boxSizing: 'border-box',
                    border: `1px solid ${theme.headerGridLineColor}`,
                    color: theme.textColor,
                    background: theme.background,
                    font: 'inherit',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {(showVisibility || showWidths) && (
        <div style={{ display: 'flex', gap: 6, padding: 8, background: theme.headerBackground }}>
          {showVisibility && (
            <button
              type="button"
              data-testid="lattica-colsettings-showall"
              style={buttonStyle}
              onClick={() => controller.showAllColumns()}
            >
              Show all
            </button>
          )}
          {showWidths && (
            <button
              type="button"
              data-testid="lattica-colsettings-resetwidths"
              style={buttonStyle}
              onClick={() => controller.resetColumnWidths()}
            >
              Reset widths
            </button>
          )}
        </div>
      )}
    </div>
  );
}
