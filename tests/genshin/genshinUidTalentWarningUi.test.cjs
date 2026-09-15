const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("UID card labels unresolved talent levels as level 1 pending manual confirmation", () => {
    const importer = read("games/js/genshinUidImporter.js");
    assert.match(importer, /talentOrderUnresolved:\s*"天賦ID順序を確認できないためLv1（手動確認）として扱います。"/);
    assert.match(importer, /talentMappingWarning\(character\)/);
    assert.match(importer, /genshin-uid-talent-warning/);
    assert.match(importer, /role="alert"/);
    assert.match(importer, /talentWarning \? `\<p class="genshin-uid-talent-warning"/);
});

test("applying an unresolved UID profile emits a warning instead of a success-only notice", () => {
    const importer = read("games/js/genshinUidImporter.js");
    assert.match(importer, /setMessage\(`\$\{character\.name \|\| unsupported\([\s\S]*?talentWarning \? ` \$\{talentWarning\}` : ""\}[\s\S]*?talentWarning \? "warning" : "success"\)/);
    const tetinetCss = read("games/css/tetinet.css");
    const genshinCss = read("games/css/genshin-tool-ui.css");
    const baseCss = read("games/css/style.css");
    assert.match(tetinetCss, /\.genshin-tool-page \.uid-importer__message\[data-type="warning"\]/);
    assert.match(genshinCss, /\.genshin-tool-page \.genshin-uid-talent-warning/);
    assert.doesNotMatch(baseCss, /uid-importer__message\[data-type="warning"\]/);
});
