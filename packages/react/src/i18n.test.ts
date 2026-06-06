import { describe, it, expect, vi } from 'vitest';
import { I18n, enUS, jaJP, type Locale } from './i18n.js';

describe('locales', () => {
  it('expose the expected separators and messages', () => {
    expect(enUS.decimalSep).toBe('.');
    expect(enUS.groupSep).toBe(',');
    expect(enUS.messages['menu.copy']).toBe('Copy');
    expect(enUS.messages['menu.paste']).toBe('Paste');
    expect(jaJP.decimalSep).toBe('.');
    expect(jaJP.groupSep).toBe(',');
    expect(jaJP.messages['menu.copy']).toBe('コピー');
  });
});

describe('I18n.t', () => {
  it('returns the message for a known key (hit)', () => {
    const i18n = new I18n();
    expect(i18n.t('menu.copy')).toBe('Copy');
  });

  it('returns the key itself for an unknown key (miss)', () => {
    const i18n = new I18n();
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });

  it('interpolates {name} placeholders from params', () => {
    const i18n = new I18n();
    expect(i18n.t('cell.error', { name: 'A1' })).toBe('Error in A1');
  });

  it('coerces numeric params to strings', () => {
    const i18n = new I18n();
    expect(i18n.t('cell.error', { name: 42 })).toBe('Error in 42');
  });

  it('leaves placeholders untouched when the matching param is missing', () => {
    const i18n = new I18n();
    expect(i18n.t('cell.error', { other: 'x' })).toBe('Error in {name}');
  });

  it('returns the template unchanged when no params are given', () => {
    const i18n = new I18n();
    expect(i18n.t('cell.error')).toBe('Error in {name}');
  });
});

describe('I18n.formatNumber', () => {
  const i18n = new I18n();

  it('formats a small integer with no grouping', () => {
    expect(i18n.formatNumber(42)).toBe('42');
  });

  it('groups integers in threes', () => {
    expect(i18n.formatNumber(1234567)).toBe('1,234,567');
  });

  it('formats with explicit fraction digits and rounding', () => {
    expect(i18n.formatNumber(1234567.891, 2)).toBe('1,234,567.89');
  });

  it('rounds up at the fraction boundary', () => {
    expect(i18n.formatNumber(2.345, 2)).toBe('2.35');
  });

  it('keeps existing decimals when fractionDigits is omitted', () => {
    expect(i18n.formatNumber(1234.5)).toBe('1,234.5');
  });

  it('handles zero fraction digits by rounding to an integer', () => {
    expect(i18n.formatNumber(1234.89, 0)).toBe('1,235');
  });

  it('formats negative numbers with a leading minus', () => {
    expect(i18n.formatNumber(-1234567.89, 2)).toBe('-1,234,567.89');
  });

  it('formats zero', () => {
    expect(i18n.formatNumber(0)).toBe('0');
    expect(i18n.formatNumber(0, 2)).toBe('0.00');
  });
});

describe('I18n locale management', () => {
  it('defaults to enUS', () => {
    expect(new I18n().getLocale()).toBe(enUS);
  });

  it('accepts a constructor locale', () => {
    expect(new I18n(jaJP).getLocale()).toBe(jaJP);
  });

  it('switches messages on setLocale', () => {
    const i18n = new I18n();
    expect(i18n.t('menu.copy')).toBe('Copy');
    i18n.setLocale(jaJP);
    expect(i18n.getLocale()).toBe(jaJP);
    expect(i18n.t('menu.copy')).toBe('コピー');
  });

  it('uses the active locale separators in formatNumber', () => {
    const custom: Locale = { id: 'x', messages: {}, decimalSep: ',', groupSep: '.' };
    const i18n = new I18n();
    i18n.setLocale(custom);
    expect(i18n.formatNumber(1234567.89, 2)).toBe('1.234.567,89');
  });

  it('emits to subscribers on setLocale', () => {
    const i18n = new I18n();
    const listener = vi.fn();
    i18n.subscribe(listener);
    i18n.setLocale(jaJP);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying after unsubscribe', () => {
    const i18n = new I18n();
    const listener = vi.fn();
    const unsubscribe = i18n.subscribe(listener);
    unsubscribe();
    i18n.setLocale(jaJP);
    expect(listener).not.toHaveBeenCalled();
  });
});
