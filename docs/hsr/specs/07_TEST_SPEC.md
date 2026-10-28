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
