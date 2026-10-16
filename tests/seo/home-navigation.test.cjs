const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const home = fs.readFileSync(path.join(root,"index.html"),"utf8");
const worker = fs.readFileSync(path.join(root,"worker.js"),"utf8");

test("home links resolve to existing pages, router content, or a real section", () => {
    const routes = new Set([...worker.matchAll(/^  "(\/[^" ]+)": \{/gm)].map(match=>match[1]));
    for (const [,href] of home.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
        if (href.startsWith("https://")) continue;
        if (href.startsWith("#")) {
            assert.ok(home.includes(`id="${href.slice(1)}"`),href);
            continue;
        }
        assert.ok(fs.existsSync(path.join(root,href,"index.html")) || routes.has(href.replace(/\/$/,"")),href);
    }
    assert.doesNotMatch(home, /href="#about"/);
});

test("each main tool card has one destination for both card and visual action", () => {
    const cards = [...home.matchAll(/<a class="teti-card teti-game-card"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    assert.deepEqual(cards.map(match=>match[1]),["/games/genshin/","/games/hsr/"]);
    for (const [, ,body] of cards) {
        assert.match(body,/class="teti-button teti-button-primary"/);
        assert.doesNotMatch(body, /<(?:a|button)\b/);
    }
    assert.match(home,/href="#calculators">計算ツールを選ぶ/);
});
