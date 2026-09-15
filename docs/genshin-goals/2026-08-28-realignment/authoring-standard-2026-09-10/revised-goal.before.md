# 原神データ品質・7.0計算対応・継続更新基盤 /goal（改訂 r2）

- Revision ID: genshin-goal-2026-08-28-r2
- 改訂日: 2026-08-28 / Asia/Tokyo
- 対象の既存goal: threadId 01a03256-cb5d-7fb0-a6f9-e268bcb222e6
- 旧本文: [original-goal.md](original-goal.md)（原本とbyte一致、変更禁止）
- 変更理由・旧37節の対応表・自己レビュー: [revision-review.md](revision-review.md)
- 改訂前checkpoint: [checkpoint-before-revision.json](checkpoint-before-revision.json)
- この文書が改訂後のgoal本文。旧本文は履歴・安全要件の照合に用い、旧い全候補完了条件や6.7固定優先順位へ戻さない。
- ユーザーの今回の指示はgoal改訂まで。現在は pausedByUser。実装、source探索、candidate処理、生成、promotion、review承認、worker再開を行わない。次の明示的な再開指示を待つ。
- この改訂はgoal新規作成、goal complete、利用枠リセット、アプリ内部DB更新を行うものではない。

## G01. 本来の目的

1. 原神のキャラ・武器・聖遺物等、計算に使うデータを信頼できる情報元で確認し、確認できた誤りを正す。
2. 良い情報源がないため確認できないものは、未確認・暫定として根拠と再確認条件を残す。全未知の解消を今回goalの終了条件にしない。
3. 今後のキャラ・武器・聖遺物の追加、既存キャラの天賦・数値・凸・挙動の強化や調整へ、共通の更新経路で対応できるようにする。
4. 7.0で追加された新キャラ、星拡散、一部既存データの変更を、証拠と実装が揃った範囲から火力計算へ正しく反映する。未対応範囲は明示する。
5. 補正条件の対象選択を内部都合でなくユーザー視点で使いやすくする。具体的なproduct/UX仕様が必要になった時点で案を提示し、相談する。

対象は原神のみ。崩壊：スターレイル（HSR）側を変更しない。新しいsimulation基盤、将来だけのconsumer、全面リファクタ、汎用capture platform等を、今回の正しさ・安全性・完了に必須でない限り追加しない。

## G02. 引継ぎ、有限scope、履歴の優先関係

再開時は現在repository、authoritative queue、最新checkpoint、version evidenceの差分を確認する。完了済みcapture・代表E2E・棚卸しを最初から繰り返さない。変更箇所の回帰確認は別途必要。

既存2,268 candidateは削除・再採番せず監査台帳として維持する。ただし、その件数は全原神データ、必要Runtime、7.0新キャラ一覧の分母ではない。catalog、base stats、成長曲線・突破値、天賦倍率・Lv、凸、攻撃モード、反応、各modifier、必要入力も実際の計算依存関係に沿って対象へ含める。

工程Aで、対象versionを7.0とした有限の受入対象表を保存する。各dataset/entity/field/featureについて、必要な確認・計算範囲、非該当の根拠、依存関係、受入条件を特定する。全既存台帳をこの表の対象または理由付き保留・対象外に対応づけ、黙って候補を落とさない。任意の将来機能はbacklogへ置く。

現在の計算に不要なgeneric Behavior unknownをすべて実装必須にしない。一方、必要fieldを都合よく削除したりunknownを証拠なくN/Aにしない。将来versionの公表だけを理由に今回scopeを自動で拡張し続けない。target変更が必要なら理由と影響を提示する。

旧goalの後に承認された事項（candidate×claim証明、実bytesからの再計算、7.0へのtransition、局所fail-closed、星拡散の非推測、scope拡張抑制）は本本文へ統合済み。後の明示的なユーザー指示とシステム上の権限を優先する。

## G03. 証拠状態・計算対応・今回の作業状態を分ける

状態名の具体的schemaは既存設計に合わせてよいが、次の3軸を混同しない。

| 軸 | 表現する内容 |
| --- | --- |
| 証拠・確認状態 | strict verified、一次資料のみ確認、同一familyの比較のみ、不一致、未確認、旧versionだけverified等。必ず対象fieldとversionへ拘束 |
| 計算対応状態 | 対応済み、一部対応、入力不足、専用式未実装、影響部分無効、計算不要等 |
| 今回の作業状態 | 修正・検証完了、証拠待ち保留、仕様判断待ち、理由付き今回対象外、未処理等 |

一次資料に記載があること、raw取得、mapping、field一致、独立二源verification、Runtime対応、goal処置完了は別の成果として数える。

証拠待ち保留はverifiedでもcanonicalでもない。必要な確認・安全措置・再確認条件まで整った保留は、今回の作業処置として閉じられる。内部の未実装・未テストや利用枠制限を、外部証拠待ちに偽装しない。

## G04. strict verificationの安全条件を維持する

### G04.1 Sourceと独立性

外部事実のdeterministicConsensusは以下をすべて満たす場合に限る。

- 独立したsource familyが最低2系統。provider名・URL・domainの違いではなく最終root lineageで数える。
- 中央source-family registryに、familyId、rootDataset、acquisitionMethod、transformChain、mirrorOf、forkOf、usesApi、translationOf、datamineRoot、revision/release体系、lineage evidence refsを保持する。
- mirror/fork、同じAPI、同じ原文の翻訳、同じupstream projection、同じclient archive/datamine rootを二重計上しない。
- genshin-dbとGenshin Optimizerは既存policyどおりGenshinData-derived。HoYoWikiとHoYoLABはofficial-hoyoverse。packetの自由文字列や自己申告で独立性を成立させない。
- provider pair policyが該当dataset/field scopeで自動verification利用可能。candidate限定承認を別candidateへ一般化しない。
- exact revision/release固定、raw artifact取得、raw digest/field digest再計算、strict gameVersion evidenceを実証拠から確認する。
- 全sourceが同じtarget gameVersionの必要fieldを支持し、stale/invalidation検査に合格する。
- commit日付、tag、package semver、取得日、Git/file digestだけをgameVersion証明にしない。policy本文の真偽値や説明オブジェクトの存在も証拠の代用にしない。

dataset×source-family pairの再利用policyには、独立性根拠、適用scope、除外、version binding方式、必要coverage、policy version、invalidation条件を持たせる。確認済み同scopeの独立性調査を候補ごとに繰り返さず、変更検知時のみ見直す。

既知policy・有限探索履歴を再利用する。HoYoWiki×genshin-dbとGachabase×genshin-dbの代表承認はcandidate限定。Gachabaseの未解決lineage、gcsim/KQMのversion不足、TeyvatGuideのlineage不明、GOの相関を無視しない。これらは改訂時点の履歴であり、将来は新しい実証拠でのみ更新する。

### G04.2 Fieldsと意味

RuntimeまたはSpec確認に必要なvalue、unit、target、condition、scope、duration、cooldown、interval、stack、trigger、hit count、refinement等をschemaと適用証拠から列挙し、完全matchを要求する。

scopedMatch、subset、superset、partial match、source silence由来のN/Aを自動承認しない。N/Aには決定的なapplicability proofを要求する。templateに存在するだけの非該当fieldを無条件に必須化もしない。

新規target/condition/scope解釈、hidden mechanic、custom formula、自由文からのAI semantic inference、source不一致の主観的解決を自動verificationに使わない。Solによる技術設計の判断と、外部事実を証明する判断は区別する。

### G04.3 第三sourceとhuman例外

二源で値・condition・scope・version・lineage・translation・coverage等が曖昧なら、有限の範囲で第三の独立familyを確認する。多数決は禁止。

第三sourceによる自動解決は、異version、stale、同系統、明示的な別scope、provider自身の訂正等によって不一致sourceを客観的に除外できる場合だけ。真に解決不能な意味・scope・product判断はユーザーへ簡潔に提示する。証拠がないだけなら、未知を人に承認させずG06の保留へ分ける。

## G05. certificate・attestation・Runtimeの責任境界

strict eligibilityの唯一のauthorityを、source catalog strict auditに基づくcandidate × claim単位のEligibility Certificateとする。pair policyだけでcertificateを発行しない。

certificateはcandidate/claim ID、必要fieldとcoverage digest、実revision、raw artifact digest、field digest、family IDs、independence policy、strict gameVersion binding、比較結果、normalization policy、stale/invalidationを拘束する。state machine、canonical generator、terminal/progress audit、必要なreview pilot/primary registryが同じ証明を消費する。

humanとdeterministicConsensusを明確に分離する。automated attestationにはengine ID/version、policy ID/version/digest、source bundle digest、required field set digest、normalization rules digest、generatedAt、exact revisions、version binding、field comparison結果を保持する。reviewedBy/reviewedAtを機械verificationへ流用しない。自己申告のverified/eligibleを信用しない。

既存prototypeやadapterを無監査で採用しない。runtime-boundな候補についてはdeterministic parserとcode provenance/digest、verified source inputs、一意mapping/destination/supersession、schema/consumer/input整合、focused tests、canonical dry-run、Calculation/UI regressionを確認する。

必要なexternal claimの有効なcertificateと実装検証が揃ったものは、human承認を通常工程に挟まず、Spec → canonicalEligible → Runtime → production適用 → legacy supersessionまで進める。Spec-onlyには不要なRuntime要件を課さない。

## G06. 保留管理と暫定データの扱い

証拠待ち保留には最低限、次を保存する。

- 対象dataset/entity/candidate/claim/field、target version、安定ID。
- 現在値・旧値・出典と、何が確認でき何が不足/不一致か。
- 調査したprovider/artifact、scope、lastSearchedAt、negative result、未調査部分。
- 計算への影響、採った安全措置、現時点のRuntime/表示状態。
- 再開trigger（新manifest、独立lineage開示、必要field公開、訂正、次version、明示的再確認依頼等）と次の具体task。
- Solの処置理由、利用した証拠/成果物refs、処置日時・policy version。

searchExhaustedは記録されたcandidate/family/frontierの範囲に限る。全blockedへの一律付与、未着手を探索済み扱い、autoProcessableNow固定falseは禁止。保留とsearchExhaustedは同義ではない。

有限調査を終え、新しい実行可能taskがなく外部証拠待ちなら、再開trigger付き保留として今回の処置を閉じてよい。ただし既存の具体的な未処理検索・比較・修正taskがあるのに無限探索回避を口実に閉じない。後からtriggerが成立した保留だけを再開し、同じrawや探索を反復しない。自動monitor/定期実行の作成は別の明示的依頼なしに行わない。

新規の未確認データは記録・比較・説明用に保持できるが、default production計算へ自動採用しない。一次資料のみ確認を独立二源verifiedに読み替えない。単独sourceの暫定本番採用policyは別途ユーザー承認が必要で、この改訂では許可しない。

legacy計算を全停止しない一方、legacyCompatibleをverifiedと表示しない。変更/誤りが判明したlegacy経路は該当箇所を修正または安全に制限する。無効canonicalをlegacy経路へ流してgateを迂回しない。計算できない効果を0として成功表示せず、不完全な結果に未対応範囲を示す。

## G07. version更新・既存キャラ強化の共通経路

既存JSON、manifest、snapshot、diff、generatorを再利用し、次の経路を実装・接続する。

公式version/訂正の検知 → target資料/snapshot → dataset/entity/field差分 → 影響する計算依存関係の特定 → 必要claimの再確認 → certificate/Spec/Runtime再生成 → consumer/regression → 検証済みの該当部分のみ有効化。

source version、target verification version、production適用versionを分離する。6.7 accepted baselineだけから7.0証明を導かない。target versionの事前検証を、全体production baseline昇格待ちで循環停止させない。

旧record/certificate/Runtimeは削除せず、旧versionではverified・現versionでは再検証待ちとして残す。entity IDを保ち、必要なら元素/形態等variantを明示し、変更field・前後値・証拠・影響先を追跡する。既存キャラの天賦・倍率・凸・条件・回数・挙動調整、武器/聖遺物変更、同version内hotfixにも同じ経路を使う。

同一bytesや変更告知がないことだけで新version有効と認定しない。使用するsource revision/version/field evidenceと必要なtransition proofを確認する。catalog/sourceText/provider identityの根拠を比較し、legacy mapperや推測slugを独立authorityとしない。Traveler等のvariant ambiguityを隠さない。

計算に必要な関連データの集合を単位に有効化する。例えばC6なら、当該凸、対象talent、modifier、必要反応式、入力、mapping、証明が揃っていることを確認する。無関係な候補の未確認を待たない。影響範囲不明ならその範囲を保守的に無効化し、未検証を有効扱いしない。

全体baselineの確認完了と、部分的なversion-bound overlay有効化を分ける。全データstrict verifiedは品質KPIとして残すが今回goalの必須条件にしない。計算結果/保存snapshotには使用version・データ束/必要digest・未対応情報を追跡可能にし、混在を隠さない。旧version専用UIを新たな必須機能にはしない。

## G08. 工程A：有限対象と必要な基盤接続

実装再開の明示指示後、次を先に行う。

1. 旧goal/成果/checkpointを読み、現行との差分だけ確認する。
2. 既存candidate全体と、実際の計算に使うdataset/fieldをG02の受入対象表へ対応づける。7.0の新規/変更一覧を既存55件やshard対象IDから推測しない。
3. G03/G06の状態と保留管理を既存queue/terminal/reportへ接続する。製品受入taskとデータの厳格検証台帳を区別し、双方の根拠を保持する。
4. 本scopeで必要な全datasetのcertificate入力、旧human条件との矛盾、target-version検証、部分有効化、review/primary registryの接続を修正する。
5. 状態導出・保留・version gate・既存計算保護をfocused testsで確認する。

Aは旧Phase 0の安全統合を引き継ぐ。全prototypeを一から作り直さない。全汎用化の完了までBを遅らせず、安全にpopulationできる必要境界を先に完成させる。Aだけでgoal completeにしない。

## G09. 工程B：7.0と現在の火力計算への反映

優先度はSolが現状の証拠・影響・実行可能性から判断する。原則は次の順。

1. 誤計算が確認された、または変更が判明した現計算の経路。
2. 7.0新キャラの基本計算（identity、base stats、倍率、天賦、凸、攻撃モード、必要入力）。
3. 星拡散と関連武器/天賦/補正。
4. その他のキャラ・武器・聖遺物データの確認/修正。
5. 現火力計算に直接不要なBehavior情報の検証（有限scope内、将来だけの情報はbacklog）。

取得済みraw、identity解決、field比較、KQM等の比較成果、有限探索履歴を先に再利用する。条件が成立したprovider/pair/effect familyをまとめて処理し、既存証拠のないfieldだけ必要な範囲で取得する。

武器はstat/damage/reaction/refinement/conditionを同型batch化。聖遺物は2pc/4pc、condition、stack、consumerを分離する。BehaviorSpecは必要なduration/cooldown/interval/charges/hit count/stack/trigger/state/ICD/energy/summon/periodic/off-field等atomic fieldを確認し、RuntimeModifier化を必須にしない。healing等もSpec確認とconsumer必要性を分ける。

inputMissing/unsupportedは既存CalculationInput・共通consumerで本来必要な欠落なら修正する。単に実行時のユーザー入力を要することを実装不足と誤分類しない。semanticDecisionRequiredも一律humanへ送らず、決定的正規化、source追加、本当の意味判断へ分解する。

### 星拡散と w_12516_reaction_bonus_2

既存reaction definition、UI、modifier target、入力、公式証拠、review packetを再利用する。最新scopeが星電導＋星拡散であるというユーザー情報を調査起点とし、version差/consumer gapと本当のsource discrepancyを分離する。

存在・発生元素・会心可否の資料と、計算係数/式の証明を混同しない。式・係数・必要入力・関連補正を推測で実装しない。scopedMatchや部分scope投影のまま自動承認しない。二源同versionの必要field一致または客観的な第三source解決を確認する。

証拠が揃えば専用式、reaction条件、会心、防御/耐性の適用、modifier、UIを一貫して検証する。証拠不足なら機能を明示的に保留し、他の7.0対応を継続する。候補のtarget登録や名前の表示だけで7.0対応済みにしない。

## G10. 補正条件UIとユーザー判断

ゲーム上の適用対象と、ユーザーが操作するUIを分離する。「誰が提供」「誰が受ける」「どの攻撃/反応」「発動条件/層数」が分かる表現を優先し、内部tokenをそのまま選択肢にしない。

対象がゲーム仕様から決定するなら自動解決し、本当に選択が必要な場合だけ選ばせる。既存party、condition card、owner、applyTo、入力の共通設計を再利用する。具体的な新UX/product判断が必要になった時点で案・選択肢・Sol推奨を提示して相談し、仕様を勝手に固定しない。

意味・scope・contract・productの判断待ちは、対象、source A/B/C、version、一致部分、判断不能部分、選択肢、推奨を簡潔に示す。内部claim objectを大量に読ませない。他の独立した自動laneを先に継続する。

## G11. 工程C：受入・保留確定・引継ぎ

Aで固定した対象について、確認済み/修正反映/必要なSpec確認/計算不要/根拠付き保留/理由付き対象外を確定する。処置と検証状態を混同しない。

既存台帳との対応漏れ、未処理の具体task、未知の影響、依存する未確認効果の黙った適用、重複supersessionがないか確認する。修正可能なものは実装/検証し、証拠待ちだけをG06で閉じる。

7.0機能ごとに対応済み・部分対応・未対応と不足理由を明示する。保留の再開triggerと次taskを引き継げる状態にし、回帰とHSR差分なしを確認する。初期/終了差分、残る保留、ユーザー判断、全自動作業の残存有無を報告する。

## G12. authoritative queue、Sol/Luna、処理効率

queueは実candidate/claim evidence、source availability、version/lineage、field coverage/comparison、mapping、consumer/schema、regression readinessから次taskを導出する。sourceCapture、versionBinding、lineageResolution、fieldComparison、deterministicMapping、autoAttestation、canonicalDryRun、regression、promotion、awaitingUserDecision、evidenceDeferred、実装待ちを区別する。

raw/entity captureはfield証明ではない。machineEvidenceReady、source lookup可能性、strictEligible、production可能性も別。未検索frontierを一律閉じない。

親はSol。luna_workerをsource取得、raw/digest/manifest整理、field抽出/比較、version差分、coverage/identity確認、mapping候補、fixture、bounded shard等へ積極利用する。単純field25～100 candidate、Behavior1～10キャラ程度など、dataset×family pair×version×effect family/機能単位で区切る。discrepancyは別batch。

各workerへ所有範囲を明示し、共有fileの同時編集を避け、他者の編集を戻さない。shard成果をSolが統合する。Solは独立性/source採否/policy、正規化・discrepancy、schema/consumer設計、優先順位、promotion diff、regression、human例外、queue/goal判定を担当する。

Lunaの文章はverification evidenceにしない。Solは実bytes/digest/version binding/family graph/field coverage/normalization/discrepancy/cross-shard重複/determinism/回帰を再計算・監査する。利用枠制限が現在発生していない限り過去の停止を制約にしない。調査・設計だけで止めず、実装再開後は本scopeの自動処理可能taskを続ける。

## G13. 改訂後の完了条件・一時停止

このgoalのcompleteは「今回合意したデータ確認・修正・安全な計算反映・保留管理・更新経路の整備が完了」を意味する。全2,268 candidateのstrict verified、全3,105登録claimのeligible、全未知解消、全データbaseline昇格を必要条件にしない。

completeは以下すべてを満たす場合のみ。

1. 有限受入対象表があり、既存台帳と必要dataset/field/7.0機能の処置が追跡できる。
2. Aの必要な安全接続、保留管理、version更新/既存強化/部分有効化の共通経路が実装・検証されている。
3. 本scopeで実行可能な確認・修正・取得・比較・verification・migration・regression等が完了し、残す内部実装taskがない。
4. in-scope未処理frontierがない。外部証拠待ちはG06を満たす保留へ処置済みであり、一律searchExhaustedや固定falseによる見かけの終了ではない。
5. 計算へ採用した新規/変更データは必要な証拠・依存関係・version・入力・テストを満たし、不明な効果を黙って適用していない。
6. 本scopeのawaitingUserDecisionが0。必須product仕様の削除・変更をSolだけで決めて完了にしない。
7. 7.0の対応/部分対応/未対応、保留理由・安全措置・reopen条件を利用者へ明示している。
8. Cの受入確認、必要な回帰、HSR差分なしが成立し、実数・根拠付き最終報告と保守引継ぎがある。

証拠が揃わず星拡散等をG06に従って保留した場合、「データ確認・修正・保留管理の今回作業」を終えられるが、「星拡散実装完了」「7.0完全対応」とは報告しない。証拠があるのに必要な実装/テストを残す場合はcomplete不可。後でユーザーが特定機能の完全提供を明示的な必須受入条件にした場合、その条件を保留で置き換えない。

状態を区別する。

- complete: 上記を満たす。保留件数をverified件数へ加算しない。
- awaitingUserDecision: 本当に必要な意味/仕様/contract判断が残り、他の自動laneを処理済み。completeではない。
- usageLimited: 確認できたシステム利用/実行制限で停止。usage_limit_exceededの実証跡、session/request、root/workerの区別を記録し、bounded worker終了や別エラーをusage上限と呼ばない。証跡不明なら停止理由不明と記す。complete/searchExhaustedへ変換しない。
- genuinelyBlocked: 必須受入条件を阻害する外部要因/権限/未解決条件が残り、G06の許容保留だけではgoalを満たせない。理由と再開条件を記録しcompleteにしない。
- pausedByUser: ユーザーの停止指示。明示resumeまで実作業を再開しない。

アプリのgoal状態操作は利用可能toolの制約に従う。これらは作業/受入状態であり、本文改訂のために未達goalをcomplete扱いしたり新規goalへすり替えない。

分類、raw取得、pilot、review packet、humanReviewReady、探索一周、A完了、少数candidate前進、保留ラベル付与だけでcompleteにしない。改善できるという理由だけで受入達成後も必須taskを追加し続けない。

## G14. checkpoint・KPI・テスト・報告

### Checkpoint

停止時はcurrent phase、dataset、family pair、version、shard/cursor、完了範囲、未処理queue、raw/manifests、比較/attestation/promotion/verified Spec、discrepancy、判断待ち/保留/blocked、各Lunaの状態と途中成果物、テスト、次task、停止理由を保存する。停止時の進捗率と分子/分母/算出根拠も残す。再開は正確な続きから行い、既存成果を再取得しない。

改訂時点の旧checkpointは実作業履歴として有効だが、旧い作業順/完了条件は本r2が優先する。次回は工程Aの差分確認から入り、旧381件scriptを自動実行しない。新たな実装checkpointへの更新は明示resume後に行う。

### KPI

単一のcanonical/2,268や主観的完了率を使わない。dataset別に最低限次を分離する。

- 今回の受入対象/処置済み（verified、修正、計算不要、保留、対象外を内訳表示）。
- 実際のstrict verified EffectSpec/BehaviorSpec、human/deterministicConsensus。
- canonicalEligible、active production、historical inactive、legacy superseded、nonCalculativeComplete。
- 7.0機能の対応済み/部分対応/未対応。機能ごとの受入条件を分母にする。
- source capture、version binding、lineage、field比較、consumer/実装、判断待ち、保留の件数。
- eligible certificateは実際の登録claim範囲を示し、全datasetの分母と偽らない。
- 自動処理可能task、未処理frontier、reopen trigger成立待ち。

### Tests

変更範囲に応じsource catalog strict audit、DataContract、state machine、certificate、attestation、family registry、queue determinism、canonical dry-run、legacy supersession、Calculation/UI regression、browser/headless E2E、git diff --check、HSR差分なしを確認する。

部分有効化では、未確認/旧versionの混入拒否、必要依存欠落、未知効果の0誤表示防止、局所無効化、再検証後の再開、重複補正/UID二重加算防止を確認する。手入力/UID、Lv/凸、精錬、反応、条件/stackを必要範囲でテストする。生成した値をそのまま期待値として循環検証しない。新規/変更/既存キャラ調整の共通経路の回帰を確保する。

### Final report

開始/終了差分をdataset別に示し、verified、promotion、Spec、supersession、成立policy、certificate、二源match/第三source解決、source/version/semantic不足、consumer待ち/保留を分けて報告する。Lunaのtask/shard/candidate/capture/comparison/Behavior件数とSolのreject/再処理を記録する。

最後にgoal state、残る自動taskの有無、真のユーザー判断、外部trigger待ちと条件、7.0の未対応範囲を明示する。

## G15. 改訂時点の実行停止

今回はgoal本文の改訂・履歴保存・自己レビューのみ。コード/schema/v2データ/Runtime/certificate/queueの実装変更、source取得、候補処理、テスト実行や生成処理、承認/promotionは行わない。

次回の明示resumeでは、本本文とrevision-review、現行checkpoint/queueを読み、工程Aの有限対象・必要接続の差分確認から開始する。旧成果とworker途中scriptを保存したまま、Solが作業順を決める。
