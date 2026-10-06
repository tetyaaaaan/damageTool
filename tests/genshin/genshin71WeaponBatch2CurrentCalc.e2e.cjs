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
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9235);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-batch2-weapon71-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-batch2-weapon71-current-"));
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
                genshinReflectCharacter: "ジン", genshinCalcCharacterId: "10000003",
                genshinWeaponInput: "", genshinCalcWeaponId: "", genshinReflectLevel: 90,
                genshinReflectConstellation: "C0", genshinAtkInput: 2000, genshinDefInput: 1000,
                genshinHpInput: 20000, genshinElementalMasteryInput: 0,
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
        const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,a+" != "+b);
        const star=p=>entry(p,"reaction_stellarSwirl");
        const checkConditionText=async tab=>{
            await openConditions();await evaluate(client,'document.querySelector("[data-condition-tab='+tab+']").click()');
            const text=await evaluate(client,'document.getElementById("genshinConditionDialog").innerText');
            assert.doesNotMatch(text,/provisional71_w|stellarSwirl|stellarReactions|growthAtk|pactCryoEm|venomStar|\banemo\b|\bcryo\b/);
            await closeConditions();
        };
        const chooseCharacter=async id=>{
            await evaluate(client,'document.querySelector('+JSON.stringify('[data-selection-target="genshinReflectCharacter"]')+').click()');
            const selector=JSON.stringify('[data-selection-id="'+id+'"]');
            await waitFor(client,'Boolean(document.querySelector('+selector+'))');
            await evaluate(client,'document.querySelector('+selector+').click()');await delay(300);
        };
        const party=async()=>{
            await evaluate(client,'document.getElementById("genshinConditionDialog").close();document.getElementById("genshinPartyDialogOpen").click()');
            await waitFor(client,'document.getElementById("genshinPartyDialog").open');
        };
        const partyPick=async(kind,id)=>{
            await evaluate(client,'document.getElementById("genshinParty'+kind+'Trigger2").click()');
            const selector=JSON.stringify('[data-selection-id="'+id+'"]');
            await waitFor(client,'Boolean(document.querySelector('+selector+'))');
            await evaluate(client,'document.querySelector('+selector+').click()');await delay(250);
        };
        const exitParty=()=>evaluate(client,'document.getElementById("genshinPartyDialog").close()');
        const details=async()=>{
            await evaluate(client,'document.querySelector('+JSON.stringify('[data-equipment-details="weapon"]')+').click()');
            await waitFor(client,'document.getElementById("genshinEquipmentDetailsDialog").open');
            const text=await evaluate(client,'document.getElementById("genshinEquipmentDetailsBody").innerText');
            assert.doesNotMatch(text,/growthAtk|growthEm|pactCryoEm|pactElectroAtk|radiantPact|hymnEr|venomStar|<color|\{\d+\}/);
            await evaluate(client,'document.getElementById("genshinEquipmentDetailsClose").click()');return text;
        };
        await chooseWeapon("11437");await input("genshinWeaponRefinement","R1");await input("genshinJsonReactionOption","stellarSwirl");
        const off=await calculate(), normalId=off.results.find(r=>r.entry.attackType==="normalAttack").entry.id;
        await openConditions();await evaluate(client,'document.querySelector("[data-condition-tab=weapon]").click()');
        const growth="weapon:11437:group:provisional71_w11437_growth_state";
        await setState(growth,"option","ordinary3");await closeConditions();const ordinary=await calculate();
        near(ordinary.context.effectiveStats.elementalMastery,off.context.effectiveStats.elementalMastery+60);
        near(ordinary.context.effectiveStats.atk,off.context.effectiveStats.atk+off.calculationRequest.stats.baseAtk*.12);
        assert.ok(entry(ordinary,normalId).expected>entry(off,normalId).expected);assert.ok(star(ordinary).expected>star(off).expected);
        await openConditions();await setState(growth,"option","radiant3");await closeConditions();const radiant=await calculate();
        near(radiant.context.effectiveStats.elementalMastery,off.context.effectiveStats.elementalMastery);
        near(radiant.context.effectiveStats.atk,off.context.effectiveStats.atk+off.calculationRequest.stats.baseAtk*.18);
        assert.ok(radiant.warnings.some(w=>w.weaponId==="11437"&&/仕様確認中/.test(w.message)));
        await replay();await reload(radiant);await input("genshinWeaponRefinement","R5");const refined=await calculate();
        near(refined.context.effectiveStats.atk,off.context.effectiveStats.atk+off.calculationRequest.stats.baseAtk*.36);
        await details();await replay();await reload(refined);
        await checkConditionText("weapon");

        await chooseCharacter("10000006");await chooseWeapon("14437");await input("genshinWeaponRefinement","R1");
        await input("genshinElementalMasteryInput",0);await input("genshinAtkInput",2000);await input("genshinJsonReactionOption","stellarSwirl");
        await party();await partyPick("Character","10000015");await exitParty();
        const pactOff=await calculate();near(pactOff.context.effectiveStats.elementalMastery,24);
        near(pactOff.context.effectiveStats.atk,2000+pactOff.calculationRequest.stats.baseAtk*.048);
        const pact="weapon:14437:group:provisional71_w14437_pact_state";
        await openConditions();await setState(pact,"option","radiant");await closeConditions();const pactOn=await calculate();
        near(pactOn.context.effectiveStats.elementalMastery,40);near(pactOn.context.effectiveStats.atk,2000);
        near(star(pactOn).breakdown.reactionBonus,12);assert.ok(star(pactOn).expected>star(pactOff).expected);
        assert.ok(!pactOn.warnings.some(w=>w.weaponId==="11437"));await replay();await reload(pactOn);
        await input("genshinWeaponRefinement","R5");const pactR5=await calculate();near(pactR5.context.effectiveStats.elementalMastery,80);near(star(pactR5).breakdown.reactionBonus,24);
        await details();await replay();await reload(pactR5);
        await checkConditionText("weapon");

        await party();await evaluate(client,'document.querySelector('+JSON.stringify('[data-party-clear="2"]')+').click()');await exitParty();
        await chooseCharacter("10000031");await chooseWeapon("15437");await input("genshinWeaponRefinement","R1");
        await input("genshinElementalMasteryInput",0);await input("genshinJsonReactionOption","stellarSwirl");await input("genshinEnergyRechargeInput",120);
        const bowOff=await calculate(),bowNormal=bowOff.results.find(r=>r.entry.attackType==="normalAttack").entry.id;
        const hymn="weapon:15437:group:provisional71_w15437_hymn_state";
        await openConditions();await setState(hymn,"option","hymn2");await closeConditions();near(star(await calculate()).expected,star(bowOff).expected);
        await openConditions();await setState(hymn,"option","venom");await closeConditions();const bowOn=await calculate();
        near(star(bowOn).breakdown.reactionBonus,24);assert.ok(star(bowOn).expected>star(bowOff).expected);
        near(entry(bowOn,bowNormal).expected,entry(bowOff,bowNormal).expected);near(bowOn.context.effectiveStats.energyRecharge,120);
        await replay();await reload(bowOn);await input("genshinWeaponRefinement","R5");await input("genshinEnergyRechargeInput",140);
        const bowR5=await calculate();near(star(bowR5).breakdown.reactionBonus,48);near(bowR5.context.effectiveStats.energyRecharge,140);await details();await reload(bowR5);
        await checkConditionText("weapon");

        await chooseCharacter("10000003");await chooseWeapon("11501");await input("genshinJsonReactionOption","stellarSwirl");
        await party();await partyPick("Character","10000031");await partyPick("Weapon","15437");await input("genshinPartyRefinement2",5);await exitParty();
        const partyOff=await calculate();near(star(partyOff).breakdown.reactionBonus,0);
        const partyKey="party:2:10000031:group:provisional71_w15437_hymn_state";
        await openConditions();await evaluate(client,'document.querySelector("[data-condition-tab=party]").click()');
        await setState(partyKey,"partyCondition","venom");await closeConditions();const partyOn=await calculate();
        near(star(partyOn).breakdown.reactionBonus,48);assert.ok(star(partyOn).expected>star(partyOff).expected);
        await replay();await reload(partyOn);
        await checkConditionText("party");
        await party();await input("genshinPartyElementalMastery2",999);await exitParty();near(star(await calculate()).breakdown.reactionBonus,48);
        await party();await partyPick("Weapon","15409");await exitParty();const switched=await calculate();near(star(switched).breakdown.reactionBonus,0);
        assert.ok(!switched.results.some(r=>r.breakdown.appliedModifiers.some(m=>/provisional71_w(?:11437|14437|15437)/.test(m.modifier.id))));
        await replay();await reload(switched);
        const text=await evaluate(client,'document.body.innerText');
        assert.doesNotMatch(text,/provisional71_w|stellarSwirl|growthAtk|pactCryoEm|venomStar|\banemo\b|\bcryo\b/);
        progress("PASS batch2 real weapon/party selection, replacement states, composition, wearer/team Star bonus, R1/R5, damage, pending notice, switch isolation, reload and Request replay");
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
            assert.ok(path.basename(target).startsWith("genshin-batch2-weapon71-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
