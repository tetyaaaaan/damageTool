(function () {
    "use strict";
    const paths = {
        catalog: "/games/hsr/data/catalog.json",
        attackManifest: "/games/hsr/data/attacks.json",
        modifiers: "/games/hsr/data/modifiers.json",
        dataFiles: "/games/hsr/data/calc/data-files.json",
        specialBreakAttacks: "/games/hsr/data/calc/special-break-attacks.json"
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
        const attackBase = "/games/hsr/data/";
        const calcBase = "/games/hsr/data/calc/";
        const resolveDataFile = (file) => file.startsWith("/") ? file : calcBase + file;
        const [generatedResponse, overrideResponses, structuredModifierResponses] = await Promise.all([
            fetch(attackBase + raw.attackManifest.generated, { cache: "no-cache" }),
            Promise.all((raw.dataFiles.attackOverrides || []).map((file) => fetch(resolveDataFile(file), { cache: "no-cache" }))),
            Promise.all((raw.dataFiles.modifiers || []).map((file) => fetch(resolveDataFile(file), { cache: "no-cache" })))
        ]);
        if (!generatedResponse.ok || overrideResponses.some((response) => !response.ok)) throw new Error("attack data could not be loaded");
        if (structuredModifierResponses.some((response) => !response.ok)) throw new Error("modifier data could not be loaded");
        const generatedData = await generatedResponse.json();
        const overrideDataFiles = await Promise.all(overrideResponses.map((response) => response.json()));
        const structuredModifierDataFiles = await Promise.all(structuredModifierResponses.map((response) => response.json()));
        const generatedSupport = generatedData.support || { status: "review", verified: false };
        const generated = (generatedData.attacks || []).map((attack) => ({ ...attack, support: generatedSupport }));
        const overrides = overrideDataFiles.flatMap((data) => (data.overrides || []).map((override) => ({ ...override, support: override.support || data.support || { status: "calculable", verified: true } })));
        const attacksById = new Map(generated.map((attack) => [String(attack.id), attack]));
        overrides.forEach((override) => attacksById.set(String(override.id), { ...attacksById.get(String(override.id)), ...override }));
        const attacks = Array.from(attacksById.values()).sort((left, right) => Number(left.characterId) - Number(right.characterId) || Number(left.displayOrder || 999) - Number(right.displayOrder || 999));
        cached = Object.freeze({
            ...raw.catalog,
            attacks,
            specialBreakAttacks: raw.specialBreakAttacks?.attacks || [],
            attackCoverage: Object.freeze({
                total: attacks.length,
                calculable: attacks.filter((attack) => attack.support?.status === "calculable" && attack.support?.verified).length,
                review: attacks.filter((attack) => attack.support?.status !== "calculable" || !attack.support?.verified).length
            }),
            modifiers: raw.modifiers.modifiers,
            structuredModifiers: structuredModifierDataFiles.flatMap((data) => data.modifiers || []).filter((modifier) => !String(modifier.id).startsWith("deprecated:")),
            // Lv.80 is the only value enabled until the remaining progression
            // table has an independently recorded source.
            breakBaseDamage: Object.freeze({ 80: 3767.5533 })
        });
        return cached;
    }
    function resetCache() { cached = undefined; }
    window.HsrCalcData = Object.freeze({ load, resetCache });
})();
