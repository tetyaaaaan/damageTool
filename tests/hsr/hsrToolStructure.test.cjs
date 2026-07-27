const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("HSR page loads the data, engine, tool, and UID importer in dependency order", () => {
    const html = read("games/hsr/index.html");
    const paths = ["hsrProfileApi.js", "hsrProfileMapper.js", "uidStorage.js", "hsrCalcData.js", "hsrCalcEngine.js", "hsrTool.js", "hsrUidImporter.js"];
    paths.reduce((previous, name) => {
        const index = html.indexOf(name);
        assert.ok(index > previous, `${name} must follow its dependency`);
        return index;
    }, -1);
});

test("HSR tool exposes editable build, party, enemy, breakdown, and future-simulation boundaries", () => {
    const source = read("games/js/hsrTool.js");
    ["hsrCharacterSelect", "hsrConeSelect", "hsrRelicSelect", "hsrOrnamentSelect", "hsrPartyRows", "hsrEnemyLevel", "hsrResults", "hsrDirtyNotice", "hsrActionWindow", "将来の戦闘シミュレーション"].forEach((token) => assert.ok(source.includes(token), token));
    assert.ok(source.includes("HsrTool.applyProfileCharacter") || source.includes("applyProfileCharacter"));
});

test("HSR CSV data loader preserves existing data as display/manual-selection data", async () => {
    const source = read("games/js/hsrCalcData.js");
    const files = {
        "/games/data/hsr/data_hsr_cha.csv": read("games/data/hsr/data_hsr_cha.csv"),
        "/games/data/hsr/data_hsr_weapon.csv": read("games/data/hsr/data_hsr_weapon.csv"),
        "/games/data/hsr/data_hsr_artifact.csv": read("games/data/hsr/data_hsr_artifact.csv"),
        "/games/data/hsr/data_hsr_baseBreakDMG.csv": read("games/data/hsr/data_hsr_baseBreakDMG.csv")
    };
    const window = {};
    vm.runInNewContext(source, { window, fetch: async (url) => ({ ok: true, text: async () => files[url] }) });
    const data = await window.HsrCalcData.load();
    assert.equal(data.characters.length, 52);
    assert.equal(data.lightCones.length, 18);
    assert.equal(data.relics.length, 24);
    assert.ok(data.breakBaseDamage[80] > 0);
    assert.match(data.provenance.limitations, /未検証/);
});

test("HSR profile mapper does not need to guess missing public-profile values", () => {
    const source = read("games/js/hsrProfileMapper.js");
    const window = {};
    vm.runInNewContext(source, { window, Math });
    const profile = window.HsrProfileMapper.mapProfileResponse({ player: { nickname: "Tester", level: 70, uid: "800000000" }, characters: [{ id: "1001", name: "Sample", level: 80, rank: 2, element: { name: "Fire" }, path: { name: "Destruction" }, properties: [{ field: "atk", value: 1200 }, { field: "crit_rate", value: 0.5 }, { field: "crit_dmg", value: 1.2 }, { field: "effect_hit", value: 0.4 }, { field: "effect_res", value: 0.3 }], light_cone: { id: "2001", name: "Cone", level: 80, rank: 1 }, relics: [], skills: [] }] });
    assert.equal(profile.characters[0].stats.atk, 1200);
    assert.equal(profile.characters[0].stats.critRate, 50);
    assert.equal(profile.characters[0].stats.effectHitRate, 40);
    assert.equal(profile.characters[0].lightCone.id, "2001");
});
