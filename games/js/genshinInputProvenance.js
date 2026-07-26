(function () {
    "use strict";

    const FINAL_STAT_INPUTS = Object.freeze({
        hp: "genshinHpInput",
        baseHp: "genshinBaseHpInput",
        baseAtk: "genshinBaseAtkInput",
        atk: "genshinAtkInput",
        baseDef: "genshinBaseDefInput",
        def: "genshinDefInput",
        elementalMastery: "genshinElementalMasteryInput",
        critRate: "genshinCritRateInput",
        critDamage: "genshinCritDamageInput",
        energyRecharge: "genshinEnergyRechargeInput",
        elementDamageBonus: "genshinElementalDamageInput"
    });

    function markInput(input, origin) {
        if (input) input.dataset.valueOrigin = origin === "uid" ? "uid" : "manual";
    }

    function markById(id, origin) {
        markInput(document.getElementById(id), origin);
    }

    function fieldOrigins() {
        return Object.fromEntries(Object.entries(FINAL_STAT_INPUTS).map(([field, id]) => {
            const input = document.getElementById(id);
            return [field, input?.dataset?.valueOrigin === "uid" ? "uid" : "manual"];
        }));
    }

    function resolveStatsProvenance(fields) {
        const origins = Object.values(fields || {});
        const uidCount = origins.filter((origin) => origin === "uid").length;
        const source = uidCount === 0 ? "manual" : uidCount === origins.length ? "uidProfile" : "mixed";
        return {
            schemaVersion: 1,
            source,
            fields: { ...(fields || {}) },
            includesPersistentBonuses: true,
            additivePolicy: "externalModifiersOnly"
        };
    }

    function getStatsProvenance() {
        return resolveStatsProvenance(fieldOrigins());
    }

    function clearDerivedBaseStats(kind = "character") {
        const ids = kind === "weapon"
            ? [FINAL_STAT_INPUTS.baseAtk]
            : [FINAL_STAT_INPUTS.baseHp, FINAL_STAT_INPUTS.baseAtk, FINAL_STAT_INPUTS.baseDef];
        ids.forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;
            input.value = "";
            delete input.dataset.preciseValue;
            markInput(input, "manual");
        });
    }

    function init() {
        Object.values(FINAL_STAT_INPUTS).forEach((id) => {
            const input = document.getElementById(id);
            if (!input) return;
            if (!input.dataset.valueOrigin) markInput(input, "manual");
            input.addEventListener("input", (event) => {
                if (event.currentTarget.dataset.provenanceWrite === "uid") return;
                markInput(event.currentTarget, "manual");
            });
        });
    }

    window.GenshinInputProvenance = {
        FINAL_STAT_INPUTS,
        markById,
        fieldOrigins,
        resolveStatsProvenance,
        getStatsProvenance,
        clearDerivedBaseStats
    };

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
