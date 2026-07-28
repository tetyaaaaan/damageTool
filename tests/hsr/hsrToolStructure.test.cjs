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

test("HSR page follows the Genshin presentation and UID result contract", () => {
    const html = read("games/hsr/index.html");
    const importer = read("games/js/hsrUidImporter.js");
    [
        "ゲーム一覧",
        "Honkai: Star Rail",
        "崩壊：スターレイル ダメージ計算ツール",
        "使い方を見る",
        "入力エリア",
        "UIDから読み込む",
        "公開プロフィールを計算欄へ反映します。",
        "反映するキャラクター",
        "hsrProfileCharacterSelect",
        "hsrUidDetailsDialog"
    ].forEach((token) => assert.ok(html.includes(token), token));
    assert.doesNotMatch(html, /IDベースJSON|対応範囲を見る|保存先はこの端末内だけです|UIDから反映|ビルドと戦闘条件/);
    assert.match(importer, /この内容を入力欄へ反映/);
    assert.match(importer, /element\.dataset\.type = type/);
    assert.doesNotMatch(importer, /element\.dataset\.state = type/);
});

test("HSR selection supports kana search, multi-select filters, element icons and shared empty copy", () => {
    const source = read("games/js/hsrApp.js");
    assert.match(source, /normalizeSearchText/);
    assert.match(source, /CHARACTER_READINGS/);
    assert.match(source, /selectionFilters:\s*\{\s*element:\s*new Set\(\)/);
    assert.match(source, /条件に一致する候補がありません。フィルターを切り替えてください。/);
    assert.match(source, /CHARACTER/);
    ["Physical", "Fire", "Ice", "Thunder", "Wind", "Quantum", "Imaginary"].forEach((element) => {
        assert.ok(fs.existsSync(path.join(root, `games/images/hsr/elements/${element}.png`)), `${element} icon`);
    });
});

test("HSR detail text removes ruby controls and resolves game-data parameters", () => {
    const source = read("games/js/hsrUidImporter.js");
    assert.match(source, /RUBY_B/);
    assert.match(source, /RUBY_E/);
    assert.match(source, /#\(\\d\+\)/);
    assert.match(source, /formatGameText/);
});

test("HSR profile mapper normalizes Enka equipment, relic, trace and set properties", () => {
    const source = read("games/js/hsrProfileMapper.js"); const window = {}; vm.runInNewContext(source, { window, Math });
    const catalog = {
        characters: [{
            id: "1407", name: "Sample", elementName: "炎", pathName: "記憶", image: "/character.webp",
            base: { hp: 1000, atk: 500, def: 400, speed: 100 },
            skills: [{ id: "1407001", name: "通常攻撃", type: "Normal", params: Array(6).fill([]) }],
            traces: [{ id: "1407201", name: "会心率強化", maxLevel: 1, levels: [{ properties: [{ type: "CriticalChanceBase", value: 0.04 }] }] }]
        }],
        lightCones: [{ id: "23001", name: "Sample Cone", image: "/cone.webp", effect: { propertiesByRank: [[{ type: "CriticalDamageBase", value: 0.36 }]] } }],
        relicSets: [{ id: "124", name: "Sample Set", image: "/set.webp", effects: [{ pieces: 2, properties: [{ type: "AttackAddedRatio", value: 0.12 }] }] }]
    };
    const profile = window.HsrProfileMapper.mapProfileResponse({
        _tetinetProvider: "enka", uid: "802980865",
        detailInfo: { uid: 802980865, nickname: "Tester", level: 70, avatarDetailList: [{
            avatarId: 1407, level: 80, rank: 2,
            equipment: { tid: 23001, level: 80, rank: 1, _flat: { props: [{ type: "BaseHP", value: 100 }, { type: "BaseAttack", value: 200 }, { type: "BaseDefence", value: 100 }] } },
            skillTreeList: [{ pointId: 1407001, level: 6 }, { pointId: 1407201, level: 1 }],
            relicList: [
                { tid: 1, level: 15, _flat: { setID: 124, props: [{ type: "HPAddedRatio", value: 0.1 }, { type: "HPDelta", value: 100 }, { type: "AttackAddedRatio", value: 0.2 }] } },
                { tid: 2, level: 15, _flat: { setID: 124, props: [{ type: "FireAddedRatio", value: 0.388 }, { type: "CriticalDamage", value: 0.1 }, { type: "SpeedDelta", value: 5 }] } }
            ]
        }] }
    }, catalog);
    const character = profile.characters[0];
    assert.equal(profile.provider, "Enka.Network"); assert.equal(profile.player.uid, "802980865"); assert.equal(profile.characters.length, 1);
    assert.ok(Math.abs(character.stats.hp - 1310) < 1e-9); assert.ok(Math.abs(character.stats.atk - 924) < 1e-9); assert.equal(character.stats.def, 500);
    assert.equal(character.stats.speed, 105); assert.equal(character.stats.critRate, 9); assert.equal(character.stats.critDamage, 96); assert.ok(Math.abs(character.stats.damageBonus - 38.8) < 1e-9);
    assert.equal(character.lightCone.id, "23001"); assert.equal(character.relicSets[0].id, "124"); assert.equal(character.relicSets[0].pieces, 2);
    assert.equal(character.traces.find((item) => item.type === "Normal").level, 6);
});

test("HSR profile API implementations use Enka without a MiHoMo runtime dependency", () => {
    [read("worker.js"), read("local-server.cjs")].forEach((source) => {
        assert.match(source, /enka\.network\/api\/hsr\/uid/);
        assert.match(source, /_tetinetProvider:\s*"enka"/);
        assert.doesNotMatch(source, /api\.mihomo\.me|sr_info_parsed/);
    });
    const client = read("games/js/hsrProfileApi.js");
    assert.match(client, /enka\.network\/api\/hsr\/uid/);
    assert.doesNotMatch(client, /api\.mihomo\.me|sr_info_parsed/);
});
