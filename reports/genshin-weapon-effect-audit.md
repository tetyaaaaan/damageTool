# 原神 武器効果構造化監査

このファイルは `node scripts/genshinWeaponEffectAudit.cjs` で再生成します。

- 武器: 210
- 補正: 455
- 構造化済み武器: 7
- 構造化済み効果グループ: 13
- 構造化済み補正: 19
- フォールバック分類: 436
- 同一説明・同一カテゴリの重複候補: 50

## 入力方針

| policy | count |
| --- | ---: |
| `manual` | 225 |
| `displayOnly` | 57 |
| `stack` | 76 |
| `calculate` | 51 |
| `reflected` | 45 |
| `sourceContext` | 1 |
