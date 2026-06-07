import { describe, it, expect, vi } from 'vitest';
import { AsyncRowModel, type RowFetcher } from './async-rows.js';

/** A fetcher over a synthetic dataset of `total` rows; counts calls. */
function makeFetcher(total: number) {
  const calls: Array<{ offset: number; limit: number }> = [];
  const fetcher: RowFetcher<string> = (offset, limit) => {
    calls.push({ offset, limit });
    const rows: string[] = [];
    for (let i = offset; i < Math.min(offset + limit, total); i++) {
      rows.push(`row${i}`);
    }
    return Promise.resolve({ rows, total });
  };
  return { fetcher, calls };
}

describe('AsyncRowModel', () => {
  it('loads covering blocks for a range and serves cached rows', async () => {
    const { fetcher, calls } = makeFetcher(50);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    expect(m.getRow(5)).toBeUndefined(); // not loaded yet
    expect(m.isLoaded(5)).toBe(false);

    await m.ensureRange(5, 24); // blocks 0,1,2
    expect(calls.map((c) => c.offset)).toEqual([0, 10, 20]);
    expect(m.getTotal()).toBe(50);
    expect(m.isTotalKnown()).toBe(true);
    expect(m.isLoaded(5)).toBe(true);
    expect(m.getRow(5)).toBe('row5');
    expect(m.getRow(24)).toBe('row24');
    // Block 3 (index 30+) not requested.
    expect(m.getRow(30)).toBeUndefined();
  });

  it('does not refetch already-cached blocks', async () => {
    const { fetcher, calls } = makeFetcher(30);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    await m.ensureRange(0, 5); // block 0
    await m.ensureRange(0, 9); // block 0 again -> cached
    expect(calls).toHaveLength(1);
  });

  it('deduplicates concurrent requests for the same block', async () => {
    const { fetcher, calls } = makeFetcher(30);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    await Promise.all([m.ensureRange(0, 5), m.ensureRange(2, 8)]); // both need block 0 only
    expect(calls).toHaveLength(1);
  });

  it('notifies subscribers as blocks arrive and on invalidate', async () => {
    const { fetcher } = makeFetcher(20);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    const listener = vi.fn();
    const off = m.subscribe(listener);
    await m.ensureRange(0, 5);
    expect(listener).toHaveBeenCalledTimes(1);
    m.invalidate();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(m.isLoaded(0)).toBe(false);
    expect(m.getTotal()).toBe(0);
    expect(m.isTotalKnown()).toBe(false);
    off();
    m.invalidate();
    expect(listener).toHaveBeenCalledTimes(2); // unsubscribed
  });

  it('refetches after invalidate', async () => {
    const { fetcher, calls } = makeFetcher(20);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    await m.ensureRange(0, 5);
    m.invalidate();
    await m.ensureRange(0, 5);
    expect(calls).toHaveLength(2);
  });

  it('clamps negative indices and a negative range start', async () => {
    const { fetcher, calls } = makeFetcher(20);
    const m = new AsyncRowModel({ fetcher, blockSize: 10 });
    expect(m.getRow(-1)).toBeUndefined();
    await m.ensureRange(-5, 5); // clamps to block 0
    expect(calls.map((c) => c.offset)).toEqual([0]);
  });

  it('uses a default block size of 100 when unspecified', async () => {
    const { fetcher, calls } = makeFetcher(5);
    const m = new AsyncRowModel({ fetcher });
    await m.ensureRange(0, 0);
    expect(calls[0]!.limit).toBe(100);
  });

  it('defaults the block size and floors it to at least 1', async () => {
    const { fetcher, calls } = makeFetcher(5);
    const m = new AsyncRowModel({ fetcher, blockSize: 0 }); // -> 1
    await m.ensureRange(0, 2);
    expect(calls.map((c) => c.limit)).toEqual([1, 1, 1]);
    expect(m.getRow(2)).toBe('row2');
  });
});
