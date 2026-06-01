/**
 * Parser — a Pratt (top-down operator precedence) parser that turns the token
 * stream into an {@link AstNode}. Clean-room implementation.
 *
 * Precedence (low → high), matching Excel:
 *   comparison (= <> < > <= >=) < concat (&) < add/sub (+ -) <
 *   mul/div (* /) < unary minus < exponent (^) < percent (%) < range (:)
 */

import { parseA1, type A1Reference } from '@lattica/core';
import type { Token } from './tokens.js';
import { tokenize } from './lexer.js';
import type { AstNode, BinaryOperator } from './ast.js';

export class ParseError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

/** Left binding powers for infix operators. */
const INFIX_BP: Record<string, number> = {
  '=': 10,
  '<>': 10,
  '<': 10,
  '>': 10,
  '<=': 10,
  '>=': 10,
  '&': 20,
  '+': 30,
  '-': 30,
  '*': 40,
  '/': 40,
  '^': 60,
  ':': 80,
};

/** `^` is right-associative; everything else left-associative. */
function rightBp(op: string): number {
  const base = INFIX_BP[op]!;
  return op === '^' ? base - 1 : base;
}

const UNARY_BP = 50; // between mul/div and exponent

export class Parser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private expect(type: Token['type']): Token {
    const tok = this.peek();
    if (tok.type !== type) {
      throw new ParseError(`expected ${type} but got ${tok.type} "${tok.value}"`, tok.pos);
    }
    return this.next();
  }

  /** Parse the whole input, ensuring all tokens are consumed. */
  parse(): AstNode {
    const node = this.parseExpression(0);
    if (this.peek().type !== 'eof') {
      const tok = this.peek();
      throw new ParseError(`unexpected token "${tok.value}"`, tok.pos);
    }
    return node;
  }

  private parseExpression(minBp: number): AstNode {
    let left = this.parsePrefix();

    for (;;) {
      const tok = this.peek();

      // Postfix percent.
      if (tok.type === 'op' && tok.value === '%') {
        this.next();
        left = { kind: 'unary', op: '%', operand: left };
        continue;
      }

      if (tok.type !== 'op') {
        break;
      }
      const bp = INFIX_BP[tok.value];
      if (bp === undefined || bp < minBp) {
        break;
      }
      this.next();

      if (tok.value === ':') {
        // Range operator: both sides must be references.
        const right = this.parseExpression(rightBp(':'));
        left = this.makeRange(left, right, tok.pos);
        continue;
      }

      const right = this.parseExpression(rightBp(tok.value));
      left = { kind: 'binary', op: tok.value as BinaryOperator, left, right };
    }

    return left;
  }

  private parsePrefix(): AstNode {
    const tok = this.next();
    switch (tok.type) {
      case 'number':
        return { kind: 'number', value: Number(tok.value) };
      case 'string':
        return { kind: 'string', value: tok.value };
      case 'boolean':
        // TRUE / FALSE are also zero-arg functions in Excel: `TRUE()`.
        if (this.peek().type === 'lparen') {
          return this.parseCall(tok.value);
        }
        return { kind: 'boolean', value: tok.value === 'TRUE' };
      case 'error':
        return { kind: 'error', value: tok.value.toUpperCase() };
      case 'reference':
        // A token like `LOG10` matches the A1 pattern but is a function when
        // immediately followed by `(`.
        if (this.peek().type === 'lparen') {
          return this.parseCall(tok.value);
        }
        return { kind: 'reference', ref: parseA1(tok.value) };
      case 'identifier': {
        // Function call if followed by '(', otherwise a named reference.
        if (this.peek().type === 'lparen') {
          return this.parseCall(tok.value);
        }
        return { kind: 'name', name: tok.value };
      }
      case 'lparen': {
        const inner = this.parseExpression(0);
        this.expect('rparen');
        return inner;
      }
      case 'op': {
        if (tok.value === '-' || tok.value === '+') {
          const operand = this.parseExpression(UNARY_BP);
          return { kind: 'unary', op: tok.value, operand };
        }
        throw new ParseError(`unexpected operator "${tok.value}"`, tok.pos);
      }
      default:
        throw new ParseError(`unexpected token "${tok.value}"`, tok.pos);
    }
  }

  private parseCall(name: string): AstNode {
    this.expect('lparen');
    const args: AstNode[] = [];
    if (this.peek().type !== 'rparen') {
      args.push(this.parseExpression(0));
      while (this.peek().type === 'comma') {
        this.next();
        args.push(this.parseExpression(0));
      }
    }
    this.expect('rparen');
    return { kind: 'call', name: name.toUpperCase(), args };
  }

  private makeRange(left: AstNode, right: AstNode, pos: number): AstNode {
    if (left.kind !== 'reference' || right.kind !== 'reference') {
      throw new ParseError('range operator ":" requires cell references on both sides', pos);
    }
    const start: A1Reference = left.ref;
    const end: A1Reference = right.ref;
    return { kind: 'range', start, end };
  }
}

/** Convenience: tokenize + parse a formula body (without the leading `=`). */
export function parseFormula(input: string): AstNode {
  return new Parser(tokenize(input)).parse();
}
