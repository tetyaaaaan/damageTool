const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit, representedByTalentScalings } = require("../../scripts/genshinTalentValueAudit.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

test("value-less talent modifiers are exhaustively classified", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.total, 40);
    assert.deepEqual(audit.summary.byClassification, {
        representedByTalentScalings: 19,
        structuredByTalentRegistry: 3,
        explicitlyDeferredByTalentRegistry: 18
    });
    assert.equal(audit.records.every((record) => ["suppressDuplicate", "calculateFromRegistry", "displayWithReason"].includes(record.action)), true);
});

test("every suppressed talent modifier has dedicated scaling entries", () => {
    const calcData = loadCalcData();
    const suppressed = buildAudit().records.filter((record) => record.action === "suppressDuplicate");
    suppressed.forEach((record) => {
        const passive = calcData.talentModifiers[record.characterId].passives.find((item) => item.sourceId === record.sourceId);
        const modifier = passive.modifiers[record.modifierIndex];
        assert.equal(representedByTalentScalings(
            modifier,
            record.characterId,
            record.sourceId,
            calcData.talentScalings
        ), true, `${record.characterId}.${record.sourceId}.${record.modifierId}`);
    });
});

test("calc-data validation suppresses resolved registry records and duplicate scaling warnings", () => {
    const sandbox = createBrowserScriptHarness(["games/js/genshinCalcData.js"]).sandbox;
    sandbox.console.warn = () => {};
    const warnings = sandbox.GenshinCalcData.validateCalcData(loadCalcData());
    const messages = warnings.map((warning) => warning.message);
    assert.equal(messages.some((message) => message.includes("talentModifiers.10000078.passives.combat2")), false);

    const resolved = buildAudit().records.filter((record) => record.action !== "suppressDuplicate");
    resolved.forEach((record) => {
        const path = `talentModifiers.${record.characterId}.passives.${record.sourceId}.${record.modifierId}`;
        assert.equal(messages.some((message) => message.includes(path)), false, `${path} is classified by the talent registry`);
    });
});

test("calculation engine omits duplicate generic extra damage records", () => {
    const calcData = loadCalcData();
    const sandbox = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
    const context = {
        characterId: "10000078",
        weaponId: "",
        artifactSetIds: [],
        artifactSetMode: "none",
        constellation: 0,
        refinement: 1,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        manualInputs: { providerStats: {}, resourceStates: {} },
        uiState: {},
        mode: "manualMode"
    };
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(collected.applied.some((item) => item.source === "talent:combat2" && item.modifier.category === "extraDamage"), false);
    assert.equal(collected.candidates.some((item) => item.source === "talent:combat2" && item.modifier.category === "extraDamage"), false);
});
