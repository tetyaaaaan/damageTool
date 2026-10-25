"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose, readJson, root } = require("./helpers/hsrDirectVerification.cjs");
const path = require("node:path");
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));

const sourceCurves = {
    "110301": [50,60,70,80,90,100,110,120,130,140],
    "110302": [70,77,84,91,98,105,113.75,122.5,131.25,140,147,154,161,168,175],
    "1103021": [40,44,48,52,56,62,70,80,92,104,109.2,114.4,119.6,124.8,130],
    "110303": [108,115.2,122.4,129.6,136.8,144,153,162,171,180,187.2,194.4,201.6,208.8,216],
    "110304": [36,39.6,43.2,46.8,50.4,54,58.5,63,67.5,72,75.6,79.2,82.8,86.4,90],
    "110901": [50,60,70,80,90,100,110,120,130,140],
    "110902": [120,132,144,156,168,180,195,210,225,240,252,264,276,288,300],
    "110909": [140,154,168,182,196,210,227.5,245,262.5,280,294,308,322,336,350],
    "110903": [240,256,272,288,304,320,340,360,380,400,416,432,448,464,480],
    "110904": [50,55,60,65,70,75,81.25,87.5,93.75,100,105,110,115,120,125],
    "1109021": [25,27.5,30,32.5,35,38.75,43.75,50,57.5,65,68.25,71.5,74.75,78,81.25]
};
const adjacentCurves = {
    "110302": [30,33,36,39,42,45,48.75,52.5,56.25,60,63,66,69,72,75],
    "110909": [40,44,48,52,56,60,65,70,75,80,84,88,92,96,100]
};
const servalModifiers = readJson("games/hsr/data/calc/modifiers-serval.json").modifiers;
const hookModifiers = readJson("games/hsr/data/calc/modifiers-hook.json").modifiers;
const servalExtra = servalModifiers.find((x) => x.id === "trace:1103:110304:shocked-extra-damage");
const hookState = hookModifiers.find((x) => x.id === "trace:1109:110902:burning-state");
const hookExtra = hookModifiers.find((x) => x.id === "trace:1109:110904:additional");

test("Serval and Hook E0 attack curves match the pinned source snapshot", async () => {
    const { data } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    for (const [id, curve] of Object.entries(sourceCurves)) {
        const attack = attackOf(data, id);
        assert.equal(attack.maximumEidolon ?? 0, 0, id + " E0 availability");
        assert.deepEqual(Array.from(attack.multipliers), curve, id + " source curve");
    }
    for (const [id, curve] of Object.entries(adjacentCurves)) assert.deepEqual(Array.from(attackOf(data, id).adjacentMultipliers), curve, id + " adjacent curve");
});

test("Serval and Hook E0 direct action components match independent damage at every level", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [id, curve] of Object.entries(sourceCurves)) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= (attack.traceKey === "normal" ? 6 : 10); level++) {
            const input = makeRequest(attack, level, { eidolon: 0, atk: 3175, baseAtk: 1048, critRate: 37, critDamage: 83 });
            input.attack.multiplier = curve[level - 1];
            if (id === "1103021" || id === "1109021") input.enemy.resistance = 0;
            const expected = independentDirectDamage(input);
            const actual = engine.calculate(input);
            assert.notEqual(actual.supported, false, id + " Lv" + level);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], id + " Lv" + level + " " + key);
        }
    }
    for (const [id, curve] of Object.entries(adjacentCurves)) {
        const attack = attackOf(data, id);
        for (let level = 1; level <= curve.length; level++) {
            const input = makeRequest(attack, level, { eidolon: 0, atk: 3175, baseAtk: 1048, critRate: 37, critDamage: 83 });
            input.attack.target = "adjacent";
            input.attack.multiplier = curve[level - 1];
            const expected = independentDirectDamage(input), actual = engine.calculate(input);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], id + " adjacent Lv" + level + " " + key);
        }
    }
});

test("Serval and Hook state-gated talent extras remain separate direct damage", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [characterId, atkId, modifiers, modifier, stateId, inputKey, state] of [
        ["1103", "110304", servalModifiers, servalExtra, null, null, "Shocked"],
        ["1109", "110904", hookModifiers, hookExtra, hookState, "hook-enemy-burning", "Burning"]
    ]) {
        assert.ok(modifier, characterId + " extra modifier definition");
        if (stateId) assert.ok(stateId, characterId + " state modifier definition");
        const attack = attackOf(data, atkId);
        for (const profile of [{ atk: 3100, hp: 9000, def: 1200 }, { atk: 1700, hp: 16000, def: 2500 }]) {
            const context = { characterId, attackType: "talent", element: characterId === "1103" ? "Thunder" : "Fire", stats: { ...profile, critRate: 41, critDamage: 96 } };
            const candidates = runtime.buildCandidates(modifiers, context, inputKey ? { [inputKey]: 1 } : {});
            const candidate = candidates.find((x) => x.id === modifier.id);
            assert.ok(candidate, characterId + " extra candidate while enemy is pre-" + state);
            assert.equal(candidate.applicable, true);
            if (stateId) assert.equal(candidates.find((x) => x.id === stateId.id)?.enabled, true, "enemy is pre-Burning for the standalone Hook extra");
            const request = makeRequest(attack, 10, { eidolon: 0, ...profile, critRate: 41, critDamage: 96 });
            request.attack.multiplier = sourceCurves[atkId][9];
            request.modifiers = stateId ? [candidate, candidates.find((x) => x.id === stateId.id)] : [candidate];
            const expected = independentDirectDamage(request), actual = engine.calculate(request);
            for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], characterId + " extra " + key);
            for (const stat of ["atk", "hp", "def"]) {
                const changed = { ...request, character: { ...request.character, stats: { ...request.character.stats, [stat]: request.character.stats[stat] + 500 } } };
                const observed = engine.calculate(changed).nonCrit;
                if (stat === "atk") assert.ok(observed > actual.nonCrit, characterId + " extra scales with ATK");
                else assertClose(observed, actual.nonCrit, characterId + " extra does not scale with " + stat);
            }
        }
    }
});

test("Serval and Hook all components isolate ATK and accept ordinary party support without auto-adding delayed damage", async()=>{
 const {data,engine}=await loadProductionFixture();
 for(const [id,curve] of Object.entries(sourceCurves))for(const profile of [{atk:3275.5,hp:7231.75,def:1923.25,critRate:37.5,critDamage:111.25},{atk:2113.25,hp:12314.5,def:3244.75,critRate:62.5,critDamage:87.75}]){
  const a=attackOf(data,id),level=a.traceKey==="normal"?6:10,input=makeRequest(a,level,{...profile,damageBonus:23.5,defenseReduction:12,resistance:32,resistancePenetration:7});input.attack.multiplier=curve[level-1];
  const baseline=engine.calculate(input);
  for(const stat of ["atk","hp","def"]){const changed={...input,character:{...input.character,stats:{...input.character.stats,[stat]:profile[stat]+731.25}}};const expected=independentDirectDamage(changed),actual=engine.calculate(changed);for(const k of ["nonCrit","crit","expected"])assertClose(actual[k],expected[k],id+" "+stat+" "+k);if(stat==="atk")assert.ok(actual.nonCrit>baseline.nonCrit);else assertClose(actual.nonCrit,baseline.nonCrit,id+" not "+stat);}
  const robin=data.structuredModifiers.find(m=>m.id==="trace:1309:130902:party-damage");assert.ok(robin,"Robin Skill definition");
  const support=runtime.buildCandidates([robin],{characterId:a.characterId,partyIds:["1309"],traceLevelFor:()=>10},{"robin-skill-damage-active":true})[0];assert.ok(support.enabled);assert.equal(support.value,50);
  const actual=engine.calculate({...input,modifiers:[support]}),expected=independentDirectDamage({...input,modifiers:[{category:"damageBonus",value:50}]});for(const k of ["nonCrit","crit","expected"])assertClose(actual[k],expected[k],id+" Robin "+k);
  assert.equal(actual.components,undefined,id+" contains only this component");if(a.canCrit===false){assertClose(actual.crit,actual.nonCrit,id+" DoT non-crit");assertClose(actual.expected,actual.nonCrit,id+" DoT no crit expectation");}
 }
});
