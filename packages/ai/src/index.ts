/** @lattica/ai — AI-native spreadsheet primitives for Lattica. */

export {
  MockProvider,
  type AIProvider,
  type AIUsage,
  type GenerateTextRequest,
  type GenerateObjectRequest,
  type GenerateTextResult,
  type GenerateObjectResult,
  type MockProviderOptions,
} from './provider.js';
export { withProvenance, type Provenance, type AICommand } from './provenance.js';
export { AIClient, type AILimits } from './client.js';
export {
  nlToFormula,
  explainFormula,
  fixFormula,
  type NlFormulaResult,
} from './nl-formula.js';
export {
  inferCellType,
  inferColumnType,
  normalizeValue,
  detectDuplicateRows,
  type InferredType,
  type DetectDuplicateRowsOptions,
} from './schema-infer.js';
export {
  cosineSimilarity,
  SemanticIndex,
  type Embedder,
  type SearchHit,
} from './semantic-search.js';
