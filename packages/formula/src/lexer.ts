/**
 * Lexer — turns a formula string (without the leading `=`) into a token stream.
 *
 * Clean-room, hand-written scanner. Recognizes numbers (incl. scientific
 * notation), double-quoted strings (with `""` escaping), boolean literals,
 * A1-style cell references, error literals (`#DIV/0!` ...), identifiers
 * (function / named-range names), and the spreadsheet operator set.
 */

import type { Token, TokenType } from './tokens.js';

const TWO_CHAR_OPS = new Set(['<>', '<=', '>=']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '^', '&', '=', '<', '>', '%', ':']);

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isLetter(ch: string): boolean {
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '_';
}

function isRefChar(ch: string): boolean {
  return isLetter(ch) || isDigit(ch) || ch === '$';
}

export class LexError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
    this.name = 'LexError';
  }
}

const REFERENCE_RE = /^\$?[A-Za-z]{1,3}\$?[0-9]+$/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  const push = (type: TokenType, value: string, pos: number) => {
    tokens.push({ type, value, pos });
  };

  while (i < n) {
    const ch = input[i]!;

    // Whitespace.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // String literal.
    if (ch === '"') {
      const start = i;
      i++;
      let value = '';
      let closed = false;
      while (i < n) {
        const c = input[i]!;
        if (c === '"') {
          if (input[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        value += c;
        i++;
      }
      if (!closed) {
        throw new LexError('unterminated string literal', start);
      }
      push('string', value, start);
      continue;
    }

    // Error literal: #...! or #N/A or #NAME? or #REF! etc.
    if (ch === '#') {
      const start = i;
      i++;
      let value = '#';
      while (i < n && /[A-Za-z0-9/?!]/.test(input[i]!)) {
        value += input[i]!;
        i++;
      }
      push('error', value, start);
      continue;
    }

    // Number (leading digit or .digit).
    if (isDigit(ch) || (ch === '.' && isDigit(input[i + 1] ?? ''))) {
      const start = i;
      let value = '';
      while (i < n && isDigit(input[i]!)) {
        value += input[i]!;
        i++;
      }
      if (input[i] === '.') {
        value += '.';
        i++;
        while (i < n && isDigit(input[i]!)) {
          value += input[i]!;
          i++;
        }
      }
      // Scientific notation.
      if (input[i] === 'e' || input[i] === 'E') {
        let j = i + 1;
        let exp = input[i]!;
        if (input[j] === '+' || input[j] === '-') {
          exp += input[j]!;
          j++;
        }
        if (isDigit(input[j] ?? '')) {
          while (j < n && isDigit(input[j]!)) {
            exp += input[j]!;
            j++;
          }
          value += exp;
          i = j;
        }
      }
      push('number', value, start);
      continue;
    }

    // Identifier, reference, or boolean.
    if (isLetter(ch) || ch === '$') {
      const start = i;
      let value = '';
      while (i < n && isRefChar(input[i]!)) {
        value += input[i]!;
        i++;
      }
      const upper = value.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        push('boolean', upper, start);
      } else if (REFERENCE_RE.test(value)) {
        push('reference', value, start);
      } else {
        push('identifier', value, start);
      }
      continue;
    }

    // Parentheses / comma.
    if (ch === '(') {
      push('lparen', ch, i++);
      continue;
    }
    if (ch === ')') {
      push('rparen', ch, i++);
      continue;
    }
    if (ch === ',') {
      push('comma', ch, i++);
      continue;
    }

    // Operators (two-char first).
    const two = input.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      push('op', two, i);
      i += 2;
      continue;
    }
    if (ONE_CHAR_OPS.has(ch)) {
      push('op', ch, i++);
      continue;
    }

    throw new LexError(`unexpected character "${ch}"`, i);
  }

  push('eof', '', n);
  return tokens;
}
