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
    let conditionTabChosen = false;
    let selectedPartyMember = "";
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

    // Generated labels only: originals and internal attribute values retain their original text.
    function escapeEffectLabel(value) {
        return escapeHtml(String(value ?? "").replace(/Lead Vocal/g, "メロディ").replace(/Chorus/g, "コーラス"));
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
        const visibleWarnings = [...new Set((warnings || []).map((warning) => {
            const message = warning.userMessage || warning.message || String(warning);
            if (warning.kind === "provisional" || message.includes("暫定仕様")) return "";
            // Diagnostics retain their detailed keys in the payload/console, never in public copy.
            if (/(?:Modifiers\.|weaponEffectRegistry|canonicalRuntime|\/games\/|\.json|provisional\d|calculationSupport|uidHandling|sourceContext|\b\d{8}\b|(?:anemo|cryo|stellarSwirl|stellarConduct)\b)/.test(message)) {
                return warning.level === "error" ? "一部の計算データを読み込めませんでした。ページを再読み込みしてください。" : "";
            }
            return message;
        }).filter(Boolean))].slice(0, 4);
        wrap.hidden = !visibleWarnings.length;
        wrap.classList.toggle("is-provisional", visibleWarnings.length > 0 && visibleWarnings.every((message) => message.includes("暫定仕様")));
        wrap.innerHTML = visibleWarnings.length
            ? `<ul>${visibleWarnings.map((message) => `<li>${escapeHtml(message)}</li>`).join("")}</ul>`
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
        return "効果";
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
        const effectLabel = modifier.effectLabel ? ` / ${userFacingLabel(modifier.effectLabel, "補正効果")}` : "";
        const sourceText = modifier.sourceText ? `: ${modifier.sourceText}` : "";
        const reason = item.reason ? ` / ${reasonLabel(item.reason)}` : "";
        const resourceLabels = {
            calculationInput: "計算入力",
            displayOnly: "表示専用",
            unsupported: "未対応"
        };
        const classification = item.analysis?.resourceClassification
            ? ` [${resourceLabels[item.analysis.resourceClassification] || "補正効果"}]`
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

    const ELEMENT_ALIASES = {
        Physical: "physical", Pyro: "pyro", Hydro: "hydro", Electro: "electro",
        Cryo: "cryo", Anemo: "anemo", Geo: "geo", Dendro: "dendro",
        physical: "physical", pyro: "pyro", hydro: "hydro", electro: "electro",
        cryo: "cryo", anemo: "anemo", geo: "geo", dendro: "dendro",
        物理: "physical", 炎: "pyro", 水: "hydro", 雷: "electro",
        氷: "cryo", 風: "anemo", 岩: "geo", 草: "dendro", 固有元素: "ownElement"
    };
    const REACTION_LABELS = {
        stellarSwirl: "星拡散",
        stellarConduct: "星電導"
    };
    const STAT_ALIASES = {
        HP: "hp", Atk: "atk", ATK: "atk", Def: "def", DEF: "def",
        ElementalMastery: "elementalMastery", EnergyRecharge: "energyRecharge",
        CritRate: "critRate", CritDamage: "critDamage"
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
        stellarReactions: "星反応ダメージ",
        swirledElementDamageBonus: "拡散した元素ダメージ",
        ownElementDamageBonus: "固有元素ダメージ", normalAttackDamageBonus: "通常攻撃ダメージ",
        chargedAttackDamageBonus: "重撃ダメージ", plungingAttackDamageBonus: "落下攻撃ダメージ",
        skillDamageBonus: "元素スキルダメージ", burstDamageBonus: "元素爆発ダメージ"
    };

    function userFacingLabel(value, fallback) {
        const label = String(value || "").trim();
        return !label || /^[A-Za-z0-9][A-Za-z0-9_:.-]*$/.test(label) ? fallback : label;
    }

    function elementLabel(element) {
        const key = ELEMENT_ALIASES[element] || element;
        return ELEMENT_LABELS[key] || (key ? "元素" : "-");
    }

    function reactionLabel(reaction = {}) {
        const idLabel = REACTION_LABELS[reaction.reactionId];
        if (idLabel) return idLabel;
        const raw = String(reaction.label || "").trim();
        if (!raw || raw === reaction.reactionId || /^[A-Za-z][A-Za-z0-9_-]*$/.test(raw)) return "元素反応";
        return raw;
    }

    function attackTypeLabel(entry = {}) {
        if (entry.resultKind === "shield") return "シールド";
        if (entry.damageType === "unknown") return "分類未確定";
        return ATTACK_TYPE_LABELS[entry.attackType]
            || ATTACK_TYPE_LABELS[entry.damageType]
            || ({ normal: "通常攻撃", charged: "重撃", plunging: "落下攻撃", chargedAttack: "重撃", plungingAttack: "落下攻撃" }[entry.damageType])
            || "その他";
    }

    function statLabel(stat) {
        const canonical = STAT_ALIASES[stat] || stat;
        return window.GenshinUiLabels?.statLabel?.(canonical) || STAT_LABELS[canonical] || "参照値";
    }

    function modifierValueSuffix(modifier = {}) {
        if (modifier.unit === "flat") return "";
        if (["percent", "percentOfReference", "percentPerPoint"].includes(modifier.unit)) return "%";
        if (modifier.category === "statBonus" && (modifier.applyTo || []).includes("elementalMastery")) return "";
        return "%";
    }

    function modifierTargetLabel(modifier = {}) {
        const targets = (modifier.applyTo || []).map((target) => (
            window.GenshinUiLabels?.statLabel?.(STAT_ALIASES[target] || target)
                || MODIFIER_TARGET_LABELS[target]
                || "ステータス"
        )).filter(Boolean);
        return [...new Set(targets)].join("・");
    }

    function modifierStage(item) {
        const calculation = item.analysis?.calculation;
        const category = item.modifier?.category;
        if (["critBonus", "reactionCritBonus"].includes(category)) return "critical";
        if (["statBonus", "scalingStatBonus"].includes(calculation) || category === "statBonus") return "base";
        if (["damageBonus", "scalingDamageBonus"].includes(calculation) || category === "damageBonus") return "buff";
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
        const effect = modifierTargetLabel(modifier) || userFacingLabel(modifier.effectLabel, category);
        const numericValue = Number(item.value);
        const trace = modifierStage(item) === "base" ? resolvedStatTrace(item, statTrace) : null;
        const rawValue = Number.isFinite(numericValue)
            ? modifier.displayAsMultiplier && modifier.unit === "percentOfOriginalDamage"
                ? `×${formatDecimal(numericValue / 100, 4)}`
                : `${numericValue >= 0 ? "+" : ""}${formatDecimal(numericValue)}${modifierValueSuffix(modifier)}`
            : "";
        const value = trace
            ? trace.referenceStat
                ? `${Number(trace.value) >= 0 ? "+" : ""}${formatDecimal(trace.value)} ／ ${statLabel(trace.referenceStat)}${Number(trace.referenceValue).toLocaleString("ja-JP", { maximumFractionDigits: 4 })} × ${Number(trace.coefficient).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}${Number.isFinite(Number(trace.maxValue)) ? ` / 上限${Number(trace.maxValue).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}` : ""}`
                : `${Number(trace.value) >= 0 ? "+" : ""}${formatNumber(trace.value)}`
            : modifier.category === "reactionBaseDamageBonus" && modifier.rounding === "continuous"
                ? `+${Number(item.value).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}% ／ ${statLabel(modifier.reference?.stat)}${Number(item.valueContext?.stats?.[modifier.reference?.stat] || 0).toLocaleString("ja-JP", { maximumFractionDigits: 4 })} × ${Number(modifier.ratio / modifier.divisor).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}% / 上限${modifier.maxValue}%`
                : rawValue;
        return {
            label: [source, source.endsWith(`・${effect}`) ? "" : effect].filter(Boolean).join("・"),
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
                label: reactionLabel(reaction),
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
                attackType: attackTypeLabel(result.entry || {}),
                damageType: result.entry?.damageType === "unknown" ? "分類未確定" : ATTACK_TYPE_LABELS[result.entry?.damageType]
                    || ({ normal: "通常攻撃", charged: "重撃", plunging: "落下攻撃", chargedAttack: "重撃", plungingAttack: "落下攻撃" }[result.entry?.damageType])
                    || "その他",
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
        return `<ul class="genshin-breakdown-effects">${effects.map((effect) => `<li><span>${escapeEffectLabel(effect.label)}</span>${effect.value ? `<strong>${escapeHtml(effect.value)}</strong>` : ""}</li>`).join("")}</ul>`;
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
        const statRows = (result.breakdown?.statTrace || []).some((trace) => trace.stat === "elementalMastery" && trace.referenceStat)
            ? [{ label: "元素熟知（補正後）", value: formatNumber(result.breakdown?.inputStats?.elementalMastery) }]
            : [];
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
                    ${renderFriendlyBreakdownSection("計算時ステータス", statRows)}
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
        const attackLabel = userFacingLabel(result.entry.label, attackTypeLabel(result.entry));
        const resultLabel = modeName ? `${modeName}・${attackLabel}` : attackLabel;
        const view = buildDamageBreakdownViewModel(result);
        const meta = [view.element, view.attackType, `${view.hitCount}ヒット`].filter(Boolean).join("・");
        const detailId = `genshin-${tableId}-detail-${index}`;
        const comparison = comparisonForAttack(result.attackKey);
        const supplementalTotal = result.supplementalTotal;
        const supplemental = supplementalTotal
            ? `<small class="genshin-context-total" title="${escapeHtml(supplementalTotal.note || "")}"><strong>参考：</strong>${escapeHtml(supplementalTotal.label)}／非会心 ${formatDamageNumber(supplementalTotal.nonCrit)}・会心 ${formatDamageNumber(supplementalTotal.crit)}・期待値 ${formatDamageNumber(supplementalTotal.expected)}<br>${escapeHtml(supplementalTotal.note || "")}</small>`
            : "";
        const attackHeading = `<div class="genshin-result-attack-head"><strong title="${escapeHtml(resultLabel)}">${escapeHtml(resultLabel)}</strong>${renderDetailToggle(resultLabel, detailId)}</div><small>${escapeHtml(meta)}</small>${supplemental}`;
        if (result.entry.resultKind === "shield") {
            return `
                <tr class="genshin-damage-result-row" data-attack-key="${escapeHtml(result.attackKey)}">
                    <th scope="row">${attackHeading}</th>
                    <td data-label="基礎シールド量">${formatDamageNumber(result.nonCrit)}</td>
                    <td data-label="会心">-</td>
                    <td data-label="期待値">-</td>
                </tr>
                <tr class="genshin-damage-detail-row" id="${escapeHtml(detailId)}" hidden><td colspan="4">${renderBreakdown(result)}</td></tr>`;
        }
        if (result.entry.calculationStatus === "externalConfirmationRequired" || result.entry.damageType === "unknown") {
            const reason = result.entry.pendingReasonJa || "ダメージ分類は外部確認待ちです。";
            return `<tr class="genshin-damage-result-row" data-attack-key="${escapeHtml(result.attackKey)}"><th scope="row">${attackHeading}<small>${escapeHtml(reason)}</small></th><td colspan="3">外部確認待ち</td></tr>`;
        }
        const hitTotal = view.hitCount > 1
            ? `<small class="genshin-hit-total">全ヒット期待値 ${formatDamageNumber(result.total.expected)}</small>`
            : "";
        return `
            <tr class="genshin-damage-result-row" data-attack-key="${escapeHtml(result.attackKey)}">
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
        const provisionalNotice = context.weaponId === "11435"
            ? `<aside class="genshin-json-provisional-notice">中間距離の対応式は仕様確認中のため、現在は最小/最大状態のみ選択可能です。</aside>`
            : "";
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
                ${provisionalNotice}
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
                    return `<option value="${escapeHtml(value)}"${selected}>${escapeEffectLabel(label)}</option>`;
                }).join("");
                return `<span class="genshin-condition-line"><span>${escapeHtml(input.label)}</span><select data-genshin-condition-key="${escapeHtml(input.key)}" data-genshin-condition-kind="option">${options}</select></span>`;
            }
            const value = input.value === null ? "" : escapeHtml(input.value);
            return `<span class="genshin-condition-line"><span>${escapeHtml(input.label)}</span><input type="number" class="input_num" data-genshin-condition-key="${escapeHtml(input.key)}" data-genshin-condition-kind="${escapeHtml(input.type)}" min="${escapeHtml(input.min)}" max="${escapeHtml(input.max)}" step="${escapeHtml(input.step ?? 1)}" value="${value}" placeholder="未入力"></span>`;
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
            const label = reactionLabel({ reactionId: definition?.reactionId || key, label: definition?.labelJa || definition?.label });
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
            return `<label class="genshin-condition-toggle"><input type="checkbox" data-genshin-toggle-key="${escapeHtml(control.key)}"${control.checked ? " checked" : ""}> <span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span></label>`;
        }
        if (control.type === "amosStack") {
            const options = Array.from({ length: 6 }, (_, value) => `<option value="${value}"${Number(control.value) === value ? " selected" : ""}>${value === 0 ? "追加なし / 0段" : `${value}段${value === 5 ? "（最大）" : ""}`}</option>`).join("");
            return `<label class="genshin-condition-control"><span>${escapeEffectLabel(control.label)}</span><select id="genshinJsonAmosStack">${options}</select></label>`;
        }
        if (control.type === "crimsonWitchStack") {
            const options = Array.from({ length: 4 }, (_, value) => `<option value="${value}"${Number(control.value) === value ? " selected" : ""}>${value}段</option>`).join("");
            return `<label class="genshin-condition-control"><span>${escapeEffectLabel(control.label)}</span><select id="genshinJsonCrimsonWitchStack">${options}</select></label>`;
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
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span><select data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="stack">${options}</select></label>`;
        }
        if (control.options?.length) {
            const options = control.options.map((option) => {
                const value = typeof option === "object" ? option.value : option;
                const label = typeof option === "object" ? option.label : option;
                return `<option value="${escapeHtml(value)}"${String(control.value) === String(value) ? " selected" : ""}>${escapeEffectLabel(label)}</option>`;
            }).join("");
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span><select data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="option">${options}</select></label>`;
        }
        if (control.type === "resource") {
            const max = control.max === null ? "" : ` max="${escapeHtml(control.max)}"`;
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-genshin-resource-key="${escapeHtml(control.key)}" min="${escapeHtml(control.min)}"${max} step="1" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力">${control.unit ? `<em>${escapeHtml(control.unit)}</em>` : ""}</span></label>`;
        }
        if (control.type === "dedicated") {
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span><input type="number" class="input_num" id="${escapeHtml(control.id)}" min="0" step="1" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力"></label>`;
        }
        return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(control.label)}</strong>${control.help ? `<small>${escapeEffectLabel(control.help)}</small>` : ""}</span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-genshin-condition-key="${escapeHtml(control.key)}" data-genshin-condition-kind="${escapeHtml(control.type)}" min="${escapeHtml(control.min)}" max="${escapeHtml(control.max)}" step="${escapeHtml(control.step ?? 1)}" value="${control.value === null ? "" : escapeHtml(control.value)}" placeholder="未入力">${control.unit ? `<em>${escapeHtml(control.unit)}</em>` : ""}</span></label>`;
    }

    const DESCRIPTION_KIND_LABELS = {
        original: "原文",
        originalExcerpt: "原文抜粋",
        full: "TETINETによる説明",
        excerpt: "TETINETによる説明",
        summary: "TETINETによる説明",
        generated: "TETINETによる説明"
    };

    function renderDescriptionBlock(description, descriptionKind = "summary") {
        if (!description) return "";
        const kindLabel = DESCRIPTION_KIND_LABELS[descriptionKind] || DESCRIPTION_KIND_LABELS.summary;
        const heading = ["original", "originalExcerpt"].includes(descriptionKind) ? "効果説明" : "TETINETによる説明";
        return `<div class="genshin-condition-detail-block"><h6>${heading}${heading === "効果説明" ? ` <span class="genshin-description-kind">${escapeHtml(kindLabel)}</span>` : ""}</h6><p>${escapeHtml(description)}</p></div>`;
    }

    // Display evaluation uses the same Runtime operations, never explanation coefficients as applied values.
    function createImpactEvaluation(context, calcData, attackKey = '') {
        const engine = window.GenshinCalcEngine;
        if (!calcData || !engine?.calculateDamageRequest) return null;
        const payload = engine.calculateDamageRequest(context, calcData);
        const evaluationContext = payload.context;
        const collected = engine.collectActiveModifiers(calcData, evaluationContext);
        const stats = engine.buildEffectiveStats(evaluationContext, collected);
        evaluationContext.effectiveStats = stats.effectiveStats;
        evaluationContext.appliedStatModifiers = stats.appliedStatModifiers;
        const selected = payload.results.find(result => result.attackKey === attackKey)
            || payload.results.find(result => result.entry?.damageType !== 'unknown');
        const entry = selected?.entry ? engine.applyModifiersToDamageEntry(selected.entry, evaluationContext, collected).entry : null;
        const baseline = entry ? engine.applyModifiersToDamageEntry(entry, evaluationContext, { applied: [], candidates: [] }).totals : {};
        return { payload, context: evaluationContext, collected, trace: stats.trace, entry, baseline, cache: new Map() };
    }

    function modifierImpactRows(effect, evaluation) {
        const modifier = effect.modifier || {};
        const source = effect.source || '';
        const targetSignature = value => JSON.stringify([value.applyTo || [], value.targetEffect || [], value.targetGroups || []]);
        const signature = targetSignature(modifier);
        const identity = item => item.modifier?.id === modifier.id && item.source === source && targetSignature(item.modifier) === signature;
        const key = source + ':' + modifier.id + ':' + signature;
        if (evaluation?.cache.has(key)) return evaluation.cache.get(key);
        const additive = ['additiveBaseDamage','scalingAdditiveBaseDamage'].includes(modifier.customCalculation || effect.analysis?.calculation) || modifier.category === 'additiveBaseDamage';
        const targets = additive || modifier.category === 'reactionCritBonus' ? [''] : modifier.applyTo?.length ? modifier.applyTo : [''];
        const category = modifier.category;
        const labelFor = target => {
            if (additive) return baseAdditionLabel(modifier);
            if (category === 'reactionCritBonus') return modifier.critMode === 'fixed' ? '反応の会心（固定）' : '反応の会心補正';
            const label = window.GenshinCalcConditions?.targetLabel?.(target) || '補正';
            if (category === 'reactionBaseDamageBonus') return label.replace(/(?:ダメージ)?(?:補正)?$/, '') + '基礎ダメージ';
            if (category === 'resistanceDebuff') return '敵の' + label.replace(/低下$/, '');
            if (category === 'defenseIgnore') return '防御無視';
            if (category === 'defenseDebuff') return '敵の防御力低下';
            if (category === 'effectOverride') return modifier.multiplierTarget === 'talentBaseDamage' ? '天賦基礎ダメージ倍率' : '独立倍率';
            if (category === 'additiveBaseDamage') return label + '・基礎ダメージ加算';
            return label;
        };
        const active = evaluation?.collected.applied.find(identity);
        const partyCandidate = evaluation?.collected.partyCandidates?.find(identity);
        const candidate = evaluation?.collected.candidates.find(identity) || (partyCandidate && { ...partyCandidate, reason: partyCandidate.status === 'off' ? '条件OFF' : partyCandidate.reason });
        const analysis = active?.analysis || candidate?.analysis || effect.analysis;
        const trace = evaluation?.trace.find(item => item.modifierId === modifier.id && item.source === source);
        let unavailable = '';
        if (!evaluation) unavailable = '現在値を算出できません';
        else if (effect.status === 'reflected' || analysis?.inputStatus === 'includedInInput') unavailable = '入力済みステータスに反映済み（個別加算は計算対象外）';
        else if (['unsupported','invalidData','displayOnly'].includes(analysis?.supportStatus) || (!active && effect.status === 'displayOnly')) unavailable = '未対応／計算対象外';
        else if (analysis?.supportStatus === 'missingInput' || (!active && ['missing','missingProviderStats','missingInput'].includes(effect.status))) unavailable = '現在値を算出できません（入力不足）';
        else if (!active && (!candidate || candidate.reason !== '条件OFF')) unavailable = '計算対象外';
        if (!unavailable && category === 'elementOverride') unavailable = active ? '攻撃元素の変化はダメージ一覧で確認' : '条件未成立';
        if (!unavailable && category === 'extraDamage') unavailable = active ? '独立攻撃はダメージ一覧で確認' : '独立攻撃は条件未成立';
        if (!unavailable && analysis?.calculation === 'effectOverride' && modifier.unit === 'percentOfOriginalEffect') unavailable = active ? '対応する効果の補正量に合成済み' : '条件未成立';
        const off = !active && !unavailable;
        const rows = [];
        for (const target of targets) {
            const label = labelFor(target);
            const stat = ['statBonus','statConversion','scalingStatBonus'].includes(analysis?.calculation);
            const multiplier = category === 'effectOverride';
            const percent = !multiplier && (modifier.unit === 'percent' || /Bonus|Debuff|Ignore/.test(category));
            let unit = multiplier ? 'multiplier' : percent ? 'percent' : 'flat';
            if ((stat && (['statConversion','scalingStatBonus'].includes(analysis?.calculation) || modifier.unit === 'percentOfReference')) || ['additiveBaseDamage','scalingAdditiveBaseDamage'].includes(analysis?.calculation)) unit = 'flat';
            const row = { label, unit, value: null, reason: unavailable, state: unavailable ? 'unavailable' : off ? 'conditionOff' : 'active' };
            if (unavailable) { rows.push(row); continue; }
            if (off) { row.value = multiplier ? 1 : 0; row.reason = '条件未成立'; rows.push(row); continue; }
            if (stat && trace) {
                row.value = unit === 'percent' ? Number(active.value) : trace.value;
            } else if (!evaluation.entry || evaluation.entry.damageType === 'unknown') {
                row.reason = '現在値を算出できません'; row.state = 'unavailable'; rows.push(row); continue;
            } else {
                const scoped = { ...active, modifier: { ...active.modifier, ...(target ? { applyTo: [target] } : {}) } };
                const overrides = evaluation.collected.applied.filter(item => item !== active && item.source === source && item.analysis?.calculation === 'effectOverride' && item.modifier.unit === 'percentOfOriginalEffect');
                const result = window.GenshinCalcEngine.applyModifiersToDamageEntry(evaluation.entry, evaluation.context, { applied: [scoped, ...overrides], candidates: [] });
                if (result.totals.pendingReasons.length) {
                    row.reason = '現在値を算出できません（仕様確認が必要）'; row.state = 'unavailable'; rows.push(row); continue;
                }
                if (!result.applied.some(item => item.modifier?.id === modifier.id && item.source === source)) {
                    row.value = multiplier ? 1 : 0; row.reason = '今回の攻撃には非適用'; row.state = 'notApplicable'; rows.push(row); continue;
                }
                const totals = result.totals, baseline = evaluation.baseline;
                let bucket = ({ damageBonus:'damageBonus', reactionBonus:'reactionBonus', reactionBaseDamageBonus:'reactionBaseDamageBonus', resistanceDebuff:'resistanceDebuff', defenseDebuff:'defenseDebuff', defenseIgnore:'defenseIgnore' })[category];
                if (active.analysis?.calculation === 'scalingDamageBonus') bucket = 'damageBonus';
                if (active.analysis?.calculation === 'scalingReactionBonus') bucket = 'reactionBonus';
                if (['additiveBaseDamage','scalingAdditiveBaseDamage'].includes(active.analysis?.calculation)) {
                    row.value = totals.additiveBaseDamage + totals.reactionAdditiveBaseDamage;
                    row.unit = 'flat';
                } else if (category === 'critBonus' || stat) {
                    bucket = /(?:Rate|rate)/.test(target) ? 'critRateBonus' : 'critDamageBonus';
                    row.unit = 'percent'; row.value = totals[bucket] - baseline[bucket];
                } else if (category === 'reactionCritBonus') {
                    if (Number(modifier.critRate)) rows.push({ ...row, label: modifier.critMode === 'fixed' ? '反応の会心率（固定）' : '反応の会心率', unit:modifier.critMode === 'fixed' ? 'fixedPercent' : 'percent', value:totals.reactionCritRate });
                    row.label = modifier.critMode === 'fixed' ? '反応の会心ダメージ（固定）' : '反応の会心ダメージ'; row.unit = modifier.critMode === 'fixed' ? 'fixedPercent' : 'percent'; row.value = totals.reactionCritDamage;
                } else if (multiplier) {
                    row.value = modifier.multiplierTarget === 'talentBaseDamage' ? totals.baseTalentDamageMultiplier : totals.finalDamageMultiplier;
                } else if (bucket) {
                    row.value = totals[bucket] - baseline[bucket];
                } else {
                    row.state = 'unavailable'; row.reason = category === 'extraDamage' ? '独立攻撃はダメージ一覧で確認' : '計算対象外';
                }
            }
            if (row.value !== null && !Number.isFinite(row.value)) { row.value = null; row.state = 'unavailable'; row.reason = '現在値を算出できません'; }
            if (row.value === 0 && !row.reason) row.reason = '計算結果が0';
            if (row.unit === 'multiplier' && row.value === 1 && !row.reason) row.reason = '追加倍率なし';
            rows.push(row);
        }
        evaluation?.cache.set(key, rows);
        return rows;
    }

    function impactRowText(row) {
        if (row.value === null) return row.label + '：' + row.reason;
        const value = Number(Number(row.value).toPrecision(12));
        const sign = /敵の.*(?:耐性|低下)/.test(row.label) ? '-' : '+';
        return row.label + ' ' + (row.unit === 'multiplier' ? '×' + value : row.unit === 'fixedPercent' ? value + '%' : sign + value + (row.unit === 'percent' ? '%' : '')) + (row.reason ? '　' + row.reason : '');
    }
    function renderRuntimeImpact(effect) {
        return (effect.runtimeRows || [{label:effect.displayTarget || '補正',value:null,reason:'現在値を算出できません'}]).map(row => {
            const value = row.value === null ? row.reason : impactRowText({...row,reason:''}).slice(row.label.length).trim();
            return '<li class="genshin-runtime-impact" data-impact-state="' + escapeHtml(row.state || 'unavailable') + '"><span>' + escapeEffectLabel(row.label) + '</span> <strong>' + escapeHtml(value) + '</strong>' + (row.value !== null && row.reason ? '<small>　' + escapeHtml(row.reason) + '</small>' : '') + '</li>';
        }).join('');
    }

    function renderConditionEffect(effect) {
        const status = CONDITION_STATUS[effect.status] || CONDITION_STATUS.auto;
        return '<article class="genshin-condition-effect"><div class="genshin-condition-effect-head"><h5>' + escapeEffectLabel(effect.name) + '</h5><span class="genshin-condition-status ' + status.className + '">' + status.label + '</span></div>'
            + effect.controls.map(renderCardControl).join('') + renderSectionDetail(effect.description,effect.descriptionKind,renderRuntimeImpact(effect)) + '</article>';
    }

    function renderSectionFacts(section) {
        const conditions = [...new Set(section.effects.map(effect => effect.activationCondition).filter(Boolean))];
        return `<dl class="genshin-condition-facts"><div><dt>発動条件</dt><dd>${escapeEffectLabel(conditions.join('／') || '常時')}</dd></div></dl>`;
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

    function renderSectionDetail(description, descriptionKind, impacts, facts = null) {
        const original = descriptionKind === 'original' && description;
        return '<div class="genshin-effect-original"><h6>効果説明</h6>'
            + (original ? '<p class="genshin-original-text">' + escapeHtml(description) + '</p>' : '<p class="genshin-condition-note">原文未取得</p>')
            + '</div>' + (impacts ? '<div class="genshin-effect-values"><h6>計算への反映</h6><ul>' + impacts + '</ul></div>' : '')
            + (facts && typeof facts === 'object' ? '<details class="genshin-condition-detail genshin-value-facts"><summary>詳細</summary><dl>' + Object.entries(facts).map(([label,value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>').join('') + '</dl></details>' : '');
    }

    function renderConstellationImpact(effect) { return renderRuntimeImpact(effect); }

    function renderConstellationSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const controls = renderSectionControls(section, "条件入力");
        const detail = renderSectionDetail(section.description, section.descriptionKind, renderRuntimeImpact({runtimeRows:section.runtimeRows}));
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
        const detail = renderSectionDetail(section.description, section.descriptionKind, renderRuntimeImpact({runtimeRows:section.runtimeRows}));
        return `<article class="genshin-constellation-section genshin-talent-section" data-talent-source="${escapeHtml(section.key)}">
            <header class="genshin-constellation-head">
                <div><strong>${escapeHtml(section.typeLabel)}</strong><h5>${escapeHtml(section.nameJa)}</h5></div>
                <span class="genshin-condition-status ${status.className}">${status.label}</span>
            </header>
            ${renderSectionFacts(section)}
            ${controls}
            ${detail}
            ${renderRelatedEffects(section.relatedEffects)}
        </article>`;
    }

    function renderArtifactImpact(effect) { return renderRuntimeImpact(effect); }

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

    function renderWeaponImpact(effect) { return renderRuntimeImpact(effect); }

    function renderWeaponSection(section) {
        const status = CONDITION_STATUS[section.status] || CONDITION_STATUS.auto;
        const controls = renderSectionControls(section, "発動状態");
        const detail = renderSectionDetail(section.description, section.descriptionKind, section.effects.map(renderWeaponImpact).join(""));
        return `<article class="genshin-constellation-section genshin-weapon-section" data-weapon-effect-group="${escapeHtml(section.id)}">
            <header class="genshin-constellation-head">
                <div><strong>武器効果</strong><h5>${escapeHtml(section.name)}</h5></div>
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
            <label><span>個別の反応ダメージ補正%</span><input id="genshinReactionContributor${slot}ReactionBonus" type="number" step="0.1" value="${escapeHtml(value("reactionBonus"))}" placeholder="0"></label>
            <label><span>個別の基礎ダメージ向上%</span><input id="genshinReactionContributor${slot}BaseBonus" type="number" step="0.1" value="${escapeHtml(value("baseDamageBonus"))}" placeholder="0"></label>
            <label><span>個別の固定加算ダメージ</span><input id="genshinReactionContributor${slot}AdditiveBaseDamage" type="number" step="0.1" value="${escapeHtml(value("additiveBaseDamage"))}" placeholder="0"></label>
        </fieldset>`;
    }

    function renderDedicatedReactionControls(reaction, context) {
        if (reaction.dedicatedKind === "indirectLunar") {
            const contributors = new Map((context.manualInputs?.reactionContributors || []).map((item) => [item.slot, item]));
            const stellarVariant = context.manualInputs?.stellarSwirlVariant || reaction.variantControl?.default || "initialAnemo";
            const stellarOptions = (reaction.variantControl?.options || []).map((option) => {
                const coefficient = reaction.variantCoefficients?.[option.value];
                const suffix = Number.isFinite(Number(coefficient)) ? `（係数${Number(coefficient).toFixed(2)}）` : "";
                return `<option value="${escapeHtml(option.value)}"${stellarVariant === option.value ? " selected" : ""}>${escapeEffectLabel(option.label)}${suffix}</option>`;
            }).join("");
            const stellarVariantControl = reaction.reactionId === "stellarSwirl"
                ? `<label class="genshin-reaction-control"><span>星拡散する元素・段階</span><select id="genshinStellarSwirlVariant">
                    ${stellarOptions}
                </select></label>`
                : "";
            const contributorHelp = reaction.reactionId === "stellarSwirl"
                ? "参加者2～4は、この星拡散へ元素を付着・発動して寄与するキャラクターだけ入力してください。Lvまたは元素熟知を入れると参加扱いになります。"
                : "参加者2～4は、その4秒間に対象元素を付着したキャラクターだけ入力してください。Lvまたは元素熟知を入れると参加扱いになります。";
            const modifierHelp = "参加者2～4の補正欄には、その参加者だけに付く個別分を入力してください。自動取得したチーム共通補正は全参加者へ反映されるため、ここには含めません。会心欄にも自動取得した月反応のチーム共通会心補正を重ねて入力しないでください。";
            const harmonyHelp = reaction.reactionId === "lunarCrystallize"
                ? "月籠諧奏は3回目の月結晶で発生し、3個の月籠が各1回攻撃します。主結果は月籠1個の1ヒットです。同じ対象へ3個とも命中した場合だけ、3ヒット参考合計を併記します。"
                : "";
            return `<div class="genshin-reaction-dedicated">
                ${stellarVariantControl}
                <p><strong>参加者1：</strong>現在のキャラクター（Lv・元素熟知・会心は上の計算入力欄を自動使用）</p>
                <p>${escapeHtml(contributorHelp)}</p>
                <p>${escapeHtml(modifierHelp)}</p>
                ${harmonyHelp ? `<p>${escapeHtml(harmonyHelp)}</p>` : ""}
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

    function renderVodyProviderActions(member, context, effects) {
        if (String(member.characterId) !== '10000140') return '';
        const api = window.GenshinPartyModifiers;
        const state = api.vodyProviderActions(context, member);
        const used = state.skill === 'active';
        const support = !used ? 'unused' : ['generated','present','recent'].includes(state.meteor) ? 'stellar' : 'hydroCryo';
        const renderInput = (field, label, options, value) =>
            `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeHtml(label)}</strong></span><select data-genshin-vody-action="${field}" data-genshin-provider-slot="${member.slot}">${options.map(([key, text]) => `<option value="${key}"${value === key ? ' selected' : ''}>${escapeEffectLabel(text)}</option>`).join('')}</select></label>`;
        const mainInputs = [renderInput('support', '支援状態', [['unused','未使用'],['hydroCryo','水・氷支援'],['stellar','星拡散支援']], support)];
        const advanced = [];
        if (used) {
            mainInputs.push(renderInput('recipient', '計算対象の現在位置', api.VODY_ACTION_FIELDS.recipient.options, state.recipient));
            advanced.push(renderInput('skillHit', 'スキル初撃が敵に命中した', api.VODY_ACTION_FIELDS.skillHit.options, state.skillHit));
            advanced.push(renderInput('hornHit', '角笛が敵に命中した', api.VODY_ACTION_FIELDS.hornHit.options, state.hornHit));
            if (String(member.equipment?.weaponId) === '14524' || Number(member.constellation) >= 1) {
                advanced.push(renderInput('heals', '現在有効な回復回数', [['0','0回'],['1','1回'],['2','2回'],['3','3回以上']], state.heals));
            }
            if (String(member.equipment?.weaponId) === '14524' && Number(state.heals) > 0) {
                advanced.push(renderInput('freezeSwirl', '凍結／星拡散後の武器効果', api.VODY_ACTION_FIELDS.freezeSwirl.options, state.freezeSwirl));
            }
            if (Number(member.constellation) >= 4 && Number(state.heals) > 0) {
                const options = api.VODY_ACTION_FIELDS.qualifyingHeals.options.filter(([key]) => Number(key) <= Number(state.heals));
                advanced.push(renderInput('qualifyingHeals', 'HP40%以上のキャラを回復した回数', options, state.qualifyingHeals));
            }
        }
        const advancedOpen = getElement('genshinJsonConditionCards')?.querySelector?.(`[data-vody-advanced="${member.slot}"]`)?.open;
        const advancedSection = advanced.length ? `<details class="genshin-condition-detail" data-vody-advanced="${member.slot}"${advancedOpen ? ' open' : ''}><summary>詳細設定${[state.skillHit, state.hornHit].filter(value => value !== "yes").length ? `　${[state.skillHit, state.hornHit].filter(value => value !== "yes").length}項目変更中` : ""}</summary><p>敵に対して使用する通常の状況では命中を「はい」にします。外した場合などに変更してください。</p>${advanced.join('')}</details>` : '';
        return '<div class="genshin-provider-actions">' + mainInputs.join('')
            + advancedSection + '</div>';
    }
    function isVodyDerivedCandidate(candidate) {
        return String(candidate.member?.characterId)==='10000140' && (String(candidate.modifier?.conditionGroupId||'').startsWith('vodyanitsa_') || candidate.modifier?.conditionGroupId==='provisional71_w14524_mead_state');
    }

    function renderPartyConditionControl(candidate, context) {
        const conditionInput = candidate.modifier?.conditionInput;
        const key = candidate.partyConditionStateKey || candidate.analysis?.conditionStateKey || candidate.key || "";
        if (!conditionInput || !key) return "";
        const conditionState = context.uiState?.conditionByModifier?.[key]
            || context.uiState?.complexConditionByModifier?.[key]
            || {};
        if (["stack", "targetCount"].includes(conditionInput.type)) {
            const min = Number.isFinite(Number(conditionInput.min)) ? Number(conditionInput.min) : Number(candidate.modifier?.stack?.min) || 0;
            const max = Number.isFinite(Number(conditionInput.max)) ? Number(conditionInput.max) : Number(candidate.modifier?.stack?.max);
            const step = Number.isFinite(Number(conditionInput.step)) ? Number(conditionInput.step) : 1;
            const value = Number.isFinite(Number(conditionState[conditionInput.type])) ? Number(conditionState[conditionInput.type]) : "";
            return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(conditionInput.label || "現在値")}</strong>${conditionInput.help ? `<small>${escapeEffectLabel(conditionInput.help)}</small>` : ""}</span><input type="number" data-genshin-party-condition-key="${escapeHtml(key)}" data-genshin-party-condition-kind="${escapeHtml(conditionInput.type)}" min="${escapeHtml(min)}"${Number.isFinite(max) ? ` max="${escapeHtml(max)}"` : ""} step="${escapeHtml(step)}" value="${escapeHtml(value)}"></label>`;
        }
        if (conditionInput.type !== "option" || !Array.isArray(conditionInput.options) || !conditionInput.options.length) return "";
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
        const renderedOptions = options.map((option) => `<option value="${escapeHtml(option.value)}"${String(option.value) === String(selectedValue) ? " selected" : ""}>${escapeEffectLabel(option.label)}</option>`).join("");
        return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${escapeEffectLabel(conditionInput.label || "現在の状態")}</strong>${conditionInput.help ? `<small>${escapeEffectLabel(conditionInput.help)}</small>` : ""}</span><select data-genshin-party-condition-key="${escapeHtml(key)}" data-genshin-party-condition-kind="option">${placeholder}${renderedOptions}</select></label>`;
    }

    function partyEffectMeaning(candidate, context, calcData) {
        const modifier = candidate.modifier;
        const provider = candidate.member?.nameJa || calcData.characters?.[candidate.member?.characterId]?.nameJa || "チーム";
        const recipient = calcData.characters?.[context.characterId]?.nameJa || "現在のキャラクター";
        const entries = Object.entries(calcData.talentScalings?.[candidate.member?.characterId] || {})
            .flatMap(([group, value]) => (value.entries || []).map((entry) => ({ ...entry, group })));
        const effects = [].concat(modifier.targetEffect || []).map(String);
        const groups = [].concat(modifier.targetGroups || []).map(String);
        const bonusGroups = { skillDamageBonus: "skill", burstDamageBonus: "burst", normalDamageBonus: "normalAttack" };
        const limitedGroups = (modifier.applyTo || []).map((target) => bonusGroups[target]).filter(Boolean);
        const attackNames = entries.filter((entry) => effects.includes(String(entry.effectId || entry.id))
            && (!limitedGroups.length || limitedGroups.includes(entry.group))
            && (!groups.length || groups.includes(entry.group) || groups.includes(entry.attackType))).map((entry) => entry.label).filter(Boolean);
        const target = ["resistanceDebuff", "defenseDebuff"].includes(modifier.category) ? "敵"
            : attackNames.length ? `${provider}の対象攻撃`
                : candidate.targetOwner === "self" ? provider
                    : candidate.targetOwner === "otherPartyMembers" ? `${provider}以外のチームメンバー（現在：${recipient}）`
                        : candidate.targetOwner === "team" ? `チーム全員（現在：${recipient}）`
                            : candidate.targetOwner === "activeCharacter" ? `フィールド上のキャラクター（現在：${recipient}）`
                                : candidate.targetLabel || "対象の確認が必要";
        const attacks = attackNames.length ? [...new Set(attackNames)].join("・")
            : (modifier.applyTo || []).map(target => window.GenshinCalcConditions?.targetLabel?.(target)).filter(Boolean).join("・") || "対象ダメージ";
        return { provider, target, attacks };
    }

    function baseAdditionLabel(modifier) {
        if (modifier.reactionTargetsOnly || (modifier.applyTo || []).some(target => /stellarSwirl/.test(target))) return '星拡散基礎ダメージ加算';
        const elements = (modifier.targetElements || []).join('・');
        return (elements ? elements + '元素攻撃の' : '') + '基礎ダメージ加算';
    }

    // Definitions describe only real modifier outputs. Values come from accepted Runtime items,
    // not from summing previously rendered rows or interpreting attack target lists as bonuses.
    function providerBucketDefinitions(effect) {
        const modifier = effect.modifier || {}, calculation = effect.analysis?.calculation || modifier.customCalculation;
        const targets = modifier.applyTo || [];
        const label = target => window.GenshinCalcConditions.targetLabel(target) || '補正';
        if (['additiveBaseDamage','scalingAdditiveBaseDamage'].includes(calculation) || modifier.category === 'additiveBaseDamage') {
            const bucket = modifier.reactionTargetsOnly ? 'reactionAdditiveBaseDamage' : 'additiveBaseDamage';
            return [{key:bucket + ':' + baseAdditionLabel(modifier),bucket,label:baseAdditionLabel(modifier),unit:'flat'}];
        }
        if (['statBonus','statConversion','scalingStatBonus'].includes(calculation)) {
            return targets.map(target => {
                const percent = calculation === 'statBonus' && modifier.unit === 'percent' && /Percent$/.test(target);
                const stat = target.replace(/(?:Percent|Flat)$/, '');
                const crit = stat === 'critRate' || stat === 'critDamage';
                return {key:'stat:' + stat + ':' + (percent ? 'percent' : 'flat'),bucket:crit ? stat + 'Bonus' : 'stat',stat,target,label:stat === 'hp' ? 'HP上限' : label(target),unit:crit || percent ? 'percent' : 'flat',statPercent:percent};
            });
        }
        if (modifier.category === 'reactionCritBonus') return [{key:'reactionCritRate:'+ (modifier.critMode || 'bonus'),bucket:'reactionCritRate',label:modifier.critMode === 'fixed'?'反応の会心率（固定）':'反応の会心率',unit:modifier.critMode === 'fixed'?'fixedPercent':'percent'}, {key:'reactionCritDamage:'+ (modifier.critMode || 'bonus'),bucket:'reactionCritDamage',label:modifier.critMode === 'fixed'?'反応の会心ダメージ（固定）':'反応の会心ダメージ',unit:modifier.critMode === 'fixed'?'fixedPercent':'percent'}].filter(row=>row.bucket === 'reactionCritDamage' || Number(modifier.critRate));
        const bucket = ({damageBonus:'damageBonus',reactionBonus:'reactionBonus',reactionBaseDamageBonus:'reactionBaseDamageBonus',resistanceDebuff:'resistanceDebuff',defenseDebuff:'defenseDebuff',defenseIgnore:'defenseIgnore',critBonus:targets.some(target=>/Rate/.test(target))?'critRateBonus':'critDamageBonus',effectOverride:modifier.multiplierTarget === 'talentBaseDamage'?'baseTalentDamageMultiplier':'finalDamageMultiplier'})[modifier.category]
            || (calculation === 'scalingDamageBonus' ? 'damageBonus' : calculation === 'scalingReactionBonus' ? 'reactionBonus' : '');
        if (!bucket || (calculation === 'effectOverride' && modifier.unit === 'percentOfOriginalEffect')) return [];
        const multiplier = bucket.endsWith('Multiplier');
        if (modifier.category === 'resistanceDebuff') return targets.map(target=>({key:bucket+':'+target,bucket,target,label:'敵の'+label(target).replace(/低下$/,''),unit:'percent'}));
        const bucketLabel = modifier.reactionTargetsOnly && bucket === 'finalDamageMultiplier' ? '星反応ダメージ向上（独立倍率）' : {defenseDebuff:'敵の防御力低下',defenseIgnore:'防御無視',critRateBonus:'会心率',critDamageBonus:'会心ダメージ',baseTalentDamageMultiplier:'天賦基礎ダメージ倍率',finalDamageMultiplier:'独立倍率'}[bucket];
        const targetLabel = targets.map(target => {
            const name = label(target);
            return bucket === 'damageBonus' && /^(通常攻撃|重撃|落下攻撃|元素スキル|元素爆発)$/.test(name) ? name + 'ダメージ' : name;
        }).join('・') || '補正';
        return [{key:bucket + ':' + (bucketLabel ? '' : [...targets].sort().join(',')),bucket,
            label:bucketLabel || (modifier.category === 'reactionBaseDamageBonus' ? targetLabel.replace(/(?:基礎)?(?:ダメージ)?(?:補正)?$/, '')+'基礎ダメージ' : targetLabel),unit:multiplier?'multiplier':'percent'}];
    }

    function providerImpactRows(effects, evaluation) {
        if (!evaluation) return [];
        const groups = new Map(), engine = window.GenshinCalcEngine;
        effects.filter(effect=>!['duplicate','selfOnly'].includes(effect.status)).forEach(effect => {
            providerBucketDefinitions(effect).forEach(definition => {
                if (!groups.has(definition.key)) groups.set(definition.key,{...definition,effects:[]});
                groups.get(definition.key).effects.push(effect);
            });
        });
        const matches = (item,effect) => item.source === effect.source && item.modifier.id === effect.modifier.id;
        const rows = [];
        for (const group of groups.values()) {
            const accepted = evaluation.collected.applied.filter(item=>group.effects.some(effect=>matches(item,effect)));
            const row = {label:group.label,unit:group.unit,value:null,reason:'',state:'active'};
            if (!accepted.length) {
                const allOff = group.effects.every(effect=>effect.status === 'off');
                const alternate = allOff && group.effects.some(effect=>effect.modifier.conditionGroupId && effects.some(other=>other.modifier.conditionGroupId === effect.modifier.conditionGroupId && other.enabled && other.status === 'ready'));
                row.value = allOff ? (group.unit === 'multiplier'?1:0) : null;
                row.reason = alternate ? '現在は非適用' : allOff ? '条件未成立' : group.effects.some(effect=>['missing','missingProviderStats','missingInput'].includes(effect.status)) ? '現在値を算出できません（入力不足）' : '計算対象外';
                row.state = alternate?'notApplicable':allOff?'conditionOff':'unavailable';rows.push(row);continue;
            }
            if (group.bucket === 'stat') {
                const traced = evaluation.trace.filter(trace=>trace.stat === group.stat && accepted.some(item=>trace.source === item.source && trace.modifierId === item.modifier.id));
                row.value = group.statPercent ? accepted.reduce((total,item)=>total + Number(item.value || 0),0) : traced.reduce((total,trace)=>total + trace.value,0);
                if (!group.statPercent && !traced.length) {row.value=null;row.reason='現在値を算出できません';row.state='unavailable';}
            } else {
                // Accepted provider effects describe availability, not this attack's usage.
                // Resolve amounts with the engine's existing functions and provider context.
                const values = accepted.map(item => {
                    const modifier = item.modifier, calculation = item.analysis?.calculation;
                    const context = item.valueContext || evaluation.context;
                    if (calculation === 'scalingAdditiveBaseDamage') return engine.resolveScalingAdditiveBaseDamage(modifier,context);
                    if (calculation === 'additiveBaseDamage') return modifier.reference ? engine.resolveReferencedValue(modifier,item.value,context) : Number(item.value);
                    if (['scalingDamageBonus','scalingReactionBonus'].includes(calculation)) return engine.resolveScalingDamageBonus(modifier,context);
                    if (['statBonus','statConversion','scalingStatBonus'].includes(calculation)) {
                        const scoped = {...modifier,applyTo:[group.target]};
                        const resolved = calculation === 'statBonus' ? engine.resolveStatBonusValue(scoped,item.value,context) : engine.resolveConversionBonusValue(scoped,item.value,context);
                        return resolved?.value ?? null;
                    }
                    if (modifier.category === 'reactionCritBonus') return group.bucket === 'reactionCritRate' ? Number(modifier.critRate || 0) : Number(modifier.critDamage || item.value || 0);
                    if (group.unit === 'multiplier') {
                        const value = modifier.reference?.includeAppliedStatBonuses ? engine.resolveModifierValue(modifier,context,evaluation.context.uiState,item.analysis) : item.value;
                        return Number(value ?? window.GenshinModifierAnalyzer.effectOverrideValue(modifier)) / 100;
                    }
                    let value = Number(item.value || 0);
                    if (modifier.category === 'damageBonus') {
                        value *= evaluation.collected.applied.filter(override => override.source === item.source && override.analysis?.calculation === 'effectOverride' && window.GenshinModifierAnalyzer.effectOverrideKind(override.modifier) === 'effectValueMultiplier')
                            .reduce((factor,override) => factor * (1 + Number(window.GenshinModifierAnalyzer.effectOverrideValue(override.modifier)) / 100),1);
                    }
                    return ['resistanceDebuff','defenseDebuff','defenseIgnore'].includes(group.bucket) ? Math.abs(value) : value;
                });
                row.value = values.some(value => value === null || !Number.isFinite(value)) ? null
                    : group.unit === 'multiplier' ? values.reduce((factor,value)=>factor*value,1) : values.reduce((total,value)=>total+value,0);
                if (row.value === null) {row.reason='現在値を算出できません';row.state='unavailable';}
            }
            if (row.value === 0 && !row.reason) row.reason='計算結果が0';
            if (row.value !== null && !Number.isFinite(row.value)) {row.value=null;row.reason='現在値を算出できません';row.state='unavailable';}
            rows.push(row);
        }
        // Unavailable/independent attack modifiers stay distinguishable from valid zero values.
        effects.filter(effect=>!providerBucketDefinitions(effect).length && !['duplicate','selfOnly'].includes(effect.status)).forEach(effect=> {
            (effect.runtimeRows || []).forEach(row=> {if (row.value === null) rows.push(row);});
        });
        return rows.filter(row => row.state === "active" && Number.isFinite(row.value)
            && row.value !== 0 && !(row.unit === "multiplier" && row.value === 1));
    }

    function renderProviderImpact(effects, context, evaluation) {
        const rows = providerImpactRows(effects,evaluation);
        return '<section class="genshin-provider-impact"><h5>計算への反映</h5><ul>' + (rows.length ? renderRuntimeImpact({runtimeRows:rows}) : '<li class="genshin-condition-note">現在の計算対象へ提供する補正はありません。</li>') + '</ul></section>';
    }

    function partyEffectDescription(candidate, calcData) {
        const parts = String(candidate.sourceId).split(':');
        return window.GenshinIdResolver?.describeEffect?.({data:calcData, kind:candidate.sourceKind,
            id:candidate.sourceKind === 'weapon' ? candidate.sourceId : candidate.sourceKind === 'artifact' ? parts[1] : candidate.member?.characterId,
            sourceId:candidate.sourceId, pieceCount:parts[0], refinement:candidate.providerContext?.refinement || 1});
    }

    function partyEffectGroups(effects) {
        const groups = new Map();
        effects.forEach(candidate => {
            const key = candidate.sourceKind + ':' + candidate.sourceId;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(candidate);
        });
        return [...groups.values()];
    }

    function renderRelatedEffects(effects) {
        return (effects || []).filter(effect => effect.originalText && effect.descriptionKind === 'original' && !effect.originalFromParent && !['B','C'].includes(effect.classification)).map(effect => '<section class="genshin-related-effect"><h6><span class="genshin-effect-type">関連効果</span> ' + escapeHtml(effect.nameJa) + '</h6>'
            + (effect.originalText ? renderSectionDetail(effect.originalText,effect.descriptionKind || 'missing','') : '<p class="genshin-condition-note">原文未取得</p>') + renderRelatedEffects(effect.relatedEffects) + '</section>').join('');
    }

    function renderPartyEffectGroup(effects, context, calcData, evaluation) {
        const candidate = effects[0], kind = candidate.sourceKind;
        const description = partyEffectDescription(candidate, calcData);
        const relatedEffects = description?.relatedEffects || [];
        const constellationId = String(candidate.sourceId).replace(/^C/i, '');
        const constellationRecord = calcData.characterConstellations?.[candidate.member?.characterId];
        const constellations = constellationRecord?.constellations || constellationRecord;
        const parts = String(candidate.sourceId).split(':');
        const talent = kind === 'talent' ? window.GenshinCalcConditions?.talentSourceMeta?.('talent:' + candidate.sourceId, candidate.providerContext, calcData, candidate.modifier) : null;
        const title = kind === 'weapon' ? calcData.weaponEffects?.[candidate.sourceId]?.effectNameJa || calcData.weapons?.[candidate.sourceId]?.nameJa
            : kind === 'artifact' ? (calcData.artifactSets?.[parts[1]]?.nameJa || candidate.sourceName) + ' ' + parts[0] + 'セット効果'
                : kind === 'talent' ? talent?.nameJa
                    : kind === 'constellation' ? constellations?.[constellationId]?.nameJa : candidate.sourceName;
        const typeLabel = kind === 'talent' ? talent?.typeLabel : kind === 'constellation' ? '命ノ星座 C' + constellationId : kind === 'weapon' ? '武器効果' : kind === 'artifact' ? '聖遺物' + parts[0] + 'セット' : 'チーム効果';
        const status = effects.some(item => item.enabled && item.status === 'ready') ? {label:'発動中',className:'is-auto'}
            : effects.every(item => item.status === 'off') ? {label:'条件未成立',className:'is-inactive'} : partyModifierStatus(candidate);
        const meaning = partyEffectMeaning(candidate, context, calcData);
        const recipients = [...new Set(effects.map(item => partyEffectMeaning(item,context,calcData).target))];
        const facts = {};
        // Facts are useful as details only when native trace links operands to a result.
        for (const item of evaluation?.collected.applied || []) {
            if (!effects.some(effect => effect.source === item.source && effect.modifier.id === item.modifier.id)) continue;
            const trace = evaluation.trace.find(trace => trace.source === item.source && trace.modifierId === item.modifier.id);
            if (!trace) continue;
            const referenceStat = trace.referenceStat || item.modifier.reference?.stat;
            const referenceValue = trace.referenceValue ?? item.valueContext?.stats?.[referenceStat];
            const coefficient = trace.coefficient ?? (item.modifier.unit === 'percentOfReference' ? Number(item.value) / 100 : null);
            if (!Number.isFinite(referenceValue) || !Number.isFinite(coefficient)) continue;
            const display = value => Number(value).toLocaleString('ja-JP',{maximumFractionDigits:6});
            facts['算出過程'] = statLabel(referenceStat) + ' ' + display(referenceValue) + ' × ' + display(coefficient) + ' → ' + statLabel(trace.stat) + ' +' + display(trace.value);
            if (Number.isFinite(Number(trace.maxValue))) facts['上限'] = display(trace.maxValue);
        }
        return '<article class="genshin-condition-effect genshin-party-effect" data-party-buff="' + escapeHtml(candidate.key) + '">'
            + '<div class="genshin-condition-effect-head"><h5>' + '<span class="genshin-effect-type">' + escapeHtml(typeLabel) + '</span> ' + escapeEffectLabel(title || candidate.sourceName) + '</h5><span class="genshin-condition-status ' + status.className + '">' + status.label + '</span></div>'
            + '<p class="genshin-party-target">提供者：' + escapeHtml(meaning.provider) + ' ／ 受け手：' + escapeHtml(recipients.join('・')) + '</p>'
            + renderSectionDetail(description?.originalText || '',description?.descriptionKind || 'summary','',Object.keys(facts).length ? facts : null) + renderRelatedEffects(relatedEffects) + '</article>';
    }

    function renderPartyCurrentControls(effects, context) {
        const seen = new Set();
        return effects.map(candidate => {
            if (isVodyDerivedCandidate(candidate) || (candidate.automatic && !candidate.modifier?.conditionInput)) return '';
            const key = candidate.partyConditionStateKey || candidate.toggleKey || candidate.key;
            if (seen.has(key)) return ''; seen.add(key);
            const control = renderPartyConditionControl(candidate,context);
            const toggle = candidate.showToggle !== false && ['ready','off'].includes(candidate.status)
                ? '<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>' + escapeEffectLabel(candidate.modifier?.conditionLabel || candidate.sourceName) + '</strong><small>効果が発動中の場合にON</small></span><input type="checkbox" data-genshin-party-buff-key="' + escapeHtml(candidate.toggleKey || candidate.key) + '"' + (candidate.enabled ? ' checked' : '') + '></label>' : '';
            return control || toggle ? '<div class="genshin-party-state-control">' + control + toggle + '</div>' : '';
        }).join('');
    }

    function renderPartyPanel(partyModifiers, context, calcData, providerEvaluation) {
        const members = (context.party?.members || []).filter(member => member.slot > 1 && member.enabled);
        const memberKey = member => String(member.slot) + ':' + member.characterId;
        if (!members.some(member => memberKey(member) === selectedPartyMember)) selectedPartyMember = members.length ? memberKey(members[0]) : '';
        const memberName = member => member.nameJa || calcData.characters?.[member.characterId]?.nameJa || 'メンバー' + member.slot;
        const navigation = members.map(member => '<button type="button" class="genshin-party-member-tab" role="tab" id="genshin-party-member-tab-' + member.slot + '" aria-controls="genshin-party-member-panel-' + member.slot + '" data-party-member-tab="' + escapeHtml(memberKey(member)) + '" aria-selected="' + (memberKey(member) === selectedPartyMember) + '" tabindex="' + (memberKey(member) === selectedPartyMember ? '0' : '-1') + '"><strong>' + escapeHtml(memberName(member)) + '</strong><span>Lv.' + escapeHtml(member.level) + ' / C' + escapeHtml(member.constellation) + '</span><small data-party-member-status="' + member.slot + '"></small></button>').join('');
        const panels = members.map(member => {
            const effects = partyModifiers.filter(candidate => candidate.sourceKind !== 'resonance' && candidate.member.slot === member.slot);
            const sources = [{kind:'character',label:'キャラクター'}, {kind:'weapon',label:'武器'}, {kind:'artifact',label:'聖遺物'}].map(source => {
                const groups = partyEffectGroups(effects.filter(candidate => source.kind === 'character' ? ['talent','constellation'].includes(candidate.sourceKind) : candidate.sourceKind === source.kind));
                return groups.length ? '<section class="genshin-party-source-group" data-party-effect-source="' + source.kind + '"><h6>' + source.label + '</h6>' + groups.map(group => renderPartyEffectGroup(group,context,calcData,providerEvaluation)).join('') + '</section>' : '';
            }).join('');
            const actions = renderVodyProviderActions(member,context,effects);
            const controls = renderPartyCurrentControls(effects,context);
            return '<section class="genshin-condition-card genshin-party-condition-card" role="tabpanel" id="genshin-party-member-panel-' + member.slot + '" aria-labelledby="genshin-party-member-tab-' + member.slot + '" data-party-slot="' + member.slot + '" data-party-member-panel="' + escapeHtml(memberKey(member)) + '"' + (memberKey(member) === selectedPartyMember ? '' : ' hidden') + '>'
                + '<header><div><h4>' + escapeHtml(memberName(member)) + '</h4><p>Lv.' + escapeHtml(member.level) + ' / C' + escapeHtml(member.constellation) + '</p></div></header>'
                + '<section class="genshin-party-current-state"><h5>現在の状態</h5>' + actions + controls + (!actions && !controls ? '<p class="genshin-condition-note">追加の手動条件はありません。</p>' : '') + '</section>'
                + renderProviderImpact(effects, context, providerEvaluation)
                + '<section class="genshin-party-effect-list"><h5>効果説明</h5>' + (sources || '<p class="genshin-condition-note">現在の計算対象へ提供する効果はありません。</p>') + '</section></section>';
        }).join('');
        const resonance = partyModifiers.filter(candidate => candidate.sourceKind === 'resonance');
        return '<p class="genshin-party-target">計算対象：' + escapeHtml(calcData.characters?.[context.characterId]?.nameJa || '現在のキャラクター') + '</p>' + (members.length ? '<div class="genshin-party-layout"><nav class="genshin-party-member-list" role="tablist" aria-label="効果を確認するメンバー">' + navigation + '</nav><div class="genshin-party-member-content">' + panels + '</div></div>' : '<p class="genshin-condition-note">パーティ設定でサポートメンバーを選択してください。</p>')
            + (resonance.length ? '<section class="genshin-party-resonance"><h5>チームの元素共鳴</h5>' + partyEffectGroups(resonance).map(group => renderPartyEffectGroup(group,context,calcData,providerEvaluation)).join('') + '</section>' : '');
    }

    function selectPartyMember(key) {
        selectedPartyMember = key;
        document.querySelectorAll('[data-party-member-panel]').forEach(panel => { panel.hidden = panel.dataset.partyMemberPanel !== key; });
        document.querySelectorAll('[data-party-member-tab]').forEach(button => {
            const selected = button.dataset.partyMemberTab === key;
            button.setAttribute('aria-selected',String(selected));button.tabIndex = selected ? 0 : -1;
        });
    }

    function inputSettingCounts(scope) {
        const inputs = scope.querySelectorAll('[data-genshin-condition-key], [data-genshin-toggle-key], [data-genshin-resource-key], [data-genshin-party-condition-key], [data-genshin-party-buff-key], [data-genshin-vody-action]');
        const missing = [...inputs].filter(input => input.type !== 'checkbox' && (input.value === '' || input.validity?.valid === false)).length;
        return {total:inputs.length,missing};
    }

    function refreshConditionSettingLabels(wrap) {
        wrap.querySelectorAll('[data-party-member-panel]').forEach(panel => {
            const counts = inputSettingCounts(panel.querySelector('.genshin-party-current-state'));
            const label = wrap.querySelector('[data-party-member-status="' + panel.dataset.partySlot + '"]');
            if (label) label.textContent = counts.missing ? '要設定' + counts.missing : '設定済み';
        });
        document.querySelectorAll('[data-condition-tab]').forEach(button => {
            const panel = wrap.querySelector('[data-condition-panel="' + button.dataset.conditionTab + '"]');
            if (!panel) return;
            const counts = inputSettingCounts(panel), name = CONDITION_TABS.find(tab => tab.id === button.dataset.conditionTab)?.label || '';
            button.textContent = name + (counts.missing ? '（要設定' + counts.missing + '）' : counts.total ? '（設定済み' + counts.total + '）' : '');
        });
    }

    function renderConditionCards(panelState, context, calcData) {
        const wrap = getElement("genshinJsonConditionCards");
        if (!wrap) return;
        const cards = panelState.cards || [];
        const selectedKey = document.querySelector?.('[data-result-detail-toggle][aria-expanded="true"]')?.closest?.('[data-attack-key]')?.dataset.attackKey || '';
        const evaluation = createImpactEvaluation(context, calcData, selectedKey);
        cards.flatMap(card => [...(card.effects || []), ...(card.sections || []).flatMap(section => section.effects || [])]).forEach(effect => { effect.runtimeRows = modifierImpactRows(effect, evaluation); });
        const seenRelatedOriginals = new Set();
        (cards.find(card => card.id === 'talent')?.sections || []).forEach(section => {
            section.relatedEffects = (section.relatedEffects || []).filter(effect => {
                const key = effect.linkedTooltipId || effect.nameJa + ':' + effect.originalText;
                if (seenRelatedOriginals.has(key)) return false;
                seenRelatedOriginals.add(key);
                return true;
            });
        });
        cards.filter(card => ['talent','constellation'].includes(card.id)).flatMap(card => card.sections || []).forEach(section => {
            section.runtimeRows = providerImpactRows(section.effects, evaluation);
            section.effects.filter(effect => effect.modifier?.category === 'extraDamage').forEach(effect => {
                if (evaluation?.collected.applied.some(item => item.modifier.id === effect.modifier.id && item.source === effect.source)) {
                    section.runtimeRows.push({label:effect.modifier.effectLabel || effect.modifier.label || '独立追加攻撃',value:null,reason:'独立攻撃（ダメージ一覧に表示）'});
                }
            });
        });
        (panelState.partyModifiers || []).forEach(candidate => { candidate.runtimeRows = modifierImpactRows(candidate, evaluation); });
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
        const reaction = { ...(context.reactionOption || { reactionId: "none", enabled: false, baseMultiplier: 1 }), label: reactionLabel(context.reactionOption) };
        const reactionDescription = reaction.family === "none"
            ? "反応なしを選択中です。元素反応ダメージは計算しません。"
            : reaction.calculationStatus === "dedicatedFormulaRequired"
                ? `${reaction.descriptionJa || reaction.label}${reaction.unsupportedReasonJa ? ` ${reaction.unsupportedReasonJa}` : ""} 現在の結果には反映されません。`
                : reaction.descriptionJa || (reaction.enabled ? "選択した元素反応を計算へ反映します。" : "この反応自体は数値ダメージを発生させません。");
        const reactionElementControl = reaction.reactionId === "swirl"
            ? `<label class="genshin-reaction-control"><span>拡散する元素</span><select id="genshinJsonReactionElement">${["炎", "水", "雷", "氷"].map((element) => `<option value="${element}"${context.reactionElement === element ? " selected" : ""}>${element}元素</option>`).join("")}</select></label>`
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
            party: renderPartyPanel(partyModifiers, context, calcData || panelState.displayData || {}, evaluation),
            weapon: `<section class="genshin-condition-card${weaponWide ? " is-wide" : ""}" data-condition-card="weapon">
                ${renderSourceHeader("武器補正", "WEAPON", weaponCard?.subtitle || "")}
                ${context.weaponId === "11435" ? `<p class="genshin-condition-note">中間距離の対応式は仕様確認中のため、現在は最小/最大状態のみ選択可能です。</p>` : ""}
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
        const manualCounts = {
            artifact: artifactSections.reduce((sum,section)=>sum+section.controls.length,0),
            weapon: weaponSections.reduce((sum,section)=>sum+section.controls.length,0),
            talent: [...talentSections,...constellationSections].reduce((sum,section)=>sum+section.controls.length,0),
            party: partyModifiers.filter(candidate => !candidate.automatic && ((candidate.showConditionControl !== false && candidate.modifier?.conditionInput) || (candidate.showToggle !== false && ['ready','off'].includes(candidate.status)))).length
                + (context.party?.members || []).filter(member => member.enabled !== false && String(member.characterId) === '10000140').length,
            other: flatCards.reduce((sum,card)=>sum+card.effects.reduce((count,effect)=>count+(effect.controls?.length||0),0),0)
        };
        if (!conditionTabChosen) activeConditionTab = ['artifact','weapon','talent','party'].find(key=>manualCounts[key]>0) || 'reaction';
        const attackNote = evaluation?.entry ? `<p class="genshin-condition-note">表示対象：${escapeHtml(evaluation.entry.label || "選択中の攻撃")}。結果の攻撃詳細を選ぶと、その攻撃への適用を表示します。</p>` : "";
        wrap.innerHTML = CONDITION_TABS.map((tab) => `<div class="genshin-condition-tab-panel" id="genshin-condition-panel-${tab.id}" role="tabpanel" aria-labelledby="genshin-condition-tab-${tab.id}" data-condition-panel="${tab.id}"${tab.id === activeConditionTab ? "" : " hidden"}>${tab.id === "party" ? "" : attackNote}${panels[tab.id]}</div>`).join("");
        const tabs = getElement("genshinConditionTabs");
        if (tabs) {
            tabs.innerHTML = CONDITION_TABS.map((tab) => `<button type="button" class="genshin-condition-tab${tab.id === activeConditionTab ? " is-active" : ""}" id="genshin-condition-tab-${tab.id}" role="tab" aria-selected="${tab.id === activeConditionTab}" tabindex="${tab.id === activeConditionTab ? "0" : "-1"}" aria-controls="genshin-condition-panel-${tab.id}" data-condition-tab="${tab.id}">${escapeHtml(tab.label)}${manualCounts[tab.id] ? `（条件${manualCounts[tab.id]}）` : ""}</button>`).join("");
        }
        if (wrap.querySelectorAll) refreshConditionSettingLabels(wrap);
    }

    function selectConditionTab(tabId) {
        if (!CONDITION_TABS.some((tab) => tab.id === tabId)) return;
        activeConditionTab = tabId;
        conditionTabChosen = true;
        document.querySelectorAll("[data-condition-tab]").forEach((button) => {
            const selected = button.dataset.conditionTab === tabId;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-selected", String(selected));
            button.setAttribute("tabindex", selected ? "0" : "-1");
        });
        document.querySelectorAll("[data-condition-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.conditionPanel !== tabId;
        });
    }

    async function handlePrepareConditionsClick() {
        if (window.GenshinCurrentCalcState?.isApplying()) return;
        const calcData = await window.GenshinCalcData.loadGenshinCalcData();
        const context = window.GenshinCalcEngine.buildCharacterCalcContext();
        window.GenshinCalcEngine.hydrateReactionContext(context, calcData);
        const panelState = window.GenshinCalcConditions.conditionPanelState(context, calcData);
        renderConditionCards(panelState, context, calcData);

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

    async function handleJsonCalcClick(event) {
        const buttons = getCalcButtons();
        buttons.forEach((button) => { button.disabled = true; });
        try {
            for (const kind of ["Normal", "Skill", "Burst"]) {
                const field = getElement(`genshin${kind}TalentLevel`);
                if (field && (!field.value || !Number.isInteger(Number(field.value)) || Number(field.value) < 1 || Number(field.value) > 15)) {
                    field.focus?.();
                    throw new Error("天賦Lvを取得できませんでした。手動で設定してください（Lv1～15）。");
                }
            }
            await handlePrepareConditionsClick();
            const payload = await window.GenshinCalcEngine.runGenshinJsonCalc();
            window.GenshinCalculationComparison?.store?.record?.(payload.snapshot);
            renderWarnings(payload.warnings);
            renderDamageTabs(payload);
            setCalculationDirty(false);
            scrollToCalcResults();
            window.GenshinCurrentCalcState?.persist();
            return payload;
        } catch (error) {
            console.error("[genshin-json-calc] failed", error);
            renderWarnings([{ message: `ダメージ計算に失敗しました: ${error.message}` }]);
            if (event?.throwOnError) throw error;
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
            conditionCards.addEventListener('input', () => refreshConditionSettingLabels(conditionCards));
            conditionCards.addEventListener('click',event => {
                const button = event.target.closest?.('[data-party-member-tab]');
                if (button) selectPartyMember(button.dataset.partyMemberTab);
            });
            conditionCards.addEventListener('keydown',event => {
                const button = event.target.closest?.('[data-party-member-tab]');
                if (!button || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
                event.preventDefault();
                const buttons = [...conditionCards.querySelectorAll('[data-party-member-tab]')], index = buttons.indexOf(button);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowRight','ArrowDown'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
                selectPartyMember(buttons[next].dataset.partyMemberTab);buttons[next].focus();
            });
            conditionCards.addEventListener("change", (event) => {
                if (event.target?.matches?.("[data-genshin-vody-action]")) {
                    const request = window.GenshinCalcEngine.buildCalculationRequestFromForm();
                    const member = request.party?.members?.find(item=>Number(item.slot)===Number(event.target.dataset.genshinProviderSlot));
                    if (member) {
                        const api = window.GenshinPartyModifiers, state = api.vodyProviderActions(request,member);
                        const field = event.target.dataset.genshinVodyAction;
                        if (field === 'support') {
                            const used = event.target.value !== 'unused';
                            if (used && state.skill !== 'active') {
                                state.skillHit = 'yes'; state.hornHit = 'yes';
                            }
                            state.skill = used ? 'active' : 'inactive';
                            state.meteor = event.target.value === 'stellar' ? 'generated' : 'none';
                            if (!used) { state.heals = '0'; state.qualifyingHeals = '0'; }
                        } else if (field === 'phase') {
                            const used = event.target.value !== 'unused';
                            // Normal combat defaults apply on entering the used state; retain later exceptions.
                            if (used && state.skill !== 'active') {
                                state.skillHit = 'yes';
                                state.hornHit = 'yes';
                            }
                            state.skill = used ? 'active' : 'inactive';
                            state.heals = used ? event.target.value : '0';
                            state.qualifyingHeals = String(Math.min(Number(state.qualifyingHeals), Number(state.heals)));
                        } else {
                            state[field] = event.target.value;
                        }
                        state.qualifyingHeals = String(Math.min(Number(state.qualifyingHeals), Number(state.heals)));
                        for (const [field,value] of Object.entries(state)) window.GenshinPartyState.setPartyConditionState(api.vodyActionKey(member,field),'option',value);
                    }
                    handleConditionValueChange(); return;
                }
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
        getElement("genshinConditionTabs")?.addEventListener("keydown", (event) => {
            const button = event.target.closest?.("[data-condition-tab]");
            if (!button || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = CONDITION_TABS.findIndex((tab) => tab.id === button.dataset.conditionTab);
            const next = event.key === "Home" ? 0 : event.key === "End" ? CONDITION_TABS.length - 1
                : (index + (event.key === "ArrowRight" ? 1 : -1) + CONDITION_TABS.length) % CONDITION_TABS.length;
            selectConditionTab(CONDITION_TABS[next].id);
            getElement(`genshin-condition-tab-${CONDITION_TABS[next].id}`)?.focus();
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
        prepareConditions: handlePrepareConditionsClick,
        calculate: handleJsonCalcClick,
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
        createImpactEvaluation, modifierImpactRows, providerImpactRows, impactRowText,
        renderWarnings,
        scrollToCalcResults
    };
})();
