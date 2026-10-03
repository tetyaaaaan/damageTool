"use strict";

// Real-browser verification that the 7.0 artifact conditions reach the
// calculator's current request and change its actual reaction damage.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9224);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try { const response = await fetch(url); if (response.ok) return response.json(); }
        catch (error) { lastError = error; }
        await delay(100);
    }
    throw lastError || new Error(`timed out waiting for ${url}`);
}

async function waitForHttp(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try { const response = await fetch(url); if (response.ok) return response; }
        catch (error) { lastError = error; }
        await delay(100);
    }
    throw lastError || new Error(`timed out waiting for ${url}`);
}

async function assertDebugPortFree(port) {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
        if (response.ok) throw new Error(`debug port ${port} already has a browser; refusing to connect to or close it`);
    } catch (error) { if (error.message.includes("already has a browser")) throw error; }
}

async function connectCdp(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (!message.id || !pending.has(message.id)) return;
        const item = pending.get(message.id); pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++; pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Runtime.enable"); await send("Page.enable");
    return { socket, send };
}

async function evaluate(client, expression) {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
}

async function waitFor(client, expression, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(client, expression)) return;
        await delay(50);
    }
    throw new Error(`timed out waiting for: ${expression}`);
}

async function main() {
    assert.ok(fs.existsSync(browserPath), `browser not found: ${browserPath}`);
    let serverProcess = null;
    let browser = null;
    let client = null;
    let profileDir = null;
    try {
        const response = await fetch(new URL("/games/genshin/", baseUrl), { signal: AbortSignal.timeout(1000) }).catch(() => null);
        if (!response?.ok) {
            serverProcess = spawn(process.execPath, [path.join(root, "local-server.cjs")], {
                cwd: root, env: { ...process.env, PORT: "4173" }, stdio: "ignore", windowsHide: true
            });
            await waitForHttp(new URL("/games/genshin/", baseUrl).toString());
        }
        await assertDebugPortFree(debugPort);
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin70-artifacts-"));
        browser = spawn(browserPath, [
            "--headless=new", "--disable-gpu", "--window-size=1280,900", "--no-first-run",
            "--no-default-browser-check", `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profileDir}`, baseUrl
        ], { stdio: "ignore", windowsHide: true });
        const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
        const page = targets.find((target) => target.type === "page" && target.url.includes("/games/genshin/"));
        assert.ok(page, "Genshin page target was not created");
        client = await connectCdp(page.webSocketDebuggerUrl);
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcConditions && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await evaluate(client, `(() => {
            const original = window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc = async (...args) => {
                const payload = await original(...args);
                window.__genshin70ArtifactPayload = payload;
                return payload;
            };
            return true;
        })()`);

        const setupCharacter = async ({ id, name, atk = 2200, critRate = 50, reaction }) => {
            await evaluate(client, `(() => {
                const values = {
                    genshinReflectCharacter: ${JSON.stringify(name)},
                    genshinCalcCharacterId: ${JSON.stringify(id)},
                    genshinWeaponInput: "", genshinCalcWeaponId: "",
                    genshinReflectLevel: 90, genshinAtkInput: ${JSON.stringify(atk)},
                    genshinDefInput: 1000, genshinHpInput: 20000,
                    genshinCritRateInput: ${JSON.stringify(critRate)},
                    genshinCritDamageInput: 100,
                    genshinNormalTalentLevel: 10, genshinSkillTalentLevel: 10, genshinBurstTalentLevel: 10,
                    genshinJsonReactionOption: ${JSON.stringify(reaction)}
                };
                for (const [id, value] of Object.entries(values)) {
                    const element = document.getElementById(id);
                    if (!element) continue;
                    element.value = String(value);
                    element.dispatchEvent(new Event("input", { bubbles: true }));
                    element.dispatchEvent(new Event("change", { bubbles: true }));
                }
                return true;
            })()`);
            await delay(120);
        };

        const setArtifact = async (id, name) => {
            await evaluate(client, `(() => {
                const mode = document.getElementById("genshinArtifactSetMode");
                mode.value = "4pc";
                mode.dispatchEvent(new Event("input", { bubbles: true }));
                mode.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await delay(100);
            await evaluate(client, 'document.querySelector("#genshinArtifactSetOneTrigger").click()');
            await waitFor(client, 'document.getElementById("genshinSelectionDialog")?.open === true');
            await evaluate(client, `(() => {
                const search = document.getElementById("genshinSelectionSearch");
                search.value = ${JSON.stringify(name)};
                search.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `Boolean(document.querySelector('#genshinSelectionList [data-selection-id="${id}"]'))`);
            await evaluate(client, `document.querySelector('#genshinSelectionList [data-selection-id="${id}"]').click()`);
            await waitFor(client, `document.getElementById("genshinArtifactSetOne").value === ${JSON.stringify(id)}`);
            await evaluate(client, 'document.getElementById("genshinJsonPrepareConditionsButton").click()');
            await waitFor(client, `Boolean(document.querySelector('[data-artifact-set="${id}"][data-artifact-piece="4"] input[data-gensin-toggle-key], [data-artifact-set="${id}"][data-artifact-piece="4"] input[data-genshin-toggle-key]'))`);
        };

        const setArtifactEnabled = async (id, enabled) => {
            await evaluate(client, `(() => {
                const input = document.querySelector('[data-artifact-set="${id}"][data-artifact-piece="4"] input[data-genshin-toggle-key]');
                if (!input) throw new Error("missing artifact condition toggle for ${id}");
                if (input.checked !== ${JSON.stringify(enabled)}) input.click();
                return input.checked;
            })()`);
            await delay(150);
        };

        const calculate = async () => {
            await evaluate(client, "window.__genshin70ArtifactPayload = null");
            await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            await waitFor(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0');
            return evaluate(client, `(() => {
                const payload = window.__genshin70ArtifactPayload;
                if (!payload) throw new Error("calculate button did not produce a payload");
                return {
                    text: document.getElementById("genshinJsonCalcResults").innerText,
                    critRate: payload.context.effectiveStats.critRate,
                    states: Object.entries(payload.calculationRequest?.uiState?.conditionByModifier || {}),
                    results: payload.results.map((item) => ({
                        reaction: item.entry?.directReactionId || "",
                        expected: Number(item.total?.expected ?? item.expected ?? 0),
                        nonCrit: Number(item.total?.nonCrit ?? item.nonCrit ?? 0),
                        entryId: item.entry?.id || "",
                        critRate: Number(item.breakdown?.critRate ?? 0),
                        reactionBonus: Number(item.breakdown?.reactionBonus ?? 0),
                        statBonus: item.breakdown?.statBonus || {}
                    })),
                    artifactIds: [...(payload.candidateModifiers || []), ...(payload.partyModifiers || [])]
                        .filter((item) => String(item.modifier?.artifactSetId || "").startsWith("150"))
                        .map((item) => item.modifier.id)
                };
            })()`);
        };

        await setupCharacter({ id: "10000150", name: "オデット", critRate: 50, reaction: "stellarSwirl" });
        await setArtifact("15047", "紅血の証");
        await setArtifactEnabled("15047", false);
        const scarletOff = await calculate();
        await setArtifactEnabled("15047", true);
        const scarletOn = await calculate();
        const swirlOff = scarletOff.results.find((item) => item.entryId === "reaction_stellarSwirl");
        const swirlOn = scarletOn.results.find((item) => item.entryId === "reaction_stellarSwirl");
        assert.ok(swirlOff && swirlOn, `15047 current calculation includes Stellar Swirl: ${JSON.stringify(scarletOff.results.map((item) => ({ entryId: item.entryId, reaction: item.reaction, expected: item.expected })))}`);
        assert.ok(Math.abs(swirlOff.critRate - 50) < 1e-9, `15047 OFF Stellar Swirl crit rate remains 50% (got ${swirlOff.critRate})`);
        assert.ok(Math.abs(swirlOn.critRate - 66) < 1e-9, `15047 ON Stellar Swirl crit rate becomes 66% (got ${swirlOn.critRate})`);
        assert.ok(Math.abs(swirlOn.reactionBonus - swirlOff.reactionBonus - 40) < 1e-9, `15047 adds 40% Stellar Swirl reaction bonus (got ${swirlOn.reactionBonus - swirlOff.reactionBonus})`);
        assert.ok(swirlOn.expected > swirlOff.expected, "15047 ON improves actual Stellar Swirl expected damage");
        assert.ok(scarletOn.states.some(([key, state]) => key.includes("15047") && state.enabled === true),
            "15047 ON is present in the current calculation request");
        assert.notEqual(scarletOn.text, scarletOff.text, "15047 changes the rendered current calculation");

        await setupCharacter({ id: "10000150", name: "オデット", critRate: 50, reaction: "stellarConduct" });
        await setArtifact("15048", "炉炎溶錬の心");
        await setArtifactEnabled("15048", false);
        const furnaceOff = await calculate();
        await setArtifactEnabled("15048", true);
        const furnaceOn = await calculate();
        const conductOff = furnaceOff.results.find((item) => item.reaction === "stellarConduct");
        const conductOn = furnaceOn.results.find((item) => item.reaction === "stellarConduct");
        assert.ok(conductOff && conductOn, "15048 current calculation includes Stellar Conduct");
        assert.ok(conductOn.expected > conductOff.expected, "15048 party Stellar bonus increases actual Stellar Conduct damage");
        assert.equal(conductOn.reactionBonus - conductOff.reactionBonus, 50, "15048 adds 50% Stellar Conduct reaction bonus");
        assert.ok(furnaceOn.states.some(([key, state]) => key.includes("15048") && state.enabled === true),
            "15048 ON is present in the current calculation request");
        assert.notEqual(furnaceOn.text, furnaceOff.text, "15048 changes the rendered current calculation");

        console.log("[genshin70-artifact-current-calc-e2e] PASS 15047 Stellar Swirl: CR 50% -> 66%, +40 reaction bonus; 15048 Stellar Conduct actual damage increases");
    } finally {
        try { client?.socket.close(); } catch {}
        if (browser && !browser.killed) {
            try {
                const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, 500);
                const socket = new WebSocket(version.webSocketDebuggerUrl);
                await new Promise((resolve, reject) => {
                    socket.addEventListener("open", resolve, { once: true });
                    socket.addEventListener("error", reject, { once: true });
                });
                socket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
                await Promise.race([delay(250), new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }))]);
                socket.close();
            } catch { try { browser.kill(); } catch {} }
        }
        if (serverProcess && !serverProcess.killed) { try { serverProcess.kill(); } catch {} }
        if (profileDir && fs.existsSync(profileDir)) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* Windows may still hold profile files briefly after Browser.close. */ } }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
