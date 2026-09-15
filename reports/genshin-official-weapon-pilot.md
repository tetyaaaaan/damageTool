# Genshin official weapon pilot audit

Status: **passed**; promotion gate: **blocked**; canonical eligibility: **0**

This is an evidence-only pilot. It records official HoYoLAB update-note claims and compares them with pinned gcsim implementation evidence. It does not alter existing candidates, modifiers, packages, or canonical runtime data.

| weapon ID | weapon | official gameVersion | official claim fields | R1 matches | status |
| --- | --- | --- | ---: | ---: | --- |
| 11503 | Freedom-Sworn | 1.6 | 0 | 0/0 | blocked |
| 15502 | Amos' Bow | 1.2 | 3 | 3/3 | blocked |

- Official sources: **3**; explicit gameVersion: **3**.
- Official claim fields: **3**; complete refinement tables: **0**; R1-only claims: **3**.
- Independent comparison fields: **3**; R1 matches: **3**.
- Canonical eligibility: **0**; promotion gate: **blocked**.

## Findings

- Amos' Bow: the official Version 1.2 patch note states the R1 12% base Normal/Charged Attack bonus, the R1 8% per-0.1-second flight-time bonus, and a maximum of five occurrences. It does not state the complete R2-R5 table, so the claim remains partial and blocked.
- Freedom-Sworn: official Version 1.6 pages identify the weapon and version but do not state passive numeric fields in the retained article text. No field value is inferred from gcsim or legacy data.
- Existing modifiers are not superseded. A future promotion must add complete official field/refinement claims, an independent review, and a canonical-runtime regeneration audit.

## Blocked reasons

- `11503:officialFieldValuesMissing`
- `11503:officialRefinementTableMissing`
- `11503:canonicalGateRequiresFieldEvidence`
- `15502:officialRefinementTableMissing`
- `15502:officialFieldScopeOnlyRefinement1`
- `15502:canonicalGateRequiresCompleteClaim`

Audit errors: **0**; warnings: **0**.
