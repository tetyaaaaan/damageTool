"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const queuePath = path.join(repositoryRoot, "reports", "genshin-evidence-task-queue.json");
const schemaPath = path.join(
    repositoryRoot,
    "games",
    "genshin",
    "data",
    "schema",
    "r2-transition-deferral-audit.schema.json"
);
const auditModule = require(path.join(repositoryRoot, "scripts", "genshinR2TransitionDeferralAudit.cjs"));
const work = require(path.join(repositoryRoot, "scripts", "genshinWorkDisposition.cjs"));

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadQueue() {
    return JSON.parse(fs.readFileSync(queuePath, "utf8"));
}

function selectedTasks(queue) {
    const transition = JSON.parse(fs.readFileSync(path.join(
        repositoryRoot,
        "games",
        "genshin",
        "data",
        "v2",
        "version-transitions",
        "6.7-to-7.0",
        "partial-discovery.json"
    ), "utf8"));
    const ids = new Set(transition.claim.candidateMappings
        .filter((item) => ["conservativeEntityInvalidation", "exactCandidateMapped"].includes(item.mappingStatus))
        .map((item) => item.candidateId));
    return queue.tasks.filter((task) => ids.has(task.candidateId));
}

function decisionFor(audit, candidateId) {
    const decision = audit.decisions.find((item) => item.candidateId === candidateId);
    assert.ok(decision, candidateId);
    return decision;
}

function taskFor(queue, candidateId) {
    const task = queue.tasks.find((item) => item.candidateId === candidateId);
    assert.ok(task, candidateId);
    return task;
}

test("buildAudit materializes exactly the mapped 47 and excludes mapping/reaction work", () => {
    const audit = auditModule.buildAudit();
    assert.equal(audit.status, "draft");
    assert.equal(audit.draftOnly, true);
    assert.equal(audit.candidateCount, 47);
    assert.equal(audit.decisions.length, 47);
    assert.equal(audit.exclusions.length, 8);
    assert.equal(audit.evidence.fieldFindingCount, 329);
    assert.equal(audit.evidence.externalMechanicFieldCount, 282);
    assert.equal(audit.evidence.internalMetadataFieldCount, 47);
    assert.equal(audit.evidence.sourceSchemaMissingCandidateCount, 5);
    assert.equal(audit.gate.strictEligible, 0);
    assert.equal(audit.gate.canonicalPromotionEligible, 0);
    assert.equal(audit.gate.verificationGranted, false);
    assert.equal(audit.gate.promotionGranted, false);
    assert.equal(auditModule.validateAudit(audit).valid, true);

    const structuralIds = [
        "behavior:10000058:talent:passives-passive-1",
        "behavior:10000071:talent:passives-passive-1",
        "behavior:10000071:talent:passives-passive-2",
        "behavior:10000071:talent:passives-passive-utility",
        "talent-gap-spec:10000058:passive_1",
        "talent-gap-spec:10000058:passive_2",
        "talent-gap-spec:10000058:passive_utility"
    ];
    const excludedIds = new Set(audit.exclusions.map((item) => item.candidateId));
    const queue = loadQueue();
    for (const id of structuralIds) {
        assert.equal(excludedIds.has(id), true, id);
        const task = taskFor(queue, id);
        assert.equal(work.isAllowedExternalEvidenceWait(task), false, id);
    }
    assert.equal(excludedIds.has("w_12516_reaction_bonus_2"), true);
    assert.equal(audit.decisions.some((item) => excludedIds.has(item.candidateId)), false);
});

test("claim-schema fallback is confined to the five behaviorPilot candidates", () => {
    const fallbackTask = (candidateId) => ({ candidateId, dataset: "behaviorPilot" });
    const emptyTransition = { claimReacquisition: { claim: { packets: [] } } };
    const expected = [...auditModule.BEHAVIOR_FALLBACK_CLAIMS].sort((a, b) => a.localeCompare(b));
    const accepted = [
        "behavior:10000058:constellation:constellation-1",
        "behavior:10000058:constellation:constellation-4",
        "behavior:10000058:talent:burst",
        "behavior:10000058:talent:normalattack-normal",
        "behavior:10000058:talent:skill"
    ];
    for (const candidateId of accepted) {
        assert.deepEqual(auditModule.claimNamesFor(fallbackTask(candidateId), {}, emptyTransition), expected);
    }
    assert.throws(
        () => auditModule.claimNamesFor(fallbackTask("behavior:10000058:talent:unknown"), {}, emptyTransition),
        /unexpectedBehaviorPilotClaimSchemaMissing/u
    );
    assert.throws(
        () => auditModule.claimNamesFor({ candidateId: "behavior:10000022:talent:skill", dataset: "behaviorBatch2" }, {}, emptyTransition),
        /candidateClaimSchemaMissing/u
    );
    const nonPilotTask = clone(taskFor(loadQueue(), "behavior:10000022:talent:skill"));
    nonPilotTask.transitionClaimSchemaStatus = "missing";
    assert.equal(work.isAllowedExternalEvidenceWait(nonPilotTask), false);
});

test("progress-only queue changes are accepted, while task projection changes are stale", () => {
    const audit = auditModule.buildAudit();
    const queue = loadQueue();
    const selected = selectedTasks(queue);
    selected[0].progress = clone(selected[0].progress || {});
    selected[0].progress.work = {
        status: "evidenceDeferred",
        closed: true,
        verificationGranted: false,
        promotionGranted: false,
        decisionId: audit.decisions[0].id,
        deferralValidation: { valid: true, errors: [] },
        nextTask: audit.decisions[0].search.nextTask
    };
    queue.workProgress = { ...(queue.workProgress || {}), summary: { status: "progress-only-test" } };
    const progressValidation = auditModule.validateAudit(audit, {
        queue: {
            value: queue,
            path: "reports/genshin-evidence-task-queue.json",
            bytes: 1,
            rawSha256: "0".repeat(64)
        }
    });
    assert.equal(progressValidation.valid, true, progressValidation.reasons.join(","));
    assert.equal(progressValidation.summary.queueRawDigestChanged, true);

    const changedQueue = loadQueue();
    const changed = selectedTasks(changedQueue)[0];
    changed.searchFrontier.searchScope = `${changed.searchFrontier.searchScope} (projection tamper)`;
    const staleValidation = auditModule.validateAudit(audit, { queue: changedQueue });
    assert.equal(staleValidation.valid, false);
    assert.equal(staleValidation.reasons.includes("selectedTaskProjectionChanged"), true);
});

test("the external-evidence wait predicate rejects wrong frontier, mapping, consumer, identity, mismatch, and lane shapes", () => {
    const audit = auditModule.buildAudit();
    const queue = loadQueue();
    const id = audit.decisions[0].candidateId;
    const decision = decisionFor(audit, id);
    const original = taskFor(queue, id);
    const invalid = (mutate, expectedReason = null) => {
        const task = clone(original);
        mutate(task);
        assert.equal(work.isAllowedExternalEvidenceWait(task), false);
        const result = work.validateDeferral(decision, task);
        assert.equal(result.valid, false);
        if (expectedReason) assert.equal(result.errors.includes(expectedReason), true);
    };

    invalid((task) => { task.searchFrontier.policyId = "wrong-frontier"; });
    invalid((task) => {
        task.mappingStatus = "pending";
        task.transitionLane = "structuralScopeCandidate";
        task.officialVersionImpact.mappingStatus = "structuralScopeCandidate";
    }, "concreteWorkStillPending");
    invalid((task) => {
        task.consumerStatus = "missing";
        task.blockReasons = [...task.blockReasons, "consumerMissing"];
    }, "concreteWorkStillPending");
    invalid((task) => {
        task.identityConsistency = { ...task.identityConsistency, status: "ambiguous", blocked: true };
        task.blockReasons = [...task.blockReasons, "identityAmbiguous"];
    }, "concreteWorkStillPending");
    invalid((task) => {
        task.fieldComparison = { statuses: ["mismatch"], hasMismatch: true };
        task.blockReasons = [...task.blockReasons, "sourceDiscrepancy"];
    }, "concreteWorkStillPending");
    invalid((task) => {
        task.deferredLanes = [...task.deferredLanes, {
            kind: "consumer",
            status: "deferred",
            blockingReasons: ["consumerMissing"]
        }];
    }, "concreteWorkStillPending");
});

test("internal metadata refs and missing/empty artifact refs cannot close an external wait", () => {
    const audit = auditModule.buildAudit();
    const queue = loadQueue();
    const id = audit.decisions[0].candidateId;
    const task = taskFor(queue, id);
    for (const internalRef of ["claim.runtime", "claim.runtimeEligibility"]) {
        const tampered = clone(decisionFor(audit, id));
        tampered.assessment.boundedScope.deferredLaneDispositions[0].fieldRefs.push(internalRef);
        const result = work.validateDeferral(tampered, task);
        assert.equal(result.valid, false);
        assert.equal(result.errors.includes("externalEvidenceFieldRefsInvalid"), true, internalRef);
    }
    for (const refs of [[], undefined]) {
        const tampered = clone(decisionFor(audit, id));
        if (refs === undefined) delete tampered.assessment.boundedScope.deferredLaneDispositions[0].artifactRefs;
        else tampered.assessment.boundedScope.deferredLaneDispositions[0].artifactRefs = refs;
        const result = work.validateDeferral(tampered, task);
        assert.equal(result.valid, false);
        assert.equal(result.errors.includes("artifactRefsMissing"), true);
    }
});

test("transition audit schema is present and declares the draft-only fail-closed shape", () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, "r2-transition-deferral-audit.schema.json");
    assert.equal(schema.properties.status.const, "draft");
    assert.equal(schema.properties.draftOnly.const, true);
    assert.equal(schema.properties.candidateCount.const, 47);
    assert.equal(schema.properties.gate.properties.strictEligible.const, 0);
    assert.equal(schema.properties.gate.properties.canonicalPromotionEligible.const, 0);
    assert.equal(schema.$defs.deferredLaneDisposition.properties.disposition.const, "externalEvidenceWait");
    assert.match(
        schema.$defs.deferredLaneDisposition.properties.fieldRefs.items.pattern,
        /sourceText/isu
    );
    assert.doesNotMatch(
        schema.$defs.deferredLaneDisposition.properties.fieldRefs.items.pattern,
        /runtime/isu
    );
});
