import { describe, it, expect } from 'vitest';
import { tokenize, LexError } from './lexer.js';
import type { TokenType } from './tokens.js';

const types = (input: string): TokenType[] => tokenize(input).map((t) => t.type);
const values = (input: string): string[] => tokenize(input).map((t) => t.value);

describe('numbers', () => {
  it('lexes integers, decimals, and scientific notation', () => {
    expect(values('1')).toEqual(['1', '']);
    expect(values('3.14')).toEqual(['3.14', '']);
    expect(values('.5')).toEqual(['.5', '']);
    expect(values('1e3')).toEqual(['1e3', '']);
    expect(values('2.5E-2')).toEqual(['2.5E-2', '']);
    expect(values('1e+10')).toEqual(['1e+10', '']);
  });
  it('treats a trailing e without digits as separate tokens', () => {
    // "1e" -> number "1" then identifier "e"
    expect(types('1e')).toEqual(['number', 'identifier', 'eof']);
  });
});

describe('strings', () => {
  it('lexes a quoted string', () => {
    const toks = tokenize('"hello"');
    expect(toks[0]).toMatchObject({ type: 'string', value: 'hello' });
  });
  it('handles escaped quotes', () => {
    expect(tokenize('"a""b"')[0]!.value).toBe('a"b');
  });
  it('throws on an unterminated string', () => {
    expect(() => tokenize('"oops')).toThrow(LexError);
  });
});

describe('booleans and identifiers', () => {
  it('recognizes booleans case-insensitively', () => {
    expect(types('TRUE')).toEqual(['boolean', 'eof']);
    expect(types('false')).toEqual(['boolean', 'eof']);
    expect(tokenize('True')[0]!.value).toBe('TRUE');
  });
  it('treats function names as identifiers', () => {
    expect(types('SUM(')).toEqual(['identifier', 'lparen', 'eof']);
  });
});

describe('references', () => {
  it('lexes A1 and absolute references', () => {
    expect(types('A1')).toEqual(['reference', 'eof']);
    expect(types('$B$2')).toEqual(['reference', 'eof']);
    expect(types('AAA10')).toEqual(['reference', 'eof']);
  });
  it('treats long letter runs as identifiers, not references', () => {
    // ABCD is too long for a column label pattern -> identifier
    expect(types('ABCD')).toEqual(['identifier', 'eof']);
  });
});

describe('error literals', () => {
  it('lexes error tokens', () => {
    expect(tokenize('#DIV/0!')[0]).toMatchObject({ type: 'error', value: '#DIV/0!' });
    expect(tokenize('#N/A')[0]).toMatchObject({ type: 'error', value: '#N/A' });
    expect(tokenize('#NAME?')[0]).toMatchObject({ type: 'error', value: '#NAME?' });
  });
});

describe('operators and punctuation', () => {
  it('lexes one- and two-char operators', () => {
    expect(values('<>')).toEqual(['<>', '']);
    expect(values('<=')).toEqual(['<=', '']);
    expect(values('>=')).toEqual(['>=', '']);
    expect(types('1+2*3')).toEqual(['number', 'op', 'number', 'op', 'number', 'eof']);
    expect(types('A1:B2')).toEqual(['reference', 'op', 'reference', 'eof']);
    expect(types('5%')).toEqual(['number', 'op', 'eof']);
  });
  it('skips whitespace', () => {
    expect(types('  1 +\t2\n')).toEqual(['number', 'op', 'number', 'eof']);
  });
  it('throws on unexpected characters', () => {
    expect(() => tokenize('1 @ 2')).toThrow(LexError);
  });
  it('throws on a lone dot not starting a number', () => {
    expect(() => tokenize('.')).toThrow(LexError);
  });
});

describe('token positions', () => {
  it('records source offsets', () => {
    const toks = tokenize('A1+B2');
    expect(toks[0]!.pos).toBe(0);
    expect(toks[1]!.pos).toBe(2);
    expect(toks[2]!.pos).toBe(3);
  });
});
