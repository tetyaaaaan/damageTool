(function () {
    "use strict";
    const paths = {
        catalog: "/games/hsr/data/catalog.json",
        attacks: "/games/hsr/data/attacks.json",
        modifiers: "/games/hsr/data/modifiers.json"
    };
    let cached;
    async function load() {
        if (cached) return cached;
        const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${key} data could not be loaded`);
            return [key, await response.json()];
        }));
        const raw = Object.fromEntries(entries);
        cached = Object.freeze({
            ...raw.catalog,
            attacks: raw.attacks.attacks,
            modifiers: raw.modifiers.modifiers,
            // Lv.80 is the only value enabled until the remaining progression
            // table has an independently recorded source.
            breakBaseDamage: Object.freeze({ 80: 3767.5533 })
        });
        return cached;
    }
    function resetCache() { cached = undefined; }
    window.HsrCalcData = Object.freeze({ load, resetCache });
})();
