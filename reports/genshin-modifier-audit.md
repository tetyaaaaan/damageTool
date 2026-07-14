# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1562
- 数式対応可能: 1101
- 実装修正候補（P0〜P2）: 19

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 1101 |
| `unsupported` | 300 |
| `missingInput` | 67 |
| `displayOnly` | 55 |
| `invalidData` | 39 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 1101 |
| `UNSUPPORTED_CATEGORY` | 234 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CUSTOM_FORMULA_REQUIRED` | 29 |
| `CATEGORY_MISCLASSIFIED` | 23 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 22 |
| `SUPERSEDED_RECORD` | 20 |
| `MISSING_VALUE` | 15 |
| `CONDITION_INPUT_REQUIRED` | 12 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 11 |
| `EFFECT_OVERRIDE_FORMULA_REQUIRED` | 4 |
| `PROVIDER_INPUT_REQUIRED` | 3 |
| `RECORDED_HEALING_INPUT_REQUIRED` | 2 |
| `SOURCE_CONTEXT_REQUIRED` | 2 |
| `SCALING_FORMULA_REQUIRED` | 1 |

## 実装レーン

| lane | count |
| --- | ---: |
| `supported` | 1017 |
| `includedInput` | 319 |
| `displayOnly` | 85 |
| `input` | 67 |
| `sourceData` | 40 |
| `formula` | 19 |
| `legacyCompat` | 15 |

## P0・P1候補

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
