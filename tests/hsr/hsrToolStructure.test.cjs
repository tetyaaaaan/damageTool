const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("HSR page loads the data, engine, tool, and UID importer in dependency order", () => {
    const html = read("games/hsr/index.html");
    const paths = ["hsrProfileApi.js", "hsrProfileMapper.js", "uidStorage.js", "hsrCalcData.js", "hsrCalcEngine.js", "hsrApp.js", "hsrUidImporter.js"];
    paths.reduce((previous, name) => {
        const index = html.indexOf(name);
        assert.ok(index > previous, `${name} must follow its dependency`);
        return index;
    }, -1);
});

test("HSR tool exposes editable build, party, enemy, breakdown, and future-simulation boundaries", () => {
    const source = read("games/js/hsrApp.js");
    const html = read("games/hsr/index.html");
    ["hsrCharacterTrigger", "hsrConeTrigger", "hsrRelicTrigger", "hsrRelicMode", "hsrRelicSecondTrigger", "hsrOrnamentTrigger", "hsrPartyRows", "hsrEnemyLevel", "hsrResults", "hsrDirtyNotice", "hsrActionWindow"].forEach((token) => assert.ok(source.includes(token) || html.includes(token), token));
    assert.match(html, /戦闘シミュレーション/);
    assert.ok(source.includes("HsrTool.applyProfileCharacter") || source.includes("applyProfileCharacter"));
});

test("HSR runtime uses the ID-based JSON catalog without CSV references", async () => {
    const source = read("games/js/hsrCalcData.js");
    assert.doesNotMatch(source, /\.csv|data_hsr|legacy-/);
    const files = { "/games/hsr/data/catalog.json": JSON.parse(read("games/hsr/data/catalog.json")), "/games/hsr/data/attacks.json": JSON.parse(read("games/hsr/data/attacks.json")), "/games/hsr/data/modifiers.json": JSON.parse(read("games/hsr/data/modifiers.json")) };
    const window = {};
    vm.runInNewContext(source, { window, Object, fetch: async (url) => ({ ok: true, json: async () => files[url] }) });
    const data = await window.HsrCalcData.load();
    assert.ok(data.characters.length >= 90);
    assert.ok(data.lightCones.length >= 150);
    assert.ok(data.relicSets.length >= 50);
    assert.ok(data.modifiers.length >= 5);
    assert.ok(data.characters.every((item) => item.skills.length && item.traces.length && item.eidolons.length === 6));
    assert.ok(data.lightCones.every((item) => item.effect && item.effect.paramsByRank.length === 5));
    assert.ok(data.characters.every((item) => /^\d+$/.test(item.id)));
    assert.ok(data.breakBaseDamage[80] > 0);
    assert.ok(data.sources.some((item) => item.license.includes("AGPL-3.0")));
});

test("HSR production page has image selection, party and condition dialogs", () => {
    const html = read("games/hsr/index.html");
    ["hsrSelectionDialog", "hsrSelectionSearch", "hsrSelectionSearchClear", "hsrSelectionFilters", "hsrSelectionSummary", "hsrEnemyTrigger", "hsrPartyDialog", "hsrConditionDialog", "loading=\"lazy\""].forEach((token) => assert.ok(html.includes(token), token));
    assert.doesNotMatch(html, /data_hsr_|hsr_charaList|hsr_selectArtifactList|hsr_dmgCalc/);
});

test("HSR profile mapper does not need to guess missing public-profile values", () => {
    const source = read("games/js/hsrProfileMapper.js");
    const window = {};
    vm.runInNewContext(source, { window, Math });
    const profile = window.HsrProfileMapper.mapProfileResponse({ player: { nickname: "Tester", level: 70, uid: "800000000" }, characters: [{ id: "1001", name: "Sample", level: 80, rank: 2, element: { name: "Fire" }, path: { name: "Destruction" }, properties: [{ field: "atk", value: 1200 }, { field: "crit_rate", value: 0.5 }, { field: "crit_dmg", value: 1.2 }, { field: "effect_hit", value: 0.4 }, { field: "effect_res", value: 0.3 }, { field: "fire_dmg", value: 0.388 }], light_cone: { id: "2001", name: "Cone", level: 80, rank: 1 }, relics: [], relic_sets: [{ id: "101", name: "Tunnel", num: 4 }, { id: "301", name: "Planar", num: 2 }], skills: [{ id: "100101", name: "Normal", type: "Normal", level: 6 }] }] });
    assert.equal(profile.characters[0].stats.atk, 1200);
    assert.equal(profile.characters[0].stats.critRate, 50);
    assert.equal(profile.characters[0].stats.effectHitRate, 40);
    assert.ok(Math.abs(profile.characters[0].stats.damageBonus - 38.8) < 1e-9);
    assert.equal(profile.characters[0].lightCone.id, "2001");
    assert.equal(profile.characters[0].relicSets[0].id, "101");
    assert.equal(profile.characters[0].traces[0].type, "Normal");
});

test("HSR profile mapper combines MiHoMo V2 attributes and additions without treating raw properties as totals", () => {
    const source = read("games/js/hsrProfileMapper.js"); const window = {}; vm.runInNewContext(source, { window, Math });
    const profile = window.HsrProfileMapper.mapProfileResponse({ player: { uid: "800333171" }, characters: [{ id: "1413", name: "Sample", attributes: [{ field: "hp", value: 1000 }, { field: "atk", value: 500 }, { field: "def", value: 400 }, { field: "spd", value: 100 }, { field: "crit_rate", value: 0.05 }, { field: "crit_dmg", value: 0.5 }], additions: [{ field: "hp", value: 200 }, { field: "atk", value: 50 }, { field: "def", value: 40 }, { field: "spd", value: 5 }, { field: "crit_rate", value: 0.2 }, { field: "crit_dmg", value: 0.8 }], properties: [{ type: "AttackAddedRatio", field: "atk", value: 0.4, percent: true }], relic_sets: [{ id: "127", name: "Set", num: 2 }, { id: "127", name: "Set", num: 4 }], skills: [] }] });
    const character = profile.characters[0];
    assert.equal(character.stats.hp, 1200); assert.equal(character.stats.atk, 550); assert.equal(character.stats.def, 440); assert.equal(character.stats.speed, 105);
    assert.equal(character.stats.critRate, 25); assert.equal(character.stats.critDamage, 130);
    assert.equal(character.stats.energyRegen, 100);
    assert.equal(character.relicSets.length, 1); assert.equal(character.relicSets[0].pieces, 4);
});
