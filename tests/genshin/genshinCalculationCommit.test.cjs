const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

const rendererSource = fs.readFileSync(path.join(repositoryRoot, "games/js/genshinCalcRenderer.js"), "utf8");

function functionBody(name, nextDeclaration) {
    const pattern = new RegExp(`async function ${name}\\(\\) \\{([\\s\\S]*?)\\n    \\}\\n\\n    ${nextDeclaration}`);
    return rendererSource.match(pattern)?.[1] || "";
}

test("condition edits only refresh summaries and mark rendered damage stale", () => {
    const body = functionBody("handleConditionValueChange", "function getCalcButtons");
    assert.match(body, /await handlePrepareConditionsClick\(\)/);
    assert.match(body, /setCalculationDirty\(true\)/);
    assert.doesNotMatch(body, /runGenshinJsonCalc|store\?\.record|renderDamageTabs/);
});

test("explicit calculation commits results and comparison together", () => {
    const body = functionBody("handleJsonCalcClick", "function initializeGenshinCalcRenderer");
    assert.match(body, /runGenshinJsonCalc\(\)/);
    assert.match(body, /store\?\.record\?\.\(payload\.snapshot\)/);
    assert.match(body, /renderDamageTabs\(payload\)/);
    assert.match(body, /setCalculationDirty\(false\)/);
    assert.ok(body.indexOf("record?.(payload.snapshot)") < body.indexOf("setCalculationDirty(false)"));
});

test("result panel provides an accessible pending-calculation notice", () => {
    const html = fs.readFileSync(path.join(repositoryRoot, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(repositoryRoot, "games/css/genshin-tool-ui.css"), "utf8");
    assert.match(html, /id="genshinCalculationDirtyNotice"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
    assert.match(html, /入力内容が変更されています。ダメージ計算を実行して結果を更新してください。/);
    assert.match(css, /\.genshin-calculation-dirty-notice\s*\{/);
});
