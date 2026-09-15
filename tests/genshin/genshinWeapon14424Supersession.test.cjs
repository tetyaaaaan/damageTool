"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
    createBrowserScriptHarness,
    loadCalcData,
    setElement
} = require("./helpers/browserScriptHarness.cjs");

const root = path.resolve(__dirname, "../..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function createCalcHarness() {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const values = {
        genshinCalcCharacterId: "10000002",
        genshinCalcWeaponId: "14424",
        genshinReflectCharacter: "test",
        genshinReflectConstellation: "C0",
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinBaseHpInput: 10000,
        genshinAtkInput: 2000,
        genshinBaseAtkInput: 800,
        genshinDefInput: 1000,
        genshinBaseDefInput: 700,
        genshinElementalMasteryInput: 100,
        genshinCritRateInput: 50,
        genshinCritDamageInput: 100,
        genshinEnergyRechargeInput: 100,
        genshinElementalDamageInput: 50,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(harness.elements, id, value));
    setElement(harness.elements, "genshinJsonEnableCharacterCondition", "", true);
    setElement(harness.elements, "genshinJsonEnableWeaponLowHpCondition", "", true);
    return { ...harness, calcData: loadCalcData() };
}

function modifierById(calcData, id) {
    return calcData.weaponModifiers["14424"].modifiers.find((modifier) => modifier.id === id);
}

test("古祠の瓏は誤投影に加え未実装の待機時間条件を隔離する", () => {
    const { sandbox, elements, calcData } = createCalcHarness();
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    const ids = new Set(["w_14424_statBonus_3fe2e64a", "w_14424_stat_1", "w_14424_stat_2"]);
    const applied = collected.applied.filter((item) => ids.has(item.modifier.id));
    const candidates = collected.candidates.filter((item) => ids.has(item.modifier.id));
    const stats = sandbox.GenshinCalcEngine.buildEffectiveStats(context, collected).effectiveStats;

    assert.deepEqual(Array.from(applied.map((item) => item.modifier.id)), []);
    assert.equal(candidates.length, 3);
    assert.equal(candidates.find((item) => item.modifier.id === "w_14424_statBonus_3fe2e64a").analysis.reasonCode, "SUPERSEDED_RECORD");
    for (const id of ["w_14424_stat_1", "w_14424_stat_2"]) {
        const candidate = candidates.find((item) => item.modifier.id === id);
        assert.equal(candidate.analysis.reasonCode, "SOURCE_CONTEXT_REQUIRED");
        assert.equal(candidate.reason, "安全な計算に必要な原文コンテキストが不足しています");
    }
    assert.equal(stats.hp, 20000);
    assert.equal(stats.elementalMastery, 100);

    const wrong = modifierById(calcData, "w_14424_statBonus_3fe2e64a");
    const hp = modifierById(calcData, "w_14424_stat_1");
    const em = modifierById(calcData, "w_14424_stat_2");
    assert.equal(wrong.auditDisposition, "supersededByStructuredRecord");
    assert.deepEqual(hp.applyTo, ["hpPercent"]);
    assert.deepEqual(em.applyTo, ["elementalMastery"]);
    assert.equal(hp.auditDisposition, "sourceContextRequired");
    assert.equal(em.auditDisposition, "sourceContextRequired");
});

test("w_14424のv2派生記録だけが隔離状態へ同期され、検証ゲートは維持される", () => {
    const calcData = loadCalcData();
    const sourceRecords = readJson("games/genshin/data/v2/weapons/source-records.json");
    const specs = readJson("games/genshin/data/v2/weapons/spec-candidates.json");
    const verification = readJson("games/genshin/data/v2/weapons/verification.json");
    const id = "w_14424_statBonus_3fe2e64a";
    const source = sourceRecords[`weapon:14424:modifier:${id}`];
    const hpSource = sourceRecords["weapon:14424:modifier:w_14424_stat_1"];
    const emSource = sourceRecords["weapon:14424:modifier:w_14424_stat_2"];
    const spec = specs[id];
    const review = verification[id];

    assert.equal(source.structuredValue.auditDisposition, "supersededByStructuredRecord");
    assert.equal(hpSource.structuredValue.auditDisposition, "sourceContextRequired");
    assert.equal(emSource.structuredValue.auditDisposition, "sourceContextRequired");
    assert.deepEqual(hpSource.structuredValue.applyTo, ["hpPercent"]);
    assert.deepEqual(emSource.structuredValue.applyTo, ["elementalMastery"]);
    assert.ok(spec.verification.discrepancies.some((item) => item.code === "SUPERSEDED_LEGACY_RECORD"));
    assert.ok(review.verification.discrepancies.some((item) => item.code === "SUPERSEDED_LEGACY_RECORD"));
    assert.ok(spec.runtime.blockedReasons.includes("legacyModifierSuperseded"));
    assert.ok(review.runtime.blockedReasons.includes("legacyModifierSuperseded"));
    assert.equal(spec.verification.status, "needsReview");
    assert.equal(spec.runtime.status, "candidate");
    assert.deepEqual(spec.supersedesLegacyModifierIds, [id]);
    assert.equal(specs.w_14424_stat_1.auditDisposition, undefined);
    assert.equal(specs.w_14424_stat_2.auditDisposition, undefined);
    assert.equal(calcData.weaponModifiers["14424"].modifiers.filter((item) => item.auditDisposition === "supersededByStructuredRecord").length, 1);
});
