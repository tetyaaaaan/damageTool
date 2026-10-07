"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement } = require("./helpers/calcScenarioHarness.cjs");
const EYE = "talent:combat2:group:talent-state:10000052:combat2";
const RESOLVE = "talent:combat3:group:raidenResolve";
function fixture({ characterId = "10000052", constellation = 0, er = 100, cost = 90, resolve = 0 } = {}) {
    const f = createScenarioHarness();
    prepareScenarioInputs(f.elements, { characterId, constellation, stats: { atk: 2000, baseAtk: 1000, energyRecharge: er, critRate: 50, critDamage: 100 } });
    setConditionElement(f.elements, EYE, "stack", cost);
    setConditionElement(f.elements, RESOLVE, "stack", resolve);
    for (const key of [EYE, RESOLVE]) f.elements["toggle:" + key] = { checked: true, dataset: { genshinToggleKey: key } };
    f.engine = f.sandbox.GenshinCalcEngine;
    f.request = f.engine.buildCalculationRequestFromForm();
    return f;
}
const result = (p, id) => { const item = p.results.find(r => r.entry.id === id); assert.ok(item, id); return item; };
const value = (item, id) => item.breakdown.appliedModifiers.find(m => m.modifier.id === id)?.value || 0;
const near = (a,b) => assert.ok(Math.abs(a-b) < 1e-7, a + " != " + b);
function calculate(f) { return f.engine.calculateDamageRequest(f.request, f.calcData); }
function support(f, constellation = 4) {
    f.request.party = { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members: [
        { slot: 1, role: "main", enabled: true, characterId: f.request.characterId, element: f.calcData.characters[f.request.characterId].element, stats: f.request.stats, buffStates: {} },
        { slot: 2, role: "support", enabled: true, characterId: "10000052", element: "雷", constellation, talentLevels: { skill: 10, burst: 10, normal: 10 }, stats: { atk: 4000, baseAtk: 1500, energyRecharge: 300 }, equipment: {}, buffStates: {} }
    ] };
}

test("Raiden A4 uses current ER excess and affects only Electro damage", () => {
    for (const [er, expected] of [[80,0],[100,0],[250,60]]) {
        const f=fixture({er});const p=calculate(f);
        near(value(result(p,"skilldamage"),"raiden_excess_er_electro_bonus"),expected);
        assert.equal(value(result(p,"normal_1damage"),"raiden_excess_er_electro_bonus"),0);
        assert.equal(result(p,"normal_1damage").entry.element,"physical");
    }
});

test("Raiden Eye uses recipient cost times provider talent rate and excludes non-Burst entries", () => {
    for (const [cost, expected] of [[40,12],[60,18],[80,24],[90,27]]) {
        const f=fixture({cost});const p=calculate(f);
        for (const item of p.results) near(value(item,"raiden_eye_burst_bonus"),item.entry.group === "burst" ? expected : 0);
        assert.equal(result(p,"normal_1damage_2").entry.damageType,"burst");
    }
    const f=fixture({cost:90});f.request.talentLevels.skill=1;const p=calculate(f);near(value(result(p,"damage_2"),"raiden_eye_burst_bonus"),19.8);
});

test("Raiden party Eye keeps the recipient cost in party state instead of using the provider's 90 cost", () => {
    for (const [cost, expected] of [[40,12],[60,18],[80,24],[90,27]]) {
        const f=fixture({characterId:"10000016"});support(f,0);
        let p=calculate(f);const c=p.partyModifiers.find(c=>c.modifier.id==="raiden_eye_burst_bonus");assert.ok(c);
        f.request.party.conditionStates[c.partyConditionStateKey]={stack:cost};f.request.party.members[1].buffStates[c.toggleKey]=true;
        p=calculate(f);for(const item of p.results) near(value(item,"raiden_eye_burst_bonus"),item.entry.damageType === "burst" ? expected : 0);
        const replay=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(f.request,p).request)),f.calcData);
        assert.equal(JSON.stringify(replay.results),JSON.stringify(p.results));
    }
});

test("Raiden C2 ignores DEF only for initial and Musou Isshin Burst entries", () => {
    const f=fixture({constellation:2});const on=calculate(f);
    f.request.uiState.conditionByModifier["constellation:C2:c_10000052_2_1"]={enabled:false};const off=calculate(f);
    for(const item of on.results) {
        const before=result(off,item.entry.id);assert.equal(item.breakdown.defenseIgnore,item.entry.group === "burst" ? 60 : 0);
        assert.equal(item.breakdown.defenseReduction,0);
        if(item.entry.group === "burst") assert.ok(item.expected > before.expected);else near(item.expected,before.expected);
    }
});

test("Raiden C4 excludes Raiden herself and adds 30 percent of each recipient base ATK", () => {
    const own=fixture({constellation:4});const ownP=calculate(own);assert.equal(ownP.context.effectiveStats.atk,2000);
    const f=fixture({characterId:"10000016"});support(f);let p=calculate(f);const c=p.partyModifiers.find(c=>c.modifier.id==="c_10000052_4_1");assert.ok(c);assert.equal(c.enabled,false);
    f.request.party.members[1].buffStates[c.toggleKey]=true;f.request.party.conditionStates[c.partyConditionStateKey]={enabled:true,option:"active"};p=calculate(f);assert.equal(p.context.effectiveStats.atk,2300);
    assert.ok(result(p,"normal_1damage").expected > result(calculate(fixture({characterId:"10000016"})),"normal_1damage").expected);
    const replay=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(f.request,p).request)),f.calcData);
    assert.equal(JSON.stringify(replay.results),JSON.stringify(p.results));
    assert.equal(replay.context.effectiveStats.atk,2300);
    const same=fixture();support(same);let q=calculate(same);const candidate=q.partyModifiers.find(c=>c.modifier.id==="c_10000052_4_1");if(candidate)same.request.party.members[1].buffStates[candidate.toggleKey]=true;
    q=calculate(same);assert.equal(q.context.effectiveStats.atk,2000);
});

test("Raiden Resolve is one saved 0-60 input and adds separate initial/state ATK coefficients", () => {
    const zero=calculate(fixture({resolve:0}));const f=fixture({resolve:60});const p=calculate(f);
    near(result(p,"damage_2").breakdown.additiveBaseDamage,2000*6.9984*60/100);
    near(result(p,"normal_1damage_2").breakdown.additiveBaseDamage,2000*1.3071*60/100);
    assert.equal(result(p,"normal_1damage").breakdown.additiveBaseDamage,0);
    assert.equal(result(p,"skilldamage").breakdown.additiveBaseDamage,0);
    assert.ok(result(p,"damage_2").expected > result(zero,"damage_2").expected);
    const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);
    assert.equal(panel.complexConditionInputs.filter(c=>c.key===RESOLVE).length,1);
    const replay=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(f.request,p).request)),f.calcData);
    assert.equal(JSON.stringify(replay.results),JSON.stringify(p.results));
});

test("Raiden independent second hits and final talent levels remain isolated", () => {
    const f=fixture({constellation:6});const p=calculate(f);
    for(const [id,expected] of [["normal_4damage_second",57.29],["normal_4damage_2_second",55.264],["chargeddamage_2_second",132.665]])near(result(p,id).entry.scalings[0].valuesByLevel["10"],expected);
    assert.equal(p.results.filter(r=>r.entry.id==="normal_4damage_second").length,1);
    const c0=calculate(fixture());near(result(p,"skilldamage").entry.scalings[0].valuesByLevel["10"],result(c0,"skilldamage").entry.scalings[0].valuesByLevel["10"]);
    for(const id of ["skilldamage","damage_2"]) {
        assert.equal(result(p,id).breakdown.talentLevel,10);
        assert.equal(JSON.stringify(result(p,id).breakdown.scalingParts),JSON.stringify(result(c0,id).breakdown.scalingParts));
    }
    assert.equal(p.context.talentLevels.skill,10);assert.equal(p.context.talentLevels.burst,10);
});
