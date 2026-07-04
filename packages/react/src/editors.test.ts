import { describe, it, expect } from 'vitest';
import { editorKindForType, EditorRegistry, type CustomEditorFactory } from './editors.js';

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

describe('EditorRegistry', () => {
  const factory: CustomEditorFactory = () => ({});

  it('registers, reports, and resolves an editor kind', () => {
    const r = new EditorRegistry();
    expect(r.has('color')).toBe(false);
    expect(r.resolve('color')).toBeUndefined();
    r.registerEditor('color', factory);
    expect(r.has('color')).toBe(true);
    expect(r.resolve('color')).toEqual({ factory, commitOnOutsideClick: false });
  });

  it('honors the commitOnOutsideClick option', () => {
    const r = new EditorRegistry();
    r.registerEditor('picker', factory, { commitOnOutsideClick: true });
    expect(r.resolve('picker')?.commitOnOutsideClick).toBe(true);
    r.registerEditor('quiet', factory, {});
    expect(r.resolve('quiet')?.commitOnOutsideClick).toBe(false);
  });

  it('replaces an existing registration for the same kind', () => {
    const r = new EditorRegistry();
    const other: CustomEditorFactory = () => ({});
    r.registerEditor('color', factory);
    r.registerEditor('color', other, { commitOnOutsideClick: true });
    expect(r.resolve('color')).toEqual({ factory: other, commitOnOutsideClick: true });
  });

  it('unregisters and reports whether the kind existed', () => {
    const r = new EditorRegistry();
    r.registerEditor('color', factory);
    expect(r.unregister('color')).toBe(true);
    expect(r.unregister('color')).toBe(false);
    expect(r.has('color')).toBe(false);
  });
});
