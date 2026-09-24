(function () {
    "use strict";

    const ELEMENTS = ["炎", "水", "風", "雷", "草", "氷", "岩"];
    const CHARACTER_RARITIES = [5, 4];
    const WEAPON_RARITIES = [5, 4, 3, 2, 1];
    const SELECTION_IMAGE_ROOT = "/games/images/genshin";
    const SELECTION_IMAGE_FALLBACK = `${SELECTION_IMAGE_ROOT}/fallback.webp`;
    const CHARACTER_RELEASE_ORDER_PATH = "/games/genshin/data/character-release-order.json";
    const ELEMENT_ICON_NAMES = {
        "炎": "pyro",
        "水": "hydro",
        "風": "anemo",
        "雷": "electro",
        "草": "dendro",
        "氷": "cryo",
        "岩": "geo"
    };
    const WEAPON_ICON_NAMES = {
        "片手剣": "sword",
        "両手剣": "claymore",
        "長柄武器": "polearm",
        "弓": "bow",
        "法器": "catalyst"
    };
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
    const state = { mode: "character", owner: "main", partySlot: null, characters: [], weapons: [], artifactSets: [], artifactSlot: "one", character: null, filters: new Set(), returnFocus: null };
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
    }

    function hasSelectedFilter(group) {
        const prefix = `${group}:`;
        return [...state.filters].some((key) => key.startsWith(prefix));
    }

    async function loadCharacterReleaseOrder() {
        try {
            const response = await fetch(CHARACTER_RELEASE_ORDER_PATH, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            const data = await response.json();
            if (!Array.isArray(data.order)) throw new Error("order is not an array");
            return new Map(data.order.map((id, index) => [String(id), index]));
        } catch (error) {
            console.warn("Genshin character release order load failed", error);
            return new Map();
        }
    }

    function sortCharactersByReleaseOrder(characters, releaseOrder) {
        return characters.sort((a, b) => {
            const aOrder = releaseOrder.get(a.id);
            const bOrder = releaseOrder.get(b.id);
            if (aOrder !== undefined || bOrder !== undefined) {
                if (aOrder === undefined) return 1;
                if (bOrder === undefined) return -1;
                return aOrder - bOrder;
            }
            return Number(b.id) - Number(a.id);
        });
    }

    function updateBulkFilterButton() {
        const button = byId("genshinFilterToggleAll");
        if (!button) return;
        button.textContent = "フィルタ解除";
        button.disabled = state.filters.size === 0;
    }

    function makeFilterButton(group, value) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "genshin-filter-button";
        button.dataset.filterGroup = group;
        button.dataset.filterValue = String(value);
        button.setAttribute("aria-pressed", "false");
        if (group === "element" && ELEMENT_ICON_NAMES[value]) {
            button.classList.add("genshin-filter-button--element");
            button.setAttribute("aria-label", `${value}元素`);
            button.title = `${value}元素`;
            const icon = document.createElement("img");
            icon.src = `${SELECTION_IMAGE_ROOT}/elements/${ELEMENT_ICON_NAMES[value]}.webp`;
            icon.alt = "";
            icon.width = 30;
            icon.height = 30;
            icon.decoding = "async";
            button.appendChild(icon);
        } else {
            button.textContent = group === "rarity" ? `★${value}` : "旅人";
            if (group === "element") button.setAttribute("aria-label", "旅人");
        }
        return button;
    }

    function makeFilterRow(label, group, values) {
        const row = document.createElement("div");
        row.className = "genshin-filter-row";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", label);
        values.forEach((value) => row.appendChild(makeFilterButton(group, value)));
        return row;
    }

    function renderFilters() {
        const wrap = byId("genshinSelectionFilters");
        wrap.replaceChildren();
        if (state.mode === "artifact") {
            const row = document.createElement("div");
            row.className = "genshin-filter-row genshin-artifact-selection-actions";
            const clear = document.createElement("button");
            clear.type = "button";
            clear.className = "genshin-filter-toggle-all";
            clear.id = "genshinArtifactSelectionClear";
            clear.textContent = "選択解除";
            clear.disabled = !byId(artifactSelectId()).value;
            row.appendChild(clear);
            wrap.appendChild(row);
            return;
        }
        const toggleAll = document.createElement("button");
        toggleAll.type = "button";
        toggleAll.className = "genshin-filter-toggle-all";
        toggleAll.id = "genshinFilterToggleAll";
        if (state.mode === "character") {
            const elementRow = makeFilterRow("元素", "element", ELEMENTS);
            wrap.appendChild(elementRow);
            const rarityRow = makeFilterRow("レアリティと旅人", "rarity", CHARACTER_RARITIES);
            rarityRow.appendChild(makeFilterButton("element", "-"));
            rarityRow.appendChild(toggleAll);
            wrap.appendChild(rarityRow);
        } else {
            const rarityRow = makeFilterRow("レアリティ", "rarity", WEAPON_RARITIES);
            rarityRow.appendChild(toggleAll);
            wrap.appendChild(rarityRow);
        }
        updateBulkFilterButton();
    }

    function visibleItems() {
        const query = normalizeSearchText(byId("genshinSelectionSearch").value);
        const source = state.mode === "character" ? state.characters : state.mode === "weapon" ? state.weapons : state.artifactSets;
        return source.filter((item) => {
            const searchText = normalizeSearchText(`${item.nameJa} ${item.nameReading || ""} ${state.mode === "character" ? CHARACTER_READINGS[item.nameJa] || "" : ""}`);
            if (query && !searchText.includes(query)) return false;
            if (state.mode === "artifact") {
                const otherId = byId(artifactSelectId(state.artifactSlot === "one" ? "two" : "one")).value;
                return !otherId || item.id !== otherId || item.id === byId(artifactSelectId()).value;
            }
            if (hasSelectedFilter("rarity") && !state.filters.has(filterKey("rarity", item.rarity))) return false;
            if (state.mode === "character" && hasSelectedFilter("element") && !state.filters.has(filterKey("element", item.element))) return false;
            if (state.mode === "character") {
                if (state.owner === "party" && window.GenshinPartyState?.selectedCharacterIds?.(state.partySlot).includes(String(item.id))) return false;
                return true;
            }
            return state.character && item.weaponType === state.character.weaponType;
        });
    }

    function renderList() {
        const list = byId("genshinSelectionList");
        const items = visibleItems();
        list.replaceChildren();
        byId("genshinSelectionSummary").textContent = state.mode === "weapon" && state.character
            ? `${state.character.nameJa}が装備できる武器・${items.length}件`
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
            button.dataset.selectionKind = state.mode;
            if (item.rarity) button.dataset.rarity = String(item.rarity);
            if (state.mode === "character") {
                const elementName = item.element === "-" ? "旅人" : `${item.element}元素`;
                button.setAttribute("aria-label", `${item.nameJa}、${elementName}、★${item.rarity}、${item.weaponType}`);
            }
            if (state.mode === "artifact" && item.id === byId(artifactSelectId()).value) {
                button.classList.add("is-selected");
                button.setAttribute("aria-pressed", "true");
            }
            const image = document.createElement("img");
            const imageKind = state.mode === "character" ? "characters" : state.mode === "weapon" ? "weapons" : "artifacts";
            image.className = "genshin-selection-option-image";
            image.src = `${SELECTION_IMAGE_ROOT}/${imageKind}/${item.id}.webp`;
            image.alt = "";
            image.width = 48;
            image.height = 48;
            image.loading = "lazy";
            image.decoding = "async";
            image.addEventListener("error", () => {
                if (image.dataset.fallbackApplied === "true") return;
                image.dataset.fallbackApplied = "true";
                image.src = SELECTION_IMAGE_FALLBACK;
            });
            if (state.mode === "character") {
                const badges = document.createElement("span");
                badges.className = "genshin-selection-option-badges";
                if (ELEMENT_ICON_NAMES[item.element]) {
                    const elementIcon = document.createElement("img");
                    elementIcon.className = "genshin-selection-element-icon";
                    elementIcon.src = `${SELECTION_IMAGE_ROOT}/elements/${ELEMENT_ICON_NAMES[item.element]}.webp`;
                    elementIcon.alt = "";
                    elementIcon.width = 20;
                    elementIcon.height = 20;
                    elementIcon.decoding = "async";
                    badges.appendChild(elementIcon);
                }
                if (WEAPON_ICON_NAMES[item.weaponType]) {
                    const weaponIcon = document.createElement("img");
                    weaponIcon.className = "genshin-selection-weapon-icon";
                    weaponIcon.src = `${SELECTION_IMAGE_ROOT}/ui/weapon-${WEAPON_ICON_NAMES[item.weaponType]}.webp`;
                    weaponIcon.alt = "";
                    weaponIcon.width = 20;
                    weaponIcon.height = 20;
                    weaponIcon.decoding = "async";
                    badges.appendChild(weaponIcon);
                }
                button.append(image, badges);
            } else {
                button.appendChild(image);
            }
            const copy = document.createElement("span");
            copy.className = "genshin-selection-option-copy";
            const name = document.createElement("strong");
            name.textContent = item.nameJa;
            copy.appendChild(name);
            if (item.dataStatus === "provisional") {
                const provisional = document.createElement("span");
                provisional.className = "genshin-selection-provisional";
                provisional.textContent = item.verificationLabel || "検証中";
                copy.appendChild(provisional);
                button.dataset.dataStatus = "provisional";
                button.setAttribute("aria-label", `${button.getAttribute("aria-label") || item.nameJa}、検証中データ`);
            }
            if (state.mode === "weapon") {
                const meta = document.createElement("span");
                meta.textContent = `★${item.rarity}`;
                copy.appendChild(meta);
            }
            button.appendChild(copy);
            if (state.mode === "artifact" && button.classList.contains("is-selected")) {
                const check = document.createElement("span");
                check.className = "genshin-selection-option-check";
                check.textContent = "✓";
                check.setAttribute("aria-hidden", "true");
                button.appendChild(check);
            }
            list.appendChild(button);
        });
    }

    function artifactSelectId(slot = state.artifactSlot) {
        if (state.owner === "party") {
            return `genshinPartyArtifact${slot === "two" ? "Two" : "One"}${state.partySlot}`;
        }
        return slot === "two" ? "genshinArtifactSetTwo" : "genshinArtifactSetOne";
    }

    function artifactTriggerId(slot) {
        return slot === "two" ? "genshinArtifactSetTwoTrigger" : "genshinArtifactSetOneTrigger";
    }

    function syncArtifactTrigger(slot) {
        const select = byId(artifactSelectId(slot));
        const trigger = byId(artifactTriggerId(slot));
        if (!select || !trigger) return;
        const selected = state.artifactSets.find((item) => item.id === select.value);
        const label = document.createElement("span");
        label.className = "genshin-artifact-selection-trigger-label";
        label.textContent = selected?.shortNameJa || selected?.nameJa || "聖遺物を選択";
        trigger.replaceChildren();
        if (selected) {
            const image = document.createElement("img");
            image.className = "genshin-artifact-selection-trigger-image";
            image.src = `${SELECTION_IMAGE_ROOT}/artifacts/${selected.id}.webp`;
            image.alt = "";
            image.width = 26;
            image.height = 26;
            image.decoding = "async";
            image.addEventListener("error", () => {
                if (image.dataset.fallbackApplied === "true") return;
                image.dataset.fallbackApplied = "true";
                image.src = SELECTION_IMAGE_FALLBACK;
            });
            trigger.appendChild(image);
        }
        trigger.appendChild(label);
        trigger.classList.toggle("is-empty", !selected);
        trigger.title = selected?.nameJa || "";
        trigger.setAttribute("aria-label", selected ? `聖遺物：${selected.nameJa}` : "聖遺物を選択");
    }

    function syncArtifactTriggers() {
        syncArtifactTrigger("one");
        syncArtifactTrigger("two");
    }

    function closeDialog() {
        const dialog = byId("genshinSelectionDialog");
        if (dialog.open) dialog.close();
        if (state.returnFocus) state.returnFocus.focus();
    }

    function clearWeapon() {
        setField("genshinWeaponInput", "");
        setField("genshinCalcWeaponId", "");
        syncWeaponRefinement(null);
    }

    function syncWeaponRefinement(weapon) {
        const select = byId("genshinWeaponRefinement");
        if (!select) return;
        const confirmed = Array.isArray(weapon?.confirmedRefinements)
            ? new Set(weapon.confirmedRefinements.map(Number))
            : null;
        Array.from(select.options || []).forEach((option, index) => {
            const rank = Number(String(option.value || option.textContent).match(/\d+/)?.[0] || index + 1);
            const enabled = !confirmed || confirmed.has(rank);
            option.disabled = !enabled;
            option.textContent = enabled ? `R${rank}` : `R${rank}（未確認）`;
        });
        if (confirmed && !confirmed.has(Number(String(select.value).match(/\d+/)?.[0] || 1))) {
            select.value = `R${[...confirmed].sort((a, b) => a - b)[0] || 1}`;
            dispatchInput(select);
        }
    }

    function syncCharacter(character, keepWeapon) {
        state.character = character || null;
        const weaponInput = byId("genshinWeaponInput");
        const weaponImageButton = document.querySelector('[data-selection-target="genshinWeaponInput"]');
        weaponInput.disabled = !state.character;
        if (weaponImageButton) weaponImageButton.disabled = !state.character;
        weaponInput.placeholder = state.character ? "武器を選択" : "先にキャラを選択";
        if (!state.character) return clearWeapon();
        if (!keepWeapon) {
            const currentWeapon = state.weapons.find((item) => item.id === byId("genshinCalcWeaponId").value);
            if (!currentWeapon || currentWeapon.weaponType !== state.character.weaponType) clearWeapon();
        }
    }

    function chooseItem(id) {
        if (state.owner === "party") {
            const source = state.mode === "character" ? state.characters : state.mode === "weapon" ? state.weapons : state.artifactSets;
            const item = source.find((entry) => entry.id === id);
            if (!item || !window.GenshinPartyState?.setPartySelection?.(state.partySlot, state.mode, item, state.artifactSlot)) return;
            closeDialog();
            return;
        }
        if (state.mode === "character") {
            const character = state.characters.find((item) => item.id === id);
            if (!character) return;
            const changed = byId("genshinCalcCharacterId").value !== character.id;
            if (changed) window.GenshinInputProvenance?.clearDerivedBaseStats?.("character");
            setField("genshinReflectCharacter", character.nameJa);
            setField("genshinCalcCharacterId", character.id);
            syncCharacter(character, !changed);
        } else if (state.mode === "weapon") {
            const weapon = state.weapons.find((item) => item.id === id);
            if (!weapon) return;
            window.GenshinInputProvenance?.clearDerivedBaseStats?.("weapon");
            setField("genshinWeaponInput", weapon.nameJa);
            setField("genshinCalcWeaponId", weapon.id);
            syncWeaponRefinement(weapon);
        } else {
            const artifactSet = state.artifactSets.find((item) => item.id === id);
            if (!artifactSet) return;
            const otherSlot = state.artifactSlot === "one" ? "two" : "one";
            if (byId("genshinArtifactSetMode").value === "2pc2pc" && byId(artifactSelectId(otherSlot)).value === id) {
                setField(artifactSelectId(otherSlot), "");
            }
            setField(artifactSelectId(), id);
            syncArtifactTriggers();
        }
        closeDialog();
    }

    function openDialog(mode, trigger, artifactSlot = "one", owner = "main", partySlot = null) {
        state.owner = owner;
        state.partySlot = partySlot;
        if (owner === "party") {
            const characterId = String(byId(`genshinPartyCharacter${partySlot}`)?.value || "");
            state.character = state.characters.find((item) => item.id === characterId) || null;
        } else if (mode !== "artifact") {
            state.character = state.characters.find((item) => item.id === byId("genshinCalcCharacterId")?.value) || null;
        }
        if (mode === "weapon" && !state.character) return openDialog("character", byId("genshinReflectCharacter"));
        state.mode = mode;
        state.artifactSlot = artifactSlot;
        state.returnFocus = trigger;
        resetFilters();
        byId("genshinSelectionSearch").value = "";
        byId("genshinSelectionSearchClear").disabled = true;
        byId("genshinSelectionSearch").placeholder = mode === "artifact" ? "聖遺物セット名で検索" : "漢字・ひらがな・カタカナで検索";
        byId("genshinSelectionKicker").textContent = mode === "character" ? "CHARACTER" : mode === "weapon" ? "WEAPON" : "ARTIFACT SET";
        byId("genshinSelectionTitle").textContent = mode === "character" ? "キャラクターを選択" : mode === "weapon" ? "武器を選択" : "聖遺物セットを選択";
        const dialog = byId("genshinSelectionDialog");
        dialog.classList.toggle("is-character", mode === "character");
        dialog.classList.toggle("is-weapon", mode === "weapon");
        dialog.classList.toggle("is-artifact", mode === "artifact");
        renderFilters();
        renderList();
        dialog.showModal();
        const touchCapable = navigator.maxTouchPoints > 0
            || window.matchMedia?.("(pointer: coarse)").matches;
        const finePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)").matches;
        if (!touchCapable && finePointer && window.innerWidth > 680) {
            byId("genshinSelectionSearch").focus();
        }
    }

    function bindEvents() {
        const characterInput = byId("genshinReflectCharacter");
        const weaponInput = byId("genshinWeaponInput");
        const artifactOneTrigger = byId("genshinArtifactSetOneTrigger");
        const artifactTwoTrigger = byId("genshinArtifactSetTwoTrigger");
        characterInput.addEventListener("click", () => openDialog("character", characterInput));
        weaponInput.addEventListener("click", () => openDialog("weapon", weaponInput));
        document.querySelectorAll("[data-selection-target]").forEach((button) => {
            button.addEventListener("click", () => {
                const input = byId(button.dataset.selectionTarget);
                if (input) openDialog(input === characterInput ? "character" : "weapon", button);
            });
        });
        artifactOneTrigger.addEventListener("click", () => openDialog("artifact", artifactOneTrigger, "one"));
        artifactTwoTrigger.addEventListener("click", () => openDialog("artifact", artifactTwoTrigger, "two"));
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
            const artifactClear = event.target.closest("#genshinArtifactSelectionClear");
            if (artifactClear) {
                if (state.owner === "party") {
                    window.GenshinPartyState?.setPartySelection?.(state.partySlot, "artifact", null, state.artifactSlot);
                } else {
                    setField(artifactSelectId(), "");
                    syncArtifactTriggers();
                }
                closeDialog();
                return;
            }
            const toggleAll = event.target.closest("#genshinFilterToggleAll");
            if (toggleAll) {
                state.filters.clear();
                byId("genshinSelectionFilters").querySelectorAll("[data-filter-group]").forEach((button) => {
                    button.setAttribute("aria-pressed", "false");
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
        byId("genshinCalcWeaponId").addEventListener("input", () => {
            syncWeaponRefinement(state.weapons.find((item) => item.id === byId("genshinCalcWeaponId").value) || null);
        });
        ["one", "two"].forEach((slot) => {
            byId(artifactSelectId(slot)).addEventListener("change", () => syncArtifactTrigger(slot));
        });
    }

    async function init() {
        if (!window.GenshinIdResolver) return;
        await window.GenshinIdResolver.ready;
        const releaseOrder = await loadCharacterReleaseOrder();
        state.characters = sortCharactersByReleaseOrder(window.GenshinIdResolver.listCharacters(), releaseOrder);
        state.weapons = window.GenshinIdResolver.listWeapons()
            .filter((item) => item.selectable !== false)
            .sort((a, b) => b.rarity - a.rarity || a.nameJa.localeCompare(b.nameJa, "ja"));
        state.artifactSets = window.GenshinIdResolver.listArtifactSets()
            .filter((item) => {
                const effect = window.GenshinIdResolver.resolveArtifactSetEffect(item.id);
                return Boolean(effect?.twoPieceEffect || effect?.fourPieceEffect);
            })
            .sort((a, b) => Number(b.id) - Number(a.id));
        bindEvents();
        syncCharacter(state.characters.find((item) => item.id === byId("genshinCalcCharacterId").value), true);
        syncWeaponRefinement(state.weapons.find((item) => item.id === byId("genshinCalcWeaponId")?.value) || null);
        syncArtifactTriggers();
    }

    function openPartySelection(mode, slot, trigger, artifactSlot = "one") {
        const numericSlot = Number(slot);
        if (![2, 3, 4].includes(numericSlot)) return;
        openDialog(mode, trigger, artifactSlot, "party", numericSlot);
    }

    window.GenshinSelectionModal = { openPartySelection };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
