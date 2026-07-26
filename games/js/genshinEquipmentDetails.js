(function () {
    "use strict";

    const byId = (id) => document.getElementById(id);
    const buttons = () => [...document.querySelectorAll("[data-equipment-details]")];
    let returnFocus = null;

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function paragraph(value) {
        return `<p>${escapeHtml(value || "説明は登録されていません。")}</p>`;
    }

    function talentItem(title, level, description) {
        const levelText = level ? `<span>Lv.${escapeHtml(level)}</span>` : "";
        return `<article class="genshin-equipment-detail-item"><h4>${escapeHtml(title)}${levelText}</h4>${paragraph(description)}</article>`;
    }

    function renderCharacter(id) {
        const resolver = window.GenshinIdResolver;
        const character = resolver.resolveCharacter(id);
        if (!character) return "";
        const talents = resolver.resolveCharacterTalent(id) || {};
        const constellationData = resolver.resolveCharacterConstellation(id)?.constellations || {};
        const constellation = byId("genshinReflectConstellation")?.value || "C0";
        const constellationNumber = Number(constellation.slice(1)) || 0;
        const normalLevel = byId("genshinNormalTalentLevel")?.value;
        const skillLevel = byId("genshinSkillTalentLevel")?.value;
        const burstLevel = byId("genshinBurstTalentLevel")?.value;
        const normalDescription = [
            talents.normalAttack?.normalDescriptionJa,
            talents.normalAttack?.chargedDescriptionJa,
            talents.normalAttack?.plungingDescriptionJa
        ].filter(Boolean).join("\n\n");
        const talentItems = [
            talents.normalAttack && talentItem(talents.normalAttack.nameJa || "通常攻撃", normalLevel, normalDescription),
            talents.skill && talentItem(talents.skill.nameJa || "元素スキル", skillLevel, talents.skill.descriptionJa),
            talents.burst && talentItem(talents.burst.nameJa || "元素爆発", burstLevel, talents.burst.descriptionJa),
            talents.special && talentItem(talents.special.nameJa || "特殊天賦", "", talents.special.descriptionJa)
        ].filter(Boolean).join("");
        const passiveItems = (talents.passives || []).map((passive) => talentItem(passive.nameJa, "", passive.descriptionJa)).join("");
        const constellationItems = Object.entries(constellationData).map(([level, item]) => {
            const unlocked = Number(level) <= constellationNumber;
            return `<article class="genshin-equipment-detail-item${unlocked ? " is-unlocked" : ""}"><h4><span>C${escapeHtml(level)}</span>${escapeHtml(item.nameJa)}</h4>${paragraph(item.effectText)}</article>`;
        }).join("");

        byId("genshinEquipmentDetailsKicker").textContent = `CHARACTER / ${constellation}`;
        byId("genshinEquipmentDetailsTitle").textContent = character.nameJa;
        return `
            <details class="genshin-equipment-detail-section" open>
              <summary>天賦</summary>
              <div>${talentItems || paragraph("天賦情報は登録されていません。")}</div>
            </details>
            <details class="genshin-equipment-detail-section">
              <summary>固有天賦</summary>
              <div>${passiveItems || paragraph("固有天賦は登録されていません。")}</div>
            </details>
            <details class="genshin-equipment-detail-section">
              <summary>命ノ星座 <span>現在 ${escapeHtml(constellation)}</span></summary>
              <div>${constellationItems || paragraph("命ノ星座情報は登録されていません。")}</div>
            </details>`;
    }

    function applyEffectParams(template, params) {
        return String(template || "武器効果は登録されていません。").replace(/\{([^}]+)\}/g, (token, key) => params?.[key] ?? token);
    }

    function renderWeapon(id) {
        const resolver = window.GenshinIdResolver;
        const weapon = resolver.resolveWeapon(id);
        if (!weapon) return "";
        const effect = resolver.resolveWeaponEffect(id) || {};
        const refinement = byId("genshinWeaponRefinement")?.value || "R1";
        const refinementNumber = refinement.replace("R", "");
        const description = applyEffectParams(effect.effectTextTemplate, effect.effectParamsByRefinement?.[refinementNumber]);

        byId("genshinEquipmentDetailsKicker").textContent = `WEAPON / ${refinement}`;
        byId("genshinEquipmentDetailsTitle").textContent = weapon.nameJa;
        return `<section class="genshin-equipment-detail-section is-static">
            <h3>${escapeHtml(effect.effectNameJa || "武器効果")}</h3>
            <div>${paragraph(description)}</div>
          </section>`;
    }

    function syncButtons() {
        const hasCharacter = Boolean(byId("genshinCalcCharacterId")?.value);
        const hasWeapon = Boolean(byId("genshinCalcWeaponId")?.value);
        buttons().forEach((button) => {
            button.disabled = button.dataset.equipmentDetails === "character" ? !hasCharacter : !hasWeapon;
        });
    }

    function openDetails(type, trigger) {
        const id = byId(type === "character" ? "genshinCalcCharacterId" : "genshinCalcWeaponId")?.value;
        if (!id) return;
        const content = type === "character" ? renderCharacter(id) : renderWeapon(id);
        if (!content) return;
        byId("genshinEquipmentDetailsBody").innerHTML = content;
        returnFocus = trigger;
        byId("genshinEquipmentDetailsDialog").showModal();
    }

    function closeDetails() {
        const dialog = byId("genshinEquipmentDetailsDialog");
        if (dialog.open) dialog.close();
        returnFocus?.focus();
    }

    async function init() {
        if (!window.GenshinIdResolver) return;
        await window.GenshinIdResolver.ready;
        buttons().forEach((button) => button.addEventListener("click", () => openDetails(button.dataset.equipmentDetails, button)));
        ["genshinCalcCharacterId", "genshinCalcWeaponId"].forEach((id) => {
            byId(id)?.addEventListener("input", syncButtons);
            byId(id)?.addEventListener("change", syncButtons);
        });
        byId("genshinEquipmentDetailsClose")?.addEventListener("click", closeDetails);
        byId("genshinEquipmentDetailsDialog")?.addEventListener("click", (event) => {
            if (event.target === byId("genshinEquipmentDetailsDialog")) closeDetails();
        });
        syncButtons();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
