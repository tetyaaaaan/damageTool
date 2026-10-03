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
        "--window-size=1280,900",
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
            await waitFor(client, "Boolean(window.GenshinIdResolver && window.GenshinIdResolver.listCharacters().length > 0)");
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

        await waitFor(client, `document.getElementById("genshinNormalTalentLevel").getBoundingClientRect().width > 0`);

        await waitFor(client, `Boolean(window.GenshinPartyState && document.getElementById("genshinPartyCharacter2"))`);
        const clearSupportMembers = async () => {
            await evaluate(client, `(() => {
                [2, 3, 4].forEach((slot) => {
                    const input = document.getElementById("genshinPartyCharacter" + slot);
                    if (!input) return;
                    input.value = "";
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                });
                return true;
            })()`);
            await delay(100);
        };

        const setReactionOption = async (value) => {
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinJsonReactionOption");
                if (!input) throw new Error("missing reaction option input");
                input.value = ${JSON.stringify(value)};
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(100);
        };

        const provisional70 = await evaluate(client, `(async () => {
            const data = await window.GenshinCalcData.loadGenshinCalcData();
            const characters = window.GenshinIdResolver.listCharacters();
            const weapons = window.GenshinIdResolver.listWeapons();
            return {
                characterIds: characters.filter((item) => ["10000148", "10000150"].includes(String(item.id))).map((item) => String(item.id)),
                weaponIds: weapons.filter((item) => ["11435", "11436", "11520", "11521", "12435", "12436", "13435", "13436", "14435", "14436", "15435", "15436"].includes(String(item.id))).map((item) => String(item.id)),
                characterImages: [data.characters?.["10000148"]?.imagePath, data.characters?.["10000150"]?.imagePath],
                stellarStatus: data.reactionDefinitions?.options?.stellarSwirl?.calculationStatus,
                stellarDataStatus: data.reactionDefinitions?.options?.stellarSwirl?.dataStatus,
                canonicalGranted: data.provisionalRuntimeSummary?.canonicalEligibilityGranted
            };
        })()`);
        assert.deepEqual(provisional70.characterIds.sort(), ["10000148", "10000150"]);
        assert.equal(provisional70.weaponIds.length, 12);
        assert.ok(provisional70.characterImages.every((value) => /\/100001(?:48|50)\.webp$/.test(value)));
        assert.equal(provisional70.stellarStatus, "supported");
        assert.equal(provisional70.stellarDataStatus, "provisional");
        assert.equal(provisional70.canonicalGranted, false);

        await evaluate(client, selectionExpression({
            characterName: "アリョーシャ（検証中）",
            characterId: "10000148",
            weaponName: "",
            weaponId: "",
            constellation: "C0",
            atk: 2000
        }));
        await clickAndWait(client, "#genshinConditionDialogOpen");
        await waitFor(client, 'document.getElementById("genshinConditionDialog")?.open === true');
        await delay(150);
        const alyoshaConditionSelector = '#genshinConditionDialog [data-genshin-condition-key*="passive2_er_skill_burst"], #genshinConditionDialog [data-genshin-toggle-key*="passive2_er_skill_burst"]';
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(alyoshaConditionSelector)}))`);
        await evaluate(client, `(() => {
            const toggle = document.querySelector(${JSON.stringify(alyoshaConditionSelector)});
            toggle.checked = false;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
            return toggle.checked;
        })()`);
        await delay(150);
        const alyoshaConditionOff = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const result = payload.results.find((item) => item.entry?.group === "skill");
            const key = Object.keys(payload.context.uiState.conditionByModifier).find((value) => value.includes("passive2_er_skill_burst"));
            const control = document.querySelector(${JSON.stringify(alyoshaConditionSelector)});
            return { damage: result?.nonCrit || 0, checked: control?.checked, control: control?.outerHTML || "", state: payload.context.uiState.conditionByModifier[key] || null };
        })()`);
        await evaluate(client, `(() => {
            const toggle = document.querySelector(${JSON.stringify(alyoshaConditionSelector)});
            toggle.checked = true;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
            return toggle.checked;
        })()`);
        await delay(150);
        const alyoshaConditionOn = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const result = payload.results.find((item) => item.entry?.group === "skill");
            const key = Object.keys(payload.context.uiState.conditionByModifier).find((value) => value.includes("passive2_er_skill_burst"));
            const control = document.querySelector(${JSON.stringify(alyoshaConditionSelector)});
            return { damage: result?.nonCrit || 0, checked: control?.checked, control: control?.outerHTML || "", state: payload.context.uiState.conditionByModifier[key] || null };
        })()`);
        assert.ok(alyoshaConditionOff.damage > 0);
        assert.equal(alyoshaConditionOff.checked, false);
        assert.ok(alyoshaConditionOn.damage > alyoshaConditionOff.damage, JSON.stringify({ alyoshaConditionOff, alyoshaConditionOn }));
        assert.equal(alyoshaConditionOn.checked, true);
        await clickAndWait(client, "#genshinConditionDialogClose");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const alyoshaResult = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            return {
                calculated: payload.results.some((item) => item.entry?.group === "skill" && item.nonCrit > 0),
                provisional: payload.displayData.characters?.["10000148"]?.dataStatus,
                hasNotice: /検証中データ/.test(document.body.innerText)
            };
        })()`);
        assert.equal(alyoshaResult.calculated, true);
        assert.equal(alyoshaResult.provisional, "provisional");
        assert.equal(alyoshaResult.hasNotice, true);

        await setReactionOption("stellarSwirl");
        await evaluate(client, `(() => {
            const input = document.getElementById("genshinStellarSwirlVariant");
            if (!input) throw new Error("missing Stellar Swirl variant input");
            input.value = "vortex1";
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        })()`);
        const stellarResult = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const result = payload.results.find((item) => item.entry?.id === "reaction_stellarSwirl");
            return { nonCrit: result?.nonCrit || 0, variant: result?.breakdown?.reaction?.variantKey || "" };
        })()`);
        assert.ok(stellarResult.nonCrit > 0);
        assert.equal(stellarResult.variant, "vortex1");
        await setReactionOption("none");
        await client.send("Page.reload", { ignoreCache: true });
        await waitFor(client, "Boolean(window.GenshinCalcEngine && window.GenshinCalcConditions && window.GenshinCalcRenderer)");
        await waitFor(client, "Boolean(window.GenshinIdResolver && window.GenshinIdResolver.listCharacters().length > 0)");
        await waitFor(client, `document.getElementById("genshinNormalTalentLevel").getBoundingClientRect().width > 0`);

        await clearSupportMembers();
        await evaluate(client, selectionExpression({
            characterName: "甘雨",
            characterId: "10000037",
            weaponName: "",
            weaponId: "",
            constellation: "C0",
            atk: 2000,
            def: 1000
        }));
        const furinaSelected = await evaluate(client, `(() => {
            const member = window.GenshinPartyState.characterForId("10000089");
            return window.GenshinPartyState.setPartySelection(2, "character", member);
        })()`);
        assert.equal(furinaSelected, true, "Furina must be selectable as a support member");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const furinaPartyMetadata = await evaluate(client, `(async () => {
            const calcData = await window.GenshinCalcData.loadGenshinCalcData();
            const context = window.GenshinCalcEngine.buildCharacterCalcContext();
            const panel = window.GenshinCalcConditions.conditionPanelState(context, calcData);
            const candidate = panel.partyModifiers.find((item) => item.modifier?.id === "t_10000089_combat3_fanfare_damage_bonus");
            if (!candidate) throw new Error("missing Furina fanfare party candidate");
            return { key: candidate.partyConditionStateKey || candidate.analysis.conditionStateKey, toggleKey: candidate.toggleKey };
        })()`);
        const furinaStackSelector = `[data-genshin-party-condition-key="${furinaPartyMetadata.key}"][data-genshin-party-condition-kind="stack"]`;
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(furinaStackSelector)}))`);
        const furinaBefore = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            return payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0);
        })()`);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(furinaStackSelector)});
            input.value = "300";
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return input.value;
        })()`);
        await delay(150);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(furinaStackSelector)});
            const toggle = input?.closest("[data-party-buff]")?.querySelector("[data-genshin-party-buff-key]");
            if (!toggle) throw new Error("missing Furina burst activation toggle");
            if (!toggle.checked) toggle.click();
            return toggle.checked;
        })()`);
        await delay(150);
        const furinaAfter = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const candidate = payload.partyModifiers.find((item) => item.modifier?.id === "t_10000089_combat3_fanfare_damage_bonus");
            const stateKey = candidate.partyConditionStateKey || candidate.analysis.conditionStateKey;
            const state = payload.calculationRequest.party.conditionStates[stateKey];
            return {
                totalExpected: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                status: candidate.status,
                enabled: candidate.enabled,
                resolvedValue: candidate.resolvedValue,
                stack: state?.stack
            };
        })()`);
        assert.equal(furinaAfter.status, "ready");
        assert.equal(furinaAfter.enabled, true);
        assert.equal(furinaAfter.resolvedValue, 75);
        assert.equal(furinaAfter.stack, 300);
        assert.ok(furinaAfter.totalExpected > furinaBefore, JSON.stringify({ furinaBefore, furinaAfter }));

        await clearSupportMembers();
        const alyoshaSupportSelected = await evaluate(client, `(() => {
            const member = window.GenshinPartyState.characterForId("10000148");
            return window.GenshinPartyState.setPartySelection(2, "character", member);
        })()`);
        assert.equal(alyoshaSupportSelected, true, "Alyosha must be selectable as a support member");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const alyoshaPartyMetadata = await evaluate(client, `(async () => {
            const calcData = await window.GenshinCalcData.loadGenshinCalcData();
            const context = window.GenshinCalcEngine.buildCharacterCalcContext();
            const panel = window.GenshinCalcConditions.conditionPanelState(context, calcData);
            const candidate = panel.partyModifiers.find((item) => item.modifier?.id === "provisional70_10000148_modifier_hunter_precision_atk");
            if (!candidate) throw new Error("missing Alyosha Hunter Precision party candidate");
            return { key: candidate.partyConditionStateKey, toggleKey: candidate.toggleKey, max: candidate.modifier.conditionInput?.max };
        })()`);
        assert.equal(alyoshaPartyMetadata.max, 1);
        const alyoshaStackSelector = `[data-genshin-party-condition-key="${alyoshaPartyMetadata.key}"][data-genshin-party-condition-kind="stack"]`;
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(alyoshaStackSelector)}))`);
        const alyoshaPartyBefore = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            return payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0);
        })()`);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(alyoshaStackSelector)});
            input.value = "1";
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return input.value;
        })()`);
        await delay(150);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(alyoshaStackSelector)});
            const toggle = input?.closest("[data-party-buff]")?.querySelector("[data-genshin-party-buff-key]");
            if (!toggle) throw new Error("missing Alyosha Hunter Precision activation toggle");
            if (!toggle.checked) toggle.click();
            return toggle.checked;
        })()`);
        await delay(150);
        const alyoshaPartyAfter = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const atk = payload.partyModifiers.find((item) => item.modifier?.id === "provisional70_10000148_modifier_hunter_precision_atk");
            const stellar = payload.partyModifiers.find((item) => item.modifier?.id === "provisional70_10000148_modifier_passive3_stellar_conduct");
            const state = payload.calculationRequest.party.conditionStates[atk.partyConditionStateKey];
            return {
                totalExpected: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                atkStatus: atk.status,
                atkEnabled: atk.enabled,
                atkValue: atk.resolvedValue,
                stellarValue: stellar.resolvedValue,
                stack: state?.stack
            };
        })()`);
        assert.equal(alyoshaPartyAfter.atkStatus, "ready");
        assert.equal(alyoshaPartyAfter.atkEnabled, true);
        assert.equal(alyoshaPartyAfter.atkValue, 21.2);
        assert.equal(alyoshaPartyAfter.stellarValue, 20);
        assert.equal(alyoshaPartyAfter.stack, 1);
        assert.ok(alyoshaPartyAfter.totalExpected > alyoshaPartyBefore, JSON.stringify({ alyoshaPartyBefore, alyoshaPartyAfter }));

        await clearSupportMembers();
        await evaluate(client, selectionExpression({
            characterName: "アリョーシャ（検証中）",
            characterId: "10000148",
            weaponName: "",
            weaponId: "",
            constellation: "C0",
            atk: 2000
        }));
        const odetteSupportSelected = await evaluate(client, `(() => {
            const member = window.GenshinPartyState.characterForId("10000150");
            const selected = window.GenshinPartyState.setPartySelection(2, "character", member);
            const constellation = document.getElementById("genshinPartyConstellation2");
            constellation.value = "6";
            constellation.dispatchEvent(new Event("change", { bubbles: true }));
            return selected;
        })()`);
        assert.equal(odetteSupportSelected, true, "Odette must be selectable as a support member");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const odettePartyMetadata = await evaluate(client, `(async () => {
            const calcData = await window.GenshinCalcData.loadGenshinCalcData();
            const context = window.GenshinCalcEngine.buildCharacterCalcContext();
            const panel = window.GenshinCalcConditions.conditionPanelState(context, calcData);
            const candidate = panel.partyModifiers.find((item) => item.modifier?.id === "provisional70_10000150_c2_spring_flower_atk");
            if (!candidate) throw new Error("missing Odette C2 Spring Flower party candidate");
            return { key: candidate.partyConditionStateKey };
        })()`);
        const odetteOptionSelector = `[data-genshin-party-condition-key="${odettePartyMetadata.key}"][data-genshin-party-condition-kind="stack"]`;
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(odetteOptionSelector)}))`);
        const odetteSharedControlCount = await evaluate(client, `({
            inputs: document.querySelectorAll(${JSON.stringify(odetteOptionSelector)}).length,
            springToggles: document.querySelectorAll('[data-genshin-party-buff-key*="condition_spring_flower"]').length
        })`);
        assert.deepEqual(odetteSharedControlCount, { inputs: 1, springToggles: 0 });
        const odettePartyBefore = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            return payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0);
        })()`);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(odetteOptionSelector)});
            input.value = "3";
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return input.value;
        })()`);
        await delay(150);
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const odettePartyAfter = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const candidate = payload.partyModifiers.find((item) => item.modifier?.id === "provisional70_10000150_c2_spring_flower_atk");
            const state = payload.calculationRequest.party.conditionStates[candidate.partyConditionStateKey];
            return {
                damage: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                status: candidate.status,
                enabled: candidate.enabled,
                resolvedValue: candidate.resolvedValue,
                stack: state?.stack
            };
        })()`);
        assert.ok(odettePartyBefore > 0);
        assert.equal(odettePartyAfter.status, "ready");
        assert.equal(odettePartyAfter.enabled, true);
        assert.equal(odettePartyAfter.resolvedValue, 21);
        assert.equal(odettePartyAfter.stack, 3);
        assert.ok(odettePartyAfter.damage > odettePartyBefore, JSON.stringify({ odettePartyBefore, odettePartyAfter }));

        const runWitchProduction = async (modifierId) => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const applied = payload.results.flatMap((result) => result.breakdown?.appliedModifiers || []);
            const appliedItem = applied.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const extraDamageResult = payload.results.find((result) => result.entry?.effectId === ${JSON.stringify(modifierId)});
            const skippedItem = payload.candidateModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const partyCandidate = payload.partyModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const source = appliedItem || extraDamageResult?.entry?.sourceModifier || skippedItem || partyCandidate;
            const key = source?.analysis?.conditionStateKey || "";
            const request = payload.calculationRequest || {};
            return {
                totalExpected: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                applied: Boolean(appliedItem || extraDamageResult),
                appliedValue: appliedItem?.value ?? extraDamageResult?.entry?.sourceModifier?.value ?? null,
                skippedReason: skippedItem?.reason || "",
                partyStatus: partyCandidate?.status || "",
                partyEnabled: partyCandidate?.enabled ?? null,
                state: request.party?.conditionStates?.[key]
                    || request.uiState?.conditionByModifier?.[key]
                    || request.uiState?.complexConditionByModifier?.[key]
                    || null
            };
        })()`);

        const directWitchCase = async ({ selection, group, modifierId, offValue, onValue, reaction }) => {
            await clearSupportMembers();
            await evaluate(client, selectionExpression(selection));
            await waitFor(client, `document.getElementById("genshinCalcCharacterId").value === ${JSON.stringify(selection.characterId)}`);
            if (reaction) await setReactionOption(reaction);
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const selector = `[data-genshin-condition-key*="${group}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            const optionLabels = await evaluate(client, `([...document.querySelector(${JSON.stringify(selector)}).options]).map((option) => option.textContent)`);
            assert.ok(optionLabels.some((label) => /未解放/.test(label)), `${modifierId} must render a locked option`);
            assert.ok(optionLabels.some((label) => /解放済み/.test(label)), `${modifierId} must render an unlocked option`);

            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = ${JSON.stringify(offValue)};
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
            const off = await runWitchProduction(modifierId);
            if (off.applied) assert.equal(off.appliedValue, 0, `${modifierId} must resolve to zero in ${offValue} state`);
            assert.equal(off.state?.option, offValue, `${modifierId} state must retain ${offValue}`);

            let inactive = null;
            if (onValue !== "unlocked" && optionLabels.some((label) => /解放済み（未発動/.test(label))) {
                await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
                await evaluate(client, `(() => {
                    const input = document.querySelector(${JSON.stringify(selector)});
                    input.value = "unlocked";
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return input.value;
                })()`);
                await delay(150);
                inactive = await runWitchProduction(modifierId);
                if (inactive.applied) assert.equal(inactive.appliedValue, 0, `${modifierId} must resolve to zero while unlocked but inactive`);
                assert.equal(inactive.state?.option, "unlocked", `${modifierId} state must retain unlocked`);
                assert.equal(inactive.totalExpected, off.totalExpected, `${modifierId} unlocked inactive state must not change production damage`);
            }

            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = ${JSON.stringify(onValue)};
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
            const on = await runWitchProduction(modifierId);
            assert.equal(on.applied, true, `${modifierId} must be applied in ${onValue} state`);
            assert.equal(on.state?.option, onValue, `${modifierId} state must retain ${onValue}`);
            assert.notEqual(on.totalExpected, off.totalExpected, `${modifierId} must change production damage`);
            return { modifierId, optionLabels, off, inactive, on };
        };

        const partyWitchCase = async ({ selection, supportCharacterId, group, modifierId, supportDef, supportAtk, reaction }) => {
            await clearSupportMembers();
            await evaluate(client, selectionExpression(selection));
            await waitFor(client, `document.getElementById("genshinCalcCharacterId").value === ${JSON.stringify(selection.characterId)}`);
            const selected = await evaluate(client, `(() => {
                const member = window.GenshinPartyState.characterForId(${JSON.stringify(supportCharacterId)});
                return window.GenshinPartyState.setPartySelection(2, "character", member);
            })()`);
            assert.equal(selected, true, `${modifierId} support character must be selectable`);
            if (supportDef !== undefined) {
                await evaluate(client, `(() => {
                    const input = document.getElementById("genshinPartyDef2");
                    input.value = ${JSON.stringify(String(supportDef))};
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return input.value;
                })()`);
            }
            if (supportAtk !== undefined) {
                await evaluate(client, `(() => {
                    const input = document.getElementById("genshinPartyAtk2");
                    input.value = ${JSON.stringify(String(supportAtk))};
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return input.value;
                })()`);
            }
            if (reaction) await setReactionOption(reaction);
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const metadata = await evaluate(client, `(async () => {
                const calcData = await window.GenshinCalcData.loadGenshinCalcData();
                const context = window.GenshinCalcEngine.buildCharacterCalcContext();
                const panel = window.GenshinCalcConditions.conditionPanelState(context, calcData);
                const candidate = panel.partyModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
                if (!candidate) throw new Error("missing Witch party candidate: ${modifierId}");
                return { key: candidate.partyConditionStateKey || candidate.analysis.conditionStateKey, candidateKey: candidate.key, group: candidate.modifier.conditionGroupId || "" };
            })()`);
            assert.equal(metadata.group, group, `${modifierId} must expose its Witch condition group`);
            const selector = `[data-genshin-party-condition-key="${metadata.key}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            const optionLabels = await evaluate(client, `([...document.querySelector(${JSON.stringify(selector)}).options]).map((option) => option.textContent)`);
            assert.ok(optionLabels.some((label) => /未解放/.test(label)), `${modifierId} party UI must render locked option`);
            assert.ok(optionLabels.some((label) => /解放済み/.test(label)), `${modifierId} party UI must render unlocked option`);

            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = "locked";
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
            const off = await runWitchProduction(modifierId);
            assert.equal(off.applied, false, `${modifierId} must be off while locked`);
            assert.equal(off.partyStatus, "off", `${modifierId} party candidate must be off while locked`);
            assert.equal(off.partyEnabled, false, `${modifierId} party toggle must be off while locked`);
            assert.equal(off.state?.option, "locked", `${modifierId} party state must retain locked`);

            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = "unlocked";
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
            const inactive = await runWitchProduction(modifierId);
            assert.equal(inactive.applied, false, `${modifierId} must be off while unlocked but inactive`);
            assert.equal(inactive.state?.option, "unlocked", `${modifierId} party state must retain unlocked`);
            assert.equal(inactive.totalExpected, off.totalExpected, `${modifierId} unlocked inactive state must not change production damage`);

            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = "active";
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
            await evaluate(client, `(() => {
                const article = document.querySelector(${JSON.stringify(selector)})?.closest("[data-party-buff]");
                const toggle = article?.querySelector("[data-genshin-party-buff-key]");
                if (!toggle) throw new Error("missing Witch party apply checkbox: ${modifierId}");
                if (!toggle.checked) toggle.click();
                return Boolean(toggle.checked);
            })()`);
            await delay(150);
            const on = await runWitchProduction(modifierId);
            assert.equal(on.applied, true, `${modifierId} must be applied after active + checkbox`);
            assert.equal(on.partyStatus, "ready", `${modifierId} party candidate must be ready after active + checkbox`);
            assert.equal(on.partyEnabled, true, `${modifierId} party candidate must be enabled after active + checkbox`);
            assert.equal(on.state?.option, "active", `${modifierId} party state must retain active`);
            assert.notEqual(on.totalExpected, off.totalExpected, `${modifierId} must change production damage`);
            return { modifierId, optionLabels, off, inactive, on };
        };

        const fischlC6PartyAmplification = async () => {
            const selection = { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 };
            const ampKey = "party:2:10000031:group:fischl-c6-witch-amplification";
            const atkId = "c_10000031_6_witch_atk_amplification";
            const emId = "c_10000031_6_witch_em_amplification";
            const atkBaseId = "t_10000031_lockedPassive_overload_atk";
            const emBaseId = "t_10000031_lockedPassive_electrocharged_em";
            await clearSupportMembers();
            await evaluate(client, selectionExpression(selection));
            const selected = await evaluate(client, `(() => {
                const member = window.GenshinPartyState.characterForId("10000031");
                const result = window.GenshinPartyState.setPartySelection(2, "character", member);
                const constellation = document.getElementById("genshinPartyConstellation2");
                constellation.value = "6";
                constellation.dispatchEvent(new Event("change", { bubbles: true }));
                return result;
            })()`);
            assert.equal(selected, true, "Fischl must be selectable as a C6 party support");
            await setReactionOption("electroCharged");
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const selectors = {
                amp: `[data-genshin-party-condition-key="${ampKey}"]`,
                atk: '[data-genshin-party-condition-key="party:2:10000031:group:witch-fischl-overload"]',
                em: '[data-genshin-party-condition-key="party:2:10000031:group:witch-fischl-electrocharged"]'
            };
            const metadata = await evaluate(client, `(async () => {
                const panel = window.GenshinCalcConditions.conditionPanelState(
                    window.GenshinCalcEngine.buildCharacterCalcContext(),
                    await window.GenshinCalcData.loadGenshinCalcData()
                );
                return [${JSON.stringify([atkId, emId, atkBaseId, emBaseId])}].flat().map((id) => {
                    const candidate = panel.partyModifiers.find((item) => item.modifier?.id === id);
                    return candidate ? { id, key: candidate.partyConditionStateKey } : { id };
                });
            })()`);
            assert.ok(metadata.every((item) => item.key), `Fischl party C6 Witch candidates must be present: ${JSON.stringify(metadata)}`);
            const ampCandidates = metadata.filter((item) => item.id === atkId || item.id === emId);
            assert.ok(ampCandidates.every((item) => item.key === ampKey), "Fischl party ATK and EM amplification must share the C6 group key");
            assert.equal(await evaluate(client, `document.querySelectorAll(${JSON.stringify(selectors.amp)}).length`), 1,
                "Fischl party C6 ATK and EM amplification must render one shared condition control");
            for (const selector of Object.values(selectors)) await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            const snapshot = async () => evaluate(client, `(async () => {
                const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
                const restored = window.GenshinCalcEngine.calculateDamageRequest(payload.calculationRequest, await window.GenshinCalcData.loadGenshinCalcData());
                const summarize = (result) => ({
                    id: result.entry?.id,
                    effectId: result.entry?.effectId || "",
                    attackType: result.entry?.attackType,
                    expected: result.expected,
                    multiplier: result.breakdown?.scalingParts?.[0]?.talentMultiplier ?? null
                });
                return {
                    results: payload.results.map(summarize),
                    replay: restored.results.map(summarize),
                    stats: payload.context.effectiveStats || payload.context.stats,
                    states: payload.calculationRequest.party.conditionStates
                };
            })()`);
            const assertReplay = (value, label) => assert.deepEqual(value.replay, value.results, `${label} party saved request must reproduce production results`);
            const setPartyOption = async (selector, value) => {
                await evaluate(client, `(() => {
                    const input = document.querySelector(${JSON.stringify(selector)});
                    input.value = ${JSON.stringify(value)};
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return input.value;
                })()`);
                await delay(150);
            };
            const setBaseToggle = async (id, enabled) => {
                const conditionKey = metadata.find((item) => item.id === id).key;
                const selector = `[data-genshin-party-condition-key="${conditionKey}"]`;
                await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
                await evaluate(client, `(() => {
                    const condition = document.querySelector(${JSON.stringify(selector)});
                    const input = condition?.closest("[data-party-buff]")?.querySelector("[data-genshin-party-buff-key]");
                    if (!input) throw new Error("missing Fischl base Witch party apply checkbox for " + ${JSON.stringify(id)});
                    if (input.checked !== ${JSON.stringify(enabled)}) input.click();
                    return input.checked;
                })()`);
                await delay(150);
            };
            await setPartyOption(selectors.atk, "locked");
            await setPartyOption(selectors.em, "locked");
            await setPartyOption(selectors.amp, "inactive");
            await setBaseToggle(atkBaseId, false);
            await setBaseToggle(emBaseId, false);
            const off = await snapshot();
            await setPartyOption(selectors.atk, "active");
            await setPartyOption(selectors.em, "active");
            await setBaseToggle(atkBaseId, true);
            await setBaseToggle(emBaseId, true);
            await setPartyOption(selectors.amp, "inactive");
            const baseOn = await snapshot();
            await setPartyOption(selectors.amp, "active");
            const amplified = await snapshot();
            const reaction = (value) => value.results.find((item) => item.attackType === "reaction")?.expected;
            const mainAttack = (value) => value.results.find((item) => item.attackType === "normalAttack")?.expected;
            assert.equal(amplified.states?.[ampKey]?.option, "active", "Fischl C6 party amplification option must be saved");
            assert.ok(reaction(baseOn) > reaction(off), "party Fischl base Witch EM must raise Ganyu's Electro-Charged damage");
            assert.ok(reaction(amplified) > reaction(baseOn), "party Fischl C6 must amplify Witch EM and further raise Electro-Charged damage");
            assert.ok(mainAttack(baseOn) > mainAttack(off), "party Fischl base Witch ATK must increase the recipient's normal attack damage");
            assert.ok(mainAttack(amplified) > mainAttack(baseOn), "party Fischl C6 must amplify Witch ATK and further increase normal attack damage");
            assertReplay(off, "Fischl party Witch buffs off");
            assertReplay(baseOn, "Fischl party base Witch buffs on");
            assertReplay(amplified, "Fischl party C6 amplified Witch buffs on");
            await setPartyOption(selectors.atk, "unlocked");
            await setPartyOption(selectors.em, "unlocked");
            await setBaseToggle(atkBaseId, false);
            await setBaseToggle(emBaseId, false);
            const ampWithoutBase = await snapshot();
            assert.equal(ampWithoutBase.stats.atk, off.stats.atk, "Fischl party C6 amplification must not apply without the base Witch ATK option");
            assert.equal(ampWithoutBase.stats.elementalMastery, off.stats.elementalMastery, "Fischl party C6 amplification must not apply without the base Witch EM option");
            assert.equal(reaction(ampWithoutBase), reaction(off), "Fischl party C6 amplification must not change damage without base Witch effects");
            assert.equal(mainAttack(ampWithoutBase), mainAttack(off), "Fischl party C6 amplification must not change attack damage without base Witch effects");
            assertReplay(ampWithoutBase, "Fischl party C6 amplification without base Witch effects");
            return { offDamage: { reaction: reaction(off), mainAttack: mainAttack(off) }, baseDamage: { reaction: reaction(baseOn), mainAttack: mainAttack(baseOn) }, amplifiedDamage: { reaction: reaction(amplified), mainAttack: mainAttack(amplified) }, savedOption: amplified.states?.[ampKey]?.option };
        };

        const witchUiProduction = {
            razor: await directWitchCase({
                selection: { characterName: "レザー", characterId: "10000020", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-razor-wolf_within_burst_atk",
                modifierId: "t_10000020_lockedPassive_wolf_within_burst_atk",
                offValue: "locked",
                onValue: "unlocked"
            }),
            razorOverflow: await directWitchCase({
                selection: { characterName: "レザー", characterId: "10000020", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-razor-overflow-lightning",
                modifierId: "t_10000020_lockedPassive_overflow_lightning",
                offValue: "locked",
                onValue: "active"
            }),
            venti: await directWitchCase({
                selection: { characterName: "ウェンティ", characterId: "10000022", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-venti-stormeye_swirl_damage",
                modifierId: "t_10000022_lockedPassive_stormeye_swirl_damage",
                offValue: "locked",
                onValue: "active"
            }),
            ventiStormeyeMultiplier: await directWitchCase({
                selection: { characterName: "ウェンティ", characterId: "10000022", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-venti-stormeye_swirl_damage",
                modifierId: "t_10000022_lockedPassive_stormeye_damage_multiplier",
                offValue: "locked",
                onValue: "active"
            }),
            beidou: await directWitchCase({
                selection: { characterName: "北斗", characterId: "10000024", weaponName: "", weaponId: "", constellation: "C6", atk: 2000, def: 1000 },
                group: "witch-revelation-beidou-c6",
                modifierId: "c_10000024_6_lucid_active_em",
                offValue: "locked",
                onValue: "active",
                reaction: "overload"
            }),
            fischl: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000031",
                group: "witch-fischl-electrocharged",
                modifierId: "t_10000031_lockedPassive_electrocharged_em",
                reaction: "electroCharged"
            }),
            fischlAtk: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000031",
                group: "witch-fischl-overload",
                modifierId: "t_10000031_lockedPassive_overload_atk",
                supportAtk: 1800
            }),
            fischlC6Amplification: await fischlC6PartyAmplification(),
            albedo: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000038",
                group: "witch-albedo-solar_isotoma_damage",
                modifierId: "t_10000038_lockedPassive_solar_isotoma_damage",
                supportDef: 1000
            }),
            albedoSilver: await partyWitchCase({
                selection: { characterName: "レザー", characterId: "10000020", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000038",
                group: "witch-albedo-silver-blossom-damage",
                modifierId: "t_10000038_lockedPassive_silver_blossom_damage",
                supportDef: 3000
            }),
            sucrose: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000043",
                group: "witch-sucrose-small-wind-spirit",
                modifierId: "t_10000043_lockedPassive_small_wind_spirit_damage"
            }),
            sucroseLarge: await partyWitchCase({
                selection: { characterName: "レザー", characterId: "10000020", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000043",
                group: "witch-sucrose-large-wind-spirit",
                modifierId: "t_10000043_lockedPassive_large_wind_spirit_damage"
            })
        };

        const setMainOption = async (key, value) => {
            const selector = `[data-genshin-condition-key="${key}"]`;
            try {
                await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, 2500);
            } catch (error) {
                const diagnostics = await evaluate(client, `({
                    selectedCharacter: document.getElementById("genshinCalcCharacterId")?.value || "",
                    visibleConditions: [...document.querySelectorAll("[data-genshin-condition-key]")].map((item) => ({ key: item.dataset.genshinConditionKey, value: item.value, kind: item.dataset.genshinConditionKind })),
                    conditionCards: [...document.querySelectorAll("[data-condition-card]")].map((item) => item.dataset.conditionCard)
                })`);
                throw new Error(`${error.message}; requested ${key}; DOM ${JSON.stringify(diagnostics)}`);
            }
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = ${JSON.stringify(value)};
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
        };
        const fischlPayload = async () => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const restored = window.GenshinCalcEngine.calculateDamageRequest(
                payload.calculationRequest,
                await window.GenshinCalcData.loadGenshinCalcData()
            );
            const summarize = (result) => ({
                id: result.entry?.id,
                effectId: result.entry?.effectId || "",
                attackType: result.entry?.attackType,
                damageType: result.entry?.damageType,
                element: result.entry?.element,
                param: result.entry?.source?.param || "",
                multiplier: result.breakdown?.scalingParts?.[0]?.talentMultiplier ?? null,
                nonCrit: result.nonCrit,
                expected: result.expected,
                additiveBaseDamage: result.breakdown?.additiveBaseDamage || 0,
                appliedModifierIds: (result.breakdown?.appliedModifiers || []).map((item) => item.modifier?.id).filter(Boolean)
            });
            return {
                request: payload.calculationRequest,
                results: payload.results.map(summarize),
                restoredResults: restored.results.map(summarize),
                effectiveStats: payload.context.effectiveStats || payload.context.stats,
                baseAtk: payload.context.stats.baseAtk,
                appliedIds: [...new Set(payload.results.flatMap((result) => result.breakdown?.appliedModifiers || []).map((item) => item.modifier?.id).filter(Boolean))]
            };
        })()`);
        const assertFischlReplay = (snapshot, label) => {
            assert.deepEqual(snapshot.restoredResults, snapshot.results, `${label} saved calculation request must reproduce production results`);
        };
        const fischlA1 = async () => {
            await clearSupportMembers();
            await evaluate(client, selectionExpression({ characterName: "フィッシュル", characterId: "10000031", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 }));
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinBaseAtkInput");
                input.value = "500";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const key = "talent:passive1:group:fischl-charged-hit-oz";
            await setMainOption(key, "inactive");
            const off = await fischlPayload();
            const offCharged = off.results.find((item) => item.id === "fully_charged_aimed_shot");
            const offA1 = off.results.filter((item) => item.effectId === "t_10000031_passive1_thundering_retribution");
            assert.equal(offA1.length, 0, "Fischl A1 must not add a hit while Oz was not hit");
            await setMainOption(key, "active");
            const on = await fischlPayload();
            const onCharged = on.results.find((item) => item.id === "fully_charged_aimed_shot");
            const onA1 = on.results.filter((item) => item.effectId === "t_10000031_passive1_thundering_retribution");
            assert.equal(onA1.length, 1, "Fischl A1 must add exactly one derived fully charged shot hit");
            assert.equal(onA1[0].attackType, "chargedAttack");
            assert.equal(onA1[0].param, "param7", "Fischl A1 must derive from the fully charged aimed shot entry");
            assert.ok(onA1[0].nonCrit > 0);
            assert.equal(onCharged.nonCrit, offCharged.nonCrit, "Fischl A1 must leave the original fully charged shot unchanged");
            assert.ok(!on.results.some((item) => item.effectId === "t_10000031_passive1_thundering_retribution" && item.id !== onA1[0].id), "Fischl A1 must not clone an uncharged aimed shot");
            assertFischlReplay(off, "Fischl A1 inactive");
            assertFischlReplay(on, "Fischl A1 active");
            return { offA1Count: offA1.length, onA1: onA1[0], originalShotStable: onCharged.nonCrit === offCharged.nonCrit };
        };
        const fischlConstellationDamage = async () => {
            await clearSupportMembers();
            await evaluate(client, selectionExpression({ characterName: "フィッシュル", characterId: "10000031", weaponName: "", weaponId: "", constellation: "C1", atk: 2000, def: 1000 }));
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinBaseAtkInput");
                input.value = "500";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const ozKey = "character:10000031:group:fischl-oz-state";
            const sharedOzSelector = `[data-genshin-condition-key="${ozKey}"]`;
            const sharedOzControlCount = await evaluate(client, `document.querySelectorAll(${JSON.stringify(sharedOzSelector)}).length`);
            assert.equal(sharedOzControlCount, 1, "Fischl Oz state shared by A4, C1 and C6 must render one UI control");
            await setMainOption(ozKey, "inactive");
            const neutral = await fischlPayload();
            assert.equal(neutral.results.some((item) => item.effectId === "c_10000031_1_1_resolved_2"), false);
            await setMainOption(ozKey, "absent");
            const c1 = await fischlPayload();
            const c1Hits = c1.results.filter((item) => item.effectId === "c_10000031_1_1_resolved_2");
            assert.equal(c1Hits.length, 1, "Fischl C1 must add one Oz hit while Oz is absent");
            assert.equal(c1Hits[0].attackType, "normalAttack");
            assert.equal(c1Hits[0].element, "physical");
            assert.ok(c1Hits[0].nonCrit > 0);
            assertFischlReplay(neutral, "Fischl C1 neutral");
            assertFischlReplay(c1, "Fischl C1 Oz absent");

            await evaluate(client, selectionExpression({ characterName: "フィッシュル", characterId: "10000031", weaponName: "", weaponId: "", constellation: "C6", atk: 2000, def: 1000 }));
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinBaseAtkInput");
                input.value = "500";
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await setReactionOption("electroCharged");
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const c2ToggleSelector = '[data-genshin-toggle-key="constellation:C2:c_10000031_2_1_resolved_2"]';
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(c2ToggleSelector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(c2ToggleSelector)});
                if (!input.checked) input.click();
                return input.checked;
            })()`);
            const c4ToggleSelector = '[data-genshin-toggle-key="constellation:C4:c_10000031_4_1_resolved_2"]';
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(c4ToggleSelector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(c4ToggleSelector)});
                if (!input.checked) input.click();
                return input.checked;
            })()`);
            await delay(150);
            await setMainOption(ozKey, "present");
            const present = await fischlPayload();
            const a4Hits = present.results.filter((item) => item.effectId === "t_10000031_passive2_undone_be_thy_sin");
            const c6Hits = present.results.filter((item) => item.effectId === "c_10000031_6_1_resolved_2");
            const c2 = present.results.find((item) => item.id === "damage_2");
            const c4 = present.results.find((item) => item.effectId === "c_10000031_4_1_resolved_2");
            assert.equal(a4Hits.length, 1, "Fischl A4 must add one Oz-present reaction hit");
            assert.equal(c6Hits.length, 1, "Fischl C6 must add one Oz-present coordinated hit");
            assert.equal(present.results.some((item) => item.effectId === "c_10000031_1_1_resolved_2"), false, "Fischl C1 hit must remain absent while Oz is present");
            assert.ok(a4Hits[0].nonCrit > 0 && c6Hits[0].nonCrit > 0);
            assert.ok(c2, "Fischl C2 must target the existing Oz summon damage entry");
            assert.ok(c2.appliedModifierIds.includes("c_10000031_2_1_resolved_2"), "Fischl C2 must be applied to the Oz summon damage entry");
            assert.equal(c2.additiveBaseDamage, 4000, "Fischl C2 adds 200% of 2000 ATK to the Oz summon hit");
            assert.ok(c4, "Fischl C4 burst-triggered hit must be present");
            assert.equal(c4.attackType, "burst", "Fischl C4 additional damage must retain burst attack type");
            assert.equal(c4.multiplier, 222, "Fischl C4 additional damage must use its 222% ATK scaling");
            assert.ok(c4.nonCrit > 0);
            assertFischlReplay(present, "Fischl C6 Oz present");

            const witchKeys = [
                "talent:lockedPassive:group:witch-fischl-overload",
                "talent:lockedPassive:group:witch-fischl-electrocharged"
            ];
            const witchOff = await fischlPayload();
            await setMainOption(witchKeys[0], "active");
            await setMainOption(witchKeys[1], "active");
            const ampKey = "character:10000031:group:fischl-c6-witch-amplification";
            const ampSelector = `[data-genshin-condition-key="${ampKey}"]`;
            assert.equal(await evaluate(client, `document.querySelectorAll(${JSON.stringify(ampSelector)}).length`), 1,
                "Fischl C6 Witch amplification must use one shared control for ATK and EM");
            await setMainOption(ampKey, "inactive");
            const witchBaseOn = await fischlPayload();
            const witchAmpKey = ampKey;
            const baseAtk = witchBaseOn.baseAtk;
            assert.ok(witchBaseOn.effectiveStats.atk - witchOff.effectiveStats.atk > 0, "Fischl Witch overload state must increase her own ATK");
            assert.ok(witchBaseOn.effectiveStats.elementalMastery - witchOff.effectiveStats.elementalMastery > 0, "Fischl Witch Electro-Charged state must increase her own EM");
            assert.ok(Math.abs((witchBaseOn.effectiveStats.atk - witchOff.effectiveStats.atk) - baseAtk * 0.225) < 1e-6,
                "Fischl base Witch ATK buff must be 22.5% of base ATK");
            assert.equal(witchBaseOn.effectiveStats.elementalMastery - witchOff.effectiveStats.elementalMastery, 90,
                "Fischl base Witch EM buff must be 90");
            await setMainOption(witchAmpKey, "active");
            const witchOn = await fischlPayload();
            assert.ok(Math.abs((witchOn.effectiveStats.atk - witchOff.effectiveStats.atk) - baseAtk * 0.45) < 1e-6,
                "Fischl C6 must double the Witch ATK buff to 45% of base ATK");
            assert.equal(witchOn.effectiveStats.elementalMastery - witchOff.effectiveStats.elementalMastery, 180,
                "Fischl C6 must double the Witch EM buff to 180");
            const reactionResult = (snapshot) => snapshot.results.find((item) => item.attackType === "reaction");
            assert.ok(reactionResult(witchOff)?.expected > 0, "Electro-Charged damage must be present before Fischl Witch buffs");
            assert.ok(reactionResult(witchBaseOn)?.expected > reactionResult(witchOff).expected, "Fischl Witch EM state must increase Electro-Charged damage");
            assert.ok(reactionResult(witchOn)?.expected > reactionResult(witchBaseOn).expected, "Fischl C6 amplified Witch EM must increase Electro-Charged damage");
            assert.ok(witchOn.results.find((item) => item.id === "damage")?.expected > witchOff.results.find((item) => item.id === "damage")?.expected, "Fischl Witch ATK state must increase her skill damage");
            assert.ok(witchOn.results.find((item) => item.id === "damage")?.expected > witchBaseOn.results.find((item) => item.id === "damage")?.expected, "Fischl C6 amplified Witch ATK must increase her skill damage");
            const baseC6Hit = witchBaseOn.results.find((item) => item.effectId === "c_10000031_6_1_resolved_2");
            const amplifiedC6Hit = witchOn.results.find((item) => item.effectId === "c_10000031_6_1_resolved_2");
            assert.equal(baseC6Hit?.multiplier, 30, "Fischl C6 Witch amplification must not change the C6 hit coefficient");
            assert.equal(amplifiedC6Hit?.multiplier, 30, "Fischl C6 Witch amplification must leave the C6 hit coefficient at 30%");
            assert.ok(amplifiedC6Hit.expected > baseC6Hit.expected, "Fischl C6 hit damage must increase from the amplified stats");
            await setMainOption(witchAmpKey, "inactive");
            const witchAmpOff = await fischlPayload();
            assert.equal(witchAmpOff.effectiveStats.atk, witchBaseOn.effectiveStats.atk, "disabling C6 amplification must restore base Witch ATK");
            assert.equal(witchAmpOff.effectiveStats.elementalMastery, witchBaseOn.effectiveStats.elementalMastery, "disabling C6 amplification must restore base Witch EM");
            await setMainOption(witchKeys[0], "unlocked");
            await setMainOption(witchKeys[1], "unlocked");
            await setMainOption(witchAmpKey, "active");
            const ampWithoutBase = await fischlPayload();
            assert.equal(ampWithoutBase.effectiveStats.atk, witchOff.effectiveStats.atk, "C6 amplification must not apply without the base Witch ATK effect");
            assert.equal(ampWithoutBase.effectiveStats.elementalMastery, witchOff.effectiveStats.elementalMastery, "C6 amplification must not apply without the base Witch EM effect");
            assertFischlReplay(witchOff, "Fischl Witch buffs inactive");
            assertFischlReplay(witchBaseOn, "Fischl Witch buffs active, C6 amplification inactive");
            assertFischlReplay(witchOn, "Fischl Witch buffs active");
            assertFischlReplay(witchAmpOff, "Fischl C6 amplification returned inactive");
            assertFischlReplay(ampWithoutBase, "Fischl C6 amplification without base Witch effects");
            return {
                neutralResultCount: neutral.results.length,
                c1Hit: c1Hits[0],
                a4Hit: a4Hits[0],
                c2Addition: c2.additiveBaseDamage,
                c4Hit: c4,
                c6Hit: c6Hits[0],
                witch: { atkBefore: witchOff.effectiveStats.atk, atkBase: witchBaseOn.effectiveStats.atk, atkAfter: witchOn.effectiveStats.atk, emBefore: witchOff.effectiveStats.elementalMastery, emBase: witchBaseOn.effectiveStats.elementalMastery, emAfter: witchOn.effectiveStats.elementalMastery, electroChargedBefore: reactionResult(witchOff).expected, electroChargedBase: reactionResult(witchBaseOn).expected, electroChargedAfter: reactionResult(witchOn).expected, c6Multiplier: amplifiedC6Hit.multiplier, c6DamageBase: baseC6Hit.expected, c6DamageAmplified: amplifiedC6Hit.expected }
            };
        };
        const fischlCurrentCalc = {
            a1: await fischlA1(),
            constellationDamage: await fischlConstellationDamage()
        };

        const beidouPayload = async () => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const restored = window.GenshinCalcEngine.calculateDamageRequest(
                payload.calculationRequest,
                await window.GenshinCalcData.loadGenshinCalcData()
            );
            const summarize = (result) => ({
                id: result.entry?.id,
                effectId: result.entry?.effectId || "",
                attackType: result.entry?.attackType,
                damageType: result.entry?.damageType,
                element: result.entry?.element,
                multiplier: result.breakdown?.scalingParts?.[0]?.talentMultiplier ?? null,
                damageBonus: result.breakdown?.damageBonus ?? null,
                nonCrit: result.nonCrit,
                expected: result.expected,
                additiveBaseDamage: result.breakdown?.additiveBaseDamage || 0,
                resistance: result.breakdown?.resistance ?? null,
                resistanceMultiplier: result.breakdown?.resistanceMultiplier ?? null
            });
            return {
                request: payload.calculationRequest,
                results: payload.results.map(summarize),
                restoredResults: restored.results.map(summarize),
                stats: payload.context.effectiveStats || payload.context.stats,
                baseAtk: payload.context.stats.baseAtk,
                partyModifiers: (payload.partyModifiers || []).map((item) => ({ id: item.modifier?.id, status: item.status, enabled: item.enabled, resolvedValue: item.resolvedValue }))
            };
        })()`);
        const assertBeidouReplay = (snapshot, label) => {
            assert.deepEqual(snapshot.restoredResults, snapshot.results, `${label} saved request must reproduce production results`);
        };
        const setMainStack = async (key, value) => {
            const selector = `[data-genshin-condition-key="${key}"]`;
            await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(selector)}))`);
            await evaluate(client, `(() => {
                const input = document.querySelector(${JSON.stringify(selector)});
                input.value = ${JSON.stringify(String(value))};
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(150);
        };
        const beidouSelfCurrentCalc = async () => {
            await clearSupportMembers();
            await evaluate(client, selectionExpression({ characterName: "北斗", characterId: "10000024", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 }));
            await setReactionOption("electroCharged");
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const passiveKey = "talent:passive2:group:beidou-max-counter-buff";
            const counterKey = "talent:combat2:group:beidou-counter";
            await setMainOption(passiveKey, "inactive");
            await setMainStack(counterKey, 0);
            const passiveOff = await beidouPayload();
            await setMainOption(passiveKey, "active");
            const passiveOn = await beidouPayload();
            const selectByType = (snapshot, type) => snapshot.results.filter((item) => item.attackType === type && !item.effectId);
            for (const type of ["normalAttack", "chargedAttack"]) {
                const before = selectByType(passiveOff, type);
                const after = selectByType(passiveOn, type);
                assert.ok(before.length && before.length === after.length, `Beidou passive 2 must preserve ${type} entries`);
                for (const item of after) {
                    const old = before.find((candidate) => candidate.id === item.id);
                    assert.ok(old, `Beidou passive 2 must preserve ${type} result ${item.id}`);
                    assert.equal(item.damageBonus - old.damageBonus, 15, `Beidou passive 2 must add 15% to ${type} result ${item.id}`);
                    assert.ok(item.expected > old.expected, `Beidou passive 2 must increase ${type} result ${item.id}`);
                }
            }
            for (const type of ["skill", "burst"]) {
                assert.deepEqual(selectByType(passiveOn, type), selectByType(passiveOff, type), `Beidou passive 2 must not change ${type} damage`);
            }
            const passiveState = passiveOn.request.uiState.conditionByModifier?.[passiveKey]
                || passiveOn.request.uiState.complexConditionByModifier?.[passiveKey];
            assert.equal(passiveState?.option, "active", "Beidou passive 2 option must be saved in the request");
            assertBeidouReplay(passiveOff, "Beidou passive 2 inactive");
            assertBeidouReplay(passiveOn, "Beidou passive 2 active");

            await setMainStack(counterKey, 1);
            const counterOne = await beidouPayload();
            await setMainStack(counterKey, 2);
            const counterTwo = await beidouPayload();
            const skillAt = (snapshot) => snapshot.results.find((item) => item.id === "damage");
            const counterOneState = counterOne.request.uiState.conditionByModifier?.[counterKey] || counterOne.request.uiState.complexConditionByModifier?.[counterKey];
            const counterTwoState = counterTwo.request.uiState.conditionByModifier?.[counterKey] || counterTwo.request.uiState.complexConditionByModifier?.[counterKey];
            assert.equal(counterOneState?.stack, 1,
                "Beidou one-count counter state must be saved");
            assert.equal(counterTwoState?.stack, 2,
                "Beidou two-count perfect-counter state must be saved");
            assert.ok(skillAt(counterOne) && skillAt(counterTwo), "Beidou skill result must be present for the counter stack check");
            const perCounterAdditive = counterOne.stats.atk * 2.88;
            assert.ok(Math.abs(skillAt(counterOne).additiveBaseDamage - skillAt(passiveOn).additiveBaseDamage - perCounterAdditive) < 1e-6,
                "Beidou counter stack 1 must add 288% of base ATK to only the skill entry");
            assert.ok(Math.abs(skillAt(counterTwo).additiveBaseDamage - skillAt(counterOne).additiveBaseDamage - perCounterAdditive) < 1e-6,
                "Beidou counter stack 2 must add another 288% of base ATK");
            assert.deepEqual(selectByType(counterTwo, "normalAttack"), selectByType(counterOne, "normalAttack"));
            assert.deepEqual(selectByType(counterTwo, "burst"), selectByType(counterOne, "burst"));
            assertBeidouReplay(counterOne, "Beidou counter stack 1");
            assertBeidouReplay(counterTwo, "Beidou counter stack 2");

            await evaluate(client, selectionExpression({ characterName: "北斗", characterId: "10000024", weaponName: "", weaponId: "", constellation: "C4", atk: 2000, def: 1000 }));
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const c4Key = "constellation:C4:group:beidou-after-hit";
            await setMainOption(passiveKey, "inactive");
            await setMainOption(c4Key, "inactive");
            const c4Off = await beidouPayload();
            await setMainOption(c4Key, "active");
            const c4On = await beidouPayload();
            const optionState = (snapshot, key) => snapshot.request.uiState.conditionByModifier?.[key]
                || snapshot.request.uiState.complexConditionByModifier?.[key];
            assert.equal(optionState(c4Off, passiveKey)?.option, "inactive", "Beidou C4 baseline must start with passive 2 inactive");
            assert.equal(optionState(c4On, passiveKey)?.option, "inactive", "Beidou C4 alone must retain passive 2 inactive");
            const c4Id = "c_10000024_4_1";
            const c4Hits = c4On.results.filter((item) => item.effectId.startsWith(c4Id));
            assert.ok(c4Hits.length > 0, "Beidou C4 must add its after-hit extra damage to normal attacks");
            assert.ok(c4Hits.every((item) => item.attackType === "extraDamage" && item.damageType === "extraDamage" && /^(雷|electro)$/i.test(item.element)),
                `Beidou C4 extra damage must be an Electro extraDamage entry: ${JSON.stringify(c4Hits.map((item) => ({ id: item.id, effectId: item.effectId, attackType: item.attackType, damageType: item.damageType, element: item.element })))}`);
            assert.ok(c4Hits.every((item) => item.nonCrit > 0));
            const originalNormal = (snapshot) => snapshot.results.filter((item) => item.attackType === "normalAttack" && !item.effectId);
            assert.deepEqual(originalNormal(c4On), originalNormal(c4Off), "Beidou C4 must leave original normal hits unchanged");
            for (const type of ["skill", "burst"]) assert.deepEqual(selectByType(c4On, type), selectByType(c4Off, type), `Beidou C4 extra hit must not alter ${type} damage`);
            await setMainOption(passiveKey, "active");
            const c4WithPassive2 = await beidouPayload();
            assert.equal(optionState(c4WithPassive2, passiveKey)?.option, "active", "Beidou passive 2 must be active in the C4 interaction comparison");
            assert.deepEqual(c4WithPassive2.results.filter((item) => item.effectId.startsWith(c4Id)), c4Hits,
                "Beidou passive 2 normal bonus must not increase the C4 extraDamage proc");
            const passive2Normal = originalNormal(c4WithPassive2);
            assert.equal(passive2Normal.length, originalNormal(c4On).length);
            for (const item of passive2Normal) {
                const old = originalNormal(c4On).find((candidate) => candidate.id === item.id);
                assert.equal(item.damageBonus - old.damageBonus, 15, `Beidou passive 2 must add 15% to original normal hit ${item.id}`);
                assert.ok(item.expected > old.expected, `Beidou passive 2 must increase original normal hit ${item.id}`);
            }
            assertBeidouReplay(c4Off, "Beidou C4 after-hit inactive");
            assertBeidouReplay(c4On, "Beidou C4 after-hit active");
            assertBeidouReplay(c4WithPassive2, "Beidou C4 extraDamage isolated from passive 2");

            await evaluate(client, selectionExpression({ characterName: "北斗", characterId: "10000024", weaponName: "", weaponId: "", constellation: "C6", atk: 2000, def: 1000 }));
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const c6Key = "constellation:C6:group:witch-revelation-beidou-c6";
            const c6Selector = `[data-genshin-condition-key="${c6Key}"]`;
            assert.equal(await evaluate(client, `document.querySelectorAll(${JSON.stringify(c6Selector)}).length`), 1,
                "Beidou C6 and Witch conditions must share one state control");
            await setMainOption(c6Key, "unlocked");
            const c6Off = await beidouPayload();
            await setMainOption(c6Key, "burst");
            const c6Burst = await beidouPayload();
            await setMainOption(c6Key, "active");
            const c6Witch = await beidouPayload();
            const electroSkill = (snapshot) => snapshot.results.find((item) => item.id === "damage" && /^(雷|electro)$/i.test(item.element));
            assert.ok(Number.isFinite(electroSkill(c6Off)?.resistance), "Beidou Electro skill must expose its baseline enemy resistance");
            assert.equal(electroSkill(c6Burst)?.resistance, electroSkill(c6Off)?.resistance - 15,
                "ordinary Beidou C6 burst state must lower enemy Electro resistance by 15 points");
            assert.equal(electroSkill(c6Witch)?.resistance, electroSkill(c6Burst)?.resistance,
                "Witch-active Beidou C6 must retain the ordinary Electro resistance reduction");
            assert.equal(c6Witch.stats.elementalMastery - c6Burst.stats.elementalMastery, 200,
                "Witch-active Beidou C6 must grant 200 EM to the active Beidou");
            const reaction = (snapshot) => snapshot.results.find((item) => item.attackType === "reaction")?.expected;
            if (reaction(c6Burst) !== undefined && reaction(c6Burst) > 0) {
                assert.ok(reaction(c6Witch) > reaction(c6Burst), "Beidou C6 Witch EM must increase her Electro-Charged damage");
            }
            const c6State = (snapshot) => snapshot.request.uiState.conditionByModifier?.[c6Key]
                || snapshot.request.uiState.complexConditionByModifier?.[c6Key];
            assert.equal(c6State(c6Off)?.option, "unlocked");
            assert.equal(c6State(c6Burst)?.option, "burst");
            assert.equal(c6State(c6Witch)?.option, "active");
            assertBeidouReplay(c6Off, "Beidou C6 condition inactive");
            assertBeidouReplay(c6Burst, "Beidou C6 burst state");
            assertBeidouReplay(c6Witch, "Beidou C6 Witch active");
            return {
                passive2: { normalBefore: selectByType(passiveOff, "normalAttack")[0]?.expected, normalAfter: selectByType(passiveOn, "normalAttack")[0]?.expected, chargedBefore: selectByType(passiveOff, "chargedAttack")[0]?.expected, chargedAfter: selectByType(passiveOn, "chargedAttack")[0]?.expected },
                counterAdditive: [skillAt(passiveOn).additiveBaseDamage, skillAt(counterOne).additiveBaseDamage, skillAt(counterTwo).additiveBaseDamage],
                c4ExtraHitCount: c4Hits.length,
                c6: { electroResistanceBurst: electroSkill(c6Burst)?.resistance, electroResistanceWitch: electroSkill(c6Witch)?.resistance, emBurst: c6Burst.stats.elementalMastery, emWitch: c6Witch.stats.elementalMastery }
            };
        };
        const beidouPartyC6Witch = async () => {
            await clearSupportMembers();
            const selection = { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 };
            await evaluate(client, selectionExpression(selection));
            const selected = await evaluate(client, `(() => {
                const member = window.GenshinPartyState.characterForId("10000024");
                const result = window.GenshinPartyState.setPartySelection(2, "character", member);
                const constellation = document.getElementById("genshinPartyConstellation2");
                constellation.value = "6";
                constellation.dispatchEvent(new Event("change", { bubbles: true }));
                return result;
            })()`);
            assert.equal(selected, true, "Beidou must be selectable as a C6 party support");
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const key = "party:2:10000024:group:witch-revelation-beidou-c6";
            const selector = `[data-genshin-party-condition-key="${key}"]`;
            assert.equal(await evaluate(client, `document.querySelectorAll(${JSON.stringify(selector)}).length`), 1,
                "Beidou party Electro/Cryo/EM C6 conditions must share one control");
            const snapshot = async () => evaluate(client, `(async () => {
                const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
                const restored = window.GenshinCalcEngine.calculateDamageRequest(payload.calculationRequest, await window.GenshinCalcData.loadGenshinCalcData());
                const summarize = (result) => ({
                    id: result.entry?.id,
                    effectId: result.entry?.effectId || "",
                    attackType: result.entry?.attackType,
                    damageType: result.entry?.damageType,
                    element: result.entry?.element,
                    expected: result.expected,
                    resistance: result.breakdown?.resistance ?? null,
                    resistanceMultiplier: result.breakdown?.resistanceMultiplier ?? null
                });
                return {
                    results: payload.results.map(summarize),
                    replay: restored.results.map(summarize),
                    stats: payload.context.effectiveStats || payload.context.stats,
                    states: payload.calculationRequest.party.conditionStates,
                    candidates: payload.partyModifiers.filter((item) => ["c_10000024_6_1", "c_10000024_6_lucid_cryo_res", "c_10000024_6_lucid_active_em"].includes(item.modifier?.id)).map((item) => ({ id: item.modifier.id, status: item.status, enabled: item.enabled, value: item.resolvedValue }))
                };
            })()`);
            const setState = async (value) => {
                await evaluate(client, `(() => {
                    const input = document.querySelector(${JSON.stringify(selector)});
                    input.value = ${JSON.stringify(value)};
                    input.dispatchEvent(new Event("change", { bubbles: true }));
                    return input.value;
                })()`);
                await delay(150);
            };
            await setState("locked");
            const off = await snapshot();
            await setState("burst");
            const burst = await snapshot();
            await setState("active");
            const active = await snapshot();
            const getResult = (data, type) => data.results.find((item) => item.attackType === type && !item.effectId);
            const getCryoCharged = (data) => data.results.filter((item) => item.attackType === "chargedAttack" && item.element === "氷" && !item.effectId);
            const getCryoBurst = (data) => data.results.find((item) => item.attackType === "burst" && item.element === "氷" && !item.effectId);
            const getCandidate = (data, id) => data.candidates.find((item) => item.id === id);
            assert.equal(burst.states?.[key]?.option, "burst", "Beidou party request must preserve ordinary burst state");
            assert.equal(active.states?.[key]?.option, "active", "Beidou party request must preserve Witch-active state");
            assert.equal(getCandidate(burst, "c_10000024_6_1")?.value, -15, "ordinary party Beidou C6 must expose its Electro resistance debuff");
            assert.equal(getCandidate(burst, "c_10000024_6_lucid_cryo_res")?.value, 0, "ordinary party Beidou C6 must not lower Cryo resistance");
            assert.equal(getCandidate(active, "c_10000024_6_1")?.value, -15, "Witch-active party Beidou C6 must retain the Electro resistance debuff");
            assert.equal(getCandidate(active, "c_10000024_6_lucid_cryo_res")?.value, -15, "Witch-active party Beidou C6 must lower Cryo resistance");
            assert.equal(getCandidate(active, "c_10000024_6_lucid_active_em")?.value, 200, "Witch-active party Beidou C6 must grant 200 EM to the active character");
            assert.equal(active.stats.elementalMastery - burst.stats.elementalMastery, 200);
            assert.deepEqual(getCryoCharged(burst), getCryoCharged(off),
                "ordinary Beidou C6 Electro shred must not change Ganyu's Cryo charged attack");
            assert.equal(getCryoBurst(burst)?.expected, getCryoBurst(off)?.expected,
                "ordinary Beidou C6 Electro shred must not change Ganyu's Cryo burst");
            const chargedBurst = getCryoCharged(burst);
            const chargedActive = getCryoCharged(active);
            assert.equal(chargedActive.length, chargedBurst.length, "Witch-active Beidou C6 must preserve Ganyu's Cryo charged hit set");
            assert.ok(chargedActive.every((item) => item.expected > chargedBurst.find((candidate) => candidate.id === item.id)?.expected),
                `Witch-active Beidou C6 Cryo shred must increase Ganyu's Cryo charged attack: ${JSON.stringify({
                    cryoChargedBurst: chargedBurst.map((item) => ({ id: item.id, expected: item.expected, resistance: item.resistance })),
                    cryoChargedActive: chargedActive.map((item) => ({ id: item.id, expected: item.expected, resistance: item.resistance })),
                    candidates: active.candidates
                })}`);
            assert.ok(getCryoBurst(active)?.expected > getCryoBurst(burst)?.expected,
                "Witch-active Beidou C6 Cryo shred must increase Ganyu's Cryo burst");
            assert.equal(getResult(active, "normalAttack")?.expected, getResult(burst, "normalAttack")?.expected,
                "Witch-active Beidou C6 Cryo shred must not change Ganyu's physical normal attack");
            for (const [state, label] of [[off, "inactive"], [burst, "burst"], [active, "Witch active"]]) {
                assert.deepEqual(state.replay, state.results, `Beidou party C6 ${label} saved request must reproduce production results`);
            }
            return { cryoCharged: { off: getCryoCharged(off).map((item) => item.expected), burst: chargedBurst.map((item) => item.expected), active: chargedActive.map((item) => item.expected) }, cryoBurst: { off: getCryoBurst(off)?.expected, burst: getCryoBurst(burst)?.expected, active: getCryoBurst(active)?.expected }, normal: { burst: getResult(burst, "normalAttack")?.expected, active: getResult(active, "normalAttack")?.expected }, em: { burst: burst.stats.elementalMastery, active: active.stats.elementalMastery } };
        };
        const beidouCurrentCalc = {
            self: await beidouSelfCurrentCalc(),
            partyC6Witch: await beidouPartyC6Witch()
        };


        const nicoleCurrentCalc = await (async () => {
            const ids = { c1: "c_10000131_1_1", c4: "c_nicole_4_guidance_blessing_atk_add_v7", c6: "c_10000131_6_1", projection: "t_10000131_combat3_projection" };
            const select = async (selector, value, enabled = false) => {
                await waitFor(client, "Boolean(document.querySelector(" + JSON.stringify(selector) + "))");
                await evaluate(client, "(() => { const el=document.querySelector(" + JSON.stringify(selector) + "); el.value=" + JSON.stringify(value) + "; el.dispatchEvent(new Event('change',{bubbles:true})); const toggle=el.closest('[data-party-buff]')?.querySelector('[data-genshin-party-buff-key]'); if(toggle && toggle.checked !== " + JSON.stringify(enabled) + ") toggle.click(); return true; })()");
                await delay(150);
            };
            const mainOption = (group, value) => select('[data-genshin-condition-key*="' + group + '"]', value);
            const capture = () => evaluate(client, "(async()=>{const p=await window.GenshinCalcEngine.runGenshinJsonCalc();const d=await window.GenshinCalcData.loadGenshinCalcData();const r=window.GenshinCalcEngine.calculateDamageRequest(p.calculationRequest,d);const f=x=>({id:x.entry?.id||'',effectId:x.entry?.effectId||'',attackType:x.entry?.attackType||'',damageType:x.entry?.damageType||'',element:x.entry?.element||'',canReact:x.entry?.canReact??null,reactionId:x.breakdown?.reaction?.reactionId||'',expected:x.expected,resistance:x.breakdown?.resistance??null,additive:x.breakdown?.additiveBaseDamage??0,defIgnore:x.breakdown?.defenseIgnore??0,statValue:x.breakdown?.scalingParts?.[0]?.statValue??null,multiplier:x.breakdown?.scalingParts?.[0]?.talentMultiplier??null,});return{results:p.results.map(f),replay:r.results.map(f),ui:p.calculationRequest.uiState?.conditionByModifier||{},party:p.calculationRequest.party||{},stats:p.context?.effectiveStats||p.context?.stats||{}};})()");
            const assertReplay = (s,label) => assert.deepEqual(s.replay,s.results,label+" request replay");
            const effect = (s,id) => s.results.filter(x=>x.effectId===id||x.effectId.startsWith(id));
            const normal = s => s.results.find(x=>x.attackType==="normalAttack"&&!x.effectId);
            const byId = (s,id) => s.results.find(x=>x.id===id||x.effectId===id);
            await clearSupportMembers();
            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C0",atk:2000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-projection","active");
            await mainOption("nicole-hexerei","inactive");
            const selfProjectionAtkOff=await capture();
            await mainOption("nicole-hexerei","active");
            const selfProjectionAtkOn=await capture();
            assert.equal(effect(selfProjectionAtkOff,ids.projection).length,1);
            assert.equal(effect(selfProjectionAtkOn,ids.projection).length,1);
            assert.equal(effect(selfProjectionAtkOff,ids.projection)[0].additive,0);
            assert.equal(effect(selfProjectionAtkOn,ids.projection)[0].additive-effect(selfProjectionAtkOff,ids.projection)[0].additive,6000,"Nicole's Hexerei projection must add 300% of her 2000 ATK to the normal shadow hit");
            for(const [state,label] of [[selfProjectionAtkOff,"inactive"],[selfProjectionAtkOn,"active"]]) assertReplay(state,"Nicole self Hexerei projection ATK "+label);

            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C1",atk:2000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-projection","active");
            await mainOption("nicole-hexerei","inactive");
            await mainOption("nicole-c1-projection","inactive");
            const selfC1Off=await capture();
            assert.equal(effect(selfC1Off,ids.c1)[0]?.expected??0,0);
            await mainOption("nicole-hexerei","active");
            await mainOption("nicole-c1-projection","active");
            const selfC1On=await capture();
            const selfHit=effect(selfC1On,ids.c1);
            assert.equal(selfHit.length,1);
            assert.deepEqual([selfHit[0].attackType,selfHit[0].damageType,selfHit[0].element,selfHit[0].canReact,selfHit[0].reactionId,selfHit[0].statValue,selfHit[0].multiplier],["extraDamage","extraDamage","炎",false,"none",2000,600]);
            assert.equal(Object.entries(selfC1On.ui).find(([k])=>k.includes("nicole-c1-projection"))?.[1]?.option,"active");
            assert.equal(selfHit[0].additive,0,"Nicole C1 remains a 600% hit and receives no Hexerei projection ATK");
            assert.equal(effect(selfC1On,ids.projection)[0]?.additive-effect(selfC1Off,ids.projection)[0]?.additive,6000,"Hexerei projection ATK applies only to Nicole's normal shadow");
            for (const id of ["damage", "skilldamage", "burstdamage"]) assert.equal(byId(selfC1On,id)?.expected,byId(selfC1Off,id)?.expected,"Nicole C1 extra hit must not buff the original " + id + " entry");
            assertReplay(selfC1Off,"Nicole self C1 off"); assertReplay(selfC1On,"Nicole self C1 on");

            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C0",atk:5000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-hexerei","inactive");
            await mainOption("nicole-projection","inactive");
            await mainOption("nicole-guidance","inactive");
            const blessingOff=await capture();
            await mainOption("nicole-guidance","grace");
            const blessingGrace=await capture();
            await mainOption("nicole-guidance","guidance");
            const blessingGuidance=await capture();
            assert.equal(blessingOff.stats.atk,5000);
            assert.equal(blessingGrace.stats.atk,5600,"Lv.10 ATK scaling must cap 15% of 5000 at 600");
            assert.equal(blessingGuidance.stats.atk,5900,"Guidance adds the separate A1 +300 ATK");
            for(const [state,label] of [[blessingOff,"inactive"],[blessingGrace,"grace"],[blessingGuidance,"guidance"]]) assertReplay(state,"Nicole C0 blessing "+label);

            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C2",atk:2000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-hexerei","inactive");
            await mainOption("nicole-projection","inactive");
            await mainOption("nicole-guidance","inactive");
            const c2Off=await capture();
            await mainOption("nicole-guidance","grace");
            const c2Grace=await capture();
            await mainOption("nicole-guidance","guidance");
            const c2Guidance=await capture();
            assert.deepEqual([c2Off.stats.atk,c2Grace.stats.atk,c2Guidance.stats.atk],[2000,2600,2900]);
            assert.equal(byId(c2Grace,"skilldamage")?.resistance,10,"C2 Grace must not lower resistance");
            assert.equal(byId(c2Guidance,"skilldamage")?.resistance,-15,"C2 Guidance lowers matching Pyro resistance by 25%");
            for(const [state,label] of [[c2Off,"inactive"],[c2Grace,"grace"],[c2Guidance,"guidance"]]) assertReplay(state,"Nicole C2 "+label);

            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C6",atk:2000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-hexerei","inactive");
            await mainOption("nicole-projection","inactive");
            await mainOption("nicole-guidance","inactive");
            const selfC6Off=await capture();
            assert.equal(normal(selfC6Off)?.defIgnore,0);
            await mainOption("nicole-guidance","grace");
            const selfC6Grace=await capture();
            assert.equal(normal(selfC6Grace)?.defIgnore,0,"Nicole C6 must stay off in Grace");
            await mainOption("nicole-guidance","guidance");
            const selfC6On=await capture();
            assert.equal(normal(selfC6On)?.defIgnore,40,"Nicole C6 applies only in Guidance");
            assert.ok(normal(selfC6On)?.expected>normal(selfC6Grace)?.expected,"Nicole C6 Guidance must increase self damage");
            for(const [state,label] of [[selfC6Off,"inactive"],[selfC6Grace,"grace"],[selfC6On,"guidance"]]) assertReplay(state,"Nicole self C6 "+label);

            await evaluate(client,selectionExpression({characterName:"ニコル",characterId:"10000131",constellation:"C0",atk:2000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await mainOption("nicole-guidance","inactive");
            await mainOption("nicole-projection","inactive");
            await mainOption("nicole-hexerei","inactive");
            const qOff=await capture();
            await mainOption("nicole-projection","active");
            const qBase=await capture();
            await mainOption("nicole-hexerei","active");
            const qOn=await capture();
            const qHit=effect(qOn,ids.projection);
            assert.equal(qHit.length,1,"Nicole Burst projection must be one independent hit");
            assert.deepEqual([qHit[0].attackType,qHit[0].damageType,qHit[0].element,qHit[0].canReact,qHit[0].reactionId,qHit[0].statValue,qHit[0].multiplier],["extraDamage","extraDamage","炎",false,"none",2000,180]);
            assert.equal(effect(qBase,ids.projection)[0]?.additive,0);
            assert.equal(qHit[0].additive,6000,"Nicole's Hexerei projection ATK must increase her active Burst shadow");
            assert.ok(qHit[0].expected>effect(qBase,ids.projection)[0].expected,"Nicole's Hexerei option must increase projection damage");
            for(const id of ["damage","skilldamage","burstdamage"]) assert.equal(byId(qOn,id)?.expected,byId(qOff,id)?.expected,"Nicole Burst projection must not alter the original "+id+" entry");
            assertReplay(qOff,"Nicole Burst projection inactive"); assertReplay(qOn,"Nicole Burst projection active");

            await clearSupportMembers();
            await evaluate(client,selectionExpression({characterName:"甘雨",characterId:"10000037",constellation:"C0",atk:2500,def:1000}));
            const selected=await evaluate(client,"(()=>{const ok=window.GenshinPartyState.setPartySelection(2,'character',window.GenshinPartyState.characterForId('10000131'));const c=document.getElementById('genshinPartyConstellation2');c.value='6';c.dispatchEvent(new Event('change',{bubbles:true}));const a=document.getElementById('genshinPartyAtk2');a.value='2000';a.dispatchEvent(new Event('input',{bubbles:true}));a.dispatchEvent(new Event('change',{bubbles:true}));return ok;})()");
            assert.equal(selected,true);
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            const meta=await evaluate(client,"(async()=>{const p=window.GenshinCalcConditions.conditionPanelState(window.GenshinCalcEngine.buildCharacterCalcContext(),await window.GenshinCalcData.loadGenshinCalcData());return "+JSON.stringify([ids.c1,ids.c4,ids.c6])+".map(id=>{const x=p.partyModifiers.find(y=>y.modifier?.id===id);return x?{id,key:x.partyConditionStateKey||x.analysis?.conditionStateKey,group:x.modifier.conditionGroupId||''}:{id};});})()");
            assert.ok(meta.every(x=>x.key),"Nicole party C1/C4/C6 conditions must render: "+JSON.stringify(meta));
            assert.deepEqual(meta.map(x=>x.group),["nicole-c1-projection","nicole-pathfinder-blessing","nicole-guidance"]);
            const key=id=>meta.find(x=>x.id===id).key;
            const partyOption=(id,value,on=false)=>select('[data-genshin-party-condition-key="'+key(id)+'"]',value,on);
            await partyOption(ids.c1,"inactive"); await partyOption(ids.c4,"inactive"); await partyOption(ids.c6,"inactive");
            const partyC1Off=await capture();
            assert.equal(effect(partyC1Off,ids.c1)[0]?.expected??0,0);
            await partyOption(ids.c1,"active");
            const partyC1On=await capture();
            const projected=effect(partyC1On,ids.c1);
            assert.equal(projected.length,1);
            assert.deepEqual([projected[0].attackType,projected[0].damageType,projected[0].element,projected[0].canReact,projected[0].reactionId,projected[0].statValue,projected[0].multiplier],["extraDamage","extraDamage","氷",false,"none",2500,600]);
            assert.equal(partyC1On.party.members.find(x=>x.characterId==="10000131")?.constellation,6);
            assertReplay(partyC1Off,"Nicole party C1 off"); assertReplay(partyC1On,"Nicole party C1 on");

            await partyOption(ids.c1,"inactive");
            const partyC4Off=await capture();
            await partyOption(ids.c4,"active",true);
            const partyC4On=await capture();
            const skill=s=>s.results.find(x=>x.id==="skilldamage");
            assert.ok(skill(partyC4Off)&&skill(partyC4On));
            assert.equal(skill(partyC4On).additive-skill(partyC4Off).additive,1400,"Nicole C4 must add 70% of provider ATK to Ganyu's skill hit");
            assert.equal(effect(partyC4On,ids.c4).length,0);
            assert.equal(partyC4On.party.conditionStates[key(ids.c4)]?.option,"active");
            assertReplay(partyC4Off,"Nicole party C4 off"); assertReplay(partyC4On,"Nicole party C4 on");

            await partyOption(ids.c4,"inactive"); await partyOption(ids.c6,"inactive");
            const partyC6Off=await capture();
            await partyOption(ids.c6,"grace",true);
            const partyC6Grace=await capture();
            assert.equal(normal(partyC6Grace)?.defIgnore,0,"Nicole party C6 must stay off in Grace");
            await partyOption(ids.c6,"guidance",true);
            const partyC6On=await capture();
            assert.equal(normal(partyC6On)?.defIgnore,40,"Nicole party C6 applies only in Guidance");
            assert.ok(normal(partyC6On)?.expected>normal(partyC6Grace)?.expected,"Nicole party C6 Guidance must increase Ganyu damage");
            assert.equal(partyC6On.party.conditionStates[key(ids.c6)]?.option,"guidance");
            for(const [state,label] of [[partyC6Off,"inactive"],[partyC6Grace,"grace"],[partyC6On,"guidance"]]) assertReplay(state,"Nicole party C6 "+label);
            const projectionAtkId="t_10000131_hexerei_projection_atk";
            const partyModifierKey=async(id)=>evaluate(client,"(async()=>{const p=window.GenshinCalcConditions.conditionPanelState(window.GenshinCalcEngine.buildCharacterCalcContext(),await window.GenshinCalcData.loadGenshinCalcData());const x=p.partyModifiers.find(y=>y.modifier?.id==="+JSON.stringify(id)+");return x?.partyConditionStateKey||x?.analysis?.conditionStateKey||null;})()");
            const partyModifierOption=(id,value,on=false)=>partyModifierKey(id).then(key=>{assert.ok(key,"Nicole party modifier condition must render: "+id);return select('[data-genshin-party-condition-key="'+key+'"]',value,on);});
            await clearSupportMembers();
            await evaluate(client,selectionExpression({characterName:"スクロース",characterId:"10000043",constellation:"C0",atk:2500,def:1000}));
            const sucroseNicoleSelected=await evaluate(client,"(()=>{const ok=window.GenshinPartyState.setPartySelection(2,'character',window.GenshinPartyState.characterForId('10000131'));const c=document.getElementById('genshinPartyConstellation2');c.value='1';c.dispatchEvent(new Event('change',{bubbles:true}));const a=document.getElementById('genshinPartyAtk2');a.value='2000';a.dispatchEvent(new Event('input',{bubbles:true}));a.dispatchEvent(new Event('change',{bubbles:true}));return ok;})()");
            assert.equal(sucroseNicoleSelected,true);
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            await partyModifierOption(ids.projection,"active");
            await partyModifierOption(projectionAtkId,"inactive");
            await partyModifierOption(ids.c1,"active");
            const sucroseProjectionAtkOff=await capture();
            await partyModifierOption(projectionAtkId,"active",true);
            const sucroseProjectionAtkOn=await capture();
            assert.equal(effect(sucroseProjectionAtkOff,ids.projection).length,1);
            assert.equal(effect(sucroseProjectionAtkOn,ids.projection).length,1);
            assert.equal(effect(sucroseProjectionAtkOff,ids.projection)[0].additive,0);
            assert.equal(effect(sucroseProjectionAtkOn,ids.projection)[0].additive-effect(sucroseProjectionAtkOff,ids.projection)[0].additive,6000,"Nicole adds 300% of her 2000 provider ATK to Sucrose's normal shadow");
            assert.equal(effect(sucroseProjectionAtkOn,ids.c1)[0]?.additive,0,"Nicole Hexerei ATK must not apply to her C1 shadow");
            assertReplay(sucroseProjectionAtkOff,"Nicole Hexerei ATK on Sucrose inactive"); assertReplay(sucroseProjectionAtkOn,"Nicole Hexerei ATK on Sucrose active");

            await evaluate(client,selectionExpression({characterName:"甘雨",characterId:"10000037",constellation:"C0",atk:2500,def:1000}));
            await clickAndWait(client,"#genshinJsonPrepareConditionsButton");
            const ganyuProjectionAtkOn=await capture();
            assert.equal(effect(ganyuProjectionAtkOn,ids.projection).length,1,"Ganyu's result retains the projection shadow entry");
            assert.equal(effect(ganyuProjectionAtkOn,ids.projection)[0].additive,0,"Nicole Hexerei projection ATK must not affect Ganyu's projection shadow");
            assert.equal(ganyuProjectionAtkOn.party.conditionStates[await partyModifierKey(projectionAtkId)]?.option,"active","Nicole Hexerei option must persist while changing the active character");
            const ganyuC1Projection=effect(ganyuProjectionAtkOn,ids.c1);
            assert.equal(ganyuC1Projection.length,1);
            assert.equal(ganyuC1Projection[0].additive,0,"Nicole Hexerei projection ATK must not affect Ganyu's separate C1 shadow");
            assertReplay(sucroseProjectionAtkOff,"Nicole Hexerei ATK Sucrose baseline"); assertReplay(ganyuProjectionAtkOn,"Nicole Hexerei ATK on Ganyu with retained active option and C1");
            return { selfC1:selfHit[0],selfProjectionAtk:{inactive:effect(selfProjectionAtkOff,ids.projection)[0].additive,active:effect(selfProjectionAtkOn,ids.projection)[0].additive},blessingCap:{inactive:blessingOff.stats.atk,grace:blessingGrace.stats.atk,guidance:blessingGuidance.stats.atk},c2:{inactive:c2Off.stats.atk,grace:c2Grace.stats.atk,guidance:c2Guidance.stats.atk,resistance:{grace:byId(c2Grace,"skilldamage")?.resistance,guidance:byId(c2Guidance,"skilldamage")?.resistance}},selfC6:{grace:normal(selfC6Grace)?.expected,guidance:normal(selfC6On)?.expected,defIgnore:normal(selfC6On)?.defIgnore},burstProjection:qHit[0],partyC1:projected[0],partyC4:{off:skill(partyC4Off)?.additive,on:skill(partyC4On)?.additive},partyC6:{grace:normal(partyC6Grace)?.expected,guidance:normal(partyC6On)?.expected,defIgnore:normal(partyC6On)?.defIgnore},projectionAtkParty:{sucrose:effect(sucroseProjectionAtkOn,ids.projection)[0]?.additive??0,ganyuC1:ganyuC1Projection[0].additive} };
        })();

        await clearSupportMembers();
        await evaluate(client, selectionExpression({ characterName: "アルベド", characterId: "10000038", weaponName: "", weaponId: "", constellation: "C2", atk: 1000, def: 2000 }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const albedoHpSelector = '[data-genshin-condition-key="talent:passive1:t_10000038_passive1_transient_blossom_bonus"]';
        const albedoResourceSelector = '[data-genshin-resource-key="character:10000038:resource:fatalReckoning"]';
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(albedoHpSelector)}) && document.querySelector(${JSON.stringify(albedoResourceSelector)}))`);
        const albedoDamage = async () => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const find = (id) => payload.results.find((item) => item.entry.id === id);
            return {
                blossom: find("damage").nonCrit,
                placement: find("skilldamage").nonCrit,
                burst: find("burstdamage").nonCrit,
                burstAddition: find("burstdamage").breakdown.additiveBaseDamage,
                fatalAddition: find("damage_2").breakdown.additiveBaseDamage,
                chargedHits: payload.results.filter((item) => item.entry.attackType === "chargedAttack").map((item) => ({
                    param: item.entry.source.param,
                    multiplier: item.breakdown.scalingParts[0].talentMultiplier,
                    damage: item.nonCrit
                })),
                c2Reasons: payload.candidateModifiers.filter((item) => item.modifier?.id?.startsWith("c_10000038_2")).map((item) => item.reason),
                resource: payload.calculationRequest.manualInputs.resourceStates,
                hpState: payload.calculationRequest.uiState.conditionByModifier["talent:passive1:t_10000038_passive1_transient_blossom_bonus"]?.option
            };
        })()`);
        await evaluate(client, `(() => {
            const hp = document.querySelector(${JSON.stringify(albedoHpSelector)});
            hp.value = "inactive";
            hp.dispatchEvent(new Event("change", { bubbles: true }));
            const count = document.querySelector(${JSON.stringify(albedoResourceSelector)});
            count.value = "0";
            count.dispatchEvent(new Event("input", { bubbles: true }));
            count.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        const albedoBefore = await albedoDamage();
        await evaluate(client, `(() => {
            const hp = document.querySelector(${JSON.stringify(albedoHpSelector)});
            hp.value = "belowHalf";
            hp.dispatchEvent(new Event("change", { bubbles: true }));
            const count = document.querySelector(${JSON.stringify(albedoResourceSelector)});
            count.value = "4";
            count.dispatchEvent(new Event("input", { bubbles: true }));
            count.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        const albedoAfter = await albedoDamage();
        assert.deepEqual(albedoAfter.chargedHits.map((item) => item.param), ["param6", "param7"]);
        assert.deepEqual(albedoAfter.chargedHits.map((item) => item.multiplier), [93.5, 119]);
        assert.ok(albedoAfter.chargedHits.every((item) => item.damage > 0));
        assert.ok(albedoAfter.blossom > albedoBefore.blossom);
        assert.equal(albedoAfter.placement, albedoBefore.placement);
        assert.ok(albedoAfter.burst > albedoBefore.burst, JSON.stringify({ albedoBefore, albedoAfter }));
        assert.equal(albedoAfter.burstAddition, 2400);
        assert.equal(albedoAfter.fatalAddition, 2400);
        assert.equal(albedoAfter.hpState, "belowHalf");

        const uidPartyBridge = await evaluate(client, `(() => {
            const character = {
                schemaVersion: 2,
                source: "uidProfile",
                id: "10000032",
                level: 90,
                constellation: 6,
                talents: { normal: 6, skill: 9, burst: 13, alternate: 12 },
                weapon: { id: "11501", level: 90, rank: 5, name: "Test Sword", effect: "snapshot-only" },
                artifacts: [0, 1, 2, 3, 4].map((index) => ({ id: String(index), setId: "10007", slot: index, name: "Artifact " + index })),
                stats: { baseHp: 12397, baseAtk: 865, baseDef: 771, hp: 30000, atk: 1800, def: 900, elementalMastery: 120, critRate: 61.7, critDamage: 142.4, energyRecharge: 133.3 },
                provenance: { source: "uidProfile", rawCharacterId: "10000032", includesPersistentBonuses: true, additivePolicy: "externalModifiersOnly" }
            };
            const input = window.GenshinProfileMapper.toCalculationInput(character);
            window.dispatchEvent(new CustomEvent("genshin:calculation-input-selected", { detail: { input, profile: { characters: [character] } } }));
            const selected = window.GenshinPartyState.setPartySelection(2, "character", window.GenshinPartyState.characterForId("10000032"));
            const before = window.GenshinPartyState.getSupportState().members[0];
            const atk = document.getElementById("genshinPartyAtk2");
            atk.value = "1900";
            atk.dispatchEvent(new Event("input", { bubbles: true }));
            const after = window.GenshinPartyState.getSupportState().members[0];
            const level = document.getElementById("genshinPartyLevel2");
            level.value = "80";
            level.dispatchEvent(new Event("input", { bubbles: true }));
            const afterLevelEdit = window.GenshinPartyState.getSupportState().members[0];
            return {
                selected,
                importedLevel: before.level,
                constellation: document.getElementById("genshinPartyConstellation2").value,
                burst: document.getElementById("genshinPartyBurstTalent2").value,
                weapon: document.getElementById("genshinPartyWeapon2").value,
                artifactMode: document.getElementById("genshinPartyArtifactMode2").value,
                beforeSource: before.provenance.source,
                afterSource: after.provenance.source,
                sourceSnapshot: after.provenance.sourceSnapshot,
                retainedFromUid: after.provenance.retainedFromUid,
                uidBaseAtk: before.stats.baseAtk,
                manualLevelUsesDerivedBase: afterLevelEdit.stats.baseAtk !== before.stats.baseAtk,
                snapshotArtifactCount: before.profileSnapshot.artifacts.length,
                snapshotExtraTalent: before.profileSnapshot.talents.alternate,
                snapshotCritRate: after.profileSnapshot.stats.critRate,
                snapshotStableAfterEdits: JSON.stringify(before.profileSnapshot) === JSON.stringify(afterLevelEdit.profileSnapshot),
                onField: after.combatState.onField,
                buffStateCount: Object.keys(after.buffStates).length
            };
        })()`);
        assert.deepEqual(uidPartyBridge, {
            selected: true,
            importedLevel: 90,
            constellation: "6",
            burst: "13",
            weapon: "11501",
            artifactMode: "4pc",
            beforeSource: "uidProfile",
            afterSource: "mixed",
            sourceSnapshot: "uidProfile",
            retainedFromUid: true,
            uidBaseAtk: 865,
            manualLevelUsesDerivedBase: true,
            snapshotArtifactCount: 5,
            snapshotExtraTalent: 12,
            snapshotCritRate: 61.7,
            snapshotStableAfterEdits: true,
            onField: false,
            buffStateCount: 0
        });

        const layoutAudit = await evaluate(client, `(() => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            const talentIds = ["genshinNormalTalentLevel", "genshinSkillTalentLevel", "genshinBurstTalentLevel"];
            const talentControls = talentIds.map((id) => {
                const element = document.getElementById(id);
                const style = getComputedStyle(element);
                context.font = style.font;
                const text = element.options[element.selectedIndex].text;
                return {
                    id,
                    text,
                    width: element.getBoundingClientRect().width,
                    requiredWidth: Math.ceil(context.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2),
                    fontSize: style.fontSize
                };
            });
            const artifactMode = document.getElementById("genshinArtifactSetMode");
            const artifactTrigger = document.getElementById("genshinArtifactSetOneTrigger");
            const artifactSelect = document.getElementById("genshinArtifactSetOne");
            const cardStyle = getComputedStyle(document.querySelector(".genshin-combat-input-grid > .genshin-profile-stat-inputs"));
            const unitElements = [...document.querySelectorAll(".genshin-compact-stats .genshin-field > span, .genshin-combat-input-grid .genshin-field > span")]
                .filter((element) => element.previousElementSibling?.matches("input"));
            const unitStyles = unitElements
                .map((element) => {
                    const style = getComputedStyle(element);
                    return [style.right, style.bottom, style.fontSize].join("|");
                });
            const unitCenterOffsets = unitElements
                .map((element) => {
                    const input = element.previousElementSibling;
                    const inputRect = input.getBoundingClientRect();
                    const unitRect = element.getBoundingClientRect();
                    return Math.round((unitRect.top + unitRect.height / 2) - (inputRect.top + inputRect.height / 2));
                });
            const selectStyles = [...document.querySelectorAll(".genshin-reflect-inputs select:not([hidden]), .genshin-json-calc-production select:not([hidden])")]
                .filter((element) => element.offsetParent !== null)
                .map((element) => {
                    const style = getComputedStyle(element);
                    return [style.appearance, style.backgroundPosition, style.backgroundSize, style.paddingRight, style.backgroundImage.includes("svg")].join("|");
                });
            artifactMode.value = "";
            artifactMode.dispatchEvent(new Event("change", { bubbles: true }));
            const artifactModeStyle = getComputedStyle(artifactMode);
            const emptyModeText = artifactMode.options[artifactMode.selectedIndex].text;
            context.font = artifactModeStyle.font;
            const emptyModeRequiredWidth = Math.ceil(context.measureText(emptyModeText).width
                + parseFloat(artifactModeStyle.paddingLeft) + parseFloat(artifactModeStyle.paddingRight) + 2);
            artifactMode.value = "4pc";
            artifactMode.dispatchEvent(new Event("change", { bubbles: true }));
            artifactSelect.value = "15037";
            artifactSelect.dispatchEvent(new Event("change", { bubbles: true }));
            const artifactImage = artifactTrigger.querySelector(".genshin-artifact-selection-trigger-image");
            const artifactLabel = artifactTrigger.querySelector(".genshin-artifact-selection-trigger-label");
            const artifactSelectedState = {
                text: artifactLabel?.textContent || "",
                clipped: Boolean(artifactLabel && artifactLabel.scrollWidth > artifactLabel.clientWidth),
                imageSrc: artifactImage?.getAttribute("src") || "",
                imageWidth: artifactImage?.clientWidth || 0
            };
            artifactMode.value = "2pc2pc";
            artifactMode.dispatchEvent(new Event("change", { bubbles: true }));
            const twoPieceButtons = [...document.querySelectorAll(".genshin-artifact-selection-trigger")]
                .filter((element) => element.offsetWidth > 0)
                .map((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
            artifactMode.value = "4pc";
            artifactMode.dispatchEvent(new Event("change", { bubbles: true }));
            artifactSelect.value = "";
            artifactSelect.dispatchEvent(new Event("change", { bubbles: true }));
            return {
                talentControls,
                artifactModeText: artifactMode.options[artifactMode.selectedIndex].text,
                emptyModeText,
                emptyModeWidth: artifactMode.getBoundingClientRect().width,
                emptyModeRequiredWidth,
                selectStyles: [...new Set(selectStyles)],
                artifactSelectedState,
                artifactTriggerFits: artifactTrigger.scrollWidth <= artifactTrigger.clientWidth,
                twoPieceButtons,
                unitStyles: [...new Set(unitStyles)],
                unitCenterOffsets: [...new Set(unitCenterOffsets)],
                numberAppearance: getComputedStyle(document.getElementById("genshinCritRateInput")).appearance,
                cardPadding: cardStyle.padding,
                cardBorderWidth: cardStyle.borderTopWidth,
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.equal(layoutAudit.pageOverflow, false, "calculator page has horizontal overflow");
        assert.equal(layoutAudit.artifactModeText, "4");
        assert.equal(layoutAudit.emptyModeText, "未選択");
        assert.ok(layoutAudit.emptyModeWidth >= layoutAudit.emptyModeRequiredWidth, `artifact mode text is clipped: ${JSON.stringify(layoutAudit)}`);
        assert.deepEqual(layoutAudit.selectStyles, ["none|calc(100% - 14px) 50%|12px 8px|34px|true"]);
        assert.deepEqual(layoutAudit.artifactSelectedState, {
            text: "絵巻",
            clipped: false,
            imageSrc: "/games/images/genshin/artifacts/15037.webp",
            imageWidth: 26
        });
        assert.equal(layoutAudit.artifactTriggerFits, true, "artifact selection text is clipped in 4-piece mode");
        assert.ok(layoutAudit.talentControls.every((control) => control.width >= control.requiredWidth), `talent level text is clipped: ${JSON.stringify(layoutAudit.talentControls)}`);
        assert.ok(layoutAudit.talentControls.every((control) => control.fontSize === "12px"), "talent controls do not share one font size");
        assert.ok(layoutAudit.twoPieceButtons.every((button) => button.scrollWidth <= button.clientWidth), "artifact selection text is clipped in 2+2 mode");
        assert.deepEqual(layoutAudit.unitStyles.sort(), ["10px|11px|12px", "10px|12px|12px"]);
        assert.ok(layoutAudit.unitCenterOffsets.every((offset) => Math.abs(offset) <= 1), `unit labels are not vertically centered: ${layoutAudit.unitCenterOffsets}`);
        assert.equal(layoutAudit.numberAppearance, "textfield");
        assert.equal(layoutAudit.cardPadding, "11px");
        assert.equal(layoutAudit.cardBorderWidth, "1px");

        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 375,
            height: 844,
            deviceScaleFactor: 1,
            mobile: true
        });
        await waitFor(client, `innerWidth === 375`);
        const mobileLayoutAudit = await evaluate(client, `(() => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            const measureControl = (element, text) => {
                const style = getComputedStyle(element);
                context.font = style.font;
                return {
                    id: element.id,
                    text,
                    width: element.getBoundingClientRect().width,
                    requiredWidth: Math.ceil(context.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 2),
                    fontSize: style.fontSize,
                    backgroundPosition: style.backgroundPosition,
                    backgroundSize: style.backgroundSize
                };
            };
            const artifactMode = document.getElementById("genshinArtifactSetMode");
            artifactMode.value = "";
            artifactMode.dispatchEvent(new Event("change", { bubbles: true }));
            const controls = [
                ...["genshinNormalTalentLevel", "genshinSkillTalentLevel", "genshinBurstTalentLevel"].map((id) => {
                    const element = document.getElementById(id);
                    return measureControl(element, element.options[element.selectedIndex].text);
                }),
                measureControl(artifactMode, artifactMode.options[artifactMode.selectedIndex].text),
                ...["genshinReflectCharacter", "genshinWeaponInput"].map((id) => {
                    const element = document.getElementById(id);
                    return measureControl(element, element.value || element.placeholder);
                })
            ];
            return {
                controls,
                profileColumns: getComputedStyle(document.querySelector(".genshin-profile-form-grid")).gridTemplateColumns,
                equipmentCards: [...document.querySelectorAll(".genshin-equipment-card")].map((card) => ({
                    columns: getComputedStyle(card).gridTemplateColumns,
                    imageWidth: card.querySelector(".genshin-profile-selection-image").getBoundingClientRect().width,
                    nameWhiteSpace: getComputedStyle(card.querySelector(".genshin-equipment-name")).whiteSpace
                })),
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.ok(mobileLayoutAudit.controls.every((control) => control.width >= control.requiredWidth), `mobile control text is clipped: ${JSON.stringify(mobileLayoutAudit.controls)}`);
        assert.ok(mobileLayoutAudit.controls.slice(0, 3).every((control) => control.fontSize === "12px"), "mobile talent labels are not compact");
        assert.ok(mobileLayoutAudit.controls.slice(0, 4).every((control) => control.backgroundPosition === "calc(100% - 9px) 50%"));
        assert.ok(mobileLayoutAudit.controls.slice(0, 4).every((control) => control.backgroundSize === "9px 6px"));
        assert.match(mobileLayoutAudit.profileColumns, /^\d+(?:\.\d+)?px$/);
        assert.equal(mobileLayoutAudit.equipmentCards.length, 2);
        assert.ok(mobileLayoutAudit.equipmentCards.every((card) => /^68px \d+(?:\.\d+)?px$/.test(card.columns)));
        assert.ok(mobileLayoutAudit.equipmentCards.every((card) => card.imageWidth === 68));
        assert.ok(mobileLayoutAudit.equipmentCards.every((card) => card.nameWhiteSpace === "nowrap"));
        assert.equal(mobileLayoutAudit.pageOverflow, false);
        await evaluate(client, `document.querySelector(".teti-mobile-menu-button").click()`);
        await waitFor(client, `Math.round(document.querySelector("#tetiMainNavigation").getBoundingClientRect().left) === 0`);
        const mobileMenuAudit = await evaluate(client, `(() => {
            const header = document.querySelector(".teti-site-header");
            const nav = document.querySelector("#tetiMainNavigation");
            return {
                open: document.body.classList.contains("is-site-menu-open"),
                expanded: document.querySelector(".teti-mobile-menu-button").getAttribute("aria-expanded"),
                navHidden: nav.getAttribute("aria-hidden"),
                navVisible: getComputedStyle(nav).visibility,
                navLeft: Math.round(nav.getBoundingClientRect().left),
                headerZ: Number(getComputedStyle(header).zIndex)
            };
        })()`);
        assert.deepEqual(mobileMenuAudit, { open: true, expanded: "true", navHidden: "false", navVisible: "visible", navLeft: 0, headerZ: 90 });
        await evaluate(client, `document.querySelector(".teti-mobile-menu-button").click()`);
        await client.send("Emulation.setDeviceMetricsOverride", {
            width: 1280,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false
        });
        await waitFor(client, `innerWidth === 1280`);

        await evaluate(client, `document.querySelector("#genshinReflectCharacter").click()`);
        try {
            await waitFor(client, `document.querySelector("#genshinSelectionDialog").open && document.querySelectorAll("#genshinSelectionList [data-selection-id]").length > 0`);
        } catch (error) {
            const selectionDiagnostics = await evaluate(client, `({
                dialogOpen: document.querySelector("#genshinSelectionDialog")?.open,
                optionCount: document.querySelectorAll("#genshinSelectionList [data-selection-id]").length,
                summary: document.querySelector("#genshinSelectionSummary")?.textContent,
                bulkButton: Boolean(document.querySelector("#genshinFilterToggleAll"))
            })`);
            throw new Error(`${error.message}\n${JSON.stringify(selectionDiagnostics)}\n${JSON.stringify(client.exceptions)}`);
        }
        const initialSelectionUi = await evaluate(client, `({
            title: document.querySelector("#genshinSelectionTitle").textContent,
            elementFilters: document.querySelectorAll('[data-filter-group="element"]').length,
            rarityFilters: document.querySelectorAll('[data-filter-group="rarity"]').length,
            optionCount: document.querySelectorAll("#genshinSelectionList [data-selection-id]").length,
            headingBorder: getComputedStyle(document.querySelector("#genshinSelectionTitle")).borderLeftWidth,
            headingAccent: getComputedStyle(document.querySelector("#genshinSelectionTitle"), "::before").backgroundColor,
            dialogHeight: document.querySelector("#genshinSelectionDialog").getBoundingClientRect().height,
            bulkFilterRow: document.querySelector("#genshinFilterToggleAll").parentElement.querySelector("[data-filter-group]").dataset.filterGroup,
            selectedFilterCount: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length,
            clearFilterText: document.querySelector("#genshinFilterToggleAll").textContent,
            clearFilterDisabled: document.querySelector("#genshinFilterToggleAll").disabled,
            rarityRowText: document.querySelector('[role="group"][aria-label="レアリティと旅人"]').innerText,
            travelerBesideClear: document.querySelector('[data-filter-group="element"][data-filter-value="-"]').parentElement === document.querySelector("#genshinFilterToggleAll").parentElement
        })`);
        assert.equal(initialSelectionUi.title, "キャラクターを選択");
        assert.equal(initialSelectionUi.elementFilters, 8);
        assert.equal(initialSelectionUi.rarityFilters, 2);
        assert.ok(initialSelectionUi.optionCount > 50);
        assert.equal(initialSelectionUi.headingBorder, "0px");
        assert.notEqual(initialSelectionUi.headingAccent, "rgba(0, 0, 0, 0)");
        assert.equal(initialSelectionUi.bulkFilterRow, "rarity");
        assert.equal(initialSelectionUi.selectedFilterCount, 0);
        assert.equal(initialSelectionUi.clearFilterText, "フィルタ解除");
        assert.equal(initialSelectionUi.clearFilterDisabled, true);
        assert.match(initialSelectionUi.rarityRowText, /★5[\s\S]*★4[\s\S]*旅人[\s\S]*フィルタ解除/);
        assert.equal(initialSelectionUi.travelerBesideClear, true);

        await evaluate(client, `(() => { const input = document.querySelector("#genshinSelectionSearch"); input.value = "かんう"; input.dispatchEvent(new Event("input", { bubbles: true })); })()`);
        await waitFor(client, `document.querySelectorAll("#genshinSelectionList [data-selection-id]").length > 0`);
        const kanaSearchNames = await evaluate(client, `[...document.querySelectorAll("#genshinSelectionList [data-selection-id] strong")].map((item) => item.textContent)`);
        assert.ok(kanaSearchNames.includes("甘雨"));
        const clearButtonState = await evaluate(client, `({ text: document.querySelector("#genshinSelectionSearchClear").textContent, disabled: document.querySelector("#genshinSelectionSearchClear").disabled })`);
        assert.equal(clearButtonState.text, "名前をクリア");
        assert.equal(clearButtonState.disabled, false);
        const filteredDialogHeight = await evaluate(client, `document.querySelector("#genshinSelectionDialog").getBoundingClientRect().height`);
        assert.equal(filteredDialogHeight, initialSelectionUi.dialogHeight);
        await evaluate(client, `document.querySelector("#genshinSelectionSearchClear").click()`);
        await waitFor(client, `document.querySelectorAll("#genshinSelectionList [data-selection-id]").length > 50`);

        await evaluate(client, `document.querySelector('[data-filter-group="element"][data-filter-value="炎"]').click()`);
        await waitFor(client, `document.querySelector('[data-filter-group="element"][data-filter-value="炎"]').getAttribute("aria-pressed") === "true"`);
        const pyroOnly = await evaluate(client, `[...document.querySelectorAll("#genshinSelectionList [data-selection-id]")].every((item) => item.getAttribute("aria-label").includes("炎元素"))`);
        assert.equal(pyroOnly, true);
        await evaluate(client, `document.querySelector('[data-filter-group="rarity"][data-filter-value="5"]').click()`);
        await waitFor(client, `document.querySelector('[data-filter-group="rarity"][data-filter-value="5"]').getAttribute("aria-pressed") === "true"`);
        const pyroFiveStarOnly = await evaluate(client, `[...document.querySelectorAll("#genshinSelectionList [data-selection-id]")].every((item) => item.getAttribute("aria-label").includes("炎元素") && item.getAttribute("aria-label").includes("★5"))`);
        assert.equal(pyroFiveStarOnly, true);
        const activeClearFilter = await evaluate(client, `({ disabled: document.querySelector("#genshinFilterToggleAll").disabled, selected: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length })`);
        assert.equal(activeClearFilter.disabled, false);
        assert.equal(activeClearFilter.selected, 2);
        await evaluate(client, `document.querySelector("#genshinFilterToggleAll").click()`);
        await waitFor(client, `document.querySelectorAll("#genshinSelectionList [data-selection-id]").length > 50`);
        const resetFilterState = await evaluate(client, `({ disabled: document.querySelector("#genshinFilterToggleAll").disabled, selected: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length })`);
        assert.equal(resetFilterState.disabled, true);
        assert.equal(resetFilterState.selected, 0);
        await evaluate(client, `document.querySelector('#genshinSelectionList [data-selection-id="10000016"]').click()`);
        await waitFor(client, `document.querySelector("#genshinReflectCharacter").value === "ディルック" && !document.querySelector("#genshinWeaponInput").disabled`);

        await evaluate(client, `document.querySelector("#genshinWeaponInput").click()`);
        await waitFor(client, `document.querySelector("#genshinSelectionDialog").open && document.querySelector("#genshinSelectionTitle").textContent === "武器を選択"`);
        const weaponSelectionUi = await evaluate(client, `({
            summary: document.querySelector("#genshinSelectionSummary").textContent,
            compatibleType: [...document.querySelectorAll("#genshinSelectionList [data-selection-id]")].every((item) => window.GenshinIdResolver.resolveWeapon(item.dataset.selectionId)?.weaponType === "両手剣"),
            rarityFilters: document.querySelectorAll('[data-filter-group="rarity"]').length,
            metas: [...document.querySelectorAll("#genshinSelectionList .genshin-selection-option-copy > span")].map((item) => item.textContent),
            bulkFilterRow: document.querySelector("#genshinFilterToggleAll").parentElement.querySelector("[data-filter-group]").dataset.filterGroup,
            selectedFilterCount: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length,
            clearFilterDisabled: document.querySelector("#genshinFilterToggleAll").disabled
        })`);
        assert.equal(weaponSelectionUi.compatibleType, true);
        assert.equal(weaponSelectionUi.rarityFilters, 5);
        assert.equal(weaponSelectionUi.bulkFilterRow, "rarity");
        assert.equal(weaponSelectionUi.selectedFilterCount, 0);
        assert.equal(weaponSelectionUi.clearFilterDisabled, true);
        assert.equal(weaponSelectionUi.metas.every((meta) => !meta.includes("両手剣")), true);
        await evaluate(client, `document.querySelector('[data-filter-group="rarity"][data-filter-value="5"]').click()`);
        await waitFor(client, `document.querySelector('[data-filter-group="rarity"][data-filter-value="5"]').getAttribute("aria-pressed") === "true"`);
        const fiveStarWeaponsOnly = await evaluate(client, `[...document.querySelectorAll("#genshinSelectionList .genshin-selection-option-copy > span")].every((item) => item.textContent === "★5")`);
        assert.equal(fiveStarWeaponsOnly, true);
        await evaluate(client, `document.querySelector("#genshinFilterToggleAll").click()`);
        const resetWeaponFilters = await evaluate(client, `({ disabled: document.querySelector("#genshinFilterToggleAll").disabled, selected: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length })`);
        assert.equal(resetWeaponFilters.disabled, true);
        assert.equal(resetWeaponFilters.selected, 0);
        await evaluate(client, `document.querySelector("#genshinSelectionClose").click()`);

        const setArtifactMode = async (value) => {
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinArtifactSetMode");
                input.value = ${JSON.stringify(value)};
                input.dispatchEvent(new Event("input", { bubbles: true }));
                input.dispatchEvent(new Event("change", { bubbles: true }));
                return input.value;
            })()`);
            await delay(100);
        };

        const chooseArtifactThroughModal = async (slot, id, name, shortName) => {
            const triggerId = slot === "two" ? "#genshinArtifactSetTwoTrigger" : "#genshinArtifactSetOneTrigger";
            const selectId = slot === "two" ? "#genshinArtifactSetTwo" : "#genshinArtifactSetOne";
            await waitFor(client, `document.querySelector(${JSON.stringify(triggerId)})?.getBoundingClientRect().width > 0`);
            await evaluate(client, `document.querySelector(${JSON.stringify(triggerId)}).click()`);
            await waitFor(client, `document.getElementById("genshinSelectionDialog").open && document.getElementById("genshinSelectionTitle").textContent === "聖遺物セットを選択"`);
            await evaluate(client, `(() => {
                const input = document.getElementById("genshinSelectionSearch");
                input.value = ${JSON.stringify(name)};
                input.dispatchEvent(new Event("input", { bubbles: true }));
                return input.value;
            })()`);
            await waitFor(client, `Boolean(document.querySelector('#genshinSelectionList [data-selection-id="${id}"]'))`);
            await waitFor(client, `(() => {
                const image = document.querySelector('#genshinSelectionList [data-selection-id="${id}"] img');
                return Boolean(image && image.complete && image.naturalWidth > 0);
            })()`);
            const modalItem = await evaluate(client, `(() => {
                const item = document.querySelector('#genshinSelectionList [data-selection-id="${id}"]');
                const image = item?.querySelector("img");
                return {
                    id: item?.dataset.selectionId || "",
                    name: item?.querySelector("strong")?.textContent || "",
                    imageSrc: image?.getAttribute("src") || "",
                    imageReady: Boolean(image && image.complete && image.naturalWidth > 0)
                };
            })()`);
            assert.deepEqual(modalItem, {
                id,
                name,
                imageSrc: `/games/images/genshin/artifacts/${id}.webp`,
                imageReady: true
            });
            await evaluate(client, `document.querySelector('#genshinSelectionList [data-selection-id="${id}"]').click()`);
            await waitFor(client, `document.getElementById(${JSON.stringify(selectId.slice(1))}).value === ${JSON.stringify(id)}`);
            await waitFor(client, `(() => {
                const trigger = document.querySelector(${JSON.stringify(triggerId)});
                const image = trigger?.querySelector("img");
                return Boolean(image && image.getAttribute("src") === "/games/images/genshin/artifacts/${id}.webp" && image.complete && image.naturalWidth > 0
                    && trigger.querySelector(".genshin-artifact-selection-trigger-label")?.textContent === ${JSON.stringify(shortName || name)});
            })()`);
            return modalItem;
        };

        const readArtifactConditionSections = async () => evaluate(client, `([...document.querySelectorAll("#genshinJsonConditionCards [data-artifact-set]")]).map((section) => ({
            setId: section.dataset.artifactSet,
            pieceCount: section.dataset.artifactPiece,
            text: section.textContent,
            description: section.querySelector(".genshin-condition-detail-block p")?.textContent || ""
        }))`);

        const runArtifactProduction = async (setId) => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const applied = payload.results.flatMap((result) => result.breakdown?.appliedModifiers || []);
            const candidates = [...(payload.candidateModifiers || []), ...(payload.partyModifiers || [])];
            const related = [...applied, ...candidates].filter((item) => String(item.modifier?.artifactSetId || "") === ${JSON.stringify(setId)});
            const stateEntries = Object.entries(payload.calculationRequest?.uiState?.conditionByModifier || {})
                .filter(([key]) => key.includes(${JSON.stringify(setId)}));
            const stellarConduct = payload.results.find((result) => result.entry?.directReactionId === "stellarConduct");
            return {
                totalExpected: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                appliedIds: applied.filter((item) => String(item.modifier?.artifactSetId || "") === ${JSON.stringify(setId)}).map((item) => item.modifier.id),
                statTraceIds: (payload.statTrace || []).filter((item) => String(item.modifierId || "").includes("4pc_")).map((item) => item.modifierId),
                reactionBonus: stellarConduct?.breakdown?.reactionBonus ?? 0,
                stateEntries,
                relatedCount: related.length
            };
        })()`);

        await clearSupportMembers();
        await evaluate(client, selectionExpression({
            characterName: "サンドローネ",
            characterId: "10000133",
            weaponName: "",
            weaponId: "",
            constellation: "C0",
            atk: 2000,
            def: 1000,
            hp: 20000
        }));
        await setReactionOption("stellarConduct");

        await setArtifactMode("2pc2pc");
        await chooseArtifactThroughModal("one", "15047", "紅血の証", "紅血");
        await chooseArtifactThroughModal("two", "10001", "旅人の心", "旅人");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelector('[data-artifact-set="15047"][data-artifact-piece="2"]')`);
        const scarletTwoPiece = await readArtifactConditionSections();
        const scarletTwoPieceSection = scarletTwoPiece.find((section) => section.setId === "15047" && section.pieceCount === "2");
        assert.ok(scarletTwoPieceSection?.description.includes("攻撃力+18%"), "15047 2セット説明が画面に表示される");

        await setArtifactMode("4pc");
        await chooseArtifactThroughModal("one", "15047", "紅血の証", "紅血");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelector('[data-artifact-set="15047"][data-artifact-piece="4"]')`);
        const scarletFourPiece = await readArtifactConditionSections();
        const scarletFourPieceSection = scarletFourPiece.find((section) => section.setId === "15047" && section.pieceCount === "4");
        assert.ok(scarletFourPieceSection?.description.includes("星拡散反応を起こした後の10秒間"), "15047 4セット説明が画面に表示される");
        const scarletToggle = await evaluate(client, `document.querySelector('[data-artifact-set="15047"][data-artifact-piece="4"] input[data-genshin-toggle-key]')?.checked === true`);
        assert.equal(scarletToggle, false, "15047 4セット条件は初期状態でOFF");
        const scarletOff = await runArtifactProduction("15047");
        await evaluate(client, `(() => {
            const input = document.querySelector('[data-artifact-set="15047"][data-artifact-piece="4"] input[data-genshin-toggle-key]');
            if (!input) throw new Error("missing 15047 condition toggle");
            input.click();
            return input.checked;
        })()`);
        await delay(150);
        const scarletOn = await runArtifactProduction("15047");
        assert.equal(scarletOn.stateEntries.some(([, state]) => state.enabled === true), true, "15047 UI入力がcondition stateへ渡る");
        assert.equal(scarletOn.appliedIds.includes("4pc_crit_rate_after_stellar_swirl"), true, "15047 ONがproduction modifierへ渡る");
        assert.notEqual(scarletOn.totalExpected, scarletOff.totalExpected, "15047条件ON/OFFでproduction結果が変化する");

        await setArtifactMode("2pc2pc");
        await chooseArtifactThroughModal("one", "15048", "炉炎溶錬の心", "炉炎");
        await chooseArtifactThroughModal("two", "10001", "旅人の心", "旅人");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelector('[data-artifact-set="15048"][data-artifact-piece="2"]')`);
        const furnaceTwoPiece = await readArtifactConditionSections();
        const furnaceTwoPieceSection = furnaceTwoPiece.find((section) => section.setId === "15048" && section.pieceCount === "2");
        assert.ok(furnaceTwoPieceSection?.description.includes("攻撃力+18%"), "15048 2セット説明が画面に表示される");

        await setArtifactMode("4pc");
        await chooseArtifactThroughModal("one", "15048", "炉炎溶錬の心", "炉炎");
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelector('[data-artifact-set="15048"][data-artifact-piece="4"]')`);
        const furnaceFourPiece = await readArtifactConditionSections();
        const furnaceFourPieceSection = furnaceFourPiece.find((section) => section.setId === "15048" && section.pieceCount === "4");
        assert.ok(furnaceFourPieceSection?.description.includes("星反応を起こす、または星反応ダメージを与えた後の12秒間"), "15048 4セット説明が画面に表示される");
        await evaluate(client, `(() => {
            const input = document.querySelector('[data-artifact-set="15048"][data-artifact-piece="4"] input[data-genshin-toggle-key]');
            if (!input) throw new Error("missing 15048 condition toggle");
            if (input.checked) input.click();
        })()`);
        await delay(150);
        const furnaceOff = await runArtifactProduction("15048");
        await evaluate(client, `(() => {
            const input = document.querySelector('[data-artifact-set="15048"][data-artifact-piece="4"] input[data-genshin-toggle-key]');
            if (!input) throw new Error("missing 15048 condition toggle");
            input.click();
            return input.checked;
        })()`);
        await delay(150);
        const furnaceOn = await runArtifactProduction("15048");
        assert.equal(furnaceOn.stateEntries.some(([, state]) => state.enabled === true), true, "15048 UI入力がcondition stateへ渡る");
        assert.equal(furnaceOn.statTraceIds.includes("4pc_atk_after_stellar_glimmer"), true, "15048 ONがproduction stat modifierへ渡る");
        assert.equal(furnaceOn.reactionBonus, 50, "15048 ONが星電導productionへ反映される");
        assert.notEqual(furnaceOn.totalExpected, furnaceOff.totalExpected, "15048条件ON/OFFでproduction結果が変化する");

        await evaluate(client, selectionExpression({
            characterName: "甘雨",
            characterId: "10000037",
            weaponName: "アモスの弓",
            weaponId: "15502",
            constellation: "C1"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelectorAll(".genshin-condition-card").length >= 5`);
        const cardLayout = await evaluate(client, `(() => ({
            order: [...document.querySelectorAll(".genshin-condition-card")].map((card) => card.dataset.conditionCard),
            text: document.querySelector("#genshinJsonConditionCards").textContent,
            hasAmosStack: Boolean(document.querySelector("[data-condition-card='weapon'] #genshinJsonAmosStack")),
            hasConstellationSelect: Boolean(document.querySelector("#genshinJsonConstellationLevel"))
        }))()`);
        assert.deepEqual(cardLayout.order, ["reaction", "party", "weapon", "artifact", "talent-constellation"]);
        assert.ok(cardLayout.text.includes("武器補正"));
        assert.ok(cardLayout.text.includes("天賦・命ノ星座補正"));
        assert.ok(cardLayout.text.includes("唯一の心"));
        assert.ok(cardLayout.text.includes("C1"));
        assert.equal(cardLayout.hasAmosStack, true);
        assert.equal(cardLayout.hasConstellationSelect, false);

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
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const firstResultLength = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText.trim().length`);
        assert.ok(firstResultLength > 0);
        const resultStyleAudit = await evaluate(client, `(() => {
            const result = document.querySelector("#genshinJsonCalcResults");
            const attack = result.querySelector(".genshin-result-attack-head strong");
            const number = result.querySelector(".genshin-damage-result-row td");
            const info = document.querySelector(".genshin-info-box");
            result.querySelector("[data-result-detail-toggle]").click();
            const detail = result.querySelector(".genshin-damage-detail-row:not([hidden])");
            return {
                attackFont: getComputedStyle(attack).fontSize,
                attackClipped: attack.scrollWidth > attack.clientWidth,
                numberFont: getComputedStyle(number).fontSize,
                infoGap: Math.round(info.getBoundingClientRect().top - result.getBoundingClientRect().bottom),
                detailFont: getComputedStyle(detail.querySelector(".genshin-json-breakdown")).fontSize,
                detailTitleFont: getComputedStyle(detail.querySelector(".genshin-breakdown-title")).fontSize,
                detailOverflow: detail.scrollWidth > detail.clientWidth
            };
        })()`);
        assert.equal(resultStyleAudit.attackFont, "12.48px");
        assert.equal(resultStyleAudit.attackClipped, false);
        assert.ok(parseFloat(resultStyleAudit.numberFont) > parseFloat(resultStyleAudit.attackFont), "damage numbers must be more prominent than attack names");
        assert.equal(resultStyleAudit.infoGap, 22);
        assert.equal(resultStyleAudit.detailFont, "11.84px");
        assert.equal(resultStyleAudit.detailTitleFont, "12.48px");
        assert.equal(resultStyleAudit.detailOverflow, false);

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
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
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
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const stackResultLength = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText.trim().length`);
        assert.ok(stackResultLength > 0);

        await evaluate(client, selectionExpression({
            characterName: "スクロース",
            characterId: "10000043",
            weaponName: "",
            weaponId: "",
            constellation: "C6",
            atk: 1000
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        const sucroseAbsorptionSelector = '[data-genshin-condition-key*="sucrose-burst-elemental-absorption"][data-genshin-condition-kind="option"]';
        await waitFor(client, `Boolean(document.querySelector(${JSON.stringify(sucroseAbsorptionSelector)}))`);
        const sucroseConditionCount = await evaluate(client, `document.querySelectorAll(${JSON.stringify(sucroseAbsorptionSelector)}).length`);
        assert.equal(sucroseConditionCount, 1);
        const sucroseBefore = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            return {
                pyro: payload.results.find((item) => item.entry.id === "damage_pyro")?.nonCrit,
                cryo: payload.results.find((item) => item.entry.id === "damage_cryo")?.nonCrit
            };
        })()`);
        await evaluate(client, `(() => {
            const input = document.querySelector(${JSON.stringify(sucroseAbsorptionSelector)});
            input.value = "pyro";
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        const sucroseAfter = await evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const key = Object.keys(payload.calculationRequest.uiState.conditionByModifier)
                .find((item) => item.includes("sucrose-burst-elemental-absorption"));
            return {
                pyro: payload.results.find((item) => item.entry.id === "damage_pyro")?.nonCrit,
                cryo: payload.results.find((item) => item.entry.id === "damage_cryo")?.nonCrit,
                option: payload.calculationRequest.uiState.conditionByModifier[key]?.option,
                labels: payload.results.filter((item) => item.entry.id.startsWith("damage_")).map((item) => item.entry.label)
            };
        })()`);
        assert.equal(sucroseAfter.option, "pyro");
        assert.ok(sucroseAfter.pyro > sucroseBefore.pyro, JSON.stringify({ sucroseBefore, sucroseAfter }));
        assert.equal(sucroseAfter.cryo, sucroseBefore.cryo);
        assert.deepEqual(sucroseAfter.labels, [
            "炎元素変化・付加元素ダメージ",
            "水元素変化・付加元素ダメージ",
            "雷元素変化・付加元素ダメージ",
            "氷元素変化・付加元素ダメージ"
        ]);

        await evaluate(client, selectionExpression({
            characterName: "ノエル",
            characterId: "10000034",
            weaponName: "",
            weaponId: "",
            constellation: "C0",
            def: 2000
        }));
        await evaluate(client, `(() => {
            const reaction = document.getElementById("genshinJsonReactionOption");
            reaction.value = "lunarCrystallize";
            reaction.dispatchEvent(new Event("input", { bubbles: true }));
            reaction.dispatchEvent(new Event("change", { bubbles: true }));
        })()`);
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `Boolean(document.getElementById("genshinReactionContributor2AdditiveBaseDamage"))`);
        const lunarConditionText = await evaluate(client, `document.querySelector('[data-condition-card="reaction"]').innerText`);
        assert.match(lunarConditionText, /個別の固定加算ダメージ/);
        assert.match(lunarConditionText, /チーム共通補正は全参加者へ反映/);
        assert.match(lunarConditionText, /主結果は月籠1個の1ヒット/);
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        await clickAndWait(client, "#genshin-result-tab-reaction");
        const lunarResultText = await evaluate(client, `document.querySelector("#genshin-result-panel-reaction").innerText`);
        assert.match(lunarResultText, /月籠諧奏ダメージ（月籠1個・1ヒット/);
        assert.match(lunarResultText, /参考：\s*月籠諧奏（同一対象へ月籠3個が各1ヒット）/);
        assert.match(lunarResultText, /ターゲット分散時は対象ごと/);

        const xiaoBehaviorModifierId = "behavior-modifier:10000026:constellation-1-1:1";
        const inspectXiaoBehavior = () => evaluate(client, `(() => {
            const result = document.querySelector("#genshinJsonCalcResults");
            const behavior = result.querySelector(".genshin-json-behavior-resolution");
            const modifier = result.querySelector(${JSON.stringify(`[data-behavior-modifier-id="${xiaoBehaviorModifierId}"]`)});
            const dedicatedInputs = document.querySelectorAll(${JSON.stringify(`[data-behavior-modifier-id="${xiaoBehaviorModifierId}"] input, [data-behavior-modifier-id="${xiaoBehaviorModifierId}"] select, [data-behavior-modifier-id="${xiaoBehaviorModifierId}"] button`)});
            return {
                text: result.innerText,
                behaviorVisible: Boolean(behavior && behavior.offsetParent !== null),
                modifierVisible: Boolean(modifier && modifier.offsetParent !== null),
                dedicatedInputCount: dedicatedInputs.length,
                constellation: document.getElementById("genshinReflectConstellation").value
            };
        })()`);

        await evaluate(client, selectionExpression({
            characterName: "魈",
            characterId: "10000026",
            weaponName: "",
            weaponId: "",
            constellation: "C0"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const xiaoC0 = await inspectXiaoBehavior();
        assert.equal(xiaoC0.constellation, "C0");
        assert.equal(xiaoC0.behaviorVisible, false, "Xiao C0 must not render the C1 behavior summary");
        assert.equal(xiaoC0.modifierVisible, false, "Xiao C0 must not apply the C1 behavior modifier");
        assert.equal(xiaoC0.text.includes("使用可能回数 2 → 3（+1）"), false);

        await evaluate(client, `(() => {
            const constellation = document.getElementById("genshinReflectConstellation");
            constellation.value = "C1";
            constellation.dispatchEvent(new Event("input", { bubbles: true }));
            constellation.dispatchEvent(new Event("change", { bubbles: true }));
            return constellation.value;
        })()`);
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const xiaoC1 = await inspectXiaoBehavior();
        assert.equal(xiaoC1.constellation, "C1");
        assert.equal(xiaoC1.behaviorVisible, false, "the 6.7 Xiao overlay must stay inactive while 7.0 revalidation is pending");
        assert.equal(xiaoC1.modifierVisible, false, "historical Xiao behavior must not enter the live calculation route");
        assert.equal(xiaoC1.text.includes("使用可能回数 2 → 3（+1）"), false);
        assert.equal(xiaoC1.dedicatedInputCount, 0, "an inactive historical overlay must not create a dedicated toggle");

        await evaluate(client, `(() => {
            const constellation = document.getElementById("genshinReflectConstellation");
            constellation.value = "C0";
            constellation.dispatchEvent(new Event("input", { bubbles: true }));
            constellation.dispatchEvent(new Event("change", { bubbles: true }));
            return constellation.value;
        })()`);
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const xiaoBackToC0 = await inspectXiaoBehavior();
        assert.equal(xiaoBackToC0.constellation, "C0");
        assert.equal(xiaoBackToC0.behaviorVisible, false, "Xiao C1 behavior summary must disappear after returning to C0");
        assert.equal(xiaoBackToC0.modifierVisible, false, "Xiao C1 behavior modifier must be removed after returning to C0");
        assert.equal(xiaoBackToC0.text.includes("使用可能回数 2 → 3（+1）"), false);

        await evaluate(client, selectionExpression({
            characterName: "ネフェル",
            characterId: "10000122",
            weaponName: "",
            weaponId: "",
            constellation: "C0"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const statLabelPresentation = await evaluate(client, `(() => {
            document.querySelectorAll("#genshinJsonCalcResults [data-result-detail-toggle]").forEach((button) => button.click());
            const text = document.querySelector("#genshinJsonCalcResults").innerText;
            return {
                text,
                resolverElementalMastery: window.GenshinUiLabels.statLabel("elementalMastery"),
                resolverAttack: window.GenshinUiLabels.statLabel("atk")
            };
        })()`);
        assert.equal(statLabelPresentation.resolverElementalMastery, "元素熟知");
        assert.equal(statLabelPresentation.resolverAttack, "攻撃力");
        assert.ok(statLabelPresentation.text.includes("元素熟知"), "calculation details must display 元素熟知 in Japanese");
        assert.ok(statLabelPresentation.text.includes("攻撃力"), "calculation details must use the same resolver for 攻撃力");
        assert.doesNotMatch(statLabelPresentation.text, /elementalMastery|Elemental Mastery/);

        await evaluate(client, selectionExpression({
            characterName: "白朮",
            characterId: "10000082",
            weaponName: "",
            weaponId: "",
            constellation: "C2"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await clickAndWait(client, "#genshinJsonCalcButtonBottom");
        const baizhuResult = await evaluate(client, `document.querySelector("#genshinJsonCalcResults").innerText`);
        assert.ok(baizhuResult.trim().length > 0, "JSON calculation result was not rendered");
        assert.deepEqual(client.exceptions, []);

        console.log(JSON.stringify({
            status: "passed",
            resourceKey: resource.key,
            resourceInputCount: resource.count,
            complexConditionInputCount: complexCondition.count,
            stackConditionInputCount: stackConditionCount,
            xiaoBehavior: {
                c0: { behaviorVisible: xiaoC0.behaviorVisible, modifierVisible: xiaoC0.modifierVisible },
                c1: { behaviorVisible: xiaoC1.behaviorVisible, modifierVisible: xiaoC1.modifierVisible, dedicatedInputCount: xiaoC1.dedicatedInputCount },
                backToC0: { behaviorVisible: xiaoBackToC0.behaviorVisible, modifierVisible: xiaoBackToC0.modifierVisible }
            },
            witchUiProduction: {
                fischlEm: witchUiProduction.fischl.on,
                fischlAtk: witchUiProduction.fischlAtk.on,
                fischlC6Amplification: witchUiProduction.fischlC6Amplification
            },
            fischlCurrentCalc,
            beidouCurrentCalc,
            nicoleCurrentCalc,
            statLabels: {
                elementalMastery: statLabelPresentation.resolverElementalMastery,
                atk: statLabelPresentation.resolverAttack
            },
            resultTextLength: baizhuResult.trim().length
        }));
    } finally {
        if (client) client.socket.close();
        if (browserProcess.exitCode === null) {
            const exited = new Promise((resolve) => browserProcess.once("exit", resolve));
            browserProcess.kill();
            await Promise.race([exited, delay(3000)]);
        }
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                fs.rmSync(userDataDir, { recursive: true, force: true });
                break;
            } catch (error) {
                if (attempt === 4) {
                    console.warn(`[genshin-browser-smoke] temporary browser profile remains locked: ${userDataDir}`);
                    break;
                }
                await delay(300 * (attempt + 1));
            }
        }
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
