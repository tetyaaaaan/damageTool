(function () {
    "use strict";

    const API_BASE_URL = "https://api.mihomo.me/sr_info_parsed/";
    const SAME_ORIGIN_PROXY_URL = "/games/api/hsr-profile";

    async function fetchHsrProfile(uid) {
        const proxyResponse = await fetchFromSameOriginProxy(uid);
        if (proxyResponse) {
            return proxyResponse;
        }

        const response = await fetch(`${API_BASE_URL}${encodeURIComponent(uid)}?lang=jp`, {
            method: "GET"
        });

        if (response.status === 404) {
            const error = new Error("UIDが間違っているか、キャラクター詳細が公開されていません");
            error.code = "PROFILE_NOT_FOUND";
            throw error;
        }

        if (!response.ok) {
            const error = new Error("UIDが間違っているか、キャラクター詳細が公開されていません");
            error.code = "PROFILE_UNAVAILABLE";
            throw error;
        }

        return response.json();
    }

    async function fetchFromSameOriginProxy(uid) {
        try {
            const response = await fetch(`${SAME_ORIGIN_PROXY_URL}?uid=${encodeURIComponent(uid)}`, {
                method: "GET"
            });

            if (response.status === 404) {
                return null;
            }

            if (!response.ok) {
                const error = new Error("UIDが間違っているか、キャラクター詳細が公開されていません");
                error.code = response.status === 400 ? "PROFILE_NOT_FOUND" : "PROFILE_UNAVAILABLE";
                throw error;
            }

            return response.json();
        } catch (error) {
            if (error instanceof TypeError) {
                return null;
            }
            throw error;
        }
    }

    window.HsrProfileApi = { fetchHsrProfile };
})();

