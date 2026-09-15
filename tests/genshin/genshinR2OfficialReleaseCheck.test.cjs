"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const check = require(path.resolve(__dirname, "../../scripts/genshinR2OfficialReleaseCheck.cjs"));
const receipt = JSON.parse(fs.readFileSync(check.receiptPath, "utf8"));
const raw = fs.readFileSync(check.rawPath);
const head = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../games/genshin/data/v2/upstream-version-head.json"), "utf8"));

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("bounded official release receipt retains exact response and records the digest discrepancy", () => {
    assert.equal(receipt.kind, "genshinR2OfficialReleaseCheckReceipt");
    assert.equal(receipt.status, "capturedIdentityValidatedWithDigestDiscrepancy");
    assert.equal(receipt.sourceUrl, check.sourceUrl);
    assert.equal(receipt.response.status, 200);
    assert.equal(receipt.response.bytes, raw.length);
    assert.equal(receipt.response.sha256, sha256(raw));
    assert.equal(receipt.rawArtifact.encoding, "exact-response-bytes");
    assert.equal(receipt.rawArtifact.status, "retainedWithoutNormalization");
    assert.equal(receipt.comparisonToRecordedHead.bytesMatch, true);
    assert.equal(receipt.comparisonToRecordedHead.digestMatch, false);
    assert.equal(receipt.comparisonToRecordedHead.expectedSha256, head.evidence.rawApiResponseDigest);
    assert.equal(receipt.comparisonToRecordedHead.status, "discrepancyRecordedSeparately");
});

test("identity checks bind the post, official publisher, game, explicit version, and release roster", () => {
    assert.equal(receipt.identity.valid, true, JSON.stringify(receipt.identity));
    assert.equal(receipt.identity.postId, "46233468");
    assert.deepEqual(receipt.identity.publisher, {
        nickname: "Genshin Impact Official",
        uid: "1015537",
        certificationType: 1,
        certificationDescription: "Official Big Boss",
        gameName: "Genshin Impact"
    });
    assert.equal(receipt.identity.subject, '"Everwinter Without Mercy" Version 7.0 Update Details');
    assert.equal(receipt.roster.status, "explicitReleaseSectionRoster");
    assert.equal(receipt.roster.sectionHeading, "II. New Characters");
    assert.deepEqual(receipt.roster.records.map((record) => ({ name: record.name, element: record.element, rarityStars: record.rarityStars, identityStatus: record.identityStatus })), [
        { name: "Odette", element: "Cryo", rarityStars: 5, identityStatus: "nameOnlyNoLocalEntityId" },
        { name: "Traveler", element: "Cryo", rarityStars: 5, identityStatus: "nameOnlyNoLocalEntityId" },
        { name: "Alyosha", element: "Electro", rarityStars: 4, identityStatus: "nameOnlyNoLocalEntityId" }
    ]);
});

test("the existing raw response can be re-inspected without network access", () => {
    const inspection = check.inspectResponse(raw, receipt.response.status, { get: () => receipt.response.contentType }, head);
    assert.equal(inspection.identity.valid, true, JSON.stringify(inspection.identity));
    assert.equal(inspection.response.sha256, receipt.response.sha256);
    assert.deepEqual(inspection.roster, receipt.roster);
    assert.equal(fs.existsSync(check.reportPath), true);
    assert.match(fs.readFileSync(check.reportPath, "utf8"), /discrepancyRecordedSeparately/);
});
