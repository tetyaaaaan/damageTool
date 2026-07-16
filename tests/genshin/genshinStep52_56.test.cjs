const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("STEP52-55 presents four input steps without replacing calculator field IDs", () => {
    const html = read("games/genshin/index.html");
    const expectedSteps = ["キャラ・装備", "ステータス", "敵・反応設定", "補正条件"];
    expectedSteps.forEach((label, index) => {
        assert.match(html, new RegExp(`<span aria-hidden="true">${index + 1}<\\/span>${label}`));
    });
    [
        "genshinReflectCharacter", "genshinCalcCharacterId", "genshinWeaponInput", "genshinCalcWeaponId",
        "genshinNormalTalentLevel", "genshinArtifactSetMode", "genshinHpInput",
        "genshinElementalResistanceDebuffInput", "genshinEnemyLevelInput",
        "genshinJsonPrepareConditionsButton", "genshinJsonCalcButtonBottom"
    ].forEach((id) => assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1, id));
});

test("STEP53 keeps character and weapon images display-only and falls back locally", () => {
    const html = read("games/genshin/index.html");
    const script = read("games/js/genshinCalculatorPresentation.js");

    assert.match(html, /id="genshinSelectedCharacterImage"[^>]+fallback\.webp/);
    assert.match(html, /id="genshinSelectedWeaponImage"[^>]+fallback\.webp/);
    assert.match(script, /\/games\/images\/genshin\/\$\{isCharacter \? "characters" : "weapons"\}/);
    assert.match(script, /addEventListener\("error"/);
    assert.doesNotMatch(script, /GenshinCalcEngine|calculate|fetch\(/);
});

test("STEP53 uses compact artifact labels while retaining the complete accessible name", () => {
    const modal = read("games/js/genshinSelectionModal.js");
    const artifacts = JSON.parse(read("games/genshin/data/artifact-sets.json"));

    assert.equal(artifacts["15034"].shortNameJa, "残響");
    assert.equal(artifacts["15040"].shortNameJa, "深廊");
    Object.entries(artifacts).forEach(([id, artifact]) => {
        assert.ok(artifact.shortNameJa, `${id} has a compact label`);
        assert.ok(artifact.shortNameJa.length <= 6, `${id} compact label stays short`);
    });
    assert.match(modal, /selected\?\.shortNameJa \|\| selected\?\.nameJa/);
    assert.match(modal, /`聖遺物：\$\{selected\.nameJa\}`/);
});

test("STEP57-60 follows the approved mock for talents, artifacts, combat help, and condition details", () => {
    const html = read("games/genshin/index.html");
    const css = read("games/css/tetinet.css");
    const renderer = read("games/js/genshinCalcRenderer.js");

    assert.match(html, /<option value="4pc" selected>4<\/option>/);
    assert.match(html, /<span class="genshin-visually-hidden">セット構成<\/span>/);
    assert.match(html, /<option value="10" selected>通常攻撃 Lv10<\/option>/);
    assert.match(html, /id="genshinEnemyLevelInput"[^>]+value="90"/);
    assert.equal((html.match(/class="genshin-field-help"/g) || []).length, 6);
    assert.match(html, /id="genshinJsonReactionOption"/);
    assert.match(css, /\.genshin-combat-input-grid\s*\{[\s\S]*1\.15fr[\s\S]*0\.95fr/);
    assert.match(renderer, /天賦・命ノ星座補正/);
    assert.match(renderer, /genshin-condition-detail/);
    assert.match(css, /\.genshin-result-panel\s*\{\s*position:\s*static/);
    assert.doesNotMatch(css, /\.genshin-result-panel\s*\{[\s\S]{0,100}position:\s*sticky/);
});

test("STEP54-55 provides responsive stat grids, compact condition cards, and result context", () => {
    const html = read("games/genshin/index.html");
    const css = read("games/css/tetinet.css");

    assert.match(css, /\.genshin-compact-stats\s*\{[\s\S]*repeat\(4,/);
    assert.match(css, /\.genshin-condition-cards\s*\{[\s\S]*repeat\(2,/);
    assert.doesNotMatch(html, /id="genshinJsonCalcButton"/);
    assert.match(css, /\.genshin-json-calc-production > \.genshin-json-actions:not\(\.genshin-json-actions-bottom\)[\s\S]*position:\s*static/);
    assert.match(css, /\.genshin-json-calc-production > \.genshin-json-actions-bottom\s*\{[\s\S]*position:\s*sticky/);
    assert.match(css, /--genshin-ui-title:[\s\S]*--genshin-ui-meta:/);
    assert.match(css, /\.genshin-profile-form-grid :is\(input:not\(\[type="hidden"\]\), select\)[\s\S]*font-size:\s*var\(--genshin-ui-control\)/);
    assert.match(css, /\.genshin-reflect-inputs \.genshin-reaction-input-row select[\s\S]*font-size:\s*var\(--genshin-ui-control\)/);
    assert.match(css, /\.genshin-json-calc-production > \.genshin-help[\s\S]*font-size:\s*var\(--genshin-ui-body\)/);
    assert.match(html, /id="genshinResultCharacterWeaponSummary"/);
    assert.match(html, /id="genshinResultArtifactReactionSummary"/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.genshin-condition-cards[\s\S]*grid-template-columns:\s*1fr/);
});
