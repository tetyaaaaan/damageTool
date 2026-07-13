# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1560
- 数式対応可能: 1098
- 実装修正候補（P0〜P2）: 28

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 1098 |
| `unsupported` | 310 |
| `missingInput` | 63 |
| `displayOnly` | 50 |
| `invalidData` | 39 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 1098 |
| `UNSUPPORTED_CATEGORY` | 235 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `CUSTOM_FORMULA_REQUIRED` | 38 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CATEGORY_MISCLASSIFIED` | 23 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 22 |
| `SUPERSEDED_RECORD` | 19 |
| `MISSING_VALUE` | 15 |
| `CONDITION_INPUT_REQUIRED` | 8 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 7 |
| `EFFECT_OVERRIDE_FORMULA_REQUIRED` | 4 |
| `PROVIDER_INPUT_REQUIRED` | 3 |
| `RECORDED_HEALING_INPUT_REQUIRED` | 2 |
| `SOURCE_CONTEXT_REQUIRED` | 2 |
| `SCALING_FORMULA_REQUIRED` | 1 |

## 実装レーン

| lane | count |
| --- | ---: |
| `supported` | 810 |
| `includedInput` | 523 |
| `displayOnly` | 81 |
| `input` | 63 |
| `sourceData` | 40 |
| `formula` | 28 |
| `legacyCompat` | 15 |

## P0・P1候補

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
