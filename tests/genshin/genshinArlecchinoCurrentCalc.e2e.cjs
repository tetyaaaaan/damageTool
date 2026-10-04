"use strict";

// Real-browser verification that Arlecchino's current conditions affect only their intended damage entries.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9225);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-arlecchino-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-arlecchino-current-"));
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
                window.__arlecchinoCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "アルレッキーノ", genshinCalcCharacterId: "10000096",
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


        const bolKey = "character:10000096:group:arlecchinoBondOfLife";
        const critKey = "constellation:C6:group:arlecchinoC6AfterSkill";
        const near = (a,b,message) => assert.ok(Math.abs(a-b)<1e-7, message + ': ' + a + ' != ' + b);
        const item = (p,id) => { const r=p.results.find(r=>r.entry.id===id); assert.ok(r,id); return r; };
        const setBol = async value => {
            await waitFor(client, 'Boolean(document.querySelector(\'[data-genshin-condition-key="' + bolKey + '"]\'))');
            await evaluate(client, '(() => { const e=document.querySelector(\'[data-genshin-condition-key="' + bolKey + '"]\'); e.value=' + JSON.stringify(String(value)) + '; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); })()');
            await delay(400);
        };
        const setCrit = async on => {
            await waitFor(client, 'document.querySelectorAll(\'[data-genshin-toggle-key="' + critKey + '"]\').length===1');
            const checked=await evaluate(client,'document.querySelector(\'[data-genshin-toggle-key="' + critKey + '"]\').checked');
            if(checked!==on) await evaluate(client,'document.querySelector(\'[data-genshin-toggle-key="' + critKey + '"]\').click()');
            await delay(400);
        };
        const setConstellation = async value => {
            await evaluate(client,'(() => { const e=document.getElementById("genshinReflectConstellation"); e.value=' + JSON.stringify('C'+value) + '; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); })()');
            await delay(400);
        };
        const calculate = async () => {
            await evaluate(client,'window.__arlecchinoCurrentPayload=null; document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client,'Boolean(window.__arlecchinoCurrentPayload) && !document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client,'window.__arlecchinoCurrentPayload');
        };
        await setCrit(false);
        await setBol(0);
        const zero=await calculate();
        near(item(zero,'normal_1damage').breakdown.additiveBaseDamage,0,'zero BoL has no Masque addition');
        near(item(zero,'skilldamage').breakdown.additiveBaseDamage,0,'zero BoL has no C6 addition');
        assert.equal(item(zero,'normal_1damage').entry.element,'physical');
        await setBol(100);
        const c6=await calculate();
        near(item(c6,'normal_1damage').breakdown.additiveBaseDamage,2200*3.38,'C1+ Masque coefficient is 338%, not 476%');
        near(item(c6,'skilldamage').breakdown.additiveBaseDamage,2200*7,'C6 Burst addition');
        for(const r of c6.results) {
            if(r.entry.attackType==='normalAttack') { assert.equal(r.entry.element,'炎'); assert.ok(r.expected>item(zero,r.entry.id).expected); }
            else if(r.entry.attackType!=='burst') near(r.breakdown.additiveBaseDamage,0,'no addition to '+r.entry.id);
        }
        for(const id of ['chargeddamage','plunge_damage','low_plungedamage','high_plungedamage']) assert.equal(item(c6,id).entry.element,'炎');
        near(item(c6,'normal_4damage').breakdown.scalingParts[0].talentMultiplier,73.4264,'normal 4 first hit');
        near(item(c6,'normal_4damage_2').breakdown.scalingParts[0].talentMultiplier,73.4264,'normal 4 second hit');
        assert.equal(item(c6,'normal_4damage').entry.hitCount,1);
        assert.equal(item(c6,'normal_4damage_2').entry.hitCount,1);
        await setBol(33.5);
        const fractional=await calculate();
        near(item(fractional,'normal_1damage').breakdown.additiveBaseDamage,2200*.335*3.38,'fractional BoL Masque');
        near(item(fractional,'skilldamage').breakdown.additiveBaseDamage,2200*.335*7,'fractional BoL C6');
        await setCrit(true);
        const crit=await calculate();
        for(const r of crit.results) {
            const scoped=['normalAttack','burst'].includes(r.entry.attackType);
            near(r.breakdown.critRate-item(fractional,r.entry.id).breakdown.critRate,scoped?10:0,'C6 crit rate scope '+r.entry.id);
            near(r.breakdown.critDamage-item(fractional,r.entry.id).breakdown.critDamage,scoped?70:0,'C6 crit damage scope '+r.entry.id);
        }
        const replayMatches = await evaluate(client, '(async () => { const p=window.__arlecchinoCurrentPayload; const d=await window.GenshinCalcData.loadGenshinCalcData(); const saved=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request; const r=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(saved)),d); return JSON.stringify(r.results)===JSON.stringify(p.results); })()');
        assert.equal(replayMatches,true,'JSON saved request reproduces browser results');
        await setConstellation(0); await setBol(100);
        const c0=await calculate();
        near(item(c0,'normal_1damage').breakdown.additiveBaseDamage,2200*2.38,'C0 Masque 238%');
        near(item(c0,'skilldamage').breakdown.additiveBaseDamage,0,'C0 no C6 Burst addition');
        await setConstellation(1); await setBol(100);
        const c1=await calculate();
        near(item(c1,'normal_1damage').breakdown.additiveBaseDamage,2200*3.38,'C1 Masque 338%');
        assert.ok(item(c1,'normal_1damage').expected>item(c0,'normal_1damage').expected,'C1 increases actual normal damage');
        for(const r of c0.results.filter(r=>r.entry.attackType!=='normalAttack')) near(item(c1,r.entry.id).expected,r.expected,'C1 isolated from '+r.entry.id);
        progress('PASS Arlecchino: BoL 0/33.5/100; C0 238% and C1 338%; two independent normal-4 hits; Pyro infusion; C6 Burst addition and shared Normal/Burst crit; JSON replay');
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
