"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const DERIVED_CONDITIONS = new Set([
    "chargedAttack",
    "weaponTypeCatalystOrBow",
    "weaponTypeSwordClaymorePolearm"
]);
const UID_INPUT_STAT_TARGETS = new Set([
    "atkPercent", "atkFlat", "hpPercent", "hpFlat", "defPercent", "defFlat",
    "elementalMastery", "energyRecharge"
]);
const UID_INPUT_CRIT_TARGETS = new Set(["critRate", "critDamage"]);
const UID_INPUT_DAMAGE_TARGETS = new Set([
    "pyroDamageBonus", "hydroDamageBonus", "electroDamageBonus", "cryoDamageBonus",
    "anemoDamageBonus", "geoDamageBonus", "dendroDamageBonus", "physicalDamageBonus",
    "allElementDamageBonus", "ownElementDamageBonus"
]);

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function classify(modifier) {
    const targets = Array.isArray(modifier.applyTo) ? modifier.applyTo : [];
    const represented = modifier.uidHandling === "includedInUidStats" && (
        (modifier.category === "statBonus" && targets.length && targets.every((target) => UID_INPUT_STAT_TARGETS.has(target)))
        || (modifier.category === "critBonus" && targets.length && targets.every((target) => UID_INPUT_CRIT_TARGETS.has(target)))
        || (modifier.category === "damageBonus" && targets.length && targets.every((target) => UID_INPUT_DAMAGE_TARGETS.has(target)))
        || (modifier.category === "healingBonus" && targets.every((target) => target === "outgoingHealingBonus"))
    );
    if (represented) return "reflected";
    if ((modifier.condition || "always") === "always") return "automatic";
    if (DERIVED_CONDITIONS.has(modifier.condition)) return "derived";
    if (modifier.calculationSupport === "stack" && modifier.stack) return "stack";
    return "userToggle";
}

function buildAudit() {
    const data = readJson("games/genshin/data/calc/artifact-set-modifiers.json");
    const sets = readJson("games/genshin/data/artifact-sets.json");
    const records = [];
    Object.entries(data).forEach(([setId, entry]) => {
        [["twoPiece", 2], ["fourPiece", 4]].forEach(([slot, pieceCount]) => {
            (entry[slot] || []).forEach((modifier, modifierIndex) => {
                records.push({
                    setId,
                    setName: sets[setId]?.nameJa || "",
                    pieceCount,
                    modifierIndex,
                    modifierId: modifier.id || "unknown",
                    condition: modifier.condition || "always",
                    policy: classify(modifier)
                });
            });
        });
    });
    const byPolicy = records.reduce((summary, record) => {
        summary[record.policy] = (summary[record.policy] || 0) + 1;
        return summary;
    }, {});
    return { summary: { total: records.length, byPolicy }, records };
}

if (require.main === module) {
    process.stdout.write(`${JSON.stringify(buildAudit(), null, 2)}\n`);
}

module.exports = { buildAudit, classify };
