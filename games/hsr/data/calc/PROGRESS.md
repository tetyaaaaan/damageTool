# HSR damage calculator completion checkpoint

Updated: 2026-08-01

The `/goal` is **not complete**. Conservative completion: **67%**. Test success or a representative implementation is not evidence of full coverage.

## Completed foundations

- Runtime calculation uses structured JSON and never parses descriptions or infers numeric values with regular expressions.
- Main-character and party trace/eidolon/light-cone/relic/ornament candidates connect to the condition dialog, calculation engine, and modifier audit.
- Base and final stats are separated for base-stat percentage buffs.
- The condition dialog follows the Genshin information hierarchy and category order: `パーティ / 光円錐 / 遺物・オーナメント / 軌跡 / その他`.
- Automatic thresholds use `条件未達 / 自動反映`; manual conditions use `条件OFF / 適用中`; only genuinely user-controlled effects use `条件を設定`; included final stats use `反映済み`; quarantined effects use `表示のみ`.
- Character/light-cone/relic/ornament/enemy selection dialogs and the condition dialog have PC/mobile browser checks.
- Harmony party light-cone coverage, party equipment providers, enemy shared inputs, attack scoping, modifier audits, and scroll reset are implemented.

## Goal-level complete characters

26/95 characters:

`1004`, `1005`, `1006`, `1008`, `1009`, `1013`, `1014`, `1015`, `1101`, `1102`, `1103`, `1104`, `1105`, `1106`, `1107`, `1108`, `1109`, `1110`, `1111`, `1112`, `1201`, `1202`, `1203`, `1204`, `1205`, `1303`.

Earlier reviewed attacks for `1001`, `1002`, `1003`, and `1407` do not make those characters complete.

The complete set includes exact attacks, damage-relevant traces/additional abilities/eidolons, condition UI, calculation, modifier audit, golden tests, and browser verification for each listed character.

## Current measured coverage

- Catalog characters: 95.
- Generated attacks: 344.
- Exact-ID reviewed generated attacks: 109.
- Pending generated attack review: 235.
- Additional reviewed attacks outside generated set: 78.
- Special-break reviewed attacks: 2.
- Structured modifiers: 487 total; 196 calculable, 291 display-only, 0 review.
- Broad modifier candidates: 973; exact-record covered 259; pending classification 714.
- Pending candidates: trace 325, trace node 87, eidolon 147, light cone 107, relic 29, ornament 19.
- Enemy presets: 3 verification presets; the enemy catalog remains incomplete.

The candidate audit is intentionally broad and includes some healing, shielding, or utility records. Every remaining candidate still needs an explicit classification.

## Latest completed batch: Luka 1111

- Thirteen reviewed attack records separate normal, skill direct/Bleed, ultimate, enhanced-normal punches/finisher, expected A3 punches, talent Bleed detonation, technique direct/Bleed, and the E6 fixed/expected detonations.
- Seventeen structured trace/additional-ability/minor-trace/eidolon records are classified: 5 calculable and 12 display-only.
- Skill and technique Bleed use the smaller of enemy max HP 24% and the level-dependent ATK cap; Lv10 uses ATK 338%. The enemy maximum-HP input is explicit and shared with calculation.
- The synchronized `敵が裂創状態` control drives Bleed-dependent E1 and detonation attacks. `闘志` is a 0-4 shared stack input used by talent, E4, and E6 conditions.
- Ultimate vulnerability, E1 damage bonus, and E4 ATK stacks remain independent calculation stages. Bleed and its detonations remain non-critical.
- ATK 1000, E6, enemy max HP 100000, four Fighting Will stacks, Bleed and vulnerability ON: normal 555; skill 666; ultimate 1,830; Bleed 1,875; talent detonation 1,593; E6 fixed/expected detonations 450/225.
- With conditions OFF, conditional enhanced-normal/talent/E6 attacks disappear, six attacks remain, and the audit summary reports no applied modifier.
- The modifier audit lists vulnerability, E1, E4, Bleed state, and Fighting Will separately and marks each out-of-scope attack as target-outside.
- Character change from Luka to Lynx removes all Luka-specific conditions (`裂創`, `闘志`, Luka source) from the modal.
- PC condition dialog/body widths: 820/818 and 818/808. Mobile 390x844: dialog 351/349 and body 349/339, 16 cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Topaz & Numby 1112

- Five reviewed attack records classify normal, skill Numby, talent Numby, non-damaging ultimate, and non-damaging technique; the two non-damaging records are explicitly hidden instead of being inferred as attacks.
- Nineteen structured trace/additional-ability/minor-trace/eidolon records are classified: 6 calculable and 13 display-only.
- The normal attack retains normal-attack scope and also carries an explicit follow-up tag from the `貸越` trace. Follow-up-only effects therefore reach it without leaking to unrelated normal attacks.
- `負債証明` is a level-dependent follow-up vulnerability (Lv10 50%). `心躍る上昇幅！` synchronizes the Lv10 +150% Numby multiplier, +25% critical damage, and E6 Fire RES penetration.
- `強制執行` is an independent 0-2 stack input, +25% follow-up critical damage taken per stack. `金融不安` automatically follows the shared enemy weakness selector and shows `自動判定・未達` when weakness is absent.
- ATK 1000, E6, 50/100 critical stats, weakness ON, Debt Proof/Windfall ON, Forced Execution 2 stacks: normal 1,747/4,803; skill and talent Numby 2,096/5,764 (non-critical/critical).
- With all conditions OFF and weakness absent: normal 360/720; skill and talent Numby 540/1,080. Synchronized Windfall controls all turn OFF together.
- PC browser operation and 390x844 mobile layout were verified. Mobile dialog/body widths are 351/349 and 349/339, 16 cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Qingque 1201

- Seven reviewed attack records classify normal, enhanced-normal main/adjacent, ultimate, two E4 follow-up variants, non-damaging skill, and non-damaging technique.
- Fifteen structured records classify skill, talent, technique, three additional abilities, three minor-trace totals, and all six eidolons: 5 calculable and 10 display-only.
- `海底撈月` is a synchronized 0-4 stack input. At Lv10 it adds 28% per stack; `聴牌` independently adds another 10% per stack without description parsing.
- `暗カン` adds the Lv10 72% ATK buff only to enhanced-normal scope. The E4 enhanced follow-up carries an enhanced-normal tag and receives it; normal and normal-follow-up records do not.
- `門前ツモ` is a manual actual-proc toggle for the stated 24% fixed chance. ON adds separate normal/enhanced follow-up cards; OFF removes them instead of silently using an expected-value approximation.
- E1 adds 10% only to ultimate damage. SP, EP, speed-after-attack, trace-level, and tile effects remain visible but quarantined from the current single-hit damage formula.
- ATK 1000, E6, 50/100 critical stats, skill 4 stacks, Concealed Kong and Autarky ON: normal 907/1,814; enhanced 3,200/6,401 (adjacent 1,334/2,667); ultimate 1,886/3,773; both E4 follow-ups appear.
- All manual conditions OFF: normal 360/720; enhanced 864/1,728 (adjacent 360/720); ultimate remains 792/1,584 from automatic E1; E4 follow-up cards disappear.
- PC browser operation and 390x844 mobile layout were verified. Mobile dialog/body widths are 351/349 and 349/339, 15 cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Tingyun 1202

- Three generated attack records are exact-ID reviewed: normal attack is directly calculable, while the skill and talent added-damage catalog records are hidden duplicates whose calculation owner is an explicit structured supplemental attack.
- Eighteen trace/additional-ability/minor-trace/eidolon records are classified: 6 calculable and 12 display-only.
- Benediction ATK separates the target's base ATK from Tingyun's current ATK. At Lv10 it grants 50% of the target base ATK, capped at 25% of Tingyun's current ATK; the party dialog now exposes Tingyun's ATK for this cap.
- Skill and talent added damage are independent Thunder attacks at Lv10 40% and 60%. They use the blessed ally's ATK, critical stats, and damage bonuses; they do not use Tingyun's critical stats. E4 adds 20 percentage points only to these supplemental attacks.
- The synchronized Benediction control drives the ATK buff, both supplemental attacks, and E4. The ultimate damage-bonus toggle remains independent. EP, speed, trace-level, and utility effects are visible but quarantined from the single-hit damage formula.
- Browser scenario: Seele ATK1000, 50/100 critical stats; Tingyun E6/Lv10/ATK2000; Benediction and ultimate damage ON. Base results are normal 713/1,426, skill 2,566/5,133, ultimate 5,133/10,266. Supplemental results are skill 428/855 at 60% and talent 570/1,141 at 80% (non-critical/critical).
- The modifier audit shows Benediction ATK, the correct source supplemental effect, ultimate damage, and E4 on each supplemental card. The other supplemental source is explicitly excluded, preventing cross-application. Disabling Benediction removes both supplemental cards and all three synchronized toggles.
- PC 1280x720 condition dialog/body widths are 818/818 and 818/808. Mobile 390x844 widths are 349/349 and 349/339, seven party cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Luocha 1203

- Five attack records are reviewed: exact normal and ultimate attacks plus explicitly hidden non-damaging skill, talent, and technique records. Normal Lv6 is 100% ATK; ultimate Lv10 is 200% ATK to all enemies.
- Sixteen structured records classify skill/talent healing, ultimate dispel, technique field, three additional abilities, three minor-trace totals, and all six eidolons: 2 calculable and 14 display-only.
- E1 `生者の浄化` adds 20% of each beneficiary's base ATK while the field is active. E6 `皆灰燼に帰す` reduces all enemy elemental RES by 20% for two turns after the ultimate. The two effects use separate toggles and calculation stages.
- Skill/talent healing, A2 party healing, cleansing, E2 healing/shielding, and E4 enemy outgoing-damage reduction remain visible but cannot enter the outgoing-damage formula. E4 is explicitly distinguished from enemy vulnerability to prevent reverse-direction application.
- Browser scenario: Luocha E6, ATK1000, 50/100 critical stats. With both E1 field and E6 RES reduction OFF: normal 360/720 and ultimate 720/1,440. With both ON: normal 518/1,036 and ultimate 1,036/2,072 (non-critical/critical).
- The modifier audit lists only E1 and E6 on both attacks; E4 never appears in applied outgoing-damage modifiers. Turning both conditions OFF restores the baseline. Changing Luocha to Bailu removes all Luocha names and controls.
- PC 1280x720 condition dialog/body widths are 818/818 and 818/808. Mobile 390x844 widths are 349/349 and 349/339, 16 cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Jing Yuan 1204

- Six attack records are reviewed: exact normal, skill, ultimate, and Lightning-Lord attacks; an E1 Lightning-Lord adjacent variant; and a hidden non-damaging technique record.
- Sixteen structured trace/additional-ability/minor-trace/eidolon records are classified: 4 calculable and 12 display-only.
- Lightning-Lord exposes a 3-10 hit input. `破陣` automatically grants 25% follow-up critical damage at six or more hits, while `遣将` remains an independent two-turn manual state.
- E1 changes only the adjacent-target ratio from 25% to 50%. E2 adds 20% only to normal, skill, and ultimate damage. E6 applies 12% progressive vulnerability per prior hit, capped at three stacks, and never reaches the adjacent target.
- Browser scenario at E6, ATK1000, 50/100 critical stats: three-hit baseline normal 360/720, skill 360/720, ultimate 720/1,440, Lightning-Lord main 713/1,426 and adjacent 356/713. At ten hits with `破陣`, `遣将`, E2, and E6 active: normal 432/864, skill 432/864, ultimate 864/1,728, Lightning-Lord main 3,060/6,886 and adjacent 1,188/2,673.
- The modifier audit confines E2 to direct attacks, `破陣` and E6 to Lightning-Lord, and E6 to its primary target. Changing to Luocha removes all Jing Yuan controls and names.
- PC 1280x720 condition dialog/body widths are 818/818 and 818/808. Mobile 390x844 widths are 349/349 and 349/339, 16 cards, vertical scrolling available, no horizontal overflow, console errors 0.

## Latest completed batch: Blade 1205

- Twelve reviewed attack records separate previous/enhanced normal, enhanced normal, ultimate main/adjacent mixed scaling, talent follow-up, technique, and hidden non-damaging skill records. Five attacks are shown for either selected performance version.
- Thirty-eight structured records cover both performance versions; each selected version exposes 19 records: 8 calculable and 11 display-only.
- Hellscape damage and E2 critical rate share one toggle. Ultimate HP-loss tally is a synchronized 50-90% input after enhancement and 0-90% before enhancement. E4 has 0-2 HP stacks; E6 adds only to the talent HP multiplier.
- Mixed ATK/HP terms receive multiplier additions only on explicitly marked HP terms. Primary-only E1 and adjacent-only ultimate tally modifiers cannot cross target position.
- The adjacent calculation now builds its own scoped modifier list instead of reusing the primary target list. At HP 5000, E6, E4 two stacks, 90% tally, and Hellscape ON, enhanced ultimate is 10,477 main and 3,185 adjacent non-critical damage.
- The modifier audit shows main tally 90% and E1 135% only under `主対象・適用`, and adjacent tally 54% only under `隣接対象・適用`.
- Numeric condition inputs clamp to their structured minimum/maximum before status and calculation. Enhanced Blade therefore opens at 50% and `適用中`, not an invalid 0% `条件未達` state.
- PC browser operation was verified. At 390x844 the dialog/body widths are 351/349 and 349/339, 18 cards, vertical scrolling is available, and horizontal overflow is absent.

## Efficiency checkpoint and batch strategy

- `character-completion.json` is the human completion gate. A character is not promoted by JSON counts or passing tests alone.
- `auditHsrCharacterCompletion.cjs` generates `character-coverage-report.json` with complete/provisional/incomplete counts, per-character attack and modifier debt, UI/calculation/audit counts, golden-test coverage, and common pattern frequencies.
- `buildHsrCharacterBatch.cjs` generated the first five-character packet (`1206`-`1210`): 15 pending attacks and 27 pending modifier candidates. It embeds exact source records and groups attacks by existing pattern without inferring numeric values from descriptions.
- Existing activation modes, value kinds, calculation stages, and target scopes are treated as reusable patterns. Remaining candidates should be classified and validated in batches; character-specific research is reserved for new formulas, ambiguous data, and exceptions.
- Generic contract tests and attack-scope matrix tests cover known patterns once. Browser verification should cover each new interaction pattern and boundary, while the completion gate still requires a PC/mobile scenario for every character before promotion.

## Latest condition-state semantics check

- Starry Arena (`星々の競技場`) was checked in the browser at 5% and 70% critical rate.
- At 5%, the card shows `条件未達`, the current value `5%`, and `0%（条件未達）`; it does not render a manual toggle or `条件を設定`.
- At 70%, the same card changes to `自動反映` and shows the 20% normal/skill damage bonus as the current reflection.
- This follows the Genshin distinction between automatic/reflected conditions and user-input conditions while using `条件未達` instead of the less specific `対象外` for an unmet numeric threshold.

## Last successful validation

- `node scripts/validateHsrModifiers.cjs`: 487 records; 196 calculable, 291 display-only, 0 review, 0 issues.
- `node scripts/validateHsrAttacks.cjs`: 344 generated, 187 reviewed overrides, 235 pending, 0 issues.
- `node scripts/auditHsrCoverage.cjs`: 973 broad candidates, 259 exact-record covered, 714 pending.
- `node scripts/auditHsrCharacterCompletion.cjs`: complete 26, provisional 4, incomplete 65; UI 487, calculation/audit 196.
- Full HSR suite: 155/155 passed.
- Browser: Luka condition inputs, synchronized controls, calculation changes, non-critical Bleed, target scoping, audit entries, condition removal, character-change cleanup, PC width, 390x844 mobile width, vertical scrolling, and console were verified.
- Browser: automatic critical-rate thresholds show `条件未達` below the threshold and `自動反映` at/above it; no manual checkbox is rendered. Starry Arena was verified at 5% and 70% critical rate.

## Work in progress / next exact targets

1. Batch the next characters by existing effect pattern instead of processing one complete character pipeline at a time. Start from pending ID `1206`, but generate candidate summaries for several adjacent IDs in one pass.
2. Batch-classify fixed/by-level/by-stack records that match the established schema; isolate only new formulas and ambiguous effects for individual research.
3. Add generated scope-matrix tests across all calculable records, then add hand-written golden cases only for new formulas and exception boundaries.
4. Expand the enemy catalog beyond three verification presets and classify enemy-only conditions.
5. Batch-classify the remaining 107 light-cone, 29 relic, and 19 ornament candidates.
6. Continue until 95/95 characters and every generated/additional attack is reviewed.

## Resume instructions

Read this file, `character-completion.json`, `character-coverage-report.json`, and `coverage-report.json`. Do not repeat completed character or foundation work. Run the batch candidate audit before new data work, regenerate both coverage reports after every batch, and keep all unresolved counts explicit.
