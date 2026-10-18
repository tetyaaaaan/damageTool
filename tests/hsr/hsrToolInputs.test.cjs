const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

async function tool() {
    const nodes = new Map();
    const html = read("games/hsr/index.html");
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
        querySelectorAll: (selector) => selector === "[data-stat]" ? statKeys.map((key) => node(`hsrStat-${key}`)) : [] };
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const data = { characters: [
        { id: "sample", name: "Sample", element: "Ice", skills: [], base: { hp: 1000, atk: 500, def: 400, speed: 100 } },
        catalog.characters.find((item) => item.id === "1202")
    ], lightCones: [{ id: "cone", name: "Cone", base: { hp: 100, atk: 200, def: 100 } }], relicSets: [], enemies: [],
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-tingyun.json")).modifiers,
        attacks: [{ id: "sample-normal", characterId: "sample", name: "Sample attack", type: "normal", element: "Ice", traceKey: "normal", multipliers: [100], scalingStat: "atk", support: { status: "calculable", verified: true } }], breakBaseDamage: { 80: 3767.5533 } };
    const window = { HsrCalcData: { load: async () => data }, HsrModifierRuntime: require("../../games/js/hsrModifierRuntime.js") };
    const context = { window, document, console, requestAnimationFrame: (callback) => callback() };
    vm.createContext(context);
    vm.runInContext(read("games/js/hsrCalcEngine.js"), context);
    const results = [];
    const engine = window.HsrCalcEngine;
    window.HsrCalcEngine = { ...engine, calculate(input) { const result = engine.calculate(input); results.push(result); return result; } };
    vm.runInContext(read("games/js/hsrApp.js"), context);
    await initialize();
    const state = window.HsrTool.getState();
    state.characterId = "sample";
    function calculate() { results.length = 0; node("hsrCalculateButton").handlers.click(); return results; }
    return { window, state, node, calculate };
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
    app.window.HsrTool.applyProfileCharacter({ id: "sample", level: 80, stats: { hp: 5000, atk: 2000, def: 900 } });
    assert.equal(app.calculate()[0].breakdown.baseDamage, 2000);
    const mapperWindow = {};
    vm.runInNewContext(read("games/js/hsrProfileMapper.js"), { window: mapperWindow });
    const profile = mapperWindow.HsrProfileMapper.mapProfileResponse({ detailInfo: { avatarDetailList: [{ avatarId: "sample", level: 70 }] } }, app.state.data).characters[0];
    app.window.HsrTool.applyProfileCharacter(profile);
    assert.equal(app.node("hsrStat-atk").value, "");
    assert.equal(app.calculate().length, 0);
    app.node("hsrStat-atk").value = "1500";
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
    for (const id of ["150120", "150220", "150621", "800920", "801020", "140603", "150504"]) {
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
    test(cid + ' summer form displays only its Basic ATK and stops missing reference inputs', async () => {
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
        assert.match(app.node('hsrWarnings').innerHTML, /のみ計算対応.*計算対象外/);
        assert.equal(app.state.data.attacks.length, 1, 'no unsupported skills are implicitly registered');
    });
}
