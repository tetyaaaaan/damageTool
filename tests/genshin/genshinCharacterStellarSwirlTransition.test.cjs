const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, loadCalcData } = require("./helpers/browserScriptHarness.cjs");

const ROOT = path.resolve(__dirname, "../..");
const TARGET_REVISION = "8b15995fa220c88a4d0d7ffe1e21b041d0b32588";

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function context(characterId, elementalMastery = 0) {
    return {
        characterId,
        constellation: 6,
        weaponId: "",
        refinement: 1,
        artifactSetIds: [],
        artifactSetMode: "",
        stats: { hp: 10000, atk: 1000, def: 1000, elementalMastery, elementDamageBonus: 0 },
        effectiveStats: { hp: 10000, atk: 1000, def: 1000, elementalMastery, elementDamageBonus: 0 },
        enemy: { defenseReduction: 0, defenseIgnore: 0 },
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

test("fixed 7.0 raw and local source text agree on the four Stellar Swirl trigger expansions", () => {
    const talents = readJson("games/genshin/data/character-talents.json");
    const constellations = readJson("games/genshin/data/character-constellations.json");
    const rawRoot = `games/genshin/data/v2/version-transitions/6.7-to-7.0/sources`;
    const rawCases = [
        ["10000043", "passive_1", "genshin-db", "talents/sucrose.json", "passive1"],
        ["10000047", "passive_2", "genshin-db", "talents/kaedeharakazuha.json", "passive2"],
        ["10000053", "passive_1", "genshin-db", "talents/sayu.json", "passive1"],
        ["10000059", "passive_1", "genshin-db-shard06", "talents/shikanoinheizou.json", "passive1"]
    ];

    for (const [characterId, sourceId, namespace, file, rawKey] of rawCases) {
        const local = talents[characterId].passives.find((item) => item.sourceId === sourceId);
        const raw = readJson(`${rawRoot}/${namespace}/${TARGET_REVISION}/English/${file}`);
        assert.match(raw[rawKey].description, /Swirl or Stellar Swirl/);
        assert.match(local.descriptionJa, /拡散反応または星拡散反応/);
    }

    const sayuC4Raw = readJson(`${rawRoot}/genshin-db/${TARGET_REVISION}/English/constellations/sayu.json`);
    assert.match(sayuC4Raw.c4.description, /Swirl or Stellar Swirl/);
    assert.match(constellations["10000053"].constellations["4"].effectText, /拡散反応または星拡散反応/);
    assert.match(constellations["10000053"].constellations["4"].effectText, /フィールド上/);
});

test("existing toggle routes expose the current trigger and retain the recorded Sucrose/Kazuha values", () => {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();

    const cases = [
        { characterId: "10000043", sourceId: "passive1", mastery: 0 },
        { characterId: "10000047", sourceId: "passive2", mastery: 800 }
    ];

    for (const item of cases) {
        const ctx = context(item.characterId, item.mastery);
        const passive = calcData.talentModifiers[item.characterId].passives
            .find((entry) => entry.sourceId === item.sourceId);
        const modifier = harness.sandbox.GenshinCalcEngine.normalizeTalentStateModifier(
            passive.modifiers[0],
            `talent:${item.sourceId}`,
            calcData,
            ctx,
            0
        );
        const analysis = harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
            modifier,
            source: `talent:${item.sourceId}`,
            context: ctx
        });
        ctx.uiState.conditionByModifier[analysis.conditionStateKey] = { enabled: true };
        assert.match(modifier.conditionLabel, /拡散反応または星拡散反応/);
        if (item.characterId === "10000043") {
            assert.equal(
                harness.sandbox.GenshinCalcEngine.resolveModifierValue(modifier, ctx, ctx.uiState, analysis),
                50
            );
        } else {
            const applied = harness.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
                { id: "cryo-hit", group: "skill", attackType: "skill", damageType: "skill", element: "氷" },
                ctx,
                { applied: [{ modifier, analysis, source: "talent:passive2", valueContext: ctx }], candidates: [] }
            );
            assert.equal(applied.totals.damageBonus, 32);
        }
    }
});

test("Mizuki 7.0 source text is current while the formerly broad damage modifier stays fail-closed", () => {
    const talents = readJson("games/genshin/data/character-talents.json");
    const constellations = readJson("games/genshin/data/character-constellations.json");
    const modifiers = readJson("games/genshin/data/calc/talent-modifiers.json");
    const constellationModifiers = readJson("games/genshin/data/calc/constellation-modifiers.json");
    const rawRoot = "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard13";
    const rawTalent = readJson(`${rawRoot}/${TARGET_REVISION}/English/talents/yumemizukimizuki.json`);
    const rawConstellation = readJson(`${rawRoot}/${TARGET_REVISION}/English/constellations/yumemizukimizuki.json`);

    assert.match(rawTalent.combat2.description, /Swirl DMG and Stellar Swirl reaction DMG/);
    assert.match(talents["10000109"].skill.descriptionJa, /拡散反応および星拡散反応/);
    assert.match(rawTalent.passive1.description, /Swirl or Stellar Swirl/);
    assert.match(talents["10000109"].passives.find((item) => item.sourceId === "passive_1").descriptionJa, /拡散反応または星拡散反応/);
    assert.match(rawConstellation.c1.description, /1,100% and 550%/);
    assert.match(constellations["10000109"].constellations["1"].effectText, /1100%分または550%分/);
    assert.match(rawConstellation.c6.description, /10% and 20%/);
    assert.match(constellations["10000109"].constellations["6"].effectText, /会心率\+10%、会心ダメージ\+20%/);
    assert.match(constellationModifiers["10000109"].constellations["1"][0].sourceText, /1100%分または550%分/);
    assert.match(constellationModifiers["10000109"].constellations["6"][0].sourceText, /会心率\+10%、会心ダメージ\+20%/);

    const combat2 = modifiers["10000109"].passives.find((item) => item.sourceId === "combat2");
    assert.deepEqual(combat2.modifiers, []);
});

test("Sandrone C1 Stellar Glimmer bonus cannot leak into ordinary damage", () => {
    const harness = createBrowserScriptHarness(["games/js/genshinModifierAnalyzer.js"]);
    const calcData = loadCalcData();
    const raw = readJson(
        `games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard16/${TARGET_REVISION}/English/constellations/sandrone.json`
    );
    const modifier = calcData.constellationModifiers["10000133"].constellations["1"][0];

    assert.match(raw.c1.description, /Stellar Glimmer reaction DMG/);
    assert.match(modifier.sourceText, /星輝反応ダメージ/);
    const analysis = harness.sandbox.GenshinModifierAnalyzer.analyzeModifier({
        modifier,
        source: "constellation:1",
        context: context("10000133")
    });
    assert.equal(analysis.calculable, false);
    assert.equal(analysis.supportStatus, "displayOnly");
    assert.equal(modifier.auditDisposition, "dedicatedFormulaDeferred");
});

test("Sandrone C6 applies its recorded 20% only to direct Stellar-Conduct damage", () => {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    const raw = readJson(
        `games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard16/${TARGET_REVISION}/English/constellations/sandrone.json`
    );
    const modifier = calcData.constellationModifiers["10000133"].constellations["6"][0];

    assert.match(raw.c6.description, /\*\*elevated\*\* by 20%/);
    assert.equal(modifier.value, 20);
    assert.equal(modifier.category, "reactionBonus");
    assert.deepEqual(modifier.applyTo, ["stellarConductDamageBonus"]);

    const run = (enabled, directReaction) => {
        const ctx = context("10000133");
        ctx.uiState.constellationConditions.C6 = enabled;
        ctx.reactionOptionKey = directReaction ? "stellarConduct" : "";
        ctx.manualInputs.stellarConductStacks = 0;
        harness.sandbox.GenshinCalcEngine.hydrateReactionContext(ctx, calcData);
        const entry = harness.sandbox.GenshinCalcEngine
            .collectTalentDamageEntries(calcData, ctx).entries
            .find((item) => directReaction
                ? item.group === "normalAttack" && item.id === "charged_damage_3"
                : item.group === "normalAttack" && item.id === "normal_1damage");
        assert.ok(entry, directReaction ? "direct Stellar-Conduct entry" : "ordinary entry");
        const collected = harness.sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, ctx);
        const applied = harness.sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(entry, ctx, collected);
        return harness.sandbox.GenshinCalcEngine.calculateDamage(entry, ctx, applied);
    };

    const ordinaryOff = run(false, false);
    const ordinaryOn = run(true, false);
    assert.equal(ordinaryOff.breakdown.damageBonus, ordinaryOn.breakdown.damageBonus);
    assert.equal(ordinaryOff.nonCrit, ordinaryOn.nonCrit);
    assert.equal(
        ordinaryOn.breakdown.appliedModifiers.some((item) => item.modifier?.id === modifier.id),
        false
    );

    const directOff = run(false, true);
    const directOn = run(true, true);
    assert.equal(directOff.breakdown.reactionBonus, 0);
    assert.equal(directOn.breakdown.reactionBonus, 20);
    assert.ok(directOn.nonCrit > directOff.nonCrit);
    assert.equal(Math.round(directOn.nonCrit * 1000), Math.round(directOff.nonCrit * 1.2 * 1000));
    assert.equal(
        directOn.breakdown.appliedModifiers.filter((item) => item.modifier?.id === modifier.id).length,
        1
    );
});
