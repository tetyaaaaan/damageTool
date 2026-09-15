# Genshin v2 candidate terminal-state audit

Status: **passed**

BehaviorSpec verification and Runtime canonical promotion are reported separately. Every blocked candidate has an exclusive primary reason plus all overlapping blockers, explicit completion requirements, automation status, and wait owner.

| candidate layer | total | productionCanonical | awaitingHumanReview | verifiedSpec | nonCalculativeComplete | blocked | unclassified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| artifactEffectSpec | 128 | 0 | 0 | 0 | 0 | 128 | 0 |
| behaviorSpec | 1583 | 0 | 0 | 1 | 0 | 1582 | 0 |
| behaviorModifier | 36 | 0 | 0 | 0 | 0 | 36 | 0 |
| talentGapEffectSpec | 70 | 0 | 0 | 0 | 0 | 70 | 0 |
| weaponEffectSpec | 455 | 0 | 0 | 0 | 64 | 391 | 0 |
| **total** | **2272** | **0** | **0** | **1** | **64** | **2207** | **0** |

Automatically processable now: **0**

Evidence-derived next task: **source-search:artifact:15022:fourPiece:4pc_sea_dyed_foam_damage** (sourceResearchAvailable)

Search frontier: exhausted **1057**, deferred **0**, required **1188**.

## Exclusive primary blocked reason

| reason | candidates |
| --- | ---: |
| sourceMissing | 436 |
| semanticDecisionRequired | 1688 |
| unsupported | 6 |
| inputMissing | 39 |
| displayOnly | 38 |

## All blocked reasons (overlapping)

| reason | candidates |
| --- | ---: |
| sourceMissing | 2207 |
| gameVersionUnbound | 2207 |
| providerIndependenceUnknown | 519 |
| providerIndependenceCorrelated | 1688 |
| semanticDecisionRequired | 1688 |
| unsupported | 6 |
| inputMissing | 39 |
| displayOnly | 38 |

## Wait owner (overlapping)

| wait | candidates |
| --- | ---: |
| source/provider | 2207 |
