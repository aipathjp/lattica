import { describe, it, expect } from 'vitest';
import {
  parseDelimited,
  serializeDelimited,
  parseTsv,
  serializeTsv,
} from './delimited.js';

describe('parseDelimited', () => {
  it('parses simple rows', () => {
    expect(parseDelimited('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with embedded delimiter, quote, and newline', () => {
    expect(parseDelimited('"a,b","c""d","e\nf"')).toEqual([['a,b', 'c"d', 'e\nf']]);
  });

  it('normalizes CRLF and lone CR line endings', () => {
    expect(parseDelimited('a\r\nb\rc')).toEqual([['a'], ['b'], ['c']]);
  });

  it('preserves empty fields', () => {
    expect(parseDelimited('a,,c')).toEqual([['a', '', 'c']]);
    expect(parseDelimited(',')).toEqual([['', '']]);
  });

  it('does not emit a trailing empty row for a final newline', () => {
    expect(parseDelimited('a\nb\n')).toEqual([['a'], ['b']]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseDelimited('')).toEqual([]);
  });

  it('keeps a trailing empty field before EOF', () => {
    expect(parseDelimited('a,')).toEqual([['a', '']]);
  });

  it('supports a custom delimiter', () => {
    expect(parseDelimited('a;b;c', { delimiter: ';' })).toEqual([['a', 'b', 'c']]);
  });

  it('rejects a multi-character delimiter', () => {
    expect(() => parseDelimited('a', { delimiter: ';;' })).toThrow(RangeError);
  });

  it('parses TSV via helper', () => {
    expect(parseTsv('a\tb\t c')).toEqual([['a', 'b', ' c']]);
  });
});

describe('serializeDelimited', () => {
  it('serializes simple rows with CRLF', () => {
    expect(serializeDelimited([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  it('quotes fields needing escaping', () => {
    expect(serializeDelimited([['a,b', 'c"d', 'e\nf']])).toBe('"a,b","c""d","e\nf"');
  });

  it('leaves plain fields unquoted', () => {
    expect(serializeDelimited([['plain', 'text']])).toBe('plain,text');
  });

  it('round-trips through parse', () => {
    const data = [
      ['name', 'note'],
      ['Ann', 'likes "tea", and\ncoffee'],
      ['Bob', 'x,y,z'],
    ];
    expect(parseDelimited(serializeDelimited(data))).toEqual(data);
  });

  it('serializes TSV via helper', () => {
    expect(serializeTsv([['a', 'b']])).toBe('a\tb');
  });
});
