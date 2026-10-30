# ③ 計算仕様書 — 攻撃・成分単位のダメージ計算

- 状態：**監査済み（実装範囲と要求を区別）**。本書の数式は、特に「現行エンジン」と明記した箇所ではコード挙動の記述であり、ゲーム仕様の正本を意味しない。
- 要求仕様：選択キャラクターの通常・強化通常・スキル・必殺・追加攻撃・連携・召喚物・DoT・撃破等を、単一攻撃単位で計算し、必要に応じて会心／非会心／期待値およびヒット・成分別内訳を示す。任意の戦闘ローテーションやラウンド再現は対象外。単一攻撃に含まれる複数ヒット・複数成分の計算・合算は対象。
- 分類：**A**＝要求として正しく実装も根拠を確認、**B**＝要求は維持し現行実装は未対応・部分対応、**C**＝初稿の説明に誤り・裏付け不足、**D**＝根拠が揃わず未確定。
- 関連：[`04_MODIFIER_SPEC.md`](04_MODIFIER_SPEC.md)、[`06_CHARACTER_EQUIPMENT_SPEC.md`](06_CHARACTER_EQUIPMENT_SPEC.md)、[`07_TEST_SPEC.md`](07_TEST_SPEC.md)。進捗は [`docs/HSR_CHARACTER_COMPLETION.md`](../../HSR_CHARACTER_COMPLETION.md)、攻撃範囲は [`docs/HSR_MAIN_ATTACK_SCOPE.md`](../../HSR_MAIN_ATTACK_SCOPE.md) を参照し、本書に進捗数値を複製しない。

## 1. 根拠と適用範囲

主な実装は [`games/js/hsrCalcEngine.js`](../../../games/js/hsrCalcEngine.js) の `calculate`、`calculateComponentSequence`、`calculateBreak`、`calculateAdditionalBreak`、`calculateSuperBreak`、`calculateElation`、`calculateTrueDamage`、`defenseMultiplier`、`resistanceMultiplier`。入力データの読込・構築は [`games/js/hsrCalcData.js`](../../../games/js/hsrCalcData.js)、攻撃倍率やブレーク値のデータファイルは [`games/hsr/data/calc/data-files.json`](../../../games/hsr/data/calc/data-files.json) とそこから指定されるJSON群にある。`breakDamage` は通常の `damageBonus` / `independentMultiplier` や `breakEffect` と別カテゴリで、撃破系の式に専用の加算合計→係数として適用する。

独立した通常ダメージ計算の参照実装と固定StarRailResコミットは [`tests/hsr/helpers/hsrDirectVerification.cjs`](../../../tests/hsr/helpers/hsrDirectVerification.cjs) の `independentDirectDamage` / `fixedSourceSha`（`dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487`）。エンジン自身の出力だけで作った期待値を独立検証とみなさない。特に参照すべきテストは [`tests/hsr/hsrCalcEngine.test.cjs`](../../../tests/hsr/hsrCalcEngine.test.cjs)、[`tests/hsr/hsrBreakDamageBonus.test.cjs`](../../../tests/hsr/hsrBreakDamageBonus.test.cjs)、[`tests/hsr/hsrCompositeMainActions.test.cjs`](../../../tests/hsr/hsrCompositeMainActions.test.cjs)、[`tests/hsr/hsrBatch7Break.test.cjs`](../../../tests/hsr/hsrBatch7Break.test.cjs)、[`tests/hsr/hsrBatch8BreakIsolation.test.cjs`](../../../tests/hsr/hsrBatch8BreakIsolation.test.cjs)、[`tests/hsr/hsrBatch7Elation.test.cjs`](../../../tests/hsr/hsrBatch7Elation.test.cjs)。個別キャラの全対応範囲は各 `tests/hsr/hsrBatch*.test.cjs` を参照する。

これらは式のコード挙動や、宣言された入力範囲内の再計算一致を示す。ゲームの全バージョン・全攻撃・あらゆる内部丸めの正しさまで証明するものではない。外部の原神CurrentCalcはHSR計算式の根拠ではない。

## 2. 入力値とステータス

### 2.1 現行エンジンの入力契約

通常式では `character.stats` の値を最終入力の基礎として扱い、該当する有効Modifierだけを加える。`statFlat` は加算し、`statPercent` は `character.baseStats[stat] × value / 100` を加算する。したがって、最終値にすでに含まれる効果をModifierとして重ねれば二重加算になる。コードは入力由来を一般には判別しないため、UID取込値とModifierの既算入関係の解決は入力構築側の責務・継続課題である（B）。

`calculate` は通常の倍率攻撃で `scalingStat`（既定ATK）または `scalingTerms` に指定された参照値を使う。`flatDamage` は基礎ダメージへ加算される。`enemyHpCappedByAtk` は敵最大HP割合とATK上限の小さい側を使う専用分岐。効果がATK/HP/DEFのどれを見るか、召喚物など所有者と異なる参照者を使うかは攻撃データ・専用関数で定義され、任意の攻撃に一般化されてはいない。

現在HP/敵HP/現在EPの割合条件は、有限の0～100の明示入力だけで判定する。未指定を満タン・0%に置き換えず、当該Modifierを条件未確定として除外し、他の計算を継続する。これは必須の攻撃参照値が欠ける場合の該当攻撃停止とは区別する。鉄騎のBE閾値は独立BE支援適用後に一段判定する（評価範囲は[04](04_MODIFIER_SPEC.md)）。

### 2.2 通常直接ダメージ：コードで確認した式

以下は `calculate` の現行実装を記述する。割合値はパーセント数値（例：20 は20%）、演算はJavaScript浮動小数点で行う。

```text
各参照項 i の基礎寄与 = 有効参照ステータス_i × 有効倍率_i / 100
基礎ダメージ B = Σ(各参照項の基礎寄与) + flatDamage

D0 = B × (1 + 与ダメージ補正合計 / 100)
       × 防御倍率 × 耐性倍率 × 靭性状態係数
       × 独立乗算補正の積 × 各ヒットの被ダメージ係数の総和
```

`damageFormula: enemyHpCappedByAtk` では `B` の参照値部分を `min(max(敵最大HP,0)×敵HP割合, max(有効ATK,0)×ATK上限割合)` とし、倍率と `flatDamage` を適用する。

有効倍率には `multiplierAddition` を加える。`scalingTerms` がある場合は `receivesMultiplierAddition` を持つ項だけへ加え、`multiplierAdditionScale` があればその倍率を使う。通常の会心率には `critRateOverride` の最大値を採用する経路と、ロビン追加物理のように `fixedCritStats` を確認して会心補正を再加算しない限定経路がある。一般式だけでそれらの専用制約を上書きしない。

通常式で `damageBonus` に入るのはステータスの属性別与ダメージ（なければ汎用与ダメージ）と適用Modifierの合計。`dotDamage` Modifierは `attack.type === "dot"` の時だけこの加算グループへ入る。`independentMultiplier` は各値について `(1+値/100)` を掛ける。`takenDamage`、敵耐性、敵防御は別の段階。敵の弱点フラグは通常式の直接ダメージ倍率を変えず、靭性状態・撃破適格性などに関与する。

- **防御倍率**：`defenseMultiplier` では攻撃者Lvと敵Lvをそれぞれ1以上とし、`(Lv+20)` を使う。防御ダウン合計と防御無視合計をそれぞれ0〜100%にクランプした後、両者を加算して `max(0, 1 - ダウン - 無視)` を敵側防御に掛ける。倍率は `(攻撃者Lv+20) / ((攻撃者Lv+20) + (敵Lv+20)×残存防御率)`。敵防御減少・無視をまとめて先に100%へクランプする実装ではない。独立照合は `independentDirectDamage` と `hsrCalcEngine.test.cjs` が確認する。
- **耐性倍率**：敵耐性から耐性低下・耐性貫通を差し引いた実効耐性を−100〜90%へクランプし、`1 - 実効耐性/100`。75%で式を分岐しない。これはコード挙動およびテストの記述であり、別途ゲーム仕様の権威的証明とは区別する。
- **靭性状態**：通常式は `enemy.toughnessActive` が真なら0.9、そうでなければ1を掛ける。これは汎用直接ダメージ経路の実装値であり、特殊式が同じ条件を持つとは限らない。
- **会心**：会心率は0〜100%にクランプ。会心倍率は `1 + (会心ダメージ + critTakenDamage)/100`。会心可能な成分の期待倍率は `1 + 有効会心率×(会心倍率−1)`（有効会心率は0〜1）。会心不可は会心倍率・期待倍率とも1。会心ダメージ等が負値になる入力に対するゲーム上の意味は未確定であり、コードの値を仕様上保証しない。
- **複数ヒット**：通常式は `hitCount` の整数部分を使い、通常は最低1、`hitCountReference` の時は最低0。progressive taken-damage があればヒット位置に応じた係数を個別に計算し、最終結果と per-hit 値を返す。progressive効果がなければ共通条件下の同一倍率をヒット数分合計する。これは手数計算であり、会心判定のゲーム内相関・状態遷移をシミュレーションするものではない。

### 2.3 丸め

エンジンの計算値・内訳は通常 `Math.round` や `toFixed` で段階丸めされず、浮動小数点値のまま返る。`calculateBreak` / `calculateSuperBreak` はキャラクターレベルを最寄り整数に丸めて1〜80へ制限するが、ダメージ値を丸めているのではない。UIには整数表示を行う経路がある（[`games/js/hsrApp.js`](../../../games/js/hsrApp.js) の `detailNumber`（最大小数6桁）および `fmt`（整数表示））。独立テストは許容誤差で比較している。ゲーム内部で攻撃途中・各ヒット・総計のどの段階に丸めがあるかはD（本資料から確定不可）。表示丸めとエンジン計算を混同しない。

## 3. 撃破系の現行実装

### 3.1 弱点撃破 (`calculateBreak`)

実効キャラクターレベルを `round(Lv)` 後1〜80へ制限し、入力の `breakBaseDamage[level]` を基礎値とする。値がない場合、または選択属性が敵弱点でない場合は計算を停止する。属性倍率はPhysical/Fire=2、Wind=1.5、Ice/Thunder=1、Quantum/Imaginary=0.5。明示 `input.multiplier` があれば属性既定倍率より優先する。

```text
撃破ダメージ = 撃破基礎値 × 属性（または明示）倍率
  × (1 + (最終撃破特効 + 適用BE補正)/100)
  × (1 + 適用breakDamage補正合計/100)
  × 防御倍率 × 耐性倍率
  × (0.5 + max(0, 敵最大靭性)/120)
  × (1 + 被ダメージ合計/100)
```

この関数は会心を計算しない。通常与ダメージ補正・`independentMultiplier` 等は受け付けずスキップする。`breakDamage` は撃破ダメージ専用カテゴリで、適用対象の有効補正値を合算し、`1 + 合計/100` を掛ける。これは最終撃破特効の加算ではなく、通常与ダメージとも別の乗算段階である。現行の戻り値には `breakDamageBonus` と `breakDamageMultiplier` が含まれる。BREAKの最大靭性係数はこの関数で確認した実装式で、他の経路へ一般化しない。基礎値の出所・バージョンはデータの provenance を参照する。

### 3.2 追加撃破 (`calculateAdditionalBreak`)

汎用の「任意の追加撃破」を評価する関数ではない。現状受理するのはRuan Meiの指定攻撃ID `1303041` / `1303031` とRappa `1317041` の限定定義で、Lv80・E0・敵1体・指定軌跡Lv等を検査し、必要入力が合わなければ停止する。Rappaは0〜10チャージの指定も必要。成立した各呼出しは `calculateBreak` を呼ぶため、適用対象となる `breakDamage` も同じ撃破ダメージ係数として反映する。各呼出しは独立した追加撃破1回を算出し、通常直撃・初回撃破・別追加撃破・超撃破を自動加算しない。追加撃破の一般化、攻撃データ全件への効果定義、発生順・複数イベント処理は要求に対してB。

### 3.3 超撃破 (`calculateSuperBreak`)

敵が攻撃前に撃破済み（`toughnessActive === false`）で、基礎削靭値とブレーク基礎テーブルが存在しなければ計算しない。コードの式は次の通り。

```text
超撃破 = 発生倍率/100 × 撃破基礎値 × (有効削靭値/10)
       × (1 + 最終撃破特効/100)
       × (1 + 適用breakDamage補正合計/100)
       × 防御倍率 × 耐性倍率 × (1 + 被ダメージ合計/100)
       × (1 + 超撃破ダメージ補正/100)
有効削靭値 = 基礎削靭値 × (1 + 撃破効率補正合計/100)
```

発生倍率既定値は100%。関数は会心なし。攻撃データに基礎削靭値がない場合、ゲーム既定値を推測せず停止する。エンジンは `breakDamage` を超撃破の計算式にも受け付け、`breakEffect`・`breakEfficiency`・`superBreakDamage`・防御・耐性・被ダメージ補正と別の係数として処理する。ただし、これはエンジンのカテゴリ能力を記述するものであり、個別効果が超撃破を対象にする根拠にはならない。元素弱点・初回撃破の自動発生や状態変化は再現しない。Firefly等一部の専用経路は追加の専用係数や条件を [`calculateNativeBreakSequence`](../../../games/js/hsrCalcEngine.js) で適用する。LC21056「風を追う時」の固定版効果は「弱点撃破ダメージ」表記のみ確認でき、超撃破への適用を裏付ける一次資料は未確認である。そのデータ対象は弱点撃破に限定し、超撃破適用はDとして保留する。

## 4. DoT・愉悦・確定ダメージ・成分列

- **DoT（部分対応、B）**：通常倍率経路は `type: "dot"` の攻撃データを処理し、DoT与ダメージ補正を通常与ダメージと区別する。汎用的なDoT付与・層数・起爆・発生回数・状態変化の戦闘進行は行わない。個別効果の会心可否・参照状態は攻撃データの対応範囲に限る。
- **愉悦（B）**：`calculateElation` は専用式・Lv80基礎値・限定ID/文脈を検査する特殊経路。現行のLv80基礎式は `7535.1070 × 倍率/100 × (1+愉悦度/100) × (1+5×爆笑ネタ/(爆笑ネタ+240)) × (1+上笑/100)` に、DEF・RES・靭性・被ダメージ・会心を適用する。実装上の爆笑ネタは一部攻撃で固定文脈から取得する。許可カテゴリは愉悦、会心系、DEF/RES低下・貫通、被ダメージ等の列挙された補正であり、通常のdamageBonusやdotDamageは適用しない。対応攻撃や条件を任意の愉悦攻撃へ広げない。この式の独立Lv80数値照合は `tests/hsr/hsrCalcEngine.test.cjs` の “Evanescia Elation agrees with independently calculated Lv80 reference values” テスト、追加愉悦の独立照合は `tests/hsr/hsrBatch7Elation.test.cjs` を参照する。式の由来は当該テストコメントに記載されたElation_DMG参照と倍率データであり、エンジン実装自体をゲーム仕様の権威とはみなさない。
- **確定ダメージ（B）**：`calculateTrueDamage` は現状、キュレネの攻撃ID `1415021`、E0、単一ヒット等に限定。入力された「追加確定ダメージを含まない補正適用後ダメージ1回分」に倍率を掛ける。防御・耐性・会心・Modifierを再適用せず、元ダメージに含まれる補正は保持する。元値の出所を含む自動連鎖や任意確定ダメージは未対応。
- **複数成分・ヒット（部分対応、B）**：`componentSequence` は一般的な任意成分リストの処理器ではない。エンジンは既知IDと構成を検証し、成分ごとに通常式または専用経路を呼び、結果を合算する。例としてFeixiao、Yukong、Moze、Luka等の固定構成や、Anaxa/March等の専用関数がある。成分ID・属性・攻撃種別・レベル・同一スナップショットが登録定義と異なる場合は停止する。複数ヒットだけの攻撃は通常経路で個数を集約できるが、ヒット順に敵状態やModifierが変化する一般シミュレーションではない。あらゆる攻撃への共通複合定義は要求に対するB。
- 成分に会心可／不可が混在する場合、成分の独立結果を合算する専用経路では会心不可成分は会心増分なしとなる。合算表示の「会心」は各成分の会心可能性を考慮した評価値であり、複数成分のゲーム内一括会心抽選を表さない。

## 5. Modifierのスタック規則（現行エンジン）

計算前に `enforceStackingRules` が有効候補を評価する。`stacking.rule: "multiply"` は現行未対応であり、候補が単独でも適用不可にして理由を返す。乗算を最大値採用として扱わず、その候補だけを除外するため、別グループや他の有効補正の計算は継続する。`nonStacking` 等の既存規則は本書の式で定義する算術カテゴリとは別で、候補間の重複解決に用いる。

## 6. 実装と要求の差分

| 分類 | 事項 | 根拠・判断 |
|---|---|---|
| A | 非会心・会心・期待値の別表示、敵補正、通常単一攻撃のヒット数・per-hit出力、複数成分の明示合算を目標にする | `calculate` の戻り値、通常独立Oracleと複合攻撃テストで一部経路確認済み |
| B | 自動適用可能な条件を適用し、入力から判定できる閾値は自動判定、任意発動条件は選択する。不要な任意状態を攻撃一覧の計算必須にしない | 正しい要求。現状は経路・効果ごとに対応が異なり、全体要件として未達 |
| B | 全キャラクター・装備・攻撃を対象とする単一攻撃計算、攻撃ごとの正しい参照者・属性・敵補正 | 個別攻撃・効果に限定実装がある。進捗正本は完成管理資料・攻撃範囲資料 |
| B | 対象キャラクターの有効な単一攻撃すべてについて、攻撃内に属する複数成分と複数ヒットを適切に計算・合算する | 現行の複合処理は限定された成分定義とIDに限られる。攻撃一覧の完全なカバレッジが未達。任意のJSON成分列を受け入れるエンジン構造自体は要求しない |
| B | 最終ステータスとModifierの二重加算防止を全対象で満たす | includedInFinalStats除外と任意追加OFFの経路はあるが、全効果の分類・入力契約の受入は未完。汎用の由来推定エンジンを新たな必須要件にはしない |
| C | 初稿が「主要な数式・上限・丸め・実装関数はすべて照合待ち」としていたこと | 通常・撃破・耐性・DEF・会心・複合計算の具体的実装と独立検算が存在する。照合待ち記述を置換 |
| C | 初稿の論理積式を現行エンジン仕様として読める記述 | エンジンは群ごとの加算、独立乗算、上限、特殊分岐を実装済み。上記の式と現行コードを明記 |
| C | `componentSequence` が一般の任意成分列を受理するとの初稿上の含意 | 現在はID/定義限定のルーター。任意構成を受理しないが、必要な単一攻撃範囲を満たすことは別途必要 |
| D | ゲームの権威的な内部丸め位置、全攻撃に共通する最終丸め規則 | コードの浮動小数点出力・UI整数表示・テスト許容誤差からは決められない |
| D | LC21056「風を追う時」の「弱点撃破ダメージ」が超撃破にも適用されるか | 固定版の文言は弱点撃破ダメージまで。超撃破適用を裏付ける一次資料が未確認のため、現行データの対象は撃破に限定する |
| D | 個別キャラクター効果の全バージョンでの正しさ、網羅外の敵・状態との相互作用 | 個別データの根拠・独立テスト・対象範囲を追加確認するまで一般化しない |

## 7. 資料・更新ルール

本書は計算責務、現行エンジンが確実に行う式、確認済みの制約、要求との差分を管理する。効果係数・キャラクター全件の完了数や作業量は複製しない。キャラクター・装備効果の定義正本と検証対応は [`06_CHARACTER_EQUIPMENT_SPEC.md`](06_CHARACTER_EQUIPMENT_SPEC.md)、テスト受入条件は [`07_TEST_SPEC.md`](07_TEST_SPEC.md)、進捗・攻撃範囲・工数の正本は前掲の既存管理資料とする。コードまたは独立検証が変わった時に、本書の式・対応範囲・リンクを再照合する。

第5回の装備追加ではダメージの数式を変更しない。入力側で独立ATK支援後のDoT閾値を一段判定し、タリアのeffective SPDから得たBEだけは鉄騎のBE閾値へ既知の順で渡す。任意の閾値出力を再帰的に合流する処理ではない。戦闘前SPDは現在の戦闘中SPDと別値で管理する。具体的な登録/評価契約は[04](04_MODIFIER_SPEC.md)、限定範囲と独立値は[残作業台帳](../../HSR_COMPLETION_WORKLOAD.md)を参照する。


## 第8回追加：限定状態の成分計算（A/B）

`calculateAcheronSnapshot`は黄泉130803の集真赤事前9層・雷心事前3層・敵1体を対象とする。固定版係数は `3 × (params[0] + params[4]) + params[2] = params[5]`、これと別にA6の6ヒット×ATK25%を加える。13成分を通常式で個別計算し、非会心・会心・期待値をそれぞれ合算する。雷心の90%は与ダメージ区分、天賦の全RES低下は耐性区分、奈落は既存の独立乗算。集真赤0～8層・雷心初回付与順の一般化はB。

`calculateHertaSnapshot`は140109の攻撃前解読42層を対象に、3つの `params[0]` と最後の `params[2]` を分離する。天賦140104の倍率加算は最後の成分 `140109:final` だけ。別の知恵がいる編成では同量の追加を加算する。[KQM](https://hsr.keqingmains.com/the-herta/#traces)は最後のAoEだけに適用する検証記述を持ち、数値は固定SHAのskillsを使用する。各子攻撃もスキルのタグを持つため、スキル専用装備補正を取り落とさない。42層未満の同撃層更新・初回必殺のATK付与順はB/D。既に有効な必殺ATKと最終ATKへの既算入は別管理。

鏡流はATK版/HP版のIDを分離し、最大HP・完成済みATKを取り違えない。1121202は転魄前の通常スキルで、転魄中の強化スキルは1121209。現在の転魄/月光/次攻撃DEF無視だけを補正し、HP消費からのATK変換を最終値へ再加算しない。採用範囲と未対応は[攻撃範囲](../../HSR_MAIN_ATTACK_SCOPE.md#modifier横断第8回主要攻撃の受入)を正本とする。
