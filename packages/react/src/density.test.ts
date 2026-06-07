import { describe, it, expect } from 'vitest';
import {
  densityPresets,
  getDensity,
  scaleDensity,
  densityOptions,
  comfortableDensity,
  compactDensity,
} from './density.js';
import { GridController } from './controller.js';

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

describe('densityOptions', () => {
  it('derives controller sizing from a density name', () => {
    expect(densityOptions('compact')).toEqual({
      defaultRowHeight: compactDensity.defaultRowHeight,
      defaultColWidth: compactDensity.defaultColWidth,
      rowHeaderWidth: compactDensity.rowHeaderWidth,
      colHeaderHeight: compactDensity.colHeaderHeight,
    });
  });

  it('accepts an explicit token object', () => {
    expect(densityOptions(comfortableDensity).defaultRowHeight).toBe(comfortableDensity.defaultRowHeight);
  });

  it('wires into a GridController via spread', () => {
    const c = new GridController({ rowCount: 5, colCount: 5, ...densityOptions('spacious') });
    const g = c.geometry();
    expect(g.rowSizes.getSize(0)).toBe(densityPresets.spacious.defaultRowHeight);
    expect(g.rowHeaderWidth).toBe(densityPresets.spacious.rowHeaderWidth);
  });
});
