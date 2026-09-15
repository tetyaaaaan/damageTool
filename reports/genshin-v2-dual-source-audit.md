# Genshin v2 dual-source audit

This reproducible report joins the existing weapon/artifact SourceRecords, legacy registries and the pinned v2 source catalog at `verification.claims` field granularity. It does not alter or canonicalize any candidate.

## Counts

- candidates: **455 weapons**, **122 artifacts** (total **577**)
- claims: **12122** (9560 weapon, 2562 artifact)
- dual-source eligible: **5 claims / 1 candidates**
- conflicts: **0**; canonical eligibility: **1**
- gcsim pinned entity files matched to weapons: **9** (11503, 11509, 11518, 12402, 12430, 14402, 15402, 15502, 15516)

### Claim classifications

| classification | claims |
| --- | ---: |
| `dual-source eligible` | 5 |
| `same-provider duplicate` | 11445 |
| `single-source` | 21 |
| `conflict` | 0 |
| `missing-version` | 651 |

### Candidate classifications (weakest claim gate)

| classification | candidates |
| --- | ---: |
| `dual-source eligible` | 1 |
| `same-provider duplicate` | 545 |
| `single-source` | 0 |
| `conflict` | 0 |
| `missing-version` | 31 |

## Interpretation

- `damageTool-local` and `damageTool-reviewRegistry` are grouped as one local provider. Aggregate/effect/modifier records remain useful hierarchy evidence, but are not independent providers.
- The nine gcsim entries are pinned by repository revision, path, and SHA-256 in `v2/source-catalog.json`. A repository revision/file digest is not a Genshin game-version proof. They are entity-file references only; this report does not parse Go text into claim values. Therefore they cannot make a field dual-source eligible until a field-level value record with explicit gameVersion evidence is reviewed.
- `missing-version` is also retained as a flag on local claims whose SourceRecords have no `gameVersion`; primary classification may be `same-provider duplicate` when the only extra records are local hierarchy evidence.
- No GO/Genshin Optimizer weapon or artifact record is pinned in the current source catalog.

## Missing-version sample

| type | candidate | field | primary class | groups | versioned independent groups |
| --- | --- | --- | --- | ---: | ---: |
| weapon | `w_11503_damage_1` | `activation` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `area` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `charges` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `cooldown` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `destination` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `duration` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `effect.activation.uidHandling` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `elementApplication` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `energy` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `hitCount` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `interval` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `maxInstances` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `offField` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `refinement` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `registryStructure` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `runtime.modifierIds` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `snapshot` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `stack` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `supersedesLegacyModifierIds` | missing-version | 3 | 0 |
| weapon | `w_11503_damage_1` | `targets` | missing-version | 3 | 0 |

Full claim/evidence records are in the adjacent JSON report. Canonical eligibility is observed from scoped human-review records and is never created by this audit.
