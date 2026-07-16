const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function readJson(relativePath) {
    return JSON.parse(read(relativePath));
}

function assertWebp(relativePath) {
    const file = fs.readFileSync(path.join(root, relativePath));
    assert.equal(file.subarray(0, 4).toString("ascii"), "RIFF", relativePath);
    assert.equal(file.subarray(8, 12).toString("ascii"), "WEBP", relativePath);
}

test("every selectable Genshin character and weapon has a local WebP image", () => {
    const characters = readJson("games/genshin/data/characters.json");
    const weapons = readJson("games/genshin/data/weapons.json");
    const artifactSets = readJson("games/genshin/data/artifact-sets.json");
    const fallbackItems = readJson("games/images/genshin/fallback-items.json");

    Object.keys(characters).forEach((id) => {
        if (!fallbackItems.characters.includes(id)) assertWebp(`games/images/genshin/characters/${id}.webp`);
    });
    Object.keys(weapons).forEach((id) => {
        if (!fallbackItems.weapons.includes(id)) assertWebp(`games/images/genshin/weapons/${id}.webp`);
    });
    Object.keys(artifactSets).forEach((id) => {
        if (!fallbackItems.artifacts.includes(id)) assertWebp(`games/images/genshin/artifacts/${id}.webp`);
    });
    assertWebp("games/images/genshin/fallback.webp");
    assert.equal(Object.keys(characters).length, 117);
    assert.equal(Object.keys(weapons).length, 237);
    assert.equal(Object.keys(artifactSets).length, 61);
    assert.equal(Object.keys(characters).length + Object.keys(weapons).length + Object.keys(artifactSets).length,
        117 + 234 + 57 + fallbackItems.characters.length + fallbackItems.weapons.length + fallbackItems.artifacts.length);
});

test("selection modal renders compact local images and falls back safely", () => {
    const modal = read("games/js/genshinSelectionModal.js");
    const css = read("games/css/tetinet.css");

    assert.match(modal, /`\$\{SELECTION_IMAGE_ROOT\}\/\$\{imageKind\}\/\$\{item\.id\}\.webp`/);
    assert.match(modal, /image\.src = SELECTION_IMAGE_FALLBACK/);
    assert.match(modal, /image\.loading = "lazy"/);
    assert.match(modal, /image\.alt = ""/);
    assert.match(css, /\.genshin-selection-option-image \{[^}]*width: 48px;[^}]*height: 48px;/s);
    assert.match(css, /\.genshin-selection-option \{[^}]*display: flex;[^}]*gap: 11px;/s);
    assert.match(css, /\.genshin-selection-option strong \{[^}]*max-height: 2\.6em;[^}]*white-space: normal;[^}]*-webkit-line-clamp: 2;/s);
});

test("character filters use local colored element icons without visible row labels", () => {
    const modal = read("games/js/genshinSelectionModal.js");
    const css = read("games/css/tetinet.css");
    const elements = ["pyro", "hydro", "anemo", "electro", "dendro", "cryo", "geo"];

    elements.forEach((element) => assertWebp(`games/images/genshin/elements/${element}.webp`));
    assert.match(modal, /row\.setAttribute\("aria-label", label\)/);
    assert.doesNotMatch(modal, /heading\.textContent = label/);
    assert.match(modal, /elements\/\$\{ELEMENT_ICON_NAMES\[value\]\}\.webp/);
    assert.match(modal, /button\.setAttribute\("aria-label", `\$\{value\}元素`\)/);
    assert.match(css, /\.genshin-filter-button\[data-filter-group="element"\] \{[^}]*min-height: 40px;/s);
    assert.match(css, /\.genshin-filter-button--element \{[^}]*width: 40px;[^}]*height: 40px;/s);
    assert.match(css, /\.genshin-filter-button--element img \{[^}]*width: 26px;[^}]*height: 26px;[^}]*background: #18303d;/s);
    assert.match(css, /html\[data-theme="dark"\] \.genshin-filter-button--element img \{[^}]*background: transparent;/s);
});

test("character selection uses an explicit newest-first release order", () => {
    const characters = readJson("games/genshin/data/characters.json");
    const releaseOrderData = readJson("games/genshin/data/character-release-order.json");
    const modal = read("games/js/genshinSelectionModal.js");
    const orderedIds = releaseOrderData.order;

    assert.equal(orderedIds.length, Object.keys(characters).length);
    assert.equal(new Set(orderedIds).size, orderedIds.length);
    assert.deepEqual(new Set(orderedIds), new Set(Object.keys(characters)));
    assert.equal(orderedIds.indexOf("10000129") < orderedIds.indexOf("10000130"), true,
        "release order must not fall back to descending character IDs");
    assert.equal(orderedIds.indexOf("10000062") > 0, true, "Aloy must not be the first character");
    assert.match(modal, /CHARACTER_RELEASE_ORDER_PATH/);
    assert.match(modal, /sortCharactersByReleaseOrder/);
    assert.doesNotMatch(modal, /listCharacters\(\)\.sort\(\(a, b\) => a\.nameJa\.localeCompare/);
});

test("artifact set selection stays compact and keeps the existing select values", () => {
    const html = read("games/genshin/index.html");
    const modal = read("games/js/genshinSelectionModal.js");
    const css = read("games/css/tetinet.css");
    const artifactSets = readJson("games/genshin/data/artifact-sets.json");

    assert.match(html, /id="genshinArtifactSetOneTrigger"/);
    assert.match(html, /id="genshinArtifactSetTwoTrigger"/);
    assert.equal((html.match(/>聖遺物を選択<\/button>/g) || []).length, 2);
    assert.doesNotMatch(html, /genshinArtifactSetOneField" hidden><span>セット/);
    assert.doesNotMatch(html, /genshinArtifactSetTwoField" hidden><span>セット2/);
    assert.match(html, /id="genshinArtifactSetOne" hidden/);
    assert.match(html, /id="genshinArtifactSetTwo" hidden/);
    assert.match(modal, /ARTIFACT SET/);
    assert.match(modal, /聖遺物セットを選択/);
    assert.match(modal, /effect\?\.twoPieceEffect \|\| effect\?\.fourPieceEffect/);
    assert.match(modal, /state\.artifactSets.*sort/s);
    assert.doesNotMatch(modal, /twoPieceEffect.*textContent|fourPieceEffect.*textContent/);
    assert.match(css, /\.genshin-selection-dialog\.is-artifact \.genshin-selection-list \{[^}]*repeat\(2,/s);
    assert.match(css, /\.genshin-artifact-selection-trigger \{[^}]*width: 100%;/s);
    assert.match(css, /\.genshin-artifact-selection-trigger\.is-empty \{[^}]*color: var\(--teti-muted\);/s);
    assert.match(modal, /item\.nameReading \|\| ""/);
    assert.match(modal, /selected\?\.shortNameJa \|\| selected\?\.nameJa \|\| "聖遺物を選択"/);
    assert.match(modal, /SELECTION_IMAGE_ROOT}\/artifacts\/\$\{selected\.id\}\.webp/);
    assert.match(modal, /genshin-artifact-selection-trigger-image/);
    assert.match(modal, /classList\.toggle\("is-empty", !selected\)/);
    Object.values(artifactSets).forEach((artifactSet) => {
        assert.equal(typeof artifactSet.nameReading, "string", `${artifactSet.nameJa} needs a reading`);
        assert.ok(artifactSet.nameReading.length > 0, `${artifactSet.nameJa} needs a non-empty reading`);
    });
    assert.equal(artifactSets["15040"].nameReading, "しんろうのしゅうきょく");
    assert.equal(artifactSets["15034"].nameReading, "ざんきょうのもりでささやかれるやわ");
    assert.equal(artifactSets["15005"].shortNameJa, "雷怒");
    assert.equal(artifactSets["15037"].shortNameJa, "絵巻");
    const shortNames = Object.values(artifactSets).map((artifactSet) => artifactSet.shortNameJa);
    assert.equal(new Set(shortNames).size, shortNames.length, "artifact short names must be unique");
    shortNames.forEach((shortName) => assert.ok(shortName.length <= 6, `${shortName} is too long for the compact trigger`));
});

test("image source and rights attribution are published", () => {
    const links = read("links/index.html");
    const terms = read("terms/index.html");

    assert.match(links, /Enka\.Network API-docs/);
    assert.match(links, /genshin\.dev/);
    assert.match(links, /ゲーム内IDと画像名の対応付け/);
    assert.match(terms, /ゲーム内の画像、名称、商標その他の素材/);
    assert.match(terms, /HoYoverse、COGNOSPHEREおよび各権利者に帰属/);
});
