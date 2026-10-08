"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createScenarioHarness,prepareScenarioInputs,setConditionElement}=require('./helpers/calcScenarioHarness.cjs');
const root=path.resolve(__dirname,'../..');
async function fixture(characterId,constellation=0){
 const f=createScenarioHarness();f.sandbox.console={...console,log(){},warn(){}};
 f.sandbox.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url)),'utf8'))});
 for(const file of ['genshinIdResolver.js','genshinCalcData.js','genshinCalcRenderer.js'])vm.runInContext(fs.readFileSync(path.join(root,'games/js',file),'utf8'),f.sandbox);
 await f.sandbox.GenshinIdResolver.ready;f.calcData=await f.sandbox.GenshinCalcData.loadGenshinCalcData();
 prepareScenarioInputs(f.elements,{characterId,constellation,stats:{hp:50000,atk:1866,baseAtk:1000,elementalMastery:600}});f.elements.genshinJsonConditionCards={innerHTML:''};f.engine=f.sandbox.GenshinCalcEngine;f.sandbox.GenshinCalcConditions.conditionPanelState(f.engine.buildCalculationRequestFromForm(),f.calcData);return f;
}
function render(f,p){const state=f.sandbox.GenshinCalcConditions.conditionPanelState(p.context,f.calcData);f.sandbox.GenshinCalcRenderer.renderConditionCards(state,p.context,f.calcData);return f.elements.genshinJsonConditionCards.innerHTML;}
function damageValues(p){return p.results.map(x=>({id:x.entry.id,nonCrit:x.nonCrit,crit:x.crit,expected:x.expected}));}
function replay(f,p){const r=f.engine.calculateDamageRequest(JSON.parse(JSON.stringify(f.engine.createCalculationSnapshot(p.calculationRequest,p).request)),f.calcData);assert.equal(JSON.stringify(damageValues(r)),JSON.stringify(damageValues(p)));}
function party(f,id){const r=f.engine.buildCalculationRequestFromForm();r.party={schemaVersion:2,focusSlot:1,conditionStates:{},members:[{slot:1,role:'main',enabled:true,characterId:r.characterId,stats:r.stats},{slot:2,role:'support',enabled:true,characterId:id,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50000,atk:2000,elementalMastery:600},equipment:{},buffStates:{}}]};return r;}
test('Sandrone self C6 displays one independent multiplier and preserves separate reaction hits',async()=>{
 const f=await fixture('10000133',6);setConditionElement(f.elements,'character:10000133:group:sandrone_c6_cluster','option','stellarSwirl');
 const r=f.engine.buildCalculationRequestFromForm();r.uiState.conditionByModifier['constellation:C6:c_10000133_6_1']={enabled:true};
 const before=f.engine.calculateDamageRequest(r,f.calcData);const p=f.engine.calculateDamageRequest(r,f.calcData);assert.deepEqual(damageValues(before),damageValues(p));const html=render(f,p),card=html.split('data-constellation-level="C6"')[1].split('</article>')[0];
 assert.equal((card.match(/×1\.2(?:<|0)/g)||[]).length,1);assert.doesNotMatch(card,/効果上書き|Elevation|基礎基礎|\+0/);assert.match(html,/超電導反応は星電導反応へと変わり/);
 assert.ok(p.results.filter(x=>x.entry.directReactionId==='stellarSwirl' && /c_10000133_6_2_stellarSwirl/.test(x.entry.id)).length === 4);
 assert.equal(JSON.stringify(damageValues(before)),JSON.stringify(damageValues(p)));replay(f,p);
});
test('Baizhu A4 shows provider HP reaction amounts with its verified full original',async()=>{
 const f=await fixture('10000024'),r=party(f,'10000082');let p=f.engine.calculateDamageRequest(r,f.calcData);const a=p.partyModifiers.find(x=>x.modifier.id==='t_10000082_a4_bloom');assert.ok(a);
 r.party.members[1].buffStates[a.toggleKey]=true;r.party.conditionStates[a.partyConditionStateKey]={enabled:true};p=f.engine.calculateDamageRequest(r,f.calcData);const html=render(f,p);
 const impact=html.match(/<section class="genshin-provider-impact">[\s\S]*?<\/section>/)[0];assert.match(impact,/\+100%/);assert.match(impact,/\+40%/);assert.match(impact,/\+35%/);assert.doesNotMatch(impact,/\+0|計算への.*説明/);
 assert.match(html,/無隙シールドの治療効果を受けたキャラクター/);replay(f,p);
});
test('Sucrose provides fixed and current EM values through the existing two triggers',async()=>{
 const f=await fixture('10000024'),r=party(f,'10000043');let p=f.engine.calculateDamageRequest(r,f.calcData);
 for(const id of ['t_10000043_passive1_swirl_em_share_electro','t_10000043_passive2_em_share']){const a=p.partyModifiers.find(x=>x.modifier.id===id);assert.ok(a);r.party.members[1].buffStates[a.toggleKey]=true;r.party.conditionStates[a.partyConditionStateKey]={enabled:true,option:'electro'};}
 p=f.engine.calculateDamageRequest(r,f.calcData);const html=render(f,p),impact=html.match(/<section class="genshin-provider-impact">[\s\S]*?<\/section>/)[0];assert.equal((html.match(/<strong>触媒置換術：拡散した元素<\/strong>/g)||[]).length,1);assert.match(impact,/元素熟知/);assert.match(impact,/\+170</);assert.match(html,/スクロースが拡散反応または星拡散反応/);assert.match(html,/スクロースの元素熟知の20%/);replay(f,p);
});
test('Beidou max-counter buff is one normal/charged bucket with no speed converted into damage',async()=>{
 const f=await fixture('10000024');setConditionElement(f.elements,'talent:passive2:group:beidou-max-counter-buff','option','active');
 const p=f.engine.calculateDamageRequest(f.engine.buildCalculationRequestFromForm(),f.calcData),html=render(f,p),card=html.split('data-talent-source="talent:passive2"')[1].split('</article>')[0];
 assert.equal((card.match(/<strong>\+15%<\/strong>/g)||[]).length,1);assert.doesNotMatch(card,/\+0/);assert.match(card,/通常攻撃.*重撃/);assert.match(card,/攻撃速度\+15%/);assert.match(html,/浪追い/);replay(f,p);
});
