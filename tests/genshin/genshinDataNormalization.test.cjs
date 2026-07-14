const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit } = require("../../scripts/genshinModifierAudit.cjs");

test("STEP 20 quarantines known legacy misclassifications behind structured records", () => {
    const audit = buildAudit();
    const superseded = audit.records.filter((record) => record.reasonCode === "SUPERSEDED_RECORD");
    assert.equal(superseded.length, 20);
    assert.equal(superseded.every((record) => record.supportStatus === "displayOnly"), true);
    assert.equal(audit.records.find((record) => record.id === "w_12402_extraDamage_4ff89bef").reasonCode, "DISPLAY_ONLY_MISCLASSIFICATION");
});

test("STEP 20 keeps normalized records out of the P0 correction lane", () => {
    const audit = buildAudit();
    assert.equal(audit.records.filter((record) => record.priority === "P0").length, 0);
    assert.equal(audit.records.filter((record) => {
        return record.priority === "P0" && record.reasonCode === "CATEGORY_MISCLASSIFIED_OR_CUSTOM_FORMULA_REQUIRED";
    }).length, 0);
});
