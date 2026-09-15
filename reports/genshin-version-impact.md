# Genshin version impact audit

Status: **transitionEvidenceMissing**

Transition: **6.7 → 7.0**

Potentially affected candidates: **2268**

Known changed candidates: **behavior:10000022:constellation:constellation-1, behavior:10000022:constellation:constellation-2, behavior:10000022:constellation:constellation-3, behavior:10000022:constellation:constellation-4, behavior:10000022:constellation:constellation-5, behavior:10000022:constellation:constellation-6, behavior:10000022:talent:burst, behavior:10000022:talent:normalattack-charged, behavior:10000022:talent:normalattack-normal, behavior:10000022:talent:normalattack-plunging, behavior:10000022:talent:passives-passive-1, behavior:10000022:talent:passives-passive-2, behavior:10000022:talent:passives-passive-utility, behavior:10000022:talent:skill, behavior:10000039:constellation:constellation-1, behavior:10000039:constellation:constellation-2, behavior:10000039:constellation:constellation-3, behavior:10000039:constellation:constellation-4, behavior:10000039:constellation:constellation-5, behavior:10000039:constellation:constellation-6, behavior:10000039:talent:burst, behavior:10000039:talent:normalattack-charged, behavior:10000039:talent:normalattack-normal, behavior:10000039:talent:normalattack-plunging, behavior:10000039:talent:passives-passive-1, behavior:10000039:talent:passives-passive-2, behavior:10000039:talent:passives-passive-utility, behavior:10000039:talent:skill, behavior:10000058:constellation:constellation-1, behavior:10000058:constellation:constellation-4, behavior:10000058:talent:burst, behavior:10000058:talent:normalattack-normal, behavior:10000058:talent:passives-passive-1, behavior:10000058:talent:skill, behavior:10000071:constellation:constellation-1, behavior:10000071:constellation:constellation-2, behavior:10000071:constellation:constellation-3, behavior:10000071:constellation:constellation-4, behavior:10000071:constellation:constellation-5, behavior:10000071:constellation:constellation-6, behavior:10000071:talent:burst, behavior:10000071:talent:normalattack-charged, behavior:10000071:talent:normalattack-normal, behavior:10000071:talent:normalattack-plunging, behavior:10000071:talent:passives-passive-1, behavior:10000071:talent:passives-passive-2, behavior:10000071:talent:passives-passive-utility, behavior:10000071:talent:skill, talent-gap-spec:10000039:passive_1, talent-gap-spec:10000039:passive_2, talent-gap-spec:10000039:passive_utility, talent-gap-spec:10000058:passive_1, talent-gap-spec:10000058:passive_2, talent-gap-spec:10000058:passive_utility, w_12516_reaction_bonus_2**

Certificates requiring target-version revalidation: **3105**

- Expand the validated target-version provider snapshot from candidate-scoped materialization to complete repository-candidate coverage.
- Materialize the target-version raw datasets and compute entity-level diffs.
- Map each changed or unmapped entity to candidate×claim IDs; unknown mappings remain invalidated.
- Recompute source/raw/field digests, certificates, Runtime, consumer routes, and regression evidence before accepting a new baseline.
