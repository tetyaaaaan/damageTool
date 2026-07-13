const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildAudit } = require("../../scripts/genshinModifierAudit.cjs");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setElement
} = require("./helpers/calcScenarioHarness.cjs");

function prepared(options) {
    const harness = createScenarioHarness();
    prepareScenarioInputs(harness.elements, options);
    return harness;
}

test("STEP 25 distinguishes Amos' base bonus from its flight-time bonus", async () => {
    let harness = prepared({ characterId: "10000037", weaponId: "15502" });
    setElement(harness.elements, "genshinJsonAmosStack", 0);
    let payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    let charged = payload.results.find((result) => result.entry.attackType === "chargedAttack");
    let amos = charged.breakdown.appliedModifiers.filter((item) => item.source === "weapon:15502");
    assert.equal(JSON.stringify(amos.map((item) => [item.modifier.effectLabel, item.value])), JSON.stringify([["常時発動する基礎効果", 12]]));

    harness = prepared({ characterId: "10000037", weaponId: "15502" });
    setElement(harness.elements, "genshinJsonAmosStack", 5);
    payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    charged = payload.results.find((result) => result.entry.attackType === "chargedAttack");
    amos = charged.breakdown.appliedModifiers.filter((item) => item.source === "weapon:15502");
    assert.equal(JSON.stringify(amos.map((item) => item.value).sort((a, b) => a - b)), JSON.stringify([12, 40]));
});

test("STEP 26 leaves no P0/P1 audit records after safe fixes and explicit deferrals", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.byPriority.P0 || 0, 0);
    assert.equal(audit.summary.byPriority.P1 || 0, 0);
});

test("STEP 27 calculates threshold stat bonuses and caps them", async () => {
    let harness = prepared({ characterId: "10000070", constellation: 6, stats: { hp: 60000 } });
    let payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    let normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    assert.equal(normal.breakdown.critRate, 80);
    assert.equal(normal.breakdown.critDamage, 160);

    harness = prepared({ characterId: "10000095", constellation: 6, stats: { hp: 50000 } });
    payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
    const burst = payload.results.find((result) => result.entry.attackType === "burst");
    assert.equal(normal.breakdown.critRate, 50);
    assert.equal(normal.breakdown.critDamage, 100);
    assert.equal(burst.breakdown.critRate, 70);
    assert.equal(burst.breakdown.critDamage, 210);
});

test("STEP 28 exposes only dedicated reference inputs required by the selection", () => {
    let harness = prepared({ characterId: "10000002" });
    let state = harness.sandbox.GenshinCalcConditions.conditionPanelState(
        harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        harness.calcData
    );
    assert.equal(state.dedicatedReferenceInputs.visible, false);

    setElement(harness.elements, "genshinArtifactSetMode", "4pc");
    setElement(harness.elements, "genshinArtifactSetOne", "15022");
    state = harness.sandbox.GenshinCalcConditions.conditionPanelState(
        harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        harness.calcData
    );
    assert.equal(state.dedicatedReferenceInputs.recordedHealing, true);
    assert.equal(state.dedicatedReferenceInputs.providerDef, false);

    harness = prepared({ characterId: "10000103", constellation: 4 });
    state = harness.sandbox.GenshinCalcConditions.conditionPanelState(
        harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext(),
        harness.calcData
    );
    assert.equal(state.dedicatedReferenceInputs.providerDef, true);
    assert.equal(state.dedicatedReferenceInputs.recordedHealing, false);
});

test("STEP 28 consolidates Shenhe and Skirk input waits outside every damage breakdown", async () => {
    for (const [characterId, constellation] of [["10000063", 6], ["10000114", 6]]) {
        const harness = prepared({ characterId, constellation });
        const payload = await harness.sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        assert.equal(payload.warnings.length, 0);
        assert.ok(payload.inputNotices.length > 0);
        assert.equal(payload.results.every((result) => result.breakdown.skippedModifiers.every((item) => {
            return item.analysis?.supportStatus !== "missingInput"
                && item.analysis?.inputStatus !== "includedInInput"
                && item.analysis?.resourceClassification !== "calculationInput";
        })), true);
    }
});

test("condition inputs are rendered inside source cards instead of generic condition fields", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../games/genshin/index.html"), "utf8");
    assert.match(html, /id="genshinJsonConditionCards"/);
    assert.doesNotMatch(html, /id="genshinJsonComplexConditionField"/);
    assert.doesNotMatch(html, /id="genshinJsonEquipmentConditionField"/);
    assert.doesNotMatch(html, /id="genshinJsonConstellationLevel"/);
});

test("condition card model groups Ganyu and Amos effects by their actual source", () => {
    const harness = prepared({ characterId: "10000037", constellation: 1, weaponId: "15502" });
    const context = harness.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const state = harness.sandbox.GenshinCalcConditions.conditionPanelState(context, harness.calcData);
    assert.equal(state.cards.map((card) => card.id).join(","), "weapon,artifact,talent,constellation");
    const weapon = state.cards.find((card) => card.id === "weapon");
    assert.equal(weapon.subtitle, "アモスの弓 R1");
    assert.equal(weapon.effects.some((effect) => effect.name === "常時発動する基礎効果" && effect.status === "auto"), true);
    assert.equal(weapon.effects.some((effect) => effect.name === "飛翔時間による追加効果" && effect.controls[0]?.type === "amosStack"), true);
    const talent = state.cards.find((card) => card.id === "talent");
    assert.equal(talent.effects.some((effect) => effect.name === "唯一の心" && effect.description.includes("霜華の矢")), true);
    const constellation = state.cards.find((card) => card.id === "constellation");
    assert.equal(constellation.subtitle, "現在の解放段階：C1");
    assert.equal(constellation.effects.every((effect) => effect.name.startsWith("C1 ")), true);
});
