const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, loadCalcData, setElement } = require("./helpers/browserScriptHarness.cjs");

function createHarness(characterId) {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js",
        "games/js/genshinCalcRenderer.js"
    ]);
    const calcData = loadCalcData();
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => calcData };
    const values = {
        genshinCalcCharacterId: characterId,
        genshinReflectConstellation: "C6",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: 20000,
        genshinAtkInput: 2000,
        genshinDefInput: 1000,
        genshinElementalMasteryInput: 0,
        genshinCritRateInput: 5,
        genshinCritDamageInput: 50,
        genshinElementalDamageInput: 0,
        genshinReflectLevel: 90,
        e_lv: 90,
        e_res: 10,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(harness.elements, id, value));
    setElement(harness.elements, "genshinJsonEnableCharacterCondition", "", true);
    [1, 2, 4, 6].forEach((level) => setElement(harness.elements, `genshinJsonEnableConstellationC${level}`, "", true));
    return { ...harness, calcData };
}

function damageBonusItem(applyTo, value) {
    return {
        modifier: { category: "damageBonus", applyTo, condition: "always", calculationSupport: "simple" },
        source: "test",
        value,
        analysis: { calculation: "damageBonus" }
    };
}

test("STEP31: Raiden burst stance keeps normal operation but uses burst damage classification", () => {
    const { sandbox, calcData } = createHarness("10000052");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const entries = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries;
    const entry = entries.find((item) => item.group === "burst" && item.attackType === "normalAttack");
    assert.equal(entry.damageType, "burst");
    assert.equal(entry.attackMode.sourceGroup, "burst");
    const applied = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, context, {
        applied: [damageBonusItem(["normalAttackDamageBonus"], 20), damageBonusItem(["burstDamageBonus"], 40)],
        candidates: []
    });
    assert.equal(applied.totals.damageBonus, 40);
});

test("STEP31: Nilou sword dance uses skill damage classification", () => {
    const { sandbox, calcData } = createHarness("10000070");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    context.uiState.conditionByModifier[sandbox.GenshinCalcEngine.talentStateConditionKey("10000070", "skill")] = { enabled: true };
    const entry = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries
        .find((item) => item.group === "skill" && item.attackType === "normalAttack");
    assert.equal(entry.damageType, "skill");
    const applied = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, context, {
        applied: [damageBonusItem(["normalAttackDamageBonus"], 20), damageBonusItem(["skillDamageBonus"], 35)],
        candidates: []
    });
    assert.equal(applied.totals.damageBonus, 35);
});

test("STEP31: dedicated stance element override does not leak into base normal attacks", () => {
    const { sandbox, calcData } = createHarness("10000033");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    const sourceModifier = calcData.talentModifiers["10000033"].passives
        .flatMap((passive) => passive.modifiers.map((modifier) => ({ passive, modifier })))
        .find((item) => item.modifier.category === "elementOverride");
    const normalized = sandbox.GenshinCalcEngine.normalizeElementOverrideModifier(
        sourceModifier.modifier,
        `talent:${sourceModifier.passive.sourceId}`,
        calcData,
        context
    );
    assert.deepEqual(Array.from(normalized.targetGroups), ["skill"]);
    assert.equal(normalized.attackModeEncodedInScaling, true);
    assert.equal(collected.applied.some((item) => item.modifier.category === "elementOverride"), false);
    const entries = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries;
    const base = entries.find((item) => item.group === "normalAttack" && item.attackType === "normalAttack");
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(base, context, collected).entry.element, "physical");
    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    const talentSection = panel.cards.find((card) => card.id === "talent").sections.find((section) => section.key === "talent:combat2");
    assert.ok(talentSection);
    assert.equal(talentSection.controls.length, 1);
    assert.equal(talentSection.effects.some((effect) => effect.modifier?.syntheticAttackMode), true);
});

test("STEP31: simple infusion still targets the base normal attack section", () => {
    const { sandbox, calcData } = createHarness("10000002");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    const override = collected.applied.find((item) => item.modifier.category === "elementOverride");
    assert.deepEqual(Array.from(override.modifier.targetGroups), ["normalAttack"]);
    const entry = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries
        .find((item) => item.group === "normalAttack" && item.attackType === "normalAttack");
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, context, collected).entry.element, "氷");
});

test("STEP31: conflicting generated element override is quarantined", () => {
    const { sandbox, calcData } = createHarness("10000092");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, context);
    assert.equal(collected.applied.some((item) => item.modifier.category === "elementOverride"), false);
    assert.equal(collected.candidates.some((item) => item.analysis?.reasonCode === "ATTACK_MODE_ELEMENT_CONFLICT"), true);
});

test("STEP31: every element override receives an explicit group or conflict classification", () => {
    const { sandbox, calcData } = createHarness("10000002");
    let count = 0;
    Object.entries(calcData.talentModifiers).forEach(([characterId, character]) => {
        (character.passives || []).forEach((passive) => {
            (passive.modifiers || []).filter((modifier) => modifier.category === "elementOverride").forEach((modifier) => {
                count += 1;
                const normalized = sandbox.GenshinCalcEngine.normalizeElementOverrideModifier(
                    modifier,
                    `talent:${passive.sourceId}`,
                    calcData,
                    { characterId }
                );
                assert.equal(normalized.attackModeConflict || normalized.targetGroups.length > 0, true, `${characterId}:${passive.sourceId}`);
            });
        });
    });
    Object.entries(calcData.constellationModifiers).forEach(([characterId, character]) => {
        Object.entries(character.constellations || {}).forEach(([level, modifiers]) => {
            modifiers.filter((modifier) => modifier.category === "elementOverride").forEach((modifier) => {
                count += 1;
                const normalized = sandbox.GenshinCalcEngine.normalizeElementOverrideModifier(
                    modifier,
                    `constellation:C${level}`,
                    calcData,
                    { characterId }
                );
                assert.deepEqual(Array.from(normalized.targetGroups), ["normalAttack"]);
            });
        });
    });
    assert.equal(count, 34);
});

test("STEP31: Skirk switches base attacks and Seven-Phase Flash attacks exclusively", () => {
    const { sandbox, calcData } = createHarness("10000114");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const key = sandbox.GenshinCalcEngine.talentStateConditionKey("10000114", "skill");
    context.uiState.conditionByModifier[key] = { enabled: false };
    let entries = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries;
    assert.equal(entries.some((entry) => entry.group === "normalAttack" && entry.attackType === "normalAttack" && entry.element === "physical"), true);
    assert.equal(entries.some((entry) => entry.group === "skill" && entry.attackType === "normalAttack"), false);

    context.uiState.conditionByModifier[key] = { enabled: true };
    entries = sandbox.GenshinCalcEngine.collectTalentDamageEntries(calcData, context).entries;
    assert.equal(entries.some((entry) => entry.group === "normalAttack" && entry.attackType === "normalAttack"), false);
    const transformed = entries.find((entry) => entry.group === "skill" && entry.attackType === "normalAttack");
    assert.equal(transformed.element, "氷");
    assert.equal(transformed.attackMode.nameJa, "七相一閃");
});

test("STEP31: Hu Tao groups attack bonus and Pyro conversion under one talent state", () => {
    const { sandbox, calcData, elements } = createHarness("10000046");
    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const combat2 = calcData.talentModifiers["10000046"].passives.find((passive) => passive.sourceId === "combat2");
    const keys = combat2.modifiers.map((modifier) => {
        const normalized = sandbox.GenshinCalcEngine.normalizeTalentStateModifier(modifier, "talent:combat2", calcData, context);
        return sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier: normalized, source: "talent:combat2", context }).conditionStateKey;
    });
    assert.equal(new Set(keys).size, 1);

    const panel = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
    const section = panel.cards.find((card) => card.id === "talent").sections.find((item) => item.key === "talent:combat2");
    assert.equal(section.typeLabel, "元素スキル");
    assert.equal(section.nameJa, "蝶導来世");
    assert.equal(section.controls.length, 1);
    assert.equal(section.effects.length, 2);
    elements.genshinJsonConditionCards = { innerHTML: "" };
    sandbox.GenshinCalcRenderer.renderConditionCards(panel, context);
    const html = elements.genshinJsonConditionCards.innerHTML;
    assert.equal((html.match(/蝶導来世/g) || []).length >= 1, true);
    assert.match(html, /元素スキル/);
    assert.match(html, /<summary>効果の詳細<\/summary>/);
    assert.equal(html.indexOf("影響：") < html.indexOf("効果の詳細"), true);
    assert.equal(html.indexOf("効果の詳細") < html.indexOf("状態・条件"), true);
});

test("STEP31: every talent modifier source resolves to a user-facing talent name", () => {
    const { sandbox, calcData } = createHarness("10000002");
    Object.entries(calcData.talentModifiers).forEach(([characterId, character]) => {
        (character.passives || []).forEach((passive) => {
            const meta = sandbox.GenshinCalcConditions.talentSourceMeta(
                `talent:${passive.sourceId}`,
                { characterId },
                calcData
            );
            assert.notEqual(meta.nameJa, "天賦効果", `${characterId}:${passive.sourceId}`);
            assert.equal(Boolean(meta.typeLabel), true);
        });
    });
});

test("STEP31: an unselected weapon does not surface another weapon's JSON warnings", async () => {
    const { sandbox } = createHarness("10000114");
    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    assert.equal(payload.warnings.some((warning) => String(warning.message || warning).includes("weaponModifiers.")), false);
});
