# ⑥ キャラクター・装備仕様 — 正本、反映範囲、受入基準

- 監査基準: `dc6a6b184338d8ff299855c90c71766d284c3604` の作業ツリー
- 判定: **A** = 定義/処理を実コード・データで確認、**B** = 正しい要求だが未対応/一部対応、**C** = 初稿の誤記・裏付けなしを訂正、**D** = 根拠不足で未確定

この文書は個別キャラや装備の効果一覧を複製しない。**カタログ収録・攻撃登録・Modifier登録・実装検証完了は別の状態**である。完成目標は上位の要求仕様に従い、現行の未実装状態で狭めない。

## 1. 効果定義の正本と照合元

| 情報 | 正本/実体 | 用途と制約 |
|---|---|---|
| キャラ、基礎値、スキル/軌跡/星魂、光円錐説明・rank値、セット表示情報 | `games/hsr/data/catalog.json` | 表示・選択・UID ID結合など。説明文があるだけでは計算実装ではない |
| 攻撃倍率・成分・対応範囲 | `games/hsr/data/attacks.generated.json` と `games/hsr/data/calc/data-files.json` が指すoverride群 | `games/hsr/data/attacks.json` が生成ファイルを指定。生成元は `scripts/generateHsrAttacks.cjs`。個別定義にはID/provenance/supportを保持 |
| キャラ/星魂/光円錐/遺物・オーナメント/支援の計算効果 | `games/hsr/data/calc/data-files.json` が指すmodifier JSON群 | `games/js/hsrCalcData.js` がロード。スキーマは `modifier-contract.schema.json`。`review`/`displayOnly` は計算完了扱いにしない |
| 上流ID・倍率・能力テキストの固定参照 | StarRailRes SHA `dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487` を記録する [`docs/HSR_CALC_DATA_SOURCES.md`](../../HSR_CALC_DATA_SOURCES.md) と各定義のprovenance | 現行Runtimeそのものと同一視せず、登録効果ごとに照合する。SHAの詳細な取得範囲は出典資料に従う |
| 個別攻撃・キャラの登録/検証状況 | [`docs/HSR_CHARACTER_COMPLETION.md`](../../HSR_CHARACTER_COMPLETION.md) 等 | 生成資料。正本スクリプトは `scripts/reportHsrCompletion.cjs`。同ファイルを手編集しない |
| 主要攻撃範囲・完成条件 | [`docs/HSR_MAIN_ATTACK_SCOPE.md`](../../HSR_MAIN_ATTACK_SCOPE.md) | 継続開発の範囲と実装/検証の区別 |
| 効果別受入・残作業 | [`docs/HSR_COMPLETION_WORKLOAD.md`](../../HSR_COMPLETION_WORKLOAD.md) | 個別変更の受入記録と残作業の正本 |

初稿にあった「固定SHAの全ID/値がこの構成で実際に確認済み」という含意は誤り (**C**)。「固定参照を持つこと」と「全効果を照合済み」は異なる。各効果のID・数値・対象・条件はその登録レコードと検証証拠で確認する。

## 2. 現行実装で確認できた範囲

| 対象 | 判定 | 確認した根拠と境界 |
|---|---|---|
| カタログ内キャラ/装備説明 | A: 収録データ | `catalog.json` にデータがある。計算対応を意味しない |
| 攻撃倍率・攻撃候補 | B | `attacks.generated.json` とoverrideが実行時に統合される。攻撃データが存在しないキャラ/成分、または `review`/非calculableは計算可能とは扱えない |
| 軌跡/星魂効果 | B | 構造化Modifier定義とランタイム適用がある。全rank/全効果の値・条件・対象・独立検証を網羅したとは言えない |
| 光円錐効果 | B | catalogにrank説明/値、modifier群に計算定義を置く経路がある。基礎/最終ステータスと戦闘中効果の全件分離・二重加算防止は未完 |
| 遺物/オーナメント | B | セット数等の表示情報と構造化効果の定義がある。全セット効果と閾値/攻撃範囲の完了は未確認 |
| UIDキャラ・装備・ステータス | B | `hsrProfileMapper.js` はEnka IDをcatalogへ結び、装備props/軌跡/セットから一部値を再構成。基礎HP/ATK/DEFはLv80限定で、欠損/不正データでは空値となりうる。全レベルの完全なプロフィール再構成ではない |
| パーティ支援/提供者参照 | B | modifier群に提供者・target定義、runtimeにparty/source selectionと参照解決がある。全支援・受益者・追加攻撃式の網羅ではない |

キャラ別の件数や完了率はここへ複製せず、上表の管理資料を確認する。カタログに星魂テキストが揃うことと星魂効果が計算へ入ることは別 (**C**)。

### 2026-10-28に独立検証した効果の例

以下は効果群の限定的な実装・検証例であり、キャラクターや装備の全効果が完了したことを意味しない。固定SHAの各source record、Modifierの登録先、`tests/hsr/hsrSupportEquipmentBatch.test.cjs` を対応づけて確認する。

- **フォフォ121703・必殺技ATK支援** (`modifiers-character-expanded.json`, `trace:1217:121703:party-atk`): 必殺技Lv1～10の24～40%を、自身以外の味方に適用する。提供者が編成中の候補として登録し、実際に必殺技ATK上昇が有効な間だけ補正条件をONにする。UID最終ATKにこの上昇を含めた場合はOFFにして二重加算を避ける。EP回復は対象外。
- **フォフォE1・速度支援** (`eidolon:1217:1:party-speed`): 星魂1以上かつ天賦の「厄払い」が有効な間、味方全体の速度+12%。厄払いの有効状態を手動選択し、天賦効果の継続時間延長やターン進行は再現しない。最終速度へ反映済みならOFFにする。
- **フォフォE6・治癒対象の与ダメージ** (`eidolon:1217:6:healed-ally-damage`): 固定SHAの星魂6に基づき、治癒された対象本人に+50%、2ターン。既存レコードと入力キーを維持し、治癒対象と効果中を手動選択する。回復発生や対象選択を計算機が再現するわけではない。
- **光円錐21056「風を追う時」** (`modifiers-harmony-party.json`, `lightCone:21056:party-break-damage`): 戦闘開始後に味方全体へ弱点撃破ダメージ+16/18/20/22/24% (S1～S5)、同系統は重複しない。装備者が編成されていれば自動適用し、専用の`breakDamage`計算にだけ接続する。固定版の記述から超撃破への適用は確認できていないため、Modifier対象は通常の弱点撃破とし、超撃破には適用しない。
- **溶岩で鍛造する火匠107・4セット** (`modifiers-relics-ornaments.json`): 既存の戦闘スキルダメージ+12% (`relic:107:4pc:skill-damage`) は維持する。必殺技後の次の攻撃では炎属性成分に+12%を加える別Modifier (`relic:107:4pc:next-fire-damage`) を設け、発動中を手動指定する。攻撃種別を限定せず炎属性の対象成分だけに適用し、次攻撃の自動追跡や2セットの炎属性+10%の再加算は行わない。
- **ロビンの天賦会心ダメージ** (`trace:1309:130904:party-crit-damage`): ロビンが編成され天賦が有効なら自動適用する。最終会心ダメージへ既に含めた場合は `robin-talent-crit-in-final-stats` で反映済みを指定し、再加算を防ぐ。従来の任意ON/OFFを既定状態として扱わない。

## 3. 効果データを追加・修正するときの規約

各レコード・関連検証では、少なくとも次を確認する。

1. **出典**: 固定source ID、skill/rank/set ID、値の選択方法、provenance。
2. **所有者と受益者**: 提供者・選択キャラ・対象パーティ員・敵・召喚物の役割を分離。
3. **効果値**: 軌跡Lv/重畳段階/星魂で異なる値、倍率単位、上限、flat/ratioを明示。
4. **発動**: 常時/編成/装備/ステータス閾値は自動判定可能か、任意状態は入力するかを区別。説明文から条件を解析しない。
5. **対象**: attack ID/type/tag、属性、成分、通常/DoT/撃破等の適用範囲を必要な粒度で限定。
6. **計算契約**: `inputPolicy` と `calculation` に従い、最終ステータス既算入値を再加算しない。基礎値を必要とする割合加算では参照基礎値の取得可否も確認。
7. **競合/状態**: stack group、上限、排他、装備外し・編成変更・保存復元の更新を確認。
8. **受入証拠**: 独立期待値または独立導出、境界条件、対象外攻撃への非適用、関連テスト。効果単位の管理正本へ記録。

これらは開発受入の要求。スキーマが列挙する項目だけで効果が正しいと証明されるわけではない。複数攻撃や複数成分では成分別対象と合算範囲も照合する。ローテーションや経過ターンの再現は追加しない。

### 星魂・装備の既存経路

`catalog.eidolons[].levelUpSkills` を [hsrApp.js](../../../games/js/hsrApp.js) の `traceMaximum` / `supportTraceMaximum` が参照し、ゲーム内表示Lvの入力上限を開く。入力Lvへもう一度+1/+2する方式ではない。攻撃側の `requiredEidolon` / `maximumEidolon` / `maximumTraceLevel`、Modifierの `source.eidolonRank`、`inputValidation.levelMaximumAtEidolon` は別の受付条件で、元テキストや上限開放だけでは計算完了にならない。[ロビン独立テスト](../../../tests/hsr/hsrRobinEidolonSupport.test.cjs)は提供者のE3/E5解放と全採用Lvの値を区別して確認する。

光円錐の `byRefinement` 等の配列はS1～S5の採用値。セットは `source.setPieces` と現在の4セット/2+2構成を照合する。UID再構成の `propertiesByRank` やセット `properties` の恒常値と、戦闘中に加えるModifierは異なる経路。[装備テスト](../../../tests/hsr/hsrEquipmentCompletion.test.cjs)と[最終値監査](../../../tests/hsr/hsrFinalStatAudit.test.cjs)で二重加算を確認する。全装備に同一の自動反映を仮定しない。

## 4. UIDと手動入力の境界

`games/js/hsrProfileApi.js` は同一オリジンAPIを優先し、`worker.js` はEnka.NetworkのHSR endpointへ中継する。`games/js/hsrProfileMapper.js` の `mapProfileResponse()`/`mapCharacter()` はプロフィールをcatalog IDに対応づけ、`calculateStats()` はUID装備・解放済み軌跡・光円錐rank・セットpropertiesから扱える値を再構成する。アプリの `applyProfileCharacter()` がキャラ、レベル、星魂、光円錐、セット、軌跡、得られたステータスをフォーム状態へ移す。

- UID情報はプロフィールの公開範囲・レスポンス項目に限る。スキル使用済み、戦闘中バフ、敵状態、全効果スタック等をUID値と推定しない。
- UID由来の完成ステータスとそこへ含めた恒常値は、同じ値を計算経路で二重に加算しない。各Modifierの`inputPolicy`と適用経路を確認する。
- 手動で選んだセット/光円錐やステータスは計算状態で個別設定できる。入力が不足/不正なら非対応または入力要求として表示し、未確認効果を黙って足さない。
- 現在Lv80以外のプロフィール基礎HP/ATK/DEFはmapperで補間せず未設定にする。これを将来仕様として固定せず、必要なら根拠付きの機能課題として扱う。

## 5. 完了判定と進捗の置き場所

個別効果を「実装・検証完了」とするには、説明データだけでなく、正しい数値、所有者/受益者、発動条件、対象範囲、計算接続、二重加算防止、独立結果との照合、関連する状態変化の確認を要する。中間状態を「データ収録」「定義済み」「実装済み/未検証」「実装・検証完了」「根拠不足保留」と区別する。

完了件数・残件・攻撃coverageの数値は本書や他の仕様書に独立コピーせず、[完成管理表](../../HSR_CHARACTER_COMPLETION.md)、[主要攻撃の対応範囲](../../HSR_MAIN_ATTACK_SCOPE.md)、[残作業測定](../../HSR_COMPLETION_WORKLOAD.md)へ記録する。それぞれの生成/更新方法はREADMEおよび各資料の先頭に従う。

## 6. 未確定事項 (D)

- 固定版のcharacters/skills/trees/ranksとカタログを照合する経路は `reportHsrCompletion.cjs` に実在する（A）。その一致だけでは、初回付与順や精霊への補正継承など、原レコードに書かれていない挙動は確定できない（D）。
- カタログ収録済みでも未接続なら実装課題（B）であり、根拠不足（D）と混同しない。数値根拠があって既存式で接続できる項目は進める。
- 未確認のゲーム挙動、丸め、重複/排他の優先順位は、独立検証または具体的なコード・レコード確認なしに決めない。

フォフォ必殺支援は表示Lv1～10に加え、固定版rank121703によるE3以上の表示Lv11～12を同じ `levelMaximumAtEidolon` 経路で受け付ける。火匠の次攻撃補正は通常式の炎属性直接攻撃に限定し、DoT/撃破/愉悦への継承を未検証のまま追加しない。

## 共通Modifierで追加する戦闘中効果

固定値の星魂SPD支援は、[ロビンE2](../../../games/hsr/data/calc/modifiers-robin-e2-speed.json)と[乱破E4](../../../games/hsr/data/calc/modifiers-eidolon-speed-support.json)、本人のみの[ペラE2](../../../games/hsr/data/calc/modifiers-pela.json)が同じstatPercent/基礎SPD・状態トグル・finalStatsInclusionを利用する。固定値の効果に軌跡Lvの検証を付けず、星魂の受付はsource.eidolonRankで行う。SPDは攻撃倍率へ直接加算せず、選択装備のeffective速度条件を通じてダメージへ間接反映する。EP回復・行動順・状態の経過は含めない。

[遺物の追加定義](../../../games/hsr/data/calc/modifiers-relics-batch2.json)は、成立済みの状態/層数を既存カテゴリへ接続する。廃土客の敵条件CRはパネルCRへ含めないため、敵デバフ数のstatThresholdとして評価し、競技場のグローバルCR判定へ戻さない。大公4pcの前回追撃で得たATK層は、次の追撃で解除されるため追撃へ持ち越さない。追撃内の層獲得・ヒット別ATK更新は未対応として別管理する。司祭の層数は装備者が現在の計算対象を単体スキル/必殺の対象にした結果であり、編成のみで付与しない。

恒常2pcの属性DMG/ATK/CR等は既存の最終入力責務を維持する。戦闘中のステータス補正は算入済み申告時だけ除外し、発動状態とは別に保存する。強化カフカ本人など既存の完成済み最終ステータス契約は、その移行を受入せずに自動追加へ変更しない。個別完了数と除外候補は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)を参照する。
