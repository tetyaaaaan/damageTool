"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 11,
    batchIds: [
        "10000123", "10000124", "10000125", "10000126", "10000127",
        "10000128", "10000129", "10000130", "10000131", "10000132"
    ],
    capturedAt: "2026-08-15T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch11Generate.cjs",
    mode: "batch11",
    outputDirectory: "behavior-batch-11"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
