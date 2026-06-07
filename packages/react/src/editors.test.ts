import { describe, it, expect } from 'vitest';
import { editorKindForType } from './editors.js';

describe('editorKindForType', () => {
  it('maps dropdown/select to dropdown', () => {
    expect(editorKindForType('dropdown')).toBe('dropdown');
    expect(editorKindForType('select')).toBe('dropdown');
  });

  it('maps date, autocomplete', () => {
    expect(editorKindForType('date')).toBe('date');
    expect(editorKindForType('autocomplete')).toBe('autocomplete');
  });

  it('maps checkbox/boolean and number/numeric', () => {
    expect(editorKindForType('checkbox')).toBe('checkbox');
    expect(editorKindForType('boolean')).toBe('checkbox');
    expect(editorKindForType('number')).toBe('number');
    expect(editorKindForType('numeric')).toBe('number');
  });

  it('falls back to text for unknown and undefined', () => {
    expect(editorKindForType('something')).toBe('text');
    expect(editorKindForType(undefined)).toBe('text');
  });
});
