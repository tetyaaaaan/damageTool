const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");

test("calculator input groups use dedicated compact layouts without hiding fields", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "games/css/tetinet.css"), "utf8");

    assert.equal((html.match(/genshin-compact-triple/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-pairs/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-stats/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-enemy/g) || []).length, 1);
    assert.equal((html.match(/genshin-inline-field-label/g) || []).length, 0);
    assert.equal((html.match(/genshin-field-help/g) || []).length, 6);
    assert.equal((html.match(/genshin-artifact-mode-row/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-artifact-sets/g) || []).length, 1);
    assert.match(html, /genshin-profile-character-field/);
    assert.match(css, /\.genshin-compact-stats[\s\S]*grid-template-columns:\s*repeat\(4,/);
    assert.match(css, /\.genshin-compact-triple[\s\S]*grid-template-columns:\s*repeat\(3,/);
    assert.match(css, /\.genshin-profile-form-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(250px, 320px\) 66px 76px/);
    assert.match(css, /\.genshin-profile-selection-control\s*\{[\s\S]*grid-template-columns:\s*40px minmax\(0, 1fr\)/);
    assert.match(css, /\.genshin-profile-selection-image\s*\{[\s\S]*width:\s*36px[\s\S]*height:\s*36px/);
    assert.equal((html.match(/genshin-profile-positioned-label/g) || []).length, 4);
    assert.match(css, /\.genshin-profile-positioned-label[\s\S]*transform:\s*none/);
    assert.match(css, /\.genshin-artifact-compact-row\s*\{[\s\S]*82px minmax\(0, 1fr\)/);
    assert.match(css, /\.genshin-equipment-step\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /\.genshin-compact-artifact-sets:has\(#genshinArtifactSetTwoField\[hidden\]\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(css, /input\[type="number"\]::\-webkit-inner-spin-button[\s\S]*appearance:\s*none/);
    assert.match(css, /input:has\(\+ span\)[\s\S]*padding-right:\s*30px/);
    assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.genshin-compact-stats[\s\S]*repeat\(2,/);
});

test("compact profile labels stay clear and light mode section dividers remain visible", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "games/css/tetinet.css"), "utf8");

    assert.match(html, /<label for="genshinReflectCharacter">キャラ<\/label>[\s\S]*placeholder="キャラ選択"/);
    assert.match(html, />命ノ星座<\/span>\s*<select id="genshinReflectConstellation">/);
    assert.match(css, /\.genshin-reflect-inputs\s*\{[\s\S]*97%[\s\S]*3%/);
    assert.match(css, /\.genshin-artifact-set-inputs\s*\{[\s\S]*border-top:/);
    assert.match(css, /html\[data-theme="dark"\][\s\S]*\.genshin-artifact-set-inputs[\s\S]*border-top-color:\s*var\(--teti-border\)/);
});

test("talent levels are explicit selectors from 1 through 15", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const controls = [
        ["genshinNormalTalentLevel", "通常攻撃"],
        ["genshinSkillTalentLevel", "元素スキル"],
        ["genshinBurstTalentLevel", "元素爆発"]
    ];

    controls.forEach(([id, label]) => {
        const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`));
        assert.ok(select, `${id} is rendered as a select`);
        const values = Array.from(select[1].matchAll(new RegExp(`<option value="(\\d+)"(?: selected)?>${label} Lv\\d+<\\/option>`, "g")), (match) => Number(match[1]));
        assert.deepEqual(values, Array.from({ length: 15 }, (_, index) => index + 1));
        assert.match(select[1], new RegExp(`<option value="10" selected>${label} Lv10<\\/option>`));
    });
});

test("compact controls reserve enough structure for full labels and aligned percent units", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "games/css/tetinet.css"), "utf8");

    assert.match(html, /<option value="4pc" selected>4<\/option>/);
    assert.match(html, /<option value="2pc2pc">2＋2<\/option>/);
    assert.match(css, /--genshin-ui-title:\s*0\.9375rem/);
    assert.match(css, /--genshin-ui-control:\s*0\.75rem/);
    assert.match(css, /\.genshin-field > span\s*\{[\s\S]*top:\s*auto[\s\S]*right:\s*10px[\s\S]*bottom:\s*11px[\s\S]*transform:\s*none/);
    assert.match(css, /:is\(\.genshin-reflect-inputs, \.genshin-json-calc-production\) select:not\(\[hidden\]\)\s*\{[\s\S]*appearance:\s*none[\s\S]*padding-right:\s*34px !important[\s\S]*background-position:\s*right 14px center/);
    assert.match(css, /:is\(\.genshin-compact-pairs, \.genshin-compact-enemy\) \.genshin-field > span\s*\{[\s\S]*bottom:\s*12px/);
    assert.doesNotMatch(css, /\.genshin-artifact-mode-row \.genshin-field::after/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-artifact-mode-row\s*\{[\s\S]*width:\s*82px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-profile-form-grid\s*\{[\s\S]*minmax\(0, 1fr\) 54px 64px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-profile-selection-control\s*\{[\s\S]*grid-template-columns:\s*36px minmax\(0, 1fr\)/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-profile-selection-image\s*\{[\s\S]*width:\s*32px[\s\S]*height:\s*32px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*select:not\(\[hidden\]\)\s*\{[\s\S]*padding-right:\s*21px !important[\s\S]*background-position:\s*right 9px center[\s\S]*background-size:\s*9px 6px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-compact-triple\s*\{[\s\S]*1fr\) minmax\(0, 1\.15fr\) minmax\(0, 1fr\)[\s\S]*gap:\s*4px/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-field-help::after\s*\{[\s\S]*left:\s*50%[\s\S]*width:\s*min\(200px, calc\(100vw - 48px\)\)[\s\S]*translate\(-50%, 3px\)/);
    assert.match(css, /\.genshin-artifact-selection-trigger-image\s*\{[\s\S]*width:\s*26px[\s\S]*height:\s*26px/);
});

test("damage result labels describe the critical-rate-weighted value as expected value", () => {
    const renderer = fs.readFileSync(path.join(root, "games/js/genshinCalcRenderer.js"), "utf8");

    assert.match(renderer, /<th scope="col">期待値<\/th>/);
    assert.match(renderer, /全ヒット期待値/);
    assert.doesNotMatch(renderer, /data-label="平均"|全ヒット平均|<th scope="col">平均<\/th>/);
});
