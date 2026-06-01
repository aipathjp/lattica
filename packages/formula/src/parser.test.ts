import { describe, it, expect } from 'vitest';
import { parseFormula, Parser, ParseError } from './parser.js';
import { tokenize } from './lexer.js';
import type { AstNode } from './ast.js';

describe('literals', () => {
  it('parses numbers, strings, booleans, errors', () => {
    expect(parseFormula('42')).toEqual({ kind: 'number', value: 42 });
    expect(parseFormula('"hi"')).toEqual({ kind: 'string', value: 'hi' });
    expect(parseFormula('TRUE')).toEqual({ kind: 'boolean', value: true });
    expect(parseFormula('#N/A')).toEqual({ kind: 'error', value: '#N/A' });
  });
});

describe('references and ranges', () => {
  it('parses a cell reference', () => {
    expect(parseFormula('B2')).toMatchObject({ kind: 'reference', ref: { row: 1, col: 1 } });
  });
  it('parses a range', () => {
    const ast = parseFormula('A1:B3') as Extract<AstNode, { kind: 'range' }>;
    expect(ast.kind).toBe('range');
    expect(ast.start).toMatchObject({ row: 0, col: 0 });
    expect(ast.end).toMatchObject({ row: 2, col: 1 });
  });
  it('rejects ranges over non-references', () => {
    expect(() => parseFormula('1:2')).toThrow(ParseError);
  });
});

describe('operator precedence', () => {
  const bin = (ast: AstNode) => ast as Extract<AstNode, { kind: 'binary' }>;

  it('multiplies before adding', () => {
    const ast = bin(parseFormula('1+2*3'));
    expect(ast.op).toBe('+');
    expect(bin(ast.right).op).toBe('*');
  });
  it('exponent is right-associative', () => {
    // 2^3^2 = 2^(3^2)
    const ast = bin(parseFormula('2^3^2'));
    expect(ast.op).toBe('^');
    expect(ast.right).toMatchObject({ kind: 'binary', op: '^' });
  });
  it('comparison has lowest precedence', () => {
    const ast = bin(parseFormula('1+2=3'));
    expect(ast.op).toBe('=');
    expect(bin(ast.left).op).toBe('+');
  });
  it('concatenation binds looser than arithmetic', () => {
    const ast = bin(parseFormula('1&2+3'));
    expect(ast.op).toBe('&');
    expect(bin(ast.right).op).toBe('+');
  });
  it('parenthesized expressions override precedence', () => {
    const ast = bin(parseFormula('(1+2)*3'));
    expect(ast.op).toBe('*');
    expect(bin(ast.left).op).toBe('+');
  });
});

describe('unary operators', () => {
  it('parses unary minus and plus', () => {
    expect(parseFormula('-5')).toMatchObject({ kind: 'unary', op: '-' });
    expect(parseFormula('+A1')).toMatchObject({ kind: 'unary', op: '+' });
  });
  it('parses postfix percent', () => {
    expect(parseFormula('50%')).toMatchObject({ kind: 'unary', op: '%' });
  });
  it('binds unary minus tighter than multiply but looser than exponent', () => {
    // -2^2 = -(2^2) in Excel
    const ast = parseFormula('-2^2') as Extract<AstNode, { kind: 'unary' }>;
    expect(ast.kind).toBe('unary');
    expect(ast.operand).toMatchObject({ kind: 'binary', op: '^' });
  });
});

describe('function calls', () => {
  it('parses calls with zero, one, and many args', () => {
    expect(parseFormula('TRUE()')).toMatchObject({ kind: 'call', name: 'TRUE', args: [] });
    const sum = parseFormula('SUM(1,2,3)') as Extract<AstNode, { kind: 'call' }>;
    expect(sum.name).toBe('SUM');
    expect(sum.args).toHaveLength(3);
  });
  it('uppercases function names', () => {
    expect(parseFormula('sum(1)')).toMatchObject({ name: 'SUM' });
  });
  it('parses nested calls and ranges as args', () => {
    const ast = parseFormula('IF(A1>0,SUM(B1:B3),0)') as Extract<AstNode, { kind: 'call' }>;
    expect(ast.name).toBe('IF');
    expect(ast.args[1]).toMatchObject({ kind: 'call', name: 'SUM' });
  });
  it('treats a bare identifier as a name node', () => {
    expect(parseFormula('myRange')).toEqual({ kind: 'name', name: 'myRange' });
  });
});

describe('errors', () => {
  it('throws on trailing tokens', () => {
    expect(() => parseFormula('1 2')).toThrow(ParseError);
  });
  it('throws on missing closing paren', () => {
    expect(() => parseFormula('(1+2')).toThrow(ParseError);
  });
  it('throws on a dangling operator', () => {
    expect(() => parseFormula('1+')).toThrow(ParseError);
  });
  it('throws on an unexpected leading operator', () => {
    expect(() => parseFormula('*5')).toThrow(ParseError);
  });
  it('exposes the error position', () => {
    try {
      new Parser(tokenize('1 2')).parse();
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).pos).toBe(2);
    }
  });
});
