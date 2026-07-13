const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildGoldenScenarios } = require("../../scripts/generateGenshinGolden.cjs");

test("STEP 24 representative character scenarios match the reviewed golden values", async () => {
    const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "golden-scenarios.json"), "utf8"));
    const actual = await buildGoldenScenarios();
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
});
