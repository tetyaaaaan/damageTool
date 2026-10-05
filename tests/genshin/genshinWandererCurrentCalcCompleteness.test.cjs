'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {createScenarioHarness,prepareScenarioInputs}=require('./helpers/calcScenarioHarness.cjs');
const mode='talent:combat2:group:talent-state:10000075:combat2';
const c2='constellation:C2:group:wandererKuugoryokuDifference';
function fixture(c=6){const f=createScenarioHarness();prepareScenarioInputs(f.elements,{characterId:'10000075',constellation:c,stats:{atk:2000,baseAtk:1000,elementDamageBonus:0}});f.request=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();f.request.uiState.conditionByModifier[mode]={enabled:true};return f;}
function run(f){if(f.request.uiState.conditionByModifier[c2])f.request.uiState.complexConditionByModifier[c2]={stack:f.request.uiState.conditionByModifier[c2].stack};return f.sandbox.GenshinCalcEngine.calculateDamageRequest(f.request,f.calcData);}
function row(p,id){const r=p.results.find(r=>r.entry.id===id);assert.ok(r,id);return r;}
function near(a,b){assert.ok(Math.abs(a-b)<1e-7,a+' != '+b);}
test('Wanderer C2 uses current difference, Burst only, clamps negative/invalid and caps at200 with replay',()=>{const f=fixture(2);f.request.uiState.conditionByModifier[c2]={stack:0,enabled:true};const off=run(f);for(const [x,v]of [[0,0],[1,4],[25,100],[50,200],[75,200],[-1,0],['invalid',0]]){f.request.uiState.conditionByModifier[c2]={stack:x,enabled:true};const p=run(f);near(row(p,'skilldamage_2').breakdown.damageBonus,v);for(const r of p.results.filter(r=>r.entry.damageType!=='burst'))near(r.expected,row(off,r.entry.id).expected);const e=f.sandbox.GenshinCalcEngine;const replay=e.calculateDamageRequest(JSON.parse(JSON.stringify(e.createCalculationSnapshot(p.calculationRequest,p).request)),f.calcData);assert.deepEqual(JSON.parse(JSON.stringify(replay.results)),JSON.parse(JSON.stringify(p.results)));}});
test('Windfavored normal/charged compose independently entered normal and skill levels and retain normal classifications',()=>{const f=fixture(0);f.request.talentLevels.normal=1;f.request.talentLevels.skill=10;const p=run(f);near(row(p,'wind_normal_1damage').breakdown.scalingParts[0].talentMultiplier,68.714*1.5372);assert.equal(row(p,'wind_normal_1damage').entry.damageType,'normal');assert.equal(row(p,'wind_chargeddamage').entry.damageType,'charged');near(row(p,'skilldamage').breakdown.scalingParts[0].talentMultiplier,171.36);assert.ok(!p.results.some(r=>r.entry.attackType==='plungingAttack'));});
test('A1 current Pyro/Cryo contacts buff self only in Windfavored state',()=>{const f=fixture(0);f.request.uiState.conditionByModifier['talent:passive1:group:wandererA1Pyro']={enabled:true};f.request.uiState.conditionByModifier['talent:passive1:group:wandererA1Cryo']={enabled:true};const p=run(f);near(p.context.effectiveStats.atk,2300);near(row(p,'wind_normal_1damage').breakdown.critRate,70);f.request.uiState.conditionByModifier[mode]={enabled:false};const off=run(f);near(off.context.effectiveStats.atk,2000);near(off.context.effectiveStats.critRate,50);});
test('A4 has four independent Anemo arrows; C1 adds25 points per arrow without modifying normal attacks',()=>{const f=fixture(0);const off=run(f);f.request.uiState.conditionByModifier['talent:passive2:group:wandererDescentArrows']={enabled:true};const p=run(f);const a=row(p,'wanderer_descent_arrows');assert.equal(a.entry.element,'風');assert.equal(a.entry.hitCount,4);near(a.breakdown.scalingParts[0].talentMultiplier,35);f.request.constellation=1;const c1=run(f);near(row(c1,'wanderer_descent_arrows').breakdown.scalingParts[0].talentMultiplier,60);near(row(c1,'wind_normal_1damage').expected,row(off,'wind_normal_1damage').expected);});
test('C6 is a separate40% Anemo normal hit per Windfavored entry and C2 excludes it',()=>{const f=fixture(6);const off=run(f);f.request.uiState.conditionByModifier['constellation:C6:group:wandererC6Followup']={enabled:true};const p=run(f);const extras=p.results.filter(r=>r.entry.effectId==='c_10000075_6_1');assert.equal(extras.length,4);for(const r of extras){assert.equal(r.entry.element,'風');assert.equal(r.entry.damageType,'normal');near(r.expected,row(p,r.entry.id.replace('c_10000075_6_1_','')).expected*.4);}near(row(p,'wind_normal_1damage').expected,row(off,'wind_normal_1damage').expected);f.request.uiState.conditionByModifier[c2]={stack:50,enabled:true};const on=run(f);for(const r of extras)near(row(on,r.entry.id).expected,r.expected);f.request.uiState.conditionByModifier[mode]={enabled:false};assert.equal(run(f).results.filter(r=>r.entry.effectId==='c_10000075_6_1').length,0);});


test('confirmed param4 equals param3 at all15 levels and becomes an independent normal/Windfavored hit without changing other entries',()=>{
    const f=fixture(0);
    for(let level=1;level<=15;level++){
        f.request.talentLevels.normal=level;
        for(const state of [false,true]){
            f.request.uiState.conditionByModifier[mode]={enabled:state};
            const p=run(f),prefix=state?'wind_':'';
            const first=row(p,prefix+'normal_3damage'),second=row(p,prefix+'normal_3damage_2');
            assert.notEqual(first.entry.id,second.entry.id);
            assert.equal(first.entry.hitCount,1);assert.equal(second.entry.hitCount,1);
            assert.equal(second.entry.source.param,'param4');
            assert.equal(second.entry.attackType,'normalAttack');assert.equal(second.entry.damageType,'normal');
            near(second.expected,first.expected);
            near(second.breakdown.scalingParts[0].talentMultiplier,first.breakdown.scalingParts[0].talentMultiplier);
            const control=structuredClone(f.calcData);
            control.talentScalings['10000075'].normalAttack.entries=control.talentScalings['10000075'].normalAttack.entries.filter(e=>e.id!=='normal_3damage_2');
            control.talentScalings['10000075'].skill.entries=control.talentScalings['10000075'].skill.entries.filter(e=>e.id!=='wind_normal_3damage_2');
            const baseline=f.sandbox.GenshinCalcEngine.calculateDamageRequest(f.request,control);
            for(const r of baseline.results)near(row(p,r.entry.id).expected,r.expected);
        }
    }
});

test('C3/C5 use final entered levels and add no second talent-level offset',()=>{
    const f=fixture(0);const baseline=run(f);
    f.request.constellation=5;const c5=run(f);
    for(const id of ['skilldamage','skilldamage_2','wind_normal_1damage','wind_chargeddamage']){
        near(row(c5,id).breakdown.scalingParts[0].talentMultiplier,row(baseline,id).breakdown.scalingParts[0].talentMultiplier);
    }
});
