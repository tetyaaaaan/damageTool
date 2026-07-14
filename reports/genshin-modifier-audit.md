# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1561
- 数式対応可能: 1101
- 実装修正候補（P0〜P2）: 23

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 1101 |
| `unsupported` | 304 |
| `missingInput` | 63 |
| `displayOnly` | 54 |
| `invalidData` | 39 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 1101 |
| `UNSUPPORTED_CATEGORY` | 234 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `CUSTOM_FORMULA_REQUIRED` | 33 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CATEGORY_MISCLASSIFIED` | 23 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 22 |
| `SUPERSEDED_RECORD` | 19 |
| `MISSING_VALUE` | 15 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 11 |
| `CONDITION_INPUT_REQUIRED` | 8 |
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
| `displayOnly` | 84 |
| `input` | 63 |
| `sourceData` | 40 |
| `formula` | 23 |
| `legacyCompat` | 15 |

## P0・P1候補

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
