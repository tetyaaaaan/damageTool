"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require("./helpers/calcScenarioHarness.cjs");
const A1 = "talent:passive1:group:clorindeElectroReactionStacks";
const A4 = "talent:passive2:group:clorindeLawfulRemunerationStacks";
const BOL = "constellation:C4:group:clorindeBondOfLife";
const CRIT = "constellation:C6:group:clorindeC6AfterSkill";
const MODE = "talent:combat2:group:talent-state:10000098:combat2";
const C1 = "constellation:C1:c_10000098_1_1";
const C6 = "constellation:C6:c_10000098_6_4";
function fixture({ constellation=0, atk=2000, stacks=0, bol=0, mode=false, c1=false, c6=false, crit=false, a4=0 }={}) {
    const f=createScenarioHarness();
    prepareScenarioInputs(f.elements,{characterId:"10000098",constellation,stats:{atk,baseAtk:1000,critRate:50,critDamage:100,elementDamageBonus:0}});
    f.engine=f.sandbox.GenshinCalcEngine;
    for(const [key,value] of [[A1,stacks],[A4,a4],[BOL,bol]]) {setConditionElement(f.elements,key,"stack",value);toggle(f,key,true);}
    for(const [key,on] of [[MODE,mode],[C1,c1],[C6,c6],[CRIT,crit]])toggle(f,key,on);
    f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(),f.calcData);
    return f;
}
function toggle(f,key,on){f.elements["toggle:"+key]={checked:on,dataset:{genshinToggleKey:key}};}
function calc(f){return f.engine.calculateDamageRequest(f.engine.buildCalculationRequestFromForm(),f.calcData);}
function item(p,id){const r=p.results.find(r=>r.entry.id===id);assert.ok(r,id);return r;}
function near(a,b){assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);}
function replay(f,p){const request=f.engine.createCalculationSnapshot(p.calculationRequest,p).request;const r=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(request)),f.calcData);assert.equal(JSON.stringify(r.results),JSON.stringify(p.results));return r;}

test("Clorinde A1 and C2 share 0-3 stacks, current ATK reference and total additive caps",()=>{
    for(const constellation of [0,1,2,6])for(const atk of [2000,10000])for(const stacks of [0,1,2,3]){
        const f=fixture({constellation,atk,stacks,mode:true,c1:true,c6:true});const p=calc(f);
        const expected=Math.min(atk*(constellation>=2?0.3:0.2)*stacks,constellation>=2?2700:1800);
        for(const r of p.results){const eligible=r.entry.element==="雷"&&["normal","burst"].includes(r.entry.damageType);near(r.breakdown.additiveBaseDamage,eligible?expected:0);}
        const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);
        assert.equal(panel.complexConditionInputs.filter(c=>c.key===A1).length,1);
        replay(f,p);
    }
    const physical=calc(fixture({stacks:3}));assert.equal(item(physical,"normal_1damage").breakdown.additiveBaseDamage,0);
});

test("Clorinde additive bonus includes applied ATK buffs instead of recipient base ATK",()=>{
    const f=fixture({stacks:1});
    f.calcData.talentModifiers["10000098"].passives.push({sourceId:"fixture",modifiers:[{id:"fixture_atk",category:"statBonus",applyTo:["atkFlat"],value:500,unit:"flat",condition:"always",calculationSupport:"simple",uidHandling:"conditional"}]});
    const p=calc(f);assert.equal(p.context.effectiveStats.atk,2500);near(item(p,"skilldamage").breakdown.additiveBaseDamage,500);
});

test("Clorinde C1/C6 are independent Electro Normal Attack entries and do not modify original attacks",()=>{
    const f=fixture({constellation:6});const off=calc(f);
    assert.equal(off.results.some(r=>["c_10000098_1_1","c_10000098_6_4"].includes(r.entry.id)),false);
    toggle(f,C1,true);toggle(f,C6,true);const on=calc(f);
    for(const [id,multiplier,hits] of [["c_10000098_1_1",30,2],["c_10000098_6_4",200,1]]){
        const r=item(on,id);assert.equal(r.entry.element,"雷");assert.equal(r.entry.damageType,"normal");assert.equal(r.entry.attackType,"normalAttack");assert.equal(r.entry.hitCount,hits);near(r.breakdown.scalingParts[0].baseDamage,2000*multiplier/100);near(r.total.expected,r.expected*hits);
    }
    for(const r of off.results)near(item(on,r.entry.id).expected,r.expected);
    const injected=structuredClone(f.calcData);
    injected.talentModifiers["10000098"].passives.push({sourceId:"fixture",modifiers:[{id:"normal_bonus",category:"damageBonus",applyTo:["normalAttackDamageBonus"],value:40,unit:"percent",condition:"always",calculationSupport:"simple",uidHandling:"conditional"}]});
    const buffed=f.engine.calculateDamageRequest(f.engine.buildCalculationRequestFromForm(),injected);
    for(const id of ["c_10000098_1_1","c_10000098_6_4"]) {near(item(buffed,id).breakdown.damageBonus-item(on,id).breakdown.damageBonus,40);assert.ok(item(buffed,id).expected>item(on,id).expected);}
    near(item(buffed,"skilldamage").expected,item(on,"skilldamage").expected);
    replay(f,on);
});

test("Clorinde C4 is Bond of Life dependent, Burst only and capped at 200 percent",()=>{
    const f=fixture({constellation:6,c1:true,c6:true});const zero=calc(f);
    for(const [bol,bonus] of [[0,0],[25,50],[33.5,67],[50,100],[100,200],[150,200],[200,200]]){
        setConditionElement(f.elements,BOL,"stack",bol);const p=calc(f);
        for(const r of p.results)near(r.breakdown.damageBonus-item(zero,r.entry.id).breakdown.damageBonus,r.entry.group==="burst"?bonus:0);
        replay(f,p);
    }
});

test("Clorinde C6 crit bonuses use one saved condition and always switch together",()=>{
    const f=fixture({constellation:6});const off=calc(f);
    toggle(f,CRIT,true);const on=calc(f);
    for(const r of on.results){near(r.breakdown.critRate-item(off,r.entry.id).breakdown.critRate,10);near(r.breakdown.critDamage-item(off,r.entry.id).breakdown.critDamage,70);}
    const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(on.context,f.calcData);
    const controls=panel.cards.flatMap(c=>c.sections||[]).flatMap(e=>e.controls||[]).filter(c=>c.key===CRIT);
    assert.equal(controls.length,1);
    assert.equal(panel.complexConditionInputs.filter(c=>c.key===CRIT).length,0);
    const restored=replay(f,on);for(const r of restored.results){near(r.breakdown.critRate,60);near(r.breakdown.critDamage,170);}
    toggle(f,CRIT,false);const again=calc(f);assert.equal(JSON.stringify(again.results),JSON.stringify(off.results));
});

test("Clorinde A4 current layers are 0/10/20 percent CR with save and restore",()=>{
    const f=fixture();const zero=calc(f);
    for(const stack of [0,1,2]){setConditionElement(f.elements,A4,"stack",stack);const p=calc(f);for(const r of p.results)near(r.breakdown.critRate-item(zero,r.entry.id).breakdown.critRate,stack*10);replay(f,p);}
});

test("Clorinde Night Vigil states and all talent levels use captured coefficients and Normal Attack classification",()=>{
    const f=fixture({mode:true});const raw=require("../../games/genshin/data/calc/sources/clorinde-currentcalc-talents.response.json");
    for(let level=1;level<=15;level++){
        setElement(f.elements,"genshinSkillTalentLevel",level);const p=calc(f);
        for(const [id,param,hits] of [["damage","param1",1],["damage_bol_below_100","param2",1],["damage_2","param4",1],["damage_2_bol_below_100","param5",1],["damage_2_pact","param7",3]]){
            const r=item(p,id);assert.equal(r.entry.damageType,"normal");assert.equal(r.entry.element,"雷");assert.equal(r.entry.hitCount,hits);near(r.breakdown.scalingParts[0].talentMultiplier,raw.combat2.attributes.parameters[param][level-1]*100);assert.ok(r.expected>0);
        }
        assert.equal(item(p,"damage_3").entry.damageType,"skill");
        assert.equal(p.results.some(r=>r.entry.attackType==="chargedAttack"),false,"Night Vigil disallows charged attacks");
    }
    const off=calc(fixture());assert.ok(item(off,"chargeddamage").expected>0);assert.equal(item(off,"normal_1damage").entry.element,"physical");assert.equal(off.results.some(r=>r.entry.id==="damage_2_pact"),false);
});

test("Clorinde normal multi-hit components, Burst hits and final C3/C5 talent levels stay consistent",()=>{
    const f=fixture({constellation:6});const p=calc(f);const c0=calc(fixture());
    for(const [base,id,param] of [["normal_3damage","normal_3damage_second","param4"],["normal_4damage","normal_4damage_second","param6"],["normal_4damage","normal_4damage_third","param7"]]) {const r=item(p,id);assert.equal(r.entry.hitCount,1);assert.equal(r.entry.source.param,param);near(r.expected,item(p,base).expected);}
    assert.equal(item(p,"skilldamage").entry.hitCount,5);
    for(const id of ["damage_3","skilldamage"]){assert.equal(item(p,id).breakdown.talentLevel,10);assert.equal(JSON.stringify(item(p,id).breakdown.scalingParts),JSON.stringify(item(c0,id).breakdown.scalingParts));}
    assert.ok(p.results.every(r=>r.expected>0));
});
