# 天賦補正の値なしレコード監査

天賦補正に値情報がない40件を、`talent-modifiers.json` と `talent-scalings.json` の対応関係から全件分類する。

| 分類 | 件数 | 画面・計算での扱い |
| --- | ---: | --- |
| `representedByTalentScalings` | 19 | 専用の天賦倍率が計算元なので、汎用追加ダメージ候補と値なし警告を除外する |
| `unsupportedSpecialEffect` | 4 | 独立した追加ダメージ等であるため、未対応警告を残す |
| `missingStructuredValue` | 17 | 効果量の構造化が不足しているため、値なし警告を残す |

判定は、値なしの `extraDamage` で、`triggeredDamage` 向けの `special` レコードであり、同じキャラクター・同じ天賦区分に専用倍率エントリが存在する場合だけを「専用倍率に収録済み」とする。単に `special` であることや、同じ天賦区分に倍率があることだけでは除外しない。

全件一覧は `node scripts/genshinTalentValueAudit.cjs` で再生成できる。分類件数と、除外対象が実際に専用倍率を持つことは `tests/genshin/genshinTalentValueAudit.test.cjs` で固定する。
