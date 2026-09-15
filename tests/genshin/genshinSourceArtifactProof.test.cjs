"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const proof = require(path.join(root, "scripts", "genshinSourceArtifactProof.cjs"));
const catalog = JSON.parse(fs.readFileSync(path.join(root, "games/genshin/data/v2/source-catalog.json"), "utf8"));
const source = { id: "genshinDb", ...catalog.sources.genshinDb };

const rawPath = path.join(
    root,
    "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db",
    source.revision,
    "English/weapons/coolsteel.json"
);
const rawBytes = fs.readFileSync(rawPath);
const rawDigest = crypto.createHash("sha256").update(rawBytes).digest("hex");

function copy(value) {
    return JSON.parse(JSON.stringify(value));
}

test("replays saved manifest and entity bytes, Git blob identity, and JSON-pointer field", () => {
    const record = {
        source: "genshinDb",
        path: "src/data/English/weapons/coolsteel.json",
        sha256: rawDigest,
        gameVersion: "6.7",
        field: "weaponName",
        fieldPointer: "/name"
    };
    const result = proof.verifySourceArtifactProof(source, record);
    assert.equal(result.rawArtifactVerified, true);
    assert.equal(result.revisionVerified, true);
    assert.equal(result.versionManifestVerified, true);
    assert.equal(result.fieldProofVerified, true);
    assert.equal(result.artifactProof.rawVerified, true);
    assert.equal(result.artifactProof.revisionVerified, true);
    assert.equal(result.artifactProof.field.value, "Cool Steel");
    assert.match(result.artifactProof.field.digest, /^[a-f0-9]{64}$/);
    assert.equal(result.evidence.rawArtifact.gitBlobShaMatch, true);
    assert.equal(result.evidence.versionManifest.explicitGameVersion, "6.7");
});

test("recordSnapshot is entity-only and cannot become field proof from legacy human metadata", () => {
    const record = {
        ...catalog.records["genshinDb:weapon:11503"],
        reviewedBy: "legacy-reviewer",
        reviewedAt: "2026-08-20T00:00:00Z"
    };
    const result = proof.verifySourceArtifactProof(source, record);
    assert.equal(result.fieldProofVerified, false);
    assert.equal(result.artifactProof.field.verified, false);
    assert.equal(result.artifactProof.field.value, null);
    assert.ok(result.reasons.includes("field:entitySnapshotOnly"));
    assert.ok(result.reasons.includes("rawArtifact:missing"));
});

test("missing raw lookup, tampered digest, and stale version all fail closed", () => {
    const missing = proof.verifySourceArtifactProof(source, {
        path: "src/data/English/weapons/not-saved.json",
        sha256: "a".repeat(64),
        fieldPointer: "/name",
        gameVersion: "6.7"
    });
    assert.equal(missing.rawArtifactVerified, false);
    assert.equal(missing.revisionVerified, false);
    assert.equal(missing.fieldProofVerified, false);
    assert.ok(missing.reasons.includes("rawArtifact:missing"));

    const tamperedSource = copy(source);
    tamperedSource.gameVersionEvidence.integrity.digest = "b".repeat(64);
    const tampered = proof.verifySourceArtifactProof(tamperedSource);
    assert.equal(tampered.versionManifestVerified, false);
    assert.ok(tampered.reasons.includes("versionManifest:digest:mismatch"));

    const staleSource = copy(source);
    staleSource.gameVersion = "7.0";
    const stale = proof.verifySourceArtifactProof(staleSource);
    assert.equal(stale.versionManifestVerified, false);
    assert.ok(stale.reasons.includes("versionManifest:declaredVersion:mismatch"));
    assert.ok(stale.reasons.includes("versionManifest:explicitVersion:mismatch"));
});

test("does not treat another repository or package semver as a Genshin version proof", () => {
    const wrongRepository = copy(source);
    wrongRepository.repository = "https://github.com/another-owner/genshin-db";
    const repositoryResult = proof.verifySourceArtifactProof(wrongRepository);
    assert.equal(repositoryResult.versionManifestVerified, false);
    assert.ok(repositoryResult.reasons.includes("versionManifest:url:repositoryMismatch"));

    const packageSemver = copy(source);
    packageSemver.gameVersion = "5.2.12";
    packageSemver.gameVersionEvidence.gameVersion = "5.2.12";
    packageSemver.gameVersionEvidence.locator.field = "version";
    delete packageSemver.gameVersionEvidence.explicitText;
    const semverResult = proof.verifySourceArtifactProof(packageSemver);
    assert.equal(semverResult.versionManifestVerified, false);
    assert.equal(semverResult.evidence.versionManifest.versionFieldIsExplicitGameVersion, false);
    assert.ok(semverResult.reasons.includes("versionManifest:explicitVersion:mismatch"));
    assert.equal(semverResult.reasons.includes("versionManifest:explicitText:mismatch"), false);
});

test("contradictory saved snapshot identities fail closed instead of selecting the first", () => {
    const record = {
        path: "src/data/English/weapons/coolsteel.json",
        sha256: rawDigest,
        fieldPointer: "/name",
        gameVersion: "6.7"
    };
    const snapshotPath = path.join(
        root,
        "games/genshin/data/v2/version-transitions/6.7-to-7.0/weapon-entity-snapshot.json"
    );
    const identityPath = path.relative(root, rawPath).replaceAll(path.sep, "/");
    const actualGitBlobSha = crypto.createHash("sha1")
        .update(Buffer.concat([Buffer.from(`blob ${rawBytes.length}\0`), rawBytes]))
        .digest("hex");
    const originalReadFileSync = fs.readFileSync;
    fs.readFileSync = function readFileSyncWithConflictingSnapshot(file, ...args) {
        if (path.resolve(String(file)) === snapshotPath) {
            return JSON.stringify({
                records: [
                    { path: identityPath, revision: source.revision, gitBlobSha: actualGitBlobSha },
                    { path: identityPath, revision: source.revision, gitBlobSha: "b".repeat(40) }
                ]
            });
        }
        return originalReadFileSync.call(this, file, ...args);
    };
    try {
        const ambiguous = proof.verifySourceArtifactProof(source, record, { repositoryRoot: root });
        assert.equal(ambiguous.rawArtifactVerified, true);
        assert.equal(ambiguous.revisionVerified, false);
        assert.equal(ambiguous.fieldProofVerified, false);
        assert.equal(ambiguous.evidence.rawArtifact.identity.ambiguous, true);
        assert.equal(ambiguous.evidence.rawArtifact.identity.candidates.length, 2);
        assert.ok(ambiguous.reasons.includes("rawArtifact:revision:identityAmbiguous"));
    } finally {
        fs.readFileSync = originalReadFileSync;
    }
});

test("missing JSON pointer with an expected value is a closed result, not a throw", () => {
    const result = proof.verifySourceArtifactProof(source, {
        path: "src/data/English/weapons/coolsteel.json",
        sha256: rawDigest,
        fieldPointer: "/not-present",
        expectedValue: { value: 1 },
        gameVersion: "6.7"
    });
    assert.equal(result.rawArtifactVerified, true);
    assert.equal(result.revisionVerified, true);
    assert.equal(result.fieldProofVerified, false);
    assert.ok(result.reasons.includes("field:jsonPointer:missing"));
    assert.match(result.fieldDigest, /^[a-f0-9]{64}$/);
});
