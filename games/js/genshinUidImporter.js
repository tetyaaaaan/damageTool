(function () {
    "use strict";

    const TEXT = {
        required: "UIDを入力してください",
        numbersOnly: "UIDは数字のみで入力してください",
        tooShort: "UIDが短すぎます",
        tooLong: "UIDが長すぎます",
        loading: "取得中...",
        search: "UID検索",
        notFound: "UIDが間違っているか、キャラクター詳細が公開されていません",
        network: "通信に失敗しました",
        noCharacters: "公開キャラクターが設定されていません",
        fetched: "公開プロフィールを取得しました。数値ステータスを入力欄へ反映できます。",
        appliedSuffix: "の情報を入力欄へ反映しました。必要に応じて手動で修正できます。",
        talentOrderUnresolved: "このキャラクターの天賦ID対応データがないためLv1として表示します。反映後に手動で確認してください。",
        savedUidRemoved: "このブラウザに保存したUIDを削除しました。"
    };

    const state = {
        profile: null,
        selectedCharacter: null,
        applyingPreciseStats: false
    };

    const ELEMENT_ICON_NAMES = {
        "炎": "pyro",
        "水": "hydro",
        "風": "anemo",
        "雷": "electro",
        "草": "dendro",
        "氷": "cryo",
        "岩": "geo"
    };

    const WEAPON_ICON_NAMES = {
        "片手剣": "sword",
        "両手剣": "claymore",
        "長柄武器": "polearm",
        "弓": "bow",
        "法器": "catalyst"
    };

    const STAT_ICON_PATHS = {
        "HP": "/games/images/genshin/ui/stat-hp.webp",
        "攻撃力": "/games/images/genshin/ui/stat-attack.webp",
        "防御力": "/games/images/genshin/ui/stat-defense.webp",
        "元素熟知": "/games/images/genshin/ui/stat-elemental-mastery.webp",
        "会心率": "/games/images/genshin/ui/stat-critical.webp",
        "会心ダメージ": "/games/images/genshin/ui/stat-critical.webp",
        "元素チャージ効率": "/games/images/genshin/ui/stat-energy-recharge.webp"
    };

    function getElement(id) {
        return document.getElementById(id);
    }

    function setMessage(message, type) {
        const messageEl = getElement("genshinUidMessage");
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.dataset.type = type || "";
    }

    function talentMappingWarning(character) {
        return character?.provenance?.talentLevelMapping?.status === "unresolved"
            ? TEXT.talentOrderUnresolved
            : "";
    }

    function validateUid(uid) {
        if (!uid) return TEXT.required;
        if (!/^\d+$/.test(uid)) return TEXT.numbersOnly;
        if (uid.length < 8) return TEXT.tooShort;
        if (uid.length > 10) return TEXT.tooLong;
        return "";
    }

    function setLoading(isLoading) {
        const button = getElement("genshinUidSearchButton");
        if (!button) return;
        button.disabled = isLoading;
        button.textContent = isLoading ? TEXT.loading : TEXT.search;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function toNumber(value, fallback = 0) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function formatInteger(value) {
        const num = Number(value);
        return Number.isFinite(num) ? Math.round(num).toLocaleString("ja-JP") : "-";
    }

    function formatDecimal(value, digits = 2, suffix = "") {
        const num = Number(value);
        return Number.isFinite(num) ? `${num.toFixed(digits)}${suffix}` : "-";
    }

    function unsupported(type, id) {
        return `未対応${type}（ID: ${id || "-"}）`;
    }

    function safeName(item, type) {
        if (!item) return "-";
        if (item.name && !/^名称不明/.test(item.name)) return item.name;
        return unsupported(type, item.id);
    }

    function normalizeRefinementRank(rank) {
        const num = Number(rank);
        if (Number.isFinite(num) && num >= 1 && num <= 5) return String(Math.round(num));
        return "1";
    }

    function formatEffectParam(value) {
        if (Array.isArray(value)) return value.join("/");
        return String(value ?? "");
    }

    function buildEffectText(template, params) {
        if (!template || !params) return "";
        return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
            if (!Object.prototype.hasOwnProperty.call(params, key)) return match;
            return formatEffectParam(params[key]);
        });
    }

    function renderWeaponEffectText(weapon) {
        if (!weapon?.id) return "武器効果データは未対応です";
        const effect = window.GenshinIdResolver?.resolveWeaponEffect?.(weapon.id);
        if (!effect) {
            console.warn(`[genshin-weapon-effects] 未登録武器ID: ${weapon.id}`);
            return "武器効果データは未対応です";
        }
        const rank = normalizeRefinementRank(weapon.rank);
        const params = effect.effectParamsByRefinement?.[rank] || effect.effectParamsByRefinement?.["1"];
        const text = buildEffectText(effect.effectTextTemplate, params);
        return text || "武器効果データは未対応です";
    }

    function getArtifactSetName(id, fallback = "") {
        const entry = window.GenshinIdResolver?.resolveArtifactSet?.(id);
        return entry?.nameJa || entry?.name || fallback || unsupported("聖遺物セット", id);
    }

    function fillArtifactSetSelect(select) {
        if (!select) return;
        select.innerHTML = '<option value="">未選択</option>';
        const sets = window.GenshinIdResolver?.listArtifactSets?.() || [];
        sets
            .slice()
            .sort((a, b) => String(a.nameJa || a.name || "").localeCompare(String(b.nameJa || b.name || ""), "ja"))
            .forEach((set) => {
                const option = document.createElement("option");
                option.value = String(set.id);
                option.textContent = set.nameJa || set.name || unsupported("聖遺物セット", set.id);
                select.appendChild(option);
            });
    }

    function populateArtifactSetOptions() {
        fillArtifactSetSelect(getElement("genshinArtifactSetOne"));
        fillArtifactSetSelect(getElement("genshinArtifactSetTwo"));
        updateArtifactSetModeVisibility();
    }

    function ensureArtifactSetOption(selectId, id, name) {
        const select = getElement(selectId);
        if (!select || !id) return;
        const value = String(id);
        if (![...select.options].some((option) => option.value === value)) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = name || unsupported("聖遺物セット", id);
            select.appendChild(option);
        }
    }

    function setArtifactSetSelectValue(selectId, id, name) {
        if (!id) return;
        ensureArtifactSetOption(selectId, id, name);
        setSelectValue(selectId, id);
    }

    function updateArtifactSetModeVisibility() {
        const mode = getElement("genshinArtifactSetMode")?.value || "";
        const oneField = getElement("genshinArtifactSetOneField");
        const twoField = getElement("genshinArtifactSetTwoField");
        if (oneField) oneField.hidden = !mode;
        if (twoField) twoField.hidden = mode !== "2pc2pc";
    }

    function getArtifactSetCounts(artifacts) {
        const counts = new Map();
        (artifacts || []).forEach((artifact) => {
            const id = artifact.setId || artifact.setName || artifact.name || "";
            if (!id) return;
            if (!counts.has(id)) {
                counts.set(id, {
                    id,
                    name: getArtifactSetName(artifact.setId, artifact.setName || artifact.name),
                    count: 0
                });
            }
            counts.get(id).count += 1;
        });
        return [...counts.values()].sort((a, b) => b.count - a.count);
    }

    function applyArtifactSetsToForm(artifacts) {
        const sets = getArtifactSetCounts(artifacts);
        const fourSet = sets.find((set) => set.count >= 4);
        const twoSets = sets.filter((set) => set.count >= 2);

        if (fourSet) {
            setSelectValue("genshinArtifactSetMode", "4pc");
            setArtifactSetSelectValue("genshinArtifactSetOne", fourSet.id, fourSet.name);
            setSelectValue("genshinArtifactSetTwo", "");
        } else if (twoSets.length >= 2) {
            setSelectValue("genshinArtifactSetMode", "2pc2pc");
            setArtifactSetSelectValue("genshinArtifactSetOne", twoSets[0].id, twoSets[0].name);
            setArtifactSetSelectValue("genshinArtifactSetTwo", twoSets[1].id, twoSets[1].name);
        } else {
            setSelectValue("genshinArtifactSetMode", "");
            setSelectValue("genshinArtifactSetOne", "");
            setSelectValue("genshinArtifactSetTwo", "");
        }
        updateArtifactSetModeVisibility();
    }

    function renderPlayer(profile) {
        const playerEl = getElement("genshinPlayerInfo");
        if (!playerEl) return;
        const resultEl = getElement("genshinUidResult");
        if (resultEl) resultEl.hidden = false;
        playerEl.hidden = false;
        playerEl.innerHTML = `
            <div class="genshin-player-strip">
                <span><strong>${escapeHtml(profile.player.nickname)}</strong></span>
                <span>冒険ランク ${profile.player.level || "-"}</span>
                <span>世界ランク ${profile.player.worldLevel || "-"}</span>
                <span>UID: ${escapeHtml(profile.player.uid || "-")}</span>
            </div>
        `;
    }

    function renderSelector(characters) {
        const wrap = getElement("genshinCharacterSelector");
        const select = getElement("genshinProfileCharacterSelect");
        if (!wrap || !select) return;
        select.innerHTML = "";
        characters.forEach((character, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = `${character.name || unsupported("キャラクター", character.id)} Lv.${character.level || "-"}`;
            select.appendChild(option);
        });
        wrap.hidden = characters.length === 0;
    }

    function clearCharacterDetail() {
        const detail = getElement("genshinCharacterDetail");
        if (!detail) return;
        detail.hidden = true;
        detail.innerHTML = "";
    }

    function clearProfileResult() {
        state.profile = null;
        state.selectedCharacter = null;
        const result = getElement("genshinUidResult");
        const player = getElement("genshinPlayerInfo");
        const selector = getElement("genshinCharacterSelector");
        if (result) result.hidden = true;
        if (player) {
            player.hidden = true;
            player.innerHTML = "";
        }
        if (selector) selector.hidden = true;
        clearCharacterDetail();
    }

    function summarizeArtifactSets(artifacts) {
        const counts = new Map();
        artifacts.forEach((artifact) => {
            const name = artifact.setName || artifact.name || unsupported("聖遺物", artifact.id);
            counts.set(name, (counts.get(name) || 0) + 1);
        });
        const parts = Array.from(counts.entries())
            .filter(([, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => `${name} ${Math.min(count, 4)}セット`);
        return parts.length ? parts.join(" + ") : "セット効果なし / 未対応";
    }

    function summarizeArtifactSetType(artifacts) {
        const counts = new Map();
        artifacts.forEach((artifact) => {
            const name = artifact.setName || artifact.name || unsupported("聖遺物", artifact.id);
            counts.set(name, (counts.get(name) || 0) + 1);
        });
        const activeCounts = Array.from(counts.values()).filter((count) => count >= 2).sort((a, b) => b - a);
        if (activeCounts[0] >= 4) return "4セット";
        if (activeCounts.length >= 2) return "2+2セット";
        if (activeCounts[0] >= 2) return "2セット";
        return "未発動";
    }

    function renderArtifactEffects(artifacts) {
        const counts = new Map();
        artifacts.forEach((artifact) => {
            const id = artifact.setId || artifact.setName || artifact.name || "";
            if (!id) return;
            if (!counts.has(id)) {
                counts.set(id, {
                    id,
                    name: getArtifactSetName(artifact.setId, artifact.setName || artifact.name),
                    count: 0
                });
            }
            const entry = counts.get(id);
            entry.count += 1;
        });
        const activeSets = Array.from(counts.values()).filter((entry) => entry.count >= 2);
        if (!activeSets.length) return "<p>発動中の聖遺物セット効果はありません。</p>";
        return activeSets.map((entry) => {
            const effect = window.GenshinIdResolver?.resolveArtifactSetEffect?.(entry.id);
            if (!effect) {
                console.warn(`[genshin-artifact-set-effects] 未登録聖遺物セットID: ${entry.id}`);
                return `<div><strong>${escapeHtml(entry.name)} ${Math.min(entry.count, 4)}セット</strong><p>聖遺物効果データは未対応です</p></div>`;
            }
            const lines = [];
            if (effect.twoPieceEffect) {
                lines.push(`<p><strong>2セット効果:</strong><br>${escapeHtml(effect.twoPieceEffect)}</p>`);
            }
            if (entry.count >= 4 && effect.fourPieceEffect) {
                lines.push(`<p><strong>4セット効果:</strong><br>${escapeHtml(effect.fourPieceEffect)}</p>`);
            }
            return `<div><strong>${escapeHtml(entry.name)}</strong>${lines.join("") || "<p>聖遺物効果データは未対応です</p>"}</div>`;
        }).join("");
    }

    function renderConstellationEffects(character) {
        const constellationLevel = toNumber(character?.constellation);
        if (constellationLevel <= 0) return "<p>命ノ星座は未解放です。</p>";

        const data = window.GenshinIdResolver?.resolveCharacterConstellation?.(character.id);
        if (!data?.constellations) {
            console.warn(`[genshin-character-constellations] 未登録キャラクターID: ${character.id}`);
            return "<p>命ノ星座効果データは未対応です</p>";
        }

        const entries = [];
        for (let level = 1; level <= Math.min(constellationLevel, 6); level += 1) {
            const constellation = data.constellations[String(level)];
            if (!constellation) continue;
            entries.push(`
                <div>
                    <strong>C${level}：${escapeHtml(constellation.nameJa || "名称未対応")}</strong>
                    <p>${escapeHtml(constellation.effectText || "命ノ星座効果データは未対応です")}</p>
                </div>
            `);
        }

        return entries.join("") || "<p>命ノ星座効果データは未対応です</p>";
    }

    function renderStatItem(label, value, formatter, iconPath = STAT_ICON_PATHS[label], shortLabel = "") {
        const iconClass = iconPath?.includes("/elements/")
            ? "genshin-profile-stat-icon genshin-profile-stat-icon--element"
            : "genshin-profile-stat-icon";
        const icon = iconPath
            ? `<img class="${iconClass}" src="${escapeHtml(iconPath)}" alt="" width="14" height="14">`
            : "";
        const labelText = shortLabel
            ? `<span class="genshin-uid-label-full">${escapeHtml(label)}</span><span class="genshin-uid-label-short" aria-hidden="true">${escapeHtml(shortLabel)}</span>`
            : escapeHtml(label);
        const ariaLabel = shortLabel ? ` aria-label="${escapeHtml(label)}"` : "";
        return `<div><dt${ariaLabel}>${icon}${labelText}</dt><dd>${formatter(value)}</dd></div>`;
    }

    function formatElementDamageLabel(character) {
        const element = character?.element;
        return element && element !== "未対応" && element !== "-" ? `${element}元素ダメージ` : "元素ダメージ";
    }

    function renderElementDamageStatItem(character) {
        const details = character?.stats?.elementalDamageDetails || [];
        const label = formatElementDamageLabel(character);
        const value = character?.stats?.elementalDamage;
        const elementIcon = ELEMENT_ICON_NAMES[character?.element]
            ? `/games/images/genshin/elements/${ELEMENT_ICON_NAMES[character.element]}.webp`
            : "";
        if (!details.length) return renderStatItem(label, value, (statValue) => formatDecimal(statValue, 2, "%"), elementIcon);
        return `
            <div class="genshin-element-damage-stat">
                <details>
                    <summary>
                        <span>${elementIcon ? `<img class="genshin-profile-stat-icon genshin-profile-stat-icon--element" src="${escapeHtml(elementIcon)}" alt="" width="14" height="14">` : ""}${escapeHtml(label)}</span>
                        <strong>${formatDecimal(value, 2, "%")}</strong>
                    </summary>
                    <dl class="character-build-grid genshin-element-damage-list">
                        ${details.map((item) => renderStatItem(item.label, item.value, (statValue) => formatDecimal(statValue, 2, "%"))).join("")}
                    </dl>
                </details>
            </div>
        `;
    }

    function renderUidArtifactRows(artifacts) {
        const sets = new Map();
        (artifacts || []).forEach((artifact) => {
            const key = String(artifact.setId || artifact.setName || artifact.name || artifact.id || "");
            if (!key) return;
            if (!sets.has(key)) sets.set(key, { name: artifact.setName || artifact.name || "聖遺物セット", count: 0, imageId: artifact.setId || artifact.id });
            sets.get(key).count += 1;
        });
        return [...sets.values()].filter((set) => set.count >= 2).sort((a, b) => b.count - a.count).map((set) => {
            const image = set.imageId ? `/games/images/genshin/artifacts/${encodeURIComponent(set.imageId)}.webp` : "/games/images/genshin/fallback.webp";
            return `<div class="genshin-uid-summary-row genshin-uid-artifact-row"><img class="genshin-uid-summary-image genshin-uid-artifact-image" src="${escapeHtml(image)}" alt=""><div class="genshin-uid-summary-copy"><strong>${escapeHtml(set.name)}</strong><span>${Math.min(set.count, 4)}セット</span></div></div>`;
        }).join("") || `<div class="genshin-uid-summary-row genshin-uid-artifact-row"><img class="genshin-uid-summary-image genshin-uid-artifact-image" src="/games/images/genshin/fallback.webp" alt=""><div class="genshin-uid-summary-copy"><strong>聖遺物セット未取得</strong></div></div>`;
    }

      function renderUidElementStats(character, includeAll = false) {
          const details = character?.stats?.elementalDamageDetails || [];
          const visible = includeAll ? details : details.filter((item) => item.element === character?.element);
          return visible.map((item) => {
              const elementKey = item.element || String(item.label || "").replace(/元素ダメージ$/, "");
              const iconName = ELEMENT_ICON_NAMES[elementKey];
              const iconPath = iconName ? `/games/images/genshin/elements/${iconName}.webp` : "";
              return renderStatItem(item.label, item.value, (value) => formatDecimal(value, 2, "%"), iconPath);
          }).join("");
      }

    function renderUidSummary(character) {
        const weapon = character.weapon || null;
        const characterImage = `/games/images/genshin/characters/${encodeURIComponent(character.id)}.webp`;
        const weaponImage = weapon?.id ? `/games/images/genshin/weapons/${encodeURIComponent(weapon.id)}.webp` : "/games/images/genshin/fallback.webp";
        const elementIcon = ELEMENT_ICON_NAMES[character.element] ? `/games/images/genshin/elements/${ELEMENT_ICON_NAMES[character.element]}.webp` : "";
        const weaponTypeIcon = WEAPON_ICON_NAMES[character.weaponType] ? `/games/images/genshin/ui/weapon-${WEAPON_ICON_NAMES[character.weaponType]}.webp` : "";
        const talents = character.talents || { normal: 1, skill: 1, burst: 1 };
        const talentWarning = talentMappingWarning(character);
        return `<div class="genshin-uid-profile-summary">
            <div class="genshin-uid-character-row"><img class="genshin-uid-character-image" src="${escapeHtml(characterImage)}" alt="" width="64" height="64"><div class="genshin-uid-character-copy"><strong>${escapeHtml(character.name || unsupported("キャラクター", character.id))} <span class="genshin-uid-level">Lv.${escapeHtml(character.level || "-")}</span></strong><div class="genshin-uid-tags">${elementIcon ? `<span class="genshin-uid-icon-tag genshin-uid-element-tag"><img src="${escapeHtml(elementIcon)}" alt="${escapeHtml(character.element)}"></span>` : ""}${weaponTypeIcon ? `<span class="genshin-uid-icon-tag"><img src="${escapeHtml(weaponTypeIcon)}" alt="${escapeHtml(character.weaponType)}"></span>` : ""}<span class="genshin-uid-badge genshin-uid-rarity">★${escapeHtml(character.rarity || "-")}</span><span class="genshin-uid-badge genshin-uid-constellation">C${toNumber(character.constellation)}</span></div></div><button type="button" class="genshin-uid-details-button" id="genshinUidDetailsOpen">詳細</button></div>
            <div class="genshin-uid-summary-list"><div class="genshin-uid-summary-row"><img class="genshin-uid-summary-image" src="${escapeHtml(weaponImage)}" alt=""><div class="genshin-uid-summary-copy"><strong>${escapeHtml(safeName(weapon, "武器"))}</strong><span>Lv.${escapeHtml(weapon?.level || "-")} / R${escapeHtml(weapon?.rank || 1)}</span></div></div>${renderUidArtifactRows(character.artifacts || [])}</div>
            <div class="genshin-uid-two-col"><section><h5>天賦</h5><dl class="genshin-uid-talent-list">${renderStatItem("通常攻撃", talents.normal, (value) => `Lv.${formatInteger(value)}`, undefined, "通常")}${renderStatItem("元素スキル", talents.skill, (value) => `Lv.${formatInteger(value)}`, undefined, "スキル")}${renderStatItem("元素爆発", talents.burst, (value) => `Lv.${formatInteger(value)}`, undefined, "爆発")}</dl></section><section><h5>ステータス</h5><div class="genshin-uid-summary-stats"><dl class="genshin-uid-stat-list">${renderStatItem("HP", character.stats.hp, formatInteger)}${renderStatItem("攻撃力", character.stats.atk, formatInteger)}${renderStatItem("防御力", character.stats.def, formatInteger)}${renderStatItem("元素熟知", character.stats.elementalMastery, formatInteger)}</dl><dl class="genshin-uid-stat-list">${renderStatItem("会心率", character.stats.critRate, (value) => formatDecimal(value, 2, "%"))}${renderStatItem("会心ダメージ", character.stats.critDamage, (value) => formatDecimal(value, 2, "%"))}${renderStatItem("元素チャージ効率", character.stats.energyRecharge, (value) => formatDecimal(value, 2, "%"))}${renderUidElementStats(character)}</dl></div></section></div>
            <div class="genshin-profile-actions"><button type="button" class="teti-button teti-button-primary" id="genshinApplyProfileButton">この内容を入力欄へ反映</button><span>反映後も手動で編集できます</span></div>
        </div>`.replace(
            '<dl class="genshin-uid-talent-list">',
            `${talentWarning ? `<p class="genshin-uid-talent-warning" role="alert">${escapeHtml(talentWarning)}</p>` : ""}<dl class="genshin-uid-talent-list">`
        );
    }

    function renderUidDetails(character, activeTab = "character") {
        const dialog = getElement("genshinUidDetailsDialog");
        const body = getElement("genshinUidDetailsBody");
        const tabs = getElement("genshinUidDetailsTabs");
        const title = getElement("genshinUidDetailsTitle");
        if (!dialog || !body || !tabs) return;
        const resolver = window.GenshinIdResolver;
        const talents = resolver?.resolveCharacterTalent?.(character.id) || {};
        const constellationData = resolver?.resolveCharacterConstellation?.(character.id)?.constellations || {};
        const weapon = character.weapon || {};
        const tabItems = [{ id: "character", label: "キャラ" }, { id: "equipment", label: "装備" }, { id: "status", label: "ステータス" }];
        tabs.innerHTML = tabItems.map((tab) => `<button type="button" class="genshin-uid-details-tab${tab.id === activeTab ? " is-active" : ""}" data-uid-detail-tab="${tab.id}">${tab.label}</button>`).join("");
        title.textContent = `${character.name || "キャラクター"} Lv.${character.level || "-"}`;
        const normal = talents.normalAttack?.normalDescriptionJa || "";
        const charged = talents.normalAttack?.chargedDescriptionJa || "";
        const plunging = talents.normalAttack?.plungingDescriptionJa || "";
        const talentItems = [
            [talents.normalAttack?.nameJa || "通常攻撃", [normal, charged, plunging].filter(Boolean).join("\n\n")],
            [talents.skill?.nameJa || "元素スキル", talents.skill?.descriptionJa || ""],
            [talents.burst?.nameJa || "元素爆発", talents.burst?.descriptionJa || ""]
        ].map(([name, text]) => `<article class="genshin-uid-detail-item"><h4>${escapeHtml(name)}</h4><p>${escapeHtml(text || "説明データ未登録")}</p></article>`).join("");
        const passiveItems = (talents.passives || []).map((passive) => `<article class="genshin-uid-detail-item"><h4>${escapeHtml(passive.nameJa || "固有天賦")}</h4><p>${escapeHtml(passive.descriptionJa || "説明データ未登録")}</p></article>`).join("");
        const constellationItems = Object.entries(constellationData).map(([level, item]) => `<article class="genshin-uid-detail-item"><h4>C${escapeHtml(level)} ${escapeHtml(item.nameJa || "")}</h4><p>${escapeHtml(item.effectText || "説明データ未登録")}</p></article>`).join("");
        const artifactEffects = getArtifactSetCounts(character.artifacts || []).filter((set) => set.count >= 2).map((set) => `<article class="genshin-uid-detail-item"><h4>${escapeHtml(set.name)} ${Math.min(set.count, 4)}セット</h4><p>${escapeHtml((character.artifacts || []).find((artifact) => artifact.setId === set.id)?.effect || "説明データ未登録")}</p></article>`).join("");
        const sections = {
            character: `<section data-uid-detail-panel="character"><div class="genshin-uid-detail-group"><h3>通常・スキル・爆発</h3>${talentItems}</div><div class="genshin-uid-detail-group"><h3>固有天賦</h3>${passiveItems || "<p>説明データ未登録</p>"}</div><div class="genshin-uid-detail-group"><h3>命ノ星座</h3>${constellationItems || "<p>説明データ未登録</p>"}</div></section>`,
            equipment: `<section data-uid-detail-panel="equipment"><div class="genshin-uid-detail-group"><h3>${escapeHtml(safeName(weapon, "武器"))} Lv.${escapeHtml(weapon.level || "-")} / R${escapeHtml(weapon.rank || 1)}</h3><p>${escapeHtml(renderWeaponEffectText(weapon))}</p></div><div class="genshin-uid-detail-group"><h3>聖遺物</h3><div class="genshin-uid-artifact-effects">${renderArtifactEffects(character.artifacts || []) || "<p>説明データ未登録</p>"}</div></div></section>`,
            status: `<section data-uid-detail-panel="status"><div class="genshin-uid-detail-group"><h3>ステータス</h3><div class="genshin-uid-modal-status-layout"><dl>${renderStatItem("HP", character.stats.hp, formatInteger)}${renderStatItem("攻撃力", character.stats.atk, formatInteger)}${renderStatItem("防御力", character.stats.def, formatInteger)}${renderStatItem("元素熟知", character.stats.elementalMastery, formatInteger)}</dl><dl>${renderStatItem("会心率", character.stats.critRate, (value) => formatDecimal(value, 2, "%"))}${renderStatItem("会心ダメージ", character.stats.critDamage, (value) => formatDecimal(value, 2, "%"))}${renderStatItem("元素チャージ効率", character.stats.energyRecharge, (value) => formatDecimal(value, 2, "%"))}${renderUidElementStats(character, true)}</dl></div></div></section>`
        };
        body.innerHTML = sections[activeTab] || sections.character;
        tabs.querySelectorAll("[data-uid-detail-tab]").forEach((button) => button.addEventListener("click", () => renderUidDetails(character, button.dataset.uidDetailTab)));
        if (!dialog.open) dialog.showModal();
    }

    function renderCharacterDetail(character) {
        const detail = getElement("genshinCharacterDetail");
        if (!detail) return;
        state.selectedCharacter = character;

        detail.hidden = false;
        detail.innerHTML = renderUidSummary(character);
        getElement("genshinApplyProfileButton")?.addEventListener("click", () => applyCharacterToForm(character));
        getElement("genshinUidDetailsOpen")?.addEventListener("click", () => renderUidDetails(character));
        detail.querySelectorAll("img").forEach((image) => image.addEventListener("error", () => {
            if (image.dataset.fallbackApplied === "true") return;
            image.dataset.fallbackApplied = "true";
            image.src = "/games/images/genshin/fallback.webp";
        }));
        return;

        const weapon = character.weapon || null;
        const weaponName = safeName(weapon, "武器");
        const artifactSummary = summarizeArtifactSets(character.artifacts || []);
        const artifactSetType = summarizeArtifactSetType(character.artifacts || []);
        const constellation = `C${toNumber(character.constellation)}`;
        const talents = character.talents || { normal: 1, skill: 1, burst: 1 };
        const characterImage = `/games/images/genshin/characters/${encodeURIComponent(character.id)}.webp`;
        const weaponImage = weapon?.id ? `/games/images/genshin/weapons/${encodeURIComponent(weapon.id)}.webp` : "/games/images/genshin/fallback.webp";
        const elementIcon = ELEMENT_ICON_NAMES[character.element]
            ? `/games/images/genshin/elements/${ELEMENT_ICON_NAMES[character.element]}.webp`
            : "";
        const weaponTypeIcon = WEAPON_ICON_NAMES[character.weaponType]
            ? `/games/images/genshin/ui/weapon-${WEAPON_ICON_NAMES[character.weaponType]}.webp`
            : "";

        detail.hidden = false;
        detail.innerHTML = `
            <div class="genshin-profile-detail-card">
                <div class="genshin-profile-detail-main">
                    <img class="genshin-profile-character-image" src="${escapeHtml(characterImage)}" alt="" width="64" height="64">
                    <div>
                        <h4>${escapeHtml(character.name || unsupported("キャラクター", character.id))} <span>Lv.${character.level || "-"}</span></h4>
                        <div class="genshin-profile-tags">
                            ${elementIcon ? `<span class="genshin-profile-icon-tag genshin-profile-icon-tag--element" aria-label="${escapeHtml(character.element)}元素" title="${escapeHtml(character.element)}元素"><img src="${escapeHtml(elementIcon)}" alt="" width="20" height="20"></span>` : ""}
                            ${weaponTypeIcon ? `<span class="genshin-profile-icon-tag" aria-label="${escapeHtml(character.weaponType)}" title="${escapeHtml(character.weaponType)}"><img src="${escapeHtml(weaponTypeIcon)}" alt="" width="20" height="20"></span>` : ""}
                            <span>★${character.rarity || "-"}</span>
                            <span>${constellation}</span>
                        </div>
                    </div>
                </div>

                <div class="genshin-profile-summary-grid">
                    <details class="genshin-profile-accordion">
                        <summary class="genshin-profile-row-summary">
                            <strong class="genshin-profile-summary-name"><img class="genshin-profile-weapon-image" src="${escapeHtml(weaponImage)}" alt="" width="32" height="32"><span class="genshin-profile-summary-title">${escapeHtml(weaponName)}</span></strong>
                            <span>Lv.${weapon?.level || "-"} / R${weapon?.rank || 1}</span>
                            <em>効果</em>
                        </summary>
                        <p>${escapeHtml(renderWeaponEffectText(weapon))}</p>
                    </details>
                    <details class="genshin-profile-accordion">
                        <summary class="genshin-profile-row-summary">
                            <strong>${escapeHtml(artifactSummary)}</strong>
                            <span>${escapeHtml(artifactSetType)}</span>
                            <em>効果</em>
                        </summary>
                        <div class="genshin-artifact-effects">${renderArtifactEffects(character.artifacts || [])}</div>
                    </details>
                    <details class="genshin-profile-accordion">
                        <summary class="genshin-profile-row-summary">
                            <strong>命ノ星座</strong>
                            <span>${constellation}</span>
                            <em>効果</em>
                        </summary>
                        <div class="genshin-constellation-effects">${renderConstellationEffects(character)}</div>
                    </details>
                </div>

                <div class="genshin-profile-two-col">
                    <section>
                        <h5>天賦</h5>
                        <dl class="character-build-grid genshin-talent-grid">
                            ${renderStatItem("通常攻撃Lv", talents.normal, formatInteger)}
                            ${renderStatItem("元素スキルLv", talents.skill, formatInteger)}
                            ${renderStatItem("元素爆発Lv", talents.burst, formatInteger)}
                        </dl>
                    </section>
                    <section>
                        <h5>ステータス</h5>
                        <dl class="character-build-grid genshin-stat-grid">
                            ${renderStatItem("HP", character.stats.hp, formatInteger)}
                            ${renderStatItem("攻撃力", character.stats.atk, formatInteger)}
                            ${renderStatItem("防御力", character.stats.def, formatInteger)}
                            ${renderStatItem("元素熟知", character.stats.elementalMastery, formatInteger)}
                            ${renderStatItem("会心率", character.stats.critRate, (value) => formatDecimal(value, 2, "%"))}
                            ${renderStatItem("会心ダメージ", character.stats.critDamage, (value) => formatDecimal(value, 2, "%"))}
                            ${renderStatItem("元素チャージ効率", character.stats.energyRecharge, (value) => formatDecimal(value, 2, "%"))}
                            ${renderElementDamageStatItem(character)}
                        </dl>
                    </section>
                </div>

                <div class="genshin-profile-actions">
                    <button type="button" class="teti-button teti-button-primary" id="genshinApplyProfileButton">この内容を入力欄へ反映</button>
                    <span>反映後も手動で編集できます</span>
                </div>
            </div>
        `;

        const applyButton = getElement("genshinApplyProfileButton");
        if (applyButton) applyButton.addEventListener("click", () => applyCharacterToForm(character));
        detail.querySelectorAll(".genshin-profile-character-image, .genshin-profile-weapon-image").forEach((image) => {
            image.addEventListener("error", () => {
                if (image.dataset.fallbackApplied === "true") return;
                image.dataset.fallbackApplied = "true";
                image.src = "/games/images/genshin/fallback.webp";
            });
        });
    }

    function setInputValue(id, value, mode = "decimal") {
        const input = getElement(id);
        if (!input || value === undefined || value === null || value === "") return;
        if (mode === "text") {
            input.value = String(value);
            input.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }
        const num = Number(value);
        if (!Number.isFinite(num)) return;
        if (mode === "preciseInteger" || mode === "preciseDecimal") {
            input.value = mode === "preciseInteger"
                ? String(Math.round(num))
                : String(Math.round(num * 100) / 100);
            input.dataset.preciseValue = String(num);
        } else {
            delete input.dataset.preciseValue;
            input.value = mode === "integer" ? String(Math.round(num)) : String(Math.round(num * 100) / 100);
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
        if (mode === "preciseInteger" || mode === "preciseDecimal") {
            input.dataset.valueOrigin = "uid";
        }
    }

    function setSelectValue(id, value) {
        const select = getElement(id);
        if (!select) return;
        const stringValue = String(value);
        if (![...select.options].some((option) => option.value === stringValue)) {
            const option = document.createElement("option");
            option.value = stringValue;
            option.textContent = stringValue;
            select.appendChild(option);
        }
        select.value = stringValue;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function updateWeaponOption(weaponName) {
        const datalist = getElement("genshinWeaponOptions");
        if (!datalist || !weaponName) return;
        if (![...datalist.options].some((option) => option.value === weaponName)) {
            const option = document.createElement("option");
            option.value = weaponName;
            datalist.appendChild(option);
        }
    }

    function applyCharacterToForm(character) {
        const calculationInput = window.GenshinProfileMapper?.toCalculationInput
            ? window.GenshinProfileMapper.toCalculationInput(character)
            : null;
        const weapon = character.weapon || {};
        const talents = character.talents || {};
        const weaponName = safeName(weapon, "武器");
        const constellation = `C${toNumber(character.constellation)}`;
        const talentWarning = talentMappingWarning(character);

        state.applyingPreciseStats = true;
        try {
            updateWeaponOption(weaponName);
            setInputValue("genshinCalcCharacterId", character.id || "", "text");
            setInputValue("genshinCalcWeaponId", weapon.id || "", "text");
            setInputValue("genshinReflectCharacter", character.name || unsupported("キャラクター", character.id), "text");
            setInputValue("genshinReflectLevel", character.level, "integer");
            setSelectValue("genshinReflectConstellation", constellation);
            setInputValue("genshinWeaponInput", weaponName, "text");
            setInputValue("genshinWeaponLevel", weapon.level, "integer");
            setSelectValue("genshinWeaponRefinement", `R${weapon.rank || 1}`);
            setInputValue("genshinNormalTalentLevel", talents.normal, "integer");
            setInputValue("genshinSkillTalentLevel", talents.skill, "integer");
            setInputValue("genshinBurstTalentLevel", talents.burst, "integer");
            applyArtifactSetsToForm(character.artifacts || []);
            setInputValue("genshinHpInput", character.stats.hp, "preciseInteger");
            setInputValue("genshinBaseHpInput", character.stats.baseHp, "preciseDecimal");
            setInputValue("genshinBaseAtkInput", character.stats.baseAtk, "preciseDecimal");
            setInputValue("genshinAtkInput", character.stats.atk, "preciseInteger");
            setInputValue("genshinDefInput", character.stats.def, "preciseInteger");
            setInputValue("genshinBaseDefInput", character.stats.baseDef, "preciseDecimal");
            setInputValue("genshinElementalMasteryInput", character.stats.elementalMastery, "preciseInteger");
            setInputValue("genshinCritRateInput", character.stats.critRate, "preciseDecimal");
            setInputValue("genshinCritDamageInput", character.stats.critDamage, "preciseDecimal");
            setInputValue("genshinEnergyRechargeInput", character.stats.energyRecharge, "preciseDecimal");
            setInputValue("genshinElementalDamageInput", character.stats.elementalDamage, "preciseDecimal");
        } finally {
            state.applyingPreciseStats = false;
        }


        state.selectedCharacter = character;
        state.selectedCalculationInput = calculationInput;
        if (calculationInput) {
            window.dispatchEvent(new CustomEvent("genshin:calculation-input-selected", {
                detail: { input: calculationInput, profile: state.profile }
            }));
        }
        setMessage(`${character.name || unsupported("キャラクター", character.id)} ${TEXT.appliedSuffix}${talentWarning ? ` ${talentWarning}` : ""}`, talentWarning ? "warning" : "success");
    }

    function selectCharacter(index) {
        if (!state.profile) return;
        const character = state.profile.characters[index];
        if (!character) return;
        renderCharacterDetail(character);
    }

    async function handleSearch() {
        const input = getElement("genshinUidInput");
        if (!input) return;
        const uid = input.value.trim();
        const validationError = validateUid(uid);
        if (validationError) {
            setMessage(validationError, "error");
            return;
        }

        setLoading(true);
        setMessage("", "");
        clearProfileResult();
        try {
            if (window.GenshinIdResolver?.ready) await window.GenshinIdResolver.ready;
            const response = await window.GenshinProfileApi.fetchGenshinProfile(uid);
            const profile = window.GenshinProfileMapper.mapProfileResponse(response);
            state.profile = profile;
            renderPlayer(profile);
            renderSelector(profile.characters);
            if (!profile.characters.length) {
                clearCharacterDetail();
                setMessage(TEXT.noCharacters, "error");
                return;
            }
            selectCharacter(0);
            const saved = window.TetinetUidStorage?.save("genshin", uid);
            const clearButton = getElement("genshinUidClearSavedButton");
            if (saved && clearButton) clearButton.hidden = false;
            setMessage(TEXT.fetched, "success");
        } catch (error) {
            clearProfileResult();
            if (!navigator.onLine || error instanceof TypeError) {
                setMessage(TEXT.network, "error");
            } else {
                setMessage(TEXT.notFound, "error");
            }
        } finally {
            setLoading(false);
        }
    }

    function initializeUidImporter() {
        const input = getElement("genshinUidInput");
        const button = getElement("genshinUidSearchButton");
        const select = getElement("genshinProfileCharacterSelect");
        const clearButton = getElement("genshinUidClearSavedButton");
        if (!input || !button || !select) return;

        const savedUid = window.TetinetUidStorage?.load("genshin") || "";
        if (savedUid) input.value = savedUid;
        if (clearButton) {
            clearButton.hidden = !savedUid;
            clearButton.addEventListener("click", () => {
                window.TetinetUidStorage?.remove("genshin");
                input.value = "";
                clearButton.hidden = true;
                setMessage(TEXT.savedUidRemoved, "success");
                input.focus();
            });
        }

        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "");
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") handleSearch();
        });
        button.addEventListener("click", handleSearch);
        select.addEventListener("change", () => selectCharacter(Number(select.value)));
        getElement("genshinUidDetailsClose")?.addEventListener("click", () => {
            const dialog = getElement("genshinUidDetailsDialog");
            if (dialog?.open) dialog.close();
        });
        getElement("genshinUidDetailsDialog")?.addEventListener("click", (event) => {
            const dialog = getElement("genshinUidDetailsDialog");
            if (event.target === dialog) dialog.close();
        });
        [
            "genshinHpInput",
            "genshinAtkInput",
            "genshinDefInput",
            "genshinElementalMasteryInput",
            "genshinCritRateInput",
            "genshinCritDamageInput",
            "genshinEnergyRechargeInput",
            "genshinElementalDamageInput"
        ].forEach((id) => {
            getElement(id)?.addEventListener("input", (event) => {
                if (!state.applyingPreciseStats) {
                    delete event.currentTarget.dataset.preciseValue;
                    event.currentTarget.dataset.valueOrigin = "manual";
                }
            });
        });

        const artifactSetMode = getElement("genshinArtifactSetMode");
        if (artifactSetMode) artifactSetMode.addEventListener("change", updateArtifactSetModeVisibility);

        if (window.GenshinIdResolver?.ready) {
            window.GenshinIdResolver.ready.then(populateArtifactSetOptions);
        } else {
            populateArtifactSetOptions();
        }
        updateArtifactSetModeVisibility();
    }

    document.addEventListener("DOMContentLoaded", initializeUidImporter);
})();
