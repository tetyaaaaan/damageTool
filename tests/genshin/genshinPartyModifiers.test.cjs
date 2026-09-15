const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createScenarioHarness, prepareScenarioInputs } = require("./helpers/calcScenarioHarness.cjs");

const root = path.resolve(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

function requestWithSupport(characterId, support, stats = {}) {
    const { sandbox, elements, calcData } = createScenarioHarness();
    prepareScenarioInputs(elements, { characterId, stats });
    const request = sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = {
        schemaVersion: 1,
        focusSlot: 1,
        members: [
            { slot: 1, role: "main", enabled: true, characterId },
            {
                slot: 2,
                role: "support",
                enabled: true,
                constellation: 0,
                talentLevels: { normal: 10, skill: 10, burst: 10 },
                buffStates: {},
                ...support
            }
        ]
    };
    return { sandbox, calcData, request };
}

test("party targets only allow team, active character, other members, and enemy effects", () => {
    const { sandbox } = createScenarioHarness();
    const api = sandbox.GenshinPartyModifiers;

    assert.equal(api.inferTargetOwner({}, "チーム全員の与えるダメージがアップする").owner, "team");
    assert.equal(api.inferTargetOwner({}, "出場キャラクターの攻撃力がアップする").owner, "activeCharacter");
    assert.equal(api.inferTargetOwner({}, "装備者以外のチームメンバーに効果を付与する").owner, "otherPartyMembers");
    assert.equal(api.inferTargetOwner({}, "敵の物理耐性-20%").owner, "enemy");
    assert.equal(api.inferTargetOwner({}, "自身の与えるダメージがアップする").owner, "self");
    assert.equal(api.targetAppliesToMain("self"), false);
    assert.equal(api.targetAppliesToMain("team"), true);
});

test("same provider effect dedupes while distinct providers remain stackable", () => {
    const { sandbox } = createScenarioHarness();
    const api = sandbox.GenshinPartyModifiers;
    const base = {
        key: "candidate-a",
        member: { characterId: "10000041" },
        sourceKind: "talent",
        sourceId: "combat3",
        modifier: { id: "omen", category: "damageBonus", applyTo: ["allDamageBonus"] }
    };

    assert.equal(api.dedupeKey(base), api.dedupeKey({ ...base, key: "candidate-b" }));
    assert.notEqual(
        api.dedupeKey(base),
        api.dedupeKey({ ...base, member: { characterId: "10000030" } })
    );
});

test("provider-stat and dynamic party effects are never applied with guessed values", () => {
    const bennett = requestWithSupport("10000037", { characterId: "10000032", nameJa: "ベネット" });
    const bennettResult = bennett.sandbox.GenshinCalcEngine.calculateDamageRequest(bennett.request, bennett.calcData);
    const burst = bennettResult.partyModifiers.find((candidate) => candidate.sourceId === "combat3");
    assert.equal(burst.status, "missingProviderStats");

    const furina = requestWithSupport("10000037", { characterId: "10000089", nameJa: "フリーナ" });
    const furinaResult = furina.sandbox.GenshinCalcEngine.calculateDamageRequest(furina.request, furina.calcData);
    assert.ok(furinaResult.partyModifiers.some((candidate) => candidate.status === "missingInput"));
});

test("provider base attack enables Bennett's party buff without using the target base attack", () => {
    const bennett = requestWithSupport("10000037", {
        characterId: "10000032",
        nameJa: "ベネット",
        stats: { baseAtk: 800 }
    }, { baseAtk: 500, atk: 2000 });
    const before = bennett.sandbox.GenshinCalcEngine.calculateDamageRequest(bennett.request, bennett.calcData);
    const burst = before.partyModifiers.find((candidate) => candidate.sourceId === "combat3");
    assert.equal(burst.status, "off");
    bennett.request.party.members[1].buffStates[burst.key] = true;
    const after = bennett.sandbox.GenshinCalcEngine.calculateDamageRequest(bennett.request, bennett.calcData);
    const trace = after.statTrace.find((item) => item.source.includes("10000032"));
    assert.ok(after.results[0].expected > before.results[0].expected);
    assert.equal(Math.round(trace.value), 806);
});

test("Bennett C1 shares the burst toggle and adds another 20 percent of provider base attack", () => {
    const bennett = requestWithSupport("10000037", {
        characterId: "10000032",
        nameJa: "ベネット",
        constellation: 1,
        stats: { baseAtk: 800 }
    }, { baseAtk: 500, atk: 2000 });
    const before = bennett.sandbox.GenshinCalcEngine.calculateDamageRequest(bennett.request, bennett.calcData);
    const burstEffects = before.partyModifiers.filter((candidate) => candidate.sourceId === "combat3" || candidate.modifier.id === "c_10000032_1_burst_atk_bonus");

    assert.equal(burstEffects.length, 2);
    assert.equal(new Set(burstEffects.map((candidate) => candidate.toggleKey)).size, 1);
    assert.equal(burstEffects.filter((candidate) => candidate.showToggle).length, 1);

    bennett.request.party.members[1].buffStates[burstEffects[0].toggleKey] = true;
    const after = bennett.sandbox.GenshinCalcEngine.calculateDamageRequest(bennett.request, bennett.calcData);
    const values = Array.from(after.statTrace.filter((item) => item.source.includes("10000032")), (item) => Math.round(item.value)).sort((a, b) => a - b);
    assert.deepEqual(values, [160, 806]);
});

test("non-stackable party effects keep only the strongest value", () => {
    const { sandbox } = createScenarioHarness();
    const candidates = [16, 24].map((resolvedValue, index) => ({
        key: `millennial-${index}`,
        resolvedValue,
        sourceKind: "weapon",
        sourceId: String(100 + index),
        description: "千年の大楽章。同種類の効果は重ね掛け不可。",
        modifier: { category: "damageBonus", applyTo: ["normalAttackDamageBonus"] }
    }));
    const result = sandbox.GenshinPartyModifiers.applyStackingRules(candidates);
    assert.equal(result.length, 1);
    assert.equal(result[0].resolvedValue, 24);
});

test("a selected party debuff is reflected once in damage calculation", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000041",
        nameJa: "モナ"
    });
    const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const omen = before.partyModifiers.find((candidate) => candidate.sourceId === "combat3");
    assert.equal(omen.status, "off");
    assert.equal(omen.targetOwner, "enemy");
    assert.equal(omen.resolvedValue, 60);

    request.party.members[1].buffStates[omen.key] = true;
    const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const partyApplied = after.results[0].breakdown.appliedModifiers
        .filter((item) => item.partyCandidateKey === omen.key);

    assert.ok(after.results[0].expected > before.results[0].expected);
    assert.equal(partyApplied.length, 1);
    assert.equal(partyApplied[0].value, 60);
});

test("a party artifact set is retained and exposed as a team buff candidate", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000032",
        nameJa: "ベネット",
        equipment: { artifactSetMode: "4pc", artifactSetIds: ["10007"] }
    });
    const result = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const instructor = result.partyModifiers.find((candidate) => candidate.sourceId === "4:10007");

    assert.ok(instructor);
    assert.equal(instructor.sourceKind, "artifact");
    assert.equal(instructor.targetOwner, "team");
    assert.equal(instructor.status, "off");
    assert.equal(instructor.resolvedValue, 120);
});

test("a UID-derived lone two-piece set never activates its four-piece party effect", () => {
    ["2pc", "none"].forEach((artifactSetMode) => {
        const { sandbox, calcData, request } = requestWithSupport("10000037", {
            characterId: "10000032",
            nameJa: "ベネット",
            equipment: { artifactSetMode, artifactSetIds: artifactSetMode === "none" ? [] : ["10007"] }
        });
        const result = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
        assert.equal(result.partyModifiers.some((candidate) => candidate.sourceId === "4:10007"), false);
    });
});

test("Kazuha exposes one team buff and uses the provider's elemental mastery", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000047",
        nameJa: "楓原万葉",
        stats: { elementalMastery: 1000 }
    });
    const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const buffs = before.partyModifiers.filter((candidate) => candidate.sourceId === "passive2");

    assert.equal(buffs.length, 1);
    assert.equal(buffs[0].targetOwner, "team");
    assert.equal(buffs[0].status, "off");
    assert.equal(buffs[0].resolvedValue, 40);

    request.party.members[1].buffStates[buffs[0].toggleKey] = true;
    const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const beforeElemental = before.results.find((result) => result.entry.element === "氷");
    const afterElemental = after.results.find((result) => result.entry.element === "氷");
    const applied = afterElemental.breakdown.appliedModifiers.find((item) => item.partyCandidateKey === buffs[0].key);
    assert.ok(afterElemental.expected > beforeElemental.expected);
    assert.equal(applied.value, 40);
});

test("Freedom-Sworn team effects share one toggle and apply to the main character", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000047",
        nameJa: "楓原万葉",
        equipment: { weaponId: "11503", refinement: 1, artifactSetIds: [] }
    }, { baseAtk: 500, atk: 2000 });
    const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const anthem = before.partyModifiers.filter((candidate) => candidate.modifier.effectGroupId === "freedom_sworn_millennial_anthem");

    assert.equal(anthem.length, 2);
    assert.ok(anthem.every((candidate) => candidate.targetOwner === "team" && candidate.status === "off"));
    assert.equal(new Set(anthem.map((candidate) => candidate.toggleKey)).size, 1);
    assert.equal(anthem.filter((candidate) => candidate.showToggle).length, 1);

    request.party.members[1].buffStates[anthem[0].toggleKey] = true;
    const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    assert.ok(after.results[0].expected > before.results[0].expected);
    assert.ok(after.statTrace.some((item) => item.source.includes("weapon:11503") && Math.round(item.value) === 100));
    assert.ok(after.results[0].breakdown.appliedModifiers.some((item) => item.modifier.id === "w_11503_damage_3" && item.value === 16));
});

test("Viridescent Venerer resolves the swirled element resistance for party damage", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000047",
        nameJa: "楓原万葉",
        equipment: { artifactSetMode: "4pc", artifactSetIds: ["15002"] }
    });
    const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const shred = before.partyModifiers.find((candidate) => candidate.modifier.id === "a_15002_4pc_2_v10");

    assert.ok(shred);
    assert.equal(before.partyModifiers.filter((candidate) => candidate.sourceId === "4:15002").length, 1);
    assert.equal(shred.targetOwner, "enemy");
    assert.equal(shred.status, "off");

    request.party.members[1].buffStates[shred.toggleKey] = true;
    const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const beforeElemental = before.results.find((result) => result.entry.element === "氷");
    const afterElemental = after.results.find((result) => result.entry.element === "氷");
    const applied = afterElemental.breakdown.appliedModifiers.find((item) => item.modifier.id === "a_15002_4pc_2_v10");
    assert.ok(afterElemental.expected > beforeElemental.expected);
    assert.equal(applied.value, -40);
});

test("Nicole C2 shares one activation across the team attack buff and corresponding resistance shred", () => {
    const { sandbox, calcData, request } = requestWithSupport("10000037", {
        characterId: "10000131",
        nameJa: "ニコル",
        constellation: 2
    }, { baseAtk: 500, atk: 2000 });
    const before = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const blessing = before.partyModifiers.filter((candidate) => candidate.modifier.conditionGroupId === "character:10000131:skill:blessing");

    assert.equal(blessing.length, 2);
    assert.equal(new Set(blessing.map((candidate) => candidate.toggleKey)).size, 1);
    assert.ok(blessing.every((candidate) => candidate.status === "off"));

    request.party.members[1].buffStates[blessing[0].toggleKey] = true;
    const after = sandbox.GenshinCalcEngine.calculateDamageRequest(request, calcData);
    const elemental = after.results.find((result) => result.entry.element === "氷");
    assert.ok(after.statTrace.some((item) => item.source.includes("10000131") && item.value === 300));
    assert.ok(elemental.breakdown.appliedModifiers.some((item) => item.modifier.id === "c_10000131_2_1_resolved_3" && item.value === -25));
});

test("Xilonen C2 applies only the main character's matching elemental sample", () => {
    const pyro = requestWithSupport("10000046", {
        characterId: "10000103",
        constellation: 2
    }, { baseAtk: 500, atk: 2000 });
    const payload = pyro.sandbox.GenshinCalcEngine.calculateDamageRequest(pyro.request, pyro.calcData);
    const samples = payload.partyModifiers.filter((candidate) => candidate.sourceKind === "constellation" && candidate.sourceId === "2");

    assert.equal(samples.filter((candidate) => candidate.status === "ready").length, 1);
    assert.equal(samples.find((candidate) => candidate.status === "ready").modifier.id, "c_10000103_2_1");
    assert.equal(samples.some((candidate) => candidate.modifier.auditDisposition === "supersededByStructuredRecord"), false);
    assert.ok(payload.statTrace.some((item) => item.source.includes("10000103") && item.stat === "atk" && item.value === 225));
});

test("new structured reaction party effects resolve from provider stats without leaking into all damage", () => {
    const cases = [
        { characterId: "10000116", constellation: 1, stats: { atk: 1000 }, id: "c_10000116_1_2", value: 25, calculation: "scalingReactionBonus" },
        { characterId: "10000119", constellation: 2, stats: { elementalMastery: 1000 }, id: "c_10000119_2_6", value: 5000, calculation: "scalingAdditiveBaseDamage" },
        { characterId: "10000126", constellation: 2, stats: { def: 1000 }, id: "c_10000126_2_1", value: 30, calculation: "reactionBonus" }
    ];

    cases.forEach((item) => {
        const scenario = requestWithSupport("10000037", item);
        const payload = scenario.sandbox.GenshinCalcEngine.calculateDamageRequest(scenario.request, scenario.calcData);
        const candidate = payload.partyModifiers.find((entry) => entry.modifier.id === item.id);
        assert.ok(candidate, item.id);
        assert.equal(candidate.resolvedValue, item.value, item.id);
        assert.equal(candidate.analysis.calculation, item.calculation, item.id);
        assert.equal(candidate.modifier.applyTo.includes("allDamageBonus"), false, item.id);
    });
});

test("party setup and condition tab are wired into the production UI", () => {
    const html = read("games/genshin/index.html");
    const renderer = read("games/js/genshinCalcRenderer.js");
    const css = read("games/css/genshin-tool-ui.css");

    assert.match(html, /id="genshinPartyMemberList"/);
    const partyState = read("games/js/genshinPartyState.js");
    assert.match(partyState, /id="genshinPartyBurstTalent\$\{slot\}"/);
    assert.match(partyState, /id="genshinPartyArtifactMode\$\{slot\}"/);
    assert.match(partyState, /openPartySelection\?\.\("artifact"/);
    assert.match(html, /genshinPartyModifiers\.js/);
    assert.match(renderer, /id: "party", label: "パーティ"/);
    assert.match(renderer, /data-genshin-party-buff-key/);
    assert.match(renderer, /renderPartyPanel/);
    assert.match(css, /\.genshin-party-talents/);
    assert.match(css, /\.genshin-party-artifact-row/);
    assert.match(css, /\.genshin-selection-close::before/);
    assert.match(css, /\.genshin-party-effect \.genshin-condition-facts\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.genshin-party-effect \.genshin-condition-control\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
});
