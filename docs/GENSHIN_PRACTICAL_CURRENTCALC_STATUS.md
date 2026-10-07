# 実用CurrentCalc公開判定

`c71b63b`の公開判定を再オープンした。主要な単発計算効果を外部確認待ちとして丸ごと除外した対象は、完成済みとして扱わない。以下は旧checkpointの記録に優先する現在の方針。

## 確定仕様と暫定仕様

保存rawと計算仕様を分離する。公式文言、KQM等のmechanics資料、信頼できる計算実装に相互矛盾がない場合、出典・固定版・hash・採用式をmetadataに保持して暫定計算へ接続する。暫定採用はゲーム内一次検証完了を意味しない。数値に影響する実際の仕様競合が残る場合は、未計算の効果を明示して完成済みと区別する。

通常画面には内部ID、enum、データパスを表示しない。計算可能な暫定仕様は短い注意表示にする。時間推移の自動管理はFutureDPSに分離する。

## 既知8項目の採用式

| 対象 | 採用するCurrentCalc契約 | 状態 |
| --- | --- | --- |
| ヴェスナC6転位150% | 独立風元素hit。通常/スキル固有DMG Bonusを受けない既存内部契約を使用。GO内部名をゲームの正式カテゴリとは扱わない | 暫定・計算可能 |
| ヴェスナ風羽 | スキルDMG Bonus対象 | 暫定・計算可能 |
| ヴェスナ星光の祝福 | `min(ATK / 100 × 0.7%, 14%)` | 暫定・計算可能 |
| ヴォジャニーツァA4 | `min(max(HP−40000, 0) / 1000 × 140, 3500)`、星拡散側は260/6500。providerの現在HPを使い、基礎ダメージへ加算 | 端数処理は暫定・計算可能 |
| 旋流の讃美歌HP端数 | 40,000超過HPを連続比例で計算 | 暫定・計算可能 |
| 同・層数と上限 | 各層で上限処理して現在層数を乗算。凍結/星拡散後は1.75倍 | 暫定・計算可能 |
| 同・参照HP | 武器自身の条件付きHP補正を一度反映した装備者HP。GOのpremod HPはHP%補正を含む。HP適用後にATKへ変換し、再帰的な自己適用をしない。ATK割合は受け手の基礎ATKへ適用 | 暫定・計算可能 |
| 新たなる枝 | 精錬別8/10/12/14/16% × 現在層数。対象星反応のみ | 暫定・計算可能 |

根拠は固定版GO `7d55317`の[Vesna](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/sheets/src/Characters/Vesna/index.tsx)、[Vodyanitsa](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/sheets/src/Characters/Vodyanitsa/index.tsx)、[Hymn](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/sheets/src/Weapons/Catalyst/HymnOfTheMaelstrom/index.tsx)、[New Bough](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/sheets/src/Weapons/Sword/NewBough/index.tsx)。[KQM Vodyanitsa](https://keqingmains.com/q/vodyanitsa-quickguide/)はA4の基礎加算位置と旋流R1・3層・増幅時の最大ATK42%を裏付ける。固定コードとSHAは保存source、各modifierの`currentCalcSpec`等に記録する。GO単独で支持される分類/端数処理は確定仕様へ昇格せず暫定を維持する。

旋流の参照時点は武器sheetだけでなく、同じ固定版の[共通stat式](https://github.com/frzyc/genshin-optimizer/blob/7d55317/libs/gi/wr/src/formula.ts)まで追跡した。`premod.hp`は武器自身のHP%を含むため「武器HP補正前」とは扱わない。R1・増幅3層、入力HP50,500・基礎HP10,000なら参照HP52,600、受け手ATK補正26.46%。partyでも装備者側でHPを一度解決し、受け手HPから再算出しない。

## 7.1対象の実用状態

| 対象 | 現在の状態 |
| --- | --- |
| ヴェスナ | 暫定仕様を含むが主要効果は計算可能 |
| ヴォジャニーツァ | A4端数処理は暫定、主要効果は計算可能 |
| 11522 蝶の羽化 / 11438 銀灯 | 既存Site Readyを維持 |
| 14524 旋流の讃美歌 | 暫定仕様を含むがparty ATKも計算可能 |
| 11437 新たなる枝 | 星反応の層数依存は暫定、計算可能 |
| 14437 雪に沈む心 / 15437 風に遊ぶ弦 | 既存Site Readyを維持 |
| 紅血の証 / 炉炎溶錬の心 | 既存Site Readyと7.1 compatibilityを維持 |

既知8項目には現在の採用式と矛盾する根拠を確認していない。一次検証未完了の項目は「暫定・計算可能」とし、検証済み対象と区別する。

## 7.0追加キャラクター

| 対象 | 現在の状態 |
| --- | --- |
| オデット / アリョーシャ | 既存Site Readyを維持。UID読込から画像表示・実計算まで確認 |
| 氷元素旅人（空 / 蛍） | 暫定データ経路で計算可能。両主人公の通常・重撃・落下・スキル・爆発、特殊重撃、A1/A4、C2/C6、星反応、共有条件、保存復元を専用回帰で確認 |

氷旅人は元の旅人IDを置換せず、元素別aliasを追加した。UIDでは空のskill depot 505、蛍の705から氷aliasを解決する。元の画像IDと既存炎旅人の契約は維持する。

保存7.0 rawにない後発の固有效果と倍率表は、[KQM氷旅人](https://library.keqingmains.com/characters/cryo/traveler-cryo)、固定版GO、保存した倍率出典から暫定採用した。古いrawの欠落を同versionの数値競合とは扱わない。特殊重撃は元の重撃2ヒットへ各ATK140%の基礎加算を含む独立行とし、A1の80%を重複適用しない。星反応状態でもスキル本体は通常の氷元素Talent damageを維持する。

恒常天賦・共鳴が反映済みのUID/最終ステータス入力では、同じ補正を追加しない。未反映の基礎状態を明示したRequestではA4の連続ATK→EM式と上限160を計算する。戦闘中の手動C2/C6状態はこの恒常補正と区別する。

## 7.0武器12本の状態

| ID | 武器 | CurrentCalc状態 |
| --- | --- | --- |
| 11435 | 異端を狩る熔刃 | 最小/最大は計算可能。中間距離式だけ外部仕様待ち |
| 11436 | 導炎の源 | 既存Site Readyを維持 |
| 11520 | 白銀の湖を舞う翼 | 既存Site Readyを維持 |
| 11521 | 星鋒の剣 | 対応するR1～R3の既存Site Readyを維持。取得未確認のR4/R5は従来どおり選択不可 |
| 12435 | シンフォニーの鋳影 | 既存Site Readyを維持 |
| 12436 | 救済の剣 | 既存Site Readyを維持 |
| 13435 | 氷の吐息 | 既存Site Readyを維持 |
| 13436 | 遠望の歌 | 既存Site Readyを維持 |
| 14435 | 諸王の対局 | 既存Site Readyを維持 |
| 14436 | 胸中の谺 | 既存Site Readyを維持 |
| 15435 | 千鈞懸黎 | 既存Site Readyを維持 |
| 15436 | 霜雪の契 | 既存Site Readyを維持 |

11435の中間距離式は推測実装しない。11521のR4/R5取得可能性は過去の指示で変更しないとされた制約であり、通常の選択範囲はR1～R3。他武器のエネルギー回復・継続時間延長など、単発の実ダメージに影響しないdisplay-only情報は数値接続不足と数えない。

## 画像とUID

追加キャラ・武器には既存の画像同期経路で取得した実画像を配置する。選択UIとUID mapper/importerはcatalogのicon metadataを共通resolverへ渡す。旅人の元素別aliasは元の画像IDを保持する。聖遺物15047/15048は既存画像を使用する。ブラウザ検証では画像のHTTP取得と自然サイズを確認し、存在しない画像だけfallbackとする。

## 検証

専用回帰は境界・中間値、精錬差、対象外への隔離、provider/recipient、Request再計算を固定する。実ブラウザではヴォジャニーツァ＋旋流の讃美歌の主要効果、短い暫定表示、内部ID非露出、武器変更、reload一致を確認する。UID読込E2Eは追加キャラ・武器・聖遺物の画像と実計算を確認する。

focused Gate、Golden、ページ構成が成功しても、主要効果を安全に非計算へ置いたまま「Release Ready」とは判定しない。

### 今回の最終検証結果

- focused Gate：57ファイル・390テスト成功。氷旅人10テストとUID画像経路3テストを含む。
- Golden：既存代表値と一致。ページ構成：6テスト成功。
- 実ブラウザE2E：氷旅人（空/蛍）、UID画像、ヴォジャニーツァ＋旋流、旋流単体、ヴェスナ、7.1武器batch1/batch2、既存provider転送の8本成功。
- UID APIは保存fixtureで再現し、画像は実サーバーから取得して自然サイズとfallback不使用を確認。オデット・アリョーシャ・両氷旅人の選択後実計算も確認した。
- 確認範囲の残るP0/P1/P2は0。主要な既知8効果を0除外した対象はない。暫定仕様は暫定のまま計算へ接続し、完全一次検証済みとは表記しない。
- 最終commit前sanity：氷旅人、ヴェスナ、ヴォジャニーツァ＋14524、11437、既存Site Readyキャラの条件・結果・reloadを再確認。UID画像E2Eは11437を含む7プロフィールで成功した。

全体検証には旧canonical/provenance・生成期待値の失敗が残る。focused公開判定の成功と全監査成功は区別し、その修正へ範囲を拡大しない。今回の最終RCは`c71b63b`を基準とした関連差分だけをローカルcommitする。既存の命ノ星座レジストリ差分と`.codex/`は含めず、GitHubへのpushは行わない。
