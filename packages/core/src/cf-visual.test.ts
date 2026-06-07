import { describe, it, expect } from 'vitest';
import { computeCellVisual, colorScaleAt, lerpColor, normalize } from './cf-visual.js';

describe('normalize', () => {
  it('positions a value within the domain', () => {
    expect(normalize(5, 0, 10)).toBe(0.5);
    expect(normalize(-5, 0, 10)).toBe(0); // clamped
    expect(normalize(15, 0, 10)).toBe(1); // clamped
  });
  it('returns 0 for a degenerate domain', () => {
    expect(normalize(5, 5, 5)).toBe(0);
  });
});

describe('lerpColor', () => {
  it('interpolates between two hex colors', () => {
    expect(lerpColor('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpColor('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpColor('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('expands 3-digit shorthand hex', () => {
    expect(lerpColor('#f00', '#f00', 0.5)).toBe('#ff0000');
  });
  it('clamps t', () => {
    expect(lerpColor('#000000', '#ffffff', 2)).toBe('#ffffff');
  });
});

describe('colorScaleAt', () => {
  it('two-color scale', () => {
    expect(colorScaleAt(['#000000', '#ffffff'], 0.5)).toBe('#808080');
  });
  it('three-color scale picks the right segment', () => {
    const colors = ['#ff0000', '#ffff00', '#00ff00'];
    expect(colorScaleAt(colors, 0)).toBe('#ff0000');
    expect(colorScaleAt(colors, 0.5)).toBe('#ffff00');
    expect(colorScaleAt(colors, 1)).toBe('#00ff00');
  });
});

describe('computeCellVisual', () => {
  it('color scale yields a background', () => {
    const v = computeCellVisual(5, 0, 10, { kind: 'colorScale', colors: ['#000000', '#ffffff'] });
    expect(v).toEqual({ background: '#808080' });
  });

  it('color scale needs at least two colors', () => {
    expect(computeCellVisual(5, 0, 10, { kind: 'colorScale', colors: ['#000'] })).toBeNull();
  });

  it('data bar yields a ratio + color', () => {
    expect(computeCellVisual(5, 0, 10, { kind: 'dataBar', color: '#39f' })).toEqual({
      bar: { ratio: 0.5, color: '#39f' },
    });
  });

  it('icon set picks an icon by bucket', () => {
    const icons = ['🔴', '🟡', '🟢'];
    expect(computeCellVisual(0, 0, 9, { kind: 'iconSet', icons })?.icon).toBe('🔴');
    expect(computeCellVisual(5, 0, 9, { kind: 'iconSet', icons })?.icon).toBe('🟡');
    expect(computeCellVisual(9, 0, 9, { kind: 'iconSet', icons })?.icon).toBe('🟢');
  });

  it('icon set needs at least one icon', () => {
    expect(computeCellVisual(5, 0, 10, { kind: 'iconSet', icons: [] })).toBeNull();
  });

  it('non-numeric values produce no visual', () => {
    expect(computeCellVisual('x', 0, 10, { kind: 'dataBar', color: '#39f' })).toBeNull();
    expect(computeCellVisual(null, 0, 10, { kind: 'dataBar', color: '#39f' })).toBeNull();
  });
});
