# 原神補正監査レポート

このファイルは `node scripts/genshinModifierAudit.cjs` で再生成します。

- 全補正: 1560
- 数式対応可能: 1088
- 実装修正候補（P0〜P2）: 104

## supportStatus

| status | count |
| --- | ---: |
| `supported` | 1088 |
| `unsupported` | 322 |
| `missingInput` | 61 |
| `invalidData` | 50 |
| `displayOnly` | 39 |

## reasonCode

| reasonCode | count |
| --- | ---: |
| `SUPPORTED` | 1088 |
| `UNSUPPORTED_CATEGORY` | 235 |
| `RESOURCE_INPUT_REQUIRED` | 50 |
| `CUSTOM_FORMULA_REQUIRED` | 43 |
| `DISPLAY_OR_STATE_EFFECT` | 33 |
| `CATEGORY_MISCLASSIFIED` | 30 |
| `DISPLAY_ONLY_SOURCE_TEXT` | 22 |
| `MISSING_VALUE` | 17 |
| `SUPERSEDED_RECORD` | 15 |
| `CONDITION_INPUT_REQUIRED` | 6 |
| `CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE` | 4 |
| `EFFECT_OVERRIDE_FORMULA_REQUIRED` | 4 |
| `CATEGORY_MISCLASSIFIED_MODIFIER` | 3 |
| `PROVIDER_INPUT_REQUIRED` | 3 |
| `DISPLAY_ONLY_MISCLASSIFICATION` | 2 |
| `MISSING_REFERENCE` | 2 |
| `RECORDED_HEALING_INPUT_REQUIRED` | 2 |
| `SCALING_FORMULA_REQUIRED` | 1 |

## 実装レーン

| lane | count |
| --- | ---: |
| `supported` | 800 |
| `includedInput` | 523 |
| `displayOnly` | 72 |
| `input` | 61 |
| `formula` | 48 |
| `categoryFix` | 37 |
| `dataFix` | 19 |

## P0・P1候補

| priority | category | reasonCode | id | source |
| --- | --- | --- | --- | --- |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE` | `c_10000021_1_resolved_effect_override` | `constellation-modifiers.json:$.10000021.constellations.1[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE` | `c_10000024_2_resolved_effect_override` | `constellation-modifiers.json:$.10000024.constellations.2[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE` | `c_10000027_1_resolved_effect_override` | `constellation-modifiers.json:$.10000027.constellations.1[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_MODIFIER` | `c_10000035_4_resolved_effect_override` | `constellation-modifiers.json:$.10000035.constellations.4[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_MODIFIER` | `c_10000037_4_resolved_effect_override` | `constellation-modifiers.json:$.10000037.constellations.4[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_MODIFIER` | `c_10000055_6_resolved_effect_override` | `constellation-modifiers.json:$.10000055.constellations.6[0]` |
| P0 | `effectOverride` | `CATEGORY_MISCLASSIFIED_EXTRA_DAMAGE` | `c_10000056_2_resolved_effect_override` | `constellation-modifiers.json:$.10000056.constellations.2[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000024_4_1` | `constellation-modifiers.json:$.10000024.constellations.4[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000036_6_2` | `constellation-modifiers.json:$.10000036.constellations.6[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000060_6_1` | `constellation-modifiers.json:$.10000060.constellations.6[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000079_2_2` | `constellation-modifiers.json:$.10000079.constellations.2[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000091_2_2_v10` | `constellation-modifiers.json:$.10000091.constellations.2[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000105_2_3` | `constellation-modifiers.json:$.10000105.constellations.2[2]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `c_10000106_4_2` | `constellation-modifiers.json:$.10000106.constellations.4[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000006.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000022.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000027.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000043.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000047.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000047.passives[1].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000048.passives[2].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000053.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000075.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000078.passives[0].modifiers[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000085.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000085.passives[1].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000099.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000103.passives[2].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000104.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000111.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000116.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000119.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000120.passives[1].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000122.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000124.passives[0].modifiers[0]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000126.passives[0].modifiers[1]` |
| P0 | `extraDamage` | `CATEGORY_MISCLASSIFIED` | `-` | `talent-modifiers.json:$.10000129.passives[2].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `c_10000130_1_3` | `constellation-modifiers.json:$.10000130.constellations.1[2]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000047.passives[2].modifiers[1]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000054.passives[0].modifiers[3]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000064.passives[1].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000082.passives[1].modifiers[3]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000093.passives[0].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000116.passives[1].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000119.passives[4].modifiers[1]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000120.passives[3].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000122.passives[3].modifiers[1]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000125.passives[2].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000126.passives[2].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000127.passives[2].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000128.passives[1].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000130.passives[1].modifiers[0]` |
| P1 | `additiveBaseDamage` | `MISSING_VALUE` | `-` | `talent-modifiers.json:$.10000133.passives[1].modifiers[0]` |
| P1 | `extraDamage` | `MISSING_REFERENCE` | `c_10000021_2_1` | `constellation-modifiers.json:$.10000021.constellations.2[0]` |
| P1 | `extraDamage` | `MISSING_REFERENCE` | `c_10000099_1_2` | `constellation-modifiers.json:$.10000099.constellations.1[1]` |
| P1 | `extraDamage` | `MISSING_VALUE` | `c_10000124_1_1` | `constellation-modifiers.json:$.10000124.constellations.1[0]` |
