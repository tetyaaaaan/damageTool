"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { compareGameVersions } = require("./genshinGameVersionPolicy.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const defaultReportJson = path.join(repositoryRoot, "reports", "genshin-upstream-version-audit.json");
const defaultReportMarkdown = path.join(repositoryRoot, "reports", "genshin-upstream-version-audit.md");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex");

function validateHead(head) {
    const reasons = [];
    if (!head || head.schemaVersion !== 1 || head.kind !== "genshinUpstreamVersionHead") reasons.push("schemaInvalid");
    if (!/^\d+(?:\.\d+)*$/.test(head?.observedGameVersion || "")) reasons.push("observedGameVersionInvalid");
    if (head?.evidence?.kind !== "officialReleaseNotes" || head?.evidence?.providerFamily !== "official-hoyoverse") reasons.push("officialEvidenceInvalid");
    if (!/^https:\/\//.test(head?.evidence?.url || "") || !/^https:\/\//.test(head?.evidence?.apiUrl || "")) reasons.push("locatorInvalid");
    if (!/^[a-f0-9]{64}$/.test(head?.evidence?.rawApiResponseDigest || "") || !Number.isInteger(head?.evidence?.rawApiResponseBytes)) reasons.push("rawDigestInvalid");
    if (head?.evidence?.claim?.gameVersion !== head?.observedGameVersion) reasons.push("claimVersionMismatch");
    const expectedFieldDigest = digest(head?.evidence?.claim || null);
    if (head?.evidence?.fieldDigest !== expectedFieldDigest) reasons.push("fieldDigestInvalid");
    return { valid: reasons.length === 0, reasons, expectedFieldDigest };
}

function audit({ dataRoot = path.join(repositoryRoot, "games", "genshin", "data") } = {}) {
    const headPath = path.join(dataRoot, "v2", "upstream-version-head.json");
    const baselinePath = path.join(dataRoot, "v2", "version-baseline.json");
    const head = readJson(headPath);
    const baseline = readJson(baselinePath);
    const validity = validateHead(head);
    const acceptedTargetVersion = baseline?.targetGameVersion?.gameVersion || null;
    const comparison = validity.valid && acceptedTargetVersion
        ? compareGameVersions(acceptedTargetVersion, head.observedGameVersion)
        : null;
    const status = !validity.valid
        ? "evidenceInvalid"
        : comparison < 0 ? "upstreamVersionAvailable"
            : comparison > 0 ? "acceptedTargetAhead"
                : comparison === 0 ? "current" : "unbound";
    return {
        schemaVersion: 1,
        kind: "genshinUpstreamVersionAudit",
        status,
        evidenceId: head.evidenceId || null,
        acceptedTargetVersion,
        acceptedSnapshotId: baseline?.snapshotId || null,
        observedLiveVersion: validity.valid ? head.observedGameVersion : null,
        evidenceValid: validity.valid,
        evidenceReasons: validity.reasons,
        targetState: status === "upstreamVersionAvailable"
            ? {
                gameVersion: head.observedGameVersion,
                status: "inactive",
                lifecycle: "pendingRevalidation",
                acceptedBaselinePreserved: true
            }
            : status === "current"
                ? { gameVersion: head.observedGameVersion, status: "active", lifecycle: "current", acceptedBaselinePreserved: true }
                : { gameVersion: validity.valid ? head.observedGameVersion : null, status: "inactive", lifecycle: "blocked", acceptedBaselinePreserved: true },
        repositoryVersionGateRecommendation: status === "current" ? "open" : "closeBeforeNewPromotion",
        candidatePromotionAllowed: false,
        note: "The official release head detects upstream drift only; it is not candidate field evidence and cannot promote claims."
    };
}

function markdown(report) {
    return [
        "# Genshin upstream version audit", "",
        `Status: **${report.status}**`, "",
        `Accepted repository target: **${report.acceptedTargetVersion || "unbound"}**`, "",
        `Observed official live version: **${report.observedLiveVersion || "unbound"}**`, "",
        `Evidence valid: **${report.evidenceValid ? "yes" : "no"}**`, "",
        `Promotion recommendation: **${report.repositoryVersionGateRecommendation}**`, "",
        report.note, ""
    ].join("\n");
}

function writeAudit({ reportJson = defaultReportJson, reportMarkdown = defaultReportMarkdown, ...options } = {}) {
    const report = audit(options);
    fs.mkdirSync(path.dirname(reportJson), { recursive: true });
    fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdown, markdown(report), "utf8");
    return report;
}

if (require.main === module) process.stdout.write(`${JSON.stringify(writeAudit(), null, 2)}\n`);

module.exports = { audit, markdown, validateHead, writeAudit };
