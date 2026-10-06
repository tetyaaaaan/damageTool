"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require("./helpers/calcScenarioHarness.cjs");

const VESNA = "10000143";
const DOC_PATH = path.resolve(__dirname, "../../games/genshin/data/v2/version-transitions/7.0-to-7.1/vesna-currentcalc.json");
const DOC = JSON.parse(fs.readFileSync(DOC_PATH, "utf8"));
const BASE_STATS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/base-stats.json"), "utf8"));
const ENTRY = (name) => `provisional71_${VESNA}_${name}`;
const MOD = (name) => `provisional71_${VESNA}_${name}`;
const A1 = MOD("a1_disciplinary_action_blade_bonus");
const A4_ATK = MOD("a4_atk_per_cryo_anemo");
const A4_EM = MOD("a4_em_other_elements");
const C6_HIT = ENTRY("c6_spirit_blade_200");
const DISCIPLINARY_GROUP = `character:${VESNA}:group:vesna_disciplinary`;
const RADIANCE_GROUP = `character:${VESNA}:group:vesna_radiance`;

function loaderApi() {
    const root = path.resolve(__dirname, "../..");
    const sandbox = { window: {}, console, fetch: async () => { throw new Error("fetch is not used"); } };
    vm.createContext(sandbox);
    ["genshinDataContract.js", "genshinCalcData.js"].forEach((name) => {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", name), "utf8"), sandbox, { filename: name });
    });
    return sandbox.window.GenshinCalcData;
}

async function baseStatsApi() {
    const baseStatsSource = fs.readFileSync(path.resolve(__dirname, "../../games/js/genshinBaseStats.js"), "utf8");
    const sandbox = {
        console,
        fetch: async (url) => ({
            ok: true,
            json: async () => String(url).includes("vesna-currentcalc.json") ? DOC : BASE_STATS
        }),
        document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } }
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(baseStatsSource, sandbox, { filename: "genshinBaseStats.js" });
    await sandbox.GenshinBaseStats.ready;
    return sandbox.GenshinBaseStats;
}

function fixture({ characterId = VESNA, constellation = 0, atk = 2000, baseAtk = 1000, em = 100 } = {}) {
    const f = createScenarioHarness();
    loaderApi().applyProvisional71Data(f.calcData, [DOC]);
    prepareScenarioInputs(f.elements, {
        characterId, constellation,
        stats: { atk, baseAtk, hp: 20000, def: 1000, elementalMastery: em, critRate: 0, critDamage: 0, elementDamageBonus: 0 }
    });
    f.engine = f.sandbox.GenshinCalcEngine;
    f.calculate = (request) => f.engine.calculateDamageRequest(request || f.engine.buildCalculationRequestFromForm(), f.calcData);
    f.request = f.engine.buildCalculationRequestFromForm();
    f.calculate = (request = f.request) => f.engine.calculateDamageRequest(request, f.calcData);
    return f;
}

function result(payload, id) {
    const row = payload.results.find((item) => item.entry.id === id);
    assert.ok(row, `missing damage entry ${id}`);
    return row;
}

function near(actual, expected, label = "value") {
    assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} !== ${expected}`);
}

function conditionKey(payload, id) {
    const item = payload.candidateModifiers.find((entry) => entry.modifier?.id === id);
    assert.ok(item, `missing modifier ${id}`);
    return item.analysis.conditionStateKey;
}

function setStack(f, id, value) {
    const key = id === A1 || /c2/i.test(id) ? DISCIPLINARY_GROUP : conditionKey(f.calculate(), id);
    const party = f.request?.party;
    setConditionElement(f.elements, key, "stack", value);
    f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(), f.calcData);
    f.request = f.engine.buildCalculationRequestFromForm();
    if (party) f.request.party = party;
}

function setOption(f, id, value) {
    const key = id === A4_ATK || id === A4_EM || id === "radiance" ? RADIANCE_GROUP
            : id === "transpose" ? `character:${VESNA}:group:vesna_transpose`
            : conditionKey(f.calculate(), id);
    const party = f.request?.party;
    setConditionElement(f.elements, key, "option", value);
    f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(), f.calcData);
    f.request = f.engine.buildCalculationRequestFromForm();
    if (party) f.request.party = party;
}

function setParty(f, characterIds) {
    f.request.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: VESNA },
            ...characterIds.map((characterId, index) => ({ slot: index + 2, role: "support", enabled: true, characterId }))
        ]
    };
}

function applied(row, id) {
    return (row.breakdown?.appliedModifiers || []).find((item) => item.modifier?.id === id);
}

function replay(f, payload) {
    const snapshot = f.engine.createCalculationSnapshot(payload.calculationRequest, payload);
    const restored = f.calculate(JSON.parse(JSON.stringify(snapshot.request)));
    assert.deepEqual(JSON.parse(JSON.stringify(restored.results)), JSON.parse(JSON.stringify(payload.results)));
}

test("Vesna CurrentCalc materializes normal third sequence as two Lv-preserving single hits", () => {
    const f = fixture();
    setElement(f.elements, "genshinJsonEnableCharacterCondition", "", false);
    f.request = f.engine.buildCalculationRequestFromForm();
    const payload = f.calculate();
    for (const [suffix, param] of [["3a", "param3"], ["3b", "param3"]]) {
        const row = result(payload, ENTRY(`normal_${suffix}`));
        assert.equal(row.entry.attackType, "normalAttack");
        assert.equal(row.entry.hitCount, 1);
        assert.ok(row.entry.source?.param === param || row.entry.parameter === param || row.entry.scalings?.length);
        assert.equal(row.entry.damageType, "normal");
    }
    const data = f.calcData.talentScalings[VESNA].normalAttack.entries;
    for (const id of [ENTRY("normal_3a"), ENTRY("normal_3b")]) {
        const row = data.find((entry) => entry.id === id);
        assert.ok(row);
        assert.deepEqual(Object.keys(row.scalings[0].valuesByLevel).sort((a, b) => Number(a) - Number(b)), Array.from({ length: 15 }, (_, i) => String(i + 1)));
    }
    assert.deepEqual(data.find((entry) => entry.id === ENTRY("normal_3a")).scalings,
        data.find((entry) => entry.id === ENTRY("normal_3b")).scalings,
        "both third-sequence hits retain the same parameter-3 Lv.1–15 values");
});

test("Vesna provisional base stats resolve across ascension boundaries and levels 1–100", async () => {
    const api = await baseStatsApi();
    const checkpoints = [
        api.resolveCharacter(VESNA, 1, 0),
        api.resolveCharacter(VESNA, 20, 0),
        api.resolveCharacter(VESNA, 20, 1),
        api.resolveCharacter(VESNA, 37, 1),
        api.resolveCharacter(VESNA, 90, 6),
        api.resolveCharacter(VESNA, 100, 6)
    ];
    assert.ok(checkpoints.every(Boolean), "all Vesna level and ascension checkpoints resolve");
    assert.equal(checkpoints[0].level, 1);
    assert.equal(checkpoints[3].level, 37);
    assert.equal(checkpoints[5].level, 100);
    assert.ok(checkpoints.every((item) => item.baseHp > 0 && item.characterBaseAtk > 0 && item.baseDef > 0));
    const source = DOC.baseStats.characters[VESNA];
    const levelSpecs = [[1, 0], [20, 0], [20, 1], [37, 1], [90, 6], [100, 6]];
    for (const [index, [level, ascension]] of levelSpecs.entries()) {
        const actual = checkpoints[index];
        const promote = source.promoteProps[ascension];
        for (const [prop, key] of [["1", "baseHp"], ["4", "characterBaseAtk"], ["7", "baseDef"]]) {
            const expected = source.baseProps[prop] * BASE_STATS.curves[String(source.curveIds[prop])][level - 1]
                + promote[prop];
            near(actual[key], expected, `level ${level} ascension ${ascension} ${key}`);
        }
    }
    for (let level = 1; level <= 100; level += 1) {
        const actual = api.resolveCharacter(VESNA, level);
        const ascension = Math.min([20, 40, 50, 60, 70, 80].filter((threshold) => level >= threshold).length, 6);
        const promote = source.promoteProps[ascension];
        for (const [prop, key] of [["1", "baseHp"], ["4", "characterBaseAtk"], ["7", "baseDef"]]) {
            const expected = source.baseProps[prop] * BASE_STATS.curves[String(source.curveIds[prop])][level - 1]
                + promote[prop];
            near(actual[key], expected, `all-level curve contract at level ${level} ${key}`);
        }
    }
    assert.ok(checkpoints[1].baseHp < checkpoints[2].baseHp, "ascension adds base HP at level 20");
    assert.ok(checkpoints[1].characterBaseAtk < checkpoints[2].characterBaseAtk, "ascension adds base ATK at level 20");
    assert.ok(checkpoints[2].characterBaseAtk < checkpoints[3].characterBaseAtk, "intermediate levels use growth curves");
    assert.ok(checkpoints[4].characterBaseAtk < checkpoints[5].characterBaseAtk, "level 100 continues character growth");
});

test("Vesna Anemo Stellar Swirl entry uses Anemo resistance and does not inherit Anemo talent bonuses", () => {
    const calculate = (anemoResistance, bonus) => {
        const f = fixture();
        setOption(f, "radiance", "stellarSwirl");
        f.request.enemy.resistance.base.byElement = { anemo: anemoResistance, cryo: 10 };
        f.request.stats.elementalDamageBonus = bonus;
        return { f, payload: f.calculate(), f };
    };
    const baseline = calculate(10, 0);
    const row = result(baseline.payload, ENTRY("skill_spirit_blade_rank2_stellarSwirl"));
    assert.equal(row.entry.element, "風");
    assert.equal(row.entry.damageType, "reaction");
    const highRes = calculate(80, 0);
    near(result(highRes.payload, row.entry.id).expected, row.expected * ((1 / 4.2) / 0.9), "Anemo RES scaling");
    const bonus = calculate(10, 100);
    near(result(bonus.payload, row.entry.id).expected, row.expected, "Anemo DMG bonus must not affect Stellar Swirl");
    replay(baseline.f, baseline.payload);
});

test("Vesna A1 blade damage bonus is limited to Spirit Blade hits and stacks cap at six", () => {
    const f = fixture();
    setStack(f, A1, 6);
    const six = f.calculate();
    const bladeId = ENTRY("skill_spirit_blade_rank2");
    near(result(six, bladeId).breakdown.baseTalentDamageMultiplier, 1.6, "six A1 stacks");
    near(result(six, ENTRY("skill_initial")).breakdown.baseTalentDamageMultiplier, 1, "initial Skill excluded");
    near(result(six, ENTRY("burst_spirit_blade")).breakdown.baseTalentDamageMultiplier, 1.6, "A1 also affects the Spirit Blade Burst hit");
    setStack(f, A1, 99);
    near(result(f.calculate(), bladeId).breakdown.baseTalentDamageMultiplier, 1.6, "A1 stack cap");
    replay(f, six);
});

test("Vesna Armed for Action infuses elements while preserving Normal/Charged/Plunging damage types", () => {
    const f = fixture();
    const payload = f.calculate();
    for (const [id, damageType] of [
        [ENTRY("normal_1_armed_for_action"), "normal"],
        [ENTRY("charged_armed_for_action"), "charged"],
        [ENTRY("plunge_low_armed_for_action"), "plunging"]
    ]) {
        const row = result(payload, id);
        assert.equal(row.entry.element, "風");
        assert.equal(row.entry.damageType, damageType);
        assert.ok(!row.breakdown.appliedModifiers?.some((item) => item.modifier?.category === "skillDamageBonus"),
            `${id} does not receive an Elemental Skill damage bonus`);
    }
});

test("Vesna C1 Stellar Swirl bonus only applies in Armed for Action mode", () => {
    const f = fixture({ constellation: 1 });
    setOption(f, "radiance", "stellarSwirl");
    const enabled = f.calculate();
    const stellarId = ENTRY("skill_spirit_blade_rank2_stellarSwirl");
    assert.ok(applied(result(enabled, stellarId), MOD("c1_stellarSwirl_bonus")), "C1 bonus applies during the Skill mode");

    setElement(f.elements, "genshinJsonEnableCharacterCondition", "", false);
    f.request = f.engine.buildCalculationRequestFromForm();
    const disabled = f.calculate();
    const disabledStellar = result(disabled, stellarId);
    assert.ok(!applied(disabledStellar, MOD("c1_stellarSwirl_bonus")), "C1 mode bonus is inactive outside Armed for Action");
});

test("Vesna A4 responds to party elements and C4 triples its ATK/EM bonuses", () => {
    const base = fixture({ constellation: 0, atk: 2000, baseAtk: 1000, em: 100 });
    setParty(base, ["10000002", "10000016", "10000014"]);
    setOption(base, "radiance", "stellarSwirl");
    const basePayload = base.calculate();
    const baseAtk = basePayload.statTrace.find((entry) => entry.modifierId === A4_ATK);

    const f = fixture({ constellation: 4, atk: 2000, baseAtk: 1000, em: 100 });
    setParty(f, ["10000002", "10000016", "10000014"]);
    setOption(f, "radiance", "stellarSwirl");
    const payload = f.calculate();
    const atk = payload.statTrace.find((entry) => entry.modifierId === A4_ATK);
    const em = payload.statTrace.find((entry) => entry.modifierId === A4_EM);
    assert.ok(atk, `missing ${A4_ATK}`);
    assert.ok(em, `missing ${A4_EM}`);
    assert.equal(baseAtk.value, 120);
    assert.equal(atk.value, 360, "two matching party elements yield +36% of 1000 base ATK at C4");
    assert.equal(em.value, 150, "two other party elements yield +150 EM at C4");

    setOption(f, "radiance", "none");
    const off = f.calculate();
    assert.equal(off.statTrace.find((entry) => entry.modifierId === A4_ATK)?.value || 0, 0, "Radiance OFF disables A4 ATK");
    assert.equal(off.statTrace.find((entry) => entry.modifierId === A4_EM)?.value || 0, 0, "Radiance OFF disables A4 EM");
});

test("Vesna C2 gives ATK per stack up to the maximum", () => {
    const f = fixture({ constellation: 2 });
    setStack(f, A1, 5);
    const belowCap = f.calculate();
    const belowCapEntry = belowCap.statTrace.find((entry) => entry.modifierId === MOD("c2_atk_bonus_at_max_stack"));
    if (belowCapEntry) assert.equal(belowCapEntry.value, 0, "five stacks do not activate the C2 ATK bonus");
    setStack(f, A1, 6);
    const atCap = f.calculate();
    const appliedBuff = atCap.statTrace.find((entry) => entry.modifierId === MOD("c2_atk_bonus_at_max_stack"));
    assert.ok(appliedBuff, "C2 ATK activates at six Disciplinary Action stacks");
    assert.equal(appliedBuff.value, 400, "40% of base ATK 1000 contributes 400 ATK");
});

test("Vesna C6 Spirit Blade is a separate 200% hit; elevation affects only her Stellar Swirl", () => {
    const f = fixture({ constellation: 6 });
    const inactive = f.calculate();
    assert.ok(!inactive.results.some((row) => row.entry.id === C6_HIT), "C6 follow-up is absent until its selector is activated");
    setOption(f, "transpose", "active");
    const ordinary = f.calculate();
    const extra = result(ordinary, C6_HIT);
    assert.equal(extra.entry.attackType, "extraDamage");
    assert.equal(extra.entry.damageType, "skill");
    assert.equal(extra.entry.hitCount, 1);
    assert.equal(extra.entry.element, "風");
    assert.equal(extra.entry.scalings[0].valuesByLevel["10"], 200);
    replay(f, ordinary);

    setOption(f, "radiance", "stellarSwirl");
    const payload = f.calculate();
    assert.ok(!payload.results.some((row) => row.entry.id === C6_HIT), "Radiance selects the Stellar Swirl variant only");
    const elevated = result(payload, ENTRY("c6_spirit_blade_200_stellarSwirl"));
    assert.ok(elevated);
    assert.equal(elevated.breakdown.finalDamageMultiplier, 1.2);
    const c5 = fixture({ constellation: 5 });
    setOption(c5, "radiance", "stellarSwirl");
    const c5Payload = c5.calculate();
    const commonId = ENTRY("skill_spirit_blade_rank2_stellarSwirl");
    near(result(payload, commonId).expected, result(c5Payload, commonId).expected * 1.2,
        "C6 multiplies the same C1-boosted Stellar hit independently");
    near(result(payload, commonId).breakdown.reactionBonus, result(c5Payload, commonId).breakdown.reactionBonus,
        "C6 is not added to the C1 reaction bonus bucket");
    const nonVesna = fixture({ characterId: "10000133" });
    const supportRequest = nonVesna.engine.buildCalculationRequestFromForm();
    const withoutProvider = nonVesna.engine.calculateDamageRequest(supportRequest, nonVesna.calcData);
    supportRequest.party = {
        schemaVersion: 2, focusSlot: 1, conditionStates: {},
        members: [
            { slot: 1, role: "main", enabled: true, characterId: "10000133" },
            { slot: 2, role: "support", enabled: true, characterId: VESNA, constellation: 6,
                stats: { atk: 2000, baseAtk: 1000, hp: 20000, def: 1000, elementalMastery: 100 },
                talentLevels: { normal: 10, skill: 10, burst: 10 }, buffStates: {} }
        ]
    };
    const support = nonVesna.engine.calculateDamageRequest(supportRequest, nonVesna.calcData);
    const recipientHits = support.results.filter((row) => row.entry.directReactionId === "stellarSwirl");
    assert.ok(recipientHits.length > 0, "recipient actually deals Stellar Swirl damage");
    for (const hit of recipientHits) {
        near(hit.expected, result(withoutProvider, hit.entry.id).expected,
            "Vesna C6 does not elevate the recipient's Stellar hit");
    }
    replay(f, payload);
});

test("Vesna unconfirmed Wind Pinion and C6 150% Transpose are excluded and displayed as pending", () => {
    const f = fixture({ constellation: 6 });
    setOption(f, "transpose", "active");
    const payload = f.calculate();
    const pendingIds = [ENTRY("skill_wind_pinion_unknown"), ENTRY("c6_transpose_150_unknown"), ENTRY("c6_wind_pinion_unknown")];
    for (const id of pendingIds) {
        const row = payload.results.find((item) => item.entry.id === id);
        assert.ok(row, `pending result row missing: ${id}`);
        assert.equal(row.entry.damageType, "unknown");
        assert.equal(row.entry.calculationStatus, "externalConfirmationRequired");
        assert.equal(row.expected, 0);
        assert.ok(row.problems?.length || row.entry.problems?.length, `${id} should explain why it cannot be calculated`);
    }
    assert.equal(DOC.deferredUnknowns.find((item) => item.id === ENTRY("unknown_c6_transpose_150")).damageType, "unknown");
    assert.equal(DOC.deferredUnknowns.find((item) => item.id === ENTRY("unknown_wind_pinion")).damageType, "unknown");
    const initial = result(payload, ENTRY("skill_initial"));
    const rendererPath = path.resolve(__dirname, "../../games/js/genshinCalcRenderer.js");
    vm.runInContext(fs.readFileSync(rendererPath, "utf8"), f.sandbox, { filename: "genshinCalcRenderer.js" });
    const pending = payload.results.find((item) => item.entry.id === ENTRY("skill_wind_pinion_unknown"));
    const html = f.sandbox.GenshinCalcRenderer.renderDamageBreakdown(pending);
    assert.match(html, /外部確認待ち/);
    assert.doesNotMatch(html, /通常攻撃ダメージバフ|元素スキルダメージバフ/);
    assert.equal(initial.entry.damageType, "skill");
    replay(f, payload);
});

test("Vesna deferred Stellar Swirl ATK blessing remains a non-calculating record", () => {
    const f = fixture({ atk: 3000 });
    setOption(f, "radiance", "stellarSwirl");
    const payload = f.calculate();
    const row = result(payload, ENTRY("skill_spirit_blade_rank2_stellarSwirl"));
    assert.equal(row.breakdown.baseTalentDamageMultiplier, 1);
    const deferred = DOC.deferredUnknowns.find((item) => item.id === ENTRY("deferred_stellarSwirl_atk_bonus"));
    assert.equal(deferred.calculationStatus, "deferredUnknown");
    assert.equal(deferred.nonCalculatingRecord, true);
    assert.equal(row.breakdown.baseTalentDamageMultiplier, 1, "unverified continuous/floor ATK interpretation is not applied");
    replay(f, payload);
});
