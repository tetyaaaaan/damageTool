"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadProductionFixture, attackOf, makeRequest, independentDirectDamage, assertClose } = require("./helpers/hsrDirectVerification.cjs");
const dataFile = require("../../games/hsr/data/calc/attacks-pearl-round31.json");

const normal = [50, 60, 70, 80, 90, 100];
const ownRider = [10, 11, 12, 13, 14, 15];
const learnedRider = [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60];
const pearlStats = { atk: 2731, hp: 8442, def: 1995.5, critRate: 47.25, critDamage: 154.5, damageBonus: 23, elation: 141.75 };
const learnedStats = { atk: 3187.25, hp: 9200, def: 1608.5, critRate: 63, critDamage: 188.25, damageBonus: 0, elation: 207.5 };

function independentElation(input, multiplier, punchline) {
    const { character, enemy } = input;
    const stats = character.stats;
    const levelBase = 7535.107;
    const defense = (character.level + 20) / ((character.level + 20) + (enemy.level + 20) * Math.max(0, 1 - (enemy.defenseReduction + enemy.defenseIgnore) / 100));
    const resistance = 1 - (enemy.resistance - enemy.resistancePenetration) / 100;
    const base = levelBase * multiplier / 100 * (1 + stats.elation / 100) * (1 + 5 * punchline / (punchline + 240)) * (1 + (input.elation.merrymake || 0) / 100) * defense * resistance * (enemy.toughnessActive ? 0.9 : 1) * (1 + enemy.takenDamage / 100);
    const crit = 1 + stats.critDamage / 100;
    return { nonCrit: base, crit: base * crit, expected: base * (1 + stats.critRate / 100 * (crit - 1)) };
}

function makeSequence(data, normalLevel, ultimateLevel) {
    const aggregate = attackOf(data, "150308");
    const directAttack = attackOf(data, "1503080");
    const ownAttack = attackOf(data, "1503081");
    const learnedAttack = attackOf(data, "1503031");
    const enemy = { enemyCount: 1, enemyLevel: 83, resistance: 28, defenseReduction: 7, defenseIgnore: 3, resistancePenetration: 5, takenDamage: 11, toughnessActive: true };
    const root = makeRequest(aggregate, normalLevel, { ...pearlStats, ...enemy });
    root.character.id = "1503";
    root.character.stats.elation = pearlStats.elation;
    root.attack.pearlPairActive = true;
    root.attack.pearlUltimateLevel = ultimateLevel;
    root.attack.learnedOwnerId = "1502";
    root.attack.requiredTraceLevelRanges = { normal: { minimum: 1, maximum: 6 }, ultimate: { minimum: 1, maximum: 10 } };
    root.modifierInputs = { "elation-certified-banger": 34, "pearl-learned-punchline": 27, "pearl-next-proc-count": 0 };
    const common = { ...pearlStats, ...enemy };
    const direct = makeRequest(directAttack, normalLevel, common);
    direct.character.id = "1503"; direct.character.stats.elation = pearlStats.elation;
    direct.modifierInputs = root.modifierInputs;
    const own = makeRequest(ownAttack, normalLevel, common);
    own.character.id = "1503"; own.character.stats.elation = pearlStats.elation;
    own.modifierInputs = root.modifierInputs;
    own.elation = { context: "certifiedBanger", certifiedBanger: 34, merrymake: 0 };
    const learned = makeRequest(learnedAttack, ultimateLevel, { ...learnedStats, ...enemy, defenseIgnore: 17, resistancePenetration: 19 });
    learned.character = { ...learned.character, id: "1502", eidolon: 0 };
    learned.character.stats = { ...learned.character.stats, elation: learnedStats.elation };
    learned.modifierInputs = root.modifierInputs;
    learned.attack.completedReferenceSnapshot = true; learned.attack.pearlPairActive = true;
    learned.attack.damageOwnerId = "1502";
    learned.attack.learnedOwnerId = "1502";
    learned.elation = { context: "pearlLearnedSnapshot", punchline: 27, merrymake: 0 };
    root.sequenceComponents = [
        { key: "direct", name: aggregate.damageComponents[0].name, input: direct },
        { key: "own", name: aggregate.damageComponents[1].name, input: own },
        { key: "learned", name: aggregate.damageComponents[2].name, input: learned }
    ];
    return { root, direct, own, learned };
}

test("Round31 Pearl fixed-source rows preserve separate Normal and Ultimate curves and owner roles", () => {
    const direct = dataFile.overrides.find((item) => item.id === "1503080");
    const learned = dataFile.overrides.find((item) => item.id === "1503031");
    const aggregate = dataFile.overrides.find((item) => item.id === "150308");
    assert.deepEqual(direct.multipliers, normal);
    assert.equal(direct.maximumTraceLevel, 6);
    assert.deepEqual(learned.multipliers, learnedRider);
    assert.equal(learned.maximumTraceLevel, 10);
    assert.equal(learned.referenceOwnerId, "1502");
    assert.equal(learned.damageOwnerId, "1502");
    assert.equal(learned.requiresLearnedOwnerSnapshot, true);
    assert.deepEqual(aggregate.damageComponents.map((item) => item.key), ["direct", "own", "learned", "next"]);
    assert.deepEqual(aggregate.requiredTraceLevelRanges, { normal: { minimum: 1, maximum: 6 }, ultimate: { minimum: 1, maximum: 10 } });
});

test("Round31 Pearl enhanced Normal sums independently calculated DEF, own CB, and learned-owner stats with Pearl punchline", async () => {
    const { data, engine } = await loadProductionFixture();
    for (const [normalLevel, ultimateLevel] of [[1, 1], [6, 10]]) {
        const { root, direct, own, learned } = makeSequence(data, normalLevel, ultimateLevel);
        assert.equal(root.character.id, "1503");
        assert.equal(learned.character.id, "1502");
        assert.equal(learned.attack.damageOwnerId, "1502");
        assert.equal(learned.attack.learnedOwnerId, "1502");
        const result = engine.calculate(root);
        assert.notEqual(result.supported, false, result.reason || "three-component Pearl enhanced normal should calculate");
        const expected = {
            direct: independentDirectDamage(direct),
            own: independentElation(own, ownRider[normalLevel - 1], 34),
            learned: independentElation(learned, learnedRider[ultimateLevel - 1], 27)
        };
        for (const key of ["direct", "own", "learned"]) {
            for (const metric of ["nonCrit", "crit", "expected"]) assertClose(result.components[key][metric], expected[key][metric], `${key} Lv${normalLevel}/U${ultimateLevel} ${metric}`);
        }
        for (const metric of ["nonCrit", "crit", "expected"]) {
            assertClose(result[metric], expected.direct[metric] + expected.own[metric] + expected.learned[metric], `aggregate Lv${normalLevel}/U${ultimateLevel} ${metric}`);
        }
        assert.equal(result.components.learned.breakdown.punchline, 27, "learned-owner stats still use Pearl's punchline input");
    }
});

test("Round31 Pearl rejects missing learned-owner identity or Pearl punchline instead of substituting Pearl's stats", async () => {
    const { data, engine } = await loadProductionFixture();
    const baseline = makeSequence(data, 6, 10).root;
    const noLearnedOwner = makeSequence(data, 6, 10).root;
    delete noLearnedOwner.attack.learnedOwnerId;
    assert.equal(engine.calculate(noLearnedOwner).supported, false);
    const wrongReference=makeSequence(data,6,10).root;
    wrongReference.sequenceComponents[2].input.attack.referenceOwnerId='1503';
    assert.equal(engine.calculate(wrongReference).supported,false);
    const missingSnapshot = makeSequence(data, 6, 10).root;
    delete missingSnapshot.sequenceComponents[2].input.attack.completedReferenceSnapshot;
    assert.equal(engine.calculate(missingSnapshot).supported, false);
    const missingPunchline = makeSequence(data, 6, 10).root;
    delete missingPunchline.modifierInputs["pearl-learned-punchline"];
    missingPunchline.sequenceComponents[2].input.modifierInputs = missingPunchline.modifierInputs;
    missingPunchline.sequenceComponents[2].input.elation.punchline = undefined;
    assert.equal(engine.calculate(missingPunchline).supported, false);
    const differentPearl = makeSequence(data, 6, 10).root;
    differentPearl.character.stats.elation += 500;
    differentPearl.sequenceComponents[0].input.character.stats.elation += 500;
    differentPearl.sequenceComponents[1].input.character.stats.elation += 500;
    const original = engine.calculate(baseline);
    const changed = engine.calculate(differentPearl);
    assert.notEqual(original.supported, false, original.reason);
    assert.notEqual(changed.supported, false, changed.reason);
    assertClose(changed.components.learned.nonCrit, original.components.learned.nonCrit, "learned Elation uses the learned owner's final snapshot");
});


test("Round31 Pearl next-attack additions use the fixed two-Elation curve, separate owners and explicit availability", async () => {
    const {data,engine}=await loadProductionFixture();
    const nextCurve=[7.5,8.25,9,9.75,10.5,11.25,12.19,13.13,14.06,15];
    for (const level of [1,6,10]) for(const punchline of [0,27]) {
        const {root,learned}=makeSequence(data,6,10);
        root.modifierInputs['pearl-next-proc-count']=1;
        root.modifierInputs['pearl-next-punchline']=punchline;
        root.attack.pearlElationLevel=level;
        const next={...root,attack:{...attackOf(data,'150320'),traceLevel:level,multiplier:nextCurve[level-1],pearlPairActive:true},elation:{context:'pearlNextAttack',punchline,merrymake:0}};
        delete next.sequenceComponents;
        root.sequenceComponents.push({key:'next',input:next});
        const expected=independentElation(next,nextCurve[level-1],punchline),result=engine.calculate(root);
        assert.notEqual(result.supported,false,result.reason);
        for(const metric of ['nonCrit','crit','expected']) assertClose(result.components.next[metric],expected[metric], 'own next '+metric);
        const other={...learned,attack:{...attackOf(data,'1503201'),traceLevel:level,multiplier:nextCurve[level-1],pearlPairActive:true,completedReferenceSnapshot:true,damageOwnerId:'1502',learnedOwnerId:'1502',statReferenceId:'1502',referenceOwnerId:'1502'},enemy:{...learned.enemy,resistance:41,resistancePenetration:13},elation:{context:'pearlNextAttack',punchline,merrymake:0}};
        const out=engine.calculate(other),oracle=independentElation(other,nextCurve[level-1],punchline);
        assert.notEqual(out.supported,false,out.reason);
        for(const metric of ['nonCrit','crit','expected']) assertClose(out[metric],oracle[metric],'other next '+metric);
        other.attack.pearlPairActive=false;assert.equal(engine.calculate(other).supported,false);
        delete root.modifierInputs['pearl-next-proc-count'];assert.equal(engine.calculate(root).supported,false);
    }
});
