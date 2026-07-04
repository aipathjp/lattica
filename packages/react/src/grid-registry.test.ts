import { describe, it, expect, vi } from 'vitest';
import {
  cancelAllEditing,
  commitAllEditing,
  registerGridInstance,
  type GridEditingHooks,
} from './grid-registry.js';

const hooks = (editing: () => boolean): GridEditingHooks & { commit: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> } => ({
  commit: vi.fn(editing),
  cancel: vi.fn(editing),
});

describe('grid-registry', () => {
  it('returns 0 from commitAllEditing/cancelAllEditing when nothing is registered', () => {
    expect(commitAllEditing()).toBe(0);
    expect(cancelAllEditing()).toBe(0);
  });

  it('commits every registered grid and counts only the ones that were editing', () => {
    const editing = hooks(() => true);
    const idle = hooks(() => false);
    const off1 = registerGridInstance(editing);
    const off2 = registerGridInstance(idle);

    expect(commitAllEditing()).toBe(1);
    expect(editing.commit).toHaveBeenCalledTimes(1);
    expect(idle.commit).toHaveBeenCalledTimes(1);
    expect(editing.cancel).not.toHaveBeenCalled();

    off1();
    off2();
  });

  it('cancels every registered grid and counts only the ones that were editing', () => {
    const a = hooks(() => true);
    const b = hooks(() => true);
    const offA = registerGridInstance(a);
    const offB = registerGridInstance(b);

    expect(cancelAllEditing()).toBe(2);
    expect(a.cancel).toHaveBeenCalledTimes(1);
    expect(b.cancel).toHaveBeenCalledTimes(1);
    expect(a.commit).not.toHaveBeenCalled();

    offA();
    offB();
  });

  it('stops reaching a grid once its unregister function runs (idempotently)', () => {
    const gone = hooks(() => true);
    const kept = hooks(() => true);
    const offGone = registerGridInstance(gone);
    registerGridInstance(kept)();

    offGone();
    offGone(); // double-unregister is a no-op

    expect(commitAllEditing()).toBe(0);
    expect(gone.commit).not.toHaveBeenCalled();
    expect(kept.commit).not.toHaveBeenCalled();
  });
});
