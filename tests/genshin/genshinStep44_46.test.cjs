const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("STEP44 removes legacy calculator inputs, scripts, and UID synchronization", () => {
    const html = read("games/genshin/index.html");
    const importer = read("games/js/genshinUidImporter.js");
    const legacyIds = [
        "eleArea", "eleChoices", "eleCalcContent", "ele_m", "ele_e",
        "normalDmgContent", "atk", "talent", "special", "add_b", "dmg_b", "cri_dmg",
        "ele_d", "def_d", "def_ig", "lv", "e_lv", "e_res", "dmg_button"
    ];

    legacyIds.forEach((id) => assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), id));
    assert.equal(fs.existsSync(path.join(root, "games/js/main.js")), false);
    assert.equal(fs.existsSync(path.join(root, "js/main.js")), false);
    assert.doesNotMatch(importer, /setInputValue\("(?:atk|cri_dmg|dmg_b|ele_m|lv)"/);
});

test("STEP45 exposes one structured calculation action and renders into the result panel", () => {
    const html = read("games/genshin/index.html");
    const renderer = read("games/js/genshinCalcRenderer.js");
    const actionMatches = html.match(/data-genshin-calc-path=/g) || [];
    const resultPanelStart = html.indexOf('<aside class="genshin-panel genshin-result-panel"');
    const resultPanelEnd = html.indexOf("</aside>", resultPanelStart);
    const resultPanel = html.slice(resultPanelStart, resultPanelEnd);

    assert.equal(actionMatches.length, 1);
    assert.match(html, /<h3>補正条件<\/h3>/);
    assert.match(html, />ダメージ計算を実行<\/button>/);
    assert.match(html, /id="genshinJsonCalcButtonBottom"/);
    assert.match(resultPanel, /id="genshinJsonCalcWarnings"/);
    assert.match(resultPanel, /id="genshinJsonCalcResults"/);
    assert.match(renderer, /計算対象:/);
    assert.doesNotMatch(renderer, /<h3>計算結果<\/h3>/);
    assert.match(renderer, /aria-label="計算結果タブ"/);
    assert.match(renderer, /\["genshinJsonCalcButtonBottom"\]/);
    assert.doesNotMatch(`${html}\n${renderer}`, /JSON計算/);
});

test("STEP45 provides neutral initial calculation values", () => {
    const html = read("games/genshin/index.html");
    const defaults = {
        genshinReflectLevel: "90",
        genshinWeaponLevel: "90",
        genshinHpInput: "10000",
        genshinAtkInput: "1000",
        genshinDefInput: "1000",
        genshinElementalMasteryInput: "0",
        genshinCritRateInput: "5",
        genshinCritDamageInput: "50",
        genshinEnergyRechargeInput: "100",
        genshinElementalDamageInput: "0"
    };
    Object.entries(defaults).forEach(([id, value]) => {
        assert.match(html, new RegExp(`id="${id}"[^>]*value="${value}"`), id);
    });
    [["genshinNormalTalentLevel", "通常攻撃"], ["genshinSkillTalentLevel", "元素スキル"], ["genshinBurstTalentLevel", "元素爆発"]].forEach(([id, label]) => {
        assert.match(html, new RegExp(`<select id="${id}"[^>]*>[\\s\\S]*?<option value="10" selected>${label} Lv10<\\/option>`), id);
    });
});

test("STEP46 removes obsolete result placeholders and artifact compatibility UI", () => {
    const html = read("games/genshin/index.html");
    const selectionModal = read("games/js/genshinSelectionModal.js");
    const uidImporter = read("games/js/genshinUidImporter.js");

    ["result", "value_e_def", "value_e_ele", "targetArea", "modal", "imageList"].forEach((id) => {
        assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), id);
    });
    assert.match(html, /placeholder="先にキャラ選択"/);
    assert.match(selectionModal, /"先にキャラ選択"/);
    assert.doesNotMatch(`${html}\n${uidImporter}`, /genshinArtifactSetSummary|genshinArtifactSetEffects|効果文データは未対応/);
    assert.doesNotMatch(html, /\/games\/js\/(?:main|artifact)\.js/);
    assert.equal(fs.existsSync(path.join(root, "games/js/artifact.js")), false);
    assert.equal(fs.existsSync(path.join(root, "js/artifact.js")), false);
});
