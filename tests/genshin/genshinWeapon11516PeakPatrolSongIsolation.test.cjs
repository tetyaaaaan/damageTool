"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadCalcData } = require("./helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const WEAPON_ID = "11516";
const IDS = {
    stackDamage: "w_11516_damage_2",
    stackDef: "w_11516_stat_1",
    teamScaling: "w_11516_scaling_bonus_4",
    teamLegacy: "w_11516_damage_3",
    dropDamageLegacy: "w_11516_damageBonus_b78b7787",
    dropDefLegacy: "w_11516_statBonus_097433f4"
};

const SOURCE_PATHS = [
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/weapons/peakpatrolsong.json",
    "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/weapons/peakpatrolsong.json"
];

function records(calcData = loadCalcData()) {
    return calcData.weaponModifiers[WEAPON_ID].modifiers;
}

function record(id, calcData) {
    return records(calcData).find((item) => item.id === id);
}

test("岩峰を巡る歌の6.7/7.0 rawは通常/落下攻撃、2層、DEF基準チーム補正を明示する", () => {
    const sources = SOURCE_PATHS.map((path) => require(path));
    sources.forEach((source) => {
        assert.equal(source.id, 11516);
        assert.match(source.effectTemplateRaw, /Normal or Plunging Attacks hit/);
        assert.match(source.effectTemplateRaw, /Max 2 stacks/);
        assert.match(source.effectTemplateRaw, /all nearby party members/);
        assert.match(source.effectTemplateRaw, /for every 1,000 DEF/);
        assert.match(source.effectTemplateRaw, /for 15s/);
        assert.deepEqual(source.r1.values, ["8%", "10%", "8%", "25.6%"]);
        assert.deepEqual(source.r5.values, ["16%", "20%", "16%", "51.2%"]);
    });
    assert.deepEqual(sources[0], sources[1], "6.7/7.0 provider raw must remain unchanged");
});

test("岩峰を巡る歌は2層入力を共有し、常時適用と落下攻撃限定・重複チーム補正を許さない", () => {
    const calcData = loadCalcData();
    const stackDamage = record(IDS.stackDamage, calcData);
    const stackDef = record(IDS.stackDef, calcData);
    const teamScaling = record(IDS.teamScaling, calcData);
    const teamLegacy = record(IDS.teamLegacy, calcData);
    const dropDamageLegacy = record(IDS.dropDamageLegacy, calcData);
    const dropDefLegacy = record(IDS.dropDefLegacy, calcData);

    assert.notEqual(stackDamage.condition, "afterNormalAttackHit");
    assert.match(String(stackDamage.condition), /Normal|Plunging|normal|plunging/);
    assert.deepEqual(stackDamage.applyTo, ["allElementDamageBonus"]);
    assert.deepEqual(stackDamage.valueByRefinementPerStack, {
        1: 10, 2: 12.5, 3: 15, 4: 17.5, 5: 20
    });
    assert.equal(stackDamage.duration, 6);
    assert.deepEqual(stackDamage.stack, { min: 0, max: 2, default: 0 });
    assert.equal(stackDamage.conditionInput?.type, "stack");
    assert.equal(stackDamage.conditionInput?.min, 0);
    assert.equal(stackDamage.conditionInput?.max, 2);

    assert.deepEqual(stackDef.applyTo, ["defPercent"]);
    assert.deepEqual(stackDef.valueByRefinementPerStack, {
        1: 8, 2: 10, 3: 12, 4: 14, 5: 16
    });
    assert.equal(stackDef.duration, 6);
    assert.deepEqual(stackDef.stack, { min: 0, max: 2, default: 0 });
    assert.notEqual(stackDef.condition, "afterNormalAttackHit");
    assert.match(String(stackDef.condition), /Normal|Plunging|normal|plunging/);

    assert.equal(teamScaling.category, "scalingBonus");
    assert.deepEqual(teamScaling.applyTo, ["allElementDamageBonus"]);
    assert.equal(teamScaling.calculationSupport, "custom");
    assert.equal(teamScaling.reference?.stat, "def");
    assert.equal(teamScaling.reference?.source, "self");
    assert.notEqual(teamScaling.condition, "always");
    assert.equal(teamScaling.divisor, 1000);
    assert.deepEqual(teamScaling.ratioByRefinement, {
        1: 8, 2: 10, 3: 12, 4: 14, 5: 16
    });
    assert.deepEqual(teamScaling.maxValueByRefinement, {
        1: 25.6, 2: 32, 3: 38.4, 4: 44.8, 5: 51.2
    });
    assert.equal(teamScaling.duration, 15);

    [teamLegacy, dropDamageLegacy, dropDefLegacy].forEach((modifier) => {
        assert.equal(modifier.auditDisposition, "supersededByStructuredRecord");
    });

    const groups = calcData.weaponEffectRegistry?.weapons?.[WEAPON_ID]?.groups || [];
    const selfGroup = groups.find((item) =>
        [IDS.stackDamage, IDS.stackDef].every((id) => item.modifierIds?.includes(id))
    );
    const teamGroup = groups.find((item) => item.modifierIds?.includes(IDS.teamScaling));
    assert.ok(selfGroup, "Ode to Flowers self modifiers need one shared stack group");
    assert.equal(selfGroup.targetOwner, "self");
    assert.equal(selfGroup.activation?.type, "stack");
    assert.equal(selfGroup.activation?.min, 0);
    assert.equal(selfGroup.activation?.max, 2);
    assert.ok(teamGroup, "two-stack team DEF scaling needs a team registry group");
    assert.equal(teamGroup.targetOwner, "team");
    assert.equal(teamGroup.activation?.type, "toggle");
});

test("岩峰を巡る歌の2層到達後チーム補正は装備者DEFと精錬別上限から計算される", () => {
    [
        { refinement: 1, expected: 25.6 },
        { refinement: 5, expected: 51.2 }
    ].forEach(({ refinement, expected }) => {
        const { sandbox, elements, calcData } = createScenarioHarness();
        prepareScenarioInputs(elements, {
            characterId: "10000037",
            stats: { baseAtk: 500, atk: 2000 }
        });
        const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        request.party = {
            schemaVersion: 1,
            focusSlot: 1,
            members: [
                { slot: 1, role: "main", enabled: true, characterId: "10000037" },
                {
                    slot: 2,
                    role: "support",
                    enabled: true,
                    characterId: "10000038",
                    nameJa: "アルベド",
                    constellation: 0,
                    talentLevels: { normal: 10, skill: 10, burst: 10 },
                    equipment: { weaponId: WEAPON_ID, refinement, artifactSetIds: [] },
                    stats: { def: 4000 },
                    buffStates: {}
                }
            ]
        };
        const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        const candidate = before.partyModifiers.find((item) => item.modifier.id === IDS.teamScaling);
        assert.ok(candidate);
        assert.equal(candidate.status, "off");
        assert.equal(candidate.resolvedValue, expected);
        request.party.members[1].buffStates[candidate.toggleKey] = true;
        const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        assert.ok(after.results[0].expected > before.results[0].expected);
        assert.ok(after.results[0].breakdown.appliedModifiers.some((item) =>
            item.modifier.id === IDS.teamScaling && item.value === expected
        ));
    });
});
