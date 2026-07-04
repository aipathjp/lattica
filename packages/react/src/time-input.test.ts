import { describe, expect, it } from 'vitest';
import {
  excelTimeSerialToHhMm,
  normalizeFlexibleTimeInput,
  normalizeTimeInput,
  sanitizeFlexibleTimeDraft,
  sanitizeTimeDraft,
} from './time-input.js';

describe('time input helpers', () => {
  it.each([
    ['9', '09:00'],
    ['09', '09:00'],
    ['18', '18:00'],
    ['930', '09:30'],
    ['635', '06:35'],
    ['1330', '13:30'],
    ['1613', '16:13'],
    ['9:30', '09:30'],
    ['13:30', '13:30'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizeTimeInput(raw)).toBe(expected);
  });

  it.each(['25:00', '12:60', '', 'abc', '12345', '1:2', '2460', '970', '24'])('rejects %s', (raw) => {
    expect(normalizeTimeInput(raw)).toBeNull();
  });

  it('keeps only digits and colons in drafts', () => {
    expect(sanitizeTimeDraft('a1b2:3-4')).toBe('12:34');
  });

  it('additionally keeps dots in flexible drafts', () => {
    expect(sanitizeFlexibleTimeDraft('a1b.2:3-4')).toBe('1.2:34');
  });
});

describe('excelTimeSerialToHhMm', () => {
  it.each([
    [0.5, '12:00'],
    [0.6875, '16:30'],
    [0.25, '06:00'],
  ])('converts serial %d to %s', (serial, expected) => {
    expect(excelTimeSerialToHhMm(serial)).toBe(expected);
  });

  it('rounds to the nearest minute and wraps a full day to 00:00', () => {
    expect(excelTimeSerialToHhMm(0.99999)).toBe('00:00');
  });

  it.each([0, 1, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects out-of-range serial %d', (serial) => {
    expect(excelTimeSerialToHhMm(serial)).toBeNull();
  });
});

describe('normalizeFlexibleTimeInput', () => {
  it('normalizes clock times regardless of options', () => {
    expect(normalizeFlexibleTimeInput('1613')).toBe('16:13');
    expect(normalizeFlexibleTimeInput(' 9:30 ', { timeOrDecimalHours: true })).toBe('09:30');
    expect(normalizeFlexibleTimeInput('18', { excelTimeSerial: true })).toBe('18:00');
  });

  it('rejects decimals when no decimal mode is enabled', () => {
    expect(normalizeFlexibleTimeInput('1.5')).toBeNull();
    expect(normalizeFlexibleTimeInput('0.5', { timeOrDecimalHours: false })).toBeNull();
  });

  it('keeps decimal hours verbatim in timeOrDecimalHours mode', () => {
    expect(normalizeFlexibleTimeInput('1.5', { timeOrDecimalHours: true })).toBe('1.5');
    expect(normalizeFlexibleTimeInput('.25', { timeOrDecimalHours: true })).toBe('.25');
    expect(normalizeFlexibleTimeInput('0.5', { timeOrDecimalHours: true })).toBe('0.5');
  });

  it('converts Excel time serials in excelTimeSerial mode', () => {
    expect(normalizeFlexibleTimeInput('0.5', { excelTimeSerial: true })).toBe('12:00');
    expect(normalizeFlexibleTimeInput('.25', { excelTimeSerial: true })).toBe('06:00');
  });

  it('rejects decimals outside (0,1) when only excelTimeSerial is enabled', () => {
    expect(normalizeFlexibleTimeInput('1.5', { excelTimeSerial: true })).toBeNull();
    expect(normalizeFlexibleTimeInput('0.0', { excelTimeSerial: true })).toBeNull();
  });

  it('prefers the serial conversion over decimal hours for 0<x<1 when both are enabled', () => {
    const both = { excelTimeSerial: true, timeOrDecimalHours: true };
    expect(normalizeFlexibleTimeInput('0.5', both)).toBe('12:00');
    expect(normalizeFlexibleTimeInput('1.5', both)).toBe('1.5');
  });

  it('rejects empty and non-time text', () => {
    expect(normalizeFlexibleTimeInput('', { timeOrDecimalHours: true })).toBeNull();
    expect(normalizeFlexibleTimeInput('abc', { timeOrDecimalHours: true })).toBeNull();
  });
});
