# Genshin weapon gcsim conflict triage

This report audits the existing gcsim evidence counters without changing candidate values or canonical status.

- Audit status: **passed**
- Direct candidate-value conflicts: **0**
- Remaining semantic discrepancy rows: **0**
- Mechanically resolved projection rows: **35**
- Ancillary source rows: **4** (registry-mapped **4**, schema gaps **0**, unmapped **0**)
- Classification: **{"resolvedMapping":33,"genuineConflict":0,"scopeMismatch":0,"parserLimitation":0,"registryLifecycleMapped":4,"schemaGap":0,"unmapped":0}**
- Genuine numeric/value conflicts: **0**
- Canonical-eligible/promoted: **0/0**

## Classification policy

`resolvedMapping` means the field-specific source value agrees after projection; `scopeMismatch` means activation/target scope differs; `parserLimitation` means the legacy candidate shape cannot represent an observed branch or source mapping; `genuineConflict` is reserved for a direct semantic value disagreement; `unmapped` has no candidate field.

| Classification | Count |
| --- | ---: |
| resolvedMapping | 33 |
| genuineConflict | 0 |
| scopeMismatch | 0 |
| parserLimitation | 0 |
| registryLifecycleMapped | 4 |
| schemaGap | 0 |
| unmapped | 0 |

## Conflict rows

| Key | Field | Classification | Dimensions | Rationale |
| --- | --- | --- | --- | --- |

## Reconciled field projections

- gcsim:weapon:11503:w_11503_damage_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11503:w_11503_damage_3:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11503:w_11503_stat_2:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11509:w_11509_damage_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11509:w_11509_damage_2:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11509:w_11509_damageBonus_ae1b42da:stack: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11509:w_11509_damageBonus_ae1b42da:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11518:w_11518_stat_3:duration: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11518:w_11518_stat_3:unit: parserLimitation -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11518:w_11518_stat_4:duration: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:11518:w_11518_stat_4:unit: parserLimitation -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12402:w_12402_damage_1:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12402:w_12402_extraDamage_4ff89bef:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12430:w_12430_crit_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12430:w_12430_critBonus_ef236f15:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12430:w_12430_damageBonus_c7243261:duration: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:12430:w_12430_damageBonus_c7243261:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:14402:w_14402_damage_2:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:14402:w_14402_stat_1:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:14402:w_14402_stat_3:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15402:w_15402_damage_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15502:w_15502_damage_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15502:w_15502_damageBonus_fc388315:stack: parserLimitation -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15502:w_15502_damageBonus_fc388315:unit: parserLimitation -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_damage_2:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_damage_5:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_damageBonus_1923e8e9:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_damageBonus_f827969c:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_reaction_bonus_3:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_reaction_bonus_4:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_reactionBonus_232c59cc:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_reactionBonus_999a052c:unit: scopeMismatch -> resolvedMapping (FIELD_AXIS_RECONCILED)
- gcsim:weapon:15516:w_15516_stat_1:unit: resolvedMapping -> resolvedMapping (FIELD_AXIS_RECONCILED)

## Unmapped rows

| Key | Field | Dimensions | Rationale |
| --- | --- | --- | --- |
| gcsim:weapon:12402:cooldown | cooldown | cooldown, registryMapping | SHARED_LIFECYCLE_MAPPED |
| gcsim:weapon:12402:shieldDuration | shieldDuration | duration, registryMapping | SHARED_LIFECYCLE_MAPPED |
| gcsim:weapon:14402:cooldown | cooldown | cooldown, registryMapping | SHARED_LIFECYCLE_MAPPED |
| gcsim:weapon:14402:duration | duration | duration, registryMapping | SHARED_LIFECYCLE_MAPPED |

## Errors

- none
