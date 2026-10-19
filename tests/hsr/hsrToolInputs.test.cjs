const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function tool(savedStorage, extraData) {
    const storage = savedStorage || new Map();
    const nodes = new Map();
    const html = read("games/hsr/index.html");
    const buildHtml = html.slice(html.indexOf("hsr-build-fieldset"), html.indexOf('id="hsrConditionTitle"'));
    const formIds = [...buildHtml.matchAll(/<(?:input|select)[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    const statKeys = [...html.matchAll(/data-stat="([^"]+)"/g)].map((match) => match[1]);
    function node(id) {
        if (!nodes.has(id)) {
            const tag = html.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] || "";
            const handlers = {};
            nodes.set(id, { id, value: tag.match(/value="([^"]*)"/)?.[1] || "", dataset: { stat: id.startsWith("hsrStat-") ? id.slice(8) : undefined },
                handlers, hidden: false, textContent: "", _html: "",
                set innerHTML(value) { this._html = value; const selected = value.match(/value="([^"]*)" selected/); if (selected) this.value = selected[1]; },
                get innerHTML() { return this._html; },
                addEventListener(event, callback) { handlers[event] = callback; }, querySelectorAll: () => [], querySelector: () => null, showModal() { this.open = true; }, scrollIntoView() {} });
        }
        return nodes.get(id);
    }
    let initialize;
    const document = { body: { classList: { add() {} } }, getElementById: node, addEventListener: (_, callback) => { initialize = callback; },
        querySelectorAll: (selector) => selector === "[data-stat]" ? statKeys.map((key) => node(`hsrStat-${key}`)) : selector === ".hsr-build-fieldset input,.hsr-build-fieldset select" ? formIds.map(node) : [] };
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const data = { characters: [
        { id: "sample", name: "Sample", element: "Ice", skills: [], base: { hp: 1000, atk: 500, def: 400, speed: 100 } },
        catalog.characters.find((item) => item.id === "1202")
    ], lightCones: [{ id: "cone", name: "Cone", base: { hp: 100, atk: 200, def: 100 } }], relicSets: [], enemies: [],
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-tingyun.json")).modifiers,
        attacks: [{ id: "sample-normal", characterId: "sample", name: "Sample attack", type: "normal", element: "Ice", traceKey: "normal", multipliers: [100], scalingStat: "atk", support: { status: "calculable", verified: true } }], breakBaseDamage: { 80: 3767.5533 } };
    Object.assign(data, extraData);
    const window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, HsrCalcData: { load: async () => data }, HsrModifierRuntime: require("../../games/js/hsrModifierRuntime.js") };
    const context = { window, document, console, requestAnimationFrame: (callback) => callback() };
    vm.createContext(context);
    vm.runInContext(read("games/js/hsrCalcEngine.js"), context);
    const results = [];
    const engine = window.HsrCalcEngine;
    window.HsrCalcEngine = { ...engine, calculate(input) { const result = engine.calculate(input); results.push(result); return result; } };
    vm.runInContext(read("games/js/hsrCalcState.js"), context);
    vm.runInContext(read("games/js/hsrApp.js"), context);
    await initialize();
    const state = window.HsrTool.getState();
    if (!savedStorage) state.characterId = "sample";
    function calculate() { results.length = 0; node("hsrCalculateButton").handlers.click(); return results; }
    return { window, state, node, calculate, storage };
}

test("manual final stats require only used HP/ATK/DEF and preserve legitimate zero bonuses", async () => {
    const app = await tool();
    assert.equal(app.calculate().length, 0, "initial ATK zero must not produce damage");
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-critRate").value = "0";
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1000);
    for (const value of ["", "not-a-number", "-1"]) {
        app.node("hsrStat-atk").value = value;
        assert.equal(app.calculate().length, 0, value);
        assert.equal(app.node("hsrResults").innerHTML.includes("hsr-attack-result"), false);
    }
});

test("UID missing stats cannot retain a previous character's final stats", async () => {
    const app = await tool();
    app.window.HsrTool.applyProfileCharacter({ id: "sample", level: 80, traces: [{ type: "Normal", level: 6 }], stats: { ...app.state.stats, hp: 5000, atk: 2000, def: 900 } });
    assert.equal(app.calculate()[0].breakdown.baseDamage, 2000);
    const mapperWindow = {};
    vm.runInNewContext(read("games/js/hsrProfileMapper.js"), { window: mapperWindow });
    const profile = mapperWindow.HsrProfileMapper.mapProfileResponse({ detailInfo: { avatarDetailList: [{ avatarId: "sample", level: 70 }] } }, app.state.data).characters[0];
    app.window.HsrTool.applyProfileCharacter(profile);
    assert.equal(app.node("hsrStat-atk").value, "");
    assert.equal(app.calculate().length, 0);
    app.node("hsrStat-atk").value = "1500";
    app.node("hsrNormalTrace").value = "6";
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1500, "lower-level final stats remain manually usable without base-dependent buffs");
});

test("Tingyun uses character plus cone base ATK and refuses unavailable level bases", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.state.coneId = "cone";
    app.state.party[0] = { characterId: "1202", level: 10, atk: 4000 };
    app.state.modifierInputs["tingyun-benediction"] = true;
    const result = app.calculate()[0];
    assert.equal(result.breakdown.baseDamage, 1350, "1000 final ATK + (500 character + 200 cone) * 50%");
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /data-support-status="review"/, "supplemental attacks inherit their source support status");
    app.state.party[0].atk = 0;
    assert.equal(app.calculate().length, 0, "active Benediction needs the provider ATK as well");
    app.state.party[0].atk = 4000;
    app.node("hsrLevel").value = "70";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrWarnings").innerHTML, /基礎/);
    app.state.modifierInputs["tingyun-benediction"] = false;
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1000);
    app.node("hsrLevel").value = "80";
    app.node("hsrConeLevel").value = "70";
    app.state.modifierInputs["tingyun-benediction"] = true;
    assert.equal(app.calculate().length, 0, "a lower-level cone also has no catalog base");
});

test("missing base stats cannot silently drop active statPercent buffs", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.state.conditions.push({ id: "conditional-atk", name: "ATK buff", category: "statPercent", stat: "atk", value: 50, enabled: true });
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1250);
    app.node("hsrLevel").value = "70";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrWarnings").innerHTML, /基礎/);
});

test("blank and invalid character levels do not fall back to a different damage level", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    for (const value of ["", "0", "81", "1.5", "not-a-number"]) {
        app.node("hsrLevel").value = value;
        assert.equal(app.calculate().length, 0, value);
    }
});


test("results distinguish registered, reference and display-only attacks without calculating display-only data", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    const attack = app.state.data.attacks[0];
    app.calculate();
    assert.match(app.node("hsrResults").innerHTML, /data-support-status="calculable"[^>]*>計算対応・確認済み扱い/);
    attack.support = { status: "review", verified: false };
    app.calculate();
    assert.match(app.node("hsrResults").innerHTML, /data-support-status="review"[^>]*>確認中・参考値/);
    attack.support = { status: "calculable", verified: false };
    app.calculate();
    assert.match(app.node("hsrResults").innerHTML, /data-support-status="review"/);
    attack.support = { status: "displayOnly", verified: false, reason: "この特殊攻撃は計算対象外です" };
    delete attack.multipliers;
    assert.equal(app.calculate().length, 0);
    const html = app.node("hsrResults").innerHTML;
    assert.match(html, /表示のみ・計算不可/);
    assert.match(html, /この特殊攻撃は計算対象外です/);
    assert.doesNotMatch(html, /非会心（合計）/);
});

test("breakdown displays engine references, hit totals, critical values and adjacent results", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-critRate").value = "50";
    app.node("hsrStat-critDamage").value = "100";
    Object.assign(app.state.data.attacks[0], { hitCount: 3, target: "blast", adjacentMultipliers: [50] });
    app.state.conditions.push({ id: "progressive", name: "Progressive", category: "progressiveTakenDamage", value: 12, enabled: true, stacking: { maximumStacks: 2 } });
    const [main, adjacent] = app.calculate();
    assert.ok(Math.abs(main.nonCrit - 1209.6) < 1e-9);
    assert.ok(Math.abs(main.crit - 2419.2) < 1e-9);
    assert.ok(Math.abs(main.expected - 1814.4) < 1e-9);
    assert.equal(adjacent.breakdown.baseDamage, 500);
    const html = app.node("hsrResults").innerHTML;
    for (const label of ["攻撃力参照 × 攻撃倍率", "1,000 × 100%", "ヒット数</dt><dd>3", "与ダメージ補正", "防御倍率", "耐性倍率", "靭性倍率", "独立倍率", "共通倍率", "被ダメージ倍率合計", "期待値の会心倍率", "隣接対象", "1ヒット平均", "×1 → ×1.12 → ×1.24"]) assert.ok(html.includes(label), label);
});

test("non-critical DoT and capped enemy-HP attacks do not show invented critical or stat terms", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    const attack = app.state.data.attacks[0];
    Object.assign(attack, { type: "dot", canCrit: false });
    const dot = app.calculate()[0];
    assert.equal(dot.expected, dot.nonCrit);
    assert.match(app.node("hsrResults").innerHTML, /ダメージ（合計）/);
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /会心|期待値/);
    Object.assign(attack, { damageFormula: "enemyHpCappedByAtk", scalingStat: "enemyHp", enemyHpPercentMultipliers: [24], atkCapMultipliers: [338] });
    const capped = app.calculate()[0];
    assert.equal(capped.breakdown.cappedEnemyHpDamage, 3380);
    assert.match(app.node("hsrResults").innerHTML, /敵HP参照・攻撃力上限適用後/);
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /enemyHp参照|会心倍率/);
});

test("modifier audit separates unsupported data, included final stats and inactive conditions", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    const record = { source: { kind: "manual", id: "sample" }, category: "statPercent", stat: "atk", value: { kind: "fixed", fixed: 100 }, activation: { mode: "always" }, target: { attackTypes: ["all"] } };
    app.state.data.structuredModifiers.push(
        { ...record, id: "included", name: "Included ATK", support: { status: "calculable" }, inputPolicy: "includedInFinalStats" },
        { ...record, id: "unsupported", name: "Unsupported ATK", support: { status: "displayOnly", reason: "この効果は計算未対応です" } }
    );
    app.state.conditions.push({ id: "inactive", name: "Inactive buff", category: "damageBonus", value: 100, enabled: false });
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1000);
    const html = app.node("hsrResults").innerHTML;
    for (const text of ["入力済みの常時効果・再加算なし", "Included ATK", "データ未対応・表示のみ（計算対象外）", "Unsupported ATK", "この効果は計算未対応です", "条件未成立／対象外", "発動条件を満たしていません"]) assert.ok(html.includes(text), text);
});


test("Guinaifen's display-only Burn condition can select its separately calculated DoT", async () => {
    const app = await tool();
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    app.state.data.characters.push(catalog.characters.find((item) => item.id === "1210"));
    app.state.data.attacks = JSON.parse(read("games/hsr/data/calc/attacks-1206-1210.json")).overrides.filter((item) => ["121002", "1210021"].includes(item.id));
    app.state.data.structuredModifiers = JSON.parse(read("games/hsr/data/calc/modifiers-1206-1210.json")).modifiers.filter((item) => item.source.id === "1210");
    const burnFlag = app.state.data.structuredModifiers.find((item) => item.id === "trace:1210:121002:burn");
    app.state.data.structuredModifiers.push({ ...burnFlag, id: "unrelated-display-only", activation: { ...burnFlag.activation, inputKey: "unrelated-flag" } });
    app.state.characterId = "1210";
    app.state.conditionTab = "軌跡";
    app.node("hsrStat-atk").value = "3000";
    app.node("hsrConditionDialogOpen").handlers.click();
    assert.match(app.node("hsrConditionList").innerHTML, /data-structured-toggle="guinaifen-burn-active"/);
    assert.doesNotMatch(app.node("hsrConditionList").innerHTML, /data-structured-toggle="unrelated-flag"/);
    assert.equal(app.calculate().length, 2, "main and adjacent only before Burn is selected");
    for (const key of ["enemy-burning", "guinaifen-burn-active"]) app.node("hsrConditionDialog").handlers.change({ target: { dataset: { structuredToggle: key }, checked: true } });
    assert.match(app.node("hsrConditionList").innerHTML, /data-structured-toggle="guinaifen-burn-active" checked/);
    const results = app.calculate();
    assert.equal(results.length, 3);
    const burn = results.find((result) => result.attack.name === "出だし好調・燃焼");
    // StarRailRes 541e1100, skill121002 Lv10: ATK * 2.1821; A6 20%; DEF .5, RES .8, toughness .9.
    assert.ok(Math.abs(burn.nonCrit - 2828.0016) < 1e-9);
    assert.equal(burn.crit, burn.nonCrit);
    assert.ok(!burn.applied.some((item) => item.id === burnFlag.id), "the selector is never an extra damage modifier");
    assert.match(app.node("hsrConditionList").innerHTML, /独立した攻撃結果を表示/);
    app.node("hsrConditionDialog").handlers.change({ target: { dataset: { structuredToggle: "guinaifen-burn-active" }, checked: false } });
    assert.equal(app.calculate().length, 2);
});


test("active Tingyun Benediction refuses a missing or invalid provider trace level", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.state.party[0] = { characterId: "1202", atk: 4000, level: 0 };
    app.state.modifierInputs["tingyun-benediction"] = true;
    for (const level of [0, -1, 16, 1.5]) {
        app.state.party[0].level = level;
        assert.equal(app.calculate().length, 0, `invalid provider level ${level}`);
        assert.match(app.node("hsrWarnings").innerHTML, /停雲.*軌跡Lv/);
        assert.ok(!app.node("hsrResults").innerHTML.includes("hsr-attack-result"));
    }
    for (const [level, baseDamage] of [[1, 1125], [10, 1250]]) {
        app.state.party[0].level = level;
        assert.equal(app.calculate()[0].breakdown.baseDamage, baseDamage);
    }
    app.state.party[0].level = 0;
    app.state.modifierInputs["tingyun-benediction"] = false;
    assert.equal(app.calculate()[0].breakdown.baseDamage, 1000, "inactive support must not block the main attack");
});

test("light-cone details use the selected refinement before calculation", async () => {
    const app = await tool();
    app.state.coneId = "cone";
    app.state.data.lightCones[0].effect = { name: "Effect", description: "rank value", paramsByRank: [[10], [20], [30], [40], [50]] };
    app.window.HsrUidImporter = { formatGameText: (_text, params) => String(params[0]) };
    for (const rank of [5, 1]) {
        app.node("hsrConeRank").value = String(rank);
        app.node("hsrConeDetailsButton").handlers.click();
        assert.equal(app.state.coneRank, rank);
        assert.ok(app.node("hsrDetailsBody").innerHTML.includes(`<p>${rank * 10}</p>`));
    }
});

test("unimplemented Elation attacks and mixed True/Elation records are unavailable while ordinary attacks remain", async () => {
    const app = await tool();
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const generated = JSON.parse(read("games/hsr/data/attacks.generated.json"));
    const overrides = JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
    const attacks = new Map(generated.attacks.map((attack) => [attack.id, { ...attack, support: attack.support || generated.support }]));
    overrides.forEach((override) => attacks.set(override.id, { ...attacks.get(override.id), ...override }));
    app.state.data.characters = catalog.characters;
    app.state.data.attacks = [...attacks.values()];
    for (const stat of ["hp", "atk", "def"]) app.node(`hsrStat-${stat}`).value = "1000";
    app.node("hsrPunchline").value = "20";
    for (const id of ["150120", "150621", "800920", "801020", "140603", "150504"]) {
        const blocked = attacks.get(id);
        app.state.characterId = blocked.characterId;
        const results = app.calculate();
        assert.ok(results.some((result) => result.attack.name === attacks.get(`${blocked.characterId}01`)?.name), `normal attack remains for ${id}`);
        assert.ok(!results.some((result) => result.attack.name === blocked.name), id);
        assert.match(app.node("hsrResults").innerHTML, /表示のみ・計算不可/);
        assert.ok(app.node("hsrResults").innerHTML.includes(blocked.support.reason), id);
    }
});

test("dedicated Break attacks keep their supported UI route", async () => {
    const app = await tool();
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    app.state.data.characters.push(catalog.characters.find((item) => item.id === "1303"));
    app.state.characterId = "1303";
    app.state.data.attacks[0].characterId = "1303";
    app.state.data.specialBreakAttacks = JSON.parse(read("games/hsr/data/calc/special-break-attacks.json")).attacks;
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrWeakness").value = "true";
    app.calculate();
    const html = app.node("hsrResults").innerHTML;
    assert.ok(html.includes("残梅・弱点撃破ダメージ"));
    assert.ok(html.includes("フラクタルの螺旋・弱点撃破ダメージ"));
    assert.ok(!html.includes("表示のみ・計算不可"));
    assert.match(html, /撃破ダメージ<\/span><strong>/);
});

test("representative Elation inputs stop incomplete calculation and render actual dedicated factors", async () => {
    const app = await tool();
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const generated = JSON.parse(read("games/hsr/data/attacks.generated.json"));
    const override = JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.find((item) => item.id === "150520");
    app.state.data.characters = catalog.characters;
    app.state.data.attacks = generated.attacks.filter((item) => ["150501", "150520"].includes(item.id)).map((item) => ({ ...item, support: item.support || generated.support, ...(item.id === "150520" ? override : {}) }));
    app.state.characterId = "1505";
    app.node("hsrStat-atk").value = "3000";
    app.node("hsrStat-elation").value = "50";
    app.node("hsrStat-critRate").value = "50";
    app.node("hsrStat-critDamage").value = "100";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrWarnings").innerHTML, /爆笑ネタ/);
    app.node("hsrPunchline").value = "20";
    const result = app.calculate().find((item) => item.breakdown.damageFormula === "elation");
    assert.ok(Math.abs(result.nonCrit - 6197.335695692308) < 1e-8);
    assert.match(app.node("hsrResults").innerHTML, /Lv80の愉悦基礎値/);
    assert.match(app.node("hsrResults").innerHTML, /通常の与ダメージ補正<\/dt><dd>適用対象外/);
    app.node("hsrSkillTrace").value = "1";
    assert.ok(Math.abs(app.calculate().find((item) => item.breakdown.damageFormula === "elation").nonCrit - result.nonCrit) < 1e-8, "ordinary Skill level must not change Elation");
    app.node("hsrElationTrace").value = "1";
    assert.ok(Math.abs(app.calculate().find((item) => item.breakdown.damageFormula === "elation").nonCrit - result.nonCrit / 2) < 1e-8);
    app.node("hsrEidolon").value = "1";
    assert.equal(app.calculate().length, 1, "ordinary attack remains outside verified E0 scope");
    assert.match(app.node("hsrResults").innerHTML, /Lv80・星魂0のアッハタイム中のみ/);
});


test('Cyrene manual zone effect validates source, displays only actual True factors and restores ordinary calculation when OFF', async () => {
    const app = await tool();
    const catalog = JSON.parse(read('games/hsr/data/catalog.json'));
    const effect = JSON.parse(read('games/hsr/data/attack-overrides.json')).overrides.find(item => item.id === '1415021');
    app.state.data.characters = catalog.characters;
    app.state.characterId = '1415';
    app.state.data.attacks = [{ ...app.state.data.attacks[0], characterId: '1415', scalingStat: 'hp' }, effect];
    app.node('hsrTrueDamageActive').value = 'true';
    assert.equal(app.calculate().length, 0);
    assert.match(app.node('hsrWarnings').innerHTML, /元ダメージ/);
    app.node('hsrTrueDamageSourceKind').value = 'finalNonTrueDamage';
    app.node('hsrOriginalDamage').value = '1080';
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 259.2) < 1e-9);
    app.node('hsrStat-critRate').value = '';
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 259.2) < 1e-9, 'unused stats do not block True damage');
    app.node('hsrStat-critRate').value = '5';
    const html = app.node('hsrResults').innerHTML;
    assert.match(html, /参照元ダメージ（補正適用後）/);
    assert.match(html, /確定ダメージ倍率/);
    assert.match(html, /追加確定ダメージ/);
    assert.doesNotMatch(html, /<dt>防御倍率|<dt>耐性倍率|<dt>会心倍率|<dt>靭性倍率/);
    app.node('hsrSkillTrace').value = '1';
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 129.6) < 1e-9);
    for (const value of ['', '0', '11', '1.5']) {
        app.node('hsrSkillTrace').value = value;
        assert.equal(app.calculate().length, 0);
    }
    app.node('hsrSkillTrace').value = '10';
    app.node('hsrTrueDamageSourceKind').value = 'trueDamage';
    assert.equal(app.calculate().length, 0);
    app.node('hsrTrueDamageSourceKind').value = 'finalNonTrueDamage';
    app.node('hsrEidolon').value = '2';
    assert.equal(app.calculate().length, 0);
    assert.match(app.node('hsrResults').innerHTML, /星魂0のみ/);
    app.node('hsrEidolon').value = '0';
    app.node('hsrTrueDamageActive').value = 'false';
    app.node('hsrStat-hp').value = '4000';
    app.node('hsrOriginalDamage').value = '';
    assert.equal(app.calculate()[0].breakdown.damageFormula, 'statMultiplier');
    assert.doesNotMatch(app.node('hsrResults').innerHTML, /参照元ダメージ（補正適用後）/);
});


test("Pearl calculates only her registered DEF Basic ATK and explains other skills are excluded", async () => {
    const app = await tool();
    app.state.data.characters = JSON.parse(read('games/hsr/data/catalog.json')).characters;
    app.state.characterId = '1503';
    app.state.data.attacks = JSON.parse(read('games/hsr/data/attack-overrides.json')).overrides.filter(item => item.characterId === '1503');
    app.node('hsrEnemyLevel').value = '80';
    app.node('hsrEnemyResistance').value = '20';
    app.node('hsrToughnessState').value = 'active';
    app.node('hsrStat-critRate').value = '50';
    app.node('hsrStat-critDamage').value = '100';
    for (const value of ['0', '', '-1', 'invalid']) {
        app.node('hsrStat-def').value = value;
        assert.equal(app.calculate().length, 0);
        assert.match(app.node('hsrWarnings').innerHTML, /防御力/);
    }
    app.node('hsrStat-def').value = '3000';
    const results = app.calculate();
    assert.equal(results.length, 1);
    assert.ok(Math.abs(results[0].nonCrit - 972) < 1e-9);
    assert.equal(results[0].breakdown.referenceValue, 3000);
    assert.match(app.node('hsrWarnings').innerHTML, /強化通常攻撃・愉悦スキル.*計算対象外/);
    assert.match(app.node('hsrResults').innerHTML, /data-support-status="calculable"/);
    assert.match(app.node('hsrResults').innerHTML, /防御力参照 × 攻撃倍率/);
    assert.match(app.node('hsrResults').innerHTML, /3,000 × 90%/);
    app.node('hsrNormalTrace').value = '1';
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 486) < 1e-9);
});


for (const [cid, id, stat, value, label, multiplier] of [['1512','151201','hp','6000','HP',50], ['1513','151301','atk','3000','攻撃力',100]]) {
    test(cid + ' summer form defaults to its Basic ATK and stops missing reference inputs', async () => {
        const app = await tool();
        app.state.data.characters = JSON.parse(read('games/hsr/data/catalog.json')).characters;
        app.state.characterId = cid;
        app.state.data.attacks = JSON.parse(read('games/hsr/data/attack-overrides.json')).overrides.filter(item => item.characterId === cid);
        app.node('hsrEnemyLevel').value = '80';
        app.node('hsrEnemyResistance').value = '20';
        app.node('hsrToughnessState').value = 'active';
        app.node('hsrStat-critRate').value = '50';
        app.node('hsrStat-critDamage').value = '100';
        for (const invalid of ['0', '', '-1', 'invalid']) {
            app.node('hsrStat-' + stat).value = invalid;
            assert.equal(app.calculate().length, 0);
            assert.ok(app.node('hsrWarnings').innerHTML.includes(label));
        }
        app.node('hsrStat-' + stat).value = value;
        const result = app.calculate()[0];
        assert.ok(Math.abs(result.nonCrit - 1080) < 1e-9);
        assert.equal(result.breakdown.referenceValue, Number(value));
        assert.equal(result.breakdown.multiplierPercent, multiplier);
        assert.match(app.node('hsrResults').innerHTML, /data-support-status="calculable"/);
        assert.ok(app.node('hsrResults').innerHTML.includes(label + '参照 × 攻撃倍率'));
        assert.match(app.node('hsrWarnings').innerHTML, cid === '1513' ? /爆笑の褒美なし.*熱気0.*計算対象外/ : /のみ計算対応.*計算対象外/);
        assert.equal(app.calculate().length, 1, 'conditional skills are not included without confirmation');
    });
}


test('Summer Robin Fever party input stops invalid Vibes and reports DEF ignore without other buffs', async () => {
  const app=await tool();
  app.state.data.characters=JSON.parse(read('games/hsr/data/catalog.json')).characters;
  app.state.characterId='1503';
  app.state.data.attacks=JSON.parse(read('games/hsr/data/attack-overrides.json')).overrides.filter(item=>item.id==='150301');
  app.state.data.structuredModifiers=JSON.parse(read('games/hsr/data/calc/modifiers-robin-summeretto.json')).modifiers;
  app.state.party[0]={characterId:'1512',eidolon:0,level:10};
  app.node('hsrStat-def').value='3000';app.node('hsrStat-critRate').value='50';app.node('hsrStat-critDamage').value='100';
  app.node('hsrEnemyLevel').value='80';app.node('hsrEnemyResistance').value='20';app.node('hsrToughnessState').value='active';
  assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
  app.state.modifierInputs['robin-summeretto-fever']=true;
  assert.equal(app.calculate().length,0);assert.match(app.node('hsrWarnings').innerHTML,/バイブス/);
  app.state.modifierInputs['robin-summeretto-vibes']=50;
  assert.ok(Math.abs(app.calculate()[0].nonCrit-1215)<1e-9);
  assert.match(app.node('hsrResults').innerHTML,/0%／40%/);
  assert.match(app.node('hsrResults').innerHTML,/×0.625/);
  app.state.party[0].eidolon=1;assert.equal(app.calculate().length,0);assert.match(app.node('hsrWarnings').innerHTML,/星魂0/);
  app.state.party[0].eidolon=0;app.state.party[0].level=0;assert.equal(app.calculate().length,0);
  app.state.party[0].level=10;app.state.modifierInputs['robin-summeretto-fever']=false;
  assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
});


test('UID import preserves precision, refuses missing crit/trace data and clears an unknown character', async () => {
    const app=await tool();
    const profile={id:'sample',level:80,eidolon:0,lightCone:{id:'cone',level:60,rank:2},traces:[{type:'Normal',level:6}],stats:{...app.state.stats,hp:5000,atk:1234.567891,def:900}};
    app.window.HsrTool.applyProfileCharacter(profile);
    assert.equal(app.state.coneId,'cone');assert.equal(app.node('hsrConeLevel').value,60);
    assert.equal(app.node('hsrStat-atk').value,'1234.567891');
    assert.ok(Math.abs(app.calculate()[0].breakdown.referenceValue-1234.567891)<1e-9);
    const missingRank=structuredClone(profile);delete missingRank.lightCone.rank;app.window.HsrTool.applyProfileCharacter(missingRank);assert.equal(app.calculate().length,0);assert.match(app.node('hsrWarnings').innerHTML,/重畳ランク/);
    const missing=structuredClone(profile);delete missing.stats.critRate;missing.traces=[];
    app.window.HsrTool.applyProfileCharacter(missing);
    assert.equal(app.node('hsrStat-critRate').value,'');assert.equal(app.node('hsrNormalTrace').value,'');
    assert.equal(app.calculate().length,0);assert.match(app.node('hsrWarnings').innerHTML,/会心率/);
    app.node('hsrStat-critRate').value='0';assert.equal(app.calculate().length,0,'missing trace must not become max level');
    app.node('hsrNormalTrace').value='6';assert.equal(app.calculate().length,1);
    app.window.HsrTool.applyProfileCharacter({...profile,id:'not-in-catalog'});
    assert.equal(app.state.characterId,'');assert.equal(app.calculate().length,0);
    assert.doesNotMatch(app.node('hsrResults').innerHTML,/hsr-attack-result/);
});


test('HSR autosave restores inputs, party, equipment and conditions without storing results or UID data', async () => {
    const app=await tool();const key=app.window.HsrCalcState.KEY;
    assert.equal(app.storage.size,0,'initialization must not overwrite storage');
    app.storage.set('tetinet:hsr:lastUid:v1','100000001');
    app.state.coneId='cone';app.state.relicId='removed-relic';app.state.party[0]={...app.state.party[0],characterId:'1202',level:8,atk:2345.678901};
    app.state.modifierInputs['tingyun-benediction']=true;
    app.state.conditions[0].enabled=true;app.state.conditions[0].value=30.5;
    app.node('hsrStat-atk').value='1234.567891';app.node('hsrStat-hp').value='';app.node('hsrStat-critRate').value='0';
    app.node('hsrNormalTrace').value='4';app.node('hsrEidolon').value='2';app.node('hsrConeRank').value='3';app.node('hsrEnemyResistance').value='-20.25';
    app.node('hsrStat-atk').handlers.input();
    const raw=app.storage.get(key);const save=JSON.parse(raw);
    assert.equal(save.schemaVersion,1);assert.equal(save.game,'hsr');assert.equal('data' in save.state,false);assert.equal('results' in save,false);assert.equal(raw.includes('100000001'),false);
    const restored=await tool(app.storage);
    assert.equal(app.storage.get(key),raw,'restoring must not save initial/partially restored state');
    assert.equal(restored.state.characterId,'sample');assert.equal(restored.state.coneId,'cone');assert.equal(restored.state.relicId,'removed-relic','unknown IDs are not substituted');
    assert.equal(restored.node('hsrStat-atk').value,'1234.567891');assert.equal(restored.node('hsrStat-hp').value,'');assert.equal(restored.node('hsrStat-critRate').value,'0');
    assert.equal(restored.state.traceLevels.normal,4);assert.equal(restored.state.eidolon,2);assert.equal(restored.state.coneRank,3);assert.equal(restored.state.enemy.resistance,-20.25);
    assert.equal(restored.state.party[0].atk,2345.678901);assert.equal(restored.state.modifierInputs['tingyun-benediction'],true);assert.equal(restored.state.conditions[0].value,30.5);
    assert.equal(restored.node('hsrDirtyNotice').hidden,false);assert.doesNotMatch(restored.node('hsrResults').innerHTML,/hsr-attack-result/);
    assert.equal(restored.calculate().length,3, 'normal and Tingyun supplemental attacks are regenerated');
    restored.state.coneId='removed-cone';assert.equal(restored.calculate().length,0,'missing cone IDs cannot supply a guessed base for percentage buffs');assert.match(restored.node('hsrWarnings').innerHTML,/基礎攻撃力/);
    restored.node('hsrClearSavedInputs').handlers.click();assert.equal(app.storage.has(key),false);assert.equal(app.storage.get('tetinet:hsr:lastUid:v1'),'100000001');
});

test('HSR special damage and UID-edited inputs survive a reload with exact decimals', async () => {
    const app=await tool();
    app.window.HsrTool.applyProfileCharacter({id:'sample',level:80,traces:[{type:'Normal',level:6}],stats:{...app.state.stats,hp:5000,atk:1234.567891,def:900}});
    app.node('hsrStat-atk').value='2000.1234567';app.node('hsrStat-atk').handlers.input();
    app.node('hsrPunchline').value='0';app.node('hsrMerrymake').value='12.345678';app.node('hsrElationTrace').value='3';
    app.node('hsrTrueDamageActive').value='true';app.node('hsrTrueDamageSourceKind').value='finalNonTrueDamage';app.node('hsrOriginalDamage').value='1080.123456';app.node('hsrOriginalDamage').handlers.input();
    const restored=await tool(app.storage);
    assert.equal(restored.state.source,'api-edited');assert.equal(restored.node('hsrStat-atk').value,'2000.1234567');
    assert.equal(restored.node('hsrPunchline').value,'0');assert.equal(restored.state.elationInputs.merrymake,12.345678);assert.equal(restored.state.traceLevels.elation,3);
    assert.equal(restored.node('hsrOriginalDamage').value,'1080.123456');assert.equal(restored.node('hsrTrueDamageSourceKind').value,'finalNonTrueDamage');
    assert.equal(restored.calculate().length,1);
});

test('HSR saved state tolerates malformed/old data, partial records and unavailable storage', async () => {
    const module=require('../../games/js/hsrCalcState.js');
    for(const raw of ['{broken',JSON.stringify({schemaVersion:0,game:'hsr',state:{}}),JSON.stringify({schemaVersion:1,game:'genshin',state:{}})]) {
        const storage=new Map([[module.KEY,raw]]);const app=await tool(storage);assert.equal(storage.get(module.KEY),raw);assert.equal(app.state.characterId,'');
    }
    const app=await tool();const value=module.create(app.state,{'hsrStat-atk':'1000','hsrUidInput':'secret'});value.state.stats.atk='invalid';value.state.stats.critRate=0;value.state.enemy.resistance=33;
    const restored=module.restore(value,app.state,app.state.data,['hsrStat-atk']);
    assert.equal(restored.state.stats.critRate,0);assert.equal(restored.state.enemy.resistance,33);assert.equal(restored.state.stats.atk,app.state.stats.atk);assert.equal('hsrUidInput' in restored.fields,false);
    const denied={getItem(){throw Error('blocked')},setItem(){throw Error('quota')},removeItem(){throw Error('blocked')}};
    assert.equal(module.load(denied).error,true);assert.equal(module.save(denied,value),false);assert.equal(module.clear(denied),false);
    Object.defineProperty(app.window,'localStorage',{get(){throw Error('blocked')}});app.node('hsrStat-atk').value='1000';assert.doesNotThrow(()=>app.node('hsrStat-atk').handlers.input());assert.equal(app.calculate().length,1);
});

test("Yao Guang scoped Elation shows all six unequal hits and restores its explicit context", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const generated = JSON.parse(read("games/hsr/data/attacks.generated.json"));
    const override = JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.find(item => item.id === "150220");
    const extraData = { characters: catalog.characters, attacks: generated.attacks.filter(item => ["150201", "150220"].includes(item.id)).map(item => ({ ...item, support: item.support || generated.support, ...(item.id === "150220" ? override : {}) })) };
    const app = await tool(undefined, extraData); app.state.characterId = "1502";
    for (const [stat, value] of Object.entries({ atk: 3000, elation: 50, critRate: 50, critDamage: 100 })) app.node(`hsrStat-${stat}`).value = String(value);
    app.node("hsrPunchline").value = "20";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrWarnings").innerHTML, /初回の通常アッハタイム/);
    app.node("hsrElationContext").value = "firstAhaInstant";
    const result = app.calculate().find(item => item.breakdown.damageFormula === "elation");
    assert.ok(Math.abs(result.nonCrit - 13070.74437636923) < 1e-8);
    const html = app.node("hsrResults").innerHTML;
    assert.match(html, /全体攻撃：100% × 1ヒット/); assert.match(html, /追撃：20% × 5ヒット/);
    assert.match(html, /基礎ダメージ（倍率合算）/); assert.doesNotMatch(html, /同じ基礎ダメージを6ヒット/);
    assert.match(html, /爻光・被ダメージ増加（攻撃前に付与）/);
    app.node("hsrStat-elation").handlers.input();
    const restored = await tool(app.storage, extraData);
    assert.equal(restored.state.characterId, "1502"); assert.equal(restored.node("hsrElationContext").value, "firstAhaInstant");
    assert.equal(restored.node("hsrResults").innerHTML.includes("hsr-attack-result"), false);
    assert.ok(Math.abs(restored.calculate().find(item => item.breakdown.damageFormula === "elation").nonCrit - result.nonCrit) < 1e-8);
    restored.node("hsrEnemyCount").value = "2";
    assert.equal(restored.calculate().some(item => item.breakdown.damageFormula === "elation"), false);
    assert.match(restored.node("hsrResults").innerHTML, /敵が1体の場合のみ/);
    restored.node("hsrEnemyCount").value = "1";
    restored.node("hsrElationContext").value = "ultimateAhaInstant";
    assert.equal(restored.calculate().length, 0);
    assert.match(restored.node("hsrWarnings").innerHTML, /初回の通常アッハタイム/);
});


test("Waveflair full Skill and Ultimate require the explicit no-extra-Elation condition and preserve it on reload", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const overrides = JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
    const expanded = JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers;
    const extraData = { characters: catalog.characters, attacks: overrides.filter(item => ["151301", "151302", "151303"].includes(item.id)), structuredModifiers: expanded };
    const app = await tool(undefined, extraData); app.state.characterId = "1513";
    for (const [key, value] of Object.entries({ atk: 3000, critRate: 50, critDamage: 100 })) app.node(`hsrStat-${key}`).value = String(value);
    assert.equal(app.calculate().length, 1, "unconfirmed CB/Fervor must not show partial Skill or Ultimate totals");
    app.state.modifierInputs["waveflair-no-banger-zero-fervor"] = true;
    const results = app.calculate(); assert.equal(results.length, 3);
    assert.ok(Math.abs(results.find(item => item.attack.name.includes("フィニッシュ")).nonCrit - 2592) < 1e-8);
    assert.ok(Math.abs(results.find(item => item.attack.name.includes("荒波")).nonCrit - 4320) < 1e-8);
    assert.match(app.node("hsrResults").innerHTML, /攻撃力参照 × 攻撃倍率/);
    assert.match(app.node("hsrWarnings").innerHTML, /発動前の熱気0/);
    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, extraData);
    assert.equal(restored.state.modifierInputs["waveflair-no-banger-zero-fervor"], true);
    assert.equal(restored.calculate().length, 3);
    restored.state.modifierInputs["waveflair-no-banger-zero-fervor"] = false;
    assert.equal(restored.calculate().length, 1);
    restored.state.modifierInputs["waveflair-no-banger-zero-fervor"] = true;
    for (const value of ["", "0", "-1"]) { restored.node("hsrStat-atk").value = value; assert.equal(restored.calculate().length, 0); }
    restored.node("hsrStat-atk").value = "3000"; restored.node("hsrSkillTrace").value = "11";
    assert.equal(restored.calculate().length, 0); assert.match(restored.node("hsrWarnings").innerHTML, /軌跡Lv1～10/);
    restored.node("hsrSkillTrace").value = "10"; restored.node("hsrEidolon").value = "1";
    assert.equal(restored.calculate().length, 1, "E1 must not reuse the scoped E0 Skill/Ultimate");
});


test("latest gear uses existing controls and restores rank, pieces and effect toggles without double stats", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const extraData = { characters: catalog.characters, lightCones: catalog.lightCones, relicSets: catalog.relicSets,
      attacks: JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a => a.id === "150301"),
      structuredModifiers: [ ...JSON.parse(read("games/hsr/data/calc/modifiers-light-cones.json")).modifiers, ...JSON.parse(read("games/hsr/data/calc/modifiers-relics-ornaments.json")).modifiers ] };
    const app = await tool(undefined, extraData); app.state.characterId = "1503"; app.state.coneId = "23055";
    app.node("hsrStat-def").value = "3000"; app.node("hsrStat-critRate").value = "50"; app.node("hsrStat-critDamage").value = "100";
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 972) < 1e-9);
    app.state.modifierInputs["lc-23055-vulnerability-active"] = true;
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 1185.84) < 1e-9);
    assert.match(app.node("hsrResults").innerHTML, /再加算しません/); assert.match(app.node("hsrResults").innerHTML, /EP回復・HP回復量/);
    app.node("hsrConeRank").value = "5"; app.state.relicId = "134";
    app.state.modifierInputs["relic-134-atk-active"] = true;
    assert.ok(Math.abs(app.calculate()[0].nonCrit - 1903.5648) < 1e-9); // 972 * 1.44 * 1.36
    app.node("hsrStat-def").handlers.input();
    const restored = await tool(app.storage, extraData);
    assert.equal(restored.state.coneId, "23055"); assert.equal(restored.state.relicId, "134"); assert.equal(restored.state.coneRank, 5);
    assert.equal(restored.state.modifierInputs["lc-23055-vulnerability-active"], true);
    assert.equal(restored.state.modifierInputs["relic-134-atk-active"], true);
    assert.ok(Math.abs(restored.calculate()[0].nonCrit - 1903.5648) < 1e-9);
    restored.state.relicMode = "2+2"; restored.node("hsrRelicMode").value = "2+2";
    assert.ok(Math.abs(restored.calculate()[0].nonCrit - 1399.68) < 1e-9);
    restored.state.modifierInputs["lc-23055-vulnerability-active"] = false;
    assert.ok(Math.abs(restored.calculate()[0].nonCrit - 972) < 1e-9);
    restored.state.relicMode = "4pc"; restored.node("hsrRelicMode").value = "4pc"; restored.node("hsrLevel").value = "79";
    assert.equal(restored.calculate().length, 0); assert.match(restored.node("hsrWarnings").innerHTML, /基礎攻撃力/);
});


test("Elation equipment restores recipient support, independent CB condition and refinement", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const overrides=JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
    const extraData={characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets,
      attacks:generated.filter(a=>["150501","150520"].includes(a.id)).map(a=>({...a,...overrides.find(o=>o.id===a.id)})),
      structuredModifiers:[...JSON.parse(read("games/hsr/data/calc/modifiers-light-cones.json")).modifiers,...JSON.parse(read("games/hsr/data/calc/modifiers-relics-ornaments.json")).modifiers]};
    const app=await tool(undefined,extraData);app.state.characterId="1505";app.state.coneId="21066";
    for(const [key,value]of Object.entries({atk:3000,elation:50,critRate:50,critDamage:100}))app.node(`hsrStat-${key}`).value=String(value);
    app.node("hsrPunchline").value="20";
    assert.ok(Math.abs(app.calculate().find(r=>r.breakdown.damageFormula==="elation").nonCrit-6455.558016346154)<1e-8);
    app.state.modifierInputs["lc-21066-elation-skill"]=false;
    assert.ok(Math.abs(app.calculate().find(r=>r.breakdown.damageFormula==="elation").nonCrit-6197.335695692308)<1e-8);
    app.state.party[0]={...app.state.party[0],characterId:"1503",relicId:"133",relicMode:"4pc"};
    app.state.modifierInputs["lc-21066-elation-skill"]=true;app.state.modifierInputs["relic-133-ally-elation-active"]=true;app.state.modifierInputs["relic-133-certified-banger-crit-active"]=true;
    const result=app.calculate().find(r=>r.breakdown.damageFormula==="elation");
    assert.ok(Math.abs(result.expected-11144.87535942)<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/爆笑の褒美が10以上/);assert.match(app.node("hsrResults").innerHTML,/バカンスのひと時・愉悦スキル中の防御無視/);
    app.node("hsrStat-elation").handlers.input();const restored=await tool(app.storage,extraData);
    assert.equal(restored.state.party[0].relicId,"133");assert.equal(restored.state.coneId,"21066");
    for(const key of ["lc-21066-elation-skill","relic-133-ally-elation-active","relic-133-certified-banger-crit-active"])assert.equal(restored.state.modifierInputs[key],true);
    assert.ok(Math.abs(restored.calculate().find(r=>r.breakdown.damageFormula==="elation").expected-result.expected)<1e-8);
    restored.state.party[0].relicMode="2+2";
    assert.ok(Math.abs(restored.calculate().find(r=>r.breakdown.damageFormula==="elation").nonCrit-6455.558016346154)<1e-8);
});


test("Pearl party E1 restores eidolon, automatic path count and toggle, and blocks unknown party counts", async () => {
  const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
  const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
  const overrides=JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
  const extraData={characters:catalog.characters,attacks:generated.filter(a=>["150501","150520"].includes(a.id)).map(a=>({...a,...overrides.find(o=>o.id===a.id)})),
    structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1503")};
  const app=await tool(undefined,extraData);app.state.characterId="1505";
  for(const [key,value]of Object.entries({atk:3000,elation:50,critRate:50,critDamage:100}))app.node(`hsrStat-${key}`).value=String(value);
  app.node("hsrPunchline").value="20";
  const damage=()=>app.calculate().find(r=>r.breakdown.damageFormula==="elation");
  assert.ok(Math.abs(damage().nonCrit-6197.335695692308)<1e-8);
  app.state.party[0]={...app.state.party[0],characterId:"1503",eidolon:0};
  app.state.modifierInputs["pearl-e1-party-elation"]=true;
  assert.equal(damage().breakdown.elationPercent,50);
  app.state.party[0].eidolon=1;
  assert.equal(damage().breakdown.elationPercent,60);
  app.state.party[1]={...app.state.party[1],characterId:"1502"};assert.equal(damage().breakdown.elationPercent,70);
  app.state.party[2]={...app.state.party[2],characterId:"1513"};const result=damage();
  assert.ok(Math.abs(result.nonCrit-8676.26997396923)<1e-8);
  assert.match(app.node("hsrResults").innerHTML,/愉悦キャラクター数（攻撃者を含む） 4人/);
  app.node("hsrStat-elation").handlers.input();const restored=await tool(app.storage,extraData);
  assert.equal(restored.state.party[0].eidolon,1);assert.equal(restored.state.modifierInputs["pearl-e1-party-elation"],true);
  assert.ok(Math.abs(restored.calculate().find(r=>r.breakdown.damageFormula==="elation").nonCrit-result.nonCrit)<1e-8);
  restored.state.modifierInputs["pearl-e1-party-elation"]=false;
  assert.equal(restored.calculate().find(r=>r.breakdown.damageFormula==="elation").breakdown.elationPercent,50);
  restored.state.party[2].characterId="missing";restored.state.modifierInputs["pearl-e1-party-elation"]=true;
  assert.equal(restored.calculate().length,0);assert.match(restored.node("hsrWarnings").innerHTML,/愉悦人数を確認できません/);
  restored.state.modifierInputs["pearl-e1-party-elation"]=false;
  assert.ok(restored.calculate().length>0,"unknown party member must not block an inactive E1");
});


test("Summer Songbirds uses independent talent level, validates Fever state and restores strict inputs", async () => {
  const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
  const extraData={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>a.id==="150301"),structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-robin-summeretto.json")).modifiers};
  const app=await tool(undefined,extraData);app.state.characterId="1503";
  app.node("hsrStat-def").value="3000";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
  assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
  app.state.party[0]={...app.state.party[0],characterId:"1512",eidolon:0,level:10};
  const set=(key,value)=>app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredInput:key,structuredStrict:"true"},value}});
  app.state.modifierInputs["robin-songbirds-vulnerability"]=true;
  for(const [count,nc]of [[0,972],[1,1049.76],[2,1088.64],[3,1127.52]]){set("robin-songbirds-count",String(count));assert.ok(Math.abs(app.calculate()[0].nonCrit-nc)<1e-9);}
  assert.match(app.node("hsrWarnings").innerHTML,/防御無視を除外した比較値/);
  app.state.modifierInputs["robin-summeretto-fever"]=true;app.state.modifierInputs["robin-summeretto-vibes"]=12;
  assert.ok(Math.abs(app.calculate()[0].nonCrit-1259.7988826815642)<1e-9);
  assert.match(app.node("hsrResults").innerHTML,/Lv6・3体/);assert.match(app.node("hsrResults").innerHTML,/夏の歌鳥・敵全体の被ダメージ増加/);assert.match(app.node("hsrResults").innerHTML,/フィーバー領域・味方全体の防御無視/);
  app.node("hsrStat-def").handlers.input();
  const restored=await tool(app.storage,extraData);
  assert.equal(restored.state.modifierInputs["robin-songbirds-count"],3);assert.equal(restored.state.modifierInputs["robin-songbirds-vulnerability"],true);
  assert.ok(Math.abs(restored.calculate()[0].nonCrit-1259.7988826815642)<1e-9);
  set("robin-songbirds-talent-level","1");assert.ok(Math.abs(app.calculate()[0].nonCrit-1172.9162011173185)<1e-9);
  set("robin-songbirds-count","2");assert.equal(app.calculate().length,0);assert.match(app.node("hsrWarnings").innerHTML,/3体必要/);
  app.state.modifierInputs["robin-summeretto-fever"]=false;
  set("robin-songbirds-count","");assert.equal(app.calculate().length,0);assert.ok(Number.isNaN(app.state.modifierInputs["robin-songbirds-count"]));
  const blank=await tool(app.storage,extraData);assert.ok(Number.isNaN(blank.state.modifierInputs["robin-songbirds-count"]));assert.equal(blank.calculate().length,0);
  set("robin-songbirds-count","0");assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
  set("robin-songbirds-count","4");assert.equal(app.calculate().length,0);
  set("robin-songbirds-count","1.5");assert.equal(app.calculate().length,0);
  set("robin-songbirds-count","1");set("robin-songbirds-talent-level","");assert.equal(app.calculate().length,0);assert.match(app.node("hsrWarnings").innerHTML,/精霊天賦Lv/);
  app.state.modifierInputs["robin-songbirds-vulnerability"]=false;assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
});
