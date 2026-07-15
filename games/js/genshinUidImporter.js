(function () {
    "use strict";

    const TEXT = {
        required: "UIDを入力してください",
        numbersOnly: "UIDは数字のみで入力してください",
        tooShort: "UIDが短すぎます",
        loading: "取得中...",
        search: "UID検索",
        notFound: "UIDが間違っているか、キャラクター詳細が公開されていません",
        network: "通信に失敗しました",
        noCharacters: "公開キャラクターが設定されていません",
        fetched: "公開プロフィールを取得しました。数値ステータスを入力欄へ反映できます。",
        appliedSuffix: "の情報を入力欄へ反映しました。必要に応じて手動で修正できます。"
    };

    const state = {
        profile: null,
        selectedCharacter: null
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

    function validateUid(uid) {
        if (!uid) return TEXT.required;
        if (!/^\d+$/.test(uid)) return TEXT.numbersOnly;
        if (uid.length < 8) return TEXT.tooShort;
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

    function renderStatItem(label, value, formatter) {
        return `<div><dt>${escapeHtml(label)}</dt><dd>${formatter(value)}</dd></div>`;
    }

    function formatElementDamageLabel(character) {
        const element = character?.element;
        return element && element !== "未対応" && element !== "-" ? `${element}元素ダメージ` : "元素ダメージ";
    }

    function renderElementDamageStatItem(character) {
        const details = character?.stats?.elementalDamageDetails || [];
        const label = formatElementDamageLabel(character);
        const value = character?.stats?.elementalDamage;
        if (!details.length) return renderStatItem(label, value, (statValue) => formatDecimal(statValue, 2, "%"));
        return `
            <div class="genshin-element-damage-stat">
                <details>
                    <summary>
                        <span>${escapeHtml(label)}</span>
                        <strong>${formatDecimal(value, 2, "%")}</strong>
                    </summary>
                    <dl class="character-build-grid genshin-element-damage-list">
                        ${details.map((item) => renderStatItem(item.label, item.value, (statValue) => formatDecimal(statValue, 2, "%"))).join("")}
                    </dl>
                </details>
            </div>
        `;
    }

    function renderCharacterDetail(character) {
        const detail = getElement("genshinCharacterDetail");
        if (!detail) return;
        state.selectedCharacter = character;

        const weapon = character.weapon || null;
        const weaponName = safeName(weapon, "武器");
        const artifactSummary = summarizeArtifactSets(character.artifacts || []);
        const artifactSetType = summarizeArtifactSetType(character.artifacts || []);
        const constellation = `C${toNumber(character.constellation)}`;
        const talents = character.talents || { normal: 1, skill: 1, burst: 1 };

        detail.hidden = false;
        detail.innerHTML = `
            <div class="genshin-profile-detail-card">
                <div class="genshin-profile-detail-main">
                    <div>
                        <h4>${escapeHtml(character.name || unsupported("キャラクター", character.id))} <span>Lv.${character.level || "-"}</span></h4>
                        <div class="genshin-profile-tags">
                            <span>${escapeHtml(character.element || "未対応")}</span>
                            <span>${escapeHtml(character.weaponType || "武器種未対応")}</span>
                            <span>★${character.rarity || "-"}</span>
                            <span>${constellation}</span>
                        </div>
                    </div>
                </div>

                <div class="genshin-profile-summary-grid">
                    <details class="genshin-profile-accordion">
                        <summary class="genshin-profile-row-summary">
                            <strong>${escapeHtml(weaponName)}</strong>
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
        input.value = mode === "integer" ? String(Math.round(num)) : String(Math.round(num * 100) / 100);
        input.dispatchEvent(new Event("input", { bubbles: true }));
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
        const weapon = character.weapon || {};
        const talents = character.talents || {};
        const weaponName = safeName(weapon, "武器");
        const constellation = `C${toNumber(character.constellation)}`;

        updateWeaponOption(weaponName);
        setInputValue("genshinCalcCharacterId", character.id || "10000037", "text");
        setInputValue("genshinCalcWeaponId", weapon.id || "15502", "text");
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
        setInputValue("genshinHpInput", character.stats.hp, "integer");
        setInputValue("genshinAtkInput", character.stats.atk, "integer");
        setInputValue("genshinDefInput", character.stats.def, "integer");
        setInputValue("genshinElementalMasteryInput", character.stats.elementalMastery, "integer");
        setInputValue("genshinCritRateInput", character.stats.critRate);
        setInputValue("genshinCritDamageInput", character.stats.critDamage);
        setInputValue("genshinEnergyRechargeInput", character.stats.energyRecharge);
        setInputValue("genshinElementalDamageInput", character.stats.elementalDamage);


        state.selectedCharacter = character;
        setMessage(`${character.name || unsupported("キャラクター", character.id)} ${TEXT.appliedSuffix}`, "success");
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
            setMessage(TEXT.fetched, "success");
        } catch (error) {
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
        if (!input || !button || !select) return;

        input.addEventListener("input", () => {
            input.value = input.value.replace(/\D/g, "");
        });
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") handleSearch();
        });
        button.addEventListener("click", handleSearch);
        select.addEventListener("change", () => selectCharacter(Number(select.value)));

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
