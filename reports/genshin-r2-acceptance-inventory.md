# Genshin r2 acceptance inventory

Generated: **2026-08-28T00:00:00.000Z**
Target transition: **genshin:6.7->7.0** (target **7.0**)

This report is a finite, evidence-derived acceptance inventory. It does not issue eligibility certificates, promote canonical data, or infer a complete 7.0 roster from transition shards.
Feature targets mix official changes, weapon evidence samples and a bounded roster evidence target. Their count is not a homogeneous denominator for implemented 7.0 functions; raw capture is never functional acceptance.

## Scope and gates

- Authoritative queue candidates/tasks: **2272 / 2272**
- Candidate IDs mapped: **2272**; omitted: **0**; duplicate queue IDs: **0**
- r2 work disposed: **992/2272**; completed **64**; evidence-deferred **928**; pending **1280**. Deferral is not verification or calculation support.
- Strict field-verified candidates: **0**; raw-captured candidates (not verified): **3**
- Certificates eligible: **0**; canonical promotions: **0**
- Gate: **failClosed**; all candidates complete: **no**

## Tracked calculation datasets

| Dataset | Root keys | Nested records | Digest | Calculation families |
| --- | ---: | --- | --- | --- |
| characters.json | 117 (rootObjectKeys) | root:117 | 5d239863352fc896… | catalog |
| character-talents.json | 117 (rootObjectKeys) | root:117 | 8bd06c0c9f518258… | catalog, talentScaling |
| character-constellations.json | 117 (rootObjectKeys) | root:117 | 82ace4c6178941c4… | catalog, constellation |
| base-stats.json | 6 (rootObjectKeys) | characters:117; weapons:234 | 1a275986707db020… | baseStats |
| enemies.json | 3 (rootObjectKeys) | categories:4; presets:10 | a5906b4f3daa78a5… | catalog |
| weapons.json | 237 (rootObjectKeys) | root:237 | 51440a4d511b9581… | catalog |
| weapon-effects.json | 237 (rootObjectKeys) | root:237 | 76ce9aa37bc1a1a2… | catalog, modifiers |
| artifact-sets.json | 63 (rootObjectKeys) | root:63 | 1a5c9db955bf444b… | catalog |
| artifact-set-effects.json | 63 (rootObjectKeys) | root:63 | 9e29fc0973eea237… | catalog, modifiers |
| calc/reaction-definitions.json | 6 (rootObjectKeys) | characterLevelMultipliers:92; crystallizeShieldBase:92; directReactionEntryRules:6; options:24 | 87487ebff287d3d7… | reactions |
| calc/talent-scalings.json | 117 (rootObjectKeys) | root:117 | 59e807ee94aa546c… | talentScaling |
| calc/talent-modifiers.json | 93 (rootObjectKeys) | root:93 | 1563b39046e54adb… | modifiers |
| calc/talent-effect-registry.json | 3 (rootObjectKeys) | records:31 | 4d2d0ffbe1273415… | talentScaling, modifiers |
| calc/constellation-modifiers.json | 117 (rootObjectKeys) | root:117 | a360337aa76b2ed0… | constellation, modifiers |
| calc/constellation-effect-registry.json | 7 (rootObjectKeys) | characters:117; effectsById:746 | 1312c5d402e07f7d… | constellation, modifiers |
| calc/constellation-source-index.json | 2 (rootObjectKeys) | characters:106; projects:2 | aa9228462de3c0e1… | constellation |
| calc/weapon-modifiers.json | 210 (rootObjectKeys) | root:210 | 7abce0047e3f68b3… | modifiers |
| calc/weapon-effect-registry.json | 2 (rootObjectKeys) | weapons:33 | 62d91262224ab8c3… | modifiers |
| calc/artifact-set-modifiers.json | 63 (rootObjectKeys) | root:63 | 7e82c57cccc744db… | modifiers |
| calc/attack-mode-rules.json | 4 (rootObjectKeys) | characters:3; talentSourceOverrides:1 | f35219ba52460742… | catalog, modifiers |

## Finite 7.0 feature targets

| Target | Applicability | Status | Candidate IDs |
| --- | --- | --- | --- |
| artifactSet:15047:7.0 | applicable | calculationImplementedStrictVerificationPending | artifact:15047:twoPiece:2pc_atk_percent, artifact:15047:fourPiece:4pc_crit_rate_after_stellar_swirl, artifact:15047:fourPiece:4pc_stellar_swirl_damage_bonus_after_stellar_swirl |
| artifactSet:15048:7.0 | applicable | calculationImplementedStrictVerificationPending | artifact:15048:twoPiece:2pc_atk_percent, artifact:15048:fourPiece:4pc_atk_after_stellar_glimmer, artifact:15048:fourPiece:4pc_team_stellar_glimmer_damage_bonus |
| character:10000022:constellation6:res-reduction-fix | applicable | identifiedNeedsReacquisition | behavior:10000022:constellation:constellation-6 |
| character:10000039:skill:shield-duration-fix | applicable | identifiedNeedsReacquisition | behavior:10000039:talent:skill |
| character:10000058:passive:stellar-conduct-trigger-fix | applicable | identifiedNeedsReacquisition | — |
| character:10000071:passive:particle-count-fix | applicable | identifiedNeedsReacquisition | — |
| character:new:alyosha:7.0 | coveragePending | rawCapturedIdentityUnresolved | — |
| character:new:odette:7.0 | coveragePending | rawCapturedIdentityUnresolved | — |
| character:new:traveler-cryo:7.0 | coveragePending | rawCapturedIdentityUnresolved | — |
| reaction:stellarSwirl:introduced | applicable | identifiedNeedsReacquisition | — |
| weapon:new:blade-of-atonement:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:clash-of-kings:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:covenant-of-frost-and-snow:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:echoes-of-the-heart:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:emberwell:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:exaiphanes-blade:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:forged-by-the-golden-melody:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:frostbreath:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:heretics-molten-blade:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:jade-vista:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:song-of-the-vigil:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |
| weapon:new:whitelake-frostfeather:7.0 | coveragePending | officialRosterCapturedIdentityUnresolved | — |

## Evidence boundary

- Official change-index entries: **5**; official raw entities: **3**; raw artifacts: **6**.
- Official weapon raw pages remain mutable/unbound for strict 7.0 candidate verification; their presence is recorded as raw evidence only.
- New-character roster raw capture: **3 provider-only entities / 6 records**, byte-validated; local IDs and typed fields unresolved, so coverage remains pending and no calculation acceptance is issued.

Inventory field digest: `e049a77e207579200771aeb308fc353f3239dc6930ec1f1a34d88320fb28aa7e`
