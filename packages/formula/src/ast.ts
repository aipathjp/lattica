/** Abstract syntax tree for parsed formulas. */

import type { A1Reference } from '@lattica/core';

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '&'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>=';

export type UnaryOperator = '-' | '+' | '%';

export interface NumberLit {
  readonly kind: 'number';
  readonly value: number;
}

export interface StringLit {
  readonly kind: 'string';
  readonly value: string;
}

export interface BooleanLit {
  readonly kind: 'boolean';
  readonly value: boolean;
}

export interface ErrorLit {
  readonly kind: 'error';
  readonly value: string;
}

export interface ReferenceNode {
  readonly kind: 'reference';
  readonly ref: A1Reference;
}

export interface RangeNode {
  readonly kind: 'range';
  readonly start: A1Reference;
  readonly end: A1Reference;
}

export interface UnaryNode {
  readonly kind: 'unary';
  readonly op: UnaryOperator;
  readonly operand: AstNode;
}

export interface BinaryNode {
  readonly kind: 'binary';
  readonly op: BinaryOperator;
  readonly left: AstNode;
  readonly right: AstNode;
}

export interface FunctionCallNode {
  readonly kind: 'call';
  readonly name: string;
  readonly args: readonly AstNode[];
}

export interface NameNode {
  readonly kind: 'name';
  readonly name: string;
}

export type AstNode =
  | NumberLit
  | StringLit
  | BooleanLit
  | ErrorLit
  | ReferenceNode
  | RangeNode
  | UnaryNode
  | BinaryNode
  | FunctionCallNode
  | NameNode;
