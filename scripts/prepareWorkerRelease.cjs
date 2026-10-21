"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function assets(root) {
    const patterns = fs.readFileSync(path.join(root, ".assetsignore"), "utf8").split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
    // This policy deliberately uses exclusion rules only, avoiding re-inclusion of secrets.
    if (patterns.some(p => p.startsWith("!"))) throw new Error("Release asset checks do not support negated ignore rules.");
    const excluded = file => patterns.some(p => {
        const directory = p.endsWith("/");
        let pattern = directory ? p.slice(0, -1) : p;
        if (!pattern.includes("/")) pattern = "**/" + pattern;
        return path.posix.matchesGlob(file, directory ? pattern + "/**" : pattern);
    });
    const files = [];
    function walk(dir = "") {
        for (const item of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            const file = dir ? dir + "/" + item.name : item.name;
            if (excluded(file) || excluded(file + "/")) continue;
            if (item.isSymbolicLink()) throw new Error("Symbolic links are not permitted: " + file);
            if (item.isDirectory()) walk(file); else if (item.isFile()) files.push(file);
        }
    }
    walk();
    return files.sort();
}

function verifyAssets(root) {
    const files = assets(root), available = new Set(files), errors = [];
    const leaked = files.find(file => /^(?:scripts|tests|src|docs|mockups|reports|node_modules)\//.test(file) || /(?:^|\/)\.[^/]+/.test(file) || /^(?:worker\.js|wrangler\.toml|local-server\.cjs|AGENTS\.md|README\.md|RELEASE\.json)$/.test(file));
    if (leaked) throw new Error("Release policy exposes a development file: " + leaked);
    for (const file of files.filter(f => /\.(?:json|js|html|txt)$/.test(f))) {
        const text = fs.readFileSync(path.join(root, file), "utf8");
        if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) throw new Error("Private key found in public asset: " + file);
        if (file.endsWith(".json")) {
            const value = JSON.parse(text);
            if (value?.detailInfo?.avatarDetailList || value?.avatarDetailList || value?.playerInfo?.showAvatarInfoList) throw new Error("Raw profile response found in public asset: " + file);
        }
    }
    const resolve = (reference, from) => {
        if (/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference)) return;
        const clean = reference.split(/[?#]/)[0];
        if (!clean) return;
        const file = path.posix.normalize(clean.startsWith("/") ? clean.slice(1) : path.posix.join(path.posix.dirname(from), clean));
        const target = file.endsWith("/") ? file + "index.html" : file;
        if (!available.has(target)) errors.push(from + " -> " + reference);
    };
    for (const file of files) {
        if (!/\.(?:html|css|js)$/.test(file)) continue;
        let source = fs.readFileSync(path.join(root, file), "utf8");
        if (file.endsWith(".css")) source = source.replace(/\/\*[\s\S]*?\*\//g, "");
        if (file.endsWith(".html")) source = source.replace(/<!--[\s\S]*?-->/g, "");
        if (file.endsWith(".html")) {
            for (const m of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
                if (/\.(?:js|css|png|jpe?g|webp|svg|ico|woff2?|csv|json)(?:[?#]|$)/i.test(m[1])) resolve(m[1], file);
            }
        }
        if (file.endsWith(".css")) for (const m of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) resolve(m[1], file);
        if (file.endsWith(".js")) for (const m of source.matchAll(/["'`](\/[^"'`\s${}]+\.(?:json|csv|png|webp|svg|js|css))["'`]/g)) resolve(m[1], file);
    }
    const json = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const base = "games/hsr/data/", calc = base + "calc/";
    const manifest = json(base + "attacks.json"), data = json(calc + "data-files.json");
    resolve(manifest.generated, base + "attacks.json");
    for (const file of [...data.attackOverrides, ...data.modifiers]) resolve(file, calc + "data-files.json");
    if (errors.length) throw new Error("Missing or excluded runtime references:\n" + [...new Set(errors)].join("\n"));
    return files.map(file => ({ path: file, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") }));
}

const buildFiles = [".assetsignore", "worker.js", "wrangler.toml", "scripts/prepareWorkerRelease.cjs", "scripts/syncSiteChrome.cjs", "scripts/lib/siteChrome.cjs"];
function buildInventory(root) {
    return buildFiles.map(file => ({ path: file, sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex") }));
}
function releaseManifest(root, commit) {
    return { gitCommit: commit, assets: verifyAssets(root), buildFiles: buildInventory(root) };
}
function verifyRelease(root) {
    if (fs.existsSync(path.join(root, ".git")) || fs.readdirSync(root).some(file => /^(?:\.codex|\.env(?:\.|$)|\.dev\.vars(?:\.|$))/.test(file))) throw new Error("Deploy only from an isolated release directory, without Git/local configuration.");
    const saved = JSON.parse(fs.readFileSync(path.join(root, "RELEASE.json"), "utf8"));
    if (!/^[a-f0-9]{40}$/.test(saved.gitCommit)) throw new Error("Release commit is invalid.");
    const actual = releaseManifest(root, saved.gitCommit);
    if (JSON.stringify(actual) !== JSON.stringify(saved)) throw new Error("Release files have changed. Prepare a fresh release from the approved commit.");
    return { gitCommit: saved.gitCommit, assets: saved.assets.length };
}

function prepareRelease(repo, ref, destination) {
    const git = (...args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", windowsHide: true }).trim();
    const commit = git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}");
    const out = path.resolve(destination), parent = fs.realpathSync(path.dirname(out)), workspace = fs.realpathSync(repo);
    const realOut = path.join(parent, path.basename(out));
    const relative = path.relative(workspace, realOut);
    if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Release directory must be outside the working repository.");
    if (fs.existsSync(out)) throw new Error("Release directory must not already exist.");
    const tracked = git("ls-tree", "-r", "--name-only", commit).split("\n");
    if (tracked.some(file => /(?:^|\/)(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?)$|\.(?:pem|key|p12|pfx)$/i.test(file))) throw new Error("Release commit contains a secret/configuration file.");
    if (git("ls-tree", "-r", commit).split("\n").some(line => line.startsWith("120000 "))) throw new Error("Release commit contains a symbolic link.");
    const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), "tetinet-archive-")), archive = path.join(archiveDir, "source.tar");
    try {
        execFileSync("git", ["-C", repo, "archive", "--format=tar", "--output=" + archive, commit], { windowsHide: true });
        fs.mkdirSync(out);
        execFileSync("tar", ["-xf", archive, "-C", out], { windowsHide: true });
    } finally {
        if (fs.existsSync(archive)) fs.unlinkSync(archive);
        fs.rmdirSync(archiveDir);
    }
    // Archive/checkout line endings can differ; record the existing build's output.
    execFileSync(process.execPath, [path.join(out, "scripts/syncSiteChrome.cjs")], { cwd: out, windowsHide: true });
    const manifest = releaseManifest(out, commit);
    fs.writeFileSync(path.join(out, "RELEASE.json"), JSON.stringify(manifest, null, 2) + "\n");
    return { gitCommit: commit, directory: out, assets: manifest.assets.length };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        if (args[0] === "--check-release") console.log(JSON.stringify(verifyRelease(process.cwd())));
        else if (args[0] === "--check") console.log(JSON.stringify({ assets: verifyAssets(process.cwd()).length }));
        else {
            if (args.length !== 2) throw new Error("Usage: node scripts/prepareWorkerRelease.cjs <commit> <new-directory-outside-repo> | --check");
            console.log(JSON.stringify(prepareRelease(path.resolve(__dirname, ".."), args[0], args[1]), null, 2));
        }
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { assets, verifyAssets, prepareRelease, releaseManifest, verifyRelease };
