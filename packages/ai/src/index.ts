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
export {
  renderTemplate,
  generateColumn,
  type AiColumnCell,
  type AiColumnOptions,
} from './ai-column.js';
export {
  inferRule,
  applyRule,
  smartFill,
  type FillRule,
  type FillExample,
} from './smart-fill.js';
export { isValidOperation, nlToOperation, type GridOperation } from './nl-transform.js';
export {
  mean,
  stddev,
  zScoreOutliers,
  iqrOutliers,
  detectColumnOutliers,
  type Outlier,
} from './anomaly.js';
export {
  matchesSpec,
  fitRate,
  suggestRule,
  type RuleSpec,
  type SuggestRuleOptions,
} from './rule-gen.js';
export {
  summarizeValues,
  translateValues,
  classifyValues,
  type SummarizeOptions,
} from './text-ops.js';
export {
  planWorkflow,
  WorkflowRunner,
  type WorkflowStep,
  type AuditEntry,
  type StepExecutor,
  type PlanResult,
} from './workflow.js';
