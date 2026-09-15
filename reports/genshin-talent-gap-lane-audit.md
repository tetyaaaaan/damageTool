# Genshin talent-gap semantic lane audit

Status: **failed**

- shard: **talentGap:talentGapEffectSpec:semanticDecisionRequired:standard:01**
- candidates/entities: **70/24**
- local source records verified: **70**
- provider entity/field evidence available: **64** (field-level mapping remains separately gated)
- unresolved provider field mappings: **70**
- Traveler variant-ambiguous candidates: **4**
- strict candidate×claim certificate eligible: **0**
- canonical promotion: **forbidden (0)**

## Work packets

| status | candidates |
| --- | ---: |
| providerEvidenceMissing | 6 |
| providerFieldMappingUnresolved | 60 |
| travelerVariantIdentityUnresolved | 4 |

## Provider field mapping

| status | candidates |
| --- | ---: |
| ambiguousVariant | 4 |
| unresolvedLabelBridge | 66 |

The existing 6.7/7.0 genshin-db snapshots are inventoried by immutable path, raw SHA-256, field locator, and observed gameVersion. Their single GenshinData-derived family is not an independent second claim source, and snapshot gate booleans are not treated as proof.

Japanese local passive text and provider English passiveN fields are retained as separate observations. The bounded localized capture supplies an exact Japanese-name → same-provider-key bridge for the 63 non-Traveler candidates in both pinned revisions; it is an identity/key bridge only, not independent semantic evidence. `passive_1` → `passive1` ordinal similarity alone is not proof; Traveler IDs 10000005 and 10000007 remain separate and variant-ambiguous.

No prose semantic inference, review approval, eligibility certificate, canonical promotion, queue mutation, or source reacquisition was performed.

Field digest: `b17832dd1e3fc051e6e9e3ce09a38065300334eeae9b59264245025fe02b1679`
