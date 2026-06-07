# Lattica 全量作業計画書 — Handsontable 超越 ＋ AI ネイティブ化

> 目的: Lattica を **Handsontable / AG Grid を全機能で上回る** 商用級データグリッドに仕上げ、
> その上で **AI 活用の親和性が極めて高い「AI ネイティブ・スプレッドシート」** へ拡張する。
> 本書は着手前の全量計画。各 Phase は独立 PR としてマージ可能な粒度に分割する。

- 関連: [`ARCHITECTURE.md`](ARCHITECTURE.md) / [`RESEARCH.md`](RESEARCH.md)
- 現状: core / formula / react / io / collab の 5 パッケージ実装済・565 テスト・カバレッジ 99.5%
- 公開: https://github.com/aipathjp/lattica (MIT・クリーンルーム)

---

## 0. 全体方針（全 Phase 共通の絶対ルール）

1. **クリーンルーム維持** — Handsontable / AG Grid / HyperFormula のソースは参照しない。公開仕様・自前設計のみ。
2. **コピーレフト依存ゼロ** — ランタイム依存は原則ゼロ。AI 層のみ provider SDK を許容（MIT/Apache のみ）。
3. **カバレッジ 98% 必達** — 全パッケージ Vitest。重いロジックは純粋関数へ寄せて単体テスト可能に保つ。DOM/canvas は happy-dom + モック。E2E は Playwright（Phase 18 で導入）。
4. **1 Phase = 1 PR = 1 機能** — レビュー可能粒度。大機能は子 Phase に分割。`feat(scope): ...` / `Co-Authored-By` トレーラ。
5. **依存方向は一方向**（core 最下層）。新パッケージも DAG を崩さない。
6. **後方互換** — 公開 API は破壊変更を避ける。破壊する場合は互換層 PR → 本実装 PR の 2 段。
7. **各 Phase に受入基準(AC)・テスト・対象ファイルを明記**（本書に定義済）。完了時 AC 判定 → 次 Phase。
8. **AI 書込みは必ず取り消し可能な Command＋来歴(provenance)＋承認(HITL)** を伴う。モック実装禁止・本実装まで。
9. **セキュリティ** — 機密/トークンはコードに直書きせず env 経由。外部 URL は allowlist。AI 送信前に PII マスキング方針を持つ。

### パッケージ構成（追加予定を含む）

| パッケージ | 役割 | 状態 |
|---|---|---|
| `@lattica/core` | 座標・仮想化・選択・コマンド・ヘッダー・セルメタ・merge・検証モデル | 拡張 |
| `@lattica/data` | **新規**: IndexMapper(物理↔表示)・データソースバインド・sort/filter/hide/move/trim/group モデル | 新規 |
| `@lattica/formula` | 数式エンジン（関数拡張・名前付き範囲・R1C1・配列スピル） | 拡張 |
| `@lattica/react` | Canvas描画・セル型レジストリ・対話UX・メニュー・条件付き書式・a11y | 拡張 |
| `@lattica/io` | CSV/TSV・XLSX 入出力(import 追加)・スタイル往復・JSON | 拡張 |
| `@lattica/collab` | CRDT・プレゼンス・Supabase Realtime アダプタ | 拡張 |
| `@lattica/ai` | **新規**: AI 親和機能（NL→数式・AI列・スマートフィル・意味検索・対話・異常検知）provider 抽象 | 新規 |
| `@lattica/mcp` | **新規**: MCP サーバ。外部 AI エージェントにグリッド操作を公開 | 新規 |

---

## Part A — Handsontable を全機能で上回る（パリティ＋超越）

> 目標: Handsontable の全機能を網羅し、各領域で **Lattica 固有の優位（Canvas性能・CRDT・型安全・クリーンルーム）** を上乗せする。

### Phase 1 — 基盤: IndexMapper ＋ データソースバインド  ★最優先
- **目的**: 物理インデックス↔表示インデックスの変換層を作る。以降の hide/move/sort/filter/trim/nested の土台。加えて「行=オブジェクト配列、列=スキーマ」のデータバインドを導入（一般的アプリ用途必須）。
- **対象**: `@lattica/data`（新規）, `@lattica/core`(連携)
- **主要API**:
  - `IndexMapper`: `getVisual(physical)`, `getPhysical(visual)`, `insert/remove`, `setOrder`, `setHidden`, `getNotHidden`, sequence/skip/trim マップ合成。
  - `DataSource<T>`: array-of-objects 入出力。`columns: { data: keyof T | accessor, type, header }[]`。`getCellByVisual`, `setCellByVisual`, `loadData`, `getData`, `getSourceData`。
  - `DataStore` 連携（座標APIは維持しつつ、表示↔物理を IndexMapper 経由に）。
- **AC**: 1) 任意の hide/move 後も visual↔physical 双方向が整合 2) loadData→getData ラウンドトリップ無損失 3) 100万行で getVisual が O(log n) 4) カバレッジ98%。
- **テスト**: マッパー合成のプロパティテスト（ランダム hide/move 列で順序保存）、バインド往復。

### Phase 2 — セル型システム（レンダラ/エディタ登録 ＋ 組込型）
- **目的**: HoT の中核拡張点。型ごとに「Canvas レンダラ」＋「DOM エディタ」を登録。
- **対象**: `@lattica/react`(`cell-types/`), `@lattica/core`(cellMeta)
- **組込型**: text / numeric(書式:桁区切り・通貨・小数) / date(ピッカー) / time / checkbox / select / dropdown / autocomplete / password / **超越: rating・progress・sparkline・tag/chips・image・link**。
- **主要API**: `registerCellType({name, renderer(ctx, cell, theme), editor(props), parse, format, validate?})`。`column.type` で割当。
- **AC**: 各型の描画(モックctx命令)＋編集コミット＋型変換のテスト。カスタム型登録で外部拡張可能。98%。
- **テスト**: 型別 renderer/editor、numeric 書式境界、date ピッカー commit、checkbox トグル。

### Phase 3 — 検証・read-only・配置・セルメタ
- **目的**: validator/allowInvalid・不正セル視覚化、readOnly セル/列、テキスト配置(水平/垂直)、per-cell メタ(className 相当)。
- **対象**: `@lattica/core`(validation, cellMeta), `@lattica/react`(描画・編集ガード)
- **主要API**: `setValidator(scope, fn|builtin)`, `getInvalidCells()`, `setReadOnly`, `setAlign`。非同期 validator 対応。
- **AC**: 不正値で commit ブロック or 視覚フラグ（allowInvalid 設定）。read-only は編集不可。配置が描画反映。98%。

### Phase 4 — 対話 UX 基盤（選択・フィル・リサイズ・移動ハンドル）
- **目的**: HoT の操作感を再現＋上回る。
- **対象**: `@lattica/react`(interaction/), `@lattica/core`(selection 拡張)
- **機能**:
  - **ドラッグ範囲選択**(mousedown→move→up)、**Ctrl/Cmd クリック複数範囲**、Shift 拡張、オートスクロール。
  - **フィルハンドル/オートフィル**: 連続データ推論(数値等差・日付・曜日・コピー・**超越: 数式相対参照の自動調整**)。
  - **列/行リサイズ・ハンドル**(ダブルクリックで auto-fit)、**ドラッグ移動**(列/行並替, IndexMapper 連携)。
  - 対話的 **フリーズ列/行** トグル。
- **AC**: ドラッグ選択範囲が正確、フィル系列が Excel 互換、リサイズ/移動が IndexMapper と整合。純粋ロジック(系列推論・ヒット判定)はユニット、操作は Playwright(Phase18) 兼。98%。

### Phase 5 — コンテキストメニュー ＋ ヘッダードロップダウンメニュー ＋ ショートカット登録
- **目的**: 右クリックメニュー(行列挿入/削除・整列・read-only・コピー/貼付・結合 等)、列ヘッダーメニュー、キーバインド・レジストリ。
- **対象**: `@lattica/react`(menu/, shortcuts/)
- **主要API**: `contextMenu: items | (ctx)=>items`、`registerShortcut(keymap, action, context)`。プラグインから項目追加可。
- **AC**: メニュー項目の実行が Command 化(undo可)、キーマップ衝突解決、a11y(キーボード操作可)。98%。

### Phase 6 — 並べ替え（単一・複数列）  ※Phase1 依存
- **目的**: 型別 comparator(数値/日付/文字/真偽)、複数列ソート、ヘッダークリック/メニュー、安定ソート、未ソート復帰。
- **対象**: `@lattica/data`(sort モデル via IndexMapper), `@lattica/react`(UI/インジケータ)
- **AC**: 型別比較が正確、複数列優先順位、ソート後も編集/数式参照整合。98%。

### Phase 7 — フィルタ（列フィルタ UI）  ※Phase1 依存
- **目的**: 型適応フィルタ(条件式・値リスト・範囲・テキスト含む)、複合条件、フィルタ UI(ポップオーバー)。
- **対象**: `@lattica/data`(filter モデル), `@lattica/react`(UI)
- **AC**: 各型の条件評価、AND/OR 複合、フィルタ＋ソート併用、表示行数整合。98%。

### Phase 8 — 隠す/トリム/移動/ネスト行  ※Phase1 依存
- **目的**: 列/行の hide・trimRows、列/行 move(Phase4と統合)、**ネスト行(階層・展開折畳)**、行ヘッダーのグルーピング(rowspan)。
- **対象**: `@lattica/data`, `@lattica/react`
- **AC**: hide/trim/move/nested が IndexMapper 経由で全機能と整合(数式・選択・コピー)。98%。

### Phase 9 — 結合セル（merge cells）
- **目的**: 範囲結合(左上値保持)、描画(spanned rect)、選択/コピー/数式の結合考慮、解除。
- **対象**: `@lattica/core`(merge モデル), `@lattica/react`(描画/ヒット)
- **AC**: 結合セルの描画・選択・コピー・undo、重なり禁止検証。98%。

### Phase 10 — コメント・条件付き書式・カスタム枠線・列サマリ
- **目的**:
  - **セルコメント**(インジケータ＋ポップオーバー＋編集、collab同期)。
  - **条件付き書式**(値ベースの背景/文字色/アイコン、ルールエンジン)。
  - **カスタム枠線**(per-cell 罫線)。
  - **列サマリ**(sum/avg/min/max/count、フッタ行、数式連携)。
- **対象**: `@lattica/core`(rules/comments/summary), `@lattica/react`(描画)
- **AC**: ルール評価が再計算と連動、コメント collab 同期、サマリが filter/sort 反映。98%。

### Phase 11 — 検索・ハイライト
- **目的**: find(部分一致/正規表現/型考慮)、ヒットハイライト描画、次/前ナビ、置換(超越)。
- **対象**: `@lattica/core`(search), `@lattica/react`(ハイライト)
- **AC**: 検索結果走査、ハイライト描画、置換の undo。98%。

### Phase 12 — 数式エンジン拡張（HoT/HyperFormula 超え）
- **目的**: 関数を **280+→ 最終 400+** へ、**名前付き範囲**、**R1C1 記法**、**配列数式/スピル**、**複数シート参照**、エラートレース。
- **対象**: `@lattica/formula`
- **AC**: 追加関数の Excel 互換テスト、名前付き範囲の依存解決、スピル領域の再計算、循環/エラー伝播維持。98%。

### Phase 13 — IO 拡張: XLSX インポート ＋ スタイル往復 ＋ JSON
- **目的**: **XLSX 読込**(DEFLATE inflate を自前実装→stored/deflate 両対応)、セル値・数式・書式・結合・列幅の往復、JSON 入出力、CSV 方言。
- **対象**: `@lattica/io`(inflate.ts, xlsx-read.ts)
- **AC**: 代表 .xlsx の読込→Lattice→書出しで値/数式/結合が保存、巨大ファイルのストリーミング。98%。

### Phase 14 — 自動サイズ・ストレッチ・折返し可変行高
- **目的**: autoColumnSize / autoRowSize(内容計測)、stretchH(幅フィット)、wordWrap・複数行セル・自動行高描画(Canvas テキスト計測)。
- **対象**: `@lattica/react`(measure.ts), `@lattica/core`(SizeManager 連携)
- **AC**: 計測が DPR/フォント考慮で正確、可変行高で仮想化整合。98%。

### Phase 15 — 国際化・RTL・テーマ
- **目的**: i18n(UI 文言・数値/日付ロケール書式)、RTL/layoutDirection、プリセットテーマ(light/dark/high-contrast)＋トークン化。
- **対象**: `@lattica/react`(i18n/, themes/)
- **AC**: ロケール別書式、RTL レイアウト/ヒット反転、テーマ切替で全描画反映。98%。

### Phase 16 — フルアクセシビリティ
- **目的**: ARIA grid 完全準拠(可視セルの aria-rowindex/colindex ミラー)、navigableHeaders、tabNavigation、スクリーンリーダ読み上げ、imeFastEdit、フォーカスリング。
- **対象**: `@lattica/react`(a11y/)
- **AC**: 主要 SR(VoiceOver/NVDA 想定)でセル位置/値読み上げ、キーボードのみで全操作。axe 検査 + Playwright a11y。

### Phase 17 — フック/イベント体系 ＋ 永続状態 ＋ プラグイン API
- **目的**: HoT 相当の豊富なフック(before/after CRUD・選択・描画…)を型安全に、persistentState(列幅/順/ソート/フィルタを storage 保存)、公式プラグイン API。
- **対象**: `@lattica/core`(hooks), `@lattica/react`
- **AC**: フック発火順序保証・キャンセル可能フック、状態復元、外部プラグイン登録。98%。

### Phase 18 — 性能・ベンチ・ドキュメントサイト・E2E
- **目的**: 100万〜1000万セルのベンチ(FPS/メモリ計測)、ダーティリージョン再描画・オフスクリーン canvas・rAF バッチ最適化、Playwright E2E スイート、ドキュメントサイト(Next.js)＋ライブデモ。
- **対象**: 全パッケージ + `examples/`
- **AC**: 公称性能を一次ベンチで実証(README に数値)、E2E グリーン、docs 公開。

**Part A 完了基準**: Handsontable features 一覧の全項目を ✅、各領域で Lattica 優位(Canvas/CRDT/型安全/クリーンルーム)を実証。総合カバレッジ 98%+。

---

## Part B — AI ネイティブ・スプレッドシート（AI 親和機能）

> 設計原則:
> - **provider 非依存**: Vercel AI Gateway / AI SDK 経由で `"provider/model"` 文字列を既定。ローカル LLM(プライバシ)も選択可。
> - **構造化出力**: 全 AI→グリッド書込みは Zod スキーマで検証してから適用。
> - **取り消し可能・来歴付き・HITL**: 各 AI 編集は `AICommand`(undo可) ＋ provenance(モデル/プロンプト/トークン/根拠) ＋ 承認フロー(差分プレビュー)。
> - **ストリーミング**: 逐次反映＋キャンセル。**コスト/トークン上限**を必ず数値設定。
> - **セキュリティ**: 送信前 PII マスキング、外部 URL allowlist、機密は Vault/env 経由。

### Phase A1 — `@lattica/ai` 基盤
- **目的**: AI 層の土台。provider 抽象、`AICommand`、ストリーミング、構造化出力、来歴、承認 UI フック、レート/コスト制御。
- **主要API**: `createAIClient({ model, gateway, limits })`, `AICommand`(core Command 拡張), `withProvenance`, `useAIReview()`(差分承認)。
- **AC**: モック provider で全フロー(生成→検証→Command→undo→provenance記録)テスト。98%(provider I/O はモック)。

### Phase A2 — 自然言語 ⇄ 数式（NL→Formula / 数式説明・修正）
- **目的**: 「A〜Cの合計」→`=SUM(A:C)`、既存数式の自然言語説明、エラー数式の自動修正提案。
- **依存**: formula(Phase12), ai(A1)
- **AC**: NL→数式が AST 検証を通過してから挿入、説明が参照セルと整合、修正提案は diff 承認。

### Phase A3 — AI 列（AI Columns）
- **目的**: 列単位プロンプト(「この会社の業種を推定」)で行ごとに LLM 実行→値生成。ストリーミング、結果キャッシュ、行追加で自動再実行、来歴セル。
- **AC**: 大量行のバッチ実行(並列度・上限設定)、部分失敗のリトライ、各セルに provenance、undo 一括。

### Phase A4 — スマートフィル（AI Flash Fill）
- **目的**: 数例から変換規則を AI 推論し残行を補完(氏名分割・整形・抽出)。**決定的規則を優先**し、曖昧時のみ LLM。
- **AC**: 例から規則生成→プレビュー→適用、規則の可視化、誤りの容易な訂正。

### Phase A5 — スキーマ推論・型自動判定・データクレンジング
- **目的**: 列の型/フォーマット自動判定、表記ゆれ正規化(全半角/単位/日付)、**埋め込みベース重複検知**(短文は埋め込み×trigram のハイブリッド)、外れ値検出。
- **依存**: data(Phase1), ai
- **AC**: 型推論精度、正規化の可逆ログ、重複クラスタ提示、すべて承認後適用。

### Phase A6 — 意味検索（Semantic Search）
- **目的**: セル/行の埋め込みインデックスで自然言語検索・類似行検索。ローカル/外部 embedder 切替。
- **AC**: インデックス増分更新、検索ハイライト(Phase11連携)、行スコアリング。

### Phase A7 — 表と対話（Chat-with-your-table / NL 変換）
- **目的**: 選択範囲や全表への Q&A、自然言語での集計/ピボット/グループ化(「地域別に売上合計」)→ 実データ操作(data 層)へ。
- **AC**: NL→操作(sort/filter/group/summary)を構造化生成→プレビュー→適用、回答に根拠セル引用。

### Phase A8 — 異常検知・自動条件付き書式
- **目的**: 統計＋AI で外れ値/異常パターン検出、自動で条件付き書式ルール提案(Phase10連携)。
- **AC**: 検出根拠の説明、ルール承認、誤検知の抑制。

### Phase A9 — AI 検証ルール生成
- **目的**: 列の値例から validator/正規表現/許容リストを AI 生成(Phase3連携)、説明付き。
- **AC**: 生成ルールの適用前テスト(既存値での適合率表示)、承認後反映。

### Phase A10 — 要約・翻訳・分類
- **目的**: 選択範囲の要約、セル/列の翻訳(i18n連携)、自動カテゴリ分類(tag セル型へ)。
- **AC**: バッチ処理・上限制御・来歴、結果のセル型整合。

### Phase A11 — `@lattica/mcp`（エージェント公開）
- **目的**: MCP サーバとしてグリッドを外部 AI エージェントに公開。read/write/query/compute/transform をツール化。Quartet/Sibyl からの操作を想定。
- **AC**: ツールスキーマ(構造化)、書込みは AICommand 経由で undo/承認、監査ログ、認可。
- **セキュリティ**: 認可スコープ、書込み承認モード、機密マスク。

### Phase A12 — エージェント・ワークフロー ＋ 監査・HITL UI
- **目的**: 複数ステップの表操作を計画→実行するエージェント、来歴の監査ログ可視化、人間承認 UI(差分・一括承認/却下)、ロールバック。
- **AC**: 計画の透明性、各ステップ undo、承認なしの本適用を禁止(境界: 自律=提案/下書き、人間=本適用)。

**Part B 完了基準**: AI 機能が全て「構造化出力→検証→取り消し可能 Command→来歴→承認」を満たし、Vercel AI Gateway / ローカル LLM 双方で動作。デモアプリで NL→数式・AI列・スマートフィル・対話を実演。

---

## マイルストーン（推奨順序とゲート）

```
M1 基盤        : Phase 1, 2, 3            → セル型を持つ実用グリッド
M2 操作性      : Phase 4, 5               → HoT 同等の操作感
M3 データ操作  : Phase 6, 7, 8, 9         → 並替/フィルタ/隠す/移動/ネスト/結合
M4 表現/IO     : Phase 10, 11, 13, 14     → 書式/検索/XLSX往復/自動サイズ
M5 仕上げ      : Phase 12, 15, 16, 17, 18 → 数式拡張/i18n/a11y/フック/性能・公開
── ここで Handsontable 全面超越 ──
M6 AI 基盤     : Phase A1, A2             → NL⇄数式
M7 AI 生成     : A3, A4, A5               → AI列/スマートフィル/クレンジング
M8 AI 知能     : A6, A7, A8, A9, A10      → 意味検索/対話/異常検知/検証生成/要約
M9 エージェント: A11, A12                 → MCP 公開/ワークフロー/HITL 監査
```

各 Phase: 実装 → 単体テスト(98%) → typecheck/lint/build → PR → AC 判定 → マージ → 次へ。
M3 以降は Playwright E2E を併走（Phase18 で本格スイート）。

---

## リスクと対策

| リスク | 対策 |
|---|---|
| IndexMapper の整合性破綻が全機能に波及 | Phase1 をプロパティテストで堅牢化、以降は必ず IndexMapper 経由 |
| Canvas 描画の機能増で複雑化 | scene/painter を純粋関数に保ち、描画命令をテスト |
| 数式拡張のクリーンルーム逸脱 | 関数仕様は Excel/公開仕様のみ参照、実装表現は独自 |
| AI コスト/レイテンシ | 上限数値設定・キャッシュ・決定的処理優先・バッチ並列度制御 |
| AI 出力の誤り混入 | 構造化検証＋HITL 承認＋取り消し可能 Command＋来歴 |
| 機密漏洩 | 送信前マスキング・allowlist・Vault/env、ローカル LLM 選択肢 |
| XLSX inflate 自前実装の難度 | stored 優先＋deflate を段階導入、代表ファイルで回帰 |

---

## 付録: Handsontable 機能 → Lattica 対応 Phase 早見表

| HoT 機能 | 対応 Phase |
|---|---|
| Cell types(text/numeric/date/time/checkbox/select/dropdown/autocomplete/password) | Phase 2 |
| Custom renderers/editors | Phase 2 |
| Validation / read-only / alignment | Phase 3 |
| Selection / multi-select / autofill(fill handle) | Phase 4 |
| Frozen / resize / move(列行) | Phase 4, 8 |
| Context menu / dropdown menu / shortcuts | Phase 5 |
| Sorting(single/multi) | Phase 6 |
| Filtering | Phase 7 |
| Hiding / trim / nested rows / nested headers(rowspan) | Phase 8 |
| Merge cells | Phase 9 |
| Comments / conditional formatting / custom borders / column summary | Phase 10 |
| Search | Phase 11 |
| Formulas(拡張) | Phase 12 |
| Export XLSX / **import XLSX** / CSV / clipboard | 既存 + Phase 13 |
| autoColumnSize/autoRowSize/stretchH/wordWrap | Phase 14 |
| i18n / RTL / themes | Phase 15 |
| Accessibility / keyboard / IME | 既存 + Phase 16 |
| Hooks / persistentState / pagination | Phase 17 |
| Virtualization / performance | 既存 + Phase 18 |
| **(超越) リアルタイム共同編集** | 既存 collab |
| **(超越) AI ネイティブ機能群** | Part B |
