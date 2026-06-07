# @lattica/mcp

Exposes a Lattica grid to AI agents as a transport-agnostic tool registry. Each
`GridTool` bundles a stable name, a description, a JSON-schema input definition,
and a synchronous handler over a `@lattica/formula` `SheetEngine` — the handlers
know nothing about MCP wire framing or networking. The `ToolDispatcher` wraps a
tool list with name lookup and a uniform `{ ok, output | error }` result, so a
thin MCP server (or any agent loop) can marshal calls without bespoke glue.

## Install

```sh
pnpm add @lattica/mcp
```

## API overview

### createGridTools + ToolDispatcher

`createGridTools(engine)` returns the standard tool set bound to one engine:
`get_cell`, `set_cell`, `get_range`, `evaluate`, and `define_name`. Feed it to a
`ToolDispatcher` to list and call tools safely.

```ts
import { SheetEngine } from '@lattica/formula';
import { createGridTools, ToolDispatcher } from '@lattica/mcp';

const engine = new SheetEngine();
const dispatcher = new ToolDispatcher(createGridTools(engine));

dispatcher.list();                 // [{ name, description, inputSchema }, …]
dispatcher.has('set_cell');        // true
```

### Calling tools

`call` never throws: a bad input or unknown tool comes back as
`{ ok: false, error }`, success as `{ ok: true, output }`.

```ts
dispatcher.call('set_cell', { row: 0, col: 0, content: 42 });
dispatcher.call('set_cell', { row: 1, col: 0, content: '=A1*2' });

const read = dispatcher.call('get_cell', { row: 1, col: 0 });
// { ok: true, output: { value: '84' } }

dispatcher.call('evaluate', { formula: 'SUM(A1:A2)' });
dispatcher.call('get_range', { startRow: 0, startCol: 0, endRow: 1, endCol: 0 });

const bad = dispatcher.call('get_cell', {});
// { ok: false, error: '"row" must be a non-negative integer' }
```

### Constants & types

- `MAX_RANGE_CELLS` — upper bound a single `get_range` may materialize.
- `formatValue` — formats any cell value (numbers, booleans, `null`, `FormulaError`) to its display string.
- `GridTool`, `ToolCallResult` — the tool and result shapes.
