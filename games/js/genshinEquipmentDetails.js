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

    function talentItem(title, level, text) {
        const levelText = level ? `<span>Lv.${escapeHtml(level)}</span>` : "";
        return `<article class="genshin-equipment-detail-item"><h4>${escapeHtml(title)}${levelText}</h4>${paragraph(text.originalText || text.calculationSummary)}<small>${text.originalText ? "原文" : "TETINETによる説明"}</small></article>`;
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
        const talentItems = [
            talents.normalAttack && talentItem(talents.normalAttack.nameJa || "通常攻撃", normalLevel, resolver.describeEffect({ kind: "talent", id, sourceId: "combat1" })),
            talents.skill && talentItem(talents.skill.nameJa || "元素スキル", skillLevel, resolver.describeEffect({ kind: "talent", id, sourceId: "combat2" })),
            talents.burst && talentItem(talents.burst.nameJa || "元素爆発", burstLevel, resolver.describeEffect({ kind: "talent", id, sourceId: "combat3" })),
            talents.special && talentItem(talents.special.nameJa || "特殊天賦", "", resolver.describeEffect({ kind: "talent", id, sourceId: "special" }))
        ].filter(Boolean).join("");
        const passiveItems = (talents.passives || []).map((passive, index) => talentItem(passive.nameJa, "", resolver.describeEffect({ kind: "talent", id, sourceId: passive.sourceId || `passive${index + 1}` }))).join("");
        const constellationItems = Object.entries(constellationData).map(([level, item]) => {
            const unlocked = Number(level) <= constellationNumber;
            const text = resolver.describeEffect({ kind: "constellation", id, sourceId: level });
            return `<article class="genshin-equipment-detail-item${unlocked ? " is-unlocked" : ""}"><h4><span>C${escapeHtml(level)}</span>${escapeHtml(item.nameJa)}</h4>${paragraph(text.originalText || text.calculationSummary)}<small>${text.originalText ? "原文" : "TETINETによる説明"}</small></article>`;
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

    const WEAPON_PARAM_LABELS = {
        growthAtk: "繁茂1層の攻撃力", growthEm: "繁茂1層の元素熟知",
        radiantGrowthAtk: "輝映時の繁茂1層の攻撃力", radiantGrowthStar: "輝映時の繁茂1層の星反応補正",
        pactCryoEm: "氷元素1人あたりの元素熟知", pactElectroAtk: "雷元素1人あたりの攻撃力",
        radiantPactEm: "輝映時の氷・雷元素1人あたりの元素熟知", radiantPactStar: "輝映時の氷・雷元素1人あたりの星反応補正",
        hymnEr: "常時の元素チャージ効率", venomStar: "蛇舌の猛毒による星反応補正",
        healingBonus: "与える治療効果", hpPerStack: "1層あたりのHP上限増加",
        atkPer1000Hp: "超過HP1000あたりのATK増加（式は確認中）", atkCap: "原文のATK上限（層との関係は確認中）",
        loyaltyCritDamage: "忠誠の風の会心ダメージ", rebellionStellarSwirlDamage: "叛逆の風の星拡散ダメージ",
        energyRestoreLimit: "4秒あたりの回復上限", emPerStack: "1層あたりの元素熟知",
        minAtk: "最小ATK上昇", maxAtk: "最大ATK上昇", reactionAtk: "元素反応後ATK", stellarDamage: "星拡散ダメージ",
        atkPerStack: "1層ごとのATK", stellarCritDamageAt3: "3層時の星拡散会心ダメージ", energyRestore: "元素エネルギー回復",
        resonatedElementCritDamagePerElement: "共鳴元素1種ごとの会心ダメージ", hitAtk: "命中後ATK", movementAtk: "ATK状態",
        movementEm: "元素熟知状態", movementStellarDamage: "星拡散状態", reactionEm: "元素反応後元素熟知",
        stellarAtk: "星拡散後ATK", skillAtk: "元素スキル後ATK", skillEm: "元素スキル後元素熟知",
        sameElementEmPerMember: "同元素1名ごとの元素熟知", differentElementAtkPerMember: "異元素1名ごとのATK",
        otherPartyEnergy: "他メンバーの元素エネルギー回復", reactionEnergyRestore: "元素反応後の元素エネルギー回復",
        atk: "攻撃力", em: "元素熟知"
    };

    function renderWeaponParams(params) {
        const entries = Object.entries(params || {}).filter(([key, value]) => WEAPON_PARAM_LABELS[key] && ["string", "number"].includes(typeof value));
        if (!entries.length) return "";
        return `<dl class="genshin-condition-facts">${entries.map(([key, value]) => `<div><dt>${escapeHtml(WEAPON_PARAM_LABELS[key])}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>`;
    }

    function renderWeapon(id) {
        const resolver = window.GenshinIdResolver;
        const weapon = resolver.resolveWeapon(id);
        if (!weapon) return "";
        const effect = resolver.resolveWeaponEffect(id) || {};
        const refinement = byId("genshinWeaponRefinement")?.value || "R1";
        const refinementNumber = refinement.replace("R", "");
        const params = effect.effectParamsByRefinement?.[refinementNumber];
        const text = resolver.describeEffect({ kind: "weapon", id, refinement: refinementNumber });
        const description = text.originalText || text.calculationSummary;

        byId("genshinEquipmentDetailsKicker").textContent = `WEAPON / ${refinement}`;
        byId("genshinEquipmentDetailsTitle").textContent = weapon.nameJa;
        return `<section class="genshin-equipment-detail-section is-static">
            <h3>${escapeHtml(text.nameJa || effect.effectNameJa || "武器効果")}</h3>
            <div><h4>${text.originalText ? "効果説明（原文）" : "TETINETによる説明"}</h4>${paragraph(description)}</div>
            ${renderWeaponParams(params)}
            ${weapon.refinementNoteJa ? `<p class="genshin-condition-note">${escapeHtml(weapon.refinementNoteJa)}</p>` : ""}
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
