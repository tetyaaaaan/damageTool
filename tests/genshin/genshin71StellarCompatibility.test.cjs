"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const root = path.resolve(__dirname, "../..");
const S = "10000133", V = "10000143", W = "10000140";
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const transition = "games/genshin/data/v2/version-transitions/7.0-to-7.1/";

function fixture(id = S, constellation = 0) {
    const f = createScenarioHarness(), box = { window: {}, console };
    vm.createContext(box);
    for (const name of ["genshinDataContract", "genshinCalcData"])
        vm.runInContext(fs.readFileSync(path.join(root, `games/js/${name}.js`), "utf8"), box);
    box.window.GenshinCalcData.applyProvisional70Data(f.calcData, [
        read("games/genshin/data/v2/candidates/7.0-provisional-characters.json"),
        read("games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")
    ], []);
    box.window.GenshinCalcData.applyProvisional71Data(f.calcData, [
        read(transition + "vesna-currentcalc.json"), read(transition + "vodyanitsa-currentcalc.json")
    ], []);
    prepareScenarioInputs(f.elements, { characterId: id, constellation,
        stats: { atk: 2000, baseAtk: 1000, hp: 50000, baseHp: 10000, def: 1000,
            elementalMastery: 0, critRate: 50, critDamage: 100, elementDamageBonus: 0 } });
    f.engine = f.sandbox.GenshinCalcEngine;
    f.request = f.engine.buildCalculationRequestFromForm();
    f.request.uiState.enableWeaponLowHpCondition = false;
    f.request.uiState.conditionByModifier ||= {};
    f.request.uiState.complexConditionByModifier ||= {};
    f.calc = () => f.engine.calculateDamageRequest(f.request, f.calcData);
    return f;
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`); }
function state(f, key, value) {
    const s = { enabled: true, ...value };
    f.request.uiState.conditionByModifier[key] = { ...s };
    f.request.uiState.complexConditionByModifier[key] = { ...s };
}
function group(f, name, option) { state(f, `character:${f.request.characterId}:group:${name}`, { option }); }
function artifact(f, id, enabled) {
    f.request.artifactSetMode = "4pc"; f.request.artifactSetIds = [id];
    const source = `artifact4:${id}`;
    const m = f.engine.normalizeArtifactModifier(f.calcData.artifactSetModifiers[id].fourPiece[0], source, f.request);
    state(f, f.sandbox.GenshinModifierAnalyzer.modifierStateKey(m, source), { enabled });
}
function row(p, id) { const r = p.results.find(r => r.entry.id === id); assert.ok(r, id); return r; }
function probe(f, element, reaction = "") {
    const p = f.calc();
    const entry = { id: "compatibility-probe", element, attackType: "skill", damageType: "skill", group: "skill",
        directReactionId: reaction, levelSource: "skill", scalings: [{ stat: "atk", valuesByLevel: { 10: 100 } }], hitCount: 1 };
    const mods = f.engine.applyModifiersToDamageEntry(entry, p.context, f.engine.collectActiveModifiers(f.calcData, p.context));
    return { totals: mods.totals, result: f.engine.calculateDamage(entry, p.context, mods) };
}
function replay(f) {
    const p = f.calc(), q = f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(p.calculationRequest)), f.calcData);
    assert.deepEqual(JSON.parse(JSON.stringify(q.results)), JSON.parse(JSON.stringify(p.results)));
}
function provider(f, id, slot = 2, set = "") {
    f.request.party ||= { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members: [
        { slot: 1, enabled: true, role: "main", characterId: f.request.characterId, stats: { ...f.request.stats }, equipment: {}, buffStates: {} }
    ] };
    f.request.party.members.push({ slot, enabled: true, role: "support", characterId: id, constellation: 6, level: 90,
        talentLevels: { normal: 10, skill: 10, burst: 10 }, stats: { hp: 50000, baseHp: 10000, atk: 1000, baseAtk: 500, elementalMastery: 0 },
        equipment: { artifactSetMode: set ? "4pc" : "none", artifactSetIds: set ? [set] : [] }, buffStates: {} });
}
function partyState(f, slot, id, name, value) {
    const key = `party:${slot}:${id}:group:${name}`;
    f.request.party.conditionStates[key] = { enabled: true, ...value };
    f.request.party.members.find(m => m.slot === slot).buffStates[key] = true;
}

test("15047 recognizes confirmed Cryo and Anemo Stellar Swirl independently of their element", () => {
    for (const [id, entry, setup] of [[S, "charged_beam_swirl", null],
        [V, `provisional71_${V}_skill_spirit_blade_rank2_stellarSwirl`, "vesna_radiance"]]) {
        const f = fixture(id); if (setup) group(f, setup, "stellarSwirl");
        artifact(f, "15047", false); const off = row(f.calc(), entry);
        artifact(f, "15047", true); const on = row(f.calc(), entry);
        near(on.breakdown.reactionBonus - off.breakdown.reactionBonus, 40);
        near(on.breakdown.critRate - off.breakdown.critRate, 16);
        assert.ok(on.expected > off.expected); replay(f);
        near(probe(f, "氷", "stellarConduct").totals.reactionBonus, 0);
        // The set's ordinary +16 CR remains intentional; its +40 reaction bonus must not change talent non-crit damage.
        const talentOn = probe(f, id === S ? "氷" : "風").result;
        artifact(f, "15047", false); const talentOff = probe(f, id === S ? "氷" : "風").result;
        near(talentOn.nonCrit, talentOff.nonCrit);
    }
});

test("Cryo/Anemo direct Swirl and Cryo Vortex use only their actual RES; Stellar excludes DEF", () => {
    const f = fixture();
    f.request.enemy.resistance.base.byElement = { cryo: 10, anemo: 80 };
    const cryo = probe(f, "氷", "stellarSwirl").result, anemo = probe(f, "風", "stellarSwirl").result;
    near(cryo.nonCrit / anemo.nonCrit, .9 / (1 / 4.2));
    f.request.enemy.resistance.base.byElement = { cryo: 80, anemo: 10 };
    near(probe(f, "風", "stellarSwirl").result.nonCrit, cryo.nonCrit);
    const star = probe(f, "氷", "stellarSwirl").result, talent = probe(f, "氷").result;
    f.request.enemy.enemyLevel = 200;
    near(probe(f, "氷", "stellarSwirl").result.nonCrit, star.nonCrit);
    assert.ok(probe(f, "氷").result.nonCrit < talent.nonCrit);
    for (const [variant, element] of [["initialAnemo", "風"], ["vortex1", "氷"], ["vortex2", "氷"]]) {
        f.request.reactionOptionKey = "stellarSwirl";
        f.request.manualInputs.stellarSwirlVariant = variant;
        const r = row(f.calc(), "reaction_stellarSwirl");
        near(r.breakdown.resistance, element === "氷" ? 80 : 10);
        near(r.breakdown.defenseMultiplier, 1);
    }
});

test("Elemental/Common bonuses remain outside Stellar base, reaction, crit and Elevation buckets", () => {
    const f = fixture(); const off = probe(f, "氷", "stellarSwirl").result, talent = probe(f, "氷").result;
    f.calcData.talentModifiers[S].passives.push({ sourceId: "compat-common", modifiers: [
        { id: "compat-common", category: "damageBonus", applyTo: ["allDamageBonus"], value: 50, unit: "percent",
            condition: "always", calculationSupport: "simple", uidHandling: "conditional" }
    ] });
    near(probe(f, "氷", "stellarSwirl").result.expected, off.expected);
    near(probe(f, "氷").result.nonCrit, talent.nonCrit * 1.5);
    f.request.stats.elementDamageBonus = 100;
    near(probe(f, "氷", "stellarSwirl").result.expected, off.expected);
    near(probe(f, "氷").result.nonCrit, talent.nonCrit * 2.5); replay(f);
});

test("15048 provider party bonus targets both Stellar types, max-deduplicates, and excludes talent damage", () => {
    const f = fixture("10000025");
    const before = probe(f, "風", "stellarSwirl").result;
    provider(f, "10000015", 2, "15048"); partyState(f, 2, "10000015", "artifact15048AfterStellarGlimmer", {});
    for (const reaction of ["stellarSwirl", "stellarConduct"]) near(probe(f, "風", reaction).totals.reactionBonus, 50);
    const one = probe(f, "風", "stellarSwirl").result; assert.ok(one.expected > before.expected);
    provider(f, "10000014", 3, "15048"); partyState(f, 3, "10000014", "artifact15048AfterStellarGlimmer", {});
    near(probe(f, "風", "stellarSwirl").result.expected, one.expected);
    f.request.party.members[1].stats.atk = 9999; f.request.stats.hp = 1000;
    near(probe(f, "風", "stellarSwirl").result.expected, one.expected);
    near(probe(f, "風").totals.damageBonus, 0); replay(f);
});

test("Sandrone C6 independently elevates her confirmed base/C4/C6 Stellar hits and not party recipients", () => {
    const f = fixture(S, 6);
    state(f, "constellation:C1:c_10000133_1_1", { enabled: true });
    state(f, "constellation:C6:c_10000133_6_1", { enabled: false });
    group(f, "sandrone_c4_cannon", "stellarSwirl"); group(f, "sandrone_c6_cluster", "stellarSwirl");
    const off = f.calc(); state(f, "constellation:C6:c_10000133_6_1", {}); const on = f.calc();
    const hits = on.results.filter(r => ["stellarSwirl", "stellarConduct"].includes(r.entry.directReactionId));
    assert.ok(hits.length >= 6);
    for (const hit of hits) near(hit.expected, row(off, hit.entry.id).expected * 1.2);
    near(row(on, "normal_1damage").expected, row(off, "normal_1damage").expected);
    const recipient = fixture(V); provider(recipient, S);
    partyState(recipient, 2, S, "sandrone_c6_cluster", { option: "stellarSwirl" });
    near(probe(recipient, "風", "stellarSwirl").totals.finalDamageMultiplier, 1); replay(f);
});

test("Vodyanitsa A4 provider additive base switches buckets; C6 Elevation remains Swirl-only", () => {
    const f = fixture(V); group(f, "vesna_radiance", "stellarSwirl"); provider(f, W);
    partyState(f, 2, W, "vodyanitsa_c2_variant", { option: "meteorstorm" });
    near(probe(f, "風", "stellarSwirl").totals.reactionCritDamage, 60);
    near(probe(f, "氷").totals.critDamageBonus, 0);
    partyState(f, 2, W, "vodyanitsa_c2_variant", { option: "inactive" });
    partyState(f, 2, W, "vodyanitsa_a4_state", { option: "leadSwirl" });
    let p = probe(f, "風", "stellarSwirl"); near(p.totals.additiveBaseDamage, 2600);
    near(p.result.crit, p.result.nonCrit * 2);
    near(probe(f, "氷").totals.additiveBaseDamage, 0);
    near(probe(f, "風", "stellarConduct").totals.additiveBaseDamage, 0);
    f.request.stats.hp = 1000; near(probe(f, "風", "stellarSwirl").totals.additiveBaseDamage, 2600);
    const off = p.result; partyState(f, 2, W, "vodyanitsa_song_state", { option: "active" });
    near(probe(f, "風", "stellarSwirl").result.expected, off.expected * 1.25);
    near(probe(f, "風", "stellarConduct").totals.finalDamageMultiplier, 1);
    partyState(f, 2, W, "vodyanitsa_a4_state", { option: "chorusTalent" });
    near(probe(f, "風", "stellarSwirl").totals.additiveBaseDamage, 0);
    near(probe(f, "氷").totals.additiveBaseDamage, 1400);
    f.request.party.members[1].stats.hp = 65000;
    near(probe(f, "水").totals.additiveBaseDamage, 3500); replay(f);
});

test("Stellar base bonus and beam-only CRIT preserve provider ownership and separate buckets", () => {
    const f = fixture(V); provider(f, S);
    const candidate = f.calc().partyModifiers.find(c => c.modifier.id === "t_10000133_passive3_stellar_conduct");
    assert.ok(candidate);
    f.request.party.members[1].buffStates[candidate.toggleKey] = true;
    f.request.party.members[1].stats.atk = 1866;
    for (const reaction of ["stellarConduct", "stellarSwirl"]) {
        near(probe(f, "風", reaction).totals.reactionBaseDamageBonus, 13.062 + (reaction === "stellarSwirl" ? 14 : 0));
        near(probe(f, "風", reaction).totals.reactionBonus, 0);
    }
    f.request.stats.atk = 9000;
    near(probe(f, "氷", "stellarSwirl").totals.reactionBaseDamageBonus, 13.062 + 14);
    near(probe(f, "氷").totals.reactionBaseDamageBonus, 0);
    const s = fixture(S, 2);
    state(s, "constellation:C2:group:sandrone_c2_beams", { option: "3" });
    group(s, "sandrone_c2_beams", "3");
    const p = s.calc();
    near(row(p, "charged_beam_swirl").breakdown.critDamage, 200);
    near(row(p, "skill_prism_swirl").breakdown.critDamage, 100);
    near(row(p, "normal_1damage").breakdown.critDamage, 100); replay(s); replay(f);
});

test("Vodyanitsa C6 party OFF/ON/OFF and standalone contributor scope survive saved Request", () => {
    const f = fixture(V); provider(f, W);
    f.request.reactionOptionKey = "stellarSwirl";
    f.request.manualInputs.stellarSwirlVariant = "initialAnemo";
    f.request.manualInputs.reactionContributors = [{ slot: 3, level: 90, elementalMastery: 0, critRate: 0, critDamage: 0 }];
    partyState(f, 2, W, "vodyanitsa_song_state", { option: "inactive" });
    const off = row(f.calc(), "reaction_stellarSwirl");
    partyState(f, 2, W, "vodyanitsa_song_state", { option: "active" });
    const on = row(f.calc(), "reaction_stellarSwirl");
    near(on.expected, off.expected * 1.25); replay(f);
    for (const contributor of on.breakdown.reaction.contributors) near(contributor.finalDamageMultiplier, 1.25);
    partyState(f, 2, W, "vodyanitsa_song_state", { option: "inactive" });
    near(row(f.calc(), "reaction_stellarSwirl").expected, off.expected);
    f.request.party.members[1].constellation = 5;
    partyState(f, 2, W, "vodyanitsa_song_state", { option: "active" });
    near(probe(f, "風", "stellarSwirl").totals.finalDamageMultiplier, 1);
});
