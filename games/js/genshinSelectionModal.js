(function () {
    "use strict";

    const ELEMENTS = ["炎", "水", "風", "雷", "草", "氷", "岩", "-"];
    const CHARACTER_RARITIES = [5, 4];
    const WEAPON_RARITIES = [5, 4, 3, 2, 1];
    const CHARACTER_READINGS = {
        "七七": "なな", "久岐忍": "くきしのぶ", "九条裟羅": "くじょうさら", "八重神子": "やえみこ",
        "兹白": "しはく ずぃばい", "凝光": "ぎょうこう", "刻晴": "こくせい", "北斗": "ほくと",
        "千織": "ちおり", "嘉明": "がみん", "夜蘭": "いぇらん", "夢見月瑞希": "ゆめみづきみずき",
        "宵宮": "よいみや", "放浪者": "ほうろうしゃ", "旅人": "たびびと", "早柚": "さゆ",
        "楓原万葉": "かえではらかずは", "煙緋": "えんひ", "珊瑚宮心海": "さんごのみやここみ", "甘雨": "かんう",
        "申鶴": "しんかく", "白朮": "びゃくじゅつ", "神里綾人": "かみさとあやと", "神里綾華": "かみさとあやか",
        "胡桃": "ふーたお", "荒瀧一斗": "あらたきいっと", "藍硯": "らんやん", "行秋": "ゆくあき",
        "辛炎": "しんえん", "重雲": "ちょううん", "鍾離": "しょうり", "閑雲": "かんうん",
        "雲菫": "うんきん", "雷電将軍": "らいでんしょうぐん", "香菱": "しゃんりん", "魈": "しょう",
        "鹿野院平蔵": "しかのいんへいぞう"
    };
    const state = { mode: "character", characters: [], weapons: [], character: null, filters: new Set(), returnFocus: null };
    const byId = (id) => document.getElementById(id);

    function normalizeSearchText(value) {
        return String(value || "")
            .normalize("NFKC")
            .toLocaleLowerCase("ja")
            .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
            .replace(/[\s・ー]/g, "");
    }

    function dispatchInput(element) {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setField(id, value) {
        const field = byId(id);
        if (!field) return;
        field.value = value || "";
        dispatchInput(field);
    }

    const filterKey = (group, value) => `${group}:${value}`;

    function resetFilters() {
        state.filters.clear();
        const groups = state.mode === "character"
            ? [["element", ELEMENTS], ["rarity", CHARACTER_RARITIES]]
            : [["rarity", WEAPON_RARITIES]];
        groups.forEach(([group, entries]) => entries.forEach((value) => state.filters.add(filterKey(group, value))));
    }

    function currentFilterKeys() {
        const groups = state.mode === "character"
            ? [["element", ELEMENTS], ["rarity", CHARACTER_RARITIES]]
            : [["rarity", WEAPON_RARITIES]];
        return groups.flatMap(([group, entries]) => entries.map((value) => filterKey(group, value)));
    }

    function updateBulkFilterButton() {
        const button = byId("genshinFilterToggleAll");
        if (!button) return;
        const allSelected = currentFilterKeys().every((key) => state.filters.has(key));
        button.textContent = allSelected ? "すべて解除" : "すべて選択";
        button.setAttribute("aria-pressed", String(allSelected));
    }

    function makeFilterRow(label, group, values) {
        const row = document.createElement("div");
        row.className = "genshin-filter-row";
        const heading = document.createElement("span");
        heading.className = "genshin-filter-label";
        heading.textContent = label;
        row.appendChild(heading);
        values.forEach((value) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "genshin-filter-button";
            button.dataset.filterGroup = group;
            button.dataset.filterValue = String(value);
            button.setAttribute("aria-pressed", "true");
            button.textContent = group === "rarity" ? `★${value}` : value === "-" ? "旅人" : value;
            row.appendChild(button);
        });
        return row;
    }

    function renderFilters() {
        const wrap = byId("genshinSelectionFilters");
        wrap.replaceChildren();
        const toggleAll = document.createElement("button");
        toggleAll.type = "button";
        toggleAll.className = "genshin-filter-toggle-all";
        toggleAll.id = "genshinFilterToggleAll";
        if (state.mode === "character") {
            const elementRow = makeFilterRow("元素", "element", ELEMENTS);
            elementRow.appendChild(toggleAll);
            wrap.appendChild(elementRow);
            wrap.appendChild(makeFilterRow("レアリティ", "rarity", CHARACTER_RARITIES));
        } else {
            const rarityRow = makeFilterRow("レアリティ", "rarity", WEAPON_RARITIES);
            rarityRow.appendChild(toggleAll);
            wrap.appendChild(rarityRow);
        }
        updateBulkFilterButton();
    }

    function visibleItems() {
        const query = normalizeSearchText(byId("genshinSelectionSearch").value);
        const source = state.mode === "character" ? state.characters : state.weapons;
        return source.filter((item) => {
            const searchText = normalizeSearchText(`${item.nameJa} ${state.mode === "character" ? CHARACTER_READINGS[item.nameJa] || "" : ""}`);
            if (query && !searchText.includes(query)) return false;
            if (!state.filters.has(filterKey("rarity", item.rarity))) return false;
            if (state.mode === "character") return state.filters.has(filterKey("element", item.element));
            return state.character && item.weaponType === state.character.weaponType;
        });
    }

    function renderList() {
        const list = byId("genshinSelectionList");
        const items = visibleItems();
        list.replaceChildren();
        byId("genshinSelectionSummary").textContent = state.mode === "weapon" && state.character
            ? `${state.character.nameJa}の武器種「${state.character.weaponType}」・${items.length}件`
            : `${items.length}件を表示`;
        if (!items.length) {
            const empty = document.createElement("p");
            empty.className = "genshin-selection-empty";
            empty.textContent = "条件に一致する候補がありません。フィルターを切り替えてください。";
            list.appendChild(empty);
            return;
        }
        items.forEach((item) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "genshin-selection-option";
            button.dataset.selectionId = item.id;
            const name = document.createElement("strong");
            name.textContent = item.nameJa;
            const meta = document.createElement("span");
            meta.textContent = state.mode === "character"
                ? `${item.element === "-" ? "旅人" : item.element}・★${item.rarity}・${item.weaponType}`
                : `★${item.rarity}・${item.weaponType}`;
            button.append(name, meta);
            list.appendChild(button);
        });
    }

    function closeDialog() {
        const dialog = byId("genshinSelectionDialog");
        if (dialog.open) dialog.close();
        if (state.returnFocus) state.returnFocus.focus();
    }

    function clearWeapon() {
        setField("genshinWeaponInput", "");
        setField("genshinCalcWeaponId", "");
    }

    function syncCharacter(character, keepWeapon) {
        state.character = character || null;
        const weaponInput = byId("genshinWeaponInput");
        weaponInput.disabled = !state.character;
        weaponInput.placeholder = state.character ? `${state.character.weaponType}を選択` : "先にキャラクターを選択";
        if (!state.character) return clearWeapon();
        if (!keepWeapon) {
            const currentWeapon = state.weapons.find((item) => item.id === byId("genshinCalcWeaponId").value);
            if (!currentWeapon || currentWeapon.weaponType !== state.character.weaponType) clearWeapon();
        }
    }

    function chooseItem(id) {
        if (state.mode === "character") {
            const character = state.characters.find((item) => item.id === id);
            if (!character) return;
            const changed = byId("genshinCalcCharacterId").value !== character.id;
            setField("genshinReflectCharacter", character.nameJa);
            setField("genshinCalcCharacterId", character.id);
            syncCharacter(character, !changed);
        } else {
            const weapon = state.weapons.find((item) => item.id === id);
            if (!weapon) return;
            setField("genshinWeaponInput", weapon.nameJa);
            setField("genshinCalcWeaponId", weapon.id);
        }
        closeDialog();
    }

    function openDialog(mode, trigger) {
        if (mode === "weapon" && !state.character) return openDialog("character", byId("genshinReflectCharacter"));
        state.mode = mode;
        state.returnFocus = trigger;
        resetFilters();
        byId("genshinSelectionSearch").value = "";
        byId("genshinSelectionSearchClear").disabled = true;
        byId("genshinSelectionKicker").textContent = mode === "character" ? "CHARACTER" : "WEAPON";
        byId("genshinSelectionTitle").textContent = mode === "character" ? "キャラクターを選択" : "武器を選択";
        renderFilters();
        renderList();
        byId("genshinSelectionDialog").showModal();
        byId("genshinSelectionSearch").focus();
    }

    function bindEvents() {
        const characterInput = byId("genshinReflectCharacter");
        const weaponInput = byId("genshinWeaponInput");
        characterInput.addEventListener("click", () => openDialog("character", characterInput));
        weaponInput.addEventListener("click", () => openDialog("weapon", weaponInput));
        [characterInput, weaponInput].forEach((input) => input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openDialog(input === characterInput ? "character" : "weapon", input);
        }));
        byId("genshinSelectionClose").addEventListener("click", closeDialog);
        byId("genshinSelectionDialog").addEventListener("click", (event) => {
            if (event.target === byId("genshinSelectionDialog")) closeDialog();
        });
        byId("genshinSelectionSearch").addEventListener("input", () => {
            byId("genshinSelectionSearchClear").disabled = !byId("genshinSelectionSearch").value;
            renderList();
        });
        byId("genshinSelectionSearchClear").addEventListener("click", () => {
            byId("genshinSelectionSearch").value = "";
            byId("genshinSelectionSearchClear").disabled = true;
            renderList();
            byId("genshinSelectionSearch").focus();
        });
        byId("genshinSelectionFilters").addEventListener("click", (event) => {
            const toggleAll = event.target.closest("#genshinFilterToggleAll");
            if (toggleAll) {
                const keys = currentFilterKeys();
                const allSelected = keys.every((key) => state.filters.has(key));
                if (allSelected) state.filters.clear();
                else keys.forEach((key) => state.filters.add(key));
                byId("genshinSelectionFilters").querySelectorAll("[data-filter-group]").forEach((button) => {
                    const key = filterKey(button.dataset.filterGroup, button.dataset.filterValue);
                    button.setAttribute("aria-pressed", String(state.filters.has(key)));
                });
                updateBulkFilterButton();
                renderList();
                return;
            }
            const button = event.target.closest("[data-filter-group]");
            if (!button) return;
            const key = filterKey(button.dataset.filterGroup, button.dataset.filterValue);
            if (state.filters.has(key)) state.filters.delete(key);
            else state.filters.add(key);
            button.setAttribute("aria-pressed", String(state.filters.has(key)));
            updateBulkFilterButton();
            renderList();
        });
        byId("genshinSelectionList").addEventListener("click", (event) => {
            const button = event.target.closest("[data-selection-id]");
            if (button) chooseItem(button.dataset.selectionId);
        });
        byId("genshinCalcCharacterId").addEventListener("input", () => {
            const character = state.characters.find((item) => item.id === byId("genshinCalcCharacterId").value);
            syncCharacter(character, true);
        });
    }

    async function init() {
        if (!window.GenshinIdResolver) return;
        await window.GenshinIdResolver.ready;
        state.characters = window.GenshinIdResolver.listCharacters().sort((a, b) => a.nameJa.localeCompare(b.nameJa, "ja"));
        state.weapons = window.GenshinIdResolver.listWeapons().sort((a, b) => b.rarity - a.rarity || a.nameJa.localeCompare(b.nameJa, "ja"));
        bindEvents();
        syncCharacter(state.characters.find((item) => item.id === byId("genshinCalcCharacterId").value), true);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
