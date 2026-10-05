"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

const SANDRONE = "10000133";
const root = path.resolve(__dirname, "../..");
const candidate = (name) => JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/candidates", name), "utf8"));
const PROVISIONAL_CHARACTERS = "7.0-provisional-characters.json";
const PROVISIONAL_STELLAR_SWIRL = "7.0-provisional-stellar-swirl.json";
const SOURCE = require("../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard16/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/talents/sandrone.json");
const TALENT_SCALINGS = require("../../games/genshin/data/calc/talent-scalings.json");

function loaderApi() {
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

function fixture({ characterId = SANDRONE, constellation = 0, atk = 1850, em = 0, critRate = 0, critDamage = 0 } = {}) {
    const f = createScenarioHarness();
    loaderApi().applyProvisional70Data(f.calcData, [candidate(PROVISIONAL_CHARACTERS), candidate(PROVISIONAL_STELLAR_SWIRL)], []);
    prepareScenarioInputs(f.elements, {
        characterId, constellation,
        stats: { atk, baseAtk: 1000, hp: 20000, def: 1000, elementalMastery: em, critRate, critDamage, elementDamageBonus: 0 }
    });
    f.engine = f.sandbox.GenshinCalcEngine;
    f.calculate = (request) => f.engine.calculateDamageRequest(request || f.engine.buildCalculationRequestFromForm(), f.calcData);
    return f;
}

function near(actual, expected, label = "value") {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} !== ${expected}`);
}

function result(payload, id) {
    const row = payload.results.find((item) => item.entry.id === id);
    assert.ok(row, `missing damage entry ${id}`);
    return row;
}

function candidateFor(payload, id) {
    const item = payload.candidateModifiers.find((entry) => entry.modifier?.id === id);
    assert.ok(item, `missing modifier candidate ${id}`);
    return item;
}

function setModifierState(f, payload, id, state) {
    const item = candidateFor(payload, id);
    const key = item.analysis.conditionStateKey;
    const complexKey = item.modifier.conditionGroupId
        ? `character:${SANDRONE}:group:${item.modifier.conditionGroupId}`
        : key;
    f.request.uiState.conditionByModifier ||= {};
    f.request.uiState.complexConditionByModifier ||= {};
    f.request.uiState.conditionByModifier[key] = { enabled: true, ...state };
    f.request.uiState.complexConditionByModifier[complexKey] = { enabled: true, ...state };
    return key;
}

function setGroupState(f, analysisKey, complexKey, state) {
    f.request.uiState.conditionByModifier ||= {};
    f.request.uiState.complexConditionByModifier ||= {};
    f.request.uiState.conditionByModifier[analysisKey] = { enabled: true, ...state };
    f.request.uiState.complexConditionByModifier[complexKey] = { enabled: true, ...state };
}

function applied(payload, id) {
    return payload.results.flatMap((row) => row.breakdown?.appliedModifiers || [])
        .find((item) => item.modifier?.id === id);
}

function appliedRows(payload, id) {
    return payload.results.filter((row) =>
        (row.breakdown?.appliedModifiers || []).some((item) => item.modifier?.id === id));
}

function ownFixture(options = {}) {
    const f = fixture(options);
    f.request = f.engine.buildCalculationRequestFromForm();
    f.calculate = (request = f.request) => f.engine.calculateDamageRequest(request, f.calcData);
    return f;
}

function replay(f, payload) {
    const snapshot = f.engine.createCalculationSnapshot(payload.calculationRequest, payload);
    const restored = f.calculate(JSON.parse(JSON.stringify(snapshot.request)));
    assert.deepEqual(JSON.parse(JSON.stringify(restored.results)), JSON.parse(JSON.stringify(payload.results)));
}

function reactionTotals(f, context, reactionId) {
    const collected = f.engine.collectActiveModifiers(f.calcData, context);
    return f.engine.applyModifiersToDamageEntry({
        id: `fixture-${reactionId}`, attackType: "reaction", damageType: "reaction", group: "reaction",
        element: "氷", directReactionId: reactionId, scalings: []
    }, context, collected);
}

function partyFixture({ providerAtk, providerConstellation = 0, receiverAtk = 1850, receiver = "10000016", reaction = "stellarSwirl" }) {
    const f = fixture({ characterId: receiver, atk: receiverAtk, em: 77 });
    setElement(f.elements, "genshinJsonReactionOption", reaction);
    const request = f.engine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: receiver },
            { slot: 2, role: "support", enabled: true, characterId: SANDRONE, constellation: providerConstellation,
                stats: { atk: providerAtk, baseAtk: 1000, hp: 20000, def: 1000, elementalMastery: 0 },
                talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {} }
        ]
    };
    return { ...f, request };
}

test("Sandrone source supports Stellar Swirl conversion and current-ATK base-damage blessing", () => {
    assert.match(SOURCE.passive3.description, /Superconduct or Cryo Swirl reaction/);
    assert.match(SOURCE.passive3.description, /Stellar-Conduct or Stellar Swirl/);
    assert.match(SOURCE.passive3.description, /0\.7% for every 100 points of Sandrone's ATK/);
    assert.match(SOURCE.passive3.description, /maximum increase of 14%/);
    assert.match(SOURCE.passive3.description, /Base DMG of the aforementioned reaction is also increased/);
});

test("Sandrone Stellar Swirl talent base entries preserve all user-confirmed Lv.1–15 raw parameter values", () => {
    const expected = {
        charged_beam_swirl: {
            group: "normalAttack", talentKey: "combat1", param: "param11",
            values: [122.55, 132.53, 142.5, 156.75, 166.73, 178.13, 193.8, 209.48, 225.15, 242.25, 259.35, 276.45, 293.55, 310.65, 327.75]
        },
        skill_prism_swirl: {
            group: "skill", talentKey: "combat2", param: "param4",
            values: [32.4, 34.83, 37.26, 40.5, 42.93, 45.36, 48.6, 51.84, 55.08, 58.32, 61.56, 64.8, 68.85, 72.9, 76.95]
        },
        burst_ray_swirl: {
            group: "burst", talentKey: "combat3", param: "param6",
            values: [330.8, 355.61, 380.42, 413.5, 438.31, 463.12, 496.2, 529.28, 562.36, 595.44, 628.52, 661.6, 702.95, 744.3, 785.65]
        }
    };
    for (const [id, expectation] of Object.entries(expected)) {
        const entries = TALENT_SCALINGS[SANDRONE][expectation.group].entries;
        const entry = entries.find((item) => item.id === id);
        assert.ok(entry, `missing Stellar Swirl base entry ${id}`);
        assert.equal(entry.directReactionId, "stellarSwirl", `${id} is a direct Stellar Swirl entry`);
        assert.equal(entry.source.oss, "genshin-db");
        assert.equal(entry.source.talentKey, expectation.talentKey);
        assert.equal(entry.source.param, expectation.param);
        assert.match(entry.source.verificationNotes, /User external confirmation/);
        assert.deepEqual(Array.from({ length: 15 }, (_, index) => entry.scalings[0].valuesByLevel[String(index + 1)]), expectation.values,
            `${id} retains its Lv.1–15 percentages exactly`);
    }
});

test("Sandrone A4 EM scaling is continuous from current ATK and capped", () => {
    for (const [atk, expected] of [[1850, 148], [1866, 149.28], [1950, 156], [2200, 160]]) {
        const f = fixture({ atk });
        const modifiers = f.calcData.talentModifiers[SANDRONE].passives;
        const passive = modifiers.find((item) => item.sourceId === "passive2").modifiers[0];
        assert.equal(passive.rounding, "continuous");
        const payload = f.calculate();
        assert.equal(payload.context.effectiveStats.atk, atk);
        assert.equal(payload.context.effectiveStats.elementalMastery, expected);
        const panel = f.sandbox.GenshinCalcConditions.conditionPanelState(payload.context, f.calcData);
        const specialTalent = panel.cards.flatMap((card) => card.effects).find((effect) => effect.id === "t_10000133_passive3_stellar_conduct");
        assert.ok(specialTalent, "special talent appears in CurrentCalc conditions");
        assert.match(specialTalent.description, /星電導.*星拡散|星拡散.*星電導/);
        replay(f, payload);
    }
});

test("Sandrone A4 breakdown displays continuous current ATK reference and final EM", () => {
    const f = fixture({ atk: 1866 });
    const payload = f.calculate();
    vm.runInContext(fs.readFileSync(path.join(root, "games/js/genshinCalcRenderer.js"), "utf8"), f.sandbox, { filename: "genshinCalcRenderer.js" });
    const hit = result(payload, "normal_1damage");
    const html = f.sandbox.GenshinCalcRenderer.renderDamageBreakdown({
        ...hit,
        breakdown: { ...hit.breakdown, statTrace: payload.statTrace }
    });
    assert.match(html, /149\.28/);
    assert.match(html, /攻撃力1,866 × 0\.08/);
    assert.match(html, /上限160/);
    assert.match(html, /元素熟知（補正後）/);
    assert.doesNotMatch(html, /\+8\.00/);
});

test("Sandrone Stellar base bonus scales continuously from provider ATK and reaches only Stellar Conduct/Swirl base damage", () => {
    for (const [providerAtk, expectedPercent] of [[1850, 12.95], [1866, 13.062], [1950, 13.65], [2200, 14]]) {
        for (const reaction of ["stellarConduct", "stellarSwirl"]) {
            const f = partyFixture({ providerAtk, receiver: reaction === "stellarSwirl" ? "10000002" : "10000116", reaction });
            const payload = f.calculate(f.request);
            const provider = payload.partyModifiers.find((item) => item.modifier.id === "t_10000133_passive3_stellar_conduct");
            assert.ok(provider, "Sandrone is available as a party modifier provider");
            assert.equal(provider.modifier.rounding, "continuous");
            assert.deepEqual(provider.modifier.applyTo, ["stellarConductBaseDamageBonus", "stellarSwirlBaseDamageBonus"]);
            near(payload.context.effectiveStats.elementalMastery, 77, "Sandrone's self-only A4 EM does not leak to the recipient");
            assert.ok(!payload.partyModifiers.some((item) => item.modifier.id?.includes("10000133_passive2")), "Sandrone's self-only A4 is not a party candidate");
            if (reaction === "stellarConduct") {
                // Stellar Conduct is direct-only: exercise a real CurrentCalc recipient context and its
                // selected talent hit through the modifier application step, since it has no standalone row.
                const totals = reactionTotals(f, payload.context, reaction);
                near(totals.totals.reactionBaseDamageBonus, expectedPercent, `${reaction} base damage from Sandrone ATK ${providerAtk}`);
                near(totals.totals.reactionBonus, 0, "base-damage blessing must not become ordinary reaction bonus");
                assert.ok(totals.applied.some((item) => item.modifier?.id === "t_10000133_passive3_stellar_conduct"));
            } else {
                const direct = payload.results.find((row) => row.entry.id === "reaction_stellarSwirl");
                assert.ok(direct, "Stellar Swirl uses the actual provisional standalone CurrentCalc route");
                near(direct.breakdown.reactionBaseDamageBonus, expectedPercent, `${reaction} base damage from Sandrone ATK ${providerAtk}`);
                near(direct.breakdown.reactionBonus, 0, "base-damage blessing must not become ordinary reaction bonus");
            }
            for (const row of payload.results.filter((item) => item.entry.directReactionId !== reaction && item.entry.id !== "reaction_stellarSwirl")) {
                near(row.breakdown.reactionBaseDamageBonus || 0, 0, "other damage entries are isolated");
            }
            replay(f, payload);
        }
    }
});

test("Sandrone base-damage blessing does not affect ordinary attacks or unrelated reactions", () => {
    const f = partyFixture({ providerAtk: 1866, receiver: "10000002", reaction: "none" });
    const baseline = f.calculate(f.request);
    for (const row of baseline.results) {
        near(row.breakdown.reactionBaseDamageBonus || 0, 0, "no Stellar reaction selected");
    }
    const normal = result(baseline, "normal_1damage");
    near(normal.breakdown.reactionBonus || 0, 0, "ordinary attack has no reaction bonus");

    const unrelated = partyFixture({ providerAtk: 1866, receiver: "10000002", reaction: "vaporize15" });
    const vaporize = unrelated.calculate(unrelated.request);
    for (const row of vaporize.results) {
        near(row.breakdown.reactionBaseDamageBonus || 0, 0, "Vaporize is outside Sandrone's special talent scope");
    }
    const vaporizeTotals = reactionTotals(unrelated, vaporize.context, "vaporize");
    near(vaporizeTotals.totals.reactionBaseDamageBonus, 0, "Sandrone does not buff unrelated reaction base damage");
    assert.ok(!vaporizeTotals.applied.some((item) => item.modifier?.id === "t_10000133_passive3_stellar_conduct"));
    replay(unrelated, vaporize);
});

test("Sandrone A1 prism and tactics overrides stay on their specified Stellar skill and burst hits", () => {
    const f = ownFixture({ constellation: 0, critRate: 0 });
    const baseline = f.calculate();

    setModifierState(f, baseline, "t_10000133_a1_prism", { option: "above50" });
    const prism = f.calculate();
    assert.equal(applied(prism, "t_10000133_a1_prism")?.value, 400);
    assert.deepEqual(Array.from(appliedRows(prism, "t_10000133_a1_prism"), (row) => row.entry.id).sort(),
        ["damage_3", "skill_prism_swirl"].sort(),
        "the 4x original-DMG override belongs only to the second Prism Shot's Cryo and Stellar Swirl hits");
    near(result(prism, "skill_prism_swirl").expected, result(baseline, "skill_prism_swirl").expected * 4,
        "A1 multiplies the direct Stellar Swirl Prism hit by four");
    near(result(prism, "damage_2_second").expected, result(baseline, "damage_2_second").expected,
        "ordinary second Prism Shot is unaffected");
    near(result(prism, "normal_1damage").expected, result(baseline, "normal_1damage").expected,
        "A1's original-DMG multiplier must not leak to ordinary attacks");
    near(result(prism, "charged_damage").expected, result(baseline, "charged_damage").expected,
        "A1's original-DMG multiplier must not leak to the charged sweeping attack");
    near(result(prism, "damage_5").expected, result(baseline, "damage_5").expected,
        "burst bombardment is unaffected by the Prism Shot override");

    const tacticsBase = ownFixture();
    let current = tacticsBase.calculate();
    const expectedRayBase = result(current, "damage_6").expected;
    const expectedSwirlRayBase = result(current, "burst_ray_swirl").expected;
    const key = setModifierState(tacticsBase, current, "t_10000133_a1_tactics", { stack: 0 });
    const rayAtStacks = [];
    for (let stacks = 0; stacks <= 10; stacks++) {
        setGroupState(tacticsBase, key, key, { stack: stacks });
        current = tacticsBase.calculate();
        near(result(current, "damage_6").expected, expectedRayBase * (1 + 0.1 * stacks),
            `burst Stellar ray multiplier at ${stacks} Refined Tactics stacks`);
        assert.deepEqual(Array.from(appliedRows(current, "t_10000133_a1_tactics"), (row) => row.entry.id).sort(),
            stacks === 0 ? [] : ["burst_ray_swirl", "damage_6"].sort(),
            "Refined Tactics only overrides the burst ray's Cryo and Stellar Swirl hits");
        near(result(current, "burst_ray_swirl").expected, expectedSwirlRayBase * (1 + 0.1 * stacks),
            `Refined Tactics scales the Stellar Swirl burst ray at ${stacks} stacks`);
        near(result(current, "damage_5").expected, result(tacticsBase.calculate({ ...tacticsBase.request,
            uiState: { ...tacticsBase.request.uiState, conditionByModifier: { ...tacticsBase.request.uiState.conditionByModifier,
                [key]: { enabled: false, stack: stacks } } }
        }), "damage_5").expected, "burst bombardment must not inherit the ray multiplier");
        near(result(current, "normal_1damage").expected, result(baseline, "normal_1damage").expected,
            "Refined Tactics must not leak into ordinary attacks");
        rayAtStacks.push(result(current, "damage_6").expected);
    }
    assert.ok(rayAtStacks[10] > rayAtStacks[0]);
    replay(tacticsBase, current);
});

test("Sandrone C1 adds Stellar reaction damage to the team and leaves ordinary damage alone", () => {
    const f = ownFixture({ constellation: 1, critRate: 0, critDamage: 0 });
    let payload = f.calculate();
    setModifierState(f, payload, "c_10000133_1_1", {});
    payload = f.calculate();
    const conduct = reactionTotals(f, payload.context, "stellarConduct");
    near(conduct.applied.find((item) => item.modifier?.id === "c_10000133_1_1")?.value, 30,
        "C1 Stellar-Conduct team bonus");
    assert.ok(conduct.applied.some((item) => item.modifier?.id === "c_10000133_1_1"));
    assert.ok(!appliedRows(payload, "c_10000133_1_1").some((row) =>
        !row.entry.directReactionId && row.entry.id !== "reaction_stellarSwirl"),
    "C1 reaction bonus must not leak into ordinary non-Stellar damage entries");
    replay(f, payload);

    const team = partyFixture({ providerAtk: 1850, providerConstellation: 1, receiver: "10000002", reaction: "none" });
    let teamPayload = team.calculate(team.request);
    const teamModifier = teamPayload.partyModifiers.find((item) => item.modifier.id === "c_10000133_1_1");
    assert.ok(teamModifier, "Sandrone C1 is a party modifier provider");
    assert.equal(teamModifier.targetOwner, "team");
    assert.deepEqual(Array.from(teamModifier.modifier.applyTo), ["stellarConductDamageBonus", "stellarSwirlDamageBonus"]);
    team.request.party.conditionStates[teamModifier.partyConditionStateKey] = { enabled: true };
    team.request.party.members[1].buffStates[teamModifier.toggleKey] = true;
    teamPayload = team.calculate(team.request);
    near(result(teamPayload, "normal_1damage").expected,
        result(team.calculate({ ...team.request, party: { ...team.request.party, conditionStates: {} } }), "normal_1damage").expected,
        "C1 does not increase an ordinary team member's attack damage");
    for (const reaction of ["stellarConduct", "stellarSwirl"]) {
        const totals = reactionTotals(team, teamPayload.context, reaction);
        assert.ok(totals.applied.some((item) => item.modifier?.id === "c_10000133_1_1"),
            `C1 reaches team ${reaction} damage`);
    }
});

test("Sandrone C6 multiplies only its own direct Stellar entries after C1 and does not leak through the party", () => {
    const calculate = ({ c1 = false, c6 = false } = {}) => {
        const f = ownFixture({ constellation: 6, atk: 1850, critRate: 0, critDamage: 0 });
        let payload = f.calculate();
        setGroupState(f, "constellation:C1:c_10000133_1_1", "constellation:C1:c_10000133_1_1", { enabled: c1 });
        setGroupState(f, "constellation:C6:c_10000133_6_1", "constellation:C6:c_10000133_6_1", { enabled: c6 });
        const c4 = setModifierState(f, payload, "c_10000133_4_1_swirl", { option: "stellarSwirl" });
        setGroupState(f, c4, `character:${SANDRONE}:group:sandrone_c4_cannon`, { option: "stellarSwirl" });
        const c6Cluster = setModifierState(f, payload, "c_10000133_6_2_stellarSwirl", { option: "stellarSwirl" });
        setGroupState(f, c6Cluster, `character:${SANDRONE}:group:sandrone_c6_cluster`, { option: "stellarSwirl" });
        payload = f.calculate();
        return { f, payload };
    };
    const off = calculate();
    const c1Only = calculate({ c1: true });
    const c6Only = calculate({ c6: true });
    const both = calculate({ c1: true, c6: true });
    const byId = (payload) => new Map(payload.results.map((row) => [row.entry.id, row]));
    const offRows = byId(off.payload);
    const c1Rows = byId(c1Only.payload);
    const c6Rows = byId(c6Only.payload);
    const bothRows = byId(both.payload);
    const directIds = [...offRows.keys()].filter((id) => offRows.get(id).entry.directReactionId?.startsWith("stellar"));
    assert.ok(directIds.includes("charged_beam_swirl"), "charged beam Stellar Swirl base entry is calculated");
    assert.ok(directIds.includes("skill_prism_swirl"), "Prism Stellar Swirl base entry is calculated");
    assert.ok(directIds.includes("burst_ray_swirl"), "burst ray Stellar Swirl base entry is calculated");
    assert.ok(directIds.includes("c_10000133_4_1_swirl"), "C4 Stellar Swirl follow-up is calculated");
    assert.equal(directIds.filter((id) => id.startsWith("c_10000133_6_2_stellarSwirl_hit")).length, 4,
        "all four C6 Stellar Swirl follow-ups are direct entries");
    assert.ok(directIds.some((id) => offRows.get(id).entry.directReactionId === "stellarConduct"),
        "a direct Stellar Conduct entry is included in the C6 target coverage");
    for (const id of directIds) {
        const offRow = offRows.get(id);
        const c1Row = c1Rows.get(id);
        const c6Row = c6Rows.get(id);
        const bothRow = bothRows.get(id);
        assert.ok(["stellarConduct", "stellarSwirl"].includes(offRow.entry.directReactionId), `${id} is a direct Stellar entry`);
        near(c1Row.breakdown.reactionBonus, 30, `C1 remains the additive reaction-bonus bucket on ${id}`);
        near(c6Row.breakdown.reactionBonus, 0, `C6 does not enter the additive reaction-bonus bucket on ${id}`);
        near(bothRow.breakdown.reactionBonus, 30, `C1+C6 keeps C1's additive value unchanged on ${id}`);
        near(c6Row.expected, offRow.expected * 1.2, `C6 multiplies ${id} by 1.2`);
        near(bothRow.expected, c1Row.expected * 1.2, `C6 multiplies the C1 result on ${id}`);
        assert.ok(bothRow.breakdown.effectOverrides.some((item) => item.id === "c_10000133_6_1" && item.multiplier === 1.2),
            `C6 is represented as an independent ×1.2 effect on ${id}`);
    }
    for (const [id, offRow] of offRows) {
        if (offRow.entry.directReactionId) continue;
        const c6Row = c6Rows.get(id);
        if (c6Row) near(c6Row.expected, offRow.expected, `C6 does not change non-reaction entry ${id}`);
    }
    const party = partyFixture({ providerAtk: 1850, providerConstellation: 6, receiver: "10000002", reaction: "stellarSwirl" });
    const partyPayload = party.calculate(party.request);
    assert.ok(!partyPayload.partyModifiers.some((item) => item.modifier.id === "c_10000133_6_1"),
        "Sandrone's self-only C6 is not offered as a party modifier");
    const standalone = result(partyPayload, "reaction_stellarSwirl");
    assert.ok(!standalone.breakdown.effectOverrides?.some((item) => item.id === "c_10000133_6_1"),
        "another character's standalone Stellar Swirl does not inherit Sandrone's self-only C6");
    replay(both.f, both.payload);
});

test("Sandrone C6 scales only Sandrone's standalone Stellar Swirl contribution among reaction participants", () => {
    const calculate = (enabled) => {
        const f = ownFixture({ constellation: 6, atk: 1850, em: 0, critRate: 0, critDamage: 0 });
        setElement(f.elements, "genshinJsonReactionOption", "stellarSwirl");
        f.request = f.engine.buildCalculationRequestFromForm();
        f.request.manualInputs.stellarSwirlVariant = "initialAnemo";
        f.request.manualInputs.reactionContributors = [
            { slot: 2, source: "otherCharacter2", level: 90, elementalMastery: 2000, critRate: 0, critDamage: 0 },
            { slot: 3, source: "otherCharacter3", level: 90, elementalMastery: 1500, critRate: 0, critDamage: 0 },
            { slot: 4, source: "otherCharacter4", level: 90, elementalMastery: 1000, critRate: 0, critDamage: 0 }
        ];
        setGroupState(f, "constellation:C6:c_10000133_6_1", "constellation:C6:c_10000133_6_1", { enabled });
        return { f, payload: f.calculate() };
    };
    const off = calculate(false);
    const on = calculate(true);
    const offResult = result(off.payload, "reaction_stellarSwirl");
    const onResult = result(on.payload, "reaction_stellarSwirl");
    const offContributors = offResult.breakdown.reaction.contributors;
    const onContributors = onResult.breakdown.reaction.contributors;
    assert.equal(offContributors.length, 4, "the standalone reaction uses Sandrone and all three additional contributors");
    assert.equal(onContributors.length, 4);
    assert.equal(offContributors[0].source, "currentCharacter");
    assert.equal(onContributors[0].source, "currentCharacter");
    near(onContributors[0].finalDamageMultiplier, 1.2, "Sandrone's current contribution carries Elevation ×1.20");
    for (const key of ["preResistance", "nonCrit", "crit"]) {
        near(onContributors[0][key], offContributors[0][key] * 1.2,
            `Elevation multiplies only Sandrone's standalone contribution ${key}`);
    }
    for (let index = 1; index < offContributors.length; index++) {
        assert.deepEqual(JSON.parse(JSON.stringify(onContributors[index])), JSON.parse(JSON.stringify(offContributors[index])),
            `Elevation is not copied to additional participant in slot ${offContributors[index].slot}`);
    }
    near(onResult.breakdown.reaction.modifierScopes.participantLocal.finalDamageMultiplier, 1.2,
        "Elevation is recorded in the participant-local modifier scope");
    assert.equal(onResult.breakdown.reaction.modifierScopes.sharedParty.finalDamageMultiplier, undefined,
        "Elevation does not enter the shared party scope");
    assert.ok(onResult.expected > offResult.expected, "Sandrone's increased contribution raises the standalone total");
    assert.ok(onResult.expected < offResult.expected * 1.2,
        "the combined reaction is not multiplied wholesale because other participants are unchanged");
});

test("Sandrone C2 critical damage belongs only to condensed Stellar charged beams", () => {
    const f = ownFixture({ constellation: 2, critRate: 50, critDamage: 100 });
    let payload = f.calculate();
    const key = "constellation:C2:group:sandrone_c2_beams";
    const complexKey = `character:${SANDRONE}:group:sandrone_c2_beams`;
    setGroupState(f, key, complexKey, { option: "0" });
    for (let stacks = 0; stacks <= 3; stacks++) {
        setGroupState(f, key, complexKey, { option: String(stacks) });
        payload = f.calculate();
        const beam = result(payload, "charged_damage_3");
        near(beam.breakdown.critDamage, 140 + 20 * stacks, `C2 beam CRIT DMG at ${stacks} firing stacks`);
        const beamSwirl = result(payload, "charged_beam_swirl");
        near(beamSwirl.breakdown.critDamage, 140 + 20 * stacks, `C2 Stellar Swirl beam CRIT DMG at ${stacks} firing stacks`);
        assert.deepEqual(Array.from(appliedRows(payload, "c_10000133_2_1_v10"), (row) => row.entry.id).sort(),
            ["charged_beam_swirl", "charged_damage_3"].sort(),
            "C2 affects the Cryo and Stellar Swirl versions of the condensed beam only");
        const sweeping = result(payload, "charged_damage");
        near(sweeping.breakdown.critDamage, 100, "charged sweeping fire keeps base CRIT DMG");
    }
    replay(f, payload);
});

test("Sandrone C4 coordinated attacks select independent Stellar-Conduct and Stellar-Swirl ATK rates", () => {
    for (const [option, id, reaction, expectedRate] of [
        ["stellarConduct", "c_10000133_4_1", "stellarConduct", 125],
        ["stellarSwirl", "c_10000133_4_1_swirl", "stellarSwirl", 187.5]
    ]) {
        const f = ownFixture({ constellation: 4, atk: 1850 });
        const baseline = f.calculate();
        const key = setModifierState(f, baseline, id, { option });
        setGroupState(f, key, `character:${SANDRONE}:group:sandrone_c4_cannon`, { option });
        const payload = f.calculate();
        const extra = result(payload, id);
        assert.ok(extra, `C4 ${option} coordinated hit is present`);
        near(extra.entry.scalings[0].value, expectedRate, `C4 ${option} ATK rate`);
        assert.equal(extra.entry.directReactionId, reaction);
        assert.equal(extra.entry.sourceModifier.modifier.id, id);
        const otherId = id === "c_10000133_4_1" ? "c_10000133_4_1_swirl" : "c_10000133_4_1";
        assert.equal(payload.results.some((row) => row.entry.id === otherId), false,
            `C4 ${option} does not emit the other reaction variant`);
        replay(f, payload);
    }
});

test("Sandrone C6 emits four independent Cryo or Stellar cluster hits at their own ATK rates", () => {
    for (const [option, id, expectedRate, reaction] of [
        ["cryo", "c_10000133_6_2", 100, ""],
        ["stellarConduct", "c_10000133_6_2_stellarConduct", 80, "stellarConduct"],
        ["stellarSwirl", "c_10000133_6_2_stellarSwirl", 120, "stellarSwirl"]
    ]) {
        const f = ownFixture({ constellation: 6, atk: 1850 });
        let payload = f.calculate();
        const key = setModifierState(f, payload, id, { option });
        setGroupState(f, key, `character:${SANDRONE}:group:sandrone_c6_cluster`, { option });
        payload = f.calculate();
        const hits = payload.results.filter((row) => row.entry.sourceModifier?.modifier?.id === id);
        assert.equal(hits.length, 4, `C6 ${option} creates four independent results`);
        for (const row of hits) {
            near(row.entry.scalings[0].value, expectedRate, `C6 ${option} ATK rate`);
            assert.equal(row.entry.directReactionId, reaction);
        }
        assert.deepEqual(Array.from(hits, (row) => row.entry.id), [
            `${id}_hit1`, `${id}_hit2`, `${id}_hit3`, `${id}_hit4`
        ]);
        for (const otherId of ["c_10000133_6_2", "c_10000133_6_2_stellarConduct", "c_10000133_6_2_stellarSwirl"].filter((item) => item !== id)) {
            assert.equal(payload.results.some((row) => row.entry.sourceModifier?.modifier?.id === otherId), false,
                `C6 ${option} does not emit ${otherId}`);
        }
        replay(f, payload);
    }
});

test("Sandrone known ordinary attack hits retain elements and independent burst bombardment", () => {
    const f = ownFixture();
    const payload = f.calculate();
    for (const id of ["normal_1damage", "normal_2damage", "normal_3damage", "plunge_damage", "low_plungedamage", "high_plungedamage"]) {
        assert.equal(result(payload, id).entry.element, "physical");
    }
    for (const id of ["charged_damage", "charged_damage_2", "damage", "damage_2", "damage_2_second", "damage_5"]) {
        assert.equal(result(payload, id).entry.element, "氷");
    }
    near(result(payload, "damage_2").expected, result(payload, "damage_2_second").expected);
    const bombardment = payload.results.filter(row => row.entry.effectId === "damage_4");
    assert.equal(bombardment.length, 3);
    assert.deepEqual(Array.from(bombardment, row => row.entry.id), ["damage_4_hit1", "damage_4_hit2", "damage_4_hit3"]);
    for (const row of bombardment) {
        assert.equal(row.entry.hitCount, 1);
        near(row.expected, bombardment[0].expected);
    }
    replay(f, payload);
});
