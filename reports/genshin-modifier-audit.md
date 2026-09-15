# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1574
- 数式対応可能: 995
- 実装修正候補（P0〜P2）: 0
- 完全一致の重複候補: 6
- 未制御の完全一致重複: 0
- データ契約違反: 0

- 入力契約実装済み: 98

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 995 |
| `unsupported` | 271 |
| `displayOnly` | 173 |
| `missingInput` | 98 |
| `invalidData` | 37 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 995 |
| `UNSUPPORTED_CATEGORY` | 234 |
| `SUPERSEDED_RECORD` | 92 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `CONDITION_INPUT_REQUIRED` | 43 |
| `SOURCE_CONTEXT_REQUIRED` | 40 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CATEGORY_MISCLASSIFIED` | 23 |
| `DEDICATED_FORMULA_DEFERRED` | 15 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 15 |
| `MISSING_VALUE` | 14 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 10 |
| `CUSTOM_FORMULA_REQUIRED` | 4 |
| `PROVIDER_INPUT_REQUIRED` | 3 |
| `RECORDED_HEALING_INPUT_REQUIRED` | 2 |
| `EXPLICIT_DISPLAY_ONLY` | 1 |

## 実装レーン

| lane | count |
| --- | ---: |
| `supported` | 913 |
| `includedInput` | 321 |
| `displayOnly` | 150 |
| `interactiveInput` | 98 |
| `sourceData` | 73 |
| `deferred` | 15 |
| `legacyCompat` | 4 |

## P0・P1候補

## JSONスキーマ移行状況

| schemaStatus | count |
| --- | ---: |
| `canonical` | 1343 |
| `legacyCompatible` | 231 |

## P0 / P1 candidates

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
