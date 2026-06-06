/**
 * Bulk text operations over cell values (Part A / Phase A10).
 *
 * Three column-oriented helpers that delegate all model access to the injected
 * {@link AIClient}, so they are fully testable with a mock provider:
 *
 *   - {@link summarizeValues} condenses a column's values into one short text
 *     via {@link AIClient.generateText} over a joined sample.
 *   - {@link translateValues} translates each value into `targetLang` via
 *     {@link AIClient.generateObject}; if the model returns a list whose length
 *     does not match the input, it falls back to the originals.
 *   - {@link classifyValues} assigns each value one of `labels` via
 *     {@link AIClient.generateObject}; any out-of-set label is coerced to the
 *     first provided label, and a length mismatch fills with the first label.
 *
 * Empty inputs are handled without calling the model.
 */

import type { AIClient } from './client.js';

const TRANSLATIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['translations'],
  properties: {
    translations: { type: 'array', items: { type: 'string' } },
  },
} as const;

const LABELS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Options for {@link summarizeValues}. */
export interface SummarizeOptions {
  /** Soft target length for the summary, in words. */
  maxWords?: number;
}

/**
 * Summarize a column's values into a single short text.
 *
 * Returns an empty string for empty input without calling the model. Otherwise
 * joins the values into a newline-delimited sample and asks the model for a
 * concise summary, optionally constrained to `maxWords` words.
 */
export async function summarizeValues(
  client: AIClient,
  values: readonly string[],
  opts: SummarizeOptions = {},
): Promise<string> {
  if (values.length === 0) {
    return '';
  }
  const limit =
    opts.maxWords !== undefined ? ` in at most ${opts.maxWords} words` : '';
  const sample = values.join('\n');
  const { text } = await client.generateText({
    system: 'You summarize a list of spreadsheet values concisely and accurately.',
    prompt: `Summarize the following values${limit}:\n${sample}`,
  });
  return text;
}

/**
 * Translate each value into `targetLang`.
 *
 * Returns an empty array for empty input without calling the model. Otherwise
 * requests a `{ translations: string[] }` object; if the returned array length
 * does not match the input length, falls back to the original values.
 */
export async function translateValues(
  client: AIClient,
  values: readonly string[],
  targetLang: string,
): Promise<string[]> {
  if (values.length === 0) {
    return [];
  }
  const sample = values.join('\n');
  const { object } = await client.generateObject<{ translations: string[] }>({
    system: `You translate each line of input into ${targetLang}, preserving order.`,
    prompt: `Translate each of the following ${values.length} values into ${targetLang}:\n${sample}`,
    schema: TRANSLATIONS_SCHEMA,
  });
  const { translations } = object;
  if (translations.length !== values.length) {
    return [...values];
  }
  return translations;
}

/**
 * Classify each value into one of `labels`.
 *
 * Returns an empty array for empty input without calling the model. Otherwise
 * requests a `{ labels: string[] }` object. Any returned label outside the
 * provided set is coerced to the first provided label; a length mismatch fills
 * the entire result with the first provided label.
 *
 * Callers must supply at least one label; an empty `labels` set is a usage
 * error (there is no valid value to assign).
 */
export async function classifyValues(
  client: AIClient,
  values: readonly string[],
  labels: readonly string[],
): Promise<string[]> {
  if (values.length === 0) {
    return [];
  }
  const fallback = labels[0];
  if (fallback === undefined) {
    throw new Error('classifyValues: at least one label is required');
  }
  const allowed = new Set(labels);
  const sample = values.join('\n');
  const { object } = await client.generateObject<{ labels: string[] }>({
    system: `You classify each line of input into exactly one of these labels: ${labels.join(', ')}. Preserve order.`,
    prompt: `Classify each of the following ${values.length} values:\n${sample}`,
    schema: LABELS_SCHEMA,
  });
  const result = object.labels;
  if (result.length !== values.length) {
    return values.map(() => fallback);
  }
  return result.map((label) => (allowed.has(label) ? label : fallback));
}
