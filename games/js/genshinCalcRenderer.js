(function () {
    "use strict";

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

    function formatDecimal(value, digits = 4) {
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

    function renderModifierList(items, emptyText) {
        if (!items.length) return `<li>${escapeHtml(emptyText)}</li>`;
        return items.map((item) => {
            const modifier = item.modifier || {};
            const label = modifier.id || modifier.category || "unknown";
            const reason = item.reason ? ` / ${item.reason}` : "";
            return `<li>${escapeHtml(item.source || "-")} : ${escapeHtml(label)}${escapeHtml(reason)}</li>`;
        }).join("");
    }

    function renderBreakdown(result) {
        const b = result.breakdown;
        return `
            <details class="genshin-json-breakdown">
                <summary>内訳を表示</summary>
                <dl>
                    <div><dt>entry id</dt><dd>${escapeHtml(result.entry.id)}</dd></div>
                    <div><dt>attackType</dt><dd>${escapeHtml(result.entry.attackType)}</dd></div>
                    <div><dt>damageType</dt><dd>${escapeHtml(result.entry.damageType)}</dd></div>
                    <div><dt>元素</dt><dd>${escapeHtml(result.entry.element)}</dd></div>
                    <div><dt>参照ステータス</dt><dd>${escapeHtml(b.stat)} / ${formatNumber(b.statValue)}</dd></div>
                    <div><dt>天賦Lv / 倍率</dt><dd>Lv.${b.talentLevel} / ${formatDecimal(b.talentMultiplier, 2)}%</dd></div>
                    <div><dt>hitCount</dt><dd>${escapeHtml(b.hitCount)}</dd></div>
                    <div><dt>ダメージバフ合計</dt><dd>${formatDecimal(b.damageBonus, 2)}%</dd></div>
                    <div><dt>会心率 / 会心ダメージ</dt><dd>${formatDecimal(b.critRate, 2)}% / ${formatDecimal(b.critDamage, 2)}%</dd></div>
                    <div><dt>防御補正</dt><dd>${formatDecimal(b.defenseMultiplier)}</dd></div>
                    <div><dt>耐性 / 耐性補正</dt><dd>${formatDecimal(b.resistance, 2)}% / ${formatDecimal(b.resistanceMultiplier)}</dd></div>
                    <div><dt>反応</dt><dd>${escapeHtml(b.reaction.label)} / ${escapeHtml(b.reaction.reactionType)} / x${formatDecimal(b.reaction.baseMultiplier || 1, 2)}</dd></div>
                </dl>
                <h5>適用modifier</h5>
                <ul>${renderModifierList(b.appliedModifiers, "適用なし")}</ul>
                <h5>未適用modifier候補</h5>
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
                    <span>hit合計<br><strong>${formatNumber(result.total.expected)}</strong></span>
                </div>
                ${renderBreakdown(result)}
            </article>
        `;
    }

    function renderDamageTabs(payload) {
        const wrap = getElement("genshinJsonCalcResults");
        if (!wrap) return;
        wrap.hidden = false;
        const context = payload.context;
        wrap.innerHTML = `
            <div class="genshin-json-result-head">
                <h3>JSON計算結果</h3>
                <p>代表: character ${escapeHtml(context.characterId)} / weapon ${escapeHtml(context.weaponId)} / reaction ${escapeHtml(context.reactionOption.label)}</p>
            </div>
            <div class="genshin-result-tabs" role="tablist" aria-label="JSON計算タブ">
                <button class="genshin-result-tab is-active" type="button">通常攻撃</button>
                <button class="genshin-result-tab" type="button">元素スキル</button>
                <button class="genshin-result-tab" type="button">元素爆発</button>
                <button class="genshin-result-tab" type="button">追加ダメージ</button>
            </div>
            <section class="genshin-json-result-section">
                ${payload.results.length ? payload.results.map(renderResultCard).join("") : "<p>計算可能なchargedAttack entryがありません。</p>"}
            </section>
        `;
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
