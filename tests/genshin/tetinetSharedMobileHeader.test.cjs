const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function htmlFiles(directory = root) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        if ([".git", "node_modules", "mockups"].includes(entry.name)) return [];
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) return htmlFiles(absolute);
        return entry.name.endsWith(".html") ? [absolute] : [];
    });
}

test("every shared site header uses the common mobile navigation runtime", () => {
    const pages = htmlFiles().filter((file) => fs.readFileSync(file, "utf8").includes("teti-site-header"));
    assert.ok(pages.length >= 18, `shared header coverage unexpectedly shrank: ${pages.length}`);
    pages.forEach((file) => {
        const html = fs.readFileSync(file, "utf8");
        assert.match(html, /\/games\/js\/theme\.js/, path.relative(root, file));
        assert.doesNotMatch(html, /tetinetMobileNav\.js/, path.relative(root, file));
    });
});

test("theme runtime creates one accessible menu button before the brand", () => {
    const theme = read("games/js/theme.js");

    assert.match(theme, /function setupMobileNavigation\(\)/);
    assert.match(theme, /querySelectorAll\("\.teti-site-header"\)/);
    assert.match(theme, /button\.setAttribute\("aria-controls", nav\.id\)/);
    assert.match(theme, /inner\.insertBefore\(button, brand\)/);
    assert.match(theme, /header\.classList\.add\("has-mobile-navigation"\)/);
    assert.match(theme, /document\.body\.classList\.toggle\("is-site-menu-open", open\)/);
});

test("common runtime actually opens and closes a generated mobile drawer", () => {
    class FakeClassList {
        constructor(names = []) { this.names = new Set(names); }
        add(name) { this.names.add(name); }
        contains(name) { return this.names.has(name); }
        toggle(name, force) {
            const next = force === undefined ? !this.names.has(name) : Boolean(force);
            if (next) this.names.add(name); else this.names.delete(name);
            return next;
        }
    }
    class FakeElement {
        constructor(tagName, classes = []) {
            this.tagName = tagName;
            this.classList = new FakeClassList(classes);
            this.children = [];
            this.attributes = {};
            this.listeners = {};
            this.hidden = false;
            this.id = "";
            this.inert = false;
        }
        set className(value) { this.classList = new FakeClassList(String(value).split(/\s+/).filter(Boolean)); }
        get className() { return [...this.classList.names].join(" "); }
        appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
        insertBefore(child, reference) {
            const index = this.children.indexOf(reference);
            this.children.splice(index < 0 ? this.children.length : index, 0, child);
            child.parentElement = this;
            return child;
        }
        querySelector(selector) {
            const className = selector.startsWith(".") ? selector.slice(1) : "";
            for (const child of this.children) {
                if (className && child.classList.contains(className)) return child;
                const nested = child.querySelector(selector);
                if (nested) return nested;
            }
            return null;
        }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        setAttribute(name, value) { this.attributes[name] = String(value); if (name === "id") this.id = String(value); }
        getAttribute(name) { return this.attributes[name] ?? null; }
        removeAttribute(name) { delete this.attributes[name]; }
        focus() { this.focused = true; }
    }

    const brand = new FakeElement("a", ["teti-brand"]);
    const nav = new FakeElement("nav", ["teti-nav"]);
    const themeToggle = new FakeElement("button");
    const inner = new FakeElement("div", ["teti-header-inner"]);
    inner.appendChild(brand);
    inner.appendChild(nav);
    inner.appendChild(themeToggle);
    const header = new FakeElement("header", ["teti-site-header"]);
    header.appendChild(inner);
    const body = new FakeElement("body");
    const rootElement = new FakeElement("html");
    const documentListeners = {};
    const document = {
        body,
        documentElement: rootElement,
        createElement(tagName) { return new FakeElement(tagName); },
        querySelectorAll(selector) {
            if (selector === ".teti-site-header") return [header];
            if (selector === "[data-theme-toggle]") return [themeToggle];
            return [];
        },
        addEventListener(type, listener) { documentListeners[type] = listener; }
    };
    const media = { matches: true, addEventListener() {} };
    const storage = new Map();
    const localStorage = {
        getItem(key) { return storage.get(key) || null; },
        setItem(key, value) { storage.set(key, String(value)); }
    };

    vm.runInNewContext(read("games/js/theme.js"), { document, window: { matchMedia: () => media }, localStorage });
    documentListeners.DOMContentLoaded();

    const button = inner.querySelector(".teti-mobile-menu-button");
    const backdrop = header.querySelector(".teti-mobile-menu-backdrop");
    assert.ok(button);
    assert.ok(backdrop);
    assert.equal(inner.children.indexOf(button) < inner.children.indexOf(brand), true);
    assert.equal(nav.inert, true);
    button.listeners.click();
    assert.equal(header.classList.contains("is-menu-open"), true);
    assert.equal(body.classList.contains("is-site-menu-open"), true);
    assert.equal(button.getAttribute("aria-expanded"), "true");
    assert.equal(nav.getAttribute("aria-hidden"), "false");
    assert.equal(nav.inert, false);
    assert.equal(backdrop.hidden, false);
    backdrop.listeners.click();
    assert.equal(header.classList.contains("is-menu-open"), false);
    assert.equal(body.classList.contains("is-site-menu-open"), false);
    assert.equal(backdrop.hidden, true);
});

test("common CSS owns the mobile drawer and keeps it functional without JavaScript", () => {
    const css = read("games/css/tetinet.css");
    const repairCss = read("games/css/genshin-visual-repair.css");

    assert.match(css, /\.teti-mobile-menu-button,\s*\.teti-mobile-menu-backdrop\s*\{[^}]*display:\s*none/s);
    assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.teti-site-header\.has-mobile-navigation \.teti-nav\s*\{[^}]*position:\s*absolute;[^}]*top:\s*100%;[^}]*height:\s*calc\(100dvh - 57px\);[^}]*transform:\s*translateX\(-100%\)/s);
    assert.match(css, /\.teti-site-header\.has-mobile-navigation\.is-menu-open \.teti-nav\s*\{[^}]*visibility:\s*visible;[^}]*transform:\s*translateX\(0\)/s);
    assert.doesNotMatch(repairCss, /teti-mobile-menu|is-site-menu-open \.teti-site-header|body\.is-site-menu-open::before/);
});
