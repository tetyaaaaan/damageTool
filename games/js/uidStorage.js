(function () {
    "use strict";

    const STORAGE_KEYS = Object.freeze({
        genshin: "tetinet:genshin:lastUid:v1",
        hsr: "tetinet:hsr:lastUid:v1"
    });

    function normalizeUid(uid) {
        const normalized = String(uid ?? "").trim();
        return /^\d{8,10}$/.test(normalized) ? normalized : "";
    }

    function getStorageKey(game) {
        return STORAGE_KEYS[game] || "";
    }

    function load(game) {
        const key = getStorageKey(game);
        if (!key) return "";
        try {
            return normalizeUid(window.localStorage.getItem(key));
        } catch (_error) {
            return "";
        }
    }

    function save(game, uid) {
        const key = getStorageKey(game);
        const normalizedUid = normalizeUid(uid);
        if (!key || !normalizedUid) return false;
        try {
            window.localStorage.setItem(key, normalizedUid);
            return true;
        } catch (_error) {
            return false;
        }
    }

    function remove(game) {
        const key = getStorageKey(game);
        if (!key) return false;
        try {
            window.localStorage.removeItem(key);
            return true;
        } catch (_error) {
            return false;
        }
    }

    window.TetinetUidStorage = Object.freeze({ load, save, remove });
})();
