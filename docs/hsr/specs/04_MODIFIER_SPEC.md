# ④ Modifier仕様 — 効果登録・発動判定・適用範囲

## 文書の役割と判定

この文書はHSR Modifierの現行データ契約・処理経路を記録し、完成時に満たす要求と区別する。記述は次の分類で読む。

- **A — 要求・実装確認済み**：要求と現行実装が一致することをコード、データ、テストで確認。
- **B — 要求・未対応または部分対応**：要求は維持し、実装不足を課題として扱う。
- **C — 草案の誤りまたは根拠不足**：実装上の事実としては記載しない。必要なら要求として別に明記。
- **D — 未検証**：根拠を得るまで確定しない。

完成要求は、利用者が指定した任意の一時点の状態で攻撃候補ごとのダメージを計算すること。常時効果や現在の入力から成立を確定できる効果は自動適用し、発動済みかを入力だけから判断できない効果だけを条件UIで指定する。候補は現在のキャラクター・解放状態・装備・編成から抽出し、効果は指定された受益者・攻撃・属性・成分に限定する。最終ステータスとの二重加算を避け、攻撃一覧を表示するだけの不要な発動操作を要求しない。複数ヒット・追加成分の計算と合算は対象だが、ラウンド戦闘やローテーションの自動再現は対象外。

## 現行契約（A: 実装確認済み）

宣言上の形状契約は [`modifier-contract.schema.json`](../../../games/hsr/data/calc/modifier-contract.schema.json)。登録データは [`data-files.json`](../../../games/hsr/data/calc/data-files.json) が列挙する各 `modifiers*.json`。正本の一覧は [`games/hsr/data/calc/README.md`](../../../games/hsr/data/calc/README.md) を参照する。スキーマの必須項目は `id`, `source`, `name`, `description`, `category`, `unit`, `value`, `target`, `activation`, `calculation`, `support`, `provenance`。概略は次の実在フィールドから成る（値は例示であり、効果の正否は個別データの根拠とテストで判断する）。

```json
{
  "id": "eidolon:1309:130901:concerto-resistance-penetration",
  "source": {
    "kind": "eidolon",
    "id": "1309",
    "eidolonRank": 1
  },
  "providerScope": "party",
  "name": "ロビンE1・協奏中の味方全体全属性耐性貫通",
  "description": "ロビンの星魂1。協奏中、味方全体の通常攻撃・戦闘スキル・必殺技・追加攻撃・通常DoTに全属性耐性貫通+24%。協奏が有効な単発ダメージを指定します。撃破・超撃破・愉悦・精霊攻撃は個別の接続検証対象として含めません。",
  "category": "resistancePenetration",
  "unit": "percent",
  "value": {
    "kind": "fixed",
    "fixed": 24
  },
  "target": {
    "owner": "partyAll",
    "attackTypes": [
      "normal",
      "enhancedNormal",
      "skill",
      "enhancedSkill",
      "ultimate",
      "talent",
      "followUp",
      "additional",
      "dot"
    ],
    "elements": []
  },
  "activation": {
    "mode": "toggle",
    "inputKey": "robin-concerto-resistance-active",
    "default": false,
    "conditionText": "星魂1以上のロビンの協奏が継続中"
  },
  "stacking": {
    "group": "eidolon:1309:130901:concerto-resistance-penetration",
    "rule": "nonStacking"
  },
  "calculation": {
    "stage": "resistance",
    "operation": "add"
  },
  "inputPolicy": "conditional",
  "support": {
    "status": "calculable",
    "verified": true
  },
  "provenance": {
    "sourceName": "Mar-7th/StarRailRes",
    "sourceUrl": "https://github.com/Mar-7th/StarRailRes/blob/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/jp/character_ranks.json",
    "sourceFile": "character_ranks.json:130901.desc",
    "gameVersion": "fixed-sha-dbe8cdf / original Robin kit",
    "verifiedAt": "2026-10-28"
  }
}
```

この記録は [`modifiers-batch3-main-actions.json`](../../../games/hsr/data/calc/modifiers-batch3-main-actions.json) の実データをもとに、長い説明や出典値を省略して抜粋したもの。`source.kind` は `character`, `trace`, `eidolon`, `lightCone`, `relic`, `ornament`, `enemy`, `manual`。カテゴリ、対象所有者、攻撃種、属性、発動モード、値の種類、計算段階・演算子の許容値はスキーマを参照する。任意のプロパティも含め、未定義の概念フィールドを実装契約として追加しない。

スキーマは確認済みの本番登録キー・列挙値と同期し、トップレベルと定義済みオブジェクト内の未知キーを禁止する。`validateHsrModifiers.cjs` はローダーから全登録効果を読み、フィールド名・主要enum・契約上の値形状・stacking等の追加条件を検証する。ただし、これはJSON Schemaの全制約を汎用評価する実行器ではなく、スキーマ全制約の完全な検証を主張しない。実行時ローダーもJSON Schema検証器ではない。宣言値と実計算経路の整合は実コードと独立テストで確認する。

### 抽出・評価・計算経路

1. [`hsrCalcData.js`](../../../games/js/hsrCalcData.js) が登録済みの修正データファイルを読み、`structuredModifiers` に統合する。
2. [`hsrApp.js`](../../../games/js/hsrApp.js) の `structuredModifierContext()` が対象キャラ、軌跡Lv、星魂、装備、編成、味方ステータス、敵、保存済み `modifierInputs` をランタイムへ渡す。
3. [`hsrModifierRuntime.js`](../../../games/js/hsrModifierRuntime.js) の `sourceSelection()` が効果候補を選ぶ。キャラ・軌跡・星魂はID、星魂段階、`providerScope`、対象所有者とパーティを照合する。光円錐・遺物・オーナメントは本人または味方の装備と重畳・セット数を照合する。variant・敵・手動ソースも扱う。
4. `activationState()` と `resolveValue()` が発動状態と数値を評価し、`buildCandidates()` が利用可能性、`support.status`, `inputPolicy`, 入力検証、出典、表示情報を候補に付ける。説明文から数値や条件を解析しない。
5. `hsrApp.js` の `validateProvider()` が一部の味方の軌跡Lvや提供ステータスを検証する。`modifiers(attack)` が `modifierTargetsCalculation()` と `HsrModifierRuntime.applicableToAttack()` を使い、攻撃ID・種別・タグ・属性・対象位置・成分の範囲で候補を絞る。
6. `calculate()` は攻撃別リクエストに絞ったModifierを [`hsrCalcEngine.js`](../../../games/js/hsrCalcEngine.js) へ渡す。エンジンはカテゴリごとの計算経路で適用する。現行の `hsrCalcEngine.js` は `calculation.stage` / `calculation.operation` を読み取らず、実演算はカテゴリ別ロジックと値に依存するため、このメタデータ単独では演算を切り替えない。候補登録だけではダメージ適用を意味しない。

### 自動と手動の条件

- `activation.mode: "always"` は自動で有効。
- `statThreshold` は `reference`, `operator`, `threshold` を計算コンテキストで比較する。既定の参照元は入力ステータス。`activation.statSource: "effective"` を明示した閾値だけ、独立・戦闘全体対象の `critRate` / `breakEffect` / `statFlat` / `statPercent` 効果を一度だけ反映した参照値で再評価する。寄与候補は `always` / `toggle` / `stack` と `fixed` / `byLevel` / `byRefinement` / `perStack` / `perStackByLevel` / `perStackByRefinement` に限る。攻撃ID・属性・位置に限定される効果や攻撃固有ボーナス、閾値効果の出力は原則として再評価元へ含めない（タリア→鉄騎だけは末尾の固定依存を参照）。閾値自身が参照ステータスを変える循環、割合補正の計算に必要な基礎値が不明なケースは、その閾値効果だけ適用停止する。
- `numericThreshold` は `inputKey` があればその値を最小・最大の範囲内に制限して判定するため入力が必要。キーがない場合は参照値から判定する。閾値は候補生成時の入力コンテキストを参照し、他の効果を適用した後の再計算ステータスを参照する依存解決ではない。
- `toggle` は `inputKey` と `default` による任意状態指定。既定値がfalseでも効果候補自体は一覧に出る。
- `toggleThreshold` はユーザーのトグルと数値条件の両方が必要。
- `stack` は入力された層数を最小・最大（星魂段階による最大値を含む）に制限し、正の層数で有効になる。

これはランタイムの現行動作であり、全ての効果データが望ましい発動区分で登録済みという意味ではない。修正例として [`modifiers-character-expanded.json`](../../../games/hsr/data/calc/modifiers-character-expanded.json) の `trace:1309:130904:party-crit-damage` は、編成・軌跡解放から成立するロビン天賦の味方全体会心ダメージを `activation.mode: "always"` に変更した。最終値への既算入申告は発動条件と分離した `finalStatsInclusion: { inputKey, inputLabel, legacyToggleKey }` で扱う。新規状態・保存キーなしでは自動適用し、新しい `inputKey: true` の場合だけ除外する。旧保存データで `legacyToggleKey: false` があり新しいキーがない場合は、従来の状態を保つため除外する。新しいキーが明示されていればそちらを優先し、falseなら自動適用へ戻る。これは発動済みか不明な戦闘中バフ用の任意ON/OFFとは異なる。

### 最終ステータスと重複

`inputPolicy: "includedInFinalStats"` の候補は計算対象外で、最終値へ再加算されない。`finalStatsInclusion` は効果を通常時は有効にしつつ、利用者がその効果を入力済み最終値へ含めた場合だけ除外するための保存可能な申告である。旧トグルキーがfalseで新しい申告キーが未保存なら旧状態を維持して除外し、新しい申告falseは自動適用、trueは既算入として除外する。`support.status: "displayOnly"` または `review` も計算に入らない。これらはUID値の完全な由来分解やあらゆるボーナスの自動重複判定を意味しない。

`stacking` は `group` と `rule` (`add`, `max`, `replace`, `nonStacking`) を記録する。`multiply` は以前の評価処理で最大値採用となり、乗算と誤認される契約だったため、スキーマ・静的検証で拒否し、エンジンも該当効果を局所的に非適用として理由を記録する。複数件の場合 `add` は全件を残し、`replace` は配列順で最後を残し、`max` / `nonStacking` は値最大の1件だけを残す。groupなし・単独候補は処理しない。重複して装備された非重複効果が一つだけ計算に接続する個別テストはある。各カテゴリの加算、上限、排他はエンジン側の実処理とテストで個別に確認する。単一の汎用重複保証として説明しない。

保存は [`hsrCalcState.js`](../../../games/js/hsrCalcState.js) が `modifierInputs` をブラウザ保存データに含めて復元する。復元時は型とキーを検証する。提供者を外しても入力キーが保存に残る場合があるが、その提供者の候補が選択されなければ効果は適用されない。パーティ初期化時には、現行ビルドで使われないModifier入力キーを消去する処理がある。

## 原神CurrentCalcの参照（C: 別実装として確認）

参照実装は [`genshinCalcConditions.js`](../../../games/js/genshinCalcConditions.js) と [`genshinPartyModifiers.js`](../../../games/js/genshinPartyModifiers.js)。Genshin側は `condition`, `conditionGroupId`, `applyTo`, `reference`, `stack`, `effectGroupId` 等を含む既存のModifierと、`uiState`、条件カード、`GenshinCalcEngine.collectActiveModifiers()` / `buildEffectiveStats()` を使う。`automaticCondition()` は `always` と `constellationUnlocked` を自動条件として扱い、`dedupeKey()` はキャラ・ソース・効果・カテゴリ・対象を組み合わせる。`artifactConditionPolicy()` はUID反映済みの効果を `reflected`（無効）、常時効果を `automatic`、重撃・武器種条件を `derived` として装備・攻撃から判定する。層数条件の一部は入力を求め、それ以外は `userToggle` にする。これらはGenshin側の仕組みであり、HSRに同じpolicy APIがあることを意味しない。チーム対象の区分や提供者ステータスの局所評価もある。

このGenshinの形式・規則はHSRの契約ではない。HSRへ移植済みともみなさない。参考にできるのは自動条件の分類、提供者・受益者の区別、候補UIとエンジンの連携、局所的な参照評価といった設計上の考え方であり、具体的な接続はHSR側のスキーマ・実装・検証を根拠とする。

## 受入要求と現状の差

下記は完成時の受入要求。現行テストの存在だけで全効果への対応済みとは判定しない。

| 要求 | 現状判定 | 根拠・扱い |
|---|---|---|
| 所有・装備・編成・解放状態に基づく候補抽出と攻撃スコープ | A（基盤確認） | `sourceSelection`, `applicableToAttack`, `hsrApp.js` の攻撃別絞込み。データ網羅性・個別接続精度は別途検証。 |
| 常時効果と入力から確定できる閾値効果の自動適用 | A（限定確認）/ B（網羅性） | ロビン天賦を自動適用へ修正。`activation.statSource: "effective"` は、限定された独立・全体対象の会心率/速度/撃破特効/攻撃力補正を一度だけ反映する。タリア→鉄騎の固定依存を除く閾値出力・攻撃固有補正は除外し、自己循環や割合補正に必要な基礎値不明は対象閾値のみ停止する。全効果の自動区分は引き続き確認が必要。 |
| 発動済み状態・敵状態・スタックなど判断不能な状態のユーザー指定 | A（基盤確認） | toggle, toggleThreshold, stack等と条件UIがある。全効果・入力検証の網羅性は未完了。 |
| 最終ステータスの由来を識別し、重複を避ける | A（申告経路の限定実装）/ B（由来網羅） | `finalStatsInclusion` で申告時のみ除外し、未算入効果を自動適用できる。旧保存トグルのfalseは除外へ移行。UID最終値の由来網羅・自動判定は未対応。 |
| 同じ `stacking.group` 内の複数候補の選別 | A（限定実装）/ B（全groupの網羅） | `add` / `replace` / `max` / `nonStacking` を処理し、未対応の `multiply` は登録時と評価時に拒否する。groupの正しい付与と競合対象の整合性は個別検証が必要。 |
| 1攻撃内の複数成分をそれぞれ適切な対象規則で計算し合算 | B | 一部の成分・シーケンス経路は存在するが全攻撃データの完全性はこの文書の監査範囲外。攻撃・成分別の独立検証を続ける。 |
| 入力・条件の保存復元 | A（基盤確認） | `hsrCalcState.js` のcreate/save/restoreで状態を保存。提供者が消えた場合は候補選択で適用を防ぐ。 |
| 効果定義・実行経路・適用対象の説明可能性 | A（基盤確認） | データの出典・supportと候補のaudit情報を提供。根拠のない候補は `review` / `displayOnly` に留める。 |
| 攻撃一覧のためだけの不要な発動スイッチを要求しない | B | 完成要求。既存の一部攻撃や特殊条件では入力が攻撃行の成立条件と結びつくため、攻撃の列挙と任意効果状態を個別に分離する必要がある。 |

## 根拠ファイルと検証

- 契約: [`games/hsr/data/calc/modifier-contract.schema.json`](../../../games/hsr/data/calc/modifier-contract.schema.json)
- 登録・読込: [`games/hsr/data/calc/data-files.json`](../../../games/hsr/data/calc/data-files.json), [`games/js/hsrCalcData.js`](../../../games/js/hsrCalcData.js)
- 選択・評価: [`games/js/hsrModifierRuntime.js`](../../../games/js/hsrModifierRuntime.js)
- UIと計算接続: [`games/js/hsrApp.js`](../../../games/js/hsrApp.js)
- 保存: [`games/js/hsrCalcState.js`](../../../games/js/hsrCalcState.js)
- 契約・候補・個別適用テスト: [`tests/hsr/hsrModifierContract.test.cjs`](../../../tests/hsr/hsrModifierContract.test.cjs), [`tests/hsr/hsrModifierValidation.test.cjs`](../../../tests/hsr/hsrModifierValidation.test.cjs), [`tests/hsr/hsrModifierRuntime.test.cjs`](../../../tests/hsr/hsrModifierRuntime.test.cjs), [`tests/hsr/hsrModifierEvaluation.test.cjs`](../../../tests/hsr/hsrModifierEvaluation.test.cjs), [`tests/hsr/hsrSupportEquipmentBatch.test.cjs`](../../../tests/hsr/hsrSupportEquipmentBatch.test.cjs), [`tests/hsr/hsrBreakDamageBonus.test.cjs`](../../../tests/hsr/hsrBreakDamageBonus.test.cjs), [`tests/hsr/hsrToolInputs.test.cjs`](../../../tests/hsr/hsrToolInputs.test.cjs)

データ契約検査は [`validateHsrModifiers.cjs`](../../../scripts/validateHsrModifiers.cjs)、カバレッジ監査は [`auditHsrCoverage.cjs`](../../../scripts/auditHsrCoverage.cjs)。通過は形式や登録根拠の確認であり、全計算式の独立正解を証明しない。計算精度は攻撃種・対象成分ごとの独立期待値テストで確認する。`stacking` の宣言だけで動作を承認せず、実際のエンジン適用経路を確認する。

## 旧草案からの訂正

- **C**: トップレベルの `identity`, `availability`, `controls`, `reference`, `targets`, `operation`, `valueRule`, `stackRule`, `inclusion`, `evidence` は旧草案の概念フィールドであり、HSRの実在スキーマとして記載しない。実在契約へ差し替えた。`value.reference` や `calculation.operation` のように別の階層には実在する名前もあり、同名フィールドを一律に禁止する意味ではない。
- **C**: 発動モードを `always / derived / manual` とするenumは存在しない。実在値は `always / toggle / toggleThreshold / stack / statThreshold / numericThreshold`。各モードの現行挙動を明記した。
- **C**: 全対象で成分ID単位のフィルタがあるとの記述は誤り。スキーマには `attackIds` があるが、汎用のcomponent ID対象フィールドは確認できない。成分対応は攻撃データと計算経路ごとに検証する。
- **C**: 汎用の循環依存検出、完全な重複正規化、条件説明の保存形式は確認できないため、現行機能としての評価順・保証から外した。
- **B**: 最終ステータス二重加算防止を全効果の自動機能とせず、既算入申告による除外・旧保存値移行と、残るUID最終値の由来管理課題を分けた。
- **C**: Genshinの既存フィールドやAPIをHSRの実装方式として提示していた点を修正し、参照専用の比較に限定した。




差分の進捗は [残作業台帳の仕様照合欄](../../HSR_COMPLETION_WORKLOAD.md#仕様書照合で確認した実装差分2026-10-28) が管理元。

### 共通処理再利用時の適用範囲

敵の状態による攻撃時CR（廃土客など）を、全体パネルCRの支援としてeffective閾値へ寄与させない。現在の廃土客CRはenemy.debuffCountのstatThresholdで自動判定し、独立補正の一段評価元（always/toggle/stack）へ含めない。新しい依存順や再帰評価は追加しない。

補正モーダルでは、選択中の装備にeffective速度閾値がある場合、SPD補正を「速度条件の判定（各攻撃へ間接反映）」と表示する。これは直接ダメージへのSPD加算やエンジンapplied件数への追加ではない。finalStatsInclusionは任意発動効果にも使用でき、未算入時はその発動条件に従う。算入済み指定だけで未発動の効果を成立させない。

### 数値比較・特定属性弱点の局所参照

`activation.thresholdReference: "self.hpPercent"` は `statThreshold` / `reference: "enemy.hpPercent"` の比較右辺としてのみ対応する。敵・本人の割合が有限の0～100である場合にだけ判定し、未入力や不正値を成立値へ置き換えない。通常の固定threshold契約と独立ステータスの一段評価は維持し、汎用の参照間依存・再帰評価には拡張しない。[光円錐定義](../../../games/hsr/data/calc/modifiers-equipment-round2.json)の秘密の誓いで使用する。

`reference: "enemy.quantumWeakness"` は天才の量子弱点追加DEF無視に使用する。計算対象キャラが量子なら、通常の敵弱点入力から自動取得する。他属性なら同じ入力から量子弱点を推定せず、登録inputKeyの任意チェックを表示する。Runtimeの返却activation.modeは前者statThreshold、後者toggleとなり、既存の条件UIを使用する。確定した敵の量子弱点は攻撃の全属性成分へ共有し、成分の属性を理由に別属性の弱点入力を流用しない。

### 現在割合の未確定とBEの限定評価

`self.hpPercent` / `enemy.hpPercent` / `self.epPercent` は有限の0～100だけを既知値として扱う。HP/EP条件の不足は実行時候補の `activation.unresolved` として表示し、当該候補を追加せず他の計算は継続する。このフラグは保存する登録データの新フィールドではない。最終値算入済みを宣言した候補は追加せず、参照不足の追加を要求しない。HP条件は既存の本人/敵HP割合入力へ移動するボタン、EPは既存の数値入力を再利用する。

bounded effective評価の対象参照はCR/SPD/BE/ATK/HP/CD（CDは第9回の限定追加）。BEは独立した `breakEffect` 加算等から取り、閾値由来の補正・参照自身を変える閾値は原則入力へ戻さない。タリア→鉄騎のみ末尾の固定依存として扱う。鉄騎はBE150%以上で撃破/超撃破のDEF無視10%、250%以上で超撃破に追加15%（合計25%）となる。時計屋等の支援解除・既算入指定で再評価する。隠者128の複数装備者時の重複可否は未確定のため、Appが当該候補だけ未確定として除外する。汎用の重複規則として推定しない。

### 既知の敵防御低下と固定能力の参照不足

名匠132の既存CD条件はAppで局所的に補完する。敵入力の防御ダウン、または有効・対象内の `defenseReduction` 候補から判断できる場合は自動適用し、不要なトグルを表示しない。モーダル全体の表示では全攻撃対象の候補だけを自動判定元に含め、攻撃別計算ではその攻撃への適用可否も確認する。判断できない成立状態には既存トグルを残す。「助燃」の発動は別の状態指定であり、DEF低下があるだけで自動発動させない。閾値出力の再帰評価や汎用の状態遷移は導入しない。

丹恒・騰荒A2は固定追加能力のため、providerStatPercentByLevelの値配列1件を使い、無関係なスキルLvを要求しない。提供者ATKの妥当性はAppの `validateProvider()` が当該IDに限定して検査し、欠損/0は当該候補だけ `activation.unresolved` で除外する。Runtimeの値解決だけを、参照入力の検証まで完了したものとは扱わない。

### ランク別参照層と入場条件

`value.kind: "perReferenceStack"` は固定 `perStack`、または光円錐に限定した5件の `values` のどちらか一方を持つ。後者は装備者の重畳で1層量を選び、参照層数を上限へ制限して掛ける。両形式の併記・不正な5件配列・非光円錐への配列流用は登録検証で拒否する。固定値の既存定義は変更しない。

`self.preCombatSpeed` は共有 `pre-combat-speed` 入力を参照する。数値未指定を通常SPDや0で置き換えず、詩人/卜者のnumericThresholdだけ未確定として除外する。効果の成立は入力値から判定し、別の発動トグルは要求しない。タリアは戦闘中のeffective SPDで判定し、両者を混ぜない。

タリア307のBEだけは、確認済みの非循環依存としてeffective SPD評価後に鉄騎119へ渡す。タリアが未発動/既算入なら追加せず、他の自己ステータス閾値出力は合流させない。自己参照を変える閾値や未対応の依存は既存の局所除外を維持する。21044は132と同じ既知DEF低下の局所判定を再利用し、未確定の減速/DEF低下だけ任意指定する。21053はバリア受益者への支援であり、複数同LC提供者の重複は未確認のためAppで当該候補だけ未確定にする。

### 明示した提供者の参照（第6回）

実在する参照は `provider.speed` / `provider.effectRes` / `provider.breakEffect` / `provider.sameElement` / `provider.firstSlotRecipient`。`buildRawCandidates()` が各レコードのsource selection後に選択提供者IDを束縛し、本人ならstats、他人ならpartyStatsを参照する。属性はcharacterElement/partyElements、編成位置はpartyOrderを使う。入力欠損・不正な重複ID・必要な編成位置不明はNaN→activation.unresolvedとなり、当該効果だけを除外する。入力済み0と未入力は区別する。

仙舟302のSPDは計算対象が装備者本人なら既存のbounded effective評価、他人の装備なら編成で明示した提供者の判定値を使う。他人のSPDへ現在の計算対象の支援を足さない。`target.excludeSelf` はオーナメントの本人選択にも適用する。同セット302/310/312/317の複数提供者、およびLC23061/23062の複数提供者は勝者/重複仕様を推定せずRuntimeで当該支援のみ未確定にする（LC23061の本人スキル補正は別）。単一提供者は計算可能。

帰忘の流離人の追加BEは提供者の明示済みBEだけを参照し、受益者本人へ返さない。従って解決済みの追加分を独立BE支援として既存の有効BE閾値へ渡せる。タリアの限定した二段依存とは別で、全Modifierの再帰評価は行わない。固定追加能力の層数検証に技能Lvを要求せず、技能Lv検証はsource.skillId/value.levelInputKeyを持つものに限定する。0層なら共有追加分の参照値不足を要求しない。Schema/静的検証器は上記の実在参照へ同期する。

### 開始時スナップショットと編成人数（第7回）

実装参照は `self.preCombatCritDamage`→`pre-combat-crit-damage`、`self.preCombatMaxEnergy`→`pre-combat-max-energy`、`self.maxEnergy`→`current-max-energy`、`party.fieldCount`→`ally-target-count`。CDは有限0～99999の小数、最大EP/場の人数は1～99999の整数として明示入力する。未入力・不正値はNaNとし、numericThreshold/statThreshold/toggleThresholdで共通に未確定表示・当該補正だけの除外へ接続する。初回攻撃状態がOFFなら無関係な開始時CDを必須にしない。

`party.samePathAllyCount` と `party.nihilityAllyCount` は合法な重複なしの編成と既知のpartyPathsから本人以外を数える。後者の固定版の虚無path IDはWarlock。未知path/重複IDを0人と推定しない。黄泉の奈落は1人で独立+15%、2人以上で+60%（本来の1.15/1.6倍）とし、通常の与ダメージ加算へ混ぜない。受入はLv80・E0・追加能力解放済みの単発条件で、全育成段階の解放自動判定を完成扱いにしない。

`self.speedAbove100Steps` は有効SPDからfloor(max(SPD-100,0)/10)を導く。夜の帳の6層上限は既存perReferenceStackのmaximumで処理する。既存の有効値一段評価へHPも限定追加し、静謐な拾骨地のHP→CD条件は独立HP支援後に判定する。自己HPを変えるHP閾値は依然再帰評価しない。最大HP欠損/0はこの補正だけ未確定。共有stackキーはカードをまたいでも1欄だけ表示し、各成分の算入済み申告は個別に維持する。providerScopeは既存のself/partyまたは省略のみとし、架空のbothは静的検証で拒否する。

LC21015の陥落も、同じLCを持つ提供者が複数いる場合は採用ランク/付与履歴を推定せず、既存の複数提供者ガードで当該DEF低下だけを未確定とする。単一提供者の指定済み陥落は計算可能。


## 第8回追加：状態依存と編成人数（A）

`activation.requiredToggleKey`は任意の共有真偽入力キー。指定した入力が明示的にtrueでない場合、その効果だけを無効にする。現在の利用は鏡流HP版月光の転魄状態依存で、保存された層数が残っていても転魄OFFで適用しない。Schema・静的検証・Runtimeに同期済み。全Modifierの依存解決や再帰評価を導入するものではない。

`party.eruditionCount`は計算対象と編成の重複しない最大4人から、固定catalogの運命Mageを数える。人数は受益者自身の運命と無関係。未知の運命/重複IDは当該条件だけを未確定とする。ヘルタ1401102の味方CDと140104の追加倍率は2人以上で自動適用する。編成を戦闘開始時編成として扱う限定仕様で、入場後の自動編成履歴は追跡しない。

同じ状態キーのトグルは成分・能力カードをまたいでもモーダルに1欄だけ表示する。LC23016/23017の同系複数提供者は未確認の合成をせず該当支援だけ局所除外し、単一提供者の全Sランクは計算する。現在有効な敵従順・治癒対象の層数を指定し、未発動の支援を編成だけで有効にしない。恒常propertiesと追加成分の既算入責務は従来どおり。[第8回受入](../../HSR_COMPLETION_WORKLOAD.md)を参照。


## 第9回追加：CDと指定解読・有限の閾値依存

`self.critDamageAbove120Steps`は有効CDから `floor(max(CD-120,0)/20)` を導く。LC23028の `perReferenceStack` のmaximum=4で制限する。`buildCandidates()` の独立加算元へCDを限定追加し、固定/層数補正、ヘルタの既知の `party.eruditionCount`、別提供者の `providerStatPercentByLevel` CD支援を取り込む。対象攻撃限定・自己CDを変えるCD閾値等は一律に戻さない。CD未入力は該当候補だけ未確定。算入済みの支援を足し直さない。

LC23027は `statThreshold` / `self.breakEffect` / `statSource: effective` でBE150%以上を判定し、基礎SPD割合を追加する。固定依存は、独立BEと既に成立するタリア→LCのSPD→SPD閾値→タリア→鉄騎。LCのSPDを必要とするタリアBEでLCを成立させるフィードバックは行わない。相互依存だけで成立し得る場合はLCだけを条件未確定とし、他の補正を継続する。LCが最終SPDへ算入済みなら追加分を戻さず、入力済みSPDを他の閾値が使う。汎用の再帰評価ではない。

`self.interpretation`は登録の `activation.inputKey` へ明示した0～42整数だけを参照し、未指定/不正値はNaNとする。ヘルタA2は使用時点解読の `numericThreshold`、最後撃の倍率は最後撃解読の `perStackByLevel`。編成人数で成立する二つ目の倍率は同じ最後撃値を `value.inputKey` から読む。明示した `value.inputKey` とinputValidationで値不足なら、有効な該当候補のみ未確定とする。使用時点と最後撃の値を勝手に同一視せず、共有する最後撃入力はモーダルへ1欄だけ表示する。

LC23056/23058/23059/23063は、同じLCの複数提供者時に未確認の合成をせず当該支援だけ局所除外する。本人専用の別成分は独立して計算可能。霊砂E2/E6は提供者星魂と既存の任意状態入力で登録し、装備/提供者解除・最終値算入済み除外は既存契約を使う。実在形式は[優先LC](../../../games/hsr/data/calc/modifiers-equipment-round9.json)、[追加LC](../../../games/hsr/data/calc/modifiers-equipment-extra-round9.json)、[星魂](../../../games/hsr/data/calc/modifiers-native-round9.json)。


## 第10回追加：攻撃内の指定回数と既発動支援

素裳の追加剣勢回数は数値Modifierとしてダメージへ加算せず、既存の`hitCountInputKey`/`requiresValidHitCount`で0～2整数を攻撃へ渡す。未入力のdefaultは持たない。Appの`attackHitCountInput()`は1206031の敵が既に撃破済みの場合だけ2回を自動採用し、未撃破時の保存値を変更しない。逐寇は単発ではダメージ判定時の有効層、複数成分では事前10層の飽和状態に限定する。素裳/Mishaの既存補正にも`finalStatsInclusion`を適用し、入力値に含むATK/SPD/剣勢DMG/CDを再加算しない。

LC23014のDEF無視は共有`eclipse-stacks`の`numericThreshold>=3`から自動判定し、別トグルを要求しない。LC23022は同じ有効DoT種類数からATKとDoT限定DEF無視を評価し、敵の総デバフ数を代用しない。LC23039の実HP消費状態は現在HP割合と別で、追加500超状態は基礎状態を`requiredToggleKey`で要求する。既存形式を再利用し、新しい評価方式は追加しない。

寒鴉の懲悪は受益者に攻撃前から有効な状態のtoggleで、天賦Lvと提供者E6を区別する。録事ATKとの加算区分も別。初回付与攻撃や経過ターンは自動評価しない。[定義と受入](06_CHARACTER_EQUIPMENT_SPEC.md)から個別ファイルへ辿る。

## 第11回追加：提供者SPDと撃破状態

`enemy.toughnessBroken`は既存の`enemy.toughnessActive`が明示booleanの場合だけ逆値の0/1を返す。未知ならNaNとし、該当候補だけ未確定。霊砂E1はこの参照の`statThreshold >= 1`で敵DEF-20%を自動評価する。Schema/静的検証/Appの表示名も同期し、任意トグルを追加しない。

寒鴉必殺は既存`providerStatPercentByLevel`の提供者speedを`statFlat`として受益者へ加算する。共有`hanya-ultimate-active`と個別`finalStatsInclusion`を使い、発動時SPDは編成入力へユーザーが指定する。既存のモーダル欄は編成/ステータスの同じ値と同期するため、別の履歴値ではない。未入力ならAppがSPD成分だけを未確定にし、ATK成分は継続する。

`buildCandidates()`の有限な有効値一段評価へ、別提供者の`providerStatPercentByLevel`・`statFlat speed`だけを追加し、グラモス等の閾値に反映する。自己参照SPDや全Modifier再帰評価へ拡張しない。既算入の速度を戻して足し直さない。

LC23045の最大EP300条件は既存`current-max-energy`の数値閾値と必殺後`requiredToggleKey`を共に要求する。未指定EPを仮定しない。23054/21050/22007/24006の同LC複数提供者合成が未確認なら当該支援だけを局所除外する。事前敵デバフと攻撃ごとの想定状態も既存形式を使用し、状態保存は`modifierInputs`を維持する。[定義と受入](06_CHARACTER_EQUIPMENT_SPEC.md)を参照。

## 第12回追加：既存形式の再利用と参照時点

ファイノンの形態ATK/HPは共有toggle、A6は現在成立した1～2層を既存stack入力で指定する。入場/変身終了の履歴から層を推定しない。形態攻撃の想定ONは各結果だけへ与え、保存全体値を上書きしない。既算入なら再加算せず、Phainonの必須補正照合も`includedInFinalStats`を受理する。全Modifierの依存/時間更新は導入しない。

サフェルA4の速度140/170によるCRは既存thresholdと有効SPD一段評価を使用し、高い段階だけを採用する。FUA CD100%はFUA限定、戦場にいる時の敵被DMG40%は常時。スキルATK30%は事前有効な状態のtoggleで、最終入力の算入済み除外を個別に持つ。セイレンスA6のEHR→DMGも既存条件式を使用する。

ダリア結界のbreakEfficiencyは既発動toggleで、基礎削靭入力を効率補正前と定義する。LC23008/23047/23041の同系複数提供者は未確認の合成を行わず、その支援だけを未確定にする。装備者由来の魂迷層を総敵デバフ数で代用しない。追加形式の正本は[定義参照](06_CHARACTER_EQUIPMENT_SPEC.md)、意味群/成分の集計は台帳。


## 第13回追加：別所有者連携と既存入力の再利用

`category: extraDamage`に併記する`supplementalAttack`の既存`selectedParty`参照をセイバーの風連携へ接続。`ownerInputKey`は既存の参照者選択キー、`requiredStatReferenceId`は今回の特定所有者制限で、Schema/静的検証も両方を許可する。対象が編成内にいなければ候補を抽出せず、参照者のLv80/E0・最終ATK/CR/CD/属性DMG/DEF無視/RES貫通・対象属性耐性が揃わなければその成分だけ停止する。`triggerActor: unspecified`は、8回へ到達させた直前攻撃者を推定しない意味。提供者/軌跡所有者はギルガメッシュ、ダメージ/ステータス所有者はセイバーである。

Appは完成済み参照者の`character`/`enemy`を計算入力へ保持し、提供者本人のステータス・自己バフを再加算しない。敵側補正は別区分。連携の想定攻撃を表示するためのトグルは作らず、編成から自動抽出する。元の雷成分も表示専用の発動チェックを外し、別結果として維持する。雷/風を任意に自動合算しない。

LC23011はHP減少後の有効支援を任意指定。LC23029の甲卸/窮寇は同じ`stacking.group`の`max`で、窮寇は追加分だけでなく合計値を登録し、同時ONでも二重加算しない。LC23032は忘憂の事前成立を指定し、装備者のBE150%以上だけ追加成分を自動判定する。受益者のBEで代用せず、参照値が欠けても基礎の忘憂は継続する。同LC複数提供者は当該支援だけ未確定。恒常propertiesと各最終算入指定は従来どおり。

質草は既存のスタック入力を再利用し、新しい数値欄を重複表示しない。セイレンスの解決済みDoT4値と結界回数だけは、既存の攻撃用`numericModifierInputs`で別の参照時点値を保存する。A4を再利用可能な加算Modifierとして重複登録しない。

ジェイドのスキルSPDは、計算対象の味方が債権回収者である任意状態を既存キーで指定し、本人を除いて固定+30を適用する。最終速度への既算入・提供者解除を尊重し、支援後SPDを既存グラモス閾値へ渡す。付加ダメージ行1314021は成立した単発の想定値として常時一覧へ出し、表示専用チェックを要求しない。
