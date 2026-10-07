"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createScenarioHarness, prepareScenarioInputs, setElement, setConditionElement} = require("./helpers/calcScenarioHarness.cjs");
function fixture(id, constellation = 0, option = "inactive", reaction = "none") {
    const f = createScenarioHarness();
    prepareScenarioInputs(f.elements, {characterId:id, constellation, stats:{hp:25000, baseHp:10000, atk:2000, baseAtk:1000, critRate:80, critDamage:250}});
    setElement(f.elements,"genshinJsonReactionOption",reaction);
    if(id === "10000119") setConditionElement(f.elements,"character:10000119:group:laumaA1Moonsign","option",option);
    f.engine=f.sandbox.GenshinCalcEngine;
    f.request=f.engine.buildCalculationRequestFromForm();
    return f;
}
function replay(f,p) {
    const r=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(f.request,p).request)),f.calcData);
    assert.equal(JSON.stringify(r.results),JSON.stringify(p.results));
}
test("Lauma A1 is one exclusive state: initial uses fixed reaction crit, full adds only lunar crit",()=>{
    for(const option of ["inactive","initial","full"]) {
        const f=fixture("10000119",0,option,"bloom"),p=f.engine.calculateDamageRequest(f.request,f.calcData);
        const b=p.results.find(r=>r.entry.id === "reaction_bloom");
        assert.equal(b.breakdown.reaction.critRate,option === "initial" ? 15:0);
        assert.equal(b.breakdown.reaction.critDamage,option === "initial" ? 100:0);
        assert.equal(p.context.effectiveStats.critRate,80);
        assert.equal(p.context.effectiveStats.critDamage,250);
        assert.equal(b.total.expected/b.total.nonCrit,option === "initial" ? 1.15:1);
        const c=f.engine.collectActiveModifiers(f.calcData,p.context);
        const lunar=f.engine.applyModifiersToDamageEntry({id:"lunar-probe",attackType:"reaction",damageType:"reaction",group:"reaction",element:"草",directReactionId:"lunarBloom",scalings:[]},p.context,c);
        assert.equal(lunar.totals.reactionCritRate,option === "full" ? 10:0);
        assert.equal(lunar.totals.reactionCritDamage,option === "full" ? 20:0);
        assert.equal(c.applied.some(x=>x.modifier.auditDisposition === "supersededByStructuredRecord"),false);
        const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);
        assert.equal(panel.complexConditionInputs.filter(x=>x.label === "元素スキル使用後の月兆状態").length,1);
        replay(f,p);
    }
});
test("Nilou C2 uses two hit triggers and never connects retired reaction bonuses",()=>{
    for(const [hydro,bloom] of [[false,false],[true,false],[false,true],[true,true]]) {
        const f=fixture("10000070",2);
        for(const [group,on] of [["nilouC2HydroHit",hydro],["nilouC2BloomHit",bloom]]) setConditionElement(f.elements,`character:10000070:group:${group}`,"option",on?"active":"inactive");
        f.request=f.engine.buildCalculationRequestFromForm();
        const p=f.engine.calculateDamageRequest(f.request,f.calcData),c=f.engine.collectActiveModifiers(f.calcData,p.context);
        for(const [element,on] of [["水",hydro],["草",bloom]]) {
            const a=f.engine.applyModifiersToDamageEntry({id:"probe",attackType:"skill",damageType:"skill",group:"skill",element,scalings:[]},p.context,c);
            assert.equal(a.totals.resistanceDebuff,on?35:0);
        }
        assert.equal(c.applied.some(x=>["c_10000070_2_3","c_10000070_2_4"].includes(x.modifier.id)),false);
        replay(f,p);
    }
});
test("Nilou C6 shares its two continuous HP crit effects in one condition",()=>{
    const f=fixture("10000070",6),p=f.engine.calculateDamageRequest(f.request,f.calcData);
    const c=f.engine.collectActiveModifiers(f.calcData,p.context);
    const mods=c.applied.filter(x=>["c_10000070_6_1","c_10000070_6_2"].includes(x.modifier.id));
    assert.equal(mods.length,2);
    assert.equal(mods[0].analysis.conditionStateKey,mods[1].analysis.conditionStateKey);
    const a=f.engine.applyModifiersToDamageEntry(p.results[0].entry,p.context,c);
    assert.equal(a.totals.critRateBonus,15);
    assert.equal(a.totals.critDamageBonus,30);
    replay(f,p);
});
test("Lauma provider display distinguishes fixed crit from lunar crit additions",async()=>{
    const fs=require("node:fs"), path=require("node:path"), vm=require("node:vm"), root=path.resolve(__dirname,"../..");
    const f=fixture("10000070",0,"inactive","bloom");
    f.sandbox.console={...console,log(){},warn(){}};
    f.sandbox.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url)),"utf8"))});
    for(const file of ["genshinIdResolver.js","genshinCalcData.js","genshinCalcRenderer.js"]) vm.runInContext(fs.readFileSync(path.join(root,"games/js",file),"utf8"),f.sandbox);
    await f.sandbox.GenshinIdResolver.ready;
    f.calcData=await f.sandbox.GenshinCalcData.loadGenshinCalcData();
    f.elements.genshinJsonConditionCards={innerHTML:""};
    f.request.party={schemaVersion:2,focusSlot:1,conditionStates:{},members:[
        {slot:1,enabled:true,role:"main",characterId:"10000070",stats:f.request.stats},
        {slot:2,enabled:true,role:"support",characterId:"10000119",element:"草",constellation:0,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:20000,atk:2000,elementalMastery:100},equipment:{},buffStates:{}}
    ]};
    for(const option of ["initial","full"]) {
        f.request.party.conditionStates["party:2:10000119:group:laumaA1Moonsign"]={enabled:true,option};
        const p=f.engine.calculateDamageRequest(f.request,f.calcData);
        assert.equal(p.results.find(r=>r.entry.id === "reaction_bloom").breakdown.reaction.critRate,option === "initial" ? 15 : 0);
        const state=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);
        f.sandbox.GenshinCalcRenderer.renderConditionCards(state,p.context,f.calcData);
        const impact=f.elements.genshinJsonConditionCards.innerHTML.match(/<section class="genshin-provider-impact">[\s\S]*?<\/section>/)[0];
        if(option === "initial") {assert.match(impact,/会心率（固定）/);assert.match(impact,/>15%</);assert.match(impact,/>100%</);assert.doesNotMatch(impact,/\+15%/);}
        else {assert.match(impact,/>\+10%</);assert.match(impact,/>\+20%</);assert.doesNotMatch(impact,/固定/);}
        assert.doesNotMatch(impact,/\+0/);
    }
});
