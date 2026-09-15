"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 9,
    batchIds: [
        "10000101", "10000102", "10000103", "10000104", "10000105",
        "10000106", "10000107", "10000108", "10000109", "10000110"
    ],
    capturedAt: "2026-08-15T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch9Generate.cjs",
    mode: "batch7",
    outputDirectory: "behavior-batch-9"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
