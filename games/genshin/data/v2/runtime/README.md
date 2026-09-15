# Canonical runtime promotion contract

Authoring and acceptance follow the [v2 authoring standard](../../../../../docs/GENSHIN_V2_DATA_AUTHORING_STANDARD.md) and [r2 goal](../../../../../docs/genshin-goals/2026-08-28-realignment/revised-goal.md), especially G04–G07. This document does not grant provider-pair approval.

`genshinCanonicalRuntimeGenerate.cjs` is the only producer described by this
directory.  It maps reviewed, structured v2 specifications to the existing
calculator modifier fields without parsing effect prose.  A record is emitted
only when the shared evidence gate proves:

- `verification.status=verified` and `sourceAgreement=agreed`, with the applicable human review or deterministicConsensus proof. Human review uses reviewer/time; automated attestation must not impersonate a human reviewer;
- valid candidate-by-claim Eligibility Certificates from the strict source audit, bound to actual revisions, raw/field digests, independent root families, target game-version evidence and required coverage, plus implementation provenance and stale/invalidation checks;
- every source reference resolves to a non-empty provider, evidence group,
  and game version;
- at least two provider names in at least two independent evidence groups
  support the specification and every `verified` field claim (with two or
  more claim references);
- `destination` and `supersedesLegacyModifierIds` are explicitly supplied;
- effect fields needed by the calculator (`kind`, `targets`, activation
  condition/support/UID policy, and an explicit value source) are present.

Current coverage is reported by the authoritative queue and acceptance artifacts; historical verified records do not establish active target-version coverage. Synthetic passing fixtures exercise the contract without proving real gameplay data.

`canonical-runtime.json` is the materialized repository output. The browser
loader accepts only this generator version, re-runs the v2 provenance gate,
validates the structured destination, and atomically removes every declared
legacy supersession target before inserting the canonical modifier. Missing
targets, duplicate IDs, unsupported routes, or forged producer metadata are
rejected. Version-invalid records stay inactive; unrelated calculation routes remain available. A verified Spec with missing consumer support remains Runtime blocked. Required EffectSpec/BehaviorSpec dependencies must be satisfied together; shared source references alone do not guarantee atomic application.

`destination` is a placement object, not a free-form label:
`{dataset, entityId, collection, sourceId?, level?}`. The dataset and
collection are allowlisted to existing calculator collections so a loader can
route a modifier without guessing: weapons use `modifiers`, artifacts use
`onePiece`/`twoPiece`/`fourPiece`, talents use `passive` plus `sourceId`, and
constellations use `constellation` plus `level`. Behavior modifiers are
stored in the dedicated `behaviorModifiers.modifiers` route as structured
`targetSpecId`/`path`/`operation` records. No production behavior modifier is
promoted until its field claims and sources pass the same canonical gate.

Field claims use exact dotted paths (`effect.kind`, `effect.targets`,
`effect.activation.condition`, `effect.value`, `destination`, and
`supersedesLegacyModifierIds`). Every copied field must have a matching
`verification.claims[path].status=verified`; a broad `activation` claim does
not cover its child fields.
