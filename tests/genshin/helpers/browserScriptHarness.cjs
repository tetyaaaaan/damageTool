const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repositoryRoot = path.resolve(__dirname, "..", "..", "..");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function createBrowserScriptHarness(scriptPaths, elements = {}) {
    const sandbox = {
        console,
        document: {
            addEventListener() {},
            getElementById(id) {
                return elements[id] || null;
            },
            querySelectorAll(selector) {
                if (selector === "[data-genshin-resource-key]") {
                    return Object.values(elements).filter((element) => element.dataset?.genshinResourceKey);
                }
                if (selector === "[data-genshin-condition-key]") {
                    return Object.values(elements).filter((element) => element.dataset?.genshinConditionKey);
                }
                if (selector === "[data-genshin-toggle-key]") {
                    return Object.values(elements).filter((element) => element.dataset?.genshinToggleKey);
                }
                return [];
            }
        }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    scriptPaths.forEach((relativePath) => {
        const absolutePath = path.join(repositoryRoot, relativePath);
        vm.runInContext(fs.readFileSync(absolutePath, "utf8"), sandbox, { filename: absolutePath });
    });
    return { sandbox, elements };
}

function loadCalcData() {
    return {
        talentScalings: readJson("games/genshin/data/calc/talent-scalings.json"),
        talentModifiers: readJson("games/genshin/data/calc/talent-modifiers.json"),
        talentEffectRegistry: readJson("games/genshin/data/calc/talent-effect-registry.json"),
        weaponModifiers: readJson("games/genshin/data/calc/weapon-modifiers.json"),
        weaponEffectRegistry: readJson("games/genshin/data/calc/weapon-effect-registry.json"),
        artifactSetModifiers: readJson("games/genshin/data/calc/artifact-set-modifiers.json"),
        constellationModifiers: readJson("games/genshin/data/calc/constellation-modifiers.json"),
        constellationEffectRegistry: readJson("games/genshin/data/calc/constellation-effect-registry.json"),
        attackModeRules: readJson("games/genshin/data/calc/attack-mode-rules.json"),
        reactionDefinitions: readJson("games/genshin/data/calc/reaction-definitions.json"),
        characters: readJson("games/genshin/data/characters.json"),
        weapons: readJson("games/genshin/data/weapons.json"),
        artifactSets: readJson("games/genshin/data/artifact-sets.json"),
        characterTalents: readJson("games/genshin/data/character-talents.json"),
        warnings: []
    };
}

function setElement(elements, id, value, checked = false) {
    elements[id] = { value: String(value), checked };
}

function setResourceElement(elements, key, value) {
    elements[`resource:${key}`] = {
        value: String(value),
        checked: false,
        dataset: { genshinResourceKey: key }
    };
}

function setConditionElement(elements, key, kind, value) {
    elements[`condition:${key}:${kind}`] = {
        value: String(value),
        checked: false,
        dataset: { genshinConditionKey: key, genshinConditionKind: kind }
    };
}

module.exports = {
    createBrowserScriptHarness,
    loadCalcData,
    readJson,
    repositoryRoot,
    setElement,
    setConditionElement,
    setResourceElement
};
