import { describe, it, expect } from 'vitest';
import { computeCellVisual, colorScaleAt, lerpColor, normalize, iconSetSize, iconColor } from './cf-visual.js';

describe('iconSetSize / iconColor', () => {
  it('reports the level count per set', () => {
    expect(iconSetSize('traffic')).toBe(3);
    expect(iconSetSize('signs')).toBe(3);
    expect(iconSetSize('arrows5')).toBe(5);
    expect(iconSetSize('ratings')).toBe(4);
  });
  it('ramps red→amber→green for colored sets', () => {
    expect(iconColor('traffic', 0, 3)).toBe('#e02d2d');
    expect(iconColor('traffic', 1, 3)).toBe('#f6b21b');
    expect(iconColor('traffic', 2, 3)).toBe('#2ca02c');
  });
  it('returns null for accent-colored sets and guards a single level', () => {
    expect(iconColor('ratings', 0, 4)).toBeNull();
    expect(iconColor('arrows', 0, 1)).toBe('#e02d2d');
  });
});

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

  it('icon set picks a level by bucket', () => {
    expect(computeCellVisual(0, 0, 9, { kind: 'iconSet', set: 'traffic' })?.icon).toEqual({ set: 'traffic', level: 0, total: 3 });
    expect(computeCellVisual(5, 0, 9, { kind: 'iconSet', set: 'traffic' })?.icon).toEqual({ set: 'traffic', level: 1, total: 3 });
    expect(computeCellVisual(9, 0, 9, { kind: 'iconSet', set: 'traffic' })?.icon).toEqual({ set: 'traffic', level: 2, total: 3 });
  });

  it('icon set size varies per named set', () => {
    expect(computeCellVisual(9, 0, 9, { kind: 'iconSet', set: 'arrows5' })?.icon).toEqual({ set: 'arrows5', level: 4, total: 5 });
    expect(computeCellVisual(9, 0, 9, { kind: 'iconSet', set: 'ratings' })?.icon).toEqual({ set: 'ratings', level: 3, total: 4 });
  });

  it('non-numeric values produce no visual', () => {
    expect(computeCellVisual('x', 0, 10, { kind: 'dataBar', color: '#39f' })).toBeNull();
    expect(computeCellVisual(null, 0, 10, { kind: 'dataBar', color: '#39f' })).toBeNull();
  });
});
