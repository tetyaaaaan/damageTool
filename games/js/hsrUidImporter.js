(function () {
    "use strict";

    const state = {
        profile: null,
        selectedCharacter: null
    };

    function getElement(id) {
        return document.getElementById(id);
    }

    function setMessage(message, type) {
        const messageEl = getElement("hsrUidMessage");
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.dataset.type = type || "";
    }

    function validateUid(uid) {
        if (!uid) return "UIDを入力してください";
        if (!/^\d+$/.test(uid)) return "UIDは数字のみで入力してください";
        if (uid.length < 8) return "UIDが短すぎます";
        return "";
    }

    function setLoading(isLoading) {
        const button = getElement("hsrUidSearchButton");
        if (!button) return;
        button.disabled = isLoading;
        button.textContent = isLoading ? "取得中..." : "UID検索";
    }

    function renderPlayer(profile) {
        const playerEl = getElement("hsrPlayerInfo");
        if (!playerEl) return;
        playerEl.hidden = false;
        playerEl.innerHTML = `
            <strong>${profile.player.nickname}</strong>
            <span>Lv.${profile.player.level || "-"}</span>
            <span>UID: ${profile.player.uid || "-"}</span>
        `;
    }

    function renderSelector(characters) {
        const wrap = getElement("hsrCharacterSelector");
        const select = getElement("hsrProfileCharacterSelect");
        if (!wrap || !select) return;
        select.innerHTML = "";
        characters.forEach((character, index) => {
            const option = document.createElement("option");
            option.value = String(index);
            option.textContent = `${character.name} Lv.${character.level || "-"}`;
            select.appendChild(option);
        });
        wrap.hidden = characters.length === 0;
    }

    function formatStat(value, suffix = "") {
        if (!Number.isFinite(Number(value))) return "-";
        const num = Number(value);
        const fixed = Math.abs(num) >= 100 ? Math.round(num).toLocaleString("ja-JP") : num.toFixed(1);
        return `${fixed}${suffix}`;
    }

    function renderCharacterDetail(character) {
        const detail = getElement("hsrCharacterDetail");
        if (!detail) return;
        detail.hidden = false;
        const lightCone = character.lightCone ? `${character.lightCone.name} Lv.${character.lightCone.level || "-"}` : "-";
        const relics = character.relics.length ? character.relics.map((relic) => `${relic.name}+${relic.level}`).join(" / ") : "-";
        const traces = character.traces.length ? character.traces.map((trace) => `${trace.name}:${trace.level}`).join(" / ") : "-";
        detail.innerHTML = `
            <h4>${character.name}</h4>
            <dl class="character-build-grid">
                <div><dt>レベル</dt><dd>${character.level || "-"}</dd></div>
                <div><dt>属性</dt><dd>${character.element}</dd></div>
                <div><dt>運命</dt><dd>${character.path}</dd></div>
                <div><dt>星魂</dt><dd>${character.eidolon}</dd></div>
                <div><dt>光円錐</dt><dd>${lightCone}</dd></div>
                <div><dt>HP</dt><dd>${formatStat(character.stats.hp)}</dd></div>
                <div><dt>攻撃力</dt><dd>${formatStat(character.stats.atk)}</dd></div>
                <div><dt>防御力</dt><dd>${formatStat(character.stats.def)}</dd></div>
                <div><dt>速度</dt><dd>${formatStat(character.stats.speed)}</dd></div>
                <div><dt>会心率</dt><dd>${formatStat(character.stats.critRate, "%")}</dd></div>
                <div><dt>会心ダメージ</dt><dd>${formatStat(character.stats.critDamage, "%")}</dd></div>
                <div><dt>撃破特効</dt><dd>${formatStat(character.stats.breakEffect, "%")}</dd></div>
                <div><dt>EP回復効率</dt><dd>${formatStat(character.stats.energyRegen, "%")}</dd></div>
                <div><dt>属性与ダメージ</dt><dd>${formatStat(character.stats.elementalDamage, "%")}</dd></div>
                <div><dt>軌跡レベル</dt><dd>${traces}</dd></div>
                <div><dt>遺物</dt><dd>${relics}</dd></div>
            </dl>
        `;
    }

    function setInputValue(id, value) {
        const input = getElement(id);
        if (!input || !Number.isFinite(Number(value))) return;
        input.value = String(Math.round(Number(value) * 10) / 10);
    }

    function applyCharacterToForm(character) {
        setInputValue("atk", character.stats.atk);
        setInputValue("base_atk", character.stats.atk);
        setInputValue("cri_dmg", character.stats.critDamage);
        setInputValue("dmg_b", character.stats.elementalDamage);
        setInputValue("break_effect", character.stats.breakEffect);
        setInputValue("lv", character.level);
        state.selectedCharacter = character;
        setMessage(`${character.name} のステータスを入力欄へ反映しました。必要に応じて手動で修正できます。`, "success");
    }

    function selectCharacter(index) {
        if (!state.profile) return;
        const character = state.profile.characters[index];
        if (!character) return;
        renderCharacterDetail(character);
        applyCharacterToForm(character);
    }

    async function handleSearch() {
        const input = getElement("hsrUidInput");
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
            const response = await window.HsrProfileApi.fetchHsrProfile(uid);
            const profile = window.HsrProfileMapper.mapProfileResponse(response);
            if (!profile.characters.length) {
                setMessage("UIDが間違っているか、キャラクター詳細が公開されていません", "error");
                return;
            }
            state.profile = profile;
            renderPlayer(profile);
            renderSelector(profile.characters);
            selectCharacter(0);
            const saved = window.TetinetUidStorage?.save("hsr", uid);
            const clearButton = getElement("hsrUidClearSavedButton");
            if (saved && clearButton) clearButton.hidden = false;
            setMessage("公開プロフィールを取得しました", "success");
        } catch (error) {
            const isCorsOrNetworkError = error instanceof TypeError;
            if (!navigator.onLine) {
                setMessage("通信に失敗しました", "error");
            } else if (isCorsOrNetworkError) {
                setMessage("UIDが間違っているか、キャラクター詳細が公開されていない可能性があります。APIの制限により詳細を確認できませんでした。", "error");
            } else {
                setMessage("UIDが間違っているか、キャラクター詳細が公開されていません", "error");
            }
        } finally {
            setLoading(false);
        }
    }

    function initializeUidImporter() {
        const input = getElement("hsrUidInput");
        const button = getElement("hsrUidSearchButton");
        const select = getElement("hsrProfileCharacterSelect");
        const clearButton = getElement("hsrUidClearSavedButton");
        if (!input || !button || !select) return;

        const savedUid = window.TetinetUidStorage?.load("hsr") || "";
        if (savedUid) input.value = savedUid;
        if (clearButton) {
            clearButton.hidden = !savedUid;
            clearButton.addEventListener("click", () => {
                window.TetinetUidStorage?.remove("hsr");
                input.value = "";
                clearButton.hidden = true;
                setMessage("このブラウザに保存したUIDを削除しました。", "success");
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
    }

    document.addEventListener("DOMContentLoaded", initializeUidImporter);
})();
