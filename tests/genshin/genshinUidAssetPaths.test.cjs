"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));

async function createResolverHarness() {
    const sandbox = { console, Date };
    sandbox.window = sandbox;
    sandbox.fetch = async (url) => {
        const relativePath = String(url).replace(/^\//, "");
        const absolutePath = path.join(repositoryRoot, relativePath);
        return {
            ok: fs.existsSync(absolutePath),
            async json() { return JSON.parse(fs.readFileSync(absolutePath, "utf8")); }
        };
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(repositoryRoot, "games/js/genshinIdResolver.js"), "utf8"), sandbox);
    await sandbox.GenshinIdResolver.ready;
    vm.runInContext(fs.readFileSync(path.join(repositoryRoot, "games/js/genshinProfileMapper.js"), "utf8"), sandbox);
    return sandbox;
}

test("UID profile resolves character, weapon, and artifact images through resolver metadata", async () => {
    const sandbox = await createResolverHarness();
    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: [{
            avatarId: "10000148",
            propMap: { 4001: { val: 90 } },
            fightPropMap: {},
            equipList: [
                { itemId: "11520", weapon: { level: 90, affixMap: { 11520: 0 } }, flat: { itemType: "ITEM_WEAPON", rankLevel: 5 } },
                { itemId: "72001", reliquary: { level: 20 }, flat: { itemType: "ITEM_RELIQUARY", setId: "15042", equipType: "EQUIP_BRACER" } },
                { itemId: "72002", reliquary: { level: 20 }, flat: { itemType: "ITEM_RELIQUARY", setId: "15042", equipType: "EQUIP_DRESS" } }
            ]
        }]
    }).characters[0];

    assert.equal(mapped.imagePath, "/games/images/genshin/characters/10000148.webp");
    assert.equal(mapped.weapon.imagePath, "/games/images/genshin/weapons/11520.webp");
    assert.equal(mapped.artifacts[0].imagePath, "/games/images/genshin/artifacts/15042.webp");
    for (const relativePath of [
        "games/images/genshin/characters/10000148.webp",
        "games/images/genshin/weapons/11520.webp",
        "games/images/genshin/artifacts/15042.webp"
    ]) assert.equal(fs.existsSync(path.join(repositoryRoot, relativePath)), true, relativePath);
    assert.equal(sandbox.GenshinIdResolver.resolveCharacterImagePath("10000037"), "/games/images/genshin/characters/10000037.webp");
    assert.equal(sandbox.GenshinIdResolver.resolveWeaponImagePath("11501"), "/games/images/genshin/weapons/11501.webp");
});

test("Cryo Traveler UID aliases resolve through the saved skillDepotId rows and retain raw-ID image paths", async () => {
    const sandbox = await createResolverHarness();
    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: ["10000005", "10000007"].map((avatarId) => ({
            avatarId,
            skillDepotId: avatarId === "10000005" ? 505 : 705,
            propMap: { 4001: { val: 90 } },
            fightPropMap: {},
            equipList: []
        }))
    }).characters;

    assert.deepEqual(mapped.map((character) => character.id), ["10000005_cryo", "10000007_cryo"]);
    assert.deepEqual(mapped.map((character) => character.element), ["氷", "氷"]);
    assert.deepEqual(mapped.map((character) => character.imagePath), [
        "/games/images/genshin/characters/10000005.webp",
        "/games/images/genshin/characters/10000007.webp"
    ]);
    assert.deepEqual(mapped.map((character) => character.provenance.rawCharacterId), ["10000005", "10000007"]);
    assert.ok(sandbox.GenshinIdResolver.listCharacters().some((entry) => entry.id === "10000005_cryo" && entry.skillDepotId === 505));
});

test("UID importer consumes mapped image paths instead of constructing item URLs", () => {
    const importer = fs.readFileSync(path.join(repositoryRoot, "games/js/genshinUidImporter.js"), "utf8");
    assert.match(importer, /const characterImage = character\.imagePath \|\|/);
    assert.match(importer, /const weaponImage = weapon\?\.imagePath \|\|/);
    assert.match(importer, /\.find\(\(artifact\).*?\)\?\.imagePath \|\|/);
    assert.doesNotMatch(importer, /\/games\/images\/genshin\/(?:characters|weapons|artifacts)\/\$\{encodeURIComponent\(/);
});

test("7.1 numeric talents use saved character mappings and add proud levels once", async () => {
    const sandbox = await createResolverHarness();
    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({ avatarInfoList: [{
        avatarId: "10000140", skillDepotId: 14001,
        skillLevelMap: { "11405": 7, "11401": 9, "11402": 8 },
        proudSkillExtraLevelMap: { "14039": 3 }, equipList: [], fightPropMap: {}
    }] }).characters[0];
    assert.deepEqual(JSON.parse(JSON.stringify(mapped.talents)), { normal: 9, skill: 8, burst: 10 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "resolved");
    const order = readJson("games/genshin/data/character-release-order.json").order;
    assert.equal(new Set(order).size, order.length);
    assert.ok(sandbox.GenshinIdResolver.listCharacters().every(character => order.includes(character.id)));
    assert.deepEqual(order.slice(-6), ["10000148", "10000150", "10000143", "10000140", "10000005_cryo", "10000007_cryo"]);
});

test("all character selectors share explicit implementation order independent of inventory input order", async () => {
    const sandbox = await createResolverHarness();
    const resolver = sandbox.GenshinIdResolver;
    const order = readJson("games/genshin/data/character-release-order.json").order;
    const characters = Array.from(resolver.listCharacters());
    const ids = characters.map(character => character.id);
    assert.deepEqual(ids, order.filter(id => ids.includes(id)));
    assert.deepEqual(Array.from(resolver.sortCharacters([...characters].reverse()), character => character.id), ids);
    const travelers = resolver.sortCharacters(characters.filter(character => character.id.startsWith("10000005") || character.id.startsWith("10000007")));
    assert.deepEqual(Array.from(travelers, character => character.id), ["10000005", "10000007", "10000005_cryo", "10000007_cryo"]);
});
