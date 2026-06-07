import { describe, it, expect } from 'vitest';
import { densityPresets, getDensity, scaleDensity, comfortableDensity } from './density.js';

describe('density presets', () => {
  it('orders metrics compact < comfortable < spacious', () => {
    expect(densityPresets.compact.defaultRowHeight).toBeLessThan(comfortableDensity.defaultRowHeight);
    expect(comfortableDensity.defaultRowHeight).toBeLessThan(densityPresets.spacious.defaultRowHeight);
    expect(densityPresets.compact.cellPaddingX).toBeLessThan(densityPresets.spacious.cellPaddingX);
  });

  it('getDensity returns the preset by name', () => {
    expect(getDensity('comfortable')).toBe(comfortableDensity);
  });
});

describe('scaleDensity', () => {
  it('scales metrics but keeps font size', () => {
    const scaled = scaleDensity(comfortableDensity, 2);
    expect(scaled.fontSize).toBe(comfortableDensity.fontSize);
    expect(scaled.defaultRowHeight).toBe(comfortableDensity.defaultRowHeight * 2);
    expect(scaled.cellPaddingX).toBe(comfortableDensity.cellPaddingX * 2);
  });

  it('rounds and clamps the factor to a positive minimum', () => {
    const scaled = scaleDensity(comfortableDensity, 0); // clamped to 0.1
    expect(scaled.defaultRowHeight).toBe(Math.round(comfortableDensity.defaultRowHeight * 0.1));
    const odd = scaleDensity({ ...comfortableDensity, cellPaddingX: 5 }, 1.5);
    expect(odd.cellPaddingX).toBe(8); // round(7.5)
  });
});
