# Lattica — アーキテクチャ設計書

> 高性能・フレームワーク非依存コア + React/Next.js 専用バインディングのデータグリッド／スプレッドシートエンジン。
> 完全自社 IP・コピーレフト非依存（MIT）。クリーンルーム実装。

本設計は `deep-research` による技術調査（検証済み主張 23 件 / 反証 2 件）に基づく。出典は `docs/RESEARCH.md` を参照。

---

## 0. 設計原則

1. **コアはフレームワーク非依存・ランタイム依存ゼロ**。React は薄いバインディング層に閉じる。
2. **重いロジックは純粋関数／純粋クラスに寄せる**（座標・仮想化・選択・コマンド・数式）。→ DOM/Canvas を持ち込まずに単体テストで 98% を達成する。
3. **描画はハイブリッド**：セルは Canvas、編集・ヘッダー・ARIA ミラーは DOM。
4. **クリーンルーム**：Handsontable / AG Grid / HyperFormula のソースは参照せず、公開仕様・関数仕様のみから独立実装する（§7）。
5. **コピーレフト依存ゼロ**：GPL の HyperFormula は不採用。ランタイム依存は原則ゼロ、devDependencies のみ。

---

## 1. レンダリングアーキテクチャ（調査根拠: claim 1,2）

### 決定: Canvas 描画 + DOM オーバーレイのハイブリッド

| 方式 | 代表 | 大規模性能 | リッチ編集 | a11y/IME | 採否 |
|------|------|-----------|-----------|----------|------|
| DOM 仮想化 | AG Grid, Handsontable | × 毎フレームの DOM 生成/破棄で破綻 | ◎ | ◎ | 不採用 |
| Canvas | Glide Data Grid | ◎ 数百万行を遅延描画 | △ オーバーレイ要 | △ ミラー要 | **採用（描画）** |
| ハイブリッド | (本実装) | ◎ | ◎ | ◎ | **採用** |

- **Canvas レイヤ**：可視セルのみ毎フレーム再描画。React の reconciliation を完全にバイパスし、`requestAnimationFrame` で命令的に描く。
- **DOM オーバーレイ**：
  - アクティブセルエディタ（`<input>`/`<textarea>`/カスタム）→ IME/日本語入力はここで OS ネイティブに処理。
  - ヘッダー（多段グルーピング §6）は DOM。数が少なく、折りたたみ等のインタラクションが豊富なため。
  - ARIA ミラー（`role="grid"` の不可視 DOM）→ スクリーンリーダ対応（§8）。
- **仮想化の責務分離**：「どの行・列が可視か」「各セルの矩形」は `core` の `Viewport`/`SizeManager` が純粋計算。`react` はその結果を Canvas に描くだけ。

### 双方向仮想化・可変行高・固定行列
- `SizeManager`：既定サイズ + 個別オーバーライドを持ち、`offsetToIndex` / `indexToOffset` を**プレフィックス和 + 二分探索**で O(log n)。
- 固定行列（frozen panes）：ビューポートを 4 象限（左上=両固定 / 上=行固定 / 左=列固定 / 本体）に分割。各象限は独立スクロールオフセットで同じ `SizeManager` を引く。

---

## 2. 数式エンジン（調査根拠: claim 3,4,5,6,7）

### 決定: 自前 lexer → Pratt parser → AST → evaluator + 依存 DAG（クリーンルーム）

HyperFormula は参照アーキだが GPLv3 で採用不可。MIT の fast-formula-parser を「関数カバレッジの目安(280)」「Chevrotain LL(1) の段構成」としてのみ参照（コード非参照）。

- **Lexer**：数値 / 文字列 / 真偽 / セル参照(A1, $A$1) / 範囲(A1:B2) / 関数名 / 演算子 / 区切りをトークン化。
- **Parser**：**Pratt（演算子優先順位）パーサ**。Chevrotain のような外部依存を持たず自前実装。
  - 優先順位：`:`(範囲) > 単項`-` > `^` > `* /` > `+ -` > `& `(連結) > 比較(`= <> < > <= >=`)。
- **AST**：`NumberLit | StringLit | BoolLit | Reference | RangeRef | UnaryOp | BinaryOp | FunctionCall | ErrorLit`。
- **依存グラフ（DAG）**：各セル=ノード、`X` が `Y` を参照 ⟺ `X→Y` 有向辺。
  - **トポロジカルソート**で再計算順序を決定。順序が作れない＝循環参照 → `#CYCLE!`（claim 3: 「順序は循環がない場合に限り存在」）。
  - **最小再計算**：編集セルから到達可能なノードのみ再評価（逆依存をたどる）。
  - **範囲ノード / 名前付き式ノード**を追加ノード型として持つ（HyperFormula と同じ概念モデル、独立実装）。
- **エラー型**：`#DIV/0! #VALUE! #REF! #NAME? #N/A #NUM! #CYCLE!`。
- **関数ライブラリ**：math / statistical / text / date-time / logical / lookup を段階実装（初期 v0.1 は主要 ~60、目標 280）。
- **大規模最適化（将来）**：TACO の tabular locality 圧縮（claim 7）を範囲ノードに適用しグラフ肥大を回避。

---

## 3. リッチセル型と編集

- **レンダラ / エディタ分離**：`CellRenderer`(Canvas 描画関数) と `CellEditor`(DOM コンポーネント) を型ごとに登録。
- セル型：text / number / boolean(checkbox) / date / dropdown(select) / autocomplete。
- **バリデーション**：`validator(value) => boolean | Promise<boolean>`。不正値は描画でフラグ。
- **コピー&ペースト**：クリップボードに `text/plain`(TSV) と `text/html`(table) を同時に書き込み、Excel/Sheets と相互運用。貼付時は TSV を行列展開。
- **Undo/Redo**：コマンドパターン（§4 で core に実装）。

---

## 4. コマンド / Undo-Redo / トランザクション（core）

- すべての変更は `Command { apply(state), invert() => Command }`。
- `UndoManager`：undo/redo スタック。`transaction(() => {...})` で複数コマンドを 1 単位にまとめる。
- 共同編集（§5）と統合：ローカルコマンドはリモートにブロードキャスト、リモート受信もコマンドとして適用。

---

## 5. リアルタイム共同編集（調査根拠: claim 8,9 + 反証 2 件）

調査で「CRDT は実運用で使われない」「CRDT は P2P 専用」は**いずれも反証(0-3)**。CRDT は有効な選択肢。ただし実在課題：
- tombstone ベースは削除蓄積でメモリ劣化（WOOT/Teletype）。
- 非 tombstone は同位置並行挿入でインターリーブ・不整合（Logoot）。

### 決定: サーバ権威 + 表特化 CRDT（Lamport タイムスタンプ LWW）
- **セル値**：`(value, lamportClock, siteId)` の **LWW-Register**。tombstone 不要。同位置衝突は (clock, siteId) で全順序決定 → インターリーブ問題を回避。
- **行/列の挿入削除**：**安定 ID（fractional indexing）** で順序付け。参照（数式）は座標でなく安定 ID にバインドし、行挿入後も整合。
- **トランスポート**：抽象 `CollabTransport` インタフェース。実装として Supabase Realtime アダプタを `react`/別アダプタで提供。サーバ権威（broadcast + 永続化）。
- **プレゼンス**：各 site のアクティブセル/選択範囲を presence チャネルで共有、Canvas に他者カーソルを描画。

---

## 6. 多段グルーピングヘッダー（調査根拠: AG Grid column-groups / Handsontable nested-headers）

### データ構造: 列定義ツリー
```
ColumnGroupDef = { headerName, children: (ColumnGroupDef | ColumnDef)[], collapsible?, openByDefault? }
ColumnDef      = { field, headerName, width?, ... }
```
- ツリーを**段（depth）に平坦化**して、各段の `HeaderCell { fromCol, toCol, depth, label, collapsible }` を計算（純粋関数、core でテスト）。
- 葉ノード = 実列。中間ノード = グループ見出し（colspan）。
- **折りたたみ**：グループに `collapsed` フラグ。`openByDefault=false` の子を非表示にし、可視列リストを再計算。
- 行ヘッダー側のグルーピング（行の段組み）も同じ平坦化ロジックを転用。
- **本家にない柔軟性**（要望）：任意段数・列と行の双方向グルーピング・グループ単位の固定/折りたたみ/集計行を、ツリー定義だけで宣言的に表現。

---

## 7. ライセンス・知財・クリーンルーム（調査根拠: claim 4,6 + Google v. Oracle）

- **本ライブラリ**：MIT。著作権表記 = AI-Path, Inc.。
- **不採用**：HyperFormula（GPLv3）。ソース参照も禁止。
- **クリーンルーム手順**：
  1. 機能は公開ドキュメント・公開仕様（OOXML, ARIA grid, Excel 関数仕様）からのみ実装。
  2. Handsontable/AG Grid/HyperFormula の**ソースコードを読まない・コピーしない**。本設計書がその証跡。
  3. API 名・概念（DAG、トポロジカルソート、nested headers 等）はアイデア/インタフェースであり著作権対象外（Google v. Oracle のインタフェース互換性法理）。ただし固有の命名・コメント・実装表現は独自にする。
- 特許リスク：データグリッドの基本機能は周知技術。固有アルゴリズムの独自実装で回避。

---

## 8. 周辺技術

- **アクセシビリティ**：Canvas と並走する不可視 DOM の ARIA ミラー（`role="grid"` / `row` / `gridcell` / `aria-rowindex` / `aria-colindex`）。可視範囲のみミラー。
- **IME/日本語入力**：編集は DOM `<input>` オーバーレイで行い、`compositionstart`/`compositionend` を監視して変換確定まで commit を保留。
- **テスト**：core/formula/io は Vitest（純粋ロジック、98%）。react は happy-dom + Canvas 2D モックで描画命令を検証。E2E は将来 Playwright。
- **TypeScript**：`strict` + `noUncheckedIndexedAccess`。公開型は最小限・安定。
- **プラグイン**：セル型・関数・トランスポートは登録式（レジストリ）。
- **バンドル**：tsup で ESM+CJS、tree-shakable、`sideEffects:false`。

---

## 9. パッケージ構成

| パッケージ | 役割 | 依存 |
|-----------|------|------|
| `@lattica/core` | データモデル・座標・仮想化・選択・コマンド/undo・多段ヘッダー平坦化 | なし |
| `@lattica/formula` | 数式 lexer/parser/AST/evaluator/依存DAG/関数ライブラリ | core |
| `@lattica/react` | Canvas レンダラ・編集オーバーレイ・ヘッダー・ARIA・フック | core, formula, react |
| `@lattica/io` | CSV/TSV・xlsx(OOXML) 入出力・クリップボード | core |
| `@lattica/collab` | 表特化 CRDT・プレゼンス・トランスポート抽象 | core |

依存方向は一方向（core が最下層）。循環なし。
