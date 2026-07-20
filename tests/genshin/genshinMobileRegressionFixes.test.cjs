const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("mobile menu opens above its backdrop and updates accessibility state", () => {
    const source = read("games/js/theme.js");
    const css = read("games/css/tetinet.css");

    assert.match(source, /button\.addEventListener\("click", function \(\) \{\s*setOpen\(!header\.classList\.contains\("is-menu-open"\), false\)/s);
    assert.match(source, /button\.setAttribute\("aria-expanded", String\(open\)\)/);
    assert.match(source, /nav\.inert = mobileQuery\.matches && !open/);
    assert.match(css, /\.teti-site-header\.has-mobile-navigation\.is-menu-open\s*\{[^}]*z-index:\s*90/s);
    assert.match(css, /\.teti-mobile-menu-backdrop:not\(\[hidden\]\)\s*\{[^}]*z-index:\s*70/s);
});

test("character filter keeps Traveler and clear beside rarity filters", () => {
    const modal = read("games/js/genshinSelectionModal.js");

    assert.match(modal, /const ELEMENTS = \["炎", "水", "風", "雷", "草", "氷", "岩"\]/);
    assert.match(modal, /const rarityRow = makeFilterRow\("レアリティと旅人", "rarity", CHARACTER_RARITIES\)/);
    assert.match(modal, /rarityRow\.appendChild\(makeFilterButton\("element", "-"\)\)/);
    assert.ok(modal.indexOf('rarityRow.appendChild(makeFilterButton("element", "-"))') < modal.indexOf("rarityRow.appendChild(toggleAll)"));
});

test("mobile talent selectors keep the compact control font", () => {
    const css = read("games/css/genshin-visual-repair.css");

    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.genshin-tool-page \.genshin-reflect-inputs \.genshin-compact-triple select\s*\{[^}]*font-size:\s*var\(--genshin-ui-control\)/s);
});
