# Genshin Optimizer field evidence audit

- Status: **passed**
- Pinned GO source records: **4** (weapons 2, artifacts 2)
- Semantic field records: **10**
- Eligible value fields: **8**
- needsReview fields: **2**
- supportsClaimValue=true: **8**
- Canonical eligible fields/candidates: **0/0**
- Game-version-missing source records: **4**
- Independence groups: **{"GenshinData-derived":4}**
- Materialized checkout: **{"notMaterialized":4}**

## Interpretation

Each mapped value is tied to a named TypeScript assignment and a pinned path/SHA at GO commit `0c9bde8f99ec1561e66aa0114668e8cdc0b8aca2`. The artifact does not search arbitrary numeric tokens.

GO's `gi-stats` data path is datamine-derived, so it is recorded as `providerIndependence=correlated`, `independenceGroup=GenshinData-derived`; it must not be counted as an independent provider beside gcsim.

The commit and file digests are revision evidence only. No explicit Genshin game patch/version was found, so every field remains gameVersionVerified=false and canonicalEligibility=false.

## Blocked reasons

- externalSourceRootNotConfigured: 4
- gameVersionMissing: 10
- gameVersionNotExplicit: 4
- independentReviewerRequired: 10
- providerNotIndependent: 14

## Errors

- none

## Warnings

- none
