(function () {
    "use strict";

    const RESULT_TABS = [
        { id: "basic", label: "通常", fullLabel: "通常・重撃・落下" },
        { id: "skill", label: "スキル", fullLabel: "元素スキル" },
        { id: "burst", label: "爆発", fullLabel: "元素爆発" },
        { id: "reaction", label: "反応", fullLabel: "元素反応" },
        { id: "other", label: "その他", fullLabel: "その他" }
    ];
    const CONDITION_TABS = [
        { id: "reaction", label: "反応" },
        { id: "party", label: "パーティ" },
        { id: "weapon", label: "武器" },
        { id: "artifact", label: "聖遺物" },
        { id: "talent", label: "天賦・命ノ星座" },
        { id: "other", label: "その他" }
    ];
    let activeConditionTab = "reaction";
    let calculationDirty = false;

    function getElement(id) {
        return document.getElementById(id);
    }

    function hasRenderedCalculation() {
        const results = getElement("genshinJsonCalcResults");
        return Boolean(results && !results.hidden && results.innerHTML.trim());
    }

    function setCalculationDirty(dirty) {
        calculationDirty = Boolean(dirty && hasRenderedCalculation());
        const notice = getElement("genshinCalculationDirtyNotice");
        if (notice) notice.hidden = !calculationDirty;
        getElement("genshinJsonCalcResults")?.classList.toggle("is-stale", calculationDirty);
        getElement("genshinJsonCalcButtonBottom")?.classList.toggle("has-pending-changes", calculationDirty);
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
        const suffix = modifierValueSuffix(modifier);
        const valueText = Number.isFinite(value) ? `（${value >= 0 ? "+" : ""}${formatDecimal(value)}${suffix}）` : "";
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

    const MODIFIER_TARGET_LABELS = {
        atk: "攻撃力", atkFlat: "攻撃力", atkPercent: "攻撃力",
        hp: "HP", hpFlat: "HP", hpPercent: "HP",
        def: "防御力", defFlat: "防御力", defPercent: "防御力",
        elementalMastery: "元素熟知", energyRecharge: "元素チャージ効率",
        critRate: "会心率", critDamage: "会心ダメージ",
        allDamageBonus: "与えるダメージ", allElementDamageBonus: "全元素ダメージ",
        swirledElementDamageBonus: "拡散した元素ダメージ",
        ownElementDamageBonus: "固有元素ダメージ", normalAttackDamageBonus: "通常攻撃ダメージ",
        chargedAttackDamageBonus: "重撃ダメージ", plungingAttackDamageBonus: "落下攻撃ダメージ",
        skillDamageBonus: "元素スキルダメージ", burstDamageBonus: "元素爆発ダメージ"
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
        return window.GenshinUiLabels?.statLabel?.(stat) || STAT_LABELS[stat] || stat || "参照値";
    }

    function modifierValueSuffix(modifier = {}) {
        if (modifier.unit === "flat") return "";
        if (["percent", "percentOfReference", "percentPerPoint"].includes(modifier.unit)) return "%";
        if (modifier.category === "statBonus" && (modifier.applyTo || []).includes("elementalMastery")) return "";
        return "%";
    }

    function modifierTargetLabel(modifier = {}) {
        const targets = (modifier.applyTo || []).map((target) => (
            window.GenshinUiLabels?.statLabel?.(target) || MODIFIER_TARGET_LABELS[target]
        )).filter(Boolean);
        return [...new Set(targets)].join("・");
    }

    function modifierStage(item) {
        const calculation = item.analysis?.calculation;
        const category = item.modifier?.category;
        if (["statBonus", "scalingStatBonus"].includes(calculation) || category === "statBonus") return "base";
        if (["damageBonus", "scalingDamageBonus"].includes(calculation) || category === "damageBonus") return "buff";
        if (["critBonus", "reactionCritBonus"].includes(category)) return "critical";
        if (["resistanceDebuff", "defenseDebuff", "defenseIgnore"].includes(category)) return "enemy";
        if (["reactionBonus", "reactionBaseDamageBonus"].includes(category)) return "reaction";
        return "special";
    }

    function appliedSourceLabel(item) {
        const modifier = item.modifier || {};
        if (modifier.partySource) {
            return [modifier.partyProviderName, modifier.partySourceName].filter(Boolean).join("・") || "パーティ補正";
        }
        return sourceLabel(item.source);
    }

    function resolvedStatTrace(item, statTrace = []) {
        const modifier = item.modifier || {};
        return statTrace.find((trace) => trace.source === item.source
            && (modifier.id ? trace.modifierId === modifier.id : true));
    }

    function modifierDisplayItem(item, statTrace = []) {
        const modifier = item.modifier || {};
        const category = MODIFIER_CATEGORY_LABELS[modifier.category] || "補正効果";
        const source = appliedSourceLabel(item);
        const effect = modifierTargetLabel(modifier) || modifier.effectLabel || category;
        const numericValue = Number(item.value);
        const trace = modifierStage(item) === "base" ? resolvedStatTrace(item, statTrace) : null;
        const rawValue = Number.isFinite(numericValue)
            ? `${numericValue >= 0 ? "+" : ""}${formatDecimal(numericValue)}${modifierValueSuffix(modifier)}`
            : "";
        const value = trace
            ? `${Number(trace.value) >= 0 ? "+" : ""}${formatNumber(trace.value)}${rawValue ? `（${rawValue}）` : ""}`
            : rawValue;
        return {
            label: [source, effect].filter(Boolean).join("・"),
            value,
            stage: modifierStage(item)
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
        const appliedEffects = (breakdown.appliedModifiers || []).map((item) => modifierDisplayItem(item, breakdown.statTrace || []));
        const effectsByStage = appliedEffects.reduce((groups, effect) => {
            groups[effect.stage] = groups[effect.stage] || [];
            groups[effect.stage].push(effect);
            return groups;
        }, {});
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
            base: { scalingParts, baseDamage, effects: effectsByStage.base || [] },
            buffs: {
                damageBonus: numberOr(breakdown.damageBonus),
                additiveBaseDamage,
                finalDamageMultiplier,
                effects: effectsByStage.buff || []
            },
            reaction: reactionEnabled ? {
                label: reaction.label || "元素反応",
                multiplier: numberOr(reaction.baseMultiplier, 1),
                elementalMasteryBonus: numberOr(reaction.elementalMasteryBonus),
                reactionBonus: numberOr(breakdown.reactionBonus),
                baseDamageBonus: numberOr(breakdown.reactionBaseDamageBonus),
                contributors: reaction.contributors || [],
                effects: effectsByStage.reaction || []
            } : null,
            enemy: {
                defenseReduction: numberOr(breakdown.defenseReduction ?? breakdown.defenseDebuff),
                defenseIgnore: numberOr(breakdown.defenseIgnore),
                defenseMultiplier: numberOr(breakdown.defenseMultiplier, 1),
                resistance: numberOr(breakdown.resistance),
                resistanceMultiplier: numberOr(breakdown.resistanceMultiplier, 1),
                immunity: Boolean(breakdown.immunity),
                effects: effectsByStage.enemy || []
            },
            critical: {
                rate: numberOr(breakdown.critRate),
                damage: numberOr(breakdown.critDamage),
                effects: effectsByStage.critical || []
            },
            special: {
                visible: additiveBaseDamage !== 0 || finalDamageMultiplier !== 1 || effectOverrides.length > 0,
                additiveBaseDamage,
                finalDamageMultiplier,
                effectOverrides,
                effects: effectsByStage.special || []
            },
            influence: (breakdown.damageInfluence || []).map((item) => ({
                key: item.key || "other",
                label: item.label || "その他",
                value: numberOr(item.contribution ?? item.value)
            })),
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

    function renderDamageInfluence(items) {
        const visible = items.filter((item) => Math.abs(item.value) > 1e-9);
        if (!visible.length) return "";
        const magnitude = visible.reduce((sum, item) => sum + Math.abs(item.value), 0) || 1;
        const ariaLabel = visible.map((item) => `${item.label} ${item.value >= 0 ? "プラス" : "マイナス"}${formatDamageNumber(Math.abs(item.value))}`).join("、");
        return `<section class="genshin-damage-influence">
            <h5>ダメージ影響度</h5>
            <p>期待値を計算順に分解した増減量です。乗算補正は適用順によって寄与量が変わります。</p>
            <div class="genshin-influence-bar" role="img" aria-label="${escapeHtml(ariaLabel)}">
                ${visible.map((item) => `<span class="is-${escapeHtml(item.key)}${item.value < 0 ? " is-negative" : ""}" style="--influence-size:${(Math.abs(item.value) / magnitude * 100).toFixed(4)}%" title="${escapeHtml(item.label)}"></span>`).join("")}
            </div>
            <ul class="genshin-influence-legend">
                ${visible.map((item) => `<li><i class="is-${escapeHtml(item.key)}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span><strong>${item.value >= 0 ? "+" : "−"}${formatDamageNumber(Math.abs(item.value))}</strong></li>`).join("")}
            </ul>
        </section>`;
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
            { label: `敵の${view.element}耐性`, value: view.enemy.immunity ? "無効" : `${formatDecimal(view.enemy.resistance)}%` },
            { label: "最終耐性倍率", value: view.enemy.immunity ? "×0（ダメージ無効）" : `×${formatDecimal(view.enemy.resistanceMultiplier, 4)}` }
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
                    ${renderFriendlyBreakdownSection("1. 基礎ダメージ", scalingRows, renderAppliedEffects(view.base.effects))}
                    ${renderFriendlyBreakdownSection("2. ダメージバフ", buffRows, renderAppliedEffects(view.buffs.effects))}
                    ${view.reaction ? renderFriendlyBreakdownSection("3. 元素反応", reactionRows, contributorHtml + renderAppliedEffects(view.reaction.effects)) : ""}
                    ${renderFriendlyBreakdownSection(view.reaction ? "4. 敵への補正" : "3. 敵への補正", enemyRows, renderAppliedEffects(view.enemy.effects))}
                    ${renderFriendlyBreakdownSection(view.reaction ? "5. 会心" : "4. 会心", criticalRows, renderAppliedEffects(view.critical.effects))}
                    ${view.special.visible || view.special.effects.length ? renderFriendlyBreakdownSection(view.reaction ? "6. 特殊補正" : "5. 特殊補正", specialRows, renderAppliedEffects(view.special.effects)) : ""}
                </div>
                ${renderDamageInfluence(view.influence)}
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

    function renderComparisonDelta(delta) {
        if (!delta) return "";
        const difference = Number(delta.difference) || 0;
        const sign = difference > 0 ? "+" : difference < 0 ? "−" : "±";
        const differenceText = `${sign}${Math.floor(Math.abs(difference)).toLocaleString("ja-JP")}`;
        const hasPercent = Number.isFinite(delta.percent);
        const percentText = hasPercent
            ? `${delta.percent > 0 ? "+" : ""}${delta.percent.toFixed(1)}%`
            : "";
        const label = delta.direction === "up" ? "増加" : delta.direction === "down" ? "減少" : "変化なし";
        return `<small class="genshin-comparison-delta is-${escapeHtml(delta.direction)}${hasPercent ? " has-percent" : ""}" aria-label="${label} ${differenceText}${percentText ? ` ${percentText}` : ""}"><span class="genshin-comparison-difference">${differenceText}</span>${percentText ? `<span class="genshin-comparison-percent">${percentText}</span>` : ""}</small>`;
    }

    function comparisonForAttack(attackKey) {
        return window.GenshinCalculationComparison?.store?.getComparison?.().get(attackKey) || null;
    }

    function renderResultRows(result, index, tableId) {
        const modeName = result.entry.attackMode?.nameJa;
        const resultLabel = modeName ? `${modeName}・${result.entry.label}` : result.entry.label;
        const view = buildDamageBreakdownViewModel(result);
        const meta = [view.element, view.attackType, `${view.hitCount}ヒット`].filter(Boolean).join("・");
        const detailId = `genshin-${tableId}-detail-${index}`;
        const comparison = comparisonForAttack(result.attackKey);
        const attackHeading = `<div class="genshin-result-attack-head"><strong title="${escapeHtml(resultLabel)}">${escapeHtml(resultLabel)}</strong>${renderDetailToggle(resultLabel, detailId)}</div><small>${escapeHtml(meta)}</small>`;
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
                <td data-label="非会心"><span class="genshin-result-value">${formatDamageNumber(result.nonCrit)}</span>${renderComparisonDelta(comparison?.nonCrit)}</td>
                <td class="is-critical" data-label="会心"><span class="genshin-result-value">${formatDamageNumber(result.crit)}</span>${renderComparisonDelta(comparison?.crit)}</td>
                <td data-label="期待値"><span class="genshin-result-value">${formatDamageNumber(result.expected)}</span>${renderComparisonDelta(comparison?.expected)}</td>
            </tr>
            <tr class="genshin-damage-detail-row" id="${escapeHtml(detailId)}" hidden><td colspan="4">${renderBreakdown(result)}</td></tr>
        `;
    }

    function renderResultTable(results, ariaLabel, tableId) {
        return `<div class="genshin-damage-table-wrap">
            <table class="genshin-damage-table" aria-label="${escapeHtml(ariaLabel)}">
                <colgroup><col class="genshin-damage-col-name"><col class="genshin-damage-col-value"><col class="genshin-damage-col-value"><col class="genshin-damage-col-value"></colgroup>
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
            return `<button class="genshin-result-tab${active}" id="genshin-result-tab-${tab.id}" type="button" role="tab" aria-label="${escapeHtml(tab.fullLabel)}" aria-selected="${selected}" aria-controls="genshin-result-panel-${tab.id}" tabindex="${tabIndex}" data-json-tab="${tab.id}">${escapeHtml(tab.label)}</button>`;
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
                    ? renderResultTable(results, `${tab.fullLabel}のダメージ結果`, `result-${tab.id}`)
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

    function renderComparisonControls() {
        const store = window.GenshinCalculationComparison?.store;
        if (!store) return "";
        const state = store.getState();
        const previousDisabled = state.previous ? "" : " disabled";
        const baselineDisabled = state.baseline ? "" : " disabled";
        const modeLabel = state.mode === "baseline" ? "固定基準" : "直前結果";
        const available = state.mode === "baseline" ? state.baseline : state.previous;
        return `<section class="genshin-comparison-controls" aria-label="ダメージ比較">
            <div class="genshin-comparison-heading">
                <strong>ダメージ比較</strong>
                <span>${available ? `${modeLabel}との差分を表示中` : `${modeLabel}はまだありません`}</span>
            </div>
            <div class="genshin-comparison-actions">
                <button type="button" class="${state.mode === "previous" ? "is-active" : ""}" data-comparison-mode="previous" aria-pressed="${state.mode === "previous"}"${previousDisabled}>直前と比較</button>
                <button type="button" class="${state.mode === "baseline" ? "is-active" : ""}" data-comparison-mode="baseline" aria-pressed="${state.mode === "baseline"}"${baselineDisabled}>固定基準と比較</button>
                <button type="button" data-comparison-action="set-baseline">現在を基準に固定</button>
                ${state.baseline ? `<button type="button" data-comparison-action="clear-baseline">固定を解除</button>` : ""}
            </div>
        </section>`;
    }

    const BEHAVIOR_PATH_LABELS = {
        "/timing/cooldown": "クールタイム",
        "/timing/duration": "継続時間",
        "/timing/tickInterval": "発生間隔",
        "/timing/triggerInterval": "発動間隔",
        "/execution/charges": "使用可能回数",
        "/execution/hitCount": "ヒット数",
        "/execution/maxTriggers": "最大発動回数",
        "/execution/maxInstances": "最大同時存在数",
        "/energy/gain": "エネルギー獲得量"
    };

    function renderBehaviorResolution(resolution) {
        const applied = resolution?.applied || [];
        if (!applied.length) return "";
        const valueText = (item) => {
            if (item.result?.mode === "delta") {
                const delta = `${Number(item.result.delta) >= 0 ? "+" : ""}${item.result.delta}`;
                if (item.result.baseValue !== null && item.result.baseValue !== undefined
                    && item.result.resolvedValue !== null && item.result.resolvedValue !== undefined) {
                    return `${item.result.baseValue} → ${item.result.resolvedValue}（${delta}）`;
                }
                return delta;
            }
            if (item.result?.mode === "factor") return `×${item.result.factor}`;
            return String(item.result?.value ?? item.value ?? "-");
        };
        return `<aside class="genshin-json-behavior-resolution" aria-label="挙動変更">
            <strong>挙動変更</strong>
            <ul>${applied.map((item) => `<li data-behavior-modifier-id="${escapeHtml(item.id)}"><span>${escapeHtml(BEHAVIOR_PATH_LABELS[item.path] || item.path)}</span> <strong>${escapeHtml(valueText(item))}</strong></li>`).join("")}</ul>
        </aside>`;
    }

    function bindComparisonControls(wrap, payload) {
        const store = window.GenshinCalculationComparison?.store;
        if (!store) return;
        wrap.querySelectorAll("[data-comparison-mode]").forEach((button) => {
            button.addEventListener("click", () => {
                store.setMode(button.dataset.comparisonMode);
                renderDamageTabs(payload);
            });
        });
        wrap.querySelector('[data-comparison-action="set-baseline"]')?.addEventListener("click", () => {
            store.setBaseline(payload.snapshot);
            store.setMode("baseline");
            renderDamageTabs(payload);
        });
        wrap.querySelector('[data-comparison-action="clear-baseline"]')?.addEventListener("click", () => {
            store.clearBaseline();
            store.setMode("previous");
            renderDamageTabs(payload);
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
            grouped[classifyResult(result)].push({
                ...result,
                breakdown: { ...(result.breakdown || {}), statTrace: payload.statTrace || [] }
            });
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
            ${renderComparisonControls()}
            ${inputNoticeHtml}
            ${renderBehaviorResolution(payload.behaviorResolution)}
            <div class="genshin-result-tabs" role="tablist" aria-label="計算結果タブ">
                ${renderTabButtons(grouped, activeTab)}
            </div>
            ${renderTabSections(grouped, activeTab)}
        `;
        bindTabSwitch(wrap);
        bindBasicTabSwitch(wrap);
        bindResultDetails(wrap);
        bindComparisonControls(wrap, payload);
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
        auto: { label: "自動反映", className: "is-auto" },
        reflected: { label: "反映済み", className: "is-reflected" },
        notApplicable: { label: "対象外", className: "is-inactive" },
        userInput: { label: "条件を設定", className: "is-input" },
        missing: { label: "入力が必要", className: "is-missing" },
        displayOnly: { label: "表示のみ", className: "is-display" }
    };

    function reactionOptions(selected, definitions = {}) {
        const groups = [
            ["", [["none", "反応なし"]]],
            ["増幅反応", [["melt15", "溶解 1.5　氷ダメ"], ["melt20", "溶解 2.0　炎ダメ"], ["vaporize15", "蒸発 1.5　炎ダメ"], ["vaporize20", "蒸発 2.0　水ダメ"]]],
            ["加算反応", [["aggravate", "超激化"], ["spread", "草激化"]]],
            ["変化反応", [["overload", "過負荷"], ["electroCharged", "感電"], ["superconduct", "超電導"], ["swirl", "拡散"], ["burning", "燃焼"], ["bloom", "開花"], ["hyperbloom", "超開花"], ["burgeon", "烈開花"], ["shatter", "氷砕き"], ["crystallize", "結晶"]]],
            ["状態反応", [["frozen", "凍結"], ["quicken", "原激化"]]],
            ["月反応", [["lunarBloom", "月開花"], ["lunarCharged", "月感電"], ["lunarCrystallize", "月結晶"]]],
            ["星反応", [["stellarConduct", "星電導"]]]
        ];
        const known = new Set(groups.flatMap(([, options]) => options.map(([value]) => value)));
        Object.entries(definitions || {}).forEach(([key, definition]) => {
            if (known.has(key)) return;
            const family = definition?.family;
            const label = definition?.labelJa || definition?.label || key;
            let groupLabel = family === "dedicated" && /^stellar/i.test(definition?.reactionId || key)
                ? "星反応"
                : family === "dedicated" ? "月反応"
                    : family === "statusOnly" ? "状態反応"
                        : family === "transformative" || family === "shield" ? "変化反応"
                            : family === "additive" ? "加算反応"
                                : family === "amplifying" ? "増幅反応" : "";
            const group = groups.find(([name]) => name === groupLabel) || groups[0];
            group[1].push([key, label]);
            known.add(key);
        });
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
        if (control.type === "stack" && Number.isFinite(Number(control.max)) && Number(control.max) <= 20) {
            const min = Number.isFinite(Number(control.min)) ? Number(control.min) : 0;
            const max = Number(control.max);
            const current = Number.isFinite(Number(control.value)) ? Number(control.value) : min;
            const options = Array.from({ length: max - min + 1 }, (_, index) => {
                const value = min + index;
                const label = value === 0 ? "未発動（0層）" : `${value}層`;
                return `<option value="${value}"${current === value ? " selected" : ""}>${label}</option>`;
            }).join("");
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(control.label)}</strong>${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}</span><select data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="stack">${options}</select></label>`;
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

    const DESCRIPTION_KIND_LABELS = {
        full: "全文",
        excerpt: "抜粋",
        summary: "要約",
        generated: "自動説明"
    };

    function renderDescriptionBlock(description, descriptionKind = "summary") {
        if (!description) return "";
        const kindLabel = DESCRIPTION_KIND_LABELS[descriptionKind] || DESCRIPTION_KIND_LABELS.summary;
        return `<div class="genshin-condition-detail-block"><h6>効果説明 <span class="genshin-description-kind">${escapeHtml(kindLabel)}</span></h6><p>${escapeHtml(description)}</p></div>`;
    }

    function renderConditionEffect(effect) {
        const status = CONDITION_STATUS[effect.status] || CONDITION_STATUS.auto;
        const detail = effect.description
            ? `<details class="genshin-condition-detail"><summary>効果説明</summary>${renderDescriptionBlock(effect.description, effect.descriptionKind)}</details>`
            : "";
        return `<article class="genshin-condition-effect">
            <div class="genshin-condition-effect-head">
                <h5>${escapeHtml(effect.name)}</h5>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </div>
            <dl class="genshin-condition-facts">
                <div><dt>発動条件</dt><dd>${escapeHtml(effect.activationCondition || "常時")}</dd></div>
                <div><dt>効果</dt><dd>${escapeHtml(effect.effectSummary || effect.name)}</dd></div>
            </dl>
            <p class="genshin-condition-impact">現在の反映：<strong>${escapeHtml(currentReflectionLabel(effect))}</strong></p>
            ${effect.statusReason && effect.status === "missing" ? `<p class="genshin-condition-missing">${escapeHtml(effect.statusReason)}</p>` : ""}
            ${effect.controls.map(renderCardControl).join("")}
            ${detail}
        </article>`;
    }

    function currentReflectionLabel(effect) {
        const zeroValue = String(effect.impact || "").includes("%") ? "0%" : "未適用";
        if (effect.status === "missing") return "未反映（入力不足）";
        if (effect.status === "notApplicable") return "対象外";
        if (effect.status === "reflected") return "入力済みステータスへ反映済み";
        if (effect.status === "displayOnly") return zeroValue;
        const toggles = (effect.controls || []).filter((control) => control.type === "toggle");
        if (toggles.some((control) => !control.checked)) return zeroValue;
        return effect.impact || "適用中";
    }

    function renderSectionFacts(section) {
        const conditions = [...new Set(section.effects.map((effect) => effect.activationCondition).filter(Boolean))];
        const effects = [...new Set(section.effects.map((effect) => effect.effectSummary).filter(Boolean))];
        const current = section.effects.map((effect) => `${effect.displayTarget || effect.name}：${currentReflectionLabel(effect)}`);
        return `<dl class="genshin-condition-facts">
            <div><dt>発動条件</dt><dd>${escapeHtml(conditions.join("／") || "常時")}</dd></div>
            <div><dt>効果</dt><dd>${escapeHtml(effects.join("／") || section.impactLabels?.join("／") || "計算へ補正を適用")}</dd></div>
            ${current.length ? `<div><dt>現在の反映</dt><dd>${escapeHtml(current.join("／"))}</dd></div>` : ""}
        </dl>`;
    }

    function renderSectionControls(section, heading) {
        if (!section.controls.length) return "";
        const conditionLabels = new Set(section.effects.map((effect) => effect.activationCondition).filter(Boolean));
        const controls = section.controls.map((control) => {
            if (!conditionLabels.has(control.label)) return control;
            if (control.type === "toggle") return { ...control, label: "この条件を適用する" };
            if (control.type === "option") return { ...control, label: "現在の状態" };
            return { ...control, label: "現在の値" };
        });
        return `<div class="genshin-constellation-controls"><h6>${escapeHtml(heading)}</h6>${controls.map(renderCardControl).join("")}</div>`;
    }

    function renderSectionDetail(description, descriptionKind, impacts) {
        if (!description && !impacts) return "";
        return `<details class="genshin-condition-detail">
            <summary>効果説明</summary>
            ${renderDescriptionBlock(description, descriptionKind)}
            ${impacts ? `<div class="genshin-condition-detail-block genshin-constellation-impacts"><h6>計算への反映</h6><ul>${impacts}</ul></div>` : ""}
        </details>`;
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
        const controls = renderSectionControls(section, "条件入力");
        const detail = renderSectionDetail(section.description, section.descriptionKind, section.effects.map(renderConstellationImpact).join(""));
        return `<article class="genshin-constellation-section" data-constellation-level="C${escapeHtml(section.level)}">
            <header class="genshin-constellation-head">
                <div><strong>C${escapeHtml(section.level)}</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${renderSectionFacts(section)}
            ${controls}
            ${detail}
        </article>`;
    }

    function renderTalentSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const controls = renderSectionControls(section, "状態・条件");
        const detail = renderSectionDetail(section.description, section.descriptionKind, section.effects.map(renderConstellationImpact).join(""));
        return `<article class="genshin-constellation-section genshin-talent-section" data-talent-source="${escapeHtml(section.key)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(section.typeLabel)}</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${renderSectionFacts(section)}
            ${controls}
            ${detail}
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
        const controls = renderSectionControls(section, "条件・段階");
        const detail = renderSectionDetail(section.description, section.descriptionKind, section.effects.map(renderArtifactImpact).join(""));
        return `<article class="genshin-constellation-section genshin-artifact-section" data-artifact-set="${escapeHtml(section.setId)}" data-artifact-piece="${escapeHtml(section.pieceCount)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(section.pieceCount)}セット効果</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${renderSectionFacts(section)}
            ${controls}
            ${detail}
        </article>`;
    }

    function renderWeaponImpact(effect) {
        return `<li class="genshin-constellation-impact-row">
            <div><strong>${escapeHtml(effect.displayTarget || effect.name)}</strong>${effect.target ? `<small>対象：${escapeHtml(effect.target)}</small>` : ""}</div>
            ${effect.impact ? `<span>${escapeHtml(effect.impact)}</span>` : ""}
            ${effect.statusReason && effect.status === "missing" ? `<p class="genshin-condition-missing">${escapeHtml(effect.statusReason)}</p>` : ""}
        </li>`;
    }

    function renderWeaponSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const ownerLabels = { self: "装備者", team: "チーム", activeCharacter: "フィールド上キャラ", otherPartyMembers: "装備者以外の近くにいるチームメンバー全員", enemy: "敵" };
        const controls = renderSectionControls(section, "発動状態");
        const detail = renderSectionDetail(section.description, section.descriptionKind, section.effects.map(renderWeaponImpact).join(""));
        return `<article class="genshin-constellation-section genshin-weapon-section" data-weapon-effect-group="${escapeHtml(section.id)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(ownerLabels[section.targetOwner] || section.targetOwner)}</strong><h5>${escapeHtml(section.name)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${renderSectionFacts(section)}
            ${controls}
            ${detail}
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

    function partyModifierStatus(candidate) {
        if (candidate.status === "ready" && candidate.enabled) return { label: candidate.automatic ? "自動適用" : "適用中", className: "is-auto" };
        if (candidate.status === "off") return { label: "条件OFF", className: "is-inactive" };
        if (candidate.status === "ambiguous") return { label: "対象確認", className: "is-missing" };
        if (["missingProviderStats", "missingInput"].includes(candidate.status)) return { label: "入力不足", className: "is-missing" };
        return { label: "表示のみ", className: "is-display-only" };
    }

    function renderPartyConditionControl(candidate, context) {
        const conditionInput = candidate.modifier?.conditionInput;
        if (conditionInput?.type !== "option" || !Array.isArray(conditionInput.options) || !conditionInput.options.length) return "";
        const key = candidate.analysis?.conditionStateKey || candidate.key || "";
        if (!key) return "";
        const conditionState = context.uiState?.conditionByModifier?.[key]
            || context.uiState?.complexConditionByModifier?.[key]
            || {};
        const options = conditionInput.options.map((option) => ({
            value: typeof option === "object" ? option.value : option,
            label: typeof option === "object" ? option.label : option
        })).filter((option) => option.value !== undefined && option.value !== null && option.value !== "");
        if (!options.length) return "";
        const selectedValue = options.some((option) => String(option.value) === String(conditionState.option))
            ? conditionState.option
            : window.GenshinCalcConditions?.explicitPartyOptionDefault?.(candidate, options.map((option) => option.value)) ?? null;
        const placeholder = selectedValue === null
            ? `<option value="" selected>選択してください</option>`
            : "";
        const renderedOptions = options.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(selectedValue) ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
        return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(conditionInput.label || "現在の状態")}</strong>${conditionInput.help ? `<small>${escapeHtml(conditionInput.help)}</small>` : ""}</span><select data-genshin-party-condition-key="${escapeHtml(key)}" data-genshin-party-condition-kind="option">${placeholder}${renderedOptions}</select></label>`;
    }

    function renderPartyModifier(candidate, context) {
        const status = partyModifierStatus(candidate);
        const condition = window.GenshinCalcConditions?.modifierActivationCondition?.(
            candidate.modifier, [], null, candidate.sourceName, candidate.description
        ) || candidate.modifier.conditionLabel || "常時";
        const displayModifier = Number.isFinite(Number(candidate.resolvedValue))
            ? { ...candidate.modifier, value: Number(candidate.resolvedValue), valueByLevel: undefined }
            : candidate.modifier;
        const effect = candidate.effectLabel || window.GenshinCalcConditions?.modifierEffectSummary?.(displayModifier, context)
            || candidate.modifier.effectLabel
            || candidate.modifier.category;
        const canToggle = candidate.showToggle !== false && !candidate.automatic && ["ready", "off"].includes(candidate.status);
        const current = candidate.status === "ready" && candidate.enabled
            ? effect
            : candidate.status === "off" ? "未適用" : candidate.reason || "未反映";
        return `<article class="genshin-condition-effect genshin-party-effect" data-party-buff="${escapeHtml(candidate.key)}">
            <div class="genshin-condition-effect-head">
                <h5>${escapeHtml(candidate.sourceName)}</h5>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </div>
            <dl class="genshin-condition-facts">
                <div><dt>対象</dt><dd>${escapeHtml(candidate.targetLabel)}</dd></div>
                <div><dt>発動条件</dt><dd>${escapeHtml(condition)}</dd></div>
                <div><dt>効果</dt><dd>${escapeHtml(effect)}</dd></div>
                <div><dt>現在の反映</dt><dd>${escapeHtml(current)}</dd></div>
            </dl>
            ${renderPartyConditionControl(candidate, context)}
            ${canToggle ? `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>この条件を適用する</strong><small>実際に発動している場合だけONにしてください。</small></span><input type="checkbox" data-genshin-party-buff-key="${escapeHtml(candidate.toggleKey || candidate.key)}"${candidate.enabled ? " checked" : ""}></label>` : ""}
            ${candidate.reason && candidate.status !== "off" ? `<p class="genshin-condition-note">${escapeHtml(candidate.reason)}</p>` : ""}
            ${candidate.description ? `<details class="genshin-condition-detail"><summary>効果説明</summary>${renderDescriptionBlock(candidate.description, "full")}</details>` : ""}
        </article>`;
    }

    function renderPartyPanel(partyModifiers, context, calcData) {
        const members = (context.party?.members || []).filter((member) => member.slot > 1 && member.enabled);
        const resonanceEffects = partyModifiers.filter((candidate) => candidate.sourceKind === "resonance");
        if (!members.length && !resonanceEffects.length) {
            return `<section class="genshin-condition-card" data-condition-card="party"><header><div><h4>パーティ補正</h4><p>パーティ設定でサポートメンバーを選択してください。</p></div><span class="genshin-condition-source">PARTY</span></header><p class="genshin-condition-card-empty">サポートメンバーは未設定です。</p></section>`;
        }
        const resonanceSection = resonanceEffects.length ? `<section class="genshin-condition-card is-wide genshin-party-condition-card genshin-resonance-card" data-condition-card="party">
            <header><div><h4>元素共鳴</h4><p>現在の4人編成から自動判定します。</p></div><span class="genshin-condition-source">RESONANCE</span></header>
            ${resonanceEffects.map((candidate) => renderPartyModifier(candidate, context)).join("")}
        </section>` : "";
        return resonanceSection + members.map((member) => {
            const effects = partyModifiers.filter((candidate) => candidate.sourceKind !== "resonance" && candidate.member.slot === member.slot);
            const name = member.nameJa || calcData.characters?.[member.characterId]?.nameJa || `メンバー${member.slot}`;
            return `<section class="genshin-condition-card is-wide genshin-party-condition-card" data-condition-card="party" data-party-slot="${member.slot}">
                <header><div><h4>${escapeHtml(name)}</h4><p>Lv.${escapeHtml(member.level)} / C${escapeHtml(member.constellation)}</p></div><span class="genshin-condition-source">MEMBER ${member.slot}</span></header>
                ${effects.length ? effects.map((candidate) => renderPartyModifier(candidate, context)).join("") : `<p class="genshin-condition-card-empty">メインキャラへ適用できる構造化補正はありません。</p>`}
            </section>`;
        }).join("");
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
        const partyModifiers = panelState.partyModifiers || [];
        const conditionCount = flatCards.flatMap((card) => card.effects).filter((effect) => effect.status === "userInput").length
            + weaponSections.reduce((count, section) => count + section.controls.length, 0)
            + artifactSections.reduce((count, section) => count + section.controls.length, 0)
            + talentSections.reduce((count, section) => count + section.controls.length, 0)
            + constellationSections.reduce((count, section) => count + section.controls.length, 0)
            + partyModifiers.filter((candidate) => !candidate.automatic && ["ready", "off"].includes(candidate.status)).length;
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
            }).length, 0)
            + partyModifiers.filter((candidate) => ["ambiguous", "missingProviderStats", "missingInput"].includes(candidate.status)).length;
        const reaction = context.reactionOption || { reactionId: "none", label: "反応なし", enabled: false, baseMultiplier: 1 };
        const reactionDescription = reaction.family === "none"
            ? "反応なしを選択中です。元素反応ダメージは計算しません。"
            : reaction.calculationStatus === "dedicatedFormulaRequired"
                ? `${reaction.descriptionJa || reaction.label}${reaction.unsupportedReasonJa ? ` ${reaction.unsupportedReasonJa}` : ""} 現在の結果には反映されません。`
                : reaction.descriptionJa || (reaction.enabled ? "選択した元素反応を計算へ反映します。" : "この反応自体は数値ダメージを発生させません。");
        const reactionElementControl = ["swirl", "stellarSwirl"].includes(reaction.reactionId)
            ? `<label class="genshin-reaction-control"><span>${reaction.reactionId === "stellarSwirl" ? "星拡散する元素" : "拡散する元素"}</span><select id="genshinJsonReactionElement">${["炎", "水", "雷", "氷"].map((element) => `<option value="${element}"${context.reactionElement === element ? " selected" : ""}>${element}元素</option>`).join("")}</select></label>`
            : "";
        const dedicatedReactionControls = renderDedicatedReactionControls(reaction, context);
        const reactionWide = Boolean(reactionElementControl || dedicatedReactionControls);
        const reactionSelect = getElement("genshinJsonReactionOption");
        if (reactionSelect) {
            reactionSelect.innerHTML = reactionOptions(context.reactionOptionKey || "none", context.reactionDefinitions?.options);
            reactionSelect.value = context.reactionOptionKey || "none";
        }
        const weaponCard = cards.find((card) => card.id === "weapon");
        const artifactCard = cards.find((card) => card.id === "artifact");
        const weaponWide = weaponSections.length > 1 || weaponSections.reduce((count, section) => count + section.controls.length, 0) > 2;
        const artifactWide = artifactSections.length > 1 || artifactSections.reduce((count, section) => count + section.controls.length, 0) > 2;
        const renderSourceHeader = (title, source, subtitle) => `<header><div><h4>${escapeHtml(title)}</h4>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><span class="genshin-condition-source">${escapeHtml(source)}</span></header>`;
        if (wrap.dataset) {
            wrap.dataset.conditionStatus = missingCount
                ? `再読み込み済み・入力が必要 ${missingCount}件`
                : conditionCount
                    ? `再読み込み済み・手動設定 ${conditionCount}件`
                    : "再読み込み済み";
        }
        const totalEffects = flatCards.reduce((count, card) => count + card.effects.length, 0)
            + weaponSections.reduce((count, section) => count + section.effects.length, 0)
            + artifactSections.reduce((count, section) => count + section.effects.length, 0)
            + talentSections.reduce((count, section) => count + section.effects.length, 0)
            + constellationSections.reduce((count, section) => count + section.effects.length, 0)
            + partyModifiers.length;
        const summary = getElement("genshinConditionSummary");
        if (summary) {
            summary.classList.toggle("has-missing", missingCount > 0);
            const title = summary.querySelector("strong");
            const copy = summary.querySelector("span");
            if (title) title.textContent = missingCount ? `入力が必要な条件 ${missingCount}件` : "補正条件を確認済み";
            if (copy) copy.textContent = `${totalEffects}件の効果を確認${conditionCount ? `・手動設定 ${conditionCount}件` : "・追加設定なし"}`;
        }
        const panels = {
            reaction: `<section class="genshin-condition-card${reactionWide ? " is-wide" : ""}" data-condition-card="reaction">
                ${renderSourceHeader("元素反応", "REACTION", reaction.label)}
                <div class="genshin-condition-overview"><span class="genshin-condition-status ${reaction.family === "none" ? "is-inactive" : "is-auto"}">${reaction.family === "none" ? "反応なし" : "適用中"}</span><strong>${escapeHtml(reaction.label)}</strong></div>
                ${reactionElementControl}
                ${dedicatedReactionControls}
                <p class="genshin-condition-card-empty">${escapeHtml(reactionDescription)}</p>
            </section>`,
            party: renderPartyPanel(partyModifiers, context, panelState.displayData || {}),
            weapon: `<section class="genshin-condition-card${weaponWide ? " is-wide" : ""}" data-condition-card="weapon">
                ${renderSourceHeader("武器補正", "WEAPON", weaponCard?.subtitle || "")}
                ${weaponSections.length ? weaponSections.map(renderWeaponSection).join("") : `<p class="genshin-condition-card-empty">${escapeHtml(weaponCard?.emptyText || "武器を選択すると補正を表示します。")}</p>`}
            </section>`,
            artifact: `<section class="genshin-condition-card${artifactWide ? " is-wide" : ""}" data-condition-card="artifact">
                ${renderSourceHeader("聖遺物補正", "ARTIFACT", artifactCard?.subtitle || "")}
                ${artifactSections.length ? artifactSections.map(renderArtifactSection).join("") : `<p class="genshin-condition-card-empty">${escapeHtml(artifactCard?.emptyText || "聖遺物を選択すると補正を表示します。")}</p>`}
            </section>`,
            talent: `<section class="genshin-condition-card is-wide" data-condition-card="talent-constellation">
                ${renderSourceHeader("天賦・命ノ星座補正", "TALENT", "発動条件と現在の反映を確認")}
                ${talentSections.length ? talentSections.map(renderTalentSection).join("") : `<p class="genshin-condition-card-empty">天賦の手動条件はありません。</p>`}
                ${constellationSections.length ? constellationSections.map(renderConstellationSection).join("") : `<p class="genshin-condition-card-empty">現在の命ノ星座に手動条件はありません。</p>`}
            </section>`,
            other: flatCards.length ? flatCards.map((card) => `<section class="genshin-condition-card${card.effects.length > 2 ? " is-wide" : ""}" data-condition-card="${escapeHtml(card.id)}">
                ${renderSourceHeader(card.title, "OTHER", card.subtitle)}
                ${card.effects.length ? card.effects.map(renderConditionEffect).join("") : `<p class="genshin-condition-card-empty">${escapeHtml(card.emptyText)}</p>`}
            </section>`).join("") : `<p class="genshin-condition-card-empty">その他の補正条件はありません。</p>`
        };
        wrap.innerHTML = CONDITION_TABS.map((tab) => `<div class="genshin-condition-tab-panel" id="genshin-condition-panel-${tab.id}" role="tabpanel" aria-labelledby="genshin-condition-tab-${tab.id}" data-condition-panel="${tab.id}"${tab.id === activeConditionTab ? "" : " hidden"}>${panels[tab.id]}</div>`).join("");
        const tabs = getElement("genshinConditionTabs");
        if (tabs) {
            tabs.innerHTML = CONDITION_TABS.map((tab) => `<button type="button" class="genshin-condition-tab${tab.id === activeConditionTab ? " is-active" : ""}" id="genshin-condition-tab-${tab.id}" role="tab" aria-selected="${tab.id === activeConditionTab}" aria-controls="genshin-condition-panel-${tab.id}" data-condition-tab="${tab.id}">${escapeHtml(tab.label)}</button>`).join("");
        }
    }

    function selectConditionTab(tabId) {
        if (!CONDITION_TABS.some((tab) => tab.id === tabId)) return;
        activeConditionTab = tabId;
        document.querySelectorAll("[data-condition-tab]").forEach((button) => {
            const selected = button.dataset.conditionTab === tabId;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-selected", String(selected));
        });
        document.querySelectorAll("[data-condition-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.conditionPanel !== tabId;
        });
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

    async function handleConditionValueChange() {
        await handlePrepareConditionsClick();
        setCalculationDirty(true);
    }

    function getCalcButtons() {
        return ["genshinJsonCalcButtonBottom"]
            .map(getElement)
            .filter(Boolean);
    }

    async function handleJsonCalcClick() {
        const buttons = getCalcButtons();
        buttons.forEach((button) => { button.disabled = true; });
        try {
            await handlePrepareConditionsClick();
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            window.GenshinCalculationComparison?.store?.record?.(payload.snapshot);
            renderWarnings(payload.warnings);
            renderDamageTabs(payload);
            setCalculationDirty(false);
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
            conditionCards.addEventListener("change", (event) => {
                if (event.target?.matches?.("[data-genshin-party-condition-key]")) {
                    window.GenshinPartyState?.setPartyConditionState?.(
                        event.target.dataset.genshinPartyConditionKey,
                        event.target.dataset.genshinPartyConditionKind || "option",
                        event.target.value
                    );
                    handleConditionValueChange();
                    return;
                }
                if (event.target?.matches?.("[data-genshin-party-buff-key]")) {
                    window.GenshinPartyState?.setBuffEnabled?.(event.target.dataset.genshinPartyBuffKey, event.target.checked);
                    handleConditionValueChange();
                    return;
                }
                if (event.target?.matches?.("[data-genshin-condition-key], [data-genshin-resource-key], [data-genshin-toggle-key]")) {
                    handleConditionValueChange();
                    return;
                }
                handlePrepareConditionsClick();
            });
        }
        const conditionDialog = getElement("genshinConditionDialog");
        getElement("genshinConditionDialogOpen")?.addEventListener("click", async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
                await handlePrepareConditionsClick();
                if (conditionDialog && !conditionDialog.open) conditionDialog.showModal();
            } catch (error) {
                console.error("[genshin-condition-dialog] failed", error);
                renderWarnings([{ message: `補正条件の読み込みに失敗しました: ${error.message}` }]);
            } finally {
                button.disabled = false;
            }
        });
        getElement("genshinConditionDialogClose")?.addEventListener("click", () => conditionDialog?.close());
        getElement("genshinConditionTabs")?.addEventListener("click", (event) => {
            const button = event.target.closest?.("[data-condition-tab]");
            if (button) selectConditionTab(button.dataset.conditionTab);
        });
        const reactionSelect = getElement("genshinJsonReactionOption");
        if (reactionSelect) {
            reactionSelect.addEventListener("change", handlePrepareConditionsClick);
        }
        const inputPanel = document.querySelector(".genshin-input-panel");
        const markCalculationDirty = () => setCalculationDirty(true);
        inputPanel?.addEventListener("input", markCalculationDirty);
        inputPanel?.addEventListener("change", markCalculationDirty);
        getElement("genshinPartyDialog")?.addEventListener("input", markCalculationDirty);
        getElement("genshinPartyDialog")?.addEventListener("change", markCalculationDirty);
    }

    document.addEventListener("DOMContentLoaded", initializeGenshinCalcRenderer);

    window.GenshinCalcRenderer = {
        RESULT_TABS,
        classifyResult,
        basicAttackKind,
        buildDamageBreakdownViewModel,
        statLabel,
        elementLabel,
        attackTypeLabel,
        renderDamageTabs,
        renderDamageBreakdown: renderBreakdown,
        renderConditionCards,
        renderWarnings,
        scrollToCalcResults
    };
})();
