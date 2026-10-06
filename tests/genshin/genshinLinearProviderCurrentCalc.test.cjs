"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setElement } = require("./helpers/calcScenarioHarness.cjs");

const IDS = {
    baizhu: "10000082",
    baizhuA4: ["t_10000082_a4_bloom", "t_10000082_a4_quicken", "t_10000082_a4_lunar_bloom"],
    lauma: "10000119",
    laumaA4: "t_10000119_passive3_lunar_bloom",
    nilou: "10000070",
    nilouC6: ["c_10000070_6_1", "c_10000070_6_2"]
};

function scenario(characterId, { constellation = 0, hp = 20000, elementalMastery = 0, reaction = "none" } = {}) {
    const fixture = createScenarioHarness();
    prepareScenarioInputs(fixture.elements, {
        characterId,
        constellation,
        stats: { hp, baseHp: 10000, atk: 2000, baseAtk: 1000, def: 1000, baseDef: 500, elementalMastery, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    setElement(fixture.elements, "genshinJsonReactionOption", reaction);
    const request = fixture.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    return { ...fixture, request, engine: fixture.sandbox.GenshinCalcEngine };
}

function close(actual, expected, message = "") {
    assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

function applyReaction(fixture, payload, reactionId) {
    const collected = fixture.engine.collectActiveModifiers(fixture.calcData, payload.context);
    return fixture.engine.applyModifiersToDamageEntry({
        id: `fixture-${reactionId}`,
        attackType: "reaction",
        damageType: "reaction",
        group: "reaction",
        element: "草",
        directReactionId: reactionId,
        scalings: []
    }, payload.context, collected);
}

function replayMatches(fixture, payload) {
    const snapshot = fixture.engine.createCalculationSnapshot(payload.calculationRequest, payload);
    const replay = fixture.engine.calculateDamageRequest(JSON.parse(JSON.stringify(snapshot.request)), fixture.calcData);
    assert.deepEqual(JSON.parse(JSON.stringify(replay.results)), JSON.parse(JSON.stringify(payload.results)));
    return replay;
}

test("Baizhu A4 continuous HP scaling reaches only its reaction families at all boundaries", () => {
    const points = [999, 1000, 1350, 1500, 49999, 50000, 51000];
    const families = [
        { id: "bloom", bonus: "bloomDamageBonus", ratio: 2, cap: 100, reactions: ["bloom", "hyperbloom", "burgeon", "burning"] },
        { id: "quicken", bonus: "aggravateDamageBonus", ratio: 0.8, cap: 40, reactions: ["aggravate", "spread"] },
        { id: "lunar_bloom", bonus: "lunarBloomDamageBonus", ratio: 0.7, cap: 35, reactions: ["lunarBloom"] }
    ];
    for (const hp of points) {
        const f = scenario(IDS.baizhu, { hp });
        const payload = f.engine.calculateDamageRequest(f.request, f.calcData);
        assert.equal(payload.context.effectiveStats.hp, hp);
        for (const family of families) {
            const expected = Math.min(family.cap, hp / 1000 * family.ratio);
            for (const reactionId of family.reactions) {
                const result = applyReaction(f, payload, reactionId);
                close(result.totals.reactionBonus, expected, `${hp} HP ${reactionId}`);
                assert.ok(result.applied.some((item) => item.modifier?.id === IDS.baizhuA4[families.indexOf(family)]), reactionId);
            }
        }
        close(applyReaction(f, payload, "vaporize").totals.reactionBonus, 0, "unrelated reaction");
        assert.equal(payload.results.some((result) => result.breakdown?.appliedModifiers?.some((item) => IDS.baizhuA4.includes(item.modifier?.id))), false,
            "A4 reaction bonuses must not leak onto Baizhu's non-reaction skill or burst entries");
        replayMatches(f, payload);

        const bloomFixture = scenario(IDS.baizhu, { hp, reaction: "bloom" });
        const initial = bloomFixture.engine.calculateDamageRequest(bloomFixture.request, bloomFixture.calcData);
        const bloomEntry = (result) => result.results.find((item) => item.entry.id === "reaction_bloom");
        const source = bloomEntry(initial).breakdown.appliedModifiers.find((item) => item.modifier?.id === IDS.baizhuA4[0]);
        assert.ok(source, "ordinary Bloom reaction result uses Baizhu's shared A4 condition");
        const conditionStateKey = source.analysis.conditionStateKey;
        bloomFixture.request.uiState.conditionByModifier[conditionStateKey] = { enabled: false, stack: 0, option: "" };
        const off = bloomFixture.engine.calculateDamageRequest(bloomFixture.request, bloomFixture.calcData);
        close(bloomEntry(off).breakdown.reaction.reactionBonus, 0, `${hp} HP A4 OFF`);
        bloomFixture.request.uiState.conditionByModifier[conditionStateKey] = { enabled: true, stack: 0, option: "" };
        const on = bloomFixture.engine.calculateDamageRequest(bloomFixture.request, bloomFixture.calcData);
        const expectedBloomBonus = Math.min(hp, 50000) / 1000 * 2;
        close(bloomEntry(on).breakdown.reaction.reactionBonus, expectedBloomBonus, `${hp} HP ordinary Bloom result bonus`);
        close(bloomEntry(on).total.expected / bloomEntry(off).total.expected, 1 + expectedBloomBonus / 100, `${hp} HP ordinary Bloom damage multiplier`);
    }
});

test("Baizhu A4 provider condition is shared across two recipients and provider HP alone controls the value", () => {
    for (const recipientId of ["10000002", "10000016"]) {
        const f = scenario(recipientId, { hp: 21000 });
        f.request.party = {
            schemaVersion: 2,
            focusSlot: 1,
            conditionStates: {},
            members: [
                { slot: 1, role: "main", enabled: true, characterId: recipientId, stats: { hp: 21000 } },
                { slot: 2, role: "support", enabled: true, characterId: IDS.baizhu, nameJa: "白朮", constellation: 0,
                    talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {}, stats: { hp: 49999, baseHp: 10000 } }
            ]
        };
        const before = f.engine.calculateDamageRequest(f.request, f.calcData);
        const candidate = before.partyModifiers.find((item) => IDS.baizhuA4.includes(item.modifier?.id));
        assert.ok(candidate, "provider A4 must create a party candidate");
        f.request.party.conditionStates[candidate.partyConditionStateKey] = { enabled: true, stack: 0, option: "" };
        f.request.party.members[1].buffStates[candidate.toggleKey] = true;
        const first = f.engine.calculateDamageRequest(f.request, f.calcData);
        close(first.context.effectiveStats.hp, 21000, "recipient HP stays recipient-owned");
        close(applyReaction(f, first, "bloom").totals.reactionBonus, 99.998, "provider HP=49999");

        f.request.party.members[1].stats.hp = 1500;
        const second = f.engine.calculateDamageRequest(f.request, f.calcData);
        close(second.context.effectiveStats.hp, 21000, "provider HP change cannot alter recipient HP");
        close(applyReaction(f, second, "bloom").totals.reactionBonus, 3, "provider HP=1500");
        replayMatches(f, second);
    }
});

test("Lauma passive 3.1 lunar Bloom bonus scales continuously with EM and caps at 14", () => {
    for (const elementalMastery of [0.99, 1, 1.5, 799.5, 800, 1000]) {
        const f = scenario(IDS.lauma, { elementalMastery, reaction: "lunarBloom" });
        const payload = f.engine.calculateDamageRequest(f.request, f.calcData);
        const lunarBloom = applyReaction(f, payload, "lunarBloom");
        close(lunarBloom.totals.reactionBaseDamageBonus, Math.min(14, elementalMastery * 0.0175), `${elementalMastery} EM`);
        close(applyReaction(f, payload, "bloom").totals.reactionBaseDamageBonus, 0, "ordinary Bloom must not receive Lauma's lunar bonus");
        replayMatches(f, payload);
    }

    const f = scenario("10000002", { hp: 20000 });
    f.request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000002" },
            { slot: 2, role: "support", enabled: true, characterId: IDS.lauma, nameJa: "ラウマ", constellation: 0,
                talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {}, stats: { elementalMastery: 799.5 } }
        ]
    };
    const party = f.engine.calculateDamageRequest(f.request, f.calcData);
    assert.ok(party.partyModifiers.some((item) => item.modifier?.id === IDS.laumaA4), "Lauma's lunar Bloom modifier must be available to recipients");
    const reaction = applyReaction(f, party, "lunarBloom");
    close(reaction.totals.reactionBaseDamageBonus, 13.99125, "provider EM=799.5");
    close(applyReaction(f, party, "bloom").totals.reactionBaseDamageBonus, 0);
    f.request.party.members[1].stats.elementalMastery = 1.5;
    const changed = f.engine.calculateDamageRequest(f.request, f.calcData);
    close(applyReaction(f, changed, "lunarBloom").totals.reactionBaseDamageBonus, 0.02625);
    close(changed.context.effectiveStats.elementalMastery, 0, "provider EM cannot alter recipient EM");
    replayMatches(f, changed);
});

test("Nilou C6 uses continuous HP scaling at boundaries, is self-only, and survives JSON request replay", () => {
    for (const hp of [999, 1000, 1500, 49999, 50000, 51000]) {
        const f = scenario(IDS.nilou, { constellation: 6, hp });
        const payload = f.engine.calculateDamageRequest(f.request, f.calcData);
        const entry = {
            id: "fixture-nilou-c6",
            attackType: "normalAttack", damageType: "normal", group: "normalAttack", element: "水", scalings: []
        };
        const totals = f.engine.applyModifiersToDamageEntry(entry, payload.context,
            f.engine.collectActiveModifiers(f.calcData, payload.context)).totals;
        close(totals.critRateBonus, Math.min(30, hp / 1000 * 0.6), `${hp} HP CR`);
        close(totals.critDamageBonus, Math.min(60, hp / 1000 * 1.2), `${hp} HP CD`);
        replayMatches(f, payload);
    }

    const f = scenario("10000002");
    f.request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000002" },
            { slot: 2, role: "support", enabled: true, characterId: IDS.nilou, constellation: 6,
                nameJa: "ニィロウ", talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {}, stats: { hp: 50000, baseHp: 10000 } }
        ]
    };
    const party = f.engine.calculateDamageRequest(f.request, f.calcData);
    assert.equal(party.partyModifiers.some((item) => IDS.nilouC6.includes(item.modifier?.id)), false,
        "Nilou C6 crit bonuses must remain self-only when she is a support");
});

test("Baizhu C2 creates a 250% Dendro skill hit, C3/C5 do not double-add talent levels, C4 grants team EM, and C6 HP scaling targets burst only", () => {
    const c2 = scenario(IDS.baizhu, { constellation: 2, hp: 30000 });
    const c2Payload = c2.engine.calculateDamageRequest(c2.request, c2.calcData);
    const followup = c2Payload.results.find((result) => result.entry.id === "c_10000082_2_1_resolved_1");
    assert.ok(followup, "C2 follow-up is an independent damage entry");
    assert.equal(followup.entry.element, "草");
    assert.equal(followup.entry.damageType, "skill");
    close(followup.breakdown.scalingParts[0].talentMultiplier, 250, "C2 ATK scaling");

    const collected = c2.engine.collectActiveModifiers(c2.calcData, c2Payload.context);
    collected.applied.push({
        modifier: { category: "damageBonus", applyTo: ["skillDamageBonus"], condition: "always", calculationSupport: "simple" },
        source: "fixture-skill-damage-bonus",
        value: 50,
        analysis: { calculation: "damageBonus" }
    });
    const withSkillBonus = (result) => c2.engine.applyModifiersToDamageEntry(result.entry, c2Payload.context, collected);
    const buffedFollowup = withSkillBonus(followup);
    close(buffedFollowup.totals.damageBonus, 50, "C2 uses the existing skill damage target rule");
    close((100 + buffedFollowup.totals.damageBonus) / 100, 1.5, "C2 receives the 50% skill damage bonus multiplier");
    close(followup.breakdown.scalingParts[0].baseDamage, 5000, "C2 remains a separate 250% ATK hit");
    close(followup.breakdown.additiveBaseDamage, 0, "C2 scaling does not enter additive base damage");
    const normal = c2Payload.results.find((result) => result.entry.id === "normal_1damage");
    const buffedNormal = withSkillBonus(normal);
    close(buffedNormal.totals.damageBonus, 0, "skill bonus leaves Baizhu's normal attack unchanged");
    close(normal.breakdown.scalingParts[0].baseDamage, 1345.334, "250% C2 scaling does not leak to the normal attack");

    const levels = scenario(IDS.baizhu, { constellation: 5 });
    const levelsPayload = levels.engine.calculateDamageRequest(levels.request, levels.calcData);
    assert.equal(levelsPayload.context.talentLevels.skill, 10, "C5 must not add +3 to the final/UID skill input a second time");
    assert.equal(levelsPayload.context.talentLevels.burst, 10, "C3 must not add +3 to the final/UID burst input a second time");
    for (const id of ["c_10000082_3_1", "c_10000082_5_1"]) {
        assert.equal(levelsPayload.candidateModifiers.find((item) => item.modifier?.id === id)?.analysis?.status, "includedInInput", id);
    }

    const c4 = scenario(IDS.baizhu, { constellation: 4, elementalMastery: 100 });
    const c4Payload = c4.engine.calculateDamageRequest(c4.request, c4.calcData);
    assert.equal(c4Payload.context.effectiveStats.elementalMastery, 180, "C4 contributes team EM +80 once");

    const c6 = scenario(IDS.baizhu, { constellation: 6, hp: 30000 });
    const c6Payload = c6.engine.calculateDamageRequest(c6.request, c6.calcData);
    const burst = c6Payload.results.find((result) => result.entry.id === "skilldamage_2");
    assert.ok(burst, "Baizhu burst spiritvein entry");
    close(burst.breakdown.additiveBaseDamage, 2400, "C6 adds 8% of 30000 HP");
    const nonBurst = c6Payload.results.filter((result) => result.entry.id !== "skilldamage_2");
    assert.ok(nonBurst.every((result) => result.breakdown.additiveBaseDamage === 0), "C6 additive HP must not leak to other damage entries");
});
