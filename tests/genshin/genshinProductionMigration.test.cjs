const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("STEP 18 promotes JSON calculation while retaining the legacy fallback", () => {
    const html = read("games/genshin/index.html");
    assert.match(html, /id="dmg_button"[^>]+data-genshin-calc-path="legacy"[^>]+onclick="calc\(\)"/);
    assert.match(html, /data-genshin-calc-primary="json"/);
    assert.match(html, /id="genshinJsonCalcButton"[^>]+data-genshin-calc-path="json"/);
    assert.match(html, /従来計算を実行（互換）/);
    assert.match(html, /JSON計算 <span class="genshin-calc-recommended">推奨<\/span>/);
});

test("JSON production calculation refreshes conditions before reading the calculation inputs", () => {
    const renderer = read("games/js/genshinCalcRenderer.js");
    const handlerStart = renderer.indexOf("async function handleJsonCalcClick()");
    const handlerEnd = renderer.indexOf("function initializeGenshinCalcRenderer()", handlerStart);
    const handler = renderer.slice(handlerStart, handlerEnd);
    const refreshIndex = handler.indexOf("await handlePrepareConditionsClick()");
    const calculateIndex = handler.indexOf("runGenshinJsonCalc()");
    assert.ok(refreshIndex >= 0);
    assert.ok(calculateIndex > refreshIndex);
});
