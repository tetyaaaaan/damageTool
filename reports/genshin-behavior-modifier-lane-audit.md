# Genshin behavior-modifier lane audit

Status: **passed**

- shard: **behavior:behaviorModifier:semanticDecisionRequired:standard:01**
- candidates: **36**
- unique target BehaviorSpecs: **18**
- source refs resolved: **36/36**
- bulk transition capture: **36 unassigned**
- certificate eligible: **0**
- canonical promotion: **forbidden (0)**

## Reconciliation classes

| class | candidates |
| --- | ---: |
| historicalCanonicalPendingRevalidation | 1 |
| singleCorrelatedOrMissingEvidence | 35 |

## Source evidence classes

| class | candidates |
| --- | ---: |
| historicalIndependentReviewEvidence | 1 |
| singleCorrelatedLocalSourceEvidence | 35 |

Xiao's scoped historical review is retained as `historicalCanonicalPendingRevalidation`; it is not reused for the other 35 candidates.

Source-record provider/version flags and review booleans are retained as observations only. Same-family records do not establish source agreement; no independent-source proof, eligibility certificate, or canonical promotion is accepted by this lane.

All values, conditions, paths, and target scopes are copied as observed fields only.  No semantic inference, certificate issuance, or canonical promotion is performed.
