const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..", "..");

function read(relativePath) {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("STEP44-46 promotes structured calculation as the only production path", () => {
    const html = read("games/genshin/index.html");
    assert.doesNotMatch(html, /data-genshin-calc-path="legacy"|onclick="calc\(\)"|id="dmg_button"/);
    assert.match(html, /data-genshin-calc-primary="structured"/);
    assert.match(html, /id="genshinJsonCalcButton"[^>]+data-genshin-calc-path="structured"[^>]*>ダメージ計算を実行<\/button>/);
    assert.doesNotMatch(html, /従来計算|JSON計算/);
});

test("JSON production calculation refreshes conditions before reading the calculation inputs", () => {
    const renderer = read("games/js/genshinCalcRenderer.js");
    const handlerStart = renderer.indexOf("async function handleJsonCalcClick()");
    const handlerEnd = renderer.indexOf("function initializeGenshinCalcRenderer()", handlerStart);
    const handler = renderer.slice(handlerStart, handlerEnd);
    const refreshIndex = handler.indexOf("await handlePrepareConditionsClick()");
    const calculateIndex = handler.indexOf("runGenshinJsonCalc()");
    const renderIndex = handler.indexOf("renderDamageTabs(payload)");
    const scrollIndex = handler.indexOf("scrollToCalcResults()");
    assert.ok(refreshIndex >= 0);
    assert.ok(calculateIndex > refreshIndex);
    assert.ok(renderIndex > calculateIndex);
    assert.ok(scrollIndex > renderIndex);
});

test("calculation controls keep a dedicated reload design and result scrolling", () => {
    const html = read("games/genshin/index.html");
    const css = read("games/css/tetinet.css");
    const renderer = read("games/js/genshinCalcRenderer.js");

    assert.match(html, /class="[^"]*genshin-prepare-button[^"]*" id="genshinJsonPrepareConditionsButton"/);
    assert.match(html, /<span aria-hidden="true">↻<\/span>計算条件を再読み込み/);
    assert.match(css, /\.genshin-tool-page \.genshin-prepare-button \{/);
    assert.match(renderer, /function scrollToCalcResults\(\)/);
    assert.match(renderer, /window\.scrollTo\(\{[\s\S]*behavior: "smooth"/);
});
