const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

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

test("local UI sprite contains approved stat and weapon symbols", () => {
    const sprite = read("games/images/genshin/ui-icons.svg");
    ["hp", "attack", "defense", "elemental-mastery", "crit-rate", "crit-damage", "energy-recharge", "elemental-damage"]
        .forEach((name) => assert.match(sprite, new RegExp(`id="stat-${name}"`)));
    ["sword", "claymore", "polearm", "bow", "catalyst"]
        .forEach((name) => assert.match(sprite, new RegExp(`id="weapon-${name}"`)));
});

test("character choices are icon-first and expose visual metadata accessibly", () => {
    const modal = read("games/js/genshinSelectionModal.js");
    const css = read("games/css/genshin-visual-repair.css");

    assert.match(modal, /className = "genshin-selection-option-badges"/);
    assert.match(modal, /genshin-selection-element-icon/);
    assert.match(modal, /genshin-selection-weapon-icon/);
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
    const css = read("games/css/genshin-visual-repair.css");

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
