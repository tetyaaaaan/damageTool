const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const isWebp = (filePath) => {
    const header = fs.readFileSync(filePath).subarray(0, 12);
    return header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
};

test("approved status order is a two-column semantic sequence", () => {
    const html = read("games/genshin/index.html");
    const ids = [
        "genshinHpInput",
        "genshinCritRateInput",
        "genshinAtkInput",
        "genshinCritDamageInput",
        "genshinDefInput",
        "genshinEnergyRechargeInput",
        "genshinElementalMasteryInput",
        "genshinElementalDamageInput"
    ];
    const positions = ids.map((id) => html.indexOf(`id="${id}"`));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    assert.equal((html.match(/class="genshin-stat-label"/g) || []).length, 8);
});

test("local UI uses sourced in-game stat and weapon icons", () => {
    const html = read("games/genshin/index.html");
    ["hp", "attack", "defense", "elemental-mastery", "critical", "energy-recharge"]
        .forEach((name) => {
            const file = path.join(root, `games/images/genshin/ui/stat-${name}.webp`);
            assert.ok(fs.statSync(file).size > 0, `${name} icon should not be empty`);
            assert.ok(isWebp(file), `${name} icon should contain WebP data`);
            assert.match(html, new RegExp(`/games/images/genshin/ui/stat-${name}\\.webp`));
        });
    ["sword", "claymore", "polearm", "bow", "catalyst"]
        .forEach((name) => {
            const file = path.join(root, `games/images/genshin/ui/weapon-${name}.webp`);
            assert.ok(fs.statSync(file).size > 0);
            assert.ok(isWebp(file), `${name} icon should contain WebP data`);
        });
    assert.doesNotMatch(html, /ui-icons\.svg/);
});

test("character choices are icon-first and expose visual metadata accessibly", () => {
    const modal = read("games/js/genshinSelectionModal.js");
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(modal, /className = "genshin-selection-option-badges"/);
    assert.match(modal, /genshin-selection-element-icon/);
    assert.match(modal, /genshin-selection-weapon-icon/);
    assert.match(modal, /ui\/weapon-\$\{WEAPON_ICON_NAMES\[item\.weaponType\]\}\.webp/);
    assert.match(modal, /setAttribute\("aria-label", `\$\{item\.nameJa\}/);
    assert.match(css, /\.genshin-selection-dialog\.is-character \.genshin-selection-list\s*\{[^}]*repeat\(3,/s);
    assert.match(css, /\.genshin-selection-dialog\.is-character \.genshin-selection-option-image\s*\{[^}]*width:\s*64px/s);
});

test("condition descriptions use one label and declare their source kind", () => {
    const conditions = read("games/js/genshinCalcConditions.js");
    const renderer = read("games/js/genshinCalcRenderer.js");

    assert.match(conditions, /descriptionKind:\s*"full"/);
    assert.match(conditions, /descriptionKind:\s*"summary"/);
    assert.match(conditions, /descriptionKind:\s*descriptionKind/);
    assert.match(renderer, /効果説明/);
    assert.match(renderer, /DESCRIPTION_KIND_LABELS/);
    assert.doesNotMatch(renderer, /効果の原文|セット効果の原文|武器効果の原文|星座効果の原文|天賦効果の原文/);
});

test("select typography and modal filter height are explicit", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-tool-page :is\(input, select, option, button\)\s*\{[^}]*font-family:\s*var\(--teti-font-sans\)/s);
    assert.match(css, /\.genshin-selection-(?:dialog-head|search-wrap|filters|summary)[^}]*flex:\s*0 0 auto/s);
    assert.match(css, /\.genshin-filter-row\s*\{[^}]*min-height:\s*40px/s);
    assert.match(css, /\.genshin-selection-list\s*\{[^}]*flex:\s*1 1 0/s);
});

test("phase 2 design records responsive test widths", () => {
    const design = read("docs/GENSHIN_APPROVED_UI_PHASE2.md");
    assert.match(design, /360px、390px、430px/);
    assert.match(design, /全文.*該当箇所.*要約.*自動説明/);
});
