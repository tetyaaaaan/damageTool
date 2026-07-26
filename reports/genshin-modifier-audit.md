# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1561
- 数式対応可能: 1091
- 実装修正候補（P0〜P2）: 0
- 完全一致の重複候補: 9
- 未制御の完全一致重複: 0
- データ契約違反: 0

- 入力契約実装済み: 68

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 1091 |
| `unsupported` | 282 |
| `displayOnly` | 83 |
| `missingInput` | 68 |
| `invalidData` | 37 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 1091 |
| `UNSUPPORTED_CATEGORY` | 234 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `SUPERSEDED_RECORD` | 41 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CATEGORY_MISCLASSIFIED` | 23 |
| `CUSTOM_FORMULA_REQUIRED` | 15 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 15 |
| `DEDICATED_FORMULA_DEFERRED` | 14 |
| `MISSING_VALUE` | 14 |
| `CONDITION_INPUT_REQUIRED` | 13 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 11 |
| `PROVIDER_INPUT_REQUIRED` | 3 |
| `RECORDED_HEALING_INPUT_REQUIRED` | 2 |
| `SOURCE_CONTEXT_REQUIRED` | 2 |

## 実装レーン

| lane | count |
| --- | ---: |
| `supported` | 1007 |
| `includedInput` | 319 |
| `displayOnly` | 99 |
| `interactiveInput` | 68 |
| `sourceData` | 39 |
| `legacyCompat` | 15 |
| `deferred` | 14 |

## P0・P1候補

## JSONスキーマ移行状況

| schemaStatus | count |
| --- | ---: |
| `canonical` | 1329 |
| `legacyCompatible` | 232 |

## P0 / P1 candidates

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
