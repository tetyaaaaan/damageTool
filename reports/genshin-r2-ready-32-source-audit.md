# Genshin r2 ready-32 source audit

Status: **draft** (draft-only; queue/registry/checkpoint unchanged)

This artifact covers exactly the 28 ready weapon candidates outside the existing source-coverage inventory and the four named ready four-piece artifact candidates. It records pinned raw observations and finite provider inspection; it does not issue certificates or promote canonical data.

## Summary

- Candidates: **32** (weapons 28, artifacts 4)
- Weapon raw present: **15** candidates / **12** entities
- Weapon raw missing: **13** candidates / **6** entities
- Numeric observations: **6** (5 unique, 1 ambiguous); semantic mappings **0**
- Runtime user-state routes confirmed: **16**; stale input classifications recorded: **16**
- Candidate-scoped G06 drafts: **4** (unregistered; queue closed **0**)
- Strict/certificate/canonical: **0 / 0 / 0**

## Runtime-input classification correction

The route evidence below proves that the current `inputMissing` state is a normal user-state request, not by itself a missing consumer. The queue is intentionally not rewritten by this audit; Sol must integrate the correction through the authoritative regeneration path.

| candidate | route | reason | consumer interpretation | required input |
| --- | --- | --- | --- | --- |
| artifact:15022:fourPiece:4pc_sea_dyed_foam_damage | runtimeUserStateRouteVerified | RECORDED_HEALING_INPUT_REQUIRED | notRequiredByInputMissing | recordedHealing |
| artifact:15033:fourPiece:4pc_recorded_healing_additive_damage | runtimeUserStateRouteVerified | RECORDED_HEALING_INPUT_REQUIRED | notRequiredByInputMissing | recordedHealing |
| artifact:15041:fourPiece:4pc_crit_rate_moon_omen | runtimeUserStateRouteVerified | CONDITION_INPUT_REQUIRED | notRequiredByInputMissing | conditionByModifier.artifact-set-modifiers.json:$.15041.fourPiece[0]:4pc_crit_rate_moon_omen.option |
| artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen | runtimeUserStateRouteVerified | CONDITION_INPUT_REQUIRED | notRequiredByInputMissing | conditionByModifier.artifact-set-modifiers.json:$.15042.fourPiece[0]:4pc_team_elemental_mastery_moon_omen.option |
| w_11427_1_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.11427.modifiers[0]:resource:unityOrStalwartMark |
| w_11427_2_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.11427.modifiers[1]:resource:unityOrStalwartMark |
| w_12427_1_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.12427.modifiers[0]:resource:unityOrStalwartMark |
| w_12427_2_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.12427.modifiers[1]:resource:unityOrStalwartMark |
| w_12515_four_winds_damage_per_stack_v10 | runtimeUserStateRouteObserved | CONDITION_INPUT_REQUIRED | notRequiredByInputMissing | conditionByModifier.weapon-modifiers.json:$.12515.modifiers[0]:w_12515_four_winds_damage_per_stack_v10.stack |
| w_12515_magic_secret_crit_damage_per_stack_v10 | runtimeUserStateRouteObserved | CONDITION_INPUT_REQUIRED | notRequiredByInputMissing | conditionByModifier.weapon-modifiers.json:$.12515.modifiers[1]:w_12515_magic_secret_crit_damage_per_stack_v10.option |
| w_13427_1_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.13427.modifiers[0]:resource:unityOrStalwartMark |
| w_13427_2_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.13427.modifiers[1]:resource:unityOrStalwartMark |
| w_13427_3_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.13427.modifiers[2]:resource:unityOrStalwartMark |
| w_15427_1_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.15427.modifiers[0]:resource:unityOrStalwartMark |
| w_15427_2_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.15427.modifiers[1]:resource:unityOrStalwartMark |
| w_15427_3_v10 | runtimeUserStateRouteObserved | RESOURCE_INPUT_REQUIRED | notRequiredByInputMissing | resourceStates.weapon-modifiers.json:$.15427.modifiers[2]:resource:unityOrStalwartMark |

## Candidate results

| candidate | dataset | entity | source | comparison | calculation | work | G06 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| artifact:15022:fourPiece:4pc_sea_dyed_foam_damage | artifacts | 15022 | noIndependentCandidateFieldRecord | - | runtimeUserStateRouteVerified | candidateScopedEvidenceWaitDraft | draft |
| artifact:15033:fourPiece:4pc_recorded_healing_additive_damage | artifacts | 15033 | noIndependentCandidateFieldRecord | - | runtimeUserStateRouteVerified | candidateScopedEvidenceWaitDraft | draft |
| artifact:15041:fourPiece:4pc_crit_rate_moon_omen | artifacts | 15041 | noIndependentCandidateFieldRecord | - | runtimeUserStateRouteVerified | candidateScopedEvidenceWaitDraft | draft |
| artifact:15042:fourPiece:4pc_team_elemental_mastery_moon_omen | artifacts | 15042 | noIndependentCandidateFieldRecord | - | runtimeUserStateRouteVerified | candidateScopedEvidenceWaitDraft | draft |
| w_11418_scaling_bonus_2 | weapons | 11418 | verified | numericAgreementOnlyNotSemanticIdentity | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11418_scaling_bonus_3 | weapons | 11418 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11418_scalingBonus_cf36aef0 | weapons | 11418 | verified | numericAgreementOnlyNotSemanticIdentity | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11427_1_v10 | weapons | 11427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_11427_2_v10 | weapons | 11427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_11505_v3_scalingBonus_2 | weapons | 11505 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11510_damage_2 | weapons | 11510 | verified | numericAgreementOnlyNotSemanticIdentity | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11511_scaling_bonus_3 | weapons | 11511 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_11516_scaling_bonus_4 | weapons | 11516 | verified | ambiguous | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_12415_scaling_bonus_1 | weapons | 12415 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_12427_1_v10 | weapons | 12427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_12427_2_v10 | weapons | 12427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_12431_v3_damageBonus_1 | weapons | 12431 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_12515_four_winds_damage_per_stack_v10 | weapons | 12515 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_12515_magic_secret_crit_damage_per_stack_v10 | weapons | 12515 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_13427_1_v10 | weapons | 13427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_13427_2_v10 | weapons | 13427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_13427_3_v10 | weapons | 13427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_13501_v3_scalingBonus_2 | weapons | 13501 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_13517_v3_damageBonus_1 | weapons | 13517 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_13517_v3_damageBonus_2 | weapons | 13517 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_14416_scaling_bonus_1 | weapons | 14416 | verified | missing | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_14431_scaling_bonus_2 | weapons | 14431 | verified | numericAgreementOnlyNotSemanticIdentity | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_14506_v3_scalingBonus_1 | weapons | 14506 | missing | missing | notConfirmedForThisCandidate | openSourceCapture | open |
| w_14523_scaling_bonus_3 | weapons | 14523 | verified | numericAgreementOnlyNotSemanticIdentity | notConfirmedForThisCandidate | pendingExternalFieldEvidence | open |
| w_15427_1_v10 | weapons | 15427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_15427_2_v10 | weapons | 15427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |
| w_15427_3_v10 | weapons | 15427 | missing | missing | runtimeUserStateRouteObserved | openSourceCapture | open |

## Safety boundary

- 6.7/7.0 genshin-db raw pins are retained as observations only. They are one `GenshinData-derived` lineage and cannot satisfy independent-provider certification.
- Missing entities (11427, 12427, 12515, 13427, 14506, 15427) have no persisted raw record in the pinned snapshot/tree; no values or semantics are inferred.
- The four artifact candidates have candidate-scoped finite inspection records, but their G06 drafts are not registered and their ready source tasks remain open.
- No Runtime, canonical, eligibility certificate, authoritative queue, registry, checkpoint, or HSR file was changed.

Field digest: `7cda4bec5c43741134caada6702fed492d4168052ae1bf2eed5316ca30856d8f`
