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
    // Existing fixtures isolate optional supports and emulate their prior saved OFF state.
    // Tests for a fresh automatic Talent explicitly remove this legacy key.
    if (!savedStorage) state.modifierInputs["robin-talent-crit-active"] = false;
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
    app.node("hsrEnemyMaxHp").value = "100000";
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
        assert.ok(results.some((result) => result.attack?.name === attacks.get(`${blocked.characterId}01`)?.name), `normal attack remains for ${id}`);
        assert.ok(!results.some((result) => result.attack?.name === blocked.name), id);
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
    assert.equal(results.length, 3);
    const learnedDirect=results.find(result=>result.attack.name.includes('DEF直接攻撃'));
    for(const [metric,value]of Object.entries({nonCrit:1080,crit:2160,expected:1620})) assert.ok(Math.abs(learnedDirect[metric]-value)<1e-9);
    assert.ok(!results.some(result=>result.attack.name.includes('全ダメージ成分')),'unknown learned-owner values must not produce a complete total');
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
    app.state.modifierInputs['tingyun-reference-lightning:sample']=0;app.state.modifierInputs['enemy-resistance:Thunder']=20;
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
    for(const [id,cid,key,nc]of [["121502","1215","hanya-unburdened-skill",(3000+564.48*.1)*2.4*1.3*.36],["130103","1301","",1620]]){
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
        if(id==="121502"){assert.ok(Math.abs(r.breakdown.referenceValue-(3000+564.48*.1))<1e-9);assert.ok(r.applied.some(m=>m.id==="trace:1215:121504:party-damage"));assert.ok(r.applied.some(m=>m.id==="traceNode:1215:1215101:sp-recovery-atk"));}else assert.ok(app.node("hsrResults").innerHTML.includes("3,000 × "+byId.get(id).multipliers[9]+"%"));
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
    assert.equal(enhanced().nonCrit,enhancedBase,"the enhanced comparison already includes its required Hellscape state without changing saved globals");
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
    assert.match(app.node("hsrResults").innerHTML,/弱点撃破・適用された補正/);assert.ok(app.node("hsrResults").innerHTML.includes('<details class="hsr-result-audit"><summary>適用・除外された補正</summary>'), "Break audit uses the same framed list container as direct damage");assert.match(app.node("hsrResults").innerHTML,/芳酔・撃破被ダメージ増加/);assert.match(app.node("hsrResults").innerHTML,/酩酊・撃破被ダメージ増加/);
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
    app.state.modifierInputs["tingyun-reference-lightning:sample"] = 0;app.state.modifierInputs["enemy-resistance:Thunder"]=20;
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

test("Robin E1 resistance toggle is independent of final ATK, restores, and requires its party provider", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const e1=JSON.parse(read("games/hsr/data/calc/modifiers-batch3-main-actions.json")).modifiers.filter(m=>m.id==="eidolon:1309:130901:concerto-resistance-penetration");
    const existing=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1309"&&m.providerScope==="party");
    const extraData={structuredModifiers:[...e1,...existing]};
    const app=await tool(undefined,extraData);
    const robin=catalog.characters.find(c=>c.id==="1309");app.state.data.characters.push(robin);
    app.node("hsrStat-atk").value="4112";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
    app.state.party[0]={characterId:"1309",level:80,eidolon:1,atk:4000,traceLevels:{skill:10,talent:10,ultimate:10}};
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-resistance-active"},checked:true}});
    app.state.modifierInputs["robin-concerto-atk-active"]=false;
    const finalStats=app.calculate()[0];
    assert.ok(finalStats);
    assert.equal(finalStats.applied.some(m=>m.id==="eidolon:1309:130901:concerto-resistance-penetration"&&m.value===24),true);
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-resistance-active"},checked:false}});
    assert.equal(app.calculate()[0].applied.some(m=>m.id==="eidolon:1309:130901:concerto-resistance-penetration"),false);
    app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-resistance-active"},checked:true}});
    const withManualATK=app.calculate()[0].nonCrit;
    app.node("hsrStat-atk").value="3000";app.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:"robin-concerto-atk-active"},checked:true}});
    const withATKSupport=app.calculate()[0].nonCrit;
    assert.ok(Math.abs(withManualATK-withATKSupport)<1e-8,"the same final ATK plus E1 result must not double-add ATK");
    const restored=await tool(app.storage,extraData);restored.state.data.characters.push(robin);
    assert.equal(restored.state.modifierInputs["robin-concerto-resistance-active"],true);
    assert.equal(restored.calculate()[0].applied.some(m=>m.id==="eidolon:1309:130901:concerto-resistance-penetration"),true);
    restored.state.party[0].characterId="";
    assert.equal(restored.calculate()[0].applied.some(m=>m.id==="eidolon:1309:130901:concerto-resistance-penetration"),false);
});

test("Robin E6 party Skill, Ultimate and Talent Lv12 apply to damage without provider-level warnings", async () => {
    const catalog=JSON.parse(read("games/hsr/data/catalog.json"));
    const modifiers=JSON.parse(read("games/hsr/data/calc/modifiers-character-expanded.json")).modifiers.filter(m=>m.source.id==="1309"&&m.providerScope==="party");
    const app=await tool(undefined,{structuredModifiers:modifiers});
    app.state.data.characters.push(catalog.characters.find(c=>c.id==="1309"));
    app.node("hsrStat-atk").value="3000";app.node("hsrStat-critRate").value="50";app.node("hsrStat-critDamage").value="100";
    app.state.party[0]={characterId:"1309",level:80,eidolon:6,atk:4000,traceLevels:{skill:12,ultimate:12,talent:12}};
    Object.assign(app.state.modifierInputs,{"robin-skill-damage-active":true,"robin-talent-crit-active":true,"robin-concerto-atk-active":true});
    const result=app.calculate();
    assert.equal(result.length,1);
    for(const[id,value]of [["trace:1309:130902:party-damage",55],["trace:1309:130903:concerto-atk",1202.8],["trace:1309:130904:party-crit-damage",23]]){
        assert.ok(result[0].applied.some(m=>m.id===id&&Math.abs(m.value-value)<1e-9),`${id} Lv12 reaches calculated damage`);
    }
    assert.doesNotMatch(app.node("hsrCalculationFeedback").innerHTML,/ロビン.*Lv1～10/);
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
    assert.equal(find("忍切・初志貫徹"), undefined); assert.equal(find("忍法・七転八起"), undefined, "both verified direct attacks require the non-weak target scope"); assert.ok(!app.calculate().some(r => r.attack?.name === "忍具・降魔の花弁（直接＋天賦撃破＋超撃破・事前撃破済み）"), "Round25 aggregate excludes the unbroken snapshot instead of retaining an unverified direct reference");
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
        if (id === "1215") assert.match(app.node("hsrResults").innerHTML, /承負のない対象への通常攻撃/);
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
    near(find(app,follow).nonCrit,1900.8);near(find(app,follow).expected,3193.344);
    assert.equal(find(app,follow).breakdown.damageBonus,60);
    app.state.modifierInputs["feixiao-formshift-unlocked"]=true;
    near(find(app,follow).crit,4485.888);near(find(app,follow).expected,3193.344);
    app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;
    const supported=find(app,follow);near(supported.nonCrit,2494.8);near(supported.expected,4191.264);assert.equal(supported.breakdown.damageBonus,110);
    app.node("hsrTalentTrace").value="";assert.equal(find(app,follow),undefined);assert.ok(app.calculate().some(r=>r.attack.name==="閃裂"));
    app.node("hsrTalentTrace").value="10";app.node("hsrStat-atk").handlers.input();
    const restored=await tool(app.storage,data);near(find(restored,follow).expected,4191.264);restored.state.party[0].characterId="";near(find(restored,follow).expected,3193.344);
    assert.doesNotMatch(restored.node("hsrResults").innerHTML,/data-support-status="review"/);
});


test("Feixiao Skill keeps component corrections separate and never adds the independent Follow-Up row twice", async () => {
    const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
    const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
    app.window.HsrTool.applyProfileCharacter({id:"1220",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
    const skill=target=>target.calculate().find(r=>r.breakdown?.damageFormula==="componentSequence");
    let result=skill(app);near(result.components.skill.nonCrit,2160);near(result.components.followUp.nonCrit,1900.8);near(result.nonCrit,4060.8);near(result.crit,8805.888);near(result.expected,6433.344);
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
    app.state.modifierInputs["jade-pawned-asset-stacks"]=50;
    app.state.modifierInputs["traceNode:1314:1314103:pawned-asset-atk-in-final"]=true;
    app.state.modifierInputs["trace:1314:131404:pawned-asset-crit-damage-in-final"]=true;
    const follow=target=>target.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='131404').name);
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
    assert.equal(Object.keys(app.state.modifierInputs).filter(key=>key!=="robin-talent-crit-active").length,0,"no availability checkbox or new saved state is needed");
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
 assert.equal(Object.keys(app.state.modifierInputs).filter(key=>key!=="robin-talent-crit-active").length,0,"assumed five-stack basic needs no availability toggle");
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


test("Gepard final ATK already includes Fighting Spirit across manual edits and restoration", async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1104",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const basic=t=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==="110401").name);
 near(basic(app).nonCrit,1080);near(basic(app).crit,2160);near(basic(app).expected,1620);
 assert.equal(basic(app).applied.some(m=>m.id==="traceNode:1104:1104103:defense-to-atk"),false);
 assert.match(app.node("hsrResults").innerHTML,/最終ステータスに含めて入力する効果/);
 app.node("hsrStat-def").value="4000";near(basic(app).nonCrit,1080,"editing DEF must not rebuild final ATK");
 app.node("hsrStat-atk").value="3500";near(basic(app).nonCrit,1260);app.node("hsrStat-atk").handlers.input();
 const restored=await tool(app.storage,data);near(basic(restored).nonCrit,1260);near(basic(restored).breakdown.referenceValue,3500);
});


test("Starfire and March Frozen ticks compare as independent assumed events without hiding immediate attacks", async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 const profile=(id,traces=[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}])=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces,stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const byId=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 profile("1003");for(const[id,n]of [["100301",1080],["100302",2160],["100303",2484],["100304",1512],["10031011",324]])near(byId(app,id).nonCrit,n);
 near(byId(app,"10031011").crit,324);near(byId(app,"10031011").expected,324);assert.match(app.node("hsrResults").innerHTML,/追加能力Lv1/);
 app.state.modifierInputs["himeko-target-burning"]=true;near(byId(app,"100302").nonCrit,2592);near(byId(app,"10031011").nonCrit,324);near(byId(app,"100301").expected,1620);
 app.node("hsrTalentTrace").value="";assert.ok(byId(app,"10031011"),"fixed A2 tick does not require a Talent level");assert.ok(byId(app,"100301"));assert.equal(byId(app,"100304"),undefined);app.node("hsrTalentTrace").value="10";
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(byId(saved,"100302").nonCrit,2592);near(byId(saved,"10031011").nonCrit,324);saved.state.modifierInputs["himeko-target-burning"]=false;near(byId(saved,"100302").nonCrit,2160);
 profile("1001");near(byId(app,"100101").nonCrit,1080);near(byId(app,"100103").nonCrit,1620);near(byId(app,"100104").nonCrit,1080);near(byId(app,"1001031").nonCrit,648);near(byId(app,"1001031").crit,648);near(byId(app,"1001031").expected,648);
 assert.equal(byId(app,"1001031").applied.some(m=>m.id.includes("1003:")),false,"Himeko state cannot leak onto March");
 app.node("hsrUltimateTrace").value="";assert.equal(byId(app,"1001031"),undefined);assert.equal(byId(app,"100103"),undefined);assert.ok(byId(app,"100101"));app.node("hsrUltimateTrace").value="10";
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(byId(restored,"1001031").nonCrit,648);assert.match(restored.node("hsrResults").innerHTML,/確率込み平均/);
 restored.node("hsrEidolon").value="1";assert.equal(byId(restored,"1001031"),undefined);assert.ok(byId(restored,"100101"));
});


test("Clara compares marked states and counters with independent trace levels and local missing-input stops", async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1107",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const row=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 for(const[id,n]of [["110701",1080],["110702",1296],["1107021",2592],["110704",2246.4],["1107031",4492.8]])near(row(app,id).nonCrit,n);
 assert.equal(Object.keys(app.state.modifierInputs).filter(key=>key!=="robin-talent-crit-active").length,0,"availability is assumed per state, not enabled by a checkbox");assert.match(app.node("hsrResults").innerHTML,/天賦カウンター 160% ＋ 必殺技による追加倍率 160%/);
 app.node("hsrUltimateTrace").value="";assert.equal(row(app,"1107031"),undefined);assert.ok(row(app,"110704"));assert.ok(row(app,"1107021"));app.node("hsrUltimateTrace").value="10";
 app.node("hsrTalentTrace").value="";assert.equal(row(app,"1107031"),undefined);assert.equal(row(app,"110704"),undefined);assert.ok(row(app,"110701"));app.node("hsrTalentTrace").value="5";near(row(app,"1107031").nonCrit,3818.88);
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(row(saved,"1107031").nonCrit,3818.88);assert.equal(saved.state.traceLevels.talent,5);
 saved.node("hsrTalentTrace").value="10";saved.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};saved.state.modifierInputs["robin-skill-damage-active"]=true;near(row(saved,"1107031").nonCrit,6220.8);saved.state.party[0].characterId="";near(row(saved,"1107031").nonCrit,4492.8);
});


test("permanent EHR conversions preserve completed ATK through imported inputs, manual edits and reload", async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});
 const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 for(const id of ["1004","1005"]){app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0,effectHitRate:80}});
 const normal=data.attacks.find(a=>a.characterId===id&&a.type==="normal"&&a.variant==="enhanced");const row=t=>t.calculate().find(r=>r.attack.name===normal.name);
 near(row(app).breakdown.referenceValue,3000);app.node("hsrStat-effectHitRate").value="100";near(row(app).breakdown.referenceValue,3000,"EHR edit cannot rebuild entered ATK");app.node("hsrStat-atk").value="3500";near(row(app).breakdown.referenceValue,3500);
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(row(restored).breakdown.referenceValue,3500);assert.match(restored.node("hsrResults").innerHTML,/最終ステータスに含めて入力する効果/);
 }
});


test("Yukong compares Basic, Talent and total with scoped buffs and keeps missing inputs local",async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1207",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:12}});
 const row=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 near(row(app,"120701").nonCrit,1209.6);near(row(app,"120704").nonCrit,967.68);near(row(app,"1207011").nonCrit,2177.28);near(row(app,"1207011").crit,4354.56);near(row(app,"1207011").expected,3265.92);
 assert.equal(app.state.modifierInputs["yukong-bowshot-ready"],undefined);assert.match(app.node("hsrResults").innerHTML,/通常本体＋徹札矢の合計/);assert.match(app.node("hsrResults").innerHTML,/通常本体＋天賦付加1回/);
 app.node("hsrTalentTrace").value="";assert.equal(row(app,"120704"),undefined);assert.equal(row(app,"1207011"),undefined);assert.ok(row(app,"120701"));assert.ok(row(app,"120703"));app.node("hsrTalentTrace").value="10";
 app.state.data.structuredModifiers.push({id:"test-normal-only",source:{kind:"trace",id:"1207"},name:"通常限定検証",category:"damageBonus",unit:"percent",value:{kind:"fixed",fixed:20},target:{owner:"self",attackTypes:["normal"],elements:[]},activation:{mode:"toggle",inputKey:"test-normal-only-active",default:false},stacking:{group:"test-normal",rule:"nonStacking"},calculation:{stage:"damageBonus",operation:"add"},inputPolicy:"conditional",support:{status:"calculable",verified:true}});
 app.state.modifierInputs["test-normal-only-active"]=true;near(row(app,"120701").nonCrit,1425.6);near(row(app,"120704").nonCrit,1140.48);near(row(app,"1207011").nonCrit,2566.08);near(row(app,"1207011").crit,5132.16);near(row(app,"1207011").expected,3849.12);near(row(app,"120703").nonCrit,4596.48);assert.doesNotMatch(app.node("hsrResults").innerHTML,/通常攻撃限定補正.*未検証/);app.state.modifierInputs["test-normal-only-active"]=false;
 app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;near(row(app,"1207011").nonCrit,3149.28);app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(row(restored,"1207011").nonCrit,3149.28);restored.state.party[0].characterId="";near(row(restored,"1207011").nonCrit,2177.28);
});

test("Pela Ultimate assumes prior same-level Solution, deduplicates selected debuffs and stops missing native data",async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1106",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const ult=t=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==="110603").name);near(ult(app).nonCrit,1620);near(ult(app).crit,3240);near(ult(app).expected,2430);
 app.state.modifierInputs["pela-general-solution"]=true;app.node("hsrEnemyDebuffCount").value="1";near(ult(app).nonCrit,1620);assert.equal(ult(app).applied.filter(m=>m.stacking?.group==="pela-general-solution-defense").length,1);
 const records=app.state.data.structuredModifiers;app.state.data.structuredModifiers=records.filter(m=>m.id!=="trace:1106:110603:prior-solution");assert.equal(ult(app),undefined);assert.ok(app.calculate().some(r=>r.attack.name===data.attacks.find(a=>a.id==="110601").name));app.state.data.structuredModifiers=records;
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(ult(saved).nonCrit,1620);assert.match(saved.node("hsrResults").innerHTML,/初回.*未確認/);
});


test("Sampo zero stacks are finite and invalid stack input stops only the DoT row",async()=>{
 const window={};vm.runInNewContext(read("games/js/hsrCalcData.js"),{window,fetch:async u=>({ok:true,json:async()=>JSON.parse(read(u.slice(1)))})});const data=await window.HsrCalcData.load(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1108",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const row=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 for(const count of [0,1,5]){app.state.modifierInputs["sampo-wind-shear-stacks"]=count;const r=row(app,"110804");near(r.nonCrit,561.6*count);assert.equal(Number.isFinite(r.perHit.nonCrit),true);assert.equal(Number.isFinite(r.breakdown.commonMultiplier),true);assert.doesNotMatch(app.node("hsrResults").innerHTML,/NaN/);}
 for(const count of [NaN,-1,6,1.5]){app.state.modifierInputs["sampo-wind-shear-stacks"]=count;assert.equal(row(app,"110804"),undefined);assert.ok(row(app,"110801"));}
 app.state.modifierInputs["sampo-wind-shear-stacks"]=5;app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(row(saved,"110804").nonCrit,2808);saved.node("hsrEnemyCount").value="2";assert.equal(row(saved,"110802"),undefined);assert.ok(row(saved,"110801"));
});


test("Jing Yuan compares LL3..10 with per-result native CD, local stops and unchanged stored hit input",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1204",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.modifierInputs["jingyuan-lightning-lord-hits"]=10;
 const ll=t=>t.calculate().filter(r=>r.attack?.name.startsWith("神君（敵1体・星魂0）"));
 const verify=t=>{const rows=ll(t);assert.equal(rows.length,8);for(let n=3;n<=10;n++){const r=rows.find(r=>r.attack.name.endsWith("・"+n+"段"));assert.ok(r);near(r.nonCrit,712.8*n);near(r.crit,712.8*n*(n>=6?2.25:2));near(r.expected,712.8*n*(n>=6?1.625:1.5));near(r.breakdown.critDamagePercent,n>=6?125:100);assert.equal(r.applied.filter(m=>m.id==="traceNode:1204:1204101:followup-crit-damage").length,n>=6?1:0);}return rows;};
 verify(app);assert.equal(app.state.modifierInputs["jingyuan-lightning-lord-hits"],10);assert.doesNotMatch(app.node("hsrResults").innerHTML,/<h4>隣接対象<\/h4>/);
 app.state.conditionTab="軌跡";app.node("hsrConditionDialogOpen").handlers.click();assert.match(app.node("hsrConditionList").innerHTML,/各結果の想定段数で判定/);assert.match(app.node("hsrConditionList").innerHTML,/一部の想定結果に適用/);assert.doesNotMatch(app.node("hsrConditionList").innerHTML,/data-structured-input="jingyuan-lightning-lord-hits"/);
 app.state.modifierInputs["jingyuan-skill-crit-active"]=true;let r=ll(app).find(r=>r.attack.name.endsWith("・6段"));near(r.expected,7484.4);near(r.breakdown.critRatePercent,60);app.state.modifierInputs["jingyuan-skill-crit-active"]=false;
 app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;r=ll(app).find(r=>r.attack.name.endsWith("・6段"));near(r.nonCrit,6415.2);near(r.expected,10424.7);app.state.party[0].characterId="";verify(app);
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);verify(saved);assert.equal(saved.state.modifierInputs["jingyuan-lightning-lord-hits"],10);
 saved.node("hsrEnemyCount").value="2";assert.equal(ll(saved).length,0);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==="120401").name));saved.node("hsrEnemyCount").value="1";
 saved.node("hsrTalentTrace").value="";assert.equal(ll(saved).length,0);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==="120402").name));saved.node("hsrTalentTrace").value="10";
 saved.node("hsrLevel").value="79";let unsupported=saved.calculate();assert.equal(unsupported.some(r=>r.attack?.name===data.attacks.find(a=>a.id==="120402").name),false);assert.equal(ll(saved).length,0);saved.node("hsrLevel").value="80";
 const nativeRecords=saved.state.data.structuredModifiers;saved.state.data.structuredModifiers=nativeRecords.filter(m=>m.id!=="traceNode:1204:1204103:prior-skill-crit-rate");unsupported=saved.calculate();assert.equal(unsupported.some(r=>r.attack?.name===data.attacks.find(a=>a.id==="120402").name),false);assert.ok(unsupported.some(r=>r.attack?.name===data.attacks.find(a=>a.id==="120401").name));saved.state.data.structuredModifiers=nativeRecords;
 saved.node("hsrEidolon").value="1";assert.equal(ll(saved).length,0);
});

test("Serval and Hook compare body, triggered extra and delayed DoT without an availability checkbox",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0}});
 const rows=t=>new Map(t.calculate().filter(r=>r.attack&&r.attack.target!=="adjacent").map(r=>[r.attack.name,r]));const find=(map,id)=>map.get(data.attacks.find(a=>a.id===id).name);
 profile("1103");let r=rows(app);for(const[id,n]of [["110301",1080],["110302",1512],["110303",1944],["110304",777.6],["1103021",1123.2]])near(find(r,id).nonCrit,n);assert.match(app.node("hsrResults").innerHTML,/攻撃全体の合計ではありません/);
 profile("1109");r=rows(app);for(const[id,n]of [["110901",1080],["110902",2592],["110909",3024],["110903",4320],["110904",1080],["1109021",702]])near(find(r,id).nonCrit,n);assert.equal(app.state.modifierInputs["hook-enemy-burning"],undefined);
 app.state.modifierInputs["hook-enemy-burning"]=true;r=rows(app);near(find(r,"110904").nonCrit,1080);near(find(r,"110902").nonCrit,2592);app.state.modifierInputs["hook-enemy-burning"]=false;
 app.node("hsrTalentTrace").value="";r=rows(app);assert.equal(find(r,"110904"),undefined);assert.ok(find(r,"110909"));assert.ok(find(r,"1109021"));app.node("hsrTalentTrace").value="10";
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);r=rows(saved);near(find(r,"110904").nonCrit,1080);near(find(r,"110909").nonCrit,3024);assert.match(saved.node("hsrResults").innerHTML,/新規燃焼.*同撃/);
 saved.node("hsrEidolon").value="6";saved.state.modifierInputs["hook-enemy-burning"]=false;r=rows(saved);assert.equal(find(r,"110904"),undefined,"E6 still requires its damage-changing Burn condition");saved.state.modifierInputs["hook-enemy-burning"]=true;r=rows(saved);near(find(r,"110904").nonCrit,1296);
});


test("Lingsha E0 compares every ordinary action and separate Fuyuan while preserving support and missing-level scopes",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1222",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:3000,critRate:50,critDamage:100,damageBonus:0,breakEffect:200}});
 const rows=t=>new Map(t.calculate().filter(r=>r.attack).map(r=>[r.attack.name,r])),find=(r,id)=>r.get(data.attacks.find(a=>a.id===id).name);
 const check=t=>{const r=rows(t);for(const[id,n]of [["122201",1080],["122202",864],["122203",1620],["122204",1620]]){const a=find(r,id);assert.ok(a,id+" exists");near(a.nonCrit,n);near(a.crit,n*2);near(a.expected,n*1.5);near(a.breakdown.referenceValue,3000);}assert.equal(find(r,"122203").attack.hitCount,1);assert.equal(find(r,"122204").attack.hitCount,2);return r;};
 check(app);for(const active of [false,true]){app.state.modifierInputs["lingsha-direct-ultimate"]=active;app.state.modifierInputs["lingsha-fuyuan-instance"]=active;check(app);}assert.doesNotMatch(app.node("hsrResults").innerHTML,/浮元不在/);assert.match(app.node("hsrResults").innerHTML,/独立した別行動/);
 app.state.modifierInputs["break-befog-active"]=true;check(app);app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;let r=rows(app);for(const[id,n]of [["122201",1620],["122202",1296],["122203",2430],["122204",2430]])near(find(r,id).nonCrit,n);
 app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);r=rows(saved);near(find(r,"122203").expected,3645);near(find(r,"122204").expected,3645);assert.equal(saved.state.modifierInputs["break-befog-active"],true);saved.state.party[0].characterId="";check(saved);
 saved.node("hsrUltimateTrace").value="";r=rows(saved);assert.equal(find(r,"122203"),undefined);assert.ok(find(r,"122201"));assert.ok(find(r,"122202"));assert.ok(find(r,"122204"));saved.node("hsrUltimateTrace").value="10";
 saved.node("hsrTalentTrace").value="";r=rows(saved);assert.equal(find(r,"122204"),undefined);assert.ok(find(r,"122203"));saved.node("hsrTalentTrace").value="10";
 saved.node("hsrEnemyCount").value="2";r=rows(saved);assert.equal(find(r,"122204"),undefined);assert.equal(find(r,"122203"),undefined);saved.node("hsrEnemyCount").value="1";
 saved.node("hsrEidolon").value="1";r=rows(saved);for(const id of ["122201","122202","122203"])assert.equal(find(r,id),undefined);near(find(r,"122204").nonCrit,1620);
});


test("supporter E0 basics distinguish released versions, native final inputs, missing stats and party save state",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+" != "+b);
 for(const[cid,variants,damageBonus,baseline]of [["1306",[["previous","130601"],["enhanced","1130601"]],0,1080],["1217",[["previous","121701"],["enhanced","1121701"]],0,1080],["1101",[["enhanced","110101"]],22.4,1429.92]]){
  const app=await tool(undefined,data);app.window.HsrTool.applyProfileCharacter({id:cid,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus}});
  const name=data.attacks.find(a=>a.characterId===cid&&a.type==="normal").name,one=t=>t.calculate().find(r=>r.attack?.name===name);
  assert.equal(app.node("hsrEnhancementField").hidden,cid==="1101","released-version selector follows versioned attack data");
  for(const[variant,id]of variants){app.state.enhancementState=variant;app.node("hsrEnhancementState").value=variant;let r=one(app);assert.ok(r,id);near(r.nonCrit,baseline);near(r.crit,baseline*2);near(r.expected,baseline*(cid==="1101"?2:1.5));assert.equal(app.calculate().filter(r=>r.attack?.name===name).length,1,"one released version at a time");
   app.node("hsrNormalTrace").value="1";near(one(app).nonCrit,baseline/2);app.node("hsrNormalTrace").value="6";
   const unused=cid==="1217"?"atk":"hp",ref=cid==="1217"?"hp":"atk";app.node("hsrStat-"+unused).value="9999";near(one(app).nonCrit,baseline);app.node("hsrStat-"+ref).value=cid==="1217"?"9000":"4500";near(one(app).nonCrit,baseline*1.5);app.node("hsrStat-"+ref).value=cid==="1217"?"6000":"3000";
   app.node("hsrStat-"+ref).value="";assert.equal(one(app),undefined);app.node("hsrStat-"+ref).value=cid==="1217"?"6000":"3000";app.node("hsrNormalTrace").value="";assert.equal(one(app),undefined);app.node("hsrNormalTrace").value="6";
   app.node("hsrEidolon").value="1";assert.equal(one(app),undefined);app.node("hsrEidolon").value="0";
  }
  app.state.party[0]={characterId:"1309",level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs["robin-skill-damage-active"]=true;const expectedBonus=1+(damageBonus+(cid==="1101"?10:0)+50)/100,baseBonus=1+(damageBonus+(cid==="1101"?10:0))/100;near(one(app).nonCrit,baseline*expectedBonus/baseBonus);
  app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(one(saved).nonCrit,baseline*expectedBonus/baseBonus);assert.equal(saved.state.enhancementState,variants.at(-1)[0]);saved.state.party[0].characterId="";near(one(saved).nonCrit,baseline);
  if(cid==="1306"){saved.node("hsrStat-critDamage").value="169";saved.node("hsrEnemyTakenDamage").value="30";saved.node("hsrEnemyResistancePenetration").value="10";let r=one(saved);near(r.nonCrit,1579.5);near(r.crit,4248.855);near(r.expected,2914.1775);saved.node("hsrStat-damageBonus").value="48";saved.node("hsrStat-critDamage").value="100";saved.node("hsrEnemyTakenDamage").value="0";saved.node("hsrEnemyResistancePenetration").value="0";saved.state.enhancementState="previous";saved.node("hsrEnhancementState").value="previous";near(one(saved).nonCrit,1598.4);}
 }
});


test("batch E0 comparisons preserve physical modes, dual scaling, five hits, and independently entered Super Break",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+" != "+b);let app=await tool(undefined,data);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,breakEffect:230,hpPercent:85}});
 const calls=t=>{const out=[];const e=t.window.HsrCalcEngine;if(!t._batchCapture){t._batchCapture=out;t.window.HsrCalcEngine={...e,calculate(i){const r=e.calculate(i);t._batchCapture.push({id:i.attack.id,r});return r;},calculateSuperBreak(i){const r=e.calculateSuperBreak(i);t._batchCapture.push({id:"superBreak",r});return r;}};}t._batchCapture.length=0;t.calculate();return t._batchCapture;};
 const get=(r,id)=>r.find(x=>x.id===id&&x.r.supported!==false)?.r;
 for(const id of ["8001","8002"]){profile(id);const r=calls(app);for(const[suffix,n]of [["01",1080],["02",1687.5],["08",4860],["09",3645]])near(get(r,id+suffix).nonCrit,n);assert.equal(get(r,id+"03"),undefined);assert.equal(app.node("hsrResults").innerHTML.includes("選択式の説明レコード"),false);app.node("hsrUltimateTrace").value="";const missing=calls(app);assert.ok(get(missing,id+"01"));assert.equal(get(missing,id+"08"),undefined);}
 for(const id of ["8003","8004"]){profile(id);let r=calls(app);near(get(r,id+"01").nonCrit,1080);near(get(r,id+"08").nonCrit,1458);near(get(r,id+"03").nonCrit,2160);assert.equal(get(r,id+"03").breakdown.scalingTerms.length,2);app.node("hsrStat-def").value="";r=calls(app);assert.ok(get(r,id+"08"));assert.equal(get(r,id+"03"),undefined);}
 for(const id of ["8005","8006"]){profile(id);let r=calls(app);near(get(r,id+"02").nonCrit,2700);assert.equal(get(r,id+"02").attack.hitCount,5);app.node("hsrBreakMode").value="superBreak";app.node("hsrToughnessState").value="broken";app.node("hsrEnemyResistance").value="0";app.node("hsrSuperBreakToughness").value="40";app.node("hsrSuperBreakMultiplier").value="160";r=calls(app);near(get(r,"superBreak").value,39785.362848);app.node("hsrSuperBreakToughness").value="";assert.equal(get(calls(app),"superBreak"),undefined);app.node("hsrBreakMode").value="attacks";assert.ok(get(calls(app),id+"02"));app.node("hsrBreakMode").value="superBreak";app.node("hsrSuperBreakToughness").value="40";app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(get(calls(saved),"superBreak").value,39785.362848);app=saved;app.node("hsrBreakMode").value="attacks";app.node("hsrToughnessState").value="active";app.node("hsrEnemyResistance").value="20";}
});

test("batch classic native states affect only matching attacks and survive save without leaking forced amplification",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+" != "+b);let app=await tool(undefined,data);
 const profile=(id,hpPercent=85)=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,hpPercent}});
 const byType=(t,type)=>t.calculate().find(r=>r.attack?.attackType===type||r.attack?.type===type);
 profile("1002");let r=app.calculate();near(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100203").name).nonCrit,4320);app.state.modifierInputs["danheng-enemy-slowed"]=true;r=app.calculate();near(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100201").name).nonCrit,1512);near(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100203").name).nonCrit,5616);app.state.modifierInputs["danheng-talent-active"]=true;r=app.calculate();near(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100203").name).nonCrit,8143.2);app.node("hsrTalentTrace").value="";assert.equal(app.calculate().length,0);app.state.modifierInputs["danheng-talent-active"]=false;assert.ok(app.calculate().length>=3);
 profile("1102");for(const[variant,ult]of [["previous",10327.5],["enhanced",18370.8]]){app.state.enhancementState=variant;app.node("hsrEnhancementState").value=variant;app.state.modifierInputs["seele-amplified"]=false;app.state.modifierInputs["seele-kill-damage-stacks"]=0;r=app.calculate();near(r.find(r=>r.attack.name==="乱れ蝶").nonCrit,ult);near(r.find(r=>r.attack.name==="強襲").nonCrit,1080);assert.equal(app.state.modifierInputs["seele-amplified"],false);app.node("hsrTalentTrace").value="";r=app.calculate();assert.equal(r.find(r=>r.attack.name==="乱れ蝶"),undefined);assert.ok(r.find(r=>r.attack.name==="強襲"));app.node("hsrTalentTrace").value="10";}
 profile("1008");r=app.calculate();near(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100802").name).nonCrit,2871.936);app.node("hsrStat-hpPercent").value="100";r=app.calculate();assert.equal(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100802").name),undefined);assert.ok(r.find(r=>r.attack.name===data.attacks.find(a=>a.id==="100801").name));app.node("hsrStat-hpPercent").value="0";assert.equal(app.calculate().filter(r=>["100801","100802","100803"].some(id=>r.attack.name===data.attacks.find(a=>a.id===id).name)).length,0);app.node("hsrStat-hpPercent").value="0.001";assert.equal(app.calculate().filter(r=>["100801","100802","100803"].some(id=>r.attack.name===data.attacks.find(a=>a.id===id).name)).length,0);app.node("hsrStat-hpPercent").value="85";app.node("hsrStat-atk").handlers.input();const saved=await tool(app.storage,data);near(saved.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==="100802").name).expected,4307.904);
});

async function batch2App(saved) {
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(saved,data),calls=[];
 const engine=app.window.HsrCalcEngine;app.window.HsrCalcEngine={...engine,calculate(input){const result=engine.calculate(input);calls.push({id:input.attack.id,input,result});return result;}};
 return {app,data,profile(id){app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});app.node('hsrEnemyLevel').value='80';app.node('hsrEnemyResistance').value='20';app.node('hsrEnemyCount').value='1';app.node('hsrToughnessState').value='active';},run(){calls.length=0;app.calculate();return calls;}};
}

test('batch2 Topaz and Blade compare legal attack states without changing saved optional choices',async()=>{
 const b=await batch2App(),a=b.app,near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,x+' != '+y),one=(rs,id)=>rs.find(r=>r.id===id)?.result;
 b.profile('1112');a.state.modifierInputs['topaz-windfall']=true;let rs=b.run();near(one(rs,'111201').nonCrit,1620);{const values=rs.filter(r=>r.id==='111202').map(r=>r.result.nonCrit);assert.equal(values.length,2);values.forEach((value,index)=>near(value,[2430,4860][index]));}assert.equal(a.state.modifierInputs['topaz-windfall'],true);assert.equal(a.state.modifierInputs['topaz-debt-proof'],undefined);
 a.state.modifierInputs['topaz-windfall']=false;near(one(b.run(),'111201').crit,3240);
 b.profile('1205');for(const[variant,ult,en,nc]of [['previous','120503','120508',2592],['enhanced','1120503','1120508',3240]]){a.state.enhancementState=variant;a.node('hsrEnhancementState').value=variant;a.state.modifierInputs['blade-hellscape-active']=false;a.state.modifierInputs['blade-ult-hp-loss-percent']=0;rs=b.run();near(one(rs,ult).nonCrit,nc);assert.ok(one(rs,en));for(const v of [NaN,-1,91]){a.state.modifierInputs['blade-ult-hp-loss-percent']=v;rs=b.run();assert.equal(one(rs,ult),undefined);assert.ok(one(rs,en),'bad tally stops only the Ultimate');}a.state.modifierInputs['blade-ult-hp-loss-percent']=31.75;assert.ok(one(b.run(),ult));}
 a.state.modifierInputs['blade-hellscape-active']=true;near(one(b.run(),'1120507').nonCrit,864);a.state.modifierInputs['blade-hellscape-active']=false;
 a.node('hsrSkillTrace').value='';rs=b.run();assert.equal(one(rs,'1120508'),undefined,'missing Skill level stops its required Hellscape dependency');assert.ok(one(rs,'1120501'),'ordinary Basic does not need the missing Skill');a.node('hsrSkillTrace').value='10';
 a.node('hsrStat-atk').handlers.input();const restored=await batch2App(a.storage);assert.equal(restored.app.state.modifierInputs['blade-ult-hp-loss-percent'],31.75);assert.ok(one(restored.run(),'1120503'));
});

test('batch2 Guardian, Hidden Hand, detonation levels and delayed Freeze retain local calculation contracts',async()=>{
 const b=await batch2App(),a=b.app,near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,x+' != '+y),one=(rs,id)=>rs.find(r=>r.id===id);
 b.profile('1015');let rs=b.run(),base=one(rs,'101502').result;near(base.crit,base.nonCrit*2);a.state.modifierInputs['archer-guardian-active']=true;rs=b.run();near(one(rs,'101502').result.crit,base.nonCrit*3.2);a.state.modifierInputs['archer-guardian-active']=false;near(one(b.run(),'101502').result.crit,base.crit);
 b.profile('1201');rs=b.run();near(one(rs,'120101').result.nonCrit,1080);a.state.modifierInputs['qingque-concealed-kong']=true;rs=b.run();near(one(rs,'120101').result.nonCrit,1080);const u=one(rs,'120103');near(u.result.nonCrit,(3000+u.input.character.baseStats.atk*.72)*2*.36);
 a.node('hsrSkillTrace').value='';assert.ok(one(b.run(),'120101'),'unused Skill level is optional with skill stacks OFF');a.state.modifierInputs['qingque-skill-stacks']=1;rs=b.run();assert.equal(one(rs,'120101'),undefined,'selected Skill damage stacks require the Skill level');a.state.modifierInputs['qingque-skill-stacks']=0;assert.ok(one(b.run(),'120101'));
 b.profile('1210');a.node('hsrSkillTrace').value='1';rs=b.run();near(one(rs,'1210031').result.nonCrit,1210.4313408);near(one(rs,'1210031').result.crit,1210.4313408);a.node('hsrSkillTrace').value='';rs=b.run();assert.equal(one(rs,'1210031'),undefined);assert.ok(one(rs,'121003'),'missing source Burn level leaves the direct Ultimate component available');
 a.state.modifierInputs['guinaifen-firekiss-stacks']=3;a.node('hsrTalentTrace').value='';assert.equal(one(b.run(),'121001'),undefined,'selected Firekiss requires provider Talent level');a.state.modifierInputs['guinaifen-firekiss-stacks']=0;assert.ok(one(b.run(),'121001'),'Firekiss OFF leaves the basic available');
 b.profile('1006');a.state.enhancementState='previous';a.node('hsrEnhancementState').value='previous';const resKey=b.data.structuredModifiers.find(m=>m.id==='trace:1006:100602:all-resistance').activation.inputKey;a.state.modifierInputs[resKey]=true;a.node('hsrSkillTrace').value='';assert.equal(one(b.run(),'100601'),undefined,'selected RES debuff requires Skill level');a.state.modifierInputs[resKey]=false;assert.ok(one(b.run(),'100601'));
 b.profile('1312');rs=b.run();near(one(rs,'1312032').result.nonCrit,324);near(one(rs,'1312032').result.crit,324);a.node('hsrUltimateTrace').value='';rs=b.run();assert.equal(one(rs,'1312032'),undefined);assert.ok(one(rs,'131201'));
 b.profile('1014');rs=b.run();near(one(rs,'1014032').result.nonCrit,14904);assert.match(a.node('hsrResults').innerHTML,/限定単発合計（攻撃前状態を指定）/);assert.equal(b.data.attacks.find(r=>r.id==='1014032').support.status,'calculable');a.state.modifierInputs['saber-ally-ultimate-damage-active']=true;a.node('hsrTalentTrace').value='';assert.equal(one(b.run(),'101401'),undefined,'selected Talent damage requires Talent level');a.state.modifierInputs['saber-ally-ultimate-damage-active']=false;assert.ok(one(b.run(),'101401'));
});

test("batch3 Robin fixed-CRIT proc and Moze two-component Skill preserve localized input stops and saved trace levels", async () => {
  const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
  const app=await tool(undefined,data);
  function apply(id,traces){app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces,stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});}
  const traces=[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}];
  apply('1309',traces);
  app.node('hsrStat-critRate').value='';app.node('hsrStat-critDamage').value='';
  let r=app.calculate();assert.equal(r.length,1,'missing ordinary CRIT stats stops Basic, not fixed Concerto');assert.ok(Math.abs(r[0].expected-3240)<1e-8);
  app.state.modifierInputs['robin-talent-crit-active']=true;
  apply('1309',traces.filter(t=>t.type!=='Talent'));
  r=app.calculate();assert.ok(r.some(x=>Math.abs(x.expected-3240)<1e-8),'unused optional Talent input cannot stop fixed proc');
  apply('1223',traces);app.state.modifierInputs['robin-talent-crit-active']=false;
  r=app.calculate();const full=r.find(x=>x.components?.additional);assert.ok(Math.abs(full.nonCrit-1944)<1e-8);assert.ok(Math.abs(full.components.skill.nonCrit-1620)<1e-8);assert.ok(Math.abs(full.components.additional.nonCrit-324)<1e-8);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.traceLevels.talent,10);assert.ok(Math.abs(saved.calculate().find(x=>x.components?.additional).nonCrit-1944)<1e-8);
  apply('1223',traces.filter(t=>t.type!=='Talent'));r=app.calculate();assert.ok(r.some(x=>Math.abs(x.nonCrit-1080)<1e-8));assert.equal(r.some(x=>x.components?.additional),false);assert.match(app.node('hsrResults').innerHTML,/data-hsr-pending-input/);
});

test("batch3 own Bleed requires explicit enemy maximum HP without stopping ordinary direct attacks", async()=>{
  const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();const app=await tool(undefined,data);
  app.window.HsrTool.applyProfileCharacter({id:'1111',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
  app.node('hsrEnemyMaxHp').value='100000';let r=app.calculate();assert.ok(r.some(x=>Math.abs(x.nonCrit-3650.4)<1e-8));
  app.node('hsrEnemyMaxHp').value='';r=app.calculate();assert.ok(r.some(x=>Math.abs(x.nonCrit-1080)<1e-8));assert.equal(r.some(x=>x.breakdown?.cappedEnemyHpDamage),false);assert.match(app.node('hsrResults').innerHTML,/敵の最大HP/);
});

test('batch4 Luka assumed realized states compare all eight rows and lose only Bleed rows when their input is missing',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();const app=await tool(undefined,data);const real=app.window.HsrCalcEngine;let calls=[];app.window.HsrCalcEngine={...real,calculate(i){const r=real.calculate(i);calls.push({a:i.attack,r});return r;}};
 app.window.HsrTool.applyProfileCharacter({id:'1111',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});app.node('hsrEnemyMaxHp').value='100000';
 const run=()=>{calls=[];app.calculate();return calls.filter(x=>x.a.id==='1111083'&&x.r.supported!==false);};let states=run();assert.equal(states.length,8);for(let n=0;n<4;n++){assert.ok(Math.abs(states[n].r.nonCrit-(1512+216*n))<1e-8);assert.ok(Math.abs(states[n+4].r.nonCrit-(4614.84+216*n))<1e-8);assert.ok(Math.abs(states[n+4].r.expected-(5370.84+324*n))<1e-8);}
 assert.equal(app.state.modifierInputs['luka-enemy-bleeding'],undefined,'comparison does not mutate global enemy condition');app.node('hsrEnemyMaxHp').value='';states=run();assert.equal(states.length,4);assert.ok(states.every(x=>x.a.ownBleed===false));app.node('hsrEnemyMaxHp').value='100000';app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);assert.ok(restored.calculate().some(r=>Math.abs(r.nonCrit-5262.84)<1e-8));
});

test('batch4 Ruan additional-break events use her completed BE on non-Ice weakness without readding her A2',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();const app=await tool(undefined,data);const real=app.window.HsrCalcEngine;let extras=[];app.window.HsrCalcEngine={...real,calculateAdditionalBreak(i){const r=real.calculateAdditionalBreak(i);extras.push({i,r});return r;}};
 app.window.HsrTool.applyProfileCharacter({id:'1303',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,breakEffect:230}});app.node('hsrMaxToughness').value='300';app.node('hsrWeakness').value='false';app.calculate();assert.equal(extras.length,2);for(const e of extras){assert.equal(e.i.character.id,'1303');assert.equal(e.r.supported,true);assert.ok(Math.abs(e.r.effect-3.3)<1e-8);const coeff=e.i.attack.id==='1303041'?1.2:.5;assert.ok(Math.abs(e.r.value-3767.5533*coeff*3.3*.5*.8*3)<1e-8);}
 const m=data.structuredModifiers.find(x=>x.id==='traceNode:1303:1303101:party-break-effect');const rt=app.window.HsrModifierRuntime;assert.equal(rt.buildCandidates([m],{characterId:'1303',stats:{breakEffect:230}},{}).length,0);const party=rt.buildCandidates([m],{characterId:'1111',partyIds:['1303'],stats:{breakEffect:230}},{});assert.equal(party.length,1);assert.equal(party[0].value,20,'party support unchanged');app.node('hsrTalentTrace').value='';extras=[];assert.ok(app.calculate().some(r=>Math.abs(r.nonCrit-1080)<1e-8));assert.equal(extras.filter(e=>e.r.supported).length,1,'missing Talent stops only its additional event');
});

test('batch4 Tingyun cross-element input is local, zero is saved per recipient, and reference roles are visible',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();const app=await tool(undefined,data);app.window.HsrTool.applyProfileCharacter({id:'1003',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:50}});app.state.party[0]={...app.state.party[0],characterId:'1202',source:'manual',atk:1000,traceLevels:{skill:10,talent:10,ultimate:10}};app.state.modifierInputs['tingyun-benediction']=true;
 let rs=app.calculate();assert.ok(rs.some(r=>Math.abs(r.nonCrit-1755)<1e-8));assert.equal(rs.some(r=>r.attack.name.includes('賜福')||r.attack.name.includes('紫電')),false);assert.match(app.node('hsrResults').innerHTML,/雷属性与ダメージ/);
 const key='tingyun-reference-lightning:1003';app.state.modifierInputs[key]=0;app.state.modifierInputs['enemy-resistance:Thunder']=20;rs=app.calculate();assert.ok(Math.abs(rs.find(r=>r.attack.name.includes('祥音')).nonCrit-468)<1e-8);assert.ok(Math.abs(rs.find(r=>r.attack.name.includes('紫電')).nonCrit-702)<1e-8);assert.match(app.node('hsrResults').innerHTML,/発生元：停雲/);assert.match(app.node('hsrResults').innerHTML,/数値参照：姫子/);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs[key],0);assert.ok(saved.calculate().some(r=>Math.abs(r.nonCrit-468)<1e-8));app.state.modifierInputs['tingyun-benediction']=false;assert.equal(app.state.modifierInputs[key],0);app.state.modifierInputs['tingyun-benediction']=true;app.state.characterId='1002';rs=app.calculate();assert.equal(rs.some(r=>r.attack.name.includes('祥音')),false,'another recipient requires its own Lightning value');app.state.party[0].characterId='';assert.equal(app.calculate().some(r=>r.attack.name.includes('紫電')),false);
});

test('batch5 selected-party Tingyun reference isolates owners, saves zero and stops only its row',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1202';app.state.party[0].characterId='1302';app.state.party[0].eidolon=0;
 for(const[k,v]of Object.entries({atk:2000,hp:6000,def:1500,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);
 let r=app.calculate();assert.ok(r.some(x=>x.attack?.name===data.attacks.find(a=>a.id==='120201').name));assert.equal(r.some(x=>x.attack?.name===data.attacks.find(a=>a.id==='120204').name),false);
 app.state.modifierInputs['party-reference-owner:1202']=1302;
 for(const[k,v]of Object.entries({atk:4000,critRate:25,critDamage:200,Thunder:0,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['party-reference:1302:'+k]=v;
 const proc=rs=>rs.find(x=>x.attack?.name===data.attacks.find(a=>a.id==='120204').name);
 r=app.calculate();assert.ok(proc(r));app.state.modifierInputs['tingyun-benediction']=true;assert.ok(Math.abs(app.calculate().find(x=>x.attack?.name==='逐客令').nonCrit-1008)<1e-8,'Benediction targeting another ally does not buff Tingyun');assert.ok(Math.abs(proc(r).nonCrit-864)<1e-8);assert.ok(Math.abs(proc(r).crit-2592)<1e-8);assert.ok(Math.abs(proc(r).expected-1296)<1e-8);
 app.node('hsrStat-atk').value='9999';app.node('hsrStat-critDamage').value='999';assert.ok(Math.abs(proc(app.calculate()).nonCrit-864)<1e-8);assert.ok(Math.abs(proc(app.calculate()).crit-2592)<1e-8);
 app.state.modifierInputs['party-reference:1302:atk']=5000;assert.ok(Math.abs(proc(app.calculate()).nonCrit-1080)<1e-8);
 app.state.modifierInputs['robin-skill-damage-active']=true;app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.state.modifierInputs['party-reference:1302:Thunder'],0);assert.equal(restored.state.modifierInputs['party-reference-owner:1202'],1302);assert.ok(Math.abs(proc(restored.calculate()).nonCrit-1080)<1e-8);
 app.state.party[0].characterId='';assert.equal(proc(app.calculate()),undefined);assert.ok(app.calculate().some(x=>x.attack?.name===data.attacks.find(a=>a.id==='120201').name));
});

test('batch5 Hunt March adds mixed-element full rows without hiding the existing support-Shifu comparisons',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1224';app.state.party[0].characterId='1003';app.state.party[0].eidolon=0;
 for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);
 let r=app.calculate();assert.equal(r.filter(x=>x.attack?.name?.includes('攻撃型師匠')).length,0);assert.equal(r.filter(x=>x.attack?.name?.includes('一に眉間')&&!x.attack.name.includes('攻撃型師匠')).length,6);
 app.state.modifierInputs['march-shifu-id']=1003;app.state.modifierInputs['element-damage:1224:Fire']=50;app.state.modifierInputs['enemy-resistance:Fire']=40;
 r=app.calculate();const full=r.filter(x=>x.attack?.name?.includes('攻撃型師匠'));assert.equal(full.length,7,JSON.stringify({party:app.state.party,inputs:app.state.modifierInputs,issues:app.node('hsrResults').innerHTML.replace(/<[^>]+>/g,' ').match(/攻撃型師匠[^。]+。/g)}));const normal=full.find(x=>x.attack.name.includes('妖魔'));assert.ok(Math.abs(normal.nonCrit-1323)<1e-8);const enhanced=full.filter(x=>x.attack.name.includes('一に眉間'));assert.equal(enhanced.length,6);assert.ok(enhanced.every(x=>x.components.basic&&x.components.additional));app.node('hsrSkillTrace').value='5';assert.ok(Math.abs(app.calculate().filter(x=>x.attack?.name?.includes('攻撃型師匠')&&x.attack.name.includes('一に眉間'))[0].nonCrit-5448.06)<1e-8,'Skill level changes additional coefficient without changing Talent80%');app.node('hsrSkillTrace').value='10';
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.state.modifierInputs['march-shifu-id'],1003);assert.equal(restored.state.modifierInputs['enemy-resistance:Fire'],40);assert.equal(restored.calculate().filter(x=>x.attack?.name?.includes('攻撃型師匠')).length,7);
 app.state.modifierInputs['enemy-resistance:Fire']=NaN;r=app.calculate();assert.equal(r.filter(x=>x.attack?.name?.includes('攻撃型師匠')).length,0);assert.ok(r.some(x=>x.attack?.name?.includes('一に眉間')));
});

test('batch6 Blade compares ordinary and transformed actions without availability gates and derives native party branches',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);app.state.characterId='1507';for(const[k,v]of Object.entries({hp:6000,atk:3000,def:2000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);
 const get=(r,id)=>r.find(x=>x.attack?.name===data.attacks.find(a=>a.id===id).name);let r=app.calculate();assert.equal(r.filter(x=>x.attack).length,5);near(get(r,'150701').nonCrit,1080);near(get(r,'150708').nonCrit,6000*2.25/1.7*.8*.9*1.5);assert.equal(get(r,'150708').breakdown.critRatePercent,70);assert.equal(get(r,'150708').breakdown.critDamagePercent,160);assert.equal(app.state.modifierInputs['mortenax-infinite-fury-active'],undefined);
 const skill=get(r,'150702').nonCrit,ult=get(r,'150714').nonCrit;near(get(r,'1507041').nonCrit,skill);app.state.party[0].characterId='1106';app.state.modifierInputs['mortenax-no-other-nihility']=true;app.state.modifierInputs['mortenax-other-nihility']=true;r=app.calculate();near(get(r,'150702').nonCrit,skill/1.5);near(get(r,'150714').nonCrit,ult);app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(get(saved.calculate(),'150702').nonCrit,skill/1.5);app.node('hsrUltimateTrace').value='';r=app.calculate();assert.ok(get(r,'150701'));assert.equal(get(r,'150702'),undefined);
});

test('batch6 Black Swan selects one version, resolves Arcana stacks locally and preserves saved state',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);app.state.characterId='1307';for(const[k,v]of Object.entries({hp:6000,atk:3000,def:2000,critRate:50,critDamage:100,damageBonus:72,effectHitRate:120}))app.node('hsrStat-'+k).value=String(v);app.node('hsrEnhancementState').value='previous';app.state.modifierInputs['black-swan-arcana-stacks']=7;
 const get=(r,id)=>r.find(x=>x.attack?.name===data.attacks.find(a=>a.id===id).name);let r=app.calculate();assert.ok(get(r,'130704'));assert.equal(r.filter(x=>x.attack).length,5,'exactly one balance version is listed');near(get(r,'130704').nonCrit,6687.36);near(get(r,'1307041').nonCrit,6018.624);assert.equal(get(r,'130704').nonCrit,get(r,'130704').crit);app.state.modifierInputs['black-swan-arcana-stacks']=NaN;r=app.calculate();assert.equal(get(r,'130704'),undefined);assert.ok(get(r,'130701'));
 app.state.modifierInputs['black-swan-arcana-stacks']=1;app.node('hsrEnhancementState').value='enhanced';r=app.calculate();near(get(r,'1130704').nonCrit,5201.28);near(get(r,'1130703').nonCrit,2786.4);assert.match(app.node('hsrResults').innerHTML,/想定|開示/);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['black-swan-arcana-stacks'],1);near(get(saved.calculate(),'1130704').nonCrit,5201.28);
});

test('batch6 Anaxa fixed-seven composite requires only its defined enemy snapshot and local Talent inputs',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1405';for(const[k,v]of Object.entries({hp:6000,atk:3000,def:2000,critRate:50,critDamage:240,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);let r=app.calculate();assert.equal(r.length,0);app.node('hsrToughnessState').value='broken';r=app.calculate();assert.equal(r.filter(x=>x.attack).length,5);const get=(rs,id)=>rs.find(x=>x.attack?.name===data.attacks.find(a=>a.id===id).name),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);near(get(r,'1405011').nonCrit,(3000*1.3+10500*1.5)*.8/1.72);near(get(r,'1405021').nonCrit,21000*1.5*.8/1.72);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(get(saved.calculate(),'1405011').nonCrit,get(r,'1405011').nonCrit);app.node('hsrNormalTrace').value='';r=app.calculate();assert.equal(get(r,'1405011'),undefined);assert.ok(get(r,'1405021'),'Skill plus extra Skill does not require a Basic level');app.node('hsrTalentTrace').value='';assert.equal(app.calculate().length,0);
});

test('batch6 Fugue support actions do not create fake hits and Memory male/female keep their own basic without Mem substitution',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);for(const[k,v]of Object.entries({hp:6000,atk:3000,def:2000,critRate:50,critDamage:100,damageBonus:0,breakEffect:230}))app.node('hsrStat-'+k).value=String(v);app.state.characterId='1225';let r=app.calculate();assert.equal(r.filter(x=>x.attack).length,3);assert.ok(r.some(x=>Math.abs(x.nonCrit-2160)<1e-8));assert.equal(data.attacks.some(a=>a.characterId==='1225'&&a.id==='122502'),false);for(const id of ['8007','8008']){app.state.characterId=id;r=app.calculate();assert.equal(r.filter(x=>x.attack).length,1);assert.ok(Math.abs(r[0].nonCrit-1080)<1e-8);assert.match(app.node('hsrResults').innerHTML,/ミュリオン|精霊/);}app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(Math.abs(saved.calculate()[0].nonCrit-1080)<1e-8);
});


test('batch7 production Firefly versions compare all own actions and stop only enhanced rows for BE/Ultimate/ATK support issues',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1310';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,breakEffect:360}))app.node('hsrStat-'+k).value=String(v);app.node('hsrEnhancementState').value='enhanced';app.node('hsrWeakness').value='true';app.node('hsrToughnessState').value='broken';let r=app.calculate();assert.equal(r.filter(x=>x.attack).length,4);const name=data.attacks.find(a=>a.id==='1131009').name;let a=r.find(x=>x.attack?.name===name);assert.ok(a);assert.ok(Math.abs(a.components.superBreak.breakdown.finalBreakEffect-385)<1e-8);assert.equal(a.components.superBreak.breakdown.conversionMultiplier,1.5);assert.match(app.node('hsrResults').innerHTML,/直接＋本人超撃破/);assert.equal(app.state.modifierInputs['firefly-native-combustion'],undefined);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.calculate().filter(x=>x.attack).length,4);app.node('hsrUltimateTrace').value='';r=app.calculate();assert.equal(r.filter(x=>x.attack).length,2,'only the two enhanced rows need Ultimate Lv');app.node('hsrUltimateTrace').value='10';app.node('hsrStat-breakEffect').value='';r=app.calculate();assert.equal(r.filter(x=>x.attack).length,2);app.node('hsrStat-breakEffect').value='360';app.node('hsrEnhancementState').value='previous';r=app.calculate();a=r.find(x=>x.attack?.name===data.attacks.find(a=>a.id==='131009').name);assert.ok(Math.abs(a.components.superBreak.breakdown.finalBreakEffect-360)<1e-8);assert.equal(a.components.superBreak.breakdown.conversionMultiplier,.5);
});
test('batch7 Banger input is separate from Punchline, restored, and missing Banger does not stop unrelated Aventurine rows',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1513';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,elation:100,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrPunchline').value='40';app.node('hsrMerrymake').value='0';app.node('hsrFervor').value='10';const name=data.attacks.find(a=>a.id==='1513041').name,get=r=>r.find(x=>x.attack?.name===name);let r=app.calculate();assert.equal(get(r),undefined);assert.ok(r.some(x=>x.attack));app.state.modifierInputs['elation-certified-banger']=40;r=app.calculate();const a=get(r);assert.ok(a);assert.ok(Math.abs(a.nonCrit-7535.107*.4*2*(1+5*40/280)*.5*.8*.9)<1e-8);assert.match(app.node('hsrResults').innerHTML,/爆笑の褒美（攻撃時点）/);assert.match(app.node('hsrResults').innerHTML,/爆笑の褒美を使う独立した天賦追加愉悦/);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['elation-certified-banger'],40);assert.equal(get(saved.calculate()).nonCrit,a.nonCrit);app.node('hsrElationTrace').value='';assert.ok(get(app.calculate()),'Talent rider does not require Elation Skill Lv');app.node('hsrElationTrace').value='10';app.node('hsrTalentTrace').value='';assert.equal(get(app.calculate()),undefined);app.node('hsrTalentTrace').value='10';app.state.modifierInputs['elation-certified-banger']=NaN;r=app.calculate();assert.equal(get(r),undefined);assert.ok(r.some(x=>x.attack));
});
test('batch7 Rappa additional Break consumes only the explicit charge snapshot and remains separate after save',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1317';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,breakEffect:200,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrMaxToughness').value='120';const run=()=>app.node('hsrCalculateButton').handlers.click();app.state.modifierInputs['rappa-consumed-charge']=4;run();assert.match(app.node('hsrResults').innerHTML,/忍法・耐え抜くゲージ/);app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="rappa-consumed-charge"/);app.state.modifierInputs['rappa-prior-withered-leaf']=true;app.state.modifierInputs['rappa-prior-break-vulnerability']=8;const ordinary=app.calculate();assert.ok(ordinary.some(x=>x.attack?.name==='忍法・七転八起' && Math.abs(x.nonCrit-1080)<1e-8));assert.match(app.node('hsrResults').innerHTML,/<dd>1.08<\/dd>/);app.state.modifierInputs['rappa-prior-break-vulnerability']=NaN;app.calculate();assert.match(app.node('hsrResults').innerHTML,/入力|枯葉/);app.state.modifierInputs['rappa-prior-break-vulnerability']=8;app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['rappa-consumed-charge'],4);app.state.modifierInputs['rappa-consumed-charge']=NaN;const r=app.calculate();assert.ok(r.some(x=>x.attack?.name==='忍法・七転八起'));assert.match(app.node('hsrResults').innerHTML,/チャージ/);
});
test('batch7 production Fanning is an assumed action without an availability checkbox and keeps zero pockets after reload',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data);app.state.characterId='1315';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,breakEffect:200,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrWeakness').value='true';app.node('hsrToughnessState').value='broken';app.node('hsrMaxToughness').value='120';app.state.modifierInputs['boothill-pocket-stacks']=0;const name=data.attacks.find(a=>a.id==='131508').name;let r=app.calculate(),a=r.find(x=>x.attack?.name===name);assert.ok(a);assert.equal(a.components.break.value,0);assert.equal(app.state.modifierInputs['boothill-fanning-broken'],undefined);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['boothill-pocket-stacks'],0);assert.ok(saved.calculate().some(x=>x.attack?.name===name));app.state.modifierInputs['boothill-pocket-stacks']=NaN;r=app.calculate();assert.equal(r.some(x=>x.attack?.name===name),false);assert.ok(r.some(x=>x.attack?.name===data.attacks.find(a=>a.id==='131501').name));
});


test('batch8 Feixiao lists normal and seven Ultimate choices without availability switches; native A4 and save stay local',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);app.state.characterId='1220';for(const[k,v]of Object.entries({atk:3000,hp:6100,def:1700,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);
 let r=app.calculate();const normal=r.find(x=>x.attack?.name==='閃裂'),skill=r.find(x=>x.components);assert.ok(normal);near(normal.nonCrit,1080);assert.ok(skill);near(skill.components.followUp.crit/skill.components.followUp.nonCrit,2.36);near(skill.components.skill.crit/skill.components.skill.nonCrit,2);assert.equal(r.filter(x=>x.attack?.name?.startsWith('大荒滅破砕')).length,0);
 app.node('hsrToughnessState').value='broken';r=app.calculate();const ult=r.filter(x=>x.attack?.name?.startsWith('大荒滅破砕'));assert.equal(ult.length,7);near(ult[0].nonCrit,3000*5.2*.5*.8);near(ult[6].nonCrit,3000*7*.5*.8);near(ult[6].crit,ult[6].nonCrit*2.36);assert.match(app.node('hsrResults').innerHTML,/条件一致6回/);assert.match(app.node('hsrResults').innerHTML,/途中撃破/);assert.equal(app.state.modifierInputs['feixiao-formshift-unlocked'],undefined,'assumed action does not mutate saved switches');
 app.state.modifierInputs['feixiao-previous-followup-buff']=true;r=app.calculate();const after=r.filter(x=>x.attack?.name?.startsWith('大荒滅破砕'));near(after[6].nonCrit,ult[6].nonCrit*1.6);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['feixiao-previous-followup-buff'],true);near(saved.calculate().find(x=>x.attack?.name===after[6].attack.name).nonCrit,after[6].nonCrit);
 app.node('hsrTalentTrace').value='';r=app.calculate();assert.ok(r.some(x=>x.attack?.name==='閃裂')===false,'ON prior talent needs its level');app.state.modifierInputs['feixiao-previous-followup-buff']=false;r=app.calculate();assert.ok(r.some(x=>x.attack?.name==='閃裂'));assert.equal(r.filter(x=>x.attack?.name?.startsWith('大荒滅破砕')).length,7,'OFF optional talent does not stop Ultimate');app.node('hsrStat-atk').value='';assert.equal(app.calculate().length,0);
});


test('batch8 Hiyu displays independent CB components, keeps resources separate and restores numeric input',async()=>{
 const data=(await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture()).data,app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);app.state.characterId='1505';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,elation:100,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrPunchline').value='40';app.node('hsrMerrymake').value='0';const name=id=>data.attacks.find(a=>a.id===id).name,get=(r,id)=>r.find(x=>x.attack?.name===name(id));let r=app.calculate();assert.ok(get(r,'150501'));assert.equal(get(r,'1505041'),undefined);app.state.modifierInputs['elation-certified-banger']=999;r=app.calculate();assert.equal(get(r,'1505041'),undefined,'other owner resource is not reused');
 app.state.modifierInputs['hiyu-certified-banger']=40;r=app.calculate();const a=get(r,'1505041'),u=get(r,'1505042'),f=get(r,'1505043');near(a.nonCrit,7535.107*.16*2*(1+200/280)*.5*.8*.9);near(u.nonCrit,7535.107*2.76*2*(1+2400/720)*.5*.8*.9);near(f.nonCrit,7535.107*.25*2*(1+200/280)*.5*.8*.9*1.12);near(get(r,'150503').nonCrit,13392);assert.equal(u.breakdown.inputCertifiedBanger,40);assert.equal(u.breakdown.certifiedBanger,480);assert.match(app.node('hsrResults').innerHTML,/入力した褒美／必殺技の参照下限/);assert.match(app.node('hsrResults').innerHTML,/通常ダメージ・キツネ先生/);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="hiyu-certified-banger"/);app.node('hsrConditionDialogClose').handlers.click();app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs['hiyu-certified-banger'],40);near(get(saved.calculate(),'1505042').nonCrit,u.nonCrit);
 app.state.party[0]={characterId:'1309',level:80,eidolon:0,traceLevels:{talent:10,skill:10}};app.state.modifierInputs['robin-talent-crit-active']=true;r=app.calculate();near(get(r,'1505041').nonCrit,a.nonCrit);near(get(r,'150501').crit/get(r,'150501').nonCrit,2.2);assert.ok(!get(r,'1505041').applied.some(m=>m.category==='critDamage'),'ordinary-only support is outside Elation scope');app.state.modifierInputs['robin-talent-crit-active']=false;r=app.calculate();near(get(r,'1505041').nonCrit,a.nonCrit);app.state.modifierInputs['hiyu-certified-banger']=NaN;r=app.calculate();assert.equal(get(r,'1505042'),undefined);assert.ok(get(r,'150503'));app.node('hsrTalentTrace').value='';r=app.calculate();assert.ok(get(r,'150501'));assert.equal(get(r,'1505043'),undefined);
});

test('fresh Robin Talent automatically applies without an activation checkbox and preserves included final CD on reload',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json'));const records=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.filter(m=>m.id==='trace:1309:130904:party-crit-damage');
 const data={structuredModifiers:records};const app=await tool(undefined,data);app.state.data.characters.push(catalog.characters.find(c=>c.id==='1309'));delete app.state.modifierInputs['robin-talent-crit-active'];
 app.state.party[0]={characterId:'1309',eidolon:0,level:80,traceLevels:{talent:10}};
 for(const[k,v]of Object.entries({atk:'3000',critRate:'50',critDamage:'100'}))app.node('hsrStat-'+k).value=v;
 let result=app.calculate()[0];assert.ok(Math.abs(result.expected-1728)<1e-8);
 app.node('hsrConditionDialogOpen').handlers.click();assert.doesNotMatch(app.node('hsrConditionList').innerHTML,/data-structured-toggle="robin-talent-crit-active"/);assert.match(app.node('hsrConditionList').innerHTML,/ロビン天賦の会心ダメージを最終値に反映済み/);
 app.node('hsrStat-critDamage').value='120';app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'robin-talent-crit-in-final-stats'},checked:true}});
 assert.ok(Math.abs(app.calculate()[0].expected-1728)<1e-8);
 const restored=await tool(app.storage,{...data,characters:app.state.data.characters});assert.equal(restored.state.modifierInputs['robin-talent-crit-in-final-stats'],true);assert.ok(Math.abs(restored.calculate()[0].expected-1728)<1e-8);
 restored.state.party[0].characterId='';assert.ok(!restored.calculate()[0].applied.some(m=>m.id===records[0].id));
});
test('Arena uses Sunday combat CR after support selection and restores threshold decisions',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json'));const records=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.filter(m=>['ornament:309:2pc:normal-skill-damage','trace:1313:131304:party-crit-rate'].includes(m.id));
 const data={structuredModifiers:records,relicSets:catalog.relicSets};const app=await tool(undefined,data);app.state.data.characters.push(catalog.characters.find(c=>c.id==='1313'));app.state.ornamentId='309';app.state.party[0]={characterId:'1313',eidolon:0,level:80,traceLevels:{talent:10}};
 app.node('hsrStat-atk').value='3000';app.node('hsrStat-critRate').value='50';app.node('hsrStat-critDamage').value='100';assert.ok(Math.abs(app.calculate()[0].nonCrit-1080)<1e-8);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'sunday-talent-crit-active'},checked:true}});assert.ok(Math.abs(app.calculate()[0].nonCrit-1296)<1e-8);
 const restored=await tool(app.storage,{...data,characters:app.state.data.characters});assert.ok(Math.abs(restored.calculate()[0].nonCrit-1296)<1e-8);restored.state.party[0].characterId='';assert.ok(Math.abs(restored.calculate()[0].nonCrit-1080)<1e-8);
});
test('Huohuo Ultimate and Firesmith next Fire attack change only their intended components and restore',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json'));const records=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.filter(m=>['trace:1217:121703:party-atk','relic:107:4pc:next-fire-damage','relic:107:4pc:skill-damage'].includes(m.id));
 const data={structuredModifiers:records,relicSets:catalog.relicSets};const app=await tool(undefined,data);app.state.data.characters.push(catalog.characters.find(c=>c.id==='1217'));app.state.party[0]={characterId:'1217',level:80,eidolon:0,traceLevels:{ultimate:10}};app.state.relicId='107';app.state.relicMode='4pc';app.state.data.attacks[0].element='Fire';app.state.data.attacks.push({...app.state.data.attacks[0],id:'ice-comparison',element:'Ice'});
 app.node('hsrStat-atk').value='3000';app.node('hsrStat-critRate').value='50';app.node('hsrStat-critDamage').value='100';assert.ok(Math.abs(app.calculate()[0].nonCrit-1080)<1e-8);
 for(const key of ['huohuo-ultimate-atk-active','firesmith-ultimate-next-fire-active'])app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:true}});
 let result=app.calculate();assert.ok(Math.abs(result[0].nonCrit-1290.24)<1e-8);assert.ok(Math.abs(result[1].nonCrit-1152)<1e-8);
 const restored=await tool(app.storage,{...data,characters:app.state.data.characters,attacks:app.state.data.attacks});assert.ok(Math.abs(restored.calculate()[0].nonCrit-1290.24)<1e-8);restored.state.party[0].characterId='';assert.ok(Math.abs(restored.calculate()[0].nonCrit-1209.6)<1e-8);restored.state.relicId='';assert.ok(Math.abs(restored.calculate()[0].nonCrit-1080)<1e-8);
});


test('Robin E2 speed crosses Glamoth in the App, preserves inclusion and state on reload, and disappears with provider',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json'));
 const records=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.filter(m=>['eidolon:1309:2:party-speed','ornament:311:2pc:speed-damage'].includes(m.id));
 const data={structuredModifiers:records,relicSets:catalog.relicSets};const app=await tool(undefined,data);
 app.state.data.characters.push(catalog.characters.find(c=>c.id==='1309'));
 app.state.party[0]={characterId:'1309',level:80,eidolon:2,traceLevels:{talent:10}};app.state.ornamentId='311';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:119}))app.node('hsrStat-'+k).value=String(v);
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
 near(app.calculate()[0].nonCrit,1080);
 app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();
 assert.match(app.node('hsrConditionList').innerHTML,/robin-e2-concerto-speed-active/);
 assert.match(app.node('hsrConditionList').innerHTML,/速度条件の判定（各攻撃へ間接反映）/);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'robin-e2-concerto-speed-active'},checked:true}});
 // Base SPD 100, final input 119: 119 + 100 * .16 = 135; Glamoth adds 12% damage.
 near(app.calculate()[0].nonCrit,1209.6);
 const saved=await tool(app.storage,{...data,characters:app.state.data.characters});
 assert.equal(saved.state.modifierInputs['robin-e2-concerto-speed-active'],true);near(saved.calculate()[0].nonCrit,1209.6);
 saved.node('hsrStat-speed').value='135';saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'robin-e2-speed-in-final-stats'},checked:true}});
 near(saved.calculate()[0].nonCrit,1209.6);
 const included=await tool(saved.storage,{...data,characters:app.state.data.characters});
 assert.equal(included.state.modifierInputs['robin-e2-speed-in-final-stats'],true);near(included.calculate()[0].nonCrit,1209.6);
 included.node('hsrStat-speed').value='119';included.state.modifierInputs['robin-e2-speed-in-final-stats']=false;
 included.state.party[0].eidolon=1;near(included.calculate()[0].nonCrit,1080);
 included.state.party[0].eidolon=2;near(included.calculate()[0].nonCrit,1209.6);
 included.state.party[0].characterId='';near(included.calculate()[0].nonCrit,1080);
});


test('Rappa E4 and Pela E2 speed states persist through App reload with effective Glamoth tiers',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
 for(const c of [
  {id:'1317',rank:4,record:'eidolon:1317:4:party-speed',key:'rappa-e4-sealform-speed-active',included:'rappa-e4-speed-in-final-stats',raw:123,goal:135,off:1080,on:1209.6},
  {id:'1106',rank:2,record:'eidolon:1106:2:speed',key:'pela-e2-speed-active',included:'pela-e2-speed-in-final-stats',raw:149.5,goal:160,off:1209.6,on:1274.4}
 ]){
  const character=catalog.characters.find(x=>x.id===c.id),isPela=c.id==='1106';
  const records=all.filter(m=>[c.record,'ornament:311:2pc:speed-damage'].includes(m.id));
  const data={structuredModifiers:records,relicSets:catalog.relicSets};
  if(isPela){data.characters=[character];data.attacks=[{id:'pela-e2-app',characterId:c.id,name:'SPD comparison',type:'normal',element:'Ice',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}];}
  const app=await tool(undefined,data);if(isPela){app.state.characterId=c.id;app.state.eidolon=c.rank;app.node('hsrEidolon').value=String(c.rank);}else{app.state.data.characters.push(character);app.state.party[0]={characterId:c.id,level:80,eidolon:c.rank,traceLevels:{talent:10}};}
  app.state.ornamentId='311';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:c.raw}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].nonCrit,c.off);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:c.key},checked:true}});near(app.calculate()[0].nonCrit,c.on);
  const saved=await tool(app.storage,{...data,characters:app.state.data.characters});assert.equal(saved.state.modifierInputs[c.key],true);near(saved.calculate()[0].nonCrit,c.on);
  saved.node('hsrStat-speed').value=String(c.goal);saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:c.included},checked:true}});near(saved.calculate()[0].nonCrit,c.on);
  const included=await tool(saved.storage,{...data,characters:app.state.data.characters});assert.equal(included.state.modifierInputs[c.included],true);near(included.calculate()[0].nonCrit,c.on);
 }
});

test('new relic stack and recipient controls save final-stat exclusion without double addition',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' != '+b);
 for(const c of [{id:'105',rec:'relic:105:4pc:atk-stacks',key:'relic-105-atk-stacks',n:5,nc:1125,expected:1687.5},{id:'121',rec:'relic:121:4pc:target-crit-damage',key:'relic-121-target-crit-damage-stacks',n:2,nc:1080,expected:1814.4}]){
  const rec=all.find(m=>m.id===c.rec),data={structuredModifiers:[rec],relicSets:catalog.relicSets};const app=await tool(undefined,data);
  if(c.id==='121')app.state.party[0]={characterId:'1202',level:80,eidolon:0,relicId:'121',relicMode:'4pc',traceLevels:{skill:10}};else app.state.relicId=c.id;
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].expected,1620);app.state.conditionTab=c.id==='121'?'パーティ':'遺物・オーナメント';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,new RegExp('data-structured-input="'+c.key+'"'));
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:c.key},value:String(c.n)}});near(app.calculate()[0].nonCrit,c.nc);near(app.calculate()[0].expected,c.expected);
  const saved=await tool(app.storage,{...data,characters:app.state.data.characters});assert.equal(saved.state.modifierInputs[c.key],c.n);near(saved.calculate()[0].expected,c.expected);
  if(c.id==='105')saved.node('hsrStat-atk').value='3125';else saved.node('hsrStat-critDamage').value='136';
  saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:rec.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].expected,c.expected);
  if(c.id==='121'){saved.state.party[0].relicId='';saved.node('hsrStat-critDamage').value='100';}else{saved.state.relicId='';saved.node('hsrStat-atk').value='3000';}
  near(saved.calculate()[0].expected,1620);
 }
});


test('round2 Messenger and Watchmaker use the App party, threshold, final-inclusion and saved-state paths',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[setId,key]of [['114','relic-114-party-speed-active'],['118','relic-118-party-break-effect-active']]){
  const records=all.filter(m=>m.id==='ornament:311:2pc:speed-damage'||m.source.kind==='relic'&&m.source.id===setId),rec=records.find(m=>m.source.kind==='relic');
  const data={structuredModifiers:records,relicSets:catalog.relicSets};let app=await tool(undefined,data);app.state.data.characters.push(catalog.characters.find(c=>c.id==='1313'));app.state.party[0]={characterId:'1313',level:80,eidolon:0,relicId:setId,relicMode:'4pc',traceLevels:{ultimate:10}};
  let last;const run=()=>{const engine=app.window.HsrCalcEngine,original=engine.calculateBreak;engine.calculateBreak=input=>{last=original(input);return last;};const result=app.calculate();engine.calculateBreak=original;return setId==='114'?result[0].nonCrit:last.value;};
  let off,on;
  if(setId==='114'){app.state.ornamentId='311';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:148}))app.node('hsrStat-'+k).value=String(v);off=1209.6;on=1274.4;}
  else{app.node('hsrBreakMode').value='break';app.node('hsrWeakness').value='true';app.node('hsrStat-breakEffect').value='100';off=3767.5533*2*.5*.8*.75;on=3767.5533*2.3*.5*.8*.75;}
  near(run(),off);app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,new RegExp(key));
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:true}});near(run(),on);
  app=await tool(app.storage,{...data,characters:app.state.data.characters});assert.equal(app.state.modifierInputs[key],true);near(run(),on);
  app.node('hsrStat-'+(setId==='114'?'speed':'breakEffect')).value=setId==='114'?'160':'130';app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:rec.finalStatsInclusion.inputKey},checked:true}});near(run(),on);
  app.node('hsrStat-'+(setId==='114'?'speed':'breakEffect')).value=setId==='114'?'148':'100';app.state.party[0].relicId='';near(run(),off);
 }
});

test('round2 light cones reach App damage with automatic HP checks, explicit EP/slow, save restore and path validation',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 const cases=[{lc:'20009',char:'1107',type:'skill',hp:51,bonus:20},{lc:'20011',char:'1004',type:'skill',hp:70,bonus:24,toggle:'lc-20011-enemy-slowed'},{lc:'21006',char:'1003',type:'followUp',hp:50,bonus:48},{lc:'21012',char:'1107',type:'skill',hp:70,bonus:40},{lc:'21017',char:'1002',type:'normal',hp:70,bonus:48,numeric:'lc-21017-energy-percent'},{lc:'21013',char:'1003',type:'ultimate',hp:70,bonus:32}];
 for(const c of cases){
  const data={characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:all.filter(m=>m.source.kind==='lightCone'&&m.source.id===c.lc),attacks:[{id:'lc-round2-app',name:'LC comparison',characterId:c.char,type:c.type,element:catalog.characters.find(x=>x.id===c.char).element,scalingStat:'atk',multipliers:[100],support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=c.char;app.state.coneId=c.lc;
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,hpPercent:70}))app.node('hsrStat-'+k).value=String(v);app.node('hsrEnemyHpPercent').value=String(c.hp);
  if(c.toggle)app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:c.toggle},checked:true}});
  if(c.numeric){app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,new RegExp(c.numeric));app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:c.numeric},value:'100'}});}
  let r=app.calculate()[0];assert.ok(r,c.lc);near(r.nonCrit,1080*(1+c.bonus/100));near(r.expected,1620*(1+c.bonus/100));app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].nonCrit,r.nonCrit);
  if(c.lc==='21012'){saved.node('hsrEnemyHpPercent').value='69.99';near(saved.calculate()[0].nonCrit,1296);saved.node('hsrEnemyHpPercent').value='70';near(saved.calculate()[0].nonCrit,1512);}
  saved.state.coneId='';near(saved.calculate()[0].nonCrit,1080);
 }
 // A stale/imported loadout cannot activate a light cone from another path.
 const bad=await tool(undefined,{characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:all.filter(m=>m.source.kind==='lightCone'&&m.source.id==='20009'),attacks:[{id:'bad-lc',name:'Invalid loadout',characterId:'1003',type:'normal',element:'Fire',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]});bad.state.characterId='1003';bad.state.coneId='20009';bad.node('hsrStat-atk').value='3000';bad.node('hsrEnemyHpPercent').value='100';assert.equal(bad.calculate().length,0);assert.match(bad.node('hsrCalculationFeedback').innerHTML,/運命が装備者と一致しません/);
});


test('round2 native SPD choices restore in the App and update Glamoth only after the selected action',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 for(const[id,owner,key,included,party]of [['eidolon:1202:1:speed','1202','tingyun-e1-speed-active','tingyun-e1-speed-in-final-stats',true],['traceNode:1202:1202101:speed','1202','tingyun-a2-speed-active','tingyun-a2-speed-in-final-stats',false],['traceNode:1201:1201103:speed','1201','qingque-a3-speed-active','qingque-a3-speed-in-final-stats',false]]){
  const char=party?'1001':owner,records=all.filter(m=>[id,'ornament:311:2pc:speed-damage'].includes(m.id)),data={characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:records,attacks:[{id:'native-spd',name:'SPD state',characterId:char,type:'normal',element:'Ice',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=char;app.state.ornamentId='311';if(party)app.state.party[0]={characterId:owner,level:80,eidolon:1,traceLevels:{skill:10}};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:130}))app.node('hsrStat-'+k).value=String(v);
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);near(app.calculate()[0].nonCrit,1080);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:true}});near(app.calculate()[0].nonCrit,1209.6);
  const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs[key],true);near(saved.calculate()[0].nonCrit,1209.6);saved.node('hsrStat-speed').value='150';saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:included},checked:true}});near(saved.calculate()[0].nonCrit,1209.6);
 }
});

test('Genius uses main-character Quantum weakness for every element and restores non-Quantum explicit weakness',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),records=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.filter(m=>m.source.kind==='relic'&&m.source.id==='108');
 for(const[char,element]of [['1003','Fire'],['1102','Quantum']]){
  const data={characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:records,attacks:['Fire','Quantum'].map(e=>({id:'genius-'+e,name:e,characterId:char,type:'normal',element:e,multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}))};
  const app=await tool(undefined,data);app.state.characterId=char;app.state.relicId='108';app.node('hsrStat-atk').value='3000';app.node('hsrWeakness').value='true';
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);for(const r of app.calculate())near(r.nonCrit,element==='Quantum'?1200:2160/1.9);
  app.state.conditionTab='遺物・オーナメント';app.node('hsrConditionDialogOpen').handlers.click();
  if(element==='Fire'){assert.match(app.node('hsrConditionList').innerHTML,/data-structured-toggle="enemy-quantum-weakness"/);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'enemy-quantum-weakness'},checked:true}});for(const r of app.calculate())near(r.nonCrit,1200);const saved=await tool(app.storage,data);for(const r of saved.calculate())near(r.nonCrit,1200);}
  else{assert.doesNotMatch(app.node('hsrConditionList').innerHTML,/data-structured-toggle="enemy-quantum-weakness"/);app.node('hsrWeakness').value='false';for(const r of app.calculate())near(r.nonCrit,2160/1.9);}
 }
});


test('round2 low-rarity stat cones save activation and final inclusion through the App',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,char=catalog.characters.find(c=>c.id==='1002');
 for(const[id,stat,amount]of [['20000','critRate',12],['20007','atk',24],['20014','speed',10]]){
  const cone=catalog.lightCones.find(c=>c.id===id),records=all.filter(m=>m.id===`lightCone:${id}:conditional-${stat}`||m.id==='ornament:311:2pc:speed-damage');
  const data={characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets,structuredModifiers:records,attacks:[{id:'stat-cone',name:'Stat cone',characterId:'1002',type:'normal',element:'Wind',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId='1002';app.state.coneId=id;app.state.ornamentId='311';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:stat==='speed'?135-char.base.speed*.1:125}))app.node('hsrStat-'+k).value=String(v);
  const rec=records.find(m=>m.source.kind==='lightCone'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);near(app.calculate()[0].expected,1620);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:rec.activation.inputKey},checked:true}});
  const final=stat==='atk'?3000+(char.base.atk+cone.base.atk)*amount/100:stat==='critRate'?62:135,expected=stat==='atk'?final*.54:stat==='critRate'?1749.6:1814.4;near(app.calculate()[0].expected,expected);
  const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.node('hsrStat-'+stat).value=String(final);saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:rec.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].expected,expected);const included=await tool(saved.storage,data);assert.equal(included.state.modifierInputs[rec.finalStatsInclusion.inputKey],true);near(included.calculate()[0].expected,expected);
 }
});


test('round3 unknown current HP is local, reuses its field, and stays unknown across save and UID changes',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 const data={characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:all.filter(m=>m.source.kind==='lightCone'&&m.source.id==='20016'),attacks:[{id:'hp-state',name:'HP condition',characterId:'1107',type:'normal',element:'Physical',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
 const app=await tool(undefined,data);app.state.characterId='1107';app.state.coneId='20016';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);assert.equal(app.node('hsrStat-hpPercent').value,'');near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
 app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/条件未確定/);assert.match(app.node('hsrConditionList').innerHTML,/data-hsr-ratio-field="hsrStat-hpPercent"/);
 app.node('hsrConditionDialog').handlers.click({target:{closest:()=>({dataset:{hsrRatioField:'hsrStat-hpPercent'}})}});assert.equal(app.node('hsrConditionDialog').open,false);assert.equal(app.node('hsrStat-hpPercent').scrolled.block,'center');
 for(const[value,expected,unknown]of [['79.99',1749.6,false],['80',1620,false],['0',1749.6,false],['100',1620,false],['',1620,true],['101',1620,true]]){app.node('hsrStat-hpPercent').value=value;near(app.calculate()[0].expected,expected);assert.equal(/条件未確定/.test(app.node('hsrConditionTitle').textContent),unknown);}
 app.node('hsrStat-hpPercent').value='';app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.node('hsrStat-hpPercent').value,'');near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);
 saved.node('hsrStat-hpPercent').value='30';saved.node('hsrStat-atk').handlers.input();const valid=await tool(saved.storage,data);assert.equal(valid.node('hsrStat-hpPercent').value,'30.0');near(valid.calculate()[0].expected,1749.6);
 valid.window.HsrTool.applyProfileCharacter({id:'1107',level:80,eidolon:0,traces:[],stats:{hp:6000,atk:3000,critRate:50,critDamage:100}});assert.equal(valid.node('hsrStat-hpPercent').value,'','UID does not supply the current battle HP');
});

test('round3 unknown enemy HP and EP exclude only the affected cone component',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[lc,char]of [['20009','1107'],['21017','1002']]){
  const data={characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:all.filter(m=>m.source.kind==='lightCone'&&m.source.id===lc),attacks:[{id:'unknown',name:'Local condition',characterId:char,type:'normal',element:'Wind',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=char;app.state.coneId=lc;for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].expected,lc==='20009'?1620:2008.8);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
  if(lc==='20009'){assert.equal(app.node('hsrEnemyHpPercent').value,'');app.node('hsrEnemyHpPercent').value='51';near(app.calculate()[0].expected,1944);app.node('hsrEnemyHpPercent').value='50';near(app.calculate()[0].expected,1620);}
  else{app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="lc-21017-energy-percent"[^>]*value=""/);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'lc-21017-energy-percent',structuredStrict:'true'},value:'100'}});near(app.calculate()[0].expected,2397.6);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'lc-21017-energy-percent',structuredStrict:'true'},value:''}});near(app.calculate()[0].expected,2008.8);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);}
 }
});

test('round3 Iron Cavalry updates with Watchmaker BE in the App and excludes included BE once',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,records=all.filter(m=>m.source.kind==='relic'&&['119','118'].includes(m.source.id));
 const data={characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:records};let app=await tool(undefined,data);app.state.characterId='1003';app.state.relicId='119';app.state.party[0]={characterId:'1313',level:80,eidolon:0,relicId:'118',relicMode:'4pc',traceLevels:{ultimate:10}};
 app.node('hsrBreakMode').value='superBreak';app.node('hsrSuperBreakToughness').value='30';app.node('hsrSuperBreakMultiplier').value='100';app.node('hsrToughnessState').value='broken';app.node('hsrStat-breakEffect').value='220';
 let last;const run=()=>{const e=app.window.HsrCalcEngine,old=e.calculateSuperBreak;e.calculateSuperBreak=i=>{last=old(i);return last;};app.calculate();e.calculateSuperBreak=old;return last.value;},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 near(run(),3767.5533*3*3.2*.8/1.9);const watch=records.find(m=>m.source.id==='118');app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:watch.activation.inputKey},checked:true}});near(run(),18084.25584);
 app=await tool(app.storage,data);near(run(),18084.25584);app.node('hsrStat-breakEffect').value='250';app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:watch.finalStatsInclusion.inputKey},checked:true}});near(run(),18084.25584);
 app.state.party[0].relicId='';app.node('hsrStat-breakEffect').value='220';near(run(),3767.5533*3*3.2*.8/1.9);
});


test('round3 native healing stacks and Burden ATK use recipient selection, rank and saved conditions',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[id,provider,rank,key,n,expected]of [['eidolon:1211:4:healing-damage','1211',4,'bailu-e4-healing-stacks',3,2106],['traceNode:1215:1215101:sp-recovery-atk','1215',0,'hanya-recorded-sp-recovery-atk-active',true,1647]]){
  const rec=all.find(m=>m.id===id);assert.ok(rec);const data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500,speed:100}},...catalog.characters],structuredModifiers:[rec]};const app=await tool(undefined,data);app.state.party[0]={characterId:provider,level:80,eidolon:rank,traceLevels:{skill:10}};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
  const event=typeof n==='number'?{dataset:{structuredInput:key},value:String(n)}:{dataset:{structuredToggle:key},checked:n};app.node('hsrConditionDialog').handlers.change({target:event});near(app.calculate()[0].expected,expected);
  const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round3 shared Rain and provider shield states are applied once, saved and locally reject ambiguous shields',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const set of ['125','128']){
  const recs=all.filter(m=>m.source.kind==='relic'&&m.source.id===set||m.id==='ornament:311:2pc:speed-damage'),rec=recs.find(m=>m.source.id===set),data={relicSets:catalog.relicSets,characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500,speed:100}},...catalog.characters],structuredModifiers:recs};const app=await tool(undefined,data);
  if(set==='125'){app.state.relicId=set;app.state.ornamentId='311';}else app.state.party[0]={characterId:'1313',level:80,eidolon:0,relicId:set,relicMode:'4pc',traceLevels:{ultimate:10}};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,speed:130}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:rec.activation.inputKey},checked:true}});const expected=set==='125'?1905.12:1701;near(app.calculate()[0].expected,expected);const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  if(set==='128'){saved.state.party[1]={characterId:'1211',level:80,eidolon:0,relicId:set,relicMode:'4pc',traceLevels:{skill:10}};near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);}else{saved.state.relicId='';near(saved.calculate()[0].expected,1620);}
 }
});

test('round4 six cone states reach App damage, final inclusion, equipment changes and saved inputs',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[id,char,category,key,amount]of [['21003','1002','critRate',null,12],['21008','1108','dotDamage',null,24],['21019','1107','critRate','lc-21019-kill-crit-active',12],['21020','1003','critDamage','lc-21020-kill-cd-active',24],['21027','1003','statPercent','lc-21027-kill-stacks',12],['21005','1107','statPercent','lc-21005-mischief-stacks',36]]){
  const row=all.find(x=>x.source.kind==='lightCone'&&x.source.id===id),type=category==='dotDamage'?'dot':'normal';
  const data={characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:[row],attacks:[{id:'round4-cone-app',name:'Cone state',characterId:char,type,element:catalog.characters.find(x=>x.id===char).element,multipliers:[100],scalingStat:'atk',canCrit:type!=='dot',support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=char;app.state.coneId=id;
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  app.node('hsrEnemyCount').value=id==='21003'?'3':'1';
  const baseAtk=catalog.characters.find(x=>x.id===char).base.atk+catalog.lightCones.find(x=>x.id===id).base.atk;
  if(key){const event=category==='statPercent'?{dataset:{structuredInput:key},value:'3'}:{dataset:{structuredToggle:key},checked:true};app.node('hsrConditionDialog').handlers.change({target:event});}
  else if(id==='21003'){near(app.calculate()[0].expected,1620);app.node('hsrEnemyCount').value='2';}
  const atk=3000+(category==='statPercent'?baseAtk*amount/100:0),nc=atk*0.5*0.8*0.9*(category==='dotDamage'?1+amount/100:1);
  const expected=category==='dotDamage'?nc:nc*(1+(50+(category==='critRate'?amount:0))/100*(1+(category==='critDamage'?amount/100:0)));
  near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  if(category==='statPercent')saved.node('hsrStat-atk').value=String(atk);
  if(category==='critRate')saved.node('hsrStat-critRate').value=String(50+amount);
  if(category==='critDamage')saved.node('hsrStat-critDamage').value=String(100+amount);
  if(category==='dotDamage')saved.node('hsrStat-damageBonus').value=String(amount);
  saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].expected,expected);
  // Removing a cone removes its additional effect; a user-supplied final value remains their input.
  saved.state.coneId='';saved.node('hsrStat-atk').value='3000';saved.node('hsrStat-critRate').value='50';saved.node('hsrStat-critDamage').value='100';saved.node('hsrStat-damageBonus').value='0';near(saved.calculate()[0].expected,type==='dot'?1080:1620);
 }
});

test('round4 accepted Normal attacks reach the App without activation checks and restore as single-attack results',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:prod}=await loadProductionFixture();
 const ids=require('../../games/hsr/data/calc/attacks-round4.json').overrides.map(x=>x.id);
 for(const id of ids){
  const a=prod.attacks.find(x=>x.id===id),data={characters:prod.characters,lightCones:prod.lightCones,attacks:[a],structuredModifiers:[]};
  const app=await tool(undefined,data);app.state.characterId=a.characterId;app.state.eidolon=0;
  for(const[k,v]of Object.entries({hp:6000,atk:3000,def:4000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  app.node('hsrNormalTrace').value='6';app.node('hsrEnemyCount').value='1';
  const expected=(a.scalingStat==='hp'?6000:3000)*a.multipliers[5]/100*0.5*0.8*0.9;
  const results=app.calculate();assert.equal(results.length,1,id);assert.ok(Math.abs(results[0].nonCrit-expected)<1e-7,id);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(Math.abs(saved.calculate()[0].nonCrit-expected)<1e-7,id+' restored');
 }
});

test('round4 native HP and healing conditions reach App calculations and restore',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[char,id,key,on]of [['1302','traceNode:1302:1302103:low-hp-damage',null,1242],['1408','traceNode:1408:1408102:healing-damage','phainon-a2-healing-damage-active',1566]]){
  const data={characters:catalog.characters,structuredModifiers:all.filter(x=>x.id===id),attacks:[{id:'native-r4-app',name:'Native state',characterId:char,type:'normal',element:catalog.characters.find(x=>x.id===char).element,multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=char;for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  app.node('hsrEnemyHpPercent').value='';near(app.calculate()[0].nonCrit,1080);
  if(key)app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:true}});
  else{for(const[hp,nc]of [['50.001',1080],['50',1242],['49.999',1242]]){app.node('hsrEnemyHpPercent').value=hp;near(app.calculate()[0].nonCrit,nc);}}
  near(app.calculate()[0].nonCrit,on);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].nonCrit,on);
 }
});

test('round4 same-cloak support uses provider ATK without a skill-level requirement, missing ATK excludes only that support',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),row=require('../../games/hsr/data/calc/modifiers-native-round4.json').modifiers.find(x=>x.source.id==='1414'),data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500}},...catalog.characters],structuredModifiers:[row]};
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 app.state.party[0]={characterId:'1414',level:80,eidolon:0,atk:4000,traceLevels:{}};
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].nonCrit,1080);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});near(app.calculate()[0].nonCrit,1296);
 for(const atk of[NaN,0,undefined]){app.state.party[0].atk=atk;near(app.calculate()[0].nonCrit,1080);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);}
 app.state.party[0].atk=4000;near(app.calculate()[0].nonCrit,1296);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].nonCrit,1296);
 saved.node('hsrStat-atk').value='3600';saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].nonCrit,1296);
 saved.state.party[0].characterId='';saved.node('hsrStat-atk').value='3000';near(saved.calculate()[0].nonCrit,1080);
});

test('round4 new set conditions share state, affect wearer HP or SPD/CD, and restore',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const set of['123','127']){
  const recs=all.filter(m=>m.source.kind==='relic'&&m.source.id===set||m.id==='ornament:311:2pc:speed-damage');
  const data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500,hp:1000,speed:100}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:recs};
  if(set==='127')data.attacks=[{id:'r4-hp-app',name:'HP attack',characterId:'sample',type:'normal',element:'Ice',multipliers:[100],scalingStat:'hp',support:{status:'calculable',verified:true}}];
  const app=await tool(undefined,data);app.state.relicId=set;app.state.relicMode='4pc';if(set==='123')app.state.ornamentId='311';
  for(const[k,v]of Object.entries({atk:3000,hp:6000,speed:130,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  const off=app.calculate()[0].expected;
  for(const key of[...new Set(recs.filter(x=>x.source.id===set).map(x=>x.activation.inputKey))])app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:true}});
  const expected=set==='123'?1995.84:3875.04;near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  saved.state.relicId='';near(saved.calculate()[0].expected,off);
 }
});

test('round4 Artificer detects explicit or supported DEF reduction automatically without triggering Fuel',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers;
 const recs=all.filter(x=>x.source.kind==='relic'&&x.source.id==='132'||x.id==='trace:1106:110607:defense-reduction'),data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:recs};
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);app.state.relicId='132';app.state.relicMode='4pc';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 near(app.calculate()[0].expected,1620);app.node('hsrEnemyDefenseReduction').value='40';near(app.calculate()[0].expected,2214);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'relic-132-fuel'},checked:true}});near(app.calculate()[0].expected,2546.1);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'relic-132-fuel'},checked:false}});
 app.node('hsrEnemyDefenseReduction').value='0';app.state.party[0]={characterId:'1106',level:80,eidolon:0,traceLevels:{}};
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'pela-technique-defense-down'},checked:true}});near(app.calculate()[0].expected,1968);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,1968);
 saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
 const pela=data.structuredModifiers.find(x=>x.id==='trace:1106:110607:defense-reduction'),zero={...pela,value:{kind:'fixed',fixed:0}},zeroApp=await tool(undefined,{...data,structuredModifiers:recs.map(x=>x.id===pela.id?zero:x)});zeroApp.state.relicId='132';zeroApp.state.relicMode='4pc';zeroApp.state.party[0]={characterId:'1106',level:80,eidolon:0,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))zeroApp.node('hsrStat-'+k).value=String(v);zeroApp.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'pela-technique-defense-down'},checked:true}});near(zeroApp.calculate()[0].expected,1620);
 saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'enemy-defense-down-active'},checked:true}});near(saved.calculate()[0].expected,1771.2);
 const row=recs.find(x=>x.id==='relic:132:4pc:defense-down-crit-damage');saved.node('hsrStat-critDamage').value='128';saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].expected,1771.2);
});

test('round5 light cone batch reaches App damage and restores only the selected equipped effects',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../games/hsr/data/calc/modifiers-equipment-round5.json').modifiers,gl=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers.find(x=>x.id==='ornament:311:2pc:speed-damage'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const chars={Warlock:'1108',Warrior:'1107',Knight:'1104',Rogue:'1002',Mage:'1003',Memory:'8007',Shaman:'1202',Priest:'1105'};
 for(const[id,dmg,cr,cd,spd]of [['21001',36,0,0,false],['21022',16,0,0,false],['21024',12,0,0,true],['21026',16,0,0,false],['21038',25,0,0,false],['21041',18,0,0,false],['21042',0,15,0,false],['21043',16,0,0,false],['21044',0,0,24,false],['21045',0,0,0,true],['21051',20,0,0,false],['21053',12,0,0,false]]){
  const cone=catalog.lightCones.find(x=>x.id===id),char=chars[cone.path];assert.ok(char,cone.path);const rows=all.filter(x=>x.source.id===id);
  const data={characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets,structuredModifiers:spd?[...rows,gl]:rows,attacks:[{id:'r5-lc-app',characterId:char,name:'Cone state',type:'normal',element:catalog.characters.find(x=>x.id===char).element,scalingStat:'atk',multipliers:[100],support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.characterId=char;app.state.coneId=id;if(spd)app.state.ornamentId='311';
  for(const[k,v]of Object.entries({atk:3000,speed:128,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].expected,1620);
  for(const row of rows){if(row.activation.mode==='toggle')app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});
   if(row.activation.mode==='stack')app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:row.activation.inputKey},value:String(row.activation.maximum)}});}
  if(id==='21001')app.node('hsrEnemyDebuffCount').value='3';
  const nc=1080*(1+(dmg+(spd?12:0))/100),expected=nc*(1+(50+cr)/100*(1+cd/100));near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.state.coneId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round5 shielded ally receives LC21053 from another wearer and LC21044 reuses known enemy DEF reduction',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-equipment-round5.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const data={characters:catalog.characters,lightCones:catalog.lightCones,structuredModifiers:rows.filter(x=>x.source.id==='21053'),attacks:[{id:'shield-r5',name:'Shield recipient',characterId:'1003',type:'normal',element:'Fire',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]};
 const app=await tool(undefined,data);app.state.characterId='1003';app.state.party[0]={characterId:'1104',level:80,eidolon:0,lightConeId:'21053',coneRank:5,traceLevels:{}};
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'lc-21053-barrier-active'},checked:true}});near(app.calculate()[0].expected,1944);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,1944);saved.state.party[1]={characterId:'1304',level:80,eidolon:0,lightConeId:'21053',coneRank:1,traceLevels:{}};near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);saved.state.party[1].characterId='';near(saved.calculate()[0].expected,1944);saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
 const dance=await tool(undefined,{...data,structuredModifiers:rows.filter(x=>x.source.id==='21044'),attacks:[{...data.attacks[0],characterId:'1108',element:'Wind'}]});dance.state.characterId='1108';dance.state.coneId='21044';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))dance.node('hsrStat-'+k).value=String(v);dance.node('hsrEnemyDefenseReduction').value='40';near(dance.calculate()[0].expected,2187);
 dance.node('hsrEnemyDefenseReduction').value='0';near(dance.calculate()[0].expected,1620);
});

test('round5 entry SPD inputs stay separate, unknown is local, and UID speed supplies a precise precombat value',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../games/hsr/data/calc/modifiers-sets-round5.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const[set,cases]of [['124',[[94.999,1965.6],[95,1836],[109.999,1836],[110,1620]]],['130',[[119.999,1620],[120,1728],[159.999,1728],[160,1814.4]]]]){
  const data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:500,speed:100}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:all.filter(x=>x.source.id===set)};
  const app=await tool(undefined,data);app.state.relicId=set;app.state.relicMode='4pc';for(const[k,v]of Object.entries({atk:3000,speed:300,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
  app.state.conditionTab='遺物・オーナメント';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="pre-combat-speed"/g)||[]).length,1);assert.match(app.node('hsrConditionList').innerHTML,/戦闘前の速度：未入力/);
  for(const[speed,expected]of cases){app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'pre-combat-speed',structuredStrict:'true'},value:String(speed)}});near(app.calculate()[0].expected,expected);}
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,cases.at(-1)[1]);saved.node('hsrStat-speed').value='1';near(saved.calculate()[0].expected,cases.at(-1)[1]);
 }
 const uid=await tool(undefined,{characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:all});uid.state.modifierInputs['pre-combat-speed']=999;
 uid.window.HsrTool.applyProfileCharacter({id:'1003',level:80,eidolon:0,stats:{atk:3000,speed:94.999,critRate:50,critDamage:100},relicSets:[{id:'124',pieces:4}],traces:[]});assert.equal(uid.state.modifierInputs['pre-combat-speed'],94.999);
 uid.window.HsrTool.applyProfileCharacter({id:'1003',level:80,eidolon:0,stats:{atk:3000},relicSets:[],traces:[]});assert.equal(Object.hasOwn(uid.state.modifierInputs,'pre-combat-speed'),false);
});

test('round5 party SPD -> Talia -> Iron Cavalry reaches the actual Super Break App request once',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,ids=['119','307','323'],data={characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:all.filter(x=>ids.includes(x.source.id))};
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);app.state.characterId='1003';app.state.relicId='119';app.state.relicMode='4pc';app.state.ornamentId='307';app.state.party[0]={characterId:'8007',level:80,eidolon:0,ornamentId:'323',traceLevels:{}};
 for(const[k,v]of Object.entries({atk:3000,speed:137.32,breakEffect:230}))app.node('hsrStat-'+k).value=String(v);
 app.node('hsrBreakMode').value='superBreak';app.node('hsrToughnessState').value='broken';app.node('hsrSuperBreakToughness').value='30';app.node('hsrSuperBreakMultiplier').value='100';
 let value;const original=app.window.HsrCalcEngine.calculateSuperBreak;app.window.HsrCalcEngine.calculateSuperBreak=input=>{const r=original(input);value=r.value;return r;};app.calculate();near(value,3767.5533*3*3.3*.8/1.9);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'ornament-323-memosprite-active'},checked:true}});app.calculate();near(value,18084.25584);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);let restored;const fn=saved.window.HsrCalcEngine.calculateSuperBreak;saved.window.HsrCalcEngine.calculateSuperBreak=input=>{const r=fn(input);restored=r.value;return r;};saved.calculate();near(restored,value);
 saved.state.party[0].characterId='';saved.calculate();near(restored,3767.5533*3*3.3*.8/1.9);
});

test('round5 native supports and effective ATK DoT threshold survive real App input and provider removal',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const[provider,rowId,stat,expected]of [['1211','traceNode:1211:1211101:overheal-hp','hp',3294],['1412','traceNode:1412:1412103:merit-speed','atk',1814.4]]){
  const row=all.find(x=>x.id===rowId),gl=all.find(x=>x.id==='ornament:311:2pc:speed-damage'),data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{hp:1000,atk:1000,speed:100}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:[row,gl],attacks:[{id:'support-r5',characterId:'sample',name:'Supported attack',type:'normal',element:'Ice',multipliers:[100],scalingStat:stat,support:{status:'calculable',verified:true}}]};
  const app=await tool(undefined,data);app.state.party[0]={characterId:provider,level:80,eidolon:0,traceLevels:{}};if(provider==='1412')app.state.ornamentId='311';
  for(const[k,v]of Object.entries({atk:3000,hp:6000,speed:115,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  const off=app.calculate()[0].expected;app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.state.party[0].characterId='';near(saved.calculate()[0].expected,off);
 }
 const huohuo=all.find(x=>x.id==='trace:1217:121703:party-atk'),dot=all.find(x=>x.id==='ornament:322:2pc:atk-threshold-dot-damage');
 const app=await tool(undefined,{characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:[huohuo,dot],attacks:[{id:'dot-r5',characterId:'sample',name:'DoT',type:'dot',element:'Ice',multipliers:[100],canCrit:false,scalingStat:'atk',support:{status:'calculable',verified:true}}]});
 app.state.ornamentId='322';app.state.party[0]={characterId:'1217',level:80,eidolon:0,traceLevels:{ultimate:10}};app.node('hsrStat-atk').value='2390';near(app.calculate()[0].nonCrit,2390*.36);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:huohuo.activation.inputKey},checked:true}});near(app.calculate()[0].nonCrit,2790*.36*1.12);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,{characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:[huohuo,dot],attacks:[{id:'dot-r5',characterId:'sample',name:'DoT',type:'dot',element:'Ice',multipliers:[100],canCrit:false,scalingStat:'atk',support:{status:'calculable',verified:true}}]});near(saved.calculate()[0].nonCrit,2790*.36*1.12);
});

test('round5 Skill promotions are visible without activation checks and restore at every accepted character',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture();
 for(const row of require('../../games/hsr/data/calc/attacks-round5.json').overrides){
  const a=p.attacks.find(x=>x.id===row.id),data={characters:p.characters,attacks:[a],structuredModifiers:[]};const app=await tool(undefined,data);app.state.characterId=a.characterId;
  for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrSkillTrace').value='10';const expected=3000*a.multipliers[9]/100*.36;
  const result=app.calculate()[0];assert.ok(result,row.id);assert.ok(Math.abs(result.nonCrit-expected)<1e-6);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(Math.abs(saved.calculate()[0].nonCrit-expected)<1e-6);
 }
});

test('round6 provider SPD and Effect RES inputs gate only their own party effect and restore',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-sets-round6.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[set,field,boundary,expected]of [['302','speed',120,1663.2],['310','effectRes',30,1674]]){
  const data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:1000,speed:100}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:rows.filter(x=>x.source.id===set)};
  const app=await tool(undefined,data);app.state.party[0]={characterId:'1001',ornamentId:set,level:80,traceLevels:{},[field]:NaN};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
  app.state.party[0][field]=boundary-.001;near(app.calculate()[0].expected,1620);
  app.state.party[0][field]=boundary;near(app.calculate()[0].expected,expected);
  app.node('hsrPartyDialogOpen').handlers.click();assert.match(app.node('hsrPartyRows').innerHTML,new RegExp('data-party-field="'+field+'"'));
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);assert.equal(saved.state.party[0][field],boundary);
  // Exercise the actual party form collection, including a deliberately cleared value.
  const input={dataset:{slot:'0',partyField:field},type:'number',value:''};saved.node('hsrPartyRows').querySelectorAll=selector=>selector==='[data-party-field]'?[input]:[];saved.node('hsrPartyDialogApply').handlers.click();assert.ok(Number.isNaN(saved.state.party[0][field]));near(saved.calculate()[0].expected,1620);
  saved.state.party[0][field]=boundary;saved.state.party[0].ornamentId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round6 same-element and first-slot support follows actual party context and local duplicate exclusion',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-sets-round6.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[set,expected]of [['312',1782],['317',1684.8]]){
  const data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:rows.filter(x=>x.source.id===set)},app=await tool(undefined,data);app.state.party[0]={characterId:'1001',ornamentId:set,level:80,traceLevels:{}};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,expected);
  if(set==='312'){app.state.party[0].characterId='1003';near(app.calculate()[0].expected,1620);app.state.party[0].characterId='1001';}
  else{app.state.attackerPosition=2;near(app.calculate()[0].expected,1620);app.state.attackerPosition=1;}
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  saved.state.party[1]={characterId:'1002',ornamentId:set,level:80,traceLevels:{}};near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);
  saved.state.party[1].characterId='';saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round6 cone party support persists, checks the wearer path, and excludes unknown duplicate providers locally',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-equipment-round6.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 for(const[id,provider,expected]of [['23061','1510',1800],['23062','1212',1749.6]]){
  const row=rows.find(x=>x.source.id===id&&x.target.owner==='partyAll'),data={characters:[{id:'sample',name:'Sample',element:'Ice',base:{atk:1000}},...catalog.characters],lightCones:catalog.lightCones,structuredModifiers:rows.filter(x=>x.source.id===id)},app=await tool(undefined,data);
  app.state.party[0]={characterId:provider,lightConeId:id,coneRank:1,level:80,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  saved.state.party[1]={characterId:id==='23061'?'1003':'1107',lightConeId:id,coneRank:5,level:80,traceLevels:{}};near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);
  saved.state.party[1].characterId='';saved.state.party[0].characterId='1001';assert.equal(saved.calculate().length,0,'an incompatible equipped path retains the existing input-error behavior');
  saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round6 promoted direct attacks appear without trigger toggles and survive actual App restoration',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture();
 for(const row of require('../../games/hsr/data/calc/attacks-round6.json').overrides){
  const a=p.attacks.find(x=>x.id===row.id),data={characters:p.characters,attacks:[a],structuredModifiers:row.id==='130403'?p.structuredModifiers.filter(x=>x.id==='trace:1304:130403:crit-vulnerability'):[]},app=await tool(undefined,data);app.state.characterId=a.characterId;
  if(row.id==='130403'){app.node('hsrStat-def').value='2400';assert.equal(app.calculate().length,0,'initial-application timing remains outside the accepted scope');app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'aventurine-unnerve-active'},checked:true}});}
  for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2400,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node(a.traceKey==='ultimate'?'hsrUltimateTrace':'hsrSkillTrace').value='10';
  const reference={atk:3000,hp:6000,def:2400}[a.scalingStat],expected=reference*a.multipliers[9]/100*.36,r=app.calculate()[0];assert.ok(r,row.id);assert.ok(Math.abs(r.nonCrit-expected)<1e-6,row.id);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(Math.abs(saved.calculate()[0].nonCrit-expected)<1e-6,row.id+' restore');
 }
});

test('round6 Fugue shares one stack input, automatically checks provider BE, feeds Iron Cavalry and restores',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,rows=all.filter(x=>x.source.id==='1225'&&x.source.traceId==='1225103'||x.source.kind==='relic'&&x.source.id==='119'),data={characters:catalog.characters,relicSets:catalog.relicSets,structuredModifiers:rows},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 assert.ok(Number.isNaN(app.state.party[0].breakEffect),'an unentered provider BE is not assumed to be zero');app.state.characterId='1003';app.state.relicId='119';app.state.relicMode='4pc';app.state.party[0]={characterId:'1225',level:80,eidolon:0,breakEffect:220,traceLevels:{}};
 for(const[k,v]of Object.entries({atk:3000,breakEffect:230}))app.node('hsrStat-'+k).value=String(v);app.node('hsrBreakMode').value='superBreak';app.node('hsrToughnessState').value='broken';app.node('hsrSuperBreakToughness').value='30';app.node('hsrSuperBreakMultiplier').value='100';
 let value;const original=app.window.HsrCalcEngine.calculateSuperBreak;app.window.HsrCalcEngine.calculateSuperBreak=input=>{const r=original(input);value=r.value;return r;};app.calculate();near(value,3767.5533*3*3.3*.8/1.9);
 app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="fugue-break-buff-stacks"/g)||[]).length,1,'one shared stack field');
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'fugue-break-buff-stacks',structuredStrict:'true'},value:'2'}});app.calculate();near(value,3767.5533*3*3.66*.8/1.75);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);let restored;const fn=saved.window.HsrCalcEngine.calculateSuperBreak;saved.window.HsrCalcEngine.calculateSuperBreak=input=>{const r=fn(input);restored=r.value;return r;};saved.calculate();near(restored,value);
 saved.state.party[0].breakEffect=219.99;saved.calculate();near(restored,3767.5533*3*3.42*.8/1.9);
 saved.state.party[0].breakEffect=NaN;saved.calculate();near(restored,3767.5533*3*3.42*.8/1.9);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);
 saved.state.party[0].characterId='';saved.calculate();near(restored,3767.5533*3*3.3*.8/1.9);
});

test('round7 numeric ornament snapshots are separate, local when missing, and persist through App storage',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-sets-round7.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const[set,key,amount,expected]of [['321','ally-target-count',3,1814.4],['328','pre-combat-max-energy',360,2138.4]]){
  const data={characters:[{id:'sample',name:'Sample',element:'Ice',path:'Rogue',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:rows.filter(x=>x.source.id===set)},app=await tool(undefined,data);app.state.ornamentId=set;
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
  app.state.conditionTab='遺物・オーナメント';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1,'one snapshot input');
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:key,structuredStrict:'true'},value:String(amount)}});near(app.calculate()[0].expected,expected);
  app.state.modifierInputs['current-max-energy']=1;near(app.calculate()[0].expected,expected,'the current maximum does not replace the battle-entry snapshot');
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.state.ornamentId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round7 first attack uses entry CD, Companion membership uses a real teammate, and both restore',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),rows=require('../../games/hsr/data/calc/modifiers-sets-round7.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const[set,expected]of [['305',2160],['327',1792.8]]){
  const row=rows.find(x=>x.source.id===set&&x.support.status==='calculable'),data={characters:[{id:'sample',name:'Sample',element:'Ice',path:'Rogue',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:rows.filter(x=>x.source.id===set)},app=await tool(undefined,data);app.state.ornamentId=set;
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);if(set==='327')app.state.party[0]={characterId:'1002',level:80,traceLevels:{}};
  near(app.calculate()[0].expected,1620);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});
  if(set==='305'){near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'pre-combat-crit-damage',structuredStrict:'true'},value:'120'}});}
  near(app.calculate()[0].expected,expected);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);
  if(set==='327'){saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);}else{saved.state.modifierInputs['pre-combat-crit-damage']=119.99;saved.node('hsrStat-critDamage').value='300';near(saved.calculate()[0].expected,2700,'current CD does not satisfy the entry condition');}
 }
});

test('round7 numeric cone input and automatic Izumo lineup reach damage and saved restoration',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),coneRows=require('../../games/hsr/data/calc/modifiers-equipment-round7.json').modifiers,setRows=require('../../games/hsr/data/calc/modifiers-sets-round7.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const data={characters:catalog.characters,lightCones:catalog.lightCones,relicSets:catalog.relicSets,structuredModifiers:coneRows.filter(x=>x.source.id==='21034'),attacks:[{id:'ep-r7',characterId:'1003',name:'EP test',type:'normal',element:'Fire',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]},app=await tool(undefined,data);app.state.characterId='1003';app.state.coneId='21034';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'current-max-energy',structuredStrict:'true'},value:'160'}});near(app.calculate()[0].expected,2138.4);app.state.modifierInputs['pre-combat-max-energy']=999;near(app.calculate()[0].expected,2138.4);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,2138.4);saved.state.coneId='';near(saved.calculate()[0].expected,1620);
 const izumo=await tool(undefined,{characters:[{id:'sample',name:'Sample',element:'Ice',path:'Rogue',base:{atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:setRows.filter(x=>x.source.id==='314')});izumo.state.ornamentId='314';izumo.state.party[0]={characterId:'1002',level:80,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))izumo.node('hsrStat-'+k).value=String(v);near(izumo.calculate()[0].expected,1749.6);izumo.state.party[0].characterId='1001';near(izumo.calculate()[0].expected,1620);
});

test('round7 Jade and Ratio use one shared stack field, persist, and remove included stats once',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../games/hsr/data/calc/modifiers-native-round7.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const[id,key,stacks,expected]of [['1305','ratio-induction-stacks',6,1992.6],['1314','jade-pawned-asset-stacks',50,2457]]){
  const rows=all.filter(x=>x.source.id===id),data={characters:[{id,name:'Native',element:'Imaginary',path:'Rogue',base:{atk:1000}},...catalog.characters.filter(x=>x.id!==id)],structuredModifiers:rows,attacks:[{id:'stack-r7-'+id,characterId:id,name:'Stack test',type:'normal',element:'Imaginary',multipliers:[100],scalingStat:'atk',support:{status:'calculable',verified:true}}]},app=await tool(undefined,data);app.state.characterId=id;for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
  app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1);
  app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:key},value:String(stacks)}});near(app.calculate()[0].expected,expected);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);for(const row of rows)saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.finalStatsInclusion.inputKey},checked:true}});near(saved.calculate()[0].expected,1620);
 }
});

test('round7 promoted main attacks need no availability checkbox and Acheron automatically follows its actual party',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 for(const row of require('../../games/hsr/data/calc/attacks-round7.json').overrides){
  const a=p.attacks.find(x=>x.id===row.id),recs=p.structuredModifiers.filter(x=>x.id==='traceNode:1308:1308102:nihility-independent-multiplier'),data={characters:p.characters,attacks:[a],structuredModifiers:a.characterId==='1308'?recs:[]},app=await tool(undefined,data);app.state.characterId=a.characterId;if(a.variant)app.node('hsrEnhancementState').value=a.variant;
  for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2400,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node(a.traceKey==='ultimate'?'hsrUltimateTrace':'hsrSkillTrace').value='10';const expected=3000*a.multipliers[9]/100*.36*(a.hitCount||1);near(app.calculate()[0].nonCrit,expected);
  if(a.characterId==='1308'){app.state.party[0]={characterId:'1004',level:80,traceLevels:{}};near(app.calculate()[0].nonCrit,expected*1.15);app.state.party[1]={characterId:'1108',level:80,traceLevels:{}};near(app.calculate()[0].nonCrit,expected*1.6);app.state.party[0].characterId='';near(app.calculate()[0].nonCrit,expected*1.15);}
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].nonCrit,expected*(a.characterId==='1308'?1.15:1));
 }
});

test('round7 Bone Collection follows actual HP support, preserves restoration and leaves ATK attacks running with unknown HP',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),all=require('../../scripts/lib/hsrDataFiles.cjs').loadHsrDataFiles(root).modifiers,rows=all.filter(x=>x.source.kind==='ornament'&&x.source.id==='319'||x.id==='traceNode:1211:1211101:overheal-hp'),data={characters:[{id:'sample',name:'Sample',path:'Rogue',element:'Ice',base:{hp:1000,atk:1000}},...catalog.characters],relicSets:catalog.relicSets,structuredModifiers:rows},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 app.state.ornamentId='319';app.state.party[0]={characterId:'1211',level:80,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,hp:4990,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);
 const support=rows.find(x=>x.source.id==='1211');app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:support.activation.inputKey},checked:true}});near(app.calculate()[0].expected,1771.2);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,1771.2);saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);saved.node('hsrStat-hp').value='';near(saved.calculate()[0].expected,1620);assert.match(saved.node('hsrConditionTitle').textContent,/条件未確定/);
});

test('round7 Fallen debuff keeps a single provider exact and locally excludes an ambiguous second cone wearer',async()=>{
 const catalog=JSON.parse(read('games/hsr/data/catalog.json')),row=require('../../games/hsr/data/calc/modifiers-equipment-round7.json').modifiers.find(x=>x.source.id==='21015'),data={characters:[{id:'sample',name:'Sample',path:'Rogue',element:'Ice',base:{atk:1000}},...catalog.characters],lightCones:catalog.lightCones,structuredModifiers:[row]},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 app.state.party[0]={characterId:'1004',lightConeId:'21015',coneRank:1,level:80,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:row.activation.inputKey},checked:true}});near(app.calculate()[0].expected,1620/0.94);
 app.state.party[1]={characterId:'1108',lightConeId:'21015',coneRank:5,level:80,traceLevels:{}};near(app.calculate()[0].expected,1620);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);app.state.party[1].characterId='';near(app.calculate()[0].expected,1620/0.94);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,1620/0.94);saved.state.party[0].characterId='';near(saved.calculate()[0].expected,1620);
});

test('round8 Jingliu eight main attack variants: all accepted levels, native states and actual App persistence',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const ids=['121201','121202','121209','121203','1121201','1121202','1121209','1121203'];
 const data={characters:p.characters,attacks:p.attacks.filter(a=>ids.includes(a.id)),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1212')},app=await tool(undefined,data);
 app.state.characterId='1212';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2400,critRate:40,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-toggle="jingliu-hp-transmigration-active"/g)||[]).length,1);
 app.state.modifierInputs['jingliu-atk-transmigration-active']=true;app.state.modifierInputs['jingliu-hp-transmigration-active']=true;app.state.modifierInputs['jingliu-moonlight-stacks']=5;
 for(let level=1;level<=10;level++){
  app.node('hsrNormalTrace').value=String(Math.min(level,6));app.node('hsrSkillTrace').value=String(level);app.node('hsrUltimateTrace').value=String(level);app.node('hsrTalentTrace').value='10';
  const out=app.calculate();assert.equal(out.length,8);
  for(const [i,a]of data.attacks.entries()){
   const transformed=['121209','121203','1121209','1121203'].includes(a.id),hp=a.scalingStat==='hp',ult=a.type==='ultimate',lv=a.traceKey==='normal'?Math.min(level,6):level;
   const nc=(hp?6000:3000)*a.multipliers[lv-1]/100*.36*(transformed&&ult?1.2:1),cr=transformed?.9:.4,cd=hp&&transformed?3.2:1;
   near(out[i].nonCrit,nc);near(out[i].crit,nc*(1+cd));near(out[i].expected,nc*(1+cr*cd));
  }
 }
 app.state.modifierInputs['jingliu-hp-transmigration-active']=false;let results=app.calculate(),hpUltIndex=data.attacks.findIndex(a=>a.id==='1121203');near(results[hpUltIndex].expected,6000*1.8*.36*1.4);
 app.state.modifierInputs['jingliu-hp-transmigration-active']=true;app.state.modifierInputs['jingliu-hp-next-attack-defense-ignore-in-final']=false;
 app.state.modifierInputs['jingliu-hp-syzygy-cap-next-attack-defense-ignore-active']=true;results=app.calculate();near(results[hpUltIndex].nonCrit,6000*1.8*1.2*(100/175)*.8*.9);
 app.state.modifierInputs['jingliu-hp-syzygy-cap-next-attack-defense-ignore-active']=false;
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[hpUltIndex].expected,18102.528);
 saved.state.modifierInputs['jingliu-hp-transmigration-crit-rate-in-final']=true;saved.state.modifierInputs['jingliu-hp-moonlight-crit-damage-in-final']=true;near(saved.calculate()[hpUltIndex].expected,4665.6*1.4);
});

test('round8 Acheron thirteen Ultimate components preserve automatic native modifiers, party scaling and restoration',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b),a=p.attacks.find(a=>a.id==='130803');
 const data={characters:p.characters,attacks:[a],structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1308')},app=await tool(undefined,data);app.state.characterId='1308';app.state.modifierInputs['acheron-initial-knots']=9;
 for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2400,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 for(let level=1;level<=10;level++){
  app.node('hsrUltimateTrace').value=String(level);app.node('hsrTalentTrace').value=String(level);
  const result=app.calculate()[0];assert.ok(result,result?.reason);assert.equal(result.supported,undefined);
  const coeff=a.multipliers[level-1]+150,resReduction=10+([0,1,2,3,4,5,6.25,7.5,8.75,10][level-1]);
  const expected=3000*coeff/100*1.9*.5*(1-(20-resReduction)/100)*.9;
  near(result.nonCrit,expected);near(result.crit,expected*2);near(result.expected,expected*1.5);assert.equal(Object.keys(result.components).length,13);
 }
 app.state.party[0]={characterId:'1004',level:80,traceLevels:{}};app.state.party[1]={characterId:'1108',level:80,traceLevels:{}};near(app.calculate()[0].expected,32134.32);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,32134.32);saved.state.party[1].characterId='';near(saved.calculate()[0].expected,20083.95*1.15);
});

test('round8 The Herta complete main actions: final-hit Interpretation, roster buffs, Answers and restoration through App',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const data={characters:p.characters,attacks:p.attacks.filter(a=>a.characterId==='1401'),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1401')},app=await tool(undefined,data);app.state.characterId='1401';app.state.modifierInputs['herta-final-interpretation']=42;app.state.modifierInputs['herta-enhanced-interpretation-at-cast']=42;
 for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2400,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const enhancedIndex=data.attacks.findIndex(a=>a.id==='140109'),ultimateIndex=data.attacks.findIndex(a=>a.id==='140103'),talent=[4,4.4,4.8,5.2,5.6,6,6.5,7,7.5,8];
 for(let level=1;level<=10;level++){
  app.node('hsrNormalTrace').value=String(Math.min(level,6));app.node('hsrSkillTrace').value=String(level);app.node('hsrUltimateTrace').value=String(level);app.node('hsrTalentTrace').value=String(level);
  const out=app.calculate();assert.equal(out.length,4);
  const enhanced=out[enhancedIndex],d=data.attacks[enhancedIndex].damageComponents;
  const nc=3000*(3*d[0].multipliers[level-1]+d[3].multipliers[level-1]+42*talent[level-1])/100*1.5*.36;
  near(enhanced.nonCrit,nc);near(enhanced.expected,nc*1.5);assert.equal(Object.keys(enhanced.components).length,4);
  const ultimate=out[ultimateIndex];near(ultimate.nonCrit,3000*data.attacks[ultimateIndex].multipliers[level-1]/100*.36);
 }
 app.state.party[0]={characterId:'1003',level:80,traceLevels:{}};
 // All four components get +50% Ice DMG, only the final hit receives two 42*8 additions.
 let out=app.calculate(),enhanced=out[enhancedIndex];near(enhanced.nonCrit,3000*(240+40+672)/100*1.5*.36);near(enhanced.expected,enhanced.nonCrit*1.9);
 const answerRow=data.structuredModifiers.find(m=>m.id.includes('answers-ultimate'));app.state.modifierInputs[answerRow.activation.inputKey]=99;out=app.calculate();near(out[ultimateIndex].nonCrit,3000*2.99*.36);near(out[ultimateIndex].expected,3000*2.99*.36*1.9);
 const buff=data.structuredModifiers.find(m=>m.id==='trace:1401:140103:post-ultimate-atk');app.state.modifierInputs[buff.activation.inputKey]=true;const baseAtk=p.characters.find(c=>c.id==='1401').base.atk;near(app.calculate()[ultimateIndex].expected,(3000+baseAtk*.8)*2.99*.36*1.9);app.state.modifierInputs[buff.finalStatsInclusion.inputKey]=true;near(app.calculate()[ultimateIndex].expected,3000*2.99*.36*1.9);app.state.modifierInputs[buff.activation.inputKey]=false;app.state.modifierInputs[buff.finalStatsInclusion.inputKey]=false;
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[enhancedIndex].expected,enhanced.nonCrit*1.9);
 saved.state.party[0].characterId='';near(saved.calculate()[enhancedIndex].expected,3000*(240+40+336)/100*1.5*.36*1.5);
});


test('round8 Herta enhanced skill retains ordinary skill-only equipment modifiers on each child',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),a=p.attacks.find(a=>a.id==='140109');
 const rows=p.structuredModifiers.filter(m=>m.source.id==='1401'||m.source.kind==='relic'&&m.source.id==='122');
 const app=await tool(undefined,{characters:p.characters,relicSets:p.relicSets,attacks:[a],structuredModifiers:rows});app.state.characterId='1401';app.state.modifierInputs['herta-final-interpretation']=42;app.state.modifierInputs['herta-enhanced-interpretation-at-cast']=42;app.state.relicId='122';app.state.relicMode='4pc';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const next=rows.find(m=>m.id==='relic:122:4pc:next-skill-damage');app.state.modifierInputs[next.activation.inputKey]=true;
 const result=app.calculate()[0];assert.ok(Math.abs(result.nonCrit-3000*6.16*.36*1.95)<1e-6);
 for(const c of Object.values(result.components)){assert.equal(c.attack.hitCountLabel,'この成分1ヒット');assert.ok(c.applied.some(m=>m.id===next.id));}
});

test('round8 cone support reaches actual recipient damage, enforces wearer path and survives provider changes',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),rows=require('../../games/hsr/data/calc/modifiers-equipment-round8.json').modifiers;
 for(const [id,provider]of [['23016','1112'],['23017','1217']]){
  const row=rows.find(m=>m.source.id===id&&['enemySingle','activeAlly'].includes(m.target.owner));
  const a={id:'r8-cone-normal',characterId:'1003',name:'Support comparison',type:'normal',element:'Fire',traceKey:'normal',scalingStat:'atk',multipliers:Array(6).fill(100),support:{status:'calculable',verified:true}};
  const data={characters:p.characters,lightCones:p.lightCones,attacks:[a],structuredModifiers:[row]},app=await tool(undefined,data);app.state.characterId='1003';app.state.party[0]={characterId:provider,lightConeId:id,coneRank:1,level:80,traceLevels:{}};
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  app.state.modifierInputs[row.activation.inputKey]=row.activation.maximum;
  const baseAtk=p.characters.find(c=>c.id==='1003').base.atk,expected=id==='23016'?1080*(1+.5*1.24):(3000+baseAtk*.12)*.36*1.5;
  assert.ok(Math.abs(app.calculate()[0].expected-expected)<1e-6);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(Math.abs(saved.calculate()[0].expected-expected)<1e-6);
  saved.state.party[0].characterId='1001';assert.equal(saved.calculate().length,0,'incompatible light cone path is rejected');
  saved.state.party[0].characterId='';assert.ok(Math.abs(saved.calculate()[0].expected-1620)<1e-6);
 }
});

test('round8 Aventurine main composition keeps DEF, final CR and pre-existing Unnerve separate through App',async()=>{
 const {loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const data={characters:p.characters,attacks:p.attacks.filter(a=>a.characterId==='1304'),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1304')},app=await tool(undefined,data);app.state.characterId='1304';
 for(const[k,v]of Object.entries({atk:3000,hp:6000,def:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const ultIndex=data.attacks.findIndex(a=>a.id==='130403');let off=app.calculate();assert.equal(off.length,2,'only the U with unspecified prior Unnerve is excluded before engine calculation');assert.match(app.node('hsrResults').innerHTML,/aventurine-unnerve-active|動揺/);
 app.state.modifierInputs['aventurine-unnerve-active']=true;
 for(let level=1;level<=10;level++){
  app.node('hsrNormalTrace').value=String(Math.min(level,6));app.node('hsrUltimateTrace').value=String(level);app.node('hsrTalentTrace').value=String(level);
  const out=app.calculate(),vul=[9,9.6,10.2,10.8,11.4,12,12.75,13.5,14.25,15][level-1];
  data.attacks.forEach((a,i)=>{const lv=a.traceKey==='normal'?Math.min(level,6):level,nc=3000*a.multipliers[lv-1]/100*(a.hitCount||1)*.36;near(out[i].nonCrit,nc);near(out[i].expected,nc*(1+.5*(1+vul/100)));});
 }
 app.node('hsrStat-def').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[ultIndex].expected,4592.7);saved.state.modifierInputs['aventurine-unnerve-active']=false;assert.equal(saved.calculate().length,2);
});

test('round9 Acheron initial knots are required, vary 10-13 components and persist without a maximum fallback',async()=>{
 const{loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),a=p.attacks.find(a=>a.id==='130803'),data={characters:p.characters,attacks:[a],structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1308')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);app.state.characterId='1308';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);assert.equal(app.calculate().length,0);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="acheron-initial-knots"/);
 for(const n of [0,1,2,3,4,6,7,8,9]){app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'acheron-initial-knots',structuredStrict:'true'},value:String(n)}});let left=n,sum=342;for(let i=0;i<3;i++){const r=Math.min(3,left);left-=r;if(r)sum+=15*(1+r);}const out=app.calculate()[0];near(out.nonCrit,3000*sum/100*1.9*.5*.9);near(out.expected,out.nonCrit*1.5);assert.equal(Object.keys(out.components).length,10+Math.ceil(n/3));}
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,20083.95);saved.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'acheron-initial-knots',structuredStrict:'true'},value:''}});assert.equal(saved.calculate().length,0);
});

test('round9 Herta distinct state inputs are shared once, final-only, locally missing and restorable',async()=>{
 const{loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),data={characters:p.characters,attacks:p.attacks.filter(a=>a.characterId==='1401'),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1401')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);app.state.characterId='1401';app.state.party[0]={characterId:'1003',level:80,traceLevels:{}};for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 assert.equal(app.calculate().length,3,'only enhanced Skill needs the final-hit state');app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="herta-final-interpretation"/g)||[]).length,1);
 for(const final of [0,1,20,41,42])for(const cast of [0,41,42]){app.state.modifierInputs['herta-final-interpretation']=final;app.state.modifierInputs['herta-enhanced-interpretation-at-cast']=cast;const out=app.calculate().find(r=>r.breakdown?.damageFormula==='componentSequence');assert.ok(out);const nc=3000*(2.8+final*.16)*.36*(cast===42?1.5:1);near(out.nonCrit,nc);near(out.expected,nc*1.9);near(out.components.main.nonCrit,3000*.8*.36*(cast===42?1.5:1));}
 app.state.modifierInputs['herta-final-interpretation']=20;delete app.state.modifierInputs['herta-enhanced-interpretation-at-cast'];let out=app.calculate().find(r=>r.breakdown?.damageFormula==='componentSequence');near(out.nonCrit,6480);assert.match(app.node('hsrConditionTitle').textContent,/条件未確定/);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate().find(r=>r.breakdown?.damageFormula==='componentSequence').nonCrit,6480);saved.state.modifierInputs['herta-final-interpretation']=43;assert.equal(saved.calculate().length,3);
});

test('round9 Argenti full major composition uses completed Glory CR and independent HP boundaries',async()=>{
 const{loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),data={characters:p.characters,attacks:p.attacks.filter(a=>a.characterId==='1302'),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1302')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);app.state.characterId='1302';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 for(let level=1;level<=10;level++)for(const hp of [50,50.01]){app.node('hsrNormalTrace').value=String(Math.min(level,6));app.node('hsrSkillTrace').value=String(level);app.node('hsrUltimateTrace').value=String(level);app.node('hsrEnemyHpPercent').value=String(hp);const out=app.calculate();assert.equal(out.length,4);data.attacks.forEach((a,i)=>{const lv=a.traceKey==='normal'?Math.min(level,6):level,nc=3000*a.multipliers[lv-1]/100*.36*(hp<=50?1.15:1);near(out[i].nonCrit,nc);near(out[i].expected,nc*1.5);});}
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate().find(r=>r.attack.name.includes('180EP')).expected,13770);
});

test('round9 Yanqing complete core actions and frozen/weakness components keep native CR/CD and inclusion separate',async()=>{
 const{loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),ids=['120901','120902','120903','120904','1209041','1209101'],data={characters:p.characters,attacks:p.attacks.filter(a=>ids.includes(a.id)),structuredModifiers:p.structuredModifiers.filter(m=>m.source.id==='1209')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);app.state.characterId='1209';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);Object.assign(app.state.modifierInputs,{'yanqing-soulsteel-active':true,'yanqing-followup-triggered':true,'enemy-frozen':true,'enemy-ice-weakness':true});
 const cr=[15,15.5,16,16.5,17,17.5,18.12,18.75,19.38,20],cd=[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30],ultCD=[30,32,34,36,38,40,42.5,45,47.5,50];
 for(let level=1;level<=10;level++){app.node('hsrNormalTrace').value=String(Math.min(level,6));app.node('hsrSkillTrace').value=String(level);app.node('hsrUltimateTrace').value=String(level);app.node('hsrTalentTrace').value=String(level);const out=app.calculate();assert.equal(out.length,6);data.attacks.forEach((a,i)=>{const lv=a.traceKey==='normal'?Math.min(level,6):a.id==='1209101'?1:level,nc=3000*a.multipliers[lv-1]/100*.36,isUlt=a.id==='120903',rate=Math.min(100,50+cr[level-1]+(isUlt?60:0))/100,damage=(100+cd[level-1]+(isUlt?ultCD[level-1]:0))/100;near(out[i].nonCrit,nc);near(out[i].expected,a.canCrit===false?nc:nc*(1+rate*damage));});}
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate().find(r=>r.attack.name==='快雨に戯れる燕').expected,10584);
 for(const r of data.structuredModifiers.filter(m=>m.finalStatsInclusion))saved.state.modifierInputs[r.finalStatsInclusion.inputKey]=true;saved.node('hsrStat-critRate').value='100';saved.node('hsrStat-critDamage').value='180';near(saved.calculate().find(r=>r.attack.name==='快雨に戯れる燕').expected,10584);
});

test('round9 priority cone thresholds react to real supports and actual App restoration',async()=>{
 const{loadProductionFixture}=require('./helpers/hsrDirectVerification.cjs'),{data:p}=await loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,a+' != '+b);
 const sample={id:'sample',name:'Sample',path:'Rogue',element:'Fire',base:{atk:1000,speed:100,hp:1000}},a={id:'r9-threshold',characterId:'sample',name:'Threshold test',type:'normal',traceKey:'normal',element:'Fire',scalingStat:'atk',multipliers:[100],support:{status:'calculable',verified:true}};
 const records=p.structuredModifiers.filter(m=>m.id==='lightCone:23027:break-effect-speed'||m.id==='ornament:311:2pc:speed-damage'||m.source.kind==='eidolon'&&m.source.id==='1222');
 const app=await tool(undefined,{characters:[sample,...p.characters],lightCones:p.lightCones,relicSets:p.relicSets,attacks:[a],structuredModifiers:records});app.state.coneId='23027';app.state.ornamentId='311';app.state.party[0]={characterId:'1222',eidolon:2,level:80,traceLevels:{}};
 for(const[k,v]of Object.entries({atk:3000,speed:148,breakEffect:110,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].nonCrit,1209.6);app.state.modifierInputs['lingsha-e2-ultimate-break-effect']=true;near(app.calculate()[0].nonCrit,1274.4);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,{characters:[sample,...p.characters],lightCones:p.lightCones,relicSets:p.relicSets,attacks:[a],structuredModifiers:records});near(saved.calculate()[0].nonCrit,1274.4);saved.state.party[0].characterId='';near(saved.calculate()[0].nonCrit,1209.6);
 const cdSample={...sample,path:'Mage'},fa={...a,type:'followUp'},mods=p.structuredModifiers.filter(m=>m.id==='lightCone:23028:crit-damage-followup'||m.id==='trace:1309:130904:party-crit-damage');const cdApp=await tool(undefined,{characters:[cdSample,...p.characters],lightCones:p.lightCones,attacks:[fa],structuredModifiers:mods});cdApp.state.coneId='23028';cdApp.state.party[0]={characterId:'1309',level:80,eidolon:0,traceLevels:{talent:10}};delete cdApp.state.modifierInputs['robin-talent-crit-active'];
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:120}))cdApp.node('hsrStat-'+k).value=String(v);near(cdApp.calculate()[0].nonCrit,1209.6);near(cdApp.calculate()[0].expected,2056.32);
 cdApp.state.modifierInputs['robin-talent-crit-in-final-stats']=true;cdApp.node('hsrStat-critDamage').value='140';near(cdApp.calculate()[0].expected,2056.32);cdApp.state.party[0].characterId='';cdApp.node('hsrStat-critDamage').value='120';near(cdApp.calculate()[0].nonCrit,1080);
});


test('round10 mocked UID fetch reconstructs real Misha inputs and reaches damage, local missing-data handling and restoration', async () => {
    const { loadProductionFixture } = require('./helpers/hsrDirectVerification.cjs');
    const { data } = await loadProductionFixture();
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
    const raw = {
        _tetinetProvider: 'enka',
        detailInfo: { uid: '800000001', nickname: 'Fixture', avatarDetailList: [{
            avatarId: 1312, level: 80, rank: 0,
            skillTreeList: [
                { pointId: 1312001, level: 6 }, { pointId: 1312002, level: 10 },
                { pointId: 1312003, level: 10 }, { pointId: 1312004, level: 10 }
            ],
            relicList: [{ _flat: { props: [
                { type: 'AttackDelta', value: 2400.24 },
                { type: 'CriticalChance', value: .45 },
                { type: 'CriticalDamage', value: .5 },
                { type: 'SpeedDelta', value: 4.125 }
            ] } }]
        }] }
    };
    for (const proxyAvailable of [true, false]) {
        const calls = [], apiWindow = {};
        vm.runInNewContext(read('games/js/hsrProfileApi.js'), {
            window: apiWindow,
            fetch: async url => {
                calls.push(url);
                return url.startsWith('/games/') && !proxyAvailable
                    ? { status: 404, ok: false }
                    : { status: 200, ok: true, json: async () => structuredClone(raw) };
            }
        });
        vm.runInNewContext(read('games/js/hsrProfileMapper.js'), { window: apiWindow });
        const response = await apiWindow.HsrProfileApi.fetchHsrProfile('800000001');
        assert.equal(calls[0], '/games/api/hsr-profile?uid=800000001');
        assert.equal(calls.length, proxyAvailable ? 1 : 2);
        if (!proxyAvailable) assert.equal(calls[1], 'https://enka.network/api/hsr/uid/800000001');
        const profile = apiWindow.HsrProfileMapper.mapProfileResponse(response, data);
        const mapped = profile.characters[0];
        near(mapped.stats.atk, 3000); near(mapped.stats.speed, 100.125);
        near(mapped.stats.critRate, 50); near(mapped.stats.critDamage, 100);
        const app = await tool(undefined, data);
        app.window.HsrTool.applyProfileCharacter(mapped);
        assert.equal(app.state.characterId, '1312');
        assert.equal(app.state.traceLevels.normal, 6);
        assert.equal(app.state.traceLevels.ultimate, 10);
        near(app.calculate().find(r => r.attack.name.includes('退いて')).expected, 1620);
        assert.equal(app.node('hsrStat-hpPercent').value, '', 'UID does not invent current battle HP');
        app.node('hsrStat-atk').handlers.input();
        const restored = await tool(app.storage, data);
        near(restored.calculate().find(r => r.attack.name.includes('退いて')).expected, 1620);
        near(restored.state.stats.speed, 100.125);
        const incompleteRaw = structuredClone(response);
        incompleteRaw.detailInfo.avatarDetailList[0].level = 70;
        const incomplete = apiWindow.HsrProfileMapper.mapProfileResponse(incompleteRaw, data).characters[0];
        app.window.HsrTool.applyProfileCharacter(incomplete);
        assert.equal(app.node('hsrStat-atk').value, '', 'unavailable Lv70 base cannot retain the previous ATK');
        assert.equal(app.calculate().length, 0);
    }
});


test('round10 Sushang extra checks keep unknown local, infer broken-target guarantees and restore without double stats', async () => {
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const rows=p.attacks.filter(a=>a.characterId==='1206'&&!a.hidden),data={...p,attacks:rows},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1206';for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 app.state.modifierInputs['sushang-ultimate-buff-active']=true;app.state.modifierInputs['sushang-sword-stance-stacks']=10;
 const find=(a,id)=>a.calculate().find(r=>r.attack.name===rows.find(x=>x.id===id).name);
 assert.equal(find(app,'1206031'),undefined);assert.ok(find(app,'120602'));
 const curves=[25,27.5,30,32.5,35,37.5,40.625,43.75,46.875,50],atk=[18,19.2,20.4,21.6,22.8,24,25.5,27,28.5,30];
 for(let lv=1;lv<=10;lv++){
  app.node('hsrSkillTrace').value=String(lv);app.node('hsrUltimateTrace').value=String(lv);
  for(const n of [0,1,2]){app.state.modifierInputs['sushang-post-ultimate-sword-stance-hits']=n;const r=find(app,'1206031'),nc=(3000+564.48*atk[lv-1]/100)*curves[lv-1]/100*n*.36*1.25;near(r.nonCrit,nc);near(r.crit,nc*2);near(r.expected,nc*1.5);}
 }
 delete app.state.modifierInputs['sushang-post-ultimate-sword-stance-hits'];app.node('hsrToughnessState').value='broken';near(find(app,'1206031').nonCrit,(3000+564.48*.3)*.4*1.25);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.doesNotMatch(app.node('hsrConditionList').innerHTML,/data-structured-input="sushang-post-ultimate-sword-stance-hits"/);assert.match(app.node('hsrConditionList').innerHTML,/追加剣勢2回を自動採用/);
 app.node('hsrToughnessState').value='active';assert.equal(find(app,'1206031'),undefined);
 for(const v of [-1,3,1.5,NaN]){app.state.modifierInputs['sushang-post-ultimate-sword-stance-hits']=v;assert.equal(find(app,'1206031'),undefined);assert.ok(find(app,'120601'));}
 app.state.modifierInputs['sushang-post-ultimate-sword-stance-hits']=1;app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,'1206031').nonCrit,(3000+564.48*.3)*.5*.36*1.25);
 saved.state.modifierInputs['trace:1206:120603:atk-in-final']=true;near(find(saved,'1206031').nonCrit,3000*.5*.36*1.25);
 saved.state.modifierInputs['sushang-ultimate-buff-active']=false;assert.equal(find(saved,'1206031'),undefined);assert.ok(find(saved,'120601'));
});

test('round10 Lingsha E6 preview uses Fuyuan state, rank gating and final RES exclusion',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 app.window.HsrTool.applyProfileCharacter({id:'1222',level:80,eidolon:6,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const find=a=>a.calculate().find(r=>r.attack.name.includes('追加4ヒット')),out=find(app);assert.ok(out,app.node('hsrResults').innerHTML);near(out.nonCrit,2700);near(out.crit,5400);near(out.expected,4050);assert.equal(out.attack.hitCount,4);
 assert.equal(app.state.modifierInputs['lingsha-fuyuan-on-field'],undefined);app.state.modifierInputs['lingsha-fuyuan-on-field']=false;near(find(app).expected,4050);
 const inclusion=data.structuredModifiers.find(m=>m.id==='eidolon:1222:6:fuyuan-all-res-down').finalStatsInclusion.inputKey;app.state.modifierInputs[inclusion]=true;near(find(app).nonCrit,2160);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).nonCrit,2160);saved.node('hsrEidolon').value='5';assert.equal(find(saved),undefined);app.node('hsrEnemyCount').value='2';assert.equal(find(app),undefined);
});


test('round10 Misha all E0 levels and every selected Ultimate count retain prefrozen assumptions, inclusion and storage',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),rows=p.attacks.filter(a=>a.characterId==='1312'),data={...p,attacks:rows},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1312';for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.state.modifierInputs['misha-frozen-crit-active']=true;
 const find=(a,id)=>a.calculate().find(r=>r.attack.name===rows.find(x=>x.id===id).name),u=[36,38.4,40.8,43.2,45.6,48,51,54,57,60],skill=[100,110,120,130,140,150,162.5,175,187.5,200];
 for(let lv=1;lv<=10;lv++){app.node('hsrNormalTrace').value=String(Math.min(lv,6));app.node('hsrSkillTrace').value=String(lv);app.node('hsrUltimateTrace').value=String(lv);near(find(app,'131202').expected,3000*skill[lv-1]/100*.36*1.65);for(let hits=3;hits<=10;hits++){app.state.modifierInputs['misha-ultimate-hits']=hits;const r=find(app,'131203'),nc=3000*u[lv-1]/100*hits*.36;near(r.nonCrit,nc);near(r.crit,nc*2.3);near(r.expected,nc*1.65);}}
 app.node('hsrStat-critDamage').value='130';app.state.modifierInputs['traceNode:1312:1312103:frozen-critical-damage-in-final']=true;near(find(app,'131203').expected,10692);app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(find(restored,'131203').expected,10692);
 for(const value of [2,11,3.5,NaN]){restored.state.modifierInputs['misha-ultimate-hits']=value;assert.equal(find(restored,'131203'),undefined);assert.ok(find(restored,'131201'));}
});

test('round10 Hanya prior Judgment state reaches a teammate and saved input without applying to an absent provider',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,p),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1003';for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.state.party[0]={characterId:'1215',eidolon:0,level:80,traceLevels:{talent:10}};
 const normal=a=>a.calculate().find(r=>r.attack.name==='武装調律');near(normal(app).expected,1620);
 app.state.modifierInputs['hanya-judgment-active']=true;near(normal(app).expected,2106);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,p);near(normal(saved).expected,2106);
 const inclusion=p.structuredModifiers.find(m=>m.id==='trace:1215:121504:party-damage').finalStatsInclusion.inputKey;saved.state.modifierInputs[inclusion]=true;near(normal(saved).expected,1620);saved.state.modifierInputs[inclusion]=false;saved.state.party[0].characterId='';near(normal(saved).expected,1620);
});


test('round10 Sushang complete Skill snapshot combines only its own three damage components at all Skill and independent Ultimate levels',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),a=data.attacks.find(a=>a.id==='1206022'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1206';for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrToughnessState').value='broken';app.state.modifierInputs['sushang-sword-stance-stacks']=10;
 const find=target=>target.calculate().find(r=>r.attack.name===a.name),skill=[105,115.5,126,136.5,147,157.5,170.63,183.75,196.88,210],sword=[50,55,60,65,70,75,81.25,87.5,93.75,100],atk=[18,19.2,20.4,21.6,22.8,24,25.5,27,28.5,30];
 for(let lv=1;lv<=10;lv++)for(const ult of [1,5,10]){app.node('hsrSkillTrace').value=String(lv);app.node('hsrUltimateTrace').value=String(ult);const r=find(app),ref=3000+564.48*atk[ult-1]/100,nc=ref*(skill[lv-1]+sword[lv-1]*2*1.25)/100*.4;assert.ok(r,app.node('hsrResults').innerHTML.split('<article').filter(s=>s.includes(a.name)).map(s=>s.replace(/<[^>]*>/g,'')).join('').slice(0,2000));near(r.nonCrit,nc);near(r.crit,nc*2);near(r.expected,nc*1.5);near(r.components.skill.nonCrit,ref*skill[lv-1]/100*.4);near(r.components.primary.nonCrit,ref*sword[lv-1]/100*1.25*.4);near(r.components.extra.nonCrit,r.components.primary.nonCrit);}
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,find(app).expected);
 delete saved.state.modifierInputs['sushang-sword-stance-stacks'];assert.equal(find(saved),undefined,'no substitution of maximum stacks');assert.ok(saved.calculate().some(r=>r.attack.name==='雲騎剣経・月虹'));
 app.node('hsrToughnessState').value='active';assert.equal(find(app),undefined,'unbroken random proc distribution is outside this full-action scope');
});


test('round11 Hanya stable main attacks use all levels, prior native buffs and final-input exclusion',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data={...p,attacks:p.attacks.filter(a=>a.characterId==='1215')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1215';for(const[k,v]of Object.entries({atk:3000,speed:150,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const rows=data.attacks,find=(a,id)=>a.calculate().find(r=>r.attack.name===rows.find(a=>a.id===id).name),skill=[120,132,144,156,168,180,195,210,225,240],talent=[15,16.5,18,19.5,21,22.5,24.37,26.25,28.12,30];
 for(let lv=1;lv<=10;lv++)for(const t of [1,5,10]){app.node('hsrSkillTrace').value=String(lv);app.node('hsrTalentTrace').value=String(t);const r=find(app,'121502'),nc=(3000+564.48*.1)*skill[lv-1]/100*(1+talent[t-1]/100)*.36;assert.ok(r,app.node('hsrResults').innerHTML);near(r.nonCrit,nc);near(r.crit,nc*2);near(r.expected,nc*1.5);}
 for(let lv=1;lv<=6;lv++){app.node('hsrNormalTrace').value=String(lv);near(find(app,'121501').nonCrit,3000*(.4+.1*lv)*.36);}
 assert.equal(app.state.modifierInputs['hanya-judgment-active'],undefined,'preview leaves global recipient state unchanged');
 app.state.modifierInputs['hanya-recorded-atk-in-final']=true;near(find(app,'121502').nonCrit,3000*2.4*1.3*.36);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,'121502').expected,3000*2.4*1.3*.36*1.5);
 saved.node('hsrTalentTrace').value='';assert.equal(find(saved,'121502'),undefined);assert.ok(find(saved,'121501'));
});

test('round11 Hanya Ultimate ATK and provider SPD reach a real recipient and Glamoth without feedback or duplicate input',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1003';app.state.ornamentId='311';app.state.party[0]={characterId:'1215',level:80,eidolon:0,speed:120,traceLevels:{ultimate:10,talent:10}};
 for(const[k,v]of Object.entries({atk:3000,speed:136,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);const find=a=>a.calculate().find(r=>r.attack.name==='武装調律');near(find(app).nonCrit,1209.6);
 app.state.modifierInputs['hanya-ultimate-active']=true;near(find(app).nonCrit,(3000+756.756*.6)*1.18*.36);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,find(app).expected);
 saved.state.party[0].speed=NaN;near(find(saved).nonCrit,(3000+756.756*.6)*1.12*.36,'missing provider SPD removes only that support');saved.state.party[0].speed=120;
 saved.node('hsrStat-speed').value='160';saved.state.modifierInputs['hanya-ultimate-speed-in-final-stats']=true;near(find(saved).nonCrit,(3000+756.756*.6)*1.18*.36);
 saved.state.modifierInputs['hanya-ultimate-atk-in-final-stats']=true;near(find(saved).nonCrit,3000*1.18*.36);saved.state.party[0].characterId='';near(find(saved).nonCrit,3000*1.18*.36);
});

test('round11 Lingsha E0-E6 native ranges and E6 full event reach App, exclusion and storage',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),curve=[37.5,41.25,45,48.75,52.5,56.25,60.94,65.62,70.31,75,78.75,82.5];app.state.characterId='1222';
 for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);const mainName=data.attacks.find(a=>a.id==='122204').name,totalName=data.attacks.find(a=>a.id==='1222062').name,find=(a,n)=>a.calculate().find(r=>r.attack.name===n);
 for(let e=0;e<=6;e++){app.node('hsrEidolon').value=String(e);for(let lv=1;lv<=(e>=3?12:10);lv++){app.node('hsrTalentTrace').value=String(lv);app.node('hsrToughnessState').value='active';near(find(app,mainName).nonCrit,3000*curve[lv-1]/100*2*.5*(e===6?1:.8)*.9);app.node('hsrToughnessState').value='broken';const def=e>=1?100/180:.5;near(find(app,mainName).nonCrit,3000*curve[lv-1]/100*2*def*(e===6?1:.8));}}
 app.node('hsrEidolon').value='6';app.node('hsrTalentTrace').value='12';app.node('hsrToughnessState').value='broken';const r=find(app,totalName);near(r.nonCrit,3000*(1.65+2)*(100/180));near(r.crit,r.nonCrit*2);near(r.expected,r.nonCrit*1.5);assert.equal(Object.keys(r.components).length,2);
 const e1=data.structuredModifiers.find(m=>m.id==='eidolon:1222:1:broken-enemy-defense-reduction'),e6=data.structuredModifiers.find(m=>m.id==='eidolon:1222:6:fuyuan-all-res-down');app.node('hsrEnemyDefenseReduction').value='20';app.state.modifierInputs[e1.finalStatsInclusion.inputKey]=true;near(find(app,totalName).nonCrit,r.nonCrit);app.node('hsrEnemyResistance').value='0';app.state.modifierInputs[e6.finalStatsInclusion.inputKey]=true;near(find(app,totalName).nonCrit,r.nonCrit);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,totalName).expected,r.expected);saved.node('hsrEidolon').value='5';assert.equal(find(saved,totalName),undefined);assert.ok(find(saved,mainName));
});

test('round11 reference promotions use proper attack kinds, native prior states and stored inclusion flags',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),rows=require('../../games/hsr/data/calc/attacks-promotions-round11.json').overrides,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 for(const row of rows){const app=await tool(undefined,{...data,attacks:[data.attacks.find(a=>a.id===row.id)]});app.state.characterId=row.characterId;if(row.characterId==='1408')app.state.modifierInputs['phainon-a6-atk-in-final-stats']=true;for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);let last;
  for(let lv=1;lv<=(row.traceKey==='normal'?6:10);lv++){app.node(({normal:'hsrNormalTrace',skill:'hsrSkillTrace',ultimate:'hsrUltimateTrace',talent:'hsrTalentTrace'})[row.traceKey]).value=String(lv);const out=app.calculate();assert.equal(out.length,1,app.node('hsrResults').innerHTML);last=out[0];let factor=.36;if(row.id==='132103')factor=(100/(200-[8,9,10,11,12,13,14.25,15.5,16.75,18][lv-1]))*.8*.9;if(row.id==='141002')factor*=1+[10,11,12,13,14,15,16.25,17.5,18.75,20][lv-1]/100;if(row.id==='140604')factor*=1.4;near(last.nonCrit,3000*row.multipliers[lv-1]/100*factor);near(last.expected,last.nonCrit*(row.id==='140604'?2:1.5));}
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,{...data,attacks:[row]});near(saved.calculate()[0].expected,last.expected);
 }
});


test('round11 cone conditions use valid wearers, one shared field, real App damage and restoration',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),rows=require('../../games/hsr/data/calc/modifiers-equipment-round11.json').modifiers,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),owners={Elation:'1513',Warrior:'1312',Rogue:'1206',Memory:'1407',Mage:'1003'};
 const samples=[['23054','great-fortune-active',true],['23045','crown-ultimate-active',true],['23046','inferno-skill-stacks',3],['21052','cone-memosprite-present',true],['21050','cone-memosprite-ally-skill-active',true],['22007','pink-future-ultimate-active',true],['24006','blessing-selected-ally-active',true],['21040','galaxy-two-weak-targets-active',true]];
 for(const[id,key,value]of samples){const cone=p.lightCones.find(c=>c.id===id),owner=p.characters.find(c=>c.id===owners[cone.path]),data={...p,structuredModifiers:rows,attacks:[{id:'r11-cone-'+id,characterId:owner.id,name:'条件の独立検証',type:'normal',element:owner.element,scalingStat:'atk',multipliers:[100],fixedTraceLevel:1,canCrit:true,support:{status:'calculable',verified:true}}]},app=await tool(undefined,data);app.state.characterId=owner.id;app.state.coneId=id;
  for(const[k,v]of Object.entries({atk:3000,hp:6000,def:2000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
  near(app.calculate()[0].expected,1620);app.node('hsrConditionDialog').handlers.change({target:{dataset:typeof value==='boolean'?{structuredToggle:key}:{structuredInput:key},checked:value,value:String(value)}});if(id==='23045')app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:'current-max-energy',structuredStrict:'true'},value:'300'}});
  const base=owner.base.atk+cone.base.atk,expected=id==='23054'?1922.4:id==='23045'?(3000+base*.8)*.36*1.5:id==='23046'?(3000+base*.3)*.36*1.5:id==='21052'?1620*1.24:id==='21050'?1620*1.08:id==='21040'?1728:1620;near(app.calculate()[0].expected,expected);
  app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-'+(typeof value==='boolean'?'toggle':'input')+'="'+key+'"','g'))||[]).length,1);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,expected);saved.state.coneId='';near(saved.calculate()[0].expected,1620);
 }
});

test('round12 Phainon explicit state inputs reach dynamic attacks, local exclusions and saved restoration',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data=p,app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1408';for(const m of data.structuredModifiers.filter(m=>m.source.id==='1408'))if(m.finalStatsInclusion)app.state.modifierInputs[m.finalStatsInclusion.inputKey]=true;
 for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);for(const k of ['hsrSkillTrace','hsrUltimateTrace'])app.node(k).value='10';const names=Object.fromEntries(data.attacks.filter(a=>a.characterId==='1408').map(a=>[a.id,a.name])),find=(x,id)=>x.calculate().find(r=>r.attack?.name===names[id]);app.state.modifierInputs['phainon-a6-atk-stacks']=1;
 assert.equal(find(app,'140809'),undefined);assert.equal(find(app,'140811'),undefined);near(find(app,'140803').nonCrit,3000*9.6*.36);
 app.state.modifierInputs['phainon-counter-flame-stacks']=2;app.state.modifierInputs['phainon-ruin-stacks']=4;near(find(app,'140809').nonCrit,3000*(.4+4*.3)*1.4*.36);near(find(app,'140811').nonCrit,3000*(4.5+16*.45)*.36);
 app.node('hsrSkillTrace').value='8';assert.equal(find(app,'140811'),undefined,'unresolved four-stack precision is not guessed');assert.ok(find(app,'140809'));app.state.modifierInputs['phainon-ruin-stacks']=3;near(find(app,'140811').nonCrit,3000*12*.3937*.36);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();for(const key of ['phainon-counter-flame-stacks','phainon-ruin-stacks'])assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1);
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(find(restored,'140811').expected,find(app,'140811').expected);assert.equal(restored.state.modifierInputs['phainon-counter-flame-stacks'],2);
 restored.state.modifierInputs['phainon-counter-flame-stacks']=0;assert.equal(find(restored,'140809'),undefined);assert.ok(find(restored,'140803'));
});

test('round12 Cipher full snapshot keeps true records independent of crit and enemy multipliers',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data={...p,structuredModifiers:[]},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1406';for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);const name=data.attacks.find(a=>a.id==='140603').name,find=x=>x.calculate().find(r=>r.attack?.name===name),curve=[80,88,96,104,112,120,130,140,150,160];assert.equal(find(app),undefined);
 for(let lv=1;lv<=10;lv++){app.node('hsrUltimateTrace').value=String(lv);for(const[a,b]of [[0,0],[1234.5,9876.25]]){app.state.modifierInputs['cipher-recorded-before-25']=a;app.state.modifierInputs['cipher-recorded-before-75']=b;const r=find(app),direct=3000*curve[lv-1]/100*.36,truePart=a*.25+b*.75;assert.ok(r,app.node('hsrResults').innerHTML);near(r.nonCrit,direct+truePart);near(r.crit,direct*2+truePart);near(r.expected,direct*1.5+truePart);assert.equal(Object.keys(r.components).length,4);}}
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.ok(!app.node('hsrConditionList').innerHTML.includes('undefined'));for(const key of ['cipher-recorded-before-25','cipher-recorded-before-75'])assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,find(app).expected);saved.state.modifierInputs['cipher-recorded-before-75']=NaN;assert.equal(find(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name.includes('魚は逃がさない')));
});

test('round12 Dahlia SuperBreak uses explicit toughness and BE without requiring unrelated ATK',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1321';app.node('hsrTalentTrace').value='10';app.node('hsrStat-atk').value='';app.node('hsrStat-breakEffect').value='200';app.node('hsrToughnessState').value='broken';app.node('hsrWeakness').value='true';const name=data.attacks.find(a=>a.id==='1321042').name,find=x=>x.calculate().find(r=>r.attack.name===name);assert.equal(find(app),undefined);
 app.state.modifierInputs['dahlia-fua-base-toughness']=50;const expected=3767.5533*2*5*3*.5*.8;near(find(app).nonCrit,expected);near(find(app).crit,expected);near(find(app).expected,expected);app.state.modifierInputs['dahlia-skill-field-active']=true;near(find(app).expected,expected*1.5);
 app.node('hsrStat-breakEffect').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,expected*1.5);saved.node('hsrToughnessState').value='active';assert.equal(find(saved),undefined);saved.node('hsrToughnessState').value='broken';saved.node('hsrWeakness').value='false';assert.equal(find(saved),undefined);
});

test('round12 Cipher native core, threshold and inclusion reach real App calculations',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1406';for(const[k,v]of Object.entries({atk:3000,hp:6000,speed:170,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);for(const k of ['hsrNormalTrace','hsrSkillTrace','hsrUltimateTrace','hsrTalentTrace'])app.node(k).value=k==='hsrNormalTrace'?'6':'10';const names=Object.fromEntries(data.attacks.filter(a=>a.characterId==='1406').map(a=>[a.id,a.name])),find=(a,id)=>a.calculate().find(r=>r.attack?.name===names[id]);
 near(find(app,'140601').expected,3000*.36*1.4*2);near(find(app,'140602').expected,(3000+640.332*.3)*2*.36*1.4*2);near(find(app,'140604').expected,3000*1.5*.36*1.4*3);assert.equal(app.state.modifierInputs['cipher-skill-atk-active'],undefined,'skill preview does not enable ATK on other attacks');
 app.state.modifierInputs['cipher-recorded-before-25']=10000;app.state.modifierInputs['cipher-recorded-before-75']=12000;near(find(app,'140603').nonCrit,2419.2+11500);near(find(app,'140603').expected,4838.4+11500);
 app.node('hsrStat-speed').value='139.99';near(find(app,'140604').expected,2268*2);app.node('hsrStat-speed').value='140';near(find(app,'140604').expected,2268*2.5);app.node('hsrStat-speed').value='170';
 app.state.modifierInputs['cipher-fua-crit-damage-in-final-stats']=true;app.node('hsrStat-critDamage').value='200';near(find(app,'140604').expected,6804);app.state.modifierInputs['cipher-a6-taken-damage-in-enemy-input']=true;app.node('hsrEnemyTakenDamage').value='40';near(find(app,'140603').nonCrit,13919.2);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,'140604').expected,6804);near(find(saved,'140603').nonCrit,13919.2);
});


test('round13 Serin snapshot inputs reach each component, local missing state and saved restoration',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data={...p,structuredModifiers:[]},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1410';
 for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const name=data.attacks.find(a=>a.id==='1410032').name,find=x=>x.calculate().find(r=>r.attack?.name===name);assert.equal(find(app),undefined);
 const keys=['1410041','1410042','1410043','1410044'].map(id=>'serin-detonation-original:'+id);keys.forEach((key,i)=>app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:key,structuredStrict:'true'},value:String([111,222,0,444][i])}}));app.state.modifierInputs['serin-zone-proc-count']=2;app.node('hsrUltimateTrace').value='10';
 const r=find(app);assert.ok(r,app.node('hsrResults').innerHTML);near(r.nonCrit,3000*2*.36+777*1.5+2*3000*.8*.36);near(r.crit,3000*2*.36*2+777*1.5+2*3000*.8*.36);assert.equal(Object.keys(r.components).length,7);assert.match(app.node('hsrResults').innerHTML,/本人の事前DoT起爆/);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();for(const key of [...keys,'serin-zone-proc-count'])assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,r.expected);delete saved.state.modifierInputs[keys[2]];assert.equal(find(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='141001').name));
});

test('round13 Dahlia same-event sum uses Talent level, separate direct/break modifiers and restored explicit toughness',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1321';app.node('hsrTalentTrace').value='10';app.node('hsrUltimateTrace').value='1';
 for(const[k,v]of Object.entries({atk:3000,breakEffect:200,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrToughnessState').value='broken';app.node('hsrWeakness').value='true';
 const name=data.attacks.find(a=>a.id==='1321043').name,find=x=>x.calculate().find(r=>r.attack?.name===name);assert.equal(find(app),undefined);app.state.modifierInputs['dahlia-fua-base-toughness']=50;const r=find(app);assert.ok(r,app.node('hsrResults').innerHTML);near(r.nonCrit,3000*.3*5*.4+3767.5533*2*5*3*.4);near(r.expected,3000*.3*5*.4*1.5+3767.5533*2*5*3*.4);
 app.state.modifierInputs['dahlia-skill-field-active']=true;near(find(app).nonCrit,1800+3767.5533*2*5*3*.4*1.5);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,find(app).expected);saved.node('hsrToughnessState').value='active';assert.equal(find(saved),undefined);
});

test('round13 Gilgamesh joint Wind uses Saber snapshot and never own stats or owner buffs twice',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1509';app.state.party[0]={characterId:'1014',eidolon:0,traceLevels:{talent:10}};app.node('hsrTalentTrace').value='10';
 for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 const name='「攻撃を許す」・セイバーの連携追加攻撃（風属性成分）',find=x=>x.calculate().find(r=>r.attack?.name===name);assert.equal(find(app),undefined);
 for(const[k,v]of Object.entries({atk:4321,critRate:37,critDamage:123,Wind:29,defenseIgnore:17,resistancePenetration:11}))app.state.modifierInputs['party-reference:1014:'+k]=v;app.state.modifierInputs['enemy-resistance:Wind']=31;
 const nc=4321*6*1.29*(100/183)*.8*.9,ev=nc*(1+.37*1.23),r=find(app);assert.ok(r,app.node('hsrResults').innerHTML);near(r.nonCrit,nc);near(r.expected,ev);app.node('hsrStat-atk').value='999999';app.node('hsrStat-critDamage').value='9999';near(find(app).expected,ev);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/セイバーの最終風属性与ダメージ/);assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="enemy-resistance:Wind"/g)||[]).length,1);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,ev);saved.state.party=[];assert.equal(find(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='1509051').name),saved.node('hsrCalculationFeedback').innerHTML+' '+saved.node('hsrWarnings').innerHTML);
});

test('round13 new LC post-event states survive restoration and equipment removal',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
 for(const[id,key]of [['23011','lc-23011-hp-loss-buff-active'],['23029','lc-23029-cornered-active'],['23032','lc-23032-woefree-active']]){
  const cone=p.lightCones.find(c=>c.id===id),cid=p.characters.find(c=>c.path===cone.path).id,data={...p,structuredModifiers:p.structuredModifiers.filter(m=>m.source.kind==='lightCone'&&m.source.id===id),attacks:[{id:'lc-test',characterId:cid,name:'LC test',type:'normal',element:p.characters.find(c=>c.id===cid).element,scalingStat:'atk',multipliers:[100],canCrit:true,fixedTraceLevel:1,support:{status:'calculable',verified:true}}]},app=await tool(undefined,data);app.state.characterId=cid;app.state.coneId=id;
  for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100,breakEffect:150}))app.node('hsrStat-'+k).value=String(v);near(app.calculate()[0].expected,1620);app.state.modifierInputs[key]=true;const value=app.calculate()[0].expected;assert.ok(value>1620);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,value);saved.state.coneId='';near(saved.calculate()[0].expected,1620);
 }
});


test('round13 Jade reuses one Pawn selector, current damage-time stats and final inclusion through save',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1314';for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrTalentTrace').value='10';
 const name=data.attacks.find(a=>a.id==='131404').name,find=x=>x.calculate().find(r=>r.attack?.name===name);assert.equal(find(app),undefined);const base=data.characters.find(c=>c.id==='1314').base.atk;
 for(const stacks of [0,1,25,49,50]){app.state.modifierInputs['jade-pawned-asset-stacks']=stacks;near(find(app).expected,(3000+base*.005*stacks)*1.2*.36*(1+.5*(1+.024*stacks)));}
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="jade-pawned-asset-stacks"/g)||[]).length,1);
 const before=find(app).expected;app.node('hsrStat-atk').value=String(3000+base*.25);app.node('hsrStat-critDamage').value='220';app.state.modifierInputs['traceNode:1314:1314103:pawned-asset-atk-in-final']=true;app.state.modifierInputs['trace:1314:131404:pawned-asset-crit-damage-in-final']=true;near(find(app).expected,before);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,before);delete saved.state.modifierInputs['jade-pawned-asset-stacks'];assert.equal(find(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='131401').name));
});


test('round13 Jade Debt Collector support reaches beneficiary Glamoth and restores without doubling final SPD',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data={...p,attacks:[p.attacks.find(a=>a.id==='100301')],structuredModifiers:p.structuredModifiers.filter(m=>m.id==='trace:1314:131402:debt-collector-speed'||m.id==='ornament:311:2pc:speed-damage')},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1003';app.state.party[0]={characterId:'1314',eidolon:0,traceLevels:{skill:10}};app.state.ornamentId='311';for(const[k,v]of Object.entries({atk:3000,speed:132,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);app.node('hsrNormalTrace').value='6';near(app.calculate()[0].expected,1620);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'jade-debt-collector-active'},checked:true}});near(app.calculate()[0].expected,1911.6);app.node('hsrStat-speed').value='162';app.state.modifierInputs['jade-debt-collector-speed-in-final']=true;near(app.calculate()[0].expected,1911.6);
 app.node('hsrStat-speed').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,1911.6);saved.state.modifierInputs['jade-debt-collector-speed-in-final']=false;saved.node('hsrStat-speed').value='132';saved.state.party=[];near(saved.calculate()[0].expected,1620);
});


test('R14 real App support flow shares conditions, separates provider CD/BE and restores only selected party effects',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),data={...p,attacks:[p.attacks.find(a=>a.id==='100201')],structuredModifiers:p.structuredModifiers.filter(m=>['1101','1303'].includes(m.source.id))},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1002';
 app.state.party=[{characterId:'1101',eidolon:0,critDamage:200,traceLevels:{skill:10,ultimate:10,talent:10}},{characterId:'1303',eidolon:0,breakEffect:180,traceLevels:{skill:10,ultimate:10,talent:10}}];
 for(const[k,v]of Object.entries({atk:3000,hp:6000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrNormalTrace').value='6';const toggle=(key,on)=>app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked:on}});
 near(app.calculate()[0].expected,1782);toggle('bronya-skill-active',true);near(app.calculate()[0].expected,2851.2);toggle('bronya-skill-active',false);near(app.calculate()[0].expected,1782);toggle('bronya-ultimate-active',true);const atk=3000+546.84*.55;near(app.calculate()[0].expected,atk*.36*1.1*1.76);
 app.node('hsrConditionDialog').handlers.input({target:{dataset:{structuredProviderStat:'critDamage',providerId:'1101'},value:'300'}});near(app.calculate()[0].expected,atk*.36*1.1*1.84);assert.equal(app.state.stats.critDamage,100,'provider field does not overwrite recipient');
 toggle('ruanmei-skill-active',true);for(const be of [119.99,120,129.99,130,179.99,180,180.01]){app.node('hsrConditionDialog').handlers.input({target:{dataset:{structuredProviderStat:'breakEffect',providerId:'1303'},value:String(be)}});const extra=Math.min(36,Math.max(0,Math.floor((be-120)/10))*6);near(app.calculate()[0].expected,atk*.36*(1+(10+32+extra)/100)*1.84);}
 toggle('ruanmei-field-active',true);near(app.calculate()[0].expected,atk*.5*1.05*.9*1.78*1.84);app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();const html=app.node('hsrConditionList').innerHTML;
 for(const key of ['bronya-ultimate-active','ruanmei-skill-active'])assert.equal((html.match(new RegExp('data-structured-toggle="'+key+'"','g'))||[]).length,1);for(const[id,stat]of [['1101','critDamage'],['1303','breakEffect']])assert.equal((html.match(new RegExp('data-structured-provider-stat="'+stat+'" data-provider-id="'+id+'"','g'))||[]).length,1);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(saved.calculate()[0].expected,atk*.5*1.05*.9*1.78*1.84);saved.state.party=saved.state.party.filter(m=>m.characterId!=='1101');near(saved.calculate()[0].expected,3000*.5*1.05*.9*1.68*1.5);saved.state.party=[];near(saved.calculate()[0].expected,1620);
});

test('R14 final-stat component controls preserve mixed inclusion and missing provider CD stays local to critical attacks',async()=>{
 const {data:p}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),a=p.attacks.find(a=>a.id==='100201'),data={...p,attacks:[a,{...a,id:'r14-dot-scope-fixture',name:'R14 DoT scope fixture',type:'dot',canCrit:false}],structuredModifiers:p.structuredModifiers.filter(m=>['1101','1303'].includes(m.source.id))},app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7);
 app.state.characterId='1002';app.state.party=[{characterId:'1101',eidolon:0,critDamage:200,traceLevels:{skill:10,ultimate:10}}];for(const[k,v]of Object.entries({atk:3000+546.84*.55,hp:6000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrNormalTrace').value='6';app.state.modifierInputs['bronya-ultimate-active']=true;app.state.modifierInputs['trace:1101:110103:atk-percent-in-final-stats']=true;
 near(app.calculate().find(r=>r.attack?.name===a.name).expected,(3000+546.84*.55)*.36*1.1*1.76);app.state.modifierInputs['trace:1101:110103:crit-damage-in-final-stats']=true;app.node('hsrStat-critDamage').value='152';near(app.calculate().find(r=>r.attack?.name===a.name).expected,(3000+546.84*.55)*.36*1.1*1.76);
 app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();let html=app.node('hsrConditionList').innerHTML;assert.match(html,/最終入力に反映済み/);assert.ok(!html.includes('効果量0・未適用'));assert.ok(!html.includes('0%（選択中・未適用）'));
 app.state.modifierInputs['traceNode:1101:1101103:party-damage-in-final-stats']=true;app.node('hsrConditionDialogOpen').handlers.click();html=app.node('hsrConditionList').innerHTML;assert.ok((html.match(/最終入力に反映済み（追加なし）/g)||[]).length>=3);
 app.node('hsrConditionDialog').handlers.input({target:{dataset:{structuredProviderStat:'critDamage',providerId:'1101'},value:''}});app.state.modifierInputs['trace:1101:110103:crit-damage-in-final-stats']=false;assert.equal(app.calculate().some(r=>r.attack?.name===a.name),false);assert.ok(app.calculate().some(r=>r.attack?.name==='R14 DoT scope fixture'));
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.state.modifierInputs['trace:1101:110103:atk-percent-in-final-stats'],true);
});

test("Round16 Yukong native supports reach self and party damage without double-counting final inputs", async () => {
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
 const app=await tool(undefined,data), near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:id==="1207"?12:0}});
 const row=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 const toggle=(t,key,on)=>t.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:key},checked:on}});
 const atkKey="yukong-roaring-bowstrings-active", critKey="yukong-ultimate-buffs-active";
 const ids=["trace:1207:120702:party-atk","trace:1207:120703:party-crit-rate","trace:1207:120703:party-crit-damage"];
 profile("1207"); near(row(app,"1207011").nonCrit,2177.28);
 toggle(app,atkKey,true); toggle(app,critKey,true);
 // 80% of beneficiary base ATK, 28% CR and 65% CD; A4 12% is already in final DMG.
 const boostedAtk=3000+599.76*.8, nc=boostedAtk*1.8*1.12*.36;
 let r=row(app,"1207011"); near(r.nonCrit,nc); near(r.crit,nc*2.65); near(r.expected,nc*(1+.78*1.65));
 for(const part of Object.values(r.components)) for(const id of ids) assert.equal(part.applied.filter(m=>m.id===id).length,1);
 app.node("hsrStat-atk").value=String(boostedAtk); app.node("hsrStat-critRate").value="78"; app.node("hsrStat-critDamage").value="165";
 for(const id of ids) toggle(app,id+"-in-final",true);
 near(row(app,"1207011").expected,r.expected);
 app.node("hsrStat-atk").handlers.input(); const saved=await tool(app.storage,data); near(row(saved,"1207011").expected,r.expected);
 for(const id of ids) assert.equal(saved.state.modifierInputs[id+"-in-final"],true);
 // Reuse the same real support rows on an Imaginary recipient. Provider ATK is deliberately unrelated.
 profile("1004");app.state.enhancementState="enhanced";app.node("hsrEnhancementState").value="enhanced";
 for(const id of ids) app.state.modifierInputs[id+"-in-final"]=false;
 app.state.party[0]={characterId:"1207",level:80,eidolon:0,atk:9999,traceLevels:{skill:10,ultimate:10}};
 toggle(app,atkKey,false);toggle(app,critKey,false);near(row(app,"1100401").nonCrit,1209.6);
 toggle(app,atkKey,true);toggle(app,critKey,true);
 const partyNc=(3000+620.928*.8)*1.12*.36;
 r=row(app,"1100401");near(r.nonCrit,partyNc);near(r.crit,partyNc*2.65);near(r.expected,partyNc*(1+.78*1.65));
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(row(restored,"1100401").expected,r.expected);
 restored.state.party[0].characterId="";near(row(restored,"1100401").expected,1620);
});

test("Round16 Xueyi limited Ultimate uses the existing broken-state input and restores it", async () => {
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1214",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:200,breakEffect:200}});
 const row=(t,id)=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name);
 assert.equal(row(app,"121403"),undefined);assert.ok(row(app,"121402"));
 app.node("hsrToughnessState").value="broken";let r=row(app,"121403");
 // Final DMG already contains min(BE,240)=200%; broken target removes the 0.9 toughness factor.
 near(r.nonCrit,9000);near(r.crit,18000);near(r.expected,13500);near(r.breakdown.referenceValue,3000);
 assert.match(app.node("hsrResults").innerHTML,/攻撃前から撃破済み/);
 app.node("hsrUltimateTrace").value="1";near(row(app,"121403").nonCrit,5400);
 app.node("hsrUltimateTrace").value="";assert.equal(row(app,"121403"),undefined);assert.ok(row(app,"121401"));app.node("hsrUltimateTrace").value="10";
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(row(restored,"121403").expected,13500);assert.equal(restored.state.enemy.toughnessActive,false);
 restored.node("hsrToughnessState").value="active";assert.equal(row(restored,"121403"),undefined);assert.ok(row(restored,"121401"));
});

test("Round17 Hunt March scopes real Basic-only relic damage to body and preserves mixed-element totals", async () => {
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1224",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.party[0]={characterId:"1003",level:80,eidolon:0,atk:99999,traceLevels:{skill:10}};
 app.state.modifierInputs["march-shifu-id"]=1003;app.state.modifierInputs["element-damage:1224:Fire"]=50;app.state.modifierInputs["enemy-resistance:Fire"]=40;
 const full=t=>t.calculate().filter(r=>r.attack?.name?.includes("攻撃型師匠"));
 const verify=(t,normalBody,enhancedBody)=>{const rows=full(t);assert.equal(rows.length,7);for(const r of rows){const normal=r.attack.name.includes("妖魔"),n=r.components.basic.attack.hitCount,body=(normal?normalBody:enhancedBody)*n,additional=(normal?243:372.6)*n;near(r.components.basic.nonCrit,body);near(r.components.additional.nonCrit,additional);near(r.nonCrit,body+additional);near(r.crit,(body+additional)*2);near(r.expected,(body+additional)*1.5);}return rows;};
 verify(app,1080,1555.2);
 app.state.relicId="134";app.node("hsrRelicMode").value="4";
 let rows=verify(app,1468.8,1866.24);
 for(const r of rows){assert.equal(r.components.basic.applied.filter(m=>m.id==="relic:134:4pc:normal-damage").length,1);assert.equal(r.components.additional.applied.filter(m=>m.id==="relic:134:4pc:normal-damage").length,0);}
 const ultimateName=data.attacks.find(a=>a.id==="122403").name;near(app.calculate().find(r=>r.attack.name===ultimateName).nonCrit,2592);
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);verify(restored,1468.8,1866.24);
 restored.state.relicId="";verify(restored,1080,1555.2);restored.state.relicId="134";
 restored.state.party[0].characterId="";assert.equal(full(restored).length,0);assert.ok(restored.calculate().some(r=>r.attack.name===ultimateName));
 app.node("hsrSkillTrace").value="";assert.equal(full(app).length,0);assert.ok(app.calculate().some(r=>r.attack.name===ultimateName));app.node("hsrSkillTrace").value="10";
 app.node("hsrTalentTrace").value="";rows=full(app);assert.equal(rows.length,1);assert.match(rows[0].attack.name,/妖魔/);
});

test("Round17 Hunt March Shifu supports reach current recipient, speed threshold and separate Super Break", async () => {
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1003",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,speed:130,critRate:50,critDamage:100,damageBonus:0,breakEffect:50}});
 app.state.party[0]={characterId:"1224",level:80,eidolon:0,speed:999,critDamage:999,breakEffect:999,traceLevels:{skill:10}};app.state.ornamentId="311";
 const normal=t=>t.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==="100301").name);
 const toggle=(t,key,on)=>t.node("hsrConditionDialog").handlers.change({target:{dataset:{structuredToggle:key},checked:on}});
 const skill="march-shifu-support-active",a6="march-shifu-a6-active",ids=["trace:1224:122402:shifu-speed","trace:1224:1224103:shifu-crit-damage","trace:1224:1224103:shifu-break-effect"];
 near(normal(app).expected,1620);toggle(app,a6,true);near(normal(app).expected,1620,"A6 needs the current recipient to be Shifu");
 toggle(app,skill,true);let r=normal(app);near(r.nonCrit,1209.6);near(r.crit,3144.96);near(r.expected,2177.28);
 // Himeko base SPD96, not provider SPD999: 130+96*.10=139.6 crosses Glamoth135.
 for(const [rawSpeed,expectedNc] of [[125.3999,1080],[125.4,1209.6],[125.4001,1209.6]]){app.node("hsrStat-speed").value=String(rawSpeed);near(normal(app).nonCrit,expectedNc);}
 app.node("hsrStat-speed").value="130";
 const catalogCharacters=app.state.data.characters;app.state.data.characters=catalogCharacters.map(c=>c.id==="1003"?{...c,base:{...c.base,speed:undefined}}:c);assert.equal(normal(app),undefined,"missing recipient base speed cannot establish a damage threshold");app.state.data.characters=catalogCharacters;near(normal(app).expected,2177.28);
 app.node("hsrStat-speed").value="139.6";toggle(app,ids[0]+"-in-final",true);app.node("hsrStat-critDamage").value="160";toggle(app,ids[1]+"-in-final",true);near(normal(app).expected,2177.28);
 app.node("hsrStat-atk").handlers.input();const restored=await tool(app.storage,data);near(normal(restored).expected,2177.28);for(const id of ids.slice(0,2))assert.equal(restored.state.modifierInputs[id+"-in-final"],true);
 restored.node("hsrBreakMode").value="superBreak";restored.node("hsrToughnessState").value="broken";restored.node("hsrEnemyResistance").value="0";restored.node("hsrSuperBreakToughness").value="30";restored.node("hsrSuperBreakMultiplier").value="100";
 let superBreakResult;const engine=restored.window.HsrCalcEngine;restored.window.HsrCalcEngine={...engine,calculateSuperBreak(input){superBreakResult=engine.calculateSuperBreak(input);return superBreakResult;}};
 // Existing level80 coefficient3767.5533 * current-unit toughness30/10 * (1+.50+.36) * DEF.5 * RES1.
 const verifySuperBreak=()=>{restored.calculate();near(superBreakResult.value,10511.473707);};
 verifySuperBreak();restored.node("hsrStat-breakEffect").value="86";toggle(restored,ids[2]+"-in-final",true);verifySuperBreak();
 restored.node("hsrBreakMode").value="attacks";restored.node("hsrToughnessState").value="active";restored.node("hsrEnemyResistance").value="20";
 for(const id of ids)toggle(restored,id+"-in-final",false);restored.node("hsrStat-speed").value="130";restored.node("hsrStat-critDamage").value="100";restored.node("hsrStat-breakEffect").value="50";
 restored.state.party[0].characterId="";near(normal(restored).expected,1620);
});


test("Round18 pre-existing Burn/Shock composites resolve independent body/Talent levels and scopes", async () => {
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
 const app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 for(const [cid,key,ids,body,talent] of [["1109","hook-enemy-burning",["1109012","1109022","1109092","1109032"],[1080,2592,3024,4320],1080],["1103","serval-target-shocked",["1103012","1103022","1103032"],[1080,1512,1944],777.6]]){
  profile(cid);app.state.modifierInputs[key]=false;
  for(const id of ids)assert.equal(row(id),undefined,"composite requires prior DoT state");
  app.state.modifierInputs[key]=true;
  for(let i=0;i<ids.length;i++){const r=row(ids[i]);assert.ok(r,ids[i]);near(r.components.body.nonCrit,body[i]);near(r.components.additional.nonCrit,talent);near(r.nonCrit,body[i]+talent);near(r.crit,2*(body[i]+talent));near(r.expected,1.5*(body[i]+talent));}
  app.state.relicId="134";app.node("hsrRelicMode").value="4";
  const r=row(ids[0]);near(r.components.body.nonCrit,body[0]*1.36);near(r.components.additional.nonCrit,talent);
  app.state.relicId="";app.node("hsrTalentTrace").value="";assert.equal(row(ids[0]),undefined);assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id===(cid==="1109"?"110901":"110301")).name));app.node("hsrTalentTrace").value="10";
 }
});

test("Round18 numeric snapshots reach actual Jiaoqiu and Tribbie damage and stay local when missing",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:10000,def:2000,critRate:50,critDamage:100,damageBonus:0,effectHitRate:140}});
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 profile("1218");delete app.state.modifierInputs["jiaoqiu-basic-roast-stacks"];assert.equal(row("1218011"),undefined);assert.ok(row("121801"));
 app.state.conditionTab="軌跡";app.node("hsrConditionDialogOpen").handlers.click();assert.equal((app.node("hsrConditionList").innerHTML.match(/data-structured-input="jiaoqiu-basic-roast-stacks"/g)||[]).length,1,"one numeric state input, without a duplicate stack selector");
 for(const [stacks,nc] of [[0,1080],[1,1242],[4,1404],[5,1458]]){app.state.modifierInputs["jiaoqiu-basic-roast-stacks"]=stacks;const r=row("1218011");assert.ok(r);near(r.nonCrit,nc);near(r.expected,nc*1.5);}
 profile("1403");app.state.modifierInputs["tribbie-zone-active"]=false;const off=row("140301");assert.ok(off);
 app.state.modifierInputs["tribbie-zone-active"]=true;delete app.state.modifierInputs["tribbie-a4-party-max-hp-snapshot"];assert.equal(row("140301"),undefined);
 app.state.modifierInputs["tribbie-a4-party-max-hp-snapshot"]=30000;let r=row("140301");assert.ok(r);near(r.breakdown.referenceValue,12700);
 app.node("hsrStat-hp").value="12700";app.state.modifierInputs["traceNode:1403:1403102:party-hp-snapshot-in-final"]=true;near(row("140301").expected,r.expected);
});


test("Round19 enhanced Welt displays three native-component totals without a new condition input",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1004",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.enhancementState="enhanced";app.node("hsrEnhancementState").value="enhanced";
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 app.state.modifierInputs["welt-weightless-active"]=true;app.state.modifierInputs["welt-weightless-damage-stacks"]=10;
 for(const [id,nc]of [["11004012",7560],["11004022",25552.8],["11004032",9450]]){const r=row(id);assert.ok(r,id);near(r.nonCrit,nc);near(r.crit,nc*2);near(r.expected,nc*1.5);}
 app.state.relicId="134";app.node("hsrRelicMode").value="4";let r=row("11004012");near(r.components.body.nonCrit,3186);near(r.components.judgment.nonCrit,2160);near(r.components.talent.nonCrit,2700);app.state.relicId="";
 app.state.modifierInputs["welt-weightless-damage-stacks"]=9;assert.equal(row("11004022"),undefined);assert.ok(app.calculate().some(r=>r.attack?.name==="虚空断界"));
 app.state.modifierInputs["welt-weightless-damage-stacks"]=10;app.node("hsrTalentTrace").value="";assert.equal(row("11004012"),undefined);app.node("hsrTalentTrace").value="10";
 app.state.enhancementState="previous";app.node("hsrEnhancementState").value="previous";assert.equal(row("11004012"),undefined);
});

test("Round19 Black Swan party Epiphany uses provider trace level and explicit valid state",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1002",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const normal=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==="100201").name);
 near(normal().nonCrit,1080);app.state.party[0]={characterId:"1307",level:80,eidolon:0,traceLevels:{skill:10,ultimate:10}};app.state.modifierInputs["black-swan-epiphany-active"]=true;
 for(const version of ["previous","enhanced"]){app.state.enhancementState=version;near(normal().nonCrit,1350);}
 app.state.conditionTab="パーティ";app.node("hsrConditionDialogOpen").handlers.click();assert.match(app.node("hsrConditionList").innerHTML,/通常版は対象自身のターン中/);
 app.state.party[0].traceLevels.ultimate=1;near(normal().nonCrit,1242);app.state.modifierInputs["black-swan-epiphany-active"]=false;near(normal().nonCrit,1080);
 app.state.modifierInputs["black-swan-skill-def-active"]=true;near(normal().nonCrit,3000*.8*.9/(2-.208));
 app.state.modifierInputs["black-swan-epiphany-active"]=true;near(normal().nonCrit,3000*.8*.9*1.15/(2-.208));app.state.party[0].characterId="";near(normal().nonCrit,1080);
});


test("Round20 Guinaifen Ultimate displays own-Burn total with independent trace inputs and correct crit scope",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1210",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==="1210032").name);
 const check=(skill,ult,kiss)=>{const r=row(),common=3000*1.2*.5*.8*.9*(1+3*kiss/100),direct=common*ult/100,burn=common*skill*.92/100;assert.ok(r);near(r.components.direct.nonCrit,direct);near(r.components.burn.nonCrit,burn);near(r.nonCrit,direct+burn);near(r.crit,direct*2+burn);near(r.expected,direct*1.5+burn);return r;};
 check(218.21,120,7);app.node("hsrSkillTrace").value="1";check(83.9,120,7);app.node("hsrTalentTrace").value="1";check(83.9,120,4);
 app.state.modifierInputs["guinaifen-firekiss-stacks"]=0;app.state.modifierInputs["enemy-burning"]=false;check(83.9,120,4);assert.equal(app.state.modifierInputs["guinaifen-firekiss-stacks"],0,"row assumptions do not overwrite user state");
 app.node("hsrSkillTrace").value="";assert.equal(row(),undefined);assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==="121003").name));
});

test("Round21 Kafka own-Shock action totals resolve distinct trace levels and component scopes in the App",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1005",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 for(const [version,ids]of [["previous",["1005029","1005039"]],["enhanced",["11005029","11005039","11005049"]]]){
  app.state.enhancementState=version;app.node("hsrEnhancementState").value=version;
  for(const id of ids){const r=row(id),a=data.attacks.find(a=>a.id===id),direct=1080*a.multipliers[9]/100,product=a.damageComponents[1].multiplierProductComponents,shock=1080*product[0].values[9]*product[1].values[9]/10000;
   assert.ok(r,id);near(r.components.direct.nonCrit,direct);near(r.components.shock.nonCrit,shock);near(r.nonCrit,direct+shock);near(r.crit,direct*2+shock);near(r.expected,direct*1.5+shock);
  }
 }
 app.state.relicId="122";app.node("hsrRelicMode").value="4";app.state.modifierInputs["relic-122-next-skill"]=false;const relicOff=row("11005029");
 app.state.modifierInputs["relic-122-next-skill"]=true;const relicOn=row("11005029");near(relicOn.components.direct.nonCrit-relicOff.components.direct.nonCrit,1080*1.6*.25);near(relicOn.components.shock.nonCrit,relicOff.components.shock.nonCrit,"skill-only modifier must not affect Shock");app.state.relicId="";
 app.node("hsrSkillTrace").value="1";const low=row("11005029");near(low.components.direct.nonCrit,864);near(low.components.shock.nonCrit,1080*2.9*.60);
 app.node("hsrUltimateTrace").value="";assert.equal(row("11005029"),undefined);assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==="1100502").name),"missing own-Shock level is local to composite");
});

test("Round22 Phainon adjacent targets and current A6 stacks reach actual App damage once",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1408",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.node("hsrEnemyCount").value="3";app.state.modifierInputs["phainon-a6-atk-stacks"]=1;
 const matching=(rows,id)=>rows.filter(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 const effectiveAtk=3000+582.12*.5;
 const check=()=>{const rows=app.calculate();for(const [id,main,adjacent]of [["140802",3,1.2],["140808",2.5,.75]]){const parts=matching(rows,id);assert.equal(parts.length,2);near(parts[0].nonCrit,effectiveAtk*main*.36);near(parts[1].nonCrit,effectiveAtk*adjacent*.36);near(parts[1].crit,parts[1].nonCrit*2);}};
 check();app.node("hsrStat-atk").value=String(effectiveAtk);app.state.modifierInputs["phainon-a6-atk-in-final-stats"]=true;check();
 app.node("hsrEnemyCount").value="1";const single=app.calculate();for(const id of ["140802","140808"])assert.equal(matching(single,id).length,1,"no adjacent target exists in a one-enemy snapshot");
});

test("Round23 mixed ordinary/Elation totals reach the App and share prior A4 without changing saved inputs",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,elation:100}});
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 profile("1505");app.node("hsrStat-elation").value="100";app.node("hsrMerrymake").value="0";app.state.modifierInputs["hiyu-certified-banger"]=40;
 for(const [id,d,c,b,taken]of [["1505022",3,.16,40,1],["1505032",12.4,2.76,480,1.12],["1505044",1,.25,40,1.12]]){const r=row(id),direct=1080*d*taken,extra=7535.107*c*2*(1+5*b/(b+240))*.36*taken;assert.ok(r,id);near(r.components.direct.nonCrit,direct);near(r.components.banger.nonCrit,extra);near(r.expected,(direct+extra)*1.5);}
 app.state.modifierInputs["hiyu-prior-vulnerability"]=true;let r=row("1505022");near(r.components.direct.nonCrit,1080*3*1.12);near(r.components.banger.nonCrit,7535.107*.16*2*(1+200/280)*.36*1.12);assert.equal(app.state.modifierInputs["hiyu-prior-fox-vulnerability"],undefined,"comparison does not overwrite the separate saved component control");
 delete app.state.modifierInputs["hiyu-certified-banger"];assert.equal(row("1505022"),undefined);assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==="150502").name));
 profile("1513");app.node("hsrStat-elation").value="100";app.node("hsrFervor").value="0";app.state.modifierInputs["elation-certified-banger"]=40;app.state.party[0]={characterId:"1505",level:80,eidolon:0};
 for(const [id,d,c]of [["1513022",2.4,.4],["1513032",4,.72]]){r=row(id);assert.ok(r,id);near(r.nonCrit,1080*d+7535.107*c*2*(1+200/280)*.36);}
 app.state.party=[];assert.equal(row("1513022"),undefined);app.state.party[0]={characterId:"1505",level:80,eidolon:0};app.node("hsrFervor").value="10";assert.ok(row("1513022"),"the heat0 comparison does not reuse enhanced-Aha consumed Fervor");
});

test("Round23 Gilgamesh party support uses the active recipient's max Energy and stays automatic",async()=>{
 const {data}=await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+" != "+b);
 app.window.HsrTool.applyProfileCharacter({id:"1003",level:80,eidolon:0,traces:[{type:"Normal",level:6},{type:"BPSkill",level:10},{type:"Ultra",level:10},{type:"Talent",level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.party[0]={characterId:"1509",level:80,eidolon:0,maxEnergy:999};
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==="100301").name),base=data.characters.find(c=>c.id==="1003").base.atk;
 let r=row();near(r.nonCrit,(3000+base*.2)*.36);near(r.crit,r.nonCrit*2.2);
 app.state.modifierInputs["current-max-energy"]=180;r=row();near(r.nonCrit,(3000+base*.6)*.36);near(r.crit,r.nonCrit*2.6);
 for(const m of data.structuredModifiers.filter(m=>m.source.traceId==="1509103"))app.state.modifierInputs[m.finalStatsInclusion.inputKey]=true;
 app.node("hsrStat-atk").value=String(3000+base*.6);app.node("hsrStat-critDamage").value="160";near(row().expected,r.expected);
 app.state.party=[];for(const m of data.structuredModifiers.filter(m=>m.source.traceId==="1509103"))app.state.modifierInputs[m.finalStatsInclusion.inputKey]=false;app.node("hsrStat-atk").value="3000";app.node("hsrStat-critDamage").value="100";near(row().expected,1620);
});


test('Round24 Gilgamesh joint total keeps two owners, defenses and elemental resistance separate',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1509',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 for(const m of data.structuredModifiers.filter(m=>m.source.traceId==='1509103'))app.state.modifierInputs[m.finalStatsInclusion.inputKey]=true;
 app.state.party[0]={characterId:'1014',eidolon:0,traceLevels:{talent:10}};
 for(const[k,v]of Object.entries({atk:4321,critRate:37,critDamage:123,Wind:29,defenseIgnore:17,resistancePenetration:11}))app.state.modifierInputs['party-reference:1014:'+k]=v;
 app.state.modifierInputs['enemy-resistance:Wind']=31;
 const find=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='150905').name);
 const thunder=3000*4*.36,wind=4321*6*1.29*(100/183)*.8*.9,ev=thunder*1.5+wind*(1+.37*1.23);let r=find(app);assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);
 near(r.components.lightning.nonCrit,thunder);near(r.components.wind.nonCrit,wind);near(r.expected,ev);
 app.node('hsrStat-atk').value='6000';r=find(app);near(r.components.wind.nonCrit,wind);near(r.components.lightning.nonCrit,2*thunder);
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(find(restored).expected,r.expected);
 restored.state.party=[];assert.equal(find(restored),undefined);assert.ok(restored.calculate().some(x=>x.attack?.name===data.attacks.find(a=>a.id==='1509051').name));
});


test('Round24 both Elation Trailblazers expose separate CB and Aha formulas through existing inputs',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 for(const id of ['8009','8010']){
 app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,elation:100}});
 assert.equal(app.node('hsrElationSettings').hidden,false,'existing Aha controls are visible for this owner');
 app.node('hsrStat-elation').value='100';app.node('hsrMerrymake').value='0';app.node('hsrElationTrace').value='10';app.node('hsrPunchline').value='20';app.state.elationInputs.context='ahaInstant';app.state.modifierInputs['elation-certified-banger']=40;
 const find=suffix=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id+suffix).name),total=find('022'),rider=7535.107*.3*2*(1+200/280)*.36;
 assert.ok(total,app.node('hsrCalculationFeedback').innerHTML);near(total.components.direct.nonCrit,648);near(total.components.banger.nonCrit,rider);near(total.expected,(648+rider)*1.5);
 const aha=find('20');assert.ok(aha,app.node('hsrCalculationFeedback').innerHTML);near(aha.nonCrit,7535.107*2.2*2*(1+100/260)*.36);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/本人が味方内で最大/);app.node('hsrConditionDialog').close();
 app.state.party[0]={characterId:'1101',eidolon:0};app.state.modifierInputs['bronya-technique-active']=true;app.state.modifierInputs['trace:1101:110107:party-atk-in-final-stats']=false;assert.ok(!find('022'),'ATK conversion cannot silently use stale final Elation');assert.equal(find('20'),undefined);assert.ok(find('02'));
 app.state.modifierInputs['trace:1101:110107:party-atk-in-final-stats']=true;assert.ok(find('022'));assert.ok(find('20'));app.state.party=[];app.state.modifierInputs['bronya-technique-active']=false;
 delete app.state.modifierInputs['elation-certified-banger'];assert.equal(find('022'),undefined);assert.ok(find('02'),'missing CB only stops rider/total');
 }
});


test('Round24 Fudie inputs reach the promoted Talent and preserve already-included native effects',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1504',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.modifierInputs['fudie-gluttony-stacks']=2;
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='150404').name);let r=row();assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);near(r.nonCrit,5400);near(r.crit,17280);near(r.expected,11340);
 for(const m of data.structuredModifiers.filter(m=>m.source.id==='1504'))if(m.finalStatsInclusion)app.state.modifierInputs[m.finalStatsInclusion.inputKey]=true;
 app.node('hsrEnemyDefenseReduction').value='40';app.node('hsrStat-damageBonus').value='100';app.node('hsrStat-critDamage').value='220';r=row();assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);near(r.expected,11340);
 delete app.state.modifierInputs['fudie-gluttony-stacks'];assert.ok(!row());assert.ok(app.calculate().some(x=>x.attack?.name===data.attacks.find(a=>a.id==='1504031').name));
});


test('Round25 Rappa native action reaches three isolated components and keeps prior Break inputs local',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1317',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,breakEffect:230}});
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="rappa-consumed-charge"/g)||[]).length,1,'reuse the existing charge field');
 app.node('hsrWeakness').value='true';app.node('hsrToughnessState').value='broken';app.node('hsrMaxToughness').value='180';app.state.modifierInputs['rappa-consumed-charge']=5;app.state.modifierInputs['rappa-prior-break-vulnerability']=8;
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='131718').name),extra=3767.5533*3.3*.4*1.08*(.5*3.1*2),sb=3767.5533*3.3*.4*1.08*3.2*1.5*.6;let r=row();assert.ok(r,app.node('hsrResults').innerHTML.replace(/<[^>]*>/g,' ').slice(-2200));near(r.components.direct.nonCrit,3600);near(r.components.additionalBreak.value,extra);near(r.components.superBreak.value,sb);near(r.expected,5400+extra+sb);assert.match(app.node('hsrResults').innerHTML,/天賦追加撃破・会心不可/);assert.doesNotMatch(app.node('hsrResults').innerHTML,/NaN/);
 app.node('hsrEnemyTakenDamage').value='8';app.state.modifierInputs['rappa-prior-break-vulnerability-in-final']=true;near(row().expected,r.expected);assert.equal(app.state.modifierInputs['rappa-sealform-super-break-efficiency'],undefined,'local Sealform assumption does not overwrite the saved optional mode');
 app.node('hsrToughnessState').value='active';app.node('hsrWeakness').value='false';assert.ok(!row());assert.ok(app.calculate().some(a=>a.attack?.name===data.attacks.find(a=>a.id==='131701').name));
});

test('Round25 Fudie Ultimate resolves post-spend stacks without changing the saved first-hit snapshot',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1504',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:1}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});app.state.modifierInputs['fudie-gluttony-stacks']=8;
 const row=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='150403').name);let r=row(app);assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);assert.equal(Object.keys(r.components).length,4);near(r.components.direct.nonCrit,5400);near(r.components.freeTalent.nonCrit,3510);near(r.components.gluttonyBite1.nonCrit,5940);near(r.components.gluttonyBite2.nonCrit,4860);near(r.expected,5400*1.7+(3510+5940+4860)*2.1);assert.equal(app.state.modifierInputs['fudie-gluttony-stacks'],8);
 app.state.modifierInputs['fudie-gluttony-stacks']=12;r=row(app);assert.ok(r);assert.equal(Object.keys(r.components).length,5);app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(row(restored).expected,r.expected);assert.equal(restored.state.modifierInputs['fudie-gluttony-stacks'],12);
 restored.state.modifierInputs['fudie-a4-stack-in-final']=true;assert.ok(!row(restored));assert.ok(restored.calculate().some(a=>a.attack?.name===data.attacks.find(a=>a.id==='1504031').name));
});

test('Round25 Sparxie traps and owner CB reach separate direct/Elation actions through existing fields',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1501',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:1},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:37,critDamage:143,damageBonus:19,elation:111}});app.node('hsrStat-elation').value='111';app.node('hsrPunchline').value='20';app.node('hsrMerrymake').value='0';app.node('hsrElationTrace').value='10';app.state.modifierInputs['sparkle-interactive-trap-count']=4;app.state.modifierInputs['elation-certified-banger']=40;
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.equal(app.node('hsrElationSettings').hidden,false);for(const[id,d,c]of [['1501082',1.4,1.2],['1501032',1.166,.48]]){const r=row(id);assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);near(r.components.direct.nonCrit,3000*d*1.19*.36);near(r.components.banger.nonCrit,7535.107*c*2.11*(1+200/280)*.36);}
 assert.ok(row('150120'));delete app.state.modifierInputs['sparkle-interactive-trap-count'];assert.ok(!row('1501082'));assert.ok(row('150103'));assert.ok(row('150101'));
});


test('Round26 Aglaea resolves separate spirit values, combines prior-Silk components and restores the snapshot',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1402',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(row('140201'));assert.ok(!row('140208'));
 for(const[k,v]of Object.entries({atk:5000,critRate:20,critDamage:200,damageBonus:20,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1402:'+k]=v;
 const r=row('140208');assert.ok(r,app.node('hsrResults').innerHTML.replace(/<[^>]*>/g,' ').slice(-1600));near(r.components.aglaea.nonCrit,2160);near(r.components.laftra.nonCrit,4320);near(r.components.silkTalent.nonCrit,324);near(r.expected,9774);near(row('1402012').expected,2106);near(row('1140201').nonCrit,2376);
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(row('140208',restored).expected,9774);delete restored.state.modifierInputs['memosprite:1402:atk'];assert.ok(!row('140208',restored));assert.ok(row('140201',restored));
});

test('Round26 Silver Wolf LV.999 uses the shared Punchline field only for the explicit six-hit snapshot',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1506',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,elation:100}});app.node('hsrStat-elation').value='100';app.node('hsrPunchline').value='20';app.node('hsrMerrymake').value='0';app.node('hsrElationTrace').value='10';
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='150621').name);assert.equal(app.node('hsrElationSettings').hidden,false);let r=row();assert.ok(r,app.node('hsrCalculationFeedback').innerHTML);near(r.nonCrit,7535.107*5.4*2*(1+100/260)*.36);assert.equal(r.attack.hitCount,6);app.node('hsrPunchline').value='40';near(row().expected,7535.107*5.4*2*(1+200/280)*.36*1.5);app.node('hsrPunchline').value='';assert.ok(!row());assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='150601').name));
});


test('Round27 independent spirits reach results, keep missing inputs local and restore final snapshots',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 for(const id of ['1409','1415']){
  const app=await tool(undefined,data),cyrene=id==='1415',attackId=cyrene?'11415012':'1140901';
  app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6}],stats:{atk:3100,hp:6200,def:2100,critRate:100,critDamage:143,damageBonus:0}});
  const row=(x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===attackId).name);
  assert.ok(!row());assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id===id+'01').name),'owner remains calculable');
  for(const[k,v]of Object.entries({...(cyrene?{hp:8432}:{}),critRate:100,critDamage:143,damageBonus:175,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:'+id+':'+k]=v;
  app.state.modifierInputs[cyrene?'cyrene-recollection-allies':'hyacine-recorded-healing']=cyrene?2:12345;
  const expected=(cyrene?8432*.6*3:12345*.2)*2.75*.36*2.43,r=row();assert.ok(r,app.node('hsrResults').innerHTML.replace(/<[^>]*>/g,' ').slice(-1500));near(r.expected,expected);
  app.node('hsrStat-hp').value='9300';app.node('hsrStat-critDamage').value='299';near(row().expected,expected,'owner edits do not change spirit');
  app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="memosprite:/);assert.doesNotMatch(app.node('hsrConditionList').innerHTML,/undefined/);
  app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,data);near(row(restored).expected,expected);
  if(cyrene){assert.match(restored.node('hsrResults').innerHTML,/本体1回＋既発動の追加ヒット2回/);restored.state.modifierInputs['cyrene-recollection-allies']=0;near(row(restored).expected,expected/3);assert.match(restored.node('hsrResults').innerHTML,/本体1回＋既発動の追加ヒット0回/);}else{restored.state.modifierInputs['hyacine-recorded-healing']=0;near(row(restored).expected,0);}
  delete restored.state.modifierInputs['memosprite:'+id+':critDamage'];assert.ok(!row(restored));assert.ok(restored.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id===id+'01').name));
 }
});

test('Round27 Yaoguang normal CB and fixed20 Ultimate Aha stay separate from manual Punchline',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1502',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:160,damageBonus:19,elation:130}});
 app.node('hsrStat-elation').value='130';app.node('hsrMerrymake').value='0';app.node('hsrElationTrace').value='10';app.node('hsrPunchline').value='999';app.state.modifierInputs['elation-certified-banger']=40;
 const row=id=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name),cb=7535.107*.2*2.3*(1+200/280)*.36,total=row('1502012');assert.ok(total,app.node('hsrResults').innerHTML.replace(/<[^>]*>/g,' ').slice(-1600));near(total.components.direct.nonCrit,3000*.9*1.19*.36);near(total.components.banger.nonCrit,cb);
 const aha=row('150221');assert.ok(aha);near(aha.nonCrit,7535.107*2*2.3*(1+100/260)*.36*1.16);app.node('hsrPunchline').value='0';near(row('150221').expected,aha.expected);
 delete app.state.modifierInputs['elation-certified-banger'];assert.ok(!row('1502012'));assert.ok(row('150201'));assert.ok(row('150221'));
});


test('Round28 Evernight uses independent spirit HP and explicit preattack Memoquanta without inheriting the owner',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1413',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{hp:8000,atk:1300,def:2000,critRate:50,critDamage:100,damageBonus:110}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(!row('141303'));assert.ok(row('141301'));
 for(const[k,v]of Object.entries({hp:5000,critRate:70,critDamage:200,damageBonus:110,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1413:'+k]=v;
 app.node('hsrEnemyTakenDamage').value='30';app.state.modifierInputs['evernight-memoquanta']=15;
 near(row('141303').expected,5000*2*2.1*.36*1.3*2.4);near(row('1141301').expected,5000*.8*2.1*.36*1.3*2.4);assert.deepEqual(Array.from(row('1141301').breakdown.scalingTerms,t=>t.multiplierPercent),[50,30]);assert.ok(!row('1141307'));
 app.state.modifierInputs['evernight-memoquanta']=16;const value=row('1141307').expected;near(value,5000*1.92*2.1*.36*1.3*2.4);
 app.node('hsrStat-hp').value='16000';app.node('hsrStat-critDamage').value='333';near(row('1141307').expected,value);app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="evernight-memoquanta"/g)||[]).length,1);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1141307',saved).expected,value);delete saved.state.modifierInputs['evernight-memoquanta'];assert.ok(!row('1141301',saved));assert.ok(row('141303',saved));
});

test('Round28 Castorice keeps caster HP and Dragon crit separate and adds the same-event exit only at the threshold',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1407',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{hp:6000,atk:1300,def:2000,critRate:10,critDamage:50,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(!row('1140702'));assert.ok(row('140701'));
 for(const[k,v]of Object.entries({critRate:80,critDamage:200,damageBonus:30,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1407:'+k]=v;
 app.state.modifierInputs['castorice-breath-stage']=2;app.state.modifierInputs['castorice-dragon-hp-percent']=25;
 const joint=row('140709');assert.ok(joint);near(joint.components.caster.expected,6000*.3*.36*1.05);near(joint.components.dragon.expected,6000*.5*1.3*.36*2.6);near(joint.expected,6000*.3*.36*1.05+6000*.5*1.3*.36*2.6);
 let r=row('11407022');assert.ok(r,app.node('hsrResults').innerHTML.replace(/<[^>]*>/g,' ').slice(-1800));near(r.expected,6000*(.34+6*.4)*1.3*.36*2.6);assert.equal(Object.keys(r.components).length,2);
 app.state.modifierInputs['castorice-dragon-hp-percent']=.001;near(row('11407022').expected,r.expected);
 app.state.modifierInputs['castorice-dragon-hp-percent']=26;r=row('11407022');near(r.expected,6000*.34*1.3*.36*2.6);assert.equal(Object.keys(r.components).length,1);app.node('hsrStat-critDamage').value='333';near(row('11407022').expected,r.expected);
 app.node('hsrStat-hp').value='12000';near(row('11407022').expected,2*r.expected);app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row('11407022',saved).expected,2*r.expected);delete saved.state.modifierInputs['castorice-breath-stage'];assert.ok(!row('11407022',saved));assert.ok(row('1140701',saved));
});

test('Round28 Cyrene blessing uses the provider Mem Skill level, final-inclusion and recipient scope in the App',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1003',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100301').name),base=row().expected;app.state.party[0]={characterId:'1415',level:80,eidolon:0,traceLevels:{memSkill:6}};app.state.modifierInputs['cyrene-generic-blessing-active']=true;near(row().expected,base*1.4);delete app.state.party[0].traceLevels;app.state.party[0].level=10;near(row().expected,base*1.4);
 app.state.modifierInputs['cyrene-generic-blessing-in-final-stats']=true;app.node('hsrStat-damageBonus').value='40';near(row().expected,base*1.4);app.state.modifierInputs['cyrene-generic-blessing-in-final-stats']=false;app.node('hsrStat-damageBonus').value='0';app.state.party=[];near(row().expected,base);
});

test('Round29 Trailblazers keep Mem independent, resolve joint/True values locally, and restore saved inputs',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 for(const ch of ['8007','8008']){
  const app=await tool(undefined,data);app.window.HsrTool.applyProfileCharacter({id:ch,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:3000,hp:6000,def:2000,critRate:10,critDamage:50,damageBonus:0}});
  assert.equal(app.node('hsrMemSkillTraceField').hidden,false);assert.equal(app.node('hsrMemTalentTraceField').hidden,false);const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(row(ch+'01'));assert.ok(!row(ch+'03'));
  for(const[k,v]of Object.entries({atk:5000,critRate:80,critDamage:200,damageBonus:30,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:'+ch+':'+k]=v;
  near(row(ch+'03').expected,5000*2.4*1.3*.36*2.6);const joint=row(ch+'08');assert.ok(joint,app.node('hsrResults').innerHTML.slice(-800));near(joint.expected,3000*1.2*.36*1.05+5000*1.2*1.3*.36*2.6);assert.equal(Object.keys(joint.components).length,2);
  const memo=ch==='8007'?'1800701':'1800801';near(row(memo).expected,5000*2.34*1.3*.36*2.6);const ownBefore=row(ch+'01').expected;app.state.modifierInputs['mem-'+ch+'-on-field']=true;near(row(ch+'01').expected,ownBefore/1.05*1.098);near(row(memo).expected,5000*2.34*1.3*.36*2.6);app.state.modifierInputs['trace:'+ch+':1800703:mem-crit-damage-in-final-stats']=true;near(row(ch+'01').expected,ownBefore);
  const tr=ch==='8007'?'1800707':'1800807';assert.ok(!row(tr));app.state.modifierInputs['mem-original-damage']=10000;app.state.modifierInputs['mem-beneficiary-max-energy']=160;near(row(tr).expected,4000);
  app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,new RegExp('memosprite:'+ch+':atk'));assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="memosprite:'+ch+':critDamage"','g'))||[]).length,1);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row(ch+'03',saved).expected,row(ch+'03').expected);delete saved.state.modifierInputs['memosprite:'+ch+':atk'];assert.ok(!row(ch+'03',saved));assert.ok(row(ch+'01',saved));near(row(tr,saved).expected,4000);
 }
});

test('Round29 Rin repeats and Archer joint use existing inputs, provider removal and save restoration',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1508',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:10,critDamage:50,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(row('150803'));assert.ok(!row('150809'));assert.ok(!row('150805'));
 app.state.modifierInputs['rin-repeat-count']=5;near(row('150809').expected,3000*.9*6*.36*1.05);app.state.party[0]={characterId:'1015',level:10,eidolon:0};for(const[k,v]of Object.entries({atk:5000,critRate:80,critDamage:200,damageBonus:30,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1508:'+k]=v;
 const joint=row('150805');assert.ok(joint,app.node('hsrResults').innerHTML.slice(-1000));near(joint.expected,3000*3*.36*1.05+5000*3*1.3*.36*2.6);assert.equal(Object.keys(joint.components).length,2);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('150805',saved).expected,joint.expected);saved.state.party=[];assert.ok(!row('150805',saved));assert.ok(row('150803',saved));near(row('150809',saved).expected,3000*.9*6*.36*1.05);
});

test('Round29 Cyrene special components use the party Mem Skill level and fixed recipients in the App',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1403',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:10,critDamage:50,damageBonus:0}});
 const row=()=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='140301').name),base=row().expected;app.state.party[0]={characterId:'1415',level:10,eidolon:0,traceLevels:{memSkill:6}};app.state.modifierInputs['trace:1415:1141515:tribbie-defense-ignore-active']=true;near(row().expected,base*2/1.88);app.state.party[0].traceLevels.memSkill=1;near(row().expected,base*2/1.94);app.state.modifierInputs['trace:1415:1141515:tribbie-defense-ignore-in-final-stats']=true;near(row().expected,base);app.state.party=[];near(row().expected,base);
});

test('Round30 self-Bondmate Dragon action uses separate effective profiles, local missing inputs and saved restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1414',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:10,critDamage:50,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(row('141403'));assert.ok(!row('1414039'));
 for(const[profile,values]of Object.entries({dragon:{critRate:20,critDamage:100,damageBonus:30,defenseIgnore:0,resistancePenetration:0},additional:{critRate:80,critDamage:200,damageBonus:50,defenseIgnore:0,resistancePenetration:0}}))for(const[k,v]of Object.entries(values))app.state.modifierInputs['dragon:1414:'+profile+':'+k]=v;
 const r=row('1414039');assert.ok(r,app.node('hsrResults').innerHTML.slice(-1300));near(r.components.dragon.expected,3000*.8*1.3*.36*1.2);near(r.components.bondmate.expected,3000*.8*1.5*.36*2.6);near(r.components.a6.expected,3000*.4*1.5*.36*2.6);near(r.expected,3000*.8*1.3*.36*1.2+3000*1.2*1.5*.36*2.6);assert.equal(Object.keys(r.components).length,3);
 app.node('hsrStat-critDamage').value='333';near(row('1414039').expected,r.expected);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1414039',saved).expected,r.expected);delete saved.state.modifierInputs['dragon:1414:additional:critRate'];assert.ok(!row('1414039',saved));assert.ok(row('141403',saved));
});

test('Himeko calculates explicit finisher and self-assist while missing pulse input remains local',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1510',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:40,critDamage:90,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);near(row('151003').expected,3000*2.4*.36*1.36);near(row('151022').expected,3000*3.28*.45*1.68);assert.ok(!row('151009'));app.state.modifierInputs['himeko-departure-drive']=1;near(row('151009').expected,3000*.2*.36*1.36);app.state.modifierInputs['himeko-departure-drive']=3;near(row('151009').expected,3000*(.2+3*(.3+.3))*.36*1.36);assert.ok(row('151003'));near(row('151009').components.shots.expected,3000*3*.6*.36*1.36);near(row('151009').components.pulse.expected,3000*.2*.36*1.36);app.state.modifierInputs['himeko-departure-drive']=2;near(row('151009').expected,3000*(.2+2*.3)*.36*1.36);
 app.state.modifierInputs['himeko-departure-drive']=1;app.state.modifierInputs['trace:1510:151002:party-damage-active']=true;near(row('151022').expected,3000*3.28*1.2*.45*1.68);app.state.modifierInputs['trace:1510:151002:party-damage-in-final-stats']=true;app.node('hsrStat-damageBonus').value='20';near(row('151022').expected,3000*3.28*1.2*.45*1.68);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('151022',saved).expected,row('151022').expected);saved.state.modifierInputs['himeko-departure-drive']=3;saved.node('hsrStat-atk').handlers.input();const restored=await tool(saved.storage,data);near(row('151009',restored).expected,3000*2*1.2*.36*1.36);delete restored.state.modifierInputs['himeko-departure-drive'];assert.ok(!row('151009',restored));assert.ok(row('151003',restored));
});

test('Round30 Pearl exposes only her own CB rider and preserves direct attacks when CB is missing or over cap',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1503',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'Elation',level:10}],stats:{atk:3000,hp:6000,def:3100,critRate:50,critDamage:160,damageBonus:0,elation:130}});app.node('hsrStat-elation').value='130';app.node('hsrMerrymake').value='0';
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(!row('1503081'));assert.ok(row('150301'));app.state.modifierInputs['elation-certified-banger']=40;const r=row('1503081');assert.ok(r,app.node('hsrResults').innerHTML.slice(-1200));near(r.expected,7535.107*.15*2.3*(1+200/280)*.36*1.8);app.state.conditions.push({id:'pending-def',name:'未算入のDEF支援',category:'statFlat',stat:'def',value:1000,enabled:true});assert.ok(!row('1503081'));assert.ok(row('150301'));app.state.conditions=[];app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1503081',saved).expected,r.expected);saved.state.modifierInputs['elation-certified-banger']=51;assert.ok(!row('1503081',saved));assert.ok(row('150301',saved));assert.equal(app.node('hsrPunchlineField').hidden,true);
});


test('Round31 Pearl independent owner inputs, optional next proc and exact pair survive save and local exclusions',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1503',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:3100,critRate:50,critDamage:160,damageBonus:0,elation:130}});
 app.node('hsrStat-elation').value='130';app.node('hsrMerrymake').value='0';
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 app.state.modifierInputs['elation-certified-banger']=40;assert.ok(row('1503081'));assert.ok(!row('150308'));
 app.state.party[0]={...app.state.party[0],characterId:'1502',eidolon:0};
 for(const[k,v]of Object.entries({elation:207.5,critRate:63,critDamage:188.25,merrymake:0,defenseIgnore:17,icePen:19,physicalPen:13,physicalResistance:41}))app.state.modifierInputs['pearl-learned:1502:'+k]=v;
 app.state.modifierInputs['pearl-learned-punchline']=27;app.state.modifierInputs['pearl-next-proc-count']=0;
 const r=row('150308');assert.ok(r,app.node('hsrResults').innerHTML.slice(-2000));assert.equal(Object.keys(r.components).length,3);
 near(r.components.direct.expected,3100*.36*1.8);near(r.components.own.expected,7535.107*.15*2.3*(1+200/280)*.36*1.8);
 near(r.components.learned.expected,7535.107*.6*3.075*(1+135/267)*(100/183)*.99*.9*(1+.63*1.8825));
 app.state.modifierInputs['pearl-next-proc-count']=1;assert.ok(!row('150308'));assert.ok(row('1503081'));
 app.state.modifierInputs['pearl-next-punchline']=0;const four=row('150308');assert.ok(four,app.node('hsrResults').innerHTML.slice(-2000));assert.equal(Object.keys(four.components).length,4);near(four.expected,r.expected+7535.107*.15*2.3*.36*1.8);
 const other=row('1503201');assert.ok(other,app.node('hsrResults').innerHTML.slice(-1200));near(other.expected,7535.107*.15*3.075*(100/183)*.72*.9*(1+.63*1.8825));
 for(const key of ['elation','damageBonus','critRate'])app.node('hsrStat-'+key).value='';near(row('1503201').expected,other.expected);assert.ok(!row('150308'));for(const[key,value]of Object.entries({elation:130,damageBonus:0,critRate:50}))app.node('hsrStat-'+key).value=String(value);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('150308',saved).expected,four.expected);near(row('1503201',saved).expected,other.expected);
 delete saved.state.modifierInputs['pearl-learned:1502:critRate'];assert.ok(!row('150308',saved));assert.ok(row('1503080',saved));assert.ok(!row('1503201',saved));assert.ok(row('1503081',saved));assert.ok(row('150301',saved));
 app.state.party=[];assert.ok(!row('150308'));assert.ok(!row('150320'));assert.ok(row('1503081'));
});

test('Round31 Cyrene Military Merit requires both providers, bound recipient and explicit activation',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1003',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:6000,def:2000,critRate:37,critDamage:147,damageBonus:23}});
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,level:6,traceLevels:{memSkill:6}};
 app.state.party[1]={...app.state.party[1],characterId:'1412',eidolon:0};
 const row=(x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100301').name),base=row().expected;
 const key='trace:1415:1141523:military-merit-crit-damage';app.state.modifierInputs[key+'-active']=true;near(row().expected,base);
 app.state.modifierInputs['cyrene-merit-recipient']=1003;near(row().expected,4317*.36*1.23*(1+.37*1.77));
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row(saved).expected,row().expected);
 saved.state.modifierInputs['cyrene-merit-recipient']=1102;near(row(saved).expected,base);
 app.state.modifierInputs[key+'-in-final-stats']=true;near(row().expected,base);app.state.modifierInputs[key+'-in-final-stats']=false;
 app.state.party[1].characterId='';near(row().expected,base);app.state.party[1].characterId='1412';app.state.party[0].characterId='';near(row().expected,base);
});


test('Round32 Ocean uses the provider Mem Skill level, existing own-DoT inputs, local failures and saved restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1410',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name),key='trace:1415:1141522:serin-damage-active';assert.ok(!row('1410012'));assert.ok(row('141001'));
 app.state.modifierInputs[key]=true;[111,222,0,444].forEach((v,i)=>app.state.modifierInputs['serin-detonation-original:141004'+(i+1)]=v);
 const normal=row('1410012'),skill=row('1410022');assert.ok(normal,app.node('hsrResults').innerHTML.slice(-1600));assert.ok(skill,app.node('hsrResults').innerHTML.slice(-1600));
 near(normal.components['ocean-1'].expected,66.6);near(skill.components['ocean-1'].expected,88.8);near(normal.expected,3000*.36*2.2*1.5+777*.6);
 near(skill.expected,3000*1.4*.36*2.2*1.2*1.5+777*.8);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1410012',saved).expected,normal.expected);
 delete saved.state.modifierInputs['serin-detonation-original:1410041'];assert.ok(!row('1410012',saved));assert.ok(row('141001',saved));
 app.state.party[0].traceLevels.memSkill=1;near(row('1410012').components['ocean-1'].expected,33.3);
 app.state.party[0].characterId='';assert.ok(!row('1410012'));assert.ok(row('141001'));
});

test('Round32 Fire add-on and True Knowledge apply to the actual recipient and restore without double counting',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1408',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:6000,def:2000,critRate:37,critDamage:143,damageBonus:123}});
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);app.state.modifierInputs['cyrene-phainon-blessing-active']=true;app.state.modifierInputs['phainon-kaslana-form']=true;app.state.modifierInputs['phainon-kaslana-atk-in-final-stats']=true;app.state.modifierInputs['phainon-a6-atk-in-final-stats']=true;
 app.state.modifierInputs['element-damage:1408:Fire']=31;app.state.modifierInputs['enemy-resistance:Fire']=33;
 const fire=row('11415211');assert.ok(fire,app.node('hsrResults').innerHTML.slice(-1800));near(fire.expected,4317*.1*5*1.31*.5*.67*.9*(1+.53*1.43));app.state.modifierInputs['phainon-a6-atk-in-final-stats']=false;app.state.modifierInputs['phainon-a6-atk-stacks']=1;const ownBaseAtk=app.state.data.characters.find(c=>c.id==='1408').base.atk;near(row('11415211').expected,fire.expected*(4317+ownBaseAtk*.5)/4317);app.state.modifierInputs['phainon-a6-atk-in-final-stats']=true;
 app.state.modifierInputs['trace:1415:1141521:kaslana-immortal-flame-crit-rate-in-final-stats']=true;app.node('hsrStat-critRate').value='53';near(row('11415211').expected,fire.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('11415211',saved).expected,fire.expected);saved.state.modifierInputs['phainon-kaslana-form']=false;assert.ok(!row('11415211',saved));assert.ok(row('140801',saved),saved.node('hsrResults').innerHTML.slice(-2000));
 app.state.party[0].characterId='';assert.ok(!row('11415211'));assert.ok(row('140801'));
 app.window.HsrTool.applyProfileCharacter({id:'1405',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:6000,def:2000,critRate:37,critDamage:143,damageBonus:23}});app.node('hsrToughnessState').value='broken';
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 const before=row('140501').expected,baseAtk=app.state.data.characters.find(c=>c.id==='1405').base.atk;app.state.modifierInputs['trace:1415:1141518:true-knowledge-active']=true;
 near(row('140501').expected,before*(4317+baseAtk*.6)/4317);app.state.party[0].characterId='';near(row('140501').expected,before);
});


test('Round33 Phainon closes the accepted scope while only Ruin4 Skill7-9 are rejected and all major actions remain available',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id:'1408',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:7711,def:1937,critRate:37,critDamage:143,damageBonus:23}});
 Object.assign(app.state.modifierInputs,{'phainon-kaslana-form':true,'phainon-kaslana-atk-in-final-stats':true,'phainon-a6-atk-in-final-stats':true,'phainon-counter-flame-stacks':1,'phainon-ruin-stacks':4});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name);
 for(const id of ['140801','140802','140803','140808','140809','140811'])assert.ok(row(id),id+' '+app.node('hsrResults').innerHTML.slice(-700));
 for(const level of [7,8,9]){app.node('hsrSkillTrace').value=String(level);assert.ok(!row('140811'));assert.ok(row('140802'));assert.ok(row('140809'));assert.match(app.node('hsrResults').innerHTML,/壊傷4層はスキルLv1～6・10/);}
 app.state.modifierInputs['phainon-ruin-stacks']=3;assert.ok(row('140811'));app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.ok(row('140811',saved));saved.state.modifierInputs['phainon-ruin-stacks']=4;assert.ok(!row('140811',saved));assert.ok(row('140801',saved));
});

test('Round33 Wisdom reuses Anaxa native modifiers, separates 3/8/16-hit results and restores the explicit extra-hit state',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1405',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:7711,def:1937,critRate:37,critDamage:143,damageBonus:23}});app.node('hsrToughnessState').value='broken';
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name);assert.ok(!row('1405023'));const base=row('140502');assert.ok(base);
 app.state.modifierInputs['cyrene-anaxa-extra-hits-active']=true;const eight=row('1405023');assert.ok(eight,app.node('hsrResults').innerHTML.slice(-1800));near(eight.expected,base.expected*8/5);near(row('11415181').expected,base.expected*3/5);near(row('1405024').expected,eight.expected*2);near(row('1405013').expected,row('140501').expected+eight.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1405023',saved).expected,eight.expected);saved.state.modifierInputs['cyrene-anaxa-extra-hits-active']=false;assert.ok(!row('1405023',saved));assert.ok(row('140502',saved));app.state.party[0].characterId='';assert.ok(!row('1405023'));assert.ok(row('140502'));
});

test('Round33 Passage uses one or two barrier components, requires a saturated pre-FUA A2 snapshot and saves its existing toggle',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1403',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:11037,def:1937,critRate:37,critDamage:143,damageBonus:23}});
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'tribbie-zone-active':true,'tribbie-followup-damage-stacks':3,'traceNode:1403:1403102:party-hp-snapshot-in-final':true});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name);const one=row('1403033');assert.ok(one,app.node('hsrResults').innerHTML.slice(-1200));assert.equal(Object.keys(one.components).length,1);
 app.state.modifierInputs['trace:1415:1141515:tribbie-defense-ignore-active']=true;const two=row('1403033');assert.ok(two,app.node('hsrResults').innerHTML.slice(-1800));assert.equal(Object.keys(two.components).length,2);near(two.expected,one.expected*2/0.94);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1403033',saved).expected,two.expected);saved.state.modifierInputs['tribbie-followup-damage-stacks']=2;assert.ok(!row('1403033',saved));assert.ok(row('1403031',saved));app.state.party[0].characterId='';assert.equal(Object.keys(row('1403033').components).length,1);
});

test('Round34 Ocean uses selected E0 DoT owners, preserves native subtotal and restores foreign snapshot inputs',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1410',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:23}});
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};app.state.party[1]={...app.state.party[1],characterId:'1005',eidolon:0};app.state.party[2]={...app.state.party[2],characterId:'1210',eidolon:0};
 Object.assign(app.state.modifierInputs,{'trace:1415:1141522:serin-damage-active':true,'serin-detonation-original:1410041':111,'serin-detonation-original:1410042':222,'serin-detonation-original:1410043':0,'serin-detonation-original:1410044':444,'ocean-foreign-original:1005:100503':1234.5,'ocean-foreign-original:1210:121002':4567.125});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),old=row('1410012'),out=row('1410013');assert.ok(out,app.node('hsrResults').innerHTML.match(/<article[^>]*data-hsr-pending-input[\s\S]*?<\/article>/g)?.join('\n'));near(out.expected,old.expected+(1234.5+4567.125)*.6);assert.equal(Object.keys(out.components).length,3);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1410013',saved).expected,out.expected);delete saved.state.modifierInputs['ocean-foreign-original:1005:100503'];assert.ok(!row('1410013',saved));assert.ok(row('1410012',saved));saved.state.party[1].characterId='';near(row('1410013',saved).expected,row('1410012',saved).expected+4567.125*.6);saved.state.party[2].characterId='';assert.ok(!row('1410013',saved));assert.ok(row('1410012',saved));
});

test('Round34 Genesis applies independent Demi values separately to Trailblazer and Mem once and restores inclusion choices',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'8007',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:23}});app.node('hsrMemSkillTrace').value='6';
 app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'memosprite:8007:atk':2300,'memosprite:8007:critRate':13,'memosprite:8007:critDamage':77,'memosprite:8007:damageBonus':31,'memosprite:8007:defenseIgnore':12,'memosprite:8007:resistancePenetration':8,'cyrene-genesis-demi-hp':12345,'cyrene-genesis-demi-crit-rate':40});
 app.state.modifierInputs['cyrene-genesis-active']=true;app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();for(const key of ['cyrene-genesis-demi-hp','cyrene-genesis-demi-crit-rate'])assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input=\"'+key+'\"','g'))||[]).length,1,'one visible reference control '+key+' '+app.node('hsrConditionList').innerHTML.slice(0,1700));app.state.modifierInputs['cyrene-genesis-active']=false;
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),main=row('800701'),memo=row('1800701');assert.ok(main&&memo,app.node('hsrResults').innerHTML.match(/<article[^>]*data-hsr-pending-input[\s\S]*?<\/article>/g)?.join('\n'));app.state.modifierInputs['cyrene-genesis-active']=true;
 const mainBuff=row('800701'),memoBuff=row('1800701');assert.ok(mainBuff&&memoBuff,app.node('hsrResults').innerHTML.slice(-1900));near(mainBuff.expected,main.nonCrit*(4173+12345*.16)/4173*(1+(.37+.4*.72)*1.43));near(memoBuff.expected,memo.nonCrit*(2300+12345*.16)/2300*(1+(.13+.4*.72)*.77));assert.ok(row('800708'));
 app.state.modifierInputs['trace:1415:1141513:memosprite-atk-in-final-stats']=true;app.state.modifierInputs['trace:1415:1141513:memosprite-crit-rate-in-final-stats']=true;app.state.modifierInputs['memosprite:8007:atk']=2300+12345*.16;app.state.modifierInputs['memosprite:8007:critRate']=13+40*.72;near(row('1800701').expected,memoBuff.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('1800701',saved).expected,memoBuff.expected);saved.state.party[0].characterId='';near(row('800701',saved).expected,main.expected);
});

test('Round34 Earth uses shield durability rather than ATK and keeps a missing shield local with save restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1414',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4173,hp:9172,def:1839,critRate:37,critDamage:143,damageBonus:23}});app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'cyrene-earth-active':true,'cyrene-earth-companion-shield':2675.5,'dragon:1414:additional:critRate':37,'dragon:1414:additional:critDamage':143,'dragon:1414:additional:damageBonus':31,'dragon:1414:additional:defenseIgnore':12,'dragon:1414:additional:resistancePenetration':8});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),out=row('11415251');assert.ok(out,app.node('hsrResults').innerHTML.slice(-1700));assert.match(app.node('hsrResults').innerHTML,/同袍バリア耐久 × 変換倍率/);near(out.expected,2675.5*.8*1.31*(100/188)*.88*.9*(1+.37*1.43));app.node('hsrStat-atk').value='9000';near(row('11415251').expected,out.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('11415251',saved).expected,out.expected);delete saved.state.modifierInputs['cyrene-earth-companion-shield'];assert.ok(!row('11415251',saved));assert.ok(row('141401',saved));app.state.modifierInputs['cyrene-earth-active']=false;assert.ok(!row('11415251'));assert.ok(row('141401'));
});

test('Round35 LifeDeath reaches the Dragon Talent and only its six-hit component, with explicit summon snapshot and restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1407',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:8432,def:1900,critRate:11,critDamage:57,damageBonus:7}});app.node('hsrMemSkillTrace').value='6';app.node('hsrMemTalentTrace').value='6';app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'memosprite:1407:critRate':37,'memosprite:1407:critDamage':143,'memosprite:1407:damageBonus':19,'memosprite:1407:defenseIgnore':4,'memosprite:1407:resistancePenetration':7,'castorice-breath-stage':2,'castorice-dragon-hp-percent':25,'cyrene-castorice-excess-newbud':100});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),base=row('1140706'),breath=row('1140702');assert.ok(base&&breath);app.state.modifierInputs['cyrene-life-death-active']=true;const buff=row('1140706'),total=row('11407022');assert.ok(buff&&total,app.node('hsrResults').innerHTML.slice(-1300));near(buff.expected,base.expected*112/40);near(row('1140702').expected,breath.expected);near(total.expected,breath.expected+buff.expected);near(total.components.exit.expected,buff.expected);
 app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row('1140706',saved).expected,buff.expected);delete saved.state.modifierInputs['cyrene-castorice-excess-newbud'];assert.ok(!row('1140706',saved));assert.ok(!row('11407022',saved));assert.ok(row('1140702',saved));app.state.party[0].characterId='';near(row('1140706').expected,base.expected);
});

test('Round35 Years applies finisher-only DMG and explicit past Skill CD once to Long, without changing the caster',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1413',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:11037,def:1900,critRate:11,critDamage:57,damageBonus:7}});app.node('hsrMemSkillTrace').value='6';app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'memosprite:1413:hp':8432,'memosprite:1413:critRate':37,'memosprite:1413:critDamage':143,'memosprite:1413:damageBonus':19,'memosprite:1413:defenseIgnore':4,'memosprite:1413:resistancePenetration':7,'evernight-memoquanta':16,'cyrene-years-longnight-crit-damage-at-skill-application':180});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),fin=row('1141307'),skill=row('1141301'),ult=row('141303'),caster=row('141301');assert.ok(fin&&skill&&ult&&caster);app.state.modifierInputs['cyrene-years-active']=true;near(row('1141307').expected,fin.expected*1.37/1.19);near(row('1141301').expected,skill.expected);near(row('141303').expected,ult.expected);near(row('141301').expected,caster.expected);
 app.state.modifierInputs['cyrene-years-skill-buff-active']=true;const buff=row('1141307'),expectedCrit=1+.37*(1.43+.216);near(buff.expected,fin.nonCrit*1.37/1.19*expectedCrit);near(row('141303').expected,ult.nonCrit*expectedCrit);app.node('hsrStat-critDamage').value='777';near(row('1141307').expected,buff.expected);
 app.state.modifierInputs['trace:1415:1141524:long-skill-crit-damage-increment-in-final-stats']=true;app.state.modifierInputs['memosprite:1413:critDamage']=164.6;near(row('1141307').expected,buff.expected);app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row('1141307',saved).expected,buff.expected);saved.state.modifierInputs['trace:1415:1141524:long-skill-crit-damage-increment-in-final-stats']=false;delete saved.state.modifierInputs['cyrene-years-longnight-crit-damage-at-skill-application'];assert.ok(!row('1141307',saved));assert.ok(row('141301',saved));
});

test('Round35 Cipher reuses its blessing state for target DEF and preserves recorded true damage and final inclusion',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1406',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:4317,hp:11037,def:1900,critRate:37,critDamage:143,damageBonus:23,speed:100}});app.state.party[0]={...app.state.party[0],characterId:'1415',eidolon:0,traceLevels:{memSkill:6}};
 Object.assign(app.state.modifierInputs,{'trace:1415:1141520:cipher-damage-active':true,'cyrene-cipher-patron-state':0,'cipher-recorded-before-25':10000,'cipher-recorded-before-75':12000});
 const row=(id,x=app)=>x.calculate().find(q=>q.attack?.name===data.attacks.find(a=>a.id===id).name),nonPatron=row('140601');assert.ok(nonPatron,app.node('hsrResults').innerHTML.slice(-1200));app.state.modifierInputs['cyrene-cipher-patron-state']=1;const patron=row('140601');near(patron.expected,nonPatron.expected*.94/.9);const combined=row('140603');assert.ok(combined);near(combined.expected,(combined.nonCrit-11500)*(1+.37*1.43)+11500);
 app.state.modifierInputs['trace:1415:1141520:cipher-defense-reduction-in-final-stats']=true;app.node('hsrEnemyDefenseReduction').value='20';near(row('140601').expected,patron.expected);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row('140601',saved).expected,patron.expected);saved.state.modifierInputs['trace:1415:1141520:cipher-defense-reduction-in-final-stats']=false;saved.state.modifierInputs['cyrene-cipher-patron-state']=.5;assert.ok(!row('140601',saved));
});


test('round36 Dahlia normal dancer conversion uses separate N/T levels, one explicit input and save restoration',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),key='dahlia-normal-base-toughness',near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1321';app.node('hsrNormalTrace').value='6';app.node('hsrTalentTrace').value='10';
 for(const[k,v]of Object.entries({atk:3000,breakEffect:200,critRate:50,critDamage:100}))app.node('hsrStat-'+k).value=String(v);
 app.node('hsrToughnessState').value='broken';app.node('hsrWeakness').value='true';
 const name=data.attacks.find(a=>a.id==='1321012').name,find=x=>x.calculate().find(r=>r.attack?.name===name);
 assert.equal(find(app),undefined);assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='132101').name));
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(new RegExp('data-structured-input="'+key+'"','g'))||[]).length,1);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:key,structuredStrict:'true'},value:'10'}});
 const result=find(app);assert.ok(result,app.node('hsrResults').innerHTML);near(result.nonCrit,1200+3767.5533*.6*3*.4);near(result.expected,1800+3767.5533*.6*3*.4);assert.equal(Object.keys(result.components).length,2);
 app.state.modifierInputs['dahlia-skill-field-active']=true;near(find(app).expected,1800+3767.5533*.6*3*.4*1.5);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved).expected,find(app).expected);saved.node('hsrTalentTrace').value='1';near(find(saved).expected,1800+3767.5533*.3*3*.4*1.5);
 saved.node('hsrToughnessState').value='active';assert.equal(find(saved),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='132101').name));
});


test('round37 previous Welt shares prior Slow state and auto-applies Ultimate A2 through save restoration',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
 app.state.characterId='1004';app.state.enhancementState='previous';app.node('hsrEnhancementState').value='previous';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);
 app.node('hsrWeakness').value='false';app.node('hsrToughnessState').value='active';app.node('hsrNormalTrace').value='6';app.node('hsrSkillTrace').value='10';app.node('hsrUltimateTrace').value='10';app.node('hsrTalentTrace').value='10';
 const name=id=>data.attacks.find(a=>a.id===id).name,find=(x,id)=>x.calculate().find(r=>r.attack?.name===name(id));assert.equal(find(app,'1004022'),undefined);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-toggle="welt-enemy-slowed"/g)||[]).length,1);
 app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:'welt-enemy-slowed'},checked:true}});
 const n=find(app,'1004012'),sk=find(app,'1004022'),u=find(app,'1004032');assert.ok(n&&sk&&u,app.node('hsrResults').innerHTML);
 near(n.expected,3000*(1+.6)*.36*1.5);near(sk.expected,3000*(.72*3+.6*3)*.36*1.5);near(u.expected,3000*(1.5+.6*2)*.36*1.12*1.5);near(find(app,'100403').expected,3000*1.5*.36*1.12*1.5);
 app.state.modifierInputs['welt-punishment-in-final-enemy-input']=true;app.node('hsrEnemyTakenDamage').value='12';near(find(app,'1004032').expected,u.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,'1004032').expected,u.expected);saved.state.modifierInputs['welt-enemy-slowed']=false;assert.equal(find(saved,'1004032'),undefined);assert.ok(saved.calculate().some(r=>r.attack?.name===name('100401')));
 saved.node('hsrEnhancementState').value='enhanced';saved.state.enhancementState='enhanced';assert.equal(find(saved,'1004012'),undefined,"original composition is not shown in enhanced mode");
});


test('round38 Imbibitor Lunae displays all five fixed-state attacks with per-hit stacks and restored trace levels',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);app.state.characterId='1213';
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,damageBonus:0}))app.node('hsrStat-'+k).value=String(v);app.node('hsrWeakness').value='false';app.node('hsrToughnessState').value='active';app.node('hsrNormalTrace').value='6';app.node('hsrSkillTrace').value='10';app.node('hsrUltimateTrace').value='10';app.node('hsrTalentTrace').value='10';
 const name=id=>data.attacks.find(a=>a.id===id).name,find=(x,id)=>x.calculate().find(r=>r.attack?.name===name(id));
 for(const[id,n]of [['121301',2],['121308',3],['121310',5],['121312',7],['121303',3]]){const r=find(app,id);assert.ok(r,app.node('hsrResults').innerHTML);assert.equal(Object.keys(r.components).length,n);}
 const r=find(app,'121312'),w=[.142,.142,.142,.142,.142,.142,.148];let expected=0;w.forEach((v,i)=>{const n=3000*5*v*(1+.1*i)*.36,cd=1+.12*Math.max(0,i-2);expected+=n*(1+.5*cd);});near(r.expected,expected);
 assert.match(app.node('hsrResults').innerHTML,/入力DMG\/CDにこの2効果の事前加算がない/);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(find(saved,'121312').expected,r.expected);saved.node('hsrSkillTrace').value='1';assert.ok(find(saved,'121312').expected<r.expected);saved.node('hsrWeakness').value='true';assert.equal(find(saved,'121312'),undefined);
});


test('round40 Himeko shares one accord selector, applies scoped support automatically, and restores each owner correctly',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),key='himeko-departure-accord',near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1510',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:8123,def:1321,critRate:40,critDamage:90,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="himeko-departure-accord"/g)||[]).length,1);
 const choose=v=>app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredInput:key},value:String(v)}});
 choose(1);near(row('151022').expected,3000*3.28*2*.45*1.68);near(row('151003').expected,3000*2.4*3*.36*1.36);assert.equal(Object.keys(row('151022').components).length,2);
 app.state.modifierInputs['himeko-departure-drive']=3;near(row('151009').expected,3000*2*3*.36*1.36);
 choose(2);near(row('151022').expected,3000*3.28*.45*2.48);near(row('151003').expected,3000*2.4*.36*1.76);near(row('151009').expected,3000*2*.36*1.76);
 const before=row('151022').expected;Object.assign(app.state.modifierInputs,{'trace:1510:accord-crit:in-final-stats':true,'trace:1510:accord-skill-crit:in-final-stats':true,'trace:1510:151004:crit-damage-in-final-stats':true,'trace:1510:151004:res-pen-in-final-stats':true});app.node('hsrStat-critDamage').value='370';app.node('hsrEnemyResistancePenetration').value='20';near(row('151022').expected,before);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);assert.equal(saved.state.modifierInputs[key],2);near(row('151022',saved).expected,before);saved.state.modifierInputs[key]=3;assert.ok(!row('151022',saved));
 const ally=await tool(undefined,data);ally.window.HsrTool.applyProfileCharacter({id:'1002',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:2300,hp:9991,def:1400,critRate:30,critDamage:100,damageBonus:0}});ally.state.party[0]={...ally.state.party[0],characterId:'1510',eidolon:0,traceLevels:{talent:1}};
 const base=row('100201',ally).nonCrit;ally.state.modifierInputs[key]=2;near(row('100201',ally).expected,base*1.45);ally.state.modifierInputs[key]=1;near(row('100201',ally).expected,base*1.3);ally.state.modifierInputs[key]=2;ally.state.party[0].characterId='';near(row('100201',ally).expected,base*1.3);
 ally.state.characterId='1003';ally.state.party=[{characterId:'1510',eidolon:0,traceLevels:{talent:1}},{characterId:'1415',eidolon:0,traceLevels:{memSkill:6}},{characterId:'1412',eidolon:0}];ally.state.conditionTab='パーティ';ally.node('hsrConditionDialogOpen').handlers.click();assert.match(ally.node('hsrConditionList').innerHTML,/data-comparison-choice="cyrene-merit-recipient"/);assert.equal((ally.node('hsrConditionList').innerHTML.match(/data-structured-input="himeko-departure-accord"/g)||[]).length,1);
});


test('round41 foreign-user support keeps the Himeko snapshot separate, resolves the new accord, and restores locally',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1002',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:1},{type:'Ultra',level:1},{type:'Talent',level:1}],stats:{atk:777,hp:9991,def:1400,critRate:10,critDamage:50,damageBonus:7}});app.state.party[0]={...app.state.party[0],characterId:'1510',eidolon:0,traceLevels:{talent:10,skill:10}};
 const foreign=x=>x.calculate().find(r=>r.attack?.name.includes('が使用・所有者：姫子')),normal=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100201').name);assert.ok(!foreign(app));assert.ok(normal(app));app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="party-reference:1510:atk"/g)||[]).length,1);
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,Fire:0,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['party-reference:1510:'+k]=v;app.state.modifierInputs['enemy-resistance:Fire']=20;app.state.modifierInputs['himeko-departure-accord']=2;
 const r=foreign(app);assert.ok(r,app.node('hsrResults').innerHTML);near(r.expected,3000*2.32*2*.45*1.9);assert.equal(Object.keys(r.components).length,2);near(r.components.area.expected,3000*1.6*2*.45*1.9);near(r.components.shots.expected,3000*.24*3*2*.45*1.9);
 app.node('hsrStat-atk').value='999999';app.node('hsrStat-critDamage').value='9999';app.node('hsrStat-damageBonus').value='999';near(foreign(app).expected,r.expected);app.node('hsrEnemyTakenDamage').value='15';near(foreign(app).expected,r.expected*1.15);app.node('hsrEnemyTakenDamage').value='0';
 app.state.modifierInputs['party-reference:1510:included:trace:1510:151025:accord-damage']=true;app.state.modifierInputs['party-reference:1510:Fire']=100;near(foreign(app).expected,r.expected);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(foreign(saved).expected,r.expected);delete saved.state.modifierInputs['party-reference:1510:atk'];assert.ok(!foreign(saved));assert.ok(normal(saved));saved.state.party[0].characterId='';assert.ok(!foreign(saved));
 app.state.modifierInputs['party-reference:1510:included:trace:1510:151025:accord-damage']=false;app.state.modifierInputs['party-reference:1510:Fire']=0;app.state.characterId='1001';near(foreign(app).expected,3000*2.32*.45*2.9);app.state.characterId='1101';app.state.modifierInputs['himeko-departure-accord']=0;near(foreign(app).expected,3000*2.32*.45*1.9);app.state.modifierInputs['himeko-departure-accord']=2;near(foreign(app).expected,3000*2.32*.45*2.9);app.state.party[0].traceLevels.talent=1;near(foreign(app).expected,3000*1.16*.405*2.2);
});


test('round42 new Himeko assist users preserve ownership, prior accord, inclusion, local stopping and restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),foreign=x=>x.calculate().find(r=>r.attack?.name.includes('が使用・所有者：姫子'));
 app.window.HsrTool.applyProfileCharacter({id:'1313',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:1},{type:'Ultra',level:1},{type:'Talent',level:1}],stats:{atk:777,hp:9991,def:1400,critRate:10,critDamage:50,damageBonus:7}});
 app.state.party[0]={...app.state.party[0],characterId:'1510',eidolon:0,traceLevels:{talent:10,skill:10}};
 for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,Fire:0,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['party-reference:1510:'+k]=v;app.state.modifierInputs['enemy-resistance:Fire']=20;
 for(const[id,forced]of[['1313',1],['1004',2],['1202',null]])for(const prior of[0,1,2]){
  app.state.characterId=id;app.state.modifierInputs['himeko-departure-accord']=prior;const r=foreign(app),mode=forced??prior,cd=1.8+(mode===2?2:0),nc=3000*2.32*.45*(mode===1?2:1);assert.ok(r);near(r.nonCrit,nc);near(r.crit,nc*(1+cd));near(r.expected,nc*(1+.5*cd));assert.equal(app.state.modifierInputs['himeko-departure-accord'],prior);
  app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="party-reference:1510:atk"/g)||[]).length,1);
 }
 app.state.characterId='1202';app.state.modifierInputs['himeko-departure-accord']=2;const base=foreign(app);app.node('hsrStat-atk').value='999999';app.node('hsrStat-critDamage').value='9999';near(foreign(app).expected,base.expected);
 // Explicit record IDs from the existing production data are required; do not silently skip an inclusion check.
 const cdRecords=data.structuredModifiers.filter(m=>m.source.id==='1510'&&['151004','151026'].includes(m.source.skillId)&&m.category==='critDamage'&&m.support.status==='calculable');assert.equal(cdRecords.length,3);for(const r of cdRecords)app.state.modifierInputs['party-reference:1510:included:'+r.id]=true;app.state.modifierInputs['party-reference:1510:critDamage']=380;near(foreign(app).expected,base.expected);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(foreign(saved).expected,base.expected);delete saved.state.modifierInputs['party-reference:1510:atk'];assert.ok(!foreign(saved));assert.ok(saved.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='120201').name));saved.state.party[0].characterId='';assert.ok(!foreign(saved));
});


test('round43 alternate-form Himeko assist users keep owner values, final-stat exclusion and local lifecycle separate',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),foreign=x=>x.calculate().find(r=>r.attack?.name.includes('が使用・所有者：姫子'));
 for(const[id,mode,normalId]of[['1213',1,'121301'],['1224',2,'122401']]){
  const app=await tool(undefined,data);app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:1},{type:'Ultra',level:1},{type:'Talent',level:1}],stats:{atk:777,hp:9991,def:1400,critRate:10,critDamage:50,damageBonus:7}});app.state.party[0]={...app.state.party[0],characterId:'1510',eidolon:0,traceLevels:{talent:10,skill:10}};app.state.modifierInputs['himeko-departure-accord']=3-mode;
  assert.ok(!foreign(app));const normal=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===normalId).name);assert.ok(normal(app));app.state.conditionTab='パーティ';app.node('hsrConditionDialogOpen').handlers.click();assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="party-reference:1510:atk"/g)||[]).length,1);
  for(const[k,v]of Object.entries({atk:3000,critRate:50,critDamage:100,Fire:0,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['party-reference:1510:'+k]=v;app.state.modifierInputs['enemy-resistance:Fire']=20;
  const r=foreign(app),nc=3000*2.32*.45*(mode===1?2:1),cd=mode===1?1.8:3.8;assert.ok(r);near(r.nonCrit,nc);near(r.crit,nc*(1+cd));near(r.expected,nc*(1+.5*cd));assert.equal(Object.keys(r.components).length,2);assert.equal(app.state.modifierInputs['himeko-departure-accord'],3-mode);
  app.node('hsrStat-atk').value='999999';app.node('hsrStat-critDamage').value='9999';near(foreign(app).expected,r.expected);
  if(mode===1){app.state.modifierInputs['party-reference:1510:included:trace:1510:151025:accord-damage']=true;app.state.modifierInputs['party-reference:1510:Fire']=100;}
  else{const buffs=data.structuredModifiers.filter(m=>m.source.id==='1510'&&['151004','151026'].includes(m.source.skillId)&&m.category==='critDamage'&&m.support.status==='calculable');assert.equal(buffs.length,3);for(const b of buffs)app.state.modifierInputs['party-reference:1510:included:'+b.id]=true;app.state.modifierInputs['party-reference:1510:critDamage']=380;}
  near(foreign(app).expected,r.expected);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(foreign(saved).expected,r.expected);delete saved.state.modifierInputs['party-reference:1510:atk'];assert.ok(!foreign(saved));assert.ok(normal(saved));saved.state.party[0].characterId='';assert.ok(!foreign(saved));
 }
});

test('Round45 actual Welt attacks respond to cone support, path eligibility, removal and saved restoration',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1004',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.state.enhancementState='previous';app.node('hsrEnhancementState').value='previous';
 const normal=x=>x.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==='100401').name);
 const initial=normal(app).expected;near(initial,1620);
 app.state.party[0]={characterId:'1413',level:80,eidolon:0,lightConeId:'23052',refinement:1};
 app.state.modifierInputs['lc-23052-blank-active']=true;app.state.modifierInputs['lc-23052-verse-active']=true;
 near(normal(app).nonCrit,1080*1.16);near(normal(app).expected,1080*1.16*(1+.5*1.256));
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(normal(saved).expected,normal(app).expected);
 saved.state.modifierInputs['lc-23052-verse-active']=false;near(normal(saved).expected,1620*1.10);
 saved.state.party[0].characterId='1003';assert.equal(normal(saved),undefined,'existing path validation rejects the incompatible equipment');assert.match(saved.node('hsrResults').innerHTML+saved.node('hsrCalculationFeedback').innerHTML,/運命/);
 saved.state.party[0].characterId='1413';saved.state.party[0].lightConeId='';near(normal(saved).expected,1620);
 saved.state.party[0].lightConeId='23052';saved.state.modifierInputs['lc-23052-verse-active']=true;near(normal(saved).expected,1080*1.16*(1+.5*1.256));
 saved.state.party[0].characterId='';near(normal(saved).expected,1620);
});

test('Round45 shared Brocade state is rendered once and base-SPD support uses cone BaseSpeed without readding final SPD',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const fixture={...data,structuredModifiers:data.structuredModifiers.filter(x=>x.source?.id==='23036'||x.id==='ornament:311:2pc:speed-damage')};
 const app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1413',level:80,eidolon:0,lightCone:{id:'23036',rank:1,level:80},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,speed:130,critRate:50,critDamage:100,damageBonus:0}});
 app.state.modifierInputs['lc-23036-brocade-stacks']=6;app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();
 assert.equal((app.node('hsrConditionList').innerHTML.match(/data-structured-input="lc-23036-brocade-stacks"/g)||[]).length,1);
 assert.match(app.node("hsrConditionList").innerHTML,/6層で成立（現在値：6層）/);assert.doesNotMatch(app.node("hsrConditionList").innerHTML,/現在値：6%/);
 // Isolate an existing base-SPD percent lane: final130 already includes the fixed+12.
 fixture.structuredModifiers.push({id:'round45-speed-support',source:{kind:'trace',id:'1413'},category:'statPercent',stat:'speed',value:{kind:'fixed',fixed:20},target:{owner:'self',attackTypes:['all']},activation:{mode:'always'},inputPolicy:'conditional',support:{status:'calculable',verified:true}});
 app.state.ornamentId='311';app.state.modifierInputs['lc-23036-brocade-stacks']=0;
 let input;const original=app.window.HsrCalcEngine.calculate;app.window.HsrCalcEngine.calculate=req=>{input=req;return original(req);};app.calculate();
 near(input.character.baseStats.speed,data.characters.find(c=>c.id==='1413').base.speed+12);near(input.character.stats.speed,130);
 app.state.coneRank=5;app.node('hsrConeRank').value='5';app.calculate();near(input.character.baseStats.speed,data.characters.find(c=>c.id==='1413').base.speed+20);
 app.state.coneId='';app.calculate();near(input.character.baseStats.speed,data.characters.find(c=>c.id==='1413').base.speed);
});

test('Round46 real Welt damage uses recipient HP, swaps two support cones and restores saved conditions',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),fixture={...data,structuredModifiers:data.structuredModifiers.filter(x=>x.provenance?.verification==='tests/hsr/hsrEquipmentRound46.test.cjs')},app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1004',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 app.node('hsrEnhancementState').value='previous';const hit=x=>x.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==='100401').name);
 app.state.party[0]={characterId:'1217',level:80,eidolon:0,lightConeId:'21055',coneRank:5,hpPercent:0};
 for(const hp of ['', '49.999','50','50.001']){app.node('hsrStat-hpPercent').value=hp;near(hit(app).expected,hp!==''&&Number(hp)>=50?1944:1620);}
 app.state.party[0]={characterId:'1415',level:80,eidolon:0,lightConeId:'23042',coneRank:1};app.state.modifierInputs['lc-23042-memosprite-debuff-active']=true;near(hit(app).expected,1911.6);
 app.state.party[0]={characterId:'1217',level:80,eidolon:0,lightConeId:'21055',coneRank:5};near(hit(app).expected,1944);
 app.state.party[0]={characterId:'1415',level:80,eidolon:0,lightConeId:'23042',coneRank:1};near(hit(app).expected,1911.6);
 app.node('hsrStat-atk').handlers.input();const restored=await tool(app.storage,fixture);near(hit(restored).expected,1911.6);
 restored.node('hsrEnemyTakenDamage').value='18';restored.state.modifierInputs['lc-23042-memosprite-taken-in-final']=true;near(hit(restored).expected,1911.6);
 restored.node('hsrEnemyTakenDamage').value='0';restored.state.party[0].lightConeId='';near(hit(restored).expected,1620);
});

test('Round46 existing Punchline input automatically controls LC20024 and actual Aha damage without a duplicate condition',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),fixture={...data,structuredModifiers:data.structuredModifiers.filter(x=>x.provenance?.verification==='tests/hsr/hsrEquipmentRound46.test.cjs')},app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'8009',level:80,eidolon:0,lightCone:{id:'20024',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,elation:100}});
 app.node('hsrMerrymake').value='0';app.node('hsrElationTrace').value='10';const aha=x=>x.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==='800920').name);
 for(const punch of [9,10,11]){app.node('hsrPunchline').value=String(punch);const nc=7535.107*2.2*2*(1+5*punch/(punch+240))*.36;near(aha(app).nonCrit,nc);near(aha(app).expected,nc*(punch>=10?1.6:1.5));}
 app.node('hsrPunchline').value='10';app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/現在の爆笑ネタ 10個/);assert.doesNotMatch(app.node('hsrConditionList').innerHTML,/data-structured-input="party.punchline"/);assert.match(app.node('hsrPunchlineHelp').textContent,/残涙/);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,fixture);near(aha(saved).expected,7535.107*2.2*2*1.2*.36*1.6);
 saved.state.coneId='21065';saved.state.modifierInputs['lc-21065-elation-stacks']=2;near(aha(saved).expected,7535.107*2.2*2.24*1.2*.36*1.5);
 saved.state.coneId='20024';near(aha(saved).expected,7535.107*2.2*2*1.2*.36*1.6);
 saved.state.coneId='20023';saved.state.modifierInputs['lc-20023-aha-active']=true;near(aha(saved).expected,7535.107*2.2*2.16*1.2*.36*1.5);saved.state.modifierInputs['lc-20023-aha-active']=false;near(aha(saved).expected,7535.107*2.2*2*1.2*.36*1.5);
 saved.state.coneId='';near(aha(saved).expected,7535.107*2.2*2*1.2*.36*1.5);
});

test('Round46 equipment Burn is one independent DEF/Fire noncrit tick; missing cross-element inputs stop only this component',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),fixture={...data,structuredModifiers:data.structuredModifiers.filter(x=>x.provenance?.verification==='tests/hsr/hsrEquipmentRound46.test.cjs')},app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1304',level:80,eidolon:0,lightCone:{id:'21016',rank:1,level:80},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3127,hp:6123,def:2217,critRate:37,critDamage:129,damageBonus:11}});
 const tick=x=>x.calculate().find(r=>r.attack.name==='星間市場のトレンド・付与済み燃焼1回');assert.equal(tick(app),undefined);assert.ok(app.calculate().some(r=>r.attack.name!=='星間市場のトレンド・付与済み燃焼1回'));
 app.state.modifierInputs['lc-21016-fire-damage:1304']=35;app.state.modifierInputs['enemy-resistance:Fire']=23;let r=tick(app);assert.ok(r,app.node('hsrResults').innerHTML);const nc=2217*.4*1.35*.5*.77*.9;near(r.nonCrit,nc);near(r.crit,nc);near(r.expected,nc);assert.match(app.node('hsrResults').innerHTML,/最終DEF/);assert.match(app.node('hsrResults').innerHTML,/アベンチュリン/);
 app.node('hsrStat-atk').value='9000';near(tick(app).expected,nc);app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,fixture);near(tick(saved).expected,nc);
 saved.state.coneRank=5;saved.node('hsrConeRank').value='5';near(tick(saved).expected,nc*2);saved.state.coneId='';assert.equal(tick(saved),undefined);saved.state.coneId='21016';near(tick(saved).expected,nc*2);
 delete saved.state.modifierInputs['enemy-resistance:Fire'];assert.equal(tick(saved),undefined);assert.ok(saved.calculate().length);
});

test('Round47 six preserved Ultimate bodies add one DEF term and include DEF support without changing non-Ultimate damage',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),newRows=data.structuredModifiers.filter(m=>m.provenance?.verification==='tests/hsr/hsrEquipmentRound47.test.cjs'),unnerved=data.structuredModifiers.find(m=>m.id==='trace:1304:130403:crit-vulnerability');
 const support={id:'round47-def-fixture',source:{kind:'trace',id:'1001'},name:'DEF fixture',category:'statPercent',stat:'def',unit:'percent',value:{kind:'fixed',fixed:20},target:{owner:'self',attackTypes:['all'],elements:[]},activation:{mode:'toggle',inputKey:'round47-def-active',default:false},inputPolicy:'conditional',support:{status:'calculable',verified:true},finalStatsInclusion:{inputKey:'round47-def-in-final',inputLabel:'DEF included'}};
 const fixture={...data,structuredModifiers:[...newRows,unnerved,support]},app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),stat={atk:3127.125,hp:8432.25,def:2413.75,critRate:37,critDamage:129,damageBonus:21};
 const profile=id=>app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,lightCone:{id:'21030',rank:1,level:80},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:stat});
 const row=(x,id)=>x.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id===id).name),factor=1.21*100/203*.77*.9;
 for(const[cid,id,body]of [['1001','100103',stat.atk*1.5],['1208','120803',stat.hp],['1304','130403',stat.def*2.7],['1414','141403',stat.atk*3],['8003','800303',stat.atk+stat.def*1.5],['8004','800403',stat.atk+stat.def*1.5]]){
  profile(cid);app.node('hsrEnemyLevel').value='83';app.node('hsrEnemyResistance').value='23';app.state.modifierInputs['aventurine-unnerve-active']=true;
  for(const[rank,coefficient]of [[1,.6],[5,1.2]]){app.node('hsrConeRank').value=String(rank);const r=row(app,id);assert.ok(r,id+app.node('hsrCalculationFeedback').innerHTML);const nc=(body+stat.def*coefficient)*factor,cd=1.29+(cid==='1304'?.15:0);near(r.nonCrit,nc);near(r.crit,nc*(1+cd));near(r.expected,nc*(1+.37*cd));assert.ok(r.breakdown.scalingTerms.some(t=>t.sourceModifierId==='lightCone:21030:ultimate-base-defense'));}
  app.state.modifierInputs['lc-21030-ultimate-base-defense-in-final']=true;near(row(app,id).nonCrit,body*factor);app.state.modifierInputs['lc-21030-ultimate-base-defense-in-final']=false;
 }
 profile('1001');app.node('hsrEnemyLevel').value='83';app.node('hsrEnemyResistance').value='23';app.state.modifierInputs['round47-def-active']=true;const baseDef=data.characters.find(c=>c.id==='1001').base.def+data.lightCones.find(c=>c.id==='21030').base.def,def=stat.def+baseDef*.2;near(row(app,'100103').nonCrit,(stat.atk*1.5+def*.6)*factor);
 app.node('hsrStat-def').value=String(def);app.state.modifierInputs['round47-def-in-final']=true;near(row(app,'100103').nonCrit,(stat.atk*1.5+def*.6)*factor);
 app.node('hsrStat-def').value='';assert.equal(row(app,'100103'),undefined);assert.ok(row(app,'100101'),'missing additional DEF only stops Ultimate');
});

test('Round47 Welt equipment A-B-A shows independent own-element extra hits, scopes attack-type bonuses and restores inputs',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),fixture={...data,structuredModifiers:data.structuredModifiers.filter(m=>m.provenance?.verification==='tests/hsr/hsrEquipmentRound47.test.cjs'||m.source?.kind==='relic'&&m.source.id==='102')},app=await tool(undefined,fixture),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1004',level:80,eidolon:0,lightCone:{id:'21029',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3127.125,hp:8432.25,def:2413.75,critRate:37,critDamage:129,damageBonus:21}});app.node('hsrEnhancementState').value='previous';app.node('hsrEnemyLevel').value='83';app.node('hsrEnemyResistance').value='23';app.state.relicId='102';app.node('hsrRelicMode').value='4';
 const basic=x=>x.calculate().find(r=>r.attack.name==='重力制圧'),extra=(x,id)=>x.calculate().find(r=>r.attack.name===(id==='21029'?'またお会いしましょう・付加1回（敵1体）':'匿影・スキル後の次通常付加1回')),scale=3127.125*100/203*.77*.9,expected=coef=>scale*coef*1.21*(1+.37*1.29);
 near(basic(app).nonCrit,scale*1.31);near(extra(app,'21029').expected,expected(.48));app.state.coneId='20018';assert.equal(extra(app,'20018'),undefined);app.state.modifierInputs['lc-20018-next-basic-ready']=true;near(extra(app,'20018').expected,expected(.6));near(basic(app).nonCrit,scale*1.31);
 app.state.coneId='21029';near(extra(app,'21029').expected,expected(.48));app.node('hsrActionWindow').handlers.input();const saved=await tool(app.storage,fixture);near(extra(saved,'21029').expected,expected(.48));saved.node('hsrConeRank').value='5';near(extra(saved,'21029').expected,expected(.96));assert.match(saved.node('hsrResults').innerHTML,/光円錐S5/);saved.state.coneId='20018';near(extra(saved,'20018').expected,expected(1.2));saved.state.modifierInputs['lc-20018-next-basic-ready']=false;assert.equal(extra(saved,'20018'),undefined);near(basic(saved).nonCrit,scale*1.31);
 saved.state.coneId='';assert.equal(extra(saved,'21029'),undefined);assert.equal(extra(saved,'20018'),undefined);near(basic(saved).nonCrit,scale*1.31);
});

test('Round47 UID reconstruction keeps LC21030 permanent DEF once before Ultimate base addition and saved restoration',async()=>{
 const{data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),fixture={...data,structuredModifiers:data.structuredModifiers.filter(m=>m.provenance?.verification==='tests/hsr/hsrEquipmentRound47.test.cjs')},app=await tool(undefined,fixture),mapperWindow={};vm.runInNewContext(read('games/js/hsrProfileMapper.js'),{window:mapperWindow});
 const char=data.characters.find(c=>c.id==='1001'),cone=data.lightCones.find(c=>c.id==='21030'),tree=Object.entries(data.traceSkillMap['1001']).find(([,v])=>v.skillIds?.includes('100103'))[0],near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 const raw={avatarId:'1001',level:80,rank:0,equipment:{tid:'21030',level:80,rank:1,_flat:{props:[{type:'BaseHP',value:cone.base.hp},{type:'BaseAttack',value:cone.base.atk},{type:'BaseDefence',value:cone.base.def}]}},skillTreeList:[{pointId:tree,level:10}],relicList:[]};
 const mapped=mapperWindow.HsrProfileMapper.mapProfileResponse({detailInfo:{avatarDetailList:[raw]}},data).characters[0];const def=(char.base.def+cone.base.def)*1.16,atk=char.base.atk+cone.base.atk;near(mapped.stats.def,def);app.window.HsrTool.applyProfileCharacter(mapped);
 const hit=x=>x.calculate().find(r=>r.attack.name===data.attacks.find(a=>a.id==='100103').name);const expected=(atk*1.5+def*.6)*.36;near(hit(app).nonCrit,expected);near(hit(app).expected,expected*1.025);app.node('hsrActionWindow').handlers.input();const saved=await tool(app.storage,fixture);near(hit(saved).nonCrit,expected);near(saved.state.stats.def,def);
});

test('Round48 equipment CD respects independent spirit ownership, included defaults and S1-S5 in real attacks',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),key='lc-21057-memosprite-cd-in-final';
 for(const id of ['1415','1413']){
  const app=await tool(undefined,data),memo=id==='1415'?'1141501':'1141301',caster=id+'01';
  app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,lightCone:{id:'21057',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:3127,hp:11037,def:1900,critRate:11,critDamage:57,damageBonus:7}});
  const prefix='memosprite:'+id+':';for(const[k,v]of Object.entries({hp:8432,critRate:37,critDamage:143,damageBonus:19,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs[prefix+k]=v;
  Object.assign(app.state.modifierInputs,{'cyrene-recollection-allies':2,'evernight-memoquanta':16});
  const row=(attack,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===attack).name);
  const own=row(caster).expected;
  app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-toggle="lc-21057-memosprite-cd-in-final" checked/);
  const coefficient=id==='1415'?.6:.9,nc=8432*coefficient*1.19*.36;
  near(row(memo).expected,nc*(1+.37*1.43));
  assert.equal(row(memo).applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,0,'existing final CD is included by default');
  app.state.modifierInputs[key]=false;
  for(let rank=1;rank<=5;rank++){
   app.state.coneRank=rank;app.node('hsrConeRank').value=String(rank);const bonus=[24,30,36,42,48][rank-1],r=row(memo);
   near(r.nonCrit,nc);near(r.crit,nc*(1+(143+bonus)/100));near(r.expected,nc*(1+.37*(143+bonus)/100));
   assert.equal(r.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,1);assert.equal(r.applied.find(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').statReferenceId,id==='1415'?'11415':'11413');near(row(caster).expected,own);
   if(id==='1413'){const u=row('141303');near(u.expected,8432*2*1.19*.36*(1+.37*(143+bonus)/100));}
   else {const sum=row('11415012');near(sum.expected,3*r.expected);for(const part of Object.values(sum.components)){assert.equal(part.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,1,'each component reports the resolved snapshot addition');assert.ok(!part.skipped.some(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage'),'resolved component is not shown as excluded');}}
  }
  app.node('hsrStat-critDamage').value='999';near(row(memo).expected,nc*(1+.37*1.91),'wearer CD is not inherited');
  const boosted=row(memo).expected;app.state.modifierInputs[prefix+'critDamage']=191;app.state.modifierInputs[key]=true;near(row(memo).expected,boosted,'explicitly included component is never doubled');
  app.state.modifierInputs[prefix+'critDamage']=143;app.state.modifierInputs[key]=false;app.state.coneId='21029';near(row(memo).expected,nc*(1+.37*1.43));app.state.coneId='21057';near(row(memo).expected,boosted,'A-B-A restores exactly');
  app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row(memo,saved).expected,boosted);
  saved.state.coneId='';near(row(memo,saved).expected,nc*(1+.37*1.43));saved.state.coneId='21057';delete saved.state.modifierInputs[prefix+'critDamage'];assert.equal(row(memo,saved),undefined);assert.ok(row(caster,saved),'missing spirit CD remains local');
 }
});

test('Round48 explicit final inclusion preserves prior defaults and rejects non-boolean metadata',async()=>{
 const {data,runtime}= {...await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),runtime:require('../../games/js/hsrModifierRuntime.js')};
 const row=data.structuredModifiers.find(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage'),context={characterId:'1415',lightConeId:'21057',refinement:3,eidolon:0,partyIds:[],stats:{},characterElement:'Ice'};
 const candidate=inputs=>runtime.buildCandidates([row],context,inputs)[0];
 assert.equal(candidate({}).includedInFinalStats,true);assert.equal(candidate({}).enabled,false);assert.equal(candidate({[row.finalStatsInclusion.inputKey]:false}).value,36);assert.equal(candidate({[row.finalStatsInclusion.inputKey]:false}).enabled,true);
 const old={...row,finalStatsInclusion:{inputKey:'old-final',inputLabel:'old'}};assert.equal(runtime.buildCandidates([old],context,{})[0].includedInFinalStats,false,'all existing records retain their defaults');
 assert.equal(runtime.buildCandidates([row],{...context,lightConeId:'',partyIds:['1413'],partyEquipment:[{characterId:'1413',lightConeId:'21057',refinement:5}]},{}).length,0,'another summoner does not supply this component');
 assert.equal(runtime.buildCandidates([row],{...context,characterId:'8007'},{}).length,0,'unverified spirit owner excluded');
 const {validateModifiers}=require('../../scripts/validateHsrModifiers.cjs');const bad=JSON.parse(JSON.stringify(row));bad.finalStatsInclusion.defaultIncluded='true';assert.ok(validateModifiers([bad]).some(s=>s.includes('defaultIncluded: expected boolean')));
});

test('Round48 UID converted ATK reaches product damage once and survives equipment and saved-input changes',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),catalog=JSON.parse(read('games/hsr/data/catalog.json')),mapperWindow={};
 vm.runInNewContext(read('games/js/hsrProfileMapper.js'),{window:mapperWindow});
 const cone=catalog.lightCones.find(x=>x.id==='21041'),character=catalog.characters.find(x=>x.id==='1006'),near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 const raw={avatarId:1006,level:80,rank:0,equipment:{tid:21041,level:80,rank:1,_flat:{props:[{type:'BaseHP',value:cone.base.hp},{type:'BaseAttack',value:cone.base.atk},{type:'BaseDefence',value:cone.base.def}]}},skillTreeList:[{pointId:1006001,level:6},{pointId:1006002,level:10},{pointId:1006003,level:10},{pointId:1006004,level:10}],relicList:[{tid:1,_flat:{setID:303,props:[{type:'StatusProbabilityBase',value:.7}]}},{tid:2,_flat:{setID:303,props:[]}}]};
 const profile=mapperWindow.HsrProfileMapper.mapProfileResponse({detailInfo:{avatarDetailList:[raw]}},catalog).characters[0];
 const expectedAtk=(character.base.atk+cone.base.atk)*1.4;near(profile.stats.effectHitRate,80);near(profile.stats.atk,expectedAtk);
 app.window.HsrTool.applyProfileCharacter(profile);
 const normal=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100601').name),expected=expectedAtk*1*.36;
 near(normal(app).nonCrit,expected);near(normal(app).expected,expected*1.025);
 app.state.coneId='21029';near(normal(app).nonCrit,expected,'manual final ATK remains authoritative when changing equipment');app.state.coneId='21041';near(normal(app).nonCrit,expected,'switching back cannot re-add conversion');
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(normal(saved).nonCrit,expected);
 saved.window.HsrTool.applyProfileCharacter(profile);near(normal(saved).nonCrit,expected,'reimport is reconstructed once from raw properties');
});

// Round49 uses fixed-source coefficients below, not results from the production engine.
// 256 IEEE-754 epsilons bound the short sums/products of these composed scenarios;
// this tolerance is for arithmetic evaluation order, never a gameplay percentage error.
function r49Oracle(base, {dmg=0,cr=37,cd=129,down=15,ignore=5,pen=7,res=27,taken=9,broken=false}={}) {
 const defense=100/(100+103*Math.max(0,1-(down+ignore)/100));
 const nonCrit=base*(1+dmg/100)*defense*(1-(res-pen)/100)*(broken?1:.9)*(1+taken/100);
 return {nonCrit,crit:nonCrit*(1+cd/100),expected:nonCrit*(1+Math.min(100,cr)*cd/10000)};
}
function r49Equal(actual, expected, label) {
 for(const k of ['nonCrit','crit','expected'])assert.ok(Number.isFinite(actual?.[k])&&Math.abs(actual[k]-expected[k])<=Number.EPSILON*256*Math.max(1,Math.abs(expected[k])),label+' '+k+': '+actual?.[k]+' != '+expected[k]);
}
async function r49App(data,id,stats={}) {
 const app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:2700,hp:8432.25,def:2000,speed:132,critRate:37,critDamage:129,damageBonus:21,effectHitRate:80,effectRes:40,breakEffect:180,...stats}});
 app.node('hsrEnhancementState').value='previous';
 for(const[k,v]of Object.entries({hsrEnemyLevel:83,hsrEnemyResistance:27,hsrEnemyDefenseReduction:15,hsrEnemyDefenseIgnore:5,hsrEnemyResistancePenetration:7,hsrEnemyTakenDamage:9,hsrEnemyCount:1,hsrEnemyDebuffCount:3}))app.node(k).value=String(v);
 return app;
}
function r49Result(app,data,id){const name=data.attacks.find(a=>a.id===id).name,result=app.calculate().find(r=>r.attack?.name===name);assert.ok(result,name+': '+app.node('hsrCalculationFeedback').innerHTML);return result;}
function r49Log(label,expected,actual){console.log('ROUND49 '+JSON.stringify({case:label,independent:expected,actual:{nonCrit:actual.nonCrit,crit:actual.crit,expected:actual.expected}}));}
function r49Robin(app,slot=0){app.state.party[slot]={...app.state.party[slot],characterId:'1309',level:80,eidolon:0,traceLevels:{skill:10,talent:10,ultimate:10}};delete app.state.modifierInputs['robin-talent-crit-active'];app.state.modifierInputs['robin-skill-damage-active']=true;}

test('Round49 representative combined equipment uses independent ATK, DEF, spirit and UID expectations',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 // 1. ATK: fixed Welt N6/S10/U10 plus Musketeer, Arena, cone and two providers.
 {
  const app=await r49App(data,'1004',{critRate:66}),base=r49Oracle(2700,{dmg:21,cr:66});r49Equal(r49Result(app,data,'100401'),base,'ATK baseline');
  app.state.coneId='21001';app.state.relicId='102';app.state.ornamentId='309';app.node('hsrStat-atk').value='3127.125';r49Robin(app);
  app.state.party[1]={...app.state.party[1],characterId:'1208',level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs['fuxuan-matrix-active']=true;
  const checks=[['100401',1,137,9],['100402',.72*3,127,9],['100403',1.5,107,21]];
  for(const[id,m,dmg,taken]of checks){const e=r49Oracle(3127.125*m,{dmg,cr:78,cd:149,taken}),r=r49Result(app,data,id);r49Equal(r,e,'ATK '+id);r49Log('ATK '+id,e,r);}
  const expected=r49Oracle(3127.125,{dmg:137,cr:78,cd:149});app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);r49Equal(r49Result(saved,data,'100401'),expected,'ATK saved');
  saved.state.modifierInputs['fuxuan-matrix-active']=false;r49Equal(r49Result(saved,data,'100401'),r49Oracle(3127.125,{dmg:117,cr:66,cd:149}),'Arena loses supported CR threshold');
  saved.state.party=Array.from({length:3},()=>({characterId:''}));saved.state.coneId='';saved.state.relicId='';saved.state.ornamentId='';saved.node('hsrStat-atk').value='2700';r49Equal(r49Result(saved,data,'100401'),base,'ATK removal');
 }
 // 3. DEF: the cone term is base damage once, not DMG% or one term per hit.
 {
  const app=await r49App(data,'1304');app.state.modifierInputs['aventurine-unnerve-active']=true;
  const base=r49Oracle(2000*2.7,{dmg:21,cd:144});r49Equal(r49Result(app,data,'130403'),base,'DEF baseline');
  app.state.coneId='21030';app.state.relicId='103';app.state.ornamentId='310';app.node('hsrStat-def').value='2413.75';r49Robin(app);
  const e=r49Oracle(2413.75*(2.7+.6),{dmg:71,cd:174}),r=r49Result(app,data,'130403');r49Equal(r,e,'DEF combined');r49Log('DEF U10',e,r);
  app.node('hsrStat-def').handlers.input();const saved=await tool(app.storage,data);r49Equal(r49Result(saved,data,'130403'),e,'DEF saved');
  saved.node('hsrStat-effectRes').value='29.999';r49Equal(r49Result(saved,data,'130403'),r49Oracle(2413.75*3.3,{dmg:71,cd:164}),'Keel boundary');
  saved.state.party=[];saved.state.coneId='';saved.state.relicId='';saved.state.ornamentId='';saved.node('hsrStat-def').value='2000';r49Equal(r49Result(saved,data,'130403'),base,'DEF removal');
 }
 // 6. Independent spirit: caster-only gear and stats do not cross the owner boundary.
 {
  const app=await r49App(data,'1415',{critRate:80});
  for(const[k,v]of Object.entries({hp:10000,critRate:45,critDamage:150,damageBonus:30,defenseIgnore:9,resistancePenetration:11}))app.state.modifierInputs['memosprite:1415:'+k]=v;
  app.state.modifierInputs['cyrene-recollection-allies']=2;
  const args={dmg:30,cr:45,cd:150,ignore:9,pen:11},base=r49Oracle(6000,args);r49Equal(r49Result(app,data,'1141501'),base,'spirit baseline');
  app.state.coneId='21057';app.state.coneRank=5;app.node('hsrConeRank').value='5';app.state.relicId='102';app.state.ornamentId='309';app.state.modifierInputs['lc-21057-memosprite-cd-in-final']=false;
  app.state.party[0]={...app.state.party[0],characterId:'1413',level:80,eidolon:0,lightConeId:'23042',coneRank:1,traceLevels:{memSkill:6}};app.state.modifierInputs['lc-23042-memosprite-debuff-active']=true;
  const e=r49Oracle(6000,{...args,cd:198,taken:27}),r=r49Result(app,data,'1141501');r49Equal(r,e,'spirit combined');r49Log('independent spirit',e,r);r49Equal(r49Result(app,data,'11415012'),Object.fromEntries(Object.entries(e).map(([k,v])=>[k,v*3])),'spirit three components');
  app.node('hsrStat-hp').value='17000';app.node('hsrStat-critDamage').value='999';r49Equal(r49Result(app,data,'1141501'),e,'caster isolation');
  app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);r49Equal(r49Result(saved,data,'1141501'),e,'spirit saved');
  saved.state.party=[];saved.state.coneId='';saved.state.relicId='';saved.state.ornamentId='';r49Equal(r49Result(saved,data,'1141501'),base,'spirit removal');
 }
 // 8. Reconstructed UID final ATK plus Trick, Genius and Robin, without redoing conversion.
 {
  const catalog=JSON.parse(read('games/hsr/data/catalog.json')),w={};vm.runInNewContext(read('games/js/hsrProfileMapper.js'),{window:w});const cone=catalog.lightCones.find(c=>c.id==='21041'),char=catalog.characters.find(c=>c.id==='1006');
  const raw={avatarId:1006,level:80,rank:0,equipment:{tid:21041,level:80,rank:5,_flat:{props:[{type:'BaseHP',value:cone.base.hp},{type:'BaseAttack',value:cone.base.atk},{type:'BaseDefence',value:cone.base.def}]}},skillTreeList:[{pointId:1006001,level:6},{pointId:1006002,level:10},{pointId:1006003,level:10},{pointId:1006004,level:10}],relicList:[{_flat:{setID:303,props:[{type:'StatusProbabilityBase',value:.7},{type:'AttackAddedRatio',value:.12},{type:'AttackDelta',value:217.875}]}},{_flat:{setID:303,props:[]}}]};
  const profile=w.HsrProfileMapper.mapProfileResponse({detailInfo:{avatarDetailList:[raw]}},catalog).characters[0],atk=(char.base.atk+cone.base.atk)*1.68+217.875;
  assert.ok(Math.abs(profile.stats.atk-atk)<=Number.EPSILON*256*atk);
  const app=await r49App(data,'1006');app.window.HsrTool.applyProfileCharacter(profile);app.node('hsrEnhancementState').value='previous';
  const args={dmg:0,cr:5,cd:50},base=r49Oracle(atk,args);r49Equal(r49Result(app,data,'100601'),base,'UID baseline');
  app.state.modifierInputs['lc-21041-trick-stacks']=3;app.state.relicId='108';app.node('hsrWeakness').value='true';r49Robin(app);
  const e=r49Oracle(atk,{...args,dmg:80,cd:70,ignore:25}),r=r49Result(app,data,'100601');r49Equal(r,e,'UID combat composition');r49Log('UID EHR to ATK',e,r);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);r49Equal(r49Result(saved,data,'100601'),e,'UID saved');
  saved.state.party=[];saved.state.relicId='';saved.state.modifierInputs['lc-21041-trick-stacks']=0;r49Equal(r49Result(saved,data,'100601'),base,'UID combat removal');
 }
});

test('Round49 representative HP, break, independent hits and foreign support keep their own modifier contracts',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 // 2. HP: enhanced Basic 30% twice; conditional HP uses the two equipped bases.
 {
  const app=await r49App(data,'1415',{hp:8123.5,critRate:75,critDamage:170,damageBonus:50}),base=r49Oracle(8123.5*.6,{dmg:50,cr:75,cd:170});r49Equal(r49Result(app,data,'141508'),base,'HP baseline');
  app.state.coneId='23036';app.state.relicId='127';app.state.ornamentId='309';app.state.modifierInputs['lc-23036-brocade-stacks']=6;app.state.modifierInputs['relic-127-party-damage']=true;
  const baseHP=data.characters.find(c=>c.id==='1415').base.hp+data.lightCones.find(c=>c.id==='23036').base.hp,hp=8123.5+baseHP*.24;
  const e=r49Oracle(hp*.6,{dmg:139,cr:75,cd:224}),r=r49Result(app,data,'141508');r49Equal(r,e,'HP combined');r49Log('HP enhanced Basic',e,r);
  app.state.modifierInputs['relic:127:4pc:wearer-hp:in-final-stats']=true;app.node('hsrStat-hp').value=String(hp);r49Equal(r49Result(app,data,'141508'),e,'HP included once');
  app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);r49Equal(r49Result(saved,data,'141508'),e,'HP saved');
  saved.state.coneId='';saved.state.relicId='';saved.state.ornamentId='';saved.node('hsrStat-hp').value='8123.5';r49Equal(r49Result(saved,data,'141508'),base,'HP removal');
 }
 // 4. Break and Super Break: the same loadout feeds distinct formulas.
 {
  const app=await r49App(data,'1310',{breakEffect:240,speed:145}),observed={};
  const engine=app.window.HsrCalcEngine;app.window.HsrCalcEngine={...engine,calculateBreak(q){const r=engine.calculateBreak(q);observed.break={...r,nonCrit:r.value,crit:r.value,expected:r.value};return r;},calculateSuperBreak(q){const r=engine.calculateSuperBreak(q);observed.superBreak={...r,nonCrit:r.value,crit:r.value,expected:r.value};return r;}};
  app.node('hsrWeakness').value='true';app.node('hsrToughnessState').value='broken';app.node('hsrMaxToughness').value='180';app.node('hsrSuperBreakToughness').value='60';app.node('hsrSuperBreakMultiplier').value='100';
  const result=(kind,x=app)=>{x.node('hsrBreakMode').value=kind;x.calculate();return observed[kind];};
  const oracle=(be,ignore,breakBonus,sb=false)=>{const n=3767.5533*(sb?60/10:2*2)*(1+be/100)*(100/(100+103*(1-(15+ignore)/100)))*.8*1.09*(sb?1:1+breakBonus/100);return {nonCrit:n,crit:n,expected:n};};
  r49Equal(result('break'),oracle(240,5,0),'Break baseline');r49Equal(result('superBreak'),oracle(240,5,0,true),'SuperBreak baseline');
  app.state.relicId='119';app.state.ornamentId='307';app.state.party[0]={...app.state.party[0],characterId:'1202',level:80,eidolon:0,lightConeId:'21056',coneRank:5,traceLevels:{skill:10,talent:10,ultimate:10}};
  const br=oracle(260,15,24),sb=oracle(260,30,0,true);r49Equal(result('break'),br,'Break combined');r49Log('Fire Break',br,observed.break);r49Equal(result('superBreak'),sb,'SuperBreak combined');r49Log('SuperBreak',sb,observed.superBreak);
  app.state.party[0].lightConeId='';r49Equal(result('superBreak'),sb,'Break-only cone never boosts SuperBreak');app.state.party[0].lightConeId='21056';
  app.node('hsrStat-breakEffect').handlers.input();const saved=await tool(app.storage,data),savedObserved={};const savedEngine=saved.window.HsrCalcEngine;saved.window.HsrCalcEngine={...savedEngine,calculateBreak(q){const r=savedEngine.calculateBreak(q);savedObserved.break={...r,nonCrit:r.value,crit:r.value,expected:r.value};return r;},calculateSuperBreak(q){const r=savedEngine.calculateSuperBreak(q);savedObserved.superBreak={...r,nonCrit:r.value,crit:r.value,expected:r.value};return r;}};
  saved.node('hsrBreakMode').value='superBreak';saved.calculate();r49Equal(savedObserved.superBreak,sb,'SuperBreak saved');
  saved.state.party=[];saved.state.relicId='';saved.state.ornamentId='';saved.calculate();r49Equal(savedObserved.superBreak,oracle(240,5,0,true),'SuperBreak removal');
 }
 // 5. Equipment additional damage uses all-DMG but never Basic/Skill-only bonuses.
 {
  const app=await r49App(data,'1004',{atk:3127.125,critRate:66});app.state.coneId='21029';app.state.coneRank=3;app.node('hsrConeRank').value='3';
  const row=x=>x.calculate().find(r=>r.attack?.name.startsWith('またお会いしましょう')),hidden=x=>x.calculate().find(r=>r.attack?.name.startsWith('匿影'));
  r49Equal(row(app),r49Oracle(3127.125*.72,{dmg:21,cr:66}),'additional baseline');app.state.relicId='102';app.state.ornamentId='309';r49Robin(app);app.state.party[1]={...app.state.party[1],characterId:'1208',level:80,eidolon:0,traceLevels:{skill:10}};app.state.modifierInputs['fuxuan-matrix-active']=true;
  const e=r49Oracle(3127.125*.72,{dmg:71,cr:78,cd:149});r49Equal(row(app),e,'additional combined');r49Log('independent additional',e,row(app));assert.ok(!row(app).applied.some(m=>m.id==='relic:102:4pc:normal-damage'||m.id==='ornament:309:2pc:normal-skill-damage'));
  app.state.coneId='20018';assert.equal(hidden(app),undefined);app.state.modifierInputs['lc-20018-next-basic-ready']=true;const b=r49Oracle(3127.125*.9,{dmg:71,cr:78,cd:149});r49Equal(hidden(app),b,'second cone ready');assert.equal(row(app),undefined);
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);r49Equal(hidden(saved),b,'additional saved');saved.state.coneId='21029';r49Equal(row(saved),e,'additional A-B-A');saved.state.coneId='';assert.equal(row(saved),undefined);assert.equal(hidden(saved),undefined);assert.ok(r49Result(saved,data,'100401'));
 }
 // 7. Himeko owns this assist; the triggering actor's equipment cannot become hers.
 {
  const app=await r49App(data,'1004');app.state.party[0]={...app.state.party[0],characterId:'1510',level:80,eidolon:0,traceLevels:{talent:10,skill:10}};
  for(const[k,v]of Object.entries({atk:4317,critRate:37,critDamage:143,Fire:23,defenseIgnore:11,resistancePenetration:7}))app.state.modifierInputs['party-reference:1510:'+k]=v;
  app.state.modifierInputs['enemy-resistance:Fire']=27;app.state.modifierInputs['himeko-departure-accord']=0;
  const row=x=>x.calculate().find(r=>r.attack?.name.includes('が使用・所有者：姫子')),args={dmg:23,cr:37,cd:423,ignore:11,pen:27},base=r49Oracle(4317*2.32,args);
  r49Equal(row(app),base,'foreign baseline with native Himeko buffs');app.state.coneId='21001';app.state.relicId='102';app.state.ornamentId='309';app.node('hsrStat-critRate').value='90';app.node('hsrStat-atk').value='9999';app.node('hsrStat-damageBonus').value='99';r49Equal(row(app),base,'foreign cannot inherit actor loadout');
  app.node('hsrEnemyTakenDamage').value='24';const e=r49Oracle(4317*2.32,{...args,taken:24}),r=row(app);r49Equal(r,e,'foreign shared enemy effect');r49Log('Himeko other-user assist',e,r);r49Equal(r.components.area,r49Oracle(4317*1.6,{...args,taken:24}),'foreign area');r49Equal(r.components.shots,r49Oracle(4317*.24*3,{...args,taken:24}),'foreign three shots');
  for(const id of ['trace:1510:151004:crit-damage','trace:1510:151026:accord-crit','trace:1510:151026:accord-skill-crit'])app.state.modifierInputs['party-reference:1510:included:'+id]=true;
  app.state.modifierInputs['party-reference:1510:critDamage']=423;r49Equal(row(app),e,'foreign native CD included once');
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);r49Equal(row(saved),e,'foreign saved');saved.state.party=[];assert.equal(row(saved),undefined);assert.ok(r49Result(saved,data,'100401'));
 }
});


// The independent final values include every other effect; only the dedicated
// summoner-to-Servant CD term is deliberately absent in the explicit false state.
test('Round50 LC21057 expands only its own independently specified Servant CD at S1-S5',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const near=(a,b,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=256*Number.EPSILON*Math.max(1,Math.abs(b)),label+': '+a+' != '+b);
 const key='lc-21057-memosprite-cd-in-final',modifier='lightCone:21057:independent-memosprite-crit-damage';
 for(const [id,attack,owner,cr,cd,base] of [['1402','1140201','11402',20,200,5000*1.1*1.2*.36],['1407','1140702','11407',80,200,6000*.34*1.3*.36],['1409','1140901','11409',37,143,12345*.2*1.19*.36]]){
  const app=await tool(undefined,data),prefix='memosprite:'+id+':';
  app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,lightCone:{id:'21057',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
  for(const[k,v]of Object.entries({atk:5000,critRate:cr,critDamage:cd,damageBonus:id==='1402'?20:id==='1407'?30:19,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs[prefix+k]=v;
  Object.assign(app.state.modifierInputs,{'castorice-breath-stage':2,'castorice-dragon-hp-percent':25,'hyacine-recorded-healing':12345});
  const row=(attackId=attack,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===attackId).name);
  const verify=(r,bonus,label)=>{assert.ok(r,label);near(r.nonCrit,base,label+' NC');near(r.crit,base*(1+(cd+bonus)/100),label+' crit');near(r.expected,base*(1+cr*(cd+bonus)/10000),label+' EV');};
  verify(row(),0,id+' default included');assert.equal(row().applied.filter(m=>m.id===modifier).length,0);
  app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-toggle="lc-21057-memosprite-cd-in-final" checked/);
  app.state.modifierInputs[key]=false;
  const caster=row(id+'01').expected;
  for(let rank=1;rank<=5;rank++){
   app.state.coneRank=rank;app.node('hsrConeRank').value=String(rank);const bonus=[24,30,36,42,48][rank-1],r=row();verify(r,bonus,id+' S'+rank);
   const applied=r.applied.filter(m=>m.id===modifier);assert.equal(applied.length,1);assert.equal(applied[0].statReferenceId,owner);near(row(id+'01').expected,caster,'caster CD isolated');
  }
  const scope=data.structuredModifiers.find(m=>m.id===modifier),attackIds=scope.target.attackIds;
  scope.target.attackIds=attackIds.filter(attackId=>attackId!==attack);verify(row(),0,'an excluded attack never receives snapshot equipment');scope.target.attackIds=attackIds;
  console.log('ROUND50 '+JSON.stringify({owner,attack,nonCrit:base,independentS5:base*(1+cr*(cd+48)/10000),actualS5:row().expected}));
  app.node('hsrStat-critDamage').value='999';verify(row(),48,'caster edit isolation');
  app.state.modifierInputs[prefix+'critDamage']=cd+48;app.state.modifierInputs[key]=true;verify(row(),48,'already included once');
  app.state.modifierInputs[prefix+'critDamage']=cd;app.state.modifierInputs[key]=false;app.state.coneId='';verify(row(),0,'unequip');app.state.coneId='21057';verify(row(),48,'equip A-B-A');
  app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);verify(row(attack,saved),48,'saved CD contract');
  saved.state.coneId='';saved.state.party[0]={characterId:'1415',level:80,eidolon:0,lightConeId:'21057',coneRank:5};verify(row(attack,saved),0,'another summoner cannot supply CD');
  saved.state.coneId='21057';delete saved.state.modifierInputs[prefix+'critDamage'];assert.equal(row(attack,saved),undefined);assert.ok(row(id+'01',saved),'missing Servant input remains local');
 }
});

test('Round50 LC21057 joint and same-event sequences add CD to Servant components exactly once',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),key='lc-21057-memosprite-cd-in-final';
 for(const id of ['1402','1407']){
  const app=await tool(undefined,data);
  app.window.HsrTool.applyProfileCharacter({id,level:80,eidolon:0,lightCone:{id:'21057',level:80,rank:5},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:3000,hp:6000,def:2000,critRate:id==='1402'?50:10,critDamage:id==='1402'?100:50,damageBonus:0}});
  for(const[k,v]of Object.entries({atk:5000,critRate:id==='1402'?20:80,critDamage:200,damageBonus:id==='1402'?20:30,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:'+id+':'+k]=v;
  Object.assign(app.state.modifierInputs,{[key]:false,'castorice-breath-stage':2,'castorice-dragon-hp-percent':25});
  const row=attack=>app.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===attack).name);
  if(id==='1402'){
   const r=row('140208');assert.ok(r);near(r.components.aglaea.expected,3000*2*.36*1.5);near(r.components.laftra.expected,5000*2*1.2*.36*(1+.2*2.48));near(r.components.silkTalent.expected,3000*.3*.36*1.5);assert.equal(r.components.laftra.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,1);assert.equal(r.components.aglaea.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,0);near(r.expected,3000*2*.36*1.5+5000*2*1.2*.36*(1+.2*2.48)+3000*.3*.36*1.5);
  }else{
   const r=row('140709');assert.ok(r);near(r.components.caster.expected,6000*.3*.36*1.05);near(r.components.dragon.expected,6000*.5*1.3*.36*(1+.8*2.48));assert.equal(r.components.dragon.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,1);assert.equal(r.components.caster.applied.filter(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage').length,0);near(r.expected,6000*.3*.36*1.05+6000*.5*1.3*.36*(1+.8*2.48));
   const seq=row('11407022');assert.ok(seq);near(seq.components.breath.expected,6000*.34*1.3*.36*(1+.8*2.48));near(seq.components.exit.expected,6000*6*.4*1.3*.36*(1+.8*2.48));near(seq.expected,6000*(.34+6*.4)*1.3*.36*(1+.8*2.48));
  }
 }
});


test('Round50 explicit EHR baseline updates only LC21041 ATK delta without rebuilding final inputs',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),active='lc-21041-ehr-baseline-active',baseline='lc-21041-baseline-ehr',included='lc-21041-ehr-delta-in-final';
 const app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id:'1006',level:80,eidolon:0,lightCone:{id:'21041',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:37,critDamage:143,damageBonus:19,effectHitRate:70}});
 const row=(x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100601').name),ev=atk=>atk*1.19*.36*(1+.37*1.43),baseAtk=data.characters.find(c=>c.id==='1006').base.atk+data.lightCones.find(c=>c.id==='21041').base.atk;
 app.node('hsrStat-effectHitRate').value='90';near(row().expected,ev(3000));
 app.state.conditionTab='光円錐';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/data-structured-input="lc-21041-baseline-ehr"/);assert.match(app.node('hsrConditionList').innerHTML,/data-structured-toggle="lc-21041-ehr-baseline-active"/);
 app.state.modifierInputs[active]=true;app.state.modifierInputs[baseline]=70;
 for(let rank=1;rank<=5;rank++){
  app.state.coneRank=rank;app.node('hsrConeRank').value=String(rank);const bonus=[20,24,28,32,36][rank-1];
  for(const ehr of [79.9999,80,80.0001]){app.node('hsrStat-effectHitRate').value=String(ehr);near(row().expected,ev(3000+(ehr>=80?baseAtk*bonus/100:0)));}
  app.state.modifierInputs[baseline]=80;app.node('hsrStat-effectHitRate').value='79.9999';near(row().expected,ev(3000-baseAtk*bonus/100));app.state.modifierInputs[baseline]=70;
 }
 app.node('hsrStat-effectHitRate').value='80';const enhanced=ev(3000+baseAtk*.36);near(row().expected,enhanced);console.log('ROUND50 '+JSON.stringify({case:'LC21041 manual baseline70 current80 S5',independent:enhanced,actual:row().expected}));
 app.state.modifierInputs[included]=true;app.node('hsrStat-atk').value=String(3000+baseAtk*.36);near(row().expected,enhanced);
 app.state.modifierInputs[included]=false;app.node('hsrStat-atk').value='3000';app.node('hsrStat-effectHitRate').handlers.input();const saved=await tool(app.storage,data);near(row(saved).expected,enhanced);
 saved.state.modifierInputs[active]=false;near(row(saved).expected,ev(3000));saved.state.modifierInputs[active]=true;saved.state.coneId='';near(row(saved).expected,ev(3000));saved.node('hsrConditionDialogOpen').handlers.click();assert.doesNotMatch(saved.node('hsrConditionList').innerHTML,/lc-21041-baseline-ehr/);saved.state.coneId='21041';near(row(saved).expected,enhanced);
 delete saved.state.modifierInputs[baseline];near(row(saved).expected,ev(3000));assert.ok(!row(saved).applied.some(m=>m.id==='lightCone:21041:battle-ehr-attack-delta'));
});

test('Round50 UID initial ATK and selected battle EHR delta remain separate after save and reimport',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),catalog=JSON.parse(read('games/hsr/data/catalog.json')),w={};vm.runInNewContext(read('games/js/hsrProfileMapper.js'),{window:w});
 const cone=catalog.lightCones.find(c=>c.id==='21041'),character=catalog.characters.find(c=>c.id==='1006'),raw={avatarId:1006,level:80,rank:0,equipment:{tid:21041,level:80,rank:5,_flat:{props:[{type:'BaseHP',value:cone.base.hp},{type:'BaseAttack',value:cone.base.atk},{type:'BaseDefence',value:cone.base.def}]}},skillTreeList:[{pointId:1006001,level:6},{pointId:1006002,level:10},{pointId:1006003,level:10},{pointId:1006004,level:10}],relicList:[{_flat:{props:[{type:'StatusProbabilityBase',value:.7},{type:'AttackAddedRatio',value:.12},{type:'AttackDelta',value:217.875}]}}]};
 const profile=w.HsrProfileMapper.mapProfileResponse({detailInfo:{avatarDetailList:[raw]}},catalog).characters[0],baseAtk=character.base.atk+cone.base.atk,initial=baseAtk*1.12+217.875,near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b);
 near(profile.stats.atk,initial);const app=await tool(undefined,data);app.window.HsrTool.applyProfileCharacter(profile);app.node('hsrEnhancementState').value='previous';
 const row=x=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100601').name),ev=atk=>atk*.36*1.025;
 near(row(app).expected,ev(initial));app.state.modifierInputs['lc-21041-ehr-baseline-active']=true;app.state.modifierInputs['lc-21041-baseline-ehr']=70;app.node('hsrStat-effectHitRate').value='80';near(row(app).expected,ev(initial+baseAtk*.36));
 app.node('hsrStat-effectHitRate').handlers.input();const saved=await tool(app.storage,data);near(row(saved).expected,ev(initial+baseAtk*.36));saved.window.HsrTool.applyProfileCharacter(profile);near(row(saved).expected,ev(initial));near(saved.state.stats.atk,initial);
});


test('Round50 LC23049 separates own-Servant DMG from allied-Servant defense ignore at all S ranks',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture();
 const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,a+' != '+b),dmgKey='lc-23049-memosprite-damage-in-final',defKey='lc-23049-memosprite-defense-ignore-in-final';
 const app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id:'1415',level:80,eidolon:0,lightCone:{id:'23049',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6}],stats:{hp:11037,atk:3000,def:2000,critRate:11,critDamage:57,damageBonus:0}});
 for(const[k,v]of Object.entries({hp:8432,critRate:37,critDamage:143,damageBonus:19,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1415:'+k]=v;
 const row=(id='1141501',x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name),factor=1+.37*1.43;
 const oracle=(dmg,ignore)=>8432*.6*(1+(19+dmg)/100)*(100/(100+100*(1-ignore/100)))*.8*.9*factor,base=oracle(0,0),caster=row('141501').expected;
 near(row().expected,base);app.state.modifierInputs['lc-23049-nightshade-active']=true;near(row().expected,base);near(row('141501').expected,caster*1.3);
 app.state.modifierInputs[dmgKey]=false;app.state.modifierInputs[defKey]=false;
 for(let rank=1;rank<=5;rank++){
  app.state.coneRank=rank;app.node('hsrConeRank').value=String(rank);const d=[30,37.5,45,52.5,60][rank-1],ignore=[20,22.5,25,27.5,30][rank-1],r=row();near(r.expected,oracle(d,ignore));near(r.nonCrit,oracle(d,ignore)/factor);near(r.crit,oracle(d,ignore)/factor*2.43);near(row('141501').expected,caster*(1+d/100));
 }
 console.log('ROUND50 '+JSON.stringify({case:'23049 own Demiurge S5',independent:oracle(60,30),actual:row().expected}));
 app.state.modifierInputs[dmgKey]=true;app.state.modifierInputs[defKey]=true;app.state.modifierInputs['memosprite:1415:damageBonus']=79;app.state.modifierInputs['memosprite:1415:defenseIgnore']=30;near(row().expected,oracle(60,30));
 app.state.modifierInputs[dmgKey]=false;app.state.modifierInputs[defKey]=false;app.state.modifierInputs['memosprite:1415:damageBonus']=19;app.state.modifierInputs['memosprite:1415:defenseIgnore']=0;
 app.state.modifierInputs['lc-23049-nightshade-active']=false;near(row().expected,base);app.state.modifierInputs['lc-23049-nightshade-active']=true;
 app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row('1141501',saved).expected,oracle(60,30));saved.state.coneId='';near(row('1141501',saved).expected,base);saved.state.coneId='23049';near(row('1141501',saved).expected,oracle(60,30));
 // Another summoner grants only team Servant DEF ignore, never its own-Servant DMG.
 saved.state.coneId='';saved.state.party[0]={characterId:'1413',level:80,eidolon:0,lightConeId:'23049',coneRank:1};near(row('1141501',saved).expected,oracle(0,20));near(row('141501',saved).expected,caster);
 saved.state.party[0].coneRank=5;near(row('1141501',saved).expected,oracle(0,30));saved.state.party[1]={characterId:'1407',level:80,eidolon:0,lightConeId:'23049',coneRank:5};near(row('1141501',saved).expected,base);saved.state.party[1].characterId='8007';near(row('1141501',saved).expected,base,'an unconnected second provider cannot be ignored');
 saved.state.party=[];near(row('1141501',saved).expected,base);
});


test('Round51 final-input and unresolved EHR scope stays visible without stopping valid attacks',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1004',level:80,eidolon:0,lightCone:{id:'21041',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0,effectHitRate:70}});
 const row=(x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id==='100401').name);
 app.state.modifierInputs['lc-21041-ehr-baseline-active']=true;near(row().expected,1620);assert.match(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="21041"/);assert.match(app.node('hsrResults').innerHTML,/基準効果命中を確認できない/);
 app.node('hsrStat-atk').handlers.input();const saved=await tool(app.storage,data);near(row(saved).expected,1620);assert.match(saved.node('hsrResults').innerHTML,/基準効果命中を確認できない/);
 saved.state.modifierInputs['lc-21041-baseline-ehr']=70;near(row(saved).expected,1620);assert.doesNotMatch(saved.node('hsrResults').innerHTML,/基準効果命中を確認できない/);
 saved.state.coneId='';saved.state.ornamentId='303';near(row(saved).expected,1620);assert.match(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope="303"/);assert.doesNotMatch(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope="21041"/);
 saved.state.ornamentId='';near(row(saved).expected,1620);assert.doesNotMatch(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope=/);
});

test('Round51 separate unsupported spirit components are explained only when relevant and survive restore',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);
 app.window.HsrTool.applyProfileCharacter({id:'1415',level:80,eidolon:0,lightCone:{id:'23042',level:80,rank:1},traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6}],stats:{atk:3000,hp:11037,def:2000,critRate:11,critDamage:57,damageBonus:0}});
 const row=(id,x=app)=>x.calculate().find(r=>r.attack?.name===data.attacks.find(a=>a.id===id).name);
 assert.ok(row('141501'));assert.equal(row('1141501'),undefined);assert.doesNotMatch(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="23042"/);
 for(const[k,v]of Object.entries({hp:8432,critRate:37,critDamage:143,damageBonus:19,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:1415:'+k]=v;
 const expected=8432*.6*1.19*.36*(1+.37*1.43);near(row('1141501').expected,expected);assert.match(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="23042"/);assert.match(app.node('hsrResults').innerHTML,/消費HP記録による別の付加ダメージは含みません/);
 app.node('hsrStat-hp').handlers.input();const saved=await tool(app.storage,data);near(row('1141501',saved).expected,expected);assert.match(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope="23042"/);
 saved.state.coneId='21057';near(row('1141501',saved).expected,expected);assert.doesNotMatch(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope="(?:23042|21057)"/);
 saved.state.coneId='';near(row('1141501',saved).expected,expected);assert.doesNotMatch(saved.node('hsrResults').innerHTML,/data-hsr-equipment-scope=/);
});

test("Round52 Aha renders Wish and prior-record inputs, respects world OFF/ON, and auto-enables ascension at Ultimate", async () => {
    const { data } = await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
    const app = await tool(undefined, data);
    app.window.HsrTool.applyProfileCharacter({ id: "1511", level: 80, eidolon: 0,
        traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "Ultra", level: 10 }, { type: "Talent", level: 10 }, { type: "ElationDamage", level: 10 }],
        stats: { atk: 3000, hp: 6000, def: 2000, speed: 130, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 } });
    app.state.party[0] = { characterId: "1502", level: 80, eidolon: 0 };
    app.state.modifierInputs["aha-emanator-recipient"] = "1502";
    for (const [key, value] of Object.entries({ elation: 180, critRate: 50, critDamage: 160, merrymake: 0, certifiedBanger: 0, defenseIgnore: 0, resistancePenetration: 0, resistance: 20 })) {
        app.state.modifierInputs[`aha-reference:1502:${key}`] = value;
    }
    app.node("hsrStat-elation").value = "100";
    app.node("hsrMerrymake").value = "0";
    app.node("hsrPunchline").value = "40";
    app.state.modifierInputs["elation-certified-banger"] = 0;
    app.state.modifierInputs["aha-wish"] = 8;
    app.state.modifierInputs["aha-prior-non-true-damage"] = 125000;
    app.state.conditionTab = "軌跡";
    app.node("hsrConditionDialogOpen").handlers.click();
    const conditionHtml = app.node("hsrConditionList").innerHTML;
    assert.match(conditionHtml, /data-structured-input="aha-wish"/);
    assert.match(conditionHtml, /data-structured-input="elation-certified-banger"/);
    assert.match(conditionHtml, /data-structured-input="aha-prior-non-true-damage"/);

    const attackName = id => data.attacks.find(attack => attack.id === id)?.name;
    const row = (id, instance = app) => instance.calculate().find(item => item.attack?.name === attackName(id));
    app.state.modifierInputs["aha-world-active"] = false;
    let normal = row("151101");
    assert.ok(normal, app.node("hsrCalculationFeedback").innerHTML);
    assert.equal(normal.applied.some(item => item.id === "v47:aha:world-critRate"), false, "world OFF does not apply Aha's CRIT Rate ascension");
    app.node("hsrConditionDialog").handlers.change({ target: { dataset: { structuredToggle: "aha-world-active" }, checked: true } });
    normal = row("151101");
    assert.ok(normal.applied.some(item => item.id === "v47:aha:world-critRate"), "world ON applies the ascension bonus");
    assert.ok(normal.applied.some(item => item.id === "v47:aha:world-defenseIgnore"));

    app.state.modifierInputs["aha-world-active"] = false;
    const ultimate = row("151103");
    assert.ok(ultimate, app.node("hsrCalculationFeedback").innerHTML);
    assert.ok(ultimate.applied.some(item => item.id === "v47:aha:world-critRate"), "the Ultimate's Aha arrival activates the world effects automatically");
    app.state.modifierInputs["aha-wish"] = 7;
    assert.equal(row("151103"), undefined, "Wish below 8 keeps the Ultimate unavailable");
    app.state.modifierInputs["aha-wish"] = 8;
    const finale = row("1511202");
    assert.ok(finale, app.node("hsrCalculationFeedback").innerHTML);
    assert.ok(finale.components?.trueDamage, "the prior record and current body are represented as the finale's separate record component");

    app.node("hsrStat-elation").handlers.input();
    const restored = await tool(app.storage, data);
    assert.equal(restored.state.modifierInputs["aha-wish"], 8);
    assert.equal(restored.state.modifierInputs["aha-prior-non-true-damage"], 125000);
    assert.equal(row("1511202", restored).expected, finale.expected, "numeric Aha inputs and final damage survive restoration");
});

test("Round52 Emanator recipient selection keeps each final snapshot isolated and stops when its owner leaves", async () => {
    const { data } = await require("./helpers/hsrDirectVerification.cjs").loadProductionFixture();
    const app = await tool(undefined, data);
    app.window.HsrTool.applyProfileCharacter({ id: "1511", level: 80, eidolon: 0,
        traces: [{ type: "Normal", level: 6 }, { type: "BPSkill", level: 10 }, { type: "Ultra", level: 10 }, { type: "Talent", level: 10 }, { type: "ElationDamage", level: 10 }],
        stats: { atk: 3000, hp: 6000, def: 2000, speed: 130, critRate: 35, critDamage: 120, damageBonus: 0, elation: 100, merrymake: 0 } });
    app.state.party[0] = { characterId: "1502", level: 80, eidolon: 0 };
    app.state.party[1] = { characterId: "1513", level: 80, eidolon: 0 };
    app.state.modifierInputs["elation-certified-banger"] = 0;
    app.state.conditionTab = "軌跡";
    app.node("hsrConditionDialogOpen").handlers.click();
    const selector = "aha-emanator-recipient";
    assert.match(app.node("hsrConditionList").innerHTML, /data-comparison-choice="aha-emanator-recipient"/);
    assert.match(app.node("hsrConditionList").innerHTML, /value="1502"/);
    assert.match(app.node("hsrConditionList").innerHTML, /value="1513"/);
    const selectRecipient = (id) => app.node("hsrConditionDialog").handlers.change({ target: { dataset: { comparisonChoice: selector }, value: id } });
    const fill = (id, stats) => {
        for (const [key, value] of Object.entries(stats)) {
            const inputKey = `aha-reference:${id}:${key}`;
            app.node("hsrConditionDialog").handlers.input({ target: { dataset: { structuredInput: inputKey, structuredStrict: "true" }, value: String(value) } });
        }
    };
    const firstSnapshot = { elation: 180, critRate: 50, critDamage: 160, merrymake: 0, certifiedBanger: 0, defenseIgnore: 0, resistancePenetration: 0, resistance: 20 };
    const secondSnapshot = { elation: 240, critRate: 25, critDamage: 210, merrymake: 10, certifiedBanger: 40, defenseIgnore: 15, resistancePenetration: 10, resistance: 30 };
    selectRecipient("1502"); fill("1502", firstSnapshot);
    const attackName = id => data.attacks.find(attack => attack.id === id)?.name;
    const row = (instance = app) => instance.calculate().find(item => item.attack?.name === attackName("1511022"));
    const firstRows = app.calculate();
    const first = firstRows.find(item => item.attack?.name === attackName("1511022"));
    assert.ok(first, `${app.node("hsrCalculationFeedback").innerHTML}; returned attacks: ${firstRows.map(item=>item.attack?.name).join(",")}`);
    assert.ok(first.components.emanator.nonCrit > 0);
    selectRecipient("1513"); fill("1513", secondSnapshot);
    const second = row();
    assert.ok(second, app.node("hsrCalculationFeedback").innerHTML);
    assert.notEqual(second.components.emanator.nonCrit, first.components.emanator.nonCrit, "the selected member's independent stats determine the rider");
    assert.equal(app.state.modifierInputs["aha-reference:1502:elation"], 180, "the old recipient snapshot remains stored under its own key");
    assert.equal(app.state.modifierInputs["aha-reference:1513:elation"], 240);

    app.node("hsrStat-elation").handlers.input();
    const restored = await tool(app.storage, data);
    assert.equal(restored.state.modifierInputs[selector], 1513);
    assert.equal(row(restored).components.emanator.nonCrit, second.components.emanator.nonCrit, "selected recipient and snapshot survive save/restore");
    restored.state.party[1] = { characterId: "", level: 80, eidolon: 0 };
    assert.equal(row(restored), undefined, "removing the selected Emanator stops only the composite action");
    assert.ok(restored.calculate().some(item => item.attack?.name === attackName("151102")), "Aha's independent attack remains available");
});

test('Round51 known unconnected equipment and character scopes preserve per-attack calculation',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data);
 const profile=id=>({id,level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'MemospriteSkill',level:6},{type:'MemospriteTalent',level:6}],stats:{atk:3000,hp:6000,def:2000,critRate:50,critDamage:100,damageBonus:0}});
 for(const[id,cone]of [['1203','23013'],['1304','21039']]){app.window.HsrTool.applyProfileCharacter(profile(id));app.state.coneId=cone;assert.ok(app.calculate().length);assert.match(app.node('hsrResults').innerHTML,new RegExp('data-hsr-equipment-scope="'+cone+'"'));}
 app.window.HsrTool.applyProfileCharacter(profile('8007'));app.state.coneId='21057';for(const[k,v]of Object.entries({atk:5000,critRate:37,critDamage:143,damageBonus:19,defenseIgnore:0,resistancePenetration:0}))app.state.modifierInputs['memosprite:8007:'+k]=v;
 assert.ok(app.calculate().some(r=>r.attack?.name===data.attacks.find(a=>a.id==='1800701').name));assert.match(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="21057"/);
 app.window.HsrTool.applyProfileCharacter(profile('1214'));assert.ok(app.calculate().length);assert.match(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="character"/);assert.match(app.node('hsrResults').innerHTML,/計算可能の表示は攻撃ごとの対応範囲/);
});


test('Round53 Aha preserves overflow input, shows record branches, and identifies uncalculated HP debt',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id:'1511',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{hp:6000,atk:3000,def:2000,speed:100,elation:100,critRate:35,critDamage:120,damageBonus:0}});
 app.node('hsrStat-elation').value='100';app.node('hsrPunchline').value='20';app.node('hsrMerrymake').value='0';
 Object.assign(app.state.modifierInputs,{'aha-wish':18,'elation-certified-banger':40,'aha-prior-non-true-damage':10000});
 const name=id=>data.attacks.find(a=>a.id===id).name;const rows=app.calculate(),u=rows.find(r=>r.attack?.name===name('151103')),f=rows.find(r=>r.attack?.name===name('1511202'));
 assert.ok(u);assert.ok(f);assert.equal(app.state.modifierInputs['aha-wish'],18);
 assert.match(app.node('hsrResults').innerHTML,/本体が会心の場合/);assert.match(app.node('hsrResults').innerHTML,/愉悦本体＋記録確定成分の合計/);assert.match(app.node('hsrResults').innerHTML,/data-hsr-equipment-scope="aha-debt"/);assert.match(app.node('hsrResults').innerHTML,/HP操作は未計算/);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/max="18"/);
 app.node('hsrStat-elation').handlers.input();const restored=await tool(app.storage,data);assert.equal(restored.state.modifierInputs['aha-wish'],18);const saved=restored.calculate().find(r=>r.attack?.name===name('1511202'));assert.equal(saved.expected,f.expected);
 restored.state.modifierInputs['aha-wish']=19;const partial=restored.calculate();assert.equal(partial.some(r=>r.attack?.name===name('151103')),false);assert.ok(partial.some(r=>r.attack?.name===name('151101')));
 restored.window.HsrTool.applyProfileCharacter({id:'1501',level:80,eidolon:0,traces:[{type:'Normal',level:6}],stats:{hp:6000,atk:3000,def:2000,speed:100,elation:100,critRate:35,critDamage:120,damageBonus:0}});restored.state.party=[];restored.calculate();assert.doesNotMatch(restored.node('hsrResults').innerHTML,/data-hsr-equipment-scope="aha-debt"/);
});


test('Round53 single-layer Aha debt is a saved HP sidecar and never another damage component',async()=>{
 const {data}=await require('./helpers/hsrDirectVerification.cjs').loadProductionFixture(),app=await tool(undefined,data);
 app.window.HsrTool.applyProfileCharacter({id:'1511',level:80,eidolon:0,traces:[{type:'Normal',level:6},{type:'BPSkill',level:10},{type:'Ultra',level:10},{type:'Talent',level:10},{type:'ElationDamage',level:10}],stats:{hp:6000,atk:3000,def:2000,speed:100,elation:100,critRate:35,critDamage:120,damageBonus:0}});
 app.node('hsrStat-elation').value='100';app.node('hsrPunchline').value='20';app.node('hsrMerrymake').value='0';app.node('hsrEnemyMaxHp').value='1000000';app.node('hsrEnemyHpPercent').value='80';Object.assign(app.state.modifierInputs,{'aha-wish':18,'elation-certified-banger':40,'aha-prior-non-true-damage':10000});
 const name=data.attacks.find(a=>a.id==='1511202').name,find=instance=>instance.calculate().find(r=>r.attack?.name===name),before=find(app);
 app.state.conditionTab='軌跡';app.node('hsrConditionDialogOpen').handlers.click();assert.match(app.node('hsrConditionList').innerHTML,/aha-debt-ordinary-target/);assert.match(app.node('hsrConditionList').innerHTML,/aha-debt-prior-percent/);
 const change=(key,value,checked)=>checked===undefined?app.node('hsrConditionDialog').handlers.input({target:{dataset:{structuredInput:key,structuredStrict:'true'},value:String(value)}}):app.node('hsrConditionDialog').handlers.change({target:{dataset:{structuredToggle:key},checked}});
 change('aha-debt-ordinary-target',true,true);let missing=find(app);assert.ok(missing);assert.equal(missing.ahaDebt.supported,false,'unknown prior debt is never assumed zero');
 change('aha-debt-prior-percent',10);const after=find(app);assert.equal(after.nonCrit,before.nonCrit);assert.equal(after.expected,before.expected);assert.equal(after.ahaDebt.supported,true);assert.equal(after.ahaDebt.maxHp,1000000);assert.match(app.node('hsrResults').innerHTML,/負債のHP内訳・単一HPの敵/);assert.doesNotMatch(app.node('hsrResults').innerHTML,/HP操作は未計算/);
 assert.ok(Math.abs(after.ahaDebt.branches.nonCrit.hpAfter-(800000-before.nonCrit))<1e-8);assert.ok(Math.abs(after.ahaDebt.branches.nonCrit.debtPercentAfter-(10+25*before.nonCrit/1000000))<1e-8);assert.equal(after.ahaDebt.branches.nonCrit.additionalHitDamage,0);assert.equal(Object.keys(after.components).join(','),'direct,trueDamage');
 const restored=await tool(app.storage,data),saved=find(restored);assert.equal(restored.state.modifierInputs['aha-debt-ordinary-target'],true);assert.equal(saved.ahaDebt.branches.nonCrit.debtPercentAfter,after.ahaDebt.branches.nonCrit.debtPercentAfter);
 restored.node('hsrEnemyHpPercent').value='0.001';const boundary=find(restored);assert.ok(boundary);assert.equal(boundary.ahaDebt.supported,false,'only the HP sidecar stops at a death boundary');assert.equal(boundary.expected,before.expected);assert.match(restored.node('hsrResults').innerHTML,/死亡または負債100%/);
 restored.state.modifierInputs['aha-debt-ordinary-target']=false;assert.equal(find(restored).ahaDebt,undefined,'disabling HP details never toggles passive damage or mutates enemy');
 restored.window.HsrTool.applyProfileCharacter({id:'1501',level:80,eidolon:0,traces:[{type:'Normal',level:6}],stats:{hp:6000,atk:3000,def:2000,speed:100,elation:100,critRate:35,critDamage:120,damageBonus:0}});restored.state.party[0]={characterId:'1511',level:80,eidolon:0};restored.calculate();assert.match(restored.node('hsrResults').innerHTML,/アッハ編成中の他キャラ攻撃は、負債のHP内訳の計算対象外/);assert.doesNotMatch(restored.node('hsrResults').innerHTML,/単一HPの対象は補正条件で事前状態を指定/);

});
