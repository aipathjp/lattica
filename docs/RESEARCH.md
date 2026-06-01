# 技術調査サマリ（deep-research, 2026-06-02）

113 エージェントによるファンアウト検索 → 30 ソース取得 → 141 主張抽出 → 25 主張を 3 票敵対的検証（23 確定 / 2 反証）。

## 検証済み主張（confirmed）

1. **大規模では Canvas 描画が決定的に優位**。DOM 仮想化は「毎フレーム数百 DOM 要素の生成/破棄でスクロール性能が破綻」（Glide Data Grid 作者明言）。推奨＝Canvas(セル)+DOM(編集)ハイブリッド。
   - https://github.com/glideapps/glide-data-grid / https://www.ag-grid.com/javascript-data-grid/dom-virtualisation/
2. **DOM 仮想化は可変行高に重大制約**。Viewport/Infinite Row Model で可変行高は完全禁止、`autoHeight=true` は列仮想化を停止し描画劣化。
   - https://www.ag-grid.com/javascript-data-grid/row-height/
3. **HyperFormula = 数式エンジンの参照アーキ**。依存グラフ DAG→トポロジカルソートで再計算順序決定（順序は循環がない場合のみ存在＝循環検出兼用）。Chevrotain LL(k)、~400 Excel 互換関数。
   - https://hyperformula.handsontable.com/docs/guide/dependency-graph.html
4. **HyperFormula は GPLv3/商用デュアル**。完全自社 IP には採用不可 → クリーンルーム再実装必須。
   - https://hyperformula.handsontable.com/docs/guide/licensing.html
5. **fast-formula-parser(MIT) がクリーンルーム参照に最適**。Chevrotain LL(1)、lexer→parser→evaluator の 3 段、280 Excel 互換関数。MIT なので研究が法的に安全（コードは非参照方針）。
   - https://github.com/LesterLyu/fast-formula-parser
6. **hot-formula-parser(MIT) は 2021-07 アーカイブ済**。新規依存不可。
7. **TACO（VLDB2023）**：数式依存グラフを tabular locality で圧縮、展開なしクエリ＋増分維持。大規模最適化の指針。
   - https://arxiv.org/pdf/2302.05482
8. **CRDT 実装の落とし穴**：tombstone 型はメモリ劣化、非 tombstone 型は同位置並行挿入でインターリーブ・不整合。
   - https://arxiv.org/pdf/1905.01517
9. **y-supabase は本番非推奨**（早期開発・API 大幅変更予定）。Supabase Realtime 統合は自社実装が必要。
   - https://github.com/AlexDunmow/y-supabase

## 反証された主張（refuted, 0-3）

- 「CRDT は実運用でほぼ使われず OT が主流」→ 反証。出典が pro-OT 立場のバイアス。
- 「CRDT は P2P 専用設計」→ 反証。CRDT 系も client-server で構築される。

→ **結論**：CRDT は表形式共同編集の有効な選択肢。tombstone 肥大とインターリーブだけ設計で回避する（LWW-Register + 安定 ID）。

## 一次裏取りできず（追加調査 or 実装判断）
- xlsx(OOXML) 往復変換の落とし穴（書式/結合/数式）
- 表形式 CRDT の具体アルゴリズム（行挿入と数式参照整合）
- クリーンルームの法的手順
- IME + ARIA grid + Canvas 編集オーバーレイの具体パターン
