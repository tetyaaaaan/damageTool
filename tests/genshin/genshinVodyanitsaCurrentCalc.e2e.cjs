"use strict";

// Real-browser regression for Vodyanitsa's provisional current-calculation route.
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
const progress = (message) => console.log(`[genshin-vodyanitsa-current-calc-e2e] ${message}`);

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-vodyanitsa-current-"));
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
                window.__vodyanitsaCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);
        await evaluate(client, `(() => {
            const values = {
                genshinReflectCharacter: "ヴォジャニーツァ", genshinCalcCharacterId: "10000140",
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
            await evaluate(client, 'window.__vodyanitsaCurrentPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__vodyanitsaCurrentPayload)&&!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__vodyanitsaCurrentPayload");
        };
        const replay = async () => {
            const exact = await evaluate(client, `(async () => {
                const p=window.__vodyanitsaCurrentPayload;
                const data=await window.GenshinCalcData.loadGenshinCalcData();
                const request=window.GenshinCalcEngine.createCalculationSnapshot(p.calculationRequest,p).request;
                const restored=window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(request)),data);
                return JSON.stringify(restored.results)===JSON.stringify(p.results);
            })()`);
            assert.equal(exact, true, "saved CalculationRequest reproduces Vodyanitsa damage exactly");
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

        const groups = {
            skillHit: "character:10000140:group:vodyanitsa_skill_hit",
            meteorstorm: "character:10000140:group:vodyanitsa_a1_meteorstorm",
            c1: "character:10000140:group:vodyanitsa_c1_heal",
            c2: "character:10000140:group:vodyanitsa_c2_variant",
            c4: "character:10000140:group:vodyanitsa_c4_state",
            song: "character:10000140:group:vodyanitsa_song_state",
            a4: "character:10000140:group:vodyanitsa_a4_state"
        };
        const rowTotal = (payload,id) => {
            const row=entry(payload,id);
            return row.total?.expected ?? row.expected;
        };
        const openConditions = async () => {
            if (!await evaluate(client,'document.getElementById("genshinConditionDialog")?.open===true')) {
                if (await evaluate(client,'document.getElementById("genshinPartyDialog")?.open===true')) {
                    await evaluate(client,'document.getElementById("genshinPartyDialog").close()');
                }
                await evaluate(client,'document.getElementById("genshinConditionDialogOpen").click()');
                await waitFor(client,'document.getElementById("genshinConditionDialog")?.open===true');
            }
        };
        const resultSignature = payload => payload.results.map(row=>[row.entry.id,row.total?.expected??row.expected]);

        let own=await calculate();
        assert.equal(own.calculationRequest.characterId,"10000140","Vodyanitsa is the active character");
        assert.equal(own.calculationRequest.constellation,6,"C6 reaches the real request");
        await openConditions();
        for(const [key,value] of [[groups.skillHit,"active"],[groups.meteorstorm,"active"],[groups.c1,"active"],[groups.c2,"voice"],[groups.song,"inactive"]]) await setState(key,"option",value);
        await setState(groups.c4,"stack",0);
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        own=await calculate();
        const baseHp=own.context.effectiveStats.hp;
        const baseSkill=rowTotal(own,"provisional71_10000140_skill_initial");

        await openConditions();
        await setState(groups.c4,"stack",3);
        await setState(groups.song,"option","active");
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const ownActive=await calculate();
        assert.equal(ownActive.calculationRequest.uiState.conditionByModifier?.[groups.c4]?.stack,3,"C4 stack is serialized from its visible control");
        assert.equal(ownActive.calculationRequest.uiState.conditionByModifier?.[groups.song]?.option,"active","Song of Ages is serialized from its visible control");
        assert.ok(ownActive.context.effectiveStats.hp>baseHp,"C4 stacks increase effective HP");
        assert.ok(rowTotal(ownActive,"provisional71_10000140_skill_initial")>baseSkill,"effective HP increases actual HP-scaling Skill damage");
        const c1SelfStat=ownActive.statTrace.find(item=>item.modifierId==="provisional71_10000140_c1_team_atk_from_hp");
        assert.ok(c1SelfStat?.value>0,"C1 provider HP contributes flat ATK in the calculation stat trace");
        const burstSong=entry(ownActive,"provisional71_10000140_burst_song");
        assert.equal(burstSong.breakdown.baseTalentDamageMultiplier,1.864,"Song multiplies the talent base separately");
        assert.ok(rowTotal(ownActive,"provisional71_10000140_burst_song")>0,"confirmed Song Burst is calculated");
        assert.equal(burstSong.problems.length,0);
        assert.equal(entry(ownActive,"provisional71_10000140_skill_initial").breakdown.resistance,-20,"Skill-hit state reduces Hydro resistance by 30 points");
        await replay();
        await openConditions();
        await setState(groups.song,"option","inactive");
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const songOff=await calculate();
        assert.equal(entry(songOff,"provisional71_10000140_burst_initial").breakdown.baseTalentDamageMultiplier,1,"Song OFF keeps the original talent base");
        const offBurst=entry(songOff,"provisional71_10000140_burst_initial");
        await openConditions();
        await setState(groups.song,"option","active");
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const songOn=await calculate();
        const onBurst=entry(songOn,"provisional71_10000140_burst_song");
        const bonusRatio=(1+onBurst.breakdown.damageBonus/100)/(1+offBurst.breakdown.damageBonus/100);
        assert.ok(Math.abs(onBurst.expected/offBurst.expected-1.864*bonusRatio)<1e-9,"Song multiplier remains separate from the C6 Hydro DMG Bonus");
        await openConditions();
        await setState(groups.c4,"stack",0);
        await setState(groups.a4,"option","leadTalent");
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        await input("genshinHpInput",50000);
        const agreed=await calculate();
        const ordinary=entry(agreed,"provisional71_10000140_normal_1");
        assert.ok(ordinary,"normal attack entry exists");
        assert.equal(ordinary.breakdown.additiveBaseDamage,1400,"A4 adds the agreed base damage");
        assert.ok(ordinary.expected>0);
        await input("genshinHpInput",50500);
        const pending=await calculate();
        const pendingRow=entry(pending,ordinary.entry.id);
        assert.ok(pendingRow.expected>ordinary.expected,"continuous A4 raises real damage at intermediate HP");
        assert.equal(pendingRow.breakdown.additiveBaseDamage,1470,"provisional continuous A4 at HP50500");
        const pendingText=await evaluate(client,'document.body.innerText');
        assert.match(pendingText,/暫定仕様/,"provisional A4 has a concise user-facing explanation");
        assert.doesNotMatch(pendingText,/externalConfirmationRequired|deferredUnknown/,"internal pending enums stay hidden");
        await replay();
        const ownSnapshot=resultSignature(pending);
        await evaluate(client,"location.reload()");
        await waitFor(client,"Boolean(window.GenshinCalcEngine&&window.GenshinCalcData)");
        await waitFor(client,'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width>0');
        await evaluate(client,'(()=>{const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__vodyanitsaCurrentPayload=p;return p;};return true;})()');
        await waitFor(client,'document.getElementById("genshinCalcCharacterId")?.value==="10000140"&&document.getElementById("genshinReflectConstellation")?.value==="C6"');
        await openConditions();
        const c4Selector='[data-genshin-condition-key="'+groups.c4+'"]';
        const songSelector='[data-genshin-condition-key="'+groups.song+'"]';
        assert.equal(await evaluate(client,'document.querySelector('+JSON.stringify(c4Selector)+')?.value'),"0","reload restores C4");
        assert.equal(await evaluate(client,'document.querySelector('+JSON.stringify(songSelector)+')?.value'),"active","reload restores Song state");
        await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const ownReload=await calculate();
        assert.deepEqual(resultSignature(ownReload),ownSnapshot,"reload preserves actual and pending damage");
        await replay();
        assert.equal(ownReload.context.effectiveStats.hp,50500,"reload restores provider HP");
        assert.equal(entry(ownReload,ordinary.entry.id).breakdown.additiveBaseDamage,1470,"reload keeps continuous A4");
        await evaluate(client,'document.querySelector("[data-selection-target=genshinWeaponInput]").click()');
        await waitFor(client,'Boolean(document.querySelector("[data-selection-id=\\"14524\\"]"))');
        await evaluate(client,'document.querySelector("[data-selection-id=\\"14524\\"]").click()');
        await input("genshinWeaponRefinement","R1");await input("genshinHpInput",50500);
        await openConditions();await evaluate(client,'document.querySelector("[data-condition-tab=weapon]").click()');
        const hymnKey="weapon:14524:group:provisional71_w14524_mead_state";
        await setState(hymnKey,"option","inactive");await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const hymnOff=await calculate();
        await openConditions();await setState(hymnKey,"option","boostedThree");await evaluate(client,'document.getElementById("genshinConditionDialog").close()');
        const hymnOn=await calculate();
        assert.ok(hymnOn.context.effectiveStats.atk>hymnOff.context.effectiveStats.atk,"Hymn major party ATK effect is applied to the on-fielder");
        const rankPercent=Math.min((hymnOn.context.effectiveStats.hp-40000)/1000*.4,8)*3*1.75;
        const atkTransfer=hymnOn.statTrace.find(t=>t.modifierId==="provisional71_w14524_atk_pending");
        assert.ok(atkTransfer);assert.ok(Math.abs(atkTransfer.value-hymnOff.calculationRequest.stats.baseAtk*rankPercent/100)<1e-7,"Hymn transfer is separate from C1 HP-derived ATK");
        const atkTrace=hymnOn.statTrace.filter(t=>t.stat==="atk").reduce((sum,t)=>sum+t.value,0);
        assert.ok(Math.abs(hymnOn.context.effectiveStats.atk-hymnOn.calculationRequest.stats.atk-atkTrace)<1e-7);
        const combined=entry(hymnOn,ordinary.entry.id);
        assert.equal(combined.problems.length,0);assert.ok(combined.expected>0);
        assert.ok(Math.abs(combined.breakdown.additiveBaseDamage-Math.min(Math.max(0,hymnOn.context.effectiveStats.hp-40000)/1000*140,3500))<1e-7);
        const visible=await evaluate(client,'document.body.innerText');
        assert.doesNotMatch(visible,/weaponModifiers\.|provisional71_|stellarSwirl|externalSpecPending|data\/v2\//);
        assert.match(visible,/暫定仕様/);
        await replay();const combinedSignature=resultSignature(hymnOn);
        await evaluate(client,'location.reload()');await waitFor(client,'document.getElementById("genshinCalcWeaponId")?.value==="14524"');
        await evaluate(client,'(()=>{const original=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const p=await original(...args);window.__vodyanitsaCurrentPayload=p;return p;};})()');
        const combinedReload=await calculate();assert.deepEqual(resultSignature(combinedReload),combinedSignature);await replay();
        progress("PASS Vodyanitsa + Hymn major provisional effects, continuous A4, premod party ATK, UI key isolation, reload and Request replay");
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
            assert.ok(path.basename(target).startsWith("genshin-vodyanitsa-current-"), "cleanup targets only this test's owned profile");
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Browser may still hold profile files briefly after close. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
