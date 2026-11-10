"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {loadProductionFixture,attackOf,makeRequest,assertClose,fixedSourceSha}=require("./helpers/hsrDirectVerification.cjs");
const weights={"121301":[.3,.7],"121308":[.33,.33,.34],"121310":[.2,.2,.2,.2,.2],"121312":[.142,.142,.142,.142,.142,.142,.148],"121303":[.3,.3,.4]};
const totals={"121301":100,"121308":260,"121310":380,"121312":500,"121303":300};
const profile={atk:3271.25,hp:9087.5,def:1321.75,critRate:43.25,critDamage:137.5,damageBonus:21.5,resistance:27.5,enemyLevel:83};
function request(data,id,talent=10,skill=10){
 const a=attackOf(data,id),level=id==="121303"?10:6,q=makeRequest(a,level,profile);q.character.id="1213";Object.assign(q.attack,{talentTraceLevel:talent,skillTraceLevel:skill});
 q.sequenceComponents=a.damageComponents.map(d=>({key:d.key,name:d.name,input:{...structuredClone(q),sequenceComponents:undefined,attack:{...structuredClone(q.attack),...d,id:d.attackId,sourceSkillId:id,damageFormula:"statMultiplier",damageComponents:undefined,attackType:a.type,traceLevel:level,multiplier:d.multipliers[level-1],hitCount:1}}}));return q;
}
function oracle(id,talent,skill){
 // Source ratios and Lv10 totals are literal, independent from production attack resolution.
 const dm=[5,5.5,6,6.5,7,7.5,8.13,8.75,9.38,10][talent-1],cd=[6,6.6,7.2,7.8,8.4,9,9.75,10.5,11.25,12][skill-1];
 return weights[id].map((w,i)=>{const t=Math.min(6,i),o=["121310","121312"].includes(id)?Math.max(0,i-2):0;
  const n=3271.25*totals[id]/100*w*(1+(21.5+dm*t)/100)*(100/203)*.725*.9,c=n*(1+(137.5+cd*o)/100),e=n*(1+.4325*(137.5+cd*o)/100);return {nonCrit:n,crit:c,expected:e};});
}
test("round38 Imbibitor Lunae fixed hit weights and before/after stacks match independent component sums",async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const id of Object.keys(weights)){
  const a=attackOf(data,id);assert.equal(a.provenance.sourceCommit,fixedSourceSha);assert.equal(a.provenance.relatedSourceCommit,"6b2bc17ebf461e497ba0dd0ffd44875f1866762b");assert.deepEqual(Array.from(a.damageComponents,d=>d.weight),weights[id]);
  for(const[t,s]of [[10,10],...(id==="121312"?[[7,7]]:[])]){const q=request(data,id,t,s),out=engine.calculate(q),terms=oracle(id,t,s);assert.notEqual(out.supported,false,out.reason);
   for(const k of ["nonCrit","crit","expected"]){assertClose(out[k],terms.reduce((v,x)=>v+x[k],0),id+" sum "+k);terms.forEach((v,i)=>assertClose(out.components["hit"+(i+1)][k],v[k],id+" hit"+(i+1)+" "+k));}
  }
 }
});
test("round38 Imbibitor Lunae refuses nonzero initial stacks and mismatched hits; external attack modifiers stay scoped",async()=>{
 const {data,engine}=await loadProductionFixture(),make=()=>request(data,"121312");
 for(const mutate of [q=>{q.attack.initialTalentStacks=1;},q=>{q.attack.initialOutroarStacks=1;},q=>{q.character.id="1214";},q=>{q.character.eidolon=1;},q=>{q.enemy.count=2;},q=>{q.enemy.weakness=true;},q=>{q.enemy.toughnessActive=false;},q=>{q.attack.skillTraceLevel=11;},q=>{q.sequenceComponents[0]=null;},q=>{q.sequenceComponents[6].input.attack.multiplier+=1;},q=>{q.sequenceComponents[1].input.character.stats.atk+=1;}]){
  const q=structuredClone(make());mutate(q);assert.equal(engine.calculate(q).supported,false);
 }
 const q=make(),base=engine.calculate(q),bonus={id:"external-skill-only",category:"damageBonus",value:80,enabled:true,applicable:true,calculable:true,target:{owner:"self",attackTypes:["skill"]}};
 q.sequenceComponents.forEach(p=>p.input.modifiers=[bonus]);assertClose(engine.calculate(q).expected,base.expected,"Skill-only DMG does not affect enhanced Basic hits");
 q.sequenceComponents[0].input.modifiers=[{...bonus,source:{id:"1213",skillId:"121304"},target:{owner:"self",attackTypes:["normal"]}}];assert.equal(engine.calculate(q).supported,false,"own Talent cannot be added a second time externally");
});
