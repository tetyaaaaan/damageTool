# Genshin v2 migration progress

## Finite completion and evidence KPIs

Finite candidate acceptance ratios, not effort/time estimates. Evidence inventory and raw-capture linkage do not satisfy verification or production gates. Cohorts are the current authoritative queue, not an expanding backlog.

| KPI | numerator / denominator | percent | basis |
| --- | ---: | ---: | --- |
| candidateCompletion | 15 / 2268 | 0.6614% | Current queue task.status=complete; historical verifiedSpec awaiting target-version re-verification is excluded. |
| currentBehaviorSpecCompletion | 0 / 1582 | 0% | BehaviorSpec completion only; no Runtime requirement is imposed on this layer and old-version verification is not counted. |
| productionCanonicalCandidates | 0 / 671 | 0% | Weapon/artifact/talent-gap EffectSpec and behaviorModifier, excluding explicitly completed non-calculative candidates; counts candidates, not generated modifiers. |
| strictClaimEligibility | 0 / 3105 | 0% | Current certificate registry only; not a claim that all required fields of all candidates have been materialized. |
| bulkCaptureLinkage | 1944 / 2268 | 85.7143% | Queue links to captured transition snapshots; may include historical, partial or ambiguous records. This is not complete field evidence or independent-source coverage. |
| sourceCoverageReconciliation | 1914 / 1914 | 100% | Fresh raw-integrity/coverage reconciliation of the explicitly annotated cohort, not source agreement or verification. |
| localizedTalentFieldMapping | 63 / 67 | 94.0299% | Validated localized-name/provider-key mapping in the bounded reconciliation lane; unresolved Traveler variants remain in the denominator. Mapping does not approve semantics. |

- legacy Runtime modifiers: **1561**（全件 legacyCompatible）
- canonical Runtime modifiers: **0**
- v2 effect candidates: **650**
- v2 behavior pilot: **56 specs / 36 modifiers**
- v2 behavior inventory: **1693 candidates**
- normalized behavior batches: **1526 specs**（全件 needsReview / Runtime blocked）
- independently audited field claims: **12122**（dual-source eligible 5）
- gameVersion evidence: **2 revision-pinned sources / 1 strictly bound sources / 9 field provenance / 0 canonical**
- independent weapon evidence: **9 records / 145 field comparisons / 9 independent provider pairs / 0 same-lineage pairs / 0 canonical**
- review readiness: **5315 claims require machine evidence / 0 human-review ready / 0 human semantic decisions now**
- review packets: **2 packets / 26 field items / 2 held for evidence / 0 canonical**
- gcsim weapon field evidence: **145 fields / 72 candidate-value agreements / 0 conflicts / 0 canonical-eligible**
- gcsim mismatch triage: **35 mechanically resolved / 0 direct value mismatch / 0 semantic discrepancies / 0 scope mismatch / 0 parser limitation / 0 schema gaps / 4 registry lifecycle mapped / 0 genuine value conflicts / 0 unmapped**
- official weapon pilot: **3 official sources (3 snapshot reviews pending) / 3 R1 matches / 0 complete refinement claims / 0 canonical**
- Optimizer pilot evidence: **10 fields / 8 candidate-value agreements / correlated provider / 0 canonical-eligible**
- KQM artifact evidence: **50 two-piece field comparisons / 50 agreements / 50 KQM gameVersion-unbound / 0 canonical-eligible**
- weapon Runtime route contract: **455 routed / 455 supersession-linked / 455 namespaced / 455 uidHandling copied**（1362 route claims needsReview）
- artifact Runtime route contract: **122 routed / 122 supersession-linked / 122 namespaced**（122 specs review-gated）
- artifact gap review: **3 unstructured / 4 display-only sets / 1 value contract needs review**
- character external locator evidence: **258 mappings / 0 value-supporting / 0 canonical**
- character field materialization: **258 fields / 74 materialized sources / 0 canonical**
- canonical Runtime gate: **2268 audited / 2 retained / 0 active / 2 pending revalidation**（overlay-only loader gate, legacy remains active）
- canonical UI/calculation synthetic E2E: **4 generated / 4 loaded / production 0 canonical**
- terminal states: **0 productionCanonical / 0 awaitingHumanReview / 1 verifiedSpec / 15 nonCalculativeComplete / 2252 blocked / 0 unclassified**
- evidence-derived task queue: **sourceResearchAvailable**（next **source-search:artifact:15022:fourPiece:4pc_sea_dyed_foam_damage**）
- automatic transitions remaining now: **0**（machine task only; human/source/consumer gates remain separate）
- task waits: **human 0 / reconciliation 0 / consumer 0 / source-provider 2252 / search-exhausted 203 / deferred 0**
- candidate×claim eligibility certificates: **3105 claims / 0 eligible / 3105 blocked / auto-attestation 0 / promotion 0**
- status inventory: **2266 unverified candidates / 12117 source-insufficient claims / 0 comparison mismatches / 0 genuine value conflicts**
- legacy classifications: **282 unsupported / 83 display-only / 68 input-missing / 37 invalid**

| target | total | candidate/audited | canonical | remaining evidence |
| --- | ---: | ---: | ---: | ---: |
| weapons | 455 modifiers | 455 | 1 | 455 needs independent evidence |
| weapon external field evidence | 9 pinned files | 145 fields | 0 | 9 sources lack gameVersion |
| official weapon pilot | 2 weapons | 3 official claim fields | 0 | 0 complete refinement claims |
| Optimizer field evidence | 4 pinned files | 10 fields | 0 | correlated provider; 4 sources lack gameVersion |
| artifacts | 122 modifiers | 122 | 0 | 122 needs independent evidence |
| characters | 117 | 92 complete / 25 partial | 0 | 25 unstructured |
| character external evidence | 78 locators | 258 mappings | 0 | 0 materialized / 129 needs review |
| character field materialization | 31 characters | 258 fields | 0 | 74 sources materialized / 258 blocked |
| talent modifier gaps | 25 characters | 73 blocked specs | 0 | 0 no-effect / 25 unstructured / 0 uninvestigated |
| constellation text inference | 84 | 84 | 0 | 0 explicit / 54 partial / 21 unconfirmed / 9 mismatch; 2 quarantined |
| timing/count behavior | 117 characters | 8 pilot / 1693 inventory / 1526 normalized | 0 | 0 characters remain |

候補件数とcanonical件数は分離している。Spec候補の生成だけでは完了とせず、複数情報源のフィールド一致、独立レビュー、Runtime接続、UI・計算回帰まで完了したものだけをcanonicalとして数える。

Static test inventory: 142 files / 803 direct test calls. Dynamic loop-generated cases are counted by the Node test runner, not this static inventory.
