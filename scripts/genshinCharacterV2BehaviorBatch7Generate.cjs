"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 7,
    batchIds: [
        "10000078", "10000079", "10000080", "10000081", "10000082",
        "10000083", "10000084", "10000085", "10000086", "10000087"
    ],
    capturedAt: "2026-08-15T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch7Generate.cjs",
    mode: "batch7",
    outputDirectory: "behavior-batch-7"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
