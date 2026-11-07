"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {loadProductionFixture,makeRequest,assertClose,fixedSourceSha}=require('./helpers/hsrDirectVerification.cjs');
const file=require('../../games/hsr/data/calc/attacks-cyrene-round27.json'),get=id=>file.overrides.find(a=>a.id===id);
const owner={hp:8432,critRate:37,critDamage:143,damageBonus:19,enemyLevel:83,resistance:27,defenseReduction:11,defenseIgnore:4,resistancePenetration:7,takenDamage:9};
function spirit(r){r.character.id='11415';Object.assign(r.attack,{requiresIndependentDemiurge:true,completedReferenceSnapshot:true,damageOwnerId:'11415'});return r;}
function oracle(p,m){const s=p.character.stats,e=p.enemy,d=(p.character.level+20)/((p.character.level+20)+(e.level+20)*(1-(e.defenseReduction+e.defenseIgnore)/100)),res=1-(e.resistance-e.resistancePenetration)/100,nc=s.hp*m/100*(1+s.damageBonus/100)*d*res*(e.toughnessActive?.9:1)*(1+e.takenDamage/100);return {nonCrit:nc,crit:nc*(1+s.critDamage/100),expected:nc*(1+s.critRate*s.critDamage/10000)};}
test('Round27 Cyrene uses E0 memosprite caps and isolated Demiurge HP for a pre-triggered hit',async()=>{
 const{engine}=await loadProductionFixture();
 assert.equal(get('1141501').maximumTraceLevel,6);assert.equal(get('1141526').maximumTraceLevel,6);
 assert.equal(get('1141501').provenance.sourceCommit,fixedSourceSha);
 const p=spirit(makeRequest(get('1141501'),6,owner)),out=engine.calculate(p),exp=oracle(p,60);
 assert.notEqual(out.supported,false,out.reason);for(const k of ['nonCrit','crit','expected'])assertClose(out[k],exp[k],'Demiurge independent HP '+k);
 const q=spirit(makeRequest(get('1141526'),6,{...owner,hp:8432})),extra=engine.calculate(q),extraExp=oracle(q,60);
 assert.notEqual(extra.supported,false,extra.reason);assertClose(extra.expected,extraExp.expected,'pre-triggered recollection hit');
});
test('Round27 Cyrene aggregate represents one base plus two already-triggered recollection hits',async()=>{
 const{engine}=await loadProductionFixture(),root=spirit(makeRequest(get('11415012'),6,owner));root.modifierInputs={'cyrene-recollection-allies':2};
 const base=get('1141501'),extra=get('1141526');
 const baseInput=spirit(makeRequest(base,6,owner)),extraInput=spirit(makeRequest(extra,6,owner));
 baseInput.modifierInputs=root.modifierInputs;extraInput.modifierInputs=root.modifierInputs;
 root.sequenceComponents=[{key:'body',input:baseInput},{key:'recollection',input:extraInput}];
 const out=engine.calculate(root);assert.notEqual(out.supported,false,out.reason);
 const p=root.sequenceComponents[0].input,e=oracle(p,60).expected;
 assertClose(out.expected,3*e,'one base + two pre-triggered hits');
 const missing=spirit(makeRequest(get('1141501'),6,owner));delete missing.attack.completedReferenceSnapshot;
 assert.equal(engine.calculate(missing).supported,false,'missing independent final snapshot must stop locally');
 const missingRoot=spirit(makeRequest(get('11415012'),6,owner));missingRoot.modifierInputs=root.modifierInputs;missingRoot.sequenceComponents=root.sequenceComponents.map(p=>({key:p.key,input:{...p.input,character:{...p.input.character,stats:{...p.input.character.stats,hp:undefined}}}}));
 assert.equal(engine.calculate(missingRoot).supported,false,'missing independent owner HP must stop aggregate locally');
});
