"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness } = require("../tests/genshin/helpers/browserScriptHarness.cjs");
const { createScenarioHarness, prepareScenarioInputs } = require("../tests/genshin/helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "reports", "genshin-representative-canonical-e2e.json");
const markdownPath = path.join(root, "reports", "genshin-representative-canonical-e2e.md");
const modifierId = "genshin:v2:weapon:12516:w_12516_stat_1";
const candidateId = "w_12516_stat_1";
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

function buildAudit() {
    const errors = [];
    const sourceRecords = read("games/genshin/data/v2/weapons/source-records.json");
    const spec = read("games/genshin/data/v2/weapons/spec-candidates.json")[candidateId];
    const runtime = read("games/genshin/data/v2/runtime/canonical-runtime.json");
    const sources = (spec?.sourceRefs || []).map((ref) => sourceRecords[ref]).filter(Boolean);
    if (sources.length !== 2 || sources.some((source) => source.strictGameVersionBinding !== true || source.gameVersion !== "6.7")) errors.push("strict dual-source 6.7 evidence missing");
    if (spec?.verification?.status !== "verified" || spec?.verification?.canonicalEligibility !== true) errors.push("scoped human review is not canonical-eligible");
    if (spec?.effect?.stack !== undefined || spec?.effect?.valueByRefinementPerStack !== undefined) errors.push("reaction stack semantics leaked into unconditional ATK");

    const scenario = createScenarioHarness();
    const loader = createBrowserScriptHarness(["games/js/genshinDataContract.js", "games/js/genshinCalcData.js"]).sandbox.GenshinCalcData;
    const productionLoadSummary = loader.applyCanonicalRuntime(scenario.calcData, runtime, scenario.calcData.warnings);
    const legacyRetained = scenario.calcData.weaponModifiers?.["12516"]?.modifiers?.some((item) => item.id === candidateId) === true;
    if (productionLoadSummary.applied !== 0 || productionLoadSummary.inactivePendingRevalidation !== 2 || !legacyRetained) {
        errors.push("live-version production gate did not hold only the canonical overlay");
    }
    const historicalRuntime = structuredClone(runtime);
    historicalRuntime.versionAvailability = { status: "active", activeForProduction: true };
    const loadSummary = loader.applyCanonicalRuntime(scenario.calcData, historicalRuntime, scenario.calcData.warnings);
    const canonical = scenario.calcData.weaponModifiers?.["12516"]?.modifiers?.find((item) => item.id === modifierId);
    if (!canonical) errors.push("canonical Runtime modifier was not loaded");

    prepareScenarioInputs(scenario.elements, { characterId: "10000016", weaponId: "12516", stats: { atk: 2000, baseAtk: 1000 } });
    scenario.elements.genshinWeaponRefinement.value = "R5";
    const request = scenario.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.inputProvenance = { source: "manual", includesPersistentBonuses: true, additivePolicy: "externalModifiersOnly" };
    const panel = scenario.sandbox.GenshinCalcConditions.conditionPanelState(request, scenario.calcData);
    const conditionTogglePresent = panel.complexConditionInputs.some((item) => item.modifierId === modifierId);
    const analysis = canonical
        ? scenario.sandbox.GenshinModifierAnalyzer.analyzeModifier({ modifier: canonical, source: "weapon:12516", context: request })
        : {};
    const calculation = scenario.sandbox.GenshinCalcEngine.calculateDamageRequest(request, scenario.calcData);
    const doubleApplied = calculation.statTrace.some((item) => item.modifierId === modifierId);
    if (conditionTogglePresent) errors.push("unconditional reflected ATK exposed an incorrect UI toggle");
    if (analysis.inputStatus !== "includedInInput") errors.push("persistent ATK was not recognized as included in final input stats");
    if (calculation.context?.effectiveStats?.atk !== 2000 || doubleApplied) errors.push("persistent ATK was double-applied");
    if (!calculation.results?.length) errors.push("calculation produced no result");

    return {
        schemaVersion: 1,
        audit: "genshin-representative-canonical-e2e",
        generatedAt: "2026-08-23T00:00:00.000Z",
        status: errors.length ? "failed" : "passed",
        target: { kind: "weapon", id: "12516", candidateId, modifierId, gameVersion: "6.7" },
        trace: {
            rawSource: sources.map((source) => ({ id: source.id, provider: source.provider, independenceGroup: source.independenceGroup, locator: source.locator, text: source.text, gameVersion: source.gameVersion, strictGameVersionBinding: source.strictGameVersionBinding })),
            structuredSpec: { status: spec?.verification?.status, reviewedBy: spec?.verification?.reviewedBy, reviewedAt: spec?.verification?.reviewedAt, canonicalEligibility: spec?.verification?.canonicalEligibility, valueByRefinement: spec?.effect?.valueByRefinement, stackAbsent: spec?.effect?.stack === undefined && spec?.effect?.valueByRefinementPerStack === undefined },
            canonicalRuntime: {
                present: Boolean(runtime.modifiers?.[modifierId]),
                availability: runtime.versionAvailability,
                productionLoader: productionLoadSummary,
                historicalLoader: loadSummary,
                loader: loadSummary,
                legacyRetainedInProduction: legacyRetained,
                legacySupersededInHistoricalFixture: loadSummary.superseded === 1
            },
            ui: { characterId: request.characterId, weaponId: request.weaponId, refinement: request.refinement, conditionTogglePresent, inputStatus: analysis.inputStatus || null },
            calculation: { results: calculation.results?.length || 0, inputAtk: 2000, effectiveAtk: calculation.context?.effectiveStats?.atk ?? null, doubleApplied }
        },
        routeEstablished: errors.length === 0,
        errors
    };
}

function renderMarkdown(report) {
    const trace = report.trace;
    return [
        "# Genshin representative canonical E2E",
        "",
        `Status: **${report.status}**`,
        "",
        `- Target: **${report.target.id} / ${report.target.candidateId}**`,
        `- Raw sources: **${trace.rawSource.length}** strict independent sources for Genshin **${report.target.gameVersion}**`,
        `- Human review: **${trace.structuredSpec.status}** by **${trace.structuredSpec.reviewedBy}**`,
        `- Canonical Runtime: **${trace.canonicalRuntime.present}**; production active/pending: **${trace.canonicalRuntime.productionLoader.applied}/${trace.canonicalRuntime.productionLoader.inactivePendingRevalidation || 0}**; historical fixture applied/superseded: **${trace.canonicalRuntime.historicalLoader.applied}/${trace.canonicalRuntime.historicalLoader.superseded}**`,
        `- UI: weapon **${trace.ui.weaponId}**, refinement **R${trace.ui.refinement}**, incorrect toggle: **${trace.ui.conditionTogglePresent}**`,
        `- Calculation: **${trace.calculation.results}** results; effective ATK **${trace.calculation.effectiveAtk}**; double-applied: **${trace.calculation.doubleApplied}**`,
        "",
        "The persistent self ATK bonus is represented in canonical provenance and recognized as already included in final manual/UID stats, so the result UI does not expose a cause-less toggle and the engine does not add it twice.",
        "",
        ...(report.errors.length ? ["## Errors", "", ...report.errors.map((error) => `- ${error}`), ""] : [])
    ].join("\n");
}

function writeAudit(report = buildAudit()) {
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(markdownPath, renderMarkdown(report), "utf8");
    return report;
}

if (require.main === module) {
    const report = writeAudit();
    process.stdout.write(`${JSON.stringify({ status: report.status, target: report.target, trace: report.trace }, null, 2)}\n`);
    if (report.status !== "passed") process.exitCode = 1;
}

module.exports = { buildAudit, jsonPath, markdownPath, renderMarkdown, writeAudit };
