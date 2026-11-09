"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, runtime, readJson, fixedSourceSha } = require("./helpers/hsrDirectVerification.cjs");
const key = "dahlia-normal-base-toughness";
const rates = [30,33,36,39,42,45,48.75,52.5,56.25,60]; // Fixed 132104.params[0..9][4] * 100.
const profile = { atk:3317,hp:7159,def:2411,critRate:37,critDamage:143,damageBonus:19,enemyLevel:82,resistance:27,defenseReduction:11,defenseIgnore:4,resistancePenetration:7,takenDamage:9,weakness:true,toughnessActive:false };
function request(data, normalLevel=6, talentLevel=10, toughness=7.25, fieldActive=false) {
    const field = data.structuredModifiers.find(m=>m.id==="trace:1321:132102:field-break-efficiency");
    const candidates = runtime.buildCandidates([field], {characterId:"1321",partyIds:["1321"],partyEidolons:{"1321":0},enemy:{count:1,toughnessActive:false},stats:{breakEffect:213.75},traceLevelFor:()=>talentLevel}, {"dahlia-skill-field-active":fieldActive});
    const build = (id,level) => {
        const a=attackOf(data,id), mods=candidates.map(m=>({...m,applicable:m.applicable&&runtime.applicableToAttack(m,a)}));
        const r=makeRequest(a,level,profile,mods);
        r.character.id="1321";r.character.stats.breakEffect=213.75;r.breakBaseDamage=data.breakBaseDamage;r.modifierInputs={[key]:toughness};return r;
    };
    const r=build("1321012",normalLevel);
    r.sequenceComponents=[{key:"direct",input:build("132101",normalLevel)},{key:"superBreak",input:build("1321044",talentLevel)}];return r;
}
test("round36 own normal uses fixed Talent conversion and independent direct/SuperBreak expectations",async()=>{
    const {data,engine}=await loadProductionFixture(),sb=attackOf(data,"1321044");
    assert.equal(sb.provenance.sourceCommit,fixedSourceSha);assert.deepEqual(Array.from(sb.multipliers),rates);assert.equal(sb.hidden,true);
    for(const [n,t,base,active] of [[1,1,7.25,false],[6,10,31.75,true],[3,7,11.5,false]]){
        const q=request(data,n,t,base,active),direct=independentDirectDamage(q.sequenceComponents[0].input);
        const defense=100/(100+102*(1-.11-.04)),res=1-(27-7)/100;
        const expectedSB=3767.5533*(rates[t-1]/100)*(base/10)*(active?1.5:1)*(1+213.75/100)*defense*res*1.09;
        const out=engine.calculate(q);assert.notEqual(out.supported,false,out.reason);
        for(const k of ["nonCrit","crit","expected"])assertClose(out[k],direct[k]+expectedSB,`N${n}/T${t}/${k}`);
        assertClose(out.components.superBreak.nonCrit,expectedSB,"SB component");
        assertClose(out.components.superBreak.crit,expectedSB,"SB cannot crit");
        assertClose(out.components.direct.nonCrit,direct.nonCrit,"direct component");
    }
});
test("round36 own normal refuses unknown toughness, wrong ownership and unsupported states locally",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const mutate of [q=>{delete q.attack.damageComponents;},q=>{q.attack.damageFormula="statMultiplier";},q=>{q.sequenceComponents[0]=null;},q=>{delete q.modifierInputs[key];},q=>{q.modifierInputs[key]=0;},q=>{q.enemy.toughnessActive=true;},q=>{q.character.id="1003";},q=>{q.character.eidolon=1;},q=>{q.enemy.count=2;},q=>{q.sequenceComponents[1].input.character.stats.breakEffect+=1;},q=>{q.sequenceComponents[1].input.attack.multiplier=200;},q=>{q.sequenceComponents[1].input.attack.damageFormula="statMultiplier";}]){
        const q=JSON.parse(JSON.stringify(request(data)));mutate(q);assert.equal(engine.calculate(q).supported,false);
    }
    const q=request(data),direct=q.sequenceComponents[0].input;
    delete direct.modifierInputs[key];assert.notEqual(engine.calculate(direct).supported,false,"existing direct normal remains independent");
    const old=attackOf(data,"1321042");assert.deepEqual(Array.from(old.multipliers),[100,110,120,130,140,150,162.5,175,187.5,200],"existing FUA conversion is unchanged");
});
