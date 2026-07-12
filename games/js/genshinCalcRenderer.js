(function () {
    "use strict";

    const RESULT_TABS = [
        { id: "normal", label: "通常攻撃" },
        { id: "charged", label: "重撃" },
        { id: "plunging", label: "落下攻撃" },
        { id: "skill", label: "元素スキル" },
        { id: "burst", label: "元素爆発" },
        { id: "other", label: "その他" }
    ];

    function getElement(id) {
        return document.getElementById(id);
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? Math.round(num).toLocaleString("ja-JP") : "-";
    }

    function formatDecimal(value, digits = 2) {
        const num = Number(value);
        return Number.isFinite(num) ? num.toFixed(digits) : "-";
    }

    function renderWarnings(warnings) {
        const wrap = getElement("genshinJsonCalcWarnings");
        if (!wrap) return;
        const visibleWarnings = (warnings || []).slice(0, 8);
        wrap.hidden = !visibleWarnings.length;
        wrap.innerHTML = visibleWarnings.length
            ? `<strong>JSON警告</strong><ul>${visibleWarnings.map((warning) => `<li>${escapeHtml(warning.message || warning)}</li>`).join("")}</ul>`
            : "";
    }

    function classifyResult(result) {
        const entry = result.entry || {};
        if (entry.attackType === "chargedAttack" || entry.damageType === "charged" || entry.damageType === "chargedAttack") return "charged";
        if (entry.attackType === "plungingAttack" || entry.damageType === "plunging") return "plunging";
        if (entry.attackType === "skill" || entry.damageType === "skill") return "skill";
        if (entry.attackType === "burst" || entry.damageType === "burst") return "burst";
        if (entry.attackType === "normalAttack" || entry.damageType === "normal") return "normal";
        return "other";
    }

    function sourceLabel(source) {
        if (source?.startsWith("weapon:")) return "武器効果";
        if (source?.startsWith("artifact4:")) return "聖遺物4セット効果";
        if (source?.startsWith("artifact2:")) return "聖遺物2セット効果";
        if (source?.startsWith("constellation:")) return "命ノ星座効果";
        if (source?.startsWith("talent:")) return "天賦効果";
        return source || "効果";
    }

    function reasonLabel(reason) {
        if (!reason) return "";
        if (reason.includes("includedInUidStats")) return "入力欄のステータスへ反映済みの可能性があるため未加算";
        if (reason.includes("UID天賦")) return "入力欄の天賦Lvへ反映済みの可能性があるため未加算";
        if (reason === "条件OFF") return "条件がOFFのため未適用";
        if (reason === "対象entry外") return "このダメージ項目には対象外";
        if (reason.includes("special")) return "専用処理が必要なため未適用";
        return reason;
    }

    function modifierText(item) {
        const modifier = item.modifier || {};
        const value = Number(item.value);
        const valueText = Number.isFinite(value) ? `（${value >= 0 ? "+" : ""}${formatDecimal(value)}%）` : "";
        const sourceText = modifier.sourceText ? `: ${modifier.sourceText}` : "";
        const reason = item.reason ? ` / ${reasonLabel(item.reason)}` : "";
        return `${sourceLabel(item.source)} ${valueText}${sourceText}${reason}`;
    }

    function renderModifierList(items, emptyText) {
        if (!items.length) return `<li>${escapeHtml(emptyText)}</li>`;
        return items.map((item) => `<li>${escapeHtml(modifierText(item))}</li>`).join("");
    }

    function renderInputStats(stats) {
        return `
            <dl>
                <div><dt>HP</dt><dd>${formatNumber(stats.hp)}</dd></div>
                <div><dt>攻撃力</dt><dd>${formatNumber(stats.atk)}</dd></div>
                <div><dt>防御力</dt><dd>${formatNumber(stats.def)}</dd></div>
                <div><dt>元素熟知</dt><dd>${formatNumber(stats.elementalMastery)}</dd></div>
                <div><dt>会心率</dt><dd>${formatDecimal(stats.critRate)}%</dd></div>
                <div><dt>会心ダメージ</dt><dd>${formatDecimal(stats.critDamage)}%</dd></div>
                <div><dt>元素ダメージ</dt><dd>${formatDecimal(stats.elementDamageBonus)}%</dd></div>
            </dl>
        `;
    }

    function renderBreakdown(result) {
        const b = result.breakdown;
        return `
            <details class="genshin-json-breakdown">
                <summary>計算内訳を表示</summary>
                <h5>入力欄から使用した値</h5>
                ${renderInputStats(b.inputStats)}
                <h5>このダメージ項目</h5>
                <dl>
                    <div><dt>攻撃種別</dt><dd>${escapeHtml(result.entry.attackType)}</dd></div>
                    <div><dt>ダメージ種別</dt><dd>${escapeHtml(result.entry.damageType)}</dd></div>
                    <div><dt>元素</dt><dd>${escapeHtml(result.entry.element)}</dd></div>
                    <div><dt>参照ステータス</dt><dd>${escapeHtml(b.stat)} / ${formatNumber(b.statValue)}</dd></div>
                    <div><dt>天賦Lv / 倍率</dt><dd>Lv.${b.talentLevel} / ${formatDecimal(b.talentMultiplier)}%</dd></div>
                    <div><dt>ヒット数</dt><dd>${escapeHtml(b.hitCount)}</dd></div>
                    <div><dt>ダメージバフ合計</dt><dd>${formatDecimal(b.damageBonus)}%</dd></div>
                    <div><dt>会心率 / 会心ダメージ</dt><dd>${formatDecimal(b.critRate)}% / ${formatDecimal(b.critDamage)}%</dd></div>
                    <div><dt>防御補正</dt><dd>${formatDecimal(b.defenseMultiplier, 4)}</dd></div>
                    <div><dt>耐性 / 耐性補正</dt><dd>${formatDecimal(b.resistance)}% / ${formatDecimal(b.resistanceMultiplier, 4)}</dd></div>
                    <div><dt>反応</dt><dd>${escapeHtml(b.reaction.label)} / x${formatDecimal(b.reaction.baseMultiplier || 1)}</dd></div>
                </dl>
                <h5>今回加算した効果</h5>
                <ul>${renderModifierList(b.appliedModifiers, "追加効果なし")}</ul>
                <h5>未加算の候補</h5>
                <ul>${renderModifierList(b.skippedModifiers, "候補なし")}</ul>
                ${result.problems.length ? `<h5>データ不備</h5><ul>${result.problems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
            </details>
        `;
    }

    function renderResultCard(result) {
        return `
            <article class="genshin-json-result-card">
                <h4>${escapeHtml(result.entry.label)}</h4>
                <div class="genshin-json-result-values">
                    <span>非会心<br><strong>${formatNumber(result.nonCrit)}</strong></span>
                    <span>会心<br><strong>${formatNumber(result.crit)}</strong></span>
                    <span>期待値<br><strong>${formatNumber(result.expected)}</strong></span>
                    <span>ヒット合計<br><strong>${formatNumber(result.total.expected)}</strong></span>
                </div>
                ${renderBreakdown(result)}
            </article>
        `;
    }

    function renderTabButtons(grouped, activeTab) {
        return RESULT_TABS.map((tab) => {
            const count = grouped[tab.id]?.length || 0;
            const active = tab.id === activeTab ? " is-active" : "";
            return `<button class="genshin-result-tab${active}" type="button" data-json-tab="${tab.id}">${escapeHtml(tab.label)} <span>${count}</span></button>`;
        }).join("");
    }

    function renderTabSections(grouped, activeTab) {
        return RESULT_TABS.map((tab) => {
            const results = grouped[tab.id] || [];
            const content = results.length
                ? results.map(renderResultCard).join("")
                : `<p>${escapeHtml(tab.label)}の計算可能なデータがありません。</p>`;
            return `<section class="genshin-json-result-section" data-json-panel="${tab.id}" ${tab.id === activeTab ? "" : "hidden"}>${content}</section>`;
        }).join("");
    }

    function bindTabSwitch(wrap) {
        wrap.querySelectorAll("[data-json-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                const tabId = button.getAttribute("data-json-tab");
                wrap.querySelectorAll("[data-json-tab]").forEach((tab) => tab.classList.toggle("is-active", tab === button));
                wrap.querySelectorAll("[data-json-panel]").forEach((panel) => {
                    panel.hidden = panel.getAttribute("data-json-panel") !== tabId;
                });
            });
        });
    }

    function renderDamageTabs(payload) {
        const wrap = getElement("genshinJsonCalcResults");
        if (!wrap) return;
        wrap.hidden = false;
        const context = payload.context;
        const grouped = RESULT_TABS.reduce((acc, tab) => {
            acc[tab.id] = [];
            return acc;
        }, {});
        (payload.results || []).forEach((result) => {
            grouped[classifyResult(result)].push(result);
        });
        const activeTab = RESULT_TABS.find((tab) => grouped[tab.id].length)?.id || "normal";
        wrap.innerHTML = `
            <div class="genshin-json-result-head">
                <h3>JSON計算結果</h3>
                <p>計算対象: character ${escapeHtml(context.characterId)} / weapon ${escapeHtml(context.weaponId)} / reaction ${escapeHtml(context.reactionOption.label)}</p>
            </div>
            <div class="genshin-result-tabs" role="tablist" aria-label="JSON計算タブ">
                ${renderTabButtons(grouped, activeTab)}
            </div>
            ${renderTabSections(grouped, activeTab)}
        `;
        bindTabSwitch(wrap);
    }

    async function handleJsonCalcClick() {
        const button = getElement("genshinJsonCalcButton");
        if (button) button.disabled = true;
        try {
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            renderWarnings(payload.warnings);
            renderDamageTabs(payload);
        } catch (error) {
            console.error("[genshin-json-calc] failed", error);
            renderWarnings([{ message: `JSON計算に失敗しました: ${error.message}` }]);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function initializeGenshinCalcRenderer() {
        const button = getElement("genshinJsonCalcButton");
        if (!button || !window.GenshinCalcEngine || !window.GenshinCalcData) return;
        button.addEventListener("click", handleJsonCalcClick);
    }

    document.addEventListener("DOMContentLoaded", initializeGenshinCalcRenderer);

    window.GenshinCalcRenderer = {
        renderDamageTabs,
        renderDamageBreakdown: renderBreakdown
    };
})();
