# Genshin weapon independent field evidence

- Audit status: **passed**
- Evidence packets: **9/9**
- Field comparisons: **145**
- Official gameVersion linked: **9**
- gcsim gameVersion still missing: **9**
- Independent provider pairs: **9**; same-datamine pairs counted: **0**
- Source agreement full/partial/mismatch/not-comparable: **0/16/0/129**
- Spec agreement match/mismatch: **121/24**
- Human judgment required now / machine follow-up only: **0/145**
- Canonical eligible: **0**

## Evidence packet batches

The packets below are generated for later review. No packet is self-approved and no packet is canonical.

### pilot-primary

- Purpose: Official numeric pilot evidence versus gcsim; version gap remains explicit.
- Targets: 11503 (Freedom-Sworn), 15502 (Amos' Bow)

- **11503 Freedom-Sworn** — official 1.6; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/11503/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
- **15502 Amos' Bow** — official 1.2; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/15502/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
  - w_15502_damage_1/value: A={"1":12}; B={"1":12,"2":15,"3":18,"4":21,"5":24}; Spec={"1":12,"2":15,"3":18,"4":21,"5":24}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value explicitly printed in the official Version 1.2 description. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15502_damageBonus_fc388315/value: A={"1":8}; B={"1":8,"2":10,"3":12,"4":14,"5":16}; Spec={"1":8,"2":10,"3":12,"4":14,"5":16}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value and 0.1s interval are explicit; the official article states a maximum of five occurrences. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15502_damageBonus_fc388315/stack: A={"min":0,"max":5,"intervalSeconds":0.1}; B={"min":0,"max":5,"default":0,"intervalSeconds":0.1}; Spec={"min":0,"max":5,"default":0}; source=partialMatch; spec=partialMatch; human=no.
    - Note: Stack cap and interval are explicit, but refinement-dependent values are not complete. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15502_damage_1/refinement: A={"1":12}; B={"1":12,"2":15,"3":18,"4":21,"5":24}; Spec={"1":12,"2":15,"3":18,"4":21,"5":24}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value explicitly printed in the official Version 1.2 description. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15502_damageBonus_fc388315/refinement: A={"1":8}; B={"1":8,"2":10,"3":12,"4":14,"5":16}; Spec={"1":8,"2":10,"3":12,"4":14,"5":16}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value and 0.1s interval are explicit; the official article states a maximum of five occurrences. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.

### versioned-primary

- Purpose: Newer weapon official release/update material with field-level comparison where R1 text exists.
- Targets: 11509 (Mistsplitter Reforged), 11518 (Athame Artis), 12430 (Fruitful Hook), 15516 (Golden Frostbound Oath)

- **11509 Mistsplitter Reforged** — official 2.0; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/11509/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
  - w_11509_damageBonus_ae1b42da/stack: A={"min":0,"max":3}; B={"min":0,"max":3,"default":0}; Spec={"min":0,"max":3,"default":0}; source=partialMatch; spec=fullMatch; human=no.
    - Note: The official text supports the maximum stack count, not the complete refinement value table. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
- **11518 Athame Artis** — official Luna III; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/11518/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
- **12430 Fruitful Hook** — official 5.5; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/12430/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
- **15516 Golden Frostbound Oath** — official Luna VI; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/15516/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
  - w_15516_stat_1/value: A={"1":16}; B={"1":16,"2":20,"3":24,"4":28,"5":32}; Spec={"1":16,"2":20,"3":24,"4":28,"5":32}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_damage_2/value: A={"1":40}; B={"1":40,"2":50,"3":60,"4":70,"5":80}; Spec={"1":40,"2":50,"3":60,"4":70,"5":80}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 self Geo value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_reaction_bonus_3/value: A={"1":40}; B={"1":40,"2":50,"3":60,"4":70,"5":80}; Spec={"1":40,"2":50,"3":60,"4":70,"5":80}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 self reaction value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_damage_5/value: A={"1":20}; B={"1":20,"2":25,"3":30,"4":35,"5":40}; Spec={"1":20,"2":25,"3":30,"4":35,"5":40}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 party Geo value is explicit, but the candidate scope/trigger remains review-gated. The numeric assignment is direct, but this candidate does not encode the team/nearby scope or moondrift requirement. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_reaction_bonus_4/value: A={"1":20}; B={"1":20,"2":25,"3":30,"4":35,"5":40}; Spec={"1":20,"2":25,"3":30,"4":35,"5":40}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 party reaction value is explicit, but the candidate scope/trigger remains review-gated. The numeric assignment is direct, but this candidate does not encode the team/nearby scope or moondrift requirement. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_stat_1/refinement: A={"1":16}; B={"1":16,"2":20,"3":24,"4":28,"5":32}; Spec={"1":16,"2":20,"3":24,"4":28,"5":32}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_damage_2/refinement: A={"1":40}; B={"1":40,"2":50,"3":60,"4":70,"5":80}; Spec={"1":40,"2":50,"3":60,"4":70,"5":80}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 self Geo value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.
  - w_15516_reaction_bonus_3/refinement: A={"1":40}; B={"1":40,"2":50,"3":60,"4":70,"5":80}; Spec={"1":40,"2":50,"3":60,"4":70,"5":80}; source=partialMatch; spec=fullMatch; human=no.
    - Note: R1 self reaction value is explicit; the complete refinement table is not in the official excerpt. Named Go assignment evaluated for refinement indices 1..5; no unanchored number search was used. Only the explicitly published official subset matches; unlisted refinement ranks remain unproven.

### legacy-identity

- Purpose: Official identity/version evidence; numeric field source is still absent from the first-party excerpt.
- Targets: 12402 (The Bell), 14402 (The Widsith), 15402 (The Stringless)

- **12402 The Bell** — official 4.8; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/12402/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
- **14402 The Widsith** — official 4.4; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/14402/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote
- **15402 The Stringless** — official 4.4; gcsim null; no immediate human judgment; machine follow-up only; canonical: 0.
  - Runtime: weaponModifiers/15402/modifiers
  - Recommended decision: retain_all_candidates_as_needsReview; do_not_promote

## Interpretation and blockers

- Official source A has an explicit gameVersion for every packet.
- Source B is independently implemented gcsim with fixed revision/path/SHA, but its gameVersion remains null because a commit is not a patch-version declaration.
- Numeric agreement at R1 or a stack cap is recorded as partial/full evidence only; it does not satisfy complete refinement, version, or review gates.
- Derived datamine/repost sources are excluded from the independent pair and are not used to fill missing values.
- `needsReview` is retained everywhere; AI does not self-approve and canonical promotion remains forbidden.

## Audit errors

- none

## Audit warnings

- none
