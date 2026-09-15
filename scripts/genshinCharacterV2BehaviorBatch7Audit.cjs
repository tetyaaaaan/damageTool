"use strict";

const { createBehaviorBatchAudit } = require("./genshinCharacterV2BehaviorBatchAuditCore.cjs");
const generator = require("./genshinCharacterV2BehaviorBatch7Generate.cjs");

const api = createBehaviorBatchAudit({ generator, batch: 7, mode: "batch7" });

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || generator.defaultDataRoot;
    const outputRoot = process.env["GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_7_ROOT"] || generator.defaultOutputRoot;
    const report = api.auditBehaviorBatch({ dataRoot, outputRoot });
    api.writeReports({ report, reportJson: process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_7_REPORT_JSON || api.defaultReportJson, reportMarkdown: process.env.GENSHIN_CHARACTER_V2_BEHAVIOR_BATCH_7_REPORT_MD || api.defaultReportMarkdown });
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
    if (report.errors.length) process.exitCode = 1;
}

module.exports = api;
