"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 10,
    batchIds: [
        "10000111", "10000112", "10000113", "10000114", "10000115",
        "10000116", "10000119", "10000120", "10000121", "10000122"
    ],
    capturedAt: "2026-08-15T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch10Generate.cjs",
    mode: "batch7",
    outputDirectory: "behavior-batch-10"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
