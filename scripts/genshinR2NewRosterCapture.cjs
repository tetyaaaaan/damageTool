"use strict";

/**
 * Capture the six already-resolved Japanese talent/constellation artifacts for
 * the 7.0 roster additions.  This is deliberately a small source-evidence
 * adapter: it reuses the existing 7.0 package proof and saved non-recursive
 * Japanese tree response, fetches only the six explicitly selected raw blobs,
 * and never assigns a local entity id or promotes the data into runtime.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const baseCapture = require("./genshinVersionTransitionBehaviorEntityCapture.cjs");
const { digestStable } = require("./genshinVersionEvidenceValidation.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const transitionRoot = path.join(repositoryRoot, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0");
const sourceNamespace = "r2-new-roster";
const sourceRoot = path.join(transitionRoot, "sources", sourceNamespace);
const outputPath = path.join(transitionRoot, "r2-new-roster-capture.json");
const generatedAt = "2026-08-28T00:00:00.000Z";
const repository = "theBowja/genshin-db";
const sourceFamily = "GenshinData-derived";
const language = "Japanese";
const recordKinds = ["talents", "constellations"];
const revision = Object.freeze({ ...baseCapture.revisions.after });
const treeEvidenceRelative = path.posix.join(
    "games/genshin/data/v2/version-transitions/6.7-to-7.0/sources",
    "genshin-db-localized-identity-bridge-10000124",
    revision.revision,
    "localized-tree-resolution.json"
);
const packageEvidenceRelative = baseCapture.packageEvidence(revision).path;

const roster = Object.freeze([
    { rosterName: "Alyosha", providerSlug: "alyosha" },
    { rosterName: "Odette", providerSlug: "odette" },
    { rosterName: "Traveler", providerSlug: "travelercryo" }
]);

// These are copied from the saved Japanese tree response.  They are a
// selection allow-list, not values inferred from local IDs or display names.
const targetRecords = Object.freeze([
    { rosterName: "Alyosha", providerSlug: "alyosha", recordKind: "talents", treeBlobSha: "2b53f0f352e7a9bce11519da57d1297798a41569", treeBlobBytes: 10629 },
    { rosterName: "Alyosha", providerSlug: "alyosha", recordKind: "constellations", treeBlobSha: "e57dec5dec5e49ba6716ca1ce6b29098933d16b0", treeBlobBytes: 3269 },
    { rosterName: "Odette", providerSlug: "odette", recordKind: "talents", treeBlobSha: "63a090be8bedef85ff746ad0b75b0aa053c82fb6", treeBlobBytes: 12164 },
    { rosterName: "Odette", providerSlug: "odette", recordKind: "constellations", treeBlobSha: "5da0094c8b301775519af7f382cf032170d60826", treeBlobBytes: 7195 },
    { rosterName: "Traveler", providerSlug: "travelercryo", recordKind: "talents", treeBlobSha: "b71226386b2b116c0a01ab943d288e9076bcea19", treeBlobBytes: 10688 },
    { rosterName: "Traveler", providerSlug: "travelercryo", recordKind: "constellations", treeBlobSha: "1cd886a60e08ad5e1ffa1e23fe5370ea62b5e5dd", treeBlobBytes: 3074 }
]);

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function gitBlobSha(bytes) {
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return crypto.createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
}

function gitTreeSha(entries) {
    const sorted = [...entries].sort((left, right) => Buffer.compare(
        Buffer.from(`${left.mode} ${left.path}\0`, "utf8"),
        Buffer.from(`${right.mode} ${right.path}\0`, "utf8")
    ));
    const body = Buffer.concat(sorted.map((entry) => Buffer.concat([
        Buffer.from(`${entry.mode} ${entry.path}\0`, "utf8"),
        Buffer.from(entry.sha, "hex")
    ])));
    return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`tree ${body.length}\0`, "utf8"), body])).digest("hex");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function relative(file, root = repositoryRoot) {
    return path.relative(root, file).replaceAll("\\", "/");
}

function resolveWithin(root, relativePath) {
    if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) return null;
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(root, relativePath);
    if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) return null;
    return resolved;
}

function providerPath(record) {
    return `src/data/${language}/${record.recordKind}/${record.providerSlug}.json`;
}

function sourceUrl(record) {
    return `https://raw.githubusercontent.com/${repository}/${revision.revision}/${providerPath(record)}`;
}

function recordFile(record, root = repositoryRoot) {
    return path.join(root, "games", "genshin", "data", "v2", "version-transitions", "6.7-to-7.0", "sources", sourceNamespace, revision.revision, language, record.recordKind, `${record.providerSlug}.json`);
}

function treeEvidenceFile(root = repositoryRoot) {
    return path.resolve(root, treeEvidenceRelative);
}

function packageFile(root = repositoryRoot) {
    return resolveWithin(root, packageEvidenceRelative);
}

function expectedTreeEntry(treeEvidence, record) {
    return treeEvidence?.trees?.[record.recordKind]?.entries?.find((entry) => entry?.path === `${record.providerSlug}.json` && entry.type === "blob") || null;
}

function assertExpectedTreeEntry(treeEvidence, record) {
    const selected = expectedTreeEntry(treeEvidence, record);
    if (!selected || selected.sha !== record.treeBlobSha || selected.size !== record.treeBlobBytes) {
        throw new Error(`saved tree selection mismatch: ${record.recordKind}/${record.providerSlug}`);
    }
    return selected;
}

function normalizeTreeEntries(entries) {
    return entries.map((entry) => ({
        path: entry.path,
        type: entry.type,
        mode: entry.mode,
        sha: entry.sha,
        size: entry.size,
        url: entry.url
    }));
}

function validateSavedTreeEvidence(root = repositoryRoot) {
    const reasons = [];
    const file = treeEvidenceFile(root);
    if (!fs.existsSync(file)) return { valid: false, reasons: ["savedTreeEvidenceMissing"], evidence: null };

    let evidence;
    try { evidence = readJson(file); } catch (error) { return { valid: false, reasons: [`savedTreeEvidenceUnreadable:${error.message}`], evidence: null }; }

    const expectedClaim = {
        method: evidence.method,
        recursive: evidence.recursive,
        repository: evidence.repository,
        revision: evidence.revision,
        language: evidence.language,
        recordKinds: evidence.recordKinds,
        trees: evidence.trees
    };
    if (evidence.method !== "gitTreeApiNonRecursive" || evidence.recursive !== false || evidence.repository !== repository || evidence.revision !== revision.revision || evidence.language !== language || digestStable(evidence.recordKinds) !== digestStable(recordKinds) || evidence.fieldDigestAlgorithm !== "sha256-stable-json-v1" || evidence.fieldDigest !== digestStable(expectedClaim)) {
        reasons.push("savedTreeEvidenceBindingInvalid");
    }

    const validateRawTreeResponse = (metadata, expectedUrl, expectedSha, label) => {
        const responseFile = resolveWithin(root, metadata?.path);
        if (!responseFile || !fs.existsSync(responseFile)) {
            reasons.push(`savedTreeResponseMissing:${label}`);
            return null;
        }
        let bytes;
        try { bytes = fs.readFileSync(responseFile); } catch (error) { reasons.push(`savedTreeResponseReadFailed:${label}:${error.message}`); return null; }
        if (metadata.rawArtifactBytes !== bytes.length || metadata.rawArtifactSha256 !== sha256(bytes) || metadata.gitBlob !== gitBlobSha(bytes) || metadata.url !== expectedUrl) {
            reasons.push(`savedTreeResponseDigestInvalid:${label}`);
        }
        let value;
        try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { reasons.push(`savedTreeResponseJsonInvalid:${label}:${error.message}`); return null; }
        if (value?.sha !== expectedSha || value?.url !== expectedUrl || value?.truncated === true || !Array.isArray(value?.tree)) reasons.push(`savedTreeResponseBindingInvalid:${label}`);
        return value;
    };

    for (const recordKind of recordKinds) {
        const tree = evidence.trees?.[recordKind];
        const expectedSegments = ["src", "data", language, recordKind];
        if (!tree || tree.language !== language || tree.recordKind !== recordKind || tree.method !== "gitTreeApiNonRecursive" || tree.recursive !== false || tree.requestedRevision !== revision.revision || digestStable(tree.pathSegments) !== digestStable(expectedSegments) || !Array.isArray(tree.steps) || tree.steps.length !== expectedSegments.length || !Array.isArray(tree.entries)) {
            reasons.push(`savedTreeShapeInvalid:${recordKind}`);
            continue;
        }
        let currentRef = revision.revision;
        for (let index = 0; index < tree.steps.length; index += 1) {
            const step = tree.steps[index];
            const segment = expectedSegments[index];
            if (!step || step.requestedRef !== currentRef || step.responseSha !== currentRef || step.responseTruncated !== false || step.segment !== segment || step.entryType !== "tree" || !/^[a-f0-9]{40}$/.test(String(step.treeSha || ""))) {
                reasons.push(`savedTreeStepBindingInvalid:${recordKind}:${index}`);
                continue;
            }
            const expectedUrl = `https://api.github.com/repos/${repository}/git/trees/${currentRef}`;
            const response = validateRawTreeResponse(step.rawResponse, expectedUrl, currentRef, `${recordKind}:step-${index}`);
            const selected = response?.tree?.find((entry) => entry.path === segment && entry.type === "tree");
            if (!selected || selected.sha !== step.treeSha) reasons.push(`savedTreeStepResponseMismatch:${recordKind}:${index}`);
            currentRef = step.treeSha;
        }
        if (tree.finalTreeSha !== currentRef || tree.finalTreeUrl !== `https://api.github.com/repos/${repository}/git/trees/${currentRef}` || tree.finalTreeTruncated !== false) reasons.push(`savedTreeFinalBindingInvalid:${recordKind}`);
        const finalResponse = validateRawTreeResponse(tree.finalResponse, tree.finalTreeUrl, currentRef, `${recordKind}:final`);
        if (finalResponse) {
            const entries = normalizeTreeEntries(finalResponse.tree);
            if (digestStable(entries) !== digestStable(tree.entries) || gitTreeSha(tree.entries) !== tree.finalTreeSha) reasons.push(`savedTreeEntriesInvalid:${recordKind}`);
        }
        const seen = new Set();
        for (const entry of tree.entries) {
            if (!entry || seen.has(entry.path) || !/^[a-zA-Z0-9._-]+$/.test(String(entry.path || "")) || entry.type !== "blob" || entry.mode !== "100644" || !/^[a-f0-9]{40}$/.test(String(entry.sha || "")) || !Number.isInteger(entry.size) || entry.size < 1) reasons.push(`savedTreeEntryShapeInvalid:${recordKind}`);
            seen.add(entry?.path);
        }
    }
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)], evidence };
}

function manifestEvidence(root = repositoryRoot) {
    const current = root === repositoryRoot ? baseCapture.packageEvidence(revision) : null;
    const file = packageFile(root);
    if (!file || !fs.existsSync(file)) throw new Error(`package manifest missing: ${packageEvidenceRelative}`);
    const bytes = fs.readFileSync(file);
    const manifest = readJson(file);
    const evidence = current || {
        gameVersion: revision.gameVersion,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        path: relative(file, root),
        url: `https://raw.githubusercontent.com/${repository}/${revision.revision}/${revision.packagePath}`,
        gitBlob: gitBlobSha(bytes),
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: sha256(bytes),
        name: manifest.name,
        description: manifest.description
    };
    return {
        ...evidence,
        version: manifest.version,
        strictGameVersionText: `Genshin Impact v${revision.gameVersion} JSON data`
    };
}

function validateManifestEvidence(binding, root = repositoryRoot) {
    const reasons = [];
    const file = packageFile(root);
    const boundFile = resolveWithin(root, binding?.path);
    if (!boundFile || boundFile !== file || !fs.existsSync(boundFile)) return ["packageManifestMissing"];
    let bytes;
    let manifest;
    try {
        bytes = fs.readFileSync(boundFile);
        manifest = JSON.parse(bytes.toString("utf8"));
    } catch (error) { return [`packageManifestUnreadable:${error.message}`]; }
    if (bytes.length !== revision.packageBytes || sha256(bytes) !== revision.packageDigest || gitBlobSha(bytes) !== revision.packageBlob || manifest.name !== "genshin-db" || manifest.version !== revision.packageVersion || typeof manifest.description !== "string" || !manifest.description.includes(`Genshin Impact v${revision.gameVersion} JSON data`)) reasons.push("packageManifestBytesOrVersionInvalid");
    if (binding.gameVersion !== revision.gameVersion || binding.revision !== revision.revision || binding.packageVersion !== revision.packageVersion || binding.version !== revision.packageVersion || binding.gitBlob !== gitBlobSha(bytes) || binding.rawArtifactBytes !== bytes.length || binding.rawArtifactSha256 !== sha256(bytes) || binding.name !== manifest.name || binding.description !== manifest.description || binding.strictGameVersionText !== `Genshin Impact v${revision.gameVersion} JSON data`) reasons.push("packageManifestMetadataInvalid");
    return reasons;
}

function numericLiteralCount(value) {
    return (String(value || "").match(/(?:^|[^A-Za-z])(?:\d+(?:\.\d+)?%?)(?=$|[^A-Za-z])/g) || []).length;
}

function sectionSummary(key, section) {
    if (!section || typeof section !== "object" || Array.isArray(section)) return null;
    const attributes = section.attributes && typeof section.attributes === "object" && !Array.isArray(section.attributes) ? section.attributes : null;
    const labels = Array.isArray(attributes?.labels) ? attributes.labels.filter((value) => typeof value === "string") : [];
    const values = Array.isArray(attributes?.values) ? attributes.values : [];
    const descriptions = [section.descriptionRaw, section.description].filter((value) => typeof value === "string");
    return {
        key,
        name: typeof section.name === "string" ? section.name : null,
        labels,
        values,
        labelCount: labels.length,
        valueCount: values.length,
        parameterTokenCount: labels.concat(values.flatMap((value) => typeof value === "string" ? [value] : [])).filter((value) => /\{param\d+:/i.test(String(value))).length,
        numericLiteralCount: labels.concat(values.flatMap((value) => typeof value === "string" ? [value] : [])).reduce((count, value) => count + numericLiteralCount(value), 0),
        descriptionDigest: descriptions.length ? digestStable(descriptions) : null
    };
}

function structuredSummary(value) {
    const sections = Object.keys(value || {}).sort().map((key) => sectionSummary(key, value[key])).filter(Boolean);
    const attributes = sections.filter((section) => section.labelCount > 0 || section.valueCount > 0);
    return {
        topLevelKeys: Object.keys(value || {}).sort(),
        sections,
        attributeSectionCount: attributes.length,
        attributeLabelCount: attributes.reduce((sum, section) => sum + section.labelCount, 0),
        attributeValueCount: attributes.reduce((sum, section) => sum + section.valueCount, 0),
        parameterTokenCount: attributes.reduce((sum, section) => sum + section.parameterTokenCount, 0),
        numericLiteralCount: attributes.reduce((sum, section) => sum + section.numericLiteralCount, 0),
        extractedFrom: "provider JSON attributes.labels/attributes.values and section names; no prose-to-runtime inference"
    };
}

function parseRecord(bytes, record) {
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); } catch (error) { throw new Error(`JSON invalid: ${error.message}`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("record must be a JSON object");
    if (!Number.isInteger(value.id)) throw new Error("embedded id missing or non-integer");
    if (typeof value.name !== "string" || !value.name) throw new Error("embedded name missing");
    return value;
}

function recordArtifact(record, treeEvidence, root = repositoryRoot, { allowMissing = true } = {}) {
    const selected = assertExpectedTreeEntry(treeEvidence, record);
    const file = recordFile(record, root);
    const baseArtifact = {
        rosterName: record.rosterName,
        providerSlug: record.providerSlug,
        recordKind: record.recordKind,
        language,
        status: "sourcePathMissing",
        localEntityId: null,
        identityStatus: "providerRecordIdentityOnly",
        providerPath: providerPath(record),
        url: sourceUrl(record),
        path: relative(file, root),
        treeBlobSha: selected.sha,
        treeBlobBytes: selected.size,
        gitBlob: null,
        rawArtifactBytes: null,
        rawArtifactSha256: null,
        embeddedIdPath: "$.id",
        embeddedId: null,
        embeddedName: null,
        explicitEmbeddedIdentity: false,
        structuredSummary: null
    };
    if (!fs.existsSync(file)) {
        if (!allowMissing) throw new Error(`captured source missing: ${baseArtifact.path}`);
        return baseArtifact;
    }
    const bytes = fs.readFileSync(file);
    const value = parseRecord(bytes, record);
    const digest = sha256(bytes);
    const blob = gitBlobSha(bytes);
    const matchesTree = bytes.length === selected.size && blob === selected.sha;
    if (!matchesTree) throw new Error(`raw/tree binding mismatch: ${record.recordKind}/${record.providerSlug}`);
    return {
        ...baseArtifact,
        status: "captured",
        gitBlob: blob,
        rawArtifactBytes: bytes.length,
        rawArtifactSha256: digest,
        embeddedId: value.id,
        embeddedName: value.name,
        explicitEmbeddedIdentity: true,
        structuredSummary: structuredSummary(value)
    };
}

async function fetchBytes(url) {
    const response = await fetch(url, { headers: { "User-Agent": "damageTool-genshin-r2-new-roster-capture" } });
    if (!response.ok) {
        const error = new Error(`fetch failed ${response.status}: ${url}`);
        error.status = response.status;
        error.url = url;
        throw error;
    }
    return Buffer.from(await response.arrayBuffer());
}

async function acquire(root = repositoryRoot) {
    const treeValidation = validateSavedTreeEvidence(root);
    if (!treeValidation.valid) throw new Error(`saved tree evidence invalid: ${treeValidation.reasons.join(",")}`);
    for (const record of targetRecords) {
        const selected = assertExpectedTreeEntry(treeValidation.evidence, record);
        const file = recordFile(record, root);
        if (fs.existsSync(file)) {
            try {
                recordArtifact(record, treeValidation.evidence, root, { allowMissing: false });
                continue;
            } catch (error) {
                // An existing but tampered/unparseable file is not evidence;
                // fetch the same explicitly selected blob once and replace
                // only that file.
                void error;
            }
        }
        const bytes = await fetchBytes(sourceUrl(record));
        const value = parseRecord(bytes, record);
        if (bytes.length !== selected.size || gitBlobSha(bytes) !== selected.sha) throw new Error(`fetched raw/tree binding mismatch: ${record.recordKind}/${record.providerSlug}`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, bytes);
        // Parse once after writing so a filesystem race or encoding conversion
        // cannot be mistaken for captured evidence.
        recordArtifact(record, treeValidation.evidence, root, { allowMissing: false });
        void value;
    }
}

function buildCapture(root = repositoryRoot, { allowMissing = true } = {}) {
    const treeValidation = validateSavedTreeEvidence(root);
    if (!treeValidation.valid) throw new Error(`saved tree evidence invalid: ${treeValidation.reasons.join(",")}`);
    const manifest = manifestEvidence(root);
    const records = targetRecords.map((record) => recordArtifact(record, treeValidation.evidence, root, { allowMissing }));
    const captured = records.filter((record) => record.status === "captured");
    const missing = records.filter((record) => record.status !== "captured");
    const claim = {
        transitionId: "genshin:6.7->7.0",
        dataset: "newRosterTalentAndConstellationSource",
        targetGameVersion: revision.gameVersion,
        provider: "genshin-db",
        sourceFamily,
        repository,
        sourceNamespace,
        language,
        revision: revision.revision,
        packageVersion: revision.packageVersion,
        roster: roster.map((entry) => ({ ...entry, localEntityId: null, identityStatus: "unresolvedNoLocalEntityId" })),
        versionBinding: {
            status: "strictlyBound",
            gameVersion: revision.gameVersion,
            revision: revision.revision,
            packageVersion: revision.packageVersion,
            package: manifest
        },
        treeBinding: {
            status: "savedGitTreeEvidence",
            sourcePath: treeEvidenceRelative,
            repository,
            revision: revision.revision,
            language,
            recordKinds,
            finalTreeSha: Object.fromEntries(recordKinds.map((kind) => [kind, treeValidation.evidence.trees[kind].finalTreeSha])),
            selectedEntryCount: targetRecords.length,
            selectedEntries: targetRecords.map((record) => ({
                providerSlug: record.providerSlug,
                recordKind: record.recordKind,
                path: `${record.providerSlug}.json`,
                sha: record.treeBlobSha,
                size: record.treeBlobBytes,
                url: sourceUrl(record)
            }))
        },
        records,
        coverage: {
            requestedRecordCount: targetRecords.length,
            capturedRecordCount: captured.length,
            missingRecordCount: missing.length,
            rosterCount: roster.length,
            recordKinds,
            providerFamilyCount: 1,
            sourceFamilyCount: 1,
            exactRawArtifactProof: missing.length === 0,
            localEntityIdResolution: "unresolved"
        },
        prerequisites: {
            numericScaling: "provider records expose parameterized labels/values only; resolved level/scaling tables are not materialized here",
            localEntityId: "unresolved; provider embedded ids are not production local entity ids and no arithmetic mapping is permitted",
            independentProvider: "missing; all six records are from one genshin-db/GenshinData-derived family",
            semanticMechanics: "not parsed into runtime semantics; source capture does not issue a certificate or promote canonical data",
            versionComparison: "no 6.7 counterpart was requested; this is a 7.0 source-availability capture"
        },
        gateEligibility: {
            status: "singleProviderFamilyFailClosed",
            sourceFamilyCount: 1,
            canIssueEligibilityCertificate: false,
            canPromoteCanonical: false,
            reasons: [
                "independentProviderCorroborationMissing",
                "localEntityIdUnresolved",
                ...(missing.length ? ["rawArtifactCaptureIncomplete"] : [])
            ]
        }
    };
    return {
        schemaVersion: 1,
        kind: "genshinR2NewRosterCapture",
        generatedAt,
        status: missing.length === 0 ? "capturedSourceRecordsFailClosed" : "sourceRecordsPending",
        fieldDigestAlgorithm: "sha256-stable-json-v1",
        fieldDigest: digestStable(claim),
        claim,
        summary: {
            targetGameVersion: revision.gameVersion,
            rosterCount: roster.length,
            requestedRecords: targetRecords.length,
            capturedRecords: captured.length,
            missingRecords: missing.length,
            sourceFamilyCount: 1,
            certificateEligibleClaims: 0,
            canonicalPromotionCount: 0
        }
    };
}

function validateCapture(snapshot, { repositoryRoot: root = repositoryRoot } = {}) {
    const reasons = [];
    if (!snapshot || snapshot.schemaVersion !== 1 || snapshot.kind !== "genshinR2NewRosterCapture" || snapshot.generatedAt !== generatedAt) reasons.push("identityInvalid");
    if (snapshot?.fieldDigestAlgorithm !== "sha256-stable-json-v1" || snapshot?.fieldDigest !== digestStable(snapshot?.claim)) reasons.push("fieldDigestInvalid");
    const claim = snapshot?.claim;
    if (claim?.transitionId !== "genshin:6.7->7.0" || claim?.dataset !== "newRosterTalentAndConstellationSource" || claim?.targetGameVersion !== revision.gameVersion || claim?.provider !== "genshin-db" || claim?.sourceFamily !== sourceFamily || claim?.repository !== repository || claim?.sourceNamespace !== sourceNamespace || claim?.language !== language || claim?.revision !== revision.revision || claim?.packageVersion !== revision.packageVersion) reasons.push("claimBindingInvalid");
    if (!Array.isArray(claim?.roster) || digestStable(claim.roster) !== digestStable(roster.map((entry) => ({ ...entry, localEntityId: null, identityStatus: "unresolvedNoLocalEntityId" }))) || claim.roster.some((entry) => entry.localEntityId !== null || entry.identityStatus !== "unresolvedNoLocalEntityId")) reasons.push("rosterIdentityInvalid");

    const manifestReasons = validateManifestEvidence(claim?.versionBinding?.package, root);
    reasons.push(...manifestReasons);
    if (claim?.versionBinding?.status !== "strictlyBound" || claim?.versionBinding?.gameVersion !== revision.gameVersion || claim?.versionBinding?.revision !== revision.revision || claim?.versionBinding?.packageVersion !== revision.packageVersion) reasons.push("versionBindingInvalid");

    const treeValidation = validateSavedTreeEvidence(root);
    if (!treeValidation.valid) reasons.push(...treeValidation.reasons);
    if (claim?.treeBinding?.status !== "savedGitTreeEvidence" || claim?.treeBinding?.sourcePath !== treeEvidenceRelative || claim?.treeBinding?.repository !== repository || claim?.treeBinding?.revision !== revision.revision || claim?.treeBinding?.language !== language || digestStable(claim?.treeBinding?.recordKinds) !== digestStable(recordKinds) || claim?.treeBinding?.selectedEntryCount !== targetRecords.length) reasons.push("treeBindingInvalid");
    if (treeValidation.evidence) {
        for (const kind of recordKinds) if (claim?.treeBinding?.finalTreeSha?.[kind] !== treeValidation.evidence.trees?.[kind]?.finalTreeSha) reasons.push(`treeFinalShaInvalid:${kind}`);
        for (const record of targetRecords) {
            const selected = expectedTreeEntry(treeValidation.evidence, record);
            const bound = claim?.treeBinding?.selectedEntries?.find((entry) => entry?.providerSlug === record.providerSlug && entry?.recordKind === record.recordKind);
            if (!selected || !bound || bound.path !== `${record.providerSlug}.json` || bound.sha !== selected.sha || bound.size !== selected.size || bound.url !== sourceUrl(record)) reasons.push(`treeSelectionInvalid:${record.recordKind}/${record.providerSlug}`);
        }
    }

    const records = claim?.records;
    if (!Array.isArray(records) || records.length !== targetRecords.length) reasons.push("recordSetInvalid");
    for (const record of targetRecords) {
        const artifact = Array.isArray(records) ? records.find((candidate) => candidate?.recordKind === record.recordKind && candidate?.providerSlug === record.providerSlug) : null;
        if (!artifact) { reasons.push(`recordMissing:${record.recordKind}/${record.providerSlug}`); continue; }
        const file = resolveWithin(root, artifact.path);
        if (!file || file !== recordFile(record, root)) { reasons.push(`rawArtifactPathInvalid:${record.recordKind}/${record.providerSlug}`); continue; }
        if (!fs.existsSync(file)) {
            if (artifact.status === "sourcePathMissing" && artifact.gitBlob === null && artifact.rawArtifactBytes === null && artifact.rawArtifactSha256 === null && artifact.embeddedId === null && artifact.embeddedName === null && artifact.explicitEmbeddedIdentity === false && artifact.structuredSummary === null) continue;
            reasons.push(`rawArtifactMissing:${record.recordKind}/${record.providerSlug}`);
            continue;
        }
        let bytes;
        let value;
        try {
            bytes = fs.readFileSync(file);
            value = parseRecord(bytes, record);
        } catch (error) { reasons.push(`rawArtifactInvalid:${record.recordKind}/${record.providerSlug}:${error.message}`); continue; }
        const actualSha = sha256(bytes);
        const actualBlob = gitBlobSha(bytes);
        if (artifact.status !== "captured" || artifact.localEntityId !== null || artifact.identityStatus !== "providerRecordIdentityOnly" || artifact.language !== language || artifact.providerPath !== providerPath(record) || artifact.url !== sourceUrl(record) || artifact.treeBlobSha !== record.treeBlobSha || artifact.treeBlobBytes !== record.treeBlobBytes || artifact.treeBlobSha !== actualBlob || artifact.treeBlobBytes !== bytes.length || artifact.gitBlob !== actualBlob || artifact.rawArtifactBytes !== bytes.length || artifact.rawArtifactSha256 !== actualSha) reasons.push(`rawArtifactBindingInvalid:${record.recordKind}/${record.providerSlug}`);
        if (artifact.embeddedIdPath !== "$.id" || artifact.embeddedId !== value.id || artifact.embeddedName !== value.name || artifact.explicitEmbeddedIdentity !== true) reasons.push(`embeddedIdentityInvalid:${record.recordKind}/${record.providerSlug}`);
        if (digestStable(artifact.structuredSummary) !== digestStable(structuredSummary(value))) reasons.push(`structuredSummaryInvalid:${record.recordKind}/${record.providerSlug}`);
    }

    const capturedCount = Array.isArray(records) ? records.filter((record) => record?.status === "captured").length : 0;
    const missingCount = targetRecords.length - capturedCount;
    if (claim?.coverage?.requestedRecordCount !== targetRecords.length || claim?.coverage?.capturedRecordCount !== capturedCount || claim?.coverage?.missingRecordCount !== missingCount || claim?.coverage?.rosterCount !== roster.length || claim?.coverage?.providerFamilyCount !== 1 || claim?.coverage?.sourceFamilyCount !== 1 || claim?.coverage?.exactRawArtifactProof !== (missingCount === 0) || claim?.coverage?.localEntityIdResolution !== "unresolved") reasons.push("coverageInvalid");
    if (snapshot?.status !== (missingCount === 0 ? "capturedSourceRecordsFailClosed" : "sourceRecordsPending")) reasons.push("statusInvalid");
    if (claim?.gateEligibility?.status !== "singleProviderFamilyFailClosed" || claim?.gateEligibility?.sourceFamilyCount !== 1 || claim?.gateEligibility?.canIssueEligibilityCertificate !== false || claim?.gateEligibility?.canPromoteCanonical !== false || !Array.isArray(claim?.gateEligibility?.reasons) || !claim.gateEligibility.reasons.includes("independentProviderCorroborationMissing") || !claim.gateEligibility.reasons.includes("localEntityIdUnresolved") || (missingCount > 0 && !claim.gateEligibility.reasons.includes("rawArtifactCaptureIncomplete")) || (missingCount === 0 && claim.gateEligibility.reasons.includes("rawArtifactCaptureIncomplete"))) reasons.push("failClosedGateInvalid");
    if (snapshot?.summary?.targetGameVersion !== revision.gameVersion || snapshot?.summary?.rosterCount !== roster.length || snapshot?.summary?.requestedRecords !== targetRecords.length || snapshot?.summary?.capturedRecords !== capturedCount || snapshot?.summary?.missingRecords !== missingCount || snapshot?.summary?.sourceFamilyCount !== 1 || snapshot?.summary?.certificateEligibleClaims !== 0 || snapshot?.summary?.canonicalPromotionCount !== 0) reasons.push("summaryInvalid");
    return { valid: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function writeCapture(root = repositoryRoot) {
    const snapshot = buildCapture(root, { allowMissing: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
}

async function main() {
    if (process.argv.includes("--fetch")) await acquire();
    const snapshot = writeCapture();
    const validation = validateCapture(snapshot, { repositoryRoot });
    if (!validation.valid) throw new Error(`capture validation failed: ${validation.reasons.join(",")}`);
    process.stdout.write(`${JSON.stringify(snapshot.summary, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});

module.exports = {
    acquire,
    buildCapture,
    generatedAt,
    gitBlobSha,
    gitTreeSha,
    manifestEvidence,
    outputPath,
    packageEvidenceRelative,
    providerPath,
    recordFile,
    recordKinds,
    repository,
    revision,
    roster,
    sha256,
    sourceFamily,
    sourceNamespace,
    sourceUrl,
    targetRecords,
    treeEvidenceFile,
    validateCapture,
    validateSavedTreeEvidence,
    writeCapture
};
