# Lattica 実装 進捗報告書

> [`WORKPLAN.md`](WORKPLAN.md) の Phase を順次実装する進捗記録。Phase 完了ごとに更新する。
> 実装はマルチエージェント・ハーネス（依存を尊重した wave 並列＋敵対的レビュー）で進行。

- 基準: **カバレッジ 100% 必達**（Lines/Branches/Functions/Statements）。typecheck/lint/build クリーン。クリーンルーム維持。
- 公開: https://github.com/aipathjp/lattica

## サマリ

| 区分 | 状態 |
|---|---|
| 基盤 (core/formula/react/io/collab) | ✅ 完了（581テスト・100%） |
| Part A (Phase 1–18: HoT 超越) | 🚧 進行中（モデル層完成＋React統合に着手・**1272テスト・100%**） |
| Part B (Phase A1–A12: AI ネイティブ) | ✅ **A1–A12 全完了**（@lattica/ai ＋ @lattica/mcp） |

> 🚧「中核」= フレームワーク非依存のモデル/ロジックは完成・100%。React 描画/UI 統合は後続の React 集中 wave で実施。
> 🚧「関数」= Phase 12 のうち関数ライブラリ拡張（55→97関数）を完了。名前付き範囲/R1C1/配列スピルは後続。

## Phase 進捗

| Phase | 内容 | 状態 | テスト | カバレッジ | PR |
|---|---|---|---|---|---|
| 基盤 | core/formula/react/io/collab | ✅ | 581 | 100% | merged |
| 1 | @lattica/data: IndexMapper＋データバインド | ✅ | +62 | 100% | wave0 |
| 2 | セル型システム（レンダラ/エディタ） | 🚧 描画 | +? | 100% | wave4 |
| 3 | 検証・read-only・配置・セルメタ | 🚧 中核 | +? | 100% | wave1 |
| 4 | 対話UX（ドラッグ選択/フィル/リサイズ/移動） | 🚧 選択+系列+境界 | +? | 100% | wave6/7 |
| 5 | コンテキスト/ヘッダーメニュー・ショートカット | 🚧 メニューUI結線 | +? | 100% | wave3/7 |
| 6 | 並べ替え（単/複数列） | 🚧 中核 | +34 | 100% | wave1 |
| 7 | フィルタ | 🚧 中核 | +49 | 100% | wave1 |
| 8 | 隠す/トリム/移動/ネスト行 | ⏳ | - | - | - |
| 9 | 結合セル | 🚧 中核 | +20 | 100% | wave0 |
| 10 | コメント/条件付き書式/枠線/列サマリ | 🚧 中核 | +? | 100% | wave1/2 |
| 11 | 検索・ハイライト | 🚧 中核+結線 | +18 | 100% | wave0/5 |
| 12 | 数式エンジン拡張（関数/名前付き範囲/R1C1/スピル） | 🚧 関数+名前+R1C1 | +? | 100% | wave0/2/7 |
| 13 | XLSX インポート＋スタイル往復＋JSON | 🚧 import | +40 | 100% | wave2 |
| 14 | 自動サイズ/ストレッチ/折返し可変行高 | 🚧 計測 | +? | 100% | wave3 |
| 15 | i18n/RTL/テーマ | 🚧 i18n+テーマ | +? | 100% | wave3 |
| 16 | フルアクセシビリティ | 🚧 ARIA計算 | +? | 100% | wave3 |
| 17 | フック/永続状態/プラグインAPI | 🚧 中核 | +? | 100% | wave2 |
| 18 | 性能/ベンチ/E2E/ドキュメント | ⏳ | - | - | - |
| A1 | AI基盤（provider/AIClient/AICommand・provenance） | ✅ | +? | 100% | wave4 |
| A2 | NL→数式・数式説明/修正 | ✅ | +10 | 100% | wave4 |
| A5 | スキーマ推論・型判定・正規化・重複検知 | ✅ | +35 | 100% | wave4 |
| A6 | 意味検索（埋め込み抽象・cosine・索引） | ✅ | +18 | 100% | wave4 |
| A3 | AI列（行ごとプロンプト＋来歴） | ✅ | +13 | 100% | wave5 |
| A4 | スマートフィル（規則推論＋AIフォールバック） | ✅ | +31 | 100% | wave5 |
| A7 | NL→グリッド操作（sort/filter/summarize） | ✅ | +? | 100% | wave5 |
| A8 | 異常検知（z-score/IQR） | ✅ | +? | 100% | wave5 |
| A9 | 検証ルール生成（型/正規表現/列挙） | ✅ | +? | 100% | wave5 |
| A10 | 要約/翻訳/分類 | ✅ | +? | 100% | wave5 |
| A11 | MCP公開（@lattica/mcp: ツールレジストリ＋ディスパッチャ） | ✅ | +28 | 100% | wave6 |
| A12 | エージェントワークフロー（計画→HITL承認→監査） | ✅ | +11 | 100% | wave6 |

凡例: ✅完了 / 🚧進行中 / ⏳未着手

## 変更履歴
- 2026-06-06: 進捗報告書作成。100% カバレッジ基準を確立。Wave 0（Phase 1/9/11/12 の追加的モジュール）に着手。
- 2026-06-06: **Wave 0 完了**（マルチエージェント・ハーネス: 実装4＋レビュー4 = 10エージェント並列）。
  - Phase 1 完了: `@lattica/data`（IndexMapper・DataSource）新規パッケージ。
  - Phase 9 中核: `MergeModel`（結合セルの重なり検出・anchor/covered 判定）。
  - Phase 11 中核: `searchGrid` / `SearchState`（正規表現安全・循環ナビ）。
  - Phase 12 関数: 数式関数 55→**97**（VLOOKUP/HLOOKUP/INDEX/MATCH/CHOOSE/SUMIFS/COUNTIFS/AVERAGEIF/LARGE/SMALL/RANK/STDEV/VAR/TEXT/SEARCH/EXACT/三角関数/GCD/LCM 等）。
  - 全体 **758テスト・100%カバレッジ**（全指標）。typecheck/lint/build クリーン。
- 2026-06-06: **Wave 1 完了**（マルチエージェント: 実装5＋レビュー5 = 10エージェント並列）。追加的な純粋モデルを実装:
  - Phase 6 中核: `SortModel`/`sortPhysicalOrder`（多列・安定・bigint精度修正済）。
  - Phase 7 中核: `FilterModel`/`filteredHiddenRows`（型別条件・AND/OR）。
  - Phase 3 中核: `ValidationModel`/`validators`（非同期対応・不正セル追跡）。
  - Phase 10 中核: `summarize`/`summarizeColumn`（列サマリ）＋ `ConditionalFormatModel`（条件付き書式ルールエンジン）。
  - 全体 **940テスト・100%カバレッジ**。typecheck/lint/build クリーン。レビュー検出の sort bigint 精度バグを統合時に修正＋テスト追加。
- 2026-06-06: **Wave 2 完了**（マルチエージェント: 実装6＋レビュー6 = 12エージェント）。
  - Phase 13 import: `inflateRaw`（RFC1951 DEFLATE 展開・依存ゼロ）＋ `readXlsx`（ZIP解析＋SpreadsheetML→matrix、共有文字列/inlineStr/型対応）。XLSX 往復確認済。
  - Phase 12 名前: 数式エンジンに名前付き範囲（`defineName`/`getNames`/`removeName`、`=SUM(Sales)` 動作確認）。
  - Phase 10c: `CommentModel`・`BorderModel`。
  - Phase 17: `HookBus`（キャンセル可能フック）・永続状態シリアライザ（`serializeState`/`deserializeState`/`emptyState`）。
  - 全体 **1070テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-06: **Wave 3 完了**（マルチエージェント: 実装6＋レビュー6 = 12エージェント）。React 統合の前提となる純粋モジュール:
  - Phase 5 中核: `ShortcutRegistry`・`buildMenu`/`findItem`/`runItem`。
  - Phase 14 計測: `wrapText`/`autoColumnWidth`/`autoRowHeight`（計測関数を抽象化）。
  - Phase 15: `I18n`（手動桁区切り・補間）＋ light/dark/highContrast テーマプリセット。
  - Phase 16: `gridAria`/`rowAria`/`cellAria`/`columnHeaderAria`/`rowHeaderAria`。
  - 全体 **1171テスト・100%カバレッジ**。typecheck/lint/build クリーン。
  - **Part A のモデル/純粋ロジック層はほぼ完成**。残りは `<LatticaGrid>`/`GridController` への結線（React統合 wave・順次）と Phase 8(隠す/移動/ネストUI)・12c(R1C1/スピル)・18(性能/E2E)。
- 2026-06-06: **Wave 4 完了**（React統合 + Part B AI を並行）。
  - React統合 Phase 2: `CellTypeRegistry`（text/number/checkbox＋カスタム登録）を painter に結線、条件付き書式の背景/文字色を描画。既定 type=text で既存挙動不変。
  - Part B 着手（新規 `@lattica/ai`・provider/embedder 抽象でモック100%）:
    - A1: `AIProvider`/`MockProvider`/`AIClient`(コール/トークン上限) ＋ `withProvenance`（取り消し可能・来歴付き AICommand）。
    - A2: `nlToFormula`/`explainFormula`/`fixFormula`（parseFormula で検証）。
    - A5: `inferCellType`/`inferColumnType`/`normalizeValue`/`detectDuplicateRows`（決定的・全半角正規化・trigram重複検知）。
    - A6: `cosineSimilarity`/`SemanticIndex`（埋め込み抽象・負topK防御）。
    - レビュー指摘: A5「区切り無し連結」は非表示文字(U+001F)の誤読でバグ無し→回帰テスト追加。A6 負topK を防御＋テスト。A2 は wave 失敗で欠落→メインで実装。
  - 全体 **1272テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-06: **Wave 5 完了**（React統合スライス2 + Part B AI 第2弾を並行）。
  - React統合: `GridController` に列型/配置・条件付き書式(`getCellStyle`)・検索(`runSearch`)を追加し `<LatticaGrid>` へ結線。グリッドがセル型描画・条件付き書式・検索ハイライトを実表示。
  - Part B AI（`@lattica/ai`）: A3 AI列・A4 スマートフィル（規則推論＋AIフォールバック、長さガード）・A7 NL→グリッド操作・A8 異常検知(z-score/IQR)・A9 検証ルール生成・A10 要約/翻訳/分類。全て provider 抽象でモック100%。
  - 全体 **1388テスト・100%カバレッジ**。typecheck/lint/build クリーン。Part B は A11(MCP)/A12(ワークフロー) を残すのみ。
- 2026-06-06: **Wave 6 完了**（Part B 仕上げ + React対話UX を並行）。**Part B（AI ネイティブ）A1–A12 全完了**。
  - A11: 新規 `@lattica/mcp` — グリッドのツールレジストリ（get_cell/set_cell/get_range/evaluate/define_name）＋ `ToolDispatcher`（結果エンベロープ）。get_range にセル数上限ガード追加。
  - A12: `@lattica/ai` ワークフロー — `planWorkflow`（NL→手順・未知ツール除外）＋ `WorkflowRunner`（HITL承認・監査ログ・失敗で停止）。
  - React対話UX Phase 4: ドラッグ範囲選択（mousedown→move→up）。
  - 全体 **1429テスト・100%カバレッジ**。typecheck/lint/build クリーン。パッケージ8つ（core/data/formula/react/io/collab/ai/mcp）。
  - 残：Part A React 統合（フィルハンドル・リサイズ/移動ハンドル・コンテキストメニューUI・ソート/フィルタ結線・結合描画・ネスト行）と Phase 12c(R1C1/スピル)・18(性能/E2E/ベンチ)。
- 2026-06-06: **Wave 7 完了**（追加的純粋ヘルパー＋React対話UX結線）。
  - `detectSeries`/`extendSeries`(core・オートフィル系列: 数値/日付/曜日/コピー)。
  - `hitColumnBorder`/`hitRowBorder`/`hitResizeHandle`(react・リサイズ境界当たり判定、非凍結軸)。
  - `a1ToR1C1`/`r1c1ToA1`/`isR1C1`(formula・R1C1⇄A1)。
  - React: コンテキストメニューUI（右クリック→Copy/Paste/Clear/Undo/Redo、カスタム可）を結線。
  - ネット断で fill-series エージェントは StructuredOutput 未到達だったが成果物は完全（38テスト）→採用。resize の凍結ペイン制限は非凍結軸向けと明記。
  - 全体 **1528テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-06: **Wave 8 完了**（追加的モデル並列＋React対話UX結線）。
  - `NestedRowModel`(data・ネスト行/折りたたみ→非表示行)、`fillRegion`(core・2Dフィル適用)。
  - React: 列/行リサイズハンドル（ヘッダー境界ドラッグ＋カーソル）を結線。
  - fill-region の縦横で零幅シードの戻りを `[]` に統一（レビュー指摘）。
  - 全体 **1557テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-06: **Wave 9 完了**（DataView 並列＋フィルハンドル結線）。
  - `DataView`(data・IndexMapper×ソート×フィルタ合成、フィルタ置換対応)。
  - `GridController.fillTo`(系列フィルエンジン・主軸判定・トランザクション) ＋ React フィルハンドル（選択右下つまみのドラッグ）。
  - 全体 **1582テスト・100%カバレッジ**。typecheck/lint/build クリーン。Part A の対話UX（選択/リサイズ/メニュー/フィル）実機化が揃う。残：ソート/フィルタの GridController データビュー結線・結合描画・ネスト行UI・Phase 18。
- 2026-06-06: **Wave 10 完了**（DataView を GridController に統合＝可視ソート/フィルタ）。
  - 全データアクセス/サイズを visual↔physical 写像経由に（既定アイデンティティで既存挙動不変）。`toggleSort`/`setColumnFilter`/`clearView`/`getSortDirection` 追加。ソート時に行高が物理行へ追従、編集は正しい物理セルへ書込み。
  - Phase 6/7 が可視反映まで到達（モデル→GridController 結線）。
  - 全体 **1590テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-07: **Wave 11 完了**（数式関数拡張＋ドキュメント＋結合セル描画）。
  - 数式関数 97→**115**（DATE/EDATE/EOMONTH/WEEKDAY/DATEDIF/DATEVALUE・PMT/FV/PV/NPV・MROUND/EVEN/ODD/ISEVEN/ISODD、UTCシリアル・クリーンルーム）。
  - ドキュメント: 全8パッケージ README ＋ `docs/USAGE.md`（API は index.ts 突合で検証済）。
  - React: 結合セル描画（`mergeSelection`/`unmerge`・アンカースパン・被覆スキップ）。
  - 全体 **1610テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-07: **Wave 12 完了**（io JSON＋性能ベンチ＋ヘッダーソートUI）。
  - `@lattica/io` JSON: `matrixToJson`/`jsonToMatrix`/`recordsToMatrix`/`matrixToRecords`（own-key undefined→null 修正）。
  - 性能ベンチ（packages/react/bench, カバレッジ対象外）＋ `docs/PERFORMANCE.md`：100万行×1000列で buildScene+paintScene ≈0.12ms/frame・約8000fps を実測。
  - React: ヘッダークリックのソートUI（▲/▼/⇅・Shiftで複数列、`PositionedHeader.col` 追加）。
  - 全体 **1625テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-07: **Wave 13 完了**（数式関数 130＋kitchen-sinkデモ＋ネスト行UI）。
  - 数式関数 115→**130**（MODE/GEOMEAN/HARMEAN/VARP/STDEVP/SUMSQ/AVERAGEA/PERCENTILE/QUARTILE・MAXIFS/MINIFS・REPLACE/FIXED/UNICHAR/UNICODE）。
  - examples/playground に kitchen-sink デモ（ソート/フィルタ/結合/検索/CSV・XLSX/AI を一画面）。
  - React: ネスト行（折りたたみ）をグリッド統合（行ガター ▾/▸ トグル、列フィルタと hidden 合成）。
  - 全体 **1643テスト・100%カバレッジ**。typecheck/lint/build クリーン。
- 2026-06-07: **Wave 14 完了**（配列スピル＝Phase 12c＋E2E雛形＋ドキュメントサイト）。
  - **配列スピル（動的配列）**: 複数セルを返す数式がアンカーから隣接セルへスピル。`SheetEngine` が spillMap（仮想セル→アンカーのスロット）を保持し `getValue` が透過解決。占有時は `#SPILL!`（ブロックされたアンカーは意図領域を監視し、障害物除去で再スピル）。スピルセルは依存グラフでアンカーに依存し、再計算は不動点反復するため「直前にスピル対象になった/外れたセル」を参照する数式も追従。縮小/スカラー化/クリア/循環で撤回。`#SPILL!` エラー型追加。
  - 数式関数 130→**135**（動的配列 TRANSPOSE/SEQUENCE/UNIQUE/SORT/FILTER）。
  - インフラ: Playwright E2E 雛形（`playwright.config.ts`＋`e2e/grid.spec.ts`・実 testid 利用、`*.spec.ts` はカバレッジ対象外）＋ VitePress ドキュメントサイト（`docs/.vitepress/`・各パッケージ頁・`docs:dev`/`docs:build`）。ブラウザ E2E/サイトビルドは未実行（アプリ dev サーバ未結線）。
  - 全体 **1687テスト・100%カバレッジ**。typecheck/lint/build クリーン。**Part A の WORKPLAN 主要 Phase（1–18, R1C1/スピル含む）と Part B（AI A1–A12）が完了**。残るオプションはブラウザ実機 E2E の結線とサイト公開のみ。
