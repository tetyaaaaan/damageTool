const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("UID success content is grouped in one result surface", () => {
    const html = read("games/genshin/index.html");
    const importer = read("games/js/genshinUidImporter.js");

    assert.match(html, /class="genshin-uid-result" id="genshinUidResult" hidden/);
    assert.match(importer, /getElement\("genshinUidResult"\)/);
    assert.match(importer, /clearProfileResult\(\)/);
    assert.match(importer, /genshin-profile-character-image/);
    assert.match(importer, /genshin-profile-weapon-image/);
});

test("UID mobile stats remain dense without nested section cards", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-uid-result\s*\{[^}]*background:[^}]*border:/s);
    assert.match(css, /\.genshin-uid-result > \[hidden\]\s*\{[^}]*display:\s*none !important;/s);
    assert.match(css, /\.genshin-profile-two-col section\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.genshin-talent-grid\s*\{[^}]*repeat\(3,/);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.genshin-stat-grid\s*\{[^}]*repeat\(2,/);
    assert.match(css, /\.genshin-uid-result \.character-build-grid dt\s*\{[^}]*font-size:\s*\.7rem/s);
    assert.match(css, /\.genshin-uid-result \.character-build-grid dd\s*\{[^}]*font-size:\s*\.8125rem/s);
    assert.match(css, /\.genshin-uid-result \.uid-importer__selector select\s*\{[^}]*min-height:\s*44px/s);
});

test("UID summary stacks the critical stats below elemental mastery when its status area is narrow", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-uid-two-col > section:last-child\s*\{[^}]*container:\s*genshin-uid-status \/ inline-size;/s);
    assert.match(css, /@container genshin-uid-status \(max-width: 380px\)[\s\S]*\.genshin-uid-summary-stats\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(css, /@container genshin-uid-status \(max-width: 380px\)[\s\S]*\.genshin-uid-summary-stats \.genshin-uid-stat-list\s*\{[^}]*display:\s*grid;/s);
});

test("UID result summary uses the approved character-equipment layout without touching calculator rendering", () => {
    const importer = read("games/js/genshinUidImporter.js");
    const renderer = read("games/js/genshinCalcRenderer.js");
    const html = read("games/genshin/index.html");
    const uiCss = read("games/css/genshin-tool-ui.css");

    assert.match(importer, /renderUidSummary\(character\)/);
    assert.match(importer, /genshin-uid-details-button/);
    assert.match(importer, /renderUidArtifactRows/);
    assert.match(importer, /renderUidElementStats/);
    assert.match(importer, /renderWeaponEffectText\(weapon\)/);
    assert.match(importer, /renderArtifactEffects\(character\.artifacts \|\| \[\]\)/);
    assert.match(importer, /renderUidElementStats\(character, true\)/);
    assert.match(importer, /renderStatItem\(item\.label, item\.value, \(value\) => formatDecimal\(value, 2, "%"\), iconPath\)/);
    assert.match(importer, /genshin-uid-badge genshin-uid-rarity/);
    assert.match(importer, /genshin-uid-badge genshin-uid-constellation/);
    assert.match(importer, /genshin-uid-icon-tag genshin-uid-element-tag/);
    assert.match(importer, /genshin-profile-stat-icon genshin-profile-stat-icon--element/);
    assert.match(importer, /`Lv\.\$\{formatInteger\(value\)\}`/);
    assert.match(importer, /undefined, "通常"/);
    assert.match(importer, /undefined, "スキル"/);
    assert.match(importer, /undefined, "爆発"/);
    assert.match(html, /id="genshinUidDetailsDialog"/);
    assert.match(uiCss, /\.genshin-uid-two-col\s*\{[^}]*grid-template-columns:\s*145px minmax\(0, 1fr\)/s);
    assert.match(uiCss, /@media \(max-width: 680px\)[\s\S]*\.genshin-uid-two-col\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(uiCss, /@media \(max-width: 680px\)[\s\S]*\.genshin-uid-talent-list\s*\{[^}]*repeat\(3,/s);
    assert.match(uiCss, /\.genshin-uid-label-short\s*\{[^}]*display:\s*none/s);
    assert.match(uiCss, /\.genshin-uid-two-col dt \.genshin-profile-stat-icon,[\s\S]*width:\s*14px/);
    assert.match(uiCss, /\.genshin-profile-stat-icon--element\s*\{[^}]*background:\s*rgba\(4, 20, 29, \.78\)/s);
    assert.match(uiCss, /\.genshin-uid-two-col \.genshin-uid-stat-list > div,[\s\S]*display:\s*contents;/);
    assert.match(uiCss, /\.genshin-uid-talent-list,[\s\S]*\.genshin-uid-stat-list,[\s\S]*grid-template-rows:\s*none;[\s\S]*grid-auto-flow:\s*row;/);
    assert.doesNotMatch(uiCss.replace(/\.genshin-uid-result > \[hidden\][\s\S]*?\}/, ""), /!important/);
    assert.doesNotMatch(renderer, /genshin-uid-profile-summary|renderUidSummary/);
});

test("large character icon input mock stays separate from production", () => {
    const mock = read("mockups/genshin-character-equipment-large-icon.html");
    const preview = read("mockups/genshin-character-equipment-large-icon.svg");
    const production = read("games/genshin/index.html");

    assert.match(mock, /10000046\.webp/);
    assert.match(mock, /grid-row:\s*1 \/ 3/);
    assert.match(mock, /本体未反映の確認用モック/);
    assert.match(preview, /width="76" height="108"/);
    assert.doesNotMatch(production, /genshin-character-equipment-large-icon/);
});
