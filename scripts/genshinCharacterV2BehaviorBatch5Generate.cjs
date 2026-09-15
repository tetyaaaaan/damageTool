"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 5,
    batchIds: [
        "10000056", "10000057", "10000059", "10000060", "10000062",
        "10000063", "10000064", "10000065", "10000066", "10000067"
    ],
    capturedAt: "2026-08-16T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch5Generate.cjs",
    mode: "batch5",
    outputDirectory: "behavior-batch-5"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
