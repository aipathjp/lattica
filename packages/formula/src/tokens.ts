/** Token kinds produced by the {@link lexer}. */
export type TokenType =
  | 'number'
  | 'string'
  | 'boolean'
  | 'reference' // A1 / $A$1
  | 'identifier' // function name or named range
  | 'error' // #DIV/0! etc
  | 'op' // + - * / ^ & = <> < > <= >= % :
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'eof';

export interface Token {
  readonly type: TokenType;
  readonly value: string;
  /** Source offset of the token's first character. */
  readonly pos: number;
}
