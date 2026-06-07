# @lattica/formula

A clean-room, Excel-compatible formula engine for Lattica. It is a complete
pipeline — lexer, parser, value coercion, an evaluator with a pluggable function
registry, reference extraction, a dependency graph with topological
recalculation, and a high-level `SheetEngine` that ties it all together — with
no runtime dependencies. R1C1 ↔ A1 conversion and a typed error model round out
the package.

## Install

```sh
pnpm add @lattica/formula
```

## API overview

### SheetEngine

The main entry point: set literal or formula content into cells, read back
computed values, and define named ranges. `setContent` returns the set of cell
keys that recalculated.

```ts
import { SheetEngine } from '@lattica/formula';

const engine = new SheetEngine();
engine.setContent({ row: 0, col: 0 }, 10);
engine.setContent({ row: 1, col: 0 }, 20);
engine.setContent({ row: 2, col: 0 }, '=SUM(A1:A2)');

engine.getValue({ row: 2, col: 0 });   // 30
engine.getContent({ row: 2, col: 0 }); // '=SUM(A1:A2)'
```

### Named ranges & ad-hoc evaluation

```ts
import { SheetEngine } from '@lattica/formula';

const engine = new SheetEngine();
engine.defineName('TAX', '0.1');
engine.getNames();                      // ['TAX']
engine.evaluateFormula('100 * (1 + TAX)'); // 110
```

### Parsing & references

`parseFormula` (and the `Parser`) turn formula text into an AST; `tokenize`
exposes the lexer; `extractReferences` lists the cell/range references a formula
depends on.

```ts
import { parseFormula, extractReferences, tokenize } from '@lattica/formula';

const ast = parseFormula('A1 + SUM(B1:B3)');
const refs = extractReferences('A1 + SUM(B1:B3)'); // referenced cells/ranges
const tokens = tokenize('A1+1');
```

### Errors, functions, and R1C1

- `FormulaError` plus the standard tokens `DIV0`, `VALUE`, `REF`, `NAME`, `NA`, `NUM`, `CYCLE` (and `errorFromText`). Use `FormulaError.is(value)` to test a computed value.
- `createDefaultFunctions()` builds the built-in `FunctionRegistry`; `builtinFunctionNames` lists them. Pass a custom registry to `new SheetEngine({ functions })`.
- `DependencyGraph` / `topoSort` drive recalculation order.
- Value coercion helpers: `toNumber`, `toText`, `toBoolean`, `compareScalars`, `isNumeric`.
- R1C1 interop: `a1ToR1C1`, `r1c1ToA1`, `isR1C1`.

```ts
import { a1ToR1C1, FormulaError } from '@lattica/formula';

a1ToR1C1('B3'); // 'R3C2'
FormulaError.is(engine.getValue({ row: 0, col: 0 }));
```
