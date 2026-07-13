"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const baseUrl = process.env.GENSHIN_E2E_URL || "http://127.0.0.1:4173/games/genshin/";
const executablePath = process.env.BROWSER_EXECUTABLE;
const remotePort = Number(process.env.BROWSER_DEBUG_PORT || 9223);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let lastError;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (error) {
            lastError = error;
        }
        await delay(100);
    }
    throw lastError || new Error(`timed out waiting for ${url}`);
}

async function createCdpClient(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener("open", resolve, { once: true });
        socket.addEventListener("error", reject, { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    const exceptions = [];
    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.method === "Runtime.exceptionThrown") {
            exceptions.push(message.params.exceptionDetails.text);
        }
        if (!message.id || !pending.has(message.id)) return;
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Runtime.enable");
    await send("Page.enable");
    return { socket, send, exceptions };
}

async function evaluate(client, expression) {
    const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
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

function selectionExpression(selection) {
    return `(() => {
        const next = ${JSON.stringify(selection)};
        const setValue = (id, value) => {
            const element = document.getElementById(id);
            if (!element) throw new Error("missing element: " + id);
            element.value = String(value);
            element.dispatchEvent(new Event("input", { bubbles: true }));
            element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        setValue("genshinReflectCharacter", next.characterName);
        setValue("genshinCalcCharacterId", next.characterId);
        setValue("genshinWeaponInput", next.weaponName || "");
        setValue("genshinCalcWeaponId", next.weaponId || "");
        setValue("genshinReflectConstellation", next.constellation || "C0");
        setValue("genshinAtkInput", next.atk || 2000);
        setValue("genshinDefInput", next.def || 1000);
        setValue("genshinHpInput", next.hp || 20000);
        setValue("genshinNormalTalentLevel", 10);
        setValue("genshinSkillTalentLevel", 10);
        setValue("genshinBurstTalentLevel", 10);
        return true;
    })()`;
}

async function clickAndWait(client, selector) {
    await evaluate(client, `document.querySelector(${JSON.stringify(selector)}).click()`);
    await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled)`);
}

(async () => {
    assert.ok(executablePath, "BROWSER_EXECUTABLE is required");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "genshin-e2e-"));
    const browserProcess = spawn(executablePath, [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        `--remote-debugging-port=${remotePort}`,
        `--user-data-dir=${userDataDir}`,
        baseUrl
    ], { stdio: "ignore", windowsHide: true });

    let client;
    try {
        const targets = await waitForJson(`http://127.0.0.1:${remotePort}/json/list`);
        const target = targets.find((item) => item.type === "page" && item.url.includes("/games/genshin/"));
        assert.ok(target, "Genshin page target was not created");
        client = await createCdpClient(target.webSocketDebuggerUrl);
        try {
            await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcConditions && window.GenshinCalcRenderer)");
        } catch (error) {
            const diagnostics = await evaluate(client, `({
                location: location.href,
                title: document.title,
                readyState: document.readyState,
                body: document.body?.innerText.slice(0, 300),
                scripts: [...document.scripts].map((script) => script.src).filter(Boolean),
                globals: {
                    data: Boolean(window.GenshinCalcData),
                    analyzer: Boolean(window.GenshinModifierAnalyzer),
                    conditions: Boolean(window.GenshinCalcConditions),
                    engine: Boolean(window.GenshinCalcEngine),
                    renderer: Boolean(window.GenshinCalcRenderer)
                }
            })`);
            throw new Error(`${error.message}\n${JSON.stringify(diagnostics)}`);
        }

        await evaluate(client, selectionExpression({
            characterName: "神里綾華",
            characterId: "10000002",
            weaponName: "resource smoke weapon",
            weaponId: "11427",
            constellation: "C0"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelectorAll("[data-genshin-resource-key]").length > 0`);
        const resource = await evaluate(client, `(() => {
            const inputs = [...document.querySelectorAll("[data-genshin-resource-key]")];
            return { count: inputs.length, key: inputs[0]?.dataset.genshinResourceKey || "" };
        })()`);
        assert.ok(resource.count > 0, "resource-specific input was not rendered");
        assert.ok(resource.key.includes("11427"), "resource input key is not stable by source");
        await evaluate(client, `(() => {
            const input = document.querySelector("[data-genshin-resource-key]");
            input.value = "2";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        await clickAndWait(client, "#genshinJsonCalcButton");
        const firstResultLength = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText.trim().length`);
        assert.ok(firstResultLength > 0);

        await evaluate(client, selectionExpression({
            characterName: "シャルロット",
            characterId: "10000088",
            weaponName: "",
            weaponId: "",
            constellation: "C2"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelectorAll('[data-genshin-condition-kind="targetCount"]').length > 0`);
        const complexCondition = await evaluate(client, `(() => ({
            count: document.querySelectorAll("[data-genshin-condition-key]").length,
            targetCount: document.querySelectorAll('[data-genshin-condition-kind="targetCount"]').length
        }))()`);
        assert.ok(complexCondition.count > 0, "complex condition input was not rendered");
        assert.equal(complexCondition.targetCount, 1);
        await evaluate(client, `(() => {
            const input = document.querySelector('[data-genshin-condition-kind="targetCount"]');
            input.value = "3";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        await clickAndWait(client, "#genshinJsonCalcButton");
        const finalResultLength = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText.trim().length`);
        assert.ok(finalResultLength > 0);

        await evaluate(client, selectionExpression({
            characterName: "フリーナ",
            characterId: "10000089",
            weaponName: "",
            weaponId: "",
            constellation: "C2"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelectorAll('[data-genshin-condition-kind="stack"]').length > 0`);
        const stackConditionCount = await evaluate(client, `document.querySelectorAll('[data-genshin-condition-kind="stack"]').length`);
        assert.ok(stackConditionCount > 0, "stack condition input was not rendered");
        await evaluate(client, `(() => {
            const input = document.querySelector('[data-genshin-condition-kind="stack"]');
            input.value = "100";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        await clickAndWait(client, "#genshinJsonCalcButton");
        const stackResultLength = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText.trim().length`);
        assert.ok(stackResultLength > 0);

        await evaluate(client, selectionExpression({
            characterName: "白朮",
            characterId: "10000082",
            weaponName: "",
            weaponId: "",
            constellation: "C2"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButton");
        const baizhuResult = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText`);
        assert.ok(baizhuResult.trim().length > 0, "JSON calculation result was not rendered");
        assert.deepEqual(client.exceptions, []);

        console.log(JSON.stringify({
            status: "passed",
            resourceKey: resource.key,
            resourceInputCount: resource.count,
            complexConditionInputCount: complexCondition.count,
            stackConditionInputCount: stackConditionCount,
            resultTextLength: baizhuResult.trim().length
        }));
    } finally {
        if (client) client.socket.close();
        browserProcess.kill();
        await delay(200);
        fs.rmSync(userDataDir, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
