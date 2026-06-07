# @lattica/ai

AI-native spreadsheet primitives for Lattica. Every feature is built on a
provider-agnostic `AIProvider` interface and a governance layer (`AIClient`)
that enforces a call budget and accumulates token usage, so the package never
depends on a specific model vendor. It ships a deterministic `MockProvider` for
tests and offline development, and a suite of grid-aware capabilities:
natural-language → formula/operation, AI-generated columns, smart fill (with a
deterministic rule fast-path), semantic search, schema inference, anomaly
detection, text operations, and a HITL workflow planner/runner.

## Install

```sh
pnpm add @lattica/ai
```

## API overview

### Provider & client

```ts
import { MockProvider, AIClient } from '@lattica/ai';

const provider = new MockProvider({ texts: ['=A1+B1'], objects: [{ formula: 'A1+B1' }] });
const client = new AIClient(provider, { maxCalls: 50, maxOutputTokens: 512 });

await client.generateText({ prompt: 'hi' });
client.getUsage();     // { inputTokens, outputTokens }
client.getCallCount();
```

### Natural language → formula

`nlToFormula` returns a validated `NlFormulaResult` (the formula is parsed by
`@lattica/formula`, so `valid`/`error` reflect real syntax checks).

```ts
import { nlToFormula, explainFormula, fixFormula } from '@lattica/ai';

const result = await nlToFormula(client, 'sum of column A', { context: 'A1:A20 is sales' });
result.formula; // e.g. '=SUM(A1:A20)'
result.valid;   // true when it parses

await explainFormula(client, '=VLOOKUP(A1,B:C,2,0)');
await fixFormula(client, '=SUM(A1:A', 'unexpected end of input');
```

### Generate a column & smart fill

```ts
import { generateColumn, smartFill } from '@lattica/ai';

const cells = await generateColumn(
  client,
  [['Acme', 'NY'], ['Globex', 'CA']],
  { template: 'Write a one-line tagline for {0} based in {1}.' },
);
cells[0]?.value;       // generated text
cells[0]?.provenance;  // { model, prompt, usage }

// smartFill prefers a deterministic rule; falls back to the client only if needed.
const filled = await smartFill(
  [{ input: 'john@x.com', output: 'john' }],
  ['jane@x.com', 'bob@x.com'],
  client,
); // ['jane', 'bob']
```

### Semantic search

```ts
import { SemanticIndex, cosineSimilarity, type Embedder } from '@lattica/ai';

const embedder: Embedder = (text) => /* your embedding model */ embed(text);
const index = new SemanticIndex(embedder);
await index.add('row-1', 'quarterly revenue report');
await index.add('row-2', 'office supplies invoice');
const hits = await index.search('earnings', 5); // [{ id, score }, …] by descending similarity
```

### NL → grid operation & workflow

`nlToOperation` returns a safe, validated `GridOperation` (sort/filter/summarize/none).
`planWorkflow` plans a list of `WorkflowStep`s restricted to allowed tool names,
and `WorkflowRunner` executes approved steps with a HITL approval callback and an
audit trail.

```ts
import { nlToOperation, planWorkflow, WorkflowRunner } from '@lattica/ai';

const op = await nlToOperation(client, 'sort by revenue descending', ['name', 'revenue']);
// e.g. { op: 'sort', col: 1, direction: 'desc' }

const steps = await planWorkflow(client, 'clean and sort the data', ['sort', 'filter']);
const runner = new WorkflowRunner((step) => apply(step));
const audit = runner.run(steps, (step) => step.tool !== 'filter'); // reject filters
```

### Other exports

- `inferCellType` / `inferColumnType` / `normalizeValue` / `detectDuplicateRows` — schema inference.
- `zScoreOutliers` / `iqrOutliers` / `detectColumnOutliers` (+ `mean`, `stddev`) — anomaly detection.
- `summarizeValues` / `translateValues` / `classifyValues` — bulk text operations.
- `inferRule` / `applyRule` (`FillRule`) — the deterministic fill primitives behind `smartFill`.
- `suggestRule` / `matchesSpec` / `fitRate` (`RuleSpec`) — rule generation.
- `withProvenance` (`Provenance`, `AICommand`) — attach model/usage provenance to AI-produced edits.
