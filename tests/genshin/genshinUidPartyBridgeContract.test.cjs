const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function createScriptSandbox() {
    const elements = {};
    const document = {
        readyState: "loading",
        addEventListener() {},
        getElementById(id) { return elements[id] || null; },
        querySelectorAll() { return []; }
    };
    const sandbox = { console, Date, document };
    sandbox.window = sandbox;
    const uidTalentMap = JSON.parse(read("games/genshin/data/uid-talent-skill-map.json"));
    sandbox.GenshinIdResolver = {
        resolveUidTalentSkillMap(skillDepotId) {
            return uidTalentMap.bySkillDepotId[String(skillDepotId)] || null;
        }
    };
    vm.createContext(sandbox);
    return sandbox;
}

function loadContractAndPartyState() {
    const sandbox = createScriptSandbox();
    vm.runInContext(read("games/js/genshinDataContract.js"), sandbox, { filename: "genshinDataContract.js" });
    vm.runInContext(read("games/js/genshinPartyState.js"), sandbox, { filename: "genshinPartyState.js" });
    return sandbox;
}

const UID_CHARACTER_FIXTURE = Object.freeze({
    schemaVersion: 2,
    source: "uidProfile",
    id: "10000128",
    name: "UID display name",
    element: "pyro",
    weaponType: "sword",
    rarity: 5,
    level: 88,
    constellation: 4,
    constellationEffect: "display-only constellation text",
    talents: { normal: 11, skill: 12, burst: 13, passive1: 9 },
    weapon: {
        id: "11509",
        name: "UID sword",
        level: 88,
        rank: 4,
        type: "sword",
        rarity: 5,
        effect: "display-only effect text"
    },
    artifacts: [
        { id: "flower", setId: "set-a", name: "A flower", level: 20, slot: "flower", setName: "Set A", effect: "2pc A" },
        { id: "plume", setId: "set-a", name: "A plume", level: 20, slot: "plume", setName: "Set A", effect: "2pc A" },
        { id: "sands", setId: "set-a", name: "A sands", level: 20, slot: "sands", setName: "Set A", effect: "4pc A" },
        { id: "goblet", setId: "set-a", name: "A goblet", level: 20, slot: "goblet", setName: "Set A", effect: "4pc A" },
        { id: "circlet", setId: "set-b", name: "B circlet", level: 20, slot: "circlet", setName: "Set B", effect: "2pc B" }
    ],
    stats: {
        baseHp: 12345.67,
        baseAtk: 987.65,
        baseDef: 765.43,
        hp: 23456.78,
        atk: 3456.89,
        def: 1234.56,
        elementalMastery: 321,
        critRate: 44.4,
        critDamage: 155.5,
        energyRecharge: 133.3,
        elementalDamage: 46.6,
        elementalDamageDetails: [{ key: 40, element: "pyro", value: 46.6 }]
    },
    provenance: {
        source: "uidProfile",
        rawCharacterId: "10000128",
        includesPersistentBonuses: true,
        additivePolicy: "externalModifiersOnly"
    }
});

test("CalculationInput v2 -> support keeps provider subset and a lossless profile snapshot", () => {
    const sandbox = loadContractAndPartyState();
    const api = sandbox.GenshinDataContract;
    const input = api.createCalculationInput(UID_CHARACTER_FIXTURE, "uidProfile");
    const member = api.createPartyMemberFromCalculationInput(input, 3);

    assert.equal(input.schemaVersion, 2);
    assert.equal(input.source, "uidProfile");
    assert.equal(input.characterId, "10000128");
    assert.equal(input.level, 88);
    assert.equal(input.constellation, 4);
    assert.deepEqual(JSON.parse(JSON.stringify(input.talents)), JSON.parse(JSON.stringify(UID_CHARACTER_FIXTURE.talents)));
    assert.equal(input.weapon.id, "11509");
    assert.equal(input.weapon.rank, 4);
    assert.equal(input.stats.critRate, 44.4);
    assert.equal(input.provenance.rawCharacterId, "10000128");
    assert.equal(input.provenance.sourceSnapshot, "uidProfile");
    assert.equal(input.provenance.retainedFromUid, true);
    assert.equal(input.profileSnapshot.name, "UID display name");
    assert.equal(input.profileSnapshot.talents.passive1, 9);
    assert.equal(input.profileSnapshot.artifacts[4].id, "circlet");
    assert.equal(input.profileSnapshot.stats.critRate, 44.4);
    assert.equal(input.profileSnapshot.stats.energyRecharge, 133.3);
    assert.equal(input.profileSnapshot.stats.elementalDamageDetails[0].value, 46.6);

    // The snapshot is independent from the mapped source object.
    const originalPassiveTalent = UID_CHARACTER_FIXTURE.talents.passive1;
    UID_CHARACTER_FIXTURE.talents.passive1 = 99;
    assert.equal(input.profileSnapshot.talents.passive1, 9);
    UID_CHARACTER_FIXTURE.talents.passive1 = originalPassiveTalent;

    assert.equal(member.schemaVersion, 2);
    assert.equal(member.slot, 3);
    assert.equal(member.role, "support");
    assert.equal(member.enabled, true);
    assert.equal(member.characterId, "10000128");
    assert.equal(member.level, 88);
    assert.equal(member.constellation, 4);
    assert.deepEqual(JSON.parse(JSON.stringify(member.talentLevels)), { normal: 11, skill: 12, burst: 13 });
    assert.deepEqual(JSON.parse(JSON.stringify(member.equipment)), {
        weaponId: "11509",
        weaponLevel: 88,
        refinement: 4,
        artifactSetMode: "4pc",
        artifactSetIds: ["set-a"]
    });
    assert.deepEqual(JSON.parse(JSON.stringify(member.stats)), {
        baseHp: 12345.67,
        baseAtk: 987.65,
        baseDef: 765.43,
        hp: 23456.78,
        atk: 3456.89,
        def: 1234.56,
        elementalMastery: 321
    });
    assert.deepEqual(JSON.parse(JSON.stringify(member.provenance)), {
        source: "uidProfile",
        rawCharacterId: "10000128",
        importedAt: input.provenance.importedAt,
        includesPersistentBonuses: true,
        additivePolicy: "externalModifiersOnly",
        sourceSnapshot: "uidProfile",
        retainedFromUid: true,
        artifactSetCounts: { "set-a": 4, "set-b": 1 }
    });

    assert.equal(member.profileSnapshot.name, "UID display name");
    assert.equal(member.profileSnapshot.talents.passive1, 9);
    assert.equal(member.profileSnapshot.artifacts[4].id, "circlet");
    assert.equal(member.profileSnapshot.stats.critRate, 44.4);
    assert.equal(member.profileSnapshot.stats.elementalDamageDetails[0].element, "pyro");

    // These values are intentionally not guessed or synthesized for support.
    assert.equal(member.nameJa, undefined);
    assert.equal(member.element, undefined);
    assert.equal(member.weaponType, undefined);
    assert.equal(member.equipment.weaponNameJa, undefined);
    assert.equal(member.stats.critRate, undefined);
    assert.equal(member.stats.critDamage, undefined);
    assert.equal(member.stats.energyRecharge, undefined);
    assert.equal(member.stats.elementalDamage, undefined);
    assert.equal(member.provenance.includesPersistentBonuses, true);
    assert.equal(member.provenance.additivePolicy, "externalModifiersOnly");

    const normalized = sandbox.GenshinPartyState.normalizeSupportMember(member, 3);
    assert.equal(normalized.nameJa, "");
    assert.equal(normalized.element, "");
    assert.equal(normalized.weaponType, "");
    assert.equal(normalized.combatState.onField, false);
    assert.equal(normalized.combatState.hpRatio, 100);
    assert.deepEqual(JSON.parse(JSON.stringify(normalized.buffStates)), {});
    assert.equal(normalized.provenance.sourceSnapshot, "uidProfile");
    assert.equal(normalized.provenance.retainedFromUid, true);
    assert.equal(normalized.profileSnapshot.artifacts[4].id, "circlet");
});

test("manual provider edits retain the original UID snapshot without changing combat defaults", () => {
    const api = loadContractAndPartyState().GenshinDataContract;
    const input = api.createCalculationInput(UID_CHARACTER_FIXTURE, "uidProfile");
    const member = api.createPartyMemberFromCalculationInput(input, 2);
    const manuallyEdited = {
        ...member,
        level: 90,
        stats: { ...member.stats, hp: 99999 },
        provenance: { ...member.provenance, source: "mixed", sourceSnapshot: "uidProfile", retainedFromUid: true }
    };
    const normalized = loadContractAndPartyState().GenshinPartyState.normalizeSupportMember(manuallyEdited, 2);
    assert.equal(normalized.provenance.source, "mixed");
    assert.equal(normalized.provenance.sourceSnapshot, "uidProfile");
    assert.equal(normalized.provenance.retainedFromUid, true);
    assert.equal(normalized.stats.hp, 99999);
    assert.equal(normalized.profileSnapshot.stats.hp, 23456.78);
    assert.equal(normalized.combatState.onField, false);
    assert.equal(normalized.combatState.hpRatio, 100);
});

test("artifact loadout modes retain 4pc, 2pc2pc, lone 2pc, and none without inventing a four-piece effect", () => {
    const api = loadContractAndPartyState().GenshinDataContract;
    const loadout = (ids) => api.deriveArtifactSetLoadout(ids.map((setId, index) => ({ id: String(index), setId })));

    assert.deepEqual(JSON.parse(JSON.stringify(loadout(["a", "a", "a", "a", "b"]))), {
        mode: "4pc", setIds: ["a"], counts: { a: 4, b: 1 }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(loadout(["a", "a", "b", "b", "c"]))), {
        mode: "2pc2pc", setIds: ["a", "b"], counts: { a: 2, b: 2, c: 1 }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(loadout(["a", "a"]))), {
        mode: "2pc", setIds: ["a"], counts: { a: 2 }
    });
    assert.deepEqual(JSON.parse(JSON.stringify(loadout(["a"]))), {
        mode: "none", setIds: [], counts: { a: 1 }
    });
});

test("duplicate characters are rejected main-first and support combat state remains a manual boundary", () => {
    const api = loadContractAndPartyState().GenshinPartyState;
    const party = api.normalizePartyState({
        members: [
            { slot: 2, characterId: "main" },
            { slot: 3, characterId: "support" },
            { slot: 4, characterId: "support" }
        ]
    }, { characterId: "main" });

    assert.equal(party.members[1].enabled, false);
    assert.equal(party.members[1].characterId, "");
    assert.equal(party.members[2].enabled, true);
    assert.equal(party.members[2].characterId, "support");
    assert.equal(party.members[3].enabled, false);
    assert.equal(party.members[0].combatState.onField, true);
    assert.equal(party.members[1].combatState.onField, false);
    assert.equal(party.members[2].combatState.onField, false);
});

test("weapon compatibility is an explicit type check, not an ID or name guess", () => {
    const source = read("games/js/genshinPartyState.js");
    assert.match(source, /selectedWeapon\?\.weaponType === character\.weaponType/);
    assert.match(source, /item\.weaponType !== character\.weaponType\) return false/);
});

test("support slot edits switch UID provenance to manual outside the import transaction", () => {
    const source = read("games/js/genshinPartyState.js");
    assert.match(source, /const handleChange = \(\) => \{\s*if \(!applyingImportedMember\) input\.dataset\.valueOrigin = "manual";/);
    assert.match(source, /input\.addEventListener\("input", handleChange\)/);
    assert.match(source, /input\.addEventListener\("change", handleChange\)/);
});

test("final support provenance carries UID persistence flags and artifact counts", () => {
    const source = read("games/js/genshinPartyState.js");
    assert.match(source, /includesPersistentBonuses: isUidCharacter \? imported\?\.provenance\?\.includesPersistentBonuses/);
    assert.match(source, /additivePolicy: isUidCharacter \? imported\?\.provenance\?\.additivePolicy/);
    assert.match(source, /artifactSetCounts: isUidCharacter/);
    assert.ok(source.includes("...(imported?.provenance?.artifactSetCounts || {})"));
});

test("talent order fixture maps numeric UID IDs independently of insertion order", () => {
    const sandbox = createScriptSandbox();
    vm.runInContext(read("games/js/genshinProfileMapper.js"), sandbox, { filename: "genshinProfileMapper.js" });
    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: [{
            avatarId: "10000037",
            skillDepotId: 3701,
            propMap: { 4001: { val: 90 } },
            skillLevelMap: { "10373": 10, "10371": 11, "10372": 9 },
            proudSkillExtraLevelMap: { "3732": 3, "3739": 3 },
            fightPropMap: {},
            equipList: []
        }]
    });

    // The insertion order is intentionally burst, normal, skill. SkillDepot
    // metadata, rather than Object.values order, determines the three groups.
    assert.deepEqual(JSON.parse(JSON.stringify(mapped.characters[0].talents)), {
        normal: 11, skill: 12, burst: 13
    });
    assert.equal(mapped.characters[0].provenance.talentLevelMapping.status, "resolved");
});
