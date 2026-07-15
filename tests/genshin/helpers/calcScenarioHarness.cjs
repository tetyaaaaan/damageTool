const {
    createBrowserScriptHarness,
    loadCalcData,
    setConditionElement,
    setElement,
    setResourceElement
} = require("./browserScriptHarness.cjs");

function createScenarioHarness() {
    const harness = createBrowserScriptHarness([
        "games/js/genshinModifierAnalyzer.js",
        "games/js/genshinCalcConditions.js",
        "games/js/genshinCalcEngine.js"
    ]);
    const calcData = loadCalcData();
    harness.sandbox.GenshinCalcData = { loadGenshinCalcData: async () => calcData };
    return { ...harness, calcData };
}

function prepareScenarioInputs(elements, { characterId, constellation = 0, weaponId = "", stats = {} }) {
    Object.keys(elements).forEach((key) => delete elements[key]);
    const values = {
        genshinCalcCharacterId: characterId,
        genshinCalcWeaponId: weaponId,
        genshinReflectCharacter: "golden",
        genshinReflectConstellation: `C${constellation}`,
        genshinJsonConstellationLevel: `C${constellation}`,
        genshinReflectLevel: 90,
        genshinWeaponRefinement: "R1",
        genshinNormalTalentLevel: 10,
        genshinSkillTalentLevel: 10,
        genshinBurstTalentLevel: 10,
        genshinHpInput: stats.hp ?? 20000,
        genshinAtkInput: stats.atk ?? 2000,
        genshinDefInput: stats.def ?? 1000,
        genshinElementalMasteryInput: stats.elementalMastery ?? 100,
        genshinCritRateInput: stats.critRate ?? 50,
        genshinCritDamageInput: stats.critDamage ?? 100,
        genshinEnergyRechargeInput: stats.energyRecharge ?? 100,
        genshinElementalDamageInput: stats.elementDamageBonus ?? 50,
        genshinEnemyLevelInput: 90,
        genshinEnemyElementalResistanceInput: 10,
        genshinEnemyPhysicalResistanceInput: 10,
        genshinElementalResistanceDebuffInput: 0,
        genshinPhysicalResistanceDebuffInput: 0,
        genshinDefenseReductionInput: 0,
        genshinDefenseIgnoreInput: 0,
        genshinJsonReactionOption: "none"
    };
    Object.entries(values).forEach(([id, value]) => setElement(elements, id, value));
    setElement(elements, "genshinJsonEnableCharacterCondition", "", true);
    setElement(elements, "genshinJsonEnableWeaponLowHpCondition", "", true);
    [1, 2, 4, 6].forEach((level) => {
        setElement(elements, `genshinJsonEnableConstellationC${level}`, "", level <= constellation);
    });
}

module.exports = {
    createScenarioHarness,
    prepareScenarioInputs,
    setConditionElement,
    setElement,
    setResourceElement
};
