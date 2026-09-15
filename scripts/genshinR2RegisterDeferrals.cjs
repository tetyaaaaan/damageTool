"use strict";

// Register Sol-audited work dispositions only. No source verification,
// canonical promotion, source retrieval, or queue mutation is performed here.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const work = require("./genshinWorkDisposition.cjs");
const ROOT = path.resolve(__dirname, "..");
const registryPath = path.join(ROOT, "games/genshin/data/v2/r2-work-dispositions.json");
const queuePath = path.join(ROOT, "reports/genshin-evidence-task-queue.json");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));

function prepareRegistry({ registry, queue, audits, assessedAt, readArtifact = file => fs.readFileSync(path.join(ROOT, file)) }) {
    if (!Array.isArray(audits) || !audits.length) throw new Error("reviewedAuditsMissing");
    if (!Number.isFinite(Date.parse(assessedAt))) throw new Error("assessmentTimeInvalid");
    const tasks = new Map(queue.tasks.map(task => [task.candidateId, task]));
    const decisions = [...registry.decisions];
    const seen = new Set(decisions.map(decision => decision.candidateId));
    let added = 0;
    for (const entry of audits) {
        if (path.isAbsolute(entry.path) || /^[a-z]:/i.test(entry.path) || entry.path.split(/[\\/]/).includes("..")) throw new Error("auditPathInvalid");
        const bytes = readArtifact(entry.path);
        if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "") || sha(bytes) !== entry.sha256) throw new Error("reviewedAuditChanged:" + entry.path);
        const audit = JSON.parse(bytes.toString("utf8"));
        if (!Array.isArray(audit.decisions) || !Array.isArray(audit.exclusions)) throw new Error("draftAuditInvalid");
        for (const draft of audit.decisions) {
            const task = tasks.get(draft.candidateId);
            if (!task || seen.has(draft.candidateId)) throw new Error("unknownOrDuplicateDisposition:" + draft.candidateId);
            const decision = structuredClone(draft);
            const mutableEvidenceRef = [
                ...(decision.search?.artifactRefs || []),
                ...(decision.safety?.artifactRefs || []),
                ...(decision.assessment?.boundedScope?.artifactRefs || [])
            ].find((ref) => work.isMutableCoordinationArtifactPath(ref?.path));
            if (mutableEvidenceRef) {
                throw new Error(`mutableCoordinationArtifactRef:${decision.candidateId}:${mutableEvidenceRef.path}`);
            }
            decision.assessment = { ...decision.assessment, actorId: "Sol", assessedAt,
                reason: `Sol disposition review of ${entry.path}: ${draft.assessment.reason} This closes bounded work, not verification.` };
            // Pin the exact reviewed draft as well as its underlying evidence.
            decision.search.artifactRefs.push({ path: entry.path, sha256: entry.sha256 });
            const result = work.validateDeferral(decision, task, { targetGameVersion: registry.targetGameVersion, readArtifact });
            if (!result.valid) throw new Error(`${draft.candidateId}:${result.errors.join(",")}`);
            decisions.push(decision);
            seen.add(draft.candidateId);
            added += 1;
        }
    }
    if (!added) throw new Error("noDispositionsToRegister");
    const next = { ...registry, decisions: decisions.sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
        note: "Candidate-scoped Sol dispositions retain unverified data, safety actions and reopen triggers. Deferral never grants strict verification or canonical activation." };
    const progress = work.buildWorkProgress(queue.tasks, next, { targetGameVersion: next.targetGameVersion, readArtifact });
    if (progress.errors.length) throw new Error(progress.errors.join(";"));
    return { registry: next, added, progress };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (!args.length || args.length % 2) throw new Error("Usage: script reviewed-audit-path exact-sha256 [...]");
    const audits = Array.from({ length: args.length / 2 }, (_, i) => ({ path: args[i * 2], sha256: args[i * 2 + 1] }));
    const result = prepareRegistry({ registry: readJson(registryPath), queue: readJson(queuePath), audits, assessedAt: new Date().toISOString() });
    fs.writeFileSync(registryPath, JSON.stringify(result.registry, null, 2) + "\n");
    process.stdout.write(JSON.stringify({ added: result.added, work: result.progress.summary, goalComplete: result.progress.goalComplete }, null, 2) + "\n");
}

module.exports = { prepareRegistry };
