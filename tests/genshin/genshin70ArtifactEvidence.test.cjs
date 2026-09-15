"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const sourceRoot = path.join(root, "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources");
const review = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/reviews/artifact-15047-15048-7.0-evidence.json"), "utf8"));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
        : value;
const fieldDigest = (value) => sha256(JSON.stringify(stable(value)));
const gitBlobSha = (bytes) => crypto.createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");

test("7.0 artifact raw bytes, revision and candidate claim digests are recomputed", () => {
    const dbRoot = path.join(sourceRoot, "genshin-db-artifacts-15047-15048");
    const manifestBytes = fs.readFileSync(path.join(dbRoot, "capture-manifest.json"));
    const manifest = JSON.parse(manifestBytes);
    assert.equal(sha256(manifestBytes), review.sources[1].rawSha256);
    assert.equal(manifest.revision, review.sources[1].revision);
    const packageBytes = fs.readFileSync(path.join(dbRoot, manifest.packageManifest.rawPath));
    assert.equal(sha256(packageBytes), manifest.packageManifest.sha256);
    assert.equal(gitBlobSha(packageBytes), manifest.packageManifest.gitBlobSha);
    assert.match(JSON.parse(packageBytes).description, /Genshin Impact v7\.0/);
    for (const record of manifest.records) {
        const bytes = fs.readFileSync(path.join(dbRoot, record.rawPath));
        const raw = JSON.parse(bytes);
        assert.equal(sha256(bytes), record.sha256);
        assert.equal(gitBlobSha(bytes), record.gitBlobSha);
        assert.equal(raw.id, Number(record.candidateSetId));
        assert.equal(raw.name, record.name);
        assert.equal(raw.effect2Pc, record.fields.effect2Pc);
        assert.equal(raw.effect4Pc, record.fields.effect4Pc);
    }
    for (const claim of review.claims) assert.equal(fieldDigest(claim.normalizedFields), claim.fieldDigest);
});

test("official Version 7.0 post contains both exact set descriptions while strict remains fail-closed", () => {
    const officialBytes = fs.readFileSync(path.join(root, review.sources[0].path));
    const official = JSON.parse(officialBytes);
    const content = official.data.post.post.content;
    assert.equal(sha256(officialBytes), review.sources[0].rawSha256);
    assert.match(official.data.post.post.subject, /Version 7\.0 Update Details/);
    for (const phrase of [
        "Scarlet Proof", "ATK +18%", "CRIT Rate by 16%", "Stellar Swirl reaction dealt by 40%", "for 10s",
        "Heart of the Furnace", "ATK by 12% for 12s", "all nearby party members by 50%", "does not stack"
    ]) assert.ok(content.includes(phrase), phrase);
    assert.equal(review.sourceFamiliesDistinct, true);
    assert.equal(review.gate.fieldAgreement, "exactForAllMaterializedClaims");
    assert.equal(review.gate.strictEligibleCount, 0);
    assert.equal(review.gate.certificateEligibleCount, 0);
    assert.deepEqual(review.gate.blockedReasons, [
        "officialProviderRevisionNotImmutable",
        "officialFieldDigestNotBoundToProviderRevision"
    ]);
    assert.equal(review.safety.stellarSwirlFormulaInferred, false);
});
