const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBrowserScriptHarness, repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

test("calculation warnings use the current label and escape their messages", () => {
    const warningWrap = { hidden: true, innerHTML: "" };
    const { sandbox } = createBrowserScriptHarness(["games/js/genshinCalcRenderer.js"], {
        genshinJsonCalcWarnings: warningWrap
    });

    sandbox.GenshinCalcRenderer.renderWarnings([{ message: "キャラクターが未選択です。<unsafe>" }]);

    assert.equal(warningWrap.hidden, false);
    assert.match(warningWrap.innerHTML, /^<strong>警告<\/strong><ul>/);
    assert.doesNotMatch(warningWrap.innerHTML, /JSON警告/);
    assert.match(warningWrap.innerHTML, /<li>キャラクターが未選択です。&lt;unsafe&gt;<\/li>/);

    sandbox.GenshinCalcRenderer.renderWarnings([]);
    assert.equal(warningWrap.hidden, true);
    assert.equal(warningWrap.innerHTML, "");
});

test("warning list marker is padded inside the warning box", () => {
    const css = fs.readFileSync(path.join(repositoryRoot, "games/css/tetinet.css"), "utf8");

    assert.match(css, /\.genshin-json-calc-warnings ul\s*\{[\s\S]*padding-left:\s*1\.25rem[\s\S]*list-style-position:\s*outside/);
    assert.match(css, /\.genshin-json-calc-warnings li\s*\{[\s\S]*padding-left:\s*2px/);
});
