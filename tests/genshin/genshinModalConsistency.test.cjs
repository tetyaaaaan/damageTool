const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

const css = fs.readFileSync(path.join(repositoryRoot, "games/css/genshin-tool-ui.css"), "utf8");
const html = fs.readFileSync(path.join(repositoryRoot, "games/genshin/index.html"), "utf8");
const renderer = fs.readFileSync(path.join(repositoryRoot, "games/js/genshinCalcRenderer.js"), "utf8");

test("selection, party, and condition dialogs use the shared modal contract", () => {
    assert.match(html, /class="genshin-modal genshin-modal--selection genshin-selection-dialog"/);
    assert.match(html, /class="genshin-modal genshin-modal--condition genshin-equipment-details-dialog genshin-condition-dialog"/);
    assert.match(html, /class="genshin-modal genshin-modal--party genshin-equipment-details-dialog genshin-party-dialog"/);
    assert.equal((html.match(/class="genshin-modal-head /g) || []).length, 3);
    assert.equal((html.match(/class="genshin-modal-close /g) || []).length, 3);
    assert.match(css, /\.genshin-modal \.genshin-modal-head \.genshin-kicker\s*\{[\s\S]*?color:\s*var\(--teti-section-accent, var\(--teti-interactive\)\)/);
    assert.match(css, /\.genshin-modal-head h2::before\s*\{[\s\S]*?background:\s*var\(--teti-section-accent, var\(--teti-interactive\)\)/);
});

test("shared frame stays fixed while selection and tab content scroll internally", () => {
    assert.match(css, /\.genshin-modal\s*\{[\s\S]*?height:\s*min\(780px, calc\(100dvh - 28px\)\)[\s\S]*?overflow:\s*hidden/);
    assert.match(css, /\.genshin-modal-scroll-region\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto/);
    assert.equal((html.match(/genshin-modal-scroll-region/g) || []).length, 3);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.genshin-modal\s*\{[\s\S]*?height:\s*min\(72dvh, 680px\)/);
    assert.doesNotMatch(css, /\.genshin-(?:party|condition)-dialog\s*\{[^}]*height:/s);
});

test("condition tab changes visibility without writing modal geometry", () => {
    const selectTab = renderer.match(/function selectConditionTab\(tabId\)\s*\{[\s\S]*?\n    \}/)?.[0] || "";
    assert.match(selectTab, /classList\.toggle\("is-active", selected\)/);
    assert.match(selectTab, /panel\.hidden = panel\.dataset\.conditionPanel !== tabId/);
    assert.doesNotMatch(selectTab, /\.style|setProperty\(|\b(?:height|top|bottom)\s*=/);
});
