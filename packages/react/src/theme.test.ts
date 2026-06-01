import { describe, it, expect } from 'vitest';
import { defaultTheme, resolveTheme } from './theme.js';

describe('resolveTheme', () => {
  it('returns the default theme when no override is given', () => {
    expect(resolveTheme()).toBe(defaultTheme);
  });
  it('merges a partial override', () => {
    const theme = resolveTheme({ textColor: '#000', fontSize: 16 });
    expect(theme.textColor).toBe('#000');
    expect(theme.fontSize).toBe(16);
    expect(theme.background).toBe(defaultTheme.background);
  });
});
