# ⑤ 技術設計書 — 現行実装と要求仕様

- 監査基準: `dc6a6b184338d8ff299855c90c71766d284c3604` の作業ツリー
- 対象: 静的なHSR計算ページのUID取込、状態、データ、Modifier、計算、表示の経路
- 判定: **A** = 要求に沿う実装を確認、**B** = 正しい要求だが未実装/部分実装、**C** = 初稿の誤り・根拠なしを訂正、**D** = リポジトリ根拠で確定できない

この文書はコードの責務を説明する。完成目標は要求仕様書が正本であり、現行実装の不足を理由に引き下げない。現行関数の挙動を、そのまま将来仕様とはみなさない。

## 1. 実際のデータフロー

```text
UID入力
  -> games/js/hsrUidImporter.js
  -> games/js/hsrProfileApi.js
  -> /games/api/hsr-profile (worker.js) -> Enka.Network
  -> games/js/hsrProfileMapper.js
  -> UIDキャラクター選択・反映 (hsrApp.js)

games/hsr/index.html
  -> HsrCalcData.load()
       catalog.json + attacks.json/generated + data-files.json配下のoverride/modifier
  -> hsrApp.jsの入力状態・敵/編成・補正候補
  -> HsrModifierRuntime.buildCandidates()/applicableToAttack()
  -> HsrCalcEngine.calculate() と個別のbreak計算
  -> renderResults() / 結果・未対応理由

入力変更 -> saveInputs() -> HsrCalcState.create()/save() (localStorage)
再読込 -> HsrCalcState.load()/restore() -> restoreInputs() -> 入力状態
```

この図は確認した実経路。手動入力は `games/hsr/index.html` のフォームと `hsrApp.js` の `state` から入る。戦闘ローテーションを再現する経路ではない。

## 2. モジュール対応表

| 実パス | 実在する入口・関数 | 実際に担う処理 | 判定 |
|---|---|---|---|
| `worker.js` | `fetchHsrProfile()` | 8～10桁UIDを検査しEnka HSR endpointへ転送。成功時はTTLを使い `_tetinetProvider` を付ける | A: UID中継を確認 |
| `games/js/hsrProfileApi.js` | `fetchHsrProfile()`, `fetchFromSameOriginProxy()` | 同一オリジンproxyを優先し、proxyが404またはTypeErrorの場合にEnkaへ直接要求（その他の非成功応答はエラー） | A |
| `games/js/hsrUidImporter.js` | 検索処理、`renderSelector()`, `renderSummary()`, `renderUidDetails()` | UID入力検査、取得表示、公開キャラ選択、詳細表示、反映操作 | A |
| `games/js/hsrProfileMapper.js` | `mapProfileResponse()`, `mapCharacter()`, `mapTraces()`, `mapRelicSets()`, `calculateStats()` | Enka応答をカタログとID照合し、キャラ・装備・軌跡・ステータス表示用オブジェクトへ変換 | A: 反映可能項目に限る。全Lvの基礎値を復元するものではない |
| `games/js/hsrCalcData.js` | `HsrCalcData.load()`, `resetCache()` | カタログ、攻撃manifest、生成攻撃、override、構造化Modifier群を読み込み、同ID overrideを統合 | A |
| `games/js/hsrCalcState.js` | `create()`, `restore()`, `load()`, `save()`, `clear()` | 現行入力契約の保存・検証付き復元・削除。schemaVersion 1 | A |
| `games/js/hsrModifierRuntime.js` | `buildCandidates()`, `activationState()`, `applicableToAttack()`, `sourceSelection()` | 出典選択、候補の展開、入力/activation判定、攻撃種別・属性・IDへの対象判定 | A: 実装された定義範囲。全効果の網羅はB |
| `games/js/hsrApp.js` | `structuredModifierContext()`, `modifiers()`, `calculate()`, `renderResults()`, `applyProfileCharacter()` | UI状態、UID値のフォーム反映、敵/パーティ/条件、計算要求組立、結果/警告表示 | A: 現行画面経路 |
| `games/js/hsrCalcEngine.js` | `calculate()`, `calculateComponentSequence()`, `calculateBreak()`, `calculateAdditionalBreak()`, `calculateSuperBreak()` | 単一攻撃/成分列、撃破・追加撃破・超撃破等の対応式と対応範囲検査 | A: 登録・検証範囲のみ。完全な攻撃種網羅はB |
| `scripts/reportHsrCompletion.cjs` | CLIレポート生成 | `docs/HSR_CHARACTER_COMPLETION.md` の生成 | A: 出力ファイルを手編集しない |

初稿の「UIDアダプター」「攻撃候補列挙」等の仮想層は実在するファイル名・APIではない。上表の実処理名に置き換えた (**C**)。「攻撃候補列挙」専用のエンジン層は確認できない。攻撃候補は読込済みデータを `hsrApp.js` が選択キャラ・条件で絞り込み、エンジンへ渡す。

保存キーは `tetinet:hsr:calculation:v1`、形状は `{schemaVersion:1, game:"hsr", state, modifierInputs, conditions, fields}`。`state` は許可された入力項目のみ。`create` は結果・生UID応答・プロフィール一覧を含めず、再読込時は入力を復元して再計算する。成功したUIDの記憶はこれとは別経路である。

### 補正評価の限定的な拡張

`HsrModifierRuntime.buildCandidates` は `buildRawCandidates` の一次候補から、入力元が独立した全般的なステータス補正だけを集め、`activation.statSource: "effective"` を宣言した会心率/速度/撃破特効/攻撃力閾値へ一段で渡す。Appの `modifiers(attack)` は攻撃の文脈と `validateProvider` を渡し、提供者Lv不足等を検証する。タリア→鉄騎の固定依存を除いて閾値出力を再度入力へ戻さず、変換・攻撃限定会心・参照自身を変更する効果はこの評価へ混ぜない。参照値/基礎値が不明なら当該候補だけを未確定とする。

`finalStatsInclusion` は常時効果の発動状態ではなく、最終入力へ算入済みかのユーザー宣言。ロビン天賦は自動適用し、算入済みなら追加しない。旧保存キーの明示OFFは除外を保ち、新しい算入済みキーを指定すれば優先する。保存スキーマの版は変更せず、既存のmodifierInputsへ保存する。算入由来を推測する汎用エンジンは導入していない。

## 3. データ定義の実際

- `games/hsr/data/catalog.json` は表示・詳細情報等を含む静的カタログ。収録数や全スキル説明の存在は、全効果が計算されることを意味しない。
- `games/hsr/data/attacks.json` は生成攻撃ファイルとoverrideのmanifest。生成元は `scripts/generateHsrAttacks.cjs`、出力 `games/hsr/data/attacks.generated.json`。overrideの実行時一覧は `games/hsr/data/calc/data-files.json` が指定する。
- `games/hsr/data/calc/data-files.json` は攻撃overrideと構造化Modifierファイルの実際の読込一覧。`games/js/hsrCalcData.js` が取得して集約する。
- `games/hsr/data/calc/attack-contract.schema.json` と `modifier-contract.schema.json` は形状契約。生産定義は各JSON。表示文の解析を計算効果の根拠にはしない。
- ローダーはこのほか `games/hsr/data/modifiers.json`、`games/hsr/data/trace-level-map.json`、`games/hsr/data/calc/special-break-attacks.json` を読む。返り値の `modifiers` と `structuredModifiers` は別で、現在のApp `sourceConditions` は後者の候補を使う。`breakBaseDamage` はローダーでLv80値だけを有効化する。
- `coverage-report.json` 等は監査用生成物で、進捗の正本は管理資料に従う。

## 4. 実装と要求の差

| 要求 | 判定 | 確認事項 |
|---|---|---|
| UIDまたは手動でキャラを設定する | A | UID反映と手入力フォームが存在 |
| UID取得項目を可能な範囲で反映し、手修正できる | B | Lv80基礎HP/ATK/DEF等を再構成する経路と編集状態がある。`calculateStats()` は基礎HP/ATK/DEFのLv80以外を未設定とする。全UID項目の計算入力化は未完 |
| 攻撃候補を発動スイッチなしに表示し、登録成分を計算する | B | manifest/overrideとengine経路がある。全キャラ・全攻撃・全条件の登録/検証は未完 |
| 常時/入力から判定できる条件を自動適用し、任意条件を選ぶ | B | `activationState()` と候補UIは存在するが、未登録効果の候補化・条件分類を含む全効果適用は未完 |
| 編成・装備から効果を抽出し、対象攻撃だけに反映する | B | `sourceSelection()`、`buildCandidates()`、`applicableToAttack()` を確認。データ登録の網羅と個々の対象正確性は管理資料・検証単位で扱う |
| UID最終値と効果の二重加算を防ぐ | B | `inputPolicy` とUID再構成経路はある。全UID入力・全Modifierについて完了したとは確認できない |
| 複数ヒット/成分の合算と攻撃別結果 | B | `componentSequence` 経路、break系列、結果表示がある。完成目標の全攻撃範囲は未達 |
| 1ラウンド自動戦闘・ローテーション | 対象外 | 完成目標に含まれない。`actionSummary()` は行動値の簡易表示で、戦闘再現ではない |

現状の完成範囲・検証済み攻撃・残件は [主要攻撃の対応範囲](../../HSR_MAIN_ATTACK_SCOPE.md)、登録監査は [完成管理表](../../HSR_CHARACTER_COMPLETION.md)、効果単位の継続受入は [残作業測定](../../HSR_COMPLETION_WORKLOAD.md) を参照する。この文書に件数を複製しない。

## 5. 固定データと参照元

StarRailRes固定参照・実行時データの適用範囲は [`HSR_CALC_DATA_SOURCES.md`](../../HSR_CALC_DATA_SOURCES.md) と [`games/hsr/data/calc/README.md`](../../../games/hsr/data/calc/README.md) を参照する。データ定義の追加では固定版ID・数値・効果条件・provenanceを登録し、適切な独立検証を追加する。集計資料の生成元は `scripts/reportHsrCompletion.cjs`。生成管理表を直接編集しない。

## 6. 原神CurrentCalcの参照

原神CurrentCalcはModifier UI/条件/提供者の候補化を調べる参考実装であり、スタレコードの正本・計算式根拠ではない。スタレの実経路は上記 `HsrModifierRuntime` と `hsrCalcEngine`。具体的な原神参照ファイル・関数と比較結果は④Modifier仕様書に記録する。原神側ファイルは参照専用で、この変更では触れない。

## 7. 未確定事項 (D)

- Enka公開プロフィールが返さない非公開ビルド状態や戦闘中一時効果を、UIDから取得できるとは扱わない。個々の提供項目の網羅的な将来保証はない。
- サイト全体の任意ブラウザ/ネットワーク条件での直接Enka fallback可用性はコードだけでは保証できない。
- 本書にない計算成分やプロバイダー仕様は、対応データと独立検証を確認するまで未確定とする。

光円錐の条件評価では、`hsrApp.validateProvider()` が既知の装備者/光円錐pathの不一致を確認する。選択画面の絞込みに加え、復元/取込状態の不適格な装備から効果を適用しない。マスターに存在しないpathを推測で補完しない。数値比較と量子弱点の局所参照は [04](04_MODIFIER_SPEC.md) の契約を使用し、ダメージエンジンの演算式は変えない。

### 未指定割合と局所的な提供者制限

Appの `readHpRatio()` は既存の本人/敵HP割合入力を読み、空値・範囲外をNaNで保持する。初期値も未指定。NaNは保存JSONでnullとなり、復元後も空欄へ戻す。UID反映は現在HPを生成しない。Runtimeの `referenceValue()` / `activationState()` はHP/EPの欠損を成立数値へ変換せず、候補の `activation.unresolved` として返す。Appは条件未確定表示とHP入力欄への移動を提供し、その候補だけ除外する。

隠者128の4セット装備者が複数いる場合は、Appの提供者検証でその支援候補だけを未確定にする。単一提供者のバリア所持状態は既存トグルで指定し、バリアの生成・耐久・消失をシミュレーションしない。保存スキーマ・計算エンジンの責務は変更しない。

第4回の既存経路への追加では、Appの `structuredSourceConditions()` が名匠132のCD条件を既知の敵DEF低下/適用可能な補正から局所判定する。`validateProvider()` は丹恒・騰荒A2の参照ATK不足だけを未確定として除外し、固定能力に不要な技能Lvを追加しない。定義の新規ファイルは既存manifestから読み、攻撃は[attacks-round4.json](../../../games/hsr/data/calc/attacks-round4.json)のoverrideで既存参考行を置換する。ローダー・状態スキーマ・計算エンジン・マスター生成方式は変更しない。

第5回の限定変更は `hsrModifierRuntime.referenceValue()` の戦闘前SPD参照、`resolveValue()` のLCランク別参照層、`buildCandidates()` の独立ATK一段参照とタリア→鉄騎の固定依存。Schema/静的検証器も同じ形状へ同期する。AppのUID反映は取得済みSPDだけを共有入力へ設定し、未取得時は旧値を削除する。数値条件の表示は未入力と速度単位を区別する。`validateProvider()` は21053の複数提供者を局所除外する。保存スキーマ・計算エンジン・マスター生成方式は変更しない。

第6回は同じmanifestへ[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round6.json)、[オーナメント](../../../games/hsr/data/calc/modifiers-sets-round6.json)、[追加能力](../../../games/hsr/data/calc/modifiers-native-round6.json)、[攻撃override](../../../games/hsr/data/calc/attacks-round6.json)を追加する。AppのstructuredModifierContext()がpartyElements/partyOrderと提供者SPD/効果抵抗/BEを渡し、RuntimeがsourceSelection後の提供者を各条件へ束縛する。オーナメントのexcludeSelfと重複提供者の局所除外はRuntime、装備運命の既存検証はAppに属する。提供者以外のステータスを更新する依存グラフは作らない。保存は既存hsrCalcStateのテンプレートマージを使い、追加フィールドのNaNはnullから未入力として復元する。ダメージエンジン・保存スキーマ・マスター生成方式は変更しない。

第7回の実体はmanifestの[光円錐](../../../games/hsr/data/calc/modifiers-equipment-round7.json)、[オーナメント](../../../games/hsr/data/calc/modifiers-sets-round7.json)、[キャラ効果](../../../games/hsr/data/calc/modifiers-native-round7.json)、[攻撃override](../../../games/hsr/data/calc/attacks-round7.json)。Runtime.referenceValue()へ明示スナップショット/同運命/他虚無数/速度段数を追加し、既存のvalue kindで計算する。buildCandidates()は独立HP支援からCD閾値への一段評価を許し、HP欠損を局所除外する。Appは既存モーダルの数値欄を使い、開始時と現在のラベル・共有層数の重複排除を行う。データローダー、ダメージ式、保存スキーマ、マスター生成方式は変更しない。


## 第8回追加：既存の複合攻撃経路への接続（A）

`data-files.json`のround8 override/modifier群も従来のローダーで統合する。`hsrApp.js`の`resolvedAttack`は130803/140109について、登録された`damageComponents`から各子のレベル・倍率・種別・属性を構築し、`sequenceComponents`へ各成分専用Modifierを渡す。表示だけの発動チェックは追加しない。計算は既存`calculateComponentSequence`から局所的な`calculateAcheronSnapshot`/`calculateHertaSnapshot`へ分岐し、既知の構成数/成分ID/倍率/同一人物・敵スナップショットを検査する。通常式の`calculate`を各子に適用し、既存`combineDamageComponents`で合算する。これは任意の戦闘シーケンスを解釈する汎用エンジンではない。

成分内訳も既存の表示経路を再利用し、各子を1ヒットと表示する。保存は既存`modifierInputs`と`HsrCalcState`で、別の保存形式は増やさない。`party.eruditionCount`と`requiredToggleKey`の契約は[Modifier仕様](04_MODIFIER_SPEC.md)へ記録する。
