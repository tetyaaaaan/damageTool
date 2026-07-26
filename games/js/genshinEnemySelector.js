(function () {
    "use strict";

    const CUSTOM_ID = "custom";
    let presetsById = {};
    let customResistance = { elemental: 10, physical: 10 };
    let previousSelection = CUSTOM_ID;

    function getElement(id) {
        return document.getElementById(id);
    }

    function numericValue(element, fallback) {
        const value = Number(element?.value);
        return Number.isFinite(value) ? value : fallback;
    }

    function dispatchValueChange(element) {
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function selectedPreset() {
        const id = getElement("genshinEnemyPresetSelect")?.value || CUSTOM_ID;
        return id === CUSTOM_ID ? null : presetsById[id] || null;
    }

    function updateSummary(preset) {
        const summary = getElement("genshinEnemyPresetSummary");
        if (!summary) return;
        const exceptions = Object.entries(preset?.resistance?.byElement || {})
            .map(([element, value]) => `${({ pyro: "炎", hydro: "水", anemo: "風", electro: "雷", dendro: "草", cryo: "氷", geo: "岩" })[element] || element} ${value}%`);
        const immunities = (preset?.immunities || [])
            .map((element) => `${({ pyro: "炎", hydro: "水", anemo: "風", electro: "雷", dendro: "草", cryo: "氷", geo: "岩", physical: "物理" })[element] || element}無効`);
        summary.textContent = preset
            ? `元素耐性 ${preset.resistance.defaultElemental}%／物理耐性 ${preset.resistance.physical}%${exceptions.length ? `／個別 ${exceptions.join("・")}` : ""}${immunities.length ? `／${immunities.join("・")}` : ""}${preset.noteJa ? `（${preset.noteJa}）` : ""}`
            : "レベル・耐性を自由に編集できます。";
    }

    function applySelection({ restoreCustom = true } = {}) {
        const select = getElement("genshinEnemyPresetSelect");
        const level = getElement("genshinEnemyLevelInput");
        const elemental = getElement("genshinEnemyElementalResistanceInput");
        const physical = getElement("genshinEnemyPhysicalResistanceInput");
        if (!select || !level || !elemental || !physical) return;

        const preset = selectedPreset();
        if (!preset) {
            elemental.disabled = false;
            physical.disabled = false;
            if (restoreCustom) {
                elemental.value = String(customResistance.elemental);
                physical.value = String(customResistance.physical);
                dispatchValueChange(elemental);
                dispatchValueChange(physical);
            }
            updateSummary(null);
            return;
        }

        elemental.disabled = true;
        physical.disabled = true;
        level.value = String(preset.defaultLevel || numericValue(level, 90));
        elemental.value = String(preset.resistance.defaultElemental);
        physical.value = String(preset.resistance.physical);
        dispatchValueChange(level);
        dispatchValueChange(elemental);
        dispatchValueChange(physical);
        updateSummary(preset);
    }

    async function initialize() {
        const select = getElement("genshinEnemyPresetSelect");
        const elemental = getElement("genshinEnemyElementalResistanceInput");
        const physical = getElement("genshinEnemyPhysicalResistanceInput");
        if (!select || !elemental || !physical || !window.GenshinCalcData) return;

        customResistance = {
            elemental: numericValue(elemental, 10),
            physical: numericValue(physical, 10)
        };
        const data = await window.GenshinCalcData.loadGenshinCalcData();
        const presets = Array.isArray(data.enemies?.presets) ? data.enemies.presets : [];
        const categories = data.enemies?.categories || {};
        presetsById = Object.fromEntries(presets.map((preset) => [String(preset.id), preset]));
        select.replaceChildren(new Option("カスタム", CUSTOM_ID));
        const grouped = Object.groupBy
            ? Object.groupBy(presets, (preset) => preset.category || "other")
            : presets.reduce((map, preset) => { (map[preset.category || "other"] ||= []).push(preset); return map; }, {});
        Object.entries(grouped).forEach(([category, items]) => {
            const group = document.createElement("optgroup");
            group.label = categories[category] || category;
            items.forEach((preset) => group.appendChild(new Option(String(preset.nameJa), String(preset.id))));
            select.appendChild(group);
        });

        select.addEventListener("change", () => {
            if (previousSelection === CUSTOM_ID) {
                customResistance = {
                    elemental: numericValue(elemental, customResistance.elemental),
                    physical: numericValue(physical, customResistance.physical)
                };
            }
            applySelection();
            previousSelection = select.value;
        });
        [elemental, physical].forEach((input) => input.addEventListener("input", () => {
            if (select.value !== CUSTOM_ID) return;
            customResistance = {
                elemental: numericValue(elemental, customResistance.elemental),
                physical: numericValue(physical, customResistance.physical)
            };
        }));
        applySelection({ restoreCustom: false });
        previousSelection = select.value;
    }

    document.addEventListener("DOMContentLoaded", initialize);

    window.GenshinEnemySelector = {
        CUSTOM_ID,
        applySelection,
        getSelectedEnemy() {
            const preset = selectedPreset();
            return preset ? JSON.parse(JSON.stringify(preset)) : null;
        }
    };
})();
