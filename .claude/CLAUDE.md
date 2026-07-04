# CLAUDE.md — Lattica (自社IP データグリッド) Project Guide

## プロジェクト概要
Handsontable / AG Grid に匹敵する商用級データグリッド＋スプレッドシートエンジンを**完全自社 IP・MIT・クリーンルーム**で実装するライブラリプロジェクト。GPL/コピーレフト依存ゼロ (HyperFormula・Handsontable のコード流用禁止)。Canvas 描画 + DOM 編集ハイブリッド、自前数式エンジン (150 関数・依存 DAG・スピル)、表特化 CRDT 共同編集、AI ネイティブヘルパー、MCP ツール層を持つ。GitHub 公開済み (public)・npm publish 未実施。現在は Handsontable 超えの WORKPLAN を Phase 進行中。

## 技術スタック
- pnpm monorepo (pnpm@10.33.0, Node >=20)、TypeScript (NodeNext ESM)、tsup で ESM+CJS+d.ts ビルド
- React 19 (peer: react >=18)、依存ゼロ方針 (core は外部依存なし)
- テスト: Vitest + happy-dom (+ coverage-v8)、E2E: Playwright (`e2e/`, playground port 4310 自動起動)
- docs: VitePress

## 主要コマンド
- `pnpm build` — packages/* を一括ビルド (tsup)
- `pnpm test` / `pnpm coverage` / `pnpm test:watch`
- `pnpm typecheck` / `pnpm lint`
- `pnpm docs:dev` / `pnpm docs:build` (VitePress)
- E2E: `npx playwright test`

## ディレクトリ構成 (要点) — 8 パッケージ
- `packages/core` — headless モデル (selection/undo/merge/validation/条件付き書式/number format/pivot/sparkline 等)。React/DOM 非依存・最下層
- `packages/formula` — SheetEngine / lexer→Pratt parser→AST→evaluator / 依存 DAG / spill / 構造化参照
- `packages/data` — visual↔physical index / sort/filter / DataView / AsyncRowModel
- `packages/react` — `<LatticaGrid>` / `<LatticaFormulaBar>` / `useGridController` / テーマ (palette×density)
- `packages/io` — CSV/TSV / XLSX 読書 (`writeStyledXlsx`) / clipboard / tableToPdf
- `packages/collab` — CRDT (LWW-Register + fractional index) / presence / Supabase Realtime アダプタ
- `packages/ai` / `packages/mcp` — NL→数式/操作・smart fill / Grid tool registry + ToolDispatcher
- `examples/playground` — Next.js デモ (Vercel 公開)。`docs/` — ARCHITECTURE / WORKPLAN / PROGRESS / USAGE。`AGENTS.md` — エージェント向け利用ガイド (API 例はここが正)

## DB / インフラ
- GitHub: **public** https://github.com/aipathjp/lattica (default branch `main`)
- デモサイト: https://lattica-demo.vercel.app (Vercel `ai-path-inc/lattica-demo`、Root Directory=`examples/playground`、hnd1。build は @lattica/* を先にビルド)
- Neon ダミー DB: project `lattica-demo` id `dark-hill-93073372` (us-east-2)。`sales_records` 150 行を `/api/sales` (@neondatabase/serverless) が照会。`DATABASE_URL` は env 管理 (ハードコード禁止・未コミット)

## 開発規約
- **カバレッジ 100% 必達 (全社 98% の上書き)**: ライブラリとして他プロジェクトが利用するため vitest threshold で Lines/Branches/Functions/Statements=100 を強制。到達不能な防御コードのみ `/* v8 ignore next N -- 理由 */` で明示除外。型のみファイル (ast.ts/tokens.ts/types.ts) と test-helpers は coverage exclude
- 依存は一方向 (core が最下層)。重いロジックは純粋関数に寄せる
- 内部相対 import は `./foo.js` サフィックス (NodeNext ESM 規約)。**パッケージ間 import には付けない** (`@lattica/react` のように package 名で)

## ⚠️ プロジェクト固有の注意点
- **クリーンルーム遵守が存在意義**: Handsontable/HyperFormula/AG Grid のコード参照・流用は絶対禁止。fast-formula-parser (MIT) も概念参照のみ
- ライセンスは MIT 固定。コピーレフト (GPL/AGPL) 依存の追加は不可
- 数式は A1 参照。フォーマット済み数値入力のパースや fill auto-size 等は react 層に実装済み — 再発明前に AGENTS.md / docs/PROGRESS.md を確認
- frozen panes の z-order / 最終列以降の phantom chrome 等、描画端の regression が出やすい。Canvas 描画変更時は playground + E2E で実機確認
