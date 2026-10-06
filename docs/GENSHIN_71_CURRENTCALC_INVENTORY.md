# 7.1 CurrentCalc 限定棚卸し

基準HEAD: `0594d21`。全件監査・canonical昇格を行わず、既知正常系を維持する。

## 根拠と保存資料

[HoYoverse Japanの7.1告知](https://prtimes.jp/main/html/rd/p/000000445.000096124.html)はヴェスナ（風・片手剣）、ヴォジャニーツァ（水・法器）と新しい星4イベント報酬片手剣を確認できる。報酬武器名はこの記事から確定していない。
[更新告知166383](https://genshin.hoyoverse.com/m/ja/news/detail/166383)の全文は未取得であり、新聖遺物・新反応の不存在を断定しない。[HoYoWiki entry 11730](https://wiki.hoyolab.com/pc/genshin/entry/11730?lang=en-us)はNew Bough個別項目で、コレクション全体の証拠ではない。

保存先: `games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vesna-currentcalc/`。
英語・日本語のキャラ/天賦/命ノ星座APIレスポンスは対象version 7.1。取得URL・SHAは`capture-manifest.json`に記録。
`inventory-selected-records.json`はAPIの全件レスポンスから`version === 7.1`を抽出した一覧で、未加工の全件rawとは区別する。取得URL・元レスポンスSHAを保持する。
`enka-avatar-record.json`はEnka avatar一覧から10000143を抽出したレコード。既存成長curve105/205を利用可能。

## 保存レコード一覧

一覧への存在だけではRuntime対応済みと判定しない。

| 種別 | ID | 名称 | 現在の状態 |
|---|---|---|---|
| キャラ | 10000143 | ヴェスナ | 確定部分を7.1暫定Runtime・条件UIへ接続。数値に影響する外部確認待ちを分離、Site Ready保留 |
| キャラ | 10000140 | ヴォジャニーツァ | 確定倍率・条件・party・A4加算位置・悠久の歌の爆発倍率を7.1暫定Runtimeへ接続。A4のHP端数処理だけ外部確認待ち、Site Ready保留 |
| 武器 | 11522 | 蝶の羽化 | 保存一覧のみ、今回未実装 |
| 武器 | 14524 | 旋流の讃美歌 | 保存一覧のみ、今回未実装 |
| 武器 | 11437 | 新たなる枝 | 保存一覧のみ、今回未実装 |
| 武器 | 14437 | 雪に沈む心 | 保存一覧のみ、今回未実装 |
| 武器 | 15437 | 風に遊ぶ弦 | 保存一覧のみ、今回未実装 |
| 武器 | 11438 | 銀灯 | 保存一覧のみ、今回未実装 |
| 聖遺物 | — | 新規対象未確認 | APIの7.1フィルタは0件。公式更新全文の確認が必要 |
| 反応 | — | 新規種別未確認 | 星拡散は既存7.0経路。新種別は未確認 |

既存7.0暫定データは`applyProvisional70Data`で接続される。管理フラグだけで未実装扱いしない。サンドローネ10000133・プルーネ10000132は通常データに存在するが、ID順から7.1対象や発売順を推測しない。確定済みSite Ready対象を再監査しない。

## サンドローネ修正

保存原文・構造化データでは冷却ビーム、プリズム弾、爆発光線の星拡散entryは氷元素。Runtimeが星拡散の既定元素で上書きし、風耐性を参照していた。
明示されたentry元素を優先し、反応分類とダメージ元素を分離。3entryの氷/風耐性隔離と、同じ反応分類でも風元素entryを保持できる契約をテストする。表示層でも内部enumを直接表示しない。

## ヴェスナの限定保留

両新キャラは同じ第1期。ヴェスナを先に扱うのは実装順であり先行発売を意味しない。Lv1～15倍率は保存済みで補間不要。

| 未確定事項 | 確定できる部分 | 必要な確認 |
|---|---|---|
| 風羽 | 独立した風元素追加攻撃 | Skill / Normal / その他のどの補正を受けるか |
| C6転位150% | ATK150%の独立風元素攻撃。200% Spirit Bladeとは別 | ダメージ分類と適用DMG Bonus |
| 星光の祝福 | ATK100につき星拡散基礎補正0.7%、上限14% | 連続比例か100単位floorか |

[Genshin Optimizer 7.1 PR](https://github.com/frzyc/genshin-optimizer/pull/3316)の[旧計算シート](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/sheets/src/Characters/Vesna/index.tsx)には、転位150%をGO内部の`elemental`ノード、風羽を`skill`、星光の祝福を`min(ATK × 0.007 / 100, 0.14)`とする実装がある。単一外部実装であり、実ゲーム検証または独立mechanics根拠を伴わないため3件とも`externalSpecPending`。GOの内部カテゴリをゲームの正式分類とは扱わない。保存コードとSHAは`external-spec-candidates.json`に記録する。
未確定の風羽と転位150%は`damageType: unknown`を保持し、独立hitとして保存する。通常攻撃/スキル固有DMG Bonusは仮適用せず、ユーザー画面には「分類未確定」「外部確認待ち」を表示して数値を出さない。「その他」へ確定分類しない。

確定部分は`vesna-currentcalc.json`から既存の暫定ローダーへ接続する。通常3段目はparam3の独立2hit。巡風列装の通常/重撃/落下は風元素化し、元の攻撃分類と通常天賦Lvを維持する。霊剣は輝映状態によって通常風ダメージ/星拡散を切り替える。A1の0～6層とC2最大層ATK40%は共有条件、A4/C4は実際のparty元素数から自己補正を計算する。C6霊剣200%は転位150%・風羽と別hitで、C6 Elevationは本人の星拡散へ独立1.2倍として適用する。

星光の祝福のATK依存補正式は未確定のため適用していない。部分計算であることを説明し、ヴェスナSite Readyは保留する。確定部分はVesna CurrentCalc implementation checkpointとして保存し、ヴォジャニーツァは独立して実装・検証する。

## ヴォジャニーツァの限定実装

ヴェスナcheckpointは `a9d1e8a`。ヴォジャニーツァは別データ・条件で実装し、ヴェスナの未確定分類を流用しない。
保存先は `games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vodyanitsa-currentcalc/`。API原文・Enka基礎値・GO候補実装・KQM原文とSHAをcapture-manifestに保存する。対象versionは7.1。

| CurrentCalc分類 | 効果 |
|---|---|
| 対応済み | 通常4段、重撃、落下経路/低空/高空、スキル初撃と独立角笛、通常状態の爆発。保存paramのLv1～15をそのまま利用 |
| 対応済み | スキル命中時の水/氷耐性低下、A1流星の嵐生成/起爆後の風耐性-35%。現在状態を手動指定 |
| 対応済み | C1現在最大HPの0.8%を自己/partyのFlat ATKへ。C4自己HP0～3層を反映したprovider HPを参照 |
| 対応済み | C2の水/氷会心ダメージ+50%と星拡散会心ダメージ+60%を共有選択で排他。C6で受け手をチームへ拡張 |
| 対応済み | C6悠久の歌中の水/氷ダメージ+60%、星拡散Elevation独立1.25倍。対象外へ漏らさない |
| 対応済み | 悠久の歌中の爆発は保存Lv別係数をTalent基礎部分へ乗算。Lv10は82.2% Max HP × 1.864。通常Burst/Hydro/Common DMG Bonusとは別 |
| 対応済み（端数保留） | A4はAdditive Base DMG。受け手の現在状態をLead Vocal/Chorusと通常水・氷/旋風中の星拡散の4択で指定し、同時重複を防止。provider C4反映後HPを参照 |
| CurrentCalc非該当 | 回復、中断耐性、探索/演奏。C3/C5は最終天賦Lv入力契約で二重加算しない |
| FutureDPS | 周期攻撃/回復、時間管理、旋風生成/起爆の自動検知、メロディ/コーラス自動消費、継続時間延長 |

### 外部確認待ち（Site Ready保留）

- A4十二弦の涙唄のHP端数処理だけ未確定。GO候補は `min(max(MaxHP - 40000, 0) / 1000 × 140, 3500)` および同型の `×260 / 上限6500`。連続比例の候補根拠として記録し、確定仕様にはしない。
- HP50,500では段階候補が水/氷+1400・星拡散+2600、連続候補が+1470・+2730。40,999/41,000/41,500/64,999/65,000も比較対象。両候補が一致するHP・上限では共通値だけ計算し、異なる場合は対象entryを「HP端数処理は仕様確認中」として数値を表示しない。

[KQM Quick Guide](https://keqingmains.com/q/vodyanitsa-quickguide/)のIcy Quillと同型のAdditive Base DMGという説明を根拠に、演算位置は確定。通常Talent基礎ダメージへ加算してから受け手のDMG Bonus・会心・DEF・RES等を適用する。旋風状態では星拡散基礎側加算へ切り替える。追加反応参加者へ受け手固有の加算をコピーしない。

悠久の歌の爆発は、ユーザーが確認したGOとPrydwenの説明の一致を受け、special multiplierとして接続済み。外部仕様待ちはA4端数処理1件のみ。確定部分は **Vodyanitsa CurrentCalc implementation checkpoint** として保存し、Site Readyとは表記しない。

原文: [KQM TCL](https://library.keqingmains.com/characters/hydro/vodyanitsa)。TCLのmechanics findings未収録という注記を踏まえ、原文掲載とゲーム実測検証を同一視しない。
