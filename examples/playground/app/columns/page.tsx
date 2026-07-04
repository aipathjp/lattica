'use client';

import { useEffect, useMemo, useState } from 'react';
import { deserializeState, serializeState, type ColumnNode, type GridStateSnapshot } from '@ai-path/tb-core';
import { LatticaColumnSettings, LatticaGrid, useGridController } from '@ai-path/tb-react';

const ORG_KEY = 'lattica-columns-org';
const USER_KEY = 'lattica-columns-user';
const COLS = 20;

function readState(key: string): GridStateSnapshot | null {
  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return null;
  }
  try {
    return deserializeState(raw);
  } catch {
    return null;
  }
}

function defaultColumnState(): GridStateSnapshot {
  return {
    version: 1,
    columnWidths: {},
    hiddenColumns: [],
    columnOrder: Array.from({ length: COLS }, (_, i) => i),
  };
}

export default function ColumnSettingsPage(): React.ReactElement {
  const controller = useGridController({ rowCount: 30, colCount: COLS, defaultColWidth: 96 });
  const [admin, setAdmin] = useState(false);
  const [message, setMessage] = useState('');
  const columns = useMemo<readonly ColumnNode[]>(
    () => Array.from({ length: COLS }, (_, i) => ({ headerName: `Col ${i + 1}` })),
    [],
  );

  useEffect(() => {
    for (let r = 0; r < 30; r++) {
      for (let c = 0; c < COLS; c++) {
        controller.setCellText(r, c, r === 0 ? `H${c + 1}` : `${String.fromCharCode(65 + (c % 26))}-${r + 1}`);
      }
    }
    const org = readState(ORG_KEY);
    const user = readState(USER_KEY);
    if (org !== null) {
      controller.applyViewState(org);
    }
    if (user !== null) {
      controller.applyViewState(user);
    }
  }, [controller]);

  const buttonStyle: React.CSSProperties = {
    padding: '6px 10px',
    border: '1px solid #cbd2d9',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Column Settings</h1>
      <p style={{ margin: 0, color: '#52606d', maxWidth: 980 }}>
        This page demonstrates layered view-state persistence: the org-wide default is applied first as the
        baseline, then the per-user state is applied on top as the override.
      </p>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            data-testid="mode-user"
            checked={!admin}
            onChange={() => setAdmin(false)}
          />
          User (visibility)
        </label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input
            type="radio"
            data-testid="mode-admin"
            checked={admin}
            onChange={() => setAdmin(true)}
          />
          Admin (visibility + widths)
        </label>
        <button
          type="button"
          data-testid="save-org-default"
          style={buttonStyle}
          onClick={() => {
            window.localStorage.setItem(ORG_KEY, serializeState(controller.captureViewState()));
            setMessage('Saved current columns as org default.');
          }}
        >
          Save as org default
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            window.localStorage.removeItem(USER_KEY);
            const org = readState(ORG_KEY);
            controller.applyViewState(org ?? defaultColumnState());
            setMessage(org === null ? 'Reset to default columns.' : 'Reset to org default.');
          }}
        >
          Reset to org default
        </button>
      </div>
      <div data-testid="columns-message" style={{ color: '#0b7', minHeight: 18 }}>{message}</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto' }}>
        <div style={{ border: '1px solid #cbd2d9', borderRadius: 6, width: 'fit-content' }}>
          <LatticaGrid
            controller={controller}
            columns={columns}
            width={820}
            height={430}
            onViewStateChange={(snapshot) => {
              window.localStorage.setItem(USER_KEY, serializeState(snapshot));
            }}
          />
        </div>
        <LatticaColumnSettings controller={controller} columns={columns} showWidths={admin} />
      </div>
    </main>
  );
}
