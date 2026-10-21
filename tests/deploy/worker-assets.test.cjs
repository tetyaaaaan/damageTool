const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { assets, verifyAssets, prepareRelease, verifyRelease } = require("../../scripts/prepareWorkerRelease.cjs");
const root = path.resolve(__dirname, "../..");
const policy = fs.readFileSync(path.join(root, ".assetsignore"));
function temporary(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tetinet-assets-test-"));
    t.after(() => {
        const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(dir));
        assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
        fs.rmSync(dir, { recursive: true });
    });
    return dir;
}
function write(root, file, value = "test") {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
}
function fixture(root) {
    write(root, ".assetsignore", policy);
    for (const file of ["worker.js", "wrangler.toml", "scripts/prepareWorkerRelease.cjs", "scripts/syncSiteChrome.cjs", "scripts/lib/siteChrome.cjs"]) write(root, file, "// fixture");
    write(root, "index.html", '<script src="/games/js/test.js"></script>');
    write(root, "games/js/test.js", "");
    write(root, "games/hsr/data/attacks.json", '{"generated":"attacks.generated.json"}');
    write(root, "games/hsr/data/attacks.generated.json", '{"attacks":[]}');
    write(root, "games/hsr/data/calc/data-files.json", '{"attackOverrides":[],"modifiers":[]}');
    write(root, "games/genshin/data/calc/constellation-effect-registry.json", '{"committed":true}');
}

test("public assets exclude development files, secrets and logs at root and nested paths", t => {
    const dir = temporary(t); write(dir, ".assetsignore", policy);
    const blocked = [".git/config", ".codex/config.toml", ".env", "games/.env.production", "games/data/key.pem", "games/data/local.key", "games/data/service-credentials.json", "games/data/profile-response.json", "games/data/debug.log", "games/data/cache.tmp", "node_modules/pkg/x.js", "tests/input.json", "scripts/build.cjs", "src/app.ts", "docs/design.html", "mockups/page.html", "games/hsr/data/README.md", "worker.js", "wrangler.toml", "local-server.cjs", "README.md", "RELEASE.json", "games/genshin/data/v2/characters/source.json", "games/genshin/data/v2/candidate-terminal-states.json"];
    const publicFiles = ["index.html", "games/js/app.js", "games/css/app.css", "games/images/x.webp", "games/data/data.csv", "games/hsr/data/catalog.json", "games/genshin/data/v2/runtime/canonical-runtime.json", "games/genshin/data/v2/candidates/7.0-provisional-characters.json", "games/genshin/data/v2/version-transitions/7.0-to-7.1/vesna-currentcalc.json", "THIRD_PARTY_NOTICES.md"];
    for (const file of [...blocked, ...publicFiles]) write(dir, file);
    assert.deepEqual(assets(dir), publicFiles.sort());
});

test("actual page assets, both data loaders and HSR manifests keep their references", () => {
    const inventory = verifyAssets(root).map(item => item.path);
    for (const file of ["index.html", "games/index.html", "games/hsr/index.html", "games/genshin/index.html", "games/gbf/index.html", "games/js/hsrApp.js", "games/js/genshinCalcEngine.js", "games/hsr/data/catalog.json", "games/genshin/data/calc/constellation-effect-registry.json"]) assert.ok(inventory.includes(file), file);
    assert.equal(inventory.some(file => file.startsWith("scripts/")), false);
});

test("release validation refuses excluded references and raw profiles with unremarkable filenames", t => {
    const dir = temporary(t); fixture(dir);
    fs.unlinkSync(path.join(dir, "games/js/test.js"));
    assert.throws(() => verifyAssets(dir), /Missing or excluded runtime references/);
    write(dir, "games/js/test.js", "");
    write(dir, "games/data/sample.json", '{"detailInfo":{"avatarDetailList":[]}}');
    assert.throws(() => verifyAssets(dir), /Raw profile response/);
});

test("release export uses the specified commit, omits dirty and untracked inputs and refuses overwrites", t => {
    const dir = temporary(t), repo = path.join(dir, "source"), out = path.join(dir, "release");
    fs.mkdirSync(repo); fixture(repo);
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true }).trim();
    git("init", "--quiet"); git("add", "--", ".assetsignore", "index.html", "games", "worker.js", "wrangler.toml", "scripts");
    git("-c", "user.name=Release test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    const commit = git("rev-parse", "HEAD");
    write(repo, "games/genshin/data/calc/constellation-effect-registry.json", '{"dirty":true}');
    write(repo, ".codex/config.toml"); write(repo, "games/data/untracked.json", "{}");
    const before = git("status", "--short"), result = prepareRelease(repo, commit, out);
    assert.equal(result.gitCommit, commit);
    assert.equal(fs.readFileSync(path.join(out, "games/genshin/data/calc/constellation-effect-registry.json"), "utf8"), '{"committed":true}');
    assert.equal(fs.existsSync(path.join(out, ".codex")), false);
    assert.equal(fs.existsSync(path.join(out, ".git")), false);
    assert.equal(fs.existsSync(path.join(out, "games/data/untracked.json")), false);
    assert.equal(git("status", "--short"), before);
    const manifest = JSON.parse(fs.readFileSync(path.join(out, "RELEASE.json")));
    assert.equal(manifest.gitCommit, commit); assert.equal(manifest.assets.length, result.assets);
    assert.equal(manifest.assets.some(a => a.path === "RELEASE.json"), false);
    assert.equal(verifyRelease(out).gitCommit, commit);
    write(out, "games/js/test.js", "changed");
    assert.throws(() => verifyRelease(out), /Release files have changed/);
    assert.throws(() => verifyRelease(repo), /isolated release/);
    assert.throws(() => prepareRelease(repo, commit, out), /already exist/);
    assert.throws(() => prepareRelease(repo, commit, path.join(repo, "dist")), /outside/);
});

test("Worker serves existing routes and keeps both profile APIs outside the static bundle", async () => {
    const context = { Request, Response, URL, fetch: async () => Response.json({ ttl: 0 }) };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, "worker.js"), "utf8").replace("export default", "globalThis.worker ="), context);
    const served = [];
    const env = { ASSETS: { fetch: async request => { served.push(new URL(request.url).pathname); return new Response("asset"); } } };
    for (const url of ["/", "/games/hsr/", "/games/genshin/", "/games/gbf/", "/games/js/theme.js", "/games/hsr/data/catalog.json", "/about/"]) assert.equal((await context.worker.fetch(new Request("https://tetinet.com" + url), env)).status, 200);
    const calls = served.length;
    for (const api of ["hsr-profile", "genshin-profile"]) {
        assert.equal((await context.worker.fetch(new Request("https://tetinet.com/games/api/" + api), env)).status, 400);
        assert.equal((await context.worker.fetch(new Request("https://tetinet.com/games/api/" + api + "?uid=10000000"), env)).status, 200);
    }
    assert.equal(served.length, calls);
});
