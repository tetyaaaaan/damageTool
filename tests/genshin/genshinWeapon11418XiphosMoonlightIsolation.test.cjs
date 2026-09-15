"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createBrowserScriptHarness,
    loadCalcData
} = require("./helpers/browserScriptHarness.cjs");

const WEAPON_ID = "11418";
const IDS = {
    legacyCombined: "w_11418_scalingBonus_cf36aef0",
    personal: "w_11418_scaling_bonus_2",
    team: "w_11418_scaling_bonus_3",
    duplicateStat: "w_11418_stat_1"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/xiphosmoonlight.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/xiphosmoonlight.json"
];

function harness() {
    return createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinPartyModifiers.js",
        "games/js/genshinCalcEngine.js"
    ]).sandbox;
}

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(calcData, id) {
    return records(calcData).find((modifier) => modifier.id === id);
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

function groupFor(calcData, id) {
    return calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups
        ?.find((group) => group.modifierIds?.includes(id));
}

function armWeaponToggle(sandbox, calcData, calcContext, id, enabled = true) {
    const group = groupFor(calcData, id);
    assert.ok(group, `${id} needs an explicit activation group`);
    const normalized = sandbox.GenshinCalcEngine.normalizeWeaponModifier(
        record(calcData, id),
        records(calcData),
        calcData.weaponEffectRegistry.weapons[WEAPON_ID]
    );
    const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(normalized, `weapon:${WEAPON_ID}`);
    calcContext.uiState.conditionByModifier[key] = { enabled, stack: 0, option: "" };
    return key;
}

function appliedIds(collected) {
    return Array.from(
        collected.applied
            .filter((item) => item.modifier.id?.startsWith(`w_${WEAPON_ID}_`))
            .map((item) => item.modifier.id)
    ).sort();
}

test("匣中日月の6.7/7.0 rawは元素熟知比例の個人・チーム元素チャージ効率補正を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 11418);
        assert.equal(source.name, "Xiphos' Moonlight");
        assert.match(source.effectTemplateRaw, /every 10s/);
        assert.match(source.effectTemplateRaw, /\{0\}.*Energy Recharge/);
        assert.match(source.effectTemplateRaw, /nearby party members gaining 30%/);
        assert.match(source.effectTemplateRaw, /for 12s/);
        assert.deepEqual(source.r1.values, ["0.036%"]);
        assert.deepEqual(source.r5.values, ["0.072%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("匣中日月は発動前を適用せず、個人とチームの元素チャージ効率を二重適用しない", () => {
    const sandbox = harness();
    const calcData = loadCalcData();
    const offContext = context();
    assert.deepEqual(
        appliedIds(sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, offContext)),
        [],
        "発動時刻が未入力のXiphos効果を常時適用してはいけない"
    );

    const activeContext = context();
    armWeaponToggle(sandbox, calcData, activeContext, IDS.personal);
    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, activeContext);
    assert.deepEqual(appliedIds(collected), [IDS.personal]);
    const effective = sandbox.GenshinCalcEngine.buildEffectiveStats(activeContext, collected).effectiveStats;
    assert.equal(effective.energyRecharge, 103.6);
    assert.equal(collected.applied.filter((item) => item.modifier.id === IDS.personal).length, 1);
    assert.equal(collected.applied.some((item) => item.modifier.id === IDS.duplicateStat), false);
    assert.equal(collected.applied.some((item) => item.modifier.id === IDS.legacyCombined), false);
});

test("匣中日月のチーム補正は発動者の個人補正の30%だけをメイン計算へ渡す", () => {
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
    const teamCandidate = candidates.find((item) => item.modifier.id === IDS.team);
    assert.ok(teamCandidate, "Xiphos team record must use the party route");
    assert.ok(teamCandidate.toggleKey, "Xiphos team record needs a stable toggle key");
    support.buffStates[teamCandidate.toggleKey] = true;

    const collected = sandbox.GenshinCalcEngine.collectActiveModifiers(calcData, calcContext);
    const teamApplied = collected.applied.filter((item) => item.modifier.id === IDS.team);
    assert.equal(teamApplied.length, 1);
    assert.equal(teamApplied[0].value, 1.08);
    assert.equal(collected.applied.some((item) => item.modifier.id === IDS.personal), false);
    assert.equal(collected.applied.some((item) => item.modifier.id === IDS.duplicateStat), false);
});
