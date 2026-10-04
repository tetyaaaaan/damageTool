const assert = require('node:assert/strict');
const test = require('node:test');
const { createScenarioHarness, prepareScenarioInputs, setConditionElement, setElement } = require('./helpers/calcScenarioHarness.cjs');
const CHAR='10000096';
const BOL='character:10000096:group:arlecchinoBondOfLife';
const C6='constellation:C6:group:arlecchinoC6AfterSkill';
const C2='constellation:C2:group:arlecchinoC2CollectMatureBloodDebt';
const C2_ID='c_10000096_2_1_resolved_2';
function fixture({constellation=0,atk=2000,bol=0,normal=10,skill=10,burst=10,crit=false,c2=false}={}){
 const f=createScenarioHarness();
 prepareScenarioInputs(f.elements,{characterId:CHAR,constellation,stats:{atk,baseAtk:1000,critRate:50,critDamage:100,elementDamageBonus:0}});
 setElement(f.elements,'genshinNormalTalentLevel',normal);setElement(f.elements,'genshinSkillTalentLevel',skill);setElement(f.elements,'genshinBurstTalentLevel',burst);
 setConditionElement(f.elements,BOL,'stack',bol);
 f.elements[`toggle:${C6}`]={checked:crit,dataset:{genshinToggleKey:C6}};
 f.elements[`toggle:${C2}`]={checked:c2,dataset:{genshinToggleKey:C2}};
 f.engine=f.sandbox.GenshinCalcEngine;
 f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(),f.calcData);
 return f;
}
function calc(f){return f.engine.calculateDamageRequest(f.engine.buildCalculationRequestFromForm(),f.calcData);}
function result(payload,id){const found=payload.results.find(item=>item.entry.id===id);assert.ok(found,`missing damage entry ${id}`);return found;}
function near(actual,expected){assert.ok(Math.abs(actual-expected)<1e-7,`${actual} !== ${expected}`);}
function replay(f,payload){const snapshot=f.engine.createCalculationSnapshot(payload.calculationRequest,payload);const replayed=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(snapshot.request)),f.calcData);assert.deepEqual(JSON.parse(JSON.stringify(replayed.results)),JSON.parse(JSON.stringify(payload.results)));return replayed;}
function setupCondition(f,key,type,value){setConditionElement(f.elements,key,type,value);f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(),f.calcData);}
function toggle(f,key,on){f.elements[`toggle:${key}`]={checked:on,dataset:{genshinToggleKey:key}};}

test('Arlecchino Masque uses current Bond of Life fraction and Lv-dependent coefficient, with C1 +100 points',()=>{
 const coefficients=[120.4,130.2,140,154,163.8,175,190.4,205.8,221.2,238,254.8,271.6,288.4,305.2,322];
 for(let level=1;level<=15;level++)for(const constellation of [0,1,3]){
  const f=fixture({constellation,atk:2000,bol:100,normal:level});const p=calc(f);
  const expected=2000*(coefficients[level-1]+(constellation>=1?100:0))/100;
  near(result(p,'normal_1damage').breakdown.additiveBaseDamage,expected);
  near(result(p,'normal_4damage').breakdown.additiveBaseDamage,expected);
  near(result(p,'normal_4damage_2').breakdown.additiveBaseDamage,expected);
  assert.equal(result(p,'normal_4damage').entry.source.param,'param4');
  assert.equal(result(p,'normal_4damage_2').entry.source.param,'param4');
  assert.equal(result(p,'skilldamage').breakdown.additiveBaseDamage,0);
 }
 const c0=calc(fixture({constellation:0,atk:2000,bol:100}));const c1=calc(fixture({constellation:1,atk:2000,bol:100}));
 near(result(c0,'normal_1damage').breakdown.additiveBaseDamage,4760);
 near(result(c1,'normal_1damage').breakdown.additiveBaseDamage,6760);
});

test('BoL is a shared fractional input; 0 gives no addition and 30% gates Pyro infusion',()=>{
 for(const [bol,expectedBase,element] of [[0,0,'physical'],[29.9,0,'physical'],[30,1428,'炎'],[33.5,1594.6,'炎'],[100,4760,'炎']]){
  const f=fixture({constellation:0,atk:2000,bol});const p=calc(f);
  near(result(p,'normal_1damage').breakdown.additiveBaseDamage,expectedBase);
  assert.equal(result(p,'normal_1damage').entry.element,element);
  for(const item of p.results){const eligible=item.entry.attackType==='normalAttack'&&item.entry.damageType==='normal'&&bol>=30;near(item.breakdown.additiveBaseDamage,eligible?expectedBase:0);}
  if(bol>=30){assert.equal(result(p,'chargeddamage').entry.element,'炎');assert.equal(result(p,'plunge_damage').entry.element,'炎');}
  near(result(p,'chargeddamage').breakdown.additiveBaseDamage,0);near(result(p,'plunge_damage').breakdown.additiveBaseDamage,0);
  const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);
  assert.equal(panel.complexConditionInputs.filter(input=>input.key===BOL).length,1);
  replay(f,p);
 }
});

test('Mask additive damage uses current effective ATK and never becomes a general damage bonus',()=>{
 const f=fixture({constellation:1,atk:2000,bol:33.5});
 f.calcData.talentModifiers[CHAR].passives.push({sourceId:'testAtkBuff',modifiers:[{id:'fixture_atk_buff',category:'statBonus',applyTo:['atkFlat'],value:500,unit:'flat',condition:'always',calculationSupport:'simple',uidHandling:'conditional'}]});
 const p=calc(f);assert.equal(p.context.effectiveStats.atk,2500);
 near(result(p,'normal_1damage').breakdown.additiveBaseDamage,2500*0.335*3.38);
 near(result(p,'skilldamage').breakdown.additiveBaseDamage,0);
});

test('C6 Bond addition is Burst-only, fractional, independent of C6 crit toggle, and zero at 0%',()=>{
 for(const [bol,expected] of [[0,0],[33.5,4690],[100,14000]]){
  const f=fixture({constellation:6,atk:2000,bol,crit:false});const p=calc(f);
  near(result(p,'skilldamage').breakdown.additiveBaseDamage,expected);
  near(result(p,'normal_1damage').breakdown.additiveBaseDamage,bol>=30?6760*bol/100:0);
  for(const item of p.results){const eligible=item.entry.group==='burst';near(item.breakdown.additiveBaseDamage,eligible?expected:(item.entry.attackType==='normalAttack'&&bol>=30?6760*bol/100:0));}
  assert.equal(p.results.some(item=>item.entry.id==='arlecchino_c6_burst_bond_of_life_additive'),false,'C6 addition augments the Burst entry, it is not a separate hit');
  replay(f,p);
 }
});

test('C6 CR/CD share one after-Skill toggle and affect only Normal Attack and Burst',()=>{
 const off=calc(fixture({constellation:6,bol:100,crit:false}));const f=fixture({constellation:6,bol:100,crit:true});const on=calc(f);
 for(const item of on.results){const scoped=item.entry.damageType==='normal'||item.entry.damageType==='burst';near(item.breakdown.critRate-result(off,item.entry.id).breakdown.critRate,scoped?10:0);near(item.breakdown.critDamage-result(off,item.entry.id).breakdown.critDamage,scoped?70:0);}
 const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(on.context,f.calcData);
 const controls=panel.cards.flatMap(card=>card.sections||[]).flatMap(section=>section.controls||[]).filter(control=>control.key===C6);
 assert.equal(controls.length,1);
 const restored=replay(f,on);near(result(restored,'normal_1damage').breakdown.critRate,60);near(result(restored,'skilldamage').breakdown.critDamage,170);
});

test('C2 Moonblood Flames is a manual independent Pyro entry, absent with no active condition',()=>{
 const off=calc(fixture({constellation:6,bol:100,c2:false,crit:true}));assert.equal(off.results.some(item=>item.entry.id===C2_ID),false);
 const noState=createScenarioHarness();prepareScenarioInputs(noState.elements,{characterId:CHAR,constellation:2,stats:{atk:2000,baseAtk:1000,critRate:50,critDamage:100,elementDamageBonus:0}});setConditionElement(noState.elements,BOL,'stack',100);noState.elements.genshinJsonEnableConstellationC2.checked=false;noState.sandbox.GenshinCalcConditions.conditionPanelState(noState.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),noState.calcData);const withoutToggle=noState.sandbox.GenshinCalcEngine.calculateDamageRequest(noState.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm(),noState.calcData);assert.equal(withoutToggle.results.some(item=>item.entry.id===C2_ID),false,'C2 unlocked does not auto-trigger before manual collection state');
 const f=fixture({constellation:6,atk:2000,bol:100,c2:true,crit:true});const on=calc(f);const extra=result(on,C2_ID);
 assert.equal(extra.entry.element,'炎');assert.equal(extra.entry.damageType,'extraDamage');assert.equal(extra.entry.group,'extraDamage');
 near(extra.breakdown.scalingParts[0].baseDamage,18000);
 near(extra.breakdown.additiveBaseDamage,0);near(extra.breakdown.critRate,50);near(extra.breakdown.critDamage,100);
 near(result(on,'normal_1damage').breakdown.additiveBaseDamage,6760);
 for(const original of off.results)near(result(on,original.entry.id).expected,original.expected);
 replay(f,on);
});

test('C3/C5 are already included in entered talent levels and normal4 has two independent 73.4264% hits',()=>{
 for(const constellation of [0,3,5,6]){
  const f=fixture({constellation,normal:10,burst:10,bol:0});const p=calc(f);
  for(const id of ['normal_4damage','normal_4damage_2']){assert.equal(result(p,id).breakdown.talentLevel,10);near(result(p,id).breakdown.scalingParts[0].talentMultiplier,73.4264);}
  assert.equal(result(p,'skilldamage').breakdown.talentLevel,10);
  near(result(p,'normal_4damage').expected,result(p,'normal_4damage_2').expected);
 }
 const physical=calc(fixture({constellation:0,bol:100}));
 assert.equal(physical.results.filter(item=>item.entry.id==='normal_4damage'||item.entry.id==='normal_4damage_2').length,2);
});



test('Arlecchino Pyro passive 40% is manually available only to Pyro damage',()=>{
 const f=fixture({constellation:0,bol:100});f.elements.genshinJsonEnableCharacterCondition.checked=false;const off=calc(f);const key='talent:passive3:anonymous:damageBonus|active|pyroDamageBonus|';toggle(f,key,true);const on=calc(f);
 for(const item of on.results){const pyro=item.entry.element==='炎';near(item.breakdown.damageBonus-result(off,item.entry.id).breakdown.damageBonus,pyro?40:0);}
 const panel=f.sandbox.GenshinCalcConditions.conditionPanelState(on.context,f.calcData);assert.ok(panel.cards.flatMap(card=>card.sections||[]).flatMap(section=>section.controls||[]).some(control=>control.key===key));
 replay(f,on);
});

test('Arlecchino normal, charged, plunge, skill, and Burst states produce their independent damage entries',()=>{
 const p=calc(fixture({constellation:0,bol:100}));
 for(const id of ['normal_1damage','normal_2damage','normal_3damage','normal_4damage','normal_4damage_2','normal_5damage','normal_6damage','chargeddamage','plunge_damage','low_plungedamage','high_plungedamage','damage','damage_2','damage_3','skilldamage'])assert.ok(result(p,id).expected>0,id);
});
