# KQM artifact two-piece field evidence

Status: **evidenceOnlyBlocked** (gameVersionUnbound)

This is a persisted evidence join for all 50 two-piece artifact EffectSpec candidates. The KQM source is pinned by Git commit, artifact-file blob, and raw-file SHA-256. Its independent community-research lineage is useful for comparison, but the pinned file has no explicit Genshin patch binding, so no field is canonically reusable.

## Pair policy

- Provider A: KQM Theorycrafting Library (KQM-community-research)
- Provider B target: theBowja/genshin-db (GenshinData-derived); field files are not materialized in this artifact
- KQM revision: `3d6f2fbcfdc5be69e279b732b17f2dea2be9f597`
- KQM file/blob: `src/data/artifacts.json` / `a89e0819ba8438815568febdf5967d7f234c0aa8`
- KQM raw SHA-256: `5cbc835f48bb6b81b33d07e379de9980aa9619855754a8c5417d387e6b81164d`
- KQM gameVersion: **unbound**; revision/date/digest cannot substitute for explicit version evidence
- Reopen: A KQM provider-authored immutable release/manifest must bind this exact commit, artifact blob, raw-file digest, and normalized field digest to Genshin 7.0, or the contract must explicitly approve a different version-binding rule. Reopen also on disclosed lineage correlation, source revision/blob/digest change, field/condition discrepancy, or scope change.

## Materialized comparison summary

- Candidates and comparisons: **50**; exact normalized field agreements: **50**
- Value/unit/target/condition/piece matches: 50/50/50/50/50
- Game-version bound/unbound: 0/50
- Canonical eligible: **0**

| Candidate | KQM artifact | KQM count=2 description | Value | Unit | Targets | Comparison |
| --- | --- | --- | ---: | --- | --- | --- |
| `artifact:10001:twoPiece:2pc_atk_percent` | Resolution of Sojourner | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:10002:twoPiece:2pc_atk_percent` | Brave Heart | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:10003:twoPiece:2pc_def_percent` | Defender's Will | DEF +30% | 30 | percent | defPercent | match; blocked: gameVersionUnbound |
| `artifact:10005:twoPiece:2pc_crit_rate` | Berserker | CRIT Rate +12% | 12 | percent | critRate | match; blocked: gameVersionUnbound |
| `artifact:10006:twoPiece:2pc_normal_charged_damage_bonus` | Martial Artist | Normal and Charged Attack DMG +15% | 15 | percent | normalAttackDamageBonus, chargedAttackDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:10007:twoPiece:2pc_elemental_mastery` | Instructor | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:10008:twoPiece:2pc_skill_damage_bonus` | Gambler | Increases Elemental Skill DMG by 20%. | 20 | percent | skillDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:10009:twoPiece:2pc_energy_recharge` | The Exile | Energy Recharge +20% | 20 | percent | energyRecharge | match; blocked: gameVersionUnbound |
| `artifact:10010:twoPiece:2pc_hp_flat` | Adventurer | Max HP increased by 1,000. | 1000 | flat | hpFlat | match; blocked: gameVersionUnbound |
| `artifact:10011:twoPiece:2pc_def_flat` | Lucky Dog | DEF increased by 100. | 100 | flat | defFlat | match; blocked: gameVersionUnbound |
| `artifact:10012:twoPiece:2pc_energy_recharge` | Scholar | Energy Recharge +20% | 20 | percent | energyRecharge | match; blocked: gameVersionUnbound |
| `artifact:14001:twoPiece:2pc_cryo_damage_bonus` | Blizzard Strayer | Cryo DMG Bonus +15% | 15 | percent | cryoDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15001:twoPiece:2pc_atk_percent` | Gladiator's Finale | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15002:twoPiece:2pc_anemo_damage_bonus` | Viridescent Venerer | Anemo DMG Bonus +15% | 15 | percent | anemoDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15003:twoPiece:2pc_elemental_mastery` | Wanderer's Troupe | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:15005:twoPiece:2pc_electro_damage_bonus` | Thundering Fury | Electro DMG Bonus +15% | 15 | percent | electroDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15006:twoPiece:2pc_pyro_damage_bonus` | Crimson Witch of Flames | Pyro DMG Bonus +15% | 15 | percent | pyroDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15007:twoPiece:2pc_burst_damage_bonus` | Noblesse Oblige | Elemental Burst DMG +20% | 20 | percent | burstDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15008:twoPiece:2pc_physical_damage_bonus` | Bloodstained Chivalry | Physical DMG +25% | 25 | percent | physicalDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15014:twoPiece:2pc_geo_damage_bonus` | Archaic Petra | Gain a 15% Geo DMG Bonus. | 15 | percent | geoDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15016:twoPiece:2pc_hydro_damage_bonus` | Heart of Depth | Hydro DMG Bonus +15% | 15 | percent | hydroDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15017:twoPiece:2pc_hp_percent` | Tenacity of the Millelith | HP +20% | 20 | percent | hpPercent | match; blocked: gameVersionUnbound |
| `artifact:15018:twoPiece:2pc_physical_damage_bonus` | Pale Flame | Physical DMG is increased by 25%. | 25 | percent | physicalDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15019:twoPiece:2pc_atk_percent` | Shimenawa's Reminiscence | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15020:twoPiece:2pc_energy_recharge` | Emblem of Severed Fate | Energy Recharge +20% | 20 | percent | energyRecharge | match; blocked: gameVersionUnbound |
| `artifact:15021:twoPiece:2pc_def_percent` | Husk of Opulent Dreams | DEF +30% | 30 | percent | defPercent | match; blocked: gameVersionUnbound |
| `artifact:15022:twoPiece:2pc_outgoing_healing_bonus_indirect_damage_related` | Ocean-Hued Clam | Healing Bonus +15%. | 15 | percent | outgoingHealingBonus | match; blocked: gameVersionUnbound |
| `artifact:15023:twoPiece:2pc_atk_percent` | Vermillion Hereafter | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15024:twoPiece:2pc_atk_percent` | Echoes of an Offering | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15025:twoPiece:2pc_dendro_damage_bonus` | Deepwood Memories | Dendro DMG Bonus +15%. | 15 | percent | dendroDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15026:twoPiece:2pc_elemental_mastery` | Gilded Dreams | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:15027:twoPiece:2pc_anemo_damage_bonus` | Desert Pavilion Chronicle | Anemo DMG Bonus +15% | 15 | percent | anemoDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15028:twoPiece:2pc_elemental_mastery` | Flower of Paradise Lost | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:15029:twoPiece:2pc_hydro_damage_bonus` | Nymph's Dream | Hydro DMG Bonus +15% | 15 | percent | hydroDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15030:twoPiece:2pc_hp_percent` | Vourukasha's Glow | HP +20% | 20 | percent | hpPercent | match; blocked: gameVersionUnbound |
| `artifact:15031:twoPiece:2pc_normal_charged_damage_bonus` | Marechaussee Hunter | Normal and Charged Attack DMG +15% | 15 | percent | normalAttackDamageBonus, chargedAttackDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15032:twoPiece:2pc_skill_damage_bonus` | Golden Troupe | Increases Elemental Skill DMG by 20%. | 20 | percent | skillDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15033:twoPiece:2pc_outgoing_healing_bonus_indirect_damage_related` | Song of Days Past | Healing Bonus +15%. | 15 | percent | outgoingHealingBonus | match; blocked: gameVersionUnbound |
| `artifact:15034:twoPiece:2pc_atk_percent` | Nighttime Whispers in the Echoing Woods | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15035:twoPiece:2pc_atk_percent` | Fragment of Harmonic Whimsy | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15036:twoPiece:2pc_atk_percent` | Unfinished Reverie | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15038:twoPiece:2pc_all_damage_bonus_nightsoul_onfield` | Obsidian Codex | While the equipping character is in Nightsoul's Blessing and is on the field, their DMG dealt is increased by 15%. | 15 | percent | allDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15039:twoPiece:2pc_plunging_damage_bonus` | Long Night's Oath | Plunging Attack DMG increased by 25%. | 25 | percent | plungingAttackDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15040:twoPiece:2pc_cryo_damage_bonus` | Finale of the Deep Galleries | Cryo DMG Bonus +15% | 15 | percent | cryoDamageBonus | match; blocked: gameVersionUnbound |
| `artifact:15041:twoPiece:2pc_elemental_mastery` | Night of the Sky's Unveiling | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:15042:twoPiece:2pc_energy_recharge` | Silken Moon's Serenade | Energy Recharge +20%. | 20 | percent | energyRecharge | match; blocked: gameVersionUnbound |
| `artifact:15043:twoPiece:2pc_elemental_mastery` | Aubade of Morningstar and Moon | Increases Elemental Mastery by 80. | 80 | flat | elementalMastery | match; blocked: gameVersionUnbound |
| `artifact:15044:twoPiece:2pc_atk_percent` | A Day Carved From Rising Winds | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |
| `artifact:15045:twoPiece:2pc_energy_recharge` | Celestial Gift | Energy Recharge +20%. | 20 | percent | energyRecharge | match; blocked: gameVersionUnbound |
| `artifact:15046:twoPiece:2pc_atk_percent` | Disenchantment in Deep Shadow | ATK +18%. | 18 | percent | atkPercent | match; blocked: gameVersionUnbound |

Audit: **passed**.

The KQM prose-to-v2 target mapping is explicit and deterministic; activation details not stated by KQM remain non-comparable local runtime policy fields.
