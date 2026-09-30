const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "games/js/genshinBaseStats.js"), "utf8");
const baseData = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/base-stats.json"), "utf8"));
const provisionalCharacters = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/candidates/7.0-provisional-characters.json"), "utf8"));

async function loadApi() {
    const sandbox = {
        console,
        fetch: async () => ({ ok: true, json: async () => baseData }),
        document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    await sandbox.GenshinBaseStats.ready;
    return sandbox.GenshinBaseStats;
}

async function loadApiWithProvisionalCharacters() {
    const sandbox = {
        console,
        fetch: async (url) => ({
            ok: true,
            json: async () => String(url).includes("7.0-provisional-characters") ? provisionalCharacters : baseData
        }),
        document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    await sandbox.GenshinBaseStats.ready;
    return sandbox.GenshinBaseStats;
}

test("level 90 character and weapon base stats resolve from local growth data", async () => {
    const api = await loadApi();
    const ayaka = api.resolveCharacter("10000002", 90);
    const mistsplitter = api.resolveWeapon("11509", 90);
    const member = api.resolveMember({ characterId: "10000002", weaponId: "11509", level: 90, weaponLevel: 90 });

    assert.equal(Math.round(ayaka.baseHp), 12858);
    assert.equal(Math.round(ayaka.characterBaseAtk), 342);
    assert.equal(Math.round(ayaka.baseDef), 784);
    assert.equal(Math.round(mistsplitter.weaponBaseAtk), 674);
    assert.equal(Math.round(member.baseAtk), 1016);
});

test("character growth supports level 100 while weapon level remains capped at 90", async () => {
    const api = await loadApi();
    assert.equal(api.resolveCharacter("10000002", 100).level, 100);
    assert.equal(api.resolveWeapon("11509", 100).level, 90);
});

test("7.0 provisional characters reuse every stored level and ascension checkpoint", async () => {
    const api = await loadApiWithProvisionalCharacters();
    const alyoshaLevel1 = api.resolveCharacter("10000148", 1, 0);
    const alyoshaLevel50Stage3 = api.resolveCharacter("10000148", 50, 3);
    const alyoshaLevel90 = api.resolveCharacter("10000148", 90, 6);

    assert.deepEqual(
        { hp: alyoshaLevel1.baseHp, atk: alyoshaLevel1.characterBaseAtk, def: alyoshaLevel1.baseDef },
        { hp: 2577, atk: 22.26, def: 58.94 }
    );
    assert.deepEqual(
        { hp: alyoshaLevel50Stage3.baseHp, atk: alyoshaLevel50Stage3.characterBaseAtk, def: alyoshaLevel50Stage3.baseDef },
        { hp: 7052, atk: 140.77, def: 372.74 }
    );
    assert.deepEqual(
        { hp: alyoshaLevel90.baseHp, atk: alyoshaLevel90.characterBaseAtk, def: alyoshaLevel90.baseDef },
        { hp: 11962, atk: 265.5, def: 703 }
    );

    const odetteLevel50Stage3 = api.resolveCharacter("10000150", 50, 3);
    const odetteLevel80Stage6 = api.resolveCharacter("10000150", 80, 6);
    const odetteLevel90 = api.resolveCharacter("10000150", 90, 6);
    assert.deepEqual(
        { hp: odetteLevel50Stage3.baseHp, atk: odetteLevel50Stage3.characterBaseAtk, def: odetteLevel50Stage3.baseDef },
        { hp: 7533, atk: 194.33, def: 456.73 }
    );
    assert.deepEqual(
        { hp: odetteLevel80Stage6.baseHp, atk: odetteLevel80Stage6.characterBaseAtk, def: odetteLevel80Stage6.baseDef },
        { hp: 12068, atk: 311.31, def: 731.68 }
    );
    assert.deepEqual(
        { hp: odetteLevel90.baseHp, atk: odetteLevel90.characterBaseAtk, def: odetteLevel90.baseDef },
        { hp: 12981, atk: 334.85, def: 787 }
    );
});
