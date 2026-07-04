# プロダクトフィードバック: momotani 押印・ピッキング組み込みからの逆流要件

> 出典: momotani `features/planning/manufacturing-order-stamping/`（2026-07-05 実地調査）。
> 押印・ピッキング画面が lattica を組み込む際にプロダクト側で実装した約 1,400 行の
> ワークアラウンドを分析し、「本来 lattica 側で提供すべきテーマ」に統合したもの。
> 優先度は「壊れやすさ（内部 DOM/挙動依存）× 汎用性」で付与。

## 前提: momotani 側の現状

- lattica 利用箇所は押印・ピッキング画面のみ。`@lattica/react`（LatticaGrid / GridController / densityOptions / cellRect）と `@lattica/core`（ColumnNode 型）を使用
- **相対 workspace（`../lattica/packages/*`）+ 旧スコープ `@lattica/*` で直結**。lattica は `@ai-path/lattica-*` に改名・npm 公開済みのため、再 install で解決が壊れる。→ npm 公開版への移行が別途必要（運用課題）
- controller の public メソッド（beginEdit/updateDraft/commitEdit/getCellStyle）を WeakMap 保持で**多段モンキーパッチ**する構造が定着しており、ライブラリ更新のたびに追随リスクがある

## P0 — モンキーパッチ・内部 DOM 依存を殺すテーマ（最優先）

### T6: セル編集のコミットイベント `onCellCommit`
- 現状: 編集確定の公式イベントが無く、`on('edit')` の state=null 遷移 + prevEditRef で「編集が終わった」を**推測**して保存処理を起動（stamping-lattica-section.tsx:104-115）。再入防止の savingRef も自前
- 提案: controller に `cellcommit` イベント（`{row, col, physicalRow, physicalCol, prev, next, source: 'edit'|'paste'|'fill'|'delete'}`）+ `<LatticaGrid onCellCommit>`。paste/fill/delete 経由の変更も同一イベントで拾えること（現状 paste で保存が漏れる構造）
- 規模: 小〜中。controller の commitEdit/paste/fillTo/deleteSelection に emit を足す

### T4: per-column / per-cell の readOnly と宣言的セルスタイル
- 現状: `getCellStyle` と `beginEdit` をモンキーパッチして「編集可能列に薄黄背景・読み取り専用列は編集拒否」を実現（apply-readonly-cell-style.ts:26-53）。WORKPLAN Phase 3 の既知残項目
- 提案: `controller.setColumnEditable(col, boolean)` / `setCellReadOnly(range, boolean)` + 列定義 `editable?: boolean`。スタイルは `editableBackground` 的なテーマトークン or `getCellStyle` の公式チェーン（ユーザ関数を合成する register 方式）で置換不要に
- 規模: 中。編集開始経路（ダブルクリック/Enter/タイプ開始/F2）全てで一元判定

### T5: 列レベルの入力マスク・フォーマッタ・コミット時バリデーション（+ time 型）
- 現状: updateDraft/commitEdit をパッチして数字のみ・桁数制限・`hh:mm` マスクを実現。パッチの**適用順序に暗黙依存**（apply-stamping-grid-time-input.ts:29 コメント）。時刻の正規化ロジック 66 行もプロダクト側
- 提案: 列定義/`setColumnInput(col, { sanitizeDraft?, maxLength?, commit?: (raw)=>string|null })`。`null` 返却で入力破棄（現 cancelEdit 相当）。セル型に `time`（hh:mm、正規化込み）を追加（既存 type: number/date と同列）
- 規模: 中。既存 setColumnType/setColumnValidator の系に「draft 段階」と「commit 変換」のフックを増設

### T2: セルアンカー overlay の公式 API
- 現状: セルに React ポップオーバー（ロット/担当者エディタ）を被せるため、`querySelector("[tabindex='0']")` でルート DOM を推測し cellRect + getBoundingClientRect を自前合成（grid-cell-anchor.ts:7,24-32）。同一 pointer イベントで即閉じる問題を setTimeout(0) で回避。**本調査で最も壊れやすい依存**
- 提案:
  1. `LatticaGridHandle`（forwardRef）: `getCellClientRect(row,col): DOMRect | null`・`focus()`・`scrollToCell(row,col)` を公開
  2. `<LatticaGrid renderCellOverlay={(anchor: {row,col,rect,close}) => ReactNode}>` + `controller.openCellOverlay(row,col)` で open/close ライフサイクルをライブラリ管理（クリックスルー・スクロール追従・Escape/選択移動で閉じるまで込み）
- 規模: 中〜大。ただし master/detail・フィルタパネルで類似の絶対配置は既実装であり流用可能

### T3: 編集エディタのキャレット/選択制御
- 現状: 編集開始時の全選択により 2 文字目以降が消えるため、`data-testid="lattica-editor"` を DOM 探索して rAF 二重で setSelectionRange(len,len)（grid-popover-cell-overlay.tsx:177-195）。Radix Popover を捨てる遠因にもなった
- 提案: `<LatticaGrid editSelection?: 'all'|'end'|'preserve'>`（既定 'all'=現行互換）+ 列単位上書き
- 規模: 小。editors.ts のフォーカス処理に分岐 1 つ

## P1 — 組み込み体験の骨格

### T7+T8: 行データバインディングとリッチ列モデル（統合テーマ）
- 現状:
  - `useGridController` が初回 rowCount 固定のため、非同期ロード後に **controller を作り直す**フックを自作（use-synced-grid-controller.ts:7-20）
  - 外部状態→グリッドは **全セル二重ループ setCellText** でしか同期できない（stamping:73-78 / picking:62-67）
  - `ColumnNode` は headerName しか使えず、editable/型/幅/桁数を列定義の**外側**に別管理（stamping-grid-columns.ts 338 行）。行→セル値の手動マッピング関数も自作
- 提案（2 段階）:
  1. `controller.setRowCount(n)` / `controller.setData(matrix | records, {fields})` の一括投入 API（undo 履歴外・1 回の change emit）
  2. `ColumnDef` の拡張消費: `field` / `width`（0.1.2 で幅系は結線済） / `type` / `editable` / `align` / `format` / `maxLength` を `<LatticaGrid columns>` から一括適用。`<LatticaGrid rows={records}>`（controlled）+ onCellCommit で「React らしい」使い方を一級市民に
- 規模: 大。ただし core/data に DataSource・field 定義は既存で、react 層の結線が主

### T11: 印刷 / 静的 HTML レンダリング
- 現状: canvas グリッドは印刷不可のため、**素の HTML table を別実装**（157 行）+ 印刷専用の列幅・列 index を二重定義（stamping-print-columns.ts 91 行）。グリッド列とのズレは人手同期
- 提案: `renderStaticTable(controller, columns, opts): ReactElement`（@ai-path/lattica-react）or `tableToHtml`（io）。列幅・列定義・書式は controller/columns から自動導出し、`@media print` 用の推奨 CSS を同梱。既存 io の tableToPdf / writeStyledXlsx と姉妹の「HTML 出力」
- 規模: 中。scene のセル値/スタイル解決系を再利用

### T10: SSR セーフ化
- 現状: import 時に window/canvas を触るため `next/dynamic ssr:false` ラッパーを 2 枚作成。印刷を別実装にした遠因でもある
- 提案: モジュール import を副作用ゼロにし、window/canvas 参照を初回 effect まで遅延。「Next.js App Router でそのまま import できる」を e2e で保証（playground を SSR モードでビルドするテスト）
- 規模: 小〜中（要因調査次第）

## P2 — 仕上げ

### T9: 密度メトリクスの公開 / コンテンツ準拠の自動サイズ
- 現状: compact 密度の内部数値（行高 20・ヘッダ高 20・行ヘッダ幅 40・列幅 90）を**ハードコード複製**して高さ/幅を自前計算（use-synced-grid-controller.ts:26-43）
- 提案: `densityMetrics(density)` で解決済み寸法を公開 + `<LatticaGrid autoSize="content" maxHeight={...}>`（行数分の高さに自動フィット、上限超はスクロール）。これで momotani の高さ計算関数は不要に
- 規模: 小（metrics）+ 中（autoSize）

### T12: 公開契約の明文化
- 現状: `data-testid="lattica-editor"` / `lattica-filter-*` / `[tabindex='0']` への CSS・querySelector 依存が散在。T1（フィルタ/ソート非表示の CSS 消し）は **0.1.2 の `filterable` / `sortable` / `showSortIcons` / `showFilterIcons` props で既に解消可能**
- 提案: T2/T3 の公式 API 提供で DOM 依存自体を不要化した上で、data-testid 命名を public contract として AGENTS.md に明記（変更時は semver minor）

## 解消済み（momotani 側で削除可能）

- `lattica-grid-no-filters.tsx` → `<LatticaGrid filterable={false} sortable={false}>`（0.1.2）
- 行番号ガター非表示が必要なら `showRowNumbers={false}`（0.1.2）
- 列幅・非表示列の永続化は `onViewStateChange` + `applyViewState`（0.1.2）

## 実装順序の提案

1. **Wave 1（パッチ撲滅）**: T6 → T4 → T5 → T3（いずれも controller/editors の増設。momotani の apply-*.ts 4 本と編集終了推測を全廃）
2. **Wave 2（overlay）**: T2（LatticaGridHandle + renderCellOverlay。grid-popover-cell-overlay 229 行を大幅縮小）
3. **Wave 3（骨格）**: T7+T8（データバインディング+列モデル）、T10（SSR）
4. **Wave 4**: T11（印刷）、T9（autoSize）、T12（契約明文化）

各 Wave は独立 PR 分割・カバレッジ 100% 維持・クリーンルーム遵守。momotani 側は Wave 1-2 完了時点で
モンキーパッチ層と DOM 依存が全廃でき、npm 公開版 `@ai-path/lattica-*` への移行と同時に刷新するのが効率的。
