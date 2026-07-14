const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinTalentValueAudit.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(characterId) {
    return {
        characterId,
        weaponId: "",
        artifactSetIds: [],
        artifactSetMode: "none",
        constellation: 0,
        refinement: 1,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { enemyResistance: 10, resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: { conditionByModifier: {}, toggleByModifier: {}, stackByModifier: {}, constellationConditions: {} },
        mode: "manualMode"
    };
}

test("STEP36 classifies every formerly value-less talent effect", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.total, 40);
    assert.equal(audit.summary.byClassification.missingStructuredValue || 0, 0);
    assert.equal(audit.summary.byClassification.unsupportedSpecialEffect || 0, 0);
    assert.equal(audit.summary.byClassification.structuredByTalentRegistry, 3);
    assert.equal(audit.summary.byClassification.explicitlyDeferredByTalentRegistry, 18);
});

test("Yanfei and Ineffa extra damage use exact ATK scalings", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const yanfeiRaw = calcData.talentModifiers["10000048"].passives.find((item) => item.sourceId === "passive2").modifiers[0];
    const yanfei = sandbox.GenshinCalcEngine.normalizeTalentStateModifier(yanfeiRaw, "talent:passive2", calcData, context("10000048"), 0);
    assert.equal(yanfei.scalings[0].stat, "atk");
    assert.equal(yanfei.scalings[0].value, 80);
    assert.equal(yanfei.element, "炎");

    const ineffaRaw = calcData.talentModifiers["10000116"].passives.find((item) => item.sourceId === "passive1").modifiers[0];
    const ineffa = sandbox.GenshinCalcEngine.normalizeTalentStateModifier(ineffaRaw, "talent:passive1", calcData, context("10000116"), 0);
    assert.equal(ineffa.scalings[0].value, 65);
    assert.equal(ineffa.element, "雷");
});

test("Gaming passive is a 20 percent plunging damage bonus, not additive ATK damage", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const raw = calcData.talentModifiers["10000093"].passives.find((item) => item.sourceId === "passive2").modifiers[0];
    const modifier = sandbox.GenshinCalcEngine.normalizeTalentStateModifier(raw, "talent:passive2", calcData, context("10000093"), 0);
    assert.equal(modifier.category, "damageBonus");
    assert.equal(modifier.value, 20);
    assert.deepEqual(Array.from(modifier.applyTo), ["plungingAttackDamageBonus"]);
});

test("Eula and Xilonen records no longer masquerade as defense debuffs", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    for (const [characterId, sourceId, index] of [["10000051", "combat2", 1], ["10000103", "combat2", 0]]) {
        const raw = calcData.talentModifiers[characterId].passives.find((item) => item.sourceId === sourceId).modifiers[index];
        const modifier = sandbox.GenshinCalcEngine.normalizeTalentStateModifier(raw, `talent:${sourceId}`, calcData, context(characterId), index);
        assert.equal(modifier.category, "resistanceDebuff");
        assert.equal(modifier.auditDisposition, "sourceContextRequired");
    }
});
