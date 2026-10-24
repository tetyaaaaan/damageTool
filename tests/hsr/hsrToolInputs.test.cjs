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
                handlers, attributes: {}, hidden: false, textContent: "", _html: "", focused: null, scrolled: null,
                setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
                focus(options) { this.focused = options; }, scrollIntoView(options) { this.scrolled = options; },
                set innerHTML(value) { this._html = value; this.innerHTMLWrites = (this.innerHTMLWrites || 0) + 1; const selected = value.match(/value="([^"]*)" selected/); if (selected) this.value = selected[1]; },
                get innerHTML() { return this._html; },
                addEventListener(event, callback) { handlers[event] = callback; }, querySelectorAll: () => [], querySelector: () => null, classList: {add(){},remove(){}}, close(){this.open=false;}, showModal() { this.open = true; } });
        }
        return nodes.get(id);
    }
    let initialize;
    const document = { body: { classList: { add() {}, remove(){} } }, querySelector:()=>null, getElementById: node, addEventListener: (_, callback) => { initialize = callback; },
        querySelectorAll: (selector) => selector === "[data-stat]" ? statKeys.map((key) => node(`hsrStat-${key}`)) : selector === ".hsr-build-fieldset input,.hsr-build-fieldset select" ? formIds.map(node) : selector === '[aria-invalid="true"]' ? [...nodes.values()].filter((item) => item.attributes["aria-invalid"] === "true") : [] };
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const data = { characters: [
        { id: "sample", name: "Sample", element: "Ice", skills: [], base: { hp: 1000, atk: 500, def: 400, speed: 100 } },
        catalog.characters.find((item) => item.id === "1202")
    ], lightCones: [{ id: "cone", name: "Cone", base: { hp: 100, atk: 200, def: 100 } }], relicSets: [], enemies: [],
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-tingyun.json")).modifiers,
        attacks: [{ id: "sample-normal", characterId: "sample", name: "Sample attack", type: "normal", element: "Ice", traceKey: "normal", multipliers: [100], scalingStat: "atk", support: { status: "calculable", verified: true } }], breakBaseDamage: { 80: 3767.5533 } };
    Object.assign(data, extraData);
    const window = { matchMedia:()=>({matches:false}), localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }, HsrCalcData: { load: async () => data }, HsrModifierRuntime: require("../../games/js/hsrModifierRuntime.js") };
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


test("an invalid attack field leaves unrelated valid attacks calculable", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.state.data.attacks.push({ ...app.state.data.attacks[0], id: "sample-def", name: "DEF attack", scalingStat: "def" });
    app.node("hsrStat-def").value = "";
    const results = app.calculate();
    assert.equal(results.length, 1);
    assert.equal(results[0].breakdown.baseDamage, 1000);
    assert.match(app.node("hsrResults").innerHTML, /data-hsr-input-target="hsrStat-def"/);
});


test("calculation feedback marks and focuses the offending field without requiring speed for damage", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-speed").value = "";
    app.node("hsrStat-speed").handlers.input();
    app.node("hsrActionWindow").handlers.input();
    assert.equal(app.calculate().length, 1);
    const emptySpeedSummary = app.node("hsrActionSummary").textContent;
    assert.match(emptySpeedSummary, /速度/);
    assert.doesNotMatch(emptySpeedSummary, /第1ラウンドに\d+回行動/);
    assert.doesNotMatch(emptySpeedSummary, /AV/);
    app.node("hsrStat-atk").value = "";
    assert.equal(app.calculate().length, 0);
    assert.equal(app.node("hsrStat-atk").attributes["aria-invalid"], "true");
    assert.equal(app.node("hsrWarnings").hidden, true, "missing input is inline feedback, not a warning panel");
    assert.match(app.node("hsrCalculationFeedback").innerHTML, /data-hsr-input-target="hsrStat-atk"/);
    app.node("hsrCalculationFeedback").handlers.click({ target: { closest: () => ({ dataset: { hsrInputTarget: "hsrStat-atk" } }) } });
    assert.equal(app.node("hsrStat-atk").focused.preventScroll, true);
    assert.equal(app.node("hsrStat-atk").scrolled.behavior, "smooth"); assert.equal(app.node("hsrStat-atk").scrolled.block, "center");
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-atk").handlers.input();
    assert.equal(app.node("hsrWarnings").hidden, true);
    assert.equal(app.node("hsrCalculationFeedback").innerHTML, "");
    assert.equal(app.node("hsrDirtyNotice").hidden, false, "editing keeps prior results marked stale");
});

test("first-round action count uses exact final speed and the 150 AV boundaries", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    const summary = () => app.node("hsrActionSummary").textContent || app.node("hsrActionSummary").innerHTML;
    const cases = [[100, 1], [120, 1], [134, 2], [160, 2]];
    for (const [speed, actions] of cases) {
        app.node("hsrStat-speed").value = String(speed);
        app.node("hsrStat-speed").handlers.input();
        assert.match(summary(), /速度/);
        assert.match(summary(), new RegExp(String(speed)), `speed ${speed} is shown`);
        assert.match(summary(), new RegExp(`第1ラウンドに${actions}回行動`), `speed ${speed}`);
    }

    // Independent mathematical thresholds for floor(150 * speed / 10000):
    // 66 2/3 gives the first action, 133 1/3 the second, and 200 the third.
    const boundaryCases = [
        [66.6666, 0], [10000 / 150, 1], [66.6667, 1],
        [133.3333, 1], [10000 / 75, 2], [133.3334, 2],
        [199.9999, 2], [200, 3], [200.0001, 3],
        [400 / 3 - 0.0001, 1], [400 / 3, 2], [400 / 3 + 0.0001, 2]
    ];
    for (const [speed, actions] of boundaryCases) {
        app.node("hsrStat-speed").value = String(speed);
        app.node("hsrStat-speed").handlers.input();
        assert.match(summary(), new RegExp(`第1ラウンドに${actions}回行動`), `boundary ${speed}`);
    }

    // This value is displayed as a whole-number speed in the stat summary,
    // but the internal value must still cross the exact 2-action threshold.
    const fractionalThreshold = 133.33333333333334;
    app.node("hsrStat-speed").value = String(fractionalThreshold);
    app.node("hsrStat-speed").handlers.input();
    assert.equal(app.state.stats.speed, fractionalThreshold);
    assert.match(summary(), /第1ラウンドに2回行動/);
    assert.equal(app.calculate().length, 1, "speed is not a required damage input");

    app.node("hsrStat-speed").value = "0.5";
    app.node("hsrStat-speed").handlers.input();
    assert.match(summary(), /第1ラウンドに0回行動/, "positive fractional speed uses its exact base AV without a speed=1 clamp");
});

test("blank, zero, and invalid speed show guidance without blocking damage", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    for (const value of ["", "0", "not-a-number", "-1"]) {
        app.node("hsrStat-speed").value = value;
        app.node("hsrStat-speed").handlers.input();
        const summary = app.node("hsrActionSummary").textContent;
        assert.match(summary, /速度/);
        assert.doesNotMatch(summary, /第1ラウンドに\d+回行動/);
        assert.equal(app.calculate().length, 1, `speed ${JSON.stringify(value)} must not stop unrelated damage`);
    }
});

test("UID profile speed keeps fractional precision for first-round actions after display rounding", async () => {
    const app = await tool();
    const speed = 133.3334;
    app.window.HsrTool.applyProfileCharacter({ id: "sample", level: 80, eidolon: 0, traces: [], stats: { atk: 1000, speed } });
    assert.equal(app.state.stats.speed, speed);
    assert.equal(app.node("hsrStat-speed").value, "133", "the field may display a rounded whole number");
    const summary = app.node("hsrActionSummary").textContent || app.node("hsrActionSummary").innerHTML;
    assert.match(summary, /第1ラウンドに2回行動/);
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
    assert.match(app.node("hsrCalculationFeedback").innerHTML, /基礎/);
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
    assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
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
    assert.match(app.node("hsrResults").innerHTML, /data-support-status="calculable"[^>]*>計算可能/);
    attack.support = { status: "review", verified: false };
    app.calculate();
    assert.match(app.node("hsrResults").innerHTML, /data-support-status="review"[^>]*>参考値/);
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


test("trace selectors respect E0 caps and exact primary-skill eidolon bonuses", async () => {
    const app = await tool();
    const sample = app.state.data.characters.find(item => item.id === "sample");
    sample.skills = [
        { id: "sample-normal-id", type: "Normal", params: Array.from({ length: 7 }, () => [1]) },
        { id: "sample-skill-id", type: "BPSkill", params: Array.from({ length: 12 }, () => [1]) },
        { id: "sample-memo-id", type: "MemospriteSkill", params: Array.from({ length: 8 }, () => [1]) }
    ];
    sample.eidolons = [{ rank: 3, levelUpSkills: [{ id: "sample-normal-id", num: 1 }, { id: "other-skill-id", num: 2 }] }];
    app.window.HsrTool.applyProfileCharacter({ id: "sample", level: 80, eidolon: 0, traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "MemospriteSkill", level: 6 }], stats: { atk: 1000 } });
    assert.match(app.node("hsrNormalTrace").innerHTML, /value="6"/);
    assert.doesNotMatch(app.node("hsrNormalTrace").innerHTML, /value="7"/);
    assert.match(app.node("hsrSkillTrace").innerHTML, /value="10"/);
    assert.doesNotMatch(app.node("hsrSkillTrace").innerHTML, /value="11"/);
    assert.match(app.node("hsrMemSkillTrace").innerHTML, /value="6"/);
    app.state.eidolon = 3; app.node("hsrEidolon").value = "3"; app.node("hsrEidolon").handlers.change({ target: { value: "3" } });
    app.window.HsrTool.applyProfileCharacter({ id: "sample", level: 80, eidolon: 3, traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "MemospriteSkill", level: 6 }], stats: { atk: 1000 } });
    app.state.eidolon = 3; app.node("hsrEidolon").value = "3"; app.node("hsrEidolon").handlers.change({ target: { value: "3" } });
    assert.equal(app.state.eidolon, 3);
    assert.match(app.node("hsrNormalTrace").innerHTML, /value="7"/);
    assert.doesNotMatch(app.node("hsrSkillTrace").innerHTML, /value="12"/);
    assert.doesNotMatch(app.node("hsrMemSkillTrace").innerHTML, /value="8"/);
    assert.equal(app.state.traceLevels.normal, 6, "a rank bonus expands the selector but does not auto-increment the UID level");
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
    for (const text of ["最終入力で管理する効果・再加算なし", "装備選択による自動加算は行わず", "Included ATK", "データ未対応・表示のみ（計算対象外）", "Unsupported ATK", "この効果は計算未対応です", "条件未成立／対象外", "発動条件を満たしていません"]) assert.ok(html.includes(text), text);
});

test("numeric provider condition edits preserve the condition list DOM", async () => {
    const app = await tool();
    app.state.party[0] = { ...app.state.party[0], characterId: "1202", atk: 3000, level: 10 };
    app.node("hsrConditionDialogOpen").handlers.click();
    const list = app.node("hsrConditionList");
    const html = list.innerHTML;
    const writes = list.innerHTMLWrites;
    const input = { dataset: { structuredProviderStat: "atk", providerId: "1202" }, value: "3500" };
    app.node("hsrConditionDialog").handlers.input({ target: input });
    app.node("hsrConditionDialog").handlers.change({ target: input });
    assert.equal(app.state.party[0].atk, 3500);
    assert.equal(list.innerHTML, html);
    assert.equal(list.innerHTMLWrites, writes, "numeric changes update facts without replacing the full list");
});

test("condition summary separates selected, applied, missing and final-input counts and clears Pearl state on character switch", async () => {
    const app = await tool();
    app.node("hsrStat-atk").value = "1000";
    app.state.conditions.push(
        { id: "summary-applied", name: "Selected bonus", category: "damageBonus", value: 20, enabled: true, unit: "percent", target: { attackTypes: ["all"] } },
        { id: "summary-missing", name: "Missing bonus", category: "damageBonus", value: 10, enabled: true, unit: "percent", inputWarnings: ["入力が必要です"], applicable: false },
        { id: "summary-final", name: "Final input", category: "damageBonus", value: 10, enabled: true, displayOnly: true, inputPolicy: "includedInFinalStats" }
    );
    app.state.characterId = "1503";
    app.state.modifierInputs["pearl-non-elation-deep-learning"] = true;
    app.node("hsrStat-atk").handlers.input();
    assert.match(app.node("hsrConditionTitle").textContent, /選択中 2件/);
    assert.match(app.node("hsrConditionTitle").textContent, /入力不足 1件/);
    assert.doesNotMatch(app.node("hsrConditionTitle").textContent, /計算に適用済み/);
    assert.doesNotMatch(app.node("hsrConditionTitle").textContent, /パール：深層学習中/,
        "Pearl's enhancement state is an attack assumption, not an optional damage modifier");
    assert.match(app.node("hsrConditionHelp").textContent, /最終ステータスで管理 1件/);

    app.state.characterId = "sample";
    app.state.modifierInputs["pearl-non-elation-deep-learning"] = false;
    app.node("hsrStat-atk").handlers.input();
    assert.doesNotMatch(app.node("hsrConditionTitle").textContent, /パール/);
    app.state.conditions = app.state.conditions.filter(item => item.id !== "summary-missing");
    assert.equal(app.calculate().length, 1);
    assert.match(app.node("hsrConditionTitle").textContent, /計算に適用済み 1件/);
    app.state.conditions.push({ id: "summary-missing", name: "Missing bonus", category: "damageBonus", value: 10, enabled: true, unit: "percent", inputWarnings: ["入力が必要です"], applicable: false });

    app.node("hsrStat-atk").value = "1100";
    app.node("hsrStat-atk").handlers.input();
    assert.doesNotMatch(app.node("hsrConditionTitle").textContent, /計算に適用済み/);
    assert.match(app.node("hsrConditionTitle").textContent, /選択中 2件/);
    assert.match(app.node("hsrConditionTitle").textContent, /入力不足 1件/);
});

test("condition modal groups attack, combat, final-stat and excluded purposes separately", async () => {
    const app = await tool();
    const makeModifier = (id, purpose, name, inputKey) => ({
        id,
        source: { kind: "trace", id: "sample", skillId: id, traceId: id },
        name,
        description: name,
        category: "damageBonus",
        unit: "percent",
        value: { kind: "fixed", fixed: 10 },
        activation: { mode: inputKey ? "toggle" : "always", inputKey, default: false },
        target: { owner: "self", attackTypes: ["normal"] },
        inputPolicy: purpose === "finalStats" ? "includedInFinalStats" : "conditional",
        support: { status: purpose === "attack" || purpose === "excluded" ? "displayOnly" : "calculable", verified: true }
    });
    app.state.data.structuredModifiers = [
        makeModifier("scope", "attack", "Attack selector", "sample-attack-selector"),
        makeModifier("combat", "combat", "Combat toggle", "sample-combat-toggle"),
        makeModifier("final", "finalStats", "Final stat effect", ""),
        makeModifier("excluded", "excluded", "Excluded effect", "")
    ];
    app.state.data.attacks[0].modifierInputKey = "sample-attack-selector";
    app.state.conditionTab = "軌跡";
    app.node("hsrConditionDialogOpen").handlers.click();
    const html = app.node("hsrConditionList").innerHTML;
    for (const purpose of ["combat", "finalStats", "excluded"]) assert.match(html, new RegExp(`data-condition-purpose="${purpose}"`));
    assert.doesNotMatch(html, /Attack selector/, "availability-only selectors are shown as attack assumptions, not in the modifier modal");
    assert.match(html, /Combat toggle/);
    assert.match(html, /Final stat effect/);
    assert.match(html, /Excluded effect/);
});

test("party condition cards group by provider and retain attack scope independently of ON/OFF", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const files=require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root);
    const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const merged=new Map(generated.map(attack=>[attack.id,attack]));
    files.attackOverrides.forEach(attack=>merged.set(attack.id,{...merged.get(attack.id),...attack}));
    const data={characters:catalog.characters,attacks:[...merged.values()],structuredModifiers:files.modifiers,
        lightCones:catalog.lightCones,relicSets:catalog.relicSets,enemies:catalog.enemies};
    const app=await tool(undefined,data);app.state.characterId="1003";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    app.node("hsrEnemyLevel").value="80";app.node("hsrEnemyResistance").value="20";app.node("hsrToughnessState").value="active";
    app.state.party[0]={...app.state.party[0],characterId:"1309",source:"manual",eidolon:0,level:10,atk:3000,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};
    app.state.party[1]={...app.state.party[1],characterId:"1313",source:"manual",eidolon:0,level:10,atk:3000,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};
    const selectedKeys=["robin-skill-damage-active","robin-talent-crit-active","robin-concerto-atk-active","sunday-skill-damage-active","sunday-talent-crit-active","sunday-beatified-active"];
    selectedKeys.forEach(key=>{app.state.modifierInputs[key]=false;});
    const before=Object.fromEntries(selectedKeys.map(key=>[key,app.state.modifierInputs[key]]));
    const normal=()=>app.calculate().find(result=>result.attack.name.includes("武装調律"));
    assert.ok(Math.abs(normal().nonCrit-1080)<1e-8);

    const showConditions=()=>{app.state.conditionTab="パーティ";app.node("hsrConditionDialogOpen").handlers.click();return app.node("hsrConditionList").innerHTML;};
    const providerGroup=(html,id)=>{
        const start=html.indexOf(`data-hsr-provider="${id}"`);assert.notEqual(start,-1,`provider ${id} has a group`);
        const next=html.indexOf('data-hsr-provider="',start+1);return html.slice(start,next<0?html.length:next);
    };
    const providerOrder=html=>[...html.matchAll(/data-hsr-provider="(1309|1313)"/g)].map(match=>match[1]);
    const scopeFacts=group=>[...group.matchAll(/data-condition-fact="scope"[^>]*>([\s\S]*?)<\/dd>/g)].map(match=>match[1].replace(/<[^>]+>/g,""));
    const assertGroups=(html,targetName="姫子")=>{
        const combatStart=html.indexOf('data-condition-purpose="combat"');assert.notEqual(combatStart,-1);
        const finalStart=html.indexOf('data-condition-purpose="finalStats"',combatStart);
        const combat=html.slice(combatStart,finalStart<0?html.length:finalStart);
        assert.equal((combat.match(/data-hsr-provider="1309"/g)||[]).length,1);
        assert.equal((combat.match(/data-hsr-provider="1313"/g)||[]).length,1);
        const robin=providerGroup(combat,"1309"),sunday=providerGroup(combat,"1313");
        for(const name of ["ロビン","飛翔のアリア","調和の純正律","協奏"])assert.ok(robin.includes(name),name);
        for(const name of ["サンデー","紙と式典の賜物","肉体の告解","祝福されし者"])assert.ok(sunday.includes(name),name);
        const order=(group,ids)=>ids.map(id=>group.indexOf(id));
        for(const [group,ids] of [[robin,["trace:1309:130902:party-damage","trace:1309:130904:party-crit-damage","trace:1309:130903:concerto-atk"]],
            [sunday,["trace:1313:131302:party-damage","trace:1313:131304:party-crit-rate","trace:1313:131303:beatified-crit-damage"]]]){
            const indexes=order(group,ids);assert.ok(indexes.every(index=>index>=0));assert.ok(indexes[0]<indexes[1]&&indexes[1]<indexes[2],JSON.stringify(indexes));
        }
        assert.ok(combat.includes(targetName),`scope lists ${targetName} as current target`);assert.match(combat,/通常攻撃/);
        assert.match(robin,/data-condition-fact="scope"/);assert.match(sunday,/data-condition-fact="scope"/);
        return {combat,order:providerOrder(combat),robin,sunday,robinScope:scopeFacts(robin),sundayScope:scopeFacts(sunday)};
    };
    const initial=assertGroups(showConditions());
    assert.deepEqual(Object.fromEntries(selectedKeys.map(key=>[key,app.state.modifierInputs[key]])),before,"rendering condition groups does not turn optional effects on");
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-skill-damage-active"},checked:true}});
    assert.ok(Math.abs(normal().nonCrit-1620)<1e-8,"Robin Skill raises Himeko Basic from 1080 to 1620");
    const on=assertGroups(app.node("hsrConditionList").innerHTML);assert.deepEqual(on.order,initial.order,"provider grouping order is stable when a support is ON");
    assert.deepEqual(on.robinScope,initial.robinScope,"target scope is computed independently of activation state");
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-skill-damage-active"},checked:false}});
    assert.ok(Math.abs(normal().nonCrit-1080)<1e-8);const off=assertGroups(app.node("hsrConditionList").innerHTML);assert.deepEqual(off.order,initial.order);assert.deepEqual(off.robinScope,initial.robinScope);

    // Robin ATK support remains out of scope for Pearl's DEF-scaling Basics even while its toggle is active.
    app.state.characterId="1503";app.state.data.attacks=files.attackOverrides.filter(attack=>["150301","150310"].includes(attack.id));
    app.node("hsrStat-def").value="3000";app.node("hsrEidolon").value="0";
    const pearl=()=>app.calculate().filter(result=>["筆運び・断流臨模","筆運び・波頭描き（非愉悦の底本）"].includes(result.attack.name));
    const pearlBase=pearl().map(result=>result.nonCrit);assert.equal(pearlBase.length,2);
    const pearlOff=assertGroups(showConditions(),"パール");
    const robinAtkGroup=providerGroup(pearlOff.combat,"1309");
    assert.match(robinAtkGroup,/現在の計算対象には適用されません|対象外/);
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-atk-active"},checked:true}});
    assert.deepEqual(pearl().map(result=>result.nonCrit),pearlBase,"ATK support stays out of scope for DEF-scaled Pearl attacks");
    const pearlOn=assertGroups(app.node("hsrConditionList").innerHTML,"パール");
    assert.match(providerGroup(pearlOn.combat,"1309"),/現在の計算対象には適用されません|対象外/);
    assert.deepEqual(pearlOn.robinScope,pearlOff.robinScope,"ATK support scope remains unchanged when its toggle is ON");
});

test("party provider fields follow the selected effect while scope stays visible and independent", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const files=require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root);
    const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const merged=new Map(generated.map(attack=>[attack.id,attack]));
    files.attackOverrides.forEach(attack=>merged.set(attack.id,{...merged.get(attack.id),...attack}));
    const data={characters:catalog.characters,attacks:[...merged.values()],structuredModifiers:files.modifiers,
        lightCones:catalog.lightCones,relicSets:catalog.relicSets,enemies:catalog.enemies};
    const app=await tool(undefined,data);app.state.characterId="1003";
    app.state.party[0]={...app.state.party[0],characterId:"1309",source:"manual",eidolon:0,level:10,atk:3000,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};
    app.state.modifierInputs["robin-concerto-atk-active"]=false;
    const openPartyConditions=()=>{app.state.conditionTab="パーティ";app.node("hsrConditionDialogOpen").handlers.click();return app.node("hsrConditionList").innerHTML;};
    let html=openPartyConditions();
    const robinGroup=()=>{
        const start=app.node("hsrConditionList").innerHTML.indexOf('data-hsr-provider="1309"');
        assert.notEqual(start,-1);
        const next=app.node("hsrConditionList").innerHTML.indexOf('data-hsr-provider="',start+1);
        return app.node("hsrConditionList").innerHTML.slice(start,next<0?undefined:next);
    };
    assert.match(robinGroup(),/data-structured-toggle="robin-concerto-atk-active"/,"provider activation remains available while OFF");
    assert.doesNotMatch(robinGroup(),/data-structured-provider-stat="atk"/,"unused provider input is hidden while OFF");
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-atk-active"},checked:true}});
    html=app.node("hsrConditionList").innerHTML;
    assert.match(robinGroup(),/data-structured-provider-stat="atk" data-provider-id="1309" value="3000"/,"turning the effect on reveals the provider's existing ATK without clearing it");
    assert.match(robinGroup(),/data-hsr-provider-settings="1309" data-hsr-provider-trace="ultimate"/,"trace shortcut routes to Robin's Ultimate level");
    const robinAtkCardStart=robinGroup().indexOf('data-hsr-condition-ids="trace:1309:130903:concerto-atk"');
    assert.notEqual(robinAtkCardStart,-1,"the individual Robin ATK support card is present");
    const robinAtkCard=robinGroup().slice(robinAtkCardStart,robinGroup().indexOf("</article>",robinAtkCardStart));
    const robinAtkScope=robinAtkCard.match(/<dd data-condition-fact="scope">([\s\S]*?)<\/dd>/)?.[1]||"";
    assert.match(robinAtkScope,/通常攻撃/,"the Himeko target scope names its Basic Attack");
    assert.doesNotMatch(robinAtkScope,/対象外|現在の計算対象外/,"Robin ATK support is applicable to Himeko's ATK-scaled Basic");
    assert.ok(html.includes("trace:1309:130903:concerto-atk"),"the Robin support condition remains grouped after activation");
    let traceSelector="",focused=false,scrolled=false;
    app.node("hsrPartyRows").querySelector=selector=>{traceSelector=selector;return {focus(){focused=true;},scrollIntoView(){scrolled=true;}};};
    app.node("hsrConditionDialog").handlers.click({target:{closest:selector=>selector==="[data-hsr-provider-settings]"?{dataset:{hsrProviderSettings:"1309",hsrProviderTrace:"ultimate"}}:null}});
    assert.equal(app.node("hsrPartyDialog").open,true,"the shortcut opens the party editor");
    assert.equal(traceSelector,'[data-party-trace="ultimate"][data-slot="0"]');
    assert.equal(focused,true,"the provider's Ultimate level receives focus");assert.equal(scrolled,true,"the focused level is brought into view");
});

test("rejoining a previously selected party provider restores its optional condition with a notice", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets,
        structuredModifiers:require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root).modifiers};
    const app=await tool(undefined,data);
    app.window.HsrTool.openSelection("party",0);
    app.node("hsrSelectionList").handlers.click({target:{closest:()=>({dataset:{selectionId:"1309"}})}});
    const clearPartySlot=()=>app.node("hsrPartyRows").handlers.click({target:{closest:(selector)=>selector==="[data-party-clear]"?{dataset:{partyClear:"0"}}:null}});
    assert.doesNotMatch(app.node("hsrConditionHelp").textContent,/前回の選択を復元しました/,"freshly selected OFF provider has no restoration notice");
    app.node("hsrConditionDialogOpen").handlers.click();
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-skill-damage-active"},checked:true}});
    clearPartySlot();
    assert.equal(app.state.party[0].characterId,"");
    const storage=app.storage;
    const absentAfterReload=await tool(storage,data);
    assert.equal(absentAfterReload.state.party[0].characterId,"");
    assert.equal(absentAfterReload.state.modifierInputs["robin-skill-damage-active"],true,"saved optional state remains while its provider is absent");
    assert.doesNotMatch(absentAfterReload.node("hsrConditionHelp").textContent,/前回の選択を復元しました/,"absence after a reload does not show a rejoin notice yet");
    absentAfterReload.window.HsrTool.openSelection("party",0);
    absentAfterReload.node("hsrSelectionList").handlers.click({target:{closest:()=>({dataset:{selectionId:"1309"}})}});
    absentAfterReload.node("hsrConditionDialogOpen").handlers.click();
    const html=absentAfterReload.node("hsrConditionList").innerHTML;
    assert.match(html,/data-hsr-selection-restored="1309"/,"provider header identifies a restored selection");
    assert.match(html,/前回の選択を復元しました/,"restoration is explained to the user");
    assert.equal(absentAfterReload.state.modifierInputs["robin-skill-damage-active"],true,"the previously selected condition is restored");
    const restored=await tool(storage,data);
    assert.equal(restored.state.party[0].characterId,"1309");
    assert.equal(restored.state.modifierInputs["robin-skill-damage-active"],true,"the existing saved condition survives reload");
});

test("Boothill Fanning selector and Standoff input share the attack purpose", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const data = {
        characters: catalog.characters,
        attacks: JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(attack => attack.id === "131508"),
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(item => item.source.id === "1315")
    };
    const app = await tool(undefined, data);
    app.state.characterId = "1315";
    app.state.conditionTab = "軌跡";
    app.node("hsrConditionDialogOpen").handlers.click();
    const html = app.node("hsrConditionList").innerHTML;
    const attackPurpose = html.indexOf('data-condition-purpose="attack"');
    assert.notEqual(attackPurpose, -1);
    assert.match(html.slice(attackPurpose), /ファニング・通常＋天賦撃破の計算条件/);
    assert.match(html.slice(attackPurpose), /九死の決闘・敵被ダメージ増加/);
    assert.match(html.slice(attackPurpose), /この状態の攻撃を計算する/);
    assert.doesNotMatch(html.slice(attackPurpose), /<strong>この条件を適用する<\/strong>/);
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
        assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
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
    assert.match(html, /class="genshin-result-value"/);
    assert.match(html, /data-hsr-result-detail=/);
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
    const incomplete = app.calculate();
    assert.equal(incomplete.length, 1, "the unrelated Normal attack remains available while Elation is incomplete");
    assert.equal(incomplete.some(item => item.breakdown.damageFormula === "elation"), false);
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
    assert.match(app.node('hsrCalculationFeedback').innerHTML, /元ダメージ/);
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


test("Pearl compares registered normal and enhanced Basic ATKs as separate assumed states", async () => {
    const {loadHsrDataFiles}=require("../../scripts/lib/hsrDataFiles.cjs");
    const files=loadHsrDataFiles(root);
    const app = await tool(undefined,{characters:JSON.parse(read('games/hsr/data/catalog.json')).characters,
        attacks:files.attackOverrides.filter(item=>item.characterId==='1503'),structuredModifiers:files.modifiers});
    app.state.characterId = '1503';
    app.node('hsrEnemyLevel').value = '80';
    app.node('hsrEnemyResistance').value = '20';
    app.node('hsrToughnessState').value = 'active';
    app.node('hsrStat-critRate').value = '50';
    app.node('hsrStat-critDamage').value = '100';
    for (const value of ['0', '', '-1', 'invalid']) {
        app.node('hsrStat-def').value = value;
        assert.equal(app.calculate().length, 0);
        assert.match(app.node('hsrCalculationFeedback').innerHTML, /防御力/);
    }
    app.node('hsrStat-def').value = '3000';
    const results = app.calculate();
    const normal = results.find(result => result.attack.name.includes("断流臨模"));
    const enhanced = results.find(result => result.attack.name.includes("波頭描き"));
    assert.equal(results.length, 2);
    assert.ok(Math.abs(normal.nonCrit - 972) < 1e-9);
    assert.ok(Math.abs(normal.crit - 1944) < 1e-9);
    assert.ok(Math.abs(normal.expected - 1458) < 1e-9);
    assert.ok(Math.abs(enhanced.nonCrit - 1080) < 1e-9);
    assert.ok(Math.abs(enhanced.crit - 2160) < 1e-9);
    assert.ok(Math.abs(enhanced.expected - 1620) < 1e-9);
    assert.equal(normal.breakdown.referenceValue, 3000);
    assert.equal(enhanced.breakdown.referenceValue, 3000);
    assert.match(app.node('hsrResults').innerHTML, /想定：深層学習中/);
    assert.match(app.node('hsrResults').innerHTML, /波頭描き/);
    assert.match(app.node('hsrResults').innerHTML, /data-support-status="calculable"/);
    assert.match(app.node('hsrResults').innerHTML, /防御力参照 × 攻撃倍率/);
    assert.match(app.node('hsrResults').innerHTML, /3,000 × 90%/);
    app.node('hsrNormalTrace').value = '1';
    const lowTrace = app.calculate();
    assert.ok(Math.abs(lowTrace.find(result => result.attack.name.includes("断流臨模")).nonCrit - 486) < 1e-9);
    assert.ok(Math.abs(lowTrace.find(result => result.attack.name.includes("波頭描き")).nonCrit - 540) < 1e-9);
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
            assert.match(app.node('hsrResults').innerHTML,/data-hsr-pending-input/);
        }
        app.node('hsrStat-' + stat).value = value;
        const result = app.calculate()[0];
        assert.ok(Math.abs(result.nonCrit - 1080) < 1e-9);
        assert.equal(result.breakdown.referenceValue, Number(value));
        assert.equal(result.breakdown.multiplierPercent, multiplier);
        assert.match(app.node('hsrResults').innerHTML, /data-support-status="calculable"/);
        assert.ok(app.node('hsrResults').innerHTML.includes(label + '参照 × 攻撃倍率'));
        assert.match(app.node('hsrResults').innerHTML, cid === '1513' ? /爆笑の褒美なし.*熱気0.*計算対象外/ : /専用入力・精霊のみモード.*計算対象外/);
        assert.equal(app.calculate().length, 1, 'conditional skills are not included without confirmation');
    });
}


test('Summer Robin Fever party input stops invalid Vibes and reports DEF ignore without other buffs', async () => {
  const app=await tool();
  app.state.data.characters=JSON.parse(read('games/hsr/data/catalog.json')).characters;
  app.state.characterId='1503';
  app.state.data.attacks=JSON.parse(read('games/hsr/data/attack-overrides.json')).overrides.filter(item=>['150301','150310'].includes(item.id));
  app.state.data.structuredModifiers=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
  app.state.party[0]={characterId:'1512',eidolon:0,level:10};
  app.node('hsrStat-def').value='3000';app.node('hsrStat-critRate').value='50';app.node('hsrStat-critDamage').value='100';
  app.node('hsrEnemyLevel').value='80';app.node('hsrEnemyResistance').value='20';app.node('hsrToughnessState').value='active';
  assert.equal(app.calculate().length,2);
  assert.ok(Math.abs(app.calculate().find(r=>r.attack.name.includes('断流臨模')).nonCrit-972)<1e-9);
  assert.ok(Math.abs(app.calculate().find(r=>r.attack.name.includes('波頭描き')).nonCrit-1080)<1e-9);
  app.state.modifierInputs['robin-summeretto-fever']=true;
  assert.equal(app.calculate().length,0);assert.match(app.node('hsrResults').innerHTML,/data-hsr-pending-input/);
  app.state.modifierInputs['robin-summeretto-vibes']=50;
  const supported=app.calculate();
  assert.ok(Math.abs(supported.find(r=>r.attack.name.includes('断流臨模')).nonCrit-1215)<1e-9);
  assert.ok(Math.abs(supported.find(r=>r.attack.name.includes('波頭描き')).nonCrit-1350)<1e-9);
  assert.match(app.node('hsrResults').innerHTML,/0%／40%/);
  assert.match(app.node('hsrResults').innerHTML,/×0.625/);
  app.state.party[0].eidolon=1;assert.equal(app.calculate().length,0);assert.match(app.node('hsrResults').innerHTML,/data-hsr-pending-input/);
  app.state.party[0].eidolon=0;app.state.party[0].level=0;assert.equal(app.calculate().length,0);
  app.state.party[0].level=10;app.state.modifierInputs['robin-summeretto-fever']=false;
  const off=app.calculate();assert.equal(off.length,2);
  assert.ok(Math.abs(off.find(r=>r.attack.name.includes('断流臨模')).nonCrit-972)<1e-9);
  assert.ok(Math.abs(off.find(r=>r.attack.name.includes('波頭描き')).nonCrit-1080)<1e-9);
});


test('UID import preserves precision, refuses missing crit/trace data and clears an unknown character', async () => {
    const app=await tool();
    const profile={id:'sample',level:80,eidolon:0,lightCone:{id:'cone',level:60,rank:2},traces:[{type:'Normal',level:6}],stats:{...app.state.stats,hp:5000,atk:1234.567891,def:900}};
    app.window.HsrTool.applyProfileCharacter(profile);
    assert.equal(app.state.coneId,'cone');assert.equal(app.node('hsrConeLevel').value,60);
    assert.equal(app.node('hsrStat-atk').value,'1234');
    assert.ok(Math.abs(app.calculate()[0].breakdown.referenceValue-1234.567891)<1e-9);
    const missingRank=structuredClone(profile);delete missingRank.lightCone.rank;app.window.HsrTool.applyProfileCharacter(missingRank);assert.equal(app.calculate().length,0);assert.match(app.node('hsrCalculationFeedback').innerHTML,/重畳ランク/);
    const missing=structuredClone(profile);delete missing.stats.critRate;missing.traces=[];
    app.window.HsrTool.applyProfileCharacter(missing);
    assert.equal(app.node('hsrStat-critRate').value,'');assert.equal(app.node('hsrNormalTrace').value,'');
    assert.equal(app.calculate().length,0);assert.match(app.node('hsrCalculationFeedback').innerHTML,/会心率/);
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
    assert.equal(restored.node('hsrStat-atk').value,'1234');assert.equal(restored.node('hsrStat-hp').value,'');assert.equal(restored.node('hsrStat-critRate').value,'0.0');
    assert.equal(restored.state.traceLevels.normal,4);assert.equal(restored.state.eidolon,2);assert.equal(restored.state.coneRank,3);assert.equal(restored.state.enemy.resistance,-20.25);
    assert.equal(restored.state.party[0].atk,2345.678901);assert.equal(restored.state.modifierInputs['tingyun-benediction'],true);assert.equal(restored.state.conditions[0].value,30.5);
    assert.equal(restored.node('hsrDirtyNotice').hidden,false);assert.doesNotMatch(restored.node('hsrResults').innerHTML,/hsr-attack-result/);
    assert.equal(restored.calculate().length,3, 'normal and Tingyun supplemental attacks are regenerated');
    restored.state.coneId='removed-cone';assert.equal(restored.calculate().length,0,'missing cone IDs cannot supply a guessed base for percentage buffs');assert.match(restored.node('hsrCalculationFeedback').innerHTML,/基礎攻撃力/);
    restored.node('hsrClearSavedInputs').handlers.click();assert.equal(app.storage.has(key),false);assert.equal(app.storage.get('tetinet:hsr:lastUid:v1'),'100000001');
});

test('HSR special damage and UID-edited inputs survive a reload with exact decimals', async () => {
    const app=await tool();
    app.window.HsrTool.applyProfileCharacter({id:'sample',level:80,traces:[{type:'Normal',level:6}],stats:{...app.state.stats,hp:5000,atk:1234.567891,def:900}});
    app.node('hsrStat-atk').value='2000.1234567';app.node('hsrStat-atk').handlers.input();
    app.node('hsrPunchline').value='0';app.node('hsrMerrymake').value='12.345678';app.node('hsrElationTrace').value='3';
    app.node('hsrTrueDamageActive').value='true';app.node('hsrTrueDamageSourceKind').value='finalNonTrueDamage';app.node('hsrOriginalDamage').value='1080.123456';app.node('hsrOriginalDamage').handlers.input();
    const restored=await tool(app.storage);
    assert.equal(restored.state.source,'api-edited');assert.equal(restored.node('hsrStat-atk').value,'2000');
    assert.equal(restored.state.stats.atk,2000.1234567);assert.equal(restored.node('hsrPunchline').value,'0');assert.equal(restored.state.elationInputs.merrymake,12.345678);assert.equal(restored.state.traceLevels.elation,3);
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
    const incomplete = app.calculate();
    assert.equal(incomplete.length, 1, "the valid Normal remains calculable without the Elation context");
    assert.equal(incomplete.some(item => item.breakdown.damageFormula === "elation"), false);
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
    assert.equal(restored.calculate().some(item => item.breakdown.damageFormula === "elation"), false);
});


test("Waveflair full Skill and Ultimate compare under explicit no-extra-Elation assumptions after reload", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const overrides = JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
    const expanded = JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers;
    const extraData = { characters: catalog.characters, attacks: overrides.filter(item => ["151301", "151302", "151303"].includes(item.id)), structuredModifiers: expanded };
    const app = await tool(undefined, extraData); app.state.characterId = "1513";
    for (const [key, value] of Object.entries({ atk: 3000, critRate: 50, critDamage: 100 })) app.node(`hsrStat-${key}`).value = String(value);
    assert.equal(app.calculate().length, 3, "registered attacks are listed as separate hypothetical comparisons");
    app.state.modifierInputs["waveflair-no-banger-zero-fervor"] = true;
    const results = app.calculate(); assert.equal(results.length, 3);
    assert.ok(Math.abs(results.find(item => item.attack.name.includes("フィニッシュ")).nonCrit - 2592) < 1e-8);
    assert.ok(Math.abs(results.find(item => item.attack.name.includes("荒波")).nonCrit - 4320) < 1e-8);
    assert.match(app.node("hsrResults").innerHTML, /攻撃力参照 × 攻撃倍率/);
    assert.doesNotMatch(app.node("hsrCalculationFeedback").innerHTML, /発動前の熱気0/);
    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, extraData);
    assert.equal(restored.state.modifierInputs["waveflair-no-banger-zero-fervor"], true);
    assert.equal(restored.calculate().length, 3);
    const beforeOff=restored.calculate().map(item=>[item.attack.name,item.nonCrit]);
    restored.state.modifierInputs["waveflair-no-banger-zero-fervor"] = false;
    assert.equal(restored.calculate().length, 3,"the availability selector does not hide comparison rows");
    assert.deepEqual(restored.calculate().map(item=>[item.attack.name,item.nonCrit]),beforeOff,"turning the legacy availability selector off does not change damage");
    restored.state.modifierInputs["waveflair-no-banger-zero-fervor"] = true;
    for (const value of ["", "0", "-1"]) { restored.node("hsrStat-atk").value = value; assert.equal(restored.calculate().some(item => ["フィニッシュ", "荒波"].some(name => item.attack.name.includes(name))), false); }
    restored.node("hsrStat-atk").value = "3000"; restored.node("hsrEidolon").value = "0"; restored.node("hsrSkillTrace").value = "11";
    assert.equal(restored.calculate().length, 2, "unrelated attack scopes remain calculable when the Skill trace is outside its supported range");
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
    restored.state.data.attacks.push({ id: "150399", characterId: "1503", name: "ATK-scaling comparison", element: "Ice", type: "normal", traceKey: "normal", target: "single", scalingStat: "atk", multipliers: [100], support: { status: "calculable", verified: true } });
    const lowerLevelResults = restored.calculate();
    assert.equal(lowerLevelResults.length, 1, "the valid DEF attack remains available when the selected ATK modifier lacks its base stat");
    assert.match(restored.node("hsrResults").innerHTML, /筆運び・断流臨模/);
    assert.match(restored.node("hsrResults").innerHTML, /ATK-scaling comparison/);
    assert.match(restored.node("hsrResults").innerHTML, /data-hsr-pending-input/);
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
  assert.equal(restored.calculate().length,1,"unknown party member excludes only the E1 elation bonus");assert.match(restored.node("hsrResults").innerHTML,/data-hsr-pending-input/);
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
  set("robin-songbirds-count","2");assert.equal(app.calculate().length,0);assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
  app.state.modifierInputs["robin-summeretto-fever"]=false;
  set("robin-songbirds-count","");assert.equal(app.calculate().length,0);assert.ok(Number.isNaN(app.state.modifierInputs["robin-songbirds-count"]));
  const blank=await tool(app.storage,extraData);assert.ok(Number.isNaN(blank.state.modifierInputs["robin-songbirds-count"]));assert.equal(blank.calculate().length,0);
  set("robin-songbirds-count","0");assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
  set("robin-songbirds-count","4");assert.equal(app.calculate().length,0);
  set("robin-songbirds-count","1.5");assert.equal(app.calculate().length,0);
  set("robin-songbirds-count","1");set("robin-songbirds-talent-level","");assert.equal(app.calculate().length,0);assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
  app.state.modifierInputs["robin-songbirds-vulnerability"]=false;assert.ok(Math.abs(app.calculate()[0].nonCrit-972)<1e-9);
});


test("blocked techniques never produce damage or become calculable after restoring a build", async () => {
  const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
  const file=JSON.parse(read("games/hsr/data/attack-overrides.json"));
  const attacks=file.overrides.map(a=>({...a,support:a.support||file.support}));
  const techniques=attacks.filter(a=>a.type==="technique");
  const extraData={characters:catalog.characters,attacks,structuredModifiers:[]};
  for(const technique of techniques) {
    const app=await tool(undefined,extraData);app.state.characterId=technique.characterId;
    for(const[key,value]of Object.entries({hp:6000,atk:3000,def:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+key).value=String(value);
    const results=app.calculate();
    assert.ok(results.length>0,"ordinary attacks remain available: "+technique.id);
    assert.equal(results.some(r=>r.attack?.name===technique.name),false);
    const html=app.node("hsrResults").innerHTML;
    if(technique.hidden)assert.equal(html.includes(technique.name),false);
    else {assert.ok(html.includes(technique.name));assert.ok(html.includes(technique.support.reason));assert.match(html,/表示のみ・計算不可/);}
    app.node("hsrStat-atk").handlers.input();
    // Current saves have no attack selector. An unknown legacy field must not redirect to another attack.
    const key="tetinet:hsr:calculation:v1", saved=JSON.parse(app.storage.get(key));saved.state.attackId=technique.id;app.storage.set(key,JSON.stringify(saved));
    const restored=await tool(app.storage,extraData);
    assert.equal(restored.state.characterId,technique.characterId);assert.equal(Object.hasOwn(restored.state,"attackId"),false);
    assert.equal(restored.state.data.attacks.find(a=>a.id===technique.id).support.status,"displayOnly");
    const after=restored.calculate();assert.equal(after.some(r=>r.attack?.name===technique.name),false);assert.equal(after.length,results.length);
    for(let i=0;i<after.length;i++)assert.equal(after[i].nonCrit,results[i].nonCrit);
  }
});


test("Pearl enhanced Basic compares as a separate assumed state and retains numeric limits", async () => {
  const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
  const extraData={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>a.characterId==="1503"),structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1503")};
  const app=await tool(undefined,extraData);app.state.characterId="1503";
  for(const [k,v]of Object.entries({def:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
  const baseline=app.calculate();
  assert.equal(baseline.length,2);
  assert.ok(Math.abs(baseline.find(r=>r.attack.name.includes("断流臨模")).nonCrit-972)<1e-9);
  const r=baseline.find(r=>r.attack.name.includes("波頭描き"));assert.ok(Math.abs(r.nonCrit-1080)<1e-9);assert.equal(r.breakdown.referenceValue,3000);
  assert.match(app.node("hsrResults").innerHTML,/想定：深層学習中/);
  assert.match(app.node("hsrResults").innerHTML,/3,000 × 100%/);
  // Legacy availability fields remain inert and do not hide the hypothetical comparison row.
  Object.assign(app.state.modifierInputs,{"pearl-non-elation-deep-learning":false,"pearl-charges":0,"pearl-canvas":"","pearl-extra-elation":1});
  assert.ok(Math.abs(app.calculate().find(r=>r.attack.name.includes("波頭描き")).nonCrit-1080)<1e-9);
  app.node("hsrStat-def").handlers.input();const restored=await tool(app.storage,extraData);
  assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("波頭描き")).nonCrit-1080)<1e-9);
  restored.node("hsrNormalTrace").value="1";
  assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("波頭描き")).nonCrit-540)<1e-9);
  restored.node("hsrNormalTrace").value="7";assert.equal(restored.calculate().some(r=>r.attack.name.includes("波頭描き")),false);assert.match(restored.node("hsrCalculationFeedback").innerHTML,/Lv1～6/);
  restored.node("hsrNormalTrace").value="6";restored.node("hsrEidolon").value="1";assert.equal(restored.calculate().some(r=>r.attack.name.includes("波頭描き")),false);
  restored.node("hsrEidolon").value="0";restored.node("hsrEnemyCount").value="2";assert.equal(restored.calculate().some(r=>r.attack.name.includes("波頭描き")),false);
  restored.node("hsrEnemyCount").value="1";
  for(const value of ["","0","-1","invalid"]){restored.node("hsrStat-def").value=value;assert.equal(restored.calculate().some(r=>r.attack.name.includes("波頭描き")),false);assert.match(restored.node("hsrCalculationFeedback").innerHTML,/防御力/);}
  assert.equal(restored.state.data.attacks.some(a=>a.id==="150308"),false);
});


test("Waveflair compares normal and enhanced Elation with independent numeric inputs", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const overrides=JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides;
    const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const extraData={characters:catalog.characters,attacks:[...overrides.filter(a=>a.characterId==="1513"),...generated.filter(a=>["150501","150520"].includes(a.id)).map(a=>({...a,...overrides.find(o=>o.id===a.id)}))],structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers};
    const app=await tool(undefined,extraData);app.state.characterId="1513";
    for(const[k,v]of Object.entries({atk:3000,elation:50,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    app.node("hsrPunchline").value="60";
    app.node("hsrEidolon").handlers.change({target:{value:"0"}});
    let calculated=app.calculate();
    let result=calculated.find(r=>r.attack.name.includes("熱気10・通常版"));
    assert.ok(result,"normal Elation is listed as an assumed attack");
    assert.equal(calculated.some(r=>r.attack.name.includes("次のアッハタイム")),false,"enhanced Elation still needs heat and Punchline values");
    const key="waveflair-fervor10-stable";
    assert.equal(app.state.modifierInputs[key],undefined,"availability-only confirmation is not required");
    assert.ok(Math.abs(result.nonCrit-13521.459699692308)<1e-8);
    assert.equal(result.breakdown.punchline,20);assert.equal(app.state.elationInputs.punchline,60);assert.equal(app.node("hsrPunchline").value,"60");
    assert.equal(app.node("hsrPunchlineField").hidden,false,"manual Punchline is available for enhanced Elation");
    const html=app.node("hsrResults").innerHTML;
    assert.match(html,/全体攻撃：60% × 1ヒット/);assert.match(html,/追加ランダム攻撃（敵1体）：18% × 10ヒット/);assert.match(html,/爆笑ネタ（天賦固定値）/);
    assert.doesNotMatch(html,/敵1体への全6ヒット/);assert.match(app.node("hsrResults").innerHTML,/全11ヒット中に撃破や敵条件変化なし/);
    app.node("hsrStat-elation").handlers.input();const restored=await tool(app.storage,extraData);
    assert.equal(restored.state.modifierInputs[key],undefined);assert.equal(restored.node("hsrPunchline").value,"60");
    assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("熱気10・通常版")).nonCrit-result.nonCrit)<1e-8);
    restored.state.characterId="1505";restored.node("hsrEidolon").handlers.change({target:{value:"0"}});
    const regular=restored.calculate().find(r=>r.breakdown.damageFormula==="elation");assert.equal(regular.breakdown.punchline,60);assert.equal(restored.node("hsrPunchlineField").hidden,false);
    restored.state.characterId="1513";restored.node("hsrPunchline").value="";
    assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("熱気10・通常版")).nonCrit-result.nonCrit)<1e-8,"fixed PL does not require the unrelated manual input");
    restored.node("hsrPunchline").value="20";restored.node("hsrFervor").value="10";
    assert.ok(restored.calculate().some(r=>r.attack.name.includes("次のアッハタイム")),"enhanced Elation appears when its numeric inputs are provided");
    assert.match(restored.node("hsrResults").innerHTML,/想定：/);
    restored.node("hsrEnemyCount").value="2";assert.equal(restored.calculate().some(r=>r.breakdown.damageFormula==="elation"),false);assert.match(restored.node("hsrResults").innerHTML,/敵1体のみ/);
    restored.node("hsrEnemyCount").value="1";restored.node("hsrLevel").value="79";assert.equal(restored.calculate().some(r=>r.breakdown.damageFormula==="elation"),false);
    restored.node("hsrLevel").value="80";restored.node("hsrEidolon").value="1";assert.equal(restored.calculate().some(r=>r.breakdown.damageFormula==="elation"),false);
    restored.node("hsrEidolon").value="0";restored.node("hsrStat-elation").value="";assert.equal(restored.calculate().some(r=>r.breakdown.damageFormula==="elation"),false);
    restored.node("hsrStat-elation").value="50";restored.node("hsrMerrymake").value="";assert.equal(restored.calculate().some(r=>r.breakdown.damageFormula==="elation"),false);
    restored.node("hsrMerrymake").value="0";restored.state.modifierInputs[key]=1;
    assert.ok(restored.calculate().some(r=>r.attack.name.includes("熱気10・通常版")),"legacy display-only state does not gate a comparison");
    restored.node("hsrFervor").value="";assert.equal(restored.calculate().some(r=>r.breakdown.fervor!==undefined),false,"enhanced Elation still requires heat input");
});


test("final-input guidance distinguishes permanent gear and Pearl A2 from additional support without changing inputs", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const {loadHsrDataFiles}=require("../../scripts/lib/hsrDataFiles.cjs");
    const extraData={...catalog,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>a.id==="150301"),
        structuredModifiers:loadHsrDataFiles(root).modifiers};
    const app=await tool(undefined,extraData);app.state.characterId="1503";
    for(const [k,v]of Object.entries({def:3000,elation:140,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    app.node("hsrEidolon").handlers.change({target:{value:"0"}});
    const cases=[["21066","","光円錐"],["23055","","光円錐"],["","133","遺物・オーナメント"],["","134","遺物・オーナメント"],["","","軌跡"]];
    for(const [coneId,relicId,tab]of cases){
        app.state.coneId=coneId;app.state.relicId=relicId;app.state.relicMode="2+2";
        const result=app.calculate()[0];
        assert.ok(Math.abs(result.nonCrit-972)<1e-9);
        assert.equal(app.node("hsrStat-def").value,"3000");assert.equal(app.node("hsrStat-elation").value,"140");
        assert.ok(result.applied.every(m=>!m.id.includes("final")));
        app.node("hsrConditionDialogOpen").handlers.click();
        app.node("hsrConditionDialog").handlers.click({target:{closest:()=>({dataset:{conditionTab:tab}})}});
        assert.match(app.node("hsrConditionList").innerHTML,/最終ステータスに含めて入力（ここでは再加算しません）/);
        assert.doesNotMatch(app.node("hsrConditionList").innerHTML,/入力欄のステータスへ反映済み/);
    }
    assert.match(app.node("hsrConditionHelp").textContent,/最終ステータスで管理 .*件（再加算なし）。選択状態は補正条件/);
    assert.match(app.node("hsrConditionList").innerHTML,/data-condition-purpose="finalStats"[\s\S]*?パールA2・万物の洞察（最終愉悦度に含める）/);
    const html=read("games/hsr/index.html");
    assert.doesNotMatch(html,/id="hsrPearlSettings"/,"Pearl attack assumptions are not shown as optional damage modifiers");
    assert.match(html,/装備選択だけでは数値は更新されません/);assert.match(html,/UID反映後もこのルールで確認・編集/);
    assert.match(html,/aria-describedby="hsrElationInputHelp"/);assert.match(html,/補正条件で追加する支援分は含めません/);
});


test("scoped Hanya and Gallagher attacks show availability assumptions and preserve numeric limits", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const {loadHsrDataFiles}=require("../../scripts/lib/hsrDataFiles.cjs");
    const files=loadHsrDataFiles(root);
    const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const byId=new Map(generated.map(a=>[a.id,a]));files.attackOverrides.forEach(a=>byId.set(a.id,{...byId.get(a.id),...a}));
    const data={...catalog,attacks:[...byId.values()],structuredModifiers:files.modifiers};
    for(const [id,cid,key,nc]of [["121502","1215","hanya-unburdened-skill",2592],["130103","1301","",1620]]){
        const app=await tool(undefined,data);app.state.characterId=cid;
        for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
        app.node("hsrEidolon").handlers.change({target:{value:"0"}});
        const name=byId.get(id).name,find=()=>app.calculate().find(r=>r.attack.name===name);
        if(key){
            assert.ok(find(),"the direct attack is listed with its assumed condition");
            assert.ok(Math.abs(find().nonCrit-nc)<1e-9);
            app.state.modifierInputs[key]=false;
            assert.ok(Math.abs(find().nonCrit-nc)<1e-9,"legacy availability OFF does not hide a hypothetical attack");
            app.state.modifierInputs[key]=true;
        }
        const r=find();assert.ok(Math.abs(r.nonCrit-nc)<1e-9,JSON.stringify({id,nc,actual:r.nonCrit,applied:r.applied}));
        assert.match(app.node("hsrResults").innerHTML,/星魂0・軌跡Lv1～10・敵1体/);
        assert.ok(app.node("hsrResults").innerHTML.includes("3,000 × "+byId.get(id).multipliers[9]+"%"));
        app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
        assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name===name).nonCrit-nc)<1e-9);
        app.node("hsrStat-atk").value="";assert.equal(find(),undefined);app.node("hsrStat-atk").value="-1";assert.equal(find(),undefined);app.node("hsrStat-atk").value="3000";
        app.node("hsrEnemyCount").value="2";assert.equal(find(),undefined);app.node("hsrEnemyCount").value="1";
        app.node("hsrEidolon").value="1";assert.equal(find(),undefined);app.node("hsrEidolon").value="0";
        app.node(id==="121502"?"hsrSkillTrace":"hsrUltimateTrace").value="11";assert.equal(find(),undefined);
        app.node(id==="121502"?"hsrSkillTrace":"hsrUltimateTrace").value="10";
        if(key){app.state.modifierInputs[key]=false;assert.ok(Math.abs(find().nonCrit-nc)<1e-9);app.state.modifierInputs[key]=true;}
        app.state.characterId="1513";app.node("hsrEidolon").handlers.change({target:{value:"0"}});
        const other=app.calculate();assert.ok(!other.some(r=>r.attack.name===name));
        assert.ok(other.every(r=>!r.applied.some(m=>m.id.endsWith(":direct-scope"))));
    }
});


test("Waveflair enhanced skill restores heat and manual Punchline and fails closed outside its distinct trigger",async()=>{
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const {loadHsrDataFiles}=require("../../scripts/lib/hsrDataFiles.cjs"),files=loadHsrDataFiles(root);
    const data={...catalog,attacks:files.attackOverrides.filter(a=>a.characterId==="1513"),structuredModifiers:files.modifiers};
    const app=await tool(undefined,data);app.state.characterId="1513";
    for(const[k,v]of Object.entries({atk:3000,elation:50,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    app.node("hsrEidolon").handlers.change({target:{value:"0"}});
    const flag="waveflair-enhanced-aha-stable";const find=()=>app.calculate().find(r=>r.breakdown.fervor!==undefined);
    assert.equal(find(),undefined);
    app.state.modifierInputs[flag]=true;assert.equal(find(),undefined);
    app.state.party[0]={...app.state.party[0],characterId:"1503"};app.node("hsrFervor").value="10";app.node("hsrPunchline").value="20";
    const r=find();assert.ok(Math.abs(r.nonCrit-25352.736936923077)<1e-8);assert.equal(r.attack.hitCount,21);
    assert.match(app.node("hsrResults").innerHTML,/熱気消費による追加攻撃/);assert.match(app.node("hsrResults").innerHTML,/消費熱気（追加ヒット数）/);
    app.node("hsrStat-elation").handlers.input();const rr=await tool(app.storage,data);
    assert.equal(rr.node("hsrFervor").value,"10");assert.equal(rr.node("hsrPunchline").value,"20");assert.equal(rr.node("hsrPunchlineField").hidden,false);
    assert.ok(Math.abs(rr.calculate().find(r=>r.breakdown.fervor!==undefined).nonCrit-r.nonCrit)<1e-8);
    for(const v of ["","0","31","10.5"]){app.node("hsrFervor").value=v;assert.equal(app.calculate().some(r=>r.breakdown.fervor!==undefined),false)}
    app.node("hsrFervor").value="10";app.node("hsrPunchline").value="";assert.equal(app.calculate().some(r=>r.breakdown.fervor!==undefined),false);
    app.node("hsrPunchline").value="60";app.state.modifierInputs[flag]=false;app.state.modifierInputs["waveflair-fervor10-stable"]=true;
    assert.equal(app.calculate().find(r=>r.breakdown.damageFormula==="elation").breakdown.punchline,20);assert.equal(app.state.elationInputs.punchline,60);
});


test("Summer Songbird attack is listed beside Robin's attacks and uses its own required snapshot",async()=>{
    const catalog=JSON.parse(read("games/hsr/data/catalog.json")),files=require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root);
    const data={...catalog,attacks:files.attackOverrides.filter(a=>a.characterId==="1512"),structuredModifiers:files.modifiers};
    const app=await tool(undefined,data);app.state.characterId="1512";app.node("hsrEidolon").handlers.change({target:{value:"0"}});
    app.node("hsrSongbirdMode").value="true";assert.equal(app.calculate().some(r=>r.breakdown.actorKind==="memosprite"),false,"missing sprite snapshot blocks only the sprite result");
    app.node("hsrSongbirdContext").value="feverStable";app.node("hsrSongbirdSkillLevel").value="6";
    for(const[k,v]of Object.entries({hp:4200,critRate:50,critDamage:100,damageBonus:0}))app.node("hsrSongbird-"+k).value=String(v);
    Object.assign(app.state.modifierInputs,{"robin-summeretto-fever":true,"robin-summeretto-vibes":12,"robin-songbirds-vulnerability":true,"robin-songbirds-count":3,"robin-songbirds-talent-level":6});
    const findSprite=()=>app.calculate().find(r=>r.breakdown.actorKind==="memosprite");
    const result=findSprite(),expected=4200*1.5*1.84*(100/179)*.8*.9*1.16;
    assert.ok(result);assert.ok(Math.abs(result.nonCrit-expected)<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/精霊の最終HP参照/);assert.match(app.node("hsrResults").innerHTML,/フィーバー固有与ダメージ/);
    app.node("hsrStat-hp").value="999999";app.node("hsrStat-critDamage").value="9999";assert.ok(Math.abs(findSprite().nonCrit-expected)<1e-8);
    app.node("hsrSongbird-hp").handlers.input();const rr=await tool(app.storage,data);assert.equal(rr.state.songbirdInputs.active,true);assert.equal(rr.node("hsrSongbird-hp").value,"4200");assert.ok(Math.abs(rr.calculate().find(r=>r.breakdown.actorKind==="memosprite").nonCrit-expected)<1e-8);
    app.node("hsrSongbird-hp").value="";assert.equal(findSprite(),undefined);app.node("hsrSongbird-hp").value="4200";
    app.state.modifierInputs["robin-summeretto-fever"]=false;assert.equal(findSprite(),undefined);app.state.modifierInputs["robin-summeretto-fever"]=true;
    app.state.modifierInputs["robin-songbirds-count"]=2;assert.equal(findSprite(),undefined);app.state.modifierInputs["robin-songbirds-count"]=3;
    app.node("hsrEnemyCount").value="2";assert.equal(findSprite(),undefined);app.node("hsrEnemyCount").value="1";
    app.node("hsrEidolon").value="1";assert.equal(findSprite(),undefined);app.node("hsrEidolon").value="0";
    app.node("hsrSongbirdMode").value="false";app.node("hsrStat-hp").value="6000";app.node("hsrStat-critDamage").value="100";
    const both=app.calculate(),normal=both.find(r=>r.breakdown.actorKind!=="memosprite"&&r.breakdown.referenceValue===6000);
    assert.ok(normal,"Robin's normal attack remains present when the sprite mode flag is off");
    assert.ok(both.some(r=>r.breakdown.actorKind==="memosprite"),"the sprite comparison is independent from the legacy mode flag");
});


test("Lingsha and Firefly Skills compare as assumed attacks while preserving numeric limits and reload", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const ids = ["122202", "131002"];
    const extra = { characters: catalog.characters,
        attacks: JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a => ids.includes(a.id)),
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m => ["1222", "1310"].includes(m.source.id)) };
    for (const [cid, key, nc] of [["1222", "lingsha-direct-skill", 864], ["1310", "firefly-unenhanced-skill", 2160]]) {
        const app = await tool(undefined, extra); app.state.characterId = cid;
        app.node("hsrStat-atk").value = "3000"; app.node("hsrStat-critRate").value = "50"; app.node("hsrStat-critDamage").value = "100";
        const name=cid==="1222"?"彩煙":"コマンド-天火轟撃",find=()=>app.calculate().find(r=>r.attack.name===name);
        let r = find(); assert.ok(Math.abs(r.nonCrit - nc) < 1e-9); assert.ok(Math.abs(r.crit - nc * 2) < 1e-9); assert.ok(Math.abs(r.expected - nc * 1.5) < 1e-9);
        app.state.modifierInputs[key] = false;
        assert.ok(Math.abs(find().nonCrit-nc)<1e-9,"legacy display-only OFF state does not hide an assumed attack");
        assert.match(app.node("hsrResults").innerHTML, /星魂0・戦闘スキルLv1～10・敵1体/);
        assert.match(app.node("hsrResults").innerHTML, /計算可能/);
        app.node("hsrStat-atk").handlers.input();
        const restored = await tool(app.storage, extra);
        assert.equal(restored.state.modifierInputs[key], false);
        assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name===name).nonCrit - nc) < 1e-9);
        for (const val of ["", "0", "-1", "invalid"]) { restored.node("hsrStat-atk").value = val; assert.equal(restored.calculate().some(r=>r.attack.name===name), false); }
        restored.node("hsrStat-atk").value = "3000"; restored.node("hsrSkillTrace").value = "11";
        assert.equal(restored.calculate().some(r=>r.attack.name===name), false); assert.match(restored.node("hsrResults").innerHTML, /data-hsr-pending-input/);
        restored.node("hsrSkillTrace").value = "10"; restored.node("hsrEnemyCount").value = "2"; assert.equal(restored.calculate().some(r=>r.attack.name===name), false);
        restored.node("hsrEnemyCount").value = "1"; restored.node("hsrEidolon").value = "1"; assert.equal(restored.calculate().some(r=>r.attack.name===name), false);
    }
});


test("Lingsha and Boothill Ultimates compare as assumed attacks and stop invalid inputs", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const ids = ["122202", "122203", "131503"];
    const extra = { characters: catalog.characters,
        attacks: JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a => ids.includes(a.id)),
        structuredModifiers: JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m => ["1222", "1315"].includes(m.source.id)) };
    for (const [cid, key, nc] of [["1222", "lingsha-direct-ultimate", 1620], ["1315", "boothill-non-standoff-ultimate", 4320]]) {
        const app = await tool(undefined, extra); app.state.characterId = cid;
        for (const [k, v] of Object.entries({ atk: 3000, critRate: 50, critDamage: 100 })) app.node("hsrStat-" + k).value = String(v);
        const name=cid==="1222"?"彩雲の如く巡る霞":"ダストデビル・ダンサー",find=()=>app.calculate().find(x=>x.attack.name===name);
        let r = find(); assert.ok(Math.abs(r.nonCrit - nc) < 1e-9); assert.ok(Math.abs(r.crit - nc * 2) < 1e-9); assert.ok(Math.abs(r.expected - nc * 1.5) < 1e-9);
        app.state.modifierInputs[key]=false;assert.ok(Math.abs(find().nonCrit-nc)<1e-9,"legacy availability OFF does not hide hypothetical attack");
        assert.match(app.node("hsrResults").innerHTML, /星魂0・必殺技Lv1～10・敵1体/);
        app.node("hsrStat-atk").handlers.input(); const restored = await tool(app.storage, extra);
        assert.equal(restored.state.modifierInputs[key], false); assert.ok(Math.abs(restored.calculate().find(x=>x.attack.name===name).nonCrit - nc) < 1e-9);
        if (cid === "1222") {
            restored.state.modifierInputs["lingsha-direct-skill"] = true; assert.equal(restored.calculate().length, 2);
            restored.state.modifierInputs[key] = false; assert.equal(restored.calculate()[0].attack.name, "彩煙");
            restored.state.modifierInputs["lingsha-direct-skill"] = false; restored.state.modifierInputs[key] = true;
        }
        assert.ok(Math.abs(find().nonCrit-nc)<1e-9);
        for (const value of ["", "0", "-1", "invalid"]) { restored.node("hsrStat-atk").value = value; assert.equal(restored.calculate().some(x=>x.attack.name===name), false); }
        restored.node("hsrStat-atk").value = "3000"; restored.node("hsrUltimateTrace").value = "11"; assert.equal(restored.calculate().some(x=>x.attack.name===name), false);
        restored.node("hsrUltimateTrace").value = "10"; restored.node("hsrEnemyCount").value = "2"; assert.equal(restored.calculate().some(x=>x.attack.name===name), false);
        restored.node("hsrEnemyCount").value = "1"; restored.node("hsrEidolon").value = "1"; assert.equal(restored.calculate().some(x=>x.attack.name===name), false);
    }
});


test("Ratio instance selectors and Deduction restore independently without combining future attacks", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>["130503","130504"].includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1305")};
    const app=await tool(undefined,data); app.state.characterId="1305";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    const findUltimate=()=>app.calculate().find(r=>r.attack.name.includes("三段階のパラドックス"));
    const findFollowUp=()=>app.calculate().find(r=>r.attack.name.includes("我思う、故に我あり"));
    assert.ok(Math.abs(findUltimate().nonCrit-2592)<1e-8);assert.ok(Math.abs(findFollowUp().nonCrit-2916)<1e-8);
    app.state.modifierInputs["ratio-ultimate-instance"]=false;app.state.modifierInputs["ratio-follow-up-instance"]=false;
    assert.ok(Math.abs(findUltimate().nonCrit-2592)<1e-8);assert.ok(Math.abs(findFollowUp().nonCrit-2916)<1e-8,"legacy availability flags do not hide comparison rows");
    const base=app.calculate();assert.equal(base.length,2);assert.ok(Math.abs(base[1].nonCrit-2916)<1e-8);
    app.state.modifierInputs["ratio-deduction-unlocked"]=true;app.node("hsrEnemyDebuffCount").value="3";
    assert.ok(Math.abs(app.calculate()[1].nonCrit-3790.8)<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/帰納.*最終会心入力/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
    assert.equal(restored.state.modifierInputs["ratio-deduction-unlocked"],true);
    assert.equal(restored.node("hsrEnemyDebuffCount").value,"3");assert.ok(Math.abs(restored.calculate()[0].nonCrit-3369.6)<1e-8);
    restored.state.modifierInputs["ratio-follow-up-instance"]=false;assert.ok(restored.calculate().some(r=>r.attack.name.includes("我思う、故に我あり")));
    restored.state.modifierInputs["ratio-follow-up-instance"]=true;restored.state.modifierInputs["ratio-ultimate-instance"]=false;
    assert.ok(restored.calculate().some(r=>r.attack.name.includes("三段階のパラドックス")));
    restored.state.modifierInputs["ratio-deduction-unlocked"]=false;assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("我思う、故に我あり")).nonCrit-2916)<1e-8);
    for(const v of ["","0","-1","invalid"]){restored.node("hsrStat-atk").value=v;assert.equal(restored.calculate().some(r=>r.attack.name.includes("看破・斬")),false);}
    restored.node("hsrStat-atk").value="3000";restored.node("hsrUltimateTrace").value="11";
    assert.equal(restored.calculate().some(r=>r.attack.name.includes("三段階のパラドックス")),false);
    assert.ok(restored.calculate().some(r=>r.attack.name.includes("我思う、故に我あり")),"unrelated attack stays available when Ultimate trace is invalid");
    restored.node("hsrUltimateTrace").value="10";
    restored.node("hsrEidolon").value="0";restored.state.characterId="1222";assert.equal(restored.calculate().length,0);
});


test("Yunli rank-scoped attacks preserve E1/E2 effects, E3/E5 actual trace levels, and only exclude E6 Slash", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json")), ids=["122102","122104","122103"];
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>ids.includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1221")};
    const app=await tool(undefined,data);app.state.characterId="1221";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    const findSkill=()=>app.calculate().find(r=>r.attack.name.includes("天威煌々"));
    const findCounter=()=>app.calculate().find(r=>r.attack.name.includes("閃熔"));
    const findSlash=()=>app.calculate().find(r=>r.attack.name.includes("看破・斬"));
    assert.ok(findSkill());assert.ok(findCounter());assert.ok(findSlash(),"the assumed Slash result includes its mandatory counter critical modifier without selecting availability");
    app.state.modifierInputs["yunli-skill-instance"]=false;app.state.modifierInputs["yunli-normal-counter-instance"]=false;
    assert.ok(findSkill());assert.ok(findCounter(),"display-only selectors do not hide attack comparisons");
    app.state.modifierInputs["yunli-intuit-slash-instance"]=true;
    let results=app.calculate();assert.equal(results.length,3);
    const e0Slash=results.find(r=>r.attack.name.includes("看破・斬"));assert.ok(Math.abs(e0Slash.nonCrit-2376)<1e-8);assert.ok(Math.abs(e0Slash.crit-7128)<1e-8);assert.ok(Math.abs(e0Slash.expected-4752)<1e-8);
    const e0Other=Object.fromEntries(["天威煌々","閃熔"].map(name=>[name,results.find(r=>r.attack.name.includes(name)).nonCrit]));
    assert.match(app.node("hsrResults").innerHTML,/炎輪の滅置換なし/);
    assert.match(app.node("hsrEidolonSupport").textContent+app.node("hsrEidolonSupport").innerHTML,/星魂0/);
    app.node("hsrEidolon").value="1";app.node("hsrEidolon").handlers.change({target:{value:"1"}});
    results=app.calculate();assert.equal(results.length,3);
    const e1Slash=results.find(r=>r.attack.name.includes("看破・斬"));assert.ok(Math.abs(e1Slash.nonCrit-2851.2)<1e-8);assert.ok(Math.abs(e1Slash.crit-8553.6)<1e-8);assert.ok(Math.abs(e1Slash.expected-5702.4)<1e-8);
    for(const name of ["天威煌々","閃熔"]) assert.equal(results.find(r=>r.attack.name.includes(name)).nonCrit,e0Other[name],`${name} is unchanged by E1`);
    assert.match(app.node("hsrResults").innerHTML,/星魂1|E1/);
    assert.match(app.node("hsrResults").innerHTML,/hsr-eidolon-scope/);
    assert.match(app.node("hsrResults").innerHTML,/看破・斬の与ダメージ\+20%/);
    assert.match(app.node("hsrEidolonSupport").textContent,/星魂1/);
    app.state.modifierInputs["yunli-true-sunder-active"]=true;
    const base=catalog.characters.find(c=>c.id==="1221").base.atk, atk=3000+base*.3;
    assert.ok(Math.abs(app.calculate().find(r=>r.attack.name.includes("看破・斬")).nonCrit-atk*2.2*.36*1.2)<1e-8);
    app.state.coneId="cone";const withCone=3000+(base+200)*.3;
    assert.ok(Math.abs(app.calculate().find(r=>r.attack.name.includes("看破・斬")).nonCrit-withCone*2.2*.36*1.2)<1e-8);
    app.node("hsrActionWindow").handlers.input();app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
    assert.equal(restored.state.modifierInputs["yunli-true-sunder-active"],true);
    assert.equal(restored.state.eidolon,1);
    assert.ok(Math.abs(restored.calculate().find(r=>r.attack.name.includes("看破・斬")).nonCrit-withCone*2.2*.36*1.2)<1e-8);
    restored.state.modifierInputs["yunli-intuit-slash-instance"]=false;
    assert.equal(restored.calculate().some(r=>r.attack.name.includes("看破・斬")),true, "saved OFF availability does not hide a computable assumed attack");
    restored.state.modifierInputs["yunli-intuit-slash-instance"]=true;
    restored.node("hsrLevel").value="70";assert.equal(restored.calculate().some(r=>r.attack.name.includes("看破・斬")),false);
    restored.node("hsrLevel").value="80";
    for(const v of ["","0","-1","invalid"]){restored.node("hsrStat-atk").value=v;assert.equal(restored.calculate().length,0);}
    restored.node("hsrStat-atk").value="3000";restored.node("hsrUltimateTrace").value="11";assert.equal(restored.calculate().some(r=>r.attack.name.includes("看破・斬")),false);
    restored.node("hsrUltimateTrace").value="10";restored.node("hsrEnemyCount").value="2";assert.equal(restored.calculate().some(r=>r.attack.name.includes("看破・斬")),false);
    restored.node("hsrEnemyCount").value="1";
    restored.state.modifierInputs["yunli-true-sunder-active"]=false;restored.state.coneId="";
    for(const rank of [2,3,4,5]) {
      restored.node("hsrEidolon").value=String(rank);restored.node("hsrEidolon").handlers.change({target:{value:String(rank)}});
      const rankResults=restored.calculate();assert.equal(rankResults.length,3,`Yunli E${rank} supports this scoped Skill/Counter/Slash set`);
      assert.match(restored.node("hsrResults").innerHTML,/星魂\d+の反映範囲/);
    }
    restored.node("hsrEidolon").value="3";restored.node("hsrEidolon").handlers.change({target:{value:"3"}});
    assert.match(restored.node("hsrNormalTrace").innerHTML,/value="7"/);
    assert.match(restored.node("hsrUltimateTrace").innerHTML,/value="12"/);
    assert.equal(restored.node("hsrUltimateTrace").value,"10","E3 raises the available game-level cap but does not add +2 to the entered UID level");
    restored.node("hsrEidolon").value="5";restored.node("hsrEidolon").handlers.change({target:{value:"5"}});
    assert.match(restored.node("hsrSkillTrace").innerHTML,/value="12"/);
    assert.match(restored.node("hsrTalentTrace").innerHTML,/value="12"/);
    assert.equal(restored.node("hsrSkillTrace").value,"10","E5 keeps the user's actual Skill level rather than adding +2 again");
    for(const field of ["hsrSkillTrace","hsrTalentTrace","hsrUltimateTrace"]) restored.node(field).value="12";
    const level12=restored.calculate();assert.equal(level12.length,3);
    const level12Slash=level12.find(r=>r.attack.name.includes("看破・斬"));
    const level12Skill=level12.find(r=>r.attack.name.includes("天威煌々"));
    const level12Counter=level12.find(r=>r.attack.name.includes("閃熔"));
    assert.ok(Math.abs(level12Slash.nonCrit-3000*2.376*.36*1.2*(10/9))<1e-8,"E3 Lv12 Slash uses Lv12 multiplier, E1 damage bonus, and E2 defense ignore");
    assert.ok(Math.abs(level12Skill.nonCrit-3000*1.32*.5*.8*.9)<1e-8,"E5 Lv12 Skill uses its multiplier but excludes counter-only E2");
    assert.ok(Math.abs(level12Counter.nonCrit-3000*1.32*.5*.8*.9*(10/9))<1e-8,"E5 Lv12 Counter uses E2 exactly once");
    restored.node("hsrEidolon").value="6";restored.node("hsrEidolon").handlers.change({target:{value:"6"}});
    const e6Results=restored.calculate();assert.equal(e6Results.length,2,"E6 Slash remains blocked while Skill and ordinary Counter remain calculable");
    assert.ok(e6Results.some(r=>r.attack.name.includes("天威煌々")));assert.ok(e6Results.some(r=>r.attack.name.includes("閃熔")));
    assert.match(restored.node("hsrResults").innerHTML,/看破・斬.*星魂6|星魂6.*看破・斬|星魂0～5/);
    const uidApp=await tool(undefined,data);
    uidApp.window.HsrTool.applyProfileCharacter({id:"1221",level:80,eidolon:2,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,critRate:50,critDamage:100,damageBonus:0}});
    uidApp.state.modifierInputs["yunli-intuit-slash-instance"]=true;
    assert.equal(uidApp.state.eidolon,2);assert.equal(uidApp.state.traceLevels.skill,10);assert.equal(uidApp.state.traceLevels.ultimate,10);assert.equal(uidApp.state.traceLevels.talent,10,"UID trace levels are actual game levels and are not auto-increased by eidolon");
    const uidE2Results=uidApp.calculate();
    assert.ok(Math.abs(uidE2Results.find(r=>r.attack.name.includes("看破・斬"))?.nonCrit-3168)<1e-8,`UID E2 applies E1 damage and E2 defense ignore to Slash; got ${uidE2Results.length} results / ${uidApp.node("hsrResults").innerHTML.slice(-1400)}`);
    uidApp.node("hsrStat-atk").handlers.input();
    const uidRestored=await tool(uidApp.storage,data);
    assert.equal(uidRestored.state.eidolon,2,"UID rank survives reload");
    assert.equal(uidRestored.state.traceLevels.skill,10);
    assert.equal(uidRestored.state.characterId,"1221");
    assert.equal(uidRestored.state.modifierInputs["yunli-intuit-slash-instance"],true);
    assert.ok(Math.abs(uidRestored.calculate().find(r=>r.attack.name.includes("看破・斬")).nonCrit-3168)<1e-8,"UID E2 and trace state recalculate identically after reload");
    assert.equal(uidRestored.calculate().length,3,"UID-backed E2 retains all three independently supported attack rows");
    const uidTraceApp=await tool(undefined,data);
    uidTraceApp.window.HsrTool.applyProfileCharacter({id:"1221",level:80,eidolon:5,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,critRate:50,critDamage:100,damageBonus:0}});
    assert.equal(uidTraceApp.state.eidolon,5);assert.equal(uidTraceApp.state.traceLevels.skill,10);assert.equal(uidTraceApp.state.traceLevels.ultimate,10);assert.equal(uidTraceApp.state.traceLevels.talent,10,"eidolon trace levels are UI caps; UID levels are not auto-increased");
});


test("Fuyuan action restores two-hit scope without combining Lingsha Skill or Ultimate", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>a.id==="122204"),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1222")};
    const app=await tool(undefined,data);app.state.characterId="1222";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    const findFuyuan=target=>target.calculate().find(r=>r.attack.hitCount===2);
    assert.ok(findFuyuan(app));app.state.modifierInputs["lingsha-fuyuan-instance"]=false;
    assert.ok(findFuyuan(app),"legacy availability OFF state does not hide Fuyuan comparison");
    const r=app.calculate()[0];assert.ok(Math.abs(r.nonCrit-1620)<1e-8);assert.ok(Math.abs(r.crit-3240)<1e-8);assert.ok(Math.abs(r.expected-2430)<1e-8);
    assert.equal(r.attack.hitCount,2);assert.match(app.node("hsrResults").innerHTML,/2ヒット/);assert.match(app.node("hsrResults").innerHTML,/全体1ヒット＋追加単体1ヒット/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
    assert.equal(restored.state.modifierInputs["lingsha-fuyuan-instance"],false);assert.ok(Math.abs(findFuyuan(restored).nonCrit-1620)<1e-8);
    for(const v of ["","0","-1","invalid"]){restored.node("hsrStat-atk").value=v;assert.equal(restored.calculate().some(r=>r.attack.hitCount===2),false);}
    restored.node("hsrStat-atk").value="3000";restored.node("hsrTalentTrace").value="11";assert.equal(restored.calculate().some(r=>r.attack.hitCount===2),false);
    restored.node("hsrTalentTrace").value="10";restored.node("hsrEnemyCount").value="2";assert.equal(restored.calculate().some(r=>r.attack.hitCount===2),false);
    restored.node("hsrEnemyCount").value="1";restored.node("hsrEidolon").value="1";assert.equal(restored.calculate().some(r=>r.attack.hitCount===2),false);
});


test("Jiaoqiu same-level five-roast Zone scope restores and rejects unsupported auxiliary trace levels", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>["121802","121803"].includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1218")};
    const app=await tool(undefined,data);app.state.characterId="1218";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    assert.equal(app.calculate().length,0);app.state.modifierInputs["jiaoqiu-five-roast-zone"]=true;
    let r=app.calculate();assert.equal(r.length,2);assert.ok(Math.abs(r[0].nonCrit-2187)<1e-8);assert.ok(Math.abs(r[1].nonCrit-1620)<1e-8);
    assert.equal(r[0].applied.filter(m=>m.category==="takenDamage").length,1);assert.equal(r[1].applied.filter(m=>m.category==="takenDamage").length,2);
    app.node("hsrStat-effectHitRate").value="200";assert.ok(Math.abs(app.calculate()[0].nonCrit-2187)<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/重複入力しない/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
    assert.equal(restored.state.modifierInputs["jiaoqiu-five-roast-zone"],true);assert.ok(Math.abs(restored.calculate()[1].nonCrit-1620)<1e-8);
    restored.state.modifierInputs["jiaoqiu-five-roast-zone"]=false;assert.equal(restored.calculate().length,0);restored.state.modifierInputs["jiaoqiu-five-roast-zone"]=true;
    for(const id of ["hsrTalentTrace","hsrUltimateTrace"]) { restored.node(id).value="11";assert.equal(restored.calculate().length,0);assert.match(restored.node("hsrResults").innerHTML,/data-hsr-pending-input/);restored.node(id).value="10"; }
    for(const v of ["","0","-1","invalid"]){restored.node("hsrStat-atk").value=v;assert.equal(restored.calculate().length,0);}
    restored.node("hsrStat-atk").value="3000";restored.node("hsrEnemyCount").value="2";assert.equal(restored.calculate().length,0);
    restored.node("hsrEnemyCount").value="1";restored.node("hsrEidolon").value="1";assert.equal(restored.calculate().length,0);
});


test("Gallagher enhanced Basic restores separately from Ultimate and refuses unsupported states", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>["130108","130103"].includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1301")};
    const app=await tool(undefined,data);app.state.characterId="1301";app.node("hsrNormalTrace").value="6";
    for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    const findBasic=target=>target.calculate().find(r=>r.attack.name.includes("極上"));
    assert.ok(findBasic(app));app.state.modifierInputs["gallagher-enhanced-normal-instance"]=false;
    const r=app.calculate();assert.equal(r.length,2);const b=findBasic(app);
    assert.ok(Math.abs(b.nonCrit-2700)<1e-8);assert.ok(Math.abs(b.crit-5400)<1e-8);assert.ok(Math.abs(b.expected-4050)<1e-8);assert.match(app.node("hsrResults").innerHTML,/必殺技は別行動/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);
    assert.equal(restored.state.modifierInputs["gallagher-enhanced-normal-instance"],false);assert.equal(restored.node("hsrNormalTrace").value,"6");assert.ok(Math.abs(findBasic(restored).nonCrit-2700)<1e-8);
    for(const v of ["","0","-1","invalid"]){restored.node("hsrStat-atk").value=v;assert.equal(restored.calculate().length,0);}
    restored.node("hsrStat-atk").value="3000";restored.node("hsrNormalTrace").value="7";assert.equal(findBasic(restored),undefined);
    restored.node("hsrNormalTrace").value="6";restored.node("hsrEnemyCount").value="2";assert.equal(findBasic(restored),undefined);
    restored.node("hsrEnemyCount").value="1";restored.node("hsrEidolon").value="1";assert.equal(findBasic(restored),undefined);
});


test("Blade Hellscape bonus affects the enhanced-state attacks but not the replaced ordinary Basic", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const files=require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root);
    const generated=JSON.parse(read("games/hsr/data/attacks.generated.json")).attacks;
    const byId=new Map(generated.map(a=>[a.id,a]));files.attackOverrides.forEach(a=>byId.set(a.id,{...byId.get(a.id),...a}));
    const attacks=[...byId.values()].filter(a=>a.characterId==="1205");
    const app=await tool(undefined,{characters:catalog.characters,attacks,structuredModifiers:files.modifiers});
    app.state.characterId="1205";app.state.enhancementState="previous";app.node("hsrEnhancementState").value="previous";app.node("hsrEidolon").value="0";
    for(const[k,v]of Object.entries({hp:7000,atk:2500,critRate:50,critDamage:100}))app.node("hsrStat-"+k).value=String(v);
    const ordinary=()=>app.calculate().find(r=>r.attack.name.includes("支離剣（強化前）"));
    const enhanced=()=>app.calculate().find(r=>r.attack.name.includes("無間剣樹（強化前）"));
    assert.ok(ordinary(),JSON.stringify(app.calculate().map(r=>r.attack.name)));
    const ordinaryBase=ordinary().nonCrit,enhancedBase=enhanced().nonCrit;
    assert.equal(app.state.modifierInputs["blade-hellscape-active"],undefined,"the attack assumption does not auto-enable the combat buff");
    app.state.modifierInputs["blade-hellscape-active"]=true;
    assert.equal(ordinary().nonCrit,ordinaryBase,"Hellscape replaces the ordinary Basic; its bonus cannot leak to that row");
    assert.ok(enhanced().nonCrit>enhancedBase,"the same active Hellscape bonus applies to the enhanced Basic");
    app.state.modifierInputs["blade-hellscape-active"]=false;
    assert.equal(ordinary().nonCrit,ordinaryBase);assert.equal(enhanced().nonCrit,enhancedBase);
});


test("Ashen Roast tick restores stack input without combining direct attacks and rejects missing or contradictory states", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json")),ids=["121802","121803","1218041"];
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>ids.includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1218")};
    const app=await tool(undefined,data);app.state.characterId="1218";app.node("hsrStat-atk").value="3000";
    app.state.modifierInputs["jiaoqiu-roast-dot-tick"]=true;
    let r=app.calculate();assert.equal(r.length,1);assert.ok(Math.abs(r[0].nonCrit-2624.4)<1e-8);assert.equal(r[0].attack.canCrit,false);
    assert.match(app.node("hsrResults").innerHTML,/hsr-attack-result-values--single/);assert.doesNotMatch(app.node("hsrResults").innerHTML,/会心ダメージ倍率/);assert.match(app.node("hsrResults").innerHTML,/敵ターン開始時/);
    app.state.modifierInputs["jiaoqiu-roast-dot-stacks"]=1;assert.ok(Math.abs(app.calculate()[0].nonCrit-2235.6)<1e-8);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.state.modifierInputs["jiaoqiu-roast-dot-stacks"],1);assert.ok(Math.abs(restored.calculate()[0].nonCrit-2235.6)<1e-8);
    for(const v of [null,0,6,1.5,"bad"]){restored.state.modifierInputs["jiaoqiu-roast-dot-stacks"]=v;assert.equal(restored.calculate().length,0,"all listed attacks use the invalid Roast tick state");}
    restored.state.modifierInputs["jiaoqiu-roast-dot-stacks"]=1;restored.state.modifierInputs["jiaoqiu-five-roast-zone"]=true;assert.equal(restored.calculate().length,2);
    restored.state.modifierInputs["jiaoqiu-roast-dot-stacks"]=5;r=restored.calculate();assert.equal(r.length,3);assert.ok(Math.abs(r[2].nonCrit-2624.4)<1e-8);
    restored.state.modifierInputs["jiaoqiu-roast-dot-tick"]=false;assert.equal(restored.calculate().length,2);
    restored.state.modifierInputs["jiaoqiu-five-roast-zone"]=false;restored.state.modifierInputs["jiaoqiu-roast-dot-tick"]=true;
    restored.node("hsrStat-atk").value="";assert.equal(restored.calculate().length,0);
    restored.node("hsrStat-atk").value="3000";restored.node("hsrTalentTrace").value="11";assert.equal(restored.calculate().length,0);
    restored.node("hsrTalentTrace").value="10";restored.node("hsrEidolon").value="1";assert.equal(restored.calculate().length,0);
});

test("Jiaoqiu party Roast reads provider talent, preserves attacker stats, and restores strict inputs", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const records = JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers
        .filter((item) => ["trace:1218:121804:party-roast", "trace:1218:121803:party-zone"].includes(item.id));
    const data = { characters: [{ id: "sample", name: "Sample", element: "Ice", skills: [], base: { hp: 1000, atk: 500, def: 400, speed: 100 } }, ...catalog.characters], structuredModifiers: records };
    const app = await tool(undefined, data);
    app.state.characterId = "sample";
    app.state.party[0] = { ...app.state.party[0], characterId: "1218", source: "manual", atk: 9000,
        traceLevels: { skill: 10, ultimate: 9, talent: 8 } };
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-critRate").value = "0";
    app.node("hsrStat-critDamage").value = "50";
    app.node("hsrStat-damageBonus").value = "0";
    app.node("hsrStat-breakEffect").value = "0";
    const baseline = app.calculate()[0].nonCrit;

    app.state.modifierInputs["jiaoqiu-party-roast-active"] = true;
    app.state.modifierInputs["jiaoqiu-party-roast-stacks"] = 5;
    const supported = app.calculate();
    assert.equal(supported.length, 1);
    const roast = supported[0].applied.find((item) => item.id === "trace:1218:121804:party-roast");
    assert.equal(roast.value, 30.61, "party trace map uses Jiaoqiu Talent Lv8");
    assert.ok(supported[0].nonCrit > baseline);
    app.state.party[0].atk = 100;
    assert.equal(app.calculate()[0].nonCrit, supported[0].nonCrit,
        "party provider ATK is not used as the attacker's damage stat");

    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, data);
    assert.equal(restored.state.modifierInputs["jiaoqiu-party-roast-active"], true);
    assert.equal(restored.state.modifierInputs["jiaoqiu-party-roast-stacks"], 5);
    assert.equal(restored.state.party[0].traceLevels.talent, 8);
    assert.equal(restored.calculate()[0].applied.find((item) => item.id === "trace:1218:121804:party-roast").value, 30.61);

    restored.state.modifierInputs["jiaoqiu-party-roast-stacks"] = NaN;
    assert.equal(restored.calculate().length, 0, "enabled Roast requires an explicit stack count");
    for (const invalid of [0, 6, 1.5, "bad"]) {
        restored.state.modifierInputs["jiaoqiu-party-roast-stacks"] = invalid;
        assert.equal(restored.calculate().length, 0, `invalid stack count ${invalid} fails closed`);
    }
    restored.state.modifierInputs["jiaoqiu-party-roast-stacks"] = 5;
    restored.state.modifierInputs["jiaoqiu-party-roast-active"] = false;
    assert.equal(restored.calculate()[0].nonCrit, baseline, "disabled Roast does not require its stacks");
    restored.state.modifierInputs["jiaoqiu-party-roast-active"] = true;
    restored.state.party[0].traceLevels.talent = NaN;
    assert.equal(restored.calculate().length, 0, "enabled Roast requires provider Talent level");
    restored.state.party[0].traceLevels.talent = 11;
    assert.equal(restored.calculate().length, 0, "invalid provider Talent level fails closed");
    restored.state.modifierInputs["jiaoqiu-party-roast-active"] = false;
    assert.equal(restored.calculate()[0].nonCrit, baseline, "disabled Roast does not require provider Talent level");
    restored.state.modifierInputs["jiaoqiu-party-roast-active"] = true;
    restored.state.party[0].traceLevels.talent = 8;
    restored.state.party[0].characterId = "";
    assert.equal(restored.calculate()[0].nonCrit, baseline, "removing the provider removes party Roast");
});


test("Break support restores party trace levels and shows applied effects only in the Break audit", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.id.endsWith(":break-vulnerability"));
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(...catalog.characters.filter(c=>["1222","1301"].includes(c.id)));
    app.state.party[0]={...app.state.party[0],characterId:"1222",eidolon:0,level:10};app.state.party[1]={...app.state.party[1],characterId:"1301",eidolon:0,level:10};
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-breakEffect").value="200";app.node("hsrWeakness").value="true";app.node("hsrMaxToughness").value="120";
    const baseline=app.calculate()[0].nonCrit;app.state.modifierInputs["break-befog-active"]=true;app.state.modifierInputs["break-besotted-active"]=true;
    assert.equal(app.calculate()[0].nonCrit,baseline);assert.match(app.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.37/);
    assert.match(app.node("hsrResults").innerHTML,/弱点撃破・適用された補正/);assert.match(app.node("hsrResults").innerHTML,/芳酔・撃破被ダメージ増加/);assert.match(app.node("hsrResults").innerHTML,/酩酊・撃破被ダメージ増加/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{structuredModifiers:mods,characters:app.state.data.characters});
    assert.equal(restored.state.party[0].characterId,"1222");assert.equal(restored.state.modifierInputs["break-besotted-active"],true);assert.equal(restored.calculate()[0].nonCrit,baseline);
    restored.state.party[0].traceLevels.ultimate=1;restored.calculate();assert.match(restored.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.27/);
    for(const v of ["",0,11,"bad"]){restored.state.party[0].traceLevels.ultimate=v;assert.equal(restored.calculate().length,1,"invalid party support data leaves the independent Break attack available");assert.equal(restored.calculate()[0].nonCrit,baseline,"invalid party trace data excludes only its support effect");}
    restored.state.party[0].traceLevels.ultimate=10;restored.state.party[0].eidolon=1;assert.equal(restored.calculate().length,1);
    restored.state.modifierInputs["break-befog-active"]=false;assert.equal(restored.calculate().length,1);
    restored.state.modifierInputs["break-besotted-active"]=false;assert.equal(restored.calculate().length,1);
});

test("manual Tingyun support effects use independent skill, ultimate and talent trace levels", async () => {
    const app = await tool();
    app.state.party[0] = { ...app.state.party[0], characterId: "1202", source: "manual", atk: 4000,
        traceLevels: { skill: 1, ultimate: 10, talent: 6 } };
    app.state.modifierInputs["tingyun-benediction"] = true;
    app.state.modifierInputs["tingyun-ultimate-active"] = true;
    app.node("hsrStat-atk").value = "1000";
    let results = app.calculate();
    assert.equal(results.length, 3);
    const benedictionResult = results.find((result) => result.attack.name.includes("祥音和韻"));
    assert.ok(benedictionResult);
    const applied = benedictionResult.applied;
    const skipped = benedictionResult.skipped;
    assert.equal(applied.find((item) => item.id === "trace:1202:120202:benediction-extra-damage").value, 20,
        "skill Lv1 drives the skill effect");
    assert.equal(applied.find((item) => item.id === "trace:1202:120203:ultimate-damage").value, 50,
        "ultimate Lv10 independently drives its effect");
    assert.equal(skipped.find((item) => item.id === "trace:1202:120204:talent-extra-damage").value, 45,
        "talent Lv6 independently resolves even when that effect does not apply to this attack");
    assert.equal(app.state.party[0].traceLevels.ultimate, 10, "ultimate remains independently selected");

    app.state.party[0].traceLevels.skill = NaN;
    results = app.calculate();
    assert.equal(results.length, 0, "the missing level blocks the enabled Tingyun support result");
    app.state.modifierInputs["tingyun-benediction"] = false;
    assert.equal(app.calculate().length, 1, "a missing skill level does not block the ordinary attack when that effect is off");
});

test("party trace restore migrates legacy shared level and preserves explicit unknown values", async () => {
    const app = await tool();
    const defaults = app.state;
    const saved = app.window.HsrCalcState.create(defaults);
    saved.state.party[0] = { ...saved.state.party[0], characterId: "1202", source: "manual", level: 4, traceLevels: {} };
    const legacyStorage = new Map([[app.window.HsrCalcState.KEY, JSON.stringify(saved)]]);
    const legacy = await tool(legacyStorage);
    assert.equal(legacy.state.party[0].traceLevels.skill, 4);
    assert.equal(legacy.state.party[0].traceLevels.ultimate, 4);
    assert.equal(legacy.state.party[0].traceLevels.talent, 4);

    const modernSaved = app.window.HsrCalcState.create(defaults);
    modernSaved.state.party[0] = { ...modernSaved.state.party[0], characterId: "1202", source: "manual", level: 4,
        traceLevels: { skill: NaN, ultimate: 10, talent: 6 } };
    const modernStorage = new Map([[app.window.HsrCalcState.KEY, JSON.stringify(modernSaved)]]);
    const modern = await tool(modernStorage);
    assert.ok(Number.isNaN(modern.state.party[0].traceLevels.skill), "explicit blank remains unknown despite legacy level");
    assert.equal(modern.state.party[0].traceLevels.ultimate, 10);
    assert.equal(modern.state.party[0].traceLevels.talent, 6);
});


test("invalid selected Break modifiers block only matching Break outputs and link to their condition", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const mods = JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m => m.id.endsWith(":break-vulnerability"));
    const app = await tool(undefined, { structuredModifiers: mods });
    app.state.data.characters.push(...catalog.characters.filter(c => ["1222", "1301"].includes(c.id)));
    app.state.party[0] = { ...app.state.party[0], characterId: "1301", eidolon: 1, level: 10, atk: 3000 };
    app.state.modifierInputs["break-besotted-active"] = true;
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-breakEffect").value = "200";
    app.node("hsrWeakness").value = "true";
    app.node("hsrMaxToughness").value = "120";

    const normalResults = app.calculate();
    assert.equal(normalResults.length, 1, "the ordinary attack survives an invalid Break-only support condition");
    let html = app.node("hsrResults").innerHTML;
    assert.match(html, /Sample attack/);
    assert.match(html, /data-hsr-input-target="modifier:trace:1301:130104:break-vulnerability"/);
    assert.match(html, /酩酊・撃破被ダメージ増加/);
    assert.doesNotMatch(html, /弱点撃破・適用された補正/);
    app.node("hsrResults").handlers.click({ target: { closest: () => ({ dataset: { hsrInputTarget: "modifier:trace:1301:130104:break-vulnerability" } }) } });
    assert.equal(app.node("hsrConditionDialog").open, true, "the pending Break notice opens the selected condition");
    assert.match(app.node("hsrConditionList").innerHTML, /酩酊・撃破被ダメージ増加/);

    app.state.party[0].eidolon = 0;
    app.state.party[0].level = 0;
    assert.equal(app.calculate().length, 1, "missing provider trace stops only the automatic Break result");
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /弱点撃破・適用された補正/);

    for (const mode of ["break", "superBreak"]) {
        app.node("hsrBreakMode").value = mode;
        app.node("hsrSuperBreakToughness").value = "10";
        app.node("hsrSuperBreakMultiplier").value = "100";
        app.node("hsrToughnessState").value = "broken";
        const results = app.calculate();
        assert.equal(results.length, 0, `${mode} cannot produce a result with invalid selected Break support`);
        html = app.node("hsrResults").innerHTML;
        assert.match(html, /data-hsr-pending-input/);
        assert.match(html, /酩酊・撃破被ダメージ増加/);
        assert.doesNotMatch(html, /genshin-damage-result-row/);
    }

    app.state.modifierInputs["break-besotted-active"] = false;
    app.node("hsrBreakMode").value = "break";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrResults").innerHTML, /弱点撃破・適用された補正/);
    assert.doesNotMatch(app.node("hsrCalculationFeedback").innerHTML, /入力を確認/);

    app.state.party[0] = { ...app.state.party[0], characterId: "1222", eidolon: 1, level: 10 };
    app.state.modifierInputs["break-befog-active"] = true;
    app.node("hsrBreakMode").value = "attacks";
    assert.equal(app.calculate().length, 1, "an invalid selected Lingsha condition also leaves the ordinary attack available");
    html = app.node("hsrResults").innerHTML;
    assert.match(html, /data-hsr-input-target="modifier:trace:1222:122203:break-vulnerability"/);
    assert.match(html, /芳酔・撃破被ダメージ増加/);
    app.node("hsrBreakMode").value = "break";
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrResults").innerHTML, /data-hsr-pending-input/);
    app.state.modifierInputs["break-befog-active"] = false;
    assert.equal(app.calculate().length, 0);
    assert.match(app.node("hsrResults").innerHTML, /弱点撃破・適用された補正/);
});


test("invalid Tingyun ATK input blocks the ATK attack but leaves a DEF attack calculable", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const mods = JSON.parse(read("games/hsr/data/calc/modifiers-tingyun.json")).modifiers;
    const attacks = [
        { id: "sample-atk", characterId: "sample", name: "ATK comparison", element: "Ice", type: "normal", traceKey: "normal", target: "single", scalingStat: "atk", multipliers: [100], support: { status: "calculable", verified: true } },
        { id: "sample-def", characterId: "sample", name: "DEF comparison", element: "Ice", type: "skill", traceKey: "skill", target: "single", scalingStat: "def", multipliers: [100], support: { status: "calculable", verified: true } }
    ];
    const app = await tool(undefined, { structuredModifiers: mods, attacks });
    app.state.data.characters.push(catalog.characters.find(character => character.id === "1202"));
    app.state.party[0] = { ...app.state.party[0], characterId: "1202", source: "manual", eidolon: 0, level: 10, atk: NaN };
    app.state.modifierInputs["tingyun-benediction"] = true;
    app.node("hsrStat-atk").value = "1000";
    app.node("hsrStat-def").value = "1000";
    app.node("hsrStat-critRate").value = "0";
    app.node("hsrStat-critDamage").value = "50";

    const results = app.calculate();
    assert.equal(results.length, 1, "the unaffected DEF-scaled attack remains calculable");
    const html = app.node("hsrResults").innerHTML;
    assert.match(html, /ATK comparison/);
    assert.match(html, /DEF comparison/);
    assert.match(html, /data-hsr-input-target="modifier:trace:1202:120202:benediction-atk"/);
    assert.match(html, /祥音和韻・賜福攻撃力/);
    const providerInput = app.node("test-tingyun-provider-atk");
    const card = { dataset: { hsrConditionIds: "trace:1202:120202:benediction-atk" }, querySelector(selector) { return selector === "[data-structured-provider-stat]" ? providerInput : null; } };
    app.node("hsrConditionList").querySelectorAll = () => [card];
    app.node("hsrResults").handlers.click({target:{closest:()=>({dataset:{hsrInputTarget:"modifier:trace:1202:120202:benediction-atk"}})}});
    assert.match(app.node("hsrConditionList").innerHTML, /data-hsr-condition-ids="[^"]*trace:1202:120202:benediction-atk/);
    assert.equal(providerInput.focused.preventScroll, true);
});


test("Jiaoqiu combined direct, DoT and Break scopes restore without double counting Roast", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>["121802","121803","1218041"].includes(a.id)),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>["1218","1222","1301"].includes(m.source.id))};
    const app=await tool(undefined,data);app.state.characterId="1218";app.state.party[0]={...app.state.party[0],characterId:"1222",level:10,eidolon:0};app.state.party[1]={...app.state.party[1],characterId:"1301",level:10,eidolon:0};
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-breakEffect").value="200";app.node("hsrWeakness").value="true";app.node("hsrEnemyResistance").value="0";app.node("hsrMaxToughness").value="120";
    Object.assign(app.state.modifierInputs,{"jiaoqiu-five-roast-zone":true,"jiaoqiu-roast-dot-tick":true,"jiaoqiu-roast-dot-stacks":5,"break-befog-active":true,"break-besotted-active":true});
    const r=app.calculate();assert.equal(r.length,3);assert.ok(Math.abs(r[0].nonCrit-2733.75)<1e-8);assert.ok(Math.abs(r[1].nonCrit-2025)<1e-8);assert.ok(Math.abs(r[2].nonCrit-3280.5)<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.72/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.calculate().length,3);assert.match(restored.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.72/);
    restored.state.modifierInputs["jiaoqiu-roast-dot-tick"]=false;assert.equal(restored.calculate().length,2);assert.match(restored.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.72/);
    restored.state.modifierInputs["jiaoqiu-five-roast-zone"]=false;restored.state.modifierInputs["jiaoqiu-roast-dot-tick"]=true;assert.equal(restored.calculate().length,1);assert.match(restored.node("hsrResults").innerHTML,/被ダメージ倍率<\/dt><dd>1.72/);
});


test("Independent Break and Super Break modes need no direct ATK, validate inputs and restore fractional toughness", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.id.endsWith(":break-vulnerability"));
    const app=await tool(undefined,{characters:[...catalog.characters,{id:"sample",name:"Sample",element:"Ice",skills:[]}],structuredModifiers:mods});
    app.state.party[0]={...app.state.party[0],characterId:"1222",eidolon:0,level:10};app.state.party[1]={...app.state.party[1],characterId:"1301",eidolon:0,level:10};
    app.state.modifierInputs["break-befog-active"]=true;app.state.modifierInputs["break-besotted-active"]=true;
    app.node("hsrBreakMode").value="superBreak";app.node("hsrSuperBreakToughness").value="12.5";app.node("hsrSuperBreakMultiplier").value="160";app.node("hsrToughnessState").value="broken";app.node("hsrStat-breakEffect").value="200";app.node("hsrEnemyResistance").value="0";
    app.calculate();const expected=3767.5533*1.25*3*.5*1.37*1.6;
    assert.ok(app.node("hsrResults").innerHTML.includes(Math.round(expected).toLocaleString("en-US")));assert.match(app.node("hsrResults").innerHTML,/基礎削靭値/);assert.match(app.node("hsrResults").innerHTML,/芳酔・撃破被ダメージ増加/);
    app.node("hsrSuperBreakToughness").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,structuredModifiers:mods});
    assert.equal(restored.node("hsrBreakMode").value,"superBreak");assert.equal(restored.node("hsrSuperBreakToughness").value,"12.5");restored.calculate();assert.ok(restored.node("hsrResults").innerHTML.includes(Math.round(expected).toLocaleString("en-US")));
    for(const v of ["","0","-1","bad"]){restored.node("hsrSuperBreakToughness").value=v;restored.calculate();assert.match(restored.node("hsrCalculationFeedback").innerHTML,/基礎削靭値/);}
    restored.node("hsrSuperBreakToughness").value="10";restored.node("hsrToughnessState").value="active";restored.calculate();assert.match(restored.node("hsrResults").innerHTML,/弱点撃破状態/);
    restored.node("hsrToughnessState").value="broken";restored.node("hsrSuperBreakMultiplier").value="0";restored.calculate();assert.match(restored.node("hsrResults").innerHTML,/class="genshin-result-value">0<\/span>/);
    restored.node("hsrBreakMode").value="break";restored.node("hsrWeakness").value="true";restored.node("hsrMaxToughness").value="120";restored.calculate();assert.match(restored.node("hsrResults").innerHTML,/弱点撃破・適用された補正/);
    restored.node("hsrStat-breakEffect").value="";restored.calculate();assert.match(restored.node("hsrCalculationFeedback").innerHTML,/撃破特効/);
    restored.node("hsrStat-breakEffect").value="0";restored.calculate();assert.match(restored.node("hsrResults").innerHTML,/弱点撃破・適用された補正/);
    restored.node("hsrBreakMode").value="attacks";assert.equal(restored.calculate().length,0);
    assert.match(restored.node("hsrResults").innerHTML,/data-hsr-pending-input/);
    assert.match(restored.node("hsrResults").innerHTML,/攻撃力/);
    assert.match(restored.node("hsrResults").innerHTML,/弱点撃破/);
    assert.match(restored.node("hsrCalculationFeedback").innerHTML,/計算できない結果/);
});


test("Fanning composite restores selected scope and rejects partial or unsupported target states", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const data={characters:catalog.characters,attacks:JSON.parse(read("games/hsr/data/attack-overrides.json")).overrides.filter(a=>a.id==="131508"),
        structuredModifiers:JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1315")};
    const app=await tool(undefined,data);app.state.characterId="1315";for(const[k,v]of Object.entries({atk:3000,breakEffect:200,critRate:50,critDamage:200}))app.node("hsrStat-"+k).value=String(v);
    app.node("hsrNormalTrace").value="6";app.node("hsrWeakness").value="true";app.node("hsrMaxToughness").value="120";app.node("hsrToughnessState").value="broken";
    assert.equal(app.calculate().length,0);app.state.modifierInputs["boothill-fanning-broken"]=true;
    const extra=3767.5533*2*1.7*3*.5*.8*1.5*1.3,r=app.calculate()[0];assert.ok(Math.abs(r.nonCrit-(3432+extra))<1e-8);assert.ok(Math.abs(r.crit-(10296+extra))<1e-8);
    assert.match(app.node("hsrResults").innerHTML,/通常部分の全段合算/);assert.match(app.node("hsrResults").innerHTML,/天賦撃破は会心しません/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);assert.ok(Math.abs(restored.calculate()[0].nonCrit-r.nonCrit)<1e-8);
    for(const value of [0,4,1.5,NaN]){restored.state.modifierInputs["boothill-pocket-stacks"]=value;assert.equal(restored.calculate().length,0);}
    restored.state.modifierInputs["boothill-pocket-stacks"]=3;restored.node("hsrMaxToughness").value="161";assert.equal(restored.calculate().length,1);restored.node("hsrMaxToughness").value="481";assert.equal(restored.calculate().length,0);assert.match(restored.node("hsrResults").innerHTML,/data-hsr-pending-input/);
    restored.node("hsrMaxToughness").value="120";restored.node("hsrToughnessState").value="active";assert.equal(restored.calculate().length,0);
    restored.node("hsrToughnessState").value="broken";restored.node("hsrWeakness").value="false";assert.equal(restored.calculate().length,0);
    restored.node("hsrWeakness").value="true";restored.node("hsrStat-breakEffect").value="";assert.equal(restored.calculate().length,0);
    restored.node("hsrStat-breakEffect").value="200";restored.node("hsrNormalTrace").value="7";assert.equal(restored.calculate().length,0);
});


test("enemy inputs cannot silently become zero or clamped one-enemy conditions and survive restoration", async () => {
  const app = await tool();
  app.node("hsrStat-atk").value = "1000";
  const baseline = app.calculate()[0].nonCrit;
  for (const [id, invalidValues, message, valid] of [
    ["hsrEnemyLevel", ["", "0", "-1", "80.5", "invalid"], /敵Lv/, "80"],
    ["hsrEnemyResistance", ["", "invalid"], /敵の耐性/, "20"],
    ["hsrEnemyCount", ["", "0", "-1", "1.5", "6", "invalid"], /敵数/, "1"]
  ]) {
    for (const value of invalidValues) {
      app.node(id).value = value;
      assert.equal(app.calculate().length, 0, `${id}=${value}`);
      assert.match(app.node("hsrCalculationFeedback").innerHTML, message);
      assert.doesNotMatch(app.node("hsrResults").innerHTML, /hsr-attack-result/);
    }
    app.node(id).value = valid;
    assert.equal(app.calculate()[0].nonCrit, baseline);
  }
  app.node("hsrEnemyResistance").value = "0";
  assert.ok(Math.abs(app.calculate()[0].nonCrit - baseline / 0.8) < 1e-9, "zero RES is valid");
  app.node("hsrEnemyResistance").value = "";
  app.node("hsrEnemyResistance").handlers.input();
  const restored = await tool(app.storage);
  assert.equal(restored.node("hsrEnemyResistance").value, "");
  assert.equal(restored.calculate().length, 0);
  assert.match(restored.node("hsrCalculationFeedback").innerHTML, /敵の耐性/);
});


test("rounded stat display retains exact engine and saved values until that field is edited", async () => {
    const app = await tool();
    app.window.HsrTool.applyProfileCharacter({id:"sample",level:80,traces:[{type:"Normal",level:6}], stats:{...app.state.stats,hp:6000.54321,atk:1234.567891,def:900.8765,speed:134.9876,critRate:71.004,critDamage:193.548}});
    assert.equal(app.node("hsrStat-atk").value,"1234");
    assert.equal(app.node("hsrStat-speed").value,"134");
    assert.equal(app.node("hsrStat-critDamage").value,"193.5");
    const before=app.calculate()[0];
    assert.equal(before.breakdown.referenceValue,1234.567891);
    app.node("hsrEnemyResistance").handlers.input();
    const restored=await tool(app.storage);
    assert.equal(restored.state.stats.speed,134.9876);
    assert.equal(restored.state.stats.atk,1234.567891);
    assert.equal(restored.calculate()[0].nonCrit,before.nonCrit);
    restored.node("hsrStat-atk").value="1300.2468";
    restored.node("hsrStat-atk").handlers.input();
    restored.node("hsrStat-atk").handlers.blur();
    assert.equal(restored.node("hsrStat-atk").value,"1300");
    assert.equal(restored.calculate()[0].breakdown.referenceValue,1300.2468);
    assert.equal(restored.state.stats.critDamage,193.548,"editing ATK cannot round crit damage internally");
});

test("UID sprite trace levels stay separate and character-specific after restore", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const extra={characters:catalog.characters,traceSkillMap:JSON.parse(read("games/hsr/data/trace-level-map.json")).mappings,attacks:[]};
    const app=await tool(undefined,extra);
    app.window.HsrTool.applyProfileCharacter({id:"1407",level:80,stats:{...app.state.stats,hp:6000},traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:9},{type:"Talent",level:8},{type:"MemospriteSkill",level:4},{type:"MemospriteTalent",level:5}]});
    assert.equal(app.node("hsrMemSkillTrace").value,"4");
    assert.equal(app.node("hsrMemTalentTrace").value,"5");
    assert.equal(app.node("hsrMemSkillTraceField").hidden,false);
    const restored=await tool(app.storage,extra);
    assert.equal(restored.state.traceLevels.memSkill,4);
    assert.equal(restored.state.traceLevels.memTalent,5);
    assert.equal(restored.state.traceLevels.talent,8);
    restored.window.HsrTool.applyProfileCharacter({id:"1210",level:80,stats:{atk:2000},traces:[{type:"Normal",level:6}]});
    assert.equal(restored.node("hsrMemSkillTraceField").hidden,true);
    assert.equal(restored.node("hsrMemTalentTraceField").hidden,true);
    assert.ok(Number.isNaN(restored.state.traceLevels.memSkill));
});

test("party UID builds remain separate from master selection and persist selected equipment, trace levels and order only", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const app=await tool(undefined,{characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets});
    app.state.characterId="1210";
    const profile={id:"1202",level:80,eidolon:2,lightCone:{id:"21001",rank:3},traces:[{type:"BPSkill",level:8},{type:"Talent",level:9}],stats:{atk:2345.67891,critDamage:122.345,breakEffect:45.678},relicSets:[{id:"101",pieces:4},{id:"301",pieces:2}]};
    app.window.HsrTool.setProfileCharacters([profile]);
    app.window.HsrTool.openSelection("party",0);
    assert.match(app.node("hsrSelectionList").innerHTML,/UIDから取得したキャラクター/);
    assert.match(app.node("hsrSelectionList").innerHTML,/キャラクター一覧（手動設定）/);
    app.node("hsrSelectionList").handlers.click({target:{closest:()=>({dataset:{selectionId:"1202",selectionProfile:"0"}})}});
    assert.equal(app.state.party[0].atk,2345.67891);
    assert.equal(app.state.party[0].lightConeId,"21001");
    assert.equal(app.state.party[0].traceLevels.skill,8);
    assert.match(app.node("hsrPartyRows").innerHTML,/data-party-equipment="cone"/);
    assert.match(app.node("hsrPartyPreview").innerHTML,/genshin-party-preview-equipment/);
    app.node("hsrAttackerPosition").handlers.change({target:{value:"3"}});
    const restored=await tool(app.storage,{characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets});
    assert.equal(restored.state.attackerPosition,3);
    assert.equal(restored.state.party[0].source,"api");
    assert.equal(restored.state.party[0].traceLevels.skill,8);
    assert.ok(Number.isNaN(restored.state.party[0].traceLevels.ultimate),"missing UID traces cannot become default Lv10");
    assert.equal(restored.state.party[0].atk,2345.67891);
    assert.ok(!app.storage.get(app.window.HsrCalcState.KEY).includes('profileCharacters'));
});

test("manual generic corrections live outside the character and equipment condition tabs", async () => {
    const app=await tool();
    app.node("hsrConditionDialogOpen").handlers.click();
    assert.doesNotMatch(app.node("hsrConditionTabs").innerHTML,/その他/);
    assert.doesNotMatch(app.node("hsrConditionList").innerHTML,/data-condition-value=/);
    assert.match(app.node("hsrManualConditionList").innerHTML,/data-condition-value="def-ignore"/);
    app.node("hsrManualConditionList").handlers.input({target:{dataset:{conditionEnabled:"def-ignore"},checked:true}});
    app.node("hsrManualConditionList").handlers.input({target:{dataset:{conditionValue:"def-ignore"},value:"20"}});
    assert.equal(app.state.conditions.find(x=>x.id==="def-ignore").enabled,true);
    assert.equal(app.state.conditions.find(x=>x.id==="def-ignore").value,20);
});


test("UID party support cannot silently substitute a default for a missing trace or provider stat", async () => {
    const app=await tool();
    app.node("hsrStat-atk").value="1000";
    app.state.party[0]={...app.state.party[0],characterId:"1202",source:"api",level:10,traceLevels:{skill:NaN,talent:9},atk:3000};
    app.state.modifierInputs["tingyun-benediction"]=true;
    assert.equal(app.calculate().length,0);
    assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
    app.node("hsrPartyDialogOpen").handlers.click();
    assert.match(app.node("hsrPartyRows").innerHTML,/data-party-trace="skill" data-slot="0" value=""/);
    app.state.party[0].traceLevels.skill=10;
    assert.ok(app.calculate().length>0);
    app.state.party[0].atk=NaN;
    assert.equal(app.calculate().length,0);
    assert.match(app.node("hsrResults").innerHTML,/data-hsr-pending-input/);
});


function selectReset(app, kind, confirm = true) {
    app.node("hsrResetMenu").handlers.click({target:{closest:()=>({dataset:{hsrReset:kind}})}});
    app.node(confirm ? "hsrResetConfirm" : "hsrResetCancel").handlers.click();
}

test("UID entries appear only in party character selection and preview images open the party editor", async () => {
    const app=await tool();
    app.window.HsrTool.setProfileCharacters([{id:"sample",level:80,eidolon:0},{id:"1202",level:80,eidolon:0}]);
    app.window.HsrTool.openSelection("character");
    assert.doesNotMatch(app.node("hsrSelectionList").innerHTML,/data-selection-profile=|UIDから取得したキャラクター/);
    app.window.HsrTool.openSelection("party",0);
    assert.match(app.node("hsrSelectionList").innerHTML,/data-selection-profile="1"/);
    app.node("hsrPartyPreview").handlers.click({target:{closest:()=>({dataset:{partyPreviewSlot:"1"}})}});
    assert.equal(app.node("hsrPartyDialog").open,true);
    assert.match(app.node("hsrPartyPreview").innerHTML,/class="genshin-party-preview-member"/);
});

test("condition reset preserves final stats and party, clears correction inputs, saves and requires recalculation", async () => {
    const app=await tool();
    app.node("hsrStat-atk").value="1234.567891";
    app.state.party[0]={...app.state.party[0],characterId:"1202",atk:3000,level:10};
    app.state.modifierInputs["tingyun-benediction"]=true;
    app.state.conditions[0].enabled=true;app.state.conditions[0].value=30;
    app.node("hsrEnemyDefenseIgnore").value="20";
    app.node("hsrPunchline").value="17";
    app.calculate();
    selectReset(app,"conditions",false);
    assert.equal(app.state.conditions[0].enabled,true,"cancel cannot reset inputs");
    selectReset(app,"conditions");
    assert.equal(app.state.stats.atk,1234.567891);
    assert.equal(app.state.party[0].characterId,"1202");
    assert.equal(app.state.conditions[0].enabled,false);
    assert.equal(app.state.conditions[0].value,0);
    assert.equal(app.state.enemy.defenseIgnore,0);
    assert.equal(app.state.modifierInputs["tingyun-benediction"],undefined);
    assert.equal(app.state.elationInputs.punchline,17);
    assert.doesNotMatch(app.node("hsrResults").innerHTML,/genshin-damage-result-row/);
    assert.equal(app.node("hsrDirtyNotice").hidden,false);
    const restored=await tool(app.storage);
    assert.equal(restored.state.stats.atk,1234.567891);
    assert.equal(restored.state.party[0].characterId,"1202");
    assert.equal(restored.state.conditions[0].enabled,false);
});

test("party reset keeps the active build, independent manual corrections and UID data", async () => {
    const app=await tool();
    app.storage.set("tetinet:hsr:lastUid:v1","100000001");
    app.window.HsrTool.setProfileCharacters([{id:"1202",level:80,eidolon:0}]);
    app.node("hsrStat-atk").value="1000";
    app.state.party[0]={...app.state.party[0],characterId:"1202",atk:3000};
    app.state.modifierInputs["tingyun-benediction"]=true;
    app.state.modifierInputs["independent-attack-context"]=true;
    app.state.conditions[0].enabled=true;app.state.conditions[0].value=10;
    app.state.attackerPosition=3;
    selectReset(app,"party");
    assert.equal(app.state.characterId,"sample");
    assert.equal(app.state.stats.atk,1000);
    assert.equal(app.state.attackerPosition,1);
    assert.ok(app.state.party.every(member=>member.characterId===""));
    assert.equal(app.state.modifierInputs["tingyun-benediction"],undefined);
    assert.equal(app.state.modifierInputs["independent-attack-context"],true);
    assert.equal(app.state.conditions[0].value,10);
    assert.equal(app.state.conditions[0].enabled,true);
    assert.equal(app.storage.get("tetinet:hsr:lastUid:v1"),"100000001");
    app.window.HsrTool.openSelection("party",0);
    assert.match(app.node("hsrSelectionList").innerHTML,/data-selection-profile="0"/);
});

test("all-input reset restores numeric defaults even after an incomplete UID build without deleting UID storage", async () => {
    const app=await tool();
    app.storage.set("tetinet:hsr:lastUid:v1","100000001");
    app.window.HsrTool.applyProfileCharacter({id:"sample",level:80,traces:[{type:"Normal",level:6}],stats:{atk:1234.567891}});
    assert.equal(app.node("hsrStat-speed").value,"");
    app.node("hsrEnemyLevel").value="90";
    app.state.modifierInputs["tingyun-benediction"]=true;
    selectReset(app,"all");
    assert.equal(app.state.characterId,"");
    assert.equal(app.state.source,"manual");
    assert.equal(app.state.stats.atk,0);
    assert.equal(app.state.stats.speed,100);
    assert.equal(app.state.stats.critRate,5);
    assert.equal(app.state.enemy.level,80);
    assert.equal(app.state.trueDamageInputs.active,false);
    assert.ok(Number.isNaN(app.state.elationInputs.punchline));
    assert.equal(app.storage.get("tetinet:hsr:lastUid:v1"),"100000001");
    const restored=await tool(app.storage);
    assert.equal(restored.state.characterId,"");
    assert.equal(restored.state.stats.speed,100);
    assert.doesNotMatch(restored.node("hsrResults").innerHTML,/genshin-damage-result-row/);
});

test("results reuse the Genshin table and per-attack inline breakdown without changing damage", async () => {
    const app=await tool();
    app.node("hsrStat-atk").value="3000";
    app.node("hsrStat-critRate").value="50";
    app.node("hsrStat-critDamage").value="100";
    const result=app.calculate()[0],html=app.node("hsrResults").innerHTML;
    assert.ok(Math.abs(result.nonCrit-1080)<1e-9);
    assert.ok(Math.abs(result.crit-2160)<1e-9);
    assert.ok(Math.abs(result.expected-1620)<1e-9);
    for(const cls of ["genshin-damage-table","genshin-damage-result-row","genshin-damage-detail-row","genshin-result-attack-head","genshin-result-detail-toggle"]) assert.ok(html.includes(cls),cls);
    assert.match(html,/data-result-tab="damage"/);
    assert.doesNotMatch(html,/data-result-tab="skill"/);
    assert.doesNotMatch(html,/data-result-tab="breakdown"/);
    assert.match(html,/aria-expanded="false" aria-controls="hsr-result-detail-0"/);
    app.node("hsr-result-detail-0").hidden=true;
    app.node("hsrResults").handlers.click({target:{closest:(selector)=>selector==="[data-hsr-result-detail]"?{dataset:{hsrResultDetail:"hsr-result-detail-0"},setAttribute(){},querySelector:()=>null}:null}});
    assert.equal(app.node("hsr-result-detail-0").hidden,false);
    app.node("hsrResults").handlers.click({target:{closest:(selector)=>selector==="[data-hsr-result-detail]"?{dataset:{hsrResultDetail:"hsr-result-detail-0"},setAttribute(){},querySelector:()=>null}:null}});
    assert.equal(app.node("hsr-result-detail-0").hidden,true);
});


test("HSR result categories separate sprites, Elation, DoT and talents and retain overlapping damage types", async () => {
    const app=await tool();
    const base=app.state.data.attacks[0];
    app.state.data.attacks=[
      {...base,id:"normal"},
      {...base,id:"skill",type:"skill"},
      {...base,id:"sprite-skill",type:"memospriteSkill"},
      {...base,id:"sprite-talent",type:"memospriteTalent"},
      {...base,id:"talent",type:"talent"},
      {...base,id:"additional",type:"additional"},
      {...base,id:"follow",type:"followUp"},
      {...base,id:"ultimate",type:"ultimate",tags:["followUp"]},
      {...base,id:"dot",type:"dot",canCrit:false},
      {...base,id:"elation",type:"elation",support:{status:"displayOnly",reason:"愉悦の専用条件が未対応です"}}
    ];
    app.node("hsrStat-atk").value="3000";
    const results=app.calculate(),html=app.node("hsrResults").innerHTML;
    assert.equal(results.length,9);
    for (const category of ["damage","skill","ultimate","memosprite","followUp","talent","additional","dot","elation"]) assert.ok(html.includes('data-result-tab="'+category+'"'),category);
    assert.doesNotMatch(html,/data-result-tab="other"/);
    const section=id=>html.split('data-result-panel="'+id+'"')[1].split('<section class="genshin-json-result-section"')[0];
    assert.match(section("memosprite"),/記憶の精霊スキル/);
    assert.match(section("memosprite"),/記憶の精霊天賦/);
    assert.doesNotMatch(section("followUp"),/記憶の精霊|天賦|付加ダメージ/);
    assert.match(section("ultimate"),/必殺技・追加攻撃/);
    assert.match(section("elation"),/愉悦の専用条件が未対応です/);
    assert.doesNotMatch(section("elation"),/genshin-damage-result-row/);
});

test("reference notices are specific to the attack and joint labels do not replace calculation types", async () => {
    const app=await tool();
    const base=app.state.data.attacks[0];
    app.state.data.attacks=[base,{...base,id:"800708",sourceSkillId:"800708",name:"連携の例",support:{status:"review",verified:false}}];
    app.state.coneId="cone";
    app.node("hsrStat-atk").value="3000";
    const results=app.calculate(),html=app.node("hsrResults").innerHTML;
    assert.equal(results.length,2);
    assert.equal(results[0].nonCrit,results[1].nonCrit);
    assert.equal(app.state.data.attacks[1].type,"normal");
    assert.match(html,/data-result-tab="joint"/);
    assert.match(html,/通常攻撃・連携/);
    assert.match(html,/連携全体の合計には未対応/);
    assert.match(html,/参考値：攻撃ごとの独立検証が完了していません/);
    assert.doesNotMatch(app.node("hsrWarnings").innerHTML,/参考値|常時効果は入力/);
    const normalPanel=html.split('data-result-panel="damage"')[1].split('<section class="genshin-json-result-section"')[0];
    assert.doesNotMatch(normalPanel,/参考値/);
});


test("Robin and Sunday party buffs preserve source stats, scoped validation and saves", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const records=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>["1309","1313"].includes(m.source.id));
    const app=await tool(undefined,{structuredModifiers:records});
    app.state.data.characters.push(...catalog.characters.filter(c=>["1309","1313"].includes(c.id)));
    const base=app.state.data.attacks[0];
    app.state.data.attacks.push({...base,id:"dot",name:"DoT comparison",type:"dot",canCrit:false});
    app.state.party[0]={...app.state.party[0],characterId:"1309",source:"manual",eidolon:0,traceLevels:{skill:10,talent:10}};
    app.state.party[1]={...app.state.party[1],characterId:"1313",source:"manual",eidolon:0,critDamage:200,traceLevels:{ultimate:10}};
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
    const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,actual+" != "+expected);
    near(app.calculate()[0].nonCrit,1080);
    Object.assign(app.state.modifierInputs,{"robin-skill-damage-active":true,"robin-talent-crit-active":true,"sunday-beatified-active":true});
    let r=app.calculate();near(r[0].nonCrit,1620);near(r[0].crit,4730.4);near(r[0].expected,3175.2);near(r[1].nonCrit,1620);
    app.node("hsrStat-atk").handlers.input();
    const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:records});
    near(restored.calculate()[0].expected,3175.2);
    assert.equal(restored.state.party[1].critDamage,200);assert.equal(restored.state.party[0].traceLevels.skill,10);
    for(const invalid of [NaN,-1,501]) {
        restored.state.party[1].critDamage=invalid;r=restored.calculate();
        assert.equal(r.length,1,"only the crit-capable ordinary attack is blocked");near(r[0].nonCrit,1620);
        assert.match(restored.node("hsrResults").innerHTML,/サンデー|祝福されし者/);
    }
    restored.state.modifierInputs["sunday-beatified-active"]=false;
    r=restored.calculate();assert.equal(r.length,2);near(r[0].crit,3564);
    restored.state.modifierInputs["sunday-beatified-active"]=true;
    restored.state.party[1].critDamage=200;restored.state.party[1].traceLevels.ultimate=NaN;
    assert.equal(restored.calculate().length,1);
    restored.state.party[1].characterId="";r=restored.calculate();assert.equal(r.length,2);near(r[0].crit,3564);
    restored.state.party[0].traceLevels.skill=NaN;assert.equal(restored.calculate().length,0);
    restored.state.modifierInputs["robin-skill-damage-active"]=false;assert.equal(restored.calculate().length,2);
    restored.state.party[0].characterId="";near(restored.calculate()[0].expected,1620);
});


test("Sunday buffs retain separate trace levels and expiry states across saves", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));const mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1313");
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(catalog.characters.find(c=>c.id==="1313"));
    app.state.party[0]={...app.state.party[0],characterId:"1313",eidolon:0,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    near(app.calculate()[0].expected,1620);
    Object.assign(app.state.modifierInputs,{"sunday-skill-damage-active":true,"sunday-talent-crit-active":true});let r=app.calculate()[0];near(r.nonCrit,1404);near(r.crit,2808);near(r.expected,2386.8);
    app.state.modifierInputs["sunday-beatified-active"]=true;r=app.calculate()[0];near(r.crit,3818.88);near(r.expected,3094.416);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:mods});near(restored.calculate()[0].expected,3094.416);
    restored.state.party[0].traceLevels.skill=NaN;assert.equal(restored.calculate().length,0);
    restored.state.modifierInputs["sunday-skill-damage-active"]=false;near(restored.calculate()[0].expected,2380.32);
    restored.state.modifierInputs["sunday-beatified-active"]=false;near(restored.calculate()[0].expected,1836);
    restored.state.party[0].traceLevels.talent=NaN;assert.equal(restored.calculate().length,0);
    restored.state.modifierInputs["sunday-talent-crit-active"]=false;near(restored.calculate()[0].expected,1620);
    restored.state.party[0].characterId="";near(restored.calculate()[0].expected,1620);
});


test("Concerto validates only ATK results and preserves manual final-stat responsibility", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));const mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1309");
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(catalog.characters.find(c=>c.id==="1309"));
    const base=app.state.data.attacks[0];app.state.data.attacks.push({...base,id:"def",name:"DEF example",scalingStat:"def"},{...base,id:"hp",name:"HP example",scalingStat:"hp"},{...base,id:"dot",name:"DoT example",type:"dot",canCrit:false});
    app.state.party[0]={...app.state.party[0],characterId:"1309",eidolon:0,atk:4000,traceLevels:{skill:10,talent:10,ultimate:10}};
    for(const[k,v]of Object.entries({atk:"3000",def:"3000",hp:"6000",critRate:"50",critDamage:"100"}))app.node("hsrStat-"+k).value=v;
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    app.state.modifierInputs["robin-concerto-atk-active"]=true;let r=app.calculate();assert.equal(r.length,4);near(r[0].nonCrit,1480.32);near(r[1].nonCrit,1080);near(r[2].nonCrit,2160);near(r[3].nonCrit,1480.32);
    assert.match(app.node("hsrResults").innerHTML,/追加物理は含まない/);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:mods});near(restored.calculate()[0].nonCrit,1480.32);
    for(const atk of [NaN,0,-1]) {restored.state.party[0].atk=atk;r=restored.calculate();assert.equal(r.length,2);near(r[0].nonCrit,1080);near(r[1].nonCrit,2160);}
    restored.state.party[0].atk=4000;restored.state.party[0].traceLevels.ultimate=NaN;assert.equal(restored.calculate().length,2);
    restored.state.modifierInputs["robin-concerto-atk-active"]=false;assert.equal(restored.calculate().length,4);near(restored.calculate()[0].nonCrit,1080);
    restored.node("hsrStat-atk").value="4112";near(restored.calculate()[0].nonCrit,1480.32);
    restored.node("hsrStat-atk").value="3000";restored.state.party[0].characterId="";near(restored.calculate()[0].nonCrit,1080);
});


test("Sparkle Skill preserves manual and UID trace levels and affects only crit-capable outputs", async () => {
    const cat=JSON.parse(read("games/hsr/data/catalog.json"));const mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1306");
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(cat.characters.find(c=>c.id==="1306"));const base=app.state.data.attacks[0];app.state.data.attacks.push({...base,id:"dot",type:"dot",canCrit:false});
    app.state.party[0]={...app.state.party[0],characterId:"1306",eidolon:0,critDamage:200,traceLevels:{skill:10}};
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);near(app.calculate()[0].expected,1620);
    app.state.modifierInputs["sparkle-enhanced-skill-active"]=true;near(app.calculate()[0].expected,2122.2);near(app.calculate()[1].nonCrit,1080);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:mods});near(restored.calculate()[0].expected,2122.2);
    restored.state.party[0].source="api";restored.state.party[0].traceLevels.skill=8;near(restored.calculate()[0].expected,2065.5);
    restored.state.party[0].traceLevels.skill=NaN;assert.equal(restored.calculate().length,1);
    restored.state.party[0].source="manual";restored.state.party[0].traceLevels.skill=10;restored.state.party[0].critDamage=NaN;assert.equal(restored.calculate().length,1);
    restored.state.modifierInputs["sparkle-enhanced-skill-active"]=false;restored.node("hsrStat-critDamage").value="193";near(restored.calculate()[0].expected,2122.2);
    restored.node("hsrStat-critDamage").value="100";restored.state.party[0].characterId="";near(restored.calculate()[0].expected,1620);
});


test("Sparkle shares one Figment input, preserves zero and blocks only affected invalid states", async () => {
    const cat=JSON.parse(read("games/hsr/data/catalog.json")),mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1306");
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(cat.characters.find(c=>c.id==="1306"));
    app.state.party[0]={...app.state.party[0],characterId:"1306",eidolon:0,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};
    for(const[k,v]of Object.entries({atk:"3000",critRate:"50",critDamage:"100"}))app.node("hsrStat-"+k).value=v;
    const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);near(app.calculate()[0].expected,1620);
    app.state.modifierInputs["sparkle-enhanced-figment-stacks"]=3;near(app.calculate()[0].expected,1814.4);
    app.state.modifierInputs["sparkle-enhanced-cipher-active"]=true;near(app.calculate()[0].expected,2106);
    app.state.modifierInputs["sparkle-enhanced-skill-active"]=true;let r=app.calculate()[0];near(r.nonCrit,1404);near(r.crit,4113.72);near(r.expected,2758.86);
    app.state.conditionTab="パーティ";app.node("hsrConditionDialogOpen").handlers.click();assert.equal((app.node("hsrConditionList").innerHTML.match(/data-structured-input="sparkle-enhanced-figment-stacks"/g)||[]).length,1);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:mods});near(restored.calculate()[0].expected,2758.86);
    restored.state.modifierInputs["sparkle-enhanced-skill-active"]=false;restored.state.modifierInputs["sparkle-enhanced-figment-stacks"]=0;restored.state.party[0].traceLevels.talent=NaN;restored.state.party[0].traceLevels.ultimate=NaN;near(restored.calculate()[0].expected,1620);
    restored.state.conditionTab="パーティ";restored.node("hsrConditionDialogOpen").handlers.click();assert.match(restored.node("hsrConditionList").innerHTML,/data-structured-toggle="sparkle-enhanced-cipher-active" checked/);assert.match(restored.node("hsrConditionList").innerHTML,/効果量0・未適用/);assert.match(restored.node("hsrConditionTitle").textContent,/選択中 1件/);
    restored.state.modifierInputs["sparkle-enhanced-figment-stacks"]=3;assert.equal(restored.calculate().length,0);
    restored.state.party[0].traceLevels.talent=10;assert.equal(restored.calculate().length,0);restored.state.modifierInputs["sparkle-enhanced-cipher-active"]=false;near(restored.calculate()[0].expected,1814.4);
    for(const count of [4,-1,1.5,NaN]) {restored.state.modifierInputs["sparkle-enhanced-figment-stacks"]=count;assert.equal(restored.calculate().length,0);}
    restored.state.party[0].characterId="";near(restored.calculate()[0].expected,1620);
});


test("provider stat edits in the condition modal preserve blank, zero and fractional values", async () => {
    const cat=JSON.parse(read("games/hsr/data/catalog.json")),mods=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1306");
    const app=await tool(undefined,{structuredModifiers:mods});app.state.data.characters.push(cat.characters.find(c=>c.id==="1306"));const base=app.state.data.attacks[0];app.state.data.attacks.push({...base,id:"dot",type:"dot",canCrit:false});
    app.state.party[0]={...app.state.party[0],characterId:"1306",eidolon:0,critDamage:200,traceLevels:{skill:10,talent:10,ultimate:10}};app.state.modifierInputs["sparkle-enhanced-skill-active"]=true;
    for(const[k,v]of Object.entries({atk:"3000",critRate:"50",critDamage:"100"}))app.node("hsrStat-"+k).value=v;
    const edit=value=>app.node("hsrConditionDialog").handlers.input({target:{value,dataset:{structuredProviderStat:"critDamage",providerId:"1306"}}});
    edit("");assert.ok(Number.isNaN(app.state.party[0].critDamage));assert.equal(app.calculate().length,1,"the unrelated DoT remains calculable");
    app.state.modifierInputs["sparkle-enhanced-skill-active"]=false;assert.equal(app.calculate().length,2);
    app.state.modifierInputs["sparkle-enhanced-skill-active"]=true;edit("0");assert.equal(app.state.party[0].critDamage,0);assert.ok(Math.abs(app.calculate()[0].expected-1863)<1e-8);
    edit("200.125");assert.equal(app.state.party[0].critDamage,200.125);assert.ok(Math.abs(app.calculate()[0].expected-2122.362)<1e-8);
    app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,{characters:app.state.data.characters,attacks:app.state.data.attacks,structuredModifiers:mods});assert.equal(restored.state.party[0].critDamage,200.125);assert.ok(Math.abs(restored.calculate()[0].expected-2122.362)<1e-8);
});


test("Yunli Slash explains entered CRIT DMG, Parry's intrinsic bonus and party support from the calculated snapshot", async () => {
    const catalog = JSON.parse(read("games/hsr/data/catalog.json"));
    const registered = require("../../scripts/lib/hsrDataFiles.cjs").loadHsrDataFiles(root);
    const data = { characters: catalog.characters, attacks: registered.attackOverrides.filter(a => a.characterId === "1221"),
        structuredModifiers: registered.modifiers.filter(m => ["1221", "1309"].includes(m.source.id)) };
    const app = await tool(undefined, data); app.state.characterId = "1221";
    app.state.party[0] = { characterId: "1309", level: 80, eidolon: 0, traceLevels: { talent: 10 } };
    Object.assign(app.state.modifierInputs, { "yunli-intuit-slash-instance": true, "robin-talent-crit-active": true });
    for (const [key, value] of Object.entries({ atk: 3000, critRate: 50, critDamage: 100 })) app.node("hsrStat-" + key).value = String(value);
    const setRank = rank => { app.node("hsrEidolon").value = String(rank); app.node("hsrEidolon").handlers.change({ target: { value: String(rank) } }); };
    const slash = target => target.calculate().find(r => r.attack.name.includes("看破・斬"));
    setRank(2);
    let result = slash(app);
    assert.equal(result.breakdown.critDamagePercent, 220, "input100 + Parry Lv10 intrinsic100 + Robin talent20; neither E1 nor E2 adds crit damage");
    assert.match(app.node("hsrResults").innerHTML, /最終入力100% ＋ 必殺技「構え」100% ＋ その他の補正20% ＝ 220%/);
    assert.ok(Math.abs(result.crit - 10137.6) < 1e-8); assert.ok(Math.abs(result.expected - 6652.8) < 1e-8);
    setRank(5); app.node("hsrUltimateTrace").value = "12";
    result = slash(app);
    assert.equal(result.breakdown.critDamagePercent, 228);
    assert.match(app.node("hsrResults").innerHTML, /最終入力100% ＋ 必殺技「構え」108% ＋ その他の補正20% ＝ 228%/);
    assert.ok(Math.abs(result.nonCrit - 3421.44) < 1e-8); assert.ok(Math.abs(result.crit - 11222.3232) < 1e-8); assert.ok(Math.abs(result.expected - 7321.8816) < 1e-8);
    const skill = app.calculate().find(r => r.attack.name.includes("天威煌々"));
    assert.equal(skill.breakdown.critDamagePercent, 120, "Parry's bonus never leaks into the ordinary Skill");
    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, data);
    assert.equal(restored.state.eidolon, 5); assert.equal(restored.state.traceLevels.ultimate, 12);
    assert.ok(Math.abs(slash(restored).crit - 11222.3232) < 1e-8);
    assert.match(restored.node("hsrResults").innerHTML, /最終入力100% ＋ 必殺技「構え」108% ＋ その他の補正20% ＝ 228%/);
    restored.state.party[0].characterId = "";
    assert.equal(slash(restored).breakdown.critDamagePercent, 208);
    assert.match(restored.node("hsrResults").innerHTML, /最終入力100% ＋ 必殺技「構え」108% ＝ 208%/);
});


test("promoted attacks keep reviewed siblings, per-attack limits, source corrections and saved comparison states", async () => {
    const dataWindow = {};
    vm.runInNewContext(read("games/js/hsrCalcData.js"), { window: dataWindow, fetch: async url => ({ ok: true, json: async () => JSON.parse(read(url.slice(1))) }) });
    const data = await dataWindow.HsrCalcData.load();
    const app = await tool(undefined, data);
    const profile = (id, eidolon = 0) => app.window.HsrTool.applyProfileCharacter({ id, level: 80, eidolon,
        traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "Ultra", level: 10 }, { type: "Talent", level: 10 }],
        stats: { atk: 3000, hp: 6000, def: 3000, critRate: 50, critDamage: 100, damageBonus: 0 } });
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + " != " + expected);
    const find = name => app.calculate().find(result => result.attack.name === name);
    profile("1221", 2);
    let normal = find("震天動地"); near(normal.nonCrit, 1080);
    assert.equal(normal.applied.some(m => m.id.startsWith("eidolon:1221:")), false, "Counter-only E1/E2 never enter Basic damage");
    assert.match(app.node("hsrResults").innerHTML, /全段合算/);
    app.state.modifierInputs["yunli-true-sunder-active"] = true;
    near(find("震天動地").nonCrit, (3000 + 679.14 * .3) * .36);
    app.state.modifierInputs["yunli-true-sunder-active"] = false;
    app.node("hsrNormalTrace").value = "7";
    assert.equal(find("震天動地"), undefined, "E2 cannot use Basic Lv7");
    app.node("hsrEidolon").value = "3"; app.node("hsrEidolon").handlers.change({ target: { value: "3" } });
    near(find("震天動地").nonCrit, 1188);
    profile("1305");
    near(find("産婆術").nonCrit, 1620);
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /data-support-status="review"/);
    assert.match(app.node("hsrResults").innerHTML, /天賦の追撃は別/);
    app.state.modifierInputs["ratio-deduction-unlocked"] = true; app.node("hsrEnemyDebuffCount").value = "3";
    near(find("産婆術").nonCrit, 2106);
    app.node("hsrEnemyDebuffCount").value = "5";
    const skill = find("産婆術"); near(skill.nonCrit, 2430); near(skill.crit, 4860); near(skill.expected, 3645);
    assert.equal(skill.breakdown.critDamagePercent, 100, "the entered snapshot already owns Induction; it is not silently added twice");
    app.state.modifierInputs["ratio-deduction-unlocked"] = false;
    near(find("産婆術").nonCrit, 1620);
    profile("1317"); app.node("hsrWeakness").value = "false"; app.node("hsrToughnessState").value = "active";
    near(find("忍切・初志貫徹").nonCrit, 1296);
    app.node("hsrWeakness").value = "true";
    assert.equal(find("忍切・初志貫徹"), undefined); assert.equal(find("忍法・七転八起"), undefined, "both verified direct attacks require the non-weak target scope"); assert.ok(app.calculate().some(r => r.attack.name === "忍具・降魔の花弁"), "the unverified enhanced comparison remains a reference value");
    assert.match(app.node("hsrResults").innerHTML, /hsrWeakness/);
    app.node("hsrWeakness").value = "false"; app.node("hsrToughnessState").value = "broken";
    assert.equal(find("忍切・初志貫徹"), undefined); assert.match(app.node("hsrResults").innerHTML, /hsrToughnessState/);
    app.node("hsrToughnessState").value = "active"; app.node("hsrSkillTrace").value = "";
    assert.equal(find("忍切・初志貫徹"), undefined, "only the Skill needs its missing level");
    app.node("hsrSkillTrace").value = "10"; app.node("hsrEidolon").value = "1";
    assert.equal(find("忍切・初志貫徹"), undefined, "E1 is outside the verified Skill scope");
    app.node("hsrEidolon").value = "0"; app.node("hsrStat-atk").value = "4000";
    near(find("忍切・初志貫徹").nonCrit, 1728);
    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, data);
    near(restored.calculate().find(r => r.attack.name === "忍切・初志貫徹").nonCrit, 1728);
    assert.equal(restored.state.enemy.weakness, false); assert.equal(restored.state.enemy.toughnessActive, true);
    restored.node("hsrStat-atk").value = "";
    assert.equal(restored.calculate().length, 0, "missing required ATK must not produce a partial value");
});


test("grouped Basic promotions preserve stat ownership, E0 limits, party toggles and saved comparison inputs", async () => {
    const window = {};
    vm.runInNewContext(read("games/js/hsrCalcData.js"), { window, fetch: async url => ({ ok: true, json: async () => JSON.parse(read(url.slice(1))) }) });
    const data = await window.HsrCalcData.load();
    const app = await tool(undefined, data);
    const names = { "1211": "望・聞・問…蹴！", "1215": "冥兆天筆", "1217": "令旗・風雨招来", "1304": "ストレートべット", "1313": "光を纏う告諭" };
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + " != " + b);
    const find = (target, name) => target.calculate().find(r => r.attack.name === name && r.attack.hitCountLabel === "全段合算");
    for (const [id, name] of Object.entries(names)) {
        app.window.HsrTool.applyProfileCharacter({ id, level: 80, eidolon: 0,
            traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "Ultra", level: 10 }, { type: "Talent", level: 10 }],
            stats: { atk: 3000, hp: 6000, def: 3000, critRate: 50, critDamage: 100, damageBonus: 0 } });
        let result = find(app, name); near(result.nonCrit, 1080); near(result.crit, 2160); near(result.expected, 1620);
        assert.match(app.node("hsrResults").innerHTML, /全段合算/);
        assert.match(app.node("hsrResults").innerHTML, /星魂0・通常攻撃Lv1～6/);
        if (id === "1215") assert.match(app.node("hsrResults").innerHTML, /承負なし/);
        if (id === "1304") assert.equal(result.breakdown.critRatePercent, 50, "Leverage is already owned by final input, not added twice");
        app.node("hsrEidolon").value = "1";
        assert.equal(find(app, name), undefined, id + " must not silently calculate E0 damage for E1");
        app.node("hsrEidolon").value = "0"; app.node("hsrNormalTrace").value = "7";
        assert.equal(find(app, name), undefined, id + " must reject an unverified Basic level");
        app.node("hsrNormalTrace").value = "6";
        const key = id === "1217" ? "hp" : id === "1304" ? "def" : "atk";
        app.node("hsrStat-" + key).value = "";
        assert.equal(find(app, name), undefined, id + " missing source stat stops only affected results");
        app.node("hsrStat-" + key).value = key === "hp" ? "6000" : "3000";
        if (key !== "atk") { app.node("hsrStat-atk").value = ""; near(find(app, name).nonCrit, 1080); }
        app.state.party[0] = { characterId: "1309", level: 80, eidolon: 0, atk: 4000, traceLevels: { skill: 10, talent: 10, ultimate: 10 } };
        app.state.modifierInputs["robin-skill-damage-active"] = true;
        result = find(app, name); near(result.nonCrit, 1620); near(result.crit, 3240); near(result.expected, 2430);
        app.state.modifierInputs["robin-concerto-atk-active"] = true;
        result = find(app, name);
        near(result.nonCrit, key === "atk" ? (3000 + 4000 * .228 + 200) * .36 * 1.5 : 1620);
        app.state.modifierInputs["robin-concerto-atk-active"] = false;
        app.node("hsrStat-" + key).handlers.input();
        const restored = await tool(app.storage, data);
        near(find(restored, name).nonCrit, 1620);
        assert.equal(restored.state.party[0].characterId, "1309");
        assert.equal(restored.state.modifierInputs["robin-skill-damage-active"], true);
        restored.state.party[0].characterId = "";
        near(find(restored, name).nonCrit, 1080);
        app.state.party[0].characterId = "";
        app.state.modifierInputs["robin-skill-damage-active"] = false;
    }
});


test("second grouped promotions preserve independent comparison states, source stats and native/support conditions", async () => {
    const window = {};
    vm.runInNewContext(read("games/js/hsrCalcData.js"), { window, fetch: async url => ({ ok: true, json: async () => JSON.parse(read(url.slice(1))) }) });
    const data = await window.HsrCalcData.load();
    const app = await tool(undefined, data);
    const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + " != " + b);
    const profile = id => app.window.HsrTool.applyProfileCharacter({ id, level: 80, eidolon: 0,
        traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "Ultra", level: 10 }, { type: "Talent", level: 10 }],
        stats: { atk: 3123.5, hp: 9876.25, def: 2345.75, critRate: 50, critDamage: 100, damageBonus: 0 } });
    const promoted = (target, name) => target.calculate().find(r => r.attack.name === name && r.attack.hitCountLabel === "全段合算");
    for (const [id, name, key, coefficient] of [["1312", "ど…退いてくださーい！", "atk", 1], ["1301", "持ち込み料", "atk", 1], ["1315", "スパーズ・クラッシュ", "atk", 1], ["1317", "忍法・七転八起", "atk", 1], ["1409", "雲を撫でるそよ風", "hp", .5]]) {
        profile(id); app.node("hsrWeakness").value = "false"; app.node("hsrToughnessState").value = "active";
        const base = promoted(app, name); const original = { atk: 3123.5, hp: 9876.25, def: 2345.75 };
        near(base.nonCrit, original[key] * coefficient * .36);
        for (const changed of ["atk", "hp", "def"]) {
            app.node("hsrStat-" + changed).value = String(original[changed] + 157.25);
            const next = promoted(app, name);
            for (const property of ["nonCrit", "crit", "expected"]) near(next[property], base[property] * (changed === key ? (original[key] + 157.25) / original[key] : 1));
            app.node("hsrStat-" + changed).value = String(original[changed]);
        }
        app.node("hsrEidolon").value = "1"; assert.equal(promoted(app, name), undefined);
        app.node("hsrEidolon").value = "0";
        app.node("hsrStat-" + key).value = ""; assert.equal(promoted(app, name), undefined);
        app.node("hsrStat-" + key).value = String(original[key]);
    }
    profile("1312");
    const normal = "ど…退いてくださーい！", skill = "ル…ルームサービスです！";
    near(promoted(app, skill).nonCrit, 3123.5 * 2 * .36);
    assert.equal(app.calculate().filter(r => r.attack.target === "adjacent").length, 0, "one enemy has no adjacent target");
    app.node("hsrSkillTrace").value = "";
    assert.equal(promoted(app, skill), undefined); assert.ok(promoted(app, normal));
    app.node("hsrSkillTrace").value = "10";
    app.state.modifierInputs["misha-frozen-crit-active"] = true;
    near(promoted(app, normal).crit, 3123.5 * .36 * 2.3);
    near(promoted(app, skill).crit, 3123.5 * 2 * .36 * 2.3);
    assert.match(app.node("hsrResults").innerHTML, /トランスミッション/);
    app.state.modifierInputs["misha-frozen-crit-active"] = false;
    app.node("hsrStat-critDamage").value = "130";
    near(promoted(app, skill).crit, 3123.5 * 2 * .36 * 2.3);
    app.node("hsrStat-critDamage").value = "100"; app.state.modifierInputs["misha-frozen-crit-active"] = true;
    app.state.party[0] = { characterId: "1309", level: 80, eidolon: 0, traceLevels: { skill: 10 } };
    app.state.modifierInputs["robin-skill-damage-active"] = true;
    near(promoted(app, skill).nonCrit, 3123.5 * 2 * .36 * 1.5);
    near(promoted(app, skill).crit, 3123.5 * 2 * .36 * 1.5 * 2.3);
    app.node("hsrStat-atk").handlers.input();
    const restored = await tool(app.storage, data);
    near(promoted(restored, skill).crit, 3123.5 * 2 * .36 * 1.5 * 2.3);
    assert.equal(restored.state.modifierInputs["misha-frozen-crit-active"], true);
    restored.state.party[0].characterId = "";
    near(promoted(restored, skill).crit, 3123.5 * 2 * .36 * 2.3);
    profile("1301"); app.state.party[0].characterId = ""; app.state.modifierInputs["robin-skill-damage-active"] = false;
    app.state.modifierInputs["break-besotted-active"] = true;
    near(promoted(app, "持ち込み料").nonCrit, 3123.5 * .36);
    assert.equal(promoted(app, "持ち込み料").applied.some(m => m.id.includes("misha")), false, "previous actor's frozen buff cannot leak");
    profile("1317"); app.node("hsrWeakness").value = "true";
    assert.equal(promoted(app, "忍法・七転八起"), undefined);
    app.node("hsrWeakness").value = "false"; app.node("hsrToughnessState").value = "broken";
    assert.equal(promoted(app, "忍法・七転八起"), undefined);
    profile("1315"); app.node("hsrToughnessState").value = "active";
    app.state.modifierInputs["boothill-fanning-broken"] = true;
    near(promoted(app, "スパーズ・クラッシュ").nonCrit, 3123.5 * .36);
    assert.equal(promoted(app, "スパーズ・クラッシュ").applied.some(m => m.id === "trace:1315:131502:standoff-vulnerability"), false);
});


test("major actions compare assumed states without selecting availability and stop only invalid results", async () => {
    const window = {};
    vm.runInNewContext(read("games/js/hsrCalcData.js"), { window, fetch: async url => ({ ok: true, json: async () => JSON.parse(read(url.slice(1))) }) });
    const data = await window.HsrCalcData.load(), app = await tool(undefined, data);
    const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, a+" != "+b);
    const profile = id => { app.window.HsrTool.applyProfileCharacter({ id, level:80,eidolon:0,
        traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],
        stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
        app.node("hsrWeakness").value="false"; app.node("hsrToughnessState").value="active"; };
    const find=(target,name)=>target.calculate().find(r=>r.attack.name===name);
    const cull="天を揺るがす大地の剣・看破・滅（敵1体）";
    profile("1221");
    const initial=find(app,cull);near(initial.nonCrit,7041.6);near(initial.crit,21124.8);near(initial.expected,14083.2);
    assert.equal(app.state.modifierInputs["yunli-intuit-cull-instance"],undefined);
    assert.match(app.node("hsrResults").innerHTML,/初撃 220% ＋ 追加6ヒット合計 432% ＝ 652%/);
    assert.match(app.node("hsrResults").innerHTML,/最終入力100% ＋ 必殺技「構え」100%/);
    app.state.modifierInputs["yunli-intuit-slash-instance"]=false;
    assert.ok(app.calculate().some(r=>r.attack.name.includes("看破・斬")));
    app.node("hsrEidolon").value="1";assert.equal(find(app,cull),undefined);assert.ok(app.calculate().some(r=>r.attack.name.includes("看破・斬")));
    profile("1312");const ult="ち…遅刻する！";
    near(find(app,ult).nonCrit,1944);
    assert.doesNotMatch(app.node("hsrResults").innerHTML, /計算に追加しない補正/, "the hit-count input is used by this attack, not an excluded modifier");
    app.state.conditionTab="軌跡";
    app.node("hsrConditionDialogOpen").handlers.click();
    assert.match(app.node("hsrConditionList").innerHTML, /data-condition-purpose="attack"/);
    assert.match(app.node("hsrConditionList").innerHTML, /data-structured-input="misha-ultimate-hits"/);
    app.node("hsrConditionDialogClose").handlers.click();
    app.state.modifierInputs["misha-ultimate-hits"]=10;
    near(find(app,ult).nonCrit,6480);near(find(app,ult).crit,12960);near(find(app,ult).expected,9720);
    app.state.modifierInputs["misha-frozen-crit-active"]=true;
    near(find(app,ult).crit,14904);near(find(app,ult).expected,10692);
    for(const invalid of [NaN,0,2,11,3.5]){app.state.modifierInputs["misha-ultimate-hits"]=invalid;assert.equal(find(app,ult),undefined);assert.ok(find(app,"ど…退いてくださーい！"));assert.match(app.node("hsrResults").innerHTML,/攻撃段数に3～10の整数/);}
    app.state.modifierInputs["misha-ultimate-hits"]=10;app.node("hsrStat-atk").handlers.input();
    const saved=await tool(app.storage,data);near(find(saved,ult).expected,10692);assert.equal(saved.state.modifierInputs["misha-ultimate-hits"],10);
    app.state.modifierInputs["misha-frozen-crit-active"]=false;
    for(const[id,name,expected]of [["1314","欲望の淵での地獄の契り",2592],["1224","蓋世の傑物、三月なのか",2592]]){profile(id);near(find(app,name).nonCrit,expected);near(find(app,name).crit,expected*2);app.node("hsrWeakness").value="true";assert.equal(find(app,name),undefined);assert.match(app.node("hsrResults").innerHTML,id==="1314"?/量子属性/:/虚数属性/);}
    profile("1220");const follow="雷狩・追加攻撃1回";
    near(find(app,follow).nonCrit,1900.8);near(find(app,follow).expected,2851.2);
    assert.equal(find(app,follow).breakdown.damageBonus,60);
    app.state.modifierInputs["feixiao-formshift-unlocked"]=true;
    near(find(app,follow).crit,4485.888);near(find(app,follow).expected,3193.344);
    app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;
    const supported=find(app,follow);near(supported.nonCrit,2494.8);near(supported.expected,4191.264);assert.equal(supported.breakdown.damageBonus,110);
    app.node("hsrTalentTrace").value="";assert.equal(find(app,follow),undefined);assert.ok(app.calculate().some(r=>r.attack.name==="閃裂"));
    app.node("hsrTalentTrace").value="10";app.node("hsrStat-atk").handlers.input();
    const restored=await tool(app.storage,data);near(find(restored,follow).expected,4191.264);restored.state.party[0].characterId="";near(find(restored,follow).expected,3193.344);
    assert.match(restored.node("hsrResults").innerHTML,/data-support-status="review"/);
});


test("Feixiao Skill keeps component corrections separate and never adds the independent Follow-Up row twice", async () => {
    const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
    const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    app.window.HsrTool.applyProfileCharacter({id:"1220",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
    const skill=target=>target.calculate().find(r=>r.breakdown?.damageFormula==="componentSequence");
    let result=skill(app);near(result.components.skill.nonCrit,2160);near(result.components.followUp.nonCrit,1900.8);near(result.nonCrit,4060.8);near(result.crit,8121.6);near(result.expected,6091.2);
    assert.equal(app.state.modifierInputs["feixiao-previous-followup-buff"],undefined);
    const independent=app.calculate().find(r=>r.attack.name==="雷狩・追加攻撃1回");near(independent.nonCrit,1900.8);near(result.nonCrit,result.components.skill.nonCrit+independent.nonCrit);
    assert.match(app.node("hsrResults").innerHTML,/hsr-result-scope-label">スキル本体＋直後の雷狩1回の合計/);
    assert.match(app.node("hsrResults").innerHTML,/hsr-result-scope-label">雷狩1回だけの比較値/);
    assert.equal(result.components.skill.applied.some(m=>m.id==="trace:1220:122004:followup-damage"),false);
    assert.equal(result.components.followUp.applied.filter(m=>m.id==="trace:1220:122004:followup-damage").length,1);
    app.state.modifierInputs["feixiao-formshift-unlocked"]=true;
    result=skill(app);near(result.components.skill.crit,4320);near(result.components.followUp.crit,4485.888);near(result.expected,6433.344);
    app.state.modifierInputs["feixiao-previous-followup-buff"]=true;
    result=skill(app);near(result.components.skill.nonCrit,3456);near(result.components.followUp.nonCrit,1900.8);near(result.nonCrit,5356.8);
    for(const stat of ["atk","hp","def"]){const value=Number(app.node("hsrStat-"+stat).value);app.node("hsrStat-"+stat).value=String(value+413.5);near(skill(app).nonCrit,result.nonCrit*(stat==="atk"?(value+413.5)/value:1));app.node("hsrStat-"+stat).value=String(value);}
    app.state.modifierInputs["feixiao-previous-followup-buff"]=false;
    app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;
    result=skill(app);near(result.components.skill.nonCrit,3240);near(result.components.followUp.nonCrit,2494.8);near(result.nonCrit,5734.8);near(result.expected,9051.264);
    app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(skill(saved).expected,9051.264);
    saved.state.party[0].characterId="";near(skill(saved).expected,6433.344);
    assert.match(saved.node("hsrResults").innerHTML,/スキル本体＋追加攻撃の合計/);
    saved.node("hsrSkillTrace").value="";assert.equal(skill(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack.name==="雷狩・追加攻撃1回"));
    saved.node("hsrSkillTrace").value="10";saved.node("hsrTalentTrace").value="";assert.equal(skill(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack.name==="閃裂"));
    saved.node("hsrTalentTrace").value="10";
    for(const[key,value]of [["hsrEidolon","1"],["hsrLevel","70"],["hsrWeakness","true"],["hsrToughnessState","broken"]]){const old=saved.node(key).value;saved.node(key).value=value;assert.equal(skill(saved),undefined,key);saved.node(key).value=old;}
    const kept=saved.state.data.attacks;saved.state.data.attacks=kept.filter(a=>a.id!=="122004");assert.equal(skill(saved),undefined,"missing component must stop the Skill locally");saved.state.data.attacks=kept;
});

test("Jade capped-Pawn Follow-Up uses final stats once and only needs Ultimate Lv when its boost is selected", async () => {
    const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
    const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    app.window.HsrTool.applyProfileCharacter({id:"1314",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:220,damageBonus:0}});
    const follow=target=>target.calculate().find(r=>r.attack.name==="富を削ぐ毒牙（質草50層・敵1体）");
    let result=follow(app);near(result.nonCrit,1296);near(result.crit,4147.2);near(result.expected,2721.6);assert.match(app.node("hsrResults").innerHTML,/hsr-result-scope-label">[^<]*必殺技強化なし/);assert.equal(result.breakdown.critDamagePercent,220,"the final 50-stack CRIT DMG is not added twice");
    app.state.modifierInputs["jade-enhanced-followup-active"]=true;
    result=follow(app);near(result.nonCrit,2160);near(result.crit,6912);near(result.expected,4536);near(result.breakdown.multiplierAddition,80);
    assert.match(app.node("hsrResults").innerHTML,/hsr-result-scope-label">[^<]*必殺技強化あり（倍率＋80ポイント）/);
    assert.equal(result.applied.filter(m=>m.id==="trace:1314:131403:followup-multiplier").length,1);
    app.node("hsrUltimateTrace").value="";assert.equal(follow(app),undefined);assert.ok(app.calculate().some(r=>r.attack.name==="むしり取る鞭打ち"));
    app.state.modifierInputs["jade-enhanced-followup-active"]=false;near(follow(app).nonCrit,1296);
    app.node("hsrUltimateTrace").value="10";app.state.modifierInputs["jade-enhanced-followup-active"]=true;
    app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(follow(saved).expected,4536);assert.equal(saved.state.modifierInputs["jade-enhanced-followup-active"],true);
    saved.node("hsrEidolon").value="1";assert.equal(follow(saved),undefined);
});

test("Hunt March compares realized enhanced hits without activation selection and stops only incomplete enhanced rows", async () => {
    const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
    const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    app.window.HsrTool.applyProfileCharacter({id:"1224",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
    const enhanced=target=>target.calculate().filter(r=>r.attack.name.startsWith("一に眉間、二に心臓・"));
    let values=enhanced(app);assert.equal(values.length,6);
    values.forEach((r,i)=>{near(r.nonCrit,1555.2*(i+3));near(r.crit,r.nonCrit*2);near(r.expected,r.nonCrit*1.5);assert.equal(r.applied.filter(m=>m.id==="trace:1224:122404:enhanced-damage").length,1);});
    near(app.calculate().find(r=>r.attack.name==="妖魔を祓う瑠璃剣").nonCrit,1080);
    near(app.calculate().find(r=>r.attack.name==="蓋世の傑物、三月なのか").nonCrit,2592);
    assert.match(app.node("hsrResults").innerHTML,/想定：7段・必殺技強化後のみ・師匠：調和\/虚無\/存護\/豊穣/);
    assert.match(app.node("hsrResults").innerHTML,/段数抽選の平均ではありません/);
    assert.match(app.node("hsrResults").innerHTML,/hsr-result-scope-label">師匠由来の付加ダメージの参考値/);
    assert.equal(Object.keys(app.state.modifierInputs).length,0,"no availability checkbox or new saved state is needed");
    app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;
    values=enhanced(app);near(values[0].nonCrit,5961.6);
    app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(enhanced(saved)[0].expected,8942.4);
    saved.state.party[0].characterId="";near(enhanced(saved)[0].expected,6998.4);
    saved.node("hsrTalentTrace").value="";assert.equal(enhanced(saved).length,0);assert.doesNotMatch(saved.node("hsrResults").innerHTML,/固有補正を読み込めません/);assert.ok(saved.calculate().some(r=>r.attack.name==="妖魔を祓う瑠璃剣"));assert.ok(saved.calculate().some(r=>r.attack.name==="蓋世の傑物、三月なのか"));
    saved.node("hsrTalentTrace").value="10";
    for(const [id,value]of [["hsrEidolon","1"],["hsrNormalTrace","7"],["hsrLevel","70"],["hsrWeakness","true"],["hsrToughnessState","broken"],["hsrStat-atk",""]]){const old=saved.node(id).value;saved.node(id).value=value;assert.equal(enhanced(saved).length,0,id);saved.node(id).value=old;}
    const mods=saved.state.data.structuredModifiers;saved.state.data.structuredModifiers=mods.filter(m=>m.id!=="trace:1224:122404:enhanced-damage");assert.equal(enhanced(saved).length,0,"missing native modifier cannot yield a partial result");saved.state.data.structuredModifiers=mods;
});

test("completion promotions keep source stats, optional corrections and saved party conditions separate", async () => {
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:4000,critRate:50,critDamage:100,damageBonus:0}});
 profile("1304");const follow=t=>t.calculate().find(r=>r.attack.name.startsWith("銃口の右には…"));
 let r=follow(app);near(r.nonCrit,2520);near(r.crit,5040);near(r.expected,3780);assert.equal(r.attack.hitCount,7);
 app.state.modifierInputs["aventurine-unnerve-active"]=true;r=follow(app);near(r.nonCrit,2520);near(r.crit,5418);near(r.expected,3969);assert.equal(r.applied.filter(m=>m.id==="trace:1304:130403:crit-vulnerability").length,1);
 app.node("hsrUltimateTrace").value="";assert.equal(follow(app),undefined);assert.match(app.node("hsrResults").innerHTML,/アベンチュリンの必殺技Lv/);
 app.state.modifierInputs["aventurine-unnerve-active"]=false;near(follow(app).expected,3780);app.node("hsrUltimateTrace").value="10";
 for(const [id,value]of [["hsrEnemyCount","2"],["hsrEidolon","1"],["hsrToughnessState","broken"],["hsrTalentTrace",""]]){const old=app.node(id).value;app.node(id).value=value;assert.equal(follow(app),undefined,id);app.node(id).value=old;}
 profile("1305");const basic=t=>t.calculate().find(r=>r.attack.name==="知識は力なり");near(basic(app).nonCrit,1080);near(basic(app).expected,1620);
 app.state.modifierInputs["ratio-deduction-unlocked"]=true;
 for(const[count,expected]of [[0,1620],[2,1620],[3,2106],[4,2268],[5,2430],[7,2430]]){app.node("hsrEnemyDebuffCount").value=String(count);near(basic(app).expected,expected);}
 app.node("hsrEnemyDebuffCount").value="3";app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;near(basic(app).expected,2916);
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(basic(saved).expected,2916);saved.state.party[0].characterId="";near(basic(saved).expected,2106);
 saved.node("hsrNormalTrace").value="";assert.equal(basic(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack.name==="三段階のパラドックス"));saved.node("hsrNormalTrace").value="6";
 saved.state.modifierInputs["ratio-deduction-unlocked"]=false;near(basic(saved).expected,1620);
});


test("Jiaoqiu and Lingsha basics compare without availability checks and preserve native/support scopes", async () => {
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 const profile=(id,traces=[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}])=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces,stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const basic=t=>t.calculate().find(r=>r.attack.name.startsWith(t.state.characterId==="1218"?"心火計":"供香"));
 profile("1218");let r=basic(app);near(r.nonCrit,1458);near(r.crit,2916);near(r.expected,2187);
 assert.equal(r.applied.filter(m=>m.id==="trace:1218:121804:basic-five-roast").length,1);
 assert.equal(Object.keys(app.state.modifierInputs).length,0,"assumed five-stack basic needs no availability toggle");
 app.state.modifierInputs["jiaoqiu-five-roast-zone"]=true;near(basic(app).nonCrit,1458);
 app.state.modifierInputs["jiaoqiu-roast-dot-tick"]=true;app.state.modifierInputs["jiaoqiu-roast-dot-stacks"]=5;near(basic(app).nonCrit,1458);
 app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;near(basic(app).expected,3280.5);
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(basic(saved).expected,3280.5);saved.state.party[0].characterId="";near(basic(saved).expected,2187);
 saved.node("hsrNormalTrace").value="";assert.equal(basic(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack.name.startsWith("炊陣妙法")));saved.node("hsrNormalTrace").value="6";
 const records=saved.state.data.structuredModifiers;saved.state.data.structuredModifiers=records.filter(m=>m.id!=="trace:1218:121804:basic-five-roast");assert.equal(basic(saved),undefined);saved.state.data.structuredModifiers=records;
 profile("1218",[{type:"Normal",level:6}]);assert.equal(basic(app),undefined,"Talent is required for native Roast");assert.match(app.node("hsrResults").innerHTML,/天賦/);
 app.state.party[0].characterId="";app.state.modifierInputs["robin-skill-damage-active"]=false;
 profile("1222");near(basic(app).nonCrit,1080);near(basic(app).expected,1620);assert.equal(basic(app).applied.some(m=>m.id==="trace:1218:121804:basic-five-roast"),false);
 app.state.modifierInputs["break-befog-active"]=true;near(basic(app).nonCrit,1080,"Break-only Befog cannot buff the direct basic");
 for(const [id,value]of [["hsrEidolon","1"],["hsrNormalTrace","7"],["hsrLevel","70"],["hsrWeakness","true"],["hsrToughnessState","broken"],["hsrStat-atk",""]]){const old=app.node(id).value;app.node(id).value=value;assert.equal(basic(app),undefined,id);app.node(id).value=old;}
});
