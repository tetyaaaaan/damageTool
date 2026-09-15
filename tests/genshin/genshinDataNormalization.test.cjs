const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinModifierAudit.cjs");

test("STEP 20 quarantines known legacy misclassifications behind structured records", () => {
    const audit = buildAudit();
    const superseded = audit.records.filter((record) => record.reasonCode === "SUPERSEDED_RECORD");
    assert.equal(superseded.length, 42);
    assert.equal(superseded.every((record) => record.supportStatus === "displayOnly"), true);
    const bellShield = audit.records.find((record) => record.id === "w_12402_extraDamage_4ff89bef");
    assert.equal(bellShield.category, "shieldGeneration");
    assert.equal(bellShield.reasonCode, "EXPLICIT_DISPLAY_ONLY");
});

test("STEP 20 keeps normalized records out of the P0 correction lane", () => {
    const audit = buildAudit();
    assert.equal(audit.records.filter((record) => record.priority === "P0").length, 0);
    assert.equal(audit.records.filter((record) => {
        return record.priority === "P0" && record.reasonCode === "CATEGORY_MISCLASSIFIED_OR_CUSTOM_FORMULA_REQUIRED";
    }).length, 0);
});
