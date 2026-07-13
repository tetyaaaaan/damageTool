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
        weaponModifiers: readJson("games/genshin/data/calc/weapon-modifiers.json"),
        artifactSetModifiers: readJson("games/genshin/data/calc/artifact-set-modifiers.json"),
        constellationModifiers: readJson("games/genshin/data/calc/constellation-modifiers.json"),
        characters: readJson("games/genshin/data/characters.json"),
        weapons: readJson("games/genshin/data/weapons.json"),
        artifactSets: readJson("games/genshin/data/artifact-sets.json"),
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
