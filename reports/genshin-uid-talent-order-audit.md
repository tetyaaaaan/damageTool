# Genshin UID talent-level order audit

Status: explicit-ID mapping is implemented for the local canonical IDs; unknown UID skill IDs remain unresolved and fail closed.

## Evidence

- `games/genshin/data/calc/talent-scalings.json` records `source.talentKey` as `combat1` for `normalAttack`, `combat2` for `skill`, and `combat3` for `burst` (for example character `10000037`).
- `scripts/genshinTalentValueAudit.cjs` and the talent sync scripts use the same explicit source-ID table.
- `games/genshin/data/character-talents.json` contains display/source text grouped as `normalAttack`, `skill`, and `burst`, but does not provide a UID `skillLevelMap` ID table.
- The UID API contract describes `skillLevelMap` as a `skill_id -> level` map; no insertion-order semantic contract is available in this repository.

Therefore the mapper accepts only the locally evidenced IDs `combat1`, `combat2`, and `combat3`. It never uses `Object.values(raw)` to assign levels.

## Contract

| UID skill ID | output talent level | resolution |
| --- | --- | --- |
| `combat1` | `talents.normal` | explicit |
| `combat2` | `talents.skill` | explicit |
| `combat3` | `talents.burst` | explicit |
| any other ID, missing ID, invalid level, or conflicting case-variant | all three levels default to `1` | `unresolved` |

Every mapped character carries `provenance.talentLevelMapping` with `status`, `rawById`, `mappedIds`, `missingIds`, `unmappedIds`, and `conflictingIds`. The raw levels therefore remain inspectable even when they cannot be safely interpreted. `CalculationInput v2` and the support-member projection preserve this mapping provenance.

The level-1 fallback is deliberate: PartyState clamps missing talent levels to its safe minimum, and no guessed normal/skill/burst assignment is exposed to PartyModifiers. Numeric UID IDs require a future resolver/API fixture before they can be promoted to `resolved`.

## Boundary

Talent levels are imported data, not combat state. `combatState` remains `onField:false`/`hpRatio:100` for support members. UID support level, weapon, and weapon-level edits are tracked by field origin; when those values are manually changed, PartyState's `useUidBaseStats` gate returns to resolver-derived base stats instead of reusing the stale UID final-stat snapshot.

The UID summary card renders an alert when the mapping is unresolved, and applying the profile emits the same `warning` message (`天賦ID順序を確認できないためLv1（手動確認）として扱います。`) instead of a success-only notice. This prevents the safe level-1 fallback from looking like a confirmed UID talent level.

## Verification

```text
node --test tests/genshin/genshinUidTalentOrderContract.test.cjs tests/genshin/genshinUidPartyBridgeContract.test.cjs tests/genshin/genshinUidTalentWarningUi.test.cjs
15 passed
```

The tests are pure mapper/DataContract fixtures. They do not claim a browser DOM E2E path.
