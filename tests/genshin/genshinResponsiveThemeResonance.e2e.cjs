"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const url = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const executable = process.env.BROWSER_EXECUTABLE;
const port = Number(process.env.BROWSER_DEBUG_PORT || 9237);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(target, timeout = 15000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) {
        try {
            const response = await fetch(target);
            if (response.ok) return response.json();
        } catch {}
        await delay(80);
    }
    throw new Error(`timed out waiting for ${target}`);
}

async function connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
        if (!message.id || !pending.has(message.id)) return;
        const request = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    return { socket, send, exceptions };
}

async function evaluate(client, expression) {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}

async function waitFor(client, expression, timeout = 15000) {
    const limit = Date.now() + timeout;
    while (Date.now() < limit) {
        if (await evaluate(client, `Boolean(${expression})`)) return;
        await delay(60);
    }
    throw new Error(`timed out waiting for ${expression}`);
}

function auditExpression(width, theme) {
    return `(() => {
        document.documentElement.setAttribute("data-theme", ${JSON.stringify(theme)});
        const visible = (element) => element && element.offsetWidth > 0 && element.offsetHeight > 0;
        const overflows = [...document.querySelectorAll(".genshin-tool-page select, .genshin-tool-page input, .genshin-tool-page button")]
            .filter(visible)
            .filter((element) => !element.classList.contains("genshin-field-help"))
            .filter((element) => element.scrollWidth > element.clientWidth + 2)
            .map((element) => element.id || element.className).slice(0, 10);
        const page = document.querySelector(".genshin-tool-page");
        const pageStyle = getComputedStyle(page);
        const header = document.querySelector(".teti-header-inner").getBoundingClientRect();
        return {
            width: innerWidth,
            expectedWidth: ${width},
            theme: document.documentElement.getAttribute("data-theme"),
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            controlOverflows: overflows,
            headerTop: Math.round(header.top), headerWidth: Math.round(header.width),
            headerRight: Math.round(header.right),
            foreground: pageStyle.color,
            background: pageStyle.backgroundColor,
            accent: getComputedStyle(document.documentElement).getPropertyValue("--teti-accent").trim()
        };
    })()`;
}

(async () => {
    assert.ok(executable, "BROWSER_EXECUTABLE is required");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "genshin-responsive-e2e-"));
    const browser = spawn(executable, [
        "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
        `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, url
    ], { stdio: "ignore", windowsHide: true });
    let client;
    try {
        const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
        const page = targets.find((target) => target.type === "page" && target.url.includes("/games/genshin/"));
        assert.ok(page, "Genshin page target was not created");
        client = await connect(page.webSocketDebuggerUrl);
        await waitFor(client, "window.GenshinCalcRenderer && window.GenshinElementalResonance && window.GenshinIdResolver?.listCharacters().length");
        await waitFor(client, "document.getElementById('genshinNormalTalentLevel').getBoundingClientRect().width > 0");

        await evaluate(client, `(() => {
            const set = (id, value) => {
                const element = document.getElementById(id);
                element.value = String(value);
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
            };
            set("genshinReflectCharacter", "甘雨");
            set("genshinCalcCharacterId", "10000037");
            set("genshinPartyCharacter2", "10000035");
            return true;
        })()`);

        const matrix = [];
        for (const width of [390, 768, 1280]) {
            await client.send("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 900, deviceScaleFactor: 1, mobile: width < 768 });
            await waitFor(client, `innerWidth === ${width}`);
            for (const theme of ["light", "dark"]) {
                const audit = await evaluate(client, auditExpression(width, theme));
                assert.equal(audit.width, width, JSON.stringify(audit));
                assert.equal(audit.theme, theme, JSON.stringify(audit));
                assert.equal(audit.pageOverflow, false, JSON.stringify(audit));
                assert.deepEqual(audit.controlOverflows, [], JSON.stringify(audit));
                assert.ok(audit.headerTop >= 0 && audit.headerWidth > 0 && audit.headerRight <= width, JSON.stringify(audit));
                assert.notEqual(audit.foreground, audit.background, JSON.stringify(audit));
                assert.ok(audit.accent, JSON.stringify(audit));
                matrix.push(audit);
            }

            await evaluate(client, `document.getElementById("genshinPartyDialogOpen").click()`);
            await waitFor(client, "document.getElementById('genshinPartyDialog').open");
            const partyDialog = await evaluate(client, `(() => {
                const dialog = document.getElementById("genshinPartyDialog");
                const rect = dialog.getBoundingClientRect();
                return {
                    left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
                    overflowX: dialog.scrollWidth > dialog.clientWidth,
                    selected: document.getElementById("genshinPartyCharacter2").value,
                    summary: document.getElementById("genshinPartySummary").textContent
                };
            })()`);
            assert.ok(partyDialog.left >= 0 && partyDialog.right <= width, JSON.stringify(partyDialog));
            assert.ok(partyDialog.top >= 0 && partyDialog.bottom <= (width === 390 ? 844 : 900), JSON.stringify(partyDialog));
            assert.equal(partyDialog.overflowX, false, JSON.stringify(partyDialog));
            assert.equal(partyDialog.selected, "10000035");
            assert.match(partyDialog.summary, /粉砕の氷/);
            await evaluate(client, `document.getElementById("genshinPartyDialogClose").click()`);
        }

        await evaluate(client, `document.getElementById("genshinJsonPrepareConditionsButton").click()`);
        await waitFor(client, "document.querySelector('[data-condition-panel=party]')");
        await evaluate(client, `document.getElementById("genshinConditionDialogOpen").click()`);
        await waitFor(client, "document.getElementById('genshinConditionDialog').open");
        await evaluate(client, `document.querySelector('[data-condition-tab=party]').click()`);
        const resonance = await evaluate(client, `(() => {
            const panel = document.querySelector("[data-condition-panel=party]");
            const dialog = document.getElementById("genshinConditionDialog");
            const rect = dialog.getBoundingClientRect();
            const tabs = document.getElementById("genshinConditionTabs");
            return {
                text: panel.innerText,
                checkboxCount: panel.querySelectorAll('[data-genshin-party-buff-key="resonance:cryo:crit"]').length,
                panelOverflow: panel.scrollWidth > panel.clientWidth,
                tabOverflow: tabs.scrollWidth > tabs.clientWidth,
                dialogInside: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
            };
        })()`);
        assert.match(resonance.text, /元素共鳴/);
        assert.match(resonance.text, /粉砕の氷/);
        assert.equal(resonance.checkboxCount, 1);
        assert.equal(resonance.panelOverflow, false, JSON.stringify(resonance));
        assert.equal(resonance.tabOverflow, false, JSON.stringify(resonance));
        assert.equal(resonance.dialogInside, true, JSON.stringify(resonance));
        assert.deepEqual(client.exceptions, []);

        process.stdout.write(`${JSON.stringify({ matrix, resonance })}\n`);
    } finally {
        if (client) client.socket.close();
        browser.kill();
        await delay(300);
        const resolved = path.resolve(profile);
        const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
        assert.ok(resolved.startsWith(tempRoot) && path.basename(resolved).startsWith("genshin-responsive-e2e-"));
        try {
            fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
        } catch (cleanupError) {
            process.stderr.write(`temporary browser profile cleanup skipped: ${cleanupError.code || cleanupError.message}\n`);
        }
    }
})().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
