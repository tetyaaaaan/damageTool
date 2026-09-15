# r2 product correction handoff — 2026-09-05

Root responsibility: GPT-6 (design, audit, integration). The existing r2 goal,
candidate identities, historical audits and source captures are retained.
This is not a source verification or canonical promotion.

## Reused pending work

The September 1 checkpoint recorded 1,021 disposed candidates (17 completed,
1,004 deferred). Subsequent weapon condition edits and tests existed, but the
queue and registry had not been reconciled. They were audited instead of
reimplemented.

* Enemy-aura weapons 11405/12302/12405/13401/14301/15301: one explicit
  condition-controlled all-damage route per weapon; duplicate projections are
  superseded. Refinement arrays are unchanged.
* 12511: unshielded HP condition corrected; unconditional duplicate superseded.
* 13405 (Deathmatch): existing shared option input selects mutually exclusive
  nearby-enemy-count branches. No selection grants no bonus. Normal request
  reconciliation is tested, not only injected engine state.
* 15424: current Scorching Heart state controls charged-attack bonus only;
  duplicate is superseded. Separate triggered damage remains unresolved.
* 13516: critical-damage effect is not a reaction-damage effect; duplicate
  misclassifications are superseded. The active burst bonus is restricted to
  lunar-charged damage, as the local source text says, not electro-charged.

Local authority for these implementation corrections: weapon-effects.json
templates/refinement parameters and the matching modifier source text. Those
local records do not establish independent-source or target-version proof.
All generated weapon specs remain needsReview/singleSource.

## GPT-6 safety corrections

* Active w_11412_extra_damage_1 had accidentally been marked superseded without
  an executable successor. Restored sourceContextRequired and added a regression.
  The actual older duplicate remains superseded.
* Rejected w_15515_damage_1's provisional full-value toggle. The full template
  includes combat decay and separate attack-type replenishment, not just the
  first fragment's initial maximum. Kept sourceContextRequired; even an injected
  toggle must not grant the maximum. Do not count this as an external-only hold
  or implemented timer model. A bounded current-state input/product decision
  remains preferable to inventing a combat simulator.
* Existing bounded reconciliation removes the two newly superseded registered
  decisions only after fresh terminal proof of complete + superseded status.
  It still rejects other stale dispositions and concrete-work waits.
* Propagated sourceContextRequired into the existing v2 Runtime blockedReasons:
  43/43 affected records retain the explicit internal block after generation.
  A generator regression checks every affected record. This does not make any
  record verified or eligible and does not change canonical data.

## Acceptance boundary

Focused product tests cover duplicate exclusion, missing-condition isolation,
target restriction, enemy-count exclusion and normal request reconciliation.
Existing calculation/party and 7.0 internal route regressions remain required.
The three 7.0 tests prove six local character routes and fail-closed Stellar
Swirl routing; they do not prove external mechanics or 7.0 feature acceptance.

Remaining implementation candidates are not exhausted by this handoff. Preserve
the queue and inspect concrete high-impact routes before further generic batches.
No HSR edits, source refetch, strict certificate, canonical promotion or goal
completion is performed by this correction.

## Continued product corrections (Sol handoff)

* Restored w_12511_stat_2 as an explicit current-state toggle labelled
  `ダメージを受けてから8秒以内`. The skill-hit state remains independent;
  R1–R5 values and the 8-second window are preserved.
* Fixed the shared self stat-percent arithmetic: atkPercent, hpPercent and
  defPercent now use baseAtk, baseHp and baseDef. There is no fallback to total
  stats. Missing/nonpositive/nonfinite base input is fail-closed with
  BASE_STAT_INPUT_REQUIRED. Existing hidden/manual/profile/UID inputs already
  carry these base values, so no new product control was added.
* Artifact 15014/15037 dynamic elemental targets were inspected and left
  fail-closed. 15014 needs the picked crystallize-shard element; 15037 needs
  reaction-specific related element sets and team scope. The current Swirl
  selector or own element cannot substitute without leaking bonuses. This is a
  real product/engine input decision, not external evidence-only completion.
* Weapon 13509's excess-ER conversion now uses an isolated second stat pass:
  ordinary ER bonuses, including its own after-burst state, resolve first;
  excess above 100% is then multiplied by the R1–R5 rate, capped by the
  refinement-specific ATK percentage, and applied from base ATK. UID mode skips
  the reflected value and missing base ATK cannot fall back to total ATK.
  Generator output retains the calculation kind, threshold, caps and input
  policy while leaving the Spec needsReview and Runtime candidate-only.
