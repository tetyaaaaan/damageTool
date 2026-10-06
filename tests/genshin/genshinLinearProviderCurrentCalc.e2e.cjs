"use strict";

// Real Edge coverage for continuous provider scaling and self scaling.
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

async function waitForJson(url, timeoutMs = 15000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
        await delay(100);
    }
    throw new Error(`timed out waiting for ${url}`);
}

async function waitForHttp(url, timeoutMs = 15000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        try { const response = await fetch(url); if (response.ok) return response; } catch {}
        await delay(100);
    }
    throw new Error(`timed out waiting for ${url}`);
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
        const item = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
        pending.set(id, {
            resolve: (value) => { clearTimeout(timer); resolve(value); },
            reject: (error) => { clearTimeout(timer); reject(error); }
        });
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

async function waitFor(client, expression, timeoutMs = 15000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
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
        const pageResponse = await fetch(new URL("/games/genshin/", baseUrl), { signal: AbortSignal.timeout(1000) }).catch(() => null);
        if (!pageResponse?.ok) {
            serverProcess = spawn(process.execPath, [path.join(root, "local-server.cjs")], {
                cwd: root, env: { ...process.env, PORT: "4173" }, stdio: "ignore", windowsHide: true
            });
            await waitForHttp(new URL("/games/genshin/", baseUrl).toString());
        }
        try {
            const existing = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(500) });
            if (existing.ok) throw new Error(`debug port ${debugPort} is already in use`);
        } catch (error) { if (error.message.includes("already in use")) throw error; }
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-linear-provider-"));
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

        const installCapture = async () => evaluate(client, `(() => {
            const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__linearPayload=p;return p;};
            return true;
        })()`);
        await installCapture();
        const input = async (id, value) => {
            await evaluate(client, `(() => {const e=document.getElementById(${JSON.stringify(id)});if(!e)throw Error("missing input ${id}");e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
            await delay(220);
        };
        const setMain = async ({ id, name, constellation = "C0", hp = 30000, em = 0, cr = 10, cd = 100 }) => {
            for (const [field, value] of Object.entries({
                genshinReflectCharacter: name, genshinCalcCharacterId: id, genshinWeaponInput: "", genshinCalcWeaponId: "",
                genshinReflectLevel: 90, genshinReflectConstellation: constellation, genshinAtkInput: 1800,
                genshinDefInput: 1000, genshinHpInput: hp, genshinElementalMasteryInput: em,
                genshinCritRateInput: cr, genshinCritDamageInput: cd, genshinEnergyRechargeInput: 100,
                genshinNormalTalentLevel: 10, genshinSkillTalentLevel: 10, genshinBurstTalentLevel: 10
            })) await input(field, value);
        };
        const openConditions = async () => {
            const isOpen = await evaluate(client, 'document.getElementById("genshinConditionDialog")?.open === true');
            if (!isOpen) {
                const partyOpen = await evaluate(client, 'document.getElementById("genshinPartyDialog")?.open === true');
                if (partyOpen) await evaluate(client, 'document.getElementById("genshinPartyDialog").close()');
                await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
                await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
            }
        };
        const openParty = async () => {
            const isOpen = await evaluate(client, 'document.getElementById("genshinPartyDialog")?.open === true');
            if (!isOpen) {
                if (await evaluate(client, 'document.getElementById("genshinConditionDialog")?.open === true')) await evaluate(client, 'document.getElementById("genshinConditionDialog").close()');
                await evaluate(client, 'document.getElementById("genshinPartyDialogOpen").click()');
                await waitFor(client, 'document.getElementById("genshinPartyDialog")?.open === true');
            }
        };
        const choosePartyCharacter = async (slot, characterId) => {
            await evaluate(client, `document.getElementById("genshinPartyCharacterTrigger${slot}").click()`);
            const selector = `[data-selection-id="${characterId}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).click()`);
            await delay(200);
        };
        const calculate = async () => {
            await evaluate(client, 'window.__linearPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__linearPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__linearPayload");
        };
        const provider = (payload, id) => {
            const item = payload.partyModifiers.find((candidate) => candidate.modifier?.id === id);
            assert.ok(item, `missing party modifier ${id}`);
            return item;
        };
        const near = (actual, expected, message, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${message}: ${actual} != ${expected}`);
        const replay = async (payload) => {
            const exact = await evaluate(client, `(async()=>{const p=window.__linearPayload;const d=await window.GenshinCalcData.loadGenshinCalcData();const s=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request;const r=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(s)),d);return JSON.stringify(r.results)===JSON.stringify(p.results);})()`);
            assert.equal(exact, true, "saved CalculationRequest replays results exactly");
            assert.equal(JSON.stringify(payload.results), JSON.stringify(await evaluate(client, "window.__linearPayload.results")), "payload remains the current calculation");
        };
        const hasAppliedPartySource = (payload, id) => payload.results.some((row) =>
            (row.breakdown?.appliedModifiers || []).some((item) => item.modifier?.id === id || item.modifierId === id));

        // Baizhu's shared A4 state is provider-owned and must retain fractional output.
        await setMain({ id: "10000125", name: "コロンビーナ", hp: 30000 });
        await input("genshinJsonReactionOption", "lunarBloom");
        await openParty();
        await choosePartyCharacter(2, "10000082");
        await input("genshinPartyHp2", 49999);
        await openConditions();
        const baizhuToggle = "party:2:10000082:group:baizhu_verdant_favor";
        const toggleSelector = `[data-genshin-party-buff-key="${baizhuToggle}"]`;
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(toggleSelector)}))`);
        await evaluate(client, `(() => {const e=document.querySelector(${JSON.stringify(toggleSelector)});if(!e.checked)e.click();})()`);
        await delay(200);
        const baizhu = await calculate();
        const baizhuA4 = provider(baizhu, "t_10000082_a4_bloom");
        near(baizhuA4.resolvedValue, 99.998, "Baizhu A4 HP 49999 resolves without integer rounding");
        assert.equal(baizhuA4.enabled, true, "Baizhu shared A4 group is enabled");
        near(provider(baizhu, "t_10000082_a4_lunar_bloom").resolvedValue, 34.9993, "Baizhu Lunar Bloom A4 remains fractional at the HP cap boundary");
        const lunarEntry = (payload) => {
            const row = payload.results.find((item) => item.entry.effectId === "damage_3" || item.entry.id === "damage_3");
            assert.ok(row, "Columbina's real Lunar Bloom damage entry exists");
            return row;
        };
        assert.equal(hasAppliedPartySource(baizhu, "t_10000082_a4_lunar_bloom"), true, "Baizhu's provider modifier reaches the recipient Lunar Bloom entry");
        assert.equal(hasAppliedPartySource(baizhu, "t_10000082_a4_bloom"), false, "Baizhu's ordinary Bloom modifier does not leak into Lunar Bloom damage");
        near(lunarEntry(baizhu).breakdown.reactionBonus, 34.9993, "Baizhu A4 is applied to recipient Lunar Bloom damage");
        await evaluate(client, `document.querySelector(${JSON.stringify(toggleSelector)}).click()`);
        await delay(200);
        const baizhuDisabled = await calculate();
        assert.equal(provider(baizhuDisabled, "t_10000082_a4_bloom").enabled, false, "Baizhu shared A4 group can be disabled through the condition UI");
        await evaluate(client, `document.querySelector(${JSON.stringify(toggleSelector)}).click()`);
        await delay(200);
        const baizhuReenabled = await calculate();
        assert.equal(provider(baizhuReenabled, "t_10000082_a4_bloom").enabled, true, "Baizhu shared A4 group can be re-enabled through the condition UI");
        const recipientChangedHp = async (hp) => {
            await openConditions();
            await input("genshinHpInput", hp);
            const payload = await calculate();
            near(provider(payload, "t_10000082_a4_bloom").resolvedValue, 99.998, `recipient HP ${hp} does not change provider-scaled value`);
            near(provider(payload, "t_10000082_a4_lunar_bloom").resolvedValue, 34.9993, `recipient HP ${hp} does not change provider Lunar Bloom value`);
            return payload;
        };
        const baizhuChangedRecipient = await recipientChangedHp(40000);
        assert.equal(hasAppliedPartySource(baizhuChangedRecipient, "t_10000082_a4_bloom"), false, "ordinary Bloom modifier remains excluded from recipient Lunar Bloom after HP change");
        const baizhuExpected = baizhuChangedRecipient.results.map((row) => row.total?.expected);
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await installCapture();
        await openConditions();
        await waitFor(client, `document.querySelector(${JSON.stringify(toggleSelector)})?.checked === true`);
        const baizhuReload = await calculate();
        near(provider(baizhuReload, "t_10000082_a4_bloom").resolvedValue, 99.998, "Baizhu A4 value survives reload");
        assert.deepEqual(baizhuReload.results.map((row) => row.total?.expected), baizhuExpected, "Baizhu recipient result survives reload");
        await replay(baizhuReload);

        // Lauma's team Lunar Bloom base bonus is read from her provider EM, not recipient EM.
        await setMain({ id: "10000125", name: "コロンビーナ", hp: 30000, em: 0 });
        await input("genshinJsonReactionOption", "lunarBloom");
        await openParty();
        await choosePartyCharacter(2, "10000119");
        await input("genshinPartyElementalMastery2", 799.5);
        const lauma = await calculate();
        const laumaBuff = provider(lauma, "t_10000119_passive3_lunar_bloom");
        near(laumaBuff.resolvedValue, 13.99125, "Lauma EM 799.5 resolves continuously");
        assert.equal(laumaBuff.enabled, true, "Lauma's always-on team bonus is enabled");
        assert.equal(hasAppliedPartySource(lauma, "t_10000119_passive3_lunar_bloom"), true, "Lauma base bonus reaches recipient Lunar Bloom calculation");
        const laumaBaseBonusWithProvider = lunarEntry(lauma).breakdown.reactionBaseDamageBonus;
        await openParty();
        await input("genshinPartyElementalMastery2", 0);
        const laumaZeroEm = await calculate();
        const laumaBaseBonusWithoutProvider = lunarEntry(laumaZeroEm).breakdown.reactionBaseDamageBonus;
        near(laumaBaseBonusWithProvider - laumaBaseBonusWithoutProvider, 13.99125, "Lauma contribution to Columbina's real Lunar Bloom base bonus matches provider EM scaling");
        await input("genshinPartyElementalMastery2", 799.5);
        await calculate();
        await openConditions();
        await input("genshinElementalMasteryInput", 1200);
        const laumaRecipientChanged = await calculate();
        near(provider(laumaRecipientChanged, "t_10000119_passive3_lunar_bloom").resolvedValue, 13.99125, "recipient EM does not change Lauma provider bonus");
        const laumaExpected = laumaRecipientChanged.results.map((row) => row.total?.expected);
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await installCapture();
        const laumaReload = await calculate();
        near(provider(laumaReload, "t_10000119_passive3_lunar_bloom").resolvedValue, 13.99125, "Lauma provider value survives reload");
        assert.deepEqual(laumaReload.results.map((row) => row.total?.expected), laumaExpected, "Lauma recipient result survives reload");
        await replay(laumaReload);

        // Nilou C6 preserves fractional self HP scaling and exact damage through reload.
        await setMain({ id: "10000070", name: "ニィロウ", constellation: "C6", hp: 49999, cr: 0, cd: 0 });
        await input("genshinJsonReactionOption", "none");
        await openConditions();
        for (const effectId of ["c_10000070_6_1", "c_10000070_6_2"]) {
            const key = `constellation:C6:${effectId}`;
            const selector = `[data-genshin-toggle-key="${key}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e.checked)e.click();})()`);
        }
        await delay(200);
        const nilou = await calculate();
        const nilouEntry = nilou.results.find((row) => row.entry.attackType === "normalAttack");
        assert.ok(nilouEntry, "Nilou normal damage entry exists");
        near(nilouEntry.breakdown.critRate, 29.9994, "Nilou C6 HP 49999 CR scaling remains fractional");
        near(nilouEntry.breakdown.critDamage, 59.9988, "Nilou C6 HP 49999 CD scaling remains fractional");
        const nilouCriticalEffects = await evaluate(client, `(() => {
            const row=window.__linearPayload.results.find((item)=>item.entry.attackType==="normalAttack");
            return window.GenshinCalcRenderer.buildDamageBreakdownViewModel(row).critical.effects.map((effect)=>effect.value);
        })()`);
        assert.ok(nilouCriticalEffects.some((value) => value.startsWith("+30")), `Nilou CR bonus appears in critical details: ${JSON.stringify(nilouCriticalEffects)}`);
        assert.ok(nilouCriticalEffects.some((value) => value.startsWith("+60")), `Nilou CD bonus appears in critical details: ${JSON.stringify(nilouCriticalEffects)}`);
        assert.ok(!nilouCriticalEffects.some((value) => value.includes("（+0")), `Nilou critical details do not show zero contribution: ${JSON.stringify(nilouCriticalEffects)}`);
        const nilouResults = JSON.stringify(nilou.results);
        await evaluate(client, "location.reload()");
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await installCapture();
        const nilouReload = await calculate();
        const nilouReloadEntry = nilouReload.results.find((row) => row.entry.attackType === "normalAttack");
        assert.ok(nilouReloadEntry, "Nilou normal damage entry exists after reload");
        near(nilouReloadEntry.breakdown.critRate, 29.9994, "Nilou C6 CR scaling survives reload");
        near(nilouReloadEntry.breakdown.critDamage, 59.9988, "Nilou C6 CD scaling survives reload");
        assert.equal(JSON.stringify(nilouReload.results), nilouResults, "Nilou internal damage is exactly stable after reload");
        await replay(nilouReload);
        console.log("[genshin-linear-provider-current-calc-e2e] PASS Baizhu 99.998% provider A4, Lauma 13.99125% team Lunar Bloom base bonus, Nilou C6 fractional crit scaling, recipient independence and reload/replay");
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
            assert.equal(path.dirname(target), path.resolve(os.tmpdir()), "cleanup remains inside temp directory");
            assert.ok(path.basename(target).startsWith("genshin-linear-provider-"), "cleanup only removes this test profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch {}
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
