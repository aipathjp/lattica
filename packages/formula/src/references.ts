/**
 * Reference extraction — walk a parsed formula and collect the set of cell keys
 * it depends on. Range references are expanded into individual cells so the
 * dependency graph can track fine-grained precedents.
 */

import { addressKey, type A1Reference } from '@lattica/core';
import type { AstNode } from './ast.js';

export interface ExtractOptions {
  /**
   * Guard against pathological ranges (e.g. whole columns). When a range
   * exceeds this many cells it is skipped during expansion; callers should
   * treat such formulas conservatively. Default 1,000,000.
   */
  maxRangeCells?: number;
}

/** Collect the distinct cell keys a formula references. */
export function extractReferences(node: AstNode, options: ExtractOptions = {}): Set<string> {
  const max = options.maxRangeCells ?? 1_000_000;
  const keys = new Set<string>();
  walk(node, keys, max);
  return keys;
}

function walk(node: AstNode, keys: Set<string>, max: number): void {
  switch (node.kind) {
    case 'reference':
      keys.add(refKey(node.ref));
      return;
    case 'range': {
      const top = Math.min(node.start.row, node.end.row);
      const bottom = Math.max(node.start.row, node.end.row);
      const left = Math.min(node.start.col, node.end.col);
      const right = Math.max(node.start.col, node.end.col);
      const area = (bottom - top + 1) * (right - left + 1);
      if (area > max) {
        return;
      }
      for (let row = top; row <= bottom; row++) {
        for (let col = left; col <= right; col++) {
          keys.add(`${row},${col}`);
        }
      }
      return;
    }
    case 'unary':
      walk(node.operand, keys, max);
      return;
    case 'binary':
      walk(node.left, keys, max);
      walk(node.right, keys, max);
      return;
    case 'call':
      for (const arg of node.args) {
        walk(arg, keys, max);
      }
      return;
    default:
      return;
  }
}

function refKey(ref: A1Reference): string {
  return addressKey({ row: ref.row, col: ref.col });
}
