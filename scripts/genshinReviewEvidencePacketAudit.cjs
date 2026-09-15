"use strict";

/** Audit deterministic review packets without promoting any candidate. */

const fs = require("node:fs");
const path = require("node:path");
const generator = require("./genshinReviewEvidencePacketGenerate.cjs");
const representativePilot = require("./genshinRepresentativeReviewPilot.cjs");

const repositoryRoot = path.resolve(__dirname, "..");
const reviewDecisionPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "reviews", "weapon-12516-stat.json");
const weaponSpecsPath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "weapons", "spec-candidates.json");
const canonicalRuntimePath = path.join(repositoryRoot, "games", "genshin", "data", "v2", "runtime", "canonical-runtime.json");
const dataRoot = path.join(repositoryRoot, "games", "genshin", "data");
const defaultWeaponRoot = path.join(dataRoot, "v2", "weapons");
const defaultPacketDirectory = path.join(dataRoot, "v2", "review-packets");
const defaultReportJsonPath = path.join(repositoryRoot, "reports", "genshin-review-evidence-packets.json");
const defaultReportMarkdownPath = path.join(repositoryRoot, "reports", "genshin-review-evidence-packets.md");
const GENERATED_AT = generator.GENERATED_AT;
const ALLOWED_RECOMMENDATIONS = new Set(generator.RECOMMENDATIONS);
const FORBIDDEN_RECOMMENDATIONS = new Set(["approve", "approved", "verified", "canonical"]);

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sortNatural(a, b) {
    return String(a).localeCompare(String(b), "en", { numeric: true });
}

function stableJson(value) {
    return generator.stableJson(value);
}

function unique(values) {
    return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

function packetFiles(packetDirectory) {
    return fs.readdirSync(packetDirectory)
        .filter((file) => /^weapon-\d+\.json$/i.test(file))
        .sort(sortNatural)
        .map((file) => path.join(packetDirectory, file));
}

function assertMissingRepresentation(item, errors) {
    if (item.sourceA?.fieldClaim === null && !item.sourceA?.blockedReason) errors.push(`${item.id}: sourceA missing claim lacks blockedReason`);
    if (item.sourceB?.fieldEvidence === null && !item.sourceB?.blockedReason) errors.push(`${item.id}: sourceB missing evidence lacks blockedReason`);
    if (item.gameVersion?.value === null && !(item.gameVersion?.blockedReasons || []).length) errors.push(`${item.id}: missing common gameVersion lacks blockedReasons`);
    if (item.extractedValue?.sourceA === null && !(item.extractedValue?.blockedReasons || []).includes("officialFieldClaimMissing")) errors.push(`${item.id}: missing extracted sourceA value lacks blockedReason`);
    if (item.extractedValue?.sourceB === null && !(item.extractedValue?.blockedReasons || []).includes("independentFieldEvidenceMissing")) errors.push(`${item.id}: missing extracted sourceB value lacks blockedReason`);
    const originalText = item.originalText || {};
    for (const [source, value] of Object.entries(originalText)) {
        const entries = Array.isArray(value) ? value : [value];
        entries.forEach((entry, index) => {
            if (entry?.text === null && !entry?.blockedReason) errors.push(`${item.id}: ${source}[${index}] null text lacks blockedReason`);
        });
    }
}

function auditItem(item, errors, summary) {
    const required = ["id", "target", "originalText", "sourceA", "sourceB", "gameVersion", "targetGameVersion", "extractedValue", "specValue", "comparison", "interpretationNotes", "runtimeTarget", "recommendation"];
    required.forEach((key) => {
        if (item[key] === undefined) errors.push(`${item.id || "item"}: missing ${key}`);
    });
    if (item.target?.kind !== "weapon" || !item.target?.id || !item.target?.candidateId || !item.target?.field) errors.push(`${item.id}: invalid target identity`);
    if (!Array.isArray(item.interpretationNotes)) errors.push(`${item.id}: interpretationNotes must be an array`);
    if (!ALLOWED_RECOMMENDATIONS.has(item.recommendation?.status)) errors.push(`${item.id}: invalid recommendation ${item.recommendation?.status}`);
    if (FORBIDDEN_RECOMMENDATIONS.has(String(item.recommendation?.status || "").toLowerCase())) errors.push(`${item.id}: forbidden self-approval recommendation`);
    if (item.recommendation?.selfApprovalForbidden !== true) errors.push(`${item.id}: selfApprovalForbidden must be true`);
    const decisions = item.reviewDecisionOptions || [];
    if (decisions.map((option) => option.value).join("|") !== "approve|reject|hold") errors.push(`${item.id}: review decision options missing`);
    if (item.recommendation?.status !== "humanDecisionRequired" && decisions.some((option) => ["approve", "reject"].includes(option.value) && option.enabled)) {
        errors.push(`${item.id}: approve/reject enabled before technical evidence completion`);
    }
    if (decisions.find((option) => option.value === "hold")?.enabled !== true) errors.push(`${item.id}: hold decision must remain available`);
    if (item.verification?.status === "verified") errors.push(`${item.id}: verification promotion is forbidden`);
    if (item.canonicalEligibility !== false) errors.push(`${item.id}: canonicalEligibility must remain false`);
    if (item.comparison?.triage?.some((row) => row.canonicalEligibility === true)) errors.push(`${item.id}: triage canonical eligibility must remain false`);
    if (item.sourceSelection?.sourceA?.sourceIds?.some((id) => id.startsWith("weapon:"))) errors.push(`${item.id}: local source selected as official source A`);
    assertMissingRepresentation(item, errors);
    summary.items += 1;
    summary.recommendationCounts[item.recommendation.status] = (summary.recommendationCounts[item.recommendation.status] || 0) + 1;
    if (item.gameVersion?.value) summary.gameVersionBoundItems += 1;
    if (item.comparison?.status === "match") summary.fullMatches += 1;
    if (item.comparison?.status === "partialMatch") summary.partialMatches += 1;
    if (item.comparison?.status === "mismatch") summary.mismatches += 1;
    if (item.comparison?.status === "notComparable") summary.notComparable += 1;
}

function auditPacket(packet, expected, errors, summary) {
    if (!packet || packet.schemaVersion !== 1 || packet.packet !== "genshin-review-evidence-packet") {
        errors.push("invalid packet schema");
        return;
    }
    if (packet.generatedAt !== GENERATED_AT) errors.push(`${packet.packetId}: generatedAt is not deterministic`);
    if (packet.canonicalEligibility !== false) errors.push(`${packet.packetId}: packet canonicalEligibility must remain false`);
    if (packet.policy?.verificationPromotion !== "forbidden" || packet.policy?.canonicalPromotion !== "forbidden" || packet.policy?.aiSelfApproval !== "forbidden") errors.push(`${packet.packetId}: promotion policy is not fail-closed`);
    if (packet.recommendation?.selfApprovalForbidden !== true) errors.push(`${packet.packetId}: packet selfApprovalForbidden must be true`);
    if (!ALLOWED_RECOMMENDATIONS.has(packet.recommendation?.status)) errors.push(`${packet.packetId}: invalid packet recommendation`);
    if ((packet.reviewDecisionOptions || []).map((option) => option.value).join("|") !== "approve|reject|hold") errors.push(`${packet.packetId}: review decision options missing`);
    if (packet.targetGameVersion?.value !== null && packet.targetGameVersion?.sourceBVerified !== true) errors.push(`${packet.packetId}: common version cannot be bound without source B verification`);
    if (!packet.sourceSelection?.excluded || !Array.isArray(packet.sourceSelection.excluded)) errors.push(`${packet.packetId}: excluded source list missing`);
    packet.sourceSelection?.excluded?.forEach((source) => {
        if (!source.excludedReason) errors.push(`${packet.packetId}: excluded source ${source.id} lacks excludedReason`);
        if (["official-genshin-hoyolab", "gcsim-implementation"].includes(source.independenceGroup)) errors.push(`${packet.packetId}: selected independent group appears in excluded sources`);
    });
    const expectedText = stableJson(expected);
    const actualText = stableJson(packet);
    if (expectedText !== actualText) errors.push(`${packet.packetId}: packet is not reproducible from current inputs`);
    (packet.items || []).forEach((item) => auditItem(item, errors, summary));
    summary.packets += 1;
    summary.weaponIds.push(String(packet.target?.id || ""));
    summary.canonicalEligibility += packet.canonicalEligibility === true ? 1 : 0;
    summary.verificationPromotions += (packet.items || []).filter((item) => item.verification?.status === "verified").length;
}

function auditPackets({
    packetDirectory = defaultPacketDirectory,
    weaponIds = generator.DEFAULT_WEAPON_IDS,
    candidatePath = path.join(defaultWeaponRoot, "spec-candidates.json"),
    sourceRecordsPath = path.join(defaultWeaponRoot, "source-records.json"),
    externalEvidencePath = path.join(defaultWeaponRoot, "external-evidence.json"),
    officialPilotPath = path.join(defaultWeaponRoot, "official-pilot.json"),
    conflictTriagePath = path.join(defaultWeaponRoot, "conflict-triage.json")
} = {}) {
    const errors = [];
    const expectedPackets = generator.buildPackets({ weaponIds, candidatePath, sourceRecordsPath, externalEvidencePath, officialPilotPath, conflictTriagePath });
    const expectedById = new Map(expectedPackets.map((packet) => [packet.packetId, packet]));
    let files = [];
    try {
        files = packetFiles(packetDirectory);
    } catch (error) {
        errors.push(`packet directory unavailable: ${error.message}`);
    }
    if (files.length !== expectedPackets.length) errors.push(`packet file count ${files.length} != expected ${expectedPackets.length}`);
    const summary = {
        status: "failed",
        packets: 0,
        expectedPackets: expectedPackets.length,
        items: 0,
        weaponIds: [],
        recommendationCounts: Object.fromEntries(generator.RECOMMENDATIONS.map((status) => [status, 0])),
        gameVersionBoundItems: 0,
        fullMatches: 0,
        partialMatches: 0,
        mismatches: 0,
        notComparable: 0,
        canonicalEligibility: 0,
        verificationPromotions: 0,
        representativePilots: 0,
        humanReviewReadyPilots: 0,
        humanReviewedPilots: 0,
        productionCanonicalPilots: 0,
        errors: 0
    };
    for (const file of files) {
        let packet;
        try {
            packet = readJson(file);
        } catch (error) {
            errors.push(`${file}: invalid JSON: ${error.message}`);
            continue;
        }
        const expected = expectedById.get(packet.packetId);
        if (!expected) {
            errors.push(`${file}: unexpected packet ${packet.packetId}`);
            continue;
        }
        auditPacket(packet, expected, errors, summary);
    }
    for (const expected of expectedPackets) {
        if (!files.some((file) => path.basename(file) === `weapon-${expected.target.id}.json`)) errors.push(`${expected.packetId}: packet file missing`);
    }
    const pilot = representativePilot.buildPilot();
    const pilotAudit = representativePilot.auditPilot(pilot);
    summary.representativePilots = 1;
    summary.humanReviewReadyPilots = pilot.assessment.machineEvidenceReady === true && pilot.assessment.state === "humanReviewReady" ? 1 : 0;
    if (pilotAudit.status !== "passed") errors.push(...pilotAudit.errors.map((error) => `representative pilot: ${error}`));
    if (pilot.assessment.canonicalEligibility !== false || pilot.assessment.productionCanonical !== false) errors.push("representative pilot promoted before human review");
    try {
        const decision = readJson(reviewDecisionPath);
        const spec = readJson(weaponSpecsPath)[pilot.target.candidateId];
        const runtime = readJson(canonicalRuntimePath);
        const runtimeId = `genshin:v2:weapon:${pilot.target.id}:${pilot.target.candidateId}`;
        const scopedApproval = decision?.decision === "approve"
            && decision?.target?.candidateId === pilot.target.candidateId
            && decision?.constraints?.appliesOnlyToCandidate === pilot.target.candidateId
            && decision?.constraints?.aiSelfApproval === "forbidden";
        const reviewed = scopedApproval
            && spec?.verification?.status === "verified"
            && spec?.verification?.reviewedBy === decision.reviewedBy
            && spec?.verification?.reviewedAt === decision.reviewedAt
            && spec?.verification?.canonicalEligibility === true;
        summary.humanReviewedPilots = reviewed ? 1 : 0;
        summary.productionCanonicalPilots = reviewed && runtime?.modifiers?.[runtimeId]?.provenance?.status === "canonical" ? 1 : 0;
        if (!reviewed) errors.push("representative pilot scoped human review is not materialized");
        if (summary.productionCanonicalPilots !== 1) errors.push("reviewed representative is missing from production canonical Runtime");
    } catch (error) {
        errors.push(`representative review observation failed: ${error.message}`);
    }
    summary.weaponIds.sort(sortNatural);
    summary.status = errors.length ? "failed" : "passed";
    summary.errors = errors.length;
    return {
        schemaVersion: 1,
        audit: "genshin-review-evidence-packets",
        status: summary.status,
        generatedAt: GENERATED_AT,
        summary,
        errors,
        methodology: {
            sourceA: "Official HoYoLAB primary source records are used only for explicit text, fields, and gameVersion metadata.",
            sourceB: "Pinned gcsim field evidence is treated as an independent implementation; a revision/SHA is not substituted for a gameVersion.",
            independence: "Local catalog, modifier, and review-registry records are excluded from independent A/B counts because they are same-series or derived context.",
            missing: "Any unavailable field is represented as null with blockedReason; silent inference and omission are forbidden.",
            recommendation: "Only machineReady, holdForEvidence, and humanDecisionRequired are permitted; approve/verified/canonical are forbidden.",
            promotion: "The audit never changes verification statuses and never promotes canonical runtime data."
        }
    };
}

function renderMarkdown(report) {
    const summary = report.summary || {};
    const counts = summary.recommendationCounts || {};
    const lines = [
        "# Genshin review evidence packets",
        "",
        `- Audit status: **${report.status}**`,
        `- Packets: **${summary.packets}/${summary.expectedPackets}**`,
        `- Items: **${summary.items}**`,
        `- Weapons: **${(summary.weaponIds || []).join(", ")}**`,
        `- Recommendation counts: **${JSON.stringify(counts)}**`,
        `- Full/partial/mismatch/not-comparable: **${summary.fullMatches}/${summary.partialMatches}/${summary.mismatches}/${summary.notComparable}**`,
        `- Common gameVersion-bound items: **${summary.gameVersionBoundItems}**`,
        `- Canonical eligibility / verification promotions: **${summary.canonicalEligibility}/${summary.verificationPromotions}**`,
        `- Representative pilots / human-review-ready: **${summary.representativePilots}/${summary.humanReviewReadyPilots}**`,
        `- Human-reviewed / production canonical representatives: **${summary.humanReviewedPilots}/${summary.productionCanonicalPilots}**`,
        "",
        "The evidence packets do not perform promotion. The representative's separately recorded scoped human decision and resulting canonical Runtime are observed without extending approval to any other candidate.",
        "",
        "## Recommendation meanings",
        "",
        "- `machineReady`: machine checks are complete, but this is not an approval or canonical promotion.",
        "- `holdForEvidence`: an explicit source field, complete coverage, or gameVersion binding is still missing.",
        "- `humanDecisionRequired`: a semantic mismatch or parser limitation remains after the available evidence is compared.",
        "",
        "## Errors",
        "",
        ...(report.errors?.length ? report.errors.map((error) => `- ${error}`) : ["- none"]),
        ""
    ];
    return lines.join("\n");
}

function writeReport(report, { reportJsonPath = defaultReportJsonPath, reportMarkdownPath = defaultReportMarkdownPath } = {}) {
    fs.mkdirSync(path.dirname(reportJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(reportMarkdownPath), { recursive: true });
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(reportMarkdownPath, renderMarkdown(report), "utf8");
}

function parseArgs(argv) {
    const args = { packetDirectory: defaultPacketDirectory, weaponIds: generator.DEFAULT_WEAPON_IDS.slice() };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--packet-directory") args.packetDirectory = path.resolve(argv[++i]);
        else if (arg === "--weapons") args.weaponIds = String(argv[++i]).split(",").map((value) => value.trim()).filter(Boolean);
        else if (arg === "--candidates") args.candidatePath = path.resolve(argv[++i]);
        else if (arg === "--source-records") args.sourceRecordsPath = path.resolve(argv[++i]);
        else if (arg === "--external-evidence") args.externalEvidencePath = path.resolve(argv[++i]);
        else if (arg === "--official-pilot") args.officialPilotPath = path.resolve(argv[++i]);
        else if (arg === "--conflict-triage") args.conflictTriagePath = path.resolve(argv[++i]);
        else if (arg === "--report-json") args.reportJsonPath = path.resolve(argv[++i]);
        else if (arg === "--report-md") args.reportMarkdownPath = path.resolve(argv[++i]);
        else if (arg === "--help") args.help = true;
        else throw new Error(`unknown argument: ${arg}`);
    }
    return args;
}

if (require.main === module) {
    try {
        const args = parseArgs(process.argv.slice(2));
        if (args.help) {
            console.log("Usage: node scripts/genshinReviewEvidencePacketAudit.cjs [--packet-directory <path>] [--report-json <path>] [--report-md <path>]");
            process.exit(0);
        }
        const report = auditPackets(args);
        writeReport(report, args);
        process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
        if (report.status !== "passed") process.exitCode = 1;
    } catch (error) {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    auditPackets,
    renderMarkdown,
    writeReport
};
