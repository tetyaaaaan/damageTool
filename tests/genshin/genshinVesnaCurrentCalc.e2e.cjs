"use strict";

// Real-browser regression for Vesna's provisional current-calculation route.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9228);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-vesna-current-calc-e2e] ${message}`);

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
        const id = nextId++;
        const timer = setTimeout(() => {
            if (!pending.has(id)) return;
            pending.delete(id);
            reject(new Error(`CDP command timed out: ${method}`));
        }, 30000);
        pending.set(id, {
            resolve: (value) => { clearTimeout(timer); resolve(value); },
            reject: (error) => { clearTimeout(timer); reject(error); }
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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-vesna-current-"));
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
                window.__vesnaCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);
        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "ヴェスナ", genshinCalcCharacterId: "10000143",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C6", genshinAtkInput: 2000, genshinDefInput: 1000,
                genshinHpInput: 20000, genshinElementalMasteryInput: 100,
                genshinCritRateInput: 50, genshinCritDamageInput: 100,
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
        await delay(200);

        const calculate = async () => {
            await evaluate(client, 'window.__vesnaCurrentPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__vesnaCurrentPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__vesnaCurrentPayload");
        };
        const replay = async () => {
            const exact = await evaluate(client, `(async () => {
                const p=window.__vesnaCurrentPayload;
                const data=await window.GenshinCalcData.loadGenshinCalcData();
                const request=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request;
                const restored=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(request)),data);
                return JSON.stringify(restored.results)===JSON.stringify(p.results);
            })()`);
            assert.equal(exact, true, "saved CalculationRequest reproduces Vesna damage exactly");
        };
        const entry = (payload, id) => {
            const row = payload.results.find((item) => item.entry.id === id);
            assert.ok(row, `missing damage entry ${id}; got ${payload.results.map((item) => item.entry.id).join(", ")}`);
            return row;
        };
        const setState = async (key, field, value) => {
            const attr = field === "toggle" ? "data-genshin-toggle-key" : "data-genshin-condition-key";
            const selector = `[${attr}="${key}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {
                const element=document.querySelector(${JSON.stringify(selector)});
                if (${JSON.stringify(field)} === "toggle") {
                    if (element.checked !== Boolean(${JSON.stringify(value)})) element.click();
                } else {
                    element.value=${JSON.stringify(String(value))};
                    element.dispatchEvent(new Event("input",{bubbles:true}));
                    element.dispatchEvent(new Event("change",{bubbles:true}));
                }
            })()`);
            await delay(300);
        };

        let payload = await calculate();
        assert.equal(payload.calculationRequest.characterId, "10000143", "Vesna is selected in the current request");
        assert.equal(payload.calculationRequest.constellation, 6, "C6 reaches the current request");
        const a1 = { key: "character:10000143:group:vesna_disciplinary" };
        const radiance = { key: "character:10000143:group:vesna_radiance" };
        const followup = { key: "character:10000143:group:vesna_transpose" };
        const mode = { key: "talent:combat2:group:talent-state:10000143:combat2" };

        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        // The A1 numeric stack and Armed for Action/C6 follow-up conditions are exercised through visible controls.
        await setState(a1.key, "stack", 6);
        await setState(radiance.key, "option", "stellarSwirl");
        await setState(mode.key, "toggle", true);
        await setState(followup.key, "option", "active");
        await evaluate(client, 'document.getElementById("genshinConditionDialog").close()');
        const active = await calculate();

        assert.equal(active.calculationRequest.uiState.conditionByModifier?.[a1.key]?.stack, 6,
            "A1 stack six is serialized into the current request");
        assert.equal(active.calculationRequest.uiState.conditionByModifier?.[radiance.key]?.option, "stellarSwirl",
            "Radiance Stellar Swirl condition is serialized into the current request");
        assert.equal(active.calculationRequest.uiState.toggleByModifier?.[mode.key], true,
            "Armed for Action combat2 mode is serialized into the current request");
        assert.equal(active.calculationRequest.uiState.conditionByModifier?.[followup.key]?.option, "active",
            "C6 follow-up condition is serialized into the current request");
        const blade = entry(active, "provisional71_10000143_skill_spirit_blade_rank2_stellarSwirl");
        assert.equal(blade.breakdown.baseTalentDamageMultiplier, 1.6, "six A1 stacks increase the Spirit Blade hit to 160%");
        const c6 = entry(active, "provisional71_10000143_c6_spirit_blade_200_stellarSwirl");
        assert.equal(c6.entry.damageType, "reaction", "C6 200% hit uses the selected Stellar Swirl route");
        assert.equal(c6.entry.hitCount, 1, "C6 follow-up is a separate hit");
        await replay();

        const pendingIds = [
            "provisional71_10000143_skill_wind_pinion_unknown",
            "provisional71_10000143_c6_transpose_150_unknown",
            "provisional71_10000143_c6_wind_pinion_unknown"
        ];
        for (const id of pendingIds) {
            const row = entry(active, id);
            assert.equal(row.entry.damageType, "unknown", `${id} retains unknown damage classification`);
            assert.equal(row.entry.calculationStatus, "externalConfirmationRequired", `${id} remains externally unconfirmed`);
            assert.equal(row.total?.expected ?? row.expected, 0, `${id} does not show a guessed numeric damage value`);
            assert.ok(row.problems?.length || row.entry.problems?.length, `${id} explains why calculation is deferred`);
        }
        const pendingText = await evaluate(client, `(() => {
            const wrap=document.getElementById("genshinJsonCalcResults");
            return ["skill","reaction","other"].map(id=>{
                const tab=wrap?.querySelector('[data-json-tab="'+id+'"]');
                tab?.click();
                return wrap?.querySelector('[data-json-panel="'+id+'"]')?.innerText || "";
            }).join("\\n");
        })()`);
        assert.match(pendingText, /外部確認待ち|確認待ち|分類未確定/, "unknown damage entries are presented as pending");
        assert.match(pendingText, /風羽/, "the pending Wind Pinion entries are visible by name");
        assert.match(pendingText, /飛翔の剣・変|転位/, "the pending 150% transpose entry is visible by name");
        const pendingRows = await evaluate(client, `Array.from(document.querySelectorAll(".genshin-damage-result-row"))
            .filter(row => /風羽|飛翔の剣・変|転位/.test(row.innerText))
            .map(row => ({ text: row.innerText, cells: row.children.length, numeric: Boolean(row.querySelector(".genshin-result-value")) }))`);
        assert.ok(pendingRows.length >= 2, "Wind Pinion and transpose pending rows are rendered in result tables");
        for (const row of pendingRows) {
            assert.match(row.text, /外部確認待ち|確認待ち|分類未確定/, "pending row explains the deferred classification");
            assert.equal(row.cells, 2, "pending row replaces numeric damage cells with one status cell");
            assert.equal(row.numeric, false, "pending row contains no rendered damage number");
        }
        assert.doesNotMatch(pendingText, /externalConfirmationRequired|deferredUnknown|damageType\s*[:=]\s*unknown/,
            "internal status enum values are not shown to users");
        const deferredText = await evaluate(client, 'document.body.innerText');
        assert.match(deferredText, /外部確認待ち|保留|未確認/,
            "the deferred blessing or unknown damage has a user-facing explanation");
        const provisionalNotice = await evaluate(client, 'document.querySelector(".genshin-json-provisional-notice")?.innerText || ""');
        assert.match(provisionalNotice, /参考データを使用中|確認中/, "the unverified candidate state is explained in the result banner");
        assert.doesNotMatch(deferredText, /deferredUnknown|externalConfirmationRequired/,
            "internal enum values do not leak into the page");

        const savedDamage = active.results.map((row) => [row.entry.id, row.total?.expected ?? row.expected]);
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await evaluate(client, `(() => {
            const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{
                const p=await original(...args);window.__vesnaCurrentPayload=p;return p;
            };
            return true;
        })()`);
        await waitFor(client, 'document.getElementById("genshinCalcCharacterId")?.value === "10000143" && document.getElementById("genshinReflectConstellation")?.value === "C6"');
        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        const restoredState = await evaluate(client, `(() => {
            const selector=(key,attr)=>document.querySelector('['+attr+'="'+key+'"]');
            return {
                stack: selector(${JSON.stringify(a1.key)},'data-genshin-condition-key')?.value,
                radiance: selector(${JSON.stringify(radiance.key)},'data-genshin-condition-key')?.value,
                mode: selector(${JSON.stringify(mode.key)},'data-genshin-toggle-key')?.checked,
                c6: selector(${JSON.stringify(followup.key)},'data-genshin-condition-key')?.value
            };
        })()`);
        assert.equal(restoredState.stack, "6", "reload restores A1 stack in the visible control");
        assert.equal(restoredState.radiance, "stellarSwirl", "reload restores Stellar Swirl radiance");
        assert.equal(restoredState.mode, true, "reload restores Armed for Action combat2 mode");
        assert.equal(restoredState.c6, "active", "reload restores C6 follow-up option");
        await evaluate(client, 'document.getElementById("genshinConditionDialog").close()');
        const reloaded = await calculate();
        assert.deepEqual(reloaded.results.map((row) => [row.entry.id, row.total?.expected ?? row.expected]), savedDamage,
            "reload preserves visible form state and all calculated/pending results");
        await replay();
        assert.ok(await evaluate(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0'),
            "ordinary user-facing results remain visible");
        progress("PASS Vesna: actual C6/A1/mode UI state reaches CalculationRequest; C6 follow-up and pending unknowns render safely; internal enums stay hidden; reload and snapshot replay preserve damage");
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
        if (profileDir && fs.existsSync(profileDir)) {
            const target = path.resolve(profileDir);
            assert.equal(path.dirname(target), path.resolve(os.tmpdir()), "cleanup stays inside the temporary directory");
            assert.ok(path.basename(target).startsWith("genshin-vesna-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
