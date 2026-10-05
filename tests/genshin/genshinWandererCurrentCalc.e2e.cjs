"use strict";

// Real-browser verification of saved provider HP/EM weapon transfers.
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
const progress = (message) => console.log(`[genshin-wanderer-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-wanderer-current-"));
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
                window.__wandererPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "放浪者", genshinCalcCharacterId: "10000075",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C2", genshinAtkInput: 2200, genshinDefInput: 1000,
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



        const mode='talent:combat2:group:talent-state:10000075:combat2';
        const key='constellation:C2:group:wandererKuugoryokuDifference';
        await evaluate(client,'(() => {const e=document.querySelector(\'[data-genshin-toggle-key="'+mode+'"]\');if(!e)throw Error("mode input missing");e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}));})()');
        const input=async(value)=>{
            const selector='[data-genshin-condition-key="'+key+'"]';
            await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');
            await evaluate(client,'(() => {const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(200);
        };
        const calc=async()=>{await evaluate(client,'window.__wandererPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');await waitFor(client,'Boolean(window.__wandererPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');return evaluate(client,'window.__wandererPayload');};
        await input(0);const off=await calc();await input(25);const on=await calc();
        const burst=p=>p.results.find(r=>r.entry.id==='skilldamage_2');
        assert.equal(burst(on).breakdown.damageBonus-burst(off).breakdown.damageBonus,100);
        assert.ok(burst(on).expected>burst(off).expected,'C2 increases only Burst');
        for(const r of off.results.filter(r=>r.entry.damageType!=='burst'))assert.equal(on.results.find(x=>x.entry.id===r.entry.id).expected,r.expected,'nonBurst unchanged '+r.entry.id);
        assert.equal(await evaluate(client,'(async()=>{const p=window.__wandererPayload;const d=await window.GenshinCalcData.loadGenshinCalcData();const r=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request)),d);return JSON.stringify(r.results)===JSON.stringify(p.results);})()'),true);
        const first=on.results.find(r=>r.entry.id==='wind_normal_3damage');
        const second=on.results.find(r=>r.entry.id==='wind_normal_3damage_2');
        assert.ok(first&&second,'Windfavored third attack has two independent hits');
        assert.equal(first.expected,second.expected,'confirmed param4 equals param3');
        assert.equal(second.entry.source.param,'param4');
        progress('PASS C2 difference25 => Burst+100%; Windfavored normals unchanged; JSON replay exact');
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
            assert.ok(path.basename(target).startsWith("genshin-wanderer-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
