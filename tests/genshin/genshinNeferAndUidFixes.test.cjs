const test = require("node:test");
const assert = require("node:assert/strict");
const {
    createBrowserScriptHarness,
    loadCalcData,
    readJson
} = require("./helpers/browserScriptHarness.cjs");
const {
    createScenarioHarness,
    prepareScenarioInputs
} = require("./helpers/calcScenarioHarness.cjs");
const { localCoverageProblems } = require("../../scripts/syncGenshinCompositeTalentScalings.cjs");
const { collectProblems: collectFlatStatUnitProblems } = require("../../scripts/genshinFlatStatUnitAudit.cjs");

test("全収録済み複合天賦倍率が必要な参照ステータスを保持する", () => {
    const scalings = readJson("games/genshin/data/calc/talent-scalings.json");
    assert.deepEqual(localCoverageProblems(scalings), []);

    const iluga = scalings["10000127"];
    assert.deepEqual(iluga.skill.entries.find((entry) => entry.id === "damage").scalings.map((item) => item.stat), ["elementalMastery", "def"]);
    assert.deepEqual(iluga.burst.entries.find((entry) => entry.id === "skilldamage").scalings.map((item) => item.stat), ["elementalMastery", "def"]);
});

test("元素熟知の直接ステータス加算をpercent単位として登録しない", () => {
    const modifiers = readJson("games/genshin/data/calc/weapon-modifiers.json");
    assert.deepEqual(collectFlatStatUnitProblems(modifiers, "weapon-modifiers.json"), []);
});

test("ネフェルの元素スキルに虚影3段と攻撃力・元素熟知の複合倍率を収録する", () => {
    const entries = loadCalcData().talentScalings["10000122"].skill.entries;
    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]));

    assert.deepEqual(
        [
            byId.normal_1damage_shades.label,
            byId.normal_2damage_shades.label,
            byId.normal_3damage_shades.label
        ],
        ["「虚ろな影」の幻の戯1段", "「虚ろな影」の幻の戯2段", "「虚ろな影」の幻の戯3段"]
    );
    assert.deepEqual(byId.skilldamage.scalings.map((scaling) => scaling.stat), ["atk", "elementalMastery"]);
    assert.deepEqual(byId.normal_1damage_2.scalings.map((scaling) => scaling.stat), ["atk", "elementalMastery"]);
    assert.deepEqual(byId.normal_2damage_2.scalings.map((scaling) => scaling.stat), ["atk", "elementalMastery"]);
    assert.equal(byId.normal_3damage_shades.scalings[0].valuesByLevel["10"], 230.4);
});

test("ネフェルの幻の戯ダメージ計算で攻撃力と元素熟知を両方参照する", async () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: "10000122",
        stats: { atk: 1000, elementalMastery: 500, elementDamageBonus: 0, critRate: 0 }
    });

    const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
    const result = payload.results.find((item) => item.entry.id === "normal_1damage_2");
    assert.ok(result);
    assert.deepEqual(Array.from(result.breakdown.scalingParts, (part) => part.stat), ["atk", "elementalMastery"]);
    assert.equal(result.breakdown.scalingParts[0].baseDamage, 443.52);
    // The always-available passive adds 100 EM before the talent scaling is evaluated.
    assert.ok(Math.abs(result.breakdown.scalingParts[1].baseDamage - 532.224) < 1e-9);
});

test("固定値の元素熟知バフにはパーセント記号を付けない", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalcRenderer.js"]);
    const view = sandbox.GenshinCalcRenderer.buildDamageBreakdownViewModel({
        entry: { attackType: "skill", damageType: "skill", element: "草" },
        breakdown: {
            appliedModifiers: [{
                source: "talent:passive1",
                value: 72,
                modifier: { category: "statBonus", applyTo: ["elementalMastery"], unit: "flat" }
            }]
        }
    });

    assert.equal(view.buffs.effects[0].value, "+72.00");
    assert.doesNotMatch(view.buffs.effects[0].value, /%/);
});

test("UID武器の0始まりaffixMapをR1からR5へ変換する", () => {
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinProfileMapper.js"]);
    for (let affixRank = 0; affixRank <= 4; affixRank += 1) {
        const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
            playerInfo: { uid: "800000000" },
            avatarInfoList: [{
                avatarId: 10000122,
                propMap: { 4001: { val: "90" } },
                fightPropMap: {},
                equipList: [{
                    itemId: 14521,
                    weapon: { level: 90, affixMap: { 114521: affixRank } },
                    flat: { itemType: "ITEM_WEAPON", rankLevel: 5 }
                }]
            }]
        });
        assert.equal(mapped.characters[0].weapon.rank, affixRank + 1);
    }
});
