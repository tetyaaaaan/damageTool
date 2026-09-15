# 原神データ構造監査と v2 移行方針（2026-08-15）

2026-09-10追補: 本文の件数・review方式・残課題は監査当時の履歴。現在の作成判断は[原神v2データ作成標準](GENSHIN_V2_DATA_AUTHORING_STANDARD.md)、受入は[r2 goal](genshin-goals/2026-08-28-realignment/revised-goal.md)、運用は[実行補足](genshin-goals/2026-08-28-realignment/execution-addendum-2026-09-06.md)を参照する。Rawの証拠はSourceRecord/固定artifact、意味の正本はSpec、計算用はgate通過後の生成Runtime。EffectSpecで完結する情報を無理に分割せず、不可分なBehaviorとの結合は明示的に保証する。後述のhuman reviewer必須という旧説明は現在のhuman/deterministicConsensus分離へ更新されている。

## 結論

現行の用途別JSONは直ちにキャラクター単位へ物理分割しない。Raw、Spec、Runtimeをそれぞれ一つの正本として維持し、`data-v2-manifest.json` と `characters/<id>.json` は各層への参照だけを持つキャラクター単位の変更境界とする。この方式なら1キャラの監査範囲を局所化しつつ、元素名、攻撃種別、説明文、倍率、modifierを複製しない。

v2で新規・更新する構造化効果は、原文レコード、解釈方法、検証状態、出典参照を必須にする。AI支援の解釈は独立レビューが完了するまでRuntimeへ昇格しない。既存modifierは互換経路として動作を維持するが、正規表現による説明文推定を「検証済み」とは扱わない。

## 現行構造と問題点

### ファイル責務

| 層 | 主なファイル | 現状 |
| --- | --- | --- |
| カタログ | `characters.json`、`weapons.json`、`artifact-sets.json` | 名前、ID、分類を保持 |
| 原文 | `character-talents.json`、`character-constellations.json`、`weapon-effects.json`、`artifact-set-effects.json` | 表示用原文の主な正本 |
| 攻撃Spec | `calc/talent-scalings.json`、`calc/attack-mode-rules.json` | 攻撃倍率、参照ステータス、攻撃分類 |
| 効果Spec | `calc/*-effect-registry.json` | 一部の効果グループ、条件、対象を手動構造化 |
| Runtime | `calc/*-modifiers.json` | 実計算へ渡す補正。原文、条件、表示補助も混在 |
| UI/解析 | `genshinCalcData.js`、`genshinModifierAnalyzer.js`、`genshinCalcConditions.js` | 読込、可否判定、入力生成 |
| 計算 | `genshinCalcEngine.js` | modifier適用、攻撃計算、互換正規化 |
| UID | `genshinProfileMapper.js`、`genshinUidImporter.js` | API応答を表示・入力欄へ反映 |
| パーティ | `genshinPartyState.js`、`genshinPartyModifiers.js` | メンバー状態と他者効果を計算候補へ変換 |

主な問題は次のとおり。

1. `modifier-contract.schema.json` は `sourceText` だけを持ち、source record、取得時刻、ゲーム版、解析主体、検証者、不一致を必須にできない。
2. Runtime modifierに原文、UIラベル、条件、計算値が同居する。表示上の都合でRuntimeを変更しやすい。
3. `genshinCalcEngine.js` の武器互換経路は説明文から対象と動的条件を正規表現推定する。`genshinPartyModifiers.js` にも対象推定がある。これは既存互換には必要だが、canonicalデータの生成根拠にはできない。
   命ノ星座Runtimeには `inferredFromSourceText` 59件、`fromSourceText` 25件が残る。これらは原文と推定結果が同じレコードに混在する代表例である。
4. 武器監査の現行レポートでは210武器・455補正に対し、構造化済みは少数で、大半がフォールバック分類である。説明文推定を一括停止すると既存UIと計算候補を壊す。
5. `talent-scalings.json` の `source` はデータセットとパラメータ位置を示すが、取得スナップショット、ゲーム版、ハッシュ、検証状態がレコード単位で統一されていない。
6. 命ノ星座監査は外部OSSとの照合状態を持つ一方、`textVerified` は複数ソース一致を意味しない。検証語彙がデータ種別ごとに異なる。
   現行全補正監査は1,561件中1,091件を計算可能、83件を表示専用、68件を入力不足、37件を不正データ、282件を未対応と分類する。スキーマ上は1,329件がcanonical形、232件がlegacyCompatibleだが、v2 provenance基準では全件がlegacyCompatibleである。
7. UIDはすでにキャラ、凸、天賦、武器、精錬、聖遺物、最終ステータスを正規化するが、フォーム反映が主な出口で、パーティ選択が同じモデルを直接購読する契約がなかった。
8. 時間、回数、ICD、粒子、スナップショット等は原文に存在しても、共通Specの必須・任意フィールドとして保持されていない。後日のDPS対応時に再調査が必要になる。
9. UID入力は画面側が8〜10桁、保存層が8〜10桁なのに検索時検証は上限を確認していなかった。また不明ID時に甘雨/アモスを代入し、聖遺物セットIDの候補にメイン効果IDを含める誤フォールバックがあった。これらは今回修正した。
10. `talent-modifiers.json` は117キャラ中25キャラにエントリがない。効果が存在しないケースと未構造化を区別する明示状態がないため、単純な欠損件数だけで補完してはならない。

## 現行データフロー

```text
公開/OSSデータ
  -> 同期・生成スクリプト、または既存JSON
  -> Raw表示JSON / calc JSON / effect registry
  -> genshinCalcData.js
  -> genshinModifierAnalyzer.js + Engine内互換正規化
  -> genshinCalcConditions.js（条件入力）
  -> genshinCalcEngine.js（計算）
  -> genshinCalcRenderer.js（表示）

UID API
  -> genshinProfileMapper.js
  -> genshinUidImporter.js
  -> 共通計算入力欄
  -> 上記と同じ計算経路
```

良い点は、UIDと手入力が最終的に同じフォームと計算コンテキストを通ること、計算可否の多くを共通解析層へ集約済みであること、未対応効果を理由付き候補へ残すこと。改善対象は、RawからSpecを作った履歴とRuntimeへの昇格ゲートが弱い点である。

## 採用した v2 データモデル

```text
SourceRecord（改変しない原文・構造値・取得情報・ハッシュ）
  -> EffectSpec（条件、対象、値、時間、回数、元素、エネルギー、解釈主体）
  -> RuntimeModifier（計算エンジンが消費する最小データ）
  -> ViewModel（条件入力と説明表示）
```

- `source-record.schema.json`: 出典、レコード位置、原文、取得日時、ゲーム版、完全性ハッシュ。
- `effect-spec.schema.json`: source参照、human/parser/AIの解析方法、対象、発動条件、時間・回数・元素・エネルギー等、検証状態、不一致。
- `character-package.schema.json`: キャラクター単位でRaw/Spec/RuntimeのJSON Pointerを束ねる。実データは複製しない。
- `data-v2-manifest.json`: 全データセットの層、権威、生成処理、移行状態を宣言する。
- `genshinDataContract.js`: 未検証Specと未レビューAI解析をcanonical Runtimeから拒否し、UID/手入力を共通 `CalculationInput v2` へ正規化する。

### キャラクター単位JSONの判断

参照型で採用した。完全なデータをキャラクターファイルへ再配置する方式は、巨大JSON問題を解消する代わりに原文・倍率・共通語彙を重複させるため不採用とした。パイロット8件は単発/重撃、継続、オフフィールド、召喚・設置、スタック、CT変化、特殊参照、複雑条件をカバーする。

### effects / modifiers / 原文

- 原文はSourceRecordまたは既存Raw JSONにのみ置く。
- effect/specは効果の意味と状態遷移を表す。UIラベルはここからViewModelへ変換する。
- modifierは値、演算、対象、適用段階、参照Spec IDだけを持つ。
- canonical経路ではRuntimeが原文正規表現から対象・値・条件を導出してはならない。
- legacy経路の正規表現は互換専用で、監査上 `legacyCompatible` と数える。

## UIDと入力自動化

`CalculationInput v2` にキャラクターID、レベル、凸、天賦、武器、精錬、聖遺物、ステータス、由来を統一した。UID選択時に同モデルをイベントで公開するため、将来のパーティ選択はフォームを再解析せず同じ入力を利用できる。

`skillLevelMap` は列挙順を使わず、ローカルデータで意味を確定できる `combat1` / `combat2` / `combat3` だけを通常/スキル/爆発へ割り当てる。未知ID・部分欠損・競合はraw IDをprovenanceへ保存してLv1へfail-closedし、UIで手動確認を求める。UID由来 `CalculationInput` はパーティ選択にも接続済みだが、サポートの会心・元素チャージ・元素ダメージ等は現行Party Runtimeのprojection外である。

自動判定するのは装備・凸・天賦・編成・最終ステータスから確定する状態までとする。敵命中後、現在スタック、HP閾値を満たしたか等の戦闘状態は、結果値ではなく原因となる状態だけをユーザーに尋ねる。

## 情報源とAI監査

リポジトリ内に原神データ生成でLLM APIを直接呼ぶ処理は見つからなかった。しかし生成済みJSONの各レコードに生成主体がないため、「AIを使っていない」と証明することもできない。従ってv2では `interpretation.method` と検証者を必須化した。

既存命ノ星座監査は複数OSS照合を行うが、ゲーム版がレコード単位で固定されないため、既存の `corroborated` もv2の `verified` へ自動昇格させない。外部実装の参照用として genshin-db と gcsim のrevision、対象ファイル、SHA-256を `v2/source-catalog.json` に固定した。ただし外部実装が存在することと、全フィールドを独立検証できたことは同義ではない。

説明文由来フラグを持つ命ノ星座84件は再現可能な監査へ分離した。内訳は、既存レジストリに数値照合の証拠がある61件、レジストリ対象外のresource effect 21件、既存レジストリで隔離済みの2件である。条件・対象・重複意味まで保証できないため、84件すべてcanonical昇格対象外とした。フィッシュルと八重神子のパイロット参照検証では `talent-modifiers.json` の該当エントリがないことも検出し、推測生成せず `needsReview` とした。

## 将来保持できる情報

EffectSpecに加え、BehaviorSpecは継続時間、発生間隔、CT、ヒット数、攻撃回数、チャージ数、同時存在数、更新・解除、元素付着/ICD、エネルギー、スナップショット、オフフィールド、範囲を保持できる。さらに、発火イベントと原因、stackの取得・消費・reset、明示的な状態遷移、召喚・設置・追撃actorのidentity、独立攻撃周期、攻撃速度、敵数依存のhit規則を共通フィールドとして保持する。命ノ星座・天賦・武器等による変更は、元Specを上書きせず `operation`（add/multiply/replace/reset/extend/consume/setMaximum/ignoreCooldown/refresh）を持つmodifierとして差分適用する。攻撃倍率の `hitCount` と時間軸上のtick数・trigger上限は別契約とした。DPSはこのSpecを時間軸へ展開する将来consumerとし、現行単発計算の契約へ混ぜない。

## 移行手順

1. 対象のRawレコードを改変せず登録し、取得日時、ゲーム版、場所、ハッシュを固定する。
2. 可能なら独立した2情報源を照合する。差異は消さず `discrepancies` に並記する。
3. EffectSpecを作成し、解析方法とparser/generator版を記録する。
4. 人間レビューで対象、条件、値、継続、スタック、適用範囲、演算種別を確認する。
5. `verified` のSpecだけから決定的にRuntime modifierを生成する。
6. character packageへ参照を追加し、監査スクリプトで全Pointerと層境界を検証する。
7. Raw -> Spec -> Runtime -> CalculationInput -> UIの代表回帰テストを追加する。
8. 旧レコードは削除せず `supersededByStructuredRecord` とし、比較後に互換経路を段階廃止する。

## 今回の実装範囲と残課題

実装済みは契約、マニフェスト、8代表パッケージ、UID共通入力、監査スクリプト、Runtime昇格ゲート、回帰テストに加え、210武器・455補正のv2候補レイヤーである。武器候補は894 SourceRecordと455 EffectSpecへ決定的に変換し、入力ファイルのSHA-256、欠落、重複候補、Runtime接続を監査する。独立検証とゲーム版が不足するため455件すべて `needsReview`、canonical 0件のまま隔離している。既存計算は互換経路を維持する。

時間・回数は8代表キャラの原文120件から56 BehaviorSpecと36 BehaviorModifierを生成した。各キャラクターパッケージは `byCharacter` 索引を参照するため、原文・候補Spec・変更演算を1キャラ単位で追跡できる。snapshotと元素爆発コストなど原文で確定できない値はunknownのまま保持し、全候補を `needsReview` とした。

既存不具合として、実りの鉤鉈の命中後効果を存在しない0～3層入力としていた問題と、黒蝕の装備者攻撃力効果を常時・入力反映済みとしていた問題を修正した。前者は落下攻撃命中後10秒の状態、後者は元素爆発命中後3秒の共有状態として扱い、回帰テストを追加した。

残課題の優先順は、(1) 武器・聖遺物候補のフィールド単位独立レビュー、(2) 全キャラクターのBehaviorSpec横展開、(3) verified Specだけを変換するcanonical Runtime生成器と安全な置換接続、(4) legacy説明文推定の計算経路からの除去、(5) Party Runtime projectionの拡張、である。

## 作業分担

Lunaには全JSON棚卸し、210武器・455補正の決定的変換と監査、時間・回数情報の横断抽出、命ノ星座84件の再分類と決定性テストを委任した。SolはRaw/Spec/Runtime境界、schema、canonical昇格条件、SourceCatalog、BehaviorSpec/BehaviorModifierの演算契約、UID共通入力、既存武器不具合の採否と全体レビューを担当した。

## 2026-08-16 追補: 横断移行の到達点

- 武器は210件・455効果候補・894 SourceRecordを決定的に生成した。全候補は単一情報源かつレビュー未完了なので `needsReview`、canonical 0件である。
- 聖遺物は61セット・122効果候補（2セット50件、4セット72件）・427 SourceRecordを生成した。構造modifierがない7セットはrawを保持したまま `structuredModifiersMissing` とし、推測で補完していない。全候補は `needsReview`、canonical 0件である。
- 全117キャラクターをraw天賦・命ノ星座・倍率・天賦modifier・命ノ星座modifierの5層で棚卸しした。天賦modifierは92件に存在し、欠損25件は原文に受動効果候補があるため `noEffect` ではなく `unstructured` とした。
- 時間・回数・CT・チャージ・同時存在・refresh/reset・ICD相当を8代表キャラクターから120 SourceRecord、56 BehaviorSpec、36 BehaviorModifierへ分離した。`hitCount` と時間軸上のtick/trigger上限は別契約である。明示されないsnapshotや元素爆発コストはunknownのまま保持した。
- 説明文由来の命ノ星座84件は、数値証拠あり61件、未確認21件、隔離2件へ分類した。数値一致だけでは対象・条件・重複意味を保証しないため、84件すべてcanonical対象外である。
- canonical gateは、Spec全体だけでなく各verified claimについて、解決可能な参照、異なるprovider 2系統以上、一致するgameVersion、reviewerとreview時刻、source agreementを要求する。AI支援候補は解釈者と異なるreviewerによる独立レビュー完了まで昇格しない。
- UID選択イベントは全プロフィールキャラクターを `CalculationInput v2` としてキャッシュする。ユーザーがパーティ枠で同一キャラクターを選ぶと、レベル・凸・天賦・武器・精錬・聖遺物構成・provider statsを自動反映する。空き枠の自動編成、戦闘状態、バフ有効化は行わない。手動編集後はprovenanceを `mixed` に切り替える。
- 聖遺物モードは `4pc` / `2pc2pc` / `2pc` / `none` を明示し、単独2セット効果が4セット効果として評価されないようRuntime境界を修正した。
- canonical Runtime生成器は武器455、聖遺物122、talent-gap 73、behavior pilot 92、全12 behavior batchの1,526件、計2,268候補を同一gateで監査する。全コピー項目に個別verified claim、2独立provider、一致するgameVersion、独立レビュー、構造化destination、legacy置換IDを要求する。現行2,268件は全件除外され、生成物は0件である。
- ブラウザloaderは生成器versionとv2 provenanceを再検証し、構造化destinationの同一配列内で宣言済みlegacy IDをすべて確認してから原子的に置換する。対象欠落、ID衝突、未対応route、改変されたproducer情報は適用しない。現行の空生成物は既存計算に対するno-opである。
- 現時点の既存Runtime 1,561件は全件 `legacyCompatible` のままで、canonical Runtimeは0件である。進捗は件数を混ぜた単一百分率にせず、`reports/genshin-v2-progress.json` と `.md` で層別に監査する。

全109非pilotキャラクターへのBehaviorSpec横展開は完了した。残る主要作業は、単一情報源候補の独立照合と人間レビュー、欠損25件の意味構造化、verified Specのcanonical Runtime接続、legacy説明文推論のcanonical経路からの撤去である。

### 継続バッチ

- 欠損25キャラのpassive 73件を、73 SourceRecordと値・対象・条件をunknownに保った73 EffectSpec候補へ変換した。全件 `needsReview`、Runtime `blocked`、canonical 0件である。
- 全117キャラの時間・回数候補を走査し、8 pilotを除く109キャラについて1,693件のBehaviorインベントリ候補を作成した。候補1082件・unknown 611件であり、まだBehaviorSpecまたはRuntimeではない。
- 非pilot 109キャラを12バッチで1,635 SourceRecord・1,526 BehaviorSpec候補へ正規化した。入力インベントリ1,693件（candidate 1,082 / unknown 611）を欠落なく追跡し、明示可能な455 measurementだけを候補Specへ保持した。全件 `needsReview` / Runtime `blocked`、canonical 0件である。
- UIDの `skillLevelMap` は順序付き配列ではないため、`Object.values` による通常/スキル/爆発割当を撤去した。ローカル契約で明示できる `combat1` / `combat2` / `combat3` だけを割り当て、それ以外の数値ID・未知ID・部分欠損・競合はraw IDをprovenanceへ保存して天賦Lv1へfail-closedする。未解決状態はUID UIでも手動確認が必要と表示する。
- 武器・聖遺物577候補の9,931 field claimを独立性監査した。9,404 claimは同一provider階層内の重複、527 claimは9武器に対するgcsim entity-file固定参照を持つがfield値とgameVersionを欠く。dual-source eligibleは0で、参照先が複数あるだけでは一致証拠に数えていない。
