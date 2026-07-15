const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

const canonicalPages = new Map([
  ["index.html", "https://tetinet.com/"],
  ["games/index.html", "https://tetinet.com/games/"],
  ["games/genshin/index.html", "https://tetinet.com/games/genshin/"],
  ["games/hsr/index.html", "https://tetinet.com/games/hsr/"],
  ["games/formula/index.html", "https://tetinet.com/games/formula/"],
  ["games/enemies/index.html", "https://tetinet.com/games/enemies/"],
]);

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function matches(html, pattern) {
  return [...html.matchAll(pattern)];
}

test("主要ページはtetinet.comの自己参照canonicalを1件だけ持つ", () => {
  for (const [relativePath, expectedCanonical] of canonicalPages) {
    const html = read(relativePath);
    const canonicals = matches(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/gi);
    assert.equal(canonicals.length, 1, `${relativePath} canonical count`);
    assert.equal(canonicals[0][1], expectedCanonical, `${relativePath} canonical URL`);
  }
});

test("主要ページのtitleとdescriptionは空でなく重複しない", () => {
  const titles = [];
  const descriptions = [];
  for (const relativePath of canonicalPages.keys()) {
    const html = read(relativePath);
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["'][^>]*>/i)?.[1]?.trim();
    assert.ok(title, `${relativePath} title`);
    assert.ok(description, `${relativePath} description`);
    titles.push(title);
    descriptions.push(description);
  }
  assert.equal(new Set(titles).size, titles.length, "title duplication");
  assert.equal(new Set(descriptions).size, descriptions.length, "description duplication");
});

test("説明を強化したページはh1と主要な案内を持つ", () => {
  const expectations = new Map([
    ["games/genshin/index.html", ["原神 ダメージ計算ツール", "原神ダメージ計算ツールについて", "非会心・会心・期待値", "/guides/genshin/", "/faq/"]],
    ["games/hsr/index.html", ["崩壊スターレイル ダメージ計算", "スターレイルダメージ計算ツールについて", "属性耐性、靭性条件", "/games/formula/", "/faq/"]],
    ["games/formula/index.html", ["原神・崩壊：スターレイルのダメージ計算式", "敵防御補正", "敵の元素耐性・物理耐性補正", "撃破ダメージ", "formula-notes"]],
    ["games/enemies/index.html", ["原神・スターレイル 敵の耐性・防御条件", "敵情報を入力するときの考え方", "元素耐性デバフ", "属性弱点", "/games/formula/#genshin-formula"]],
  ]);

  for (const [relativePath, requiredTexts] of expectations) {
    const html = read(relativePath);
    assert.equal(matches(html, /<h1(?:\s[^>]*)?>/gi).length, 1, `${relativePath} h1 count`);
    for (const requiredText of requiredTexts) {
      assert.ok(html.includes(requiredText), `${relativePath} includes ${requiredText}`);
    }
  }
});

test("原神の案内カード内リストはマーカー用の左余白を持つ", () => {
  const css = read("games/css/tetinet.css");
  assert.match(css, /\.genshin-tool-page \.genshin-detail-card ul,[\s\S]*?\.genshin-tool-page \.genshin-detail-card ol\s*\{[\s\S]*?padding-inline-start:\s*1\.5rem;/);
  assert.match(css, /list-style-position:\s*outside;/);
});

test("sitemapは主要ページの正規URLを含みgithub.ioを含まない", () => {
  const sitemap = read("sitemap.xml");
  for (const expectedCanonical of canonicalPages.values()) {
    assert.ok(sitemap.includes(`<loc>${expectedCanonical}</loc>`), expectedCanonical);
  }
  assert.doesNotMatch(sitemap, /github\.io/i);
});
