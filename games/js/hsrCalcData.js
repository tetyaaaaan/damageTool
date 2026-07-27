(function () {
    "use strict";
    const paths = {
        characters: "/games/data/hsr/data_hsr_cha.csv",
        lightCones: "/games/data/hsr/data_hsr_weapon.csv",
        relics: "/games/data/hsr/data_hsr_artifact.csv",
        breakDamage: "/games/data/hsr/data_hsr_baseBreakDMG.csv"
    };
    let cached;
    function parseCsv(text) {
        const [header, ...rows] = String(text || "").trim().split(/\r?\n/);
        const keys = header.split(",");
        return rows.filter(Boolean).map((row) => {
            const values = row.split(",");
            return keys.reduce((item, key, index) => ({ ...item, [key]: values[index] || "" }), {});
        });
    }
    function numeric(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
    async function load() {
        if (cached) return cached;
        const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => {
            const response = await fetch(path, { cache: "no-cache" });
            if (!response.ok) throw new Error(`${key} data could not be loaded`);
            return [key, parseCsv(await response.text())];
        }));
        const raw = Object.fromEntries(entries);
        cached = {
            characters: raw.characters.map((item) => ({ id: `legacy-char-${item.id}`, legacyId: item.id, name: item.name, element: item.element, path: item.destiny, rarity: numeric(item.star), base: { hp: numeric(item.max_hp), atk: numeric(item.max_atk), def: numeric(item.max_def), speed: numeric(item.max_agi) } })),
            lightCones: raw.lightCones.map((item) => ({ id: `legacy-cone-${item.id}`, legacyId: item.id, name: item.name, path: item.destiny, rarity: numeric(item.star), base: { hp: numeric(item.max_hp), atk: numeric(item.max_atk), def: numeric(item.max_def) }, description: item.skill || "" })),
            relics: raw.relics.map((item) => ({ id: `legacy-relic-${item.id}`, legacyId: item.id, name: item.name, type: item.type === "2" ? "ornament" : "relic", description: item["2bonus"] || "" })),
            breakBaseDamage: Object.fromEntries(raw.breakDamage.map((item) => [numeric(item.lv), numeric(item.baseBreakDMG)]),),
            provenance: { source: "既存プロジェクトのCSV", limitations: "既存CSVにはスキル倍率・効果の構造化データがないため、未検証の自動補正は適用しません。" }
        };
        return cached;
    }
    function resetCache() { cached = undefined; }
    window.HsrCalcData = Object.freeze({ load, resetCache });
})();
