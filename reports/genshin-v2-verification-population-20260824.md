# Genshin v2 verification population — 2026-08-24

## Outcome

The previous 2,265 blocked candidates were reduced to 2,249. One fresh weapon candidate is now `awaitingHumanReview`, and all 15 records previously blocked only as `displayOnly` are closed as `nonCalculativeComplete` (14 superseded legacy duplicates and one explicit non-damage display record).

| metric | start | end | delta |
| --- | ---: | ---: | ---: |
| productionCanonical | 2 | 2 | 0 |
| human-review-ready | 0 | 1 | +1 |
| verified EffectSpec | 1 | 1 | 0 |
| verified BehaviorSpec | 1 | 1 | 0 |
| nonCalculativeComplete | 0 | 15 | +15 |
| sourceMissing | 2,265 | 2,249 | -16 |
| gameVersionUnbound | 2,265 | 2,249 | -16 |
| providerIndependenceUnknown | 576 | 560 | -16 |
| semanticDecisionRequired | 1,689 | 1,689 | 0 |
| consumerMissing | 1,581 | 1,581 | 0 |
| inputMissing | 17 | 17 | 0 |
| unsupported | 17 | 17 | 0 |
| displayOnly blocker | 15 | 0 | -15 |
| total blocked | 2,265 | 2,249 | -16 |

Machine-evidence-ready increased from 3 to 4. No candidate was self-approved, no canonical promotion was performed, and no HSR file was changed.

## New strict review batch

`w_12516_reaction_bonus_2` (A Teaspoon of Transcendence / Stellar-Conduct bonus) now has a fresh candidate-scoped packet. This is not reuse of the approved ATK clause.

- Source A: HoYoverse HoYoWiki entry 10949, reaction-clause text digest, Luna VIII bound by the official Version 6.7 update.
- Source B: genshin-db revision `1bab2cdba4d218fd5caa46b5f54e7884ee8359a2`, exact weapon file and the same-revision 6.7 package manifest.
- Compared fields: target, Charged Attack hit condition, R1–R5 values `16/20/24/28/32%`, duration `5s`, acquisition interval `0.2s`, maximum `3` stacks, unit, and deterministic runtime route.
- Scope boundary: HoYoWiki additionally names Stellar Swirl while genshin-db names Stellar-Conduct only. Both support the candidate's Stellar-Conduct target. The additional Stellar Swirl meaning and the superseded `w_12516_reactionBonus_d0fe6e2e` record are explicitly excluded from this packet.
- State: `humanReviewReady`; canonical eligibility remains false until a human approves, holds, or rejects it.

## New evidence held behind external gates

KQM Theorycrafting Library supplied 50 immutable artifact two-piece field records at revision `247c620b0ab9d5436bd10cf65ce2983972e0a0c1`. All 50 normalized comparisons match the local two-piece candidates. The records remain `evidenceOnlyBlocked` because KQM has no provider-authored manifest that binds that exact revision/blob/digest to Genshin 6.7.

TeyvatGuide `v0.11.0-beta` / commit `89646817a7e9e8d14477558d4e5f70197be42204` independently exposed the weapon 12516 reaction values and an explicit 6.7 resource release. It remains corroboration only because its processed-data upstream lineage is not sufficiently disclosed to prove independence from GenshinData-derived providers.

Two new dataset-pair policy records preserve these finite frontiers and reopen conditions. Neither is marked reusable.

## Behavior and non-source lanes

Eight additional Xiao timing/count/lifecycle candidates were checked against the existing Gachabase and genshin-db pins. The retained Gachabase and genshin-db materialized records contain only the already-reviewed C1 charge fields, not fresh normal/passive/burst/C6 field values. The eight candidates therefore remain blocked; no readiness was fabricated and the existing C1 approval was not reused.

All 17 `inputMissing` candidates already have suitable generic input/control routes, but the actual run-state value must come from the user or provider at calculation time. All 17 `unsupported` candidates require either source/semantic review, a custom shared formula/schema, or a product decision for healing-only consumers; zero safe automatic conversions were found.

The 15 former `displayOnly` blockers were closed explicitly:

- 14 `SUPERSEDED_RECORD` legacy duplicates are `nonCalculativeComplete` while their structured successors retain their own independent state.
- `w_12402_extraDamage_4ff89bef` is `EXPLICIT_DISPLAY_ONLY` and is also `nonCalculativeComplete`.

## Delegated processing and tests

- Luna assignments: 3 (weapon sources, artifact sources, Behavior plus non-source blockers).
- Candidate-level checks: 108 (50 artifact, 8 Xiao Behavior, 49 non-source blockers, 1 weapon reaction candidate).
- New field comparisons persisted: 60 (50 artifact plus 10 weapon reaction comparisons).
- New human-review batches: 1 candidate.
- Behavior candidates examined: 8; advanced: 0 because exact field records were absent.
- Full Genshin test run: 496 tests, 495 passed, 1 intentionally skipped, 0 failed.
- Added/focused evidence and terminal tests also pass.
- `git diff --check` passes for the changed verification files.
- HSR diff: empty.

## Remaining boundary

No large automatically processable batch remains under the current strict contract. Reopen automatically when a provider supplies an immutable, exact-revision game-version manifest, complete field records, or independent lineage disclosure. The immediate human action is the candidate-scoped decision for `w_12516_reaction_bonus_2`; approval must not be interpreted as approval of Stellar Swirl, the superseded duplicate, another weapon, or provider-pair reuse.
