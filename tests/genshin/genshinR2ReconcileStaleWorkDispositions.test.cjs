"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const work = require("../../scripts/genshinWorkDisposition.cjs");
const weaponAudit = require("../../scripts/genshinR2WeaponDeferralAudit.cjs");
const artifactAudit = require("../../scripts/genshinR2ArtifactDeferralAudit.cjs");
const terminal = require("../../scripts/genshinTerminalStateAudit.cjs");

const ROOT = path.resolve(__dirname, "../..");
const REGISTRY_PATH = path.join(ROOT, "games/genshin/data/v2/r2-work-dispositions.json");
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

test("reconciled registry is bounded and fail-closed", () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    assert.equal(registry.decisions.length, 958);
    for (const id of ["w_13516_reactionBonus_d4e397ce", "w_15424_damageBonus_05580649"]) {
        assert.equal(registry.decisions.some(d => d.candidateId === id), false);
    }
    assert.equal(registry.decisions.filter((d) => String(d.id).startsWith("r2-transition-deferral:")).length, 0);
    assert.equal(registry.decisions.some((d) => d.id === "r2-weapon-primary-shard01-deferral:w_11301_damageBonus_91cc873a"), false);
    assert.equal(registry.decisions.some((d) => d.candidateId === "w_13511_statBonus_3f1f80b6"), false);
    assert.equal(registry.decisions.some((d) => d.candidateId === "w_13511_statBonus_f902d11b"), false);
    assert.equal(registry.decisions.some((d) => d.candidateId === "w_14424_stat_1"), false);
    assert.equal(registry.decisions.some((d) => d.candidateId === "w_14424_stat_2"), false);
    const audit = weaponAudit.buildAudit();
    const auditSha = digest(path.join(ROOT, "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json"));
    const weaponIds = new Set(audit.decisions.map((d) => d.candidateId));
    assert.equal(weaponIds.size, 30);
    const refreshed = registry.decisions.filter((d) => weaponIds.has(d.candidateId));
    assert.equal(refreshed.length, 30);
    assert.equal(refreshed.filter((d) => d.search?.artifactRefs?.some((ref) =>
        ref.path === "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json" && ref.sha256 === auditSha)).length, 30);
    assert.equal(refreshed.filter((d) => d.safety?.artifactRefs?.some((ref) =>
        ref.path === "games/genshin/data/v2/weapons/spec-candidates.json" &&
        ref.sha256 === digest(path.join(ROOT, "games/genshin/data/v2/weapons/spec-candidates.json")))).length, 30);
    assert.equal(refreshed.filter((d) => d.safety?.artifactRefs?.some((ref) =>
        ref.path === "games/genshin/data/calc/weapon-modifiers.json" &&
        ref.sha256 === digest(path.join(ROOT, "games/genshin/data/calc/weapon-modifiers.json")))).length, 30);

    const currentArtifactAudit = artifactAudit.buildAudit();
    const artifactAuditSha = digest(path.join(ROOT, "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json"));
    const artifactIds = new Set(currentArtifactAudit.decisions.map((d) => d.candidateId));
    assert.equal(artifactIds.size, 116);
    const refreshedArtifacts = registry.decisions.filter((d) => artifactIds.has(d.candidateId));
    assert.equal(refreshedArtifacts.length, 116);
    assert.equal(refreshedArtifacts.filter((d) => d.search?.artifactRefs?.some((ref) =>
        ref.path === "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json" &&
        ref.sha256 === artifactAuditSha)).length, 116);
    assert.equal(refreshedArtifacts.filter((d) => d.safety?.artifactRefs?.some((ref) =>
        ref.path === "games/genshin/data/calc/artifact-set-modifiers.json" &&
        ref.sha256 === digest(path.join(ROOT, "games/genshin/data/calc/artifact-set-modifiers.json")))).length, 116);

    const terminalAudit = terminal.buildTerminalStateAudit();
    const weaponTasks = terminalAudit.taskQueue.tasks.filter((task) => weaponIds.has(task.candidateId));
    const progress = work.buildWorkProgress(weaponTasks, { decisions: audit.decisions }, {
        targetGameVersion: "7.0",
        readArtifact: (file) => fs.readFileSync(path.resolve(ROOT, file))
    });
    assert.deepEqual(progress.errors, []);
    assert.equal(progress.summary.total, 30);
    assert.equal(progress.summary.evidenceDeferred, 30);
    assert.equal(progress.summary.disposed, 30);
    assert.equal(progress.goalComplete, false);
    assert.deepEqual(progress.summary.evidenceStates, { unverified: 30 });
    assert.deepEqual(progress.summary.calculationStates, { notEstablished: 30 });
});
