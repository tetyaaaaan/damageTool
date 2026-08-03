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

test("HSR tool exposes editable build, party, enemy, breakdown, and action-value boundaries", () => {
    const source = read("games/js/hsrApp.js");
    const html = read("games/hsr/index.html");
    ["hsrCharacterTrigger", "hsrConeTrigger", "hsrRelicTrigger", "hsrRelicMode", "hsrRelicSecondTrigger", "hsrOrnamentTrigger", "hsrPartyRows", "hsrEnemyLevel", "hsrResults", "hsrDirtyNotice", "hsrActionWindow"].forEach((token) => assert.ok(source.includes(token) || html.includes(token), token));
    assert.doesNotMatch(html, /戦闘シミュレーション.*未実装/);
    assert.ok(source.includes("HsrTool.applyProfileCharacter") || source.includes("applyProfileCharacter"));
});

test("HSR runtime uses the ID-based JSON catalog without CSV references", async () => {
    const source = read("games/js/hsrCalcData.js");
    assert.doesNotMatch(source, /\.csv|data_hsr|legacy-/);
    const files = {
        "/games/hsr/data/catalog.json": JSON.parse(read("games/hsr/data/catalog.json")),
        "/games/hsr/data/attacks.json": JSON.parse(read("games/hsr/data/attacks.json")),
        "/games/hsr/data/attacks.generated.json": JSON.parse(read("games/hsr/data/attacks.generated.json")),
        "/games/hsr/data/attack-overrides.json": JSON.parse(read("games/hsr/data/attack-overrides.json")),
        "/games/hsr/data/modifiers.json": JSON.parse(read("games/hsr/data/modifiers.json"))
        ,"/games/hsr/data/calc/modifiers.json": JSON.parse(read("games/hsr/data/calc/modifiers.json"))
        ,"/games/hsr/data/calc/modifiers-character-expanded.json": JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json"))
        ,"/games/hsr/data/calc/modifiers-light-cones.json": JSON.parse(read("games/hsr/data/calc/modifiers-light-cones.json"))
        ,"/games/hsr/data/calc/modifiers-relics-ornaments.json": JSON.parse(read("games/hsr/data/calc/modifiers-relics-ornaments.json"))
        ,"/games/hsr/data/calc/modifiers-bronya-ruanmei.json": JSON.parse(read("games/hsr/data/calc/modifiers-bronya-ruanmei.json"))
        ,"/games/hsr/data/calc/modifiers-harmony-party.json": JSON.parse(read("games/hsr/data/calc/modifiers-harmony-party.json"))
        ,"/games/hsr/data/calc/modifiers-serval.json": JSON.parse(read("games/hsr/data/calc/modifiers-serval.json"))
        ,"/games/hsr/data/calc/modifiers-gepard.json": JSON.parse(read("games/hsr/data/calc/modifiers-gepard.json"))
        ,"/games/hsr/data/calc/modifiers-natasha.json": JSON.parse(read("games/hsr/data/calc/modifiers-natasha.json"))
        ,"/games/hsr/data/calc/modifiers-pela.json": JSON.parse(read("games/hsr/data/calc/modifiers-pela.json"))
        ,"/games/hsr/data/calc/modifiers-clara.json": JSON.parse(read("games/hsr/data/calc/modifiers-clara.json"))
        ,"/games/hsr/data/calc/modifiers-sampo.json": JSON.parse(read("games/hsr/data/calc/modifiers-sampo.json"))
        ,"/games/hsr/data/calc/modifiers-hook.json": JSON.parse(read("games/hsr/data/calc/modifiers-hook.json"))
        ,"/games/hsr/data/calc/modifiers-lynx.json": JSON.parse(read("games/hsr/data/calc/modifiers-lynx.json"))
        ,"/games/hsr/data/calc/modifiers-luka.json": JSON.parse(read("games/hsr/data/calc/modifiers-luka.json"))
        ,"/games/hsr/data/calc/modifiers-topaz.json": JSON.parse(read("games/hsr/data/calc/modifiers-topaz.json"))
        ,"/games/hsr/data/calc/modifiers-qingque.json": JSON.parse(read("games/hsr/data/calc/modifiers-qingque.json"))
        ,"/games/hsr/data/calc/modifiers-tingyun.json": JSON.parse(read("games/hsr/data/calc/modifiers-tingyun.json"))
        ,"/games/hsr/data/calc/modifiers-luocha.json": JSON.parse(read("games/hsr/data/calc/modifiers-luocha.json"))
        ,"/games/hsr/data/calc/modifiers-jingyuan.json": JSON.parse(read("games/hsr/data/calc/modifiers-jingyuan.json"))
        ,"/games/hsr/data/calc/modifiers-blade.json": JSON.parse(read("games/hsr/data/calc/modifiers-blade.json"))
        ,"/games/hsr/data/calc/special-break-attacks.json": JSON.parse(read("games/hsr/data/calc/special-break-attacks.json"))
    };
    const dataFiles = JSON.parse(read("games/hsr/data/calc/data-files.json"));
    files["/games/hsr/data/calc/data-files.json"] = dataFiles;
    dataFiles.modifiers.forEach((name) => { files[`/games/hsr/data/calc/${name}`] = JSON.parse(read(`games/hsr/data/calc/${name}`)); });
    dataFiles.attackOverrides.forEach((name) => {
        const url = name.startsWith("/") ? name : `/games/hsr/data/calc/${name}`;
        files[url] = JSON.parse(read(url.replace(/^\/games\//, "games/")));
    });
    const window = {};
    vm.runInNewContext(source, { window, Object, fetch: async (url) => ({ ok: true, json: async () => files[url] }) });
    const data = await window.HsrCalcData.load();
    assert.ok(data.characters.length >= 90);
    assert.ok(data.lightCones.length >= 150);
    assert.ok(data.relicSets.length >= 50);
    assert.ok(data.modifiers.length >= 5);
    assert.ok(data.structuredModifiers.length >= 95);
    assert.ok(data.attacks.length >= 300);
    assert.equal(data.specialBreakAttacks.length, 2);
    assert.equal(data.attackCoverage.total, data.attacks.length);
    assert.ok(data.attackCoverage.calculable >= 10);
    assert.ok(data.attackCoverage.review > data.attackCoverage.calculable);
    assert.ok(data.attacks.every((item) => item.support && typeof item.support.verified === "boolean"));
    assert.ok(data.characters.every((item) => item.skills.length && item.traces.length && item.eidolons.length === 6));
    assert.ok(data.lightCones.every((item) => item.effect && item.effect.paramsByRank.length === 5));
    assert.ok(data.characters.every((item) => /^\d+$/.test(item.id)));
    assert.ok(data.breakBaseDamage[80] > 0);
    assert.ok(data.sources.some((item) => item.license.includes("AGPL-3.0")));
});

test("HSR attack data is generated, overrideable, and the page calculates every listed attack", () => {
    const manifest = JSON.parse(read("games/hsr/data/attacks.json"));
    const generated = JSON.parse(read("games/hsr/data/attacks.generated.json"));
    const overrides = JSON.parse(read("games/hsr/data/attack-overrides.json"));
    const html = read("games/hsr/index.html");
    const source = read("games/js/hsrApp.js");
    assert.equal(manifest.schemaVersion, 2);
    assert.equal(manifest.generated, "attacks.generated.json");
    assert.equal(manifest.overrides, "attack-overrides.json");
    assert.ok(JSON.parse(read("games/hsr/data/calc/data-files.json")).modifiers.length >= 30);
    assert.ok(generated.attacks.length >= 300);
    assert.ok(overrides.overrides.length >= 10);
    assert.deepEqual(generated.support, {
        status: "review",
        verified: false,
        reason: "説明文の構造から自動抽出した候補です。個別検証が完了するまでは参考値として扱います。"
    });
    assert.equal(overrides.support.status, "calculable");
    assert.equal(overrides.support.verified, true);
    assert.doesNotMatch(html, /id="hsrAttackSelect"|id="hsrManualMultiplier"|敵・攻撃設定/);
    assert.match(source, /function availableAttacks\(\)/);
    assert.match(source, /\(!item\.variant \|\| item\.variant === state\.enhancementState\)/);
    assert.match(source, /availableAttacks\(\)\.map\(resolvedAttack\)/);
    assert.match(source, /selected\.multiplierComponents/);
    assert.match(source, /adjacentMultiplierRatio/);
    assert.match(source, /const adjacentAttack = selected\.adjacentMultiplier/);
    assert.match(source, /modifiers\(adjacentAttack\)/);
    assert.match(source, /隣接対象・適用/);
    assert.match(source, /traceLevelLabel/);
    assert.match(html, /id="hsrEnhancementState"/);
    assert.match(read("games/js/hsrCalcData.js"), /dataFiles\.modifiers/);
    assert.match(read("games/hsr/data/calc/data-files.json"), /modifiers-welt\.json/);
    assert.match(source, /自動抽出後の確認中です。計算結果は参考値として表示します/);
});

test("HSR enemy controls use selects for mutually exclusive states and never oversized checkboxes", () => {
    const html = read("games/hsr/index.html");
    const css = read("games/css/tetinet.css");
    assert.match(html, /<select id="hsrWeakness">/);
    assert.match(html, /<select id="hsrToughnessState">/);
    assert.match(html, /id="hsrEnemyHpPercent" type="number" min="0" max="100"/);
    assert.match(html, /id="hsrEnemyCount" type="number" min="1" max="5"/);
    assert.match(html, /id="hsrEnemyDebuffCount" type="number" min="0" max="20"/);
    assert.match(html, /id="hsrPartySp" type="number" min="0" max="7"/);
    assert.match(html, /id="hsrStat-hpPercent" data-stat="hpPercent" type="number" min="0" max="100"/);
    assert.match(read("games/js/hsrApp.js"), /hitCountReference === "enemy\.debuffCount"/);
    assert.match(read("games/js/hsrApp.js"), /\$\("hsrEidolon"\)\.addEventListener\("change"/);
    assert.match(read("games/js/hsrApp.js"), /party: \{ sp: state\.partySp \}/);
    assert.match(read("games/js/hsrApp.js"), /item\.enemyDebuffMinimum === undefined \|\| state\.enemy\.debuffCount >= item\.enemyDebuffMinimum/);
    assert.doesNotMatch(html, /id="hsrWeakness" type="checkbox"|id="hsrToughnessActive"/);
    assert.match(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
});

test("HSR conditions follow selected character, equipment and party sources", () => {
    const source = read("games/js/hsrApp.js");
    ["sourceConditions", "structuredSourceConditions", "supplementalAttacks", "supplementalAttack", "HsrModifierRuntime.buildCandidates", '"遺物"', '"オーナメント"', "partyEidolons"].forEach((token) => assert.ok(source.includes(token), token));
    assert.doesNotMatch(source, /parsedSourceConditions|CONDITION_EFFECT_PATTERNS/);
    assert.match(source, /data-structured-input/);
    assert.match(source, /data-structured-toggle/);
    assert.match(source, /modifierInputs/);
    assert.match(source, /filter\(\(item\) => !item\.displayOnly\)/);
});

test("HSR action value uses an explicit themed input and calculation scrolls to results", () => {
    const html = read("games/hsr/index.html");
    const css = read("games/css/hsr-tool-ui.css");
    const source = read("games/js/hsrApp.js");
    assert.match(html, /id="hsrResultPanel"/);
    assert.match(css, /\.hsr-action-value-card \.genshin-field input/);
    assert.match(css, /background:\s*var\(--teti-surface\)/);
    assert.match(css, /#hsrResultPanel[^}]*scroll-margin-top/);
    assert.match(source, /\$\("hsrResults"\)\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\)/);
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
    assert.doesNotMatch(html, /IDベース(?:の)?JSON|画像ID|ゲーム内ID|対応範囲を見る|保存先はこの端末内だけです|UIDから反映|ビルドと戦闘条件|説明データ未登録/);
    assert.doesNotMatch(importer, /画像ID|ゲーム内ID|説明データ未登録|ステータスノード/);
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
    ["IconMaxHP.png", "IconAttack.png", "IconDefence.png", "IconSpeed.png", "IconCriticalChance.png", "IconCriticalDamage.png", "IconBreakUp.png", "IconStatusProbability.png", "IconStatusResistance.png", "IconEnergyRecovery.png", "IconJoy.png"].forEach((icon) => {
        assert.ok(fs.existsSync(path.join(root, `games/images/hsr/stats/${icon}`)), `${icon} stat icon`);
    });
});

test("HSR selection modal keeps filters compact and preserves visible item metadata", () => {
    const source = read("games/js/hsrApp.js");
    const css = read("games/css/hsr-tool-ui.css");
    assert.match(source, /type === "cone"\) return state\.data\.lightCones\.filter\(\(item\) => !character\(\) \|\| item\.path === character\(\)\.path\)/);
    assert.match(source, /state\.selectionType === "cone"/);
    assert.match(source, /filterWrap\.hidden = rows\.length === 0/);
    assert.match(source, /data-rarity=/);
    assert.match(source, /が装備できる「\$\{selectedCharacter\.pathName\}」の光円錐/);
    assert.match(source, /名前に一致する候補がありません。検索内容を確認してください。/);
    assert.match(css, /#hsrSelectionFilters\[hidden\]/);
    assert.match(css, /\.genshin-selection-dialog\.is-character \.genshin-selection-option \{ min-height: 8\.25rem/);
    assert.match(css, /\.genshin-selection-dialog\.is-enemy \.genshin-selection-dialog-inner \{ height: 100%/);
    assert.doesNotMatch(css, /data-selection-type="enemy"[^\n]+height: auto/);
});

test("HSR selection does not overwrite numeric stats and details expose modern path data", () => {
    const source = read("games/js/hsrApp.js");
    const importer = read("games/js/hsrUidImporter.js");
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    assert.doesNotMatch(source, /catalogStats/);
    assert.match(source, /MemospriteSkill/);
    assert.match(source, /ElationDamage/);
    assert.match(source, /軌跡ステータス合計/);
    assert.match(importer, /記憶の精霊ステータス/);
    assert.match(importer, /愉悦度/);
    assert.ok(catalog.characters.some((item) => item.skills.some((skill) => skill.type === "MemospriteSkill")));
    assert.ok(catalog.characters.some((item) => item.skills.some((skill) => skill.type === "ElationDamage")));
});

test("HSR detail text removes ruby controls and resolves game-data parameters", () => {
    const source = read("games/js/hsrUidImporter.js");
    assert.match(source, /RUBY_B/);
    assert.match(source, /RUBY_E/);
    assert.match(source, /#\(\\d\+\)/);
    assert.match(source, /formatGameText/);
});

test("HSR party and condition UI translates internal target identifiers", () => {
    const source = read("games/js/hsrApp.js");
    assert.match(source, /PARTY_TARGET_LABELS/);
    assert.match(source, /allySingle:\s*"味方単体"/);
    assert.match(source, /partyAll:\s*"味方全体"/);
    assert.match(source, /enemyAll:\s*"敵全体"/);
    assert.match(source, /displayTarget\(item\.appliesTo \|\| item\.target\?\.owner \|\| "self"\)/);
});

test("HSR condition modal follows the Genshin category and card format", () => {
    const source = read("games/js/hsrApp.js");
    const html = read("games/hsr/index.html");
    assert.match(source, /CONDITION_TAB_ORDER = \["パーティ", "光円錐", "遺物・オーナメント", "軌跡", "その他"\]/);
    ["genshin-condition-card", "genshin-constellation-section", "genshin-constellation-head", "genshin-condition-facts", "genshin-constellation-controls", "genshin-condition-status"].forEach((className) => assert.ok(source.includes(className), className));
    ["発動条件", "効果", "現在の反映", "適用対象", "状態・条件", "条件を設定", "条件未達", "反映済み", "条件OFF", "適用中", "自動反映"].forEach((label) => assert.ok(source.includes(label), label));
    assert.match(source, /type: `星魂\$\{source\.eidolonRank\}`/);
    assert.match(source, /type: "追加能力"/);
    assert.match(source, /\["statThreshold", "numericThreshold"\]\.includes\(item\.activation\?\.mode\)/);
    assert.match(source, /"self\.effectHitRate": \["効果命中", "%"\]/);
    assert.match(source, /0%（条件未達）/);
    assert.match(source, /\["statThreshold", "numericThreshold"\][^\n]+label: "条件未達"/);
    assert.match(source, /現在の\$\{reference\[0\]\}/);
    assert.match(source, /scrollRegion\.scrollTop = 0/);
    assert.match(html, /id="hsrConditionDialogOpen"[^>]*>補正条件を確認・設定<\/button>/);
    assert.match(source, /自動判定と手動条件の適用状態を確認できます。/);
});

test("HSR condition modal distinguishes summarized minor traces from additional abilities", () => {
    const source = read("games/js/hsrApp.js");
    assert.match(source, /startsWith\("traceStats:"\)/);
    assert.match(source, /type: "小軌跡"/);
});

test("HSR party members expose their own eidolon rank to structured party modifiers", () => {
    const source = read("games/js/hsrApp.js");
    const runtime = read("games/js/hsrModifierRuntime.js");
    assert.match(source, /data-party-field="eidolon"/);
    assert.match(source, /partyEidolons:/);
    assert.match(runtime, /context\.partyEidolons/);
    ["atk", "lightConeId", "coneRank", "relicId", "relicMode", "ornamentId"].forEach((field) => assert.match(source, new RegExp(`data-party-field="${field}"`)));
    assert.match(source, /partyEquipment:/);
});

test("HSR profile mapper normalizes Enka equipment, relic, trace and set properties", () => {
    const source = read("games/js/hsrProfileMapper.js"); const window = {}; vm.runInNewContext(source, { window, Math });
    const catalog = {
        characters: [{
            id: "1407", name: "Sample", elementName: "炎", pathName: "記憶", image: "/character.webp",
            base: { hp: 1000, atk: 500, def: 400, speed: 100 },
            skills: [{ id: "1407001", name: "通常攻撃", type: "Normal", params: Array(6).fill([]) }],
            traces: [{ id: "1407201", name: "会心率強化", maxLevel: 1, levels: [{ properties: [{ type: "CriticalChanceBase", value: 0.04 }, { type: "ElationDamageAddedRatioBase", value: 0.08 }] }] }]
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
    assert.equal(character.stats.elation, 8);
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
