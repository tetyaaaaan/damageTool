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
            const unitStyles = [...document.querySelectorAll(".genshin-compact-stats .genshin-field > span, .genshin-combat-input-grid .genshin-field > span")]
                .map((element) => {
                    const style = getComputedStyle(element);
                    return [style.right, style.bottom, style.fontSize].join("|");
                });
            const unitCenterOffsets = [...document.querySelectorAll(".genshin-compact-stats .genshin-field > span, .genshin-combat-input-grid .genshin-field > span")]
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
        assert.deepEqual(layoutAudit.unitCenterOffsets, [0]);
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
                pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        assert.ok(mobileLayoutAudit.controls.every((control) => control.width >= control.requiredWidth), `mobile control text is clipped: ${JSON.stringify(mobileLayoutAudit.controls)}`);
        assert.ok(mobileLayoutAudit.controls.slice(0, 3).every((control) => control.fontSize === "12px"), "mobile talent labels are not compact");
        assert.ok(mobileLayoutAudit.controls.slice(0, 4).every((control) => control.backgroundPosition === "calc(100% - 9px) 50%"));
        assert.ok(mobileLayoutAudit.controls.slice(0, 4).every((control) => control.backgroundSize === "9px 6px"));
        assert.match(mobileLayoutAudit.profileColumns, /^\d+(?:\.\d+)?px 54px 64px$/);
        assert.equal(mobileLayoutAudit.pageOverflow, false);
        await evaluate(client, `document.querySelector("#tetiMobileMenuButton").click()`);
        const mobileMenuAudit = await evaluate(client, `(() => {
            const header = document.querySelector(".teti-site-header");
            const nav = document.querySelector("#tetiMainNavigation");
            return {
                open: document.body.classList.contains("is-site-menu-open"),
                expanded: document.querySelector("#tetiMobileMenuButton").getAttribute("aria-expanded"),
                navHidden: nav.getAttribute("aria-hidden"),
                navVisible: getComputedStyle(nav).visibility,
                navLeft: Math.round(nav.getBoundingClientRect().left),
                headerZ: Number(getComputedStyle(header).zIndex)
            };
        })()`);
        assert.deepEqual(mobileMenuAudit, { open: true, expanded: "true", navHidden: "false", navVisible: "visible", navLeft: 0, headerZ: 90 });
        await evaluate(client, `document.querySelector("#tetiMobileMenuButton").click()`);
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
            headingAccent: getComputedStyle(document.querySelector("#genshinSelectionTitle"), "::before").backgroundImage,
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
        assert.ok(initialSelectionUi.headingAccent.includes("linear-gradient"));
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
            rarityFilters: document.querySelectorAll('[data-filter-group="rarity"]').length,
            metas: [...document.querySelectorAll("#genshinSelectionList .genshin-selection-option-copy > span")].map((item) => item.textContent),
            bulkFilterRow: document.querySelector("#genshinFilterToggleAll").parentElement.querySelector("[data-filter-group]").dataset.filterGroup,
            selectedFilterCount: document.querySelectorAll('[data-filter-group][aria-pressed="true"]').length,
            clearFilterDisabled: document.querySelector("#genshinFilterToggleAll").disabled
        })`);
        assert.ok(weaponSelectionUi.summary.includes("両手剣"));
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

        await evaluate(client, selectionExpression({
            characterName: "甘雨",
            characterId: "10000037",
            weaponName: "アモスの弓",
            weaponId: "15502",
            constellation: "C1"
        }));
        await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
        await waitFor(client, `document.querySelectorAll(".genshin-condition-card").length === 4`);
        const cardLayout = await evaluate(client, `(() => ({
            order: [...document.querySelectorAll(".genshin-condition-card")].map((card) => card.dataset.conditionCard),
            text: document.querySelector("#genshinJsonConditionCards").innerText,
            hasAmosStack: Boolean(document.querySelector("[data-condition-card='weapon'] #genshinJsonAmosStack")),
            hasConstellationSelect: Boolean(document.querySelector("#genshinJsonConstellationLevel"))
        }))()`);
        assert.deepEqual(cardLayout.order, ["reaction", "weapon", "artifact", "talent-constellation"]);
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
