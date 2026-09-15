const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PILOT_IDS,
    buildDataset,
    stableJson
} = require("../../scripts/genshinBehaviorV2Generate.cjs");

const dataset = buildDataset();

function spec(characterId, component) {
    return Object.values(dataset.specs).find((item) => item.entity.id === characterId && item.entity.component === component);
}

test("behavior v2 covers the fixed eight pilot characters with local provenance", () => {
    assert.deepEqual(dataset.pilotIds, PILOT_IDS);
    assert.equal(dataset.summary.pilotCharacters, 8);
    assert.equal(Object.keys(dataset.specs).length, dataset.summary.specs);
    assert.equal(Object.keys(dataset.modifiers).length, dataset.summary.modifiers);
    for (const item of Object.values(dataset.specs)) {
        assert.equal(item.verification.status, "needsReview");
        assert.ok(item.sourceRefs.length >= 1);
        assert.ok(item.unknownFields.includes("burstCost"));
        assert.ok(item.unknownFields.includes("snapshot"));
        item.sourceRefs.forEach((ref) => assert.ok(dataset.sourceRecords[ref], `${item.id}: ${ref}`));
    }
});

test("byCharacter index deterministically resolves each pilot package", () => {
    assert.deepEqual(Object.keys(dataset.byCharacter).sort(), [...PILOT_IDS].sort());
    for (const characterId of PILOT_IDS) {
        const index = dataset.byCharacter[characterId];
        assert.ok(index);
        assert.ok(index.sourceRecordIds.length > 0);
        assert.equal(index.specIds.length, dataset.summary.specsByCharacter[characterId]);
        assert.equal(index.modifierIds.length, dataset.summary.modifiersByCharacter[characterId]);
        index.sourceRecordIds.forEach((sourceId) => {
            assert.ok(dataset.sourceRecords[sourceId]);
            assert.match(sourceId, new RegExp(`^source:${characterId}:`));
        });
        index.specIds.forEach((specId) => assert.equal(dataset.specs[specId].entity.id, characterId));
        index.modifierIds.forEach((modifierId) => {
            assert.ok(dataset.modifiers[modifierId]);
            assert.match(modifierId, new RegExp(`^behavior-modifier:${characterId}:`));
        });
    }
});

test("explicit time/count candidates keep hitCount, maxTriggers, and tick intervals separate", () => {
    assert.equal(spec("10000026", "normalAttack.normal").execution.hitCount.value, 6);
    assert.equal(spec("10000026", "skill").execution.charges.value, 2);
    assert.equal(spec("10000026", "passives.passive_1").timing.tickInterval.value, 3);
    assert.equal(spec("10000046", "constellation.6").execution.maxTriggers.value, 1);
    assert.equal(spec("10000046", "constellation.6").timing.cooldown.value, 60);
    assert.equal(spec("10000089", "constellation.6").timing.triggerInterval.value, 0.1);
    assert.equal(spec("10000089", "constellation.6").execution.maxTriggers.value, 6);
    assert.equal(spec("10000094", "passives.passive_1").execution.maxTriggers.value, 2);
});

test("common lifecycle operations are emitted only as review-gated modifiers", () => {
    const operations = new Set(Object.values(dataset.modifiers).map((item) => item.operation));
    ["add", "reset", "extend", "setMaximum", "ignoreCooldown"].forEach((operation) => assert.ok(operations.has(operation), operation));
    for (const modifier of Object.values(dataset.modifiers)) {
        assert.equal(modifier.verification.status, "needsReview");
        assert.ok(dataset.specs[modifier.targetSpecId], modifier.id);
        modifier.sourceRefs.forEach((ref) => assert.ok(dataset.sourceRecords[ref], `${modifier.id}: ${ref}`));
    }
});

test("generation is deterministic and does not create forbidden inferred fields", () => {
    assert.equal(stableJson(dataset), stableJson(buildDataset()));
    for (const item of Object.values(dataset.specs)) {
        assert.equal(item.execution.snapshot, undefined);
        assert.equal(item.energy?.burstCost, undefined);
        for (const section of [item.timing, item.execution, item.energy || {}]) {
            for (const measurement of Object.values(section)) assert.equal(measurement.status, "explicit");
        }
    }
});
