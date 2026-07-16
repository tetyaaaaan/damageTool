(function () {
    "use strict";

    const FALLBACK_IMAGE = "/games/images/genshin/fallback.webp";

    function byId(id) {
        return document.getElementById(id);
    }

    const TALENT_LABELS = [
        ["genshinNormalTalentLevel", "通常攻撃", "通常"],
        ["genshinSkillTalentLevel", "元素スキル", "スキル"],
        ["genshinBurstTalentLevel", "元素爆発", "爆発"]
    ];

    function syncTalentLabels(compact) {
        TALENT_LABELS.forEach(([id, fullLabel, shortLabel]) => {
            const select = byId(id);
            if (!select) return;
            [...select.options].forEach((option) => {
                option.textContent = `${compact ? shortLabel : fullLabel} Lv${option.value}`;
            });
        });
    }

    function textValue(id, fallback = "未選択") {
        const value = String(byId(id)?.value || "").trim();
        return value || fallback;
    }

    function syncSelectionImage(kind) {
        const isCharacter = kind === "character";
        const image = byId(isCharacter ? "genshinSelectedCharacterImage" : "genshinSelectedWeaponImage");
        const id = String(byId(isCharacter ? "genshinCalcCharacterId" : "genshinCalcWeaponId")?.value || "").trim();
        if (!image) return;

        image.dataset.fallbackApplied = "";
        image.classList.toggle("is-empty", !id);
        image.src = id
            ? `/games/images/genshin/${isCharacter ? "characters" : "weapons"}/${encodeURIComponent(id)}.webp`
            : FALLBACK_IMAGE;
    }

    function selectedArtifactLabels() {
        return ["genshinArtifactSetOneTrigger", "genshinArtifactSetTwoTrigger"]
            .filter((id) => !byId(id)?.hidden)
            .map((id) => byId(id))
            .filter((button) => button && !button.classList.contains("is-empty"))
            .map((button) => String(button.textContent || "").trim())
            .filter(Boolean);
    }

    function selectedReactionLabel() {
        const select = byId("genshinJsonReactionOption");
        if (!select || !select.value) return "反応なし";
        return String(select.options[select.selectedIndex]?.textContent || "反応なし").trim();
    }

    function syncResultSummary() {
        const character = textValue("genshinReflectCharacter");
        const weapon = textValue("genshinWeaponInput");
        const characterWeapon = byId("genshinResultCharacterWeaponSummary");
        const artifactReaction = byId("genshinResultArtifactReactionSummary");
        const artifacts = selectedArtifactLabels();

        if (characterWeapon) characterWeapon.textContent = `${character} / ${weapon}`;
        if (artifactReaction) {
            artifactReaction.textContent = `${artifacts.length ? artifacts.join(" + ") : "未選択"} / ${selectedReactionLabel()}`;
        }
    }

    function syncConditionStatus(message) {
        const status = byId("genshinConditionReloadStatus");
        if (!status) return;
        if (message) {
            status.textContent = message;
            return;
        }
        const cards = byId("genshinJsonConditionCards");
        status.textContent = cards && cards.childElementCount
            ? cards.dataset.conditionStatus || "再読み込み済み"
            : "キャラ・装備に応じた補正を確認します。";
    }

    function initialize() {
        const characterId = byId("genshinCalcCharacterId");
        const weaponId = byId("genshinCalcWeaponId");
        const conditionCards = byId("genshinJsonConditionCards");
        const compactTalentMedia = window.matchMedia?.("(max-width: 560px)");

        syncTalentLabels(Boolean(compactTalentMedia?.matches));
        compactTalentMedia?.addEventListener?.("change", (event) => syncTalentLabels(event.matches));

        [
            [characterId, () => syncSelectionImage("character")],
            [weaponId, () => syncSelectionImage("weapon")],
        ].forEach(([element, handler]) => {
            if (!element) return;
            element.addEventListener("input", handler);
            element.addEventListener("change", handler);
        });

        document.addEventListener("input", (event) => {
            if (event.target?.closest?.(".genshin-tool-page")) syncResultSummary();
        });
        document.addEventListener("change", (event) => {
            if (event.target?.closest?.(".genshin-tool-page")) syncResultSummary();
        });

        ["genshinSelectedCharacterImage", "genshinSelectedWeaponImage"].forEach((id) => {
            byId(id)?.addEventListener("error", (event) => {
                const image = event.currentTarget;
                if (image.dataset.fallbackApplied === "true") return;
                image.dataset.fallbackApplied = "true";
                image.classList.add("is-empty");
                image.src = FALLBACK_IMAGE;
            });
        });

        byId("genshinJsonPrepareConditionsButton")?.addEventListener("click", () => {
            syncConditionStatus("補正条件を再読み込みしています…");
        });

        if (conditionCards && typeof MutationObserver !== "undefined") {
            new MutationObserver(() => {
                syncConditionStatus();
                syncResultSummary();
            }).observe(conditionCards, { childList: true, subtree: true, characterData: true });
        }

        syncSelectionImage("character");
        syncSelectionImage("weapon");
        syncResultSummary();
        syncConditionStatus();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
