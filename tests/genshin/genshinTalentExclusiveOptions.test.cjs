const test = require("node:test");
const assert = require("node:assert/strict");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

function createHarness() {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    return { ...harness, calcData: loadCalcData() };
}

function context(characterId) {
    return {
        characterId,
        constellation: 0,
        weaponId: "",
        refinement: 1,
        artifactSetIds: [],
        artifactSetMode: "",
        stats: { hp: 10000, atk: 1000, def: 1000, elementalMastery: 0 },
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        uiState: {
            conditionByModifier: {},
            complexConditionByModifier: {},
            toggleByModifier: {},
            stackByModifier: {},
            constellationConditions: {}
        },
        manualInputs: { resourceStates: {}, providerStats: {} }
    };
}

const CASES = [
    { characterId: "10000062", sourceId: "combat2", option: "iceRush", expected: 47.6, options: 5 },
    { characterId: "10000073", sourceId: "combat3", option: "2", expected: 40.176, options: 3 },
    { characterId: "10000114", sourceId: "combat3", option: "3", expected: 20, options: 4 }
];

test("exclusive talent stages resolve one selected value instead of summing sibling records", () => {
    const { sandbox, calcData } = createHarness();
    CASES.forEach((item) => {
        const ctx = context(item.characterId);
        const passive = calcData.talentModifiers[item.characterId].passives.find((entry) => entry.sourceId === item.sourceId);
        const normalized = passive.modifiers.map((modifier, index) => sandbox.GenshinCalcEngine.normalizeTalentStateModifier(
            modifier,
            `talent:${item.sourceId}`,
            calcData,
            ctx,
            index
        ));
        const active = normalized.filter((modifier) => modifier.auditDisposition !== "supersededByStructuredRecord");
        assert.equal(active.length, 1, `${item.characterId}:${item.sourceId}`);
        assert.equal(active[0].conditionInput.type, "option");
        assert.equal(active[0].conditionInput.options.length, item.options);
        const analysis = sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier: active[0],
            source: `talent:${item.sourceId}`,
            context: ctx
        });
        ctx.uiState.conditionByModifier[analysis.conditionStateKey] = { enabled: true, option: item.option };
        assert.equal(sandbox.GenshinCalcEngine.resolveModifierValue(active[0], ctx, ctx.uiState, analysis), item.expected);
    });
});

test("every repeated level-based talent stage with the same source label is structurally resolved", () => {
    const { sandbox, calcData } = createHarness();
    const unresolved = [];
    Object.entries(calcData.talentModifiers).forEach(([characterId, character]) => {
        (character.passives || []).forEach((passive) => {
            const groups = new Map();
            (passive.modifiers || []).forEach((modifier, index) => {
                if (!modifier.valueByLevel) return;
                const key = JSON.stringify([
                    modifier.category,
                    modifier.applyTo,
                    modifier.condition,
                    modifier.unit,
                    modifier.valueSource?.label
                ]);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push({ modifier, index });
            });
            groups.forEach((records) => {
                if (records.length < 2) return;
                const ctx = context(characterId);
                const normalized = records.map(({ modifier, index }) => sandbox.GenshinCalcEngine.normalizeTalentStateModifier(
                    modifier,
                    `talent:${passive.sourceId}`,
                    calcData,
                    ctx,
                    index
                ));
                if (normalized.filter((modifier) => modifier.auditDisposition !== "supersededByStructuredRecord").length !== 1) {
                    unresolved.push(`${characterId}:${passive.sourceId}`);
                }
            });
        });
    });
    assert.deepEqual(unresolved, []);
});

test("talent condition cards show one impact row and one option input for exclusive stages", () => {
    const { sandbox, calcData } = createHarness();
    CASES.forEach((item) => {
        const ctx = context(item.characterId);
        const panel = sandbox.GenshinCalcConditions.conditionPanelState(ctx, calcData);
        const section = panel.cards.find((card) => card.id === "talent").sections
            .find((entry) => entry.key === `talent:${item.sourceId}`);
        assert.ok(section, `${item.characterId}:${item.sourceId}`);
        assert.equal(section.effects.length, 1);
        assert.equal(section.controls.length, 1);
        assert.equal(section.controls[0].type, "option");
        assert.equal(section.controls[0].options.length, item.options);
    });
});
