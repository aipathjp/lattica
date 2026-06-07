# Lattica 競合機能ギャップ分析 (2026-06-07)

Handsontable / AG Grid (Community+Enterprise) / Glide Data Grid / TanStack Table /
Tabulator / RevoGrid / Univer・Luckysheet / Syncfusion・DevExtreme・Kendo /
jspreadsheet、および Excel / Google Sheets のパワー機能を横断調査し、Lattica の
実装状況（Wave 14 / 1687 tests・100%）と突き合わせた結果。出典は各社公式ドキュメント。

## 凡例
- ✅ 実装済 / 🟡 モデルのみ（UI なし等の部分実装） / ❌ 未実装
- 優先度 **P0**=table-stakes（無いと「本物のグリッドではない」と見なされる） /
  **P1**=高価値の差別化（目に見えて効く） / **P2**=高度・ニッチ・モート

---

## 1. Lattica が既に強い領域（競合より前/同等）

- **AI ネイティブ**（NL→数式 / スマートフィル / 異常検知 / 検証ルール生成 / NL→操作 /
  要約・翻訳・分類 / セマンティック検索 / ワークフロー HITL）。AG Grid が v33 で AI Toolkit/MCP を
  Enterprise 化し始めた程度で、ここまで広い AI 機能を内蔵する OSS 級は稀。**最大の差別化。**
- **MCP ツールレジストリ**（get/set/range/evaluate/define_name）。AI エージェント駆動。
- **クリーンルーム MIT 数式エンジン**（自前 DAG）。Handsontable/Univer が依存する HyperFormula は
  GPLv3 or 商用。**ライセンス上の明確な優位。**
- **CRDT 共同編集 + プレゼンス**（LWW + 分数インデックス）。多くのグリッドが未内蔵。
- **Canvas 描画の性能**（100万行×1000列で実測 ~8000fps）。
- **配列スピル（動的配列）**＋ 135 関数 ＋ 名前付き範囲 ＋ R1C1。
- **多段グルーピングヘッダー**（折りたたみ可）。
- **状態の永続化**（serialize/deserialize）— 新規グリッドが見落としがちだが実装済。
- **XLSX 読み書き**（依存ゼロの自前 ZIP/inflate）・CSV/TSV・JSON。
- **Undo/Redo・クリップボード（TSV/HTML で Excel 相互運用）・フィルハンドル系列補完・結合セル**。

---

## 2. ギャップ一覧（競合にあって Lattica に無い/部分的なもの）

### P0 — table-stakes（最優先で埋めるべき）

| 機能 | 状態 | 競合 | 備考 |
|---|---|---|---|
| **リッチセル編集器**：日付ピッカー / ドロップダウン(select) / オートコンプリート / 時刻 / パスワード / マルチセレクト | ❌ (text/number/checkbox のみ) | HoT, AG, jspreadsheet, Univer 全社 | 「最も目立つ不足」。グリッドの基本期待値 |
| **データ検証 UI**：ドロップダウンリスト・数値/日付制約・拒否/警告モード | 🟡 ValidationModel はあるが編集 UI なし | HoT, DevExtreme, Sheets | 上の編集器と一体で実装 |
| **列フィルタ UI（Excel 風 set/faceted フィルタ）**：ヘッダーのドロップダウンで値チェックリスト/条件選択 | 🟡 FilterModel はあるが UI 無し（ボタン経由のみ） | HoT Filters, AG Set Filter(Ent), Kendo, Syncfusion | faceted（一意値抽出）含む |
| **数値書式文字列**：通貨/パーセント/桁区切り/日付/カスタム `#,##0.00` | ❌ (i18n ヘルパのみ) | 全 spreadsheet 系 | 列/セル単位の format |
| **グループ集計 / サマリ行（小計）**：sum/avg/count/min/max をグループ/列フッターに | ❌ (ネスト行はあるが集計なし) | Tabulator, Kendo, Syncfusion, DevExtreme | 列サマリ＝定番 |
| **検索＆置換（find & replace）** | 🟡 search のみ（replace 無し） | HoT, 全 spreadsheet | regex 置換まで |
| **列の移動/並べ替え・行ドラッグ並べ替え・列の表示/非表示(column chooser)** | ❌ (リサイズのみ) | 全社 | UI 操作 |

### P1 — 高価値の差別化

| 機能 | 状態 | 競合 | 備考 |
|---|---|---|---|
| **条件付き書式ビジュアル一式**：カラースケール / データバー / アイコンセット / 上位下位ルール | 🟡 値ルール(背景/太字)のみ | Excel, Sheets, Univer(18種), AG | 視覚的に最も効く |
| **ステータスバー（選択範囲の集計：合計/平均/件数）** | ❌ | AG(Ent), Kendo | 実装容易・効果大 |
| **スタイル付き XLSX エクスポート**（書式/結合/条件付き書式/数式を保持） | 🟡 値のみ書き出し | AG(Ent), Syncfusion, Kendo | 既存 io 層を拡張 |
| **複数範囲（非連続）選択 ＋ クリップボード相互運用の拡張** | 🟡 単一範囲想定 | HoT, Tabulator, Glide | Ctrl で複数矩形 |
| **数式関数の拡張**：XLOOKUP / XMATCH / LET / LAMBDA(+MAP/REDUCE/SCAN/BYROW/BYCOL) / SORTBY / RANDARRAY / 構造化参照 / DB関数 | ❌ | Excel, Sheets, Univer(500+) | 現 135→500 級へ |
| **ピボットテーブル（＋スライサー）** | ❌ | AG(Ent), Univer, Syncfusion | 大型機能 |

### P2 — 高度・モート・ニッチ

| 機能 | 状態 | 競合 |
|---|---|---|
| **チャート / スパークライン（セル内ミニグラフ）** | ❌ | AG(Ent), Univer, Excel |
| **マスター/ディテール（行展開で子グリッド）** | ❌（ネスト行は別概念） | AG(Ent), Kendo, DevExtreme |
| **PDF 出力 / 印刷レイアウト（ページ区切り/印刷範囲）** | ❌ | AG(Ent), Kendo, Syncfusion |
| **サーバサイド行モデル / 無限スクロール / ページネーション** | ❌（クライアント完結） | AG, Kendo, Tabulator |
| **RTL（右から左）レイアウト** | ❌ | HoT, AG |
| **シート/範囲の保護（read-only 強制）・変更履歴・バージョン** | ❌ | Excel, Sheets |
| **分割ペイン（独立スクロール）／ goal seek 等 what-if** | ❌ | Excel |
| **スレッド型コメント / @メンション** | 🟡 コメントモデルのみ | Sheets, Univer |
| **セルのフラッシュ（更新時の点滅）/ 高頻度更新最適化 / ツールチップ** | ❌ | AG, Kendo |
| **Excel テーブル（構造化テーブル：合計行/バンド/自動拡張）** | ❌ | Excel |

---

## 3. 推奨ロードマップ（優先順）

1. **Phase A（編集体験の table-stakes）**: 日付/ドロップダウン/オートコンプリート/マルチセレクト編集器
   ＋ データ検証 UI（ドロップダウン/制約/拒否・警告）。→ 「本物のグリッド」要件を満たす。
2. **Phase B（データ操作 UI）**: 列フィルタのドロップダウン UI（faceted set filter）＋ 列の移動/表示切替
   ＋ 検索＆置換 ＋ 列/グループ集計サマリ行。
3. **Phase C（書式）**: 数値書式文字列（通貨/％/カスタム）＋ 条件付き書式ビジュアル（カラースケール/
   データバー/アイコンセット）＋ ステータスバー（選択集計）。
4. **Phase D（数式深化）**: XLOOKUP/XMATCH・LET・LAMBDA系・SORTBY/RANDARRAY・構造化参照・DB関数で
   135→300+ 関数へ。スタイル付き XLSX 往復。
5. **Phase E（大型分析）**: ピボットテーブル＋スライサー、チャート/スパークライン、マスター/ディテール、
   サーバサイド行モデル、PDF/印刷。

> Lattica は AI・MCP・CRDT・クリーンルーム数式という他社が持たない上澄みを既に持つため、
> 競合に「追いつく」べきは主に **P0 の編集器・検証・フィルタ UI・数値書式・集計**。
> ここを埋めると「AI ネイティブで table-stakes も完備」という独自ポジションが完成する。

## 出典（主要）
- Handsontable: handsontable.com/features, /docs, /pricing, software-license
- AG Grid: ag-grid.com/javascript-data-grid/modules, /license-pricing, 各 feature ページ
- Glide Data Grid: github.com/glideapps/glide-data-grid
- TanStack Table: tanstack.com/table
- Tabulator: tabulator.info/docs
- RevoGrid: rv-grid.com
- Univer/Luckysheet: github.com/dream-num/univer, /Luckysheet
- Syncfusion/DevExtreme/Kendo: 各社公式 DataGrid/Spreadsheet ドキュメント
- Excel/Sheets: support.microsoft.com, support.google.com
