"use strict";

// Real-browser regression for Sandrone's current conditions and damage routing.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9227);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-sandrone-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-sandrone-current-"));
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
                window.__sandroneCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);
        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "サンドローネ", genshinCalcCharacterId: "10000133",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C6", genshinAtkInput: 1850, genshinDefInput: 1000,
                genshinHpInput: 20000, genshinElementalMasteryInput: 0, genshinCritRateInput: 50, genshinCritDamageInput: 100,
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

        const c2Key = "character:10000133:group:sandrone_c2_beams";
        const a4Key = "talent:passive2:anonymous:scalingBonus|active|elementalMastery|攻撃力100ごとに元素熟知+8、最大160まで";
        const a1PrismKey = "talent:passive1:t_10000133_a1_prism";
        const tacticsKey = "talent:passive1:t_10000133_a1_tactics";
        const c4Key = "character:10000133:group:sandrone_c4_cannon";
        const c6Key = "character:10000133:group:sandrone_c6_cluster";
        const c1Key = "constellation:C1:c_10000133_1_1";
        const c6EffectKey = "constellation:C6:c_10000133_6_1";
        const entry = (payload, id) => {
            const row = payload.results.find((item) => item.entry.id === id || item.entry.effectId === id);
            assert.ok(row, `missing damage entry ${id}`);
            return row;
        };
        const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
        const control = async (key, type = "condition") => {
            const attr = type === "toggle" ? "data-genshin-toggle-key" : "data-genshin-condition-key";
            const selector = `[${attr}="${key}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            return selector;
        };
        const setControl = async (key, value, type = "condition") => {
            const selector = await control(key, type);
            await evaluate(client, `(() => {
                const e=document.querySelector(${JSON.stringify(selector)});
                e.value=${JSON.stringify(String(value))};
                e.dispatchEvent(new Event("input",{bubbles:true}));
                e.dispatchEvent(new Event("change",{bubbles:true}));
            })()`);
            await delay(250);
        };
        const setToggle = async (key, enabled) => {
            const selector = await control(key, "toggle");
            const checked = await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).checked`);
            if (checked !== enabled) {
                await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).click()`);
                await delay(250);
            }
        };
        const setAtk = async (atk) => {
            await evaluate(client, `(() => {const e=document.getElementById("genshinAtkInput");e.value=${JSON.stringify(String(atk))};e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
            await delay(250);
        };
        const calculate = async () => {
            await evaluate(client, 'window.__sandroneCurrentPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__sandroneCurrentPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__sandroneCurrentPayload");
        };
        const replay = async (payload) => {
            const matches = await evaluate(client, `(async () => {
                const p=window.__sandroneCurrentPayload;
                const d=await window.GenshinCalcData.loadGenshinCalcData();
                const saved=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request;
                const restored=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(saved)),d);
                return JSON.stringify(restored.results)===JSON.stringify(p.results);
            })()`);
            assert.equal(matches, true, "saved CalculationRequest reproduces Sandrone damage exactly");
        };

        // A4 uses its actual condition checkbox; the special blessing reads the selected global reaction.
        await setToggle(a4Key, true);
        await evaluate(client, `(() => {const e=document.getElementById("genshinJsonReactionOption");if(!e)throw Error("missing global reaction selector");e.value="stellarSwirl";e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
        await delay(250);
        for (const [atk, expectedEm, expectedBaseBonus] of [[1850, 148, 12.95], [1866, 149.28, 13.062], [1950, 156, 13.65]]) {
            await setAtk(atk);
            const payload = await calculate();
            assert.equal(payload.calculationRequest.uiState.conditionByModifier[a4Key]?.enabled, true, "A4 condition checkbox is enabled in the current request");
            assert.equal(payload.context.effectiveStats.atk, atk, `current ATK ${atk} reaches calculation`);
            near(payload.context.effectiveStats.elementalMastery, expectedEm, `A4 continuous EM at ATK ${atk}`);
            const swirl = payload.results.find((item) => item.entry.id === "reaction_stellarSwirl");
            assert.ok(swirl, "Stellar Swirl calculation route is present");
            near(swirl.breakdown.reactionBaseDamageBonus, expectedBaseBonus, `special Stellar Swirl base bonus at ATK ${atk}`);
            assert.equal(payload.context.effectiveStats.elementalMastery, expectedEm, "special reaction path preserves A4 EM");
            await replay(payload);
        }

        // The C2 option selects 0–3 stacks; option 0 is the base +40% and option 3 adds +60% more.
        await setAtk(1850);
        await setControl(c2Key, "inactive");
        const c2Off = await calculate();
        await setControl(c2Key, 0);
        const c2Zero = await calculate();
        await setControl(c2Key, 3);
        const c2On = await calculate();
        assert.equal(c2On.calculationRequest.uiState.conditionByModifier[c2Key]?.option, "3", "shared C2 option 3 reaches the request");
        near(entry(c2Zero, "charged_damage_3").breakdown.critDamage - entry(c2Off, "charged_damage_3").breakdown.critDamage, 40, "C2 option 0 adds 40 percentage points of crit damage");
        near(entry(c2On, "charged_damage_3").breakdown.critDamage - entry(c2Off, "charged_damage_3").breakdown.critDamage, 100, "C2 adds 100 percentage points of crit damage to charged hit 3");
        near(entry(c2On, "charged_beam_swirl").breakdown.critDamage - entry(c2Off, "charged_beam_swirl").breakdown.critDamage, 100,
            "C2 also reaches the direct Stellar Swirl cooling beam");
        for (const row of c2Off.results.filter((item) => !["charged_damage_3", "charged_beam_swirl"].includes(item.entry.id))) {
            const changed = c2On.results.find((item) => item.entry.id === row.entry.id);
            if (changed) {
                near(changed.breakdown.critDamage, row.breakdown.critDamage, `C2 crit damage does not leak to ${row.entry.id}`);
                if (["normalAttack", "skill", "burst"].includes(row.entry.attackType)) near(changed.total.expected, row.total.expected, `C2 damage does not leak to ${row.entry.attackType} ${row.entry.id}`);
            }
        }
        const c2Expected = entry(c2On, "charged_damage_3").total.expected;
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        // Reinstall payload capture, then verify the browser restored the actual visible UI state untouched.
        await evaluate(client, `(() => {const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__sandroneCurrentPayload=p;return p;};return true;})()`);
        await waitFor(client, 'document.getElementById("genshinCalcCharacterId")?.value === "10000133" && document.getElementById("genshinAtkInput")?.value === "1850" && document.getElementById("genshinReflectConstellation")?.value === "C6"');
        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        const c2Selector = await control(c2Key);
        assert.equal(await evaluate(client, `document.querySelector(${JSON.stringify(c2Selector)}).value`), "3", "reload restores C2 option 3 in the visible control");
        assert.equal(await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${a4Key}"]')?.checked`), true, "reload restores the A4 condition checkbox");
        assert.equal(await evaluate(client, 'document.getElementById("genshinJsonReactionOption").value'), "stellarSwirl", "reload restores the global Stellar Swirl selector");
        const reloaded = await calculate();
        near(entry(reloaded, "charged_damage_3").total.expected, c2Expected, "reload keeps current form and damage consistent");
        near(entry(reloaded, "charged_beam_swirl").breakdown.critDamage, entry(c2On, "charged_beam_swirl").breakdown.critDamage,
            "reload keeps C2 on the direct Stellar Swirl cooling beam");
        await replay(reloaded);

        // A1's prism option and numeric tactics stack remain separate controls.
        await setControl(c2Key, "inactive");
        await setControl(a1PrismKey, "inactive");
        const prismOff = await calculate();
        await setControl(a1PrismKey, "above50");
        const prismOn = await calculate();
        assert.equal(prismOff.calculationRequest.uiState.conditionByModifier[a1PrismKey]?.option, "inactive", "A1 prism starts inactive");
        assert.equal(prismOn.calculationRequest.uiState.conditionByModifier[a1PrismKey]?.option, "above50", "A1 prism dropdown is active above 50 load");
        assert.ok(entry(prismOn, "damage_3").total.expected > entry(prismOff, "damage_3").total.expected, "A1 prism increases its second prism hit");
        await setControl(tacticsKey, 0);
        const tactics0 = await calculate();
        await setControl(tacticsKey, 10);
        const tactics10 = await calculate();
        assert.equal(tactics10.calculationRequest.uiState.conditionByModifier[tacticsKey]?.stack, 10, "A1 tactics stack 10 reaches the request");
        assert.ok(entry(tactics10, "damage_6").total.expected > entry(tactics0, "damage_6").total.expected, "A1 tactics stack increases the burst ray");
        assert.ok(entry(tactics10, "burst_ray_swirl").total.expected > entry(tactics0, "burst_ray_swirl").total.expected,
            "A1 tactics stack increases the direct Stellar Swirl burst ray");
        for (const row of tactics0.results.filter((item) => !["damage_6", "burst_ray_swirl"].includes(item.entry.id))) {
            const changed = tactics10.results.find((item) => item.entry.id === row.entry.id);
            if (changed) near(changed.total.expected, row.total.expected, `A1 tactics does not change ${row.entry.id}`);
        }

        // C4 and C6 options independently generate their own follow-up effects.
        await setControl(c4Key, "inactive"); await setControl(c6Key, "inactive");
        const clusterOff = await calculate();
        assert.ok(!clusterOff.results.some((row) => row.entry.effectId === "c_10000133_6_2"), "C6 cluster hits are absent while disabled");
        await setControl(c4Key, "stellarSwirl");
        const c4On = await calculate();
        assert.ok(c4On.results.some((row) => row.entry.effectId === "c_10000133_4_1_swirl"), "C4 Stellar Swirl cannon effect is present");
        assert.ok(!c4On.results.some((row) => row.entry.effectId === "c_10000133_6_2"), "C4 does not enable C6 cluster hits");
        for (const row of clusterOff.results) {
            const changed = c4On.results.find((item) => item.entry.id === row.entry.id);
            if (changed) near(changed.total.expected, row.total.expected, `C4 adds an independent effect without changing ${row.entry.id}`);
        }
        await setControl(c4Key, "inactive"); await setControl(c6Key, "stellarSwirl");
        const c6On = await calculate();
        const c6Hits = c6On.results.filter((row) => /^c_10000133_6_2_stellarSwirl_hit[1-4]$/.test(row.entry.id));
        assert.equal(c6Hits.length, 4, "C6 Stellar Swirl option produces four independent hit IDs");
        assert.equal(new Set(c6Hits.map((row) => row.entry.id)).size, 4, "C6 hit IDs are independent");
        assert.ok(!c6On.results.some((row) => row.entry.effectId === "c_10000133_4_1_swirl"), "C6 does not enable C4 cannon effect");
        await replay(c6On);

        // Elevation remains a separate ×1.20 multiplier after C1's additive Stellar bonus.
        // The C4 and C6 follow-ups here are direct reaction entries too.
        await setControl(c4Key, "stellarSwirl");
        await setToggle(c1Key, false);
        await setToggle(c6EffectKey, false);
        const elevationOff = await calculate();
        await setToggle(c6EffectKey, true);
        const elevationC6 = await calculate();
        await setToggle(c1Key, true);
        const elevationC1C6 = await calculate();
        await setToggle(c6EffectKey, false);
        const elevationC1 = await calculate();
        await setToggle(c6EffectKey, true);
        const elevationBoth = await calculate();
        const directIds = elevationOff.results.filter((row) => row.entry.directReactionId?.startsWith("stellar"))
            .map((row) => row.entry.id);
        assert.ok(directIds.includes("charged_beam_swirl"), "charged-beam Stellar Swirl base entry is present");
        assert.ok(directIds.includes("skill_prism_swirl"), "Prism Stellar Swirl base entry is present");
        assert.ok(directIds.includes("burst_ray_swirl"), "burst-ray Stellar Swirl base entry is present");
        assert.ok(directIds.includes("c_10000133_4_1_swirl"), "C4 Stellar Swirl follow-up is present");
        assert.equal(directIds.filter((id) => /^c_10000133_6_2_stellarSwirl_hit[1-4]$/.test(id)).length, 4,
            "all four C6 Stellar Swirl follow-ups are present");
        const rowsById = (payload) => new Map(payload.results.map((row) => [row.entry.id, row]));
        const offById = rowsById(elevationOff), c6ById = rowsById(elevationC6), c1ById = rowsById(elevationC1), bothById = rowsById(elevationBoth);
        for (const id of directIds) {
            const offRow = offById.get(id), c6Row = c6ById.get(id), c1Row = c1ById.get(id), bothRow = bothById.get(id);
            near(c6Row.total.expected, offRow.total.expected * 1.2, `Elevation independently multiplies ${id} by 1.2`);
            near(c1Row.breakdown.reactionBonus, 30, `C1 adds its 30% reaction bonus to ${id}`);
            near(bothRow.breakdown.reactionBonus, 30, `C1+C6 keeps the C1 bonus additive on ${id}`);
            near(bothRow.total.expected, c1Row.total.expected * 1.2, `C6 multiplies the C1 result for ${id}`);
            assert.ok(bothRow.breakdown.effectOverrides.some((item) => item.id === "c_10000133_6_1" && item.multiplier === 1.2),
                `Elevation appears as an independent ×1.2 override on ${id}`);
        }
        const elevationSaved = new Map(directIds.map((id) => [id, bothById.get(id).total.expected]));
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await evaluate(client, `(() => {const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__sandroneCurrentPayload=p;return p;};return true;})()`);
        await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        assert.equal(await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${c1Key}"]')?.checked`), true,
            "reload restores C1's enabled condition");
        assert.equal(await evaluate(client, `document.querySelector('[data-genshin-toggle-key="${c6EffectKey}"]')?.checked`), true,
            "reload restores C6 Elevation's enabled condition");
        const elevationReloaded = await calculate();
        for (const [id, expected] of elevationSaved) near(entry(elevationReloaded, id).total.expected, expected, `reload preserves C1+C6 result for ${id}`);
        await replay(elevationReloaded);
        // Ordinary result presentation remains the damage UI; payload data is not rendered as JSON text.
        assert.ok(await evaluate(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0'), "damage results are shown in the normal result panel");
        assert.ok(await evaluate(client, '!document.getElementById("genshinJsonCalcResults").innerText.includes("{\\"calculationRequest\\"")'), "the UI does not expose the raw JSON payload");
        progress("PASS Sandrone: continuous A4 and special Stellar Swirl ATK scaling; C2 applies to both cooling beam hits; A1 Prism and tactics target the added direct hits; C1 is additive with C6 ×1.20 on all direct Stellar entries; C4/C6 follow-ups, genuine reload and saved-request replay pass");
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
            assert.ok(path.basename(target).startsWith("genshin-sandrone-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
