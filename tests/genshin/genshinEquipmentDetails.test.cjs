const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(read(relativePath));

test("equipment details use the existing talent, constellation, and weapon effect data", () => {
    const html = read("games/genshin/index.html");
    const resolver = read("games/js/genshinIdResolver.js");
    const details = read("games/js/genshinEquipmentDetails.js");

    assert.match(html, /id="genshinEquipmentDetailsDialog"/);
    assert.match(html, /genshinEquipmentDetails\.js/);
    assert.match(resolver, /character-talents\.json/);
    assert.match(resolver, /resolveCharacterTalent/);
    assert.match(details, /resolveCharacterConstellation/);
    assert.match(details, /天賦/);
    assert.match(details, /固有天賦/);
    assert.match(details, /命ノ星座/);
    assert.match(details, /resolveWeaponEffect/);
    assert.match(details, /effectParamsByRefinement/);
});

test("details modal remains an inset, scrollable dialog on mobile", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-equipment-details-dialog\s*\{[^}]*width:\s*min\(640px, calc\(100% - 32px\)\)/s);
    assert.match(css, /\.genshin-equipment-details-dialog\s*\{[^}]*max-height:\s*min\(680px, 78dvh\)/s);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.genshin-equipment-details-dialog\s*\{[^}]*width:\s*calc\(100% - 24px\)/s);
    assert.match(css, /\.genshin-equipment-details-body\s*\{[^}]*overflow-y:\s*auto/s);
});

test("native select options have explicit readable colors in both themes", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-tool-page select\s*\{[^}]*color-scheme:\s*light/s);
    assert.match(css, /\.genshin-tool-page select option\s*\{[^}]*color:\s*#17252e;[^}]*background:\s*#fff/s);
    assert.match(css, /html\[data-theme="dark"\] \.genshin-tool-page select\s*\{[^}]*color-scheme:\s*dark/s);
    assert.match(css, /html\[data-theme="dark"\] \.genshin-tool-page select option\s*\{[^}]*color:\s*#edf7fb;[^}]*background:\s*#0b202b/s);
});

test("quest-only Isshin blades stay resolvable but are excluded from selection", () => {
    const weapons = readJson("games/genshin/data/weapons.json");
    const selection = read("games/js/genshinSelectionModal.js");

    ["11419", "11420", "11421"].forEach((id) => {
        assert.equal(weapons[id].nameJa, "「一心伝」名刀");
        assert.equal(weapons[id].selectable, false);
    });
    assert.notEqual(weapons["11416"].selectable, false, "籠釣瓶一心 is a regular selectable weapon");
    assert.match(selection, /filter\(\(item\) => item\.selectable !== false\)/);
});
