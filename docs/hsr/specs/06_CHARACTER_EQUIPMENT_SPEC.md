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

第2回の追加は[遺物支援](../../../games/hsr/data/calc/modifiers-relics-round2.json)、[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round2.json)、既存の停雲/青雀定義が正本。メッセンジャー・時計屋の4セット戦闘中支援は任意状態と算入済み申告を分離し、2セットの恒常SPD/BEを再加算しない。天才の量子弱点追加DEF無視は全属性成分へ適用するため、敵弱点の参照元を攻撃成分から切り離す。学者の既存スキル/必殺補正は重複追加しない。光円錐の常時攻撃種補正と数値条件追加、開始時/撃破後の残期間は別条件として登録する。具体的な完了群・値・残範囲は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)を参照。

第3回の効果定義正本は[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round3.json)、[星魂・軌跡](../../../games/hsr/data/calc/modifiers-native-round3.json)、[遺物](../../../games/hsr/data/calc/modifiers-sets-round3.json)。既存の同調は[調和支援](../../../games/hsr/data/calc/modifiers-harmony-party.json)を再利用し、重複登録しない。琥珀の常時DEFや恒常セットプロパティは最終入力へ含め、HP条件の追加分等だけを評価する。白露E4は受益者の有効層、寒鴉A2はSP回復を発動した受益者の成立状態、武神は装備者の慈雨状態、隠者はその装備者からのバリア所持を指定する。隠者の複数装備者重複は未確定として局所除外する。値・ID・受入範囲・残課題は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)で管理し、効果全文や進捗を本書へ複製しない。

第4回の追加定義は[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round4.json)、[軌跡](../../../games/hsr/data/calc/modifiers-native-round4.json)、[遺物](../../../games/hsr/data/calc/modifiers-sets-round4.json)。127/132の既存行は[遺物・オーナメント](../../../games/hsr/data/calc/modifiers-relics-ornaments.json)を訂正し、重複登録しない。123のSPD/CDは本人計算、127の新HPは本人の基礎HP割合加算を受入範囲とし、精霊の独立HPや一般継承を完成扱いにしない。LCの恒常ATK/DMG/EHR等はpropertiesと最終入力の責務を維持し、DoT専用DMGや条件CR等の不足部分だけ追加する。通常攻撃の限定昇格は[攻撃override](../../../games/hsr/data/calc/attacks-round4.json)が正本。全キットや全星魂の完成認定と分け、効果群・残範囲・装備ID単位の未登録集計は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)へ集約する。

第5回の正本は[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round5.json)、[セット](../../../games/hsr/data/calc/modifiers-sets-round5.json)、[キャラ支援](../../../games/hsr/data/calc/modifiers-native-round5.json)、[スキル攻撃](../../../games/hsr/data/calc/attacks-round5.json)。詩人の恒常SPD-8%、卜者の恒常SPD6%、各LC/オーナメントの恒常propertiesは最終入力へ含める。戦闘前条件だけを現在SPDから推測しない。ツガンニヤは全体の敵撃破累積で、装備者の撃破だけに限定しない。21053は装備者とバリア受益者を分離する。白露は受益者の基礎HP割合、ケリュドラは固定SPD加算。個別の未対応成分・精霊の継承範囲・件数は台帳へ集約し、計算行の存在を装備全文の完成にしない。

第6回の正本は[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round6.json)、[オーナメント](../../../games/hsr/data/calc/modifiers-sets-round6.json)、[帰忘の流離人の追加能力](../../../games/hsr/data/calc/modifiers-native-round6.json)、[攻撃override](../../../games/hsr/data/calc/attacks-round6.json)。恒常properties/2セット基礎効果は最終入力のまま、条件成立時の追加分だけを接続する。仙舟/竜骨は提供者の数値、ピノコニーは本人以外の同属性キャラ、ルサカは本人以外の1枠目が受益者。鋳煉宮は炎弱点を攻撃した後の状態を指定し、単に現在の炎弱点があるだけでは発動させない。璣星の太素はE0・解放済み追加能力の撃破後有効層数を指定し、提供者BE条件による追加分も共有層数で計算する。各LCのS1～S5と攻撃の採用Lvは専用テストで照合するが、未実装のEP変換・技能中変換・愉悦/資源更新や全キットの完成を意味しない。個別の数値・残範囲・件数は台帳へ集約する。

第7回の効果正本は[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round7.json)、[オーナメント](../../../games/hsr/data/calc/modifiers-sets-round7.json)、[キャラ効果](../../../games/hsr/data/calc/modifiers-native-round7.json)。恒常ステータスはincludedInFinalStats/displayOnlyの管理行で再加算を禁止し、計算対応行と区別する。汎銀河のEHR→ATKは最終値責務を維持して自動変換を保留、ウェンワークの行動順・巨樹の治癒量は単発ダメージの対象外。所属タグや精霊一般継承を推測しない。レイシオ/ジェイドの現在層数、丹恒の発動済み速度、姫子の秘技デバフは明示した状態を使用する。黄泉は解放済み奈落を編成から自動評価する限定条件。追加能力の全育成段階・星魂による全キット変更は受入外で、具体的な完了/残範囲は既存台帳に記録する。


## 第8回追加の定義参照（黄泉・ヘルタの現行置換は第9回を参照）

鏡流は[attacks-jingliu-round8.json](../../../games/hsr/data/calc/attacks-jingliu-round8.json)と[modifiers-jingliu-round8.json](../../../games/hsr/data/calc/modifiers-jingliu-round8.json)、黄泉は[attacks-acheron-round8.json](../../../games/hsr/data/calc/attacks-acheron-round8.json)と[modifiers-acheron-round8.json](../../../games/hsr/data/calc/modifiers-acheron-round8.json)、ヘルタは[attacks-herta-round8.json](../../../games/hsr/data/calc/attacks-herta-round8.json)と[modifiers-herta-round8.json](../../../games/hsr/data/calc/modifiers-herta-round8.json)を正本とする。既存1121202の説明訂正は`attacks-round6.json`の同じ行へ反映し、重複登録しない。

[光円錐追加](../../../games/hsr/data/calc/modifiers-equipment-round8.json)は固定版S1～S5の追加成分のみを構造化する。23027のBE条件SPD・23028のCD条件FUAは残範囲で、計算行の存在だけで全文完成としない。[遺物追加](../../../games/hsr/data/calc/modifiers-sets-round8.json)の129は本人愉悦のDEF無視と獲得済み累積層を扱い、精霊への一般継承を認定しない。恒常CDは最終入力管理。

計算行がないオーナメント303は変換の既算入責務、308/320は恒常値と非ダメージ効果である。件数のために計算行を追加しない。現在の装備種類集計と個別残範囲は[残作業正本](../../HSR_COMPLETION_WORKLOAD.md)、E0認定は[生成完成表](../../HSR_CHARACTER_COMPLETION.md)で管理する。


## 第9回追加の定義参照

黄泉の現行攻撃は[attacks-acheron-round9.json](../../../games/hsr/data/calc/attacks-acheron-round9.json)、固有補正は既存round8を維持する。ヘルタは[攻撃](../../../games/hsr/data/calc/attacks-herta-round9.json)と[Modifier](../../../games/hsr/data/calc/modifiers-herta-round9.json)が現行で、round8 Modifierはmanifestから除外する。最後撃解読とA2使用時解読を区別し、必殺の初回付与順は未認定。黄泉の雷心事前3層以外も未認定のまま。

[アルジェンティ攻撃](../../../games/hsr/data/calc/attacks-characters-round9.json)は事前栄達10層・敵1体の180EP必殺を計算対応にする。景元・彦卿の主要行は既存定義を維持し、彦卿の既存5補正に `finalStatsInclusion` を追加する。認定基準と限定条件は完成管理表と攻撃範囲資料を正本とし、個別行の存在だけで認定しない。

[優先LC](../../../games/hsr/data/calc/modifiers-equipment-round9.json)は23027のBE条件SPDと23028のCD条件FUA、[追加LC](../../../games/hsr/data/calc/modifiers-equipment-extra-round9.json)は固定S1～S5の不足成分を扱う。恒常propertiesは最終値管理行で再加算を禁止し、計算成分へ数えない。一般の精霊継承や未確認の同LC複数提供者合成は認定外。

[霊砂星魂](../../../games/hsr/data/calc/modifiers-native-round9.json)はE2の必殺後BE支援とE6の浮元在場RES低下のみ。E6追加攻撃等の未接続成分を全文完成扱いにしない。オーナメント303/308/320と計算行なし遺物は第8回の責務区分を維持する。個別数値・新規意味群/成分・残範囲は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)へ集約する。


## 第10回追加の定義参照

[素裳攻撃](../../../games/hsr/data/calc/attacks-characters-round10.json)は追加成立回数の拡張と飽和状態のスキル合計、[回数入力](../../../games/hsr/data/calc/modifiers-characters-round10.json)は表示専用の入力契約。[霊砂E6](../../../games/hsr/data/calc/attacks-lingsha-round10.json)は固定追加4段のみで、既存浮元本体の高星魂全Lv対応と分ける。既存round9 E6 RES低下は当該攻撃前提に使用し、二重加算を避ける。ミーシャは既存攻撃とCD補正の定義を維持し、全Lvと段数/保存の受入を追加した。

[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round10.json)は固定S1～S5の対象成分、[寒鴉](../../../games/hsr/data/calc/modifiers-hanya-round10.json)は懲悪の既発動DMGとE6追加分が正本。恒常properties、同撃の層更新、初回付与順、継承未確認部分を計算済み成分と混同しない。装備/効果件数と残範囲は[台帳](../../HSR_COMPLETION_WORKLOAD.md)、認定基準は生成完成表と攻撃範囲へ集約する。

## 第11回追加の定義参照

寒鴉は[主要攻撃](../../../games/hsr/data/calc/attacks-hanya-round11.json)と[必殺支援](../../../games/hsr/data/calc/modifiers-hanya-round11.json)が現行。懲悪/E6は既存round10、録事は既存`modifiers-native-round3.json`を維持し既算入指定を追加する。発動時提供者SPDは編成へ明示したスナップショットで、過去の自動追跡ではない。限定E0認定の条件/範囲外は完成表と攻撃範囲を正本とする。

霊砂は[攻撃](../../../games/hsr/data/calc/attacks-lingsha-round11.json)で本体の星魂/Lv範囲と同一浮元イベント合計を扱い、[E1補正](../../../games/hsr/data/calc/modifiers-lingsha-round11.json)を追加する。既存E2/E6支援と追加4段のみの行は維持する。一般精霊継承/複数敵対象移動を完成扱いにしない。

[参考値昇格攻撃](../../../games/hsr/data/calc/attacks-promotions-round11.json)と[事前デバフ](../../../games/hsr/data/calc/modifiers-promotions-round11.json)は直接成分と明示状態の限定受入。ダリア結界中の超撃破等の未接続成分を含む全文完成ではない。[LC](../../../games/hsr/data/calc/modifiers-equipment-round11.json)は確認したS1～S5成分だけを計算し、恒常propertiesは最終入力へ含む管理行とする。精霊向け同量DMG、戦闘前最大SP条件、未確認の複数提供者合成は局所保留。種類数/残件/効果群の集計は[台帳](../../HSR_COMPLETION_WORKLOAD.md)にのみ記録する。

## 第12回追加の定義参照

[ファイノン攻撃](../../../games/hsr/data/calc/attacks-phainon-round12.json)と[形態/A6](../../../games/hsr/data/calc/modifiers-phainon-round12.json)は、明示層数・最終値・係数差の局所保留を管理する。[ダリア攻撃](../../../games/hsr/data/calc/attacks-dahlia-round12.json)と[結界効率](../../../games/hsr/data/calc/modifiers-dahlia-round12.json)は既存参考値の追撃と、明示削靭による事前撃破済み超撃破を分離する。

[セイレンス/サフェル攻撃](../../../games/hsr/data/calc/attacks-serin-cipher-round12.json)と[補正](../../../games/hsr/data/calc/modifiers-serin-cipher-round12.json)は、択一DoT・領域1回・必殺直接成分・Cipherの指定記録4成分を区別する。Cipherの限定E0受入と範囲外は生成完成表が正本で、全状態の認定に読み替えない。[追加キャラ攻撃](../../../games/hsr/data/calc/attacks-extra-round12.json)と[DEF無視](../../../games/hsr/data/calc/modifiers-extra-round12.json)はジェイド/ギルガメッシュの本人成分を扱い、別所有者の全連携を完成扱いにしない。

[LC](../../../games/hsr/data/calc/modifiers-equipment-round12.json)は確認したS1～S5の計算成分だけを追加し、恒常propertiesは既存の最終入力責務を維持。未確認の初回付与/複数提供者合成を全文完成として登録しない。分類・種類数と残範囲は[台帳](../../HSR_COMPLETION_WORKLOAD.md)で管理する。


## 第13回の効果正本と認定範囲

[攻撃マニフェスト](../../../games/hsr/data/calc/data-files.json)から読む`attacks-dahlia-round13.json`、`attacks-serin-round13.json`、`attacks-jade-gilgamesh-round13.json`、`attacks-promotions-round13.json`が新しい限定成分/状態の正本。LC23011/23029/23032は`modifiers-equipment-round13.json`、セイバー風連携は`modifiers-jade-gilgamesh-round13.json`へ登録する。原係数/条件は各provenanceの固定版skills/trees/light_cone_ranksを参照する。

ジェイドの認定は、本人非債権回収者・敵1体・明示したダメージ時点質草・既存の必殺限定条件を維持した主要構成だけ。層獲得時点/チャージ更新を自動認定しない。ダリアの変換、セイレンスの他所有者DoT/更新順、ギルガメッシュの連携合算と興等の全構成は未完成のまま管理する。人数/登録数は[生成完成表](../../HSR_CHARACTER_COMPLETION.md)、限定受入は[攻撃範囲](../../HSR_MAIN_ATTACK_SCOPE.md)、残成分は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)が正本。

ジェイドのスキルSPDは、計算対象の味方が債権回収者である任意状態を既存キーで指定し、本人を除いて固定+30を適用する。最終速度への既算入・提供者解除を尊重し、支援後SPDを既存グラモス閾値へ渡す。付加ダメージ行1314021は成立した単発の想定値として常時一覧へ出し、表示専用チェックを要求しない。


## 第16回：御空と雪衣の定義・認定範囲

御空は[120704の通常タグ](../../../games/hsr/data/calc/attacks-1206-1210.json)、[1207011の2成分合計](../../../games/hsr/data/attack-overrides.json)、[既存3支援の個別算入済み除外](../../../games/hsr/data/calc/modifiers-1206-1210.json)を接続。通常/天賦/必殺の全採用Lvと成立済み支援を既存共通UIで比較する。E0の限定受入は完成管理表を正本とし、初回付与順・ターン消費や全星魂認定へ拡張しない。

[雪衣必殺](../../../games/hsr/data/calc/attacks-xueyi-round16.json)は攻撃前から撃破済みの直接成分だけ。削靭0による可変DMG0とA4不成立を前提にし、未撃破の換算式は未実装。予兆の機杼のBE→DMGは既存の完成済み最終入力で管理する。この部分実装で雪衣全体を完成扱いにしない。根拠URL/範囲は各provenanceと[台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round16-characters)、実装箇所/採用Lvは攻撃範囲資料へ記録する。装備種類・新規効果件数を本書へ重複管理しない。


## 第17回：巡狩なのかの追加受入と雪衣の保留

[既存攻撃override](../../../games/hsr/data/attack-overrides.json)の1224011/1224081は本体Basic・付加Additionalというカテゴリを固定Fribbelsと照合し、通常限定補正を本体へ適用する。付加を追撃や通常へ変更しない。[師匠支援](../../../games/hsr/data/calc/modifiers-march-round17.json)は固定122402/1224103に基づく速度/会心ダメージ/撃破特効。本人の強化比較と、別キャラクターを師匠として計算する支援方向を区別する。

雪衣は既撃破121403の受入を維持。未撃破での残量clip/効率/途中撃破/A4時点の根拠が不足しており、最大補正を仮定しない。優先度/不足する証拠/次回確認/解決条件は[既存台帳の第17回追跡表](../../HSR_COMPLETION_WORKLOAD.md#hsr-round17-followup)へ集約する。E0人数・登録数を本仕様書へ複製しない。

### 固定BaseSpeedと装備変更（第45回）

光円錐の恒常 `BaseSpeed` は基礎SPDへ加え、SPD割合補正より前に評価する。UID Mapperは装備の重畳に応じて `(キャラ基礎SPD + 光円錐BaseSpeed) × (1 + SpeedAddedRatio) + SpeedDelta` を再構成する。手動入力は装備込み最終SPDを維持し、割合SPD支援の基礎参照だけにこの加算を含める。光円錐選択だけで入力済み最終SPDを上書きしない。両方の運命が既知で不一致なら恒常effect propertiesを除き、光円錐そのものの基礎HP/ATK/DEFは除かない。UIDの未知重畳/不完全装備で最終値を捏造しない既存制限は維持する。

新規装備の受入は全効果の完成認定ではない。光円錐の本人/味方/敵、通常/撃破/愉悦、独立精霊完成値の責務を分離し、算入済み成分を追加しない。具体的な対象/保留は[第45回台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round45-equipment)、式の検証は[装備独立テスト](../../../tests/hsr/hsrEquipmentRound45.test.cjs)と[UID再構成テスト](../../../tests/hsr/hsrToolStructure.test.cjs)が管理元。

### 装備の受益者条件と独立燃焼（第46回）

21055の与DMGは各受益者本人の現在HP割合>=50%で自動判定する。装備者のHPを全員へ流用せず、既存現在HP割合が未入力なら当該補正だけ未確定にする。23051の守護追加DMGは既存守護有効状態と、受益者本人が召喚物を所持する状態を指定する。独立精霊の完成済み入力へ一般継承しない。

21016の装備DEF恒常値は最終DEFへ含め、燃焼の自然発生1回はその参照DEFと最終炎DMG・敵炎耐性で別計算する。被攻撃/付与確率/ターン進行/他所有者の燃焼合成や起爆を自動生成しない。入力不足で装備者の他の主要攻撃を停止しない。その他の装備別状態・採用成分・保留は[第46回台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round46-equipment)、係数と式は[独立テスト](../../../tests/hsr/hsrEquipmentRound46.test.cjs)、製品入力は[統合テスト](../../../tests/hsr/hsrToolInputs.test.cjs)を参照。全装備の全効果完了数は定義種類数から推測しない。

### 装備の特殊基礎項・独立付加（第47回）

21030の恒常DEFは従来の装備込み最終入力/UID再構成に含め、必殺基礎へのDEF加算だけを戦闘成分として別管理する。受入6必殺の一覧・条件は[定義](../../../games/hsr/data/calc/modifiers-equipment-round47.json)を正とする。21029/20018の装備者属性付加はATK/CR/CDを装備者から参照し、他の通常/Skill/天賦と別行に表示する。独立精霊への継承や他所有者の参照へ一般化しない。

計算行なしの遺物/オーナメントは、恒常値の最終入力反映・非与DMG・変換責務未解決を分けて管理する。登録の有無だけで全効果完成を判定しない。実用上の残件、未定義装備との違い、外部実装の参照範囲は[第47回台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round47-equipment)を参照。全装備×全攻撃の完成認定には拡張しない。
