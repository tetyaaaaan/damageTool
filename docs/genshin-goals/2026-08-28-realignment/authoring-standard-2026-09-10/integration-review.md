# 2026-09-10 データ作成標準の正式統合

2026-09-12運用追補：ユーザー承認の「一周目を先に終える」を実行補足へ集約し、作成標準9節から参照した。既存goal本体はbyte単位で変更せず、そのG02の既存参照から新運用へ到達する。調査深度・同型棚卸し単位・production無変更時の検証量を調整し、strict・計算採用・G06/G13・root/Lunaの責任境界を維持する。内部作業の計画的先送りを処置済みへ数える変更は含めない。manifestに変更前digestを残しcurrentSha256を更新した。製品作業・queue処置は再開しない。

ユーザーが承認した統合方針を文書へ反映した。r2 revision ID、目的、A→B→C、G04安全条件、G06保留条件、G13完了条件、Sol/Luna分担、製品batchとfocused-first・末尾同期を維持する。goal作成/complete/製品resumeは行わない。

## 正式参照

- [goal本体](../revised-goal.md)
- [実行補足](../execution-addendum-2026-09-06.md)
- [データ作成標準](../../../GENSHIN_V2_DATA_AUTHORING_STANDARD.md)
- [統合前goal](revised-goal.before.md)、[統合前実行補足](execution-addendum.before.md)、[統合前入口](goal-entrypoint.before.md)、[提案原文](proposed-standard.original.txt)
- [digest記録](integration-manifest.json)

旧revision-manifest.jsonとoriginal-goal等は当時の記録として変更しない。本記録とmanifestは2026-09-10の追補。既存goal入口の参照本文SHAを更新し、登録goalのidentityは変更しない。

## 統合内容と自己レビュー

1. 新規標準1本に意味分類・正本・単位・時間/stack/snapshot・ICD・条件・BehaviorModifier・取得matrix・検証手順を集約し、関連文書から参照する。
2. candidatePrepared等は工程ラベルとして既存3軸へ対応。候補未具体化、consumer不足、版失効を隠さず、工程終了をG06/G13完了へ変換しない。
3. Primaryの欠損・版不足・取得障害でも代替先を使える。取得失敗を探索済みにしない。matrixは候補取得順で承認policyではない。
4. 独立照合対象は計算採用と受入上必要なSpec確認。schema enum/数値型と概念状態を区別する。Lv配列・disputed等の不正投入を防ぐ。
5. Effect/Behavior依存と現在状態の単発計算を区別し、複雑な時系列を無理に実装しない。必要依存欠落は局所blocked。
6. 承認済みlegacy保守を維持。新規v2の正本やstrict証明にはしない。形状canonicalとstrict canonicalを区別。
7. Runtime READMEの古いhuman一律条件と空mapの断定を改め、certificate/attestation・version有効性へ接続する。

G01/G04/G06/G13は保存本文との文字列比較で一致。G13の8条件に増減なし。実行補足の既存6手順は変更せず追記のみ。製品コード/schema/データ/queue/checkpoint/テストを変更せず、製品回帰・生成は実行しない。文書の参照実在性、保存原文のdigest一致、goal入口の本文SHA、diff checkを確認する。
