# 原神v2 deterministic verification・残存データpopulation完遂 `/goal`

前フェーズまでで、原神v2の構造設計、代表E2E、candidate全件分類、source frontier監査は完了済みです。

今回の `/goal` は代表パターンを再検証するフェーズではありません。

**既存v2基盤を修正・統合して安全な自動verificationを成立させ、その仕組みを使って残存する原神実データを継続的に検証・移行すること**を目的とします。

対象は原神側のみです。

**崩壊：スターレイル側は変更しないでください。**

親エージェントはSolとし、既存の `luna_worker` をsource取得・field比較・大量candidate処理等の実作業の主力として積極的に使用してください。

---

# 1. 現在状態を引き継ぐ

直前フェーズ終了時点では概ね以下です。

* candidate total: 2,268
* productionCanonical: 2
* verified BehaviorSpec: 1
* nonCalculativeComplete: 15
* human-review-ready: 1
* blocked: 2,249

主blocker：

* `sourceMissing`: 2,249
* `gameVersionUnbound`: 2,249
* `providerIndependenceUnknown`: 560
* `semanticDecisionRequired`: 1,689
* `consumerMissing`: 1,581
* `inputMissing`: 17
* `unsupported`: 17

既存terminal registry、provider policy、source evidence、review packet、探索履歴を再利用してください。

全面監査・代表E2Eを最初からやり直さないでください。

開始時は現在repositoryとの差分だけ確認し、現在値をbaselineにしてください。

---

# 2. 今回はverification契約変更を明示的に許可する

現行契約ではexternal factual claimは複数source一致でも `machineEvidenceReady / humanReviewReady` までしか自動進行できず、最終verificationにはhuman reviewerが必須です。

今回、この制約を変更してください。

ただしSol自身の自由判断による「AI自己承認」へ変更するのではありません。

**事前に定義された決定的ルールを専用のautomated attestation mechanismが適用する方式へ変更してください。**

今回の `/goal` への着手を、この deterministic consensus verification方式を導入することへのユーザー承認として扱って構いません。

---

# 3. verification modeを明確に分離する

少なくとも以下を表現してください。

* `verificationMode: human`
* `verificationMode: deterministicConsensus`

deterministicConsensusには、監査可能な `verificationAttestation` を持たせてください。

最低限：

* attestation engine ID / version
* policy ID / version
* source bundle digest
* required field set digest
* normalization rules digest
* generatedAt
* exact source revisions
* gameVersion binding
* field comparison result

を記録してください。

`reviewedBy` を機械verificationへ流用しないでください。

human verificationとautomated attestationをデータ上明確に区別してください。

---

# 4. eligibility authorityを一本化する

現在、

* source catalog strict audit
* verification state machine
* canonical generator
* terminal audit
* review pilot / review readiness

の判定が完全には一致していません。

大量population開始前に、**strict eligibilityの唯一のauthoritative sourceを一本化してください。**

推奨は、

**source catalog strict auditが生成するEligibility Certificate**

を唯一のstrict source eligibility authorityとすることです。

state machine、canonical generator、terminal audit、progress auditは、その同じcertificateを消費してください。

各層が独自にprovider/group/version flagを信用して別判定しないようにしてください。

---

# 5. Eligibility Certificate

certificateは最低限、

* candidate / claim ID
* exact source revisions
* raw artifact digest
* field digest
* source family IDs
* provider independence policy ID
* strict gameVersion binding
* required field coverage
* field agreement result
* normalization policy
* stale / invalidation status

を含めてください。

canonical gateは、必要なexternal claimについて有効なcertificateが存在することを直接要求してください。

---

# 6. source familyを中央管理する

独立性の単位はprovider名・URL・domainではなく、

**最終的なデータ生成root / source family**

です。

source family registryを一元化してください。

最低限：

* `familyId`
* `rootDataset`
* `acquisitionMethod`
* `transformChain`
* `mirrorOf`
* `forkOf`
* `usesApi`
* `translationOf`
* `datamineRoot`
* revision / release体系
* lineage evidence refs

を保持してください。

packetやcandidate側が自由文字列でindependence groupを名乗らないようにしてください。

---

# 7. 同一familyの扱い

以下は原則として同一source familyとして扱ってください。

* mirror / fork
* 同じAPIを使う複数site
* 同じupstream datasetの別projection
* 同じ原文の別言語
* 同じdatamine root
* 同じrepository由来の派生データ

例：

* genshin-db と Genshin Optimizer
  → `GenshinData-derived` として同一family
* HoYoWiki と HoYoLAB
  → `official-hoyoverse` として同一family
* official APIを表示しているだけのcommunity site
  → official family
* 同一client archive由来のdatamine
  → 原則同一family

異なるURL・domainだからという理由だけで独立二源として数えないでください。

---

# 8. deterministicConsensusの自動verification条件

external factual claimを自動verificationできるのは、以下をすべて満たす場合のみです。

## Source

* 独立source familyが最低2系統
* source-family registryで独立性確定済み
* provider pair policyがautomatic verification利用可能
* exact revision / release固定
* raw artifact取得済み
* field digest固定済み
* gameVersion manifestがexact revision / field evidenceへstrictに結合
* 全sourceが同一target gameVersion
* stale / invalidation検査合格

## Fields

RuntimeまたはSpec verificationに必要なfieldをschemaから機械的に列挙してください。

必要な、

* value
* unit
* target
* condition
* scope
* duration
* cooldown
* interval
* stack
* trigger
* hit count
* refinement
* その他candidate固有required fields

がすべて一致する必要があります。

原則としてcomparison resultは完全な `match` のみautomatic verification対象としてください。

以下はautomatic verification対象外です。

* `scopedMatch`
* subset
* superset
* partial match
* source silenceから推定したN/A

N/Aは決定的なapplicability proofがある場合のみ許可してください。

## Mapping / Runtime

* deterministic parser
* code provenance / digest
* source inputs verified
* mappingが一意
* destinationが一意
* legacy supersession対象が一意
* schema gapなし
* unsupportedなし
* inputMissingなし
* focused tests成功
* canonical dry-run成功
* Calculation / UI regression成功

を要求してください。

---

# 9. AI semantic inferenceは自動verification禁止

次を自動承認してはいけません。

* novelなtarget解釈
* novelなcondition解釈
* novelなscope解釈
* AIによる自由文semantic inference
* hidden mechanicの説明文だけからの推定
* custom formulaの意味判断
* consumer設計判断
* source discrepancyの主観的解決
* product / UX仕様判断

sourceに明示されたfieldをdeterministicに正規化することと、AIが意味を推測することを区別してください。

---

# 10. 2 source → 必要なら3 source

通常は独立2 source familyを使用してください。

2 sourceで、

* value不一致
* scope不一致
* condition不一致
* field不足
* translation ambiguity
* lineage疑義
* version疑義
* official wordingとmeasurementの差

がある場合は、可能なら第三の独立source familyを探索してください。

---

# 11. 3 sourceは多数決に使わない

3 sourceのうち2つが一致しただけでは自動verificationしないでください。

第三sourceを使って自動解決できるのは、

**不一致sourceを客観的理由で除外できる場合**

のみです。

例：

* target versionではない
* stale digest
* mirror / forkで独立していない
* 明示的に別scope
* provider-authored erratumで誤り確定

単純に、

`A = C, Bだけ違う`

という理由でBを棄却しないでください。

客観的に解決不能ならhuman decisionへ送ってください。

---

# 12. provider pair policy

`dataset × source-family pair`

単位でautomatic verification再利用policyを作成してください。

最低限：

* dataset
* family A / B
* independence evidence
* lineage
* release / revision方式
* strict gameVersion binding方式
* required field coverage
* automatic verification適用scope
* exclusions
* invalidation conditions
* policy version

を保持してください。

policyが成立した同一scopeについて、candidateごとに同じ独立性調査を繰り返さないでください。

---

# 13. 現在のprovider状況を前提にする

既知の監査結果を引き継いでください。

現時点では概ね：

* Weapon: HoYoWiki × genshin-db
  → 技術的には別familyだが既存承認はcandidate限定
* HoYoLAB × gcsim
  → family別、ただしgcsim strict version binding不足
* gcsim × genshin-db
  → family別、ただしgcsim version / field materialization不足
* Character/Behavior: Gachabase × genshin-db
  → Xiao C1限定、Gachabase lineage未解決
* Artifact: KQM × genshin-db
  → 50 field一致、KQM exact revision→gameVersion manifest不足
* TeyvatGuide × genshin-db
  → evidenceあり、TeyvatGuide lineage不明
* Genshin Optimizer × genshin-db
  → 同一GenshinData-derived familyのため独立二源不可
* HoYoWiki × HoYoLAB
  → 同一official family

です。

これらを毎回ゼロから再調査しないでください。

新証拠が得られた場合のみpolicyを更新してください。

---

# 14. `w_12516_reaction_bonus_2`

現在review待ちのこのcandidateを、即座にhuman approveまたはautomatic approveしないでください。

既存packetでは、

* HoYoWiki: Stellar-Conduct and Stellar Swirl
* genshin-db: Stellar-Conduct only
* comparison: `scopedMatch`

となっており、完全一致ではありません。

またprovider group表現やprimary registryとの統合にも問題があります。

まず今回の新基盤へ、

* canonical source family ID
* strict Eligibility Certificate
* primary candidate registry
* review / attestation状態

を統合してください。

その後、

完全 `match` が成立するならautomatic verification対象として再評価してください。

partial-clause / scope projectionが必要なままならautomatic verificationせず、

* 客観的な第三sourceで解決
* またはhuman decision

へ送ってください。

---

# 15. task queueを実データから生成する

現在の `autoProcessableNow: false` 固定方式は禁止してください。

task queueはcandidate evidenceから導出してください。

candidateごとに、

* source availability
* version binding
* source-family independence
* required field coverage
* comparison status
* mapping readiness
* consumer readiness
* schema readiness
* regression readiness

から、

**次に機械的に実行可能なtask**

を計算してください。

---

# 16. `searchExhausted`を一律付与しない

全blocked candidateへ一律 `searchExhausted` を設定することは禁止してください。

search exhaustionを付与する場合はcandidate / family / source frontierごとに、

* searched providers
* searched artifacts
* last searched
* search scope
* negative result
* reopen trigger

を保持してください。

---

# 17. authoritative queueを作る

progress / complete判定はterminal labelの件数ではなく、

**実際のtask queue**

を基準にしてください。

最低限queueでは、

* immediatelyAutomatable
* sourceCapture
* versionBinding
* lineageResolution
* fieldComparison
* deterministicMapping
* autoAttestation
* canonicalDryRun
* regression
* promotion
* awaitingUserDecision
* genuinelyBlocked

等を区別してください。

---

# 18. Lunaを大量処理の主力にする

Sol自身が数百～数千candidateの定型作業を抱え込まないでください。

`luna_worker` を繰り返し利用してください。

Lunaへ主に委任：

* provider別source capture
* release / manifest探索
* raw artifact / digest取得
* field抽出
* source-family graph候補生成
* deterministic normalization
* candidate × field comparison
* stale / invalidation確認
* coverage確認
* BehaviorSpec materialization
* consumer存在確認
* attestation候補packet生成
* regression fixture生成
* blocked再調査
* task shard処理

Lunaの文章そのものをverification evidenceにしないでください。

---

# 19. Luna task shard

大量処理は例えば、

`dataset × source-family pair × gameVersion × effect family`

単位へ分割してください。

目安：

* 単純field: 25～100 candidates / shard
* Behavior: 1～10 characters / shard
* discrepancy candidateは通常batchから分離

Luna同士に同一共有fileを同時編集させないでください。

append-only成果物またはshard単位成果物を作り、Solが統合してください。

---

# 20. Solの責任

Solは直接、

* source family最終確定
* provider pair policy
* normalization ontology
* source採否
* discrepancy原因判定
* partial / superset fieldの扱い
* schema / consumer設計
* candidate優先順位
* promotion diff
* regression判定
* human exception packet
* task queue
* goal状態判定

を担当してください。

---

# 21. Luna成果をSolが再計算・監査する

SolはLunaの結論だけを信用せず、

* digest
* version binding
* family graph
* candidate / field coverage
* duplicate family
* normalization
* discrepancy
* cross-shard duplicate
* generator determinism
* focused regression
* canonical regression

を必要に応じて再計算してください。

---

# 22. 実行順序

大量populationの前に、まず以下を完了してください。

## Phase 0: verification基盤統合

* deterministicConsensus契約
* automated attestation
* Eligibility Certificate
* authoritative source-family registry
* canonical gate統合
* state machine統合
* terminal/progress audit統合
* review pilot / primary registry統合
* evidence-derived task queue
* complete判定修正

これを完了したら、そのままpopulationへ進んでください。

**Phase 0完了だけでgoal completeにしないでください。**

---

# 23. 高レバレッジunlock probe

次に、既知の短いblocker解除候補を優先してください。

例：

* KQM exact revision → gameVersion manifest
* gcsim exact revision → Genshin version binding
* TeyvatGuide upstream lineage

既にかなり探索済みなので、各probeを無限探索しないでください。

成立すれば対応candidate群を直ちにqueueへ投入してください。

---

# 24. Dataset優先順位

基本優先順位：

1. Version 6.7 / current releaseの単純Weapon EffectSpec
2. KQM bindingが成立した場合のArtifact 2pc候補
3. 残Artifact
4. 明示fieldを持つBehavior候補
5. Behavior unknown群
6. TalentGap
7. inputMissing / unsupported

ただしSolは、unlockできたprovider policyやsource coverageを見て、より大量に安全処理できるlaneがあれば順序を変更して構いません。

---

# 25. Weapon population

単純な、

* stat
* damage bonus
* reaction bonus
* refinement table
* deterministic condition

等から同型batch処理してください。

automatic verification条件を満たしたcandidateはhuman reviewを挟まず、

`deterministicConsensus`
→ `canonicalEligible`
→ Runtime
→ production
→ legacy supersession
→ regression

まで進めてください。

---

# 26. Artifact population

KQM等のstrict version bindingが成立した場合は、既にfield agreementが得られているcandidateを優先して処理してください。

2pc / 4pc、condition、stack、consumerをfamily別に分けてください。

非damage / healing等はRuntime consumerとSpec verificationを分離して扱ってください。

---

# 27. BehaviorSpec

BehaviorSpecはRuntimeModifier化を完了条件にしません。

sourceから決定的に取得できる、

* duration
* cooldown
* interval
* charges
* hit count
* stack
* trigger
* state
* ICD
* energy
* summon
* periodic behavior
* off-field behavior

等をatomic fieldとしてverifiedへ進めてください。

AI semantic inferenceが必要なfieldはautomatic verification対象外です。

consumerが不要・未実装でも、verified Specとして完了可能です。

---

# 28. semantic ambiguity

`semanticDecisionRequired` を一律human decisionにしないでください。

まずLunaでsource原文・field候補をmaterializeしてください。

その後Solが、

* deterministic normalizationで解決可能
* source追加で解決可能
* 本当にsemantic human decision必要

へ分けてください。

AI自由解釈が必要なものだけhuman decisionへ送ってください。

---

# 29. inputMissing / unsupported

現在の共通schema / CalculationInput / Behavior consumerで安全に解決できるものは修正して構いません。

ただし新しい戦闘simulation基盤など、大規模な別機能へscopeを無制限に拡張しないでください。

現在productで本来必要な欠落なのか、将来consumerなのかをSolが判断してください。

---

# 30. human decisionの扱い

human decisionは例外です。

必要になった場合は、

* 対象
* source A / B / C
* gameVersion
* discrepancy
* 何が一致しているか
* 何だけ判断不能か
* 選択肢
* Solの推奨

を人間向けに簡潔に提示してください。

内部claim objectを大量に読ませないでください。

---

# 31. human decisionが出ても他laneを続ける

1件human decisionが必要になっても、独立して自動処理可能な別taskがある限り停止しないでください。

全自動laneを処理した後、残る進行条件がuser decisionのみの場合にだけ、

`awaitingUserDecision`

として一時停止してください。

---

# 32. goal状態

以下を明確に区別してください。

## `complete`

以下すべてを満たす場合のみ：

* evidence-derived task queueで自動処理可能task = 0
* 全automatic transition実行済み
* awaitingUserDecision = 0
* 未処理source frontier = 0
* 必要なproduction migration / verified Spec処理完了
* regression成功
* HSR差分なし
* objectiveを満たしている

## `awaitingUserDecision`

* 必要な機械調査・source探索済み
* 他の自動laneは処理済み
* 残るのが本当のsemantic / scope / contract判断だけ
* decision後に後続処理がある

**completeではありません。**

## `usageLimited`

* token / time / context等のシステム制限
* queue cursorと再開地点を保存

**complete / searchExhaustedへ変換しないでください。**

## `genuinelyBlocked`

* 全残laneが外部source、manifest、lineage、consumer、権限等を待つ
* blocker、search scope、last searched、reopen triggerあり

objective未達なら **completeではありません。**

---

# 33. complete判定の禁止事項

以下を理由にcompleteにしないでください。

* terminal classificationが終わった
* blocked件数を数えた
* pilotが終わった
* review packetを作った
* humanReviewReadyができた
* source探索を1周した
* Phase 0が完成した
* 一定件数だけcandidateが進んだ
* `autoProcessableNow`を固定falseにした
* `searchExhausted`を一律付与した

---

# 34. usageLimited checkpoint

停止前に最低限、

* current phase
* dataset
* source-family pair
* gameVersion
* shard
* queue cursor
* source capture済み
* manifests
* candidate comparison済み範囲
* auto attestation済み
* canonical promotion済み
* verified Spec
* discrepancies
* awaitingUserDecision
* genuinelyBlocked
* Luna task結果
* test結果
* 次回再開地点

を永続化してください。

---

# 35. KPI

単一の `canonical x / 2,268` を使わないでください。

最低限：

* total candidate
* verified EffectSpec
* verified BehaviorSpec
* deterministicConsensus verified
* human verified
* canonicalEligible
* productionCanonical
* legacy superseded
* nonCalculativeComplete
* awaitingUserDecision
* immediatelyAutomatable
* sourceCapturePending
* versionBindingPending
* lineagePending
* fieldComparisonPending
* consumerPending
* genuinelyBlocked

をdataset別に追跡してください。

---

# 36. テスト

変更範囲に応じて適切なテストを実施してください。

最低限、重要な節目で：

* source catalog strict audit
* verification state machine
* Eligibility Certificate
* deterministic attestation
* provider family registry
* task queue determinism
* DataContract
* canonical dry-run
* legacy supersession
* Calculation regression
* UI regression
* browser/headless E2E
* `git diff --check`
* HSR差分なし

を確認してください。

---

# 37. 最終報告

開始時・終了時の差分をdataset別に報告してください。

特に：

* deterministicConsensusで自動verifiedになったcandidate数
* automatic canonical promotion数
* verified BehaviorSpec増加数
* legacy supersession数
* provider policy成立数
* Eligibility Certificate数
* 2-source完全match数
* 3-source reconciliation数
* human decision送付数
* sourceMissing減少
* versionUnbound減少
* semanticDecisionRequired減少
* consumerPending
* genuinelyBlocked

を報告してください。

Lunaについて：

* task数
* shard数
* 処理candidate数
* source capture数
* field comparison数
* Behavior処理数
* Solがreject / 再処理した件数

を報告してください。

最後に必ず、

1. 現在のgoal state

   * `complete`
   * `awaitingUserDecision`
   * `usageLimited`
   * `genuinelyBlocked`

2. Sol / Lunaだけでまだ自動処理できるtaskが残っているか

3. ユーザー判断が本当に必要なcandidate

4. external trigger待ちがある場合、その具体的reopen条件

を明示してください。

**自動処理可能なtaskが残っている状態でgoal completeにしないでください。**
