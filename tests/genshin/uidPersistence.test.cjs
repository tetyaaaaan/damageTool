const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const storageSource = read("games/js/uidStorage.js");

function createStorageHarness() {
    const values = new Map();
    const localStorage = {
        getItem(key) {
            return values.has(key) ? values.get(key) : null;
        },
        setItem(key, value) {
            values.set(key, String(value));
        },
        removeItem(key) {
            values.delete(key);
        }
    };
    const window = { localStorage };
    vm.runInNewContext(storageSource, { window });
    return { storage: window.TetinetUidStorage, values };
}

test("UID storage keeps the last successful UID separately for each game", () => {
    const { storage, values } = createStorageHarness();

    assert.equal(storage.save("genshin", "800123456"), true);
    assert.equal(storage.save("hsr", "900123456"), true);
    assert.equal(storage.load("genshin"), "800123456");
    assert.equal(storage.load("hsr"), "900123456");
    assert.equal(values.get("tetinet:genshin:lastUid:v1"), "800123456");
    assert.equal(values.get("tetinet:hsr:lastUid:v1"), "900123456");
});

test("UID storage rejects invalid values and supports explicit removal", () => {
    const { storage } = createStorageHarness();

    assert.equal(storage.save("genshin", "not-a-uid"), false);
    assert.equal(storage.load("genshin"), "");
    assert.equal(storage.save("genshin", "800123456"), true);
    assert.equal(storage.remove("genshin"), true);
    assert.equal(storage.load("genshin"), "");
});

test("UID storage failures do not break profile search", () => {
    const window = {
        localStorage: {
            getItem() { throw new Error("blocked"); },
            setItem() { throw new Error("blocked"); },
            removeItem() { throw new Error("blocked"); }
        }
    };
    vm.runInNewContext(storageSource, { window });

    assert.equal(window.TetinetUidStorage.load("genshin"), "");
    assert.equal(window.TetinetUidStorage.save("genshin", "800123456"), false);
    assert.equal(window.TetinetUidStorage.remove("genshin"), false);
});

test("both UID importers save only after a profile with public characters succeeds", () => {
    const cases = [
        ["games/js/genshinUidImporter.js", "genshin"],
        ["games/js/hsrUidImporter.js", "hsr"]
    ];

    cases.forEach(([file, game]) => {
        const source = read(file);
        const emptyProfileGuard = source.indexOf("if (!profile.characters.length)");
        const saveCall = source.indexOf(`.save("${game}", uid)`);
        assert.ok(emptyProfileGuard >= 0, `${game}: public-character guard`);
        assert.ok(saveCall > emptyProfileGuard, `${game}: save follows successful profile guard`);
        assert.match(source, new RegExp(`\\.load\\("${game}"\\)`));
        assert.match(source, new RegExp(`\\.remove\\("${game}"\\)`));
    });
});

test("both calculator pages load UID storage before their importer and expose deletion", () => {
    const cases = [
        ["games/genshin/index.html", "genshinUidImporter.js", "genshinUidClearSavedButton"],
        ["games/hsr/index.html", "hsrUidImporter.js", "hsrUidClearSavedButton"]
    ];

    cases.forEach(([file, importer, clearButtonId]) => {
        const html = read(file);
        assert.ok(html.indexOf("/games/js/uidStorage.js") < html.indexOf(`/games/js/${importer}`), file);
        assert.match(html, new RegExp(`id="${clearButtonId}"[^>]*hidden`));
        assert.match(html, /検索に成功したUIDは、このブラウザに保存/);
    });
});
