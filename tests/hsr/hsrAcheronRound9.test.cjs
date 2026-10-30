"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {readJson,fixedSourceSha,loadProductionFixture,makeRequest,independentDirectDamage,assertClose}=require("./helpers/hsrDirectVerification.cjs");
const attack=require("../../games/hsr/data/calc/attacks-acheron-round9.json").overrides[0];
const oldMods=require("../../games/hsr/data/calc/modifiers-acheron-round8.json").modifiers;
const cat=readJson("games/hsr/data/catalog.json"),char=cat.characters.find(x=>x.id==="1308");
const ult=char.skills.find(x=>x.id==="130803");
function aoe(p,n){return n?Math.min(p[4],p[1]*(1+n))*100:0;}
function components(level,initial){
 const p=ult.params[level-1],out=[];let remain=initial;
 for(let i=1;i<=3;i++){out.push({key:"rainblade-"+i+"-direct",name:attack.damageComponents.find(x=>x.key==="rainblade-"+i+"-direct").name,attackId:"130803-rainblade-direct",m:p[0]*100,target:"single"});const n=Math.min(3,remain);remain-=n;if(n)out.push({key:"rainblade-"+i+"-knots",name:attack.damageComponents.find(x=>x.key==="rainblade-"+i+"-knots").name,attackId:"130803-rainblade-knots",m:aoe(p,n),target:"aoe",removed:n});}
 out.push({key:"resurge",name:attack.damageComponents.find(x=>x.key==="resurge").name,attackId:"130803-resurge",m:p[2]*100,target:"aoe"});
 for(let i=1;i<=6;i++)out.push({key:"a6-extra-"+i,name:attack.damageComponents.find(x=>x.key==="a6-extra-"+i).name,attackId:"130803-a6-extra",m:25,target:"single"});
 return out;
}
function request(level,knots,config,mods){const parent=makeRequest(attack,level,{...config,characterLevel:80,eidolon:0,enemyCount:1},mods);parent.modifierInputs={"acheron-initial-knots":knots};parent.sequenceComponents=components(level,knots).map(c=>({key:c.key,name:c.name,input:{...parent,attack:{...parent.attack,id:c.attackId,sourceSkillId:"130803",name:c.name,type:"ultimate",attackType:"ultimate",element:"Thunder",target:c.target,scalingStat:"atk",damageFormula:"statMultiplier",multiplier:c.m,hitCount:1,canCrit:true}}}));return parent;}
test("Round9 Acheron source coefficients and initial-knot input are bounded",async()=>{
 const {data}=await loadProductionFixture();assert.ok(data.attacks.some(x=>x.id==="130803"&&x.provenance?.sourceCommit===fixedSourceSha));
 assert.equal(attack.maximumEidolon,0);assert.equal(attack.maximumTraceLevel,10);assert.equal(attack.enemyCountExact,1);
 assert.deepEqual(Array.from(attack.numericModifierInputs,x=>[x.inputKey,x.minimum,x.maximum,x.integer]),[["acheron-initial-knots",0,9,true]]);
 assert.equal(attack.numericModifierInputs[0].default,undefined);
 assert.match(attack.conditionText,/0～9層/);assert.ok(attack.calculationNote.includes("params[1]")&&attack.calculationNote.includes("params[4]"));assert.ok(attack.provenance.referenceUrl.includes("keqingmains.com/acheron"));
 assert.deepEqual(Array.from(char.traces.find(x=>x.id==="1308103").params[0]),[0.3,3,3,6,0.25]);
 for(let lv=1;lv<=10;lv++){const p=ult.params[lv-1];for(let n=0;n<=3;n++)assertClose(aoe(p,n),n?Math.min(p[4],p[1]*(1+n))*100:0,"AoE Lv"+lv+" removed "+n);for(const d of attack.damageComponents.filter(x=>x.key.endsWith("-knots"))){assertClose(d.perKnotMultipliers[lv-1],p[1]*100,"template base Lv"+lv);assertClose(d.capMultipliers[lv-1],p[4]*100,"template cap Lv"+lv);}assertClose(3*(p[0]*100+p[4]*100)+p[2]*100,p[5]*100,"maximum total Lv"+lv);}
});
test("Round9 Acheron all initial knot states 0-9 match independent sums at every Ultimate level",async()=>{
 const {engine}=await loadProductionFixture();
 const cases=[{atk:3000,hp:6000,def:2400,critRate:45,critDamage:130,damageBonus:12,enemyLevel:80,enemyCount:1,resistance:20,toughnessActive:true},{atk:4123.5,hp:10432,def:1876.25,critRate:25,critDamage:155,damageBonus:48,enemyLevel:90,enemyCount:1,resistance:40,defenseReduction:20,defenseIgnore:10,toughnessActive:false}];
 for(let lv=1;lv<=10;lv++)for(let knots=0;knots<=9;knots++){const p=ult.params[lv-1],mods=[{id:"pre-active-a6-three",enabled:true,applicable:true,category:"damageBonus",value:90},{id:"native-ult-res-down",enabled:true,applicable:true,category:"resistanceReduction",value:oldMods.find(x=>x.category==="resistanceReduction").value.values[lv-1]}],parts=components(lv,knots),blasts=parts.filter(x=>x.key.endsWith("-knots")),expected=[];let remain=knots;for(let i=0;i<3;i++){const n=Math.min(3,remain);remain-=n;if(n)expected.push(n);}assert.deepEqual(blasts.map(x=>x.removed),expected,"removals "+knots);assert.equal(parts.length,10+expected.length);assert.equal(parts.filter(x=>x.key.endsWith("-direct")).length,3);assert.equal(parts.filter(x=>x.key.startsWith("a6-extra-")).length,6);assertClose(parts.reduce((s,x)=>s+x.m,0),3*p[0]*100+p[2]*100+150+expected.reduce((s,n)=>s+aoe(p,n),0),"independent sequence coefficient initial "+knots+" Lv"+lv);
 for(const [ci,cfg]of cases.entries()){const input=request(lv,knots,cfg,mods),calc=engine.calculate(input),oracle=input.sequenceComponents.map(x=>independentDirectDamage(x.input));assert.notEqual(calc.supported,false,"knots "+knots+" Lv"+lv+" case"+ci);for(const k of ["nonCrit","crit","expected"])assertClose(calc[k],oracle.reduce((s,x)=>s+x[k],0),"knots "+knots+" Lv"+lv+" "+k);assert.equal(Object.keys(calc.components).length,parts.length);if(knots===0)for(let i=1;i<=3;i++)assert.equal(calc.components["rainblade-"+i+"-knots"],undefined);}}
});
test("Round9 rejects missing/out-of-range initial knots and reordered or altered components",async()=>{
 const {engine}=await loadProductionFixture(),mods=[],cfg={atk:3000,critRate:50,critDamage:100,damageBonus:0,enemyLevel:80,enemyCount:1,resistance:20,toughnessActive:true};
 const good=request(1,4,cfg,mods);assert.notEqual(engine.calculate(good).supported,false);
 for(const value of [undefined,-1,10,1.5]){const bad=JSON.parse(JSON.stringify(good));if(value===undefined)delete bad.modifierInputs["acheron-initial-knots"];else bad.modifierInputs["acheron-initial-knots"]=value;assert.equal(engine.calculate(bad).supported,false,"invalid initial knot input "+value);}
 const reordered=JSON.parse(JSON.stringify(good));[reordered.sequenceComponents[0],reordered.sequenceComponents[1]]=[reordered.sequenceComponents[1],reordered.sequenceComponents[0]];assert.equal(engine.calculate(reordered).supported,false,"reordered sequence rejected");
 const missing=JSON.parse(JSON.stringify(good));missing.sequenceComponents.pop();assert.equal(engine.calculate(missing).supported,false,"missing conditional component rejected");
 const altered=JSON.parse(JSON.stringify(good));altered.sequenceComponents[1].input.attack.multiplier+=1;assert.equal(engine.calculate(altered).supported,false,"component coefficient mismatch rejected");
});test("Round9 reuses the pre-active three-stack A6 modifier and E0 Ultimate RES reduction",async()=>{
 const {data}=await loadProductionFixture(),a6=data.structuredModifiers.find(x=>x.id==="traceNode:1308:1308103:ultimate-three-stack-damage")||oldMods.find(x=>x.category==="damageBonus"),res=oldMods.find(x=>x.category==="resistanceReduction");
 assert.ok(a6);assert.ok(res);assert.equal(a6.value.fixed,90);assert.deepEqual(Array.from(res.target.attackTypes),["ultimate"]);
});
