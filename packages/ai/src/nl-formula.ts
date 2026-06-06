/**
 * Natural-language ⇄ formula helpers (Part B / Phase A2).
 *
 * `nlToFormula` turns an instruction into an Excel-compatible formula, validated
 * with the clean-room {@link parseFormula}; `explainFormula` describes one in
 * plain language (short-circuiting on an unparseable input); `fixFormula`
 * proposes a correction. All model access goes through the injected
 * {@link AIClient}, so these are fully testable with a mock provider.
 */

import { parseFormula } from '@lattica/formula';
import type { AIClient } from './client.js';

export interface NlFormulaResult {
  /** The formula, normalized to a leading `=`. */
  formula: string;
  /** Whether it parsed successfully. */
  valid: boolean;
  /** Parser error message when `valid` is false. */
  error?: string;
}

const FORMULA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['formula'],
  properties: { formula: { type: 'string' } },
} as const;

/** Strip a single leading `=` from a formula string. */
function stripEquals(formula: string): string {
  return formula.startsWith('=') ? formula.slice(1) : formula;
}

/** Validate a model-produced formula, normalizing to a leading `=`. */
function validate(raw: string): NlFormulaResult {
  const body = stripEquals(raw);
  try {
    parseFormula(body);
    return { formula: `=${body}`, valid: true };
  } catch (err) {
    return { formula: `=${body}`, valid: false, error: (err as Error).message };
  }
}

/** Translate a natural-language instruction into a validated formula. */
export async function nlToFormula(
  client: AIClient,
  instruction: string,
  opts: { context?: string } = {},
): Promise<NlFormulaResult> {
  const context = opts.context !== undefined ? `\n\nContext:\n${opts.context}` : '';
  const { object } = await client.generateObject<{ formula: string }>({
    system:
      'You translate a natural-language request into a single Excel-compatible spreadsheet formula. Return only the formula.',
    prompt: `${instruction}${context}`,
    schema: FORMULA_SCHEMA,
  });
  return validate(object.formula);
}

/** Explain a formula in plain language; returns a message without calling the model if it is unparseable. */
export async function explainFormula(client: AIClient, formula: string): Promise<string> {
  const body = stripEquals(formula);
  try {
    parseFormula(body);
  } catch (err) {
    return `Cannot explain an invalid formula: ${(err as Error).message}`;
  }
  const { text } = await client.generateText({
    system: 'You explain spreadsheet formulas concisely and accurately.',
    prompt: `Explain this spreadsheet formula in plain language:\n=${body}`,
  });
  return text;
}

/** Propose a corrected formula given the original and its error text. */
export async function fixFormula(
  client: AIClient,
  formula: string,
  errorText: string,
): Promise<NlFormulaResult> {
  const body = stripEquals(formula);
  const { object } = await client.generateObject<{ formula: string }>({
    system: 'You fix broken spreadsheet formulas. Return only the corrected formula.',
    prompt: `The formula "=${body}" produced this error: ${errorText}. Provide a corrected formula.`,
    schema: FORMULA_SCHEMA,
  });
  return validate(object.formula);
}
