"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    runtime, fixedSourceSha, loadProductionFixture, makeRequest,
    independentDirectDamage, assertClose
} = require("./helpers/hsrDirectVerification.cjs");

const source = { talent: [30, 33, 36, 39, 42, 45, 48.75, 52.5, 56.25, 60] };
const recipient = {
    characterId: "1302", element: "Physical", level: 80, eidolon: 0,
    stats: { atk: 3175.25, hp: 9432.5, def: 1288.75, critRate: 37.5, critDamage: 113.25 },
    baseStats: { atk: 1043, hp: 1287, def: 743 },
    damageBonuses: { Physical: 27.5, Thunder: 42.75 },
    defenseIgnore: 7.5, resistancePenetration: 6.25
};
const provider = {
    characterId: "1202", element: "Thunder", level: 80, eidolon: 0,
    stats: { atk: 1999.5, hp: 7777.25, def: 1888.5, critRate: 1, critDamage: 3 },
    baseStats: { atk: 891, hp: 1200, def: 600 },
    damageBonuses: { Thunder: 6 }, defenseIgnore: 0, resistancePenetration: 0
};
const context = {
    characterId: "1302", characterElement: "Physical", partyIds: ["1302", "1202"],
    partyEidolons: { "1302": 0, "1202": 0 }, partyReferences: { "1302": recipient, "1202": provider },
    stats: { ...recipient.stats, damageBonus: 27.5 }, baseStats: recipient.baseStats,
    enemy: { count: 1, level: 83, resistance: 30, resistances: { Physical: 30, Thunder: 20 },
        defenseReduction: 12.5, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 11.5, toughnessActive: true }
};
const ownerInputKey = "party-reference-owner:1202";
const inputs = { "tingyun-benediction": true, [ownerInputKey]: "1302" };

function record(data, id) {
    const found = data.structuredModifiers.find((item) => item.id === id);
    assert.ok(found, "production loader includes " + id);
    return found;
}
function candidate(data, id, level, choices = inputs) {
    const built = runtime.buildCandidates([record(data, id)], {
        ...context, traceLevelFor: () => level
    }, choices);
    assert.equal(built.length, 1, id + " is available from the selected provider");
    return { ...built[0], supplementalAttack: {
        ...built[0].supplementalAttack, statReference: "selectedParty", ownerInputKey
    } };
}

// Oracle comes from hand-entered snapshot constants above and never consumes the
// production snapshot's resolved fields.
function independentRecipientDamage(multiplier) {
    const attack = {
        id: "supplemental-oracle", type: "additional", attackType: "additional",
        element: "Thunder", target: "single", scalingStat: "atk", multiplier,
        hitCount: 1, canCrit: true, damageFormula: "statMultiplier", multipliers: [multiplier]
    };
    const input = makeRequest(attack, 1, {
        atk: recipient.stats.atk, hp: recipient.stats.hp, def: recipient.stats.def,
        baseAtk: recipient.baseStats.atk, baseHp: recipient.baseStats.hp, baseDef: recipient.baseStats.def,
        critRate: recipient.stats.critRate, critDamage: recipient.stats.critDamage,
        damageBonus: recipient.damageBonuses.Thunder, enemyLevel: 83, resistance: 20,
        defenseReduction: context.enemy.defenseReduction, defenseIgnore: recipient.defenseIgnore,
        resistancePenetration: recipient.resistancePenetration, takenDamage: context.enemy.takenDamage
    });
    return independentDirectDamage(input);
}
function engineInput(reference, multiplier) {
    const attack = {
        id: "supplemental:tingyun-talent", name: "揺れる紫電・賜福対象の付加ダメージ",
        type: "additional", attackType: "additional", element: "Thunder", target: "single",
        scalingStat: "atk", multiplier, hitCount: 1, canCrit: true, damageFormula: "statMultiplier", multipliers: [multiplier]
    };
    const input = makeRequest(attack, 1, {
        atk: reference.character.stats.atk, hp: reference.character.stats.hp, def: reference.character.stats.def,
        baseAtk: reference.character.baseStats.atk, baseHp: reference.character.baseStats.hp, baseDef: reference.character.baseStats.def,
        critRate: reference.character.stats.critRate, critDamage: reference.character.stats.critDamage,
        damageBonus: reference.character.stats.damageBonus, enemyLevel: reference.enemy.level,
        resistance: reference.enemy.resistance, defenseReduction: reference.enemy.defenseReduction,
        defenseIgnore: reference.enemy.defenseIgnore, resistancePenetration: reference.enemy.resistancePenetration,
        takenDamage: reference.enemy.takenDamage
    });
    input.character.level = reference.character.level;
    input.character.eidolon = reference.character.eidolon;
    return input;
}

test("Tingyun Talent additional damage uses the blessed ally's typed snapshot at all 10 levels", async () => {
    const { data, engine } = await loadProductionFixture();
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const id = "trace:1202:120204:talent-extra-damage";
    for (let level = 1; level <= source.talent.length; level++) {
        const selected = candidate(data, id, level);
        assert.equal(selected.value, source.talent[level - 1], "pinned Talent curve Lv" + level);
        const reference = runtime.supplementalReference(selected, context, inputs);
        assert.equal(reference.supported, true, "selected ally is a valid completed snapshot Lv" + level);
        assert.equal(reference.sourceCharacterId, "1202", "Tingyun owns the effect");
        assert.equal(reference.triggerCharacterId, "1202", "Tingyun's attack triggers Talent extra damage");
        assert.equal(reference.traceOwnerId, "1202", "Tingyun owns the Talent level");
        assert.equal(reference.statsOwnerId, "1302", "blessed ally owns referenced stats");
        assert.equal(reference.damageOwnerId, "1302", "blessed ally owns attributed damage");
        assert.equal(reference.character.stats.atk, recipient.stats.atk);
        assert.equal(reference.character.stats.critRate, recipient.stats.critRate);
        assert.equal(reference.character.stats.critDamage, recipient.stats.critDamage);
        assert.equal(reference.character.stats.damageBonus, 42.75, "recipient Thunder bonus is resolved by damage element");
        assert.equal(reference.enemy.resistance, 20, "Thunder RES selected instead of current Physical RES");
        assert.equal(reference.character.stats.atk, 3175.25, "provider ATK cannot leak into recipient snapshot");

        const oracle = independentRecipientDamage(source.talent[level - 1]);
        const actual = engine.calculate(engineInput(reference, source.talent[level - 1]));
        assert.notEqual(actual.supported, false, actual.reason);
        for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], oracle[key], "Lv" + level + " " + key);

        const providerChangedContext = structuredClone(context);
        providerChangedContext.partyReferences["1202"].stats = { atk: 99999, critRate: 99, critDamage: 999 };
        const providerChanged = runtime.supplementalReference(selected, providerChangedContext, inputs);
        assert.equal(providerChanged.character.stats.atk, recipient.stats.atk, "provider ATK does not replace recipient ATK");
        assert.equal(providerChanged.character.stats.critRate, recipient.stats.critRate, "provider CR does not replace recipient CR");
        const recipientChangedContext = structuredClone(context);
        recipientChangedContext.partyReferences["1302"].stats.atk += 500;
        const recipientChanged = runtime.supplementalReference(selected, recipientChangedContext, inputs);
        assert.equal(recipientChanged.character.stats.atk, recipient.stats.atk + 500, "only recipient ATK changes this damage");
    }
});

test("selected-party reference rejects missing values and out-of-scope snapshots while accepting explicit zero", async () => {
    const { data } = await loadProductionFixture();
    const selected = candidate(data, "trace:1202:120204:talent-extra-damage", 10);
    const valid = runtime.partyReferenceSnapshot("1302", "Thunder", context, {});
    assert.equal(valid.supported, true);
    assert.equal(valid.character.stats.damageBonus, 42.75);
    assert.equal(valid.enemy.resistance, 20);

    const missingAtk = structuredClone(context); delete missingAtk.partyReferences["1302"].stats.atk;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", missingAtk, {}).supported, false, "missing final ATK stops this supplemental row");
    const missingCR = structuredClone(context); delete missingCR.partyReferences["1302"].stats.critRate;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", missingCR, {}).supported, false, "missing CR is not defaulted");
    const missingCD = structuredClone(context); delete missingCD.partyReferences["1302"].stats.critDamage;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", missingCD, {}).supported, false, "missing CD is not defaulted");
    const absent = { ...context, characterId: "9999", characterElement: "Fire", partyIds: ["1202"] };
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", absent, {}).supported, false, "non-party reference is rejected");
    const wrongLevel = structuredClone(context); wrongLevel.partyReferences["1302"].level = 79;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", wrongLevel, {}).supported, false, "out-of-scope level is rejected");
    const wrongEidolon = structuredClone(context); wrongEidolon.partyReferences["1302"].eidolon = 1;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", wrongEidolon, {}).supported, false, "out-of-scope Eidolon is rejected");
    const missingZeroResistance = structuredClone(context); delete missingZeroResistance.enemy.resistances.Thunder;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", missingZeroResistance, {}).supported, false, "missing typed RES is not inferred from another element");
    const explicitZero = structuredClone(context); explicitZero.enemy.resistances.Thunder = 0;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", explicitZero, {}).enemy.resistance, 0, "explicit zero RES is accepted");
    const zeroBonus = structuredClone(context); zeroBonus.partyReferences["1302"].damageBonuses.Thunder = 0;
    assert.equal(runtime.partyReferenceSnapshot("1302", "Thunder", zeroBonus, {}).character.stats.damageBonus, 0, "explicit zero DMG bonus is accepted");

    const offParty = runtime.supplementalReference(selected, absent, inputs);
    assert.equal(offParty.supported, false);
    assert.ok(offParty.reason);
    const providerLeaves={...context,partyIds:["1302"]};assert.equal(runtime.supplementalReference(selected,providerLeaves,inputs).supported,false,"cached recipient snapshot cannot replace absent provider");
    const negative=structuredClone(context);negative.partyReferences["1302"].defenseIgnore=-1;assert.equal(runtime.partyReferenceSnapshot("1302","Thunder",negative).supported,false);
    const blockedWrongEidolon = runtime.supplementalReference(selected, wrongEidolon, inputs);
    assert.equal(blockedWrongEidolon.supported, false);
    assert.ok(blockedWrongEidolon.reason);
});
