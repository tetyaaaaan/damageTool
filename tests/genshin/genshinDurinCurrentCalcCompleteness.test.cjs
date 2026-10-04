"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require("./helpers/calcScenarioHarness.cjs");

const DURIN = "10000123";
const FORM = `character:${DURIN}:group:durinEssentialTransmutationForm`;
const C1_STACKS = `character:${DURIN}:group:durinC1Epiphany`;
const A4_STACKS = `character:${DURIN}:group:durinPrimordialFusion`;

function fixture({ characterId = DURIN, constellation = 0, atk = 2000, baseAtk = 1000 } = {}) {
    const f = createScenarioHarness();
    prepareScenarioInputs(f.elements, {
        characterId, constellation,
        stats: { atk, baseAtk, def: 1000, hp: 20000, elementalMastery: 0, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    f.engine = f.sandbox.GenshinCalcEngine;
    f.calculate = (request) => f.engine.calculateDamageRequest(request || f.engine.buildCalculationRequestFromForm(), f.calcData);
    return f;
}

function result(payload, id) {
    const value = payload.results.find((item) => item.entry.id === id);
    assert.ok(value, `missing damage entry ${id}`);
    return value;
}

function setOption(f, key, value) {
    setConditionElement(f.elements, key, "option", value);
    f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(), f.calcData);
}

function setStack(f, key, value) {
    setConditionElement(f.elements, key, "stack", value);
    f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(), f.calcData);
}

function near(actual, expected, label = "value") {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} !== ${expected}`);
}

function replay(f, payload) {
    const snapshot = f.engine.createCalculationSnapshot(payload.calculationRequest, payload);
    const restored = f.calculate(JSON.parse(JSON.stringify(snapshot.request)));
    assert.deepEqual(JSON.parse(JSON.stringify(restored.results)), JSON.parse(JSON.stringify(payload.results)));
}

test("Durin Dark Decay Vaporize/Melt bonuses are self-only, Pyro-entry scoped, conditional, and survive request replay", () => {
    const f = fixture();
    setElement(f.elements, "genshinJsonReactionOption", "vaporize15");
    const off = f.calculate();
    setOption(f, FORM, "darkVaporize");
    const vaporize = f.calculate();
    near(result(vaporize, "damage_6").breakdown.reactionBonus, 40, "Dark Vaporize");
    near(result(vaporize, "damage_4").breakdown.reactionBonus, 40, "Dark Vaporize on another Pyro Burst entry");
    near(result(vaporize, "normal_1damage").breakdown.reactionBonus, 0, "physical normal attack must not get an elemental reaction bonus");
    near(result(vaporize, "normal_1damage").expected, result(off, "normal_1damage").expected, "physical normal damage isolation");
    near(result(vaporize, "damage_6").expected, result(off, "damage_6").expected * 1.4, "actual Vaporize damage");
    replay(f, vaporize);

    setElement(f.elements, "genshinJsonReactionOption", "melt15");
    setOption(f, FORM, "darkMelt");
    const melt = f.calculate();
    near(result(melt, "damage_6").breakdown.reactionBonus, 40, "Dark Melt");
    setElement(f.elements, "genshinJsonReactionOption", "none");
    const noReaction = f.calculate();
    near(result(noReaction, "damage_6").breakdown.reactionBonus, 0, "no reaction");
});

test("Durin A4 multiplies talent base only, C1 is additive, and the combination follows the confirmed ordering", () => {
    const f = fixture({ constellation: 1, atk: 2000 });
    setOption(f, FORM, "dark");
    const rawTalentBase = 4674.24; // Lv10 Burst hit, ATK 2000, 233.712%.

    const off = f.calculate();
    near(result(off, "damage_6").breakdown.scalingParts[0].baseDamage, rawTalentBase, "base talent damage");
    near(result(off, "damage_6").breakdown.baseTalentDamageMultiplier, 1, "A4 off multiplier");
    near(result(off, "damage_6").breakdown.additiveBaseDamage, 0, "C1 off addition");

    setStack(f, A4_STACKS, 1);
    const a4 = f.calculate();
    near(result(a4, "damage_6").breakdown.baseTalentDamageMultiplier, 1.6, "A4 talent-only multiplier");
    near(result(a4, "damage_6").breakdown.additiveBaseDamage, 0, "A4 must not create additive damage");
    near(result(a4, "damage_6").breakdown.scalingParts[0].baseDamage * result(a4, "damage_6").breakdown.baseTalentDamageMultiplier, 7478.784, "A4-only talent base");
    near(result(a4, "damage_6").expected, 3365.4528, "A4-only final non-crit damage");
    near(result(a4, "damage_4").breakdown.baseTalentDamageMultiplier, 1, "A4 must not reach the other Burst state");
    near(result(a4, "normal_1damage").breakdown.baseTalentDamageMultiplier, 1, "A4 must not reach Normal Attack");

    setStack(f, C1_STACKS, 2);
    setStack(f, C1_STACKS, 1);
    near(result(f.calculate(), "damage_6").breakdown.additiveBaseDamage, 0, "Dark C1 is inactive at one stack");
    setStack(f, C1_STACKS, 2);
    const combined = f.calculate();
    near(result(combined, "damage_6").breakdown.additiveBaseDamage, 3000, "C1 Dark adds 150% current ATK at two stacks");
    near(result(combined, "damage_6").breakdown.baseTalentDamageMultiplier, 1.6, "A4 and C1 remain separate");
    near(rawTalentBase * result(combined, "damage_6").breakdown.baseTalentDamageMultiplier + result(combined, "damage_6").breakdown.additiveBaseDamage, 10478.784, "confirmed A4/C1 ordering");
    near(result(combined, "damage_6").expected, 4715.4528, "combined final non-crit damage");
    near(result(combined, "damage_4").breakdown.additiveBaseDamage, 3000, "Dark C1 other target Burst hit");
    near(result(combined, "normal_1damage").breakdown.additiveBaseDamage, 0, "C1 does not reach Normal Attack");
    replay(f, combined);

    const capped = fixture({ constellation: 1, atk: 2500 });
    setOption(capped, FORM, "dark");
    setStack(capped, A4_STACKS, 10);
    setStack(capped, C1_STACKS, 2);
    const capResult = capped.calculate();
    near(result(capResult, "damage_6").breakdown.scalingParts[0].baseDamage, 5842.8, "cap case talent base");
    near(result(capResult, "damage_6").breakdown.baseTalentDamageMultiplier, 1.75, "A4 75% cap");
    near(result(capResult, "damage_6").breakdown.additiveBaseDamage, 3750, "C1 remains additive outside A4 cap");
    near(5842.8 * 1.75 + 3750, 13974.9, "cap case pre-bonus base");
});

test("Durin missing authored attack parameters are separate single-hit entries", () => {
    const f = fixture();
    const payload = f.calculate();
    const required = [
        ["normal_1damage", "normalAttack", "param1"], ["normal_2damage", "normalAttack", "param2"],
        ["normal_3damage", "normalAttack", "param3"], ["normal_3damage_2", "normalAttack", "param4"],
        ["normal_4damage", "normalAttack", "param5"], ["chargeddamage", "chargedAttack", "param6"],
        ["damage", "skill", "param1"], ["damage_2", "skill", "param2"],
        ["damage_2_2", "skill", "param3"], ["damage_2_3", "skill", "param4"],
        ["damage_3", "burst", "param1"], ["damage_3_2", "burst", "param2"],
        ["damage_3_3", "burst", "param3"], ["damage_4", "burst", "param4"],
        ["damage_4_2", "burst", "param5"], ["damage_4_3", "burst", "param6"],
        ["damage_5", "burst", "param7"], ["damage_6", "burst", "param8"]
    ];
    for (const [id, group, param] of required) {
        const item = result(payload, id);
        assert.equal(item.entry.attackType, group, id);
        assert.equal(item.entry.source.param, param, id);
        assert.equal(item.entry.hitCount, 1, id);
        assert.ok(item.expected > 0, id);
    }
    assert.equal(result(payload, "normal_3damage").entry.source.param, "param3");
    assert.equal(result(payload, "normal_3damage_2").entry.source.param, "param4");
});




function partyFixture({ mainId = "10000029", constellation = 1, providerAtk = 3000 } = {}) {
    const f = fixture({ characterId: mainId, atk: 1800, baseAtk: 900 });
    const request = f.engine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: mainId },
            { slot: 2, role: "support", enabled: true, characterId: DURIN, constellation,
                stats: { atk: providerAtk, baseAtk: 1000, hp: 20000, def: 1000, elementalMastery: 0 },
                talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {} }
        ]
    };
    return { ...f, request };
}

test("Durin C1 white buff uses provider ATK, excludes Durin, and its distinct stack thresholds are honored", () => {
    const self = fixture({ constellation: 1, atk: 2000 });
    setOption(self, FORM, "white");
    setStack(self, C1_STACKS, 1);
    const selfWhite = self.calculate();
    near(result(selfWhite, "damage_3").breakdown.additiveBaseDamage, 0, "white C1 never buffs Durin himself");

    const party = partyFixture({ providerAtk: 3000 });
    const before = party.calculate(party.request);
    const c1 = before.partyModifiers.find((item) => item.modifier.id === "durin_c1_white_additive");
    assert.ok(c1, "white C1 is exposed to party state");
    party.request.party.conditionStates[c1.partyConditionStateKey] = { stack: 1 };
    party.request.party.conditionStates["party:2:10000123:group:durinEssentialTransmutationForm"] = { option: "white", enabled: true };
    const active = party.calculate(party.request);
    near(active.partyModifiers.find((item) => item.modifier.id === "durin_c1_white_additive").resolvedValue, 60);
    near(result(active, "normal_1damage").breakdown.additiveBaseDamage, 1800, "one white C1 stack uses support ATK 3000");
    near(result(active, "chargeddamage").breakdown.additiveBaseDamage, 1800, "White C1 includes Charged Attack");
    near(result(active, "plunge_damage").breakdown.additiveBaseDamage, 1800, "White C1 includes Plunging Attack");
    assert.equal(result(active, "normal_1damage").entry.element, "炎");
    for (const id of ["chargeddamage", "plunge_damage", "low_plungedamage", "high_plungedamage"]) near(result(active, id).breakdown.additiveBaseDamage, 1800, "C1 covers charged and plunge entry groups");
    replay(party, active);

    const dark = fixture({ constellation: 1, atk: 2000 });
    setOption(dark, FORM, "dark");
    setStack(dark, C1_STACKS, 1);
    near(result(dark.calculate(), "damage_6").breakdown.additiveBaseDamage, 0, "Dark C1 requires at least two remaining stacks");
    setStack(dark, C1_STACKS, 2);
    near(result(dark.calculate(), "damage_6").breakdown.additiveBaseDamage, 3000, "two Dark C1 stacks add current Durin ATK times 150%");
});

test("Durin White Flame resistance debuff is enemy-side and restricted to listed reaction elements", () => {
    const f = fixture();
    setOption(f, FORM, "whiteOverload");
    const payload = f.calculate();
    const pyro = result(payload, "damage");
    const physical = result(payload, "normal_1damage");
    assert.equal(pyro.entry.element, "炎");
    near(pyro.breakdown.resistance, -10, "Pyro RES 10 minus White Flame 20");
    near(physical.breakdown.resistance, 10, "no universal resistance reduction leaks to physical damage");
    const activeIds = pyro.breakdown.appliedModifiers.map((item) => item.modifier?.id);
    assert.ok(activeIds.includes("durin_white_pyro_resistance"));
    assert.ok(!activeIds.includes("durin_white_electro_resistance"), "Electro RES does not affect a Pyro entry");
    assert.ok(!physical.breakdown.appliedModifiers.some((item) => item.modifier?.category === "resistanceDebuff"));
});

test("Durin C6 separates self Burst DEF ignore from the White Dragon enemy DEF shred", () => {
    const dark = fixture({ constellation: 6 });
    setOption(dark, FORM, "dark");
    const darkPayload = dark.calculate();
    near(result(darkPayload, "damage_6").breakdown.defenseIgnore, 70, "C6 baseline 30 plus Dark Dragon 40");
    near(result(darkPayload, "normal_1damage").breakdown.defenseIgnore, 0, "C6 ignore does not reach Normal Attack");
    near(result(darkPayload, "damage_2").breakdown.defenseIgnore, 0, "C6 ignore does not reach Skill");

    const white = fixture({ constellation: 6 });
    setOption(white, FORM, "white");
    setOption(white, "character:10000123:group:durinWhiteDragonHit", "active");
    const whitePayload = white.calculate();
    near(result(whitePayload, "normal_1damage").breakdown.defenseIgnore, 0, "White Dragon hit does not add self DEF ignore");
    near(result(whitePayload, "normal_1damage").breakdown.defenseDebuff, 30, "White Dragon hit applies enemy DEF shred separately");
    near(result(whitePayload, "damage_3").breakdown.defenseIgnore, 30, "C6 baseline Burst ignore remains separate");
    assert.ok(result(whitePayload, "normal_1damage").breakdown.appliedModifiers.some((item) => item.modifier?.id === "c_10000123_6_2"));
    assert.ok(!result(whitePayload, "normal_1damage").breakdown.appliedModifiers.some((item) => item.modifier?.id === "c_10000123_6_1"));
    replay(white, whitePayload);
});





test("Durin C2 shares the reaction event, buffs Pyro plus only the triggering element, and never copies Dark self reaction damage to the party", () => {
    const pyro = partyFixture({ mainId: "10000029", constellation: 2 });
    setElement(pyro.elements, "genshinJsonReactionOption", "vaporize15");
    const base = pyro.engine.buildCalculationRequestFromForm();
    pyro.request.reactionOptionKey = base.reactionOptionKey;
    pyro.request.reactionOption = base.reactionOption;
    const pyroOff = pyro.calculate(pyro.request);
    const formKey = "party:2:10000123:group:durinEssentialTransmutationForm";
    pyro.request.party.conditionStates[formKey] = { option: "whiteOverload", enabled: true };
    const active = pyro.calculate(pyro.request);
    const pyroBuff = active.partyModifiers.find((item) => item.modifier.id === "durin_c2_pyro_bonus");
    const electroBuff = active.partyModifiers.find((item) => item.modifier.id === "durin_c2_electro_bonus");
    assert.equal(pyroBuff.status, "ready");
    assert.equal(electroBuff.status, "ready");
    const pyroHit = active.results.find((item) => item.entry.element === "炎");
    assert.ok(pyroHit);
    near(pyroHit.breakdown.damageBonus - result(pyroOff, pyroHit.entry.id).breakdown.damageBonus, 50, "C2 Pyro bonus delta");
    near(pyroHit.breakdown.reactionBonus, 0, "Durin's self Vape/Melt modifier is not a party modifier");
    assert.ok(!active.partyModifiers.some((item) => ["durin_dark_vaporize_bonus", "durin_dark_melt_bonus"].includes(item.modifier.id)));
    replay(pyro, active);

    const electro = partyFixture({ mainId: "10000031", constellation: 2 });
    const electroOff = electro.calculate(electro.request);
    const electroFormKey = "party:2:10000123:group:durinEssentialTransmutationForm";
    electro.request.party.conditionStates[electroFormKey] = { option: "whiteOverload", enabled: true };
    const electroActive = electro.calculate(electro.request);
    const electroHit = electroActive.results.find((item) => item.entry.element === "雷");
    assert.ok(electroHit, "Fischl has an Electro damage entry");
    near(electroHit.breakdown.damageBonus - result(electroOff, electroHit.entry.id).breakdown.damageBonus, 50, "C2 grants the Overload participant's corresponding-element bonus");
    near(electroHit.breakdown.reactionBonus, 0, "C2 elemental DMG buff is not a reaction damage multiplier");

    const hydro = partyFixture({ mainId: "10000025", constellation: 2 });
    const hydroOff = hydro.calculate(hydro.request);
    const hydroFormKey = "party:2:10000123:group:durinEssentialTransmutationForm";
    hydro.request.party.conditionStates[hydroFormKey] = { option: "whiteVaporize", enabled: true };
    const hydroActive = hydro.calculate(hydro.request);
    const hydroHit = hydroActive.results.find((item) => item.entry.element === "水");
    assert.ok(hydroHit, "Xingqiu has a Hydro damage entry");
    near(hydroHit.breakdown.damageBonus - result(hydroOff, hydroHit.entry.id).breakdown.damageBonus, 50, "C2 Vaporize corresponding-element bonus");
});

test("Durin C6 party White Dragon state shreds enemy DEF without granting party Burst ignore", () => {
    const party = partyFixture({ mainId: "10000029", constellation: 6 });
    const formKey = "party:2:10000123:group:durinEssentialTransmutationForm";
    const hitKey = "party:2:10000123:group:durinWhiteDragonHit";
    party.request.party.conditionStates[formKey] = { option: "white", enabled: true };
    party.request.party.conditionStates[hitKey] = { option: "active", enabled: true };
    const active = party.calculate(party.request);
    const mainHit = active.results.find((item) => item.entry.element === "炎");
    assert.ok(mainHit);
    near(mainHit.breakdown.defenseDebuff, 30, "White Dragon hit reduces enemy DEF for the party");
    near(mainHit.breakdown.defenseIgnore, 0, "Durin's own Burst ignore is not shared with party members");
    assert.ok(mainHit.breakdown.appliedModifiers.some((item) => item.modifier?.id === "c_10000123_6_2"));
    assert.ok(!mainHit.breakdown.appliedModifiers.some((item) => item.modifier?.id === "c_10000123_6_1"));
    replay(party, active);
});

test("Durin A4 reads current ATK and C3/C5 remain represented by entered talent levels", () => {
    const f = fixture({ constellation: 6, atk: 1200, baseAtk: 1000 });
    f.calcData.talentModifiers[DURIN].passives.push({
        sourceId: "fixtureCurrentAtkBonus",
        modifiers: [{ id: "fixture_current_atk_flat", category: "statBonus", applyTo: ["atkFlat"], value: 500, unit: "flat", condition: "always", calculationSupport: "simple", uidHandling: "conditional" }]
    });
    setOption(f, FORM, "dark");
    setStack(f, A4_STACKS, 1);
    const payload = f.calculate();
    assert.equal(payload.context.effectiveStats.atk, 1700);
    near(result(payload, "damage_6").breakdown.baseTalentDamageMultiplier, 1.51, "A4 uses current ATK after the fixture buff");
    setStack(f, C1_STACKS, 2); near(result(f.calculate(), "damage_6").breakdown.additiveBaseDamage, 2550, "C1 references the same current ATK");
    for (const [id, level] of [["normal_1damage", 10], ["damage_2", 10], ["damage_6", 10]]) {
        assert.equal(result(payload, id).breakdown.talentLevel, level, `${id} already uses the entered final talent level`);
    }
});


test("Durin A4/C1 Golden Cases fix actual downstream damage, with C1 outside the A4 multiplier", () => {
    for (const [atk, a4, c1, multiplier, addition, expected] of [
        [2000, 0, 0, 1, 0, 2103.408],
        [2000, 1, 0, 1.6, 0, 3365.4528],
        [2000, 0, 2, 1, 3000, 3453.408],
        [2000, 1, 2, 1.6, 3000, 4715.4528],
        [2500, 10, 20, 1.75, 3750, 6288.705],
        [3000, 10, 20, 1.75, 4500, 7546.446]
    ]) {
        const f = fixture({ constellation: 1, atk });
        setOption(f, FORM, "dark"); setStack(f, A4_STACKS, a4); setStack(f, C1_STACKS, c1);
        const payload = f.calculate(), hit = result(payload, "damage_6");
        near(hit.breakdown.baseTalentDamageMultiplier, multiplier); near(hit.breakdown.additiveBaseDamage, addition);
        near(hit.expected, expected, "fixed Golden final damage"); near(hit.nonCrit, expected);
        replay(f, payload);
    }
});

test("Durin self reaction bonus never reaches a party recipient, non-target reaction, or inactive form", () => {
    for (const reaction of ["vaporize15", "melt20", "overload", "none"]) {
        const self = fixture(); setElement(self.elements, "genshinJsonReactionOption", reaction);
        setOption(self, FORM, "inactive"); const off = self.calculate();
        setOption(self, FORM, "dark"); const own = self.calculate();
        near(result(own, "damage_6").breakdown.reactionBonus, /vaporize|melt/.test(reaction) ? 40 : 0);
        if (["none", "overload"].includes(reaction)) near(result(own, "damage_6").expected, result(off, "damage_6").expected);
        const p = partyFixture({ constellation: 0 }); setElement(p.elements, "genshinJsonReactionOption", reaction);
        const request = p.engine.buildCalculationRequestFromForm(); request.party = p.request.party;
        const recipientOff = p.calculate(request);
        request.party.conditionStates["party:2:10000123:group:durinEssentialTransmutationForm"] = { option: "dark" };
        const recipientOn = p.calculate(request);
        const damageValues = payload => payload.results.map(row => ({ id: row.entry.id, nonCrit: row.nonCrit, crit: row.crit, expected: row.expected, total: row.total, reactionBonus: row.breakdown.reactionBonus }));
        assert.deepEqual(JSON.parse(JSON.stringify(damageValues(recipientOn))), JSON.parse(JSON.stringify(damageValues(recipientOff))));
        for (const row of recipientOn.results) near(row.breakdown.reactionBonus, 0);
        replay(p, recipientOn);
    }
});

test("Durin raw Lv1-15 coefficients and all 21 independent attacks stay source-linked and typed", () => {
    const raw = require("../../games/genshin/data/calc/sources/durin-currentcalc-talents.response.json");
    const f = fixture(); const baseline = f.calculate(); assert.equal(baseline.results.length, 21);
    for (const row of baseline.results) {
        const e = row.entry; const parameters = raw[e.source.talentKey].attributes.parameters[e.source.param];
        for (let level = 1; level <= 15; level++) near(e.scalings[0].valuesByLevel[String(level)], parameters[level - 1] * 100);
        assert.equal(e.hitCount, 1); assert.equal(e.damageType, e.group === "normalAttack" ? (e.attackType === "normalAttack" ? "normal" : e.attackType === "chargedAttack" ? "charged" : "plunging") : e.group);
    }
    for (const [form, absent] of [["white", "damage_6"], ["dark", "damage_5"]]) {
        setOption(f, FORM, form); const payload = f.calculate();
        assert.equal(payload.results.some(r => r.entry.id === absent), false);
    }
});

test("Durin has one shared form input, separate resource inputs, and scoped C4 Burst bonus", () => {
    const f = fixture({ constellation: 6 }); setOption(f, FORM, "dark");
    const p = f.calculate(); const panel = f.sandbox.GenshinCalcConditions.conditionPanelState(p.context, f.calcData);
    for (const key of [FORM, C1_STACKS, A4_STACKS]) assert.equal(panel.complexConditionInputs.filter(i => i.key === key).length, 1);
    const c4 = p.results.filter(r => r.breakdown.appliedModifiers.some(m => m.modifier.id === "c_10000123_4_1"));
    assert.ok(c4.length); assert.ok(c4.every(r => r.entry.group === "burst"));
    const party = partyFixture({ constellation: 4 }); party.request.party.conditionStates["party:2:10000123:group:durinEssentialTransmutationForm"] = { option: "dark" };
    const target = party.calculate(party.request);
    assert.ok(target.results.every(r => !r.breakdown.appliedModifiers.some(m => m.modifier.id === "c_10000123_4_1")));
});
