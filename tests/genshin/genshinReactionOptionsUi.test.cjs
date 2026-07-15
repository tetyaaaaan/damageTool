const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rendererPath = path.resolve(__dirname, "../../games/js/genshinCalcRenderer.js");

test("増幅反応の選択肢は倍率とダメージ元素を表示する", () => {
    const source = fs.readFileSync(rendererPath, "utf8");

    assert.doesNotMatch(source, /増幅反応（計算対応）/);
    assert.match(source, /\["増幅反応",/);
    assert.match(source, /\["melt15", "溶解 1\.5　氷ダメ"\]/);
    assert.match(source, /\["melt20", "溶解 2\.0　炎ダメ"\]/);
    assert.match(source, /\["vaporize15", "蒸発 1\.5　炎ダメ"\]/);
    assert.match(source, /\["vaporize20", "蒸発 2\.0　水ダメ"\]/);
});
