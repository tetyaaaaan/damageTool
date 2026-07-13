# 原神JSON計算 STEP 19〜24 完了設計

## STEP 19: 未対応候補の監査基盤

`scripts/genshinModifierAudit.cjs` が全補正JSON 1,560件を共通解析層へ通し、機械判定用の `reasonCode`、優先度、実装レーンを生成する。JSONを正データ、Markdownを確認用レポートとして `reports/` に保存する。

- `supported` とUID反映済みを分離する。
- `missingInput` と数式未対応を分離する。
- 表示専用は実装漏れに数えない。
- 日本語理由文ではなく `reasonCode` をテスト契約に使う。

## STEP 20: データ不足・誤分類の修正

旧抽出レコードが構造化済みレコードと重複する場合は `auditDisposition: "supersededByStructuredRecord"` を付け、二重適用しない。シールド・回復などダメージカテゴリへの明白な誤分類は `displayOnlyMisclassification` として隔離する。数値や参照元を推測して補完しない。

## STEP 21: extraDamage拡張

- `referenceAttackType` で元になる通常・重撃・落下・スキル・爆発を明示する。
- 元攻撃倍率を比率変換する追撃は、元entryのscalingを複製して変換する。
- `extraCount` をhit数へ反映する。
- 元素熟知など明示ステータス参照型は独立entryとして生成する。

## STEP 22: effectOverrideパイプライン

効果上書きを次の2段階へ分離する。

| kind | 動作 |
| --- | --- |
| `effectValueMultiplier` | 同じ出典の既存ダメージ補正値を増幅する |
| `damageMultiplier` | 対象entryの最終ダメージ倍率を置換・乗算する |

適用履歴は `breakdown.effectOverrides` に残し、既存ダメージ補正と最終倍率を混在させない。

## STEP 23: scaling/additive/custom拡張

`customCalculation: "scalingAdditiveBaseDamage"` を追加した。参照ステータス×倍率を加算基礎ダメージへ変換し、`maxValue` がある場合は上限を適用する。

- フリーナC6と閑雲C2の明示構造を有効化。
- 白朮C2の旧statBonus誤分類を明示extraDamageとして扱う。
- フリーナC2の上限超過テンションを安定キー付きstack入力へ接続。
- 提供者参照は専用入力がない限り `missingInput` で停止する。

## STEP 24: ゴールデンテストとE2E

代表6シナリオを `tests/genshin/fixtures/golden-scenarios.json` に固定した。

- 神里綾華の基準通常攻撃
- 放浪者C6の元ダメージ比率追撃
- アルベドC2のリソース消費加算
- シャルロットC2の対象数条件
- フリーナC2のstack条件
- 白朮C2の明示追撃

Edge E2Eではリソース、対象数、stack、custom追撃の動的UIと結果描画を確認する。

## STEP 24完了時の監査値

| 指標 | STEP 19開始時 | STEP 24完了時 |
| --- | ---: | ---: |
| 数式対応可能 | 1,077 | 1,088 |
| P0 誤分類 | 54 | 37 |
| P1 データ不足 | 28 | 19 |
| P2 数式実装候補 | 52 | 48 |
| 隔離・表示専用 | 55 | 72 |

## 検証

```powershell
node scripts/genshinModifierAudit.cjs
node --test tests/genshin/*.test.cjs
node tests/genshin/genshinBrowserSmoke.e2e.cjs
```
