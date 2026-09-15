# 原神補正データ契約

補正JSONは、既存データを壊さず段階的に `modifier-contract.schema.json` の標準形へ移行する。

本書は既存計算の互換modifier形式の契約。新規v2の正本・Spec分類・出典・採用資格は[データ作成標準](GENSHIN_V2_DATA_AUTHORING_STANDARD.md)と[r2 goal](genshin-goals/2026-08-28-realignment/revised-goal.md)に従う。既存r2で承認済みのlegacy誤り修正は維持するが、canonical検証の根拠にはしない。

## 標準フィールド

- `id`: 補正を一意に識別する安定ID。
- `category` / `applyTo`: 計算段階と対象。
- `condition`: 発動条件。複数効果で一つの入力を共有する場合は `conditionGroupId` を使う。
- `calculationSupport`: `simple`、`toggle`、`stack`、`dynamic`、専用式等の計算方式。
- `uidHandling`: UID入力に含まれるか、戦闘条件として別加算するか。
- `targetOwner`: `self`、`team`、`activeCharacter`、`otherPartyMembers`、`enemy` のいずれか。
- `conditionInput`: 層数・選択肢・対象数など、計算が実際に消費する入力だけに付ける。
- `sourceText`: ゲーム内説明の原文。

## 移行規則

1. 原文解析だけで対象を推定せず、パーティ効果には `targetOwner` を明記する。
2. 説明用の `stack` だけでは入力UIを生成しない。`conditionInput` または計算可能な層契約を必要とする。
3. 分割前の生成レコードは削除せず、`auditDisposition: supersededByStructuredRecord` で計算対象外にする。
4. 専用entryや状態モデルがない効果を一般ダメージバフとして代用しない。
5. 誤適用・重複・必要入力を修正し、実計算の正しさを検証する。形状監査の `canonical` はstrict verified/canonical Runtimeを意味しない。件数増加を目的にせず、v2昇格には独立証拠と現行gateを要する。
