"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const url = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/index.html";
const executable = process.env.BROWSER_EXECUTABLE;
const port = Number(process.env.BROWSER_DEBUG_PORT || 9231);
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
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
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
    return { socket, send };
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

(async () => {
    assert.ok(executable, "BROWSER_EXECUTABLE is required");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "genshin-p1-e2e-"));
    const browser = spawn(executable, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profile}`,
        url
    ], { stdio: "ignore", windowsHide: true });
    let client;
    try {
        const targets = await waitForJson(`http://127.0.0.1:${port}/json/list`);
        const page = targets.find((target) => target.type === "page" && target.url.includes("/games/genshin/"));
        assert.ok(page, "Genshin page target was not created");
        client = await connect(page.webSocketDebuggerUrl);
        await waitFor(client, "window.GenshinCalcRenderer && window.GenshinIdResolver?.listCharacters().length");
        await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
        await waitFor(client, "innerWidth === 390");

        await evaluate(client, `(() => {
            const set = (id, value) => {
                const element = document.getElementById(id);
                element.value = String(value);
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
            };
            set("genshinReflectCharacter", "胡桃");
            set("genshinCalcCharacterId", "10000046");
            set("genshinReflectConstellation", "C0");
            set("genshinHpInput", "30000");
            set("genshinAtkInput", "2000");
            set("genshinCritRateInput", "70");
            set("genshinCritDamageInput", "140");
            document.getElementById("genshinJsonCalcButtonBottom").click();
        })()`);
        await waitFor(client, "[...document.querySelectorAll('.genshin-damage-table')].some((table) => table.offsetWidth > 0)");

        const audit = await evaluate(client, `(() => {
            const table = [...document.querySelectorAll(".genshin-damage-table")].find((candidate) => candidate.offsetWidth > 0);
            const wrap = table.closest(".genshin-damage-table-wrap");
            const headers = [...table.querySelectorAll("thead th")].map((cell) => cell.getBoundingClientRect());
            const cells = [...table.querySelector(".genshin-damage-result-row").children].map((cell) => cell.getBoundingClientRect());
            const facts = [...document.querySelectorAll(".genshin-condition-facts")];
            const uidResult = document.getElementById("genshinUidResult");
            const uidSelector = document.getElementById("genshinCharacterSelector");
            uidResult.hidden = false;
            uidSelector.hidden = false;
            const uidSelect = document.getElementById("genshinProfileCharacterSelect");
            const uidStyle = getComputedStyle(uidSelect);
            const tableRect = table.getBoundingClientRect();
            const wrapRect = wrap.getBoundingClientRect();
            return {
                viewport: innerWidth,
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                tableWidth: Math.round(tableRect.width),
                wrapWidth: Math.round(wrapRect.width),
                rightGap: Math.round(wrapRect.right - tableRect.right),
                headerStarts: headers.map((rect) => Math.round(rect.left)),
                cellStarts: cells.map((rect) => Math.round(rect.left)),
                lastCellRightGap: Math.round(tableRect.right - cells[cells.length - 1].right),
                numericAlign: getComputedStyle(table.querySelector(".genshin-damage-result-row td")).textAlign,
                factLabels: facts.length ? [...facts[0].querySelectorAll("dt")].map((item) => item.textContent) : [],
                uidSelectFontSize: uidStyle.fontSize,
                uidSelectMinHeight: Math.round(parseFloat(uidStyle.minHeight))
            };
        })()`);

        assert.equal(audit.viewport, 390);
        assert.equal(audit.pageOverflow, false, JSON.stringify(audit));
        assert.ok(Math.abs(audit.tableWidth - audit.wrapWidth) <= 2, JSON.stringify(audit));
        assert.ok(audit.rightGap <= 1, JSON.stringify(audit));
        assert.deepEqual(audit.headerStarts, audit.cellStarts, JSON.stringify(audit));
        assert.equal(audit.lastCellRightGap, 0, JSON.stringify(audit));
        assert.equal(audit.numericAlign, "right");
        assert.ok(audit.factLabels.includes("発動条件"), JSON.stringify(audit));
        assert.ok(audit.factLabels.includes("効果"), JSON.stringify(audit));
        assert.equal(audit.uidSelectFontSize, "16px");
        assert.equal(audit.uidSelectMinHeight, 44);

        await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        await waitFor(client, "innerWidth === 1280");
        const desktopAudit = await evaluate(client, `(() => {
            const table = [...document.querySelectorAll(".genshin-damage-table")].find((candidate) => candidate.offsetWidth > 0);
            const wrap = table.closest(".genshin-damage-table-wrap");
            return {
                viewport: innerWidth,
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                tableWidth: Math.round(table.getBoundingClientRect().width),
                wrapWidth: Math.round(wrap.getBoundingClientRect().width)
            };
        })()`);
        assert.equal(desktopAudit.viewport, 1280);
        assert.equal(desktopAudit.pageOverflow, false, JSON.stringify(desktopAudit));
        assert.ok(Math.abs(desktopAudit.tableWidth - desktopAudit.wrapWidth) <= 2, JSON.stringify(desktopAudit));
        process.stdout.write(`${JSON.stringify({ mobile: audit, desktop: desktopAudit })}\n`);
    } finally {
        if (client) client.socket.close();
        browser.kill();
        await delay(300);
        try {
            const resolvedProfile = path.resolve(profile);
            const resolvedTemp = `${path.resolve(os.tmpdir())}${path.sep}`;
            assert.ok(resolvedProfile.startsWith(resolvedTemp) && path.basename(resolvedProfile).startsWith("genshin-p1-e2e-"), `unsafe temporary profile path: ${resolvedProfile}`);
            fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
        } catch (cleanupError) {
            process.stderr.write(`temporary browser profile cleanup skipped: ${cleanupError.code || cleanupError.message}\n`);
        }
    }
})().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
});
