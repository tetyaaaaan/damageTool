const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { repositoryRoot } = require("./helpers/browserScriptHarness.cjs");

const css = fs.readFileSync(path.join(repositoryRoot, "games/css/genshin-tool-ui.css"), "utf8");

test("selection, party, and condition modal headers share the section accent", () => {
    assert.match(css, /\.genshin-equipment-details-head \.genshin-kicker\s*\{[\s\S]*?color:\s*var\(--teti-section-accent\)/);
    assert.match(css, /\.genshin-selection-dialog-head \.genshin-kicker\s*\{[\s\S]*?color:\s*var\(--teti-section-accent\)/);
    assert.match(css, /\.genshin-equipment-details-head h2\s*\{[\s\S]*?border:\s*0/);
    assert.match(css, /\.genshin-equipment-details-head h2::before\s*\{[\s\S]*?background:\s*var\(--teti-section-accent\)/);
});

test("party and condition dialogs keep a stable frame while their bodies scroll", () => {
    assert.match(css, /\.genshin-party-dialog\s*\{[\s\S]*?height:\s*min\(780px, calc\(100dvh - 28px\)\)/);
    assert.match(css, /\.genshin-condition-dialog\s*\{[\s\S]*?height:\s*min\(780px, calc\(100dvh - 28px\)\)/);
    assert.match(css, /\.genshin-party-member-list\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /\.genshin-condition-dialog-body\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.genshin-condition-dialog\s*\{[\s\S]*?height:\s*min\(72dvh, 680px\)/);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.genshin-party-dialog\s*\{[\s\S]*?height:\s*min\(72dvh, 680px\)/);
});
