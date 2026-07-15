(function () {
    "use strict";

    const RESULT_TABS = [
        { id: "basic", label: "通常・重撃・落下" },
        { id: "skill", label: "元素スキル" },
        { id: "burst", label: "元素爆発" },
        { id: "reaction", label: "元素反応" },
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

    function formatDamageNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? Math.floor(num).toLocaleString("ja-JP") : "-";
    }

    function formatDecimal(value, digits = 2) {
        const num = Number(value);
        return Number.isFinite(num) ? num.toFixed(digits) : "-";
    }

    function numberOr(value, fallback = 0) {
        const number = Number(value);
        return Number.isFinite(number) ? number : fallback;
    }

    function renderWarnings(warnings) {
        const wrap = getElement("genshinJsonCalcWarnings");
        if (!wrap) return;
        const visibleWarnings = (warnings || []).slice(0, 8);
        wrap.hidden = !visibleWarnings.length;
        wrap.innerHTML = visibleWarnings.length
            ? `<strong>警告</strong><ul>${visibleWarnings.map((warning) => `<li>${escapeHtml(warning.message || warning)}</li>`).join("")}</ul>`
            : "";
    }

    function classifyResult(result) {
        const entry = result.entry || {};
        if (entry.group === "reaction" || entry.attackType === "reaction") return "reaction";
        if (entry.damageType === "skill") return "skill";
        if (entry.damageType === "burst") return "burst";
        if (entry.attackType === "chargedAttack" || entry.damageType === "charged" || entry.damageType === "chargedAttack") return "basic";
        if (entry.attackType === "plungingAttack" || entry.damageType === "plunging") return "basic";
        if (entry.attackType === "skill") return "skill";
        if (entry.attackType === "burst") return "burst";
        if (entry.attackType === "normalAttack" || entry.damageType === "normal") return "basic";
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
        const effectLabel = modifier.effectLabel ? ` / ${modifier.effectLabel}` : "";
        const sourceText = modifier.sourceText ? `: ${modifier.sourceText}` : "";
        const reason = item.reason ? ` / ${reasonLabel(item.reason)}` : "";
        const resourceLabels = {
            calculationInput: "計算入力",
            displayOnly: "表示専用",
            unsupported: "未対応"
        };
        const classification = item.analysis?.resourceClassification
            ? ` [${resourceLabels[item.analysis.resourceClassification] || item.analysis.resourceClassification}]`
            : "";
        return `${sourceLabel(item.source)}${effectLabel}${classification} ${valueText}${sourceText}${reason}`;
    }

    function renderModifierList(items, emptyText) {
        if (!items.length) return `<li>${escapeHtml(emptyText)}</li>`;
        return items.map((item) => `<li>${escapeHtml(modifierText(item))}</li>`).join("");
    }

    function renderReactionContributors(contributors) {
        if (!contributors?.length) return "";
        return `<h5>月反応の参加者寄与</h5><ul>${contributors.map((item) => `<li>参加者${escapeHtml(item.slot)}: Lv.${escapeHtml(item.level)} / 熟知 ${formatNumber(item.elementalMastery)} / 会心 ${formatDecimal(item.critRate)}%・${formatDecimal(item.critDamage)}% / 非会心 ${formatDamageNumber(item.nonCrit)} / 会心 ${formatDamageNumber(item.crit)}</li>`).join("")}</ul>`;
    }

    const ELEMENT_LABELS = {
        physical: "物理",
        pyro: "炎",
        hydro: "水",
        electro: "雷",
        cryo: "氷",
        anemo: "風",
        geo: "岩",
        dendro: "草",
        ownElement: "固有元素"
    };

    const ATTACK_TYPE_LABELS = {
        normalAttack: "通常攻撃",
        chargedAttack: "重撃",
        plungingAttack: "落下攻撃",
        skill: "元素スキル",
        burst: "元素爆発",
        reaction: "元素反応",
        extraDamage: "追加ダメージ"
    };

    const STAT_LABELS = {
        hp: "HP",
        atk: "攻撃力",
        def: "防御力",
        elementalMastery: "元素熟知",
        fixedDamage: "固定基礎ダメージ"
    };

    const MODIFIER_CATEGORY_LABELS = {
        damageBonus: "ダメージバフ",
        statBonus: "ステータス補正",
        critBonus: "会心補正",
        resistanceDebuff: "耐性デバフ",
        defenseDebuff: "防御デバフ",
        defenseIgnore: "防御無視",
        reactionBonus: "元素反応ダメージ補正",
        additiveBaseDamage: "加算基礎ダメージ",
        scalingBonus: "追加倍率",
        finalDamageMultiplier: "最終ダメージ補正",
        extraDamage: "追加ダメージ",
        effectOverride: "特殊効果"
    };

    function elementLabel(element) {
        return ELEMENT_LABELS[element] || element || "-";
    }

    function attackTypeLabel(entry = {}) {
        if (entry.resultKind === "shield") return "シールド";
        return ATTACK_TYPE_LABELS[entry.attackType]
            || ATTACK_TYPE_LABELS[entry.damageType]
            || entry.damageType
            || "その他";
    }

    function statLabel(stat) {
        return STAT_LABELS[stat] || stat || "参照値";
    }

    function modifierDisplayItem(item) {
        const modifier = item.modifier || {};
        const category = MODIFIER_CATEGORY_LABELS[modifier.category] || "補正効果";
        const source = sourceLabel(item.source);
        const effect = modifier.effectLabel || "";
        const numericValue = Number(item.value);
        const percentCategories = new Set([
            "damageBonus", "statBonus", "critBonus", "resistanceDebuff", "defenseDebuff",
            "defenseIgnore", "reactionBonus", "scalingBonus"
        ]);
        const value = Number.isFinite(numericValue)
            ? `${numericValue >= 0 ? "+" : ""}${formatDecimal(numericValue)}${percentCategories.has(modifier.category) ? "%" : ""}`
            : "";
        return {
            label: [source, effect, category].filter(Boolean).join("・"),
            value
        };
    }

    function buildDamageBreakdownViewModel(result) {
        const breakdown = result.breakdown || {};
        const reaction = breakdown.reaction || {};
        const scalingParts = (breakdown.scalingParts || []).map((part) => ({
            stat: statLabel(part.stat),
            statValue: numberOr(part.statValue),
            talentMultiplier: numberOr(part.talentMultiplier),
            baseDamage: numberOr(part.baseDamage),
            fixed: part.stat === "fixedDamage"
        }));
        const baseDamage = scalingParts.reduce((sum, part) => sum + part.baseDamage, 0);
        const appliedEffects = (breakdown.appliedModifiers || []).map(modifierDisplayItem);
        const reactionEnabled = Boolean(
            result.entry?.directReactionId
            || reaction.reactionId && reaction.reactionId !== "none"
            || Number(reaction.baseMultiplier) !== 1
            || Number(breakdown.reactionBonus)
            || Number(reaction.elementalMasteryBonus)
        );
        const additiveBaseDamage = numberOr(breakdown.additiveBaseDamage);
        const finalDamageMultiplier = numberOr(breakdown.finalDamageMultiplier, 1);
        const effectOverrides = breakdown.effectOverrides || [];
        return {
            element: elementLabel(result.entry?.element),
            attackType: attackTypeLabel(result.entry),
            talentLevel: numberOr(breakdown.talentLevel, 1),
            hitCount: numberOr(breakdown.hitCount, 1),
            base: { scalingParts, baseDamage },
            buffs: {
                damageBonus: numberOr(breakdown.damageBonus),
                additiveBaseDamage,
                finalDamageMultiplier,
                effects: appliedEffects
            },
            reaction: reactionEnabled ? {
                label: reaction.label || "元素反応",
                multiplier: numberOr(reaction.baseMultiplier, 1),
                elementalMasteryBonus: numberOr(reaction.elementalMasteryBonus),
                reactionBonus: numberOr(breakdown.reactionBonus),
                baseDamageBonus: numberOr(breakdown.reactionBaseDamageBonus),
                contributors: reaction.contributors || []
            } : null,
            enemy: {
                defenseReduction: numberOr(breakdown.defenseReduction ?? breakdown.defenseDebuff),
                defenseIgnore: numberOr(breakdown.defenseIgnore),
                defenseMultiplier: numberOr(breakdown.defenseMultiplier, 1),
                resistance: numberOr(breakdown.resistance),
                resistanceMultiplier: numberOr(breakdown.resistanceMultiplier, 1)
            },
            critical: {
                rate: numberOr(breakdown.critRate),
                damage: numberOr(breakdown.critDamage)
            },
            special: {
                visible: additiveBaseDamage !== 0 || finalDamageMultiplier !== 1 || effectOverrides.length > 0,
                additiveBaseDamage,
                finalDamageMultiplier,
                effectOverrides
            },
            debug: {
                attackType: result.entry?.attackType || "-",
                damageType: result.entry?.damageType || "-",
                skippedModifiers: breakdown.skippedModifiers || [],
                problems: result.problems || []
            }
        };
    }

    function renderBreakdownRows(rows) {
        return `<dl>${rows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${row.html || escapeHtml(row.value)}</dd></div>`).join("")}</dl>`;
    }

    function renderAppliedEffects(effects) {
        if (!effects.length) return "";
        return `<ul class="genshin-breakdown-effects">${effects.map((effect) => `<li><span>${escapeHtml(effect.label)}</span>${effect.value ? `<strong>${escapeHtml(effect.value)}</strong>` : ""}</li>`).join("")}</ul>`;
    }

    function renderFriendlyBreakdownSection(title, rows, extra = "") {
        if (!rows.length && !extra) return "";
        return `<section><h5>${escapeHtml(title)}</h5>${rows.length ? renderBreakdownRows(rows) : ""}${extra}</section>`;
    }

    function renderBreakdown(result) {
        const view = buildDamageBreakdownViewModel(result);
        const scalingRows = view.base.scalingParts.map((part) => ({
            label: part.stat,
            value: part.fixed
                ? formatDamageNumber(part.baseDamage)
                : `${formatNumber(part.statValue)} × ${formatDecimal(part.talentMultiplier)}% = ${formatDamageNumber(part.baseDamage)}`
        }));
        scalingRows.push({ label: "基礎ダメージ合計", value: formatDamageNumber(view.base.baseDamage) });
        const buffRows = [{
            label: "ダメージバフ合計",
            value: `${view.buffs.damageBonus > 0 ? "+" : ""}${formatDecimal(view.buffs.damageBonus)}%`
        }];
        const reactionRows = view.reaction ? [
            { label: "元素反応", value: view.reaction.label },
            { label: "反応倍率", value: `×${formatDecimal(view.reaction.multiplier, 2)}` }
        ] : [];
        if (view.reaction?.elementalMasteryBonus) reactionRows.push({ label: "元素熟知による補正", value: `+${formatDecimal(view.reaction.elementalMasteryBonus)}%` });
        if (view.reaction?.reactionBonus) reactionRows.push({ label: "反応ダメージ補正", value: `+${formatDecimal(view.reaction.reactionBonus)}%` });
        if (view.reaction?.baseDamageBonus) reactionRows.push({ label: "反応基礎ダメージ補正", value: `+${formatDecimal(view.reaction.baseDamageBonus)}%` });
        const enemyRows = [
            { label: "防御デバフ", value: `${formatDecimal(view.enemy.defenseReduction)}%` },
            { label: "防御無視", value: `${formatDecimal(view.enemy.defenseIgnore)}%` },
            { label: "最終防御倍率", value: `×${formatDecimal(view.enemy.defenseMultiplier, 4)}` },
            { label: `敵の${view.element}耐性`, value: `${formatDecimal(view.enemy.resistance)}%` },
            { label: "最終耐性倍率", value: `×${formatDecimal(view.enemy.resistanceMultiplier, 4)}` }
        ];
        const criticalRows = [
            { label: "会心率", value: `${formatDecimal(view.critical.rate)}%` },
            { label: "会心ダメージ", value: `${formatDecimal(view.critical.damage)}%` }
        ];
        const specialRows = [];
        if (view.special.additiveBaseDamage) specialRows.push({ label: "加算基礎ダメージ", value: formatDamageNumber(view.special.additiveBaseDamage) });
        if (view.special.finalDamageMultiplier !== 1) specialRows.push({ label: "最終ダメージ補正", value: `×${formatDecimal(view.special.finalDamageMultiplier, 4)}` });
        if (view.special.effectOverrides.length) specialRows.push({ label: "特殊効果", value: `${view.special.effectOverrides.length}件` });
        const contributorHtml = view.reaction ? renderReactionContributors(view.reaction.contributors) : "";
        return `
            <div class="genshin-json-breakdown">
                <h5 class="genshin-breakdown-title">計算の流れ</h5>
                <div class="genshin-breakdown-summary">
                    <span>${escapeHtml(view.element)}</span>
                    <span>${escapeHtml(view.attackType)}</span>
                    <span>天賦Lv.${escapeHtml(view.talentLevel)}</span>
                    <span>${escapeHtml(view.hitCount)}ヒット</span>
                </div>
                <div class="genshin-breakdown-flow">
                    ${renderFriendlyBreakdownSection("1. 基礎ダメージ", scalingRows)}
                    ${renderFriendlyBreakdownSection("2. ダメージバフ", buffRows, renderAppliedEffects(view.buffs.effects))}
                    ${view.reaction ? renderFriendlyBreakdownSection("3. 元素反応", reactionRows, contributorHtml) : ""}
                    ${renderFriendlyBreakdownSection(view.reaction ? "4. 敵への補正" : "3. 敵への補正", enemyRows)}
                    ${renderFriendlyBreakdownSection(view.reaction ? "5. 会心" : "4. 会心", criticalRows)}
                    ${view.special.visible ? renderFriendlyBreakdownSection(view.reaction ? "6. 特殊補正" : "5. 特殊補正", specialRows) : ""}
                </div>
                <details class="genshin-json-debug-details">
                    <summary>検証用データを見る</summary>
                    ${renderBreakdownRows([
                        { label: "内部攻撃種別", value: view.debug.attackType },
                        { label: "内部ダメージ種別", value: view.debug.damageType }
                    ])}
                    <h5>今回適用されなかった効果</h5>
                    <ul>${renderModifierList(view.debug.skippedModifiers, "該当なし")}</ul>
                    ${view.debug.problems.length ? `<h5>データ上の注意</h5><ul>${view.debug.problems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
                </details>
            </div>
        `;
    }

    function renderDetailToggle(resultLabel, detailId) {
        return `<button class="genshin-result-detail-toggle" type="button" aria-expanded="false" aria-controls="${escapeHtml(detailId)}" aria-label="${escapeHtml(resultLabel)}の詳細" data-result-detail-toggle="${escapeHtml(detailId)}"><span>詳細</span><span class="genshin-detail-toggle-icon" aria-hidden="true">▼</span></button>`;
    }

    function renderResultRows(result, index, tableId) {
        const modeName = result.entry.attackMode?.nameJa;
        const resultLabel = modeName ? `${modeName}・${result.entry.label}` : result.entry.label;
        const view = buildDamageBreakdownViewModel(result);
        const meta = [view.element, view.attackType, `${view.hitCount}ヒット`].filter(Boolean).join("・");
        const detailId = `genshin-${tableId}-detail-${index}`;
        const attackHeading = `<div class="genshin-result-attack-head"><strong>${escapeHtml(resultLabel)}</strong>${renderDetailToggle(resultLabel, detailId)}</div><small>${escapeHtml(meta)}</small>`;
        if (result.entry.resultKind === "shield") {
            return `
                <tr class="genshin-damage-result-row">
                    <th scope="row">${attackHeading}</th>
                    <td data-label="基礎シールド量">${formatDamageNumber(result.nonCrit)}</td>
                    <td data-label="会心">-</td>
                    <td data-label="期待値">-</td>
                </tr>
                <tr class="genshin-damage-detail-row" id="${escapeHtml(detailId)}" hidden><td colspan="4">${renderBreakdown(result)}</td></tr>`;
        }
        const hitTotal = view.hitCount > 1
            ? `<small class="genshin-hit-total">全ヒット期待値 ${formatDamageNumber(result.total.expected)}</small>`
            : "";
        return `
            <tr class="genshin-damage-result-row">
                <th scope="row">${attackHeading}${hitTotal}</th>
                <td data-label="非会心">${formatDamageNumber(result.nonCrit)}</td>
                <td class="is-critical" data-label="会心">${formatDamageNumber(result.crit)}</td>
                <td data-label="期待値">${formatDamageNumber(result.expected)}</td>
            </tr>
            <tr class="genshin-damage-detail-row" id="${escapeHtml(detailId)}" hidden><td colspan="4">${renderBreakdown(result)}</td></tr>
        `;
    }

    function renderResultTable(results, ariaLabel, tableId) {
        return `<div class="genshin-damage-table-wrap">
            <table class="genshin-damage-table" aria-label="${escapeHtml(ariaLabel)}">
                <thead><tr><th scope="col">攻撃名</th><th scope="col">非会心</th><th scope="col">会心</th><th scope="col">期待値</th></tr></thead>
                <tbody>${results.map((result, index) => renderResultRows(result, index, tableId)).join("")}</tbody>
            </table>
        </div>`;
    }

    function renderTabButtons(grouped, activeTab) {
        return RESULT_TABS.map((tab) => {
            const active = tab.id === activeTab ? " is-active" : "";
            const selected = tab.id === activeTab ? "true" : "false";
            const tabIndex = tab.id === activeTab ? "0" : "-1";
            return `<button class="genshin-result-tab${active}" id="genshin-result-tab-${tab.id}" type="button" role="tab" aria-selected="${selected}" aria-controls="genshin-result-panel-${tab.id}" tabindex="${tabIndex}" data-json-tab="${tab.id}">${escapeHtml(tab.label)}</button>`;
        }).join("");
    }

    function resolveDisplayName(map, id, fallbackLabel) {
        if (!id) return "-";
        const item = map?.[String(id)];
        return item?.nameJa || `${fallbackLabel}（ID: ${id}）`;
    }

    function basicAttackKind(result) {
        const entry = result.entry || {};
        if (entry.attackType === "chargedAttack" || entry.damageType === "charged" || entry.damageType === "chargedAttack") return "charged";
        if (entry.attackType === "plungingAttack" || entry.damageType === "plunging") return "plunging";
        return "normal";
    }

    function renderBasicResults(results) {
        const groups = [
            { id: "normal", label: "通常攻撃" },
            { id: "charged", label: "重撃" },
            { id: "plunging", label: "落下攻撃" }
        ];
        const grouped = Object.fromEntries(groups.map((group) => [
            group.id,
            results.filter((result) => basicAttackKind(result) === group.id)
        ]));
        const activeGroup = groups.find((group) => grouped[group.id].length)?.id || "normal";
        const buttons = groups.map((group) => {
            const active = group.id === activeGroup;
            return `<button class="genshin-basic-result-tab${active ? " is-active" : ""}" id="genshin-basic-result-tab-${group.id}" type="button" role="tab" aria-selected="${active}" aria-controls="genshin-basic-result-panel-${group.id}" tabindex="${active ? "0" : "-1"}" data-basic-tab="${group.id}">${escapeHtml(group.label)}</button>`;
        }).join("");
        const panels = groups.map((group) => {
            const entries = results.filter((result) => basicAttackKind(result) === group.id);
            const content = entries.length
                ? renderResultTable(entries, `${group.label}のダメージ結果`, `basic-${group.id}`)
                : `<p class="genshin-basic-result-empty">計算可能な${group.label}データがありません。</p>`;
            return `<section class="genshin-basic-result-panel" id="genshin-basic-result-panel-${group.id}" role="tabpanel" aria-labelledby="genshin-basic-result-tab-${group.id}" data-basic-panel="${group.id}" ${group.id === activeGroup ? "" : "hidden"}>${content}</section>`;
        }).join("");
        return `<div class="genshin-basic-result-tabs" role="tablist" aria-label="通常攻撃種別">${buttons}</div>${panels}`;
    }

    function renderTabSections(grouped, activeTab) {
        return RESULT_TABS.map((tab) => {
            const results = grouped[tab.id] || [];
            const content = tab.id === "basic"
                ? renderBasicResults(results)
                : results.length
                    ? renderResultTable(results, `${tab.label}のダメージ結果`, `result-${tab.id}`)
                : `<p>${escapeHtml(tab.label)}の計算可能なデータがありません。</p>`;
            return `<section class="genshin-json-result-section" id="genshin-result-panel-${tab.id}" role="tabpanel" aria-labelledby="genshin-result-tab-${tab.id}" data-json-panel="${tab.id}" ${tab.id === activeTab ? "" : "hidden"}>${content}</section>`;
        }).join("");
    }

    function bindTabSwitch(wrap) {
        const tabs = Array.from(wrap.querySelectorAll("[data-json-tab]"));
        const activate = (button, moveFocus = false) => {
            const tabId = button.getAttribute("data-json-tab");
            tabs.forEach((tab) => {
                const active = tab === button;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", String(active));
                tab.setAttribute("tabindex", active ? "0" : "-1");
            });
            wrap.querySelectorAll("[data-json-panel]").forEach((panel) => {
                panel.hidden = panel.getAttribute("data-json-panel") !== tabId;
            });
            if (moveFocus) button.focus();
        };
        tabs.forEach((button, index) => {
            button.addEventListener("click", () => activate(button));
            button.addEventListener("keydown", (event) => {
                let nextIndex = null;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
                if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = tabs.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                activate(tabs[nextIndex], true);
            });
        });
    }

    function bindBasicTabSwitch(wrap) {
        const tabs = Array.from(wrap.querySelectorAll("[data-basic-tab]"));
        const activate = (button, moveFocus = false) => {
            const tabId = button.getAttribute("data-basic-tab");
            tabs.forEach((tab) => {
                const active = tab === button;
                tab.classList.toggle("is-active", active);
                tab.setAttribute("aria-selected", String(active));
                tab.setAttribute("tabindex", active ? "0" : "-1");
            });
            wrap.querySelectorAll("[data-basic-panel]").forEach((panel) => {
                panel.hidden = panel.getAttribute("data-basic-panel") !== tabId;
            });
            if (moveFocus) button.focus();
        };
        tabs.forEach((button, index) => {
            button.addEventListener("click", () => activate(button));
            button.addEventListener("keydown", (event) => {
                let nextIndex = null;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
                if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = tabs.length - 1;
                if (nextIndex === null) return;
                event.preventDefault();
                activate(tabs[nextIndex], true);
            });
        });
    }

    function bindResultDetails(wrap) {
        const close = (button) => {
            const detailId = button.getAttribute("data-result-detail-toggle");
            const detail = detailId ? document.getElementById(detailId) : null;
            button.setAttribute("aria-expanded", "false");
            const icon = button.querySelector(".genshin-detail-toggle-icon");
            if (icon) icon.textContent = "▼";
            if (detail) detail.hidden = true;
        };
        wrap.querySelectorAll("[data-result-detail-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                const table = button.closest(".genshin-damage-table");
                const willOpen = button.getAttribute("aria-expanded") !== "true";
                if (table) {
                    table.querySelectorAll("[data-result-detail-toggle]").forEach((other) => {
                        if (other !== button) close(other);
                    });
                }
                const detailId = button.getAttribute("data-result-detail-toggle");
                const detail = detailId ? document.getElementById(detailId) : null;
                button.setAttribute("aria-expanded", String(willOpen));
                const icon = button.querySelector(".genshin-detail-toggle-icon");
                if (icon) icon.textContent = willOpen ? "▲" : "▼";
                if (detail) detail.hidden = !willOpen;
            });
        });
    }

    function renderDamageTabs(payload) {
        const wrap = getElement("genshinJsonCalcResults");
        if (!wrap) return;
        wrap.hidden = false;
        const context = payload.context;
        const displayData = payload.displayData || {};
        const characterName = resolveDisplayName(displayData.characters, context.characterId, "未対応キャラクター");
        const weaponName = resolveDisplayName(displayData.weapons, context.weaponId, "未対応武器");
        const grouped = RESULT_TABS.reduce((acc, tab) => {
            acc[tab.id] = [];
            return acc;
        }, {});
        (payload.results || []).forEach((result) => {
            grouped[classifyResult(result)].push(result);
        });
        const activeTab = RESULT_TABS.find((tab) => grouped[tab.id].length)?.id || "basic";
        const inputNotices = payload.inputNotices || [];
        const inputNoticeHtml = inputNotices.length
            ? `<aside class="genshin-json-input-notices"><strong>追加入力待ち</strong><ul>${inputNotices.map((notice) => `<li>${escapeHtml(notice.message)}</li>`).join("")}</ul></aside>`
            : "";
        wrap.innerHTML = `
            <div class="genshin-json-result-head">
                <p>計算対象: ${escapeHtml(characterName)} / ${escapeHtml(weaponName)} / 反応 ${escapeHtml(context.reactionOption.label)}</p>
            </div>
            ${inputNoticeHtml}
            <div class="genshin-result-tabs" role="tablist" aria-label="計算結果タブ">
                ${renderTabButtons(grouped, activeTab)}
            </div>
            ${renderTabSections(grouped, activeTab)}
        `;
        bindTabSwitch(wrap);
        bindBasicTabSwitch(wrap);
        bindResultDetails(wrap);
    }

    function scrollToCalcResults() {
        const resultPanel = document.querySelector(".genshin-result-panel");
        if (!resultPanel) return;
        window.requestAnimationFrame(() => {
            const header = document.querySelector(".teti-site-header");
            const headerHeight = header ? header.getBoundingClientRect().height : 0;
            const top = resultPanel.getBoundingClientRect().top + window.pageYOffset - headerHeight - 14;
            window.scrollTo({
                top: Math.max(top, 0),
                behavior: "smooth"
            });
        });
    }

    function setHidden(id, hidden) {
        const element = getElement(id);
        if (element) element.hidden = hidden;
    }

    function setText(id, text) {
        const element = getElement(id);
        if (element) element.textContent = text;
    }

    function setChecked(id, checked) {
        const element = getElement(id);
        if (element) element.checked = checked;
    }

    function setValue(id, value) {
        const element = getElement(id);
        if (element) element.value = value;
    }

    function applyConstellationRow(rowId, textId, checkedId, rowState) {
        setHidden(rowId, !rowState.visible);
        setText(textId, rowState.label || "");
        setChecked(checkedId, Boolean(rowState.checked));
    }

    function renderResourceInputs(resourceInputs) {
        const field = getElement("genshinJsonResourceStateField");
        const wrap = getElement("genshinJsonResourceInputs");
        if (!field || !wrap) return;
        field.hidden = !resourceInputs.length;
        wrap.innerHTML = resourceInputs.map((input) => {
            const max = input.max === null ? "" : ` max="${escapeHtml(input.max)}"`;
            const value = input.value === null ? "" : escapeHtml(input.value);
            return `<span class="genshin-condition-line"><span>${escapeHtml(input.label)}</span><input type="number" class="input_num" data-genshin-resource-key="${escapeHtml(input.key)}" min="${escapeHtml(input.min)}"${max} step="1" value="${value}" placeholder="未入力"></span>`;
        }).join("");
    }

    function renderComplexConditionInputs(inputs) {
        const field = getElement("genshinJsonComplexConditionField");
        const wrap = getElement("genshinJsonComplexConditionInputs");
        if (!field || !wrap) return;
        field.hidden = !inputs.length;
        wrap.innerHTML = inputs.map((input) => {
            if (input.type === "option") {
                const options = input.options.map((option) => {
                    const value = typeof option === "object" ? option.value : option;
                    const label = typeof option === "object" ? option.label : option;
                    const selected = String(input.value) === String(value) ? " selected" : "";
                    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
                }).join("");
                return `<span class="genshin-condition-line"><span>${escapeHtml(input.label)}</span><select data-genshin-condition-key="${escapeHtml(input.key)}" data-genshin-condition-kind="option">${options}</select></span>`;
            }
            const value = input.value === null ? "" : escapeHtml(input.value);
            return `<span class="genshin-condition-line"><span>${escapeHtml(input.label)}</span><input type="number" class="input_num" data-genshin-condition-key="${escapeHtml(input.key)}" data-genshin-condition-kind="${escapeHtml(input.type)}" min="${escapeHtml(input.min)}" max="${escapeHtml(input.max)}" step="1" value="${value}" placeholder="未入力"></span>`;
        }).join("");
    }

    const CONDITION_STATUS = {
        auto: { label: "自動適用", className: "is-auto" },
        reflected: { label: "入力値に反映済み", className: "is-reflected" },
        notApplicable: { label: "現在は対象外", className: "is-inactive" },
        userInput: { label: "条件指定", className: "is-input" },
        missing: { label: "未入力", className: "is-missing" },
        displayOnly: { label: "表示のみ", className: "is-display" }
    };

    function reactionOptions(selected) {
        const groups = [
            ["", [["none", "反応なし"]]],
            ["増幅反応（計算対応）", [["melt15", "溶解 1.5"], ["melt20", "溶解 2.0"], ["vaporize15", "蒸発 1.5"], ["vaporize20", "蒸発 2.0"]]],
            ["加算反応", [["aggravate", "超激化"], ["spread", "草激化"]]],
            ["変化反応", [["overload", "過負荷"], ["electroCharged", "感電"], ["superconduct", "超電導"], ["swirl", "拡散"], ["burning", "燃焼"], ["bloom", "開花"], ["hyperbloom", "超開花"], ["burgeon", "烈開花"], ["shatter", "氷砕き"], ["crystallize", "結晶"]]],
            ["状態反応", [["frozen", "凍結"], ["quicken", "原激化"]]],
            ["月反応", [["lunarBloom", "月開花"], ["lunarCharged", "月感電"], ["lunarCrystallize", "月結晶"]]],
            ["星反応", [["stellarConduct", "星電導"]]]
        ];
        return groups.map(([label, options]) => {
            const html = options.map(([value, text]) => `<option value="${value}"${value === selected ? " selected" : ""}>${text}</option>`).join("");
            return label ? `<optgroup label="${label}">${html}</optgroup>` : html;
        }).join("");
    }

    function renderCardControl(control) {
        if (control.type === "toggle") {
            return `<label class="genshin-condition-toggle"><input type="checkbox" data-genshin-toggle-key="${escapeHtml(control.key)}"${control.checked ? " checked" : ""}> <span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span></label>`;
        }
        if (control.type === "amosStack") {
            const options = Array.from({ length: 6 }, (_, value) => `<option value="${value}"${Number(control.value) === value ? " selected" : ""}>${value === 0 ? "追加なし / 0段" : `${value}段${value === 5 ? "（最大）" : ""}`}</option>`).join("");
            return `<label class="genshin-condition-control"><span>${escapeHtml(control.label)}</span><select id="genshinJsonAmosStack">${options}</select></label>`;
        }
        if (control.type === "crimsonWitchStack") {
            const options = Array.from({ length: 4 }, (_, value) => `<option value="${value}"${Number(control.value) === value ? " selected" : ""}>${value}段</option>`).join("");
            return `<label class="genshin-condition-control"><span>${escapeHtml(control.label)}</span><select id="genshinJsonCrimsonWitchStack">${options}</select></label>`;
        }
        if (control.options?.length) {
            const options = control.options.map((option) => {
                const value = typeof option === "object" ? option.value : option;
                const label = typeof option === "object" ? option.label : option;
                return `<option value="${escapeHtml(value)}"${String(control.value) === String(value) ? " selected" : ""}>${escapeHtml(label)}</option>`;
            }).join("");
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span><select data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="option">${options}</select></label>`;
        }
        if (control.type === "resource") {
            const max = control.max === null ? "" : ` max="${escapeHtml(control.max)}"`;
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-genshin-resource-key="${escapeHtml(control.key)}" min="${escapeHtml(control.min)}"${max} step="1" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力">${control.unit ? `<em>${escapeHtml(control.unit)}</em>` : ""}</span></label>`;
        }
        if (control.type === "dedicated") {
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span><input type="number" class="input_num" id="${escapeHtml(control.id)}" min="0" step="1" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力"></label>`;
        }
        return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="${escapeHtml(control.type)}" min="${escapeHtml(control.min)}" max="${escapeHtml(control.max)}" step="1" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力">${control.unit ? `<em>${escapeHtml(control.unit)}</em>` : ""}</span></label>`;
    }

    function renderConditionEffect(effect) {
        const status = CONDITION_STATUS[effect.status] || CONDITION_STATUS.auto;
        return `<article class="genshin-condition-effect">
            <div class="genshin-condition-effect-head">
                <h5>${escapeHtml(effect.name)}</h5>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </div>
            <p class="genshin-condition-description">${escapeHtml(effect.description)}</p>
            ${effect.controls.map(renderCardControl).join("")}
            ${effect.impact ? `<p class="genshin-condition-impact">現在の反映：<strong>${escapeHtml(effect.impact)}</strong></p>` : ""}
            ${effect.statusReason && effect.status === "missing" ? `<p class="genshin-condition-missing">${escapeHtml(effect.statusReason)}</p>` : ""}
        </article>`;
    }

    function renderConstellationImpact(effect) {
        return `<li class="genshin-constellation-impact-row">
            <div><strong>${escapeHtml(effect.name)}</strong>${effect.target ? `<small>対象：${escapeHtml(effect.target)}</small>` : ""}</div>
            ${effect.impact ? `<span>${escapeHtml(effect.impact)}</span>` : ""}
            ${effect.statusReason && effect.status === "missing" ? `<p class="genshin-condition-missing">${escapeHtml(effect.statusReason)}</p>` : ""}
        </li>`;
    }

    function renderConstellationSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const originalText = section.description
            ? `<details class="genshin-constellation-original"><summary>星座効果の原文を表示</summary><p>${escapeHtml(section.description)}</p></details>`
            : "";
        const controls = section.controls.length
            ? `<div class="genshin-constellation-controls"><h6>条件入力</h6>${section.controls.map(renderCardControl).join("")}</div>`
            : "";
        return `<article class="genshin-constellation-section" data-constellation-level="C${escapeHtml(section.level)}">
            <header class="genshin-constellation-head">
                <div><strong>C${escapeHtml(section.level)}</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            <p class="genshin-constellation-targets"><strong>影響：</strong>${escapeHtml(section.impactLabels.join("／"))}</p>
            ${originalText}
            ${controls}
            <div class="genshin-constellation-impacts"><h6>計算への影響</h6><ul>${section.effects.map(renderConstellationImpact).join("")}</ul></div>
        </article>`;
    }

    function renderTalentSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const originalText = section.description
            ? `<details class="genshin-constellation-original"><summary>天賦効果の原文を表示</summary><p>${escapeHtml(section.description)}</p></details>`
            : "";
        const controls = section.controls.length
            ? `<div class="genshin-constellation-controls"><h6>状態・条件</h6>${section.controls.map(renderCardControl).join("")}</div>`
            : "";
        return `<article class="genshin-constellation-section genshin-talent-section" data-talent-source="${escapeHtml(section.key)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(section.typeLabel)}</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            <p class="genshin-constellation-targets"><strong>影響：</strong>${escapeHtml(section.impactLabels.join("／"))}</p>
            ${originalText}
            ${controls}
            <div class="genshin-constellation-impacts"><h6>計算への影響</h6><ul>${section.effects.map(renderConstellationImpact).join("")}</ul></div>
        </article>`;
    }

    function renderArtifactImpact(effect) {
        return `<li class="genshin-constellation-impact-row">
            <div><strong>${escapeHtml(effect.name)}</strong>${effect.target ? `<small>対象：${escapeHtml(effect.target)}</small>` : ""}</div>
            ${effect.impact ? `<span>${escapeHtml(effect.impact)}</span>` : ""}
            ${effect.statusReason ? `<p class="genshin-condition-note">${escapeHtml(effect.statusReason)}</p>` : ""}
        </li>`;
    }

    function renderArtifactSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const controls = section.controls.length
            ? `<div class="genshin-constellation-controls"><h6>条件・段階</h6>${section.controls.map(renderCardControl).join("")}</div>`
            : "";
        return `<article class="genshin-constellation-section genshin-artifact-section" data-artifact-set="${escapeHtml(section.setId)}" data-artifact-piece="${escapeHtml(section.pieceCount)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(section.pieceCount)}セット効果</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${section.description ? `<p class="genshin-artifact-description">${escapeHtml(section.description)}</p>` : ""}
            ${controls}
            <div class="genshin-constellation-impacts"><h6>計算への反映</h6><ul>${section.effects.map(renderArtifactImpact).join("")}</ul></div>
        </article>`;
    }

    function renderWeaponImpact(effect) {
        return `<li class="genshin-constellation-impact-row">
            <div><strong>${escapeHtml(effect.name)}</strong>${effect.target ? `<small>対象：${escapeHtml(effect.target)}</small>` : ""}</div>
            ${effect.impact ? `<span>${escapeHtml(effect.impact)}</span>` : ""}
            ${effect.statusReason && effect.status === "missing" ? `<p class="genshin-condition-missing">${escapeHtml(effect.statusReason)}</p>` : ""}
        </li>`;
    }

    function renderWeaponSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const ownerLabels = { self: "装備者", team: "チーム", activeCharacter: "装備者以外のフィールド上キャラ", enemy: "敵" };
        const controls = section.controls.length
            ? `<div class="genshin-constellation-controls"><h6>発動状態</h6>${section.controls.map(renderCardControl).join("")}</div>`
            : "";
        return `<article class="genshin-constellation-section genshin-weapon-section" data-weapon-effect-group="${escapeHtml(section.id)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(ownerLabels[section.targetOwner] || section.targetOwner)}</strong><h5>${escapeHtml(section.name)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${section.description ? `<p class="genshin-artifact-description">${escapeHtml(section.description)}</p>` : ""}
            ${controls}
            <div class="genshin-constellation-impacts"><h6>計算への反映</h6><ul>${section.effects.map(renderWeaponImpact).join("")}</ul></div>
        </article>`;
    }

    function renderReactionContributor(slot, contributor) {
        const value = (key) => contributor?.[key] ?? "";
        return `<fieldset class="genshin-reaction-contributor"><legend>参加者${slot}（任意）</legend>
            <label><span>Lv</span><input id="genshinReactionContributor${slot}Level" type="number" min="1" max="100" value="${escapeHtml(value("level"))}" placeholder="未入力"></label>
            <label><span>元素熟知</span><input id="genshinReactionContributor${slot}Em" type="number" min="0" value="${escapeHtml(value("elementalMastery"))}" placeholder="未入力"></label>
            <label><span>会心率%</span><input id="genshinReactionContributor${slot}CritRate" type="number" min="0" max="100" step="0.1" value="${escapeHtml(value("critRate"))}" placeholder="0"></label>
            <label><span>会心ダメージ%</span><input id="genshinReactionContributor${slot}CritDamage" type="number" min="0" step="0.1" value="${escapeHtml(value("critDamage"))}" placeholder="50"></label>
            <label><span>反応ダメージ補正%</span><input id="genshinReactionContributor${slot}ReactionBonus" type="number" step="0.1" value="${escapeHtml(value("reactionBonus"))}" placeholder="0"></label>
            <label><span>基礎ダメージ向上%</span><input id="genshinReactionContributor${slot}BaseBonus" type="number" step="0.1" value="${escapeHtml(value("baseDamageBonus"))}" placeholder="0"></label>
        </fieldset>`;
    }

    function renderDedicatedReactionControls(reaction, context) {
        if (reaction.dedicatedKind === "indirectLunar") {
            const contributors = new Map((context.manualInputs?.reactionContributors || []).map((item) => [item.slot, item]));
            return `<div class="genshin-reaction-dedicated">
                <p><strong>参加者1：</strong>現在のキャラクター（Lv・元素熟知・会心は上の計算入力欄を自動使用）</p>
                <p>参加者2～4は、その4秒間に対象元素を付着したキャラクターだけ入力してください。Lvまたは元素熟知を入れると参加扱いになります。</p>
                <div class="genshin-reaction-contributor-grid">${[2, 3, 4].map((slot) => renderReactionContributor(slot, contributors.get(slot))).join("")}</div>
            </div>`;
        }
        if (reaction.reactionId === "stellarConduct") {
            const current = Number(context.manualInputs?.stellarConductStacks) || 0;
            const options = Array.from({ length: 13 }, (_, stack) => `<option value="${stack}"${stack === current ? " selected" : ""}>${stack}回（係数 ${(1.4 + stack * 0.05).toFixed(2)}）</option>`).join("");
            return `<div class="genshin-reaction-dedicated"><label class="genshin-reaction-control"><span>直前4秒の氷・雷付着回数</span><select id="genshinStellarConductStacks">${options}</select></label><p>0～12回を係数1.40～2.00へ変換し、星電導扱いの天賦ダメージだけに適用します。</p></div>`;
        }
        return "";
    }

    function renderConditionCards(panelState, context) {
        const wrap = getElement("genshinJsonConditionCards");
        if (!wrap) return;
        const cards = panelState.cards || [];
        const flatCards = cards.filter((card) => !["weapon", "artifact", "talent", "constellation"].includes(card.id));
        const artifactSections = cards.find((card) => card.id === "artifact")?.sections || [];
        const weaponSections = cards.find((card) => card.id === "weapon")?.sections || [];
        const talentSections = cards.find((card) => card.id === "talent")?.sections || [];
        const constellationSections = cards.find((card) => card.id === "constellation")?.sections || [];
        const conditionCount = flatCards.flatMap((card) => card.effects).filter((effect) => effect.status === "userInput").length
            + weaponSections.reduce((count, section) => count + section.controls.length, 0)
            + artifactSections.reduce((count, section) => count + section.controls.length, 0)
            + talentSections.reduce((count, section) => count + section.controls.length, 0)
            + constellationSections.reduce((count, section) => count + section.controls.length, 0);
        const missingCount = flatCards.flatMap((card) => card.effects).filter((effect) => effect.status === "missing").length
            + weaponSections.reduce((count, section) => count + section.controls.filter((control) => {
                return control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === "");
            }).length, 0)
            + artifactSections.reduce((count, section) => count + section.controls.filter((control) => {
                return control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === "");
            }).length, 0)
            + talentSections.reduce((count, section) => count + section.controls.filter((control) => {
                return control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === "");
            }).length, 0)
            + constellationSections.reduce((count, section) => count + section.controls.filter((control) => {
                return control.type !== "toggle" && (control.value === null || control.value === undefined || control.value === "");
            }).length, 0);
        const summaryClass = missingCount ? " has-missing" : "";
        const reaction = context.reactionOption || { reactionId: "none", label: "反応なし", enabled: false, baseMultiplier: 1 };
        const reactionDescription = reaction.family === "none"
            ? "反応なしを選択中です。元素反応ダメージは計算しません。"
            : reaction.calculationStatus === "dedicatedFormulaRequired"
                ? `${reaction.descriptionJa || reaction.label}${reaction.unsupportedReasonJa ? ` ${reaction.unsupportedReasonJa}` : ""} 現在の結果には反映されません。`
                : reaction.descriptionJa || (reaction.enabled ? "選択した元素反応を計算へ反映します。" : "この反応自体は数値ダメージを発生させません。");
        const reactionElementControl = reaction.reactionId === "swirl"
            ? `<label class="genshin-reaction-control"><span>拡散する元素</span><select id="genshinJsonReactionElement">${["炎", "水", "雷", "氷"].map((element) => `<option value="${element}"${context.reactionElement === element ? " selected" : ""}>${element}元素</option>`).join("")}</select></label>`
            : "";
        const dedicatedReactionControls = renderDedicatedReactionControls(reaction, context);
        wrap.innerHTML = `
            <div class="genshin-condition-summary${summaryClass}">
                <strong>現在の計算条件</strong>
                <span>手動設定 ${conditionCount}件 / 未入力 ${missingCount}件</span>
            </div>
            <section class="genshin-condition-card" data-condition-card="reaction">
                <header><div><h4>元素反応</h4><p>${escapeHtml(reaction.label)}</p></div></header>
                <label class="genshin-reaction-control"><span>計算する元素反応</span><select id="genshinJsonReactionOption">${reactionOptions(context.reactionOptionKey || "none")}</select></label>
                ${reactionElementControl}
                ${dedicatedReactionControls}
                <p class="genshin-condition-card-empty">${escapeHtml(reactionDescription)}</p>
            </section>
            ${cards.map((card) => `<section class="genshin-condition-card" data-condition-card="${escapeHtml(card.id)}">
                <header><div><h4>${escapeHtml(card.title)}</h4><p>${escapeHtml(card.subtitle)}</p></div></header>
                ${card.id === "weapon" && card.sections?.length
                    ? card.sections.map(renderWeaponSection).join("")
                    : card.id === "constellation" && card.sections?.length
                    ? card.sections.map(renderConstellationSection).join("")
                    : card.id === "talent" && card.sections?.length
                        ? card.sections.map(renderTalentSection).join("")
                    : card.id === "artifact" && card.sections?.length
                        ? card.sections.map(renderArtifactSection).join("")
                    : card.effects.length ? card.effects.map(renderConditionEffect).join("") : `<p class="genshin-condition-card-empty">${escapeHtml(card.emptyText)}</p>`}
            </section>`).join("")}
        `;
    }

    async function handlePrepareConditionsClick() {
        const calcData = await window.GenshinCalcData.loadGenshinCalcData();
        const context = window.GenshinCalcEngine.buildCharacterCalcContext();
        window.GenshinCalcEngine.hydrateReactionContext(context, calcData);
        const panelState = window.GenshinCalcConditions.conditionPanelState(context, calcData);
        renderConditionCards(panelState, context);

        const help = getElement("genshinJsonConditionHelp");
        if (help) {
            help.textContent = panelState.helpText;
        }
    }

    function getCalcButtons() {
        return ["genshinJsonCalcButton", "genshinJsonCalcButtonBottom"]
            .map(getElement)
            .filter(Boolean);
    }

    async function handleJsonCalcClick() {
        const buttons = getCalcButtons();
        buttons.forEach((button) => { button.disabled = true; });
        try {
            await handlePrepareConditionsClick();
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            renderWarnings(payload.warnings);
            renderDamageTabs(payload);
            scrollToCalcResults();
        } catch (error) {
            console.error("[genshin-json-calc] failed", error);
            renderWarnings([{ message: `ダメージ計算に失敗しました: ${error.message}` }]);
        } finally {
            buttons.forEach((button) => { button.disabled = false; });
        }
    }

    function initializeGenshinCalcRenderer() {
        const buttons = getCalcButtons();
        if (!buttons.length || !window.GenshinCalcEngine || !window.GenshinCalcData) return;
        buttons.forEach((button) => button.addEventListener("click", handleJsonCalcClick));
        const prepareButton = getElement("genshinJsonPrepareConditionsButton");
        if (prepareButton) {
            prepareButton.addEventListener("click", handlePrepareConditionsClick);
            handlePrepareConditionsClick();
        }
        const conditionCards = getElement("genshinJsonConditionCards");
        if (conditionCards) {
            conditionCards.addEventListener("change", handlePrepareConditionsClick);
        }
    }

    document.addEventListener("DOMContentLoaded", initializeGenshinCalcRenderer);

    window.GenshinCalcRenderer = {
        RESULT_TABS,
        classifyResult,
        basicAttackKind,
        buildDamageBreakdownViewModel,
        elementLabel,
        attackTypeLabel,
        renderDamageTabs,
        renderDamageBreakdown: renderBreakdown,
        renderConditionCards,
        renderWarnings,
        scrollToCalcResults
    };
})();
