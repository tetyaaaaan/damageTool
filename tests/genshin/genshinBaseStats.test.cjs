const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const source = fs.readFileSync(path.join(root, "games/js/genshinBaseStats.js"), "utf8");
const baseData = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/base-stats.json"), "utf8"));

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
