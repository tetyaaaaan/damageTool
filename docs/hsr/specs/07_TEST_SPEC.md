# ⑦ テスト・文書検証仕様

照合日: 2026-10-28。以下のファイルとコマンドは実在する。観点は要求であり、全効果の検証完了を宣言する一覧ではない。

## 検証の原則

固定版原記録と独立数式から期待値を用意し、エンジン出力を正解としてコピーしない。効果ID、攻撃ID、全採用Lv、星魂・重畳、参照者、敵、条件、許容誤差と適用範囲を追えること。テキスト・UI候補表示だけを受入とせず、本番ローダーから入力/Modifierを経て実際のダメージへ接続する。

[独立検証ヘルパー](../../../tests/hsr/helpers/hsrDirectVerification.cjs)の `loadProductionFixture` は本番ローダーとエンジンをVM内で読む。`independentDirectDamage` は通常式の照合用で、全特殊式の万能な正解器ではない。係数そのものもproductionからコピーするだけにせず、固定版から独立した配列や手計算値と比較する。

## 実在する検証入口

|対象|テスト・確認する性質|
|---|---|
|通常式・防御/耐性・会心・撃破・特殊式|[hsrCalcEngine.test.cjs](../../../tests/hsr/hsrCalcEngine.test.cjs)、[hsrGoldenScenarios.test.cjs](../../../tests/hsr/hsrGoldenScenarios.test.cjs)|
|Modifier構造・対象・自動/任意・提供者・重複・閾値評価|[hsrModifierContract.test.cjs](../../../tests/hsr/hsrModifierContract.test.cjs)、[hsrModifierValidation.test.cjs](../../../tests/hsr/hsrModifierValidation.test.cjs)、[hsrModifierRuntime.test.cjs](../../../tests/hsr/hsrModifierRuntime.test.cjs)、[hsrModifierEvaluation.test.cjs](../../../tests/hsr/hsrModifierEvaluation.test.cjs)|
|入力・モーダル・局所停止・UID反映・保存復元・最終値算入|[hsrToolInputs.test.cjs](../../../tests/hsr/hsrToolInputs.test.cjs)、[hsrToolStructure.test.cjs](../../../tests/hsr/hsrToolStructure.test.cjs)、[hsrModifierEvaluation.test.cjs](../../../tests/hsr/hsrModifierEvaluation.test.cjs)|
|最終値・二重加算|[hsrFinalStatAudit.test.cjs](../../../tests/hsr/hsrFinalStatAudit.test.cjs)|
|装備の全重畳・セット境界・支援接続|[hsrEquipmentCompletion.test.cjs](../../../tests/hsr/hsrEquipmentCompletion.test.cjs)、[hsrSupportEquipmentBatch.test.cjs](../../../tests/hsr/hsrSupportEquipmentBatch.test.cjs)|
|星魂別支援Lv・独立期待値|[hsrRobinEidolonSupport.test.cjs](../../../tests/hsr/hsrRobinEidolonSupport.test.cjs)|
|複合攻撃・ヒット・撃破成分・撃破補正の分離|[hsrCompositeMainActions.test.cjs](../../../tests/hsr/hsrCompositeMainActions.test.cjs)、[hsrBatch8Feixiao.test.cjs](../../../tests/hsr/hsrBatch8Feixiao.test.cjs)、[hsrBatch8BreakIsolation.test.cjs](../../../tests/hsr/hsrBatch8BreakIsolation.test.cjs)、[hsrBreakDamageBonus.test.cjs](../../../tests/hsr/hsrBreakDamageBonus.test.cjs)|
|生成完成管理の分類|[hsrCompletionTracker.test.cjs](../../../tests/hsr/hsrCompletionTracker.test.cjs)、[reportHsrCompletion.cjs](../../../scripts/reportHsrCompletion.cjs)|

`hsrToolInputs` は模擬DOM/VMによるアプリ統合テスト。実ブラウザの描画検証、個人UIDの実通信、外部APIの現在の全形式を保証しない（Aの範囲）。UI実画面と外部通信は別記録とする（Dの残りを隠さない）。

## 数値・状態の必須観点

- 必要な全採用Lv、E0～E6の解放境界、光円錐S1～S5、セット数の境界。
- 参照するATK/HP/DEF/別所有者の値だけ変えて独立性を確認。
- 非会心・会心・期待値、固定会心、会心不可、ヒット/成分合計。
- 常時/閾値の直下・一致・直上、effective閾値を超える独立支援、同一閾値を下回る支援解除、任意ON/OFF、0・空欄・不正値、層数上限。
- 提供者/受益者、属性/攻撃種類/主隣接、対象外への非漏出、提供者/装備解除。
- 完成済み最終値と未算入追加の同値、重複排除、保存復元。Robin天賦の最終算入ON/OFFと旧false保存値の移行も確認する。
- 未対応条件や必須入力不足は関係する結果だけ停止。参考値/部分結果を確定合計にしない。

独立した後続行動を単一攻撃に足す試験を必須にしない。単一攻撃内で必要な複数成分の合算要求は維持する。未接続の観点は成功扱いにせず[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)へ記録する。

## 変更別の実行

リポジトリルート、Node.js標準テストランナーで実行する。コマンドを並べたこと自体は実行成功の証拠ではない。

```powershell
# 例: 補正処理を変更した場合のfocused検証
node --test tests/hsr/hsrModifierRuntime.test.cjs tests/hsr/hsrModifierContract.test.cjs tests/hsr/hsrModifierValidation.test.cjs tests/hsr/hsrModifierEvaluation.test.cjs
# HSR製品変更の最終統合
node --test "tests/hsr/*.test.cjs"
# 既存生成管理表の整合（固定版のネットワーク取得が必要）
node scripts/reportHsrCompletion.cjs --check
```

変更に最も近い意味のある検証から開始する。関連失敗・共有処理・生成物変更・明示された受入がある場合に広げる。文書だけの変更では製品スイート全件・全画面撮影を必須にしない（[AGENTS.md](../../../AGENTS.md)）。初稿の一律「統合なら全体実行」をこの変更別規則へ訂正した（C）。

[validateHsrModifiers.cjs](../../../scripts/validateHsrModifiers.cjs)と[validateHsrAttacks.cjs](../../../scripts/validateHsrAttacks.cjs)は静的検査で、独立ダメージ受入とは別。検証器で見つかった実データの問題は[台帳](../../HSR_COMPLETION_WORKLOAD.md)で管理する。この静的検証器は登録済みデータの主要な構造・enum・条件を検査するが、JSON Schema全項目を汎用的に実行する検証器ではない。単体テスト成功や静的検査通過を、JSON Schema全制約または計算式の完全な独立正解と同じ意味にしない。

## 実画面と文書

UI・接続を変更したら1440/390/320pxで変更箇所と必要な境界を実操作し、長文、数値、内訳、局所停止、JS例外、横はみ出しを確認する。画像枚数を目的化しない。外部UIDを使う場合は合成テストと実通信を区別し、生応答の保存を受入の必須手順にしない。

文書監査は9文書のリンク先・アンカー、コード/テストのパス、挙げた関数名、JSON例と実レコード、A/B/C/Dの区別、要求と実装の整合を検証する。外部ゲーム仕様の未確認を、リンクが存在するだけで確認済みにしない。

個別効果完了は数値根拠・正しい自動/任意区分・実入力接続・対象範囲・独立計算・必要な解除/復元が揃った範囲で認定する。件数・実行結果は既存台帳に記録し、本章へ固定的な最新件数を持たせない。

### 共通状態・層数の一括受入

[SPD支援](../../../tests/hsr/hsrRobinE2Speed.test.cjs)、[ペラE2](../../../tests/hsr/hsrPelaE2Speed.test.cjs)、[遺物一括](../../../tests/hsr/hsrRelicBatch2.test.cjs)は、原レコードの固定値を期待値として独立計算する。Runtimeが返した値だけを用いて正解値を作らず、値そのもの・非会心/会心/期待値・層数上限・OFF/装備解除・不足セット・対象外・既算入同値を分けて確認する。SPDは閾値未満/一致/超過、敵条件CRはパネル閾値への非寄与、大公は次の追撃への持ち越し禁止、司祭は提供者と受益者の分離を受入に含める。

[画面入力テスト](../../../tests/hsr/hsrToolInputs.test.cjs)では、SPD支援とグラモス、層数・受益者・算入済み指定を画面イベントから計算・保存復元まで照合する。表示の変更時は変更箇所だけを必要な幅で確認する。全テストの結果と個別効果の完了範囲は既存台帳で記録する。

第2回は[遺物支援と天才/学者](../../../tests/hsr/hsrRelicRound2.test.cjs)、[光円錐全S値](../../../tests/hsr/hsrEquipmentRound2.test.cjs)、[SPD3効果](../../../tests/hsr/hsrSpeedSupportRound2.test.cjs)、[割合参照比較の制限](../../../tests/hsr/hsrReferenceComparison.test.cjs)を入口とする。固定値の独立式、HP未満/一致/超過、基礎SPD、攻撃種別、混在属性、防御低下/無視の合成、装備者/受益者、既算入同値を確認する。画面テストでは現在EP数値・量子弱点の自動/任意切替・光円錐の運命不一致・保存復元を検証する。旧表示専用件数の期待値は昇格に合わせて更新し、既存のダメージ期待値を対応のためだけに変更しない。

第3回は[光円錐](../../../tests/hsr/hsrEquipmentRound3.test.cjs)、[星魂・軌跡](../../../tests/hsr/hsrNativeRound3.test.cjs)、[遺物](../../../tests/hsr/hsrSetsRound3.test.cjs)、[未指定条件とBE支援](../../../tests/hsr/hsrMissingConditions.test.cjs)を入口とする。同調は既存効果の再検証として新規完了から区別する。HP80%/50%の厳密境界、全S値、DEF参照攻撃、BE150%/250%、支援解除、超撃破のDEF無視合計25%、受益者と装備者、対象外攻撃、既算入同値を確認する。AppテストはHP/EP未指定の局所除外、HP入力への移動、時計屋から鉄騎の再評価、層数・共有状態・単一提供者と複数隠者の局所除外、保存復元を確認する。実画面では既存HP欄への移動と狭幅表示を確認し、UID実通信とは区別する。

第4回の独立受入は[光円錐](../../../tests/hsr/hsrEquipmentRound4.test.cjs)、[追加能力](../../../tests/hsr/hsrNativeRound4.test.cjs)、[遺物](../../../tests/hsr/hsrSetsRound4.test.cjs)、[通常攻撃](../../../tests/hsr/hsrAttacksRound4.test.cjs)。既存Appテストで各新規群の入力・適用・保存復元、提供者ATK不足の局所除外、既知DEF低下からの132自動判定と助燃の独立を確認する。通常攻撃は採用全Lv・参照しないステータスの非寄与・会心/非会心/期待値を照合し、通常1件の対応をキャラ全構成認定にしない。既存の静的検証に失敗がある場合は、新規ソースを除いた同じ検証器の結果と比較して起因を分け、具体的な残課題を台帳へ残す。

第5回の入口は[光円錐](../../../tests/hsr/hsrEquipmentRound5.test.cjs)、[セット](../../../tests/hsr/hsrSetsRound5.test.cjs)、[キャラ支援](../../../tests/hsr/hsrNativeRound5.test.cjs)、[条件契約と限定依存](../../../tests/hsr/hsrRound5Conditions.test.cjs)、[スキル攻撃](../../../tests/hsr/hsrAttacksRound5.test.cjs)。全S/採用Lvのliteral配列、SPD/ATK境界、戦闘前値と戦闘中値の非混同、タリア→鉄騎の順/算入済み、LC21053の受益者/複数提供者除外、固定参照層の後方互換を確認する。既存Appテストで実入力・UIDの取得/未取得・保存復元・装備/提供者解除を確認し、実画面は戦闘前SPD欄と条件表示を必要幅で検証する。

第6回は[光円錐](../../../tests/hsr/hsrEquipmentRound6.test.cjs)、[オーナメント](../../../tests/hsr/hsrSetsRound6.test.cjs)、[追加能力](../../../tests/hsr/hsrNativeRound6.test.cjs)、[攻撃](../../../tests/hsr/hsrAttacksRound6.test.cjs)を入口にする。提供者のSPD/効果抵抗/BE境界・欠損、同属性と編成順、複数提供者の局所除外、全S値、固定BE支援から鉄騎閾値への一段反映を独立式で確認する。Appテストは実入力/未入力・装備運命・提供者離脱・保存復元・1つの共有層数入力を検証する。アベンチュリン必殺は攻撃前から同Lvの動揺がある場合に限定し、既存の全Lv独立式を維持する。初回付与の順序を調べたことにして旧テストを削除しない。件数/実行結果は台帳へ記録する。

第7回の入口は[光円錐](../../../tests/hsr/hsrEquipmentRound7.test.cjs)、[オーナメント](../../../tests/hsr/hsrSetsRound7.test.cjs)、[キャラ効果と参照契約](../../../tests/hsr/hsrNativeRound7.test.cjs)、[主要攻撃](../../../tests/hsr/hsrAttacksRound7.test.cjs)。戦闘開始時CDと現在CD、開始時最大EPと現在最大EP/現在EP割合、場のターゲット数と編成人数を別に検証する。全S/採用Lv、層数共有、HP支援後の境界、虚無人数による独立乗算、3段の各ヒット/合計を独立式で確認する。Appテストで実入力・保存復元・条件未確定の局所除外・装備/提供者解除を受け入れる。構造化定義ありとダメージ成分の完成を別集計し、既存の計算対応攻撃を新規昇格数へ含めない。最終全体テスト/画面結果は台帳を正本とする。


## 第8回追加の受入検証

[鏡流](../../../tests/hsr/hsrJingliuRound8.test.cjs)、[黄泉](../../../tests/hsr/hsrAcheronRound8.test.cjs)、[ヘルタ](../../../tests/hsr/hsrHertaRound8.test.cjs)、[アベンチュリン](../../../tests/hsr/hsrAventurineRound8.test.cjs)は固定版の採用曲線と独立式を照合する。黄泉13成分・ヘルタ4成分は個別値と合計、成分欠損/並替/参照不一致の拒否も確認する。ヘルタはSkill LvとTalent Lvを独立に変え、知恵人数と最後成分だけの倍率を検査する。

[装備](../../../tests/hsr/hsrEquipmentRound8.test.cjs)は全S1～S5、[遺物129](../../../tests/hsr/hsrSetsRound8.test.cjs)は愉悦式とDEF係数を独立検証する。[App入力](../../../tests/hsr/hsrToolInputs.test.cjs)は全主要行、スキル専用補正、共有入力数、提供者解除/運命不一致、既算入、局所除外、実保存復元まで確認する。限定状態の成功はその範囲だけの受入であり、未検証の状態順を補完する証拠にはしない。最新の全体実行結果は[残作業正本](../../HSR_COMPLETION_WORKLOAD.md)にのみ記録する。


## 第9回追加の受入検証

[黄泉](../../../tests/hsr/hsrAcheronRound9.test.cjs)は全採用Lv×開始集真赤0～9×非対称条件の独立式を確認し、0消去成分の省略・順序/係数改変・入力不足を拒否する。[ヘルタ](../../../tests/hsr/hsrHertaRound9.test.cjs)は全Skill/Talent Lv×最後解読0～42、知恵人数、A2の独立入力と境界、最後成分だけの倍率を検証する。これらを未実証の戦闘内付与順の証明へ流用しない。

[主要構成](../../../tests/hsr/hsrCharactersRound9.test.cjs)と既存景元/彦卿テストは全採用Lv・成分別独立値を確認する。アルジェンティは敵1体・栄達10層の180EP全体＋6バウンドで、HP50%を跨がない条件を明記する。[優先LC](../../../tests/hsr/hsrEquipmentRound9.test.cjs)、[追加LC](../../../tests/hsr/hsrEquipmentExtraRound9.test.cjs)、[霊砂星魂](../../../tests/hsr/hsrNativeRound9.test.cjs)は全S、閾値、BE→SPD→装備閾値、CD支援、循環の局所除外、攻撃/受益者/提供者、既算入を独立計算する。

[App入力](../../../tests/hsr/hsrToolInputs.test.cjs)では二つの層数の非混同・1つの共有欄・未入力の局所停止・保存復元、主要構成の全Lv、彦卿の算入済み、LC閾値支援の解除を確認する。最終製品コードで全HSRテスト、Modifier静的検証、攻撃静的検証の既存問題との比較、生成完成管理`--check`を実施する。変更部分の1440/390/320pxと実UID通信の有無を区別し、結果・件数は残作業台帳にのみ記録する。


## 第10回追加の受入検証

[主要曲線](../../../tests/hsr/hsrCharactersRound10.test.cjs)は素裳/Mishaの全E0採用Lvを固定値で照合する。[素裳合計](../../../tests/hsr/hsrSushangSnapshotRound10.test.cjs)は全Skill×Ult Lv、スキル本体と剣勢だけのDMG差、各成分と合計、飽和層不足の拒否を検証する。[霊砂E6](../../../tests/hsr/hsrLingshaRound10.test.cjs)は固定係数/4段、E6条件、RES低下とE2 BEの非寄与、既算入除外を確認する。

[LC全S](../../../tests/hsr/hsrEquipmentRound10.test.cjs)と[寒鴉](../../../tests/hsr/hsrHanyaRound10.test.cjs)は層数/閾値、受益者、攻撃種類、星魂・技能上限、既算入・解除を確認する。[App](../../../tests/hsr/hsrToolInputs.test.cjs)は追加回数の未入力と0/1/2、撃破状態からの自動判定、全主要Lv・合算、保存復元、E6行の前提が全体状態を上書きしないことを検証する。

同AppテストでUID proxy/fallbackをモックし、実catalog/traceSkillMapによる再構成から計算まで通す。精度保持・欠損値非流用・現在HP非推定・保存を確認するが、実通信成功の証拠とはしない。最終全体実行・既存静的問題の比較・3幅画面の結果は台帳にのみ記録する。

## 第11回追加の受入検証

[寒鴉](../../../tests/hsr/hsrHanyaRound11.test.cjs)は全採用必殺Lv・提供者SPD/受益者基礎ATK・ON/OFF・提供者離脱・既算入を確認。[霊砂](../../../tests/hsr/hsrLingshaRound11.test.cjs)はE0～E6の全採用天賦Lv、非対称ステータス、事前撃破状態、E1 DEF/E6 RES、各子成分と合計を独立式で検証する。旧配信の近似係数ではなく固定raw paramsを期待値にする。

[昇格行](../../../tests/hsr/hsrPromotionsRound11.test.cjs)は全Lv×複数の非対称ステータスで通常/スキル/必殺/追撃の直接係数を独立計算し、事前固有デバフの不足/算入済みを区別する。[LC全S](../../../tests/hsr/hsrEquipmentRound11.test.cjs)はATK/CR/CD/DMGと愉悦専用式、最大EP境界/未入力、共有条件、提供者解除/複数提供者局所除外、保存を確認する。

[App](../../../tests/hsr/hsrToolInputs.test.cjs)は寒鴉主要攻撃/必殺→実受益者→速度閾値、霊砂全星魂/合計、昇格行の事前状態、実際の装備運命、既算入・解除・保存を検証する。既存UIDモック取得/再構成/入力反映の回帰も全体で実行し、実通信と混同しない。汎用100%倍率のModifier単体テストでは公式の限定攻撃を改変せず、明示的な合成攻撃を使う。最終全体・静的問題差分・3幅画面・文書検証の結果は台帳へ記録する。

## 第12回追加の受入検証

[Phainon](../../../tests/hsr/hsrPhainonRound12.test.cjs)は全採用Lvの形態/層別独立式、A6の明示層と既算入、4層/Lv7～9の局所拒否を確認。[Dahlia](../../../tests/hsr/hsrDahliaRound12.test.cjs)は5段直接FUAと別の超撃破式、明示した非対称な削靭値/BE、結界OFF/ON、未撃破/非弱点/入力不足の拒否を検証する。

[Serin/Cipher](../../../tests/hsr/hsrSerinCipherRound12.test.cjs)は直接/DoT全採用Lv、裂創のHP/ATK上限、Cipherの通常/既発動ATKスキル/追撃と4成分必殺、速度140/170境界、各既算入/対象外を独立照合する。[追加キャラ](../../../tests/hsr/hsrExtraRound12.test.cjs)は本人ATKの付加・単体バウンド合計・事前DEF無視と解除を確認。[LC](../../../tests/hsr/hsrEquipmentRound12.test.cjs)は全S1～S5・任意/自動・DoT限定被DMG・支援SPDを検証する。

[App](../../../tests/hsr/hsrToolInputs.test.cjs)は新しい数値欄の単一表示/未入力/保存復元、局所保留、Cipher実native効果と記録値4成分、BE計算へ不要なATKを要求しないことを確認する。既存UIDモック再構成→入力反映→計算→保存の回帰と実通信を区別する。最終全HSR・静的問題の開始時との差分・3幅画面・文書検証の結果は台帳に記録する。


## 第13回の追加受入

`hsrDahliaRound13.test.cjs`は同一追撃の直接/SB各値と合計、全天賦Lv・2非対称条件・明示削靭・結界ON/OFFを独立式で確認する。`hsrSerinRound13.test.cjs`は本人4種の元DoT値×150%の再補正防止、全必殺Lv・結界0/1/8回、欠損/所有者違いの局所拒否を確認する。`hsrJadeGilgameshRound13.test.cjs`は質草0/1/49/50・既算入と別所有者スナップショット/離脱を確認する。`hsrPromotionsRound13.test.cjs`はキュレネの全採用HP曲線、`hsrEquipmentRound13.test.cjs`はLC全S1～S5・重複排他・BE境界・提供者解除を確認する。

`hsrToolInputs.test.cjs`の第13回部分は実Appからの成分計算/同じ値の保存復元/不足条件の局所除外/質草と敵風耐性の入力重複防止を確認する。既存のbatch4 activeCharacter参照テストを、新しいselectedParty参照へ誤って適用しない。selectedPartyの別所有者契約は専用の独立試験で検証する。実UID通信と既存UIDモック回帰は別に報告する。


## 第14回：ゴールデン試験とテスト分類

[Golden](../../../tests/hsr/hsrGoldenScenarios.test.cjs)の既存シナリオを維持し、末尾の `Dan Heng Lv6 support goldens` にケースID・合成入力・基礎値・装備・提供者・敵・条件・literalの非会心/会心/期待値・固定SHA/URL/参照日・許容誤差・未確認事項をまとめる。既存の独立ヘルパーと本番ローダーを使い、新しい汎用基盤は設けない。期待値は固定資料と独立手計算から作り、本番結果をコピーしない。

「仕様照合＋独立手計算」は実ゲーム測定や外部計算機の表示値照合とは別の信頼性分類。KQM等の説明一致も、外部計算値を取得した証拠にはしない。固定SHAと現在のゲーム版の同一性、未測定の時系列、別所有者/精霊への継承を保証しない。試験のケース数・値・実行時間は[第14回台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round14-audit)に記録する。

既存テストの一覧は `rg --files tests/hsr -g '*.test.cjs'`、個別テスト名・件数はNode標準ランナーの実行結果で確認する。ソースの `test(` の出現数はパラメータ生成分と一致しない。

|分類|実在する入口・手法|確認できる範囲と限界|
|---|---|---|
|計算・データ|`tests/hsr` の計算式/Modifier/攻撃/装備/完成表等。上の入口表と各回のリンク参照|固定値、式、登録、対象、重複、入力不足。構造検査だけの試験も含み、全てが独立ダメージ試験ではない|
|UI操作|[hsrToolInputs](../../../tests/hsr/hsrToolInputs.test.cjs)、Node VM＋模擬DOMと実Appイベント|条件、編成、提供者CD/BE、計算、UIDモック、保存復元。実ブラウザE2Eとは呼ばない|
|表示関連の静的補助|[hsrToolStructure](../../../tests/hsr/hsrToolStructure.test.cjs)、HTML/CSS/ソース確認|ラベル・構造等。実際の描画・横幅・フォーカスの証明ではない|
|表示|ローカル実ブラウザを1440/390/320pxで操作|該当画面の可読性、状態表示、入力/解除/再読込、コンソール。自動化された恒久的E2Eスイートではない|

第14回のRuntime試験は、Ruan本人SPD除外、E2撃破状態自動判定、通常DMGとBreak/SBの分離を追加。FinalStatAuditは必殺の片方だけ算入済みを照合。App試験は共通トグル/提供者欄の個数、CDと受益者の独立、BE境界、条件不足の局所停止、算入済みの表示・保存/解除を確認する。既存の通常会心上書き・E4攻撃・撃破追加はGoldenの既存受入を維持する。

現在のGitHub Actionsには原神用の既存ワークフローがあるが、HSR専用CI/Playwrightは未導入。最小の次案は既存Nodeテスト＋静的検証を実行するHSR用ジョブと、固定ローカルデータによる支援ON/OFF・再読込のブラウザ1シナリオ。今回は追加しない。実UIDネットワーク成功や全端末描画は引き続き別受入とする。


## 第15回：外部画面表示との限定照合

[Golden末尾](../../../tests/hsr/hsrGoldenScenarios.test.cjs)の `Dan Heng Lv6 compares four independent support cases` は、実ブラウザで読み取ったFribbelsのBASIC列と、既存の本番ローダー/通常式を比較する。外部のBASICは会心期待値であり、Combo DMG・DPS Score・ローテーション合計を単発攻撃の正解にしない。

分類は「外部計算照合（期待値の整数表示精度）」と「仕様照合＋独立手計算（非会心/会心/期待値）」を併記する。外部の非会心/会心・内部の全精度値を取得したことにはしない。外部表示整数を `n` として独立期待値が `n <= EV < n+1` に入ること、別途literal独立3値と本番結果が許容誤差内で一致することを確認する。表示丸めの差を消すために本番計算や既存Goldenを書き換えない。

外部の装備必須条件、初期ONの固有補正、常時軌跡、提供者CD、手動A6追加DMG、敵弱点と実効耐性、未撃破係数を明示する。外部A6はスキルOFFだけでは解除されないため、OFF比較は手動値も0へそろえる。公開ソースの固定commitと閲覧した配信版を同一と断定しない。採録条件・8状態の数値・丸め差・外部ページの識別情報・5分程度の手動手順は[第15回台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round15-comparison)に記録する。

今回の実ブラウザ操作はCodex自身による接続/表示確認であり、初見の実ユーザーによるユーザビリティ調査ではない。既存の模擬DOM試験とも別に扱う。製品の修正は実証した問題がある場合に限る。


## 第16回：キャラクター主要構成の限定受入

[御空](../../../tests/hsr/hsrYukongE0Completion.test.cjs)は全通常6×天賦10Lv×非対称2条件、必殺10Lv×2条件、支援10Lvの独立NC/C/EVを検証する。通常限定補正の両成分適用/必殺非適用、タグ欠落時停止、ATK参照分離、既算入除外も含む。固定Fribbelsのタグ実装照合は外部画面の計算値照合とは区別する。

[雪衣](../../../tests/hsr/hsrXueyiRound16.test.cjs)は既撃破必殺の全10Lv×2条件を独立計算し、未撃破/不明・敵複数・範囲外Lv/星魂を拒否する。部分対応から全体完成を推定しない。[App試験](../../../tests/hsr/hsrToolInputs.test.cjs)は実データと共通イベントで支援/靭性/軌跡Lv/局所停止/提供者離脱/保存復元を確認。実ブラウザ3幅の接続確認と模擬DOM試験、実UID通信をそれぞれ区別して[台帳](../../HSR_COMPLETION_WORKLOAD.md#hsr-round16-characters)に記録する。新しいテスト基盤は追加しない。


## 第17回：成分別カテゴリと師匠支援の回帰

[March](../../../tests/hsr/hsrBatch5March.test.cjs)は通常/強化本体と付加の独立NC/C/EVに加え、通常限定・Additional限定・誤scope・OFF・固有天賦の各1回・段間補正停止を検証。[支援](../../../tests/hsr/hsrMarchSupportRound17.test.cjs)は全SkillLv、受益者基礎SPD、CD/BE、前提状態/既算入/解除/自己除外を既存Runtime/engineで照合する。

[Golden](../../../tests/hsr/hsrGoldenScenarios.test.cjs)末尾の第17回シナリオは通常限定OFF/ONと強化3/8段の4固定状態。根拠区分は固定仕様＋独立手計算で、外部画面数値やゲーム実測ではない。[App試験](../../../tests/hsr/hsrToolInputs.test.cjs)では速度閾値の直下/一致/直上、基礎速度不足、提供者離脱、既算入と保存を確認。実ブラウザ3幅/UIDモック/実UID通信の区分は台帳へ記録。雪衣の換算候補は実証前にGoldenの正解へ固定せず、次回の実行証拠/分離測定で採否を判断する。


### 第53回：資源・記録・単一HPの負債

`hsrAhaRound53.test.cjs`は願力の基本枠8/超過枠10、採用全Lv、記録確定の3枝、入力不足と使令自己参照拒否を検証する。`hsrAhaDebtRound53.test.cjs`は本番エンジンの出力を期待値にせず、独立した愉悦式からHP減少を求め、既存7攻撃の負債比率/現在HPを照合する。MaxHP不変、負債を追加ダメージへ合算しないこと、10%で切り詰めないこと、事前比率を推定しないことを確認する。死亡/占有領域/単一HP以外の境界はHP内訳だけを停止する。ToolInputsのRound53は既存の状態入力・敵HP入力・保存復元と、未入力/境界時の局所停止・記録枝の表示を検証する。複数層・共有HP・回復・段階移行を合格範囲へ拡張しない。


### 第54回：実HPイベントと負債の分離

[層配分・HPShare](../../../tests/hsr/hsrAhaDebtRound54.test.cjs)、[回復](../../../tests/hsr/hsrAhaDebtHealingRound54.test.cjs)、[段階退避・復元](../../../tests/hsr/hsrAhaDebtPhaseRound54.test.cjs)は固定4.7実行定義の式から独立した期待値を置く。保持上限の前後、複数層の一括配分、実HP変化0/小数、HP=1の下限、回復層境界、保存比率の欠落・復元後の消去、内部HP操作の再帰除外を検証する。通常攻撃値をHP期待値へ流用せず、元の7攻撃・単一HP4000→76000/11%の検証を維持する。

ToolInputsの第54回は計算方法・所有者・層数・実HP変化・保存比率の入力/保存復元を確認する。表示用HPShare Subや死亡境界はHP内訳だけを停止し、通常ダメージを維持する。段階処理は指定したコールバック直前からの計算であり、致死からの遷移を試験済みと扱わない。UIは変更入力の1440/390/320pxと実結果・再読込復元を確認する。実UID通信/外部ツール同条件照合とは区別して記録する。
