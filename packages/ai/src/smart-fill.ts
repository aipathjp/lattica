/**
 * Smart fill (Phase A4).
 *
 * Given a handful of `input -> output` examples, infer the transformation and
 * apply it to a set of remaining inputs. The inference is deliberately
 * deterministic: {@link inferRule} tries a small, ordered family of pure rules
 * (identity, upper/lower-casing, prefixing, suffixing, splitting on a
 * separator) and only returns one when it explains *every* example. When no
 * deterministic rule fits, {@link smartFill} falls back to the injected
 * {@link AIClient}; with neither a rule nor a client it throws. Keeping the
 * happy path model-free makes the common case fast, free and fully testable.
 */

import type { AIClient } from './client.js';

/** A deterministic transformation inferred from examples. */
export type FillRule =
  | { kind: 'identity' }
  | { kind: 'upper' }
  | { kind: 'lower' }
  | { kind: 'prefix'; text: string }
  | { kind: 'suffix'; text: string }
  | { kind: 'splitField'; sep: string; index: number };

/** A single `input -> output` demonstration. */
export interface FillExample {
  input: string;
  output: string;
}

/** Result shape the model is asked to return on the AI fallback path. */
interface SmartFillObject {
  values: string[];
}

const SMART_FILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['values'],
  properties: {
    values: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Candidate separators tried, in order, for the `splitField` rule. */
const SPLIT_SEPARATORS = [',', '\t', ' ', '-', '_', '/', '|', ';', ':', '.'] as const;

/** True when `rule` reproduces `output` from `input` for every example. */
function fitsAll(rule: FillRule, examples: readonly FillExample[]): boolean {
  return examples.every((ex) => applyRule(rule, ex.input) === ex.output);
}

/**
 * Try to derive a single prefix that turns each input into its output, i.e.
 * every output equals `text + input`. Returns the rule when consistent across
 * all examples, otherwise `null`.
 */
function inferPrefix(examples: readonly FillExample[]): FillRule | null {
  let text: string | null = null;
  for (const ex of examples) {
    if (!ex.output.endsWith(ex.input)) {
      return null;
    }
    const candidate = ex.output.slice(0, ex.output.length - ex.input.length);
    if (text === null) {
      text = candidate;
    } else if (text !== candidate) {
      return null;
    }
  }
  // A non-empty example set with an empty prefix is just identity; the
  // identity rule (tried earlier) already owns that case, so by the time we get
  // here `text` is a non-empty string. The guard below is defensive.
  /* v8 ignore next 3 -- empty/null prefix is owned by identity, unreachable here */
  if (text === null || text === '') {
    return null;
  }
  const rule: FillRule = { kind: 'prefix', text };
  // A consistent prefix necessarily reproduces every example, so fitsAll is
  // always true here; the re-check is a belt-and-braces guard.
  /* v8 ignore next -- fitsAll is always true for a consistent prefix */
  return fitsAll(rule, examples) ? rule : null;
}

/**
 * Try to derive a single suffix that turns each input into its output, i.e.
 * every output equals `input + text`.
 */
function inferSuffix(examples: readonly FillExample[]): FillRule | null {
  let text: string | null = null;
  for (const ex of examples) {
    if (!ex.output.startsWith(ex.input)) {
      return null;
    }
    const candidate = ex.output.slice(ex.input.length);
    if (text === null) {
      text = candidate;
    } else if (text !== candidate) {
      return null;
    }
  }
  // As with prefixes, an empty suffix means identity, already handled earlier.
  /* v8 ignore next 3 -- empty/null suffix is owned by identity, unreachable here */
  if (text === null || text === '') {
    return null;
  }
  const rule: FillRule = { kind: 'suffix', text };
  // A consistent suffix necessarily reproduces every example.
  /* v8 ignore next -- fitsAll is always true for a consistent suffix */
  return fitsAll(rule, examples) ? rule : null;
}

/**
 * Try to derive a `splitField` rule: split each input on a separator and take
 * a fixed index. Separators and indices are searched in a stable order and the
 * first combination consistent with every example wins.
 */
function inferSplitField(examples: readonly FillExample[]): FillRule | null {
  for (const sep of SPLIT_SEPARATORS) {
    // Only consider separators that actually appear in the first input, so we
    // don't manufacture a degenerate single-part split.
    const first = examples[0];
    /* v8 ignore next 3 -- inferRule guards against an empty example set */
    if (first === undefined) {
      continue;
    }
    const parts = first.input.split(sep);
    if (parts.length < 2) {
      continue;
    }
    for (let index = 0; index < parts.length; index++) {
      const rule: FillRule = { kind: 'splitField', sep, index };
      if (fitsAll(rule, examples)) {
        return rule;
      }
    }
  }
  return null;
}

/**
 * Infer a {@link FillRule} from examples, trying rule kinds in priority order
 * (identity → upper → lower → prefix → suffix → splitField). Returns the first
 * rule that reproduces every example, or `null` when none fit (including the
 * empty example set, which is unconstrained and so inferable as nothing).
 */
export function inferRule(examples: readonly FillExample[]): FillRule | null {
  if (examples.length === 0) {
    return null;
  }

  const identity: FillRule = { kind: 'identity' };
  if (fitsAll(identity, examples)) {
    return identity;
  }

  const upper: FillRule = { kind: 'upper' };
  if (fitsAll(upper, examples)) {
    return upper;
  }

  const lower: FillRule = { kind: 'lower' };
  if (fitsAll(lower, examples)) {
    return lower;
  }

  const prefix = inferPrefix(examples);
  if (prefix !== null) {
    return prefix;
  }

  const suffix = inferSuffix(examples);
  if (suffix !== null) {
    return suffix;
  }

  return inferSplitField(examples);
}

/** Apply a {@link FillRule} to a single input string. */
export function applyRule(rule: FillRule, input: string): string {
  switch (rule.kind) {
    case 'identity':
      return input;
    case 'upper':
      return input.toUpperCase();
    case 'lower':
      return input.toLowerCase();
    case 'prefix':
      return rule.text + input;
    case 'suffix':
      return input + rule.text;
    case 'splitField': {
      const parts = input.split(rule.sep);
      return parts[rule.index] ?? '';
    }
  }
}

/**
 * Fill `inputs` by transforming each one the way the `examples` demonstrate.
 *
 * Prefers a deterministic rule from {@link inferRule}; when none fits it asks
 * the injected {@link AIClient} for a `{ values: string[] }` object. Throws
 * when there is neither a deterministic rule nor a client to fall back on.
 */
export async function smartFill(
  examples: readonly FillExample[],
  inputs: readonly string[],
  client?: AIClient,
): Promise<string[]> {
  const rule = inferRule(examples);
  if (rule !== null) {
    return inputs.map((input) => applyRule(rule, input));
  }

  if (client === undefined) {
    throw new Error('no rule and no client');
  }

  const exampleLines = examples.map((ex) => `${ex.input} -> ${ex.output}`).join('\n');
  const inputLines = inputs.map((input) => `${input}`).join('\n');
  const { object } = await client.generateObject<SmartFillObject>({
    system:
      'You infer a transformation from input->output examples and apply it to new inputs. Return only the transformed values, one per input, in order.',
    prompt: `Examples:\n${exampleLines}\n\nApply the same transformation to these inputs (return ${inputs.length} values in order):\n${inputLines}`,
    schema: SMART_FILL_SCHEMA,
  });
  // Guard the model output: a wrong-length response falls back to the inputs
  // unchanged (mirrors the defensive contract in text-ops).
  if (!Array.isArray(object.values) || object.values.length !== inputs.length) {
    return [...inputs];
  }
  return object.values;
}
