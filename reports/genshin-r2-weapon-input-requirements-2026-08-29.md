# r2 weapon `inputMissing` requirements audit (2026-08-29)

## Scope and result

This is a read-only audit of the 12 requested weapon candidates. No queue,
source evidence, candidate, certificate, schema, or runtime files were
changed. The current `inputMissing` signal is a calculation-time state-input
requirement for all 12 candidates; no actual common-consumer/code gap was
found.

The input requirement does not establish source eligibility. Every candidate
still has an open, concrete source-search task and therefore is not eligible
for a G06 bounded deferral at this point.

## Current queue state

All 12 IDs are present in `reports/genshin-evidence-task-queue.json` under the
weapon `inputMissing` lane. Each row currently records:

- `terminal: "blocked"` and `autoProcessableNow: false`;
- `blockReasons: ["sourceMissing", "gameVersionUnbound", "providerIndependenceUnknown", "inputMissing"]`;
- `task.taskId: "source-search:<candidateId>"`, `task.kind: "sourceProvider"`, and `task.status: "ready"`;
- `frontier.status: "searchRequired"`, `frontier.exhausted: false`, empty `providersExamined`, and `scopeMatched: null`.

That is a concrete pending source comparison/search, not a bounded finite
deferral. The existing `deferredLanes` consumer marker does not override the
ready source task or prove a consumer defect.

## Candidate-by-candidate runtime audit

The analyzer was run against each existing legacy record with no state set,
then with a valid representative state. `missingInput` below means the
calculation is waiting for the user/provider run-state value; it is not a
missing input control or missing calculation consumer.

| Candidate | Existing structured input and no-input result | Representative supplied-state result | Actionable finding |
| --- | --- | --- | --- |
| `w_11427_1_v10` | `resourceGeneratedEffect`; `resourceState`; `supportStatus: "missingInput"`; `reasonCode: "RESOURCE_INPUT_REQUIRED"`; required `resourceStates.weapon:11427:resource:unityOrStalwartMark` | Value `2` gives `supportStatus: "stateInput"`, no missing path (the generator remains a state-input definition) | Normal runtime mark-count input; no code fix. |
| `w_11427_2_v10` | `statBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:11427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Existing generic resource consumer is sufficient; no code fix. |
| `w_12427_1_v10` | `resourceGeneratedEffect`; `resourceState`; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:12427:resource:unityOrStalwartMark` | Value `2` gives `supportStatus: "stateInput"`, no missing path | Same existing mark-count input route; no code fix. |
| `w_12427_2_v10` | `statBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:12427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Existing generic resource consumer is sufficient; no code fix. |
| `w_12515_four_winds_damage_per_stack_v10` | `damageBonus`; `missingInput` / `CONDITION_INPUT_REQUIRED`; required `conditionByModifier.weapon:12515:w_12515_four_winds_damage_per_stack_v10.stack` | Stack `4` gives `calculable: true`, `supportStatus: "supported"` | Existing shared stack control; no code fix. |
| `w_12515_magic_secret_crit_damage_per_stack_v10` | `critBonus`; `missingInput` / `CONDITION_INPUT_REQUIRED`; required `conditionByModifier.weapon:12515:w_12515_magic_secret_crit_damage_per_stack_v10.option` | Option `active` with shared stack `4` gives `calculable: true`, `supportStatus: "supported"` | Existing option plus shared stack control; no code fix. |
| `w_13427_1_v10` | `resourceGeneratedEffect`; `resourceState`; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:13427:resource:unityOrStalwartMark` | Value `2` gives `supportStatus: "stateInput"`, no missing path | Normal runtime mark-count input; no code fix. |
| `w_13427_2_v10` | `statBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:13427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Generic percent stat/resource path is sufficient; no code fix. |
| `w_13427_3_v10` | `damageBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:13427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Generic percent damage/resource path is sufficient; no code fix. |
| `w_15427_1_v10` | `resourceGeneratedEffect`; `resourceState`; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:15427:resource:unityOrStalwartMark` | Value `2` gives `supportStatus: "stateInput"`, no missing path | Normal runtime mark-count input; no code fix. |
| `w_15427_2_v10` | `statBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:15427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Generic percent stat/resource path is sufficient; no code fix. |
| `w_15427_3_v10` | `damageBonus` / per-consumed-stack; `missingInput` / `RESOURCE_INPUT_REQUIRED`; required `resourceStates.weapon:15427:resource:unityOrStalwartMark` | Value `2` gives `calculable: true`, `supportStatus: "supported"` | Generic percent damage/resource path is sufficient; no code fix. |

The ten resource-backed rows use the existing structured
`unityOrStalwartMark` state with maximum three marks. The two `12515` rows
use the existing `fourWindsPoem` stack and Magic Secret option. These are
distinct required paths per candidate even when they share a resource or
stack concept.

## Evidence and remaining work

Each candidate has three local parser source references in
`games/genshin/data/v2/weapons/source-records.json`:
`weapon:<entity>:catalog`, `weapon:<entity>:effect`, and the candidate
modifier record. Those records have `gameVersion: null`. None of entities
`11427`, `12427`, `12515`, `13427`, or `15427` has a record in either
`games/genshin/data/v2/weapons/external-evidence.json` or
`games/genshin/data/v2/weapons/independent-field-evidence.json`. The specs
remain `verification.status: "needsReview"` and
`sourceAgreement: "singleSource"`.

The minimum next action is the already-recorded candidate-scoped source
search/review task, followed by version and provider-independence review.
No source acquisition was performed here. Until that work supplies exact,
version-bound independent evidence, the candidates must remain unknown /
unverified; runtime input-route existence must not be used as proof of source
verification.

## Existing consumer and test evidence

- `games/js/genshinModifierAnalyzer.js:237-269` recognizes structured
  resource identity/state and derives stable resource keys;
  `:598-708` reports the exact missing-input paths.
- `games/js/genshinCalcConditions.js:751-801` builds/reconciles resource
  controls, and `:805-875` handles stack/option controls.
- `games/js/genshinCalcEngine.js:812-882` parses numeric and percent values,
  consumes bounded resource stacks, and resolves per-consumed-stack values;
  `:595-766` retains the legacy weapon metadata fallback when no explicit
  registry group exists.
- `games/genshin/data/calc/weapon-effect-registry.json` has no explicit
  `weapons` entries for entities `11427`, `12427`, `12515`, `13427`, or
  `15427`. This is not itself a consumer gap: the existing legacy fallback is
  the supported route for the current records, while canonical activation
  remains separately gated by source and review evidence.
- `tests/genshin/genshinCalcIntegration.test.cjs:220-230` verifies weapon
  `11427` exposes `unityOrStalwartMark` with current `2` and maximum `3`;
  `:259-268` verifies two consumed marks produce elemental mastery `80`.
- `tests/genshin/genshinStep37.test.cjs:36-54` verifies `12515` shares four
  winds stacks across damage and Magic Secret critical damage; `:70-78`
  verifies one stack control and one option control.
- `tests/genshin/genshinModifierAnalyzer.test.cjs:284-306` verifies a
  structured weapon resource is classified as `calculationInput`/
  `stateInput` when supplied.

Read-only verification command:

```text
node --test tests/genshin/genshinCalcIntegration.test.cjs tests/genshin/genshinStep37.test.cjs tests/genshin/genshinModifierAnalyzer.test.cjs
```

Result: 43 tests passed, 0 failed.
