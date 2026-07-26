# 原神補正データ契約

補正JSONは、既存データを壊さず段階的に `modifier-contract.schema.json` の標準形へ移行する。

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
5. 監査レポートの `canonical` 件数を増やし、`legacyCompatible` を段階的に減らす。
