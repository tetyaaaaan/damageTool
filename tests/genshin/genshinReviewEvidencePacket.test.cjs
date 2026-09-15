"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const packetDirectory = path.join(root, "games", "genshin", "data", "v2", "review-packets");
const reportPath = path.join(root, "reports", "genshin-review-evidence-packets.json");
const generator = require(path.join(root, "scripts", "genshinReviewEvidencePacketGenerate.cjs"));
const auditor = require(path.join(root, "scripts", "genshinReviewEvidencePacketAudit.cjs"));

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("review evidence packets pass the deterministic fail-closed audit", () => {
    const report = auditor.auditPackets({ packetDirectory });
    assert.equal(report.status, "passed", report.errors.join("\n"));
    assert.equal(report.summary.packets, 2);
    assert.deepEqual(report.summary.weaponIds, ["11503", "15502"]);
    assert.equal(report.summary.canonicalEligibility, 0);
    assert.equal(report.summary.verificationPromotions, 0);
    assert.equal(report.summary.representativePilots, 1);
    assert.equal(report.summary.humanReviewReadyPilots, 1);
    assert.equal(report.summary.recommendationCounts.machineReady, 0);
    assert.ok(report.summary.recommendationCounts.holdForEvidence > 0);
    assert.equal(report.summary.recommendationCounts.humanDecisionRequired, 0);
});

test("packets include the requested field-level review material", () => {
    for (const weaponId of ["11503", "15502"]) {
        const packet = readJson(path.join(packetDirectory, `weapon-${weaponId}.json`));
        assert.equal(packet.packet, "genshin-review-evidence-packet");
        assert.equal(packet.target.id, weaponId);
        assert.equal(packet.canonicalEligibility, false);
        assert.equal(packet.policy.aiSelfApproval, "forbidden");
        assert.ok(packet.sourceSelection.sourceA.sourceIds.length > 0);
        assert.ok(packet.sourceSelection.sourceB.sourceIds.length > 0);
        assert.ok(packet.sourceSelection.excluded.length > 0);
        assert.equal(packet.targetGameVersion.value, null);
        assert.ok(packet.targetGameVersion.blockedReasons.includes("independentSourceGameVersionMissing"));
        assert.ok(packet.items.length > 0);
        for (const item of packet.items) {
            for (const key of ["target", "originalText", "sourceA", "sourceB", "targetGameVersion", "extractedValue", "specValue", "comparison", "interpretationNotes", "runtimeTarget", "recommendation"]) {
                assert.notEqual(item[key], undefined, `${weaponId}/${item.id} missing ${key}`);
            }
            assert.ok(generator.RECOMMENDATIONS.includes(item.recommendation.status));
            assert.equal(item.recommendation.selfApprovalForbidden, true);
            assert.deepEqual(item.reviewDecisionOptions.map((option) => option.value), ["approve", "reject", "hold"]);
            assert.equal(item.reviewDecisionOptions.find((option) => option.value === "approve").enabled, false);
            assert.equal(item.reviewDecisionOptions.find((option) => option.value === "reject").enabled, false);
            assert.equal(item.reviewDecisionOptions.find((option) => option.value === "hold").enabled, true);
            assert.notEqual(item.recommendation.status, "approve");
            assert.equal(item.canonicalEligibility, false);
            if (item.sourceA.fieldClaim === null) assert.ok(item.sourceA.blockedReason);
            if (item.sourceB.fieldEvidence === null) assert.ok(item.sourceB.blockedReason);
            if (item.gameVersion.value === null) assert.ok(item.gameVersion.blockedReasons.length > 0);
        }
    }
});

test("Freedom-Sworn and Amos' Bow retain distinct evidence gaps and conflict decisions", () => {
    const freedom = readJson(path.join(packetDirectory, "weapon-11503.json"));
    const amos = readJson(path.join(packetDirectory, "weapon-15502.json"));
    const freedomActivation = freedom.items.find((item) => item.id.endsWith("w_11503_damage_3:activation"));
    assert.ok(freedomActivation);
    assert.equal(freedomActivation.recommendation.status, "holdForEvidence");
    const freedomUnit = freedom.items.find((item) => item.id.endsWith("w_11503_damage_3:unit"));
    assert.equal(freedomUnit.recommendation.status, "holdForEvidence");
    assert.ok(freedomUnit.comparison.triage.some((row) => row.classification === "resolvedMapping" && row.previousClassification === "scopeMismatch"));
    const amosValue = amos.items.find((item) => item.id.endsWith("w_15502_damage_1:value"));
    assert.equal(amosValue.comparison.status, "partialMatch");
    assert.equal(amosValue.recommendation.status, "holdForEvidence");
    assert.deepEqual(amosValue.sourceA.fieldClaim.structuredValue, { "1": 12 });
    const amosStack = amos.items.find((item) => item.id.endsWith("w_15502_damageBonus_fc388315:stack"));
    assert.equal(amosStack.recommendation.status, "holdForEvidence");
    assert.equal(amosStack.comparison.specAgreement, "match");
    assert.ok(amosStack.comparison.overlap.spec.includes("intervalSeconds"));
});

test("packet generation is deterministic and never emits a promotion recommendation", () => {
    const packetsA = generator.buildPackets({ weaponIds: ["15502", "11503"] });
    const packetsB = generator.buildPackets({ weaponIds: ["11503", "15502"] });
    assert.equal(generator.stableJson(packetsA), generator.stableJson(packetsB));
    for (const packet of packetsA) {
        assert.equal(packet.canonicalEligibility, false);
        assert.deepEqual(packet.reviewDecisionOptions.map((option) => option.value), ["approve", "reject", "hold"]);
        assert.notEqual(packet.recommendation.status, "approve");
        assert.notEqual(packet.recommendation.status, "verified");
        assert.notEqual(packet.recommendation.status, "canonical");
        assert.ok(packet.items.every((item) => item.verification.status !== "verified"));
    }
});

test("existing report records the generated audit result", () => {
    const report = readJson(reportPath);
    assert.equal(report.audit, "genshin-review-evidence-packets");
    assert.equal(report.status, "passed");
    assert.equal(report.summary.canonicalEligibility, 0);
    assert.equal(report.summary.verificationPromotions, 0);
});
