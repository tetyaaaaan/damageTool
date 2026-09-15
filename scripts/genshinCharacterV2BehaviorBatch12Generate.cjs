"use strict";

const { createBehaviorBatchGenerator } = require("./genshinCharacterV2BehaviorBatchCore.cjs");

const api = createBehaviorBatchGenerator({
    batch: 12,
    batchIds: ["10000133"],
    capturedAt: "2026-08-15T00:00:00.000Z",
    generatorName: "genshinCharacterV2BehaviorBatch12Generate.cjs",
    mode: "batch7",
    outputDirectory: "behavior-batch-12"
});

if (require.main === module) {
    const dataRoot = process.env.GENSHIN_DATA_ROOT || api.defaultDataRoot;
    const outputRoot = process.env[api.outputEnv] || api.defaultOutputRoot;
    process.stdout.write(`${JSON.stringify(api.writeDataset({ dataRoot, outputRoot }).summary, null, 2)}\n`);
}

module.exports = api;
