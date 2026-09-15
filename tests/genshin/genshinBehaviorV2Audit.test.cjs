const assert = require("node:assert/strict");
const test = require("node:test");
const { auditGenshinBehaviorV2 } = require("../../scripts/genshinBehaviorV2Audit.cjs");

test("behavior v2 audit resolves all source and target references", () => {
    const result = auditGenshinBehaviorV2();
    assert.equal(result.status, "passed", result.errors.join("\n"));
    assert.equal(result.summary.pilotCharacters, 8);
    assert.equal(result.summary.references.resolved, true);
    assert.equal(result.summary.references.missingSourceRefs, 0);
    assert.equal(result.summary.references.missingTargetSpecs, 0);
    assert.equal(result.summary.references.byCharacter.characters, 8);
    assert.equal(result.summary.references.byCharacter.malformed, 0);
    assert.equal(result.summary.contract.forbiddenMeasurements, 0);
    assert.equal(result.summary.contract.nonExplicitMeasurements, 0);
    assert.equal(result.summary.verificationByStatus.needsReview, result.summary.specs);
});
