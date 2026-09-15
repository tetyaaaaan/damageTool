"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const auditor = require(path.join(root, "scripts", "genshinV2DualSourceAudit.cjs"));

test("dual-source audit covers all weapon and artifact migration candidates", () => {
    const audit = auditor.buildAudit();
    assert.equal(audit.status, "passed", audit.errors.join("\n"));
    assert.deepEqual(audit.summary.candidates, { weapons: 455, artifacts: 122, total: 577 });
    assert.deepEqual(audit.summary.claims, { weapons: 9560, artifacts: 2562, total: 12122 });
    assert.equal(audit.summary.dualSourceEligibleClaims, 5);
    assert.equal(audit.summary.dualSourceEligibleCandidates, 1);
    assert.equal(audit.summary.conflictClaims, 0);
    assert.equal(audit.summary.singleSourceClaims, 21);
    assert.equal(audit.summary.canonicalEligibility, 1);
    assert.equal(audit.sourceCatalog.gcsimMatchedWeaponIds.length, 9);
    assert.equal(audit.sourceCatalog.genshinDbMatchedWeaponIds.length, 9);
    assert.equal(audit.summary.strictVersionedSnapshotClaims, 651);
    assert.equal(audit.summary.strictVersionedSnapshotCandidates, 9);
    assert.equal(audit.summary.strictSnapshotClaimValuesPublished, 0);
    assert.equal(audit.sourceCatalog.gcsimArtifactRecordCount, 0);
    assert.equal(audit.sourceCatalog.goEvidence.found, false);
});

test("all claim pointers resolve and entity-level gcsim pins are not treated as field values", () => {
    const audit = auditor.buildAudit();
    audit.claims.forEach((claim) => {
        assert.equal(claim.canonicalEligibility, claim.candidateId === "w_12516_stat_1", claim.id);
        assert.ok(claim.sourceRefs.length > 0, claim.id);
        claim.sourceRefs.forEach((sourceRef) => assert.ok(claim.evidence.some((evidence) => evidence.sourceRef === sourceRef), `${claim.id}: ${sourceRef}`));
        const pins = claim.evidence.filter((evidence) => evidence.scope === "entity");
        pins.forEach((pin) => {
            assert.equal(pin.claimSupport, "pinnedEntityFileOnly");
            assert.equal(pin.supportsClaimValue, false);
            assert.equal(pin.versioned, false);
            assert.equal(pin.gameVersionVerified, false);
            assert.equal(pin.revisionPinned, true);
            assert.match(pin.revision, /^[a-f0-9]{40}$/);
            assert.match(pin.integrity.digest, /^[a-f0-9]{64}$/);
        });
    });
    const pinnedClaims = audit.claims.filter((claim) => claim.classificationFlags.includes("independent-provider-pinned-reference"));
    assert.equal(pinnedClaims.length, 651);
    assert.ok(pinnedClaims.every((claim) => claim.classification === "missing-version"));
    const snapshotClaims = audit.claims.filter((claim) => claim.classificationFlags.includes("strict-versioned-provider-snapshot"));
    assert.equal(snapshotClaims.length, 651);
    assert.ok(snapshotClaims.every((claim) => claim.evidence.some((item) => item.claimSupport === "strictVersionedRecordSnapshotOnly" && item.gameVersion === "6.7" && item.supportsClaimValue === false)));
});

test("classification gate requires two versioned field providers and detects conflicts", () => {
    const base = (group, digest, versioned = true) => ({
        sourceRef: `${group}:${digest}`,
        scope: "field",
        provider: group,
        independenceGroup: group,
        versioned,
        supportsClaimValue: true,
        valueDigest: digest
    });
    assert.equal(auditor.classifyClaim([base("local", "same"), base("local", "same")]).classification, "same-provider duplicate");
    assert.equal(auditor.classifyClaim([base("local", "same"), base("gcsim", "same")]).classification, "dual-source eligible");
    assert.equal(auditor.classifyClaim([base("local", "one"), base("gcsim", "two")], { conflict: true }).classification, "conflict");
    const missing = auditor.classifyClaim([base("local", "same", false), base("gcsim", "same", true)]);
    assert.equal(missing.classification, "missing-version");
    assert.ok(missing.flags.includes("missing-version"));
});

test("report files are deterministic and never promote canonical candidates", () => {
    const first = auditor.buildAudit();
    const second = auditor.buildAudit();
    assert.equal(auditor.stableJson(first), auditor.stableJson(second));
    const jsonPath = path.join(root, "reports", "genshin-v2-dual-source-audit.json");
    const markdownPath = path.join(root, "reports", "genshin-v2-dual-source-audit.md");
    assert.equal(fs.existsSync(jsonPath), true);
    assert.equal(fs.existsSync(markdownPath), true);
    const materialized = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    assert.equal(materialized.status, "passed");
    assert.equal(materialized.summary.canonicalEligibility, 1);
    assert.match(fs.readFileSync(markdownPath, "utf8"), /dual-source eligible/);
});
