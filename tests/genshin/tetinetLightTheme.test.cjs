const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const sharedCss = fs.readFileSync(path.join(root, "games", "css", "tetinet.css"), "utf8");
const legacyCss = fs.readFileSync(path.join(root, "games", "css", "style.css"), "utf8");
const rules = fs.readFileSync(path.join(root, "docs", "DEVELOPMENT_RULES.md"), "utf8");

test("light theme uses the shared deep-teal design tokens", () => {
  assert.match(sharedCss, /--teti-brand:\s*#087c75;/);
  assert.match(sharedCss, /--teti-interactive:\s*#087c75;/);
  assert.match(sharedCss, /--teti-selected-bg:\s*#ddf1ee;/);
  assert.match(sharedCss, /--teti-page-bg:\s*#f3f7f7;/);
  assert.match(sharedCss, /--teti-surface-soft:\s*#edf4f3;/);
  assert.match(rules, /ディープティール/);
});

test("production styles do not restore the former purple-orange brand palette", () => {
  const productionCss = `${sharedCss}\n${legacyCss}`;
  const formerBrandColors = [
    "#7428ff",
    "#ff7a1a",
    "#f0378f",
    "#6a30ff",
    "#ff4da6",
    "#ff8a2a",
  ];

  formerBrandColors.forEach((color) => {
    assert.doesNotMatch(productionCss.toLowerCase(), new RegExp(color), color);
  });
});

test("primary actions use one interaction color instead of a multicolor gradient", () => {
  assert.match(sharedCss, /\.teti-button-primary\s*\{[^}]*background:\s*var\(--teti-interactive\);/s);
  assert.match(sharedCss, /\.genshin-calc-button\s*\{[^}]*background:\s*var\(--teti-interactive\);/s);
  assert.match(sharedCss, /body\.page-hsr \.calc-button\s*\{[^}]*background:\s*var\(--teti-interactive\);/s);
  assert.match(sharedCss, /body\.page-granblue \.calc-button\s*\{[^}]*background:\s*var\(--teti-interactive\);/s);
});
