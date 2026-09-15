"use strict";

// Reconcile only the dispositions invalidated by the current repository.  This
// is a bounded registry maintenance step, not a verification or promotion
// operation: transition waits with concrete work are removed, a superseded
// completed legacy record and exact fail-closed display-only corrections are removed,
// and the 30 weapon waits are re-materialized
// from the current candidate/legacy bytes before their refs are re-pinned.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const work = require("./genshinWorkDisposition.cjs");
const terminal = require("./genshinTerminalStateAudit.cjs");
const weaponAudit = require("./genshinR2WeaponDeferralAudit.cjs");
const artifactAudit = require("./genshinR2ArtifactDeferralAudit.cjs");

const ROOT = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(ROOT, "games/genshin/data/v2/r2-work-dispositions.json");
const AUDIT_PATH = path.join(ROOT, "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json");
const ARTIFACT_AUDIT_PATH = path.join(ROOT, "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json");
const TARGET_VERSION = "7.0";
const TRANSITION_PREFIX = "r2-transition-deferral:";
const SUPERSEDED_ID = "r2-weapon-primary-shard01-deferral:w_11301_damageBonus_91cc873a";
const PRODUCT_SUPERSEDED_IDS = new Set([
    "w_13516_reactionBonus_d4e397ce",
    "w_15424_damageBonus_05580649",
    "w_11432_critBonus_382b690c",
    "w_11519_reactionBonus_903ea413",
    "w_13513_reaction_bonus_2",
    "w_12514_damage_3",
    "w_13511_scaling_bonus_1",
    "w_13515_statBonus_c3ad91b6",
    "w_13515_reaction_bonus_2",
    "w_12418_statBonus_4abee3c5",
    "w_12418_statBonus_d123e765",
    "w_12512_reactionBonus_167ad0eb",
    "w_15507_damage_1",
    "w_14520_reactionBonus_51ed08f7",
    "w_14520_reactionBonus_86c966e8",
    "w_14520_reactionBonus_8f49bc48",
    "w_11516_damage_3",
    "w_11516_damageBonus_b78b7787",
    "w_11516_statBonus_097433f4",
    "w_12424_damageBonus_00cb7776",
    "w_12431_reactionBonus_22612d3e",
    "w_12431_v3_damageBonus_1",
    "w_14523_damage_2",
    "w_11418_stat_1",
    "w_13433_reactionBonus_acac6169",
    "w_14433_reactionBonus_fba9df82",
    "w_14431_damage_1",
    "w_14431_statBonus_9159f3ac",
    "w_12411_extraDamage_c558a23f",
    "w_13409_extraDamage_c9330e7b",
    "w_14412_extraDamage_db770126",
    "w_11304_statBonus_8009fd12",
    "w_14304_statBonus_76bc7350"
]);
const DISPLAY_ONLY_CANDIDATE_IDS = new Set([
    "w_14424_stat_1",
    "w_14424_stat_2",
    "w_11305_extraDamage_7347a245",
    "w_11405_damage_1",
    "w_11405_damageBonus_973138ba",
    "w_11425_statBonus_ff739aa5",
    "w_11428_extra_damage_1",
    "w_11428_extraDamage_ac4f2d59",
    "w_11501_extra_damage_2",
    "w_11502_extra_damage_2",
    "w_12302_damage_1",
    "w_12302_damageBonus_4bc56ade",
    "w_12305_extra_damage_1",
    "w_12405_damage_1",
    "w_12405_damageBonus_43450e5a",
    "w_12406_extra_damage_1",
    "w_12501_extra_damage_2",
    "w_12511_statBonus_686cb1e6",
    "w_13401_damage_1",
    "w_13401_damageBonus_57a5968c",
    "w_13403_extra_damage_1",
    "w_13405_stat_3",
    "w_13502_extra_damage_2",
    "w_13509_statBonus_a105dd86",
    "w_13516_reaction_bonus_2",
    "w_14301_damage_1",
    "w_14301_damageBonus_4b54fa3c",
    "w_14409_extra_damage_1",
    "w_14427_extraDamage_aafebcff",
    "w_14501_extra_damage_2",
    "w_15301_damage_1",
    "w_15301_damageBonus_518c221d",
    "w_15409_extra_damage_1",
    "w_15410_damage_1",
    "w_15417_extra_damage_2",
    "w_15418_extra_damage_1",
    "w_15424_damage_2",
    "w_15424_extra_damage_1",
    "w_15432_extraDamage_367a328c",
    "w_15513_crit_1",
    "w_12411_extra_damage_1",
    "w_12411_extra_damage_2",
    "w_13409_extra_damage_1",
    "w_13409_extra_damage_2",
    "w_14412_extra_damage_1",
    "w_14412_extra_damage_2"
]);
// These candidates previously had a G06 source deferral while their product
// route was display-only. A bounded product correction made the route
// interactive again; discard only the stale decision when its current task
// digest has changed and it now reports the expected condition input.
const RESTORED_CALCULATIVE_CANDIDATE_IDS = new Set([
    "w_13516_critBonus_0eecdab8",
    "w_13514_stat_2",
    "w_15514_statBonus_b409d658",
    "w_15503_stat_2",
    "w_15503_stat_3",
    "w_11516_damage_2",
    "w_12424_damage_2",
    "w_12424_stat_1",
    "w_11517_crit_2",
    "w_11517_damage_3"
]);
// These exact structured reaction records now have complete product routes.
// Their remaining work is source evidence only, so the older disposition,
// which was tied to the pre-fix task digest, must not remain registered.
const RESTORED_SOURCE_ONLY_CANDIDATE_IDS = new Set([
    "w_14520_reaction_bonus_3",
    "w_14520_reaction_bonus_4",
    "w_14520_reaction_bonus_5",
    "w_11424_damage_1"
]);
const NEWLY_RESOLVED_ARTIFACT_IDS = new Set([
    "artifact:15045:fourPiece:4pc_team_own_and_active_element_damage_bonus_magical_secret_rite",
    "artifact:15045:fourPiece:4pc_team_own_element_damage_bonus_after_skill"
]);
const SEVEN_ZERO_NEW_ARTIFACT_IDS = new Set([
    "artifact:15047:twoPiece:2pc_atk_percent",
    "artifact:15047:fourPiece:4pc_crit_rate_after_stellar_swirl",
    "artifact:15047:fourPiece:4pc_stellar_swirl_damage_bonus_after_stellar_swirl",
    "artifact:15048:twoPiece:2pc_atk_percent",
    "artifact:15048:fourPiece:4pc_atk_after_stellar_glimmer",
    "artifact:15048:fourPiece:4pc_team_stellar_glimmer_damage_bonus"
]);
const EXPECTED_TRANSITION_COUNT = 47;
const EXPECTED_WEAPON_COUNT = 30;
const EXPECTED_ARTIFACT_COUNT = 116;

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const readArtifact = (relativePath) => fs.readFileSync(path.resolve(ROOT, relativePath));
const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
        : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

function reconcile({ write = true, assessedAt = new Date().toISOString() } = {}) {
    const registry = readJson(REGISTRY_PATH);
    const auditBytes = fs.readFileSync(AUDIT_PATH);
    const auditSha = sha256(auditBytes);
    const audit = readJson(AUDIT_PATH);
    const artifactAuditBytes = fs.readFileSync(ARTIFACT_AUDIT_PATH);
    const artifactAuditSha = sha256(artifactAuditBytes);
    const persistedArtifactAudit = readJson(ARTIFACT_AUDIT_PATH);
    if (audit.status !== "draft" || audit.candidateCount !== EXPECTED_WEAPON_COUNT
        || audit.decisions.length !== EXPECTED_WEAPON_COUNT) {
        throw new Error("currentWeaponAuditScopeInvalid");
    }
    const weaponDecisions = new Map(audit.decisions.map((decision) => [decision.candidateId, decision]));
    if (weaponDecisions.size !== EXPECTED_WEAPON_COUNT) throw new Error("currentWeaponAuditCandidateSetInvalid");
    if (persistedArtifactAudit.status !== "draft"
        || persistedArtifactAudit.candidateCount !== EXPECTED_ARTIFACT_COUNT
        || persistedArtifactAudit.decisions.length !== EXPECTED_ARTIFACT_COUNT) {
        throw new Error("currentArtifactAuditScopeInvalid");
    }
    const artifactDecisions = new Map(persistedArtifactAudit.decisions.map((decision) => [decision.candidateId, decision]));
    if (artifactDecisions.size !== EXPECTED_ARTIFACT_COUNT) throw new Error("currentArtifactAuditCandidateSetInvalid");

    const staleTransitions = registry.decisions.filter((decision) => String(decision.id || "").startsWith(TRANSITION_PREFIX));
    if (staleTransitions.length !== 0 && staleTransitions.length !== EXPECTED_TRANSITION_COUNT) {
        throw new Error(`staleTransitionCount:${staleTransitions.length}`);
    }
    const supersededPresent = registry.decisions.some((decision) => decision.id === SUPERSEDED_ID);
    const displayOnlyDecisions = registry.decisions.filter((decision) =>
        DISPLAY_ONLY_CANDIDATE_IDS.has(decision.candidateId));
    const restoredCalculativeDecisions = registry.decisions.filter((decision) =>
        RESTORED_CALCULATIVE_CANDIDATE_IDS.has(decision.candidateId));
    const restoredSourceOnlyDecisions = registry.decisions.filter((decision) =>
        RESTORED_SOURCE_ONLY_CANDIDATE_IDS.has(decision.candidateId));
    if (!supersededPresent && staleTransitions.length !== 0) {
        throw new Error("supersededDecisionMissing");
    }

    // Rebuild the current task view once.  No terminal or queue files are
    // written; this only proves why the bounded stale classes are changing.
    const current = terminal.buildTerminalStateAudit();
    const tasks = new Map(current.taskQueue.tasks.map((task) => [task.candidateId, task]));
    const validationContext = {
        targetGameVersion: TARGET_VERSION,
        readArtifact
    };
    for (const decision of staleTransitions) {
        const task = tasks.get(decision.candidateId);
        if (!task) throw new Error(`transitionTaskMissing:${decision.candidateId}`);
        const result = work.validateDeferral(decision, task, validationContext);
        if (result.valid || !result.errors.length || result.errors.some((error) => error !== "concreteWorkStillPending")) {
            throw new Error(`transitionStaleClassChanged:${decision.candidateId}:${result.errors.join(",")}`);
        }
    }
    const superseded = registry.decisions.find((decision) => decision.id === SUPERSEDED_ID);
    const productSuperseded = registry.decisions.filter((decision) => PRODUCT_SUPERSEDED_IDS.has(decision.candidateId));
    for (const decision of productSuperseded) {
        const task = tasks.get(decision.candidateId);
        if (task?.task?.status !== "complete" || task.consumerStatus !== "supersededByStructuredRecord") {
            throw new Error(`productSupersededTaskClassChanged:${decision.candidateId}`);
        }
    }
    if (superseded) {
        const supersededTask = tasks.get(superseded.candidateId);
        if (!supersededTask || supersededTask.task?.status !== "complete"
            || supersededTask.consumerStatus !== "supersededByStructuredRecord") {
            throw new Error("supersededTaskClassChanged");
        }
    }
    for (const decision of displayOnlyDecisions) {
        const task = tasks.get(decision.candidateId);
        if (!task || task.primaryBlockReason !== "displayOnly"
            || !task.blockReasons?.includes("displayOnly")
            || !task.deferredLanes?.some((lane) => lane.kind === "consumer"
                && lane.blockingReasons?.includes("displayOnly"))) {
            throw new Error(`displayOnlyTaskClassChanged:${decision.candidateId}`);
        }
    }
    for (const decision of restoredCalculativeDecisions) {
        const task = tasks.get(decision.candidateId);
        if (!task || task.task?.status !== "reopenOnTrigger"
            || !task.blockReasons?.includes("inputMissing")
            || task.primaryBlockReason !== "inputMissing") {
            throw new Error(`restoredCalculativeTaskClassChanged:${decision.candidateId}`);
        }
    }
    for (const decision of restoredSourceOnlyDecisions) {
        const task = tasks.get(decision.candidateId);
        if (!task || task.task?.status !== "reopenOnTrigger"
            || task.primaryBlockReason !== "sourceMissing"
            || !task.blockReasons?.includes("sourceMissing")
            || task.deferredLanes?.length !== 0
            || task.consumerStatus !== "notApplicable") {
            throw new Error(`restoredSourceOnlyTaskClassChanged:${decision.candidateId}`);
        }
    }

    const currentWeaponAudit = weaponAudit.buildAudit();
    if (currentWeaponAudit.decisions.length !== EXPECTED_WEAPON_COUNT
        || currentWeaponAudit.exclusions.length !== 0) throw new Error("weaponReauditNotComplete");
    const existingByCandidate = new Map(registry.decisions.map((decision) => [decision.candidateId, decision]));
    const refreshedWeapons = [];
    for (const [candidateId, fresh] of weaponDecisions) {
        const existing = existingByCandidate.get(candidateId);
        const regenerated = currentWeaponAudit.decisions.find((decision) => decision.candidateId === candidateId);
        if (!existing || !regenerated || !same(fresh, regenerated)) throw new Error(`auditDecisionMismatch:${candidateId}`);
        const currentSafety = regenerated.safety.artifactRefs;
        const staleRefs = existing.safety?.artifactRefs || [];
        const hasSpecRef = staleRefs.some((ref) => ref.path === "games/genshin/data/v2/weapons/spec-candidates.json");
        const hasModifierRef = staleRefs.some((ref) => ref.path === "games/genshin/data/calc/weapon-modifiers.json");
        if (!hasSpecRef || !hasModifierRef) {
            throw new Error(`staleWeaponRefsMissing:${candidateId}`);
        }

        // Keep the prior Sol review timestamp/actor and assessment reason, but
        // take field findings/search/safety from the current re-audit so every
        // changed source byte is represented by its current digest.
        const refreshed = structuredClone(regenerated);
        refreshed.assessment = {
            ...refreshed.assessment,
            actorId: existing.assessment.actorId,
            assessedAt: existing.assessment.assessedAt,
            reason: existing.assessment.reason
        };
        if (!refreshed.search.artifactRefs.some((ref) =>
            ref.path === "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json" && ref.sha256 === auditSha)) {
            refreshed.search.artifactRefs.push({
                path: "games/genshin/data/v2/reviews/r2-weapon-deferral-audit.json", sha256: auditSha
            });
        }
        if (!same(refreshed.safety.artifactRefs, currentSafety)) {
            throw new Error(`currentSafetyRefsUnexpected:${candidateId}`);
        }
        refreshedWeapons.push(refreshed);
    }

    const currentArtifactAudit = artifactAudit.buildAudit();
    const expectedArtifactExclusionIds = new Set([
        ...(persistedArtifactAudit.exclusions || []).map((item) => item.candidateId),
        ...SEVEN_ZERO_NEW_ARTIFACT_IDS
    ]);
    const currentArtifactExclusionIds = new Set(
        (currentArtifactAudit.exclusions || []).map((item) => item.candidateId)
    );
    if (currentArtifactAudit.decisions.length !== EXPECTED_ARTIFACT_COUNT
        || currentArtifactExclusionIds.size !== expectedArtifactExclusionIds.size
        || [...expectedArtifactExclusionIds].some((candidateId) => !currentArtifactExclusionIds.has(candidateId))) {
        throw new Error("artifactReauditNotComplete");
    }
    const refreshedArtifacts = [];
    for (const [candidateId, fresh] of artifactDecisions) {
        const existing = existingByCandidate.get(candidateId);
        const regenerated = currentArtifactAudit.decisions.find((decision) => decision.candidateId === candidateId);
        if (!regenerated || !same(fresh, regenerated)
            || (!existing && !NEWLY_RESOLVED_ARTIFACT_IDS.has(candidateId))) {
            throw new Error(`artifactAuditDecisionMismatch:${candidateId}`);
        }
        const refreshed = structuredClone(regenerated);
        refreshed.assessment = {
            ...refreshed.assessment,
            actorId: "Sol",
            assessedAt: existing?.assessment?.assessedAt || assessedAt,
            reason: existing?.assessment?.reason
                || `Sol disposition review after the bounded artifact 15045 consumer fix: ${regenerated.assessment.reason} This closes bounded work, not verification.`
        };
        refreshed.search.artifactRefs.push({
            path: "games/genshin/data/v2/reviews/r2-artifact-deferral-audit.json",
            sha256: artifactAuditSha
        });
        refreshedArtifacts.push(refreshed);
    }

    const removedIds = new Set(staleTransitions.map((decision) => decision.id));
    removedIds.add(SUPERSEDED_ID);
    for (const decision of productSuperseded) removedIds.add(decision.id);
    for (const decision of displayOnlyDecisions) removedIds.add(decision.id);
    for (const decision of restoredCalculativeDecisions) removedIds.add(decision.id);
    for (const decision of restoredSourceOnlyDecisions) removedIds.add(decision.id);
    const weaponByCandidate = new Map(refreshedWeapons.map((decision) => [decision.candidateId, decision]));
    const artifactByCandidate = new Map(refreshedArtifacts.map((decision) => [decision.candidateId, decision]));
    const nextDecisions = registry.decisions
        .filter((decision) => !removedIds.has(decision.id)
            && !weaponByCandidate.has(decision.candidateId)
            && !artifactByCandidate.has(decision.candidateId))
        .concat(refreshedWeapons)
        .concat(refreshedArtifacts)
        .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    const next = { ...registry, decisions: nextDecisions };
    const progress = work.buildWorkProgress(current.taskQueue.tasks, next, validationContext);
    if (progress.errors.length) throw new Error(`reconciledRegistryInvalid:${progress.errors.join(";")}`);
    if (write) fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return {
        registry: next,
        removedTransitionCount: staleTransitions.length,
        removedSupersededCount: (superseded ? 1 : 0) + productSuperseded.length,
        removedDisplayOnlyCount: displayOnlyDecisions.length,
        refreshedWeaponCount: refreshedWeapons.length,
        refreshedArtifactCount: refreshedArtifacts.length,
        auditSha,
        artifactAuditSha,
        beforeDecisionCount: registry.decisions.length,
        afterDecisionCount: next.decisions.length,
        beforeWork: work.buildWorkProgress(current.taskQueue.tasks, registry, validationContext).summary,
        afterWork: progress.summary,
        errors: progress.errors
    };
}

if (require.main === module) {
    const result = reconcile();
    process.stdout.write(`${JSON.stringify({
        removedTransitionCount: result.removedTransitionCount,
        removedSupersededCount: result.removedSupersededCount,
        removedDisplayOnlyCount: result.removedDisplayOnlyCount,
        refreshedWeaponCount: result.refreshedWeaponCount,
        refreshedArtifactCount: result.refreshedArtifactCount,
        auditSha: result.auditSha,
        artifactAuditSha: result.artifactAuditSha,
        beforeDecisionCount: result.beforeDecisionCount,
        afterDecisionCount: result.afterDecisionCount,
        beforeWork: result.beforeWork,
        afterWork: result.afterWork
    }, null, 2)}\n`);
}

module.exports = { reconcile };
