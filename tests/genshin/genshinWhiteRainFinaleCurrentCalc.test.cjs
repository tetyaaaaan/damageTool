"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");

const IDS = {
    whiteRainHp: "w_15513_statBonus_6b22fafe",
    whiteRainCrit: "w_15513_crit_1",
    finaleClearedBond: "w_11425_statBonus_ff739aa5",
    finaleSkillAtk: "w_11425_stat_1"
};

function fixture({ weaponId, refinement = 1, stats = {} }) {
    const scenario = createScenarioHarness();
    prepareScenarioInputs(scenario.elements, {
        characterId: "10000015",
        weaponId,
        stats: {
            hp: 20000,
            baseHp: 10000,
            baseAtk: 1000,
            atk: 2000,
            critRate: 50,
            critDamage: 100,
            ...stats
        }
    });
    scenario.elements.genshinWeaponRefinement = { value: `R${refinement}` };
    const request = scenario.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    const panel = scenario.sandbox.GenshinCalcConditions.conditionPanelState(request, scenario.calcData);
    if (weaponId === "11425") {
        const skillModifier = scenario.calcData.weaponModifiers[weaponId].modifiers.find((item) => item.id === IDS.finaleSkillAtk);
        const key = scenario.sandbox.GenshinModifierAnalyzer.modifierStateKey(skillModifier, `weapon:${weaponId}`);
        request.uiState.conditionByModifier[key] = { enabled: false, stack: 0, option: "" };
        request.uiState.complexConditionByModifier[key] = { enabled: false, stack: 0, option: "" };
    }
    return { ...scenario, request, panel };
}

function stackInput(fixture, groupId, stack) {
    const definition = fixture.panel.complexConditionInputs.find((item) => item.conditionGroupId === groupId);
    assert.ok(definition, `missing condition input group ${groupId}`);
    fixture.request.uiState.complexConditionByModifier ||= {};
    fixture.request.uiState.complexConditionByModifier[definition.key] = { stack };
    return definition;
}

function calculate(fixture) {
    return fixture.sandbox.GenshinCalcEngine.calculateDamageRequest(fixture.request, fixture.calcData);
}

function applied(payload, id) {
    return payload.results.flatMap((result) => result.breakdown?.appliedModifiers || [])
        .find((item) => item.modifier?.id === id);
}

function sumExpected(payload) {
    return payload.results.reduce((sum, result) => sum + (Number(result.expected) || 0), 0);
}

test("15513 shares one manual HP stack input and gates burst crit to 3 stacks", () => {
    const { sandbox, calcData, request, panel } = fixture({ weaponId: "15513" });
    const records = calcData.weaponModifiers["15513"].modifiers;
    const hp = records.find((item) => item.id === IDS.whiteRainHp);
    const crit = records.find((item) => item.id === IDS.whiteRainCrit);
    const group = panel.complexConditionInputs.filter((item) => item.conditionGroupId === "existingHPstack");

    assert.equal(group.length, 1, "HP stacks and crit must share one manual input");
    const whiteRainSection = panel.cards.find((card) => card.id === "weapon").sections
        .find((section) => section.id === "whiteRainExistingHPstack");
    assert.ok(whiteRainSection, "both White Rain effects should share one weapon section");
    assert.deepEqual(Array.from(whiteRainSection.effects, (effect) => effect.modifier.id).sort(),
        [IDS.whiteRainCrit, IDS.whiteRainHp].sort());
    assert.equal(whiteRainSection.controls.filter((control) => control.type === "stack").length, 1,
        "the shared section must render only one stack control");
    assert.doesNotMatch(whiteRainSection.effects.map((effect) => effect.impact).join(" "), /84\s*%/,
        "HP stacks and the burst crit threshold must not be displayed as one 84% crit bonus");
    assert.deepEqual(hp.applyTo, ["hpPercent"]);
    assert.equal(hp.conditionInput?.max, 3);
    assert.equal(hp.inputPolicy, "calculate");
    assert.equal(hp.uidHandling, "conditional");
    assert.equal(crit.minimumConditionStack, 3);
    assert.deepEqual(crit.applyTo, ["burstCritRate"]);
    assert.deepEqual(crit.targetGroups, ["burst"]);
    assert.equal(crit.inputPolicy, "calculate");
    assert.equal(crit.uidHandling, "conditional");

    [1, 2, 3, 4, 5].forEach((refinement) => {
        const current = fixture({ weaponId: "15513", refinement });
        [0, 1, 2, 3].forEach((stack) => {
            const definition = stackInput(current, "existingHPstack", stack);
            const payload = calculate(current);
            const expectedHp = calcData.weaponModifiers["15513"].modifiers
                .find((item) => item.id === IDS.whiteRainHp).valueByRefinement[String(refinement)][stack - 1] || 0;
            const hpTrace = payload.statTrace.find((item) => item.modifierId === IDS.whiteRainHp);
            assert.ok(definition);
            assert.equal(hpTrace?.stat || "", stack ? "hp" : "", `R${refinement} ${stack} stack HP target`);
            assert.equal(hpTrace?.value || 0, 10000 * expectedHp / 100, `R${refinement} ${stack} stack HP bonus`);
            const critApplied = applied(payload, IDS.whiteRainCrit);
            assert.equal(Boolean(critApplied), stack === 3, `R${refinement} ${stack} stack burst crit gate`);
            if (critApplied) assert.equal(critApplied.value, 28 + (refinement - 1) * 7);
        });
    });
});

test("15513 burst crit metadata does not leak onto normal damage at R1-R5", () => {
    [1, 2, 3, 4, 5].forEach((refinement) => {
        const current = fixture({ weaponId: "15513", refinement });
        stackInput(current, "existingHPstack", 3);
        const payload = calculate(current);
        const nonBurstResults = payload.results.filter((result) =>
            result.entry.attackType !== "burst" && result.entry.group !== "burst");
        const nonBurstAttackTypes = new Set(nonBurstResults.map((result) => result.entry.attackType));
        ["normalAttack", "chargedAttack", "plungingAttack", "skill"].forEach((attackType) => {
            assert.ok(nonBurstAttackTypes.has(attackType), `R${refinement} fixture must include ${attackType}`);
        });
        assert.equal(nonBurstResults.some((result) =>
            result.breakdown.appliedModifiers.some((item) => item.modifier?.id === IDS.whiteRainCrit)
        ), false, `R${refinement} must keep burst crit out of every non-burst attack`);
    });
});

test("15513 three-stack state replays through a serialized JSON request", () => {
    const current = fixture({ weaponId: "15513", refinement: 5 });
    stackInput(current, "existingHPstack", 3);
    const before = calculate(current);
    const replayRequest = JSON.parse(JSON.stringify(current.request));
    const replay = current.sandbox.GenshinCalcEngine.calculateDamageRequest(replayRequest, current.calcData);

    assert.equal(applied(before, IDS.whiteRainCrit)?.value, 56);
    assert.equal(applied(replay, IDS.whiteRainCrit)?.value, 56);
    assert.equal(sumExpected(replay), sumExpected(before));
    assert.equal(replay.statTrace.find((item) => item.modifierId === IDS.whiteRainHp)?.value, 8000);
});

test("11425 cleared Bond input is absolute HP, fraction-capable, capped, and independent of current Max HP", () => {
    const metadata = fixture({ weaponId: "11425" }).calcData.weaponModifiers["11425"].modifiers;
    const clearedBond = metadata.find((item) => item.id === IDS.finaleClearedBond);
    const skillAtk = metadata.find((item) => item.id === IDS.finaleSkillAtk);
    assert.equal(clearedBond.unit, "flat");
    assert.equal(clearedBond.conditionInput?.unit, "HP");
    assert.equal(clearedBond.conditionInput?.max, 1000000000);
    assert.equal(clearedBond.stack?.max, 6250);
    assert.deepEqual(clearedBond.valueByRefinementPerStack, {
        1: 0.024, 2: 0.03, 3: 0.036, 4: 0.042, 5: 0.048
    });
    assert.deepEqual(skillAtk.applyTo, ["atkPercent"]);
    assert.equal(skillAtk.condition, "afterSkill");
    assert.equal(skillAtk.calculationSupport, "toggle");
    assert.deepEqual(skillAtk.valueByRefinement, { 1: 12, 2: 15, 3: 18, 4: 21, 5: 24 });
    const finaleDisplayFixture = fixture({ weaponId: "11425", refinement: 1 });
    stackInput(finaleDisplayFixture, "finale11425ClearedBondHp", 1000);
    const finaleDisplay = finaleDisplayFixture.sandbox.GenshinCalcConditions
        .conditionPanelState(finaleDisplayFixture.request, finaleDisplayFixture.calcData)
        .cards.find((card) => card.id === "weapon").effects
        .find((effect) => effect.id === IDS.finaleClearedBond).impact;
    assert.doesNotMatch(finaleDisplay, /\+\s*24(?:\.0+)?%/, "flat ATK display must not add a percent sign");
    const cases = [
        { refinement: 1, coefficient: 0.024, cap: 150 },
        { refinement: 2, coefficient: 0.03, cap: 187.5 },
        { refinement: 3, coefficient: 0.036, cap: 225 },
        { refinement: 4, coefficient: 0.042, cap: 262.5 },
        { refinement: 5, coefficient: 0.048, cap: 300 }
    ];
    cases.forEach(({ refinement, coefficient, cap }) => {
        [0, 0.25, 1000, 6250, 1000000].forEach((clearedHp) => {
            const current = fixture({ weaponId: "11425", refinement });
            stackInput(current, "finale11425ClearedBondHp", clearedHp);
            const payload = calculate(current);
            const candidate = payload.context.statTrace.find((item) => item.modifierId === IDS.finaleClearedBond);
            const expected = Math.min(clearedHp, 6250) * coefficient;
            assert.ok(Math.abs((candidate?.value || 0) - expected) < 1e-8,
                `R${refinement} cleared ${clearedHp} HP should add ${expected} flat ATK`);
            if (clearedHp > 0) {
                assert.equal(candidate?.stat, "atk");
                assert.equal(candidate?.uidHandling, "conditional");
            }
            assert.equal(applied(payload, IDS.finaleSkillAtk), undefined, "skill ATK sibling remains off until toggled");
            assert.ok(Math.abs((candidate?.value || 0) - Math.min(clearedHp * coefficient, cap)) < 1e-8);
        });
    });

    const lowHp = fixture({ weaponId: "11425", refinement: 1, stats: { hp: 10000 } });
    const highHp = fixture({ weaponId: "11425", refinement: 1, stats: { hp: 50000 } });
    stackInput(lowHp, "finale11425ClearedBondHp", 1000);
    stackInput(highHp, "finale11425ClearedBondHp", 1000);
    const lowPayload = calculate(lowHp);
    const highPayload = calculate(highHp);
    assert.equal(lowPayload.statTrace.find((item) => item.modifierId === IDS.finaleClearedBond).value, 24);
    assert.equal(highPayload.statTrace.find((item) => item.modifierId === IDS.finaleClearedBond).value, 24);
    assert.equal(sumExpected(lowPayload), sumExpected(highPayload), "changing current HP does not change the cleared-HP input or unrelated damage");
});

test("11425 cleared HP input survives JSON request replay and changes real damage", () => {
    const current = fixture({ weaponId: "11425", refinement: 5 });
    stackInput(current, "finale11425ClearedBondHp", 1000.5);
    const before = calculate(current);
    const replayRequest = JSON.parse(JSON.stringify(current.request));
    const replay = current.sandbox.GenshinCalcEngine.calculateDamageRequest(replayRequest, current.calcData);

    assert.equal(before.calculationRequest.weaponId, "11425");
    assert.equal(replay.statTrace.find((item) => item.modifierId === IDS.finaleClearedBond).value, 48.024);
    assert.equal(sumExpected(replay), sumExpected(before));
    assert.ok(sumExpected(before) > 0);

    const noBond = fixture({ weaponId: "11425", refinement: 5 });
    stackInput(noBond, "finale11425ClearedBondHp", 0);
    assert.ok(sumExpected(before) > sumExpected(calculate(noBond)));
});

test("11425 adds flat ATK through effective ATK for each attack type and its state cannot leak after weapon switch", () => {
    const baseline = fixture({ weaponId: "11425", refinement: 1 });
    stackInput(baseline, "finale11425ClearedBondHp", 0);
    const baselinePayload = calculate(baseline);

    const active = fixture({ weaponId: "11425", refinement: 1 });
    stackInput(active, "finale11425ClearedBondHp", 1000);
    const activePayload = calculate(active);
    const atkTrace = activePayload.statTrace.find((item) => item.modifierId === IDS.finaleClearedBond);
    const finaleRecord = active.calcData.weaponModifiers["11425"].modifiers
        .find((item) => item.id === IDS.finaleClearedBond);
    assert.equal(atkTrace?.stat, "atk");
    assert.equal(atkTrace?.value, 24);
    assert.equal(finaleRecord.category, "statBonus");
    assert.deepEqual(finaleRecord.applyTo, ["atkFlat"]);
    assert.equal(activePayload.results.some((result) =>
        result.breakdown.appliedModifiers.some((item) => item.modifier?.id === IDS.finaleClearedBond
            && item.modifier?.category === "damageBonus")
    ), false, "cleared Bond must enter the ATK stat trace, not a damage bonus lane");

    const baseByAttackId = new Map(baselinePayload.results.map((result) => [result.entry.id, result]));
    const activeByAttackId = new Map(activePayload.results.map((result) => [result.entry.id, result]));
    const requiredAttackTypes = ["normalAttack", "chargedAttack", "plungingAttack", "skill", "burst"];
    requiredAttackTypes.forEach((attackType) => {
        const entries = activePayload.results.filter((result) => result.entry.attackType === attackType);
        assert.ok(entries.length > 0, `fixture must include ${attackType}`);
        entries.forEach((result) => {
            const baseResult = baseByAttackId.get(result.entry.id);
            const activeResult = activeByAttackId.get(result.entry.id);
            assert.ok(baseResult && activeResult);
            assert.ok(activeResult.expected > baseResult.expected,
                `flat ATK must flow into ${attackType} entry ${result.entry.id}`);
        });
    });

    active.request.weaponId = "15513";
    active.request.uiState.complexConditionByModifier["weapon:15513:group:existingHPstack"] = { stack: 0 };
    const switchedPayload = active.sandbox.GenshinCalcEngine.calculateDamageRequest(active.request, active.calcData);
    assert.equal(switchedPayload.statTrace.some((item) => item.modifierId === IDS.finaleClearedBond), false);
    assert.equal(switchedPayload.candidateModifiers.some((item) => item.modifier?.id === IDS.finaleClearedBond), false);
    assert.equal(switchedPayload.statTrace.some((item) => item.modifierId === IDS.whiteRainHp), false,
        "the old Finale cleared-HP state must not activate the new weapon's HP stacks");
});
