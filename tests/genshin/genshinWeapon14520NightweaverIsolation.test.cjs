"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "14520";
const IDS = {
    legacyBloom: "w_14520_reactionBonus_51ed08f7",
    legacyHyperbloom: "w_14520_reactionBonus_86c966e8",
    legacyLunarBloom: "w_14520_reactionBonus_8f49bc48",
    bloom: "w_14520_reaction_bonus_3",
    hyperbloom: "w_14520_reaction_bonus_4",
    lunarBloom: "w_14520_reaction_bonus_5",
    prayer: "w_14520_stat_1",
    verse: "w_14520_statBonus_f3cdffb9"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/nightweaverslookingglass.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-shard03/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/nightweaverslookingglass.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

function groups(calcData) {
    return calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
}

function hasActivationContract(modifier, weaponGroups) {
    if (modifier.conditionInput?.type === "option") return true;
    return weaponGroups.some((group) => group.modifierIds?.includes(modifier.id) && group.activation?.type === "toggle");
}

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinElementalResonance.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function context(overrides = {}) {
    return {
        characterId: "10000002",
        weaponId: WEAPON_ID,
        refinement: 1,
        artifactSetMode: "",
        artifactSetIds: [],
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        stats: {
            hp: 20000,
            baseHp: 10000,
            atk: 2000,
            baseAtk: 1000,
            def: 1000,
            baseDef: 500,
            elementalMastery: 100,
            energyRecharge: 100,
            critRate: 50,
            critDamage: 100,
            elementalDamageBonus: 0
        },
        enemy: { resistanceDebuff: 0, defenseDebuff: 0, defenseIgnore: 0 },
        manualInputs: { recordedHealing: null, providerStats: {}, resourceStates: {} },
        uiState: {
            stackByModifier: {},
            resolvedConditionByModifier: {},
            conditionByModifier: {},
            toggleByModifier: {},
            complexConditionByModifier: {}
        },
        mode: "manualMode",
        ...overrides
    };
}

function groupFor(calcData, modifierId) {
    return groups(calcData).find((group) => group.modifierIds?.includes(modifierId));
}

function armWeaponToggle(sandbox, calcData, calcContext, modifierId, enabled = true) {
    const group = groupFor(calcData, modifierId);
    assert.ok(group, `${modifierId} needs a registry activation group`);
    const modifier = record(modifierId, calcData);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        modifier,
        records(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, `weapon:${WEAPON_ID}`);
    calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option: "" };
    return key;
}

function appliedWeaponIds(collected) {
    return Array.from(collected.applied
        .filter((item) => item.source === `weapon:${WEAPON_ID}`)
        .map((item) => item.modifier.id))
        .sort();
}

function reactionEntry() {
    return {
        id: "nightweaver-reaction",
        attackType: "reaction",
        damageType: "reaction",
        element: "草",
        group: "reaction"
    };
}

test("夜織の鏡の6.7/7.0 rawは二つの状態と同時成立時の三種の反応補正を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 14520);
        assert.match(source.effectTemplateRaw, /Elemental Skill deals Hydro or Dendro DMG/);
        assert.match(source.effectTemplateRaw, /nearby party members trigger Lunar-Bloom/);
        assert.match(source.effectTemplateRaw, /both Prayer of the Far North and New Moon Verse/);
        assert.match(source.effectTemplateRaw, /Bloom DMG/);
        assert.match(source.effectTemplateRaw, /Hyperbloom and Burgeon DMG/);
        assert.match(source.effectTemplateRaw, /Lunar-Bloom DMG/);
        assert.deepEqual(source.r1.values, ["60", "60", "120%", "80%", "40%"]);
        assert.deepEqual(source.r5.values, ["120", "120", "240%", "160%", "80%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("夜織の鏡は発動条件を分離し、三種の反応補正を正しい対象へ限定する", () => {
    const calcData = loadCalcData();
    const weaponGroups = groups(calcData);
    const prayer = record(IDS.prayer, calcData);
    const verse = record(IDS.verse, calcData);
    const bloom = record(IDS.bloom, calcData);
    const hyperbloom = record(IDS.hyperbloom, calcData);
    const lunarBloom = record(IDS.lunarBloom, calcData);

    assert.notEqual(prayer.condition, "always");
    assert.equal(prayer.duration, 4.5);
    assert.deepEqual(prayer.applyTo, ["elementalMastery"]);
    assert.deepEqual(prayer.valueByRefinement, { 1: 60, 2: 75, 3: 90, 4: 105, 5: 120 });
    assert.ok(hasActivationContract(prayer, weaponGroups), "Prayer needs an explicit Hydro/Dendro Skill activation contract");

    assert.notEqual(verse.condition, "always");
    assert.equal(verse.duration, 10);
    assert.deepEqual(verse.applyTo, ["elementalMastery"]);
    assert.deepEqual(verse.valueByRefinement, { 1: 60, 2: 75, 3: 90, 4: 105, 5: 120 });
    assert.ok(hasActivationContract(verse, weaponGroups), "New Moon Verse needs an explicit Lunar-Bloom activation contract");

    [bloom, hyperbloom, lunarBloom].forEach((modifier) => {
        assert.notEqual(modifier.condition, "always");
        assert.ok(hasActivationContract(modifier, weaponGroups), `${modifier.id} needs the both-state activation contract`);
    });
    assert.deepEqual(bloom.applyTo, ["bloomDamageBonus"]);
    assert.deepEqual(hyperbloom.applyTo, ["hyperbloomDamageBonus", "burgeonDamageBonus"]);
    assert.deepEqual(lunarBloom.applyTo, ["lunarBloomDamageBonus"]);
    assert.deepEqual(bloom.valueByRefinement, { 1: 120, 2: 150, 3: 180, 4: 210, 5: 240 });
    assert.deepEqual(hyperbloom.valueByRefinement, { 1: 80, 2: 100, 3: 120, 4: 140, 5: 160 });
    assert.deepEqual(lunarBloom.valueByRefinement, { 1: 40, 2: 50, 3: 60, 4: 70, 5: 80 });

    [IDS.legacyBloom, IDS.legacyHyperbloom, IDS.legacyLunarBloom].forEach((id) => {
        assert.equal(record(id, calcData).auditDisposition, "supersededByStructuredRecord");
    });
});

test("夜織の鏡は祈り・朔月の詩を個別にON/OFFでき、同時状態だけが反応補正を有効にする", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const none = calcData.reactionDefinitions.options.none;

    const offContext = context({ reactionOption: none });
    assert.deepEqual(
        appliedWeaponIds(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext)),
        [],
        "未発動時に14520の補正を自動適用してはいけない"
    );

    const prayerContext = context({ reactionOption: none });
    armWeaponToggle(sandbox, calcData, prayerContext, IDS.prayer);
    assert.deepEqual(
        appliedWeaponIds(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, prayerContext)),
        [IDS.prayer]
    );

    const verseContext = context({ reactionOption: none });
    armWeaponToggle(sandbox, calcData, verseContext, IDS.verse);
    assert.deepEqual(
        appliedWeaponIds(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, verseContext)),
        [IDS.verse]
    );

    const bothContext = context({ reactionOption: none });
    armWeaponToggle(sandbox, calcData, bothContext, IDS.prayer);
    armWeaponToggle(sandbox, calcData, bothContext, IDS.verse);
    assert.deepEqual(
        appliedWeaponIds(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, bothContext)),
        [IDS.prayer, IDS.verse].sort()
    );
});

test("夜織の鏡の同時状態はBloom/超開花/月開花へ各1回だけ実計算適用し、Bloomへ過剰包含しない", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const support = {
        slot: 2,
        role: "support",
        enabled: true,
        characterId: "10000035",
        nameJa: "サポート",
        element: "草",
        constellation: 0,
        talentLevels: { normal: 10, skill: 10, burst: 10 },
        equipment: { weaponId: WEAPON_ID, refinement: 1, artifactSetIds: [] },
        stats: { elementalMastery: 100 },
        buffStates: {}
    };
    const calcContext = context({
        weaponId: "",
        reactionOption: calcData.reactionDefinitions.options.bloom,
        party: {
            schemaVersion: 1,
            focusSlot: 1,
            members: [
                { slot: 1, role: "main", enabled: true, characterId: "10000002", element: "氷" },
                support
            ]
        }
    });

    const candidates = sandbox.GenshinPartyModifiers.collectPartyModifierCandidates(calcData, calcContext);
    [IDS.bloom, IDS.hyperbloom, IDS.lunarBloom].forEach((id) => {
        const candidate = candidates.find((item) => item.modifier.id === id);
        assert.ok(candidate, `${id} must be exposed through the party weapon route`);
        assert.ok(candidate.toggleKey, `${id} must have a stable party toggle key`);
        support.buffStates[candidate.toggleKey] = true;
    });

    const collectAndApply = (reactionId) => {
        calcContext.reactionOption = calcData.reactionDefinitions.options[reactionId];
        const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
        const result = sandbox.GenshinCalcEngine.applyModifiersToDamageEntry(
            reactionEntry(),
            calcContext,
            collected
        );
        return {
            collected,
            result,
            applied: result.applied.filter((item) => item.modifier.id?.startsWith("w_14520_"))
        };
    };

    const bloom = collectAndApply("bloom");
    const hyperbloom = collectAndApply("hyperbloom");
    const lunarBloom = collectAndApply("lunarBloom");

    assert.equal(bloom.result.totals.reactionBonus, 120);
    assert.equal(hyperbloom.result.totals.reactionBonus, 80);
    assert.equal(lunarBloom.result.totals.reactionBonus, 40);
    assert.deepEqual(
        Array.from(bloom.applied.map((item) => item.modifier.id)).sort(),
        [IDS.bloom]
    );
    assert.deepEqual(
        Array.from(hyperbloom.applied.map((item) => item.modifier.id)).sort(),
        [IDS.hyperbloom]
    );
    assert.deepEqual(
        Array.from(lunarBloom.applied.map((item) => item.modifier.id)).sort(),
        [IDS.lunarBloom]
    );
});
