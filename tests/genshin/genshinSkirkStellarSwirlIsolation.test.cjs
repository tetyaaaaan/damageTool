"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const CHARACTER_ID = "10000114";
const BEFORE_PATH = "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard13/1bab2cdba4d218fd5caa46b5f54e7884ee8359a2/English/talents/skirk.json";
const AFTER_PATH = "../../games/genshin/data/v2/version-transitions/6.7-to-7.0/sources/genshin-db-behavior-shard13/8b15995fa220c88a4d0d7ffe1e21b041d0b32588/English/talents/skirk.json";

test("7.0 adds Stellar Swirl to Skirk's Void Rift trigger and local text must follow the raw delta", () => {
    const before = require(BEFORE_PATH);
    const after = require(AFTER_PATH);
    const local = require("../../games/genshin/data/character-talents.json");
    const passive = local[CHARACTER_ID].passives.find((item) => item.sourceId === "passive_1");

    assert.match(before.passive1.description, /Stellar-Conduct/);
    assert.doesNotMatch(before.passive1.description, /Stellar Swirl/);
    assert.match(after.passive1.description, /Stellar Swirl/);
    assert.match(
        passive.descriptionJa,
        /星拡散/,
        "7.0 raw adds Stellar Swirl, but the local Skirk passive trigger text is still 6.7-only"
    );
});

test("Skirk's existing rift-absorption calculation keeps the explicit 0..3 boundary", () => {
    const registry = require("../../games/genshin/data/calc/talent-effect-registry.json");
    const options = registry.records[`${CHARACTER_ID}.combat3.0`].modifierOverride.exclusiveTalentOptions;
    assert.deepEqual(
        options.options.map((item) => item.valueKey),
        ["0", "1", "2", "3"]
    );
});
