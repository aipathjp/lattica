# @ai-path/tb-collab

Realtime collaboration primitives: a last-writer-wins CRDT for cell values (TableDocument), a presence registry, a transport abstraction, and CollabSession. Fractional order keys (keyBetween) keep inserted rows/columns stably ordered.

This package is part of the [Taible](/) monorepo. The full, canonical reference
lives in the package README in the source tree:

- Source README: [`packages/collab/README.md`](https://github.com/aipathjp/taible/blob/main/packages/collab/README.md)
- Package: `@ai-path/tb-collab`

## Install

```sh
pnpm add @ai-path/tb-collab
```

See [Usage](/USAGE) for end-to-end examples and [Architecture](/ARCHITECTURE)
for how this package fits into the overall design.
