import { describe, it, expect, vi } from 'vitest';

import { validators, ValidationModel, type Validator } from './validation.js';

describe('validators.numeric', () => {
  const v = validators.numeric();

  it('accepts finite numbers and numeric strings', async () => {
    expect(await v(42)).toBe(true);
    expect(await v(0)).toBe(true);
    expect(await v(-3.5)).toBe(true);
    expect(await v('  12.5 ')).toBe(true);
  });

  it('rejects non-finite numbers, non-numeric strings, empty, and non-number types', async () => {
    expect(await v(Number.NaN)).toBe(false);
    expect(await v(Number.POSITIVE_INFINITY)).toBe(false);
    expect(await v('abc')).toBe(false);
    expect(await v('')).toBe(false);
    expect(await v('   ')).toBe(false);
    expect(await v(null)).toBe(false);
    expect(await v(true)).toBe(false);
  });
});

describe('validators.integer', () => {
  const v = validators.integer();

  it('accepts integers and integer strings', async () => {
    expect(await v(7)).toBe(true);
    expect(await v('42')).toBe(true);
  });

  it('rejects fractional numbers and non-numeric input', async () => {
    expect(await v(7.5)).toBe(false);
    expect(await v('7.5')).toBe(false);
    expect(await v('abc')).toBe(false);
    expect(await v(null)).toBe(false);
  });
});

describe('validators.nonEmpty', () => {
  const v = validators.nonEmpty();

  it('accepts non-empty values', async () => {
    expect(await v('x')).toBe(true);
    expect(await v(0)).toBe(true);
    expect(await v(false)).toBe(true);
  });

  it('rejects null and empty string', async () => {
    expect(await v(null)).toBe(false);
    expect(await v('')).toBe(false);
  });
});

describe('validators.range', () => {
  const v = validators.range(1, 10);

  it('accepts values within the inclusive range', async () => {
    expect(await v(1)).toBe(true);
    expect(await v(10)).toBe(true);
    expect(await v('5')).toBe(true);
  });

  it('rejects out-of-range and non-numeric values', async () => {
    expect(await v(0)).toBe(false);
    expect(await v(11)).toBe(false);
    expect(await v('abc')).toBe(false);
    expect(await v(null)).toBe(false);
  });
});

describe('validators.list', () => {
  const v = validators.list(['a', 'b', 3]);

  it('accepts members', async () => {
    expect(await v('a')).toBe(true);
    expect(await v(3)).toBe(true);
  });

  it('rejects non-members', async () => {
    expect(await v('c')).toBe(false);
    expect(await v(null)).toBe(false);
  });
});

describe('validators.regex', () => {
  const v = validators.regex(/^\d{3}$/);

  it('accepts matching string forms', async () => {
    expect(await v('123')).toBe(true);
    expect(await v(456)).toBe(true);
  });

  it('rejects non-matching values', async () => {
    expect(await v('12')).toBe(false);
    expect(await v('abc')).toBe(false);
    expect(await v(null)).toBe(false);
  });
});

describe('ValidationModel validator resolution', () => {
  it('returns undefined with no validators', () => {
    const m = new ValidationModel();
    expect(m.getValidator(0, 0)).toBeUndefined();
  });

  it('resolves the column validator', () => {
    const m = new ValidationModel();
    const col = validators.numeric();
    m.setColumnValidator(2, col);
    expect(m.getValidator(0, 2)).toBe(col);
    expect(m.getValidator(5, 2)).toBe(col);
  });

  it('lets a cell validator override the column validator', () => {
    const m = new ValidationModel();
    const col = validators.numeric();
    const cell = validators.integer();
    m.setColumnValidator(2, col);
    m.setCellValidator(1, 2, cell);
    expect(m.getValidator(1, 2)).toBe(cell);
    expect(m.getValidator(0, 2)).toBe(col);
  });
});

describe('ValidationModel.validate', () => {
  it('returns true when no validator is configured', async () => {
    const m = new ValidationModel();
    expect(await m.validate(0, 0, 'anything')).toBe(true);
    expect(m.isInvalid(0, 0)).toBe(false);
  });

  it('marks a cell invalid on failure and unmarks on later success', async () => {
    const m = new ValidationModel();
    m.setColumnValidator(0, validators.numeric());

    expect(await m.validate(3, 0, 'nope')).toBe(false);
    expect(m.isInvalid(3, 0)).toBe(true);
    expect(m.getInvalid()).toEqual([{ row: 3, col: 0 }]);

    expect(await m.validate(3, 0, 42)).toBe(true);
    expect(m.isInvalid(3, 0)).toBe(false);
    expect(m.getInvalid()).toEqual([]);
  });

  it('honors cell-over-column precedence at validate time', async () => {
    const m = new ValidationModel();
    m.setColumnValidator(0, validators.numeric());
    m.setCellValidator(0, 0, validators.integer());

    // 7.5 is numeric (column would pass) but not integer (cell fails).
    expect(await m.validate(0, 0, 7.5)).toBe(false);
    expect(m.isInvalid(0, 0)).toBe(true);
  });

  it('awaits asynchronous validators', async () => {
    const m = new ValidationModel();
    const asyncValidator: Validator = (value) =>
      Promise.resolve(value === 'ok');
    m.setCellValidator(0, 0, asyncValidator);

    expect(await m.validate(0, 0, 'ok')).toBe(true);
    expect(m.isInvalid(0, 0)).toBe(false);

    expect(await m.validate(0, 0, 'bad')).toBe(false);
    expect(m.isInvalid(0, 0)).toBe(true);
  });
});

describe('ValidationModel invalid-set management', () => {
  it('clears the invalid set', async () => {
    const m = new ValidationModel();
    m.setColumnValidator(0, validators.nonEmpty());
    await m.validate(1, 0, '');
    await m.validate(2, 0, null);
    expect(m.getInvalid()).toHaveLength(2);

    m.clearInvalid();
    expect(m.getInvalid()).toEqual([]);
    expect(m.isInvalid(1, 0)).toBe(false);
  });
});

describe('ValidationModel.subscribe', () => {
  it('notifies on validate and clear, and stops after unsubscribe', async () => {
    const m = new ValidationModel();
    m.setColumnValidator(0, validators.numeric());
    const listener = vi.fn();
    const unsubscribe = m.subscribe(listener);

    await m.validate(0, 0, 'x');
    expect(listener).toHaveBeenCalledTimes(1);

    m.clearInvalid();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await m.validate(0, 0, 'y');
    m.clearInvalid();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not emit through validate when no validator exists', async () => {
    const m = new ValidationModel();
    const listener = vi.fn();
    m.subscribe(listener);
    await m.validate(0, 0, 'x');
    expect(listener).not.toHaveBeenCalled();
  });
});
