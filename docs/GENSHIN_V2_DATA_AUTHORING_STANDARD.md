# 原神v2 データ作成標準

標準ID: genshin-v2-authoring-2026-09-10。ユーザー承認済みの統合方針に基づく。

## 1. 適用範囲と参照順

新規データと既存データのv2化に適用する。[r2 goal](genshin-goals/2026-08-28-realignment/revised-goal.md)を目的・受入条件、[実行補足](genshin-goals/2026-08-28-realignment/execution-addendum-2026-09-06.md)をbatch・役割分担・同期手順、本書をデータ作成判断の標準とする。現行schema、generator、consumer、証拠policyは実際に受理できる形式と資格を定める。本書の概念名だけで未対応形式を受理済みと見なさない。不整合があれば影響範囲を記録し、必要なRuntimeをblockedにする。

Raw → Spec → Runtime、SourceRecordの出典固定、field単位検証、独立複数family、同ゲーム版、AI解析の独立レビュー、不明値非推測、未検証のcanonical Runtime拒否、legacyをcanonical根拠にしない原則を維持する。G06/G13の保留・完了条件は変更しない。完了済み候補への一律遡及監査、全件strict化、全SpecのRuntime化、新基盤の追加を要求しない。

## 2. 工程の到達点

次は報告上の工程到達点であり、schemaのenumやverification state machineを置き換えない。G03の証拠・計算・作業状態を並記し、対象candidate/field/versionと到達実績・現在有効性を区別する。

| 到達点 | 終了条件 | canonical Runtime利用 |
| --- | --- | --- |
| candidatePrepared | Primary SourceRecordまたは取得欠損理由、Spec候補、unknown、不足理由、次taskが追跡可能 | 不可 |
| verificationComplete | 必要fieldの独立照合、版、意味、差異処理、必要証明が成立 | consumer・依存・生成待ちなら不可 |
| runtimeConnected | 有効なcanonical gate、対応generator、構造化destination、依存・置換・consumer受入・回帰が成立 | 検証済み範囲で可 |

Primaryの欠損を記録したcandidatePreparedは取得成功ではない。schemaで候補自体を表現できない場合は既存の候補台帳とSourceRecordに未具体化理由を残し、schema-validなSpec作成済みとは数えない。consumer不足でも候補作成工程は終了できる。候補作成終了はG06保留承認やgoal処置完了ではなく、必要な比較・修正・受入taskを残す。

## 3. 正本と格納先の判断

取得した原文/元JSON/コード値か → 意味 → 現在読むconsumer → schemaの表現力 → generator → 他Specとの不可分な依存、の順で判断する。似たJSONの所在だけで決めない。

| 情報 | 正本・経路 | 条件 |
| --- | --- | --- |
| 原文・外部構造値 | SourceRecordと固定raw artifact | 解釈結果を書き戻さない |
| 名前・元素・武器種・レアリティ | SourceRecord＋既存catalog | identityとvariantを固定 |
| キャラ基礎値 | SourceRecord＋既存base-stats経路 | 未定義Specを新設しない |
| 武器基礎ATK・副stat | SourceRecord＋既存武器catalog経路 | 武器効果と分離 |
| 表示名・画像 | catalog/image manifest | 計算Specへ混ぜない |
| 通常・重撃・落下・スキル・爆発の直接倍率 | 対応済みtalent-scalings | attack group/段/参照stat/Lvを固定 |
| Lv別回復・シールド量 | 対応consumerがある場合だけtalent-scalings | 未対応はEffectSpec候補と不足理由 |
| Lv別バフ、stat、ダメージバフ、防御/耐性、回復、シールド、リソース効果 | EffectSpec | Lvで変わるだけで攻撃倍率に分類しない |
| 独立参照・変更される実行/時間/付着/状態 | BehaviorSpec | 現在計算に不要ならSpec-onlyも可 |
| 既存Behaviorへの条件付き差分 | BehaviorModifier | 一意targetSpecId・path・演算・条件を保証 |
| 計算用の正規データ | verified Specから生成したcanonical Runtime | gate・consumer受入を要する |
| registry/audit | 対応・証拠・差異・reviewの索引 | ゲーム内事実の正本にしない |
| legacy modifier | 既存互換保守 | 新規v2事実の正本にしない |

[SourceRecord schema](../games/genshin/data/schema/source-record.schema.json)の必須項目はid/kind/provider/locator/capturedAt/gameVersion/text/integrity。構造値はstructuredValue、版証拠はgameVersionEvidenceで保持する。gameVersion=nullは版不明であり、strict資格ではない。locator固定に加え実raw bytes・digest・field locatorを追跡する。コード上の値はprovider実装の証拠であり、ゲーム仕様と自動的に同一視しない。

## 4. EffectSpecとBehaviorSpecの境界

同じ意味の値を両Specの独立正本にしない。[EffectSpec](../games/genshin/data/schema/effect-spec.schema.json)だけで効果を完全に表せるならまとめる。独立参照される挙動やBehaviorModifierの変更対象は[BehaviorSpec](../games/genshin/data/schema/behavior-spec.schema.json)を正本とする。両者が不可欠なら安全な結合を要し、共通sourceRefsやentity.componentだけで一括適用を保証したと見なさない。結合未対応は該当Runtimeをblockedにする。

| 情報 | EffectSpecで完結する例 | BehaviorSpecを検討する例 |
| --- | --- | --- |
| duration/CT/interval | 単一効果の単純な有効時間・再発動間隔・周期 | refresh、延長、個別期限、CT開始/reset/charge、tickとtriggerの差 |
| hitCount/charges/maxInstances | 効果自身の固定回数・上限 | 独立攻撃、他効果の変更、回復、共有、召喚寿命・置換 |
| stack | 単純な最大数と効果量 | 取得・消費・reset・個別期限・refresh・共有状態 |
| snapshot/off-field/area | 全体yes/noや単純分類で十分 | stat別取得時点、交代状態遷移、対象別hit・重複 |

stackは最大数、1層の値、取得/消費/resetイベントと量、個別/全体期限、refresh、所有者/対象の共有を区別する。未記載は推測しない。複雑な時間挙動の自動再現と、ユーザーが明示した現在層数からの単発計算は分ける。後者は必要な値・条件・入力契約が成立する範囲で部分有効化できるが、未モデル化の取得や期限を再現したとは報告しない。

snapshotは全体一括の場合のみyes/noへ縮約できる。ATKのみ固定、hit時再取得、召喚/stack/対象ごとに取得時点が違う場合、証拠をSourceRecordと既存notes/unknownへ保持し、表現不足はschemaGapとする。

追加ダメージは「元倍率変更」「基礎ダメージ加算」「与ダメージボーナス」「独立ダメージインスタンス」「元攻撃へのhit追加」を分類する。最後は元BehaviorのhitCount変更ならBehaviorModifier。独立追撃はEffectSpecと必要なBehaviorを結合する。分類不能はunknown、Runtime不可。

ICD/付着は原則BehaviorSpec.elementApplicationのelement/gaugeUnits/icdInterval/icdHitRule/icdScope。ダメージ元素、元素付与/変換、付着、ICD tag、gaugeを区別し、攻撃元素や倍率配列長からICD/hit数を推測しない。

## 5. 条件・変更演算・値

条件はevent、actor、owner、target、state、threshold、AND/OR/排他、frequency、lifetimeへ意味を分ける。現行schema/generator/consumerが解釈する形式だけを採用する。自由文字列や許容されたobjectだけで意味を実装済みとしない。

[BehaviorModifier schema](../games/genshin/data/schema/behavior-modifier.schema.json)のtargetSpecIdが一意に解決し、対象pathが実在し、演算と条件がconsumerで同じ意味になることを確認する。命ノ星座の既存形式は `{ "kind": "constellation", "stateKey": "<characterId>:C<n>", "minimum": 1 }`。実際の判定は[loader](../games/js/genshinCalcData.js)のbehaviorConditionMatchesに従い、minimumだけで条件を成立させない。

charge+1は/execution/chargesへのadd、duration延長は/timing/durationへのextend、元攻撃hit追加は/execution/hitCountへのadd。CT総量のadd -1と残りCT減算は別。ignoreCooldown等もenumにあるだけで時系列処理を保証しない。複数modifierの順序が結果を変える場合、既存契約で順序を保証できるまでcanonical不可。ATK+20%はEffectSpec。

値は固定値、参照stat、参照倍率、Lv軸、精錬軸、stack軸、条件倍率を分離する。percentの20と0.2はschema/generatorごとの規約・表示解釈・変換式を確認し、generatorで明示変換する。

0は明示的なゼロ、nullはschema上の値なし、unknownは不明、notApplicableは適用されない根拠あり、disputedは証拠間不一致。これは概念分類であり任意fieldへ文字列を代入しない。空文字・欠落をunknownの代用にしない。現行EffectSpecのdurationSecondsは数値/nullでLv別配列を直接受理しない。EffectSpec.verification.statusにはdisputedがないためsourceAgreement/claim/discrepanciesで表す。数値nullの理由は既存verification等に残す。未対応はschemaGapとして保持し、標準導入だけでschemaを増やさない。

原文が秒なら秒、実装資料がframeならそのframeをRawの正本とし、換算はderived・FPS前提付きとする。丸め秒と内部frameを完全一致にしない。異なるproviderの表示と実装の測定対象を揃える。

## 6. 取得先matrix

取得順の案であり採用優先順位でも承認済みpair一覧でもない。既存rawと有限探索を再利用する。各セルはfield・版・identity・入手可能性を確認する探索先であり、全件取得可能と主張しない。

| 対象 | 第一取得元 | 第二探索先 | 第三探索先・注意 |
| --- | --- | --- | --- |
| identity | version固定genshin-db | HoYoWiki | 公式告知、variant確認 |
| キャラ基礎値 | genshin-db | gcsim | 公式表示、Lv/突破一致 |
| 武器基礎値 | genshin-db | gcsim | HoYoWiki、照合実績は限定 |
| 天賦倍率 | genshin-db | gcsim実装 | HoYoWikiで存在するfieldのみ |
| 天賦/凸原文 | genshin-db対象locale | HoYoWiki | 公式紹介/更新、翻訳を独立証拠にしない |
| 武器効果 | genshin-db | HoYoWiki/公式告知 | gcsim、候補限定承認の横展開不可 |
| 聖遺物効果 | genshin-db | HoYoWiki | KQM/gcsim、版・field coverage確認 |
| duration/CT | 明示値・原文 | HoYoWiki | gcsim、開始時点/意味差確認 |
| hit数/tick/trigger/stack | 明示原文 | gcsim | KQM測定、animation間隔と区別 |
| snapshot | gcsim実装/test | KQM再現検証 | 公式明記 |
| ICD/gauge | gcsim実装/test | KQM TCL | 公式明記、版/lineage確認 |
| frame/hitlag | gcsim frame資料 | KQM測定 | 独立再現測定、genshin-dbは通常対象外 |
| 特殊状態遷移 | gcsim実装/test | KQM mechanics | 公式詳細説明 |
| version変更 | 公式更新告知 | 固定genshin-db差分 | gcsim release/diff、commit日で版を決めない |

genshin-dbはGenshinData-derived。GOは同系列の参考/欠損探索用でgenshin-dbとの独立pairにならない。HoYoWiki/HoYoLABは同じofficial-hoyoverse family。gcsim/KQMは独立照合候補になり得るが版binding等を別途要する。Gachabaseは既存承認scopeのみでlineage未解決を一般化しない。TeyvatGuideはlineage不明の参考探索、damageTool localは比較対象で外部providerに数えない。

実際の採否は[source-family registry](../games/genshin/data/v2/source-family-registry.json)、[provider-pair policy](../games/genshin/data/v2/provider-pair-policy.json)、[independence policy](../games/genshin/data/v2/provider-independence-policy.json)、[source catalog](../games/genshin/data/v2/source-catalog.json)と実証拠で確認する。同upstream/API/mirror/fork/翻訳/datamine rootを二重計上しない。本書は既存policyを承認・更新しない。

## 7. 候補作成と有限探索

1. 既存artifactと探索履歴を確認し、対象entity/field/versionを固定する。
2. matrixのPrimaryから原文・構造値を取得し、locator/raw digest/版証拠をSourceRecordへ固定する。
3. 意味を分類し既存形式で候補を作る。unknown、schema/consumer不足、次taskを残す。
4. Primaryまたは欠損理由と候補の追跡が揃えば候補作成工程を終了する。第二family発見をこの工程だけの終了条件にしない。

entityMissing、fieldMissing、versionUnavailable、gameVersionUnbound、acquisitionBlocked、locatorUnstable、providerIndependenceUnknown、semanticDecisionRequired、schemaGap、consumerMissingを区別する。未対応の理由名は既存記録の説明として対応づけ、勝手にenumを追加しない。

Primaryのfield欠落だけでなくentity/版不足・固定不能・取得障害等でも、使える既存代替先へ進める。通信/権限障害は探索完了ではない。候補作成の代替取得と独立照合の第二sourceは目的を区別する。

searchExhaustedは、定義したmatrixの第一～第三探索先（代替先を含む）の結果または非該当根拠、対象entity/field/version、searchScope、lastSearchedAt、providersExamined、reopenTriggerを記録し、一時障害や未調査を残したまま探索済みにしない場合だけ適用する。既存の同scopeの有限探索を繰り返さない。「値が存在しない」ことの証明ではなく、記録した範囲で適格な証拠が得られないことを示す。G06保留は別途その条件を満たす。

## 8. 検証とRuntime接続

計算採用対象、および受入条件上strict確認が必要なSpecを選定し、Primaryと異なる独立familyを照合する。選定から必要な計算依存fieldを落とさない。entity/field/Lv/精錬/locale/単位/条件/scope/target版を揃え、元値、差異、lineage、pair承認scope、実revision/raw/field digestをcandidate×claimで確認する。Primaryを優先採用せず不一致を保持する。第三sourceはG04どおり客観的解決にのみ用い、多数決しない。

AI解釈の自己承認は禁止。human reviewとdeterministicConsensus attestationを区別し、有効なEligibility Certificateと実装証明を既存gateへ渡す。verificationCompleteでもconsumer未対応ならverifiedとRuntime blocked/consumerMissingは両立する。

Spec→legacy互換形式の変換成功だけでは採用しない。承認generator、構造化destination、category/condition/unitのconsumer対応、必要依存、置換対象、UID・重複適用防止、focused回帰、現version有効性を要する。新規未検証データをcanonicalやdefault productionへ入れない。

新規v2事実をlegacyへ手書きしない。既存r2 G06で承認された明白な互換保守・誤適用修正・安全制限はその範囲で続けられ、候補ごとの再承認は不要。これはcanonical昇格の証拠にはならない。無効canonicalをlegacyへ流してgateを迂回しない。

## 9. Codexの作業手順

2026-09-12承認の[実行補足](genshin-goals/2026-08-28-realignment/execution-addendum-2026-09-06.md)「一周目を先に終える」を優先順位・調査深度へ適用する。製品修正は従来の小batch、変更を伴わない棚卸しは共通資料・不足理由でまとめる。production無変更の記録処置は既存の安全措置と全候補の参照・記録整合を確認し、実計算fixtureを毎件新設しない。計算採用・strict・G06/G13の条件は維持し、一周確認済みや内部作業の先送りをgoal処置完了へ読み替えない。

goal → 実行補足 → 本書 → 対象schema/policy/実装の必要部分を参照する。batch開始時に対象ID、意味上の正本、終了地点、必要field/不足証拠、既存generator/consumerを固定する。Lunaは既存raw照合・個別監査・fixture、rootは採否・設計・production修正・統合を担当し重複調査しない。

候補作成 → 不足記録 → 必要対象の独立検証 → gate → 対応Runtime生成/consumer受入、の順に進める。各工程の終了は次工程やgoalの終了を意味しない。3～10効果の製品batch、focused-first、実製品成果を先頭とする報告、checkpointとG06/G13を維持する。同期は実行補足の2026-09-11追補に従い数batch単位にまとめられるが、製品が必要とする生成物は使用前に更新し、未同期の証拠・decisionを有効扱いしない。Lunaは可能な範囲で既存harnessによる実計算fixtureを含める。新たなstate machine・KPI基盤・専用script/schemaをこの文書統合のために追加しない。
