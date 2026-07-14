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

    function formatDamageNumber(value) {
        const num = Number(value);
        return Number.isFinite(num) ? Math.floor(num).toLocaleString("ja-JP") : "-";
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
        if (entry.damageType === "skill") return "skill";
        if (entry.damageType === "burst") return "burst";
        if (entry.attackType === "chargedAttack" || entry.damageType === "charged" || entry.damageType === "chargedAttack") return "charged";
        if (entry.attackType === "plungingAttack" || entry.damageType === "plunging") return "plunging";
        if (entry.attackType === "skill") return "skill";
        if (entry.attackType === "burst") return "burst";
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

    function renderScalingParts(parts) {
        const rows = parts || [];
        if (!rows.length) return "-";
        return rows.map((part) => {
            if (part.stat === "fixedDamage") {
                return `固定基礎ダメージ / ${formatNumber(part.baseDamage)}`;
            }
            return `${escapeHtml(part.stat)} / ${formatNumber(part.statValue)} / ${formatDecimal(part.talentMultiplier)}%`;
        }).join("<br>");
    }

    function renderBreakdown(result) {
        const b = result.breakdown;
        const attackMode = result.entry.attackMode;
        const attackModeRow = attackMode
            ? `<div><dt>攻撃モード</dt><dd>${escapeHtml(attackMode.nameJa)}（操作: ${escapeHtml(attackMode.operationType)} / 扱い: ${escapeHtml(attackMode.damageType)}）</dd></div>`
            : "";
        return `
            <details class="genshin-json-breakdown">
                <summary>計算内訳を表示</summary>
                <h5>入力欄から使用した値</h5>
                ${renderInputStats(b.inputStats)}
                <h5>このダメージ項目</h5>
                <dl>
                    ${attackModeRow}
                    <div><dt>攻撃種別</dt><dd>${escapeHtml(result.entry.attackType)}</dd></div>
                    <div><dt>ダメージ種別</dt><dd>${escapeHtml(result.entry.damageType)}</dd></div>
                    <div><dt>元素</dt><dd>${escapeHtml(result.entry.element)}</dd></div>
                    <div><dt>参照ステータス / 倍率</dt><dd>${renderScalingParts(b.scalingParts)}</dd></div>
                    <div><dt>天賦Lv</dt><dd>Lv.${b.talentLevel}</dd></div>
                    <div><dt>ヒット数</dt><dd>${escapeHtml(b.hitCount)}</dd></div>
                    <div><dt>ダメージバフ合計</dt><dd>${formatDecimal(b.damageBonus)}%</dd></div>
                    <div><dt>最終倍率補正</dt><dd>x${formatDecimal(b.finalDamageMultiplier || 1, 4)}</dd></div>
                    <div><dt>会心率 / 会心ダメージ</dt><dd>${formatDecimal(b.critRate)}% / ${formatDecimal(b.critDamage)}%</dd></div>
                    <div><dt>防御補正</dt><dd>${formatDecimal(b.defenseMultiplier, 4)}</dd></div>
                    <div><dt>耐性 / 耐性補正</dt><dd>${formatDecimal(b.resistance)}% / ${formatDecimal(b.resistanceMultiplier, 4)}</dd></div>
                    <div><dt>反応</dt><dd>${escapeHtml(b.reaction.label)} / x${formatDecimal(b.reaction.baseMultiplier || 1)} / 反応補正 ${formatDecimal(b.reactionBonus || 0)}%</dd></div>
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
        const modeName = result.entry.attackMode?.nameJa;
        const resultLabel = modeName ? `${modeName}・${result.entry.label}` : result.entry.label;
        return `
            <article class="genshin-json-result-card">
                <h4>${escapeHtml(resultLabel)}</h4>
                <div class="genshin-json-result-values">
                    <span>非会心<br><strong>${formatDamageNumber(result.nonCrit)}</strong></span>
                    <span>会心<br><strong>${formatDamageNumber(result.crit)}</strong></span>
                    <span>期待値<br><strong>${formatDamageNumber(result.expected)}</strong></span>
                    <span>ヒット合計<br><strong>${formatDamageNumber(result.total.expected)}</strong></span>
                </div>
                ${renderBreakdown(result)}
            </article>
        `;
    }

    function renderTabButtons(grouped, activeTab) {
        return RESULT_TABS.map((tab) => {
            const active = tab.id === activeTab ? " is-active" : "";
            return `<button class="genshin-result-tab${active}" type="button" data-json-tab="${tab.id}">${escapeHtml(tab.label)}</button>`;
        }).join("");
    }

    function resolveDisplayName(map, id, fallbackLabel) {
        if (!id) return "-";
        const item = map?.[String(id)];
        return item?.nameJa || `${fallbackLabel}（ID: ${id}）`;
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
        const activeTab = RESULT_TABS.find((tab) => grouped[tab.id].length)?.id || "normal";
        const inputNotices = payload.inputNotices || [];
        const inputNoticeHtml = inputNotices.length
            ? `<aside class="genshin-json-input-notices"><strong>追加入力待ち</strong><ul>${inputNotices.map((notice) => `<li>${escapeHtml(notice.message)}</li>`).join("")}</ul></aside>`
            : "";
        wrap.innerHTML = `
            <div class="genshin-json-result-head">
                <h3>JSON計算結果</h3>
                <p>計算対象: ${escapeHtml(characterName)} / ${escapeHtml(weaponName)} / 反応 ${escapeHtml(context.reactionOption.label)}</p>
            </div>
            ${inputNoticeHtml}
            <div class="genshin-result-tabs" role="tablist" aria-label="JSON計算タブ">
                ${renderTabButtons(grouped, activeTab)}
            </div>
            ${renderTabSections(grouped, activeTab)}
        `;
        bindTabSwitch(wrap);
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
            ["変化反応", [["overload", "過負荷"], ["electroCharged", "感電"], ["superconduct", "超電導"], ["swirl", "拡散"], ["burning", "燃焼"], ["bloom", "開花"], ["hyperbloom", "超開花"], ["burgeon", "烈開花"], ["crystallize", "結晶"]]],
            ["月反応", [["lunarBloom", "月開花"], ["lunarCharged", "月感電"], ["lunarCrystallize", "月結晶"]]],
            ["その他", [["astralReaction", "星反応（未対応）"]]]
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
            ${controls}
            <div class="genshin-constellation-impacts"><h6>計算への影響</h6><ul>${section.effects.map(renderConstellationImpact).join("")}</ul></div>
            ${originalText}
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
        wrap.innerHTML = `
            <div class="genshin-condition-summary${summaryClass}">
                <strong>現在の計算条件</strong>
                <span>手動設定 ${conditionCount}件 / 未入力 ${missingCount}件</span>
            </div>
            <section class="genshin-condition-card" data-condition-card="reaction">
                <header><div><h4>元素反応</h4><p>${escapeHtml(reaction.label)}</p></div></header>
                <label class="genshin-reaction-control"><span>計算する元素反応</span><select id="genshinJsonReactionOption">${reactionOptions(context.reactionOptionKey || "none")}</select></label>
                <p class="genshin-condition-card-empty">${reaction.enabled ? `基礎反応倍率 ×${escapeHtml(reaction.baseMultiplier)}` : "元素反応による倍率・追加補正は適用されません。"}</p>
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
        const panelState = window.GenshinCalcConditions.conditionPanelState(context, calcData);
        renderConditionCards(panelState, context);

        const help = getElement("genshinJsonConditionHelp");
        if (help) {
            help.textContent = panelState.helpText;
        }
    }

    async function handleJsonCalcClick() {
        const button = getElement("genshinJsonCalcButton");
        if (button) button.disabled = true;
        try {
            await handlePrepareConditionsClick();
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
        renderDamageTabs,
        renderDamageBreakdown: renderBreakdown,
        renderConditionCards
    };
})();
