"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fixedSourceSha, loadProductionFixture, attackOf, makeRequest, assertMatchesIndependent, independentDirectDamage, assertClose, readJson, root } = require("./helpers/hsrDirectVerification.cjs");
const path = require("node:path");
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));

const overrides = readJson("games/hsr/data/attack-overrides.json").overrides;
const jyMods = readJson("games/hsr/data/calc/modifiers-jingyuan.json").modifiers;
const atkAttackIds = ["120401", "120402", "120403", "120404"];
const sourceCurves = {
    "120401": [50,60,70,80,90,100,110,120,130,140],
    "120402": [50,55,60,65,70,75,81.25,87.5,93.75,100,105,110,115,120,125],
    "120403": [120,128,136,144,152,160,170,180,190,200,208,216,224,232,240],
    "120404": [33,36.3,39.6,42.9,46.2,49.5,53.63,57.75,61.88,66,69.3,72.6,75.9,79.2,82.5]
};

function assertScaledMatches(engine, input, perHitMultiplier, hitCount, modifiers = []) {
    const oneHitInput = { ...input, attack: { ...input.attack, multiplier: perHitMultiplier, hitCount: 1 }, modifiers };
    const result = engine.calculate({ ...input, attack: { ...input.attack, multiplier: perHitMultiplier, hitCount }, modifiers });
    assert.notEqual(result.supported, false);
    for (const key of ["nonCrit", "crit", "expected"]) {
        const independent = independentDirectDamage(oneHitInput)[key] * hitCount;
        assert.ok(Math.abs(result[key] - independent) <= Math.max(1e-8, Math.abs(independent) * 1e-11), key + " h" + hitCount + " actual=" + result[key] + " independent=" + independent);
    }
    return result;
}

test("Jing Yuan E0 source snapshot and all trace levels are present", async () => {
    const { data } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    assert.ok(overrides.find((item) => item.id === "120404"));
    for (const id of atkAttackIds) {
        const attack = attackOf(data, id);
        assert.equal(attack.scalingStat, "atk");
        assert.deepEqual(Array.from(attack.multipliers), sourceCurves[id], id + " pinned source curve");
        if (id === "120404") {
            assert.equal(attack.hitCountMinimum, 3);
            assert.equal(attack.hitCountMaximum, 10);
            assert.equal(attack.adjacentMultiplierRatio, 25);
        }
    }
});

test("Jing Yuan all E0 levels and LL3..10 independently match both target components and native conditions", async () => {
    const { data, engine } = await loadProductionFixture();
    const profiles = [
      {atk:3175.25,hp:9412.5,def:1288.75,critRate:37.5,critDamage:113.25,damageBonus:27.5,enemyLevel:83,resistance:30,defenseReduction:12.5,defenseIgnore:7.5},
      {atk:2143.75,hp:14321.5,def:3541.25,critRate:71.25,critDamage:87.5,damageBonus:11.75,enemyLevel:76,resistance:10,resistancePenetration:5}
    ];
    for (const id of atkAttackIds) {
      const attack=attackOf(data,id), max=id==="120401"?6:10;
      for(let level=1;level<=max;level++)for(const profile of profiles)for(const skillBuff of [false,true]) {
        const hitCounts=id==="120404"?[3,4,5,6,7,8,9,10]:[1];
        for(const hits of hitCounts)for(const adjacent of id==="120404"?[false,true]:[false]) {
          const inputs={"jingyuan-lightning-lord-hits":hits,"jingyuan-skill-crit-active":skillBuff};
          const candidates=runtime.buildCandidates(jyMods,{characterId:"1204",eidolon:0,stats:profile,traceLevelFor:()=>level},inputs)
            .filter(m=>runtime.applicableToAttack(m,attack));
          const input=makeRequest(attack,level,profile,candidates), perHit=sourceCurves[id][level-1]*(adjacent?.25:1);
          input.attack={...input.attack,multiplier:perHit,hitCount:hits,target:adjacent?"adjacent":attack.target};
          const independentMods=[...(id==="120404"&&hits>=6?[{category:"critDamage",value:25}]:[]),...(skillBuff||id==="120402"?[{category:"critRate",value:10}]:[])];
          const expected=independentDirectDamage({...input,modifiers:independentMods,attack:{...input.attack,hitCount:1}});
          const actual=engine.calculate(input);
          assert.notEqual(actual.supported,false);
          for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],expected[key]*hits,id+" L"+level+" h"+hits+" adjacent="+adjacent+" A6="+skillBuff+" "+key);
          assertClose(actual.breakdown.critDamagePercent,profile.critDamage+(id==="120404"&&hits>=6?25:0),"native CD exactly once");
          assertClose(actual.breakdown.critRatePercent,profile.critRate+(skillBuff||id==="120402"?10:0),"pre-existing A6 exactly once");
        }
      }
    }
});

test("Jing Yuan E0 modifiers isolate stats and apply six-hit crit damage once", async () => {
    const { data, engine } = await loadProductionFixture();
    const attack = attackOf(data, "120404");
    for (const profile of [{ atk: 3100, hp: 9000, def: 1200 }, { atk: 1700, hp: 16000, def: 2500 }]) {
        for (const hits of [5, 6, 10]) {
            const context = { characterId: "1204", attackType: "followUp", element: "Thunder", stats: { ...profile, critDamage: 100 }, input: { "jingyuan-lightning-lord-hits": hits } };
            const candidates = runtime.buildCandidates(jyMods, context, context.input);
            const breakThrough = candidates.find((m) => m.id === "traceNode:1204:1204101:followup-crit-damage");
            assert.equal(breakThrough?.enabled ?? false, hits >= 6);
            assert.equal(breakThrough?.value, 25);
            const request = makeRequest(attack, 10, { eidolon: 0, ...profile, critRate: 50, critDamage: 100 });
            request.attack.hitCount = hits;
            request.attack.multiplier = attack.multipliers[9];
            request.enemy.defenseIgnore = 20;
            request.character.stats.damageBonus = 50;
            request.modifiers = hits >= 6 ? [breakThrough] : [];
            assertScaledMatches(engine, request, attack.multipliers[9], hits, request.modifiers);
            if (hits >= 6) assert.equal(request.modifiers.filter((m) => m.id === breakThrough.id).length, 1);
        }
    }
    const base = makeRequest(attack, 10, { eidolon: 0, atk: 3100, hp: 9000, def: 1200, critRate: 50, critDamage: 100 });
    const calc = (patch) => engine.calculate({ ...base, character: { ...base.character, stats: { ...base.character.stats, ...patch } }, attack: { ...base.attack, hitCount: 3 } }).nonCrit;
    const initial = calc({});
    assert.ok(calc({ atk: 3300 }) > initial, "ATK affects Jing Yuan's follow-up");
    assert.equal(calc({ hp: 19000 }), initial, "HP does not affect ATK scaling");
    assert.equal(calc({ def: 4000 }), initial, "DEF does not affect ATK scaling");
});

test("Jing Yuan direct attacks isolate ATK while HP and DEF stay inert",async()=>{
 const {data,engine}=await loadProductionFixture();for(const id of ["120401","120402","120403"]){const a=attackOf(data,id),level=id==="120401"?6:10,input=makeRequest(a,level,{atk:3175.25,hp:9321.5,def:1288.75,critRate:37.5,critDamage:113.25,damageBonus:27.5});const baseline=engine.calculate(input);for(const stat of ["atk","hp","def"]){const changed={...input,character:{...input.character,stats:{...input.character.stats,[stat]:input.character.stats[stat]+831.25}}};const actual=engine.calculate(changed),expected=independentDirectDamage(changed);for(const key of ["nonCrit","crit","expected"])assertClose(actual[key],expected[key],id+" "+stat+" "+key);if(stat==="atk")assert.ok(actual.nonCrit>baseline.nonCrit);else assertClose(actual.nonCrit,baseline.nonCrit,id+" not "+stat);}}
});
