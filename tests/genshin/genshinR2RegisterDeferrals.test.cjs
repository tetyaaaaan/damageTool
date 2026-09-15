"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const work = require("../../scripts/genshinWorkDisposition.cjs");
const { prepareRegistry } = require("../../scripts/genshinR2RegisterDeferrals.cjs");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
function fixture() {
    const task = { candidateId: "fixture", layer: "weaponEffectSpec", dataset: "weapons", terminalState: "blocked",
        task: { kind: "sourceProvider", status: "reopenOnTrigger", taskId: "reopen:fixture", autoProcessableNow: false },
        deferredLanes: [], autoProcessableNow: false,
        searchFrontier: { scopeMatched: true, exhausted: true, status: "searchExhausted", searchScope: "fixture field", lastSearchedAt: "2026-08-28", providersExamined: ["provider"], reopenTrigger: "exact field publication" } };
    const proof = Buffer.from("bounded negative and safety evidence");
    const ref = { path: "reports/proof.json", sha256: sha(proof) };
    const draft = { id: "defer:fixture", kind: "genshinEvidenceDeferral", policyId: work.POLICY, candidateId: task.candidateId,
        targetGameVersion: "7.0", queueTaskDigest: work.taskDigest(task),
        assessment: { actorId: "luna_worker", assessedAt: "2026-08-28T10:00:00Z", reason: "external field unavailable" },
        fieldFindings: [{ field: "value", currentValue: 12, historicalValue: null, knownStatus: "localOnly", missingEvidence: "target-version independent field" }],
        search: { scope: "fixture field", lastSearchedAt: "2026-08-28", providersExamined: ["provider"], negativeResult: "field not published", unsearchedScope: [], reopenTrigger: "exact field publication", nextTask: "compare new exact field", artifactRefs: [ref] },
        safety: { impact: "unverified effect", action: "no canonical activation", runtimeStatus: "legacyUnverified", artifactRefs: [ref] } };
    const auditPath = "reports/draft.json";
    const auditBytes = Buffer.from(JSON.stringify({ decisions: [draft], exclusions: [] }));
    const files = new Map([[auditPath, auditBytes], [ref.path, proof]]);
    return { registry: { schemaVersion: 1, kind: "genshinR2WorkDispositionRegistry", policyId: work.POLICY, targetGameVersion: "7.0", decisions: [], releaseAcceptance: null },
        queue: { tasks: [task] }, audits: [{ path: auditPath, sha256: sha(auditBytes) }], assessedAt: "2026-08-28T12:00:00Z",
        readArtifact: file => files.get(file) || Buffer.from("missing") };
}
test("exact reviewed draft registers a work deferral without granting verification", () => {
    const input = fixture();
    const before = JSON.stringify(input.registry);
    const result = prepareRegistry(input);
    assert.equal(result.added, 1);
    assert.equal(result.progress.summary.disposed, 1);
    assert.equal(result.progress.summary.evidenceDeferred, 1);
    assert.equal(result.progress.records[0].evidence.strictEligible, false);
    assert.equal(result.progress.records[0].work.promotionGranted, false);
    assert.equal(result.progress.goalComplete, false);
    assert.equal(result.registry.decisions[0].assessment.actorId, "Sol");
    assert.equal(result.registry.decisions[0].search.artifactRefs.at(-1).sha256, input.audits[0].sha256);
    assert.equal(JSON.stringify(input.registry), before);
});
test("changed draft, invalid path, stale task and duplicate registration are rejected", () => {
    const altered = fixture(); altered.audits[0].sha256 = "a".repeat(64);
    assert.throws(() => prepareRegistry(altered), /reviewedAuditChanged/);
    const escaped = fixture(); escaped.audits[0].path = "../draft.json";
    assert.throws(() => prepareRegistry(escaped), /auditPathInvalid/);
    const stale = fixture(); stale.queue.tasks[0].task.taskId = "changed";
    assert.throws(() => prepareRegistry(stale), /queueTaskDigestMismatch/);
    const duplicate = fixture(); duplicate.audits.push(duplicate.audits[0]);
    assert.throws(() => prepareRegistry(duplicate), /unknownOrDuplicateDisposition/);
});

test("registration rejects mutable queue/frontier files as disposition evidence", () => {
    const input = fixture();
    const originalReader = input.readArtifact;
    const draftPath = input.audits[0].path;
    const originalDraft = JSON.parse(originalReader(draftPath).toString("utf8"));
    for (const mutablePath of [
        "reports/genshin-evidence-task-queue.json",
        "games/genshin/data/v2/source-search-frontiers.json"
    ]) {
        const draft = JSON.parse(JSON.stringify(originalDraft));
        draft.decisions[0].search.artifactRefs.push({
            path: mutablePath,
            sha256: "0".repeat(64)
        });
        const bytes = Buffer.from(JSON.stringify(draft));
        input.audits[0] = { path: draftPath, sha256: sha(bytes) };
        input.readArtifact = (file) => file === draftPath ? bytes : originalReader(file);
        assert.throws(
            () => prepareRegistry(input),
            /mutableCoordinationArtifactRef/,
            mutablePath
        );
    }
});
