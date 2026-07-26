const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, loadCalcData, readJson } = require("./helpers/browserScriptHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile damage results share one explicit header and body column contract", () => {
    const renderer = read("games/js/genshinCalcRenderer.js");
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(renderer, /<colgroup><col class="genshin-damage-col-name">/);
    assert.match(renderer, /<col class="genshin-damage-col-value">/);
    assert.match(css, /\.genshin-damage-col-name\s*\{[^}]*width:\s*46%/s);
    assert.match(css, /\.genshin-damage-col-value\s*\{[^}]*width:\s*18%/s);
    assert.match(css, /\.genshin-damage-result-row td\s*\{[^}]*font-variant-numeric:\s*tabular-nums;[^}]*text-align:\s*right/s);
});

test("all condition cards expose activation, effect and current calculation separately", () => {
    const conditions = read("games/js/genshinCalcConditions.js");
    const renderer = read("games/js/genshinCalcRenderer.js");

    assert.match(conditions, /function modifierActivationCondition/);
    assert.match(conditions, /function modifierEffectSummary/);
    assert.match(conditions, /activationCondition:\s*modifierActivationCondition/);
    assert.match(conditions, /effectSummary:\s*modifierEffectSummary/);
    assert.match(renderer, /<dt>発動条件<\/dt>/);
    assert.match(renderer, /<dt>効果<\/dt>/);
    assert.match(renderer, /<dt>現在の反映<\/dt>/);
    assert.doesNotMatch(conditions, /`発動条件: \$\{condition\}`/);
});

test("bounded stack conditions use a shared select control up to 20 layers", () => {
    const renderer = read("games/js/genshinCalcRenderer.js");
    assert.match(renderer, /control\.type === "stack"[\s\S]*Number\(control\.max\) <= 20/);
    assert.match(renderer, /未発動（0層）/);
    assert.match(renderer, /data-genshin-condition-kind=\\"stack\\"|data-genshin-condition-kind=\"stack\"/);
});

test("condition editing uses one source-tabbed dialog and a compact page summary", () => {
    const html = read("games/genshin/index.html");
    const renderer = read("games/js/genshinCalcRenderer.js");
    const css = read("games/css/genshin-tool-ui.css");
    assert.match(html, /id="genshinConditionSummary"/);
    assert.match(html, /id="genshinConditionDialog"/);
    assert.match(html, /id="genshinConditionTabs"/);
    assert.match(renderer, /const CONDITION_TABS = \[/);
    ["reaction", "weapon", "artifact", "talent", "other"].forEach((id) => {
        assert.match(renderer, new RegExp(`id: "${id}"`));
    });
    assert.match(css, /\.genshin-condition-dialog\s*\{/);
    assert.match(css, /\.genshin-tool-page \.genshin-condition-launcher\s*\{/);
    assert.match(renderer, /genshinConditionDialogOpen"[\s\S]*await handlePrepareConditionsClick\(\)[\s\S]*conditionDialog\.showModal\(\)/);
});

test("every calculation modifier receives concise condition and effect text", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalcConditions.js"]);
    const roots = [
        readJson("games/genshin/data/calc/talent-modifiers.json"),
        readJson("games/genshin/data/calc/constellation-modifiers.json"),
        readJson("games/genshin/data/calc/weapon-modifiers.json"),
        readJson("games/genshin/data/calc/artifact-set-modifiers.json")
    ];
    const modifiers = [];
    const visit = (value) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        if (typeof value.category === "string" && typeof value.condition === "string") modifiers.push(value);
        Object.values(value).forEach(visit);
    };
    roots.forEach(visit);

    assert.ok(modifiers.length > 1000);
    modifiers.forEach((modifier) => {
        const condition = sandbox.GenshinCalcConditions.modifierActivationCondition(modifier, [], null, "補正名");
        const effect = sandbox.GenshinCalcConditions.modifierEffectSummary(modifier, { refinement: 1 });
        assert.ok(condition.trim(), modifier.id || modifier.condition);
        assert.ok(effect.trim(), modifier.id || modifier.category);
        assert.notEqual(condition, modifier.condition, modifier.id || modifier.condition);
        assert.doesNotMatch(condition, /^(after|before|during|inside|on|when)[A-Z]/, modifier.id || modifier.condition);
        assert.doesNotMatch(condition, /^(効果固有|固有状態|武器固有)の?発動条件/, modifier.id || modifier.condition);
        assert.doesNotMatch(effect, /(?:damageBonus|statBonus|extraDamage|resourceEffect|Crit|Resistance|[a-z]+[A-Z][A-Za-z]+)/, modifier.id || modifier.category);
    });

    const conditions = new Set(modifiers.map((modifier) => modifier.condition));
    const targets = new Set(modifiers.flatMap((modifier) => modifier.applyTo || []));
    assert.ok(conditions.size > 100);
    assert.ok(targets.size > 100);
    conditions.forEach((condition) => {
        const label = sandbox.GenshinCalcConditions.conditionLabelForKey(condition, "補正名");
        assert.ok(label, `発動条件ラベル未定義: ${condition}`);
    });
    targets.forEach((target) => {
        const label = sandbox.GenshinCalcConditions.targetLabel(target);
        assert.notEqual(label, "対象効果", `効果対象ラベル未定義: ${target}`);
    });
});

test("all character, weapon and artifact panels generate semantic condition facts", () => {
    const { sandbox } = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    const baseContext = (overrides = {}) => ({
        characterId: "10000037",
        weaponId: "",
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: { hp: 20000, atk: 2000, def: 1000, elementalMastery: 100, energyRecharge: 100, critRate: 5, critDamage: 50, elementDamageBonus: 0 },
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
    });
    let checkedEffects = 0;
    const assertPanel = (context, label) => {
        const state = sandbox.GenshinCalcConditions.conditionPanelState(context, calcData);
        state.cards.flatMap((card) => card.sections || []).flatMap((section) => section.effects || []).forEach((effect) => {
            checkedEffects += 1;
            assert.ok(effect.activationCondition, `${label}: 発動条件なし`);
            assert.ok(effect.effectSummary, `${label}: 効果説明なし`);
            assert.ok(effect.displayTarget, `${label}: 効果対象なし`);
            assert.doesNotMatch(effect.activationCondition, /(?:指定されたHP条件|対象の攻撃|対象の天賦|効果固有の発動条件|固有状態の発動中|武器固有の発動条件)/, `${label}:${effect.modifier?.id || effect.modifier?.condition || effect.id}`);
            assert.doesNotMatch(`${effect.effectSummary}${effect.displayTarget}`, /(?:damageBonus|statBonus|extraDamage|resourceEffect|Crit|Resistance|[a-z]+[A-Z][A-Za-z]+)/, label);
        });
    };

    Object.keys(calcData.weaponModifiers).forEach((weaponId) => assertPanel(baseContext({ weaponId }), `weapon:${weaponId}`));
    Object.keys(calcData.artifactSetModifiers).forEach((setId) => assertPanel(baseContext({ artifactSetMode: "4pc", artifactSetIds: [setId] }), `artifact:${setId}`));
    Object.keys(calcData.constellationModifiers).forEach((characterId) => assertPanel(baseContext({ characterId, constellation: 6 }), `character:${characterId}`));
    const activationConditions = (characterId) => sandbox.GenshinCalcConditions
        .conditionPanelState(baseContext({ characterId, constellation: 6 }), calcData)
        .cards.flatMap((card) => card.sections || [])
        .flatMap((section) => section.effects || [])
        .map((effect) => effect.activationCondition);
    assert.ok(activationConditions("10000046").includes("HPが50%以下の時"));
    assert.ok(activationConditions("10000082").includes("HPが50%以上の時"));
    assert.ok(activationConditions("10000086").includes("HPが増減し、「烈霜の懲戒」状態中"));
    assert.ok(activationConditions("10000087").includes("HPが30%を超えている時"));
    assert.ok(activationConditions("10000092").includes("「竹星」の補助仙力が残っている時"));
    assert.ok(activationConditions("10000095").includes("HPが50%以下の時"));
    assert.equal(
        sandbox.GenshinCalcConditions.conditionLabelForKey("fewerThanTwoConvertedSourceSamples"),
        "元素変化した「サンプル音源」が2つ未満の時"
    );
    assert.ok(checkedEffects > 1000, `監査対象が不足しています: ${checkedEffects}`);
});
