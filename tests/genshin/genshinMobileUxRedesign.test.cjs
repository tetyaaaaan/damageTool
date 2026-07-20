const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile visual repair removes the rejected workspace and restores header order", () => {
    const html = read("games/genshin/index.html");
    const css = read("games/css/tetinet.css");
    const renderer = read("games/js/genshinCalcRenderer.js");

    assert.ok(html.indexOf("teti-brand") < html.indexOf("data-theme-toggle"));
    assert.doesNotMatch(html, /teti-mobile-page-title|genshinMobileWorkspaceTabs|genshinMobileWorkspace\.js/);
    assert.doesNotMatch(html, /<h[34][^>]*><span aria-hidden="true">[1-4]<\/span>/);
    assert.equal(fs.existsSync(path.join(root, "games/js/genshinMobileWorkspace.js")), false);
    assert.match(css, /\.teti-site-header\.has-mobile-navigation \.teti-theme-toggle\s*\{[^}]*margin-left:\s*auto/s);
    assert.match(css, /\.teti-site-header\.has-mobile-navigation \.teti-nav\s*\{[^}]*position:\s*absolute;[^}]*left:\s*0;[^}]*height:\s*calc\(100dvh - 57px\);[^}]*transform:\s*translateX\(-100%\)/s);
    assert.match(css, /\.teti-mobile-menu-backdrop:not\(\[hidden\]\)\s*\{[^}]*position:\s*absolute;[^}]*height:\s*calc\(100dvh - 57px\)/s);
    assert.doesNotMatch(renderer, /genshin-expected-toggle|GenshinMobileWorkspace/);
});

test("mobile selection avoids involuntary keyboard zoom and exposes compact metadata", () => {
    const css = read("games/css/genshin-visual-repair.css");
    const modal = read("games/js/genshinSelectionModal.js");

    assert.match(css, /\.genshin-selection-dialog \.genshin-selection-search-wrap input\s*\{[^}]*font-size:\s*16px/s);
    assert.match(css, /\.genshin-selection-dialog\s*\{[^}]*width:\s*calc\(100% - 24px\)[^}]*height:\s*min\(72dvh, 680px\)/s);
    assert.doesNotMatch(css, /height:\s*100dvh/);
    assert.match(modal, /navigator\.maxTouchPoints > 0/);
    assert.match(modal, /\(pointer: coarse\)/);
    assert.match(modal, /\(hover: hover\) and \(pointer: fine\)/);
    assert.doesNotMatch(modal, /★\$\{item\.rarity\}・\$\{item\.weaponType\}/);
    assert.doesNotMatch(modal, /武器種「\$\{state\.character\.weaponType\}」/);
});

test("mobile result navigation and values keep semantic labels intact", () => {
    const css = read("games/css/genshin-visual-repair.css");

    assert.match(css, /\.genshin-result-tab\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(css, /\.genshin-damage-result-row\s*\{[^}]*display:\s*table-row/s);
    assert.match(css, /\.genshin-damage-result-row td\s*\{[^}]*white-space:\s*nowrap/s);
});

test("layout cards stop at one level while controls keep their own boundaries", () => {
    const css = read("games/css/genshin-visual-repair.css");
    const design = read("docs/GENSHIN_VISUAL_REPAIR_PLAN.md");

    assert.match(css, /\.genshin-panel > \.genshin-fieldset\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.genshin-tool-page \.genshin-panel\s*\{[^}]*background:\s*var\(--teti-surface\);[^}]*border:\s*1px solid/s);
    assert.match(css, /\.genshin-combat-input-grid > \.genshin-profile-stat-inputs\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
    assert.match(css, /\.genshin-result-selection-summary > div\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
    assert.match(css, /\.genshin-condition-card\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s);
    assert.match(css, /\.genshin-condition-card > header\s*\{[^}]*border-top:\s*1px solid/s);
    assert.match(css, /\.genshin-condition-detail-block\s*\{[^}]*border:\s*0;[^}]*border-left:\s*2px solid/s);
    assert.match(design, /レイアウト用カードは外側パネルの一階層だけ/);
});

test("mobile drawer is inaccessible while closed and restored on desktop", () => {
    const navigation = read("games/js/theme.js");

    assert.match(navigation, /nav\.inert = mobileQuery\.matches && !open/);
    assert.match(navigation, /nav\.setAttribute\("aria-hidden", String\(!open\)\)/);
    assert.match(navigation, /else nav\.removeAttribute\("aria-hidden"\)/);
});

test("UID precise stats remain available to the calculation context", () => {
    const { sandbox, elements } = createScenarioHarness();
    prepareScenarioInputs(elements, {
        characterId: "10000046",
        stats: { hp: 30000, atk: 2000, def: 1000, elementalMastery: 100 }
    });
    elements.genshinHpInput.dataset = { preciseValue: "30000.49" };
    elements.genshinAtkInput.dataset = { preciseValue: "2000.49" };

    const context = sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    assert.equal(context.stats.hp, 30000.49);
    assert.equal(context.stats.atk, 2000.49);
    assert.match(read("games/js/genshinUidImporter.js"), /mode === "preciseInteger"/);
});

test("Hu Tao low-HP burst keeps ATK as its scaling stat", () => {
    const scalings = JSON.parse(read("games/genshin/data/calc/talent-scalings.json"));
    const lowHpBurst = scalings["10000046"].burst.entries.find((entry) => entry.id === "hp_skilldamage");
    assert.ok(lowHpBurst);
    assert.equal(lowHpBurst.scalings[0].stat, "atk");
    assert.equal(lowHpBurst.scalings[0].valuesByLevel["10"], 617.44);
});

test("visual repair plan separates rejected UI from unresolved product decisions", () => {
    const design = read("docs/GENSHIN_VISUAL_REPAIR_PLAN.md");
    assert.match(design, /却下されたUIへ追加CSSを重ねない/);
    assert.match(design, /入力／結果切替、期待値の扱い、補正条件モーダル化は今回対象外/);
    assert.match(design, /360px、390px、430px/);
});
