const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAudit, renderMarkdown } = require("../../scripts/genshinModifierAudit.cjs");

test("STEP 19 audit classifies every modifier with a stable reason code", () => {
    const audit = buildAudit();
    assert.equal(audit.summary.total, 1560);
    assert.equal(audit.records.filter((record) => {
        return ["unsupported", "invalidData", "missingInput", "displayOnly"].includes(record.supportStatus)
            && !record.reasonCode;
    }).length, 0);
    assert.equal(audit.records.filter((record) => record.lane === "review").length, 0);
});

test("STEP 19 audit output is deterministic and separates input/display records", () => {
    const first = buildAudit();
    const second = buildAudit();
    assert.deepEqual(first, second);
    assert.ok(first.summary.byLane.input > 0);
    assert.equal(first.summary.byReasonCode.DISPLAY_ONLY_SOURCE_TEXT, 22);
    assert.match(renderMarkdown(first), /原神補正監査レポート/);
});

test("committed audit report matches the current modifier data", () => {
    const committed = require("../../reports/genshin-modifier-audit.json");
    assert.deepEqual(buildAudit().summary, committed.summary);
});
