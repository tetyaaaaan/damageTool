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
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9464);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-original-effect-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-original-effect-"));
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

        await evaluate(client,'window.__effectPayload=null;const run=window.GenshinCalcEngine.runGenshinJsonCalc;window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await run(...args);window.__effectPayload=p;return p};');
        const input=async(id,value)=>{
            await evaluate(client,'(()=>{const e=document.getElementById('+JSON.stringify(id)+');if(!e)throw Error("missing "+'+JSON.stringify(id)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));})()');
            await delay(100);
        };
        const closeDialogs=()=>evaluate(client,'document.querySelectorAll("dialog[open]").forEach(e=>e.close())');
        const select=async(trigger,id)=>{
            await evaluate(client,'document.querySelector('+JSON.stringify(trigger)+').click()');
            const selector='[data-selection-id="'+id+'"]';
            await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');
            await evaluate(client,'document.querySelector('+JSON.stringify(selector)+').click()');await delay(180);
        };
        const chooseCharacter=id=>select('[data-selection-target="genshinReflectCharacter"]',id);
        const chooseWeapon=id=>select('[data-selection-target="genshinWeaponInput"]',id);
        const normalize=s=>s.replace(/\s+/g,' ').trim();
        const conditionText=async tab=>{
            await closeDialogs();await evaluate(client,'document.getElementById("genshinConditionDialogOpen").click()');
            await waitFor(client,'document.getElementById("genshinConditionDialog").open');
            await evaluate(client,'document.querySelector('+JSON.stringify('[data-condition-tab="'+tab+'"]')+').click();document.querySelectorAll("#genshinConditionDialog details").forEach(e=>e.open=true)');
            return evaluate(client,'document.getElementById("genshinConditionDialog").innerText');
        };
        const details=async kind=>{
            await closeDialogs();await evaluate(client,'document.querySelector('+JSON.stringify('[data-equipment-details="'+kind+'"]')+').click()');
            await waitFor(client,'document.getElementById("genshinEquipmentDetailsDialog").open');
            await evaluate(client,'document.querySelectorAll("#genshinEquipmentDetailsDialog details").forEach(e=>e.open=true)');
            return evaluate(client,'document.getElementById("genshinEquipmentDetailsBody").innerText');
        };
        const raw=await evaluate(client,'(async()=>{await window.GenshinIdResolver.ready;return (await window.GenshinCalcData.loadGenshinCalcData()).originalEffectTexts})()');
        await chooseCharacter('10000140');
        for(const [id,v]of Object.entries({genshinReflectLevel:90,genshinHpInput:50500,genshinBaseHpInput:15000,genshinAtkInput:2000,genshinBaseAtkInput:900,genshinDefInput:1000,genshinElementalMasteryInput:100,genshinCritRateInput:50,genshinCritDamageInput:100,genshinEnergyRechargeInput:100,genshinNormalTalentLevel:10,genshinSkillTalentLevel:10,genshinBurstTalentLevel:10}))await input(id,v);
        const passive=raw.characters['10000140'].talents.passive2.originalText.replace(/\*\*/g,'');
        assert.ok(normalize(await details('character')).includes(normalize(passive)));
        assert.ok(normalize(await conditionText('talent')).includes(normalize(passive)));
        progress('PASS character detail and talent modifier original');
        await closeDialogs();await chooseWeapon('14524');await input('genshinWeaponRefinement','R5');
        const hymn=raw.weapons['14524'].originalTextByRefinement['5'];
        assert.ok(normalize(await details('weapon')).includes(normalize(hymn)));
        let text=await conditionText('weapon');assert.ok(normalize(text).includes(normalize(hymn)));
        assert.match(text,/計算への反映/);assert.match(text,/精錬ランク[\s\S]*R5/);
        assert.equal(text.split('与える治療効果+8%').length-1,1);
        progress('PASS weapon detail and Hymn modifier whole original once plus Runtime impacts');
        for(const id of ['15047','15048']){
            await closeDialogs();await input('genshinArtifactSetMode','4pc');await input('genshinArtifactSetOne',id);
            text=await conditionText('artifact');
            assert.ok(normalize(text).includes(normalize(raw.artifacts[id].fourPiece.originalText)));
            assert.match(text,/計算への反映/);
            if(id==='15048') {
                const selector='[data-condition-panel="artifact"] input[data-genshin-toggle-key*="artifact15048AfterStellarGlimmer"]';
                assert.equal(await evaluate(client,'document.querySelector('+JSON.stringify(selector)+').closest("details")===null'),true);
                for(const enabled of [false,true]) {
                    await evaluate(client,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.checked='+enabled+';e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(200);
                    const impacts=await evaluate(client,'Array.from(document.querySelectorAll("[data-condition-panel=artifact] .genshin-runtime-impact")).map(e=>e.textContent).join("\\n")');
                    assert.match(impacts,enabled?/攻撃力 \+12%/:/攻撃力 \+0%　条件未成立/);
                }
                assert.match(await evaluate(client,'document.querySelector("[data-condition-tab=artifact]").textContent'),/設定済み|要設定/);
            }
        }
        progress('PASS both Japanese artifact originals');
        await closeDialogs();await chooseCharacter('10000003');await chooseWeapon('11511');await input('genshinWeaponRefinement','R5');
        text=await conditionText('weapon');assert.match(text,/HP\+40%/);assert.match(text,/0\.24%/);assert.match(text,/0\.4%/);assert.match(text,/計算への反映/);assert.equal(text.split('HP+40%').length-1,1);
        progress('PASS Key self/team EM modifier shares full R5 original once');
        await closeDialogs();await chooseCharacter('10000096');
        await evaluate(client,'document.getElementById("genshinPartyDialogOpen").click()');
        await waitFor(client,'document.getElementById("genshinPartyDialog").open');
        await select('#genshinPartyCharacterTrigger2','10000003');
        await select('#genshinPartyWeaponTrigger2','11511');await input('genshinPartyRefinement2',5);
        text=await conditionText('party');assert.match(text,/HP\+40%/);assert.match(text,/0\.4%/);assert.match(text,/計算への反映/);
        assert.doesNotMatch(text,/provisional71|weaponModifiers\.|>全文</);
        progress('PASS party provider original uses provider R5');
        await closeDialogs();await evaluate(client,'document.getElementById("genshinPartyDialogOpen").click()');
        await select('#genshinPartyCharacterTrigger2','10000140');
        await select('#genshinPartyWeaponTrigger2','14524');
        await input('genshinPartyConstellation2',6);await input('genshinPartyHp2',50500);
        await input('genshinPartyRefinement2',5);
        text=await conditionText('party');
        const action=async(field,value)=>{
            const selector='[data-genshin-vody-action="'+field+'"]';
            await waitFor(client,'Boolean(document.querySelector('+JSON.stringify(selector)+'))');
            await evaluate(client,'(()=>{const e=document.querySelector('+JSON.stringify(selector)+');e.value='+JSON.stringify(String(value))+';e.dispatchEvent(new Event("change",{bubbles:true}));})()');await delay(200);
        };

        assert.equal(await evaluate(client,'document.querySelector("[data-genshin-vody-action=phase]").value'),'unused');
        assert.equal(await evaluate(client,'document.querySelector("[data-vody-advanced]")===null'),true);
        // The compact selection writes the existing skill/heals fields, preserving the Runtime contract.
        for(const phase of ['unused','0','1','3']) {
            await action('phase',phase);
            const check=await evaluate(client,'(async()=>{const p=await window.GenshinCalcEngine.runGenshinJsonCalc();const r=JSON.parse(JSON.stringify(p.calculationRequest));Object.keys(r.party.conditionStates).filter(k=>k.includes(":actions:")).forEach(k=>delete r.party.conditionStates[k]);const d=await window.GenshinCalcData.loadGenshinCalcData();const old=window.GenshinCalcEngine.calculateDamageRequest(r,d);const states=p.context.party.conditionStates;return {same:JSON.stringify(old.results.map(x=>[x.entry.id,x.nonCrit,x.crit,x.expected]))===JSON.stringify(p.results.map(x=>[x.entry.id,x.nonCrit,x.crit,x.expected])),difference:old.results.map((x,i)=>({id:x.entry.id,old:x.expected,new:p.results[i]?.expected})).filter(x=>x.old!==x.new),c1:states["party:2:10000140:group:vodyanitsa_c1_heal"].option,mead:states["party:2:10000140:group:provisional71_w14524_mead_state"].option,phase:document.querySelector("[data-genshin-vody-action=phase]").value,hits:Array.from(document.querySelectorAll("[data-genshin-vody-action=skillHit],[data-genshin-vody-action=hornHit]")).map(e=>e.value),collapsed:!document.querySelector("[data-vody-advanced]")?.open,mainInputs:document.querySelector(".genshin-provider-actions").querySelectorAll(":scope > label select").length}})()');
            assert.equal(check.same,true,JSON.stringify({phase,difference:check.difference}));assert.equal(check.phase,phase);
            assert.equal(check.c1,['1','3'].includes(phase)?'active':'inactive');
            assert.equal(check.mead,phase==='1'?'one':phase==='3'?'three':'inactive');
            assert.ok(check.mainInputs<=5);assert.equal(check.collapsed,true);
            if(phase!=='unused')assert.deepEqual(check.hits,['yes','yes']);
        }
        await evaluate(client,'document.querySelector("[data-vody-advanced]").open=true');
        await action('skillHit','no');await action('hornHit','no');
        assert.equal(await evaluate(client,'document.querySelector("[data-vody-advanced]").open'),true);
        const miss=await evaluate(client,'(async()=>{const p=await window.GenshinCalcEngine.runGenshinJsonCalc();return p.context.party.conditionStates["party:2:10000140:group:vodyanitsa_skill_hit"].option})()');
        assert.equal(miss,'inactive');
        assert.match(await evaluate(client,'document.querySelector("[data-vody-advanced] summary").textContent'),/2項目変更中/);
        assert.equal(await evaluate(client,'document.querySelector("[data-genshin-vody-action=qualifyingHeals]").closest("details")===null'),true);
        await action('phase','2');await action('qualifyingHeals','2');
        await action('skillHit','yes');await action('freezeSwirl','yes');
        text=await conditionText('party');
        assert.match(text,/現在の状態/);assert.match(text,/2回目の回復後/);
        assert.match(text,/真実を告げる蜜酒\s*2層/);
        assert.ok(await evaluate(client,'Array.from(document.querySelectorAll("[data-condition-panel=party] [data-impact-state=notApplicable]")).some(e=>e.textContent.includes("今回の攻撃には非適用"))'));
        assert.ok(await evaluate(client,'Array.from(document.querySelectorAll("[data-condition-panel=party] .genshin-runtime-impact")).some(e=>e.textContent.includes("攻撃力 +"))'));
        assert.doesNotMatch(text,/\{[a-zA-Z]\w*\}|provisional71|weaponModifiers\.|Lead Vocal|Chorus/);
        await closeDialogs();await evaluate(client,'window.__effectPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
        await waitFor(client,'Boolean(window.__effectPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
        const beforeReload=await evaluate(client,'JSON.stringify(window.__effectPayload.results)');
        assert.ok(await evaluate(client,'window.__effectPayload.context.party.conditionStates["party:2:10000140:group:vodyanitsa_c1_heal"].option==="active"'));
        await client.send('Page.reload');
        await waitFor(client,'Boolean(window.GenshinCalcEngine && window.GenshinPartyState)');
        await waitFor(client,'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width>0');
        await delay(500);
        text=await conditionText('party');
        assert.equal(await evaluate(client,'document.querySelector("[data-genshin-vody-action=phase]").value'),'2');
        await closeDialogs();
        const afterReload=await evaluate(client,'(async()=>JSON.stringify((await window.GenshinCalcEngine.runGenshinJsonCalc()).results))()');
        assert.equal(afterReload,beforeReload);
        progress('PASS provider actions, derived HP/conditions, token-free originals, actual damage and reload');
        // Four-person party: three provider panels share one member selector and one visible detail.
        await closeDialogs();await evaluate(client,'document.getElementById("genshinPartyDialogOpen").click()');
        await select('#genshinPartyArtifactOneTrigger2','15048');
        await select('#genshinPartyCharacterTrigger3','10000089');
        await select('#genshinPartyCharacterTrigger4','10000032');
        text=await conditionText('party');
        assert.equal(await evaluate(client,'document.querySelectorAll("[data-party-member-tab]").length'),3);
        assert.equal(await evaluate(client,'document.querySelectorAll("[data-party-member-panel]:not([hidden])").length'),1);
        assert.equal(await evaluate(client,'document.querySelectorAll("#genshin-party-member-panel-2 [data-party-effect-source]").length'),3);
        assert.doesNotMatch(text,/計算根拠|効果別の計算への反映/);
        const resistanceLabels=await evaluate(client,'document.querySelector("#genshin-party-member-panel-2 .genshin-provider-impact").innerText');
        assert.match(resistanceLabels,/敵の水元素耐性/);assert.match(resistanceLabels,/敵の氷元素耐性/);
        const beforeSwitch=await evaluate(client,'(async()=>JSON.stringify((await window.GenshinCalcEngine.runGenshinJsonCalc()).results.map(r=>[r.attackKey,r.expected])))()');
        await evaluate(client,'document.getElementById("genshin-party-member-tab-3").click()');
        assert.equal(await evaluate(client,'document.querySelector("[data-party-member-panel]:not([hidden])").dataset.partySlot'),'3');
        const status=await evaluate(client,'({member:document.getElementById("genshin-party-member-tab-3").querySelector("small").textContent,tab:document.querySelector("[data-condition-tab=party]").textContent,missing:Array.from(document.querySelectorAll("#genshin-party-member-panel-3 .genshin-party-current-state input, #genshin-party-member-panel-3 .genshin-party-current-state select")).filter(e=>e.type!=="checkbox"&&e.value==="").length})');
        if(status.missing) {assert.match(status.member,/要設定/);assert.match(status.tab,/要設定/);}
        await evaluate(client,'(()=>{const e=document.querySelector("#genshin-party-member-panel-3 .genshin-party-current-state input[type=number]");if(!e)throw new Error("Fanfare numeric input missing");window.__numericBefore=e.value;e.value="";e.dispatchEvent(new Event("input",{bubbles:true}));})()');
        assert.match(await evaluate(client,'document.getElementById("genshin-party-member-tab-3").querySelector("small").textContent'),/要設定1/);
        assert.match(await evaluate(client,'document.querySelector("[data-condition-tab=party]").textContent'),/要設定1/);
        await evaluate(client,'(()=>{const e=document.querySelector("#genshin-party-member-panel-3 .genshin-party-current-state input[type=number]");e.value=window.__numericBefore;e.dispatchEvent(new Event("input",{bubbles:true}));})()');
        await evaluate(client,'document.querySelector("[data-party-member-tab][aria-selected=true]").dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))');
        assert.equal(await evaluate(client,'document.querySelector("[data-party-member-panel]:not([hidden])").dataset.partySlot'),'2');
        assert.equal(await evaluate(client,'(async()=>JSON.stringify((await window.GenshinCalcEngine.runGenshinJsonCalc()).results.map(r=>[r.attackKey,r.expected])))()'),beforeSwitch);
        for(const width of [1280,375]) {
            await client.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await delay(200);
            await evaluate(client,'document.querySelector(".genshin-condition-dialog-body").scrollTop=0');
            const geometry=await evaluate(client,'(()=>{const d=document.querySelector(".genshin-condition-dialog-body"),p=document.querySelector("[data-party-member-panel]:not([hidden])");return {overflow:d.scrollWidth>d.clientWidth+1,visible:p.getBoundingClientRect().width>0}})()');
            assert.equal(geometry.overflow,false,'modal overflow at '+width);assert.equal(geometry.visible,true);
            const shot=await client.send('Page.captureScreenshot',{format:'png'});
            const file=path.join(os.tmpdir(),'genshin-party-modal-'+process.pid+'-'+width+'.png');fs.writeFileSync(file,Buffer.from(shot.data,'base64'));progress('SCREENSHOT '+file);
        }
        await client.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await delay(100);
        await evaluate(client,'document.querySelector("[data-party-member-panel]:not([hidden]) .genshin-party-effect-list").scrollIntoView({block:"start"})');
        const effectShot=await client.send('Page.captureScreenshot',{format:"png"});const effectFile=path.join(os.tmpdir(),'genshin-party-modal-'+process.pid+'-effects.png');fs.writeFileSync(effectFile,Buffer.from(effectShot.data,'base64'));progress('SCREENSHOT '+effectFile);
        await client.send('Emulation.clearDeviceMetricsOverride');
        await closeDialogs();await evaluate(client,'window.GenshinCurrentCalcState.persist()');await client.send('Page.reload');await waitFor(client,'Boolean(window.GenshinPartyState&&window.GenshinCalcRenderer)');await delay(500);
        await conditionText('party');assert.equal(await evaluate(client,'document.querySelectorAll("[data-party-member-tab]").length'),3);
        assert.equal(await evaluate(client,'document.querySelectorAll("[data-party-member-panel]:not([hidden])").length'),1);
        assert.equal(await evaluate(client,'document.querySelector("[data-genshin-vody-action=phase]").value'),'2');
        progress('PASS four-person party, per-member/source hierarchy, switch isolation, desktop/mobile and reload');
        // A real Hydro recipient exercises the additive bucket instead of unrelated attack zeros.
        await closeDialogs();await chooseCharacter('10000025');await conditionText('party');await action('phase','1');await action('meteor','none');
        const selectedBurst=async()=>{
            await closeDialogs();await evaluate(client,'window.__effectPayload=null;if(!window.__bucketHook){const run=window.GenshinCalcEngine.runGenshinJsonCalc;window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await run(...args);window.__effectPayload=p;return p};window.__bucketHook=true;}document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client,'Boolean(window.__effectPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            const expected=await evaluate(client,'(()=>{const r=window.__effectPayload.results.find(r=>r.entry.damageType==="burst");document.querySelector("[data-json-tab=burst]").click();document.querySelector("[data-attack-key="+CSS.escape(r.attackKey)+"] [data-result-detail-toggle]").click();return {base:r.breakdown.additiveBaseDamage,key:r.attackKey,damage:r.expected};})()');
            const text=await conditionText('party');
            const items=await evaluate(client,'[...document.querySelectorAll("#genshin-party-member-panel-2 .genshin-provider-impact .genshin-runtime-impact")].map(e=>({label:e.querySelector("span").textContent,value:e.querySelector("strong").textContent,reason:e.querySelector("small")?.textContent||""}))');
            const base=items.filter(row=>row.label==="水・氷元素攻撃の基礎ダメージ加算");assert.equal(base.length,1);assert.ok(Math.abs(Number(base[0].value.replace("+",""))-expected.base)<1e-8);assert.ok(expected.base>0);
            assert.doesNotMatch(items.map(row=>row.label+" "+row.value).join(" / "),/(?:通常攻撃|重撃|落下攻撃) \+0/);
            assert.equal(await evaluate(client,'document.querySelectorAll("#genshin-party-member-panel-2 .genshin-party-effect .genshin-effect-values").length'),0);
            return expected;
        };
        const lead=await selectedBurst();await action('recipient','offField');const chorus=await selectedBurst();assert.equal(chorus.base,lead.base);
        await closeDialogs();await evaluate(client,'window.GenshinCurrentCalcState.persist()');await client.send('Page.reload');await waitFor(client,'Boolean(window.GenshinPartyState&&window.GenshinCalcRenderer)');await delay(500);
        const restored=await selectedBurst();assert.equal(restored.base,chorus.base);assert.equal(restored.damage,chorus.damage);
        progress('PASS provider aggregate matches Hydro damage, Lead/Chorus, no attack-zero expansion and reload');


        await evaluate(client,'window.__effectPayload=null;const again=window.GenshinCalcEngine.runGenshinJsonCalc;window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await again(...args);window.__effectPayload=p;return p};');

        await closeDialogs();await evaluate(client,'window.__effectPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
        await waitFor(client,'Boolean(window.__effectPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
        assert.ok(await evaluate(client,'window.__effectPayload.results.some(r=>r.expected>0)'));
        progress('PASS representative original/Runtime display paths and actual damage');
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
            assert.ok(path.basename(target).startsWith("genshin-original-effect-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
