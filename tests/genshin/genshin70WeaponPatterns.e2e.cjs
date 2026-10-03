"use strict";

// Representative real-browser coverage for the 7.0 provisional weapon condition
// patterns. This intentionally keeps the small CDP harness local to the test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9224);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (error) { lastError = error; }
        await delay(100);
    }
    throw lastError || new Error(`timed out waiting for ${url}`);
}

async function waitForHttp(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
        } catch (error) { lastError = error; }
        await delay(100);
    }
    throw lastError || new Error(`timed out waiting for ${url}`);
}

async function closeBrowser(port) {
    try {
        const version = await waitForJson(`http://127.0.0.1:${port}/json/version`, 1000);
        const socket = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
            socket.addEventListener("open", resolve, { once: true });
            socket.addEventListener("error", reject, { once: true });
        });
        socket.send(JSON.stringify({ id: 1, method: "Browser.close" }));
        await Promise.race([delay(250), new Promise((resolve) => socket.addEventListener("close", resolve, { once: true }))]);
        socket.close();
    } catch { /* The browser may already have exited. */ }
}

async function assertDebugPortFree(port) {
    try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
        if (response.ok) throw new Error(`debug port ${port} already has a browser; refusing to connect to or close it`);
    } catch (error) {
        if (error.message.includes("already has a browser")) throw error;
    }
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
        const item = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message));
        else item.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    return { socket, send };
}

async function evaluate(client, expression) {
    const result = await client.send("Runtime.evaluate", {
        expression, awaitPromise: true, returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
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
    try {
        const response = await fetch(new URL("/games/genshin/", baseUrl), { signal: AbortSignal.timeout(1000) }).catch(() => null);
        if (!response?.ok) {
            serverProcess = spawn(process.execPath, [path.join(root, "local-server.cjs")], {
                cwd: root, env: { ...process.env, PORT: "4173" }, stdio: "ignore", windowsHide: true
            });
            await waitForHttp(new URL("/games/genshin/", baseUrl).toString());
        }

        await assertDebugPortFree(debugPort);
        const tempRoot = path.resolve(os.tmpdir());
        const profileDir = fs.mkdtempSync(path.join(tempRoot, "genshin70-weapons-"));
        const browser = spawn(browserPath, [
            "--headless=new", "--disable-gpu", "--window-size=1280,900", "--no-first-run",
            "--no-default-browser-check", `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${profileDir}`, baseUrl
        ], { stdio: "ignore", windowsHide: true });
        let client;
        try {
            const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
            const page = targets.find((target) => target.type === "page" && target.url.includes("/games/genshin/"));
            assert.ok(page, "Genshin page target was not created");
            client = await connectCdp(page.webSocketDebuggerUrl);
            await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcConditions && window.GenshinBaseStats && window.GenshinCalcData)");
            await waitFor(client, 'document.getElementById("genshinWeaponLevel")?.getBoundingClientRect().width > 0');
            await evaluate(client, `(() => {
                const original = window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
                window.GenshinCalcEngine.runGenshinJsonCalc = async (...args) => {
                    const payload = await original(...args);
                    window.__genshin70WeaponButtonPayload = payload;
                    return payload;
                };
                return true;
            })()`);

            const setup = async ({ characterId = "10000023", weaponId, reactionOptionKey = "none" } = {}) => {
                await evaluate(client, `(() => {
                    const characterName = window.GenshinIdResolver.listCharacters()
                        .find((item) => String(item.id) === ${JSON.stringify(characterId)})?.nameJa || "旅人";
                    const weaponName = window.GenshinIdResolver.listWeapons()
                        .find((item) => String(item.id) === ${JSON.stringify(weaponId)})?.nameJa || "";
                    const values = {
                        genshinReflectCharacter: characterName, genshinCalcCharacterId: ${JSON.stringify(characterId)},
                        genshinWeaponInput: weaponName, genshinCalcWeaponId: ${JSON.stringify(weaponId)},
                        genshinWeaponLevel: 80, genshinReflectLevel: 90, genshinAtkInput: 2200,
                        genshinDefInput: 1000, genshinHpInput: 20000, genshinCritRateInput: 75,
                        genshinCritDamageInput: 80, genshinNormalTalentLevel: 10,
                        genshinSkillTalentLevel: 10, genshinBurstTalentLevel: 10,
                        genshinJsonReactionOption: ${JSON.stringify(reactionOptionKey)}
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
                await evaluate(client, `document.getElementById("genshinConditionDialogOpen").click()`);
                await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
                await delay(100);
            };

            const changeControl = async (selector, value, { checked } = {}) => {
                await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
                return evaluate(client, `(() => {
                    const control = document.querySelector(${JSON.stringify(selector)});
                    if (${checked === undefined ? "false" : "true"}) control.checked = ${checked === true ? "true" : "false"};
                    else control.value = String(${JSON.stringify(value)});
                    control.dispatchEvent(new Event("input", { bubbles: true }));
                    control.dispatchEvent(new Event("change", { bubbles: true }));
                    return { value: control.value, checked: control.checked };
                })()`);
            };

            const calculate = async () => {
                await evaluate(client, 'document.getElementById("genshinConditionDialogClose").click()');
                await evaluate(client, "window.__genshin70WeaponButtonPayload = null");
                await evaluate(client, 'document.getElementById("genshinJsonCalcButtonBottom").click()');
                await waitFor(client, '!document.getElementById("genshinJsonCalcButtonBottom").disabled');
                await waitFor(client, 'document.getElementById("genshinJsonCalcResults")?.innerText.trim().length > 0');
                return evaluate(client, `(async () => {
                    const payload = window.__genshin70WeaponButtonPayload;
                    if (!payload) throw new Error("calculate button did not produce a payload");
                    return {
                        text: document.getElementById("genshinJsonCalcResults").innerText,
                        weaponId: payload.calculationRequest.weaponId,
                        weaponLevel: payload.calculationRequest.calculationInput?.weapon?.level,
                        baseAtk: payload.context.stats.baseAtk,
                        expectedBaseAtk: window.GenshinBaseStats.resolveMember({
                            characterId: payload.context.characterId,
                            weaponId: payload.context.weaponId,
                            level: 90, weaponLevel: 80
                        }).baseAtk,
                        effectiveAtk: payload.context.effectiveStats.atk,
                        effectiveEm: payload.context.effectiveStats.elementalMastery,
                        results: payload.results.map((item) => ({
                            group: item.entry?.group, reaction: item.entry?.directReactionId || "",
                            nonCrit: item.nonCrit, crit: item.crit, expected: item.expected
                        })),
                        conditionStacks: Object.entries(payload.snapshot?.request?.uiState?.complexConditionByModifier || {})
                            .filter(([key]) => key.includes("provisional70_w15435_"))
                            .map(([key, state]) => ({ key, stack: state.stack })),
                        snapshot: payload.snapshot
                    };
                })()`);
            };

            const assertBaseAndReplay = async (payload, caseName) => {
                assert.equal(payload.weaponLevel, 80, `${caseName}: request carries Lv80`);
                assert.ok(payload.baseAtk > 0, `${caseName}: base ATK is nonzero`);
                assert.ok(Math.abs(payload.baseAtk - payload.expectedBaseAtk) < 1e-6,
                    `${caseName}: Lv80 weapon base ATK included (${payload.baseAtk} vs ${payload.expectedBaseAtk})`);
                const replay = await evaluate(client, `(async () => {
                    const snapshot = JSON.parse(${JSON.stringify(JSON.stringify(payload.snapshot))});
                    const replayed = window.GenshinCalcEngine.calculateDamageRequest(snapshot.request,
                        await window.GenshinCalcData.loadGenshinCalcData());
                    return replayed.results.map((item) => ({
                        group: item.entry?.group, reaction: item.entry?.directReactionId || "",
                        nonCrit: item.nonCrit, crit: item.crit, expected: item.expected
                    }));
                })()`);
                assert.deepEqual(replay, payload.results, `${caseName}: saved request replays to the same damage`);
                assert.ok(payload.text.trim().length > 0, `${caseName}: calculate button rendered results`);
            };

            // 13435: ordinary, self-owned toggle buff changes a normal hit.
            await setup({ weaponId: "13435" });
            const ordinarySelector = '#genshinConditionDialog [data-genshin-toggle-key*="provisional70_w13435_reaction_state"]';
            await changeControl(ordinarySelector, undefined, { checked: false });
            const ordinaryOff = await calculate();
            await setup({ weaponId: "13435" });
            await changeControl(ordinarySelector, undefined, { checked: true });
            const ordinaryOn = await calculate();
            await assertBaseAndReplay(ordinaryOn, "13435 ordinary self buff");
            assert.ok(ordinaryOn.results[0].expected > ordinaryOff.results[0].expected, "13435 toggle increases calculated hit");
            assert.notEqual(ordinaryOn.text, ordinaryOff.text, "13435 DOM result changes with the toggle");

            // 15435: same and different element stacks share a cap of 3; same-element wins.
            await setup({ characterId: "10000037", weaponId: "15435", reactionOptionKey: "melt15" });
            const sameSelector = '#genshinConditionDialog [data-genshin-condition-key*="provisional70_w15435_same_count"]';
            const differentSelector = '#genshinConditionDialog [data-genshin-condition-key*="provisional70_w15435_different_count"]';
            await changeControl(sameSelector, 0);
            await changeControl(differentSelector, 0);
            const sharedOff = await calculate();
            await setup({ characterId: "10000037", weaponId: "15435", reactionOptionKey: "melt15" });
            await changeControl(sameSelector, 0);
            await changeControl(differentSelector, 3);
            const differentOnly = await calculate();
            assert.ok(differentOnly.effectiveAtk > sharedOff.effectiveAtk, "15435 different-element stacks apply ATK");
            assert.ok(differentOnly.results[0].expected > sharedOff.results[0].expected,
                "15435 UI stack condition changes actual rendered damage");
            assert.notEqual(differentOnly.text, sharedOff.text, "15435 stack change updates rendered result text");
            await setup({ characterId: "10000037", weaponId: "15435", reactionOptionKey: "melt15" });
            await changeControl(sameSelector, 3);
            await changeControl(differentSelector, 3);
            const sameWins = await calculate();
            await assertBaseAndReplay(sameWins, "15435 shared stack cap");
            assert.ok(sameWins.effectiveEm > sharedOff.effectiveEm, "15435 same-element stacks apply EM");
            assert.equal(sameWins.effectiveAtk, sharedOff.effectiveAtk, "15435 same-element priority suppresses excess different-element ATK stacks");
            assert.equal(sameWins.conditionStacks.find((item) => item.key.includes("same_count"))?.stack, 3,
                "15435 saved request retains the same-element stack");
            assert.equal(sameWins.conditionStacks.find((item) => item.key.includes("different_count"))?.stack, 0,
                "15435 saved request normalizes the shared cap to 3+0");
            await setup({ characterId: "10000037", weaponId: "15435", reactionOptionKey: "melt15" });
            await changeControl(sameSelector, 3);
            await changeControl(differentSelector, 0);
            const explicitSameOnly = await calculate();
            assert.deepEqual(sameWins.results, explicitSameOnly.results,
                "15435 3+3 inputs normalize to the same damage as explicit same-element 3+0");

            // 11520: the 3-stack crit modifier affects Stellar Swirl reaction damage only.
            await setup({ characterId: "10000150", weaponId: "11520", reactionOptionKey: "stellarSwirl" });
            const stellarStacks = '#genshinConditionDialog [data-genshin-condition-key*="provisional70_w11520_stacks"]';
            await changeControl(stellarStacks, 0);
            const stellarZero = await calculate();
            await setup({ characterId: "10000150", weaponId: "11520", reactionOptionKey: "stellarSwirl" });
            await changeControl(stellarStacks, 3);
            const stellarThree = await calculate();
            await assertBaseAndReplay(stellarThree, "11520 Stellar 3-stack crit");
            const stellarZeroReaction = stellarZero.results.find((item) => item.reaction === "stellarSwirl");
            const stellarThreeReaction = stellarThree.results.find((item) => item.reaction === "stellarSwirl");
            assert.ok(stellarZeroReaction && stellarThreeReaction, "11520 displays Stellar Swirl reaction results");
            assert.ok(stellarThreeReaction.crit > stellarZeroReaction.crit, "11520 3-stack crit improves Stellar reaction crit damage");
            const ordinaryWithThree = stellarThree.results.find((item) => item.group === "normalAttack");
            const ordinaryWithZero = stellarZero.results.find((item) => item.group === "normalAttack");
            assert.ok(Math.abs(ordinaryWithThree.crit / ordinaryWithThree.nonCrit - ordinaryWithZero.crit / ordinaryWithZero.nonCrit) < 1e-9,
                "11520 reaction crit does not change the ordinary attack crit multiplier");

            // 11521: enabled hit buff applies to Traveler, while a non-Traveler stays unchanged.
            const hitSelector = '#genshinConditionDialog [data-genshin-toggle-key*="provisional70_w11521_hit_state"]';
            await setup({ characterId: "10000005", weaponId: "11521" });
            await changeControl(hitSelector, undefined, { checked: true });
            const traveler = await calculate();
            await setup({ characterId: "10000002", weaponId: "11521" });
            await changeControl(hitSelector, undefined, { checked: true });
            const nonTraveler = await calculate();
            await assertBaseAndReplay(traveler, "11521 Traveler owner gate");
            assert.ok(traveler.effectiveAtk > nonTraveler.effectiveAtk, "11521 enabled hit ATK applies to Traveler");
            assert.deepEqual(nonTraveler.results, (await (async () => {
                await setup({ characterId: "10000002", weaponId: "11521" });
                const off = await calculate();
                return off.results;
            })()), "11521 owner gate leaves non-Traveler damage unchanged");

            console.log("[genshin70-weapon-patterns-e2e] PASS 13435 ordinary self buff; 15435 shared max-3 stacks with same-element priority; 11520 Stellar-only 3-stack crit; 11521 Traveler owner gate; Lv80 weapon base ATK and request replay");
        } finally {
            if (client) client.socket.close();
            await closeBrowser(debugPort);
            if (browser.exitCode === null) await Promise.race([new Promise((resolve) => browser.once("exit", resolve)), delay(1500)]);
            if (browser.exitCode === null) browser.kill();
            const resolvedProfile = path.resolve(profileDir);
            const safeProfile = path.dirname(resolvedProfile) === tempRoot
                && path.basename(resolvedProfile).startsWith("genshin70-weapons-");
            assert.ok(safeProfile, `refusing to remove unexpected browser profile path: ${resolvedProfile}`);
            for (let attempt = 0; attempt < 5; attempt += 1) {
                try { fs.rmSync(resolvedProfile, { recursive: true, force: true }); break; }
                catch { if (attempt === 4) console.warn(`[genshin70-weapon-patterns-e2e] temporary browser profile remains: ${profileDir}`); else await delay(300 * (attempt + 1)); }
            }
        }
    } finally {
        if (serverProcess && serverProcess.exitCode === null) {
            serverProcess.kill();
            await Promise.race([new Promise((resolve) => serverProcess.once("exit", resolve)), delay(2000)]);
        }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
