"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, readJson, runtime, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");

// Independent literals transcribed from the pinned JP/EN skills, not generated runtime rows.
const curves = {
    previousBasic: [30,36,42,48,54,60],
    enhancedBasic: [50,60,70,80,90,100],
    skill: [45,49.5,54,58.5,63,67.5,73.12,78.75,84.38,90],
    defense: [14.8,15.4,16,16.6,17.2,17.8,18.55,19.3,20.05,20.8],
    ultimate: [72,76.8,81.6,86.4,91.2,96,102,108,114,120],
    vulnerability: [15,16,17,18,19,20,21.25,22.5,23.75,25],
    base: [96,111.84,127.68,143.52,159.36,175.2,189.6,204,222,240],
    stack: [4.8,5.59,6.38,7.18,7.97,8.76,9.48,10.2,11.1,12]
};
const profiles = [
    { atk:3587.25, hp:7421.5, def:1198.75, baseAtk:991.5, critRate:37.5, critDamage:121.75, damageBonus:27.75, enemyLevel:83, resistance:25, defenseReduction:12.5, defenseIgnore:7.5, resistancePenetration:6.25, takenDamage:11.5 },
    { atk:2411.75, hp:5809.25, def:3517.125, baseAtk:1173.25, critRate:62.25, critDamage:73.5, damageBonus:41.3, enemyLevel:75, resistance:0, defenseReduction:0, defenseIgnore:0, resistancePenetration:0, takenDamage:0, toughnessActive:false }
];
const ids = variant => { const p=variant === "previous" ? "1307" : "11307"; return { normal:p+"01", skill:p+"02", ultimate:p+"03", natural:p+"04", trigger:p+"041" }; };
function build(data, attack, level, profile, inputs={}, levels={}) {
    const selected = { ...inputs, ...attack.comparisonModifierInputs };
    const p=attack.variant === "previous" ? "1307" : "11307";
    const candidates=runtime.buildCandidates(data.structuredModifiers, {
        characterId:"1307", eidolon:0, enhancementState:attack.variant,
        stats:{ ...profile, effectHitRate:120 },
        traceLevelFor:source => levels[source.skillId] ?? (source.skillId === p+"04" ? level : 10)
    }, selected);
    const modifiers=candidates.map(m=>({...m,applicable:m.applicable && runtime.applicableToAttack(m,attack)}));
    return { ...makeRequest(attack,level,profile,modifiers), modifierInputs:selected, independentModifiers:[...(selected["black-swan-skill-def-active"]?[{category:"defenseReduction",value:curves.defense[(levels[p+"02"]??10)-1]}]:[]),...(selected["black-swan-epiphany-active"]&&(attack.variant==="enhanced"||attack.id===p+"04")?[{category:"takenDamage",value:curves.vulnerability[(levels[p+"03"]??10)-1]}]:[]),...(attack.type==="dot"&&(attack.variant==="enhanced"||(attack.id===p+"04"&&selected["black-swan-arcana-stacks"]>=7))?[{category:"defenseIgnore",value:20}]:[])] };
}
function matches(engine,input,multiplier,label) {
    const oracle=independentDirectDamage({ ...input, attack:{...input.attack,multiplier}, modifiers:input.independentModifiers });
    const actual=engine.calculate(input);
    assert.notEqual(actual.supported,false,label+": "+actual.reason);
    for(const key of ["nonCrit","crit","expected"]) assertClose(actual[key],oracle[key],label+" "+key);
    assertClose(actual.breakdown.referenceValue,input.character.stats.atk,label+" owner ATK");
    return actual;
}

test("Black Swan batch6 production rows select separate previous/enhanced bounded snapshots", async()=>{
    assert.equal(fixedSourceSha,"dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const {data}=await loadProductionFixture();
    const file=readJson("games/hsr/data/calc/attacks-batch6-black-swan.json");
    assert.equal(file.overrides.length,10);
    for(const variant of ["previous","enhanced"]){
        const branch=ids(variant);
        for(const id of Object.values(branch)){
            const a=attackOf(data,id);
            assert.equal(a.variant,variant); assert.equal(a.support.status,"calculable");
            assert.equal(a.maximumEidolon,0); assert.equal(a.characterLevelExact,80); assert.equal(a.enemyCountExact,1);
            assert.equal(a.provenance.sourceCommit,fixedSourceSha);
            assert.ok(a.assumptions.length); assert.equal(a.scalingStat,"atk");
            assert.equal(a.damageFormula,"statMultiplier");
            assert.equal(a.comparisonModifierInputs["black-swan-natural-enemy-turn"],id===branch.natural);
        }
        for(const id of [branch.natural,branch.trigger]){
            const a=attackOf(data,id); assert.equal(a.type,"dot"); assert.equal(a.canCrit,false);
            assert.deepEqual(a.multipliers,curves.base);
            assert.deepEqual(a.numericModifierInputs,[{inputKey:"black-swan-arcana-stacks",label:"ダメージ発生時のアルカナ層数",minimum:1,maximum:variant==="enhanced"?10000:50,integer:true,default:1}]);
            assert.deepEqual(a.requiredModifierIds,["trace:1307:"+branch.natural+":arcana-stacks"]);
            assert.match(a.unsupportedStateReason,variant==="enhanced"?/10001/:/51/);
        }
    }
    assert.deepEqual(attackOf(data,"1130703").comparisonModifierInputs["black-swan-epiphany-active"],true,"enhanced Ultimate includes established Epiphany once");
});

test("Black Swan all adopted E0 direct curves use own ATK and established enemy states",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const branch=ids(variant);
        for(const [id,curve] of [[branch.normal,curves[variant+"Basic"]],[branch.skill,curves.skill],[branch.ultimate,curves.ultimate]]){
            const a=attackOf(data,id); assert.deepEqual(a.multipliers,curve);
            assert.equal(a.canCrit,true);
            if(id===branch.skill) assert.deepEqual(a.adjacentMultipliers,curves.skill,"source has equal main/adjacent skill coefficients");
            for(let l=1;l<=curve.length;l++)for(const profile of profiles){
                const input=build(data,a,l,profile,{"black-swan-skill-def-active":true,"black-swan-epiphany-active":true},{[branch.skill]:l,[branch.ultimate]:l});
                const result=matches(engine,input,curve[l-1],id+" Lv"+l);
                assertClose(result.breakdown.defenseReductionPercent,profile.defenseReduction+curves.defense[l-1],"Skill level is independent of selected attack");
                assertClose(result.breakdown.takenDamage,profile.takenDamage+(variant==="enhanced"?curves.vulnerability[l-1]:0),"old player-turn direct hits exclude own-turn Epiphany");
            }
        }
    }
});

test("Black Swan Arcana has base plus every current stack, all Talent levels and native DEF rules",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const branch=ids(variant);
        for(const id of [branch.natural,branch.trigger])for(let l=1;l<=10;l++)for(const stacks of (variant==="enhanced"?[1,2,3,6,7,50,51,75]:[1,2,3,6,7,50]))for(const profile of profiles){
            const a=attackOf(data,id);
            const input=build(data,a,l,profile,{"black-swan-arcana-stacks":stacks});
            const result=matches(engine,input,curves.base[l-1]+stacks*curves.stack[l-1],id+" Lv"+l+" S"+stacks);
            const nativeIgnore=variant==="enhanced" || (id===branch.natural && stacks>=7) ? 20:0;
            assertClose(result.breakdown.defenseIgnorePercent,profile.defenseIgnore+nativeIgnore,"native DEF ignore is branch/event specific");
            assert.equal(result.nonCrit,result.crit); assert.equal(result.nonCrit,result.expected);
            assertClose(result.breakdown.multiplierPercent,curves.base[l-1]+stacks*curves.stack[l-1],"each stack includes the first");
        }
    }
});

test("Black Swan independently leveled DEF and Epiphany apply only to their accepted events",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const branch=ids(variant);
        for(let l=1;l<=10;l++)for(const id of [branch.natural,branch.trigger]){
            const a=attackOf(data,id);
            const input=build(data,a,3,profiles[0],{"black-swan-arcana-stacks":7,"black-swan-skill-def-active":true,"black-swan-epiphany-active":true},{[branch.skill]:l,[branch.ultimate]:l});
            const result=matches(engine,input,curves.base[2]+7*curves.stack[2],id+" independent support Lv"+l);
            assertClose(result.breakdown.defenseReductionPercent,profiles[0].defenseReduction+curves.defense[l-1],"separate Skill Lv");
            const vuln=variant==="enhanced" || id===branch.natural ? curves.vulnerability[l-1]:0;
            assertClose(result.breakdown.takenDamage,profiles[0].takenDamage+vuln,"separate Ultimate Lv and natural own-turn restriction");
        }
    }
});

test("Black Swan Arcana ignores HP DEF and CR/CD, while ATK and DoT effects remain effective",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const branch=ids(variant);
        for(const id of [branch.natural,branch.trigger]){
            const a=attackOf(data,id), input=build(data,a,10,profiles[0],{"black-swan-arcana-stacks":7});
            const base=engine.calculate(input);
            for(const stat of ["hp","def","critRate","critDamage"]){
                const changed={...input,character:{...input.character,stats:{...input.character.stats,[stat]:input.character.stats[stat]+317.25}}};
                assertClose(engine.calculate(changed).nonCrit,base.nonCrit,id+" ignores "+stat);
            }
            const atk={...input,character:{...input.character,stats:{...input.character.stats,atk:profiles[0].atk+317.25}}};
            assertClose(engine.calculate(atk).nonCrit/base.nonCrit,(profiles[0].atk+317.25)/profiles[0].atk,id+" ATK response");
            const dotBonus={id:"test-dot-damage",category:"dotDamage",value:19.25,enabled:true,applicable:true,calculable:true,target:{attackTypes:["dot"],elements:["Wind"]}};
            const buffed=engine.calculate({...input,modifiers:[...input.modifiers,dotBonus]});
            assertClose(buffed.nonCrit/base.nonCrit,(100+profiles[0].damageBonus+19.25)/(100+profiles[0].damageBonus),"DoT damage bonus applies");
        }
    }
});

test("Black Swan A6 stays final-input-only and no automatic damage bonus is duplicated",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const trace=variant==="previous"?"1307103":"11307103";
        const record=data.structuredModifiers.find(r=>r.id==="trace:1307:"+trace+":ehr-damage-final");
        assert.ok(record); assert.equal(record.inputPolicy,"includedInFinalStats"); assert.equal(record.support.status,"displayOnly");
        assert.equal(record.target.owner,variant==="previous"?"self":"partyAll");
        const a=attackOf(data,ids(variant).natural), input=build(data,a,10,{...profiles[0],damageBonus:profiles[0].damageBonus+72},{"black-swan-arcana-stacks":1});
        const result=matches(engine,input,252,"A6 final input "+variant);
        assertClose(result.breakdown.damageBonus,profiles[0].damageBonus+72,"A6 is not added a second time");
    }
});

test("Black Swan invalid and overflow Arcana inputs stop only the bounded DoT rows",async()=>{
    const {data,engine}=await loadProductionFixture();
    for(const variant of ["previous","enhanced"]){
        const a=attackOf(data,ids(variant).natural);
        for(const stacks of (variant==="enhanced"?[0,10001,1.5,NaN,Infinity]:[0,51,75,1.5,NaN,Infinity])){
            const input=build(data,a,10,profiles[0],{"black-swan-arcana-stacks":stacks});
            assert.equal(engine.calculate(input).supported,false,variant+" rejects stack "+stacks);
            const direct=build(data,attackOf(data,ids(variant).normal),6,profiles[0],{"black-swan-arcana-stacks":stacks});
            assert.notEqual(engine.calculate(direct).supported,false,"bad Arcana does not stop the direct basic");
        }
        const valid=build(data,a,10,profiles[0],{"black-swan-arcana-stacks":7});
        assert.equal(engine.calculate({...valid,modifiers:valid.modifiers.filter(m=>!a.requiredModifierIds.includes(m.id))}).supported,false,"required stack scaling cannot be silently dropped");
    }
});
