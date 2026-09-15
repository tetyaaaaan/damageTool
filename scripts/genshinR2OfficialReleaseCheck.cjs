"use strict";

/**
 * One bounded re-check of the already identified HoYoLAB 7.0 release post.
 *
 * This script deliberately has one URL and one fetch.  It writes a new raw
 * response/receipt under the r2-official-release-check namespace and never
 * edits the upstream head, queue, manifest, inventory, certificates, or
 * canonical data.  A changed response is retained and reported as a
 * discrepancy; it is not normalized into the previous head evidence.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const repositoryRoot = path.resolve(__dirname, "..");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const transitionRoot = path.join(dataRoot, "v2", "version-transitions", "6.7-to-7.0");
const outputRoot = path.join(transitionRoot, "sources", "r2-official-release-check");
const rawPath = path.join(outputRoot, "post-46233468-api.response");
const receiptPath = path.join(outputRoot, "receipt.json");
const reportPath = path.join(repositoryRoot, "reports", "genshin-r2-official-release-check.md");
const headPath = path.join(dataRoot, "v2", "upstream-version-head.json");
const sourceUrl = "https://bbs-api-os.hoyolab.com/community/post/wapi/getPostFull?post_id=46233468";
const pageUrl = "https://www.hoyolab.com/article/46233468";
const postId = "46233468";
const targetGameVersion = "7.0";
const expectedSubject = "Everwinter Without Mercy";

function sha256(bytes) {
    return crypto.createHash("sha256").update(bytes).digest("hex");
}

function stableJson(value) {
    const stableValue = (item) => Array.isArray(item)
        ? item.map(stableValue)
        : item && typeof item === "object"
            ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, stableValue(item[key])]))
            : item;
    return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

function relative(file) {
    return path.relative(repositoryRoot, file).replaceAll("\\", "/");
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collectStrings(value, output = [], seen = new Set()) {
    if (value === null || value === undefined) return output;
    if (typeof value === "string") {
        output.push(value);
        return output;
    }
    if (typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, output, seen));
    } else {
        Object.entries(value).forEach(([key, item]) => {
            output.push(key);
            collectStrings(item, output, seen);
        });
    }
    return output;
}

function collectMatchingEntries(value, matcher, pathParts = [], output = [], seen = new Set()) {
    if (value === null || value === undefined || typeof value !== "object" || seen.has(value)) return output;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectMatchingEntries(item, matcher, [...pathParts, String(index)], output, seen));
    } else {
        Object.entries(value).forEach(([key, item]) => {
            const currentPath = [...pathParts, key];
            if (matcher(key, item, currentPath)) output.push({ key, value: item, path: currentPath.join("/") });
            collectMatchingEntries(item, matcher, currentPath, output, seen);
        });
    }
    return output;
}

function stripMarkup(value) {
    return String(value || "")
        .replace(/<script[\s\S]*?<\/script>/giu, " ")
        .replace(/<style[\s\S]*?<\/style>/giu, " ")
        .replace(/<[^>]*>/gu, " ")
        .replace(/&nbsp;/gu, " ")
        .replace(/&amp;/gu, "&")
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/\s+/gu, " ")
        .trim();
}

function evidenceSnippets(values) {
    return [...new Set(values)].filter((value) => value.length <= 600).slice(0, 12);
}

function explicitRosterFromStructuredFields(value) {
    const matches = collectMatchingEntries(value, (key, item) =>
        /^(?:new[_-]?characters?|characters?[_-]?new)$/iu.test(String(key)) && Array.isArray(item));
    for (const match of matches) {
        const records = match.value.map((item) => {
            if (typeof item === "string") return { name: item };
            if (!item || typeof item !== "object") return null;
            const id = item.id ?? item.characterId ?? item.character_id ?? null;
            const name = item.name ?? item.title ?? item.characterName ?? item.character_name ?? null;
            return id !== null || name !== null ? { id: id === null ? null : String(id), name: name === null ? null : String(name) } : null;
        }).filter(Boolean);
        if (records.length) {
            return {
                status: "explicitStructuredRoster",
                sourcePath: match.path,
                records
            };
        }
    }
    const structuredContent = collectMatchingEntries(value, (key, item) => key === "structured_content" && typeof item === "string");
    for (const match of structuredContent) {
        let delta;
        try { delta = JSON.parse(match.value); } catch { delta = null; }
        if (!Array.isArray(delta)) continue;
        const text = delta.map((item) => typeof item?.insert === "string" ? item.insert : "").join("");
        const section = text.match(/(?:^|\n)II\.\s*New Characters\s*\n([\s\S]*?)(?=\nIII\.\s*New Equipment\b)/iu);
        if (!section) continue;
        const records = section[1].split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).flatMap((heading) => {
            const headingMatch = heading.match(/^(.*?)\s+\(([^)]+)\)\s+\((\d+)-Star\)$/u);
            if (!headingMatch) return [];
            const displayName = headingMatch[1].trim();
            const titleMatch = displayName.match(/^("[^"]+")\s+(.+)$/u);
            return [{
                displayName,
                name: titleMatch ? titleMatch[2].trim() : displayName,
                title: titleMatch ? titleMatch[1] : null,
                element: headingMatch[2].trim(),
                rarityStars: Number(headingMatch[3]),
                identityStatus: "nameOnlyNoLocalEntityId"
            }];
        });
        if (records.length) {
            return {
                status: "explicitReleaseSectionRoster",
                sourcePath: match.path,
                sectionHeading: "II. New Characters",
                records
            };
        }
    }
    return {
        status: "unavailable",
        sourcePath: null,
        records: [],
        reason: "The bounded response was not treated as a roster until it exposes an explicit new-character array; no IDs were inferred from shard or transition entity IDs."
    };
}

function inspectResponse(bytes, responseStatus, responseHeaders, expectedHead) {
    const digest = sha256(bytes);
    const text = bytes.toString("utf8");
    let parsed = null;
    let parseError = null;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        parseError = error.message;
    }
    const strings = collectStrings(parsed || text).map(stripMarkup).filter(Boolean);
    const joined = strings.join("\n");
    const idMatches = collectMatchingEntries(parsed, (key, value) =>
        /^(?:post[_-]?id|postId|article[_-]?id|articleId)$/iu.test(String(key)) && String(value) === postId);
    const providerMatches = strings.filter((item) => /HoYoLAB|HoYoverse|Genshin Impact Official/iu.test(item));
    const subjectMatches = strings.filter((item) => /Everwinter Without Mercy/iu.test(item));
    const versionMatches = strings.filter((item) => /Version\s+7\.0/iu.test(item));
    const explicitTextMatches = strings.filter((item) => /(?:details of the )?Version\s+7\.0\s+update/iu.test(item));
    const postRecord = parsed?.data?.post?.post || {};
    const officialUser = parsed?.data?.post?.user || {};
    const gameRecord = parsed?.data?.post?.game || {};
    const publisher = {
        nickname: officialUser.nickname || null,
        uid: officialUser.uid || postRecord.uid || null,
        certificationType: officialUser.certification?.type ?? null,
        certificationDescription: officialUser.certification?.desc || null,
        gameName: gameRecord.game_name || null
    };
    const identityErrors = [];
    if (responseStatus < 200 || responseStatus >= 300) identityErrors.push(`httpStatus:${responseStatus}`);
    if (!parsed) identityErrors.push("responseJsonInvalid");
    if (!idMatches.length && !joined.includes(postId)) identityErrors.push("postIdNotFound");
    if (String(postRecord.post_id || "") !== postId) identityErrors.push("structuredPostIdMismatch");
    if (publisher.nickname !== "Genshin Impact Official" || publisher.certificationType !== 1) identityErrors.push("officialPublisherIdentityMismatch");
    if (publisher.gameName !== "Genshin Impact") identityErrors.push("gameIdentityMismatch");
    if (!providerMatches.length) identityErrors.push("officialPublisherTextNotFound");
    if (!subjectMatches.length || !String(postRecord.subject || "").includes(expectedSubject)) identityErrors.push("expectedSubjectNotFound");
    if (!versionMatches.length || !/Version\s+7\.0/iu.test(String(postRecord.subject || ""))) identityErrors.push("explicitVersion7_0TextNotFound");
    const roster = explicitRosterFromStructuredFields(parsed);
    return {
        response: {
            status: responseStatus,
            contentType: responseHeaders?.get?.("content-type") || null,
            bytes: bytes.length,
            sha256: digest
        },
        identity: {
            valid: identityErrors.length === 0,
            errors: identityErrors,
            postId,
            idEvidencePaths: idMatches.map((match) => match.path),
            publisher,
            subject: postRecord.subject || null,
            providerEvidence: evidenceSnippets(providerMatches),
            subjectEvidence: evidenceSnippets(subjectMatches),
            versionEvidence: evidenceSnippets(versionMatches),
            explicitVersionSentenceEvidence: evidenceSnippets(explicitTextMatches)
        },
        roster,
        comparisonToRecordedHead: {
            expectedBytes: expectedHead?.evidence?.rawApiResponseBytes ?? null,
            expectedSha256: expectedHead?.evidence?.rawApiResponseDigest ?? null,
            bytesMatch: Number(expectedHead?.evidence?.rawApiResponseBytes) === bytes.length,
            digestMatch: expectedHead?.evidence?.rawApiResponseDigest === digest,
            status: expectedHead?.evidence?.rawApiResponseBytes === bytes.length && expectedHead?.evidence?.rawApiResponseDigest === digest
                ? "matchesRecordedHead"
                : "discrepancyRecordedSeparately"
        },
        parse: {
            validJson: parsed !== null,
            error: parseError
        }
    };
}

function reportMarkdown(receipt) {
    const identity = receipt.identity || {};
    const response = receipt.response || {};
    const comparison = receipt.comparisonToRecordedHead || {};
    const roster = receipt.roster || {};
    return [
        "# Genshin r2 official release check",
        "",
        `Acquired: **${receipt.acquiredAt || "unknown"}**`,
        `Source: **${receipt.sourceUrl || sourceUrl}**`,
        `Page locator: **${receipt.pageUrl || pageUrl}**`,
        "",
        "This is source availability and identity evidence only. It does not update the upstream version head, inventory, queue, certificates, canonical data, or release acceptance.",
        "",
        "## Response",
        "",
        `- HTTP status: **${response.status ?? "unknown"}**; content type: **${response.contentType || "unknown"}**`,
        `- Captured bytes: **${response.bytes ?? 0}**`,
        `- New response SHA-256: \`${response.sha256 || ""}\``,
        `- Recorded-head comparison: **${comparison.status || "unknown"}** (bytes match: ${comparison.bytesMatch === true ? "yes" : "no"}; digest match: ${comparison.digestMatch === true ? "yes" : "no"})`,
        "",
        "## Identity and version checks",
        "",
        `- Identity checks: **${identity.valid === true ? "passed" : "failed"}**`,
        `- Post ID evidence: **${(identity.idEvidencePaths || []).length ? "present" : "not found"}**`,
        `- Publisher: **${identity.publisher?.nickname || "unknown"}** (certification: ${identity.publisher?.certificationDescription || "unknown"}; game: ${identity.publisher?.gameName || "unknown"})`,
        `- Official publisher evidence: **${(identity.providerEvidence || []).length ? "present" : "not found"}**`,
        `- Explicit 7.0 evidence: **${(identity.versionEvidence || []).length ? "present" : "not found"}**`,
        ...(identity.errors || []).map((error) => "- Identity issue: `" + error + "`"),
        "",
        "## Roster boundary",
        "",
        roster.status === "explicitStructuredRoster" || roster.status === "explicitReleaseSectionRoster"
            ? "- Explicit release-section roster found at `" + roster.sourcePath + "`; records: **" + roster.records.length + "** (" + roster.records.map((record) => record.name + " / " + record.element + " / " + record.rarityStars + "-star").join(", ") + ")."
            : `- New-character roster: **unavailable**. ${roster.reason || "No explicit new-character list was accepted."}`,
        "- No character IDs are inferred from shard IDs or change-index entity IDs.",
        "",
        "## Safe disposition",
        "",
        `- Promotion eligible: **${receipt.promotionEligible === 0 ? "0" : receipt.promotionEligible}**` ,
        `- Upstream-head replacement: **${receipt.upstreamHeadReplacement || "not authorized"}**`,
        `- Raw artifact: \`${receipt.rawArtifact?.path || "not written"}\``,
        ""
    ].join("\n");
}

function buildReceipt(inspection, acquiredAt, rawFile = rawPath) {
    const bytes = inspection.response.bytes;
    return {
        schemaVersion: 1,
        kind: "genshinR2OfficialReleaseCheckReceipt",
        status: inspection.identity.valid ? inspection.comparisonToRecordedHead.status === "matchesRecordedHead" ? "capturedMatchesRecordedHead" : "capturedIdentityValidatedWithDigestDiscrepancy" : "capturedButIdentityUnvalidated",
        acquiredAt,
        sourceFamily: "official-hoyoverse",
        provider: "HoYoLAB / Genshin Impact Official",
        sourceUrl,
        pageUrl,
        apiUrl: sourceUrl,
        targetGameVersion,
        postId,
        response: inspection.response,
        identity: inspection.identity,
        comparisonToRecordedHead: inspection.comparisonToRecordedHead,
        roster: inspection.roster,
        rawArtifact: {
            path: relative(rawFile),
            bytes,
            sha256: inspection.response.sha256,
            encoding: "exact-response-bytes",
            status: "retainedWithoutNormalization"
        },
        upstreamHeadReplacement: "not authorized",
        promotionEligible: 0,
        sourceAvailabilityOnly: true,
        note: "This bounded retrieval is a new observation. A digest/byte discrepancy from upstream-version-head is recorded and does not overwrite or promote the previous evidence."
    };
}

function writeReceiptAndReport(receipt) {
    fs.writeFileSync(receiptPath, stableJson(receipt), "utf8");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, reportMarkdown(receipt), "utf8");
    return receipt;
}

async function acquire() {
    if (fs.existsSync(rawPath) || fs.existsSync(receiptPath)) throw new Error("r2 official release check already exists; refusing a second acquisition or overwrite");
    const expectedHead = readJson(headPath);
    const acquiredAt = new Date().toISOString();
    let response;
    let bytes;
    try {
        response = await fetch(sourceUrl, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "damageTool-genshin-r2-official-release-check"
            }
        });
        bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
        throw new Error(`bounded request failed at ${sourceUrl}: ${error.message}`);
    }
    const inspection = inspectResponse(bytes, response.status, response.headers, expectedHead);
    const rawFile = rawPath;
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(rawFile, bytes);
    return writeReceiptAndReport(buildReceipt(inspection, acquiredAt, rawFile));
}

function refreshExisting() {
    if (!fs.existsSync(rawPath)) throw new Error("existing r2 official release raw response is missing");
    const expectedHead = readJson(headPath);
    const previous = fs.existsSync(receiptPath) ? readJson(receiptPath) : null;
    const bytes = fs.readFileSync(rawPath);
    const inspection = inspectResponse(bytes, previous?.response?.status || 200, { get: () => previous?.response?.contentType || "application/json" }, expectedHead);
    return writeReceiptAndReport(buildReceipt(inspection, previous?.acquiredAt || new Date().toISOString(), rawPath));
}

if (require.main === module) {
    const run = process.argv.includes("--refresh-existing") ? refreshExisting : acquire;
    Promise.resolve().then(run).then((receipt) => {
        process.stdout.write(`${JSON.stringify({ status: receipt.status, response: receipt.response, identity: receipt.identity, comparisonToRecordedHead: receipt.comparisonToRecordedHead, roster: receipt.roster, rawArtifact: receipt.rawArtifact }, null, 2)}\n`);
    }).catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

module.exports = {
    acquire,
    buildReceipt,
    explicitRosterFromStructuredFields,
    inspectResponse,
    pageUrl,
    postId,
    rawPath,
    receiptPath,
    reportMarkdown,
    reportPath,
    refreshExisting,
    sourceUrl,
    targetGameVersion
};
