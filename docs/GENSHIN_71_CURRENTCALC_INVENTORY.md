# 7.1 CurrentCalc 限定棚卸し

現在の実用判定は[実用CurrentCalc公開判定](GENSHIN_PRACTICAL_CURRENTCALC_STATUS.md)を参照。既知8項目は根拠付き暫定仕様として実計算へ接続する方針へ変更した。以下のexternalSpecPending記録は以前の判断履歴であり、現在の非計算状態を示すものではない。

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
| 武器 | 11522 | 蝶の羽化 | 7.1暫定経路でCurrentCalc Site Ready |
| 武器 | 14524 | 旋流の讃美歌 | 保存一覧のみ、今回未実装 |
| 武器 | 11437 | 新たなる枝 | 保存一覧のみ、今回未実装 |
| 武器 | 14437 | 雪に沈む心 | 保存一覧のみ、今回未実装 |
| 武器 | 15437 | 風に遊ぶ弦 | 保存一覧のみ、今回未実装 |
| 武器 | 11438 | 銀灯 | 7.1暫定経路でCurrentCalc Site Ready |
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

## 7.1武器inventory再確認・batch1

基準checkpointはヴェスナ`a9d1e8a`、ヴォジャニーツァ`ff0a96f`。保存済み`inventory-selected-records.json`のweapons recordsと各`version: "7.1"`を再照合し、以下6件を対象として確認した。これは保存APIのversion-bound inventoryであり、公式告知から全6件の名称を独立確認したという意味ではない。

| ID | 保存名称 | 武器種 | レアリティ | 現在の状態 |
|---|---|---|---|---|
| 11522 | 蝶の羽化 | 片手剣 | ★5 | structured・loader・UI・reload・Request・damage接続済み、CurrentCalc Site Ready |
| 14524 | 旋流の讃美歌 | 法器 | ★5 | structured・loader・自己HP・UI・reload・Request・damage接続済み。party ATKはexternalSpecPending付きcheckpoint、Site Ready保留 |
| 11437 | 新たなる枝 | 片手剣 | ★4 | checkpoint。通常/輝映の自己ATK・EM接続済み、星反応補正と層数の関係1件はexternalSpecPending |
| 14437 | 雪に沈む心 | 法器 | ★4 | Site Ready。実編成の氷/雷人数・通常/輝映の自己効果置換・星反応補正接続済み |
| 15437 | 風に遊ぶ弦 | 弓 | ★4 | Site Ready。常時ERの入力契約・共有現在状態・本人を含むparty星反応補正接続済み |
| 11438 | 銀灯 | 片手剣 | ★4 | structured・loader・UI・reload・Request・damage接続済み、CurrentCalc Site Ready |

再確認時点では全6件とも通常catalog・modifier・base statsのIDレコードと7.1 loaderへの接続がなかった。今回の確定データは`weapons-currentcalc-batch1.json`から暫定ローダー・ID解決・基礎値へ接続する。canonicalへ昇格せず、既存レコードを置換しない。

### 対応範囲

- 蝶の羽化：忠誠の風の現在発動状態で自己会心ダメージR1〜R5 +56/72/88/104/120%。叛逆の風は本人の星拡散reactionBonus +36/45/54/63/72%。風/氷のダメージ元素で判定せず反応分類を見る。現在有効な二つの状態を独立指定し、party受け手へ転送しない。
- 銀灯：現在有効な0〜2層で自己EM。1層あたりR1〜R5 +52/65/78/91/104。通常のTalent基礎値・damageBonusへ置き換えず、EMを使う反応計算へ反映。
- Lv1〜90の基礎ATK・副statは、保存Lv1値と同じレアリティ・BasePropsを持つ既存武器の標準curveと突破加算を再利用。蝶の羽化は霧切の廻光11509（ATK47.537、会心ダメージ0.096）、銀灯は笛の剣11402（ATK42.401、ATK割合0.09）。単純補間は行わず、全Lvと突破前後を検証。副statは既存の最終ステータス入力契約に含め、Runtimeで二重加算しない。
- 豊穣の風のエネルギー回復はCurrentCalc非該当。効果の取得順・発動間隔・失効・退場リセット・個別層の時間推移はFutureDPS。これらを単発計算の未対応として数えない。
- 実ダメージに影響するexternalSpecPendingは今回の2本にはない。専用武器アイコンURLは未配信のため、選択UIでは既存の代替画像を利用する。

ヴェスナの外部確認待ち3件とヴォジャニーツァA4端数処理1件は維持。今回の武器確認から独立した強い新根拠は得ておらず、Site Readyへ変更しない。

## 旋流の讃美歌14524・Phase 1 checkpoint

保存原文は`inventory-selected-records.json`の14524、version 7.1、効果「深き眠りのロンド」。確定部分は`weapon14524-currentcalc.json`から暫定ローダーへ接続する。通常catalog/canonicalへの昇格は行わない。

| 分類 | CurrentCalcでの扱い |
|---|---|
| 常時基礎値 | ATK44.3358・HP副stat14.4%のLv1値。聖顕の鍵11511と同じBaseProps、既存curve 1304/2301・5★突破加算でLv1～90を取得。線形補間なし |
| 自己HP | 治療後の現在0～3層。1層R1～R5でHP +4/5/6/7/8%。基礎HPを用いる通常のHP割合補正 |
| 現在の増幅状態 | 凍結／星拡散後のHP増加量をさらに75%増幅。層数と増幅を一つの状態選択にまとめ、R1・3層で12%→21%、R5・3層で24%→42% |
| party ATK | 原文は装備者HP40,000超過分の1000ごと、R1～R5 +0.4/0.5/0.6/0.7/0.8%、上限8/10/12/14/16%、反応後は増加量75%増幅。演算の未確定部分があるため非適用・部分計算の注意を表示 |
| reaction分類 | 凍結／星拡散は発動状態の条件。damageElement固定、reactionBonus、通常DMG Bonus、Additive Base DMG、Crit、Elevationへの置換はしない |
| CurrentCalc非該当 | 常時の与える治療効果R1～R5 +4/5/6/7/8% |
| FutureDPS | 治療/反応の自動検知、個別層の取得・失効、10秒/5秒の時間管理、発動時点・snapshotの時間追跡 |

### externalSpecPending：HP由来party ATKの演算

現在実装は未適用。対象versionは7.1で、保存原文には上記係数・上限・出場キャラ対象があるが、以下を一意に決められない。

- 超過HPを1000で割る際の段階切り捨てか連続比例か。
- 上限が層ごとのATK効果に対するものか、複数層合計に対するものか。
- 参照する装備者HPが自己HP効果適用前か適用後か（発動時点の時間追跡は別途FutureDPS）。

独立したmechanics根拠または実測が必要。HP39,999/40,000/40,999/41,000/41,500/50,500およびcap付近で判別し、recipientのHPは固定する。原文値をrecipient HPの式や固定値で代用しない。未確定式によるATK・ダメージを表示しない。

専用回帰はR1～R5と全7状態、HP参照攻撃を持つ法器キャラ2人、party受け手2人、全Lv/突破境界、Request再計算、武器切替を確認する。実ブラウザでは条件操作・R1/R5・実ダメージ・保留表示・reload一致を確認する。14524のcheckpointは`56b7ea9`。以下のbatch2ではこの保留を再調査しない。

## 残り★4の3本・batch2

保存version 7.1の同じinventory原文から`weapons-currentcalc-batch2.json`へ分解し、既存暫定ローダー・ID解決・基礎値・条件・party・反応計算へ接続した。3本の効果構造は同型として統合せず、既存の精錬別条件値と編成人数参照だけを再利用する。

| 武器 | CurrentCalc効果と精錬R1→R5 |
|---|---|
| 新たなる枝11437 | 現在0～3層。通常は1層ATK4/5/6/7/8%、EM20/25/30/35/40。輝映時は1層ATK6/7.5/9/10.5/12%へ置換し、通常のEM増加を除外。層数/輝映を1入力にまとめる |
| 雪に沈む心14437 | 通常は氷1人ごと自己EM24/30/36/42/48、雷1人ごと自己ATK4.8/6/7.2/8.4/9.6%。輝映時は氷+雷の合計1人ごと自己EM20/25/30/35/40、星反応補正6/7.5/9/10.5/12%へ置換。装備者を含む実編成から合計最大4人を数え、人数手入力は設けない |
| 風に遊ぶ弦15437 | 常時ER20/25/30/35/40%は最終ステータス入力に含め、Runtimeで再加算しない。聖歌0/1/2層は星反応補正なし。3層到達・消費後の猛毒発動中は本人を含むチームへ星反応補正24/30/36/42/48% |

星反応補正はreactionBonusであり、通常DMG Bonus・Additive Base DMG・Base Reaction DMG・Crit・Elevationではない。星電導/星拡散のreactionTypeを参照し、ダメージ元素では判定しない。通常攻撃や月反応・蒸発へ適用しない。15437のparty値は装備者の精錬から取得し、装備者/受け手のHP・ATK・EMへ依存しない。11437/14437は自己限定でparty受け手に渡さない。

基礎ATK42.401、4★突破加算とcurve1201は既存武器を再利用。11437/14437の会心ダメージLv1 12%は流浪楽章14402のBaseProps/curve2201と一致。15437の会心率Lv1 6%は蒼翠の狩猟弓15409と一致。Lv1～90とLv20/40/50/60/70/80の突破前後を既存curveで取得し、小数を維持する。

時間軸はFutureDPS：11437の12秒発動窓・1秒間隔・個別層6秒、15437の0.03秒取得間隔・自動3層獲得/消費・12秒失効/取得禁止。14437の輝映状態も現在状態を明示し、自動判定は行わない。単発計算の対象部分を時間管理不足のために無効化しない。

### 新たなる枝のexternalSpecPending

保存原文は「『繁茂』効果が攻撃力+6%に変更され、装備者が与える星反応ダメージ+8%」（R1）。星反応値はR1～R5で8/10/12/14/16%だが、現在の繁茂層数にかかわらない固定値か、層数倍かを明示していない。現在実装はこの星反応補正だけ非適用。両候補を推測で選ばず、通常/輝映のATK/EMだけで部分計算と明示する。

対象version 7.1、sourceは保存`inventory-selected-records.json`の11437 R1～R5と原文template。必要な独立根拠は、ATK・EM・敵RES等を固定した繁茂1/2/3層の星反応比較、またはこの補正の層数契約を明示するmechanics資料。数値に影響するためSite Readyは保留。

### 6本の最終限定分類

- Site Ready：11522 蝶の羽化、11438 銀灯、14437 雪に沈む心、15437 風に遊ぶ弦。
- checkpoint：14524 旋流の讃美歌（既存のHP由来party ATK保留3点）、11437 新たなる枝（星反応補正と層数の関係1点）。
- 独立した外部根拠は今回取得していない。ヴェスナ3件・ヴォジャニーツァA4端数1件も維持する。

6本だけの横断確認では、宣言済み保留以外のdisplayOnly、精錬値不足、対象や編成人数の取り違え、層数/状態の重複入力、星反応の通常攻撃への漏れ、内部enumのUI露出、武器変更後の残留、reload不一致を確認する。旧武器全件・後続聖遺物・reaction compatibilityへは展開しない。

検証結果：batch2専用12テスト成功、focused54ファイル367テスト成功、ページ構成6テスト成功、Golden一致。batch2 E2Eでは3本の現在状態・R1/R5・実ダメージ・reload、15437本人/party受け手とprovider精錬、武器切替、11437保留表示を確認した。既存11522/11438・14524・provider転送のE2Eも成功。確認範囲で新規P0/P1/P2の残存なし。

共通Runtimeの追加は、精錬別の編成人数係数、空の元素情報のデータ補完、星反応カテゴリだけのreactionBonus（通常entryには非適用）、対象を確定した明示的partyグループの接続。旧グループのsourceContext安全境界は維持し、新しいparty接続は明示的なopt-inだけで利用する。

## 7.1聖遺物inventoryとStellar互換性

保存inventoryを基準に **7.1新規聖遺物なし** と整理する。新規セットデータは追加しない。根拠は [保存済みinventory](../games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vesna-currentcalc/inventory-selected-records.json) の `targetGameVersion: 7.1`、`datasets.artifacts.filter: version === 7.1`、`records: []`。取得時刻は2026-10-06T01:22:35.851Z、元応答のSHA-256は `36b10bc733d219e9d35a3da1448638aa504a0d8bc6cda5e81b5ee9d702f9d4df`。

この記録は「保存されたversion絞込み結果が0件」の根拠である。聖遺物API応答全体のrawは保存されておらず、hashをローカルrawから再検算することはできない。既存聖遺物manifestのgameVersionもnullであり、それ自体を7.1不追加の独立証拠にはしない。

### 確定済み経路の互換性

| 対象 | 結果 |
|---|---|
| 紅血の証15047 | サンドローネの氷側・ヴェスナの風側の星拡散をreaction classificationで認識。共通条件で会心率+16%と星拡散+40%が併存。通常会心率+16%は既存仕様として維持し、星拡散+40%は通常Talent非会心ダメージへ漏らさない |
| 炉炎溶錬の心15048 | provider装備者から星電導/星拡散へparty +50%。recipientの元素・HPやprovider ATKには依存せず、複数装備時は既存maxルールで1回適用 |
| RES/DEF | 直撃星拡散の氷/風、通常反応の風初撃/氷渦を別々のRESで検証。Stellar反応はDEF除外、通常Talentは敵LvによるDEF処理を維持 |
| 補正bucket | 通常Elemental/Common DMG Bonusは直撃Stellarへ入れない。provider由来Base Reaction DMG、reactionBonus、会心、Additive Base DMG、Elevationは独立維持 |
| 独立hit | サンドローネの確定C4/C6星反応hitを独立維持。本人C6は通常計算後×1.20、他partyへ非転送。C2会心は冷却ビームだけ |
| ヴォジャニーツァ | 確定HP入力のA4加算はprovider HPを参照し、Talent/星拡散の対象切替・capを維持。C6はparty星拡散へ×1.25、星電導には非適用。通常反応の複数参加者にもteam契約で独立倍率を適用 |

発見したP1はヴォジャニーツァC6のparty倍率値が0になる問題1件。説明用 `requiredCondition`（凸/状態メタデータ）を、存在しない条件グループ入力として再検査していた。値解決では明示された `conditionGroupId` だけをリンク条件として参照するよう最小修正した。既存の凸ゲート、共有条件ON/OFF、明示的リンク条件は維持する。推測式・元素分類の変更なし。

ヴェスナ3件、ヴォジャニーツァA4端数1件、14524の3件、11437の1件はexternalSpecPendingのまま。今回の互換性確認でSite Readyへ昇格しない。端数が未確定なA4値やunknown entryの推測ダメージは表示しない。

専用 `71StellarCompatibility` は8テスト。実ブラウザでは15047を付けた氷/風の確定星拡散、15048 +50%、ヴォジャニーツァprovider C6 OFF/ONと×1.25、条件・実ダメージのreload一致、結果の内部enum非露出を確認する。

検証結果：focused Gate55ファイル・375テスト全成功、Golden一致、ページ構成6テスト成功。新規互換性E2Eと既存ヴォジャニーツァ・7.1武器batch2・provider転送武器E2Eが成功。今回のP1原因1系統は修正済み、P0/P1/P2残存0。新しい計算仕様のexternalSpecPendingなし。既存のキャラ/武器pendingは維持する。

## 既知externalSpecPending 8件の最終確認（2026-10-06）

基準checkpointは`58d57ff`。今回の調査は次の8件と聖遺物inventoryの証拠補強だけに限定した。追加の独立実測・mechanics根拠で演算を確定できた項目は0件。Runtime、条件キー、計算式は変更しない。確定範囲はRelease Ready、既知externalSpecPendingは明示的に非計算とする。checkpoint専用テストの成功を仕様確定とは扱わない。

| # | 未確定事項 | 確認できた根拠・結論 | 維持する境界／必要な判別 |
|---|---|---|---|
| 1 | ヴェスナC6転位150%のDMG Bonus分類 | 保存GO実装は内部`elemental`ノード。KQM TCLの原文転記は風元素の独立hitを示すが、Normal/Skill Bonus比較はない。externalSpecPending | unknown維持。Normal、Skill、otherへ仮分類せず、推測ダメージを表示しない。Normal/Skill限定Bonusを個別に変えた実測が必要 |
| 2 | ヴェスナ風羽のDMG Bonus分類 | GOのSkill分類は候補。KQMの倍率表所属・原文だけでは独立した分類検証にならない。externalSpecPending | 倍率・元素・発生条件を保持し、未確定hitは非計算。Skill/Normal限定Bonusの比較が必要 |
| 3 | ヴェスナ星光の祝福のATK端数 | GOは`min(ATK × 0.007 / 100, 0.14)`。原文の100単位表現に対する境界実測は得られず、externalSpecPending | 未確定補正は適用しない。ATK1000/1050/1099/1100で判別。連続候補は7/7.35/7.693/7.7%、cap14% |
| 4 | ヴォジャニーツァA4の超過HP端数 | GOは連続候補。KQMは加算位置とcapを補強するが、1000HP未満の扱いは確認できない。externalSpecPending | 既存の候補共通値のみ計算する境界を維持。HP50,500では水/氷1400対1470、星拡散2600対2730。40,999/41,000/41,500/49,999も判別点 |
| 5 | 14524 party ATKのHP端数 | 保存7.1原文は1000HP単位。KQMのHP60,000での端点は両候補が一致し、端数を判別できない。externalSpecPending | party ATKは非適用。40,999/41,000/41,500/50,500でprovider HPだけを変える比較が必要 |
| 6 | 14524 party ATKの層数・上限 | KQM Quick GuideはR1・HP60,000で最大ATK42%と記載。`3 × 8% × 1.75`と整合し、増幅後の全体上限14%という候補とは不一致。ただし中間HP・層数別の式までは示さない。externalSpecPending | 端点42%だけを補強事実として保持し、各層cap／合計capのRuntime式には昇格しない。低HPと0/1/2/3層の組合せが必要 |
| 7 | 14524 provider HP参照時点 | 保存原文と上記端点から、自己HP補正前後を判別できる固定条件の比較は得られない。externalSpecPending | recipient HPで代用しない。基礎HP・外部HP補正を固定し、武器自己HP効果前後を分離した検証が必要。再帰的再計算は導入しない |
| 8 | 11437 星反応補正の層数依存 | 公式HoYoWikiの7.1原文・R1～R5は8/10/12/14/16%を確認できるが、固定／層数倍の判別根拠は得られない。externalSpecPending | 確定ATK/EMだけ計算し、星反応補正は非適用。1/2/3層でATK・EM・RES等を固定した星反応比較が必要 |

### 外部根拠と採否

- [KQM Vesna TCL](https://library.keqingmains.com/characters/anemo/vesna)：原文・倍率の参照。ページ自身が検証結果未収録と明示しており、攻撃分類・端数処理の独立検証としては採用しない。
- 保存GO候補は[external-spec-candidates.json](../games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vesna-currentcalc/external-spec-candidates.json)、ヴォジャニーツァは既存`vodyanitsa-currentcalc` source記録を参照。GO単独の実装分類をゲーム仕様へ昇格しない。別サイトの同じデータ転記も独立mechanics根拠には数えない。
- [KQM Vodyanitsa Quick Guide](https://keqingmains.com/q/vodyanitsa-quickguide/)：Version 7.1。A4の加算位置・capと14524の最大42%端点を補強。A4端数や14524中間層・HP参照時点を確定する資料としては不足。
- [公式HoYoWiki・新たなる枝](https://wiki.hoyolab.com/pc/genshin/entry/11730?lang=en-us)：7.1の原文・精錬値を確認。曖昧な層数関係を数値配列だけで補完しない。
- HoneyHunterの14524 `ver=7_0_51`にはHP5%／ATK0.25%／8秒があり、保存7.1の4%／0.4%／10秒と異なる。旧beta値は7.1式の確定根拠から除外する。

### 7.1新規聖遺物0件の証拠補強

[提供元のApp Store更新履歴](https://apps.apple.com/cy/app/genshin-impact-6th-anniversary/id1517783697)は7.1の追加内容に聖遺物を挙げず、7.0には新規聖遺物の項目がある。ただし短い更新履歴の不記載だけを完全性証拠にはしない。[Icy Veinsの7.1 overview](https://www.icy-veins.com/genshin-impact/patch-overview)は7.1に新規聖遺物がないことを明示する。これらを保存されたversion絞込み0件の補強として記録し、**7.1新規聖遺物なし**を維持する。API応答全体rawが未保存という制約は解消した扱いにしない。

### 7.1全対象の最終状態

| 対象 | 最終分類 | 数値に影響する保留／確認範囲 |
|---|---|---|
| サンドローネ | CurrentCalc Site Ready | 7.1聖遺物・Stellar互換性も確認済み |
| ヴェスナ | checkpoint / externalSpecPending | 転位150%、風羽の分類と星光の祝福端数の3件 |
| ヴォジャニーツァ | checkpoint / externalSpecPending | A4端数1件。確定済み加算位置・Song・party契約は維持 |
| 11522 蝶の羽化 | CurrentCalc Site Ready | 確定範囲の保留なし |
| 11438 銀灯 | CurrentCalc Site Ready | 確定範囲の保留なし |
| 14524 旋流の讃美歌 | checkpoint / externalSpecPending | party ATK端数・層数cap・HP参照時点の3件 |
| 11437 新たなる枝 | checkpoint / externalSpecPending | 星反応補正の層数依存1件 |
| 14437 雪に沈む心 | CurrentCalc Site Ready | 確定範囲の保留なし |
| 15437 風に遊ぶ弦 | CurrentCalc Site Ready | 確定範囲の保留なし |
| 7.1新規聖遺物 | 該当なし（0件） | 保存inventoryと外部情報で補強。新データ追加なし |
| 紅血の証15047・炉炎溶錬の心15048 | CurrentCalc Site Ready | 7.1確定キャラ経路・氷/風星拡散・party/max互換性 |
| Stellar Conduct／星電導 | CurrentCalc Site Ready | 確定reaction経路・RES・対象隔離 |
| Stellar Swirl／星拡散 | CurrentCalc Site Ready | 氷/風のdamageElement、通常反応／直撃、会心・DEF除外 |
| Stellar Vortex・確定C4/C6独立Stellar hit | CurrentCalc Site Ready | 確定倍率・元素・独立hit・Elevation。上記unknown hitは含めない |
| 時間推移・ICD・付着時刻・rotation・自動状態取得/失効 | FutureDPS only | CurrentCalcのSite Ready条件には含めない |

未確定8件の安全境界は維持し、今回のRuntime修正は0件。新規P0/P1/P2は確認範囲で0件。再検証結果はRelease Gate文書へ記録する。
