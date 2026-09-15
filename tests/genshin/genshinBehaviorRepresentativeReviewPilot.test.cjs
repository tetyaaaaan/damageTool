"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const pilotModule = require(path.join(root, "scripts", "genshinBehaviorRepresentativeReviewPilot.cjs"));

function loadCalcDataContract() {
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(root, "games", "js", "genshinCalcData.js"), "utf8"), sandbox);
    return sandbox.window.GenshinCalcData;
}

test("Xiao C1 BehaviorModifier packet reaches human review without opening canonical", () => {
    const pilot = pilotModule.buildPilot();
    const audit = pilotModule.auditPilot(pilot);
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.equal(pilot.assessment.machineEvidenceReady, true);
    assert.equal(pilot.assessment.state, "humanReviewReady");
    assert.equal(pilot.assessment.canonicalEligibility, false);
    assert.equal(pilot.assessment.productionCanonical, false);
    assert.equal(pilot.reviewPacket.verification.reviewedBy, null);
});

test("both independent providers strictly bind the matching Xiao claims to 6.7", () => {
    const pilot = pilotModule.buildPilot();
    assert.equal(pilot.sourceRecords.gachabase.gameVersion, "6.7");
    assert.equal(pilot.sourceRecords.gachabase.strictGameVersionBinding, true);
    assert.match(pilot.sourceRecords.gachabase.gameVersionEvidence.versionDeltaLocator, /release_6\.7\.0_45767575/);
    assert.equal(pilot.sourceRecords.genshinDbTalent.gameVersion, "6.7");
    assert.equal(pilot.sourceRecords.genshinDbTalent.strictGameVersionBinding, true);
    assert.equal(pilot.sourceRecords.genshinDbConstellation.strictGameVersionBinding, true);
    assert.notEqual(pilot.sourceRecords.gachabase.independenceGroup, pilot.sourceRecords.genshinDbTalent.independenceGroup);
    assert.ok(pilot.reviewPacket.fieldComparison.every((row) => row.status === "match"));
});

test("the common BehaviorModifier route resolves Xiao charges from 2 to 3 at C1", () => {
    const contract = loadCalcDataContract();
    const pilot = pilotModule.buildPilot();
    const modifier = pilot.runtimeCandidate;
    const data = {
        behaviorSpecs: { [modifier.targetSpecId]: pilot.targetBehaviorSpec },
        behaviorModifiers: { "10000026": { modifiers: [modifier] } }
    };
    const c0 = contract.resolveBehaviorModifiers(data, { characterId: "10000026", constellation: 0 });
    const c1 = contract.resolveBehaviorModifiers(data, { characterId: "10000026", constellation: 1 });
    assert.equal(c0.appliedCount, 0);
    assert.equal(c1.appliedCount, 1);
    assert.equal(c1.applied[0].targetSpecId, "behavior:10000026:talent:skill");
    assert.equal(c1.applied[0].path, "/execution/charges");
    assert.equal(c1.applied[0].result.mode, "delta");
    assert.equal(c1.applied[0].result.baseValue, 2);
    assert.equal(c1.applied[0].result.delta, 1);
    assert.equal(c1.applied[0].result.resolvedValue, 3);
});

test("Calculation and UI expose the generic behavior result without a Xiao special case", () => {
    const engine = fs.readFileSync(path.join(root, "games", "js", "genshinCalcEngine.js"), "utf8");
    const renderer = fs.readFileSync(path.join(root, "games", "js", "genshinCalcRenderer.js"), "utf8");
    assert.match(engine, /resolveBehaviorModifiers\(calcData, context\)/);
    assert.match(renderer, /renderBehaviorResolution\(payload\.behaviorResolution\)/);
    assert.match(renderer, /"\/execution\/charges": "使用可能回数"/);
    assert.doesNotMatch(engine, /10000026:C1/);
    assert.doesNotMatch(renderer, /10000026:C1|魈|風輪両立/);
});

test("candidate comparison selects Xiao and preserves the exhausted Amos blocker", () => {
    const comparison = pilotModule.buildPilot().candidateComparison;
    assert.equal(comparison[0].candidate, "魈 C1");
    assert.equal(comparison[0].status, "selected");
    const amos = comparison.find((row) => row.candidate.includes("Amos"));
    assert.equal(amos.status, "blocked");
    assert.match(amos.remainingBeforeReview, /strict-version second source/);
});
