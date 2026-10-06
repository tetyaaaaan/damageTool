"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");
const root = path.resolve(__dirname, "../..");
const dir = "../../games/genshin/data/v2/version-transitions/7.0-to-7.1/";
const batch = require(dir + "weapons-currentcalc-batch2.json");
const documents = [require(dir + "weapons-currentcalc-batch1.json"), require(dir + "weapon14524-currentcalc.json"), batch];
const inventory = require(dir + "sources/vesna-currentcalc/inventory-selected-records.json");
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

function fixture(weaponId, refinement = 1, characterId = "10000003") {
    const f = createScenarioHarness(), box = { window: {}, console }; vm.createContext(box);
    for (const name of ["genshinDataContract", "genshinCalcData"])
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name + ".js"), "utf8"), box);
    box.window.GenshinCalcData.applyProvisional70Data(f.calcData, [require("../../games/genshin/data/v2/candidates/7.0-provisional-stellar-swirl.json")]);
    box.window.GenshinCalcData.applyProvisional71Data(f.calcData, documents, f.calcData.warnings);
    prepareScenarioInputs(f.elements, { characterId, weaponId, stats: { atk: 2000, baseAtk: 1000, hp: 20000, baseHp: 10000, elementalMastery: 0, critRate: 50, critDamage: 100, energyRecharge: 100, elementDamageBonus: 0 } });
    f.engine = f.sandbox.GenshinCalcEngine; f.conditions = f.sandbox.GenshinCalcConditions;
    f.request = f.engine.buildCalculationRequestFromForm(); f.request.refinement = refinement;
    f.conditions.conditionPanelState(f.request, f.calcData);
    f.calc = () => f.engine.calculateDamageRequest(f.request, f.calcData);
    return f;
}
function select(f, suffix, option) {
    const group = `provisional71_w${f.request.weaponId}_${suffix}`;
    const inputs = f.conditions.conditionPanelState(f.request, f.calcData).complexConditionInputs.filter(x => x.conditionGroupId === group);
    assert.equal(inputs.length, 1, "one shared game-state control");
    f.request.uiState.complexConditionByModifier[inputs[0].key] = { option };
    f.conditions.conditionPanelState(f.request, f.calcData);
}
function roster(f, ids) {
    f.request.party = { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members: ids.map((id, i) => ({ slot: i + 1, enabled: true, role: i === 0 ? "main" : "support", characterId: id, stats: { ...f.request.stats }, equipment: { weaponId: i === 0 ? f.request.weaponId : "" }, buffStates: {} })) };
    f.conditions.conditionPanelState(f.request, f.calcData);
}
function replay(f, p) {
    const q = f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(p.calculationRequest)), f.calcData);
    assert.deepEqual(JSON.parse(JSON.stringify(q.results)), JSON.parse(JSON.stringify(p.results)));
}
function probe(f, p, reaction, element = "風") {
    const entry = { id: "controlled", element, attackType: "skill", damageType: "skill", group: "skill", levelSource: "skill", directReactionId: reaction, scalings: [{ stat: "atk", valuesByLevel: { 10: 100 } }], hitCount: 1 };
    const applied = f.engine.applyModifiersToDamageEntry(entry, p.context, f.engine.collectActiveModifiers(f.calcData, p.context));
    return { totals: applied.totals, result: f.engine.calculateDamage(entry, p.context, applied) };
}

test("batch2 identities and all refinement fields retain the stored 7.1 source", () => {
    for (const [id, weapon] of Object.entries(batch.weapons)) {
        const raw = inventory.datasets.weapons.records.find(w => String(w.id) === id);
        assert.equal(raw.version, "7.1"); assert.equal(weapon.nameJa, raw.name); assert.equal(weapon.weaponType, raw.weaponText);
        for (let r = 1; r <= 5; r++) assert.deepEqual(Object.values(batch.weaponEffects[id].effectParamsByRefinement[r]), raw["r" + r].values);
        assert.ok(!batch.weaponModifiers[id].modifiers.some(m => ["damageBonus", "reactionBaseDamageBonus", "reactionCritBonus", "extraDamage", "effectOverride"].includes(m.category)));
    }
    assert.equal(batch.deferredUnknowns.length, 1); assert.equal(batch.deferredUnknowns[0].weaponId, "11437");
    for (let r = 1; r <= 5; r++) near(batch.deferredUnknowns[0].rawCoefficientByRefinement[r], parseFloat(inventory.datasets.weapons.records.find(w => String(w.id) === "11437")["r" + r].values[3]));
    assert.equal(batch.currentCalcClassification["11437"].siteReady, false);
});

test("batch2 every Lv1-90 and both ascension sides use exact standard ATK and substat profiles", async () => {
    const base = require("../../games/genshin/data/base-stats.json");
    const box = { console, document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } }, fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, String(url)), "utf8")) }) };
    box.window = box; vm.createContext(box); vm.runInContext(fs.readFileSync(path.join(root, "games/js/genshinBaseStats.js"), "utf8"), box); await box.GenshinBaseStats.ready;
    for (const [id, s] of Object.entries(batch.baseStats.weapons)) {
        const reference = base.weapons[s.growthReferenceWeaponId], raw = inventory.datasets.weapons.records.find(w => String(w.id) === id);
        assert.deepEqual(s.baseProps, reference.baseProps); assert.deepEqual(s.curveIds, reference.curveIds);
        near(s.baseProps[4], raw.baseAtkValue); near(s.baseProps[s.secondaryPropId] * 100, parseFloat(raw.baseStatText));
        for (let lv = 1; lv <= 90; lv++) {
            const actual = box.GenshinBaseStats.resolveWeapon(id, lv);
            near(actual.weaponBaseAtk, box.GenshinBaseStats.resolveWeapon(s.growthReferenceWeaponId, lv).weaponBaseAtk);
            near(actual.weaponSecondaryValue, s.baseProps[s.secondaryPropId] * base.curves[s.curveIds[s.secondaryPropId]][lv - 1] * 100);
        }
        [20, 40, 50, 60, 70, 80].forEach((lv, i) => { for (const stage of [i, i + 1]) near(box.GenshinBaseStats.resolveWeapon(id, lv, stage).weaponBaseAtk, box.GenshinBaseStats.resolveWeapon(s.growthReferenceWeaponId, lv, stage).weaponBaseAtk); });
    }
});

test("11437 R1-R5 shares current stacks/state, replaces ordinary EM and retains ATK precision", () => {
    for (let r = 1; r <= 5; r++) {
        const f = fixture("11437", r), off = f.calc();
        for (const mode of ["ordinary", "radiant"]) for (const n of [1, 2, 3]) {
            select(f, "growth_state", mode + n); const p = f.calc();
            near(p.context.effectiveStats.atk, 2000 + 1000 * (mode === "ordinary" ? 3 + r : 4.5 + r * 1.5) * n / 100);
            near(p.context.effectiveStats.elementalMastery, mode === "ordinary" ? (15 + r * 5) * n : 0);
            assert.ok(p.results[0].nonCrit > off.results[0].nonCrit);
            assert.ok(p.warnings.some(w => w.weaponId === "11437" && /星反応.*仕様確認中/.test(w.message)));
            for (const reaction of ["stellarConduct", "stellarSwirl"]) near(probe(f, p, reaction).totals.reactionBonus, 0);
            replay(f, p);
        }
        select(f, "growth_state", "inactive"); near(f.calc().context.effectiveStats.atk, 2000);
    }
});

test("14437 R1-R5 reads actual Cryo/Electro composition, including wearer, and replaces the whole effect", () => {
    for (let r = 1; r <= 5; r++) for (const ids of [["10000054"], ["10000054", "10000015"], ["10000054", "10000015", "10000031"], ["10000006", "10000037", "10000015", "10000031"]]) {
        const f = fixture("14437", r, ids[0]); roster(f, ids);
        const cryo = ids.filter(id => f.calcData.characters[id].element === "氷").length, electro = ids.filter(id => f.calcData.characters[id].element === "雷").length;
        select(f, "pact_state", "ordinary"); const ordinary = f.calc();
        near(ordinary.context.effectiveStats.atk, 2000 + 1000 * (3.6 + r * 1.2) * electro / 100);
        near(ordinary.context.effectiveStats.elementalMastery, (18 + r * 6) * cryo);
        near(probe(f, ordinary, "stellarSwirl").totals.reactionBonus, 0); replay(f, ordinary);
        select(f, "pact_state", "radiant"); const radiant = f.calc();
        near(radiant.context.effectiveStats.atk, 2000);
        near(radiant.context.effectiveStats.elementalMastery, (15 + r * 5) * (cryo + electro));
        for (const reaction of ["stellarConduct", "stellarSwirl"]) for (const element of ["風", "氷", "雷"])
            near(probe(f, radiant, reaction, element).totals.reactionBonus, (4.5 + r * 1.5) * (cryo + electro));
        for (const reaction of ["none", "vaporize", "lunarCrystallize", "lunarCharged"]) near(probe(f, radiant, reaction).totals.reactionBonus, 0);
        replay(f, radiant);
    }
});

test("14437 composition follows disabled members and caps the qualifying count at four", () => {
    const f = fixture("14437", 1, "10000054"); roster(f, ["10000054", "10000015", "10000031", "10000052"]);
    select(f, "pact_state", "radiant"); near(f.calc().context.effectiveStats.elementalMastery, 60);
    f.request.party.members[2].enabled = false; near(f.calc().context.effectiveStats.elementalMastery, 40);
    // The resolver also limits the coefficient even for an oversized externally supplied roster.
    f.request.party.members.push({ slot: 5, enabled: true, characterId: "10000037", equipment: {}, stats: {} });
    const p = f.calc(); assert.ok(p.context.effectiveStats.elementalMastery <= 80); replay(f, p);
});

test("15437 permanent ER is already in final inputs and never receives a second Runtime addition", () => {
    for (let r = 1; r <= 5; r++) {
        const f = fixture("15437", r, "10000031"); f.request.stats.energyRecharge = 100 + 15 + r * 5;
        const p = f.calc(); near(p.context.effectiveStats.energyRecharge, 100 + 15 + r * 5);
        assert.ok(!p.statTrace.some(t => t.modifierId === "provisional71_w15437_er")); replay(f, p);
    }
});

test("15437 R1-R5 shared pre-trigger/active state affects only wearer Star reactions once", () => {
    for (let r = 1; r <= 5; r++) {
        const f = fixture("15437", r, "10000031");
        roster(f, ["10000031", "10000003"]);
        const off = f.calc();
        for (const state of ["hymn0", "hymn1", "hymn2", "venom"]) {
            select(f, "hymn_state", state); const p = f.calc();
            for (const reaction of ["stellarConduct", "stellarSwirl"]) for (const element of ["風", "氷", "雷"])
                near(probe(f, p, reaction, element).totals.reactionBonus, state === "venom" ? 18 + r * 6 : 0);
            for (const reaction of ["none", "vaporize", "lunarCrystallize", "lunarCharged"]) near(probe(f, p, reaction).totals.reactionBonus, 0);
            near(p.results.find(x => x.entry.attackType === "normalAttack").expected, off.results.find(x => x.entry.attackType === "normalAttack").expected);
            if (state === "venom") assert.ok(probe(f, p, "stellarSwirl").result.expected > probe(f, off, "stellarSwirl").result.expected);
            replay(f, p);
        }
    }
});

test("generic Star bonus stays off ordinary damage entries even while a Star reaction is selected", () => {
    for (const [id, suffix, state] of [["14437", "pact_state", "radiant"], ["15437", "hymn_state", "venom"]]) {
        const f = fixture(id, 1, "10000006"); select(f, suffix, state);
        f.request.reactionOptionKey = "stellarSwirl"; const p = f.calc();
        const ordinary = { id: "ordinary", element: "雷", attackType: "normalAttack", damageType: "normalAttack", group: "normalAttack", scalings: [{ stat: "atk", valuesByLevel: { 10: 100 } }], hitCount: 1 };
        near(f.engine.applyModifiersToDamageEntry(ordinary, p.context, f.engine.collectActiveModifiers(f.calcData, p.context)).totals.reactionBonus, 0);
        near(probe(f, p, "stellarSwirl").totals.reactionBonus, id === "15437" ? 24 : 6); replay(f, p);
    }
});

test("15437 party recipients use provider refinement, not provider/recipient stats; non-active states stay off", () => {
    for (let r = 1; r <= 5; r++) for (const recipient of ["10000003", "10000052"]) {
        const f = fixture("", 5, recipient); roster(f, [recipient, "10000031", "10000015"]);
        const provider = f.request.party.members[1]; provider.equipment = { weaponId: "15437", refinement: r };
        const key = "party:2:10000031:group:provisional71_w15437_hymn_state";
        for (const state of ["hymn0", "hymn1", "hymn2", "venom"]) {
            f.request.party.conditionStates[key] = { enabled: true, option: state }; provider.buffStates[key] = true;
            f.conditions.conditionPanelState(f.request, f.calcData); const p = f.calc();
            near(probe(f, p, "stellarSwirl").totals.reactionBonus, state === "venom" ? 18 + r * 6 : 0); replay(f, p);
        }
        provider.stats = { atk: 500, hp: 500, elementalMastery: 999 };
        f.request.stats.elementalMastery = 400; const p = f.calc(); near(probe(f, p, "stellarSwirl").totals.reactionBonus, 18 + r * 6);
        near(probe(f, p, "none").totals.reactionBonus, 0); replay(f, p);
    }
});

test("self-only 11437/14437 cannot become party buffs and swapping the wearer finds the real owner", () => {
    for (const id of ["11437", "14437"]) {
        const f = fixture("", 1, "10000003"); roster(f, ["10000003", "10000015"]);
        f.request.party.members[1].equipment = { weaponId: id, refinement: 5 };
        const p = f.calc(); near(p.context.effectiveStats.atk, 2000); near(p.context.effectiveStats.elementalMastery, 0);
        near(probe(f, p, "stellarSwirl").totals.reactionBonus, 0); replay(f, p);
    }
    const f = fixture("", 1, "10000003"); roster(f, ["10000003", "10000015", "10000031"]);
    f.request.party.members[2].equipment = { weaponId: "15437", refinement: 5 };
    const key = "party:3:10000031:group:provisional71_w15437_hymn_state";
    f.request.party.conditionStates[key] = { option: "venom", enabled: true }; f.request.party.members[2].buffStates[key] = true;
    near(probe(f, f.calc(), "stellarSwirl").totals.reactionBonus, 48);
    f.request.party.members[2].equipment.weaponId = "";
    near(probe(f, f.calc(), "stellarSwirl").totals.reactionBonus, 0);
});

test("switching all three weapons leaves no prior weapon stat/reaction effect in saved replay", () => {
    for (const [id, suffix, state] of [["11437", "growth_state", "radiant3"], ["14437", "pact_state", "radiant"], ["15437", "hymn_state", "venom"]]) {
        const f = fixture(id); select(f, suffix, state); f.request.weaponId = "11501";
        const p = f.calc(); near(p.context.effectiveStats.atk, 2000); near(p.context.effectiveStats.elementalMastery, 0);
        near(probe(f, p, "stellarSwirl").totals.reactionBonus, 0);
        assert.ok(!p.warnings.some(w => w.weaponId === id)); replay(f, p);
    }
});

test("six-weapon bounded inventory has only declared pending numerical effects", () => {
    const weapons = documents.flatMap(d => Object.keys(d.weapons)); assert.deepEqual(weapons.sort(), ["11437", "11438", "11522", "14437", "14524", "15437"]);
    for (const d of documents) for (const [id, entry] of Object.entries(d.weaponModifiers)) for (const m of entry.modifiers) {
        if (["displayOnly", "unsupported"].includes(m.calculationSupport)) assert.ok(d.deferredUnknowns?.some(x => x.weaponId === id && x.effectId === m.id));
        else if (m.partyElementCount) assert.ok(m.valueByRefinement && Object.keys(m.valueByRefinement).length === 5);
        else assert.ok([m.valueByRefinement, m.valueByRefinementPerStack, m.valueByRefinementByCondition].some(map => map && Object.keys(map).length === 5));
    }
});
