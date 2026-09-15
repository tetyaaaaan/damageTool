"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinWeaponV2Generate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinWeaponV2Audit.cjs"));

const dataRoot = path.join(root, "games", "genshin", "data");
const outputRoot = path.join(dataRoot, "v2", "weapons");
const legacyModifiers = readJson("games/genshin/data/calc/weapon-modifiers.json");
const legacyById = new Map(Object.entries(legacyModifiers).flatMap(([weaponId, entry]) => (entry.modifiers || []).map((modifier) => [modifier.id, { weaponId, modifier }])));

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sha256(text) {
    return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

test("weapon v2 deterministic transform covers all legacy weapons and modifiers", () => {
    const dataset = generator.buildDataset({ dataRoot });
    assert.equal(dataset.summary.weapons, 210);
    assert.equal(dataset.summary.modifiers, 455);
    assert.equal(dataset.summary.specs, 455);
    assert.equal(Object.keys(dataset.specs).length, 455);
    assert.equal(Object.keys(dataset.packages).length, 210);
    assert.equal(dataset.summary.sourceRecords, 895);
    assert.deepEqual(dataset.summary.verificationByStatus, { needsReview: 455 });
    assert.equal(dataset.summary.sourceAgreementByStatus.singleSource, 455);
    assert.equal(dataset.summary.runtimeByStatus.candidate, 454);
    assert.equal(dataset.summary.runtimeByStatus.displayOnly, 1);
    assert.equal(dataset.summary.legacyAudits.length, 2);
});

test("every source record is integrity checked and every spec reference resolves", () => {
    const dataset = generator.buildDataset({ dataRoot });
    Object.entries(dataset.sourceRecords).forEach(([id, source]) => {
        assert.equal(source.id, id);
        assert.equal(source.integrity.algorithm, "sha256");
        assert.equal(source.integrity.digest, sha256(source.text));
        assert.equal(source.gameVersion, null);
        assert.match(source.capturedAt, /^2026-08-15T00:00:00\.000Z$/);
    });
    Object.values(dataset.specs).forEach((spec) => {
        assert.ok(spec.sourceRefs.length >= 3);
        spec.sourceRefs.forEach((sourceRef) => assert.ok(dataset.sourceRecords[sourceRef], `${spec.id}: ${sourceRef}`));
        assert.equal(spec.entity.kind, "weapon");
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.verification.sourceAgreement, "singleSource");
        assert.equal(spec.verification.reviewedBy, null);
        assert.equal(spec.verification.reviewedAt, null);
        assert.equal(spec.runtime.status === "candidate" || spec.runtime.status === "displayOnly", true);
        assert.deepEqual(spec.runtime.modifierIds, [generator.runtimeModifierId(spec.entity.id, spec.id)]);
        assert.deepEqual(spec.destination, {
            dataset: "weaponModifiers",
            entityId: spec.entity.id,
            collection: "modifiers"
        });
        assert.deepEqual(spec.supersedesLegacyModifierIds, [spec.id]);
        const legacy = legacyById.get(spec.id);
        assert.ok(legacy, spec.id);
        assert.deepEqual(spec.effect.activation.uidHandling, legacy.modifier.uidHandling);
        assert.equal(spec.verification.claims["effect.activation.uidHandling"].status, "needsReview");
        assert.deepEqual(spec.runtime.destination, spec.destination);
        assert.deepEqual(spec.runtime.supersedesLegacyModifierIds, spec.supersedesLegacyModifierIds);
        assert.equal(spec.verification.claims.destination.status, "needsReview");
        assert.equal(spec.verification.claims.supersedesLegacyModifierIds.status, "needsReview");
        assert.equal(spec.verification.claims["runtime.modifierIds"].status, "needsReview");
    });
});

test("values and targets are copied only from explicit modifier fields, never inferred from prose", () => {
    const weapons = readJson("games/genshin/data/weapons.json");
    const modifiers = readJson("games/genshin/data/calc/weapon-modifiers.json");
    const dataset = generator.buildDataset({ dataRoot });
    const byId = new Map(Object.entries(modifiers).flatMap(([weaponId, entry]) => (entry.modifiers || []).map((modifier) => [modifier.id, { weaponId, modifier }])));
    Object.values(dataset.specs).forEach((spec) => {
        const legacy = byId.get(spec.id);
        assert.ok(legacy, spec.id);
        assert.equal(spec.entity.id, legacy.weaponId);
        assert.ok(weapons[legacy.weaponId]);
        assert.deepEqual(spec.effect.targets, legacy.modifier.applyTo);
        const explicit = [
            "valueByRefinement", "value", "valueByRefinementPerStack",
            "valueByRefinementPerConsumedStack"
        ].map((field) => legacy.modifier[field]).find((value) => value !== undefined && value !== null);
        if (explicit !== undefined && explicit !== null) assert.deepEqual(spec.effect.value, explicit);
        else assert.equal(spec.verification.claims.value.status, "notApplicable");
        assert.notEqual(spec.verification.status, "verified");
        assert.equal(spec.interpretation.method, "deterministicParser");
        assert.equal(spec.runtime.modifierIds[0], generator.runtimeModifierId(legacy.weaponId, spec.id));
        assert.deepEqual(spec.supersedesLegacyModifierIds, [spec.id]);
        assert.deepEqual(spec.effect.activation.uidHandling, legacy.modifier.uidHandling);
        assert.equal(spec.verification.claims["effect.activation.uidHandling"].status, "needsReview");
        assert.deepEqual(spec.runtime.destination, spec.destination);
        assert.deepEqual(spec.runtime.supersedesLegacyModifierIds, spec.supersedesLegacyModifierIds);
        assert.equal(spec.verification.claims.destination.status, "needsReview");
        assert.equal(spec.verification.claims.supersedesLegacyModifierIds.status, "needsReview");
        assert.equal(spec.verification.claims["runtime.modifierIds"].status, "needsReview");
    });
});

test("existing hand registry links remain review-gated", () => {
    const dataset = generator.buildDataset({ dataRoot });
    const registry = readJson("games/genshin/data/calc/weapon-effect-registry.json");
    const registryModifierIds = new Set();
    Object.entries(registry.weapons || {}).forEach(([weaponId, definition]) => {
        (definition.groups || []).forEach((group) => (group.modifierIds || []).forEach((modifierId) => registryModifierIds.add(modifierId)));
    });
    assert.equal(registryModifierIds.size, 34);
    registryModifierIds.forEach((modifierId) => {
        const spec = dataset.specs[modifierId];
        assert.ok(spec, modifierId);
        assert.equal(spec.verification.status, "needsReview");
        assert.equal(spec.verification.sourceAgreement, "singleSource");
        assert.equal(spec.verification.claims.registryStructure.status, "needsReview");
    });
});

test("audit reports coverage, missing contracts, duplicate candidates, unverified specs, and runtime links", () => {
    const audit = auditor.auditWeaponV2({ dataRoot, outputRoot });
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.summary.weapons, 210);
    assert.equal(audit.summary.modifiers, 455);
    assert.equal(audit.summary.generatedWeapons, 210);
    assert.equal(audit.summary.generatedModifiers, 455);
    assert.equal(audit.summary.coverage.weapons, 1);
    assert.equal(audit.summary.coverage.modifiers, 1);
    assert.equal(audit.summary.missing.modifiers.length, 0);
    assert.equal(audit.summary.missing.sourceRefs.length, 0);
    assert.equal(audit.summary.missing.inputDigests.length, 0);
    assert.equal(audit.summary.missing.valueContracts.length, 8);
    assert.equal(audit.summary.duplicates.legacyCandidateGroups, 50);
    assert.equal(audit.summary.verification.unverified, 455);
    assert.equal(audit.summary.verification.verified, 0);
    assert.equal(audit.summary.runtime.connected, 455);
    assert.equal(audit.summary.runtime.disconnected, 0);
    assert.equal(audit.summary.runtime.canonical, 0);
    assert.equal(audit.summary.runtime.candidate, 454);
    assert.equal(audit.summary.runtime.displayOnly, 1);
    assert.equal(audit.summary.runtime.missingModifierIds.length, 0);
    assert.equal(audit.summary.runtime.namespace, generator.RUNTIME_NAMESPACE);
    assert.equal(audit.summary.runtime.route.expected, 455);
    assert.equal(audit.summary.runtime.route.connected, 455);
    assert.equal(audit.summary.runtime.route.runtimeMirrorConnected, 455);
    assert.equal(audit.summary.runtime.supersession.connected, 455);
    assert.equal(audit.summary.runtime.supersession.runtimeMirrorConnected, 455);
    assert.equal(audit.summary.runtime.contractClaims.expected, 1365);
    assert.equal(audit.summary.runtime.contractClaims.needsReview, 1365);
    assert.equal(audit.summary.runtime.contractClaims.verified, 0);
    assert.equal(audit.summary.runtime.uidHandling.copied, 455);
    assert.equal(audit.summary.runtime.uidHandling.claimNeedsReview, 455);
    assert.equal(audit.summary.runtime.uidHandling.claimVerified, 0);
    assert.equal(audit.summary.runtime.idDuplicates.length, 0);
});

test("running the deterministic transform twice produces byte-equivalent logical output", () => {
    const first = generator.buildDataset({ dataRoot });
    const second = generator.buildDataset({ dataRoot });
    assert.equal(generator.stableJson(first.sourceRecords), generator.stableJson(second.sourceRecords));
    assert.equal(generator.stableJson(first.specs), generator.stableJson(second.specs));
    assert.equal(generator.stableJson(first.packages), generator.stableJson(second.packages));
});
