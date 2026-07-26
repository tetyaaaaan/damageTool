const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("character and weapon cards only become columns when their own width is sufficient", () => {
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(css, /\.genshin-equipment-step\s*\{[^}]*container-type:\s*inline-size/s);
    assert.match(css, /\.genshin-profile-form-grid\.genshin-equipment-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    assert.match(css, /@container \(min-width: 720px\)[\s\S]*grid-template-columns:\s*repeat\(2,/);
});

test("longest current names fit the conservative 360px and desktop card budgets", () => {
    const characters = Object.values(readJson("games/genshin/data/characters.json"));
    const weapons = Object.values(readJson("games/genshin/data/weapons.json")).filter((item) => item.selectable !== false);
    const longestCharacter = Math.max(...characters.map((item) => [...item.nameJa].length));
    const longestWeapon = Math.max(...weapons.map((item) => [...item.nameJa].length));

    // 360px viewport: 24px outer gutter, 24px panel padding, 2px border,
    // 12px card padding, 68px image, and 8px gap leave 222px for copy.
    assert.ok(longestCharacter * 13 <= 222);
    assert.ok(longestWeapon * 13 <= 222);

    // At the narrowest two-pane desktop width the input panel still leaves
    // more than 300px for copy because cards remain vertically stacked.
    assert.ok(longestWeapon * 15 <= 300);
});

test("image and name both open selection while weapon image follows disabled state", () => {
    const html = read("games/genshin/index.html");
    const modal = read("games/js/genshinSelectionModal.js");

    assert.match(html, /data-selection-target="genshinReflectCharacter"/);
    assert.match(html, /data-selection-target="genshinWeaponInput"[^>]*disabled/);
    assert.match(modal, /document\.querySelectorAll\("\[data-selection-target\]"\)/);
    assert.match(modal, /weaponImageButton\.disabled = !state\.character/);
});

test("labels, larger names, and detail actions fit both cards", () => {
    const html = read("games/genshin/index.html");
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(html, /<span>命ノ星座<\/span>/);
    assert.equal((html.match(/data-equipment-details=/g) || []).length, 2);
    assert.match(css, /\.genshin-equipment-name\s*\{[^}]*font-size:\s*\.9375rem/s);
    assert.match(css, /@media \(max-width: 400px\)[\s\S]*\.genshin-equipment-name\s*\{[^}]*font-size:\s*\.8125rem/s);
    assert.match(css, /\.genshin-equipment-details-button\s*\{[^}]*margin-left:\s*auto/s);
    assert.match(css, /\.genshin-equipment-meta select\s*\{[^}]*width:\s*56px;[^}]*padding-right:\s*19px/s);
});

test("elemental damage input does not change its icon by selected character", () => {
    const html = read("games/genshin/index.html");
    const presentation = read("games/js/genshinCalculatorPresentation.js");

    assert.match(html, /<span class="genshin-stat-label">元素ダメージ<\/span>/);
    assert.doesNotMatch(html, /genshinElementalDamageIcon/);
    assert.doesNotMatch(presentation, /syncElementalDamageIcon|ELEMENT_ICON_NAMES/);
});
