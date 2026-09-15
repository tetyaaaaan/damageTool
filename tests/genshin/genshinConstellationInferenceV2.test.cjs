"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const auditModule = require("../../scripts/genshinConstellationInferenceV2Audit.cjs");

test("v2 extraction is complete, unique, and includes skipped sibling arrays", () => {
    const audit = auditModule.buildAudit();
    assert.deepEqual(audit.summary.evidenceClassCounts, {
        explicitEvidence: 61,
        quarantined: 2,
        unconfirmed: 21
    });
    assert.equal(audit.summary.totalFlagged, 84);
    assert.equal(audit.summary.inferredFromSourceText, 59);
    assert.equal(audit.summary.fromSourceText, 25);

    const ids = audit.records.map((record) => record.id);
    assert.equal(new Set(ids).size, ids.length, "flagged IDs must not be duplicated");
    assert.equal(
        crypto.createHash("sha256").update(ids.join("\n")).digest("hex"),
        "c253247ddf258302ab770f29d3534ccc99a32a9b03d9dbdfdd2d98714975fd12",
        "the 84-record inventory changed; review extraction before accepting"
    );
    assert.equal(
        audit.records.filter((record) => record.modifier.category === "resourceEffect").length,
        21
    );
    assert.ok(audit.records.some((record) => record.id === "c_10000005_2_resource_from_skip_1"
        && record.modifierPath.endsWith("$.10000005.2.0")
        && record.evidenceClass === "unconfirmed"));
    assert.ok(audit.records.some((record) => record.id === "c_10000029_1_1_resolved_1"
        && record.markerKinds.length === 1
        && record.markerKinds[0] === "fromSourceText"));
});

test("registry provenance and conservative canonical gate are explicit", () => {
    const audit = auditModule.buildAudit();
    const registryStatuses = audit.summary.registryStatusCounts;
    assert.deepEqual(registryStatuses, {
        corroborated: 40,
        missing: 21,
        quarantined: 2,
        textVerified: 21
    });
    assert.equal(audit.records.filter((record) => record.explicitEvidence).length, 61);
    assert.equal(audit.records.filter((record) => record.unconfirmed).length, 21);
    assert.equal(audit.records.filter((record) => record.quarantined).length, 2);
    assert.equal(audit.records.filter((record) => record.canonicalEligibility).length, 0);
    assert.ok(audit.records.every((record) => record.fullClaimVerified === false));
    assert.ok(audit.records.every((record) => record.canonicalEligibility === false));
    assert.ok(audit.records.every((record) => record.registry === null
        || record.registry.officialTextValueMatch === true
        || record.evidenceClass === "unconfirmed"));
});

test("semantic four-way classification is deterministic and keeps quarantine orthogonal", () => {
    const audit = auditModule.buildAudit();
    assert.deepEqual(audit.summary.semanticClassificationCounts, {
        partiallyConfirmed: 54,
        sourceMismatch: 9,
        unconfirmed: 21
    });
    assert.deepEqual(audit.summary.quarantineCounts, {
        notQuarantined: 82,
        quarantined: 2
    });
    assert.equal(audit.records.filter((record) => record.semanticClassification === "explicitlyConfirmed").length, 0);
    assert.equal(audit.records.filter((record) => record.semanticClassification === "unconfirmed").length, 21);
    assert.equal(audit.records.filter((record) => record.semanticClassification === "sourceMismatch").length, 9);
    assert.deepEqual(
        audit.records.filter((record) => record.semanticClassification === "sourceMismatch").map((record) => record.id),
        [
            "c_10000003_1_1",
            "c_10000036_6_2",
            "c_10000053_2_1",
            "c_10000074_4_1",
            "c_10000079_2_1",
            "c_10000107_1_2_resolved_2",
            "c_10000111_4_1",
            "c_10000111_4_2",
            "c_10000119_6_1"
        ]
    );
    const quarantined = audit.records.filter((record) => record.quarantine.flagged);
    assert.deepEqual(quarantined.map((record) => record.id), [
        "c_10000036_6_2",
        "c_10000079_2_2"
    ]);
    assert.equal(quarantined.find((record) => record.id === "c_10000036_6_2").semanticClassification, "sourceMismatch");
    assert.equal(quarantined.find((record) => record.id === "c_10000079_2_2").semanticClassification, "partiallyConfirmed");
    for (const record of audit.records) {
        assert.deepEqual(Object.keys(record.semanticReview).sort(), [
            "applyTo", "attackType", "branch", "category", "duplicateScope", "evidenceBasis",
            "stack", "timing", "trigger", "value"
        ]);
        for (const key of ["value", "category", "applyTo", "trigger", "timing", "stack", "branch", "attackType", "duplicateScope"]) {
            assert.ok(["confirmed", "partial", "unconfirmed", "mismatch"].includes(record.semanticReview[key].status));
        }
        assert.equal(record.canonicalEligibility, false);
    }
});

test("danger-pattern counts and checked report files are deterministic", () => {
    const audit = auditModule.buildAudit();
    assert.deepEqual(audit.summary.dangerPatternCounts, {
        branchDependent: 2,
        broadTarget: 3,
        categoryMismatch: 2,
        existingQuarantine: 2,
        missingChance: 2,
        missingStackOrCap: 17,
        missingTemporalScope: 7,
        missingTriggerOrCondition: 58,
        overlapDuplicateScope: 19,
        resourceSkipped: 21,
        supersededByStructuredRecord: 9
    });
    const json = JSON.parse(fs.readFileSync(auditModule.paths.reportJsonPath, "utf8"));
    const markdown = fs.readFileSync(auditModule.paths.reportMarkdownPath, "utf8");
    assert.deepEqual(json, audit, "checked-in JSON report must be generated by the audit script");
    assert.equal(markdown, auditModule.renderMarkdown(audit), "checked-in Markdown report must be deterministic");
});
