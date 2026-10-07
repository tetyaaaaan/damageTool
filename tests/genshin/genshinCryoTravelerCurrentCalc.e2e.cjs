"use strict";

// Real-browser coverage for both non-canonical Cryo Traveler aliases.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const browserPath = process.env.BROWSER_EXECUTABLE || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = Number(process.env.BROWSER_DEBUG_PORT || 9244);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const progress = (message) => console.log(`[genshin-cryo-traveler-current-calc-e2e] ${message}`);

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
            pending.delete(id); reject(new Error(`CDP command timed out: ${method}`));
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
        profileDir = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), "genshin-cryo-traveler-current-"));
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
                window.__cryoTravelerCurrentPayload = payload;
                return payload;
            };
            return true;
        })()`);

        const input = async (id, value) => {
            const found = await evaluate(client, `(() => {
                const element = document.getElementById(${JSON.stringify(id)});
                if (!element) return false;
                element.value = String(${JSON.stringify(value)});
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
            })()`);
            assert.ok(found, `missing form field ${id}`);
            await delay(180);
        };
        const selectCharacter = async (id) => {
            await evaluate(client, 'document.querySelector("[data-selection-target=genshinReflectCharacter]").click()');
            await waitFor(client, 'document.getElementById("genshinSelectionDialog")?.open === true');
            await waitFor(client, `Boolean(document.querySelector('[data-selection-id="${id}"]'))`);
            await evaluate(client, `document.querySelector('[data-selection-id="${id}"]').click()`);
            await waitFor(client, `document.getElementById("genshinCalcCharacterId")?.value === ${JSON.stringify(id)}`);
        };
        const calculate = async () => {
            await evaluate(client, 'window.__cryoTravelerCurrentPayload = null; document.getElementById("genshinJsonCalcButtonBottom").click()');
            await waitFor(client, 'Boolean(window.__cryoTravelerCurrentPayload) && !document.getElementById("genshinJsonCalcButtonBottom").disabled');
            return evaluate(client, "window.__cryoTravelerCurrentPayload");
        };
        const openConditions = async () => {
            if (await evaluate(client, 'document.getElementById("genshinConditionDialog")?.open === true')) return;
            await evaluate(client, 'document.getElementById("genshinJsonPrepareConditionsButton").click()');
            await evaluate(client, 'document.getElementById("genshinConditionDialogOpen").click()');
            await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        };
        const conditionKey = async (id, tail) => {
            const keys = await evaluate(client, `Array.from(document.querySelectorAll("[data-genshin-condition-key]"))
                .map((element) => element.dataset.genshinConditionKey).filter((key) => key.endsWith(${JSON.stringify(`${id}:${tail}`)}))`);
            assert.ok(keys.length, `missing ${tail} condition for ${id}; visible keys: ${JSON.stringify(await evaluate(client, 'Array.from(document.querySelectorAll("[data-genshin-condition-key]")).map((element) => element.dataset.genshinConditionKey)'))}`);
            return keys[0];
        };
        const setCondition = async (key, value) => {
            const changed = await evaluate(client, `(() => {
                const element = document.querySelector('[data-genshin-condition-key="' + ${JSON.stringify(key)} + '"]');
                if (!element) return false;
                element.value = String(${JSON.stringify(value)});
                element.dispatchEvent(new Event("input", { bubbles: true }));
                element.dispatchEvent(new Event("change", { bubbles: true }));
                return true;
            })()`);
            assert.ok(changed, `missing state control ${key}`);
            await delay(250);
        };
        const closeConditions = async () => evaluate(client, 'document.getElementById("genshinConditionDialog").close()');
        const resultSignature = (payload) => payload.results.map((item) => [
            item.entry.id, item.entry.element, item.entry.hitCount,
            Number(item.total?.expected ?? item.expected ?? 0),
            Number(item.breakdown?.additiveBaseDamage ?? 0)
        ]);
        const entry = (payload, id) => {
            const row = payload.results.find((item) => item.entry.id === id);
            assert.ok(row, `missing result ${id}; got ${payload.results.map((item) => item.entry.id).join(", ")}`);
            return row;
        };
        const positive = (row, message) => assert.ok(Number(row.total?.expected ?? row.expected ?? 0) > 0, message);
        const assertNoInternalEnums = (text) => {
            assert.doesNotMatch(text, /\b(?:stellarConduct|stellarSwirl|specialChargedAttack|frostglow|icepoint|externalConfirmationRequired|deferredUnknown)\b/);
        };

        const baselineIdentity = await evaluate(client, `(async () => {
            const data = await window.GenshinCalcData.loadGenshinCalcData();
            await window.GenshinBaseStats.ready;
            return {
                original: [data.characters["10000005"]?.element, data.characters["10000007"]?.element],
                aliases: ["10000005_cryo", "10000007_cryo"].map((id) => ({
                    character: data.characters[id],
                    scalingIds: ["normalAttack", "skill", "burst"].flatMap((section) =>
                        (data.talentScalings?.[id]?.[section]?.entries || []).map((item) => item.id))
                })),
                members: ["10000005_cryo", "10000007_cryo"].map((id) =>
                    window.GenshinBaseStats.resolveMember({ characterId: id, weaponId: "11522", level: 90, weaponLevel: 90 }))
            };
        })()`);
        assert.deepEqual(baselineIdentity.original, ["-", "-"], "legacy Traveler identities remain independent and untouched");
        assert.deepEqual(baselineIdentity.aliases.map((item) => item.character.rawCharacterId), ["10000005", "10000007"]);
        assert.deepEqual(baselineIdentity.aliases.map((item) => item.character.skillDepotId), [505, 705], "Aether and Lumine retain their distinct Cryo skill depots");
        assert.ok(baselineIdentity.aliases.every((item) => item.scalingIds.length > 0), "both aliases load their own talent rows");
        assert.ok(baselineIdentity.members.every((item) => item && item.baseHp > 0 && item.characterBaseAtk > 0 && item.weaponBaseAtk > 0), `both aliases resolve positive character/weapon base stats: ${JSON.stringify(baselineIdentity.members)}`);

        for (const alias of [
            { id: "10000005_cryo", burstId: "10000005_cryo_burst_hit1", normalId: "cryo_n1" },
            { id: "10000007_cryo", burstId: "10000007_cryo_burst_hit1", normalId: "cryo_n1" }
        ]) {
            await selectCharacter(alias.id);
            await input("genshinReflectLevel", 90);
            await input("genshinReflectConstellation", "C0");
            await input("genshinAtkInput", 2200);
            await input("genshinDefInput", 1000);
            await input("genshinHpInput", 25000);
            await input("genshinElementalMasteryInput", 200);
            await input("genshinCritRateInput", 50);
            await input("genshinCritDamageInput", 100);
            await input("genshinEnergyRechargeInput", 100);
            await input("genshinNormalTalentLevel", 10);
            await input("genshinSkillTalentLevel", 10);
            await input("genshinBurstTalentLevel", 10);
            await input("genshinJsonReactionOption", "none");

            const selected = await calculate();
            assert.equal(selected.calculationRequest.characterId, alias.id, `${alias.id} stays distinct from the original form`);
            const normal = entry(selected, alias.normalId);
            assert.equal(normal.entry.element, "physical", `${alias.id}: uninfused sword attacks retain physical damage`);

            if (alias.id === "10000005_cryo") {
                await input("genshinReflectConstellation", "C2");
                await openConditions();
                const c2Key = await conditionKey(alias.id, "c2em");
                for (const [choice, amount] of [["normal", 60], ["enhanced", 120]]) {
                    await setCondition(c2Key, choice);
                    await closeConditions();
                    const c2Payload = await calculate();
                    assert.equal(c2Payload.context.effectiveStats.elementalMastery, 200 + amount, `C2 ${choice} adds ${amount} EM over final input stats without reapplying persistent A4`);
                    await openConditions();
                }
                await setCondition(c2Key, "off");
                await closeConditions();
                await input("genshinReflectConstellation", "C0");
            }

            await openConditions();
            const frostglowKey = await conditionKey(alias.id, "frostglow");
            const stellarKey = await conditionKey(alias.id, "stellar");
            const icepointKey = await conditionKey(alias.id, "icepoint");
            await setCondition(frostglowKey, 0);
            await setCondition(stellarKey, "none");
            await setCondition(icepointKey, 0);
            await closeConditions();
            const burstZero = await calculate();
            const baseBurst = entry(burstZero, alias.burstId);
            const burstHitCount = (payload) => payload.results
                .filter((item) => item.entry.id.startsWith(`${alias.id}_burst`))
                .reduce((total, item) => total + Number(item.entry.hitCount || 1), 0);
            assert.equal(burstHitCount(burstZero), 3, `${alias.id}: zero Frostglow has three separate javelin hits`);

            await openConditions();
            await setCondition(frostglowKey, 8);
            await closeConditions();
            const burstEight = await calculate();
            const expandedBurst = entry(burstEight, alias.burstId);
            assert.equal(burstHitCount(burstEight), 5, `${alias.id}: eight Frostglow adds two independent burst hits`);
            positive(expandedBurst, `${alias.id}: Frostglow burst damage is positive`);
            assert.ok(Number(expandedBurst.breakdown.additiveBaseDamage) > Number(baseBurst.breakdown.additiveBaseDamage), `${alias.id}: Frostglow adds burst base damage`);

            for (const stellar of ["stellarConduct", "stellarSwirl"]) {
                await openConditions();
                await setCondition(stellarKey, stellar);
                await closeConditions();
                const stellarPayload = await calculate();
                const stellarRows = stellarPayload.results.filter((item) => item.entry.directReactionId === stellar);
                assert.ok(stellarRows.length, `${alias.id}: ${stellar} rows are present`);
                for (const row of stellarRows) {
                    assert.equal(row.entry.element, "氷", `${alias.id}: ${stellar} damage is Cryo`);
                    positive(row, `${alias.id}: ${stellar} damage is positive (${row.entry.id})`);
                }
                if (stellar === "stellarConduct") {
                    const infusionRows = stellarPayload.results.filter((item) => ["normalAttack", "chargedAttack", "plungingAttack"].includes(item.entry.attackType));
                    assert.ok(infusionRows.length > 0);
                    assert.ok(infusionRows.every((item) => item.entry.element === "氷"), `${alias.id}: A1 infuses Normal/Charged/Plunging entries with Cryo`);
                    assert.ok(infusionRows.some((item) => Number(item.breakdown.additiveBaseDamage) > 0), `${alias.id}: A1 adds base damage to infused attacks`);
                }
            }

            await openConditions();
            await setCondition(icepointKey, 0);
            await setCondition(stellarKey, "none");
            await closeConditions();
            const noIcepoint = await calculate();
            assert.ok(!noIcepoint.results.some((item) => /freezingIce/i.test(item.entry.id)), `${alias.id}: Freezing Ice rows are absent below three Icepoint`);
            await openConditions();
            await setCondition(icepointKey, 3);
            await closeConditions();
            const freezingIce = await calculate();
            const specialCharged = freezingIce.results.filter((item) => /cryo_ca_(?:first|second)_freezingIce_none$/.test(item.entry.id));
            assert.equal(specialCharged.length, 2, `${alias.id}: Icepoint 3 enables the two distinct special charged hits`);
            for (const row of specialCharged) {
                assert.equal(row.entry.attackType, "chargedAttack");
                assert.equal(row.entry.element, "氷");
                assert.equal(row.entry.hitCount, 1);
                const ordinaryId = row.entry.id.replace("_freezingIce_none", "");
                const ordinary = entry(noIcepoint, ordinaryId);
                const specialMultiplier = Number(row.breakdown.scalingParts?.[0]?.talentMultiplier);
                const ordinaryMultiplier = Number(ordinary.breakdown.scalingParts?.[0]?.talentMultiplier);
                assert.ok(Math.abs(specialMultiplier - ordinaryMultiplier - 140) < 1e-7, `${alias.id}: special charged row adds 140 percentage points to its talent scaling`);
                assert.equal(Number(row.breakdown.additiveBaseDamage) || 0, Number(ordinary.breakdown.additiveBaseDamage) || 0, `${alias.id}: special charged row does not double-count the A1 additive`);
                positive(row, `${alias.id}: special charged damage is positive`);
            }

            const savedSignature = resultSignature(freezingIce);
            const savedRequest = JSON.parse(JSON.stringify(freezingIce.calculationRequest));
            const replayMatches = await evaluate(client, `(async () => {
                const payload = window.__cryoTravelerCurrentPayload;
                const data = await window.GenshinCalcData.loadGenshinCalcData();
                const saved = window.GenshinCalcEngine.createCalculationSnapshot(payload.calculationRequest, payload).request;
                const replay = window.GenshinCalcEngine.calculateDamageRequest(JSON.parse(JSON.stringify(saved)), data);
                return JSON.stringify(replay.results) === JSON.stringify(payload.results);
            })()`);
            assert.equal(replayMatches, true, `${alias.id}: saved CalculationRequest exactly reproduces browser results`);
            const visibleBeforeReload = await evaluate(client, 'document.body.innerText || ""');
            assertNoInternalEnums(visibleBeforeReload);

            await evaluate(client, "location.reload()");
            await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcData)");
            await waitFor(client, 'document.getElementById("genshinJsonCalcButtonBottom")?.getBoundingClientRect().width > 0');
            await evaluate(client, `(() => {
                const original = window.GenshinCalcEngine.runGenshinJsonCalc.bind(window.GenshinCalcEngine);
                window.GenshinCalcEngine.runGenshinJsonCalc = async (...args) => {
                    const payload = await original(...args);
                    window.__cryoTravelerCurrentPayload = payload;
                    return payload;
                };
            })()`);
            await waitFor(client, `document.getElementById("genshinCalcCharacterId")?.value === ${JSON.stringify(alias.id)}`);
            const restored = await calculate();
            assert.deepEqual(restored.calculationRequest, savedRequest, `${alias.id}: reload preserves the complete CalculationRequest`);
            assert.deepEqual(resultSignature(restored), savedSignature, `${alias.id}: reload preserves request state and actual results`);
            assertNoInternalEnums(await evaluate(client, 'document.body.innerText || ""'));
            progress(`${alias.id}: Cryo rows, Frostglow hit expansion, Stellar reaction routing, A1 infusion/additive, Icepoint 3, replay/reload, legacy identities`);
        }
        progress("PASS both Cryo Traveler aliases");
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
        if (profileDir && fs.existsSync(profileDir)) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* Browser may briefly retain profile files. */ } }
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
