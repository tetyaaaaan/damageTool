(function () {
    "use strict";

    const TEXT = {
        required: "\u0055\u0049\u0044\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
        numbersOnly: "\u0055\u0049\u0044\u306f\u6570\u5b57\u306e\u307f\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044",
        tooShort: "\u0055\u0049\u0044\u304c\u77ed\u3059\u304e\u307e\u3059",
        loading: "\u53d6\u5f97\u4e2d...",
        search: "\u0055\u0049\u0044\u691c\u7d22",
        notFound: "\u0055\u0049\u0044\u304c\u9593\u9055\u3063\u3066\u3044\u308b\u304b\u3001\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u8a73\u7d30\u304c\u516c\u958b\u3055\u308c\u3066\u3044\u307e\u305b\u3093",
        network: "\u901a\u4fe1\u306b\u5931\u6557\u3057\u307e\u3057\u305f",
        noCharacters: "\u516c\u958b\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093",
        appliedSuffix: "\u306e\u30b9\u30c6\u30fc\u30bf\u30b9\u3092\u5165\u529b\u6b04\u3078\u53cd\u6620\u3057\u307e\u3057\u305f\u3002\u5fc5\u8981\u306b\u5fdc\u3058\u3066\u624b\u52d5\u3067\u4fee\u6b63\u3067\u304d\u307e\u3059\u3002",
        adventureRank: "\u5192\u967a\u30e9\u30f3\u30af",
        worldRank: "\u4e16\u754c\u30e9\u30f3\u30af",
        estimatedElement: "\u63a8\u5b9a\u5c5e\u6027",
        constellation: "\u547d\u30ce\u661f\u5ea7",
        weapon: "\u6b66\u5668",
        weaponId: "\u6b66\u5668ID",
        artifacts: "\u8056\u907a\u7269",
        level: "\u30ec\u30d9\u30eb",
        atk: "\u653b\u6483\u529b",
        def: "\u9632\u5fa1\u529b",
        elementalMastery: "\u5143\u7d20\u719f\u77e5",
        critRate: "\u4f1a\u5fc3\u7387",
        critDamage: "\u4f1a\u5fc3\u30c0\u30e1\u30fc\u30b8",
        energyRecharge: "\u5143\u7d20\u30c1\u30e3\u30fc\u30b8\u52b9\u7387",
        elementalDamage: "\u5c5e\u6027/\u7269\u7406\u30c0\u30e1\u30fc\u30b8"
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

    function renderPlayer(profile) {
        const playerEl = getElement("genshinPlayerInfo");
        if (!playerEl) return;
        playerEl.hidden = false;
        playerEl.innerHTML = `
            <strong>${profile.player.nickname}</strong>
            <span>${TEXT.adventureRank} ${profile.player.level || "-"}</span>
            <span>${TEXT.worldRank} ${profile.player.worldLevel || "-"}</span>
            <span>UID: ${profile.player.uid || "-"}</span>
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
            option.textContent = `${character.name} Lv.${character.level || "-"}`;
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

    function formatStat(value, suffix = "") {
        if (!Number.isFinite(Number(value))) return "-";
        const num = Number(value);
        const fixed = Math.abs(num) >= 100 ? Math.round(num).toLocaleString("ja-JP") : num.toFixed(1);
        return `${fixed}${suffix}`;
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatNamedItem(item) {
        if (!item) return "-";
        const name = item.name || (item.id ? `ID: ${item.id}` : "-");
        const level = item.level ? ` Lv.${item.level}` : "";
        return `${escapeHtml(name)}${escapeHtml(level)}`;
    }

    function formatArtifact(item) {
        const slot = item.slot ? `${item.slot}: ` : "";
        return `${escapeHtml(slot)}${formatNamedItem(item)}`;
    }

    function renderCharacterDetail(character) {
        const detail = getElement("genshinCharacterDetail");
        if (!detail) return;

        detail.hidden = false;
        const weapon = character.weapon ? formatNamedItem(character.weapon) : "-";
        const artifacts = character.artifacts.length ? character.artifacts.map(formatArtifact).join(" / ") : "-";
        detail.innerHTML = `
            <h4>${escapeHtml(character.name)}</h4>
            <dl class="character-build-grid">
                <div><dt>${TEXT.level}</dt><dd>${character.level || "-"}</dd></div>
                <div><dt>${TEXT.estimatedElement}</dt><dd>${escapeHtml(character.element)}</dd></div>
                <div><dt>${TEXT.constellation}</dt><dd>${character.constellation}</dd></div>
                <div><dt>${TEXT.weapon}</dt><dd>${weapon}</dd></div>
                <div><dt>HP</dt><dd>${formatStat(character.stats.hp)}</dd></div>
                <div><dt>${TEXT.atk}</dt><dd>${formatStat(character.stats.atk)}</dd></div>
                <div><dt>${TEXT.def}</dt><dd>${formatStat(character.stats.def)}</dd></div>
                <div><dt>${TEXT.elementalMastery}</dt><dd>${formatStat(character.stats.elementalMastery)}</dd></div>
                <div><dt>${TEXT.critRate}</dt><dd>${formatStat(character.stats.critRate, "%")}</dd></div>
                <div><dt>${TEXT.critDamage}</dt><dd>${formatStat(character.stats.critDamage, "%")}</dd></div>
                <div><dt>${TEXT.energyRecharge}</dt><dd>${formatStat(character.stats.energyRecharge, "%")}</dd></div>
                <div><dt>${TEXT.elementalDamage}</dt><dd>${formatStat(character.stats.elementalDamage, "%")}</dd></div>
                <div><dt>${TEXT.artifacts}</dt><dd>${artifacts}</dd></div>
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
        setInputValue("cri_dmg", character.stats.critDamage);
        setInputValue("dmg_b", character.stats.elementalDamage);
        setInputValue("ele_m", character.stats.elementalMastery);
        setInputValue("lv", character.level);
        state.selectedCharacter = character;
        setMessage(`${character.name} ${TEXT.appliedSuffix}`, "success");
    }

    function selectCharacter(index) {
        if (!state.profile) return;
        const character = state.profile.characters[index];
        if (!character) return;
        renderCharacterDetail(character);
        applyCharacterToForm(character);
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
    }

    document.addEventListener("DOMContentLoaded", initializeUidImporter);
})();
