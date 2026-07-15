"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement,
    setResourceElement
} = require("../tests/genshin/helpers/calcScenarioHarness.cjs");

const round = (value) => Math.round(Number(value) * 1e6) / 1e6;

function resultSummary(result) {
    return {
        id: result.entry.id,
        effectId: result.entry.effectId || "",
        attackType: result.entry.attackType,
        nonCrit: round(result.nonCrit),
        crit: round(result.crit),
        additiveBaseDamage: round(result.breakdown.additiveBaseDamage),
        damageBonus: round(result.breakdown.damageBonus),
        finalDamageMultiplier: round(result.breakdown.finalDamageMultiplier)
    };
}

async function buildGoldenScenarios() {
    const golden = {};

    {
        const { sandbox, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000002", constellation: 0 });
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        golden.ayakaBaseline = resultSummary(payload.results.find((result) => result.entry.id === "normal_1damage"));
    }

    {
        const { sandbox, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000075", constellation: 6 });
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        golden.wandererRepeatedAttack = payload.results
            .filter((result) => result.entry.effectId === "c_10000075_6_1")
            .slice(0, 2)
            .map(resultSummary);
    }

    {
        const { sandbox, elements, calcData } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000038", constellation: 2 });
        const generator = calcData.constellationModifiers["10000038"].constellations["2"]
            .find((item) => item.category === "resourceGeneratedEffect");
        const key = sandbox.GenshinModifierAnalyzer.resourceStateKey(generator, "constellation:C2", { characterId: "10000038" });
        setResourceElement(elements, key, 3);
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        golden.albedoResourceBurst = resultSummary(payload.results.find((result) => result.entry.attackType === "burst"));
    }

    {
        const { sandbox, elements, calcData } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000088", constellation: 2 });
        const modifier = calcData.constellationModifiers["10000088"].constellations["2"]
            .find((item) => item.id === "c_10000088_2_1_resolved_1");
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "constellation:C2");
        setConditionElement(elements, key, "targetCount", 3);
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
        golden.charlotteTargetCount = { atkBonus: round(normal.breakdown.statBonus.atk), result: resultSummary(normal) };
    }

    {
        const { sandbox, elements, calcData } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000089", constellation: 2 });
        const modifier = calcData.constellationModifiers["10000089"].constellations["2"]
            .find((item) => item.id === "c_10000089_2_1_resolved_2");
        const key = sandbox.GenshinModifierAnalyzer.modifierStateKey(modifier, "constellation:C2");
        setConditionElement(elements, key, "stack", 100);
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
        golden.furinaOverflowFanfare = { hpBonus: round(normal.breakdown.statBonus.hp), result: resultSummary(normal) };
    }

    {
        const { sandbox, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000082", constellation: 2 });
        setElement(elements, "genshinAtkInput", 2000);
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        golden.baizhuExtraDamage = resultSummary(payload.results.find((result) => result.entry.effectId === "c_10000082_2_1_resolved_1"));
    }

    {
        const { sandbox, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000037", weaponId: "15502" });
        setElement(elements, "genshinJsonAmosStack", 5);
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        const charged = payload.results.find((result) => result.entry.id === "damage");
        golden.ganyuAmosFiveStacks = {
            amosBonuses: charged.breakdown.appliedModifiers
                .filter((item) => item.source === "weapon:15502")
                .map((item) => ({ id: item.modifier.id, value: round(item.value) })),
            result: resultSummary(charged)
        };
    }

    {
        const { sandbox, elements } = createScenarioHarness();
        prepareScenarioInputs(elements, { characterId: "10000070", constellation: 6, stats: { hp: 60000 } });
        const payload = await sandbox.GenshinCalcEngine.runGenshinJsonCalc();
        const normal = payload.results.find((result) => result.entry.attackType === "normalAttack");
        golden.nilouThresholdCrit = {
            critRate: round(normal.breakdown.critRate),
            critDamage: round(normal.breakdown.critDamage),
            result: resultSummary(normal)
        };
    }

    return golden;
}

async function writeGolden() {
    const golden = await buildGoldenScenarios();
    const target = path.resolve(__dirname, "..", "tests", "genshin", "fixtures", "golden-scenarios.json");
    fs.writeFileSync(target, `${JSON.stringify(golden, null, 2)}\n`);
    return golden;
}

if (require.main === module) {
    writeGolden().then((golden) => console.log(JSON.stringify(golden, null, 2))).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { buildGoldenScenarios, resultSummary, writeGolden };
