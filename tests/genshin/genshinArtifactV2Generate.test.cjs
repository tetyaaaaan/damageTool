"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const generator = require(path.join(root, "scripts", "genshinArtifactV2Generate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinArtifactV2Audit.cjs"));
const dataRoot = path.join(root, "games", "genshin", "data");
const outputRoot = path.join(dataRoot, "v2", "artifacts");

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function sha256(value) {
    return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

test("artifact v2 deterministic transform covers all 63 sets and 128 structured modifiers", () => {
    const dataset = generator.buildDataset({ dataRoot });
    assert.equal(dataset.summary.sets, 63);
    assert.equal(dataset.summary.generatedSets, 63);
    assert.equal(dataset.summary.modifiers, 128);
    assert.equal(dataset.summary.specs, 128);
    assert.equal(dataset.summary.sourceRecords, 443);
    assert.deepEqual(dataset.summary.verificationByStatus, { needsReview: 128 });
    assert.deepEqual(dataset.summary.sourceAgreementByStatus, { singleSource: 128 });
    assert.deepEqual(dataset.summary.runtimeByStatus, { candidate: 128 });
    assert.deepEqual(dataset.summary.inputPolicyByStatus, {
        reflected: 45,
        derived: 3,
        userToggle: 45,
        automatic: 19,
        stack: 16
    });
    assert.equal(dataset.summary.duplicateLegacyIdGroups, 14);
});

test("source records preserve raw 2pc/4pc effect text and structured modifier records", () => {
    const sets = readJson("games/genshin/data/artifact-sets.json");
    const effects = readJson("games/genshin/data/artifact-set-effects.json");
    const modifiers = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const dataset = generator.buildDataset({ dataRoot });
    Object.keys(sets).forEach((setId) => {
        assert.ok(dataset.sourceRecords[`artifact:${setId}:catalog`]);
        assert.ok(dataset.sourceRecords[`artifact:${setId}:effects`]);
        ["onePiece", "twoPiece", "fourPiece"].forEach((slot) => {
            const source = dataset.sourceRecords[`artifact:${setId}:effect:${slot}`];
            assert.ok(source, `${setId}:${slot}`);
            assert.equal(source.text, String(effects[setId]?.[`${slot}Effect`] || ""));
            assert.equal(source.integrity.digest, sha256(source.text));
            (modifiers[setId]?.[slot] || []).forEach((modifier, index) => {
                const modifierSource = dataset.sourceRecords[`artifact:${setId}:modifier:${slot}:${index}`];
                assert.ok(modifierSource);
                assert.deepEqual(modifierSource.structuredValue, modifier);
                assert.equal(modifierSource.text, modifier.sourceText !== undefined ? modifier.sourceText : generator.stableJson(modifier));
                assert.equal(modifierSource.integrity.digest, sha256(modifierSource.text));
            });
        });
    });
});

test("candidates copy explicit values, targets, conditions, duration/stack, and policy only", () => {
    const modifiers = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const dataset = generator.buildDataset({ dataRoot });
    Object.entries(modifiers).forEach(([setId, entry]) => {
        ["onePiece", "twoPiece", "fourPiece"].forEach((slot) => {
            (entry[slot] || []).forEach((modifier, modifierIndex) => {
                const id = generator.legacyCandidateId(setId, slot, modifier, modifierIndex);
                const spec = dataset.specs[id];
                assert.ok(spec, id);
                const legacyModifierId = generator.legacyModifierId(modifier, modifierIndex);
                const runtimeModifierId = generator.artifactRuntimeModifierId(setId, slot, modifier, modifierIndex);
                const destination = generator.artifactRuntimeDestination(setId, slot);
                assert.equal(spec.entity.kind, "artifactSet");
                assert.equal(spec.entity.id, setId);
                assert.equal(spec.effect.pieceSlot, slot);
                assert.equal(spec.effect.pieceCount, generator.PIECE_COUNTS[slot]);
                assert.deepEqual(spec.effect.targets, modifier.applyTo);
                assert.equal(spec.effect.activation.condition, modifier.condition);
                assert.equal(spec.effect.inputPolicy.policy, generator.classifyInputPolicy(modifier));
                assert.equal(spec.effect.automaticDetectability.policy, generator.classifyInputPolicy(modifier));
                const valueField = generator.explicitValueField(modifier);
                if (valueField) assert.deepEqual(spec.effect.value, modifier[valueField]);
                else assert.equal(spec.verification.claims.value.status, "notApplicable");
                if (modifier.duration !== undefined) assert.equal(spec.effect.duration, modifier.duration);
                if (modifier.stack !== undefined) assert.deepEqual(spec.effect.stack, modifier.stack);
                assert.equal(spec.verification.status, "needsReview");
                assert.equal(spec.verification.sourceAgreement, "singleSource");
                assert.equal(spec.runtime.status, "candidate");
                assert.deepEqual(spec.runtime.modifierIds, [runtimeModifierId]);
                assert.ok(runtimeModifierId.startsWith("genshin:v2:artifactSet:"));
                assert.equal(generator.RUNTIME_MODIFIER_NAMESPACE, "genshin:v2:artifactSet");
                assert.deepEqual(spec.destination, destination);
                assert.deepEqual(spec.runtime.destination, destination);
                assert.equal(spec.effect.legacyModifierId, legacyModifierId);
                assert.deepEqual(spec.supersedesLegacyModifierIds, [legacyModifierId]);
                assert.deepEqual(spec.runtime.supersedesLegacyModifierIds, [legacyModifierId]);
                ["destination", "runtime.modifierIds", "supersedesLegacyModifierIds"].forEach((claimName) => {
                    assert.equal(spec.verification.claims[claimName].status, "needsReview", `${id}:${claimName}`);
                    assert.ok(spec.verification.claims[claimName].sourceRefs.length, `${id}:${claimName}:sourceRefs`);
                });
                spec.sourceRefs.forEach((ref) => assert.ok(dataset.sourceRecords[ref], `${id}: ${ref}`));
            });
        });
    });
    assert.equal(Object.values(dataset.specs).filter((spec) => spec.runtime.status === "canonical").length, 0);
});

test("all seven sets without structured modifiers remain blocked packages without inferred effects", () => {
    const dataset = generator.buildDataset({ dataRoot });
    const blocked = Object.values(dataset.packages).filter((pkg) => pkg.runtime.status === "blocked");
    assert.equal(blocked.length, 7);
    blocked.forEach((pkg) => {
        assert.ok(pkg.runtime.blockedReasons.includes("structuredModifiersMissing"));
        assert.equal(pkg.specIds.length, 0);
        assert.equal(pkg.modifierIds.length, 0);
    });
});

test("structured-modifier gaps are classified from raw slots without prose inference", () => {
    const dataset = generator.buildDataset({ dataRoot });
    const review = dataset.gapReview;
    assert.equal(review.policy.canonical, 0);
    assert.deepEqual(review.policy.statuses, ["noEffect", "displayOnly", "unstructured", "invalid", "needsReview"]);
    assert.deepEqual(review.summary.statuses, {
        noEffect: 0,
        displayOnly: 4,
        unstructured: 3,
        invalid: 0,
        needsReview: 0
    });
    assert.deepEqual(review.summary.valueContractStatuses, {
        noEffect: 0,
        displayOnly: 0,
        unstructured: 0,
        invalid: 0,
        needsReview: 1
    });
    const bySet = Object.fromEntries(review.structuredModifierMissing.map((entry) => [entry.setId, entry]));
    ["10004", "10013", "14004"].forEach((setId) => {
        assert.equal(bySet[setId].status, "unstructured");
        assert.equal(bySet[setId].pieceSlots.onePiece.status, "noEffect");
        assert.equal(bySet[setId].pieceSlots.twoPiece.status, "unstructured");
        assert.equal(bySet[setId].pieceSlots.fourPiece.status, "unstructured");
    });
    ["15009", "15010", "15011", "15012"].forEach((setId) => {
        assert.equal(bySet[setId].status, "displayOnly");
        assert.equal(bySet[setId].pieceSlots.onePiece.status, "displayOnly");
        assert.equal(bySet[setId].pieceSlots.twoPiece.status, "noEffect");
        assert.equal(bySet[setId].pieceSlots.fourPiece.status, "noEffect");
    });
    review.structuredModifierMissing.forEach((entry) => {
        entry.sourceRefs.forEach((sourceRef) => assert.ok(dataset.sourceRecords[sourceRef], `${entry.setId}:${sourceRef}`));
        assert.equal(entry.canonical, 0);
        assert.equal(dataset.packages[entry.setId].runtime.status, "blocked");
        ["twoPiece", "fourPiece"].forEach((slot) => {
            assert.equal(dataset.packages[entry.setId].pieceSlots[slot].specIds.length, 0);
            assert.equal(dataset.packages[entry.setId].pieceSlots[slot].modifierIds.length, 0);
        });
    });
});

test("15020 scaling value gap remains needsReview with no synthesized value", () => {
    const dataset = generator.buildDataset({ dataRoot });
    assert.deepEqual(dataset.gapReview.valueContracts.map((entry) => entry.candidateId), [
        "artifact:15020:fourPiece:4pc_burst_damage_bonus_from_er"
    ]);
    const review = dataset.gapReview.valueContracts[0];
    assert.equal(review.status, "needsReview");
    assert.equal(review.value, null);
    assert.deepEqual(review.explicitValueFields, []);
    assert.deepEqual(review.structuredFields, ["maxValue", "ratio", "reference"]);
    review.sourceRefs.forEach((sourceRef) => assert.ok(dataset.sourceRecords[sourceRef], sourceRef));
    assert.equal(dataset.specs[review.candidateId].runtime.status, "candidate");
    assert.equal(dataset.specs[review.candidateId].verification.status, "needsReview");
    assert.equal(dataset.specs[review.candidateId].effect.value, undefined);
    assert.equal(dataset.specs[review.candidateId].effect.ratio, 0.25);
    assert.equal(dataset.specs[review.candidateId].effect.maxValue, 75);
});

test("artifact v2 audit resolves references, input digests, and duplicate legacy IDs", () => {
    const audit = auditor.auditArtifactV2({ dataRoot, outputRoot });
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(audit.summary.sets, 63);
    assert.equal(audit.summary.generatedSets, 63);
    assert.equal(audit.summary.modifiers, 128);
    assert.equal(audit.summary.generatedModifiers, 128);
    assert.equal(audit.summary.coverage.sets, 1);
    assert.equal(audit.summary.coverage.modifiers, 1);
    assert.equal(audit.summary.missing.sourceRefs.length, 0);
    assert.equal(audit.summary.missing.inputDigests.length, 0);
    assert.equal(audit.summary.missing.durationMismatches.length, 0);
    assert.equal(audit.summary.missing.stackMismatches.length, 0);
    assert.deepEqual(audit.summary.missing.structuredModifiers.sort(), ["10004", "10013", "14004", "15009", "15010", "15011", "15012"]);
    assert.deepEqual(audit.summary.missing.gapReview, []);
    assert.deepEqual(audit.summary.gapReview.statuses, {
        noEffect: 0,
        displayOnly: 4,
        unstructured: 3,
        invalid: 0,
        needsReview: 0
    });
    assert.deepEqual(audit.summary.gapReview.valueContractStatuses, {
        noEffect: 0,
        displayOnly: 0,
        unstructured: 0,
        invalid: 0,
        needsReview: 1
    });
    assert.equal(audit.summary.duplicates.legacyCandidateGroups, 14);
    assert.equal(audit.summary.verification.unverified, 128);
    assert.equal(audit.summary.verification.verified, 0);
    assert.equal(audit.summary.verification.canonical, 0);
    assert.equal(audit.summary.runtime.connected, 128);
    assert.equal(audit.summary.runtime.candidate, 128);
    assert.equal(audit.summary.runtime.blockedPackages, 7);
    assert.equal(audit.summary.runtime.namespacedIds, 128);
    assert.equal(audit.summary.runtime.routeConnected, 128);
    assert.equal(audit.summary.runtime.supersessionConnected, 128);
    assert.equal(audit.summary.runtime.claimsReviewGated, 128);
    assert.deepEqual(audit.summary.missing.runtimeIdMismatches, []);
    assert.deepEqual(audit.summary.missing.runtimeRouteMismatches, []);
    assert.deepEqual(audit.summary.missing.supersessionMismatches, []);
    assert.deepEqual(audit.summary.missing.runtimeClaimMismatches, []);
    assert.deepEqual(audit.summary.duplicates.runtimeIds, []);
});

test("running the deterministic transform twice produces byte-equivalent logical output", () => {
    const first = generator.buildDataset({ dataRoot });
    const second = generator.buildDataset({ dataRoot });
    assert.equal(generator.stableJson(first.sourceRecords), generator.stableJson(second.sourceRecords));
    assert.equal(generator.stableJson(first.specs), generator.stableJson(second.specs));
    assert.equal(generator.stableJson(first.packages), generator.stableJson(second.packages));
});
