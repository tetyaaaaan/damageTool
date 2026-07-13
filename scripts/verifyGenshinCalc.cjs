"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildAudit } = require("./genshinModifierAudit.cjs");
const { buildGoldenScenarios } = require("./generateGenshinGolden.cjs");

const repositoryRoot = path.resolve(__dirname, "..");

async function verify() {
    const audit = buildAudit();
    assert.equal(audit.summary.byPriority.P0 || 0, 0, "P0 audit records remain");
    assert.equal(audit.summary.byPriority.P1 || 0, 0, "P1 audit records remain");

    const expected = JSON.parse(fs.readFileSync(path.join(repositoryRoot, "tests/genshin/fixtures/golden-scenarios.json"), "utf8"));
    const actual = await buildGoldenScenarios();
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, "golden scenarios changed");

    const tests = fs.readdirSync(path.join(repositoryRoot, "tests/genshin"))
        .filter((name) => name.endsWith(".test.cjs"))
        .map((name) => path.join("tests", "genshin", name));
    const result = spawnSync(process.execPath, ["--test", ...tests], {
        cwd: repositoryRoot,
        stdio: "inherit"
    });
    if (result.status !== 0) process.exit(result.status || 1);
}

verify().catch((error) => {
    console.error(error);
    process.exit(1);
});
