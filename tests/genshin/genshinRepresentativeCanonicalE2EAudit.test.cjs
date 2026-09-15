"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const audit = require("../../scripts/genshinRepresentativeCanonicalE2EAudit.cjs");

test("representative canonical E2E audit is reproducible and materialized", () => {
    const actual = audit.buildAudit();
    assert.equal(actual.status, "passed", actual.errors.join("\n"));
    assert.equal(actual.routeEstablished, true);
    assert.equal(actual.trace.rawSource.length, 2);
    assert.equal(actual.trace.structuredSpec.canonicalEligibility, true);
    assert.equal(actual.trace.canonicalRuntime.productionLoader.applied, 0);
    assert.equal(actual.trace.canonicalRuntime.productionLoader.inactivePendingRevalidation, 2);
    assert.equal(actual.trace.canonicalRuntime.legacyRetainedInProduction, true);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.trace.canonicalRuntime.loader)), { offered: 2, applied: 2, rejected: 0, superseded: 1 });
    assert.equal(actual.trace.ui.conditionTogglePresent, false);
    assert.equal(actual.trace.calculation.doubleApplied, false);
    assert.equal(JSON.stringify(JSON.parse(fs.readFileSync(audit.jsonPath, "utf8"))), JSON.stringify(actual));
});
