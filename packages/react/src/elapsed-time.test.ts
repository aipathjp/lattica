import { describe, expect, it } from 'vitest';
import {
  formatElapsedDisplay,
  normalizeElapsedInput,
  parseElapsedTime,
  sanitizeElapsedDraft,
} from './elapsed-time.js';

describe('sanitizeElapsedDraft', () => {
  it('keeps only digits and colons', () => {
    expect(sanitizeElapsedDraft('a3b0:1-5')).toBe('30:15');
  });
});

describe('parseElapsedTime', () => {
  it('parses H:MM without seconds', () => {
    expect(parseElapsedTime('30:15')).toEqual({ hours: 30, minutes: 15, seconds: null });
    expect(parseElapsedTime(' 0:05 ')).toEqual({ hours: 0, minutes: 5, seconds: null });
  });

  it('parses H:MM:SS with seconds', () => {
    expect(parseElapsedTime('125:07:59')).toEqual({ hours: 125, minutes: 7, seconds: 59 });
  });

  it.each(['', 'abc', '30', '30:5', '30:1x', '1:60', '1:00:60', ':15', '1:234'])(
    'rejects %s',
    (raw) => {
      expect(parseElapsedTime(raw)).toBeNull();
    },
  );
});

describe('normalizeElapsedInput', () => {
  it.each([
    ['30:15', '30:15'],
    ['005:30', '5:30'],
    ['0:05', '0:05'],
    ['1:02:03', '1:02:03'],
    [' 48:00 ', '48:00'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeElapsedInput(raw)).toBe(expected);
  });

  it.each(['', '1:60', '1.5', 'abc'])('rejects %s', (raw) => {
    expect(normalizeElapsedInput(raw)).toBeNull();
  });
});

describe('formatElapsedDisplay', () => {
  it.each([
    ['9:30', '09:30'],
    ['23:59', '23:59'],
    ['0:05', '00:05'],
    ['30:15', '1:06:15'],
    ['24:00', '1:00:00'],
    ['49:05', '2:01:05'],
  ])('formats %s as %s', (stored, expected) => {
    expect(formatElapsedDisplay(stored)).toBe(expected);
  });

  it('appends seconds when the stored value carries them', () => {
    expect(formatElapsedDisplay('9:30:07')).toBe('09:30:07');
    expect(formatElapsedDisplay('30:15:59')).toBe('1:06:15:59');
  });

  it('returns invalid text unchanged', () => {
    expect(formatElapsedDisplay('not a duration')).toBe('not a duration');
    expect(formatElapsedDisplay('')).toBe('');
  });
});
