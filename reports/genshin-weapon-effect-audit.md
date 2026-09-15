# 原神 武器効果構造化監査

このファイルは `node scripts/genshinWeaponEffectAudit.cjs` で再生成します。

- 武器: 210
- 補正: 455
- 構造化済み武器: 33
- 構造化済み効果グループ: 55
- 構造化済み補正: 100
- フォールバック分類: 355
- 同一説明・同一カテゴリの重複候補: 51

## 入力方針

| policy | count |
| --- | ---: |
| `manual` | 171 |
| `displayOnly` | 51 |
| `stack` | 69 |
| `calculate` | 120 |
| `reflected` | 43 |
| `sourceContext` | 1 |
