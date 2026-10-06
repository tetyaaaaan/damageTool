"use strict";

// Existing 7.0 artifact conditions on confirmed 7.1 Stellar routes,
// including a provider-owned C6 multiplier and persisted UI state.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9236);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin71-stellar-compat-"));
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
        const capture = async () => evaluate(client, `(() => {
            const original = window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
            window.GenshinCalcEngine.runGenshinJsonCalc = async (...args) => {
                const payload = await original(...args);
                window.__genshin70ArtifactPayload = payload;
                return payload;
            };
            return true;
        })()`);

        await capture();

        const setupCharacter = async ({ id, name, atk = 2200, critRate = 50, reaction }) => {
            await evaluate(client, `(() => {
                const values = {
                    genshinReflectCharacter: ${JSON.stringify(name)},
                    genshinCalcCharacterId: ${JSON.stringify(id)},
                    genshinWeaponInput: "", genshinCalcWeaponId: "",
                    genshinReflectConstellation: "C0", genshinReflectLevel: 90, genshinAtkInput: ${JSON.stringify(atk)},
                    genshinDefInput: 1000, genshinHpInput: 20000,
                    genshinCritRateInput: ${JSON.stringify(critRate)},
                    genshinCritDamageInput: 100,
                    genshinNormalTalentLevel: 10, genshinSkillTalentLevel: 10, genshinBurstTalentLevel: 10,
                    genshinJsonReactionOption: ${JSON.stringify(reaction)}
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
            await delay(120);
        };

        const setArtifact = async (id, name) => {
            await evaluate(client, `(() => {
                const mode = document.getElementById("genshinArtifactSetMode");
                mode.value = "4pc";
                mode.dispatchEvent(new Event("input", { bubbles: true }));
                mode.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await delay(100);
            await evaluate(client, 'document.querySelector("#genshinArtifactSetOneTrigger").click()');
            await waitFor(client, 'document.getElementById("genshinSelectionDialog")?.open === true');
            await evaluate(client, `(() => {
                const search = document.getElementById("genshinSelectionSearch");
                search.value = ${JSON.stringify(name)};
                search.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `Boolean(document.querySelector('#genshinSelectionList [data-selection-id="${id}"]'))`);
            await evaluate(client, `document.querySelector('#genshinSelectionList [data-selection-id="${id}"]').click()`);
            await waitFor(client, `document.getElementById("genshinArtifactSetOne").value === ${JSON.stringify(id)}`);
            await evaluate(client, 'document.getElementById("genshinJsonPrepareConditionsButton").click()');
            await waitFor(client, `Boolean(document.querySelector('[data-artifact-set="${id}"][data-artifact-piece="4"] input[data-gensin-toggle-key], [data-artifact-set="${id}"][data-artifact-piece="4"] input[data-genshin-toggle-key]'))`);
        };

        const setArtifactEnabled = async (id, enabled) => {
            await evaluate(client, `(() => {
                const input = document.querySelector('[data-artifact-set="${id}"][data-artifact-piece="4"] input[data-genshin-toggle-key]');
                if (!input) throw new Error("missing artifact condition toggle for ${id}");
                if (input.checked !== ${JSON.stringify(enabled)}) input.click();
                return input.checked;
            })()`);
            await delay(150);
        };

        const calculate = async () => {
            await evaluate(client, "window.__genshin70ArtifactPayload = null");
            await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
            await waitFor(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0');
            return evaluate(client, `(() => {
                const payload = window.__genshin70ArtifactPayload;
                if (!payload) throw new Error("calculate button did not produce a payload");
                return {
                    text: document.getElementById("genshinJsonCalcResults").innerText,
                    critRate: payload.context.effectiveStats.critRate,
                    states: Object.entries(payload.calculationRequest?.uiState?.conditionByModifier || {}),
                    results: payload.results.map((item) => ({
                        reaction: item.entry?.directReactionId || "",
                        expected: Number(item.total?.expected ?? item.expected ?? 0),
                        nonCrit: Number(item.total?.nonCrit ?? item.nonCrit ?? 0),
                        entryId: item.entry?.id || "",
                        critRate: Number(item.breakdown?.critRate ?? 0),
                        reactionBonus: Number(item.breakdown?.reactionBonus ?? 0),
                        statBonus: item.breakdown?.statBonus || {}
                    })),
                    artifactIds: [...(payload.candidateModifiers || []), ...(payload.partyModifiers || [])]
                        .filter((item) => String(item.modifier?.artifactSetId || "").startsWith("150"))
                        .map((item) => item.modifier.id)
                };
            })()`);
        };

        for (const [id, name, entryId] of [
            ["10000133", "サンドローネ", "charged_beam_swirl"],
            ["10000143", "ヴェスナ", "provisional71_10000143_skill_spirit_blade_rank2_stellarSwirl"]
        ]) {
            await setupCharacter({ id, name, reaction: "stellarSwirl" });
            await setArtifact("15047", "紅血の証");
            if (id === "10000143") {
                const selector='[data-genshin-condition-key="character:10000143:group:vesna_radiance"]';
                await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
                await evaluate(client, `(() => {const e=document.querySelector(${JSON.stringify(selector)}); e.value="stellarSwirl";e.dispatchEvent(new Event("change",{bubbles:true}));})()`);
            }
            await setArtifactEnabled("15047", false); const off=await calculate();
            await setArtifactEnabled("15047", true); const on=await calculate();
            const a=off.results.find(r=>r.entryId===entryId), b=on.results.find(r=>r.entryId===entryId);
            assert.ok(a && b, `${name} confirmed direct Swirl exists`);
            assert.ok(Math.abs(b.critRate-a.critRate-16)<1e-9);
            assert.ok(Math.abs(b.reactionBonus-a.reactionBonus-40)<1e-9);
            assert.ok(b.expected>a.expected);
            await delay(350);
            await client.send("Page.reload");
            await waitFor(client, 'Boolean(window.GenshinCalcEngine && document.getElementById("genshinJsonCalcButtonBottom"))');
            await waitFor(client, `document.getElementById("genshinCalcCharacterId")?.value===${JSON.stringify(id)}`);
            await capture(); const restored=await calculate();
            assert.deepEqual(restored.results,on.results, `${name} reload preserves actual damage`);
            assert.ok(!/\b(?:stellarSwirl|stellarConduct|anemo|cryo)\b/.test(restored.text), "no raw enums in visible results");
        }
        await setArtifact("15048", "炉炎溶錬の心");
        await setArtifactEnabled("15048", false); const off=await calculate();
        await setArtifactEnabled("15048", true); const on=await calculate();
        const entryId="provisional71_10000143_skill_spirit_blade_rank2_stellarSwirl";
        const a=off.results.find(r=>r.entryId===entryId),b=on.results.find(r=>r.entryId===entryId);
        assert.ok(Math.abs(b.reactionBonus-a.reactionBonus-50)<1e-9);
        assert.ok(b.expected>a.expected);
        await evaluate(client, 'document.getElementById("genshinPartyDialogOpen").click()');
        await waitFor(client, 'document.getElementById("genshinPartyDialog").open');
        await evaluate(client, 'document.getElementById("genshinPartyCharacterTrigger2").click()');
        await waitFor(client, 'Boolean(document.querySelector(\'[data-selection-id="10000140"]\'))');
        await evaluate(client, 'document.querySelector(\'[data-selection-id="10000140"]\').click()');
        await delay(200);
        await evaluate(client, `(() => {
            for (const [id,value] of [["genshinPartyConstellation2",6],["genshinPartyHp2",50000]]) {
                const e=document.getElementById(id);e.value=String(value);
                e.dispatchEvent(new Event("input",{bubbles:true}));e.dispatchEvent(new Event("change",{bubbles:true}));
            }
            document.getElementById("genshinPartyDialog").close();
            document.getElementById("genshinJsonPrepareConditionsButton").click();
        })()`);
        await delay(250);
        const setSong = async value => {
            await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
            await evaluate(client, 'document.querySelector("[data-condition-tab=party]").click()');
            const selector='[data-genshin-party-condition-key="party:2:10000140:group:vodyanitsa_song_state"]';
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event("change",{bubbles:true}));document.getElementById("genshinConditionDialog").close();})()`);
            await delay(200);
        };
        await setSong("inactive"); const partyOff=await calculate();
        await setSong("active"); const partyOn=await calculate();
        const x=partyOff.results.find(r=>r.entryId===entryId),y=partyOn.results.find(r=>r.entryId===entryId);
        assert.ok(Math.abs(y.expected/x.expected-1.25)<1e-9, "provider C6 elevates recipient Swirl independently");
        await delay(350); await client.send("Page.reload");
        await waitFor(client, 'Boolean(window.GenshinCalcEngine && document.getElementById("genshinJsonCalcButtonBottom"))');
        await waitFor(client, 'document.getElementById("genshinPartyCharacter2")?.value==="10000140"');
        await capture(); const partyReload=await calculate();
        assert.deepEqual(partyReload.results,partyOn.results,"provider C6 and artifact conditions survive reload");
        console.log("[genshin71-stellar-compat-e2e] PASS Cryo/Anemo Swirl 15047 CR/+40; 15048 +50; Vodyanitsa party C6 x1.25; reload and UI enums");
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
            const target=path.resolve(profileDir);
            assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
            assert.ok(path.basename(target).startsWith("genshin71-stellar-compat-"));
            try { fs.rmSync(target,{recursive:true,force:true}); } catch { /* Owned browser profile may remain locked briefly. */ }
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
