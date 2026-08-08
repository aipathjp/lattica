# @ai-path/tb-mcp

Exposes a Taible grid to AI agents as a transport-agnostic tool registry. Each GridTool bundles a name, description, JSON-schema input, and a handler over a SheetEngine; a ToolDispatcher gives uniform { ok, output | error } results.

This package is part of the [Taible](/) monorepo. The full, canonical reference
lives in the package README in the source tree:

- Source README: [`packages/mcp/README.md`](https://github.com/aipathjp/taible/blob/main/packages/mcp/README.md)
- Package: `@ai-path/tb-mcp`

## Install

```sh
pnpm add @ai-path/tb-mcp
```

See [Usage](/USAGE) for end-to-end examples and [Architecture](/ARCHITECTURE)
for how this package fits into the overall design.
