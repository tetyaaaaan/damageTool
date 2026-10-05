(function () {
    "use strict";
    const SCHEMA_VERSION = 1;
    const STORAGE_KEY = "tetinet.genshin.currentCalcState.v1";
    const REQUEST_FIELDS = ["schemaVersion", "calculationInput", "characterId", "characterElement", "weaponId", "refinement", "artifactSetMode", "artifactSetIds", "constellation", "party", "talentLevels", "stats", "inputProvenance", "enemy", "mode", "reactionOptionKey", "reactionOption", "reactionElement", "manualInputs", "uiState"];
    const STAT_FIELDS = { hp: "genshinHpInput", baseHp: "genshinBaseHpInput", baseAtk: "genshinBaseAtkInput", atk: "genshinAtkInput", baseDef: "genshinBaseDefInput", def: "genshinDefInput", elementalMastery: "genshinElementalMasteryInput", critRate: "genshinCritRateInput", critDamage: "genshinCritDamageInput", energyRecharge: "genshinEnergyRechargeInput", elementDamageBonus: "genshinElementalDamageInput" };
    const UI_FIELDS = { amosStack: "genshinJsonAmosStack", crimsonWitchStack: "genshinJsonCrimsonWitchStack", enableCharacterCondition: "genshinJsonEnableCharacterCondition", enableLowHpCondition: "genshinJsonEnableLowHpCondition", enableWeaponLowHpCondition: "genshinJsonEnableWeaponLowHpCondition" };
    let applying = false, initialized = false, editedBeforeReady = false, timer;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const byId = (id) => document.getElementById(id);
    function message(text, error = false) {
        const element = byId("genshinCurrentCalcStateMessage");
        if (element) { element.textContent = text; element.setAttribute("role", error ? "alert" : "status"); }
    }
    function importErrorMessage(error) {
        if (error?.code === "INVALID_JSON") return "JSON形式を読み取れません。ファイルの内容を確認してください。";
        if (error?.code === "UNSUPPORTED_SAVE") return "対応していない計算状態ファイルです。原神の計算画面から保存したJSONを選んでください。";
        if (error?.code === "UNKNOWN_ID") return "ファイル内に現在利用できないIDがあります。最新のJSONを保存し直してください。";
        if (error?.message === "計算状態ファイルが大きすぎます。") return "計算状態ファイルが大きすぎます。2MB以下のJSONを選んでください。";
        return "計算状態を読み込めませんでした。ファイルを確認してもう一度お試しください。";
    }
    function storage() { try { return window.localStorage; } catch (_) { return null; } }
    function selectionState() {
        return {
            resultTab: document.querySelector('[data-json-tab][aria-selected="true"]')?.dataset.jsonTab || "basic",
            basicTab: document.querySelector('[data-basic-tab][aria-selected="true"]')?.dataset.basicTab || "normal",
            attackKey: document.querySelector('[data-result-detail-toggle][aria-expanded="true"]')?.closest("[data-attack-key]")?.dataset.attackKey || ""
        };
    }
    function createState(request = window.GenshinCalcEngine.buildCalculationRequestFromForm(), selection = selectionState()) {
        return { schemaVersion: SCHEMA_VERSION, game: "genshin", state: { request: clone(Object.fromEntries(REQUEST_FIELDS.filter((key) => request[key] !== undefined).map((key) => [key, request[key]]))), selection: clone(selection) } };
    }
    function validate(value, data) {
        const fail = (code = "UNSUPPORTED_SAVE") => { const error = new Error("このファイルは対応する原神の計算状態ではありません。"); error.code = code; throw error; };
        if (!value || value.schemaVersion !== SCHEMA_VERSION || value.game !== "genshin" || !value.state || !value.state.request) fail();
        const walk = (item, depth = 0) => {
            if (depth > 30) fail();
            if (typeof item === "number" && !Number.isFinite(item)) fail();
            if (item && typeof item === "object") Object.entries(item).forEach(([key, child]) => { if (["__proto__", "constructor", "prototype"].includes(key)) fail(); walk(child, depth + 1); });
        };
        walk(value);
        const r = value.state.request;
        if (r.schemaVersion !== 1 || !r.stats || !r.talentLevels || !r.enemy || !r.uiState || !r.manualInputs) fail();
        const record = (item) => item && typeof item === "object" && !Array.isArray(item);
        if (![r.stats, r.talentLevels, r.enemy, r.uiState, r.manualInputs].every(record)) fail();
        if (typeof r.characterId !== "string" || typeof r.weaponId !== "string") fail();
        const number = (n, min, max) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
        Object.keys(STAT_FIELDS).forEach((key) => { if (!number(r.stats[key], 0, 1e12)) fail(); });
        if (!number(r.constellation, 0, 6) || !number(r.refinement, 1, 5)) fail();
        Object.values(r.talentLevels).forEach((n) => { if (!number(n, 1, 15)) fail(); });
        if (!number(r.enemy.enemyLevel, 1, 1000) || !record(r.enemy.resistance?.base) || !record(r.enemy.resistance?.manualDebuff)) fail();
        if (!record(r.uiState.toggleByModifier) || !record(r.uiState.complexConditionByModifier)) fail();
        if (Object.values(r.uiState.toggleByModifier).some((v) => typeof v !== "boolean")) fail();
        if (Object.values(r.uiState.complexConditionByModifier).some((v) => !record(v))) fail();
        const checkEquipment = (characterId, weaponId, artifacts) => {
            const c = characterId ? data.characters?.[characterId] : null;
            const w = weaponId ? data.weapons?.[weaponId] : null;
            if ((characterId && !c) || (weaponId && !w)) fail("UNKNOWN_ID");
            if (weaponId && (!c || w.weaponType !== c.weaponType)) fail();
            if (!Array.isArray(artifacts)) fail();
            if (artifacts.some((id) => !data.artifactSets?.[id])) fail("UNKNOWN_ID");
        };
        checkEquipment(r.characterId, r.weaponId, r.artifactSetIds);
        if (r.characterId && (!r.calculationInput || !number(r.calculationInput.level, 1, 100))) fail();
        if (r.weaponId && !number(r.calculationInput?.weapon?.level, 1, 90)) fail();
        if (r.characterId && (r.calculationInput.characterId !== r.characterId || (r.calculationInput.weapon?.id || "") !== r.weaponId)) fail();
        if (!["none", "4pc", "2pc2pc", "2pc"].includes(r.artifactSetMode)) fail();
        if (r.reactionOptionKey !== "none" && !data.reactionDefinitions?.options?.[r.reactionOptionKey]) fail("UNKNOWN_ID");
        if (r.enemy.presetId !== "custom" && !(data.enemies?.presets || []).some((p) => String(p.id) === String(r.enemy.presetId))) fail("UNKNOWN_ID");
        if (r.party) {
            if (r.party.schemaVersion !== 2 || !Array.isArray(r.party.members) || !record(r.party.conditionStates) || !record(r.party.resonanceStates)) fail();
            const ids = new Set(), slots = new Set();
            r.party.members.forEach((m) => {
                if (!number(m.slot, 1, 4) || slots.has(m.slot)) fail(); slots.add(m.slot);
                checkEquipment(m.characterId, m.equipment?.weaponId || "", m.equipment?.artifactSetIds || []);
                if (m.characterId) { if (ids.has(m.characterId)) fail(); ids.add(m.characterId); }
                if (!number(m.level, 1, 100) || !number(m.constellation, 0, 6) || !record(m.buffStates)) fail();
            });
            if (r.party.members.find((m) => m.slot === 1)?.characterId !== r.characterId) fail();
        }
        return createState(r, value.state.selection || { resultTab: "basic", basicTab: "normal", attackKey: "" });
    }
    function serialize(state = createState()) { return JSON.stringify(state, null, 2); }
    function parse(text, data) {
        if (typeof text !== "string" || text.length > 2000000) throw new Error("計算状態ファイルを読み込めません。");
        let value;
        try { value = JSON.parse(text); }
        catch (cause) { const error = new Error(cause.message); error.code = "INVALID_JSON"; error.cause = cause; throw error; }
        return validate(value, data);
    }
    function setField(id, value, emit = true) {
        const element = byId(id);
        if (!element) return;
        if (typeof value === "boolean") element.checked = value;
        else element.value = value === null || value === undefined ? "" : String(value);
        if (element.dataset) delete element.dataset.preciseValue;
        if (emit) { element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    function restoreSelection(selection) {
        const find = (selector, key, value) => [...document.querySelectorAll(selector)].find((element) => element.dataset[key] === value);
        find("[data-json-tab]", "jsonTab", selection.resultTab)?.click();
        find("[data-basic-tab]", "basicTab", selection.basicTab)?.click();
        const row = find("[data-attack-key]", "attackKey", selection.attackKey);
        row?.querySelector('[data-result-detail-toggle][aria-expanded="false"]')?.click();
    }
    async function applyValidated(saved, data) {
        const r = saved.state.request;
        applying = true;
        try {
            setField("genshinReflectCharacter", data.characters[r.characterId]?.nameJa || "");
            setField("genshinCalcCharacterId", r.characterId);
            setField("genshinReflectLevel", r.calculationInput?.level || r.enemy.characterLevel);
            setField("genshinReflectConstellation", "C" + r.constellation);
            ["normal", "skill", "burst"].forEach((kind) => setField("genshin" + kind[0].toUpperCase() + kind.slice(1) + "TalentLevel", r.talentLevels[kind]));
            setField("genshinWeaponInput", data.weapons[r.weaponId]?.nameJa || "");
            setField("genshinCalcWeaponId", r.weaponId);
            setField("genshinWeaponLevel", r.calculationInput?.weapon?.level || 90);
            setField("genshinWeaponRefinement", "R" + r.refinement);
            setField("genshinArtifactSetMode", r.artifactSetMode);
            setField("genshinArtifactSetOne", r.artifactSetIds[0] || "");
            setField("genshinArtifactSetTwo", r.artifactSetIds[1] || "");
            await window.GenshinPartyState.restoreSupportState(r.party || {});
            Object.entries(STAT_FIELDS).forEach(([key, id]) => {
                setField(id, r.stats[key], false);
                window.GenshinInputProvenance?.markById(id, r.inputProvenance?.fields?.[key] || "manual");
            });
            Object.entries(UI_FIELDS).forEach(([key, id]) => setField(id, r.uiState[key], false));
            ["C1", "C2", "C4", "C6"].forEach((key) => setField("genshinJsonEnableConstellation" + key, r.uiState.constellationConditions?.[key] || false, false));
            setField("genshinEnemyPresetSelect", r.enemy.presetId);
            setField("genshinEnemyLevelInput", r.enemy.enemyLevel);
            setField("genshinEnemyElementalResistanceInput", r.enemy.resistance.base.defaultElemental);
            setField("genshinEnemyPhysicalResistanceInput", r.enemy.resistance.base.physical);
            setField("genshinElementalResistanceDebuffInput", r.enemy.resistance.manualDebuff.allElemental);
            setField("genshinPhysicalResistanceDebuffInput", r.enemy.resistance.manualDebuff.physical);
            setField("genshinDefenseReductionInput", r.enemy.defenseReduction);
            setField("genshinDefenseIgnoreInput", r.enemy.defenseIgnore);
            setField("genshinJsonReactionOption", r.reactionOptionKey);
            setField("genshinJsonReactionElement", r.reactionElement);
            window.GenshinCalcEngine.hydrateReactionContext(r, data);
            const panel = window.GenshinCalcConditions.conditionPanelState(r, data);
            window.GenshinCalcRenderer.renderConditionCards(panel, r);
            setField("genshinJsonRecordedHealing", r.manualInputs.recordedHealing, false);
            Object.entries({ hp: "Hp", atk: "Atk", def: "Def", elementalMastery: "ElementalMastery" }).forEach(([key, suffix]) => setField("genshinJsonProvider" + suffix, r.manualInputs.providerStats?.[key], false));
            document.querySelectorAll("[data-genshin-resource-key]").forEach((element) => { element.value = String(r.manualInputs.resourceStates?.[element.dataset.genshinResourceKey] ?? ""); });
            document.querySelectorAll("[data-genshin-toggle-key]").forEach((element) => { element.checked = r.uiState.toggleByModifier[element.dataset.genshinToggleKey] === true; });
            document.querySelectorAll("[data-genshin-condition-key]").forEach((element) => {
                const state = r.uiState.complexConditionByModifier[element.dataset.genshinConditionKey];
                if (state) element.value = String(state[element.dataset.genshinConditionKind || "option"] ?? "");
            });
            [2, 3, 4].forEach((slot) => {
                const c = r.manualInputs.reactionContributors?.find((item) => item.slot === slot) || {};
                Object.entries({ Level: "level", Em: "elementalMastery", CritRate: "critRate", CritDamage: "critDamage", ReactionBonus: "reactionBonus", BaseBonus: "baseDamageBonus", AdditiveBaseDamage: "additiveBaseDamage" }).forEach(([suffix, key]) => setField("genshinReactionContributor" + slot + suffix, c[key], false));
            });
            setField("genshinStellarConductStacks", r.manualInputs.stellarConductStacks, false);
            setField("genshinStellarSwirlVariant", r.manualInputs.stellarSwirlVariant, false);
        } finally { applying = false; }
        const payload = r.characterId ? await window.GenshinCalcRenderer.calculate({ throwOnError: true }) : null;
        restoreSelection(saved.state.selection);
        persist();
        return payload;
    }
    async function importText(text) {
        if (applying) throw new Error("状態の読み込み中です。完了後にお試しください。");
        const data = await window.GenshinCalcData.loadGenshinCalcData();
        const saved = parse(text, data);
        const previous = createState();
        try { const payload = await applyValidated(saved, data); message("計算状態を読み込みました。"); return payload; }
        catch (error) { await applyValidated(previous, data); throw error; }
    }
    function persist() {
        if (!initialized || applying) return;
        try { const state = createState(); validate(state, window.GenshinCurrentCalcState.data); storage()?.setItem(STORAGE_KEY, serialize(state)); }
        catch (_) { /* Incomplete edits and unavailable browser storage leave the last valid state intact. */ }
    }
    function schedule() { if (!applying && initialized) { clearTimeout(timer); timer = setTimeout(persist, 150); } }
    async function exportFile() {
        const data = await window.GenshinCalcData.loadGenshinCalcData();
        const text = serialize(validate(createState(), data));
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = "tetinet-genshin-currentcalc.json";
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        message("計算状態のJSONを保存しました。");
        return text;
    }
    const observeEdit = (event) => { if (!initialized && event.isTrusted) editedBeforeReady = true; schedule(); };
    document.addEventListener("input", observeEdit);
    document.addEventListener("change", observeEdit);
    document.addEventListener("click", (event) => {
        if (!initialized && event.isTrusted && event.target.closest?.(".genshin-input-panel, #genshinPartyDialog, #genshinConditionDialog")) editedBeforeReady = true;
        if (event.target.closest?.("[data-json-tab], [data-basic-tab], [data-result-detail-toggle], [data-selection-id], [data-party-clear]")) schedule();
    });

    async function init() {
        await Promise.all([window.GenshinIdResolver?.ready, window.GenshinBaseStats?.ready, window.GenshinSelectionModal?.ready, window.GenshinEnemySelector?.ready, window.GenshinPartyState?.ready]);
        const data = await window.GenshinCalcData.loadGenshinCalcData();
        window.GenshinCurrentCalcState.data = data;
        await window.GenshinCalcRenderer.prepareConditions();
        initialized = true;
        byId("genshinCurrentCalcExport")?.addEventListener("click", () => exportFile().catch((error) => message(error.message, true)));
        byId("genshinCurrentCalcImport")?.addEventListener("click", () => byId("genshinCurrentCalcFile").click());
        byId("genshinCurrentCalcFile")?.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try { if (file.size > 2000000) throw new Error("計算状態ファイルが大きすぎます。"); await importText(await file.text()); }
            catch (error) { console.error("[genshin-current-calc-state] import failed", error); message(importErrorMessage(error), true); }
            finally { event.target.value = ""; }
        });
        window.addEventListener("pagehide", persist);
        const text = storage()?.getItem(STORAGE_KEY);
        if (text && !editedBeforeReady) { try { await applyValidated(parse(text, data), data); message("前回の計算状態を復元しました。"); } catch (_) { message("保存状態を復元できませんでした。新しい入力で計算できます。", true); } }
    }
    window.GenshinCurrentCalcState = { SCHEMA_VERSION, STORAGE_KEY, createState, validate, serialize, parse, importText, exportFile, persist, isApplying: () => applying, ready: null };
    let resolveReady;
    window.GenshinCurrentCalcState.ready = new Promise((resolve) => { resolveReady = resolve; });
    document.addEventListener("DOMContentLoaded", () => init().catch((error) => message("状態保存を開始できませんでした。" + error.message, true)).finally(resolveReady));
})();
