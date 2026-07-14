# STEP30 命ノ星座の数値監査と外部照合

## 目的

命ノ星座C1〜C6を全キャラクターについて列挙し、計算用補正の数値が元の効果文と矛盾していないかを機械監査する。ローカルJSONだけを正解とはせず、Genshin Optimizerとgcsimの実装箇所を補助的な照合先として記録する。

外部OSS内に同じ数値が存在することは「数値候補の裏付け」であり、それだけで効果の対象・条件・計算式が正しいとは判定しない。最終的な採用条件は、元効果文、効果カテゴリ、対象、条件、数値契約が相互に整合することである。

## 生成物

- `games/genshin/data/calc/constellation-source-index.json`: 外部OSSの固定リビジョン、ライセンス、キャラクター別参照パス、再生成用数値トークン
- `games/genshin/data/calc/constellation-effect-registry.json`: 全キャラクターC1〜C6と各計算効果の検証状態
- `reports/genshin-constellation-audit.json`: CI向け要約
- `reports/genshin-constellation-audit.md`: 人間向け監査結果

## 検証状態

- `corroborated`: 元効果文の値と一致し、固定した外部OSSにも同じ数値候補がある
- `textVerified`: 元効果文の値と一致する
- `mechanicOnly`: 数値補正ではなく、挙動・状態変化として登録されている
- `quarantined`: 誤分類または重複が判明し、計算へ適用しない
- `sourceContextRequired`: 元効果文だけでは安全に独立した倍率へできず、参照先の追加調査が必要
- `sourceMismatch` / `missingNumericContract`: CIで解消対象とする不整合

## 固定した参照元

- Genshin Optimizer: `0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2`（MIT）
- gcsim: `6d373678e949d30e91d390f418d930de09eeb547`（MIT）

参照元を更新する場合は、変更履歴とライセンスを確認したうえで次を実行する。

```powershell
$env:GENSHIN_OPTIMIZER_ROOT = "<genshin-optimizer clone>"
$env:GCSIM_ROOT = "<gcsim clone>"
node scripts/genshinConstellationRegistry.cjs
```

## STEP30で修正した誤分類

- 辛炎C2: `Lv.3シールド`を元素爆発天賦Lv+3として扱っていたレコードを隔離
- 煙緋C1: スタミナ消費軽減を元素耐性低下として扱っていたレコードを隔離
- 千織C6: 防御力低下ではなく、通常攻撃へ防御力235%分を加算
- シロネンC1: 夜魂消費軽減を元素耐性低下として扱っていたレコードを隔離
- シロネンC6: 防御低下・防御無視ではなく、通常攻撃と落下攻撃へ防御力300%分を加算。回復・状態維持部分は計算対象外として表示のみ

構造化値（`critRate`、`critDamage`、`valuePerGeneratedStack`、`valuePerConsumedStack`、`valuePerExcessStack`など）も数値契約として認識し、単純な`value`がないだけで「値が未登録」と警告しない。
