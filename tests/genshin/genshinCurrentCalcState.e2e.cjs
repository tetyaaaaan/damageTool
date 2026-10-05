"use strict";

// Real-browser verification of CurrentCalc reload and shared JSON state.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9231);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-currentcalc-state-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-currentcalc-state-current-"));
        browser = spawn(browserPath, [
            "--headless=new", "--disable-gpu", "--window-size=1280,900", "--no-first-run",
            "--no-default-browser-check", `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profileDir}`, "about:blank"
        ], { stdio: "ignore", windowsHide: true });
        const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
        const page = targets.find((target) => target.type === "page");
        assert.ok(page, "Genshin page target was not created");
        client = await connectCdp(page.webSocketDebuggerUrl);
        // External fonts/analytics do not participate in this local state contract.
        await client.send("Network.enable");
        await client.send("Network.setBlockedURLs", { urls: ["https://*"] });
        await client.send("Page.navigate", { url: baseUrl });
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcConditions && window.GenshinCalcData)");
        await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
        await waitFor(client, "Boolean(window.GenshinEnemySelector && window.GenshinCurrentCalcState)");
        await evaluate(client, "window.GenshinCurrentCalcState.ready.then(()=>true)");
        await evaluate(client, `(() => {
            const original = window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc = async (...args) => {
                const payload = await original(...args);
                window.__everlastingPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "リサ", genshinCalcCharacterId: "10000006",
                genshinWeaponInput: "不滅の月華", genshinCalcWeaponId: "14506", genshinReflectLevel: 90,
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

        const click=async(selector)=>{await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');await evaluate(client,'document.querySelector('+JSON.stringify(selector)+').click()');await delay(150);};
        const input=async(id,value)=>{await evaluate(client,'(()=>{const e=document.getElementById('+JSON.stringify(id)+');if(!e)throw Error("missing field "+'+JSON.stringify(id)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(150);};
        const choose=async(trigger,id)=>{await click(trigger);await waitFor(client,'document.getElementById("genshinSelectionDialog").open');await input('genshinSelectionSearch','');await click('#genshinSelectionList [data-selection-id="'+id+'"]');};
        const conditions=async()=>{await evaluate(client,'document.getElementById("genshinPartyDialog").close()');await click('#genshinConditionDialogOpen');};
        const close=async()=>evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const condition=async(key,value,party=false)=>{const selector='[data-genshin-'+(party?'party-':'')+'condition-key="'+key+'"]';await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');await evaluate(client,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(200);};
        const calculate=async()=>{await close();await click('#genshinJsonCalcButtonBottom');await waitFor(client,'!document.getElementById("genshinJsonCalcButtonBottom").disabled && Boolean(window.GenshinCalculationComparison.store.getState().current)');};
        const fingerprint=async()=>evaluate(client,'({request:window.GenshinCalcEngine.buildCalculationRequestFromForm(),results:window.GenshinCalculationComparison.store.getState().current.results,selection:window.GenshinCurrentCalcState.createState().state.selection,statDisplay:Object.fromEntries(["genshinHpInput","genshinAtkInput","genshinCritRateInput","genshinEnergyRechargeInput"].map(id=>[id,document.getElementById(id).value]))})');
        const reload=async(label)=>{await calculate();await click('[data-json-tab="burst"]');await evaluate(client,'document.querySelector("[data-json-panel=burst] [data-result-detail-toggle]")?.click()');const before=await fingerprint();await evaluate(client,'window.GenshinCurrentCalcState.persist()');assert.ok(await evaluate(client,'Boolean(localStorage.getItem(window.GenshinCurrentCalcState.STORAGE_KEY))'));await client.send('Page.reload',{ignoreCache:true});await waitFor(client,'Boolean(window.GenshinCurrentCalcState)');await evaluate(client,'window.GenshinCurrentCalcState.ready.then(()=>true)');assert.equal(await evaluate(client,'document.getElementById("genshinCurrentCalcStateMessage").innerText'), '前回の計算状態を復元しました。');const after=await fingerprint();assert.deepEqual(after,before,label+' reload preserves request/results/selection');progress('PASS '+label+' reload');};
        await close();await input('genshinArtifactSetMode','4pc');await choose('#genshinArtifactSetOneTrigger','15047');await conditions();await click('[data-artifact-set="15047"][data-artifact-piece="4"] [data-genshin-toggle-key]');await input('genshinEnemyLevelInput',100);await input('genshinEnemyElementalResistanceInput',25);await input('genshinDefenseReductionInput',30);await reload('single wearer + weapon/artifact + enemy');const preset=await evaluate(client,'Array.from(document.getElementById("genshinEnemyPresetSelect").options).find(o=>o.value!=="custom").value');await input('genshinEnemyPresetSelect',preset);await reload('enemy preset');
        await input('genshinHpInput',30000.49);await input('genshinAtkInput',2200.49);await input('genshinCritRateInput',33.5);await reload('manual fractional stat display and exact damage');
        await choose('#genshinReflectCharacter','10000052');await input('genshinReflectConstellation','C2');await input('genshinEnergyRechargeInput',250);await conditions();await condition('talent:combat3:group:raidenResolve',25);await condition('talent:combat2:group:talent-state:10000052:combat2',90);await click('[data-genshin-toggle-key="talent:passive2:raiden_excess_er_electro_bonus"]');
        await close();await click('#genshinPartyDialogOpen');await choose('#genshinPartyCharacterTrigger2','10000089');await choose('#genshinPartyWeaponTrigger2','11511');await input('genshinPartyHp2',40000);await conditions();let p=await evaluate(client,'(async()=>window.GenshinCalcEngine.calculateDamageRequest(window.GenshinCalcEngine.buildCalculationRequestFromForm(),await window.GenshinCalcData.loadGenshinCalcData()))()');let fanfare=p.partyModifiers.find(c=>c.modifier.id==='t_10000089_combat3_fanfare_damage_bonus');await condition(fanfare.partyConditionStateKey||fanfare.analysis.conditionStateKey,300,true);await click('[data-genshin-party-buff-key="'+fanfare.toggleKey+'"]');await condition('party:2:10000089:group:grandHymnStacks',3,true);await reload('Raiden ER/Resolve + Furina Fanfare + Key provider HP/shared3 stacks');
        await choose('#genshinReflectCharacter','10000096');await input('genshinReflectConstellation','C6');await conditions();await condition('character:10000096:group:arlecchinoBondOfLife',33.5);await click('[data-genshin-toggle-key="constellation:C6:group:arlecchinoC6AfterSkill"]');await reload('Arlecchino fractional Bond and shared C6');
        await input('genshinJsonReactionOption','lunarCrystallize');await conditions();await input('genshinReactionContributor2Level',90);await input('genshinReactionContributor2Em',300);await reload('Lunar Crystallize extra participant');
        await close();await input('genshinJsonReactionOption','none');await choose('#genshinReflectCharacter','10000039');await choose('[data-selection-target="genshinWeaponInput"]','15513');await input('genshinReflectConstellation','C0');await input('genshinCritRateInput',20);await input('genshinCritDamageInput',100);await conditions();await condition('weapon:15513:group:existingHPstack',2);await calculate();const whiteTwo=(await fingerprint()).results;
        await conditions();await condition('weapon:15513:group:existingHPstack',3);await calculate();const whiteThree=(await fingerprint()).results;for(const result of whiteThree){const before=whiteTwo.find(r=>r.entry.id===result.entry.id);if(result.entry.damageType==='burst')assert.ok(result.expected>before.expected,'White Rain 3 stacks increase Burst expected damage');else assert.equal(result.expected,before.expected,'White Rain CRIT does not leak to non-Burst');}await reload('White Rain shared 3-stack condition');
        await choose('#genshinReflectCharacter','10000015');await choose('[data-selection-target="genshinWeaponInput"]','11425');await conditions();await condition('weapon:11425:group:finale11425ClearedBondHp',0);await calculate();const finaleZero=(await fingerprint()).results;
        await conditions();await condition('weapon:11425:group:finale11425ClearedBondHp',1000.5);await calculate();const finaleHp=(await fingerprint()).results;assert.ok(finaleHp.find(r=>r.entry.damageType==='normal').nonCrit>finaleZero.find(r=>r.entry.damageType==='normal').nonCrit,'Finale cleared HP amount increases actual damage');await reload('Finale fractional cleared Bond HP');
        assert.equal(await evaluate(client,'Boolean(document.querySelector("#genshinCurrentCalcExport, #genshinCurrentCalcImport, #genshinCurrentCalcFile"))'),false,'developer JSON controls are absent from the normal UI');
        const original=await fingerprint();const serialized=await evaluate(client,'window.GenshinCurrentCalcState.serialize()');const saved=JSON.parse(serialized);assert.equal(saved.game,'genshin');assert.equal(saved.schemaVersion,1);assert.equal(saved.state.results,undefined);
        await input('genshinAtkInput',900);await input('genshinJsonReactionOption','none');await calculate();assert.notDeepEqual((await fingerprint()).results,original.results);
        await evaluate(client,'window.GenshinCurrentCalcState.importText('+JSON.stringify(serialized)+').then(()=>true)');assert.deepEqual(await fingerprint(),original,'internal JSON roundtrip restores request, damage and selection');progress('PASS internal JSON serialize -> edit -> import -> same request and damage');
        for(const [name,text] of [['malformed','{'],['version',JSON.stringify({...saved,schemaVersion:99})],['unknown-character',JSON.stringify({...saved,state:{...saved.state,request:{...saved.state.request,characterId:'99999999'}}})]]){assert.equal(await evaluate(client,'window.GenshinCurrentCalcState.importText('+JSON.stringify(text)+').then(()=>false,()=>true)'),true,name+' rejects');assert.deepEqual(await fingerprint(),original,name+' leaves current request/results intact');}
        progress('PASS malformed/version/unknown ID rejected without changing current state');
        for(const text of ['{',JSON.stringify({...saved,schemaVersion:99})]){
            const storageKey=await evaluate(client,'window.GenshinCurrentCalcState.STORAGE_KEY');
            const injection=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem('+JSON.stringify(storageKey)+','+JSON.stringify(text)+')'});
            await client.send('Page.reload',{ignoreCache:true});await waitFor(client,'Boolean(window.GenshinCurrentCalcState)');await evaluate(client,'window.GenshinCurrentCalcState.ready.then(()=>true)');
            await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injection.identifier});
            assert.equal(await evaluate(client,'document.getElementById("genshinCalcCharacterId").value'),'');
            assert.ok(await evaluate(client,'document.getElementById("genshinCurrentCalcStateMessage").innerText.includes("復元できません")'));
            await evaluate(client,'window.GenshinCurrentCalcState.importText('+JSON.stringify(JSON.stringify(saved))+').then(()=>true)');
            assert.deepEqual(await fingerprint(),original,'valid common file recovers after invalid local state');
        }
        progress('PASS malformed/unsupported local state falls back safely; valid JSON recovers');
        const delayed=await client.send('Page.addScriptToEvaluateOnNewDocument',{source:'const originalFetch=window.fetch;window.fetch=(...args)=>String(args[0]).includes("characters.json")?new Promise(resolve=>setTimeout(resolve,5000)).then(()=>originalFetch(...args)):originalFetch(...args);'});
        await client.send('Page.reload',{ignoreCache:true});await waitFor(client,'Boolean(window.GenshinCurrentCalcState) && document.getElementById("genshinHpInput").getBoundingClientRect().width > 0');await client.send('Page.bringToFront');
        await evaluate(client,'document.getElementById("genshinHpInput").focus();document.getElementById("genshinHpInput").select()');await client.send('Input.insertText',{text:'54321'});assert.equal(await evaluate(client,'document.getElementById("genshinHpInput").value'),'54321','trusted input reaches form before async restore');
        await evaluate(client,'window.GenshinCurrentCalcState.ready.then(()=>true)');await client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:delayed.identifier});
        assert.equal(await evaluate(client,'document.getElementById("genshinHpInput").value'),'54321','real user edit during loading wins over stale stored inputs');
        assert.equal(await evaluate(client,'document.getElementById("genshinCalcCharacterId").value'),'','old character was not reapplied over early user edits');
        progress('PASS slow initialization preserves real user input instead of applying stale state');
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
            assert.ok(path.basename(target).startsWith("genshin-currentcalc-state-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
