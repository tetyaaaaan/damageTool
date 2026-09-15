"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const work = require("../../scripts/genshinWorkDisposition.cjs");
const auditModule = require("../../scripts/genshinR2WeaponDeferralAudit.cjs");

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const clone = (value) => JSON.parse(JSON.stringify(value));
const queue = read("reports/genshin-evidence-task-queue.json");
const selected = () => queue.tasks.filter((task) => auditModule.selectedTask(task));
const taskById = (tasks) => new Map(tasks.map((task) => [task.candidateId, task]));
const external = () => read("games/genshin/data/v2/weapons/external-evidence.json");
const independent = () => read("games/genshin/data/v2/weapons/independent-field-evidence.json");
const specs = () => read("games/genshin/data/v2/weapons/spec-candidates.json");
const legacy = () => read("games/genshin/data/calc/weapon-modifiers.json");

test("buildAudit emits all 30 candidate-scoped bounded drafts and no exclusions", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.status, "draft");
    assert.equal(audit.draftOnly, true);
    assert.equal(audit.candidateCount, 30);
    assert.equal(audit.decisions.length, 30);
    assert.deepEqual(audit.exclusions, []);
    assert.equal(audit.evidence.frontier.policyId, auditModule.FRONTIER_POLICY);
    assert.equal(audit.evidence.frontier.candidateIdDigest, "cc850a9cf9e4ee4593afb229d22186dd426e8201e830f5ad330c90b5dbb89028");
    assert.deepEqual([...audit.evidence.frontier.candidateIds].sort(), [...audit.decisions.map((item) => item.candidateId)].sort());
    assert.equal(audit.evidence.frontier.candidateIds.length, 30);
    assert.ok(audit.evidence.frontier.queueCandidateIds.every((id) => audit.evidence.frontier.candidateIds.includes(id)));

    const tasks = taskById(selected());
    for (const decision of audit.decisions) {
        const task = tasks.get(decision.candidateId);
        assert.ok(task);
        assert.equal(decision.assessment.actorId, auditModule.ACTOR_ID);
        assert.equal(decision.assessment.boundedScope.candidateId, decision.candidateId);
        assert.equal(decision.assessment.boundedScope.taskId, task.task.taskId);
        assert.deepEqual(decision.assessment.boundedScope.remainingSearches, decision.search.unsearchedScope);
        assert.equal(decision.assessment.boundedScope.notExecutableReasons.length, 3);
        const result = work.validateDeferral(decision, task, { targetGameVersion: "7.0" });
        assert.equal(result.valid, true, `${decision.candidateId}: ${result.errors.join(",")}`);
        assert.equal(new Set(decision.fieldFindings.map((item) => item.field)).size, decision.fieldFindings.length);
        for (const finding of decision.fieldFindings) {
            assert.equal(typeof finding.currentValue, "object");
            assert.equal(typeof finding.historicalValue, "object");
            assert.equal(finding.currentValue?.verification, "unverified");
            assert.match(finding.missingEvidence, /strict independent exact-7\.0 binding/);
        }
        const expectedClaims = Object.keys(specs()[decision.candidateId].verification.claims);
        for (const field of expectedClaims) assert.ok(decision.fieldFindings.some((item) => item.field === field), field);
    }
});

test("evidence summary records exact IDs, finite local scope, and unbound source state", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.evidence.source.gcsim.status, "passed");
    assert.equal(audit.evidence.source.gcsim.summary.sourceRecords, 9);
    assert.equal(audit.evidence.source.gcsim.summary.fieldRecords, 145);
    assert.equal(audit.evidence.source.gcsim.summary.gameVersionMissingSourceRecords, 9);
    assert.equal(audit.evidence.source.independent.status, "passed");
    assert.equal(audit.evidence.source.independent.summary.independentGameVersionMissingRecords, 9);
    assert.equal(audit.evidence.source.independent.summary.canonicalEligible, 0);
    assert.equal(audit.evidence.source.conflictTriage.summary.genuineValueConflicts, 0);
    assert.equal(audit.evidence.safety.canonicalActiveForProduction, false);
    assert.deepEqual(audit.evidence.safety.activeCandidateRuntimeIds, []);
    assert.ok(audit.decisions.every((decision) => decision.search.artifactRefs.every((ref) => !/queue|inventory|source-search-frontiers/i.test(ref.path))));
    assert.ok(audit.decisions.every((decision) => decision.safety.artifactRefs.every((ref) => !/queue|inventory|source-search-frontiers/i.test(ref.path))));
});

test("a concrete source task is excluded even when the frontier label remains exhausted", () => {
    const mutated = clone(queue);
    mutated.tasks.find((task) => task.candidateId === "w_11503_damage_1").task.status = "ready";
    const audit = auditModule.buildAudit({ queue: mutated });
    assert.equal(audit.decisions.length, 29);
    const exclusion = audit.exclusions.find((item) => item.candidateId === "w_11503_damage_1");
    assert.ok(exclusion);
    assert.ok(exclusion.reasons.includes("concreteSourceTaskPending"));
    assert.ok(!audit.decisions.some((item) => item.candidateId === exclusion.candidateId));
});

test("missing exact candidate source coverage is excluded, while unknown fields stay unverified", () => {
    const missing = external();
    const record = missing.records["gcsim:weapon:11503"];
    record.fields = record.fields.filter((field) => field.candidateId !== "w_11503_damage_1");
    const audit = auditModule.buildAudit({ externalEvidence: missing });
    const exclusion = audit.exclusions.find((item) => item.candidateId === "w_11503_damage_1");
    assert.ok(exclusion);
    assert.ok(exclusion.reasons.includes("sourceFieldCoverageMissing"));

    const partial = external();
    const partialRecord = partial.records["gcsim:weapon:11503"];
    partialRecord.fields = partialRecord.fields.filter((field) => !(field.candidateId === "w_11503_damage_1" && field.field === "activation"));
    const partialAudit = auditModule.buildAudit({ externalEvidence: partial });
    const decision = partialAudit.decisions.find((item) => item.candidateId === "w_11503_damage_1");
    assert.ok(decision);
    const unknown = decision.fieldFindings.find((item) => item.field === "activation");
    assert.equal(unknown.knownStatus, "localOnly");
    assert.equal(unknown.currentValue.verification, "unverified");
});

test("frontier, comparison, and target-version evidence boundaries fail closed", () => {
    const frontier = clone(queue);
    frontier.tasks.find((task) => task.candidateId === "w_11503_damage_1").searchFrontier.scopeMatched = false;
    let audit = auditModule.buildAudit({ queue: frontier });
    assert.ok(audit.exclusions.find((item) => item.candidateId === "w_11503_damage_1")?.reasons.includes("frontierScopeNotMatched"));

    const comparison = clone(queue);
    const task = comparison.tasks.find((item) => item.candidateId === "w_11503_damage_1");
    task.fieldComparison.statuses = ["pending"];
    audit = auditModule.buildAudit({ queue: comparison });
    assert.ok(audit.exclusions.find((item) => item.candidateId === task.candidateId)?.reasons.includes("concreteComparisonTaskPending"));

    const target = external();
    target.records["gcsim:weapon:11503"].gameVersion = "7.0";
    audit = auditModule.buildAudit({ externalEvidence: target });
    assert.ok(audit.exclusions.find((item) => item.candidateId === "w_11503_damage_1")?.reasons.includes("targetVersionEvidencePresent"));
});

test("legacy route safety is required and progress remains unverified", () => {
    const broken = legacy();
    broken["11503"].modifiers = broken["11503"].modifiers.filter((item) => item.id !== "w_11503_damage_1");
    const audit = auditModule.buildAudit({ legacyWeaponModifiers: broken });
    assert.ok(audit.exclusions.find((item) => item.candidateId === "w_11503_damage_1")?.reasons.includes("legacyModifierMissingOrDuplicate"));

    const normal = auditModule.buildAudit();
    const progress = work.buildWorkProgress(selected(), { decisions: normal.decisions }, { targetGameVersion: "7.0" });
    assert.equal(progress.summary.evidenceDeferred, 30);
    assert.equal(progress.summary.disposed, 30);
    assert.equal(progress.candidateWorkComplete, true);
    assert.equal(progress.goalComplete, false);
    assert.ok(progress.records.every((record) => record.evidence.strictEligible === false));
});
