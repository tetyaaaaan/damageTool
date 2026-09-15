"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceRoot = path.join(transitionRoot, "sources", "genshin-db", "8b15995fa220c88a4d0d7ffe1e21b041d0b32588");
const outputPath = path.join(transitionRoot, "target-dataset-evidence.json");
const revision = "8b15995fa220c88a4d0d7ffe1e21b041d0b32588";
const inputs = {
    packageManifest: {
        file: "package.json",
        url: `https://raw.githubusercontent.com/theBowja/genshin-db/${revision}/package.json`,
        bytes: 1619,
        sha256: "3faf0b2220539a07af9260f5dd83afd0e964aa42868c9b3b73c6cb14065085c6"
    },
    weapon12516: {
        file: "ateaspoonoftranscendence.json",
        url: `https://raw.githubusercontent.com/theBowja/genshin-db/${revision}/src/data/English/weapons/ateaspoonoftranscendence.json`,
        bytes: 10008,
        sha256: "2d21a853656412365d097577df24dbc13641003cd0f1da8d77f04229d6795ae3"
    }
};

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function verifyBytes(name, bytes) {
    const expected = inputs[name];
    if (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256) {
        throw new Error(`${name} raw artifact digest/length mismatch`);
    }
}

async function acquire() {
    fs.mkdirSync(sourceRoot, { recursive: true });
    for (const [name, input] of Object.entries(inputs)) {
        const response = await fetch(input.url);
        if (!response.ok) throw new Error(`${name} fetch failed: ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        verifyBytes(name, bytes);
        fs.writeFileSync(path.join(sourceRoot, input.file), bytes);
    }
}

function percentage(value) {
    const match = String(value || "").match(/^(\d+(?:\.\d+)?)%$/);
    if (!match) throw new Error(`percentage parse failed: ${value}`);
    return Number(match[1]) / 100;
}

function numericMatch(text, expression, field) {
    const match = text.match(expression);
    if (!match) throw new Error(`${field} parse failed`);
    return Number(match[1]);
}

function buildEvidence() {
    const manifestBytes = fs.readFileSync(path.join(sourceRoot, inputs.packageManifest.file));
    const weaponBytes = fs.readFileSync(path.join(sourceRoot, inputs.weapon12516.file));
    verifyBytes("packageManifest", manifestBytes);
    verifyBytes("weapon12516", weaponBytes);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const weapon = JSON.parse(weaponBytes.toString("utf8"));
    const affectedSnapshotPath = path.join(transitionRoot, "affected-entity-snapshot.json");
    const affectedSnapshot = JSON.parse(fs.readFileSync(affectedSnapshotPath, "utf8"));
    if (affectedSnapshot?.kind !== "genshinVersionTransitionAffectedEntitySnapshot"
        || affectedSnapshot?.fieldDigest !== digestStable(affectedSnapshot?.claim)
        || affectedSnapshot?.claim?.coverage?.officialAffectedEntityCoverage !== "complete"
        || affectedSnapshot?.gateEligibility?.canSatisfyCompleteEntityDiff !== false) {
        throw new Error("affected entity snapshot invalid");
    }
    if (!String(manifest.description).includes("Genshin Impact v7.0 JSON data")) throw new Error("strict gameVersion binding missing");
    if (!String(manifest.description).includes("fandom wiki and GenshinData repo")) throw new Error("lineage disclosure missing");
    if (String(weapon.id) !== "12516") throw new Error("weapon identity mismatch");
    const refinements = [weapon.r1, weapon.r2, weapon.r3, weapon.r4, weapon.r5].map((record, index) => {
        const description = String(record?.description || "");
        if (!description.includes("Stellar-Conduct and Stellar Swirl")) throw new Error(`R${index + 1} target scope mismatch`);
        return {
            refinement: index + 1,
            attackBonus: percentage(record.values?.[0]),
            reactionDamageBonus: percentage(record.values?.[1]),
            durationSeconds: numericMatch(description, /for (\d+(?:\.\d+)?)s/, "duration"),
            stackIntervalSeconds: numericMatch(description, /every (\d+(?:\.\d+)?)s/, "stack interval"),
            maxStacks: numericMatch(description, /max (\d+) stacks/, "max stacks")
        };
    });
    const claim = {
        transitionId: "genshin:6.7->7.0",
        gameVersion: "7.0",
        provider: "genshin-db",
        sourceFamily: "GenshinData-derived",
        revision,
        versionBinding: {
            status: "strictlyBound",
            evidenceArtifact: "package.json",
            evidenceDigest: inputs.packageManifest.sha256,
            providerOwnedStatement: manifest.description
        },
        lineage: {
            status: "correlated",
            disclosedRoots: ["Fandom", "GenshinData"],
            providerOwnedStatement: manifest.description
        },
        materializedArtifacts: Object.fromEntries(Object.entries(inputs).map(([name, input]) => [name, {
            path: path.relative(repositoryRoot, path.join(sourceRoot, input.file)).replaceAll("\\", "/"),
            url: input.url,
            rawArtifactDigest: input.sha256,
            rawArtifactBytes: input.bytes
        }])),
        candidateClaims: [{
            candidateId: "w_12516_reaction_bonus_2",
            entityId: "12516",
            fields: {
                targets: ["stellarConduct", "stellarSwirl"],
                refinements
            },
            fieldDigest: digestStable({ targets: ["stellarConduct", "stellarSwirl"], refinements })
        }],
        affectedEntitySnapshot: {
            path: path.relative(repositoryRoot, affectedSnapshotPath).replaceAll("\\", "/"),
            fieldDigest: affectedSnapshot.fieldDigest,
            entityCount: affectedSnapshot.summary.entities,
            recordCount: affectedSnapshot.summary.records,
            changedRecordCount: affectedSnapshot.summary.changedRecords,
            interpretation: "Identical provider display records do not prove unchanged runtime mechanics when official notices report behavior fixes."
        },
        coverage: {
            providerRevisionAvailable: true,
            repositoryCandidateCoverage: "partial",
            materializedCandidateCount: 55,
            fieldComparableCandidateCount: 1,
            affectedEntityRawRecordCoverage: "complete",
            mechanicDiffCoverage: "missing",
            totalRepositoryCandidateCount: 2268,
            canSatisfyStrictTargetDataset: false,
            canSatisfyCompleteEntityDiff: false
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinVersionTransitionTargetDatasetEvidence",
        generatedAt: "2026-08-25T00:00:00.000Z",
        status: "partialProviderSnapshot",
        claim,
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim)
    };
}

function writeEvidence() {
    const evidence = buildEvidence();
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return evidence;
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    process.stdout.write(`${JSON.stringify(writeEvidence(), null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = { acquire, buildEvidence, inputs, outputPath, revision, sourceRoot, writeEvidence };
