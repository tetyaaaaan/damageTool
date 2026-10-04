"use strict";

// Real-browser verification that Raiden's current conditions affect the intended damage entries.
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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-raiden-current-"));
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
                window.__raidenCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "雷電将軍", genshinCalcCharacterId: "10000052",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C0", genshinAtkInput: 2200, genshinDefInput: 1000,
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
        const eyeKey = "talent:combat2:group:talent-state:10000052:combat2";
        const resolveKey = "talent:combat3:group:raidenResolve";
        const excessErToggle = "talent:passive2:raiden_excess_er_electro_bonus";
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-condition-key="${eyeKey}"]'))`);
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-condition-key="${resolveKey}"]'))`);
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-toggle-key="${excessErToggle}"]'))`);
        await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${excessErToggle}"]').click()`);
        await delay(100);

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
        await setCondition(eyeKey, 90);
        await setCondition(resolveKey, 0);

        const calculate = async () => {
            await evaluate(client, "window.__raidenCurrentPayload = null");
            await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            await waitFor(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0');
            return evaluate(client, `(() => {
                const payload = window.__raidenCurrentPayload;
                if (!payload) throw new Error("calculate button did not produce a payload");
                return {
                    text: document.getElementById("genshinJsonCalcResults").innerText,
                    stats: payload.context.effectiveStats,
                    states: payload.calculationRequest?.uiState?.conditionByModifier || {},
                    results: payload.results.map((item) => ({
                        id: item.entry?.id || "", effectId: item.entry?.effectId || "",
                        attackType: item.entry?.attackType || "", damageType: item.entry?.damageType || "",
                        element: item.entry?.element || "", expected: Number(item.total?.expected ?? item.expected ?? 0),
                        nonCrit: Number(item.total?.nonCrit ?? item.nonCrit ?? 0),
                        defenseIgnore: Number(item.breakdown?.defenseIgnore ?? 0),
                        statBonus: item.breakdown?.statBonus || {}, elementDamageBonus: item.breakdown?.elementDamageBonus ?? null,
                        damageBonus: item.breakdown?.damageBonus ?? null
                    }))
                };
            })()`);
        };

        const erAt100 = await calculate();
        await evaluate(client, `(() => { const input = document.getElementById("genshinEnergyRechargeInput"); input.value = "250"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
        await delay(150);
        const erAt250 = await calculate();
        assert.equal(erAt100.stats.energyRecharge, 100, "Raiden starts at 100% ER");
        assert.equal(erAt250.stats.energyRecharge, 250, "Raiden current calculation uses 250% ER");
        const electroDamageBonus = (snapshot) => Number(snapshot.results.find((item) => item.id === "skilldamage")?.damageBonus || 0);
        assert.ok(Math.abs(electroDamageBonus(erAt250) - electroDamageBonus(erAt100) - 60) < 1e-9,
            `Raiden passive adds 60 percentage points of Electro bonus from 100% to 250% ER (got ${electroDamageBonus(erAt250) - electroDamageBonus(erAt100)})`);
        assert.ok(erAt250.results.some((item) => item.id === "skilldamage" && item.element === "雷" && item.expected > 0), "Raiden skill has an Electro damage entry");
        assert.equal(erAt250.states[excessErToggle]?.enabled, true,
            "Raiden excess-ER passive is represented in the current request");

        const burstDamage = (snapshot) => snapshot.results.find((item) => item.attackType === "burst" && item.element === "雷");
        const normalDamage = (snapshot) => snapshot.results.find((item) => item.attackType === "normalAttack" && item.element === "physical");
        const skillDamage = (snapshot) => snapshot.results.find((item) => item.attackType === "skill" || item.effectId?.includes("skill"));
        await setCondition(eyeKey, 0);
        const atZero = await calculate();
        await setCondition(resolveKey, 60);
        const atSixty = await calculate();
        const burstZero = burstDamage(atZero), burstSixty = burstDamage(atSixty);
        assert.ok(burstZero && burstSixty, `Raiden burst damage entries exist: ${JSON.stringify(atZero.results.map(({ id, attackType, element }) => ({ id, attackType, element })))}`);
        assert.ok(burstSixty.expected > burstZero.expected, "60 Resolve increases actual Raiden burst damage");
        assert.equal(atSixty.states[resolveKey]?.stack, 60, "60 Resolve is present in the current request");
        const normalZero = normalDamage(atZero), normalSixty = normalDamage(atSixty);
        if (normalZero && normalSixty) assert.equal(normalSixty.expected, normalZero.expected, "Resolve does not affect physical normal attacks");
        const skillZero = skillDamage(atZero), skillSixty = skillDamage(atSixty);
        if (skillZero && skillSixty) assert.equal(skillSixty.expected, skillZero.expected, "Resolve does not affect Raiden's skill entry");

        await setCondition(resolveKey, 0);
        const eyeOff = await calculate();
        await setCondition(eyeKey, 90);
        const eyeOn = await calculate();
        const eyeOnBurst = burstDamage(eyeOn);
        assert.ok(eyeOnBurst && eyeOnBurst.expected > burstDamage(eyeOff).expected, "90 recipient energy cost increases Raiden burst damage");
        assert.equal(eyeOn.states[eyeKey]?.stack, 90, "recipient energy cost 90 is present in the current request");
        const eyeText = await evaluate(client, `document.querySelector('[data-genshin-condition-key="${eyeKey}"]')?.closest("label")?.innerText || ""`);
        assert.ok(eyeText.includes("受け手の元素爆発エネルギーコスト"), `Eye condition is labeled with recipient burst cost (got ${eyeText})`);
        const eyeOffEntries = new Map(eyeOff.results.map((item) => [item.id, item.expected]));
        for (const item of eyeOn.results) {
            if (item.damageType !== "burst") assert.equal(item.expected, eyeOffEntries.get(item.id), `Eye's 90 energy setting does not affect non-burst entry ${item.id}`);
            else assert.ok(item.expected > eyeOffEntries.get(item.id), `Eye's 90 energy setting improves burst-damage entry ${item.id}`);
        }

        await evaluate(client, `(() => { const input = document.getElementById("genshinReflectConstellation"); input.value = "C2"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); })()`);
        await delay(200);
        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, '!document.getElementById("genshinConditionDialogOpen").disabled');
        const c2Toggle = "constellation:C2:c_10000052_2_1";
        await waitFor(client, `Boolean(document.querySelector('[data-genshin-toggle-key="${c2Toggle}"]'))`);
        await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${c2Toggle}"]').click()`);
        await delay(100);
        const c2On = await calculate();
        const c2Burst = c2On.results.find((item) => item.id === "damage_2");
        assert.ok(c2Burst && c2Burst.defenseIgnore === 60, `C2 applies 60% defense ignore to Raiden's burst hit (got ${c2Burst?.defenseIgnore})`);
        for (const id of ["normal_1damage", "skilldamage"]) {
            const before = atZero.results.find((item) => item.id === id);
            const after = c2On.results.find((item) => item.id === id);
            assert.ok(before && after, `C2 comparison entry ${id} exists`);
            assert.equal(after.defenseIgnore, before.defenseIgnore, `C2 does not affect physical normal or skill defense for ${id}`);
            assert.equal(after.expected, before.expected, `C2 does not change physical normal or skill damage for ${id}`);
        }

        console.log(`[genshin-raiden-current-calc-e2e] PASS Raiden 10000052: ER passive +60 Electro bonus (100% -> 250%); Eye at recipient cost 90 affects burst only; Resolve 0 -> 60 increases burst and excludes physical normal/skill; C2 applies only to burst`);
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
