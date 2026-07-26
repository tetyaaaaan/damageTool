const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    createBrowserScriptHarness,
    loadCalcData,
    setElement
} = require("./helpers/browserScriptHarness.cjs");
const { buildAudit } = require("../../scripts/genshinModifierAudit.cjs");

function createHarness() {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => calcData };
    return { ...harness, calcData };
}

function prepareSandrone(elements, atk = 1000) {
    const values = {
        genshinCalcCharacterId: "10000133",
        genshinCalcWeaponId: "",
        genshinReflectCharacter: "サンドローネ",
        genshinReflectConstellation: "C0",
        genshinJsonConstellationLevel: "C0",
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinAtkInput: atk,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 0,
        genshinCritRateInput: 50,
        genshinCritDamageInput: 100,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 50,
        e_lv: 90,
        e_res: 10,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(elements, id, value));
    setElement(elements, "genshinJsonEnableCharacterCondition", "", true);
}

test("full modifier inventory has no uncontrolled exact duplicate or structural contract violation", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.total > 1500, true);
    assert.equal(audit.summary.uncontrolledExactDuplicateGroups, 0);
    assert.equal(audit.summary.contractViolations, 0);
    assert.equal(audit.duplicateCandidates.every((candidate) => candidate.controlled), true);
});

test("stacked constellation values use their actual bounded states", () => {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../../games/genshin/data/calc/constellation-modifiers.json"), "utf8"));
    const heizou = data["10000059"].constellations["6"].find((item) => item.id === "c_10000059_6_2_v10");
    const neuvillette = data["10000087"].constellations["2"].find((item) => item.id === "c_10000087_2_1");
    const varka = data["10000128"].constellations["6"].find((item) => item.id === "c_10000128_6_2_v10");
    assert.equal(heizou.value, 32);
    assert.equal(heizou.stack, undefined);
    assert.deepEqual(neuvillette.stack, { min: 0, max: 3, default: 0 });
    assert.equal(neuvillette.calculationSupport, "stack");
    assert.deepEqual(varka.stack, { min: 0, max: 4, default: 0 });
});

test("all modifier sources satisfy stack and reference contracts", () => {
    const files = ["talent-modifiers.json", "constellation-modifiers.json", "weapon-modifiers.json", "artifact-set-modifiers.json"];
    const violations = [];
    const walk = (value, source) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
            value.forEach((item, index) => walk(item, `${source}[${index}]`));
            return;
        }
        if (value.customCalculation === "thresholdStatBonus"
            && (!value.reference?.stat || !Number.isFinite(Number(value.ratio)) || !Number.isFinite(Number(value.divisor)))) {
            violations.push(`${source}:thresholdStatBonus`);
        }
        if ((value.valueByRefinementPerStack || value.valueByStack || value.valuePerStack) && value.stack
            && (value.stack.min === undefined || value.stack.max === undefined || value.stack.default === undefined)) {
            violations.push(`${source}:stack`);
        }
        if (value.category === "scalingBonus" && value.calculationSupport === "custom" && !value.reference?.stat) {
            violations.push(`${source}:scalingReference`);
        }
        if (value.uidHandling === "includedInUidStats" && value.condition && value.condition !== "always") {
            violations.push(`${source}:uidConditional`);
        }
        Object.entries(value).forEach(([key, child]) => walk(child, `${source}.${key}`));
    };
    files.forEach((file) => walk(
        JSON.parse(fs.readFileSync(path.join(__dirname, "../../games/genshin/data/calc", file), "utf8")),
        file
    ));
    assert.deepEqual(violations, []);
});

test("Sandrone passive converts attack into capped elemental mastery", async () => {
    const { sandbox, elements, calcData } = createHarness();
    const passive = calcData.talentModifiers["10000133"].passives
        .find((item) => item.sourceId === "passive2").modifiers[0];
    assert.equal(passive.category, "scalingBonus");
    assert.deepEqual(passive.reference, { stat: "atk", source: "self", per: 100 });
    assert.equal(passive.divisor, 100);
    assert.equal(passive.ratio, 8);
    assert.equal(passive.maxValue, 160);

    prepareSandrone(elements, 1000);
    const at1000 = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    assert.equal(at1000.results[0].breakdown.statBonus.elementalMastery, 80);
    assert.equal(at1000.context.effectiveStats.elementalMastery, 80);
    assert.equal(at1000.statTrace.find((item) => item.stat === "elementalMastery")?.value, 80);

    prepareSandrone(elements, 2000);
    const at2000 = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    assert.equal(at2000.results[0].breakdown.statBonus.elementalMastery, 160);
    assert.equal(at2000.context.effectiveStats.elementalMastery, 160);
});

test("zero stack conditions are absent from both display state and applied modifiers", () => {
    const { sandbox, calcData } = createHarness();
    const context = {
        characterId: "10000133",
        weaponId: "12516",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 1000, def: 1000, elementalMastery: 0, energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: { stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {}, complexConditionByModifier: {} },
        mode: "uidMode"
    };
    sandbox.GenshinCalcConditions.reconcileConditionState(context, calcData);
    sandbox.GenshinCalcConditions.reconcileResourceState(context, calcData);
    sandbox.GenshinCalcConditions.reconcileComplexConditionState(context, calcData);
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(collected.applied.some((item) => item.modifier.id === "w_12516_reaction_bonus_2"), false);
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    const effect = panel.cards.flatMap((card) => card.sections || []).flatMap((section) => section.effects || [])
        .find((item) => item.modifier?.id === "w_12516_reaction_bonus_2");
    assert.ok(effect);
    assert.match(effect.impact, /0%/);
    context.uiState.complexConditionByModifier["weapon:12516:group:transcendenceStacks"] = { stack: 3 };
    const activePanel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    const activeEffect = activePanel.cards.flatMap((card) => card.sections || []).flatMap((section) => section.effects || [])
        .find((item) => item.modifier?.id === "w_12516_reaction_bonus_2");
    assert.ok(activeEffect);
    assert.match(activeEffect.effectSummary, /最大\+48%/);
    assert.match(activeEffect.impact, /48%/);

});

test("超越の鍵 uses one zero-based stack input and only targets Stellar-Conduct", () => {
    const { sandbox, calcData } = createHarness();
    const context = {
        characterId: "10000133",
        weaponId: "12516",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 1000, def: 1000, elementalMastery: 0, energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: { stackByModifier: {}, conditionByModifier: {}, toggleByModifier: {}, complexConditionByModifier: {} },
        mode: "uidMode"
    };
    const weaponCard = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData)
        .cards.find((card) => card.id === "weapon");
    const transcendence = weaponCard.sections.find((section) => section.id === "transcendence_astral_conduction");
    assert.ok(transcendence);
    assert.equal(transcendence.effects.length, 1);
    assert.equal(transcendence.effects[0].modifier.applyTo[0], "astralConductionDamageBonus");
    assert.equal(transcendence.controls.length, 1);
    assert.equal(transcendence.controls[0].value, 0);
    assert.equal(transcendence.controls[0].min, 0);
    assert.equal(transcendence.controls[0].max, 3);
});

test("active records do not map Stellar-Conduct text to Lunar-Charged", () => {
    const { sandbox, calcData } = createHarness();
    const offenders = [];
    Object.entries(calcData.weaponModifiers).forEach(([weaponId, entry]) => {
        (entry.modifiers || []).forEach((modifier) => {
            const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
                modifier,
                entry.modifiers,
                calcData.weaponEffectRegistry.weapons[weaponId] || {}
            );
            if (normalized.auditDisposition === "supersededByStructuredRecord") return;
            if (/星電導/.test(String(normalized.sourceText || ""))
                && (normalized.applyTo || []).includes("lunarChargedDamageBonus")) {
                offenders.push(`${weaponId}:${normalized.id}`);
            }
        });
    });
    assert.deepEqual(offenders, []);
});
