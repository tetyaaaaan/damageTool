(function () {
    "use strict";

    const SAME_ORIGIN_PROXY_URL = "/games/api/genshin-profile";
    const cache = new Map();

    async function fetchGenshinProfile(uid) {
        const cached = cache.get(uid);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }

        const response = await fetch(`${SAME_ORIGIN_PROXY_URL}?uid=${encodeURIComponent(uid)}`, {
            method: "GET"
        });

        if (response.status === 404) {
            const error = new Error("\u0055\u0049\u0044\u304c\u9593\u9055\u3063\u3066\u3044\u308b\u304b\u3001\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u8a73\u7d30\u304c\u516c\u958b\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
            error.code = "PROFILE_NOT_FOUND";
            throw error;
        }

        if (!response.ok) {
            const error = new Error("\u0055\u0049\u0044\u304c\u9593\u9055\u3063\u3066\u3044\u308b\u304b\u3001\u30ad\u30e3\u30e9\u30af\u30bf\u30fc\u8a73\u7d30\u304c\u516c\u958b\u3055\u308c\u3066\u3044\u307e\u305b\u3093");
            error.code = response.status === 400 ? "PROFILE_NOT_FOUND" : "PROFILE_UNAVAILABLE";
            throw error;
        }

        const data = await response.json();
        if (data && data.playerInfo && !data.playerInfo.uid) {
            data.playerInfo.uid = uid;
        }

        const ttlSeconds = Math.max(0, Number(data?.ttl) || 0);
        if (ttlSeconds > 0) {
            cache.set(uid, {
                data,
                expiresAt: Date.now() + ttlSeconds * 1000
            });
        }
        return data;
    }

    window.GenshinProfileApi = { fetchGenshinProfile };
})();
