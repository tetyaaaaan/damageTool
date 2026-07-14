const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinArtifactConditionAudit.cjs");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js",
        "games/js/genshinCalcRenderer.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000037",
        weaponId: "15502",
        refinement: 1,
        artifactSetMode: "4pc",
        artifactSetIds: ["15003"],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery: 0, energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            amosStack: 0,
            crimsonWitchStack: 0,
            enableCharacterCondition: false,
            enableWeaponLowHpCondition: false,
            constellationConditions: {},
            stackByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "uidMode",
        ...overrides
    };
}

test("STEP32 audit classifies every artifact modifier", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.total, 122);
    assert.deepEqual(audit.summary.byPolicy, {
        reflected: 43,
        derived: 3,
        userToggle: 41,
        automatic: 19,
        stack: 16
    });
});

test("Wanderer's Troupe derives its weapon requirement without a checkbox", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const state = sandbox.GenshinCalcConditions.conditionPanelState(context(), calcData);
    const artifact = state.cards.find((card) => card.id === "artifact");
    const fourPiece = artifact.sections.find((section) => section.setId === "15003" && section.pieceCount === 4);
    assert.equal(fourPiece.status, "auto");
    assert.equal(fourPiece.controls.length, 0);
    assert.equal(fourPiece.effects[0].status, "auto");
    assert.match(fourPiece.effects[0].statusReason, /弓/);

    const swordId = Object.entries(calcData.weapons).find(([, weapon]) => weapon.weaponType === "片手剣")[0];
    const inactive = sandbox.GenshinCalcConditions.artifactConditionPolicy(
        calcData.artifactSetModifiers["15003"].fourPiece[0],
        "artifact4:15003",
        context({ weaponId: swordId }),
        calcData
    );
    assert.equal(inactive.policy, "derived");
    assert.equal(inactive.enabled, false);
});

test("Golden Troupe separates its automatic and off-field bonuses", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const modifiers = calcData.artifactSetModifiers["15032"].fourPiece;
    assert.deepEqual(modifiers.map((modifier) => modifier.id), [
        "4pc_skill_damage_bonus",
        "4pc_skill_damage_bonus_off_field"
    ]);

    const goldenContext = context({ artifactSetIds: ["15032"] });
    const state = sandbox.GenshinCalcConditions.conditionPanelState(goldenContext, calcData);
    const section = state.cards.find((card) => card.id === "artifact").sections
        .find((item) => item.setId === "15032" && item.pieceCount === 4);
    assert.equal(section.controls.length, 1);
    assert.equal(section.controls[0].label, "キャラクターが待機中");
    const twoPieceSection = state.cards.find((card) => card.id === "artifact").sections
        .find((item) => item.setId === "15032" && item.pieceCount === 2);
    assert.equal(twoPieceSection.status, "auto");
    assert.equal(twoPieceSection.effects[0].status, "auto");

    const offField = sandbox.GenshinCalcEngine.normalizeArtifactModifier(modifiers[1], "artifact4:15032");
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(offField, "artifact4:15032");
    goldenContext.uiState.conditionByModifier[key] = { enabled: false, stack: 0, option: "" };
    let collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, goldenContext);
    assert.deepEqual(Array.from(collected.applied.filter((item) => item.source === "artifact2:15032"), (item) => item.value), [20]);
    assert.deepEqual(Array.from(collected.applied.filter((item) => item.source === "artifact4:15032"), (item) => item.value), [25]);
    const skillEntry = { id: "skill", attackType: "skill", damageType: "skill", element: "岩", scalings: [] };
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(skillEntry, goldenContext, collected).totals.damageBonus, 45);

    goldenContext.uiState.conditionByModifier[key].enabled = true;
    collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, goldenContext);
    assert.deepEqual(Array.from(collected.applied.filter((item) => item.source === "artifact4:15032"), (item) => item.value), [25, 25]);
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(skillEntry, goldenContext, collected).totals.damageBonus, 70);
});

test("shared artifact stacks render one control and use one state key", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const huskContext = context({ artifactSetIds: ["15021"] });
    const state = sandbox.GenshinCalcConditions.conditionPanelState(huskContext, calcData);
    const section = state.cards.find((card) => card.id === "artifact").sections
        .find((item) => item.setId === "15021" && item.pieceCount === 4);
    assert.equal(section.effects.length, 2);
    assert.equal(section.controls.length, 1);
    const keys = calcData.artifactSetModifiers["15021"].fourPiece.map((modifier) => {
        const normalized = sandbox.GenshinCalcEngine.normalizeArtifactModifier(modifier, "artifact4:15021");
        return sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, "artifact4:15021");
    });
    assert.equal(new Set(keys).size, 1);
});

test("2pc+2pc builds only the two selected two-piece sections", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const state = sandbox.GenshinCalcConditions.conditionPanelState(context({
        artifactSetMode: "2pc2pc",
        artifactSetIds: ["15001", "15018"]
    }), calcData);
    const sections = state.cards.find((card) => card.id === "artifact").sections;
    assert.deepEqual(Array.from(sections, (section) => [section.setId, section.pieceCount]), [["15001", 2], ["15018", 2]]);
    assert.equal(sections.every((section) => section.status === "reflected"), true);
});

test("攻撃種別限定会心は汎用会心の重複レコードを除外して対象攻撃だけへ適用する", () => {
    const sandbox = createHarness();
    const calcData = loadCalcData();
    const weaponId = "11518";
    const weaponModifiers = calcData.weaponModifiers[weaponId].modifiers;
    const specific = weaponModifiers.find((modifier) => modifier.id === "w_11518_crit_1");
    const weaponContext = context({ weaponId, artifactSetMode: "", artifactSetIds: [] });
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(specific, `weapon:${weaponId}`);
    weaponContext.uiState.conditionByModifier[key] = { enabled: true, stack: 0, option: "" };

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, weaponContext);
    assert.equal(collected.applied.some((item) => item.modifier.id === "w_11518_critBonus_765ef224"), false);
    assert.equal(collected.applied.some((item) => item.modifier.id === "w_11518_damage_2"), false);
    assert.equal(collected.applied.some((item) => item.modifier.id === "w_11518_crit_1"), true);

    const burst = { id: "burst", attackType: "burst", damageType: "burst", element: "岩", scalings: [] };
    const skill = { id: "skill", attackType: "skill", damageType: "skill", element: "岩", scalings: [] };
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(burst, weaponContext, collected).totals.critDamageBonus, 16);
    assert.equal(sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(skill, weaponContext, collected).totals.critDamageBonus, 0);
});
