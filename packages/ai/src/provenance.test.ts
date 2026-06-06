import { describe, it, expect } from 'vitest';
import type { Command } from '@lattica/core';
import { withProvenance, type Provenance } from './provenance.js';

const provenance: Provenance = {
  model: 'mock',
  prompt: 'set A1 to 42',
  usage: { inputTokens: 5, outputTokens: 2 },
  rationale: 'because the user asked',
};

/** A trivial command that toggles a value and records apply/invert order. */
function makeCommand(log: string[]): Command {
  const apply: Command = {
    label: 'apply',
    apply(): void {
      log.push('apply');
    },
    invert(): Command {
      return {
        label: 'invert',
        apply(): void {
          log.push('invert');
        },
        invert(): Command {
          return apply;
        },
      };
    },
  };
  return apply;
}

describe('withProvenance', () => {
  it('preserves the wrapped command label and attaches provenance', () => {
    const log: string[] = [];
    const ai = withProvenance(makeCommand(log), provenance);
    expect(ai.label).toBe('apply');
    expect(ai.provenance).toEqual(provenance);
  });

  it('delegates apply to the wrapped command', () => {
    const log: string[] = [];
    const ai = withProvenance(makeCommand(log), provenance);
    ai.apply();
    expect(log).toEqual(['apply']);
  });

  it('invert returns an AICommand carrying the same provenance and works round-trip', () => {
    const log: string[] = [];
    const ai = withProvenance(makeCommand(log), provenance);

    ai.apply();
    const inverse = ai.invert();
    expect(inverse.provenance).toBe(provenance);
    expect(inverse.label).toBe('invert');

    inverse.apply();
    expect(log).toEqual(['apply', 'invert']);

    // Double invert reaches the original command again, still with provenance.
    const reapplied = inverse.invert();
    expect(reapplied.provenance).toBe(provenance);
    reapplied.apply();
    expect(log).toEqual(['apply', 'invert', 'apply']);
  });
});
