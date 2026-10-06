"use strict";

// Real-browser regression for 7.1 weapons's provisional current-calculation route.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9234);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-hymn71-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-hymn71-current-"));
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
                window.__weapon71CurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);
        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "珊瑚宮心海", genshinCalcCharacterId: "10000054",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C0", genshinAtkInput: 2000, genshinDefInput: 1000,
                genshinHpInput: 50500, genshinElementalMasteryInput: 0,
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
            await evaluate(client, 'window.__weapon71CurrentPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__weapon71CurrentPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__weapon71CurrentPayload");
        };
        const replay = async () => {
            const exact = await evaluate(client, `(async () => {
                const p=window.__weapon71CurrentPayload;
                const data=await window.GenshinCalcData.loadGenshinCalcData();
                const request=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request;
                const restored=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(request)),data);
                return JSON.stringify(restored.results)===JSON.stringify(p.results);
            })()`);
            assert.equal(exact, true, "saved CalculationRequest reproduces 7.1 weapons damage exactly");
        };
        const entry = (payload, id) => {
            const row = payload.results.find((item) => item.entry.id === id);
            assert.ok(row, `missing damage entry ${id}; got ${payload.results.map((item) => item.entry.id).join(", ")}`);
            return row;
        };
        const input = async (id, value) => {
            await evaluate(client, `(() => { const e=document.getElementById(${JSON.stringify(id)}); if(!e) return false; e.value=${JSON.stringify(String(value))}; e.dispatchEvent(new Event("input",{bubbles:true})); e.dispatchEvent(new Event("change",{bubbles:true})); return true; })()`);
            await delay(250);
        };

        const setState = async (key, field, value) => {
            const attr = field === "toggle" ? "data-genshin-toggle-key" : field === "partyCondition" ? "data-genshin-party-condition-key" : "data-genshin-condition-key";
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

        const openConditions=async()=>{
            if(!await evaluate(client,'document.getElementById("genshinConditionDialog")?.open')) {
                await evaluate(client,'document.getElementById("genshinConditionDialogOpen").click()');
                await waitFor(client,'document.getElementById("genshinConditionDialog")?.open');
            }
        };
        const closeConditions=()=>evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const chooseWeapon=async id=>{
            await evaluate(client,'document.querySelector('+JSON.stringify('[data-selection-target="genshinWeaponInput"]')+').click()');
            const selector=JSON.stringify('[data-selection-id="'+id+'"]');
            await waitFor(client,'Boolean(document.querySelector('+selector+'))');
            await evaluate(client,'document.querySelector('+selector+').click()');
            await waitFor(client,'document.getElementById("genshinCalcWeaponId").value==="'+id+'"');
            await delay(300);
        };
        const signature=p=>p.results.map(r=>[r.entry.id,r.total?.expected??r.expected]);
        const reload=async before=>{
            await evaluate(client,'location.reload()');
            await waitFor(client,'Boolean(window.GenshinCalcEngine&&window.GenshinCalcData)');
            await waitFor(client,'document.getElementById("genshinCalcWeaponId")?.value==="'+before.calculationRequest.weaponId+'"');
            await evaluate(client,'(()=>{const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__weapon71CurrentPayload=p;return p;};})()');
            const after=await calculate();assert.deepEqual(signature(after),signature(before),"reload preserves all weapon damage");
            await replay();return after;
        };
        const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7, a+" != "+b);
        await chooseWeapon("14524");await input("genshinWeaponRefinement","R1");
        const off=await calculate();
        const hpRows=off.results.filter(r=>r.entry.scalings?.some(s=>s.stat==="hp")&&r.expected>0);
        assert.ok(hpRows.length,"HP-based talent damage exists");
        const key="weapon:14524:group:provisional71_w14524_mead_state";
        await openConditions();
        await evaluate(client,'document.querySelector("[data-condition-tab=weapon]").click()');
        const label=await evaluate(client,'document.getElementById("genshinConditionDialog").innerText');
        assert.match(label,/仕様確認中/);
        const states=[["one",4],["two",8],["three",12],["boostedOne",7],["boostedTwo",14],["boostedThree",21]];
        for(const [state,percent]of states){
            await setState(key,"option",state);await closeConditions();const p=await calculate();
            near(p.context.effectiveStats.hp,off.context.effectiveStats.hp+off.calculationRequest.stats.baseHp*percent/100);
            near(p.context.effectiveStats.atk,off.context.effectiveStats.atk);
            for(const r of hpRows)assert.ok(entry(p,r.entry.id).expected>r.expected);
            assert.ok(p.warnings.some(w=>w.weaponId==="14524"&&/仕様確認中/.test(w.message)));
            await replay();await openConditions();
        }
        await closeConditions();const on=await calculate();await reload(on);
        await input("genshinWeaponRefinement","R5");const refined=await calculate();
        near(refined.context.effectiveStats.hp,off.context.effectiveStats.hp+off.calculationRequest.stats.baseHp*.42);
        await replay();await reload(refined);
        await evaluate(client,'document.querySelector('+JSON.stringify('[data-equipment-details="weapon"]')+').click()');
        await waitFor(client,'document.getElementById("genshinEquipmentDetailsDialog").open');
        const details=await evaluate(client,'document.getElementById("genshinEquipmentDetailsBody").innerText');
        assert.match(details,/8%/);assert.doesNotMatch(details,/hpPerStack|atkPer1000Hp|atkCap|<color|\{\d+\}/);
        await evaluate(client,'document.getElementById("genshinEquipmentDetailsClose").click()');
        await openConditions();await setState(key,"option","inactive");await closeConditions();
        const inactive=await calculate();near(inactive.context.effectiveStats.hp,off.context.effectiveStats.hp);
        await chooseWeapon("14501");const changed=await calculate();
        assert.ok(!changed.warnings.some(w=>w.weaponId==="14524"));
        assert.ok(!changed.statTrace.some(m=>m.modifierId.startsWith("provisional71_w14524")));
        await replay();await reload(changed);
        const text=await evaluate(client,'document.body.innerText');
        assert.doesNotMatch(text,/provisional71_w|stellarSwirl|hpPerStack|atkPer1000Hp/,"no internal keys in user UI");
        assert.equal(await evaluate(client,'Boolean(document.getElementById("genshinCurrentCalcExportButton"))'),false);
        progress("PASS Hymn confirmed HP states, R1/R5, HP talent damage, ATK pending disclosure, OFF/switch isolation, reload and Request replay");
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
            assert.ok(path.basename(target).startsWith("genshin-hymn71-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
