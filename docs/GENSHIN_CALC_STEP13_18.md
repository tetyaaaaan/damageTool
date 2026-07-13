# 原神JSON計算 STEP 13〜18 完了設計

## 到達状態

STEP 13〜18では、構造化済み補正が要求する可変入力を補正ごとの安定キーでUIへ出し、計算時には表示中の入力欄を正として読み直す経路を完成させた。JSON計算を推奨の本番経路へ昇格する一方、従来計算は互換フォールバックとして残す。

## STEP 13: リソース別動的入力UI

- `resourceStateKey()` は補正ソースとリソースIDから安定キーを生成する。
- `buildResourceInputDefinitions()` は選択中のキャラ・武器・聖遺物・命ノ星座に必要な入力だけを返す。
- 再構築時は同じキーの値だけを保持し、候補から消えたキーは削除する。
- 層数はリソース定義の最小値・最大値へクランプする。

## STEP 14: リソース消費型ダメージ接続

- `consume: "all"`、固定消費数、`upTo`、`maxConsumed` を共通処理する。
- `valuePerStack`、`valueByStack`、精錬別の1層値を現在層数へ反映する。
- 必須リソースが未入力なら推測せず `missingInput` として停止する。

## STEP 15: 複雑条件入力

- `conditionInput` は `stack`、`option`、`targetCount`、`partyCount` を扱う。
- 値は通常の有効/無効状態とは分離し、`complexConditionByModifier` に安定キー単位で保持する。
- `valueByCondition` は現在の条件入力値に対応する明示値だけを採用する。

## STEP 16: 残候補の安全対応

- custom補正は `customCalculation: "directStatBonus"` など計算方式が明示されたものだけを有効にする。
- 実データ5件へ条件入力定義を付与した。
- 未入力・未対応・無効データは黙って適用せず、理由付き候補として結果へ残す。

## STEP 17: 総合回帰と実画面検証

全補正JSON 1,560件を走査するカバレッジ契約を恒久テスト化した。基準値は次のとおり。

| 対象 | 件数 |
| --- | ---: |
| 全補正 | 1,560 |
| `statBonus` | 302 |
| `extraDamage` | 156 |
| `effectOverride` | 47 |
| `additiveBaseDamage` | 30 |
| `scalingBonus` | 27 |
| 複雑条件入力定義 | 5 |
| 計算入力リソース | 27 |
| 表示専用リソース | 22 |
| 未分類リソース | 0 |

Edge E2Eでは武器11427のリソース入力、シャルロットC2の対象数入力、両ケースの結果描画、ページ例外0件を確認する。アプリ内ブラウザはlocalhostを遮断したため、同じEdgeエンジンをCDPで操作する `tests/genshin/genshinBrowserSmoke.e2e.cjs` を恒久検証とする。

## STEP 18: 安全な本番移行

移行方式は並行運用とする。

- JSON計算ボタンを推奨の主要操作として表示する。
- 従来の `calc()` は「従来計算を実行（互換）」として残す。
- JSON計算実行時は、最初に条件定義を現在の計算入力欄から再構築し、その後で同じ入力欄を読み計算する。
- 未対応補正が残っていても従来経路へ自動的に値を混ぜない。JSON結果内の警告と互換ボタンで利用者が判断できる形にする。
- 本移行では従来関数・結果DOMを削除しない。削除判断は未対応候補が許容閾値へ到達した後の別STEPとする。

## 検証コマンド

```powershell
node --test tests/genshin/*.test.cjs
```

実ブラウザ検証はローカルサーバー起動後、Edge実行ファイルを指定して行う。

```powershell
$env:GENSHIN_E2E_URL='http://127.0.0.1:4174/games/genshin/'
$env:BROWSER_EXECUTABLE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
node tests/genshin/genshinBrowserSmoke.e2e.cjs
```
