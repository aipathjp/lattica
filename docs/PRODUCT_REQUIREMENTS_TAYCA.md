# Taible 機能要件 — tayca-okayama-qc Handsontable 16 置換分析

作成: 2026-07-05。tayca-okayama-qc（岡山工場 品質管理システム、Handsontable 16.2.0 + @handsontable/react-wrapper）の全 Handsontable 利用箇所（82 ファイル）を調査し、Taible 置換に必要な機能を洗い出した結果。PRODUCT_FEEDBACK_MOMOTANI.md と同系のプロダクト要件入力。

## 0. 対象アプリの構図

| 領域 | 状態 | グリッド利用の濃さ |
|---|---|---|
| 操業日報 (operation-daily-report) | 本番・最大の主戦場 | 6 種類のグリッド実装（汎用編集/アタック分析/クリスト/月間一覧/PN 手書き帳票 6 枚/汎用小グリッド） |
| 工程検査日報2 (inspection-daily-report-2) | 本番・第 2 の主戦場 | 共通ラッパー InspectionHandsontable 経由で全表。溶液系の非定型レイアウト多数 |
| 生産管理 (production-management) | 本番 | 3 段ヘッダーの記録テーブル ×2 |
| 生産計画/スケジューラ (production-planning, production-scheduler) | プロトタイプ | ガント風（mergeCells + 色バー + 自前 D&D）。要件抽出の優先度低 |
| code-no-detail | HOT 不使用 | 素の HTML table（レンダラ内ボタン → CustomEvent でモーダル連携のみ関係） |

重要な設計事実:
- 編集フローは全域で「afterChange → pending Map（`table:record:col`）に蓄積 → 明示保存で一括 apply + audit_log BATCH_UPSERT」。**グリッドは DB を直接書かない**。
- 履歴管理・ロールバックは DB 層（audit_log v2 + rollback RPC）で実装済みでグリッド非依存。グリッドとの結合点は (1) source 区別付き変更イベント (2) セルメタでの未保存/差分ハイライト の 2 点のみ。
- Handsontable の UndoRedo プラグインは「グリッド内の一時 undo」でしかなく、業務上のリバートは audit_log ベース。Taible の undo/redo（enable/disable 切替つき）で代替可能。
- 楽観ロックは現状なし（last-write-wins）。

## 1. ギャップ分析サマリ

### すでに Taible にあり置換可能（実装不要）
多段ヘッダー（colSpan/rowSpan/折りたたみ）、frozen panes、列幅リサイズ + setColumnWidth、mergeCells、コピペ（TSV+HTML）、fill handle、ソート/条件フィルタ/ファセット/検索置換、context menu（カスタム可）、条件付き書式、数値書式、`onCellCommit`（source: edit/paste/fill/delete/undo/redo）、`setColumnValidator`、`setColumnInput`（sanitizeDraft/commitTransform）、time 型（`930`→`09:30`）、checkbox/dropdown/date/autocomplete エディタ、undo/redo + transaction、`setCellReadOnly`、cellOverlay + `getCellClientRect`、印刷用 static table、SSR-safe、canvas 仮想化、`setRecords`/`setData`/`setRowCount`。

### ギャップ（P0 = 置換の成立に必須）

#### P0-1. セル単位メタ層（Handsontable `cells()` 相当）
座標・外部状態ベースで **className/style/readOnly を毎描画合成**できるコールバック API。
- 用途: 未保存 pending セルの青ハイライト（操業・検査両日報の中核 UX）、監査 diff の赤枠、判定基準範囲外の黄背景+赤字、合計行/日計行のグレー背景+編集不可、他列値依存の条件書式（安定度T×目視）。
- 現状 Taible は value-based conditional format + `setCellReadOnly` のみで、**「外部の pending Map を参照して任意セルを塗る」経路がない**。momotani でも `getCellStyle` モンキーパッチが発生した実績あり。
- 要件: `cellMeta?: (row, col, record) => { style?, className?, readOnly? }` 相当の prop。**データ再構築後も同一フレームで再適用**されること（tayca は Handsontable の DOM 付与方式でフレーム落ちの点滅バグ ISS-0053 を踏み、cells メタ内在化で解決した経緯。canvas 描画の Taible は構造的に有利）。外部状態変化時の再描画トリガー（`refresh()` / signal）も必要。

#### P0-2. セル内インタラクティブ要素（リンク/ボタンセル）
- 用途: コードNo セルをボタン化して詳細モーダルを開く（操業・検査・月間一覧・生産管理の横断パターン）、行削除ボタン列、月間一覧の詳細ボタン、▼キャレット付き擬似ドロップダウンセル。
- 現状: CellTypeRegistry は描画のみ。クリック可能領域の概念がない。
- 要件: セル型 or cellMeta で「アクション付きセル」を宣言し、`onCellAction(row, col, record)` が発火する仕組み（canvas ヒットテスト）。ホバーカーソル変更含む。Handsontable では renderer 内 `td.innerHTML` + addEventListener + CustomEvent ブリッジという壊れやすい実装だったので、第一級 API 化で大幅改善になる。

#### P0-3. カスタム source 付きプログラム書込みと source フィルタ
- 用途: バリデーション失敗時の旧値リバート（`setDataAtCell(..., 'hot-revert')` を afterChange で無視して無限ループ防止）、時刻連動セル（スチーム終了→注水始を readOnly セルへ転記）、保存後の整形値書き戻し。tayca には独自 source が 8 種類ある。
- 要件: `setCellText(row, col, value, { source?: string, bypassReadOnly?: boolean, silent?: boolean })` と、`cellcommit` イベントへの source 伝播。プログラム書込みが undo 履歴に入るかを制御できること。

#### P0-4. 空セルのプレースホルダヒント
- 用途: 全編集グリッドで空セルに薄グレーの入力形式ヒント（`0.0` / `00:00` / `YYYY-MM-DD` / `（入力で検索・選択）`）を列型別に表示。値ではなく表示のみ。編集モード時のみ表示の出し分け。
- 要件: `setColumnPlaceholder(col, hint)` or ColumnNode に `placeholder`。表示条件（編集可能時のみ等）の制御。

#### P0-5. 編集の外部強制 commit/cancel + 複数インスタンス一括
- 用途: タブ切替直前・モーダル表示直前に編集中セルを確定（tayca は `blurActiveElement()` と `blur-grids-before-modal.ts` の DOM ハックで全グリッドのエディタを blur + Escape dispatch）。
- 要件: `controller.commitEditing()` / `cancelEditing()`。加えてページ内全インスタンスを対象にできる static ユーティリティ（`Taible.commitAllEditing()` 相当）があると DOM ハックを完全排除できる。

#### P0-6. 自動高さ（全行表示）モード
- 用途: tayca のほぼ全表が `height:'auto'` + 内部スクロール無効（`.wtHolder` を CSS `!important` で強制解除）で「文書フローに全行を展開し、スクロールは外側コンテナ」というレイアウト。帳票アプリの基本形。
- 現状: Taible は固定 viewport + 仮想化前提。
- 要件: `autoHeight` モード（グリッド高さ = コンテンツ高さ、行数分描画）。日報は数十行なので仮想化なしで性能問題なし。横スクロールのみ外側委譲できること。

#### P0-7. 行の実ピクセル座標取得 + レイアウト変化イベント
- 用途: 検査日報の削除レール（グリッド右外側に絶対配置した行別ゴミ箱ボタン列。前置ストリップ・多段ヘッダーがあっても実座標で整合）、判定基準ストリップとの列位置合わせ。
- 現状: `getCellClientRect` は momotani 対応で実装済み。
- 要件: 追加で (a) 行単位 rect の一括取得 or `getRowClientRect(row)`、(b) `afterRender` 相当の「レイアウトが変わった」通知イベント（削除レールの再計測トリガー）、(c) 列幅 px の getter（`getColumnWidth(col)`）。

#### P0-8. 命令的な行挿入/削除 API
- 用途: 「行を追加」ボタン、空スロット→仮想行昇格、行削除（レール/コンテキストメニュー）、追加行への初期値自動セット（前行日付+1 日）。
- 現状: `setRowCount` / controlled `rows` 差し替えのみ。座標指定 `insertRow(i)` / `removeRow(i)` がない。
- 要件: `insertRow(index, record?)` / `removeRow(index)`（データシフト + undo 対応 + cellcommit 通知）。controlled モードでは差し替えで良いが、非制御時の命令 API が tayca の移植コストを大きく下げる。

### ギャップ（P1 = 移植品質・工数に大きく効く）

#### P1-1. 時刻・数値入力ギミックの標準強化
tayca の `hot-cell-parse.ts` は最重要の自前ロジック群。`setColumnInput` の sanitizeDraft/commitTransform でアプリ側実装は可能だが、以下は Taible 標準に取り込む価値が高い（帳票系で汎用）:
- 壁時計時刻の桁数補完: `1613`→`16:13`、`635`→`06:35`、`18`→`18:00`（現行 time 型の `930`→`09:30` の拡張）
- 経過時間型: `H:MM(:SS)`、24h 超許容、表示 `d:HH:MM`
- 「時刻 or 小数時間」両対応列（time_or_decimal_hours）
- 全角数字/コロンの検出（拒否 or 自動半角変換の選択制）+ エラー通知コールバック
- カンマ入り数値のパース、Excel 時刻シリアル（0〜1 小数→HH:MM）の吸収
- **0 と空の区別**: 0 を明示表示（`0.00` 等）、空セルは null（Handsontable は空セルを `""` で送るためサーバ側サニタイズが必要だった。Taible は「空 = null」保証を仕様化する）

#### P1-2. 複数行ヘッダーラベルと可変ヘッダー高
- `\n` 入りヘッダーラベルの改行描画（tayca は `<br>` 変換 + `white-space:pre-line` + 高さ auto の CSS ハックで実現）、ヘッダー行高の内容追従。
- 3 段ヘッダー（カテゴリ/項目/単位）+ 「単位なし列は 2-3 段目を視覚結合」（tayca はヘッダー td の border/padding を DOM 操作で消して結合を偽装）。ヘッダーセルの rowSpan は computeHeaderLayout にあるため、**ColumnNode 定義から 3 段+単位行を自然に表現できること**を tayca の列定義（groupName/columnName/unit）で検証する。

#### P1-3. セル単位の表示フォーマット（値非破壊）
- 用途: F-H2SO4 整数四捨五入、Ti3+/T% 小数 1 桁、V の toFixed(2)、時刻 5 桁切りなど「元データは変えず表示のみ整形」。監査断面では「変更前の値」への表示差し替えも行う。
- 要件: 列単位 format はあるので、**セル/外部関数による表示値オーバーライド**（`getDisplayValue(row, col) => string` 差し込み）があると監査断面プレビューがそのまま移植できる。

#### P1-4. キーボード/ナビゲーション設定
- `enterMoves: {row:0, col:1}`（Enter で右移動）、`enterBeginsEditing`、`tabNavigation` の on/off、`outsideClickDeselects:false`、選択そのものの無効化（`disableVisualSelection` 相当の閲覧専用モード）。
- undo/redo の有効/無効切替（編集モード外・行追加中は無効化）と履歴クリア（`undo.clear()` は既存）。

#### P1-5. コンテキストメニューの機能制限プリセット
copy/cut のみ、readOnly 時は無効、といった制限構成（`contextMenu` は関数型なので実現可能。メニューから paste/行操作を除外しても clipboard 動作が一貫することの確認）。

#### P1-6. セル内テキスト折返し描画（wordWrap）
core の measure（wrapText/autoRowHeight）はあるが canvas 描画が未結線。tayca はほぼ `wordWrap:false` だが、備考系セルで将来必要。優先度は P1 下位。

### ギャップ（P2 = あれば良い / プロト由来・代替あり）

- **カスタムエディタ登録 API**: エディタは固定 6 種。tayca 本番はカスタムエディタ不使用（擬似ドロップダウンは Popover を外に重ねる方式）で、Taible の cellOverlay/renderCellOverlay で同等以上が可能。生産計画プロトの色ピッカーエディタも overlay で代替可。第一級 API 化は他案件の要望を待って判断。
- **コメント/ツールチップの grid 結線**: core にモデルはあるが未描画。tayca は `title` 属性ベースの簡易ツールチップ（異常値検知）のみ → cellMeta に tooltip を含めれば足りる。
- **ガント/スケジューラ対応**（mergeCells + セルバー描画 + D&D）: tayca 側がプロトタイプのため要件確定を待つ。mergeCells とカスタムレンダラで表現可能。
- **集計フッター行の第一級サポート**: tayca は合計/日計行をデータ末尾に混ぜて cells で防御している。cellMeta（P0-1）+ readOnly で移植は可能だが、`summaryRows` 概念があると全帳票で実装が簡潔になる。
- 楽観ロック・競合検出: アプリ層の課題（現状 tayca にもない）。グリッド要件ではない。

## 2. tayca 移植で Taible 側の対応が不要なもの（上位層が担う）

- pending Map 管理・localStorage 下書き・仮想行昇格・code_no カスケード・承認自動失効・スナップショット diff・audit_log/rollback: すべて Handsontable 非依存の上位ロジック。結合点は `onCellCommit`（source 区別）と cellMeta の 2 つだけ。
- 承認者/作業員の即時オートセーブ: shadcn Select であってグリッド外。
- 列カタログ（column-labels ↔ DB ↔ チャート共有）: 列定義の SoT はアプリ側。ColumnNode がリッチ化済み（field/type/editable/align/format/maxLength）なのでマッピング可能。

## 3. 推奨実装順

1. **P0-1 cellMeta 層 + P0-3 source 付き書込み** — pending ハイライトとリバートパターンが動けば全帳票の骨格が成立
2. **P0-6 autoHeight モード** — レイアウトの前提。これがないと 1 画面も置換できない
3. **P0-2 アクションセル + P0-4 プレースホルダ** — 全表で頻出の UX
4. **P0-5 commit 強制 / P0-7 座標取得+レイアウトイベント / P0-8 行挿入削除** — 周辺 UI（削除レール・ストリップ・モーダル）連成
5. **P1 群** — 時刻補完拡張・多段ヘッダーラベル・表示オーバーライド・ナビ設定
6. 置換パイロットは **生産管理の記録テーブル**（構成が最も素直、3 段ヘッダー+undo/redo+条件書式）→ 検査日報 → 操業日報（最難関: PN 帳票の mergeCells+時刻連動）の順を推奨

## 4. 出典

調査日 2026-07-05。詳細な file:line 根拠は調査セッション（Sibyl session deacc656-2a3c-477e-be83-f3c167f7ea82）の transcript を参照。主要ファイル:
- 操業日報: `features/data/operation-daily-report/`（`hot-cell-parse.ts`, `operation-pending-handsontable-dom.ts`, `use-editable-data-section.ts`, `pn-attack-*.tsx`, `operation-daily-hot-column-widths.ts`）
- 検査日報: `features/data/inspection-daily-report-2/`（`inspection-handsontable.tsx`, `inspection-hot-delete-rail.tsx`, `inspection-pending-cell.ts`, `liquid-tab-diff-highlight-keys.ts`, `inspection-judgment-criteria-strip.tsx`）
- 履歴系: `features/audit-log/`, `lib/audit/`, `supabase/migrations/20260411*_audit_*.sql`
- 生産管理: `features/data/production-management/components/production-management-daily-records-table(-2).tsx`
