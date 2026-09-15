"use strict";

// One candidate inventory for terminal classification and certificate inputs.
// Reviewed overlays replace the same stable ID; they do not create candidates.
const fs = require("node:fs");
const path = require("node:path");
const defaultDataRoot = path.resolve(__dirname, "../games/genshin/data");

function collectCandidates({ dataRoot = defaultDataRoot } = {}) {
    const read = (file) => JSON.parse(fs.readFileSync(path.join(dataRoot, file), "utf8"));
    const collections = [];
    const add = (dataset, layer, records, canonicalCategory) => {
        if (!records || typeof records !== "object" || Array.isArray(records)) throw new Error(`candidateRegistryInvalid:${dataset}`);
        for (const [key, candidate] of Object.entries(records)) {
            collections.push({ id: String(candidate?.id || key), dataset, layer, canonicalCategory, candidate });
        }
    };
    add("weapons", "weaponEffectSpec", read("v2/weapons/spec-candidates.json"), "weapons");
    add("artifacts", "artifactEffectSpec", read("v2/artifacts/spec-candidates.json"), "artifacts");
    add("talentGap", "talentGapEffectSpec", read("v2/characters/talent-gap-candidates.json").specs, "talentGap");
    const pilot = read("v2/characters/behavior-pilot.json");
    const reviewed = read("v2/characters/behavior-reviewed.json");
    add("behaviorPilot", "behaviorSpec", { ...pilot.specs, ...reviewed.behaviorSpecs }, "behavior");
    add("behaviorPilot", "behaviorModifier", { ...pilot.modifiers, ...reviewed.modifiers }, "behavior");
    for (let batch = 1; batch <= 12; batch += 1) {
        add(`behaviorBatch${batch}`, "behaviorSpec", read(`v2/characters/behavior-batch-${batch}/spec-candidates.json`), `behaviorBatch${batch}`);
    }
    const ids = new Set();
    for (const row of collections) {
        if (ids.has(row.id)) throw new Error(`duplicateCandidateId:${row.id}`);
        ids.add(row.id);
    }
    return collections.sort((a, b) => a.dataset.localeCompare(b.dataset) || a.id.localeCompare(b.id));
}

module.exports = { collectCandidates };
