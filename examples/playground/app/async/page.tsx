'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { AsyncRowModel, type RowFetcher } from '@lattica/data';

type Row = [string, string, number];

/** A mock "server": 10,000 rows, 150ms latency per block. */
const fetcher: RowFetcher<Row> = (offset, limit) =>
  new Promise((resolve) =>
    setTimeout(() => {
      const rows: Row[] = [];
      for (let i = offset; i < Math.min(offset + limit, 10_000); i++) {
        rows.push([`#${i}`, ['Tokyo', 'Osaka', 'Nagoya'][i % 3]!, (i * 37) % 1000]);
      }
      resolve({ rows, total: 10_000 });
    }, 150),
  );

export default function AsyncPage(): React.ReactElement {
  const modelRef = useRef<AsyncRowModel<Row> | null>(null);
  if (modelRef.current === null) modelRef.current = new AsyncRowModel<Row>({ fetcher, blockSize: 50 });
  const model = modelRef.current;
  const [, force] = useReducer((n: number) => n + 1, 0);
  const [start, setStart] = useState(0);
  const PAGE = 20;

  useEffect(() => {
    const off = model.subscribe(() => force());
    void model.ensureRange(start, start + PAGE - 1);
    return off;
  }, [model, start]);

  const rows = Array.from({ length: PAGE }, (_, i) => model.getRow(start + i));
  const btn: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #cbd2d9', borderRadius: 6, background: '#fff', cursor: 'pointer',
  };

  return (
    <main style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Async / Server-side Rows</h1>
      <p style={{ margin: 0, color: '#52606d' }}>
        <code>AsyncRowModel</code> lazily fetches fixed-size blocks (here 50 rows, 150ms latency) from a
        mock server of 10,000 rows. Scroll the window — unloaded rows show <i>loading…</i> until their
        block arrives. Total: <b data-testid="async-total">{model.getTotal()}</b>.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button style={btn} onClick={() => setStart((s) => Math.max(0, s - PAGE))}>◀ Prev</button>
        <span>rows {start}–{start + PAGE - 1}</span>
        <button style={btn} onClick={() => setStart((s) => s + PAGE)}>Next ▶</button>
      </div>
      <table style={{ borderCollapse: 'collapse', width: 420 }} data-testid="async-table">
        <thead>
          <tr style={{ background: '#f5f7fa' }}>
            <th style={th}>ID</th><th style={th}>Region</th><th style={th}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={start + i}>
              {row === undefined ? (
                <td style={td} colSpan={3}><i>loading…</i></td>
              ) : (
                <>
                  <td style={td}>{row[0]}</td><td style={td}>{row[1]}</td><td style={td}>{row[2]}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #cbd2d9', fontSize: 13 };
const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #eef1f4', fontSize: 13 };
