const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");

test("calculator input groups use dedicated compact layouts without hiding fields", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "games/css/tetinet.css"), "utf8");

    assert.equal((html.match(/genshin-compact-triple/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-pairs/g) || []).length, 2);
    assert.equal((html.match(/genshin-compact-enemy/g) || []).length, 1);
    assert.equal((html.match(/genshin-inline-field-label/g) || []).length, 6);
    assert.equal((html.match(/genshin-artifact-mode-row/g) || []).length, 1);
    assert.equal((html.match(/genshin-compact-artifact-sets/g) || []).length, 1);
    assert.match(html, /genshin-profile-character-field/);
    assert.match(css, /\.genshin-compact-pairs[\s\S]*grid-template-columns:\s*repeat\(2,/);
    assert.match(css, /\.genshin-compact-triple[\s\S]*grid-template-columns:\s*repeat\(3,/);
    assert.match(css, /\.genshin-compact-triple \.genshin-field\s*\{[\s\S]*grid-template-columns:\s*auto 58px/);
    assert.match(css, /\.genshin-compact-enemy \.genshin-field\s*\{[\s\S]*grid-template-columns:\s*auto 64px/);
    assert.match(css, /\.genshin-profile-form-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 116px 136px[\s\S]*column-gap:\s*14px/);
    assert.match(css, /\.genshin-profile-character-field\s*\{[\s\S]*grid-template-columns:\s*42px minmax\(0, 1fr\)/);
    assert.match(css, /\.genshin-profile-middle-field\s*\{[\s\S]*grid-template-columns:\s*52px 56px[\s\S]*justify-content:\s*start/);
    assert.match(css, /\.genshin-profile-end-field\s*\{[\s\S]*grid-template-columns:\s*72px 56px[\s\S]*justify-content:\s*start/);
    assert.equal((html.match(/genshin-profile-positioned-label/g) || []).length, 4);
    assert.match(css, /\.genshin-profile-middle-field \.genshin-profile-positioned-label\s*\{[\s\S]*translateX\(8px\)/);
    assert.match(css, /\.genshin-profile-end-field \.genshin-profile-positioned-label\s*\{[\s\S]*translateX\(12px\)/);
    assert.match(css, /\.genshin-compact-triple \.genshin-field:nth-child\(2\)[\s\S]*justify-content:\s*center/);
    assert.match(css, /\.genshin-compact-triple \.genshin-field:last-child[\s\S]*justify-content:\s*end/);
    assert.match(css, /\.genshin-compact-enemy \.genshin-field:last-child[\s\S]*justify-content:\s*end/);
    assert.match(css, /\.genshin-compact-enemy\s*\{[\s\S]*0\.9fr[\s\S]*1\.1fr/);
    assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.genshin-compact-triple[\s\S]*grid-template-columns:\s*1fr/);
});

test("compact profile labels stay clear and light mode section dividers remain visible", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const css = fs.readFileSync(path.join(root, "games/css/tetinet.css"), "utf8");

    assert.match(html, />キャラ\s*<input[^>]+placeholder="キャラ選択"/);
    assert.match(html, />命ノ星座<\/span>\s*<select id="genshinReflectConstellation">/);
    assert.match(css, /\.genshin-reflect-inputs\s*\{[\s\S]*97%[\s\S]*3%/);
    assert.match(css, /\.genshin-artifact-set-inputs\s*\{[\s\S]*border-top:/);
    assert.match(css, /html\[data-theme="dark"\][\s\S]*\.genshin-artifact-set-inputs[\s\S]*border-top-color:\s*var\(--teti-border\)/);
});

test("talent levels are explicit selectors from 1 through 15", () => {
    const html = fs.readFileSync(path.join(root, "games/genshin/index.html"), "utf8");
    const ids = ["genshinNormalTalentLevel", "genshinSkillTalentLevel", "genshinBurstTalentLevel"];

    ids.forEach((id) => {
        const select = html.match(new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`));
        assert.ok(select, `${id} is rendered as a select`);
        const values = Array.from(select[1].matchAll(/<option value="(\d+)"(?: selected)?>(\d+)<\/option>/g), (match) => Number(match[1]));
        assert.deepEqual(values, Array.from({ length: 15 }, (_, index) => index + 1));
        assert.match(select[1], /<option value="10" selected>10<\/option>/);
    });
});

test("damage result labels describe the critical-rate-weighted value as expected value", () => {
    const renderer = fs.readFileSync(path.join(root, "games/js/genshinCalcRenderer.js"), "utf8");

    assert.match(renderer, /<th scope="col">期待値<\/th>/);
    assert.match(renderer, /全ヒット期待値/);
    assert.doesNotMatch(renderer, /data-label="平均"|全ヒット平均|<th scope="col">平均<\/th>/);
});
