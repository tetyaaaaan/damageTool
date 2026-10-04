"use strict";

// Real-browser verification that Durin's current conditions affect only their intended damage entries.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9226);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-durin-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-durin-current-"));
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
                window.__durinCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "ドゥリン", genshinCalcCharacterId: "10000123",
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



        const formKey='character:10000123:group:durinEssentialTransmutationForm';
        const partyFormKey='party:2:10000123:group:durinEssentialTransmutationForm';
        const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-7,msg+': '+a+' != '+b);
        const entry=(p,id)=>{const r=p.results.find(r=>r.entry.id===id);assert.ok(r,id);return r;};
        const input=async(id,value)=>{
            await evaluate(client,'(() => {const e=document.getElementById('+JSON.stringify(id)+'); if(!e)throw Error("missing input"); e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(300);
        };
        const condition=async(key,value,party=false)=>{
            const attr=party?'data-genshin-party-condition-key':'data-genshin-condition-key';
            const selector='['+attr+'="'+key+'"]';
            await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');
            await evaluate(client,'(() => {const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(400);
        };
        const calculate=async()=>{
            await evaluate(client,'window.__durinCurrentPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client,'Boolean(window.__durinCurrentPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client,'window.__durinCurrentPayload');
        };
        const replay=async()=>{
            assert.equal(await evaluate(client,'(async()=>{const p=window.__durinCurrentPayload;const d=await window.GenshinCalcData.loadGenshinCalcData();const r=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request)),d);return JSON.stringify(r.results)===JSON.stringify(p.results);})()'),true,'JSON replay is exact');
        };
        await input('genshinJsonReactionOption','vaporize15');
        await condition(formKey,'inactive');const off=await calculate();
        await condition(formKey,'dark');const own=await calculate();
        assert.ok(entry(own,'damage_6').expected>entry(off,'damage_6').expected,'Dark Decay increases Durin own vaporize damage');
        near(entry(own,'damage_6').breakdown.reactionBonus-entry(off,'damage_6').breakdown.reactionBonus,40,'own Vaporize receives exactly +40%');
        near(own.context.reactionOption.coefficient,1.5,'real Vaporize route selected');
        await replay();
        await input('genshinJsonReactionOption','none');const ownNone=await calculate();
        await condition(formKey,'inactive');const offNone=await calculate();
        for(const r of ownNone.results)near(r.expected,entry(offNone,r.entry.id).expected,'Dark form has no buff on non-reaction '+r.entry.id);
        // Confirm the new additive and talent-base paths use the real loader and independent UI inputs.
        await input('genshinReflectConstellation','C1');
        await condition(formKey,'dark');
        await condition('character:10000123:group:durinC1Epiphany','2');
        await condition('character:10000123:group:durinPrimordialFusion','1');
        const combined = await calculate();
        near(entry(combined,'damage_6').breakdown.baseTalentDamageMultiplier,1.66,'A4 uses actual UI ATK 2200');
        near(entry(combined,'damage_6').breakdown.additiveBaseDamage,3300,'C1 is separate ATK150% addition');
        near(entry(combined,'damage_4').breakdown.baseTalentDamageMultiplier,1,'A4 excludes the Burst opening hit');
        near(entry(combined,'damage_2').breakdown.additiveBaseDamage,0,'C1 excludes Skill');
        assert.ok(entry(combined,'damage_6').expected>entry(offNone,'damage_6').expected,'independent inputs increase actual dragon damage');
        await replay();
        // Change the main recipient, then select Durin through the actual support-character modal.
        await input('genshinReflectCharacter','アルレッキーノ');await input('genshinCalcCharacterId','10000096');
        await input('genshinReflectConstellation','C0');await input('genshinJsonReactionOption','vaporize15');
        await evaluate(client,'document.getElementById("genshinConditionDialog").close();document.getElementById("genshinPartyDialogOpen").click()');
        await waitFor(client,'document.getElementById("genshinPartyDialog")?.open===true');
        await evaluate(client,'document.getElementById("genshinPartyCharacterTrigger2").click()');
        await waitFor(client,'Boolean(document.querySelector(\'[data-selection-id="10000123"]\'))');
        await evaluate(client,'document.querySelector(\'[data-selection-id="10000123"]\').click()');
        await input('genshinPartyConstellation2','0');await input('genshinPartyAtk2',2200);
        await evaluate(client,'document.getElementById("genshinPartyDialog").close();document.getElementById("genshinConditionDialogOpen").click()');
        await waitFor(client,'document.getElementById("genshinConditionDialog")?.open===true');
        // Party controls exist only for legitimate recipient/enemy effects; self bonuses remain excluded.
        await condition(partyFormKey,'inactive',true);const recipientOff=await calculate();
        await condition(partyFormKey,'dark',true);const recipientDark=await calculate();
        for(const r of recipientOff.results){near(entry(recipientDark,r.entry.id).expected,r.expected,'Durin self +40 does not change recipient '+r.entry.id);near(entry(recipientDark,r.entry.id).breakdown.reactionBonus,0,'recipient reaction bonus excludes Durin self '+r.entry.id);}
        assert.ok(recipientDark.calculationRequest.party.members.some(m=>String(m.characterId)==='10000123'),'Durin exists in actual support party');
        assert.ok(entry(recipientDark,'skilldamage').expected>0,'recipient actual Vaporize Burst damage is calculated');
        await replay();
        progress('PASS Durin: own Vaporize +40%; non-reaction unchanged; A4/C1 independent inputs reach actual damage; support selection excludes self bonus from another character; JSON replay exact');
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
            assert.ok(path.basename(target).startsWith("genshin-durin-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
