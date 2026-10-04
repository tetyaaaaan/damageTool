"use strict";

// Real-browser verification that Clorinde's current conditions affect only their intended damage entries.
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
const progress = (message) => console.log(`[genshin-clorinde-current-calc-e2e] ${message}`);

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
        const timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error(`CDP command timed out: ${method}`));
        }, 30000);
        const item = pending.get(id);
        pending.set(id, {
            resolve: (value) => { clearTimeout(timer); item.resolve(value); },
            reject: (error) => { clearTimeout(timer); item.reject(error); }
        });
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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-clorinde-current-"));
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
                window.__clorindeCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "クロリンデ", genshinCalcCharacterId: "10000098",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C6", genshinAtkInput: 2200, genshinDefInput: 1000,
                genshinHpInput: 20000, genshinCritRateInput: 50, genshinCritDamageInput: 100,
                genshinEnergyRechargeInput: 100, genshinNormalTalentLevel: 10,
                genshinSkillTalentLevel: 10, genshinBurstTalentLevel: 10
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
        await delay(150);
        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');

        const reactionKey = "talent:passive1:group:clorindeElectroReactionStacks";
        const bolKey = "constellation:C4:group:clorindeBondOfLife";
        const c6Key = "constellation:C6:group:clorindeC6AfterSkill";
        const skillModeKey = "talent:combat2:group:talent-state:10000098:combat2";
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-condition-key="${reactionKey}"]'))`);
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-condition-key="${bolKey}"]'))`);
        await waitFor(client, `document.querySelectorAll('[data-genshin-toggle-key="${c6Key}"]').length === 1`);
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-toggle-key="${skillModeKey}"]'))`);
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-toggle-key*="talent:combat2"]'))`);

        const setCondition = async (key, value) => {
            await evaluate(client, `(() => {
                const input = document.querySelector('[data-genshin-condition-key="${key}"]');
                if (!input) throw new Error("missing condition input " + ${JSON.stringify(key)});
                input.value = ${JSON.stringify(String(value))};
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(100);
        };
        const toggle = async (key) => {
            await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${key}"]').click()`);
            await delay(100);
        };
        const setNightVigil = async (enabled) => {
            const checked = await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${skillModeKey}"]').checked`);
            if (checked !== enabled) await toggle(skillModeKey);
            await delay(400);
            assert.equal(await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${skillModeKey}"]').checked`), enabled, "Night Vigil checkbox retains selected value");
        };
        const calculate = async () => {
            const formMode = await evaluate(client, `window.GenshinCalcEngine.buildCalculationRequestFromForm().uiState.toggleByModifier["${skillModeKey}"]`);
            await evaluate(client, "window.__clorindeCurrentPayload = null");
            await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            await waitFor(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0');
            const result = await evaluate(client, `(() => {
                const payload = window.__clorindeCurrentPayload;
                if (!payload) throw new Error("calculate button did not produce a payload");
                return {
                    text: document.getElementById("genshinJsonCalcResults").innerText,
                    stats: payload.context.effectiveStats,
                    states: payload.calculationRequest?.uiState?.conditionByModifier || {},
                    request: payload.calculationRequest,
                    results: payload.results.map((item) => ({
                        id: item.entry?.id || "", effectId: item.entry?.effectId || "",
                        attackType: item.entry?.attackType || "", damageType: item.entry?.damageType || "",
                        element: item.entry?.element || "", expected: Number(item.total?.expected ?? item.expected ?? 0),
                        nonCrit: Number(item.total?.nonCrit ?? item.nonCrit ?? 0),
                        critRate: Number(item.breakdown?.critRate ?? 0), critDamage: Number(item.breakdown?.critDamage ?? 0),
                        statBonus: item.breakdown?.statBonus || {}, damageBonus: item.breakdown?.damageBonus ?? null
                    }))
                };
            })()`);
            progress(`calculated with Bond of Life ${result.states[bolKey]?.stack ?? "?"}, reaction stacks ${result.states[reactionKey]?.stack ?? "?"}, mode ${result.states[skillModeKey]?.enabled ?? false} (form toggle ${formMode ?? false})`);
            result.formMode = Boolean(formMode);
            return result;
        };

        // Shared C6 control changes crit for both burst and normal damage.
        await setCondition(reactionKey, 0);
        await setCondition(bolKey, 0);
        const c6Input = await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${c6Key}"]').checked`);
        if (c6Input) await toggle(c6Key);
        progress("checking shared C6 crit control");
        const c6Off = await calculate();
        await toggle(c6Key);
        const c6On = await calculate();
        assert.equal(c6On.states[c6Key]?.enabled, true, "C6 shared crit control is enabled in the current request");
        const burstCrit = (snapshot) => snapshot.results.find((item) => item.attackType === "burst");
        assert.ok(Math.abs(burstCrit(c6On).critRate - burstCrit(c6Off).critRate - 10) < 1e-9, "C6 adds 10 percentage points of crit rate to burst damage");
        assert.ok(Math.abs(burstCrit(c6On).critDamage - burstCrit(c6Off).critDamage - 70) < 1e-9, "C6 adds 70 percentage points of crit damage to burst damage");
        assert.ok(c6On.results.some((item) => item.attackType === "burst" && item.critRate > 0), "Clorinde burst entry is calculated with shared C6 stats");
        assert.ok(c6On.results.some((item) => item.attackType === "normalAttack" && item.element === "physical"), "Clorinde base normal entry is calculated");

        // C4 is capped at 200% and should scale only Burst entries.
        const setBondAndCalc = async (value) => { await setCondition(bolKey, value); return calculate(); };
        progress("checking C4 Bond of Life scaling and cap");
        const bol0 = await setBondAndCalc(0);
        const bol50 = await setBondAndCalc(50);
        const bol100 = await setBondAndCalc(100);
        const bol150 = await setBondAndCalc(150);
        const bol200 = await setBondAndCalc(200);
        const burstEntries = (snapshot) => snapshot.results.filter((item) => item.attackType === "burst");
        assert.equal(bol200.states[bolKey]?.stack, 200, "200% Bond of Life is present in the request");
        assert.ok(burstEntries(bol50)[0]?.expected > burstEntries(bol0)[0]?.expected, "50% Bond of Life increases Clorinde burst damage");
        assert.ok(burstEntries(bol100)[0]?.expected > burstEntries(bol50)[0]?.expected, "100% Bond of Life increases Clorinde burst damage");
        assert.ok(Math.abs(burstEntries(bol150)[0]?.expected - burstEntries(bol100)[0]?.expected) < 1e-9, "C4 gain reaches its +200% cap at 100% Bond of Life");
        assert.ok(Math.abs(burstEntries(bol200)[0]?.expected - burstEntries(bol150)[0]?.expected) < 1e-9, "C4 gain remains capped above 100% Bond of Life");
        const normalAtBol0 = new Map(bol0.results.filter((item) => item.attackType !== "burst").map((item) => [item.id, item.expected]));
        for (const item of bol150.results.filter((entry) => entry.attackType !== "burst")) {
            if (normalAtBol0.has(item.id)) assert.equal(item.expected, normalAtBol0.get(item.id), `C4 does not affect non-burst entry ${item.id}`);
        }

        // A1 reaction stacks scale applicable Electro normal damage only; raw display overrides are not inputs.
        await setCondition(bolKey, 0);
        await setCondition(reactionKey, 0);
        progress("checking A1 reaction stacks");
        await setNightVigil(true);
        const reaction0 = await calculate();
        await setCondition(reactionKey, 3);
        assert.equal(await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${skillModeKey}"]').checked`), true, "Editing reaction stacks preserves the selected Night Vigil mode");
        const reaction3 = await calculate();
        assert.equal(reaction3.states[reactionKey]?.stack, 3, "three Electro reaction stacks are present in the request");
        const applicableNormals = reaction0.results.filter((item) => item.attackType === "normalAttack" && item.element === "雷");
        assert.ok(reaction0.formMode && reaction0.states[skillModeKey]?.enabled,
            `Night Patrol mode is enabled in both form and calculation request (${reaction0.formMode}/${reaction0.states[skillModeKey]?.enabled})`);
        assert.ok(applicableNormals.length > 0, "Clorinde has a generated Electro normal attack entry");
        for (const item of applicableNormals) {
            const changed = reaction3.results.find((entry) => entry.id === item.id);
            assert.ok(changed && changed.expected > item.expected, `A1 reaction stacks increase Electro normal entry ${item.id}`);
        }
        const baseNormals0 = new Map(reaction0.results.filter((item) => item.attackType === "normalAttack" && item.element !== "雷").map((item) => [item.id, item.expected]));
        for (const item of reaction3.results.filter((entry) => entry.attackType === "normalAttack" && entry.element !== "雷")) {
            if (baseNormals0.has(item.id)) assert.equal(item.expected, baseNormals0.get(item.id), `A1 does not change base non-Electro normal entry ${item.id}`);
        }

        // Turning on night patrol exposes dedicated Electro normal entries while preserving original base entries.
        progress("checking Night Patrol mode and follow-up entries");
        const modeOn = reaction3;
        await setNightVigil(false);
        const modeOff = await calculate();
        await setCondition(reactionKey, 0);
        await setNightVigil(true);
        const modeOnForComparisons = await calculate();
        assert.equal(modeOn.states[skillModeKey]?.enabled, true, "night patrol skill mode is present in the request");
        assert.ok(modeOn.results.some((item) => item.attackType === "normalAttack" && item.element === "雷"), "Clorinde normal attack entries use Electro during night patrol");
        const generatedFollowupIds = new Set();
        for (const item of modeOff.results.filter((entry) => entry.attackType === "normalAttack" && !generatedFollowupIds.has(entry.id))) {
            const unchanged = modeOnForComparisons.results.find((entry) => entry.id === item.id);
            if (unchanged) assert.equal(unchanged.expected, item.expected, `skill mode does not modify existing base normal entry ${item.id}`);
        }

        // Verify manual follow-up toggles are independent and only add their own entry.
        const followupKeys = await evaluate(client, `(() => [...document.querySelectorAll('[data-genshin-toggle-key]')]
            .map((input) => input.dataset.genshinToggleKey)
            .filter((key) => key.includes('c_10000098_1_1') || key.includes('c_10000098_6_4')))()`);
        assert.ok(followupKeys.length >= 2, `manual C1/C6 follow-up switches exist: ${followupKeys.join(", ")}`);
        const setFollowup = async (key, enabled) => {
            const checked = await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${key}"]').checked`);
            if (checked !== enabled) {
                await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${key}"]').click()`);
                await delay(400);
            }
        };
        const orderedFollowupKeys = [
            followupKeys.find((key) => key.includes("c_10000098_1_1")),
            followupKeys.find((key) => key.includes("c_10000098_6_4"))
        ];
        assert.ok(orderedFollowupKeys.every(Boolean), `C1 and C6 each have a manual switch: ${followupKeys.join(", ")}`);
        for (const key of orderedFollowupKeys) await setFollowup(key, false);
        const followupOff = await calculate();
        assert.ok(!followupOff.results.some((item) => item.effectId === "c_10000098_1_1" || item.effectId === "c_10000098_6_4"), "both follow-ups are absent when their switches are off");
        for (const key of orderedFollowupKeys) {
            await setFollowup(key, true);
            const snapshot = await calculate();
            const ownId = key.includes("c_10000098_1_1") ? "c_10000098_1_1" : "c_10000098_6_4";
            const own = snapshot.results.find((item) => item.effectId === ownId);
            assert.ok(own && own.expected > 0 && own.damageType === "normal" && own.attackType === "normalAttack" && own.element === "雷", `switch ${key} generates its own Electro normal follow-up`);
            generatedFollowupIds.add(own.id);
            for (const original of followupOff.results) {
                assert.equal(snapshot.results.find((entry) => entry.id === original.id)?.expected, original.expected, `follow-up does not alter original entry ${original.id}`);
            }
            const otherId = ownId === "c_10000098_1_1" ? "c_10000098_6_4" : "c_10000098_1_1";
            assert.ok(!snapshot.results.some((item) => item.effectId === otherId), `switch ${key} does not enable ${otherId}`);
            await setFollowup(key, false);
        }

        const replayMatches = await evaluate(client, `(async () => {
            const payload = window.__clorindeCurrentPayload;
            const data = await window.GenshinCalcData.loadGenshinCalcData();
            const saved = window.GenshinCalcEngine.createCalculationSnapshot(payload.calculationRequest, payload).request;
            const replay = window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(saved)), data);
            return JSON.stringify(replay.results) === JSON.stringify(payload.results);
        })()`);
        assert.equal(replayMatches, true, "JSON saved CalculationRequest reproduces browser damage exactly");

        console.log(`[genshin-clorinde-current-calc-e2e] PASS Clorinde 10000098: shared C6 +10 CR/+70 CD; C4 Bond of Life 0→50→100→150→200 affects Burst only and caps; A1 reaction stacks affect Electro normal hits only; skill mode exposes independently controlled C1/C6 Electro normal follow-ups without changing base normals`);
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
        if (profileDir && fs.existsSync(profileDir)) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ } }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
