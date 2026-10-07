"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9241);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const artifact = (itemId, setId, equipType) => ({
    itemId,
    reliquary: { level: 20 },
    flat: { itemType: "ITEM_RELIQUARY", setId, equipType, rankLevel: 5 }
});

const weapon = (itemId) => ({
    itemId,
    weapon: { level: 90, affixMap: { [itemId]: 0 } },
    flat: { itemType: "ITEM_WEAPON", rankLevel: 5, weaponType: "WEAPON_SWORD_ONE_HAND" }
});

const avatar = (avatarId, skillDepotId, weaponId, setId, index) => ({
    avatarId,
    skillDepotId,
    propMap: { 4001: { val: 90 } },
    fightPropMap: {
        1: 10000, 4: 900, 7: 600, 2000: 18000, 2001: 1800, 2002: 1200,
        28: 100, 20: 0.5, 22: 1, 23: 1.2, 40: 0.466
    },
    skillLevelMap: { combat1: 10, combat2: 10, combat3: 10 },
    talentIdList: [],
    equipList: [
        weapon(weaponId),
        artifact(`8${index}001`, setId, "EQUIP_BRACER"),
        artifact(`8${index}002`, setId, "EQUIP_DRESS")
    ]
});

const profileFixture = {
    playerInfo: { uid: "800000000", nickname: "Image fixture", level: 60, worldLevel: 8 },
    ttl: 0,
    avatarInfoList: [
        { ...avatar("10000140", "14001", "14524", "15047", 1), skillLevelMap: { "11401": 9, "11402": 8, "11405": 7 }, proudSkillExtraLevelMap: { "14039": 3 } },
        { ...avatar("10000143", "14301", "11522", "15048", 2), skillLevelMap: { "11431": 10, "11432": 10, "11435": 10 } },
        avatar("10000150", "", "11520", "15042", 3),
        avatar("10000148", "", "11436", "15042", 4),
        avatar("10000005", "505", "11501", "15042", 5),
        avatar("10000007", "705", "11502", "15042", 6),
        avatar("10000150", "", "11437", "15047", 7),
        { ...avatar("10000148", "", "11436", "15042", 8), skillLevelMap: { unmappedNormal: 9, unmappedSkill: 8, unmappedBurst: 7 } }
    ]
};

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
    const listeners = new Map();
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            const item = pending.get(message.id); pending.delete(message.id);
            if (message.error) item.reject(new Error(message.error.message));
            else item.resolve(message.result);
        } else if (message.method) {
            for (const listener of listeners.get(message.method) || []) listener(message.params);
        }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++; pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    const on = (method, listener) => listeners.set(method, [...(listeners.get(method) || []), listener]);
    await send("Runtime.enable"); await send("Page.enable");
    return { socket, send, on };
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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-uid-assets-"));
        browser = spawn(browserPath, [
            "--headless=new", "--disable-gpu", "--window-size=1280,900", "--no-first-run",
            "--no-default-browser-check", `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profileDir}`, baseUrl
        ], { stdio: "ignore", windowsHide: true });
        const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
        const page = targets.find((target) => target.type === "page" && target.url.includes("/games/genshin/"));
        assert.ok(page, "Genshin page target was not created");
        client = await connectCdp(page.webSocketDebuggerUrl);
        await client.send("Fetch.enable", { patterns: [{ urlPattern: "*://*/games/api/genshin-profile*", requestStage: "Request" }] });
        client.on("Fetch.requestPaused", async (event) => {
            try {
                if (!event.request.url.includes("/games/api/genshin-profile?uid=800000000")) {
                    await client.send("Fetch.continueRequest", { requestId: event.requestId });
                    return;
                }
                await client.send("Fetch.fulfillRequest", {
                    requestId: event.requestId,
                    responseCode: 200,
                    responseHeaders: [{ name: "Content-Type", value: "application/json; charset=utf-8" }],
                    body: Buffer.from(JSON.stringify(profileFixture)).toString("base64")
                });
            } catch (error) { console.error("UID fixture interception failed", error); }
        });
        await waitFor(client, "Boolean(window.GenshinIdResolver && window.GenshinProfileMapper && window.GenshinProfileApi)");
        await evaluate(client, 'window.GenshinCurrentCalcState.ready.then(()=>true)');
        await waitFor(client, 'document.getElementById("genshinUidSearchButton")?.getBoundingClientRect().width > 0');
        await evaluate(client, `(() => {
            const run=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const payload=await run(...args);window.__uidAssetCalcPayload=payload;return payload;};
        })()`);

        await evaluate(client, `(() => {
            const input=document.getElementById("genshinUidInput");input.value="800000000";
            document.getElementById("genshinUidSearchButton").click();return true;
        })()`);
        await waitFor(client, 'document.querySelectorAll(".genshin-uid-character-image").length === 1');
        await waitFor(client, 'document.querySelector(".genshin-uid-character-image")?.complete === true');
        await waitFor(client, 'document.getElementById("genshinUidMessage")?.dataset.type === "success"');

        const cases = [
            { index: 0, id: "10000140", name: "ヴォジャニーツァ", character: "10000140", weapon: "14524", artifact: "15047" },
            { index: 1, id: "10000143", name: "ヴェスナ", character: "10000143", weapon: "11522", artifact: "15048" },
            { index: 2, id: "10000150", name: "オデット", character: "10000150", weapon: "11520", artifact: "15042" },
            { index: 3, id: "10000148", name: "アリョーシャ", character: "10000148", weapon: "11436", artifact: "15042" },
            { index: 4, id: "10000005_cryo", name: "旅人", character: "10000005", weapon: "11501", artifact: "15042" },
            { index: 5, id: "10000007_cryo", name: "旅人", character: "10000007", weapon: "11502", artifact: "15042" },
            { index: 6, id: "10000150", name: "オデット", character: "10000150", weapon: "11437", artifact: "15047" }
        ];
        for (const item of cases) {
            await evaluate(client, `(() => {const s=document.getElementById("genshinProfileCharacterSelect");s.value=${JSON.stringify(String(item.index))};s.dispatchEvent(new Event("change",{bubbles:true}));})()`);
            await waitFor(client, `document.querySelector(".genshin-uid-character-copy strong")?.textContent.includes(${JSON.stringify(item.name)})`);
            await waitFor(client, '(() => {const imgs=[...document.querySelectorAll("#genshinCharacterDetail .genshin-uid-character-image,#genshinCharacterDetail .genshin-uid-summary-image")];return imgs.length>=2&&imgs.every(i=>i.complete&&i.naturalWidth>0)})()');
            const imageState = await evaluate(client, `(() => {
                const root=document.getElementById("genshinCharacterDetail");
                const imgs=[...root.querySelectorAll(".genshin-uid-character-image,.genshin-uid-summary-image")];
                return imgs.map(i=>({src:new URL(i.currentSrc||i.src,location.href).pathname,complete:i.complete,width:i.naturalWidth,height:i.naturalHeight}));
            })()`);
            assert.ok(imageState.length >= 2, `${item.name} renders character and weapon image`);
            assert.equal(imageState[0].src, `/games/images/genshin/characters/${item.character}.webp`);
            assert.ok(imageState.every((image) => image.complete && image.width > 0 && image.height > 0), `${item.name} images loaded: ${JSON.stringify(imageState)}`);
            assert.ok(imageState.every((image) => !image.src.endsWith("/fallback.webp")), `${item.name} does not fall back: ${JSON.stringify(imageState)}`);
            assert.ok(imageState.some((image) => image.src === `/games/images/genshin/weapons/${item.weapon}.webp`), `${item.name} has its weapon image`);
            assert.ok(imageState.some((image) => image.src === `/games/images/genshin/artifacts/${item.artifact}.webp`), `${item.name} has its artifact image`);

            await evaluate(client, 'document.getElementById("genshinApplyProfileButton").click()');
            await waitFor(client, `document.getElementById("genshinCalcCharacterId")?.value===${JSON.stringify(item.id)}`);
            await waitFor(client, `document.getElementById("genshinCalcWeaponId")?.value===${JSON.stringify(item.weapon)}`);
            await evaluate(client, "window.__uidAssetCalcPayload=null");
            await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            await waitFor(client, "Boolean(window.__uidAssetCalcPayload)");
            const calculation = await evaluate(client, `(() => {
                const payload=window.__uidAssetCalcPayload;
                return {characterId:payload.calculationRequest?.calculationInput?.character?.id||payload.calculationRequest?.character?.id||payload.context?.characterId||"",results:(payload.results||[]).map(r=>Number(r.total?.expected??r.expected??0))};
            })()`);
            assert.equal(calculation.characterId, item.id, `${item.name} calculation uses selected UID identity`);
            assert.ok(calculation.results.length > 0 && calculation.results.some((value) => value > 0), `${item.name} produces a nonzero calculated hit`);
            if (item.index === 0) {
                const levels = await evaluate(client, 'window.__uidAssetCalcPayload.calculationRequest.talentLevels');
                assert.deepEqual(levels, { normal: 9, skill: 8, burst: 10 });
                assert.equal(await evaluate(client, 'document.getElementById("genshinBurstTalentLevel").value'), "10");
                assert.doesNotMatch(await evaluate(client, 'document.getElementById("genshinCharacterDetail").innerText'), /Lv1として|天賦Lvを取得できません/);
                const baseHit = await evaluate(client, 'window.__uidAssetCalcPayload.results.find(r=>r.entry.attackType==="burst").expected');
                await evaluate(client, '(() => {const field=document.getElementById("genshinBurstTalentLevel");field.value="11";field.dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("genshinJsonCalcButtonBottom").click()})()');
                await waitFor(client, 'window.__uidAssetCalcPayload.calculationRequest.talentLevels.burst===11');
                assert.ok(await evaluate(client, `window.__uidAssetCalcPayload.results.find(r=>r.entry.attackType==="burst").expected>${baseHit}`));
                await evaluate(client, 'window.GenshinCurrentCalcState.persist()');
                const stored = await evaluate(client, 'JSON.parse(localStorage.getItem(window.GenshinCurrentCalcState.STORAGE_KEY))?.state.request');
                assert.equal(stored?.talentLevels.burst, 11);
                await client.send("Page.reload", { ignoreCache: true });
                await waitFor(client, 'Boolean(window.GenshinCurrentCalcState)');
                await evaluate(client, 'window.GenshinCurrentCalcState.ready.then(()=>true)');
                assert.equal(await evaluate(client, 'document.getElementById("genshinBurstTalentLevel").value'), "11");
                await evaluate(client, 'document.getElementById("genshinReflectCharacter").click()');
                await waitFor(client, 'document.getElementById("genshinSelectionDialog").open');
                const ordered = await evaluate(client, '[...document.querySelectorAll("#genshinSelectionList [data-selection-id]")].map(e=>e.dataset.selectionId)');
                assert.deepEqual(ordered.slice(-6), ["10000148","10000150","10000143","10000140","10000005_cryo","10000007_cryo"]);
                assert.doesNotMatch(await evaluate(client, 'document.getElementById("genshinSelectionList").innerText'), /検証中|暫定仕様/);
                await evaluate(client, 'document.querySelector(\'#genshinSelectionList [data-selection-id="10000143"]\').click()');
                assert.equal(await evaluate(client, 'document.getElementById("genshinBurstTalentLevel").value'), "10", "character change clears the previous talent level");
                await evaluate(client, `(() => {const input=document.getElementById("genshinUidInput");input.value="800000000";document.getElementById("genshinUidSearchButton").click()})()`);
                await waitFor(client, 'document.getElementById("genshinUidMessage").dataset.type==="success"');
                await evaluate(client, `(() => {const run=window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);window.GenshinCalcEngine.runGenshinJsonCalc=async(...args)=>{const payload=await run(...args);window.__uidAssetCalcPayload=payload;return payload;}})()`);
            }
            if (item.id.endsWith("_cryo")) {
                await evaluate(client, 'document.getElementById("genshinReflectCharacter").click()');
                await waitFor(client, 'document.getElementById("genshinSelectionDialog")?.open === true');
                await evaluate(client, `(() => {const e=document.getElementById("genshinSelectionSearch");e.value="旅人";e.dispatchEvent(new Event("input",{bubbles:true}));})()`);
                await waitFor(client, `Boolean(document.querySelector('#genshinSelectionList [data-selection-id="${item.id}"] img'))`);
                await waitFor(client, `(() => {const i=document.querySelector('#genshinSelectionList [data-selection-id="${item.id}"] img');return i?.complete&&i.naturalWidth>0})()`);
                const manualImage = await evaluate(client, `(() => {const i=document.querySelector('#genshinSelectionList [data-selection-id="${item.id}"] img');return new URL(i.currentSrc||i.src,location.href).pathname})()`);
                assert.equal(manualImage, `/games/images/genshin/characters/${item.character}.webp`);
                await evaluate(client, `document.querySelector('#genshinSelectionList [data-selection-id="${item.id}"]').click()`);
                await waitFor(client, `document.getElementById("genshinCalcCharacterId")?.value===${JSON.stringify(item.id)}`);
            }
        }

        const applied = await evaluate(client, `(() => ({
            charId:document.getElementById("genshinCalcCharacterId").value,
            weaponId:document.getElementById("genshinCalcWeaponId").value,
            message:document.getElementById("genshinUidMessage").innerText
        }))()`);
        assert.equal(applied.charId, "10000150");
        assert.equal(applied.weaponId, "11437");
        await evaluate(client, '(() => {const select=document.getElementById("genshinProfileCharacterSelect");select.value="7";select.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("genshinApplyProfileButton").click();window.__uidAssetCalcPayload=null;document.getElementById("genshinJsonCalcButtonBottom").click();})()');
        assert.equal(await evaluate(client, 'document.getElementById("genshinBurstTalentLevel").value'), "", "unknown UID talent IDs require manual input");
        assert.equal(await evaluate(client, 'window.__uidAssetCalcPayload'), null, "unknown talents do not silently calculate at level 1");
        assert.match(await evaluate(client, 'document.getElementById("genshinUidMessage").innerText'), /天賦Lvを取得できませんでした。手動で設定してください/);
        await evaluate(client, '(() => {["Normal","Skill","Burst"].forEach((kind,index)=>{const field=document.getElementById(`genshin${kind}TalentLevel`);field.value=String(9-index);field.dispatchEvent(new Event("input",{bubbles:true}));});document.getElementById("genshinJsonCalcButtonBottom").click();})()');
        await waitFor(client, "Boolean(window.__uidAssetCalcPayload)");
        assert.deepEqual(await evaluate(client, "window.__uidAssetCalcPayload.calculationRequest.talentLevels"), { normal: 9, skill: 8, burst: 7 });
        console.log("[genshin-uid-assets-e2e] PASS UID fixture -> resolver paths -> browser-loaded 7.0/7.1 images -> selected calculator identity");
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
            assert.equal(path.dirname(target), path.resolve(os.tmpdir()));
            assert.ok(path.basename(target).startsWith("genshin-uid-assets-"));
            try { fs.rmSync(target, { recursive: true, force: true }); } catch { /* Owned browser profile may remain locked briefly. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
