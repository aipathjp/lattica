import { describe, expect, it } from 'vitest';
import { normalizeTimeInput, sanitizeTimeDraft } from './time-input.js';

describe('time input helpers', () => {
  it.each([
    ['9', '09:00'],
    ['09', '09:00'],
    ['930', '09:30'],
    ['1330', '13:30'],
    ['9:30', '09:30'],
    ['13:30', '13:30'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeTimeInput(raw)).toBe(expected);
  });

  it.each(['25:00', '12:60', '', 'abc', '12345', '1:2'])('rejects %s', (raw) => {
    expect(normalizeTimeInput(raw)).toBeNull();
  });

  it('keeps only digits and colons in drafts', () => {
    expect(sanitizeTimeDraft('a1b2:3-4')).toBe('12:34');
  });
});
