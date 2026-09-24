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

        const runWitchProduction = async (modifierId) => evaluate(client, `(async () => {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            const applied = payload.results.flatMap((result) => result.breakdown?.appliedModifiers || []);
            const appliedItem = applied.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const skippedItem = payload.candidateModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const partyCandidate = payload.partyModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
            const source = appliedItem || skippedItem || partyCandidate;
            const key = source?.analysis?.conditionStateKey || "";
            const request = payload.calculationRequest || {};
            return {
                totalExpected: payload.results.reduce((sum, result) => sum + Number(result.total?.expected ?? result.expected ?? 0), 0),
                applied: Boolean(appliedItem),
                appliedValue: appliedItem?.value ?? null,
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

        const partyWitchCase = async ({ selection, supportCharacterId, group, modifierId, supportDef, reaction }) => {
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
            if (reaction) await setReactionOption(reaction);
            await clickAndWait(client, "#genshinJsonPrepareConditionsButton");
            const metadata = await evaluate(client, `(async () => {
                const calcData = await window.GenshinCalcData.loadGenshinCalcData();
                const context = window.GenshinCalcEngine.buildCharacterCalcContext();
                const panel = window.GenshinCalcConditions.conditionPanelState(context, calcData);
                const candidate = panel.partyModifiers.find((item) => item.modifier?.id === ${JSON.stringify(modifierId)});
                if (!candidate) throw new Error("missing Witch party candidate: ${modifierId}");
                return { key: candidate.analysis.conditionStateKey, candidateKey: candidate.key, group: candidate.modifier.conditionGroupId || "" };
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

        const witchUiProduction = {
            razor: await directWitchCase({
                selection: { characterName: "レザー", characterId: "10000020", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-razor-wolf_within_burst_atk",
                modifierId: "t_10000020_lockedPassive_wolf_within_burst_atk",
                offValue: "locked",
                onValue: "unlocked"
            }),
            venti: await directWitchCase({
                selection: { characterName: "ウェンティ", characterId: "10000022", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                group: "witch-venti-stormeye_swirl_damage",
                modifierId: "t_10000022_lockedPassive_stormeye_swirl_damage",
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
            albedo: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000038",
                group: "witch-albedo-solar_isotoma_damage",
                modifierId: "t_10000038_lockedPassive_solar_isotoma_damage",
                supportDef: 1000
            }),
            sucrose: await partyWitchCase({
                selection: { characterName: "甘雨", characterId: "10000037", weaponName: "", weaponId: "", constellation: "C0", atk: 2000, def: 1000 },
                supportCharacterId: "10000043",
                group: "witch-sucrose-small-wind-spirit",
                modifierId: "t_10000043_lockedPassive_small_wind_spirit_damage"
            })
        };

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
