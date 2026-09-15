const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function createSandbox() {
    const sandbox = { console, Date };
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

function mapAvatar(avatar) {
    const sandbox = createSandbox();
    vm.runInContext(read("games/js/genshinProfileMapper.js"), sandbox, { filename: "genshinProfileMapper.js" });
    return sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: [{
            avatarId: "10000037",
            propMap: { 4001: { val: 90 } },
            fightPropMap: {},
            equipList: [],
            ...avatar
        }]
    }).characters[0];
}

function json(value) {
    return JSON.parse(JSON.stringify(value));
}

test("local talent scaling metadata pins canonical combat IDs", () => {
    const data = JSON.parse(read("games/genshin/data/calc/talent-scalings.json"));
    const byGroup = ["normalAttack", "skill", "burst"].map((group) =>
        data["10000037"][group].entries[0].source.talentKey
    );
    assert.deepEqual(byGroup, ["combat1", "combat2", "combat3"]);
});

test("explicit combat IDs map by key, not Object insertion order", () => {
    const mapped = mapAvatar({ skillLevelMap: { combat3: 13, combat1: 11, combat2: 12 } });
    assert.deepEqual(json(mapped.talents), { normal: 11, skill: 12, burst: 13 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "resolved");
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.rawById), { combat3: 13, combat1: 11, combat2: 12 });
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.missingIds), []);
});

test("numeric UID skill IDs map through skillDepotId and include constellation talent bonuses", () => {
    const mapped = mapAvatar({
        skillDepotId: 3701,
        skillLevelMap: { "10373": 10, "10371": 9, "10372": 8 },
        proudSkillExtraLevelMap: { "3739": 3, "3732": 3 }
    });
    assert.deepEqual(json(mapped.talents), { normal: 9, skill: 11, burst: 13 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "resolved");
    assert.equal(mapped.provenance.talentLevelMapping.source, "skillDepotId");
    assert.equal(mapped.provenance.talentLevelMapping.skillDepotId, "3701");
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.extraByGroup), { normal: 0, skill: 3, burst: 3 });
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.missingIds), []);
});

test("traveler talent IDs are resolved by elemental skillDepotId", () => {
    const anemo = mapAvatar({
        avatarId: "10000005",
        skillDepotId: 504,
        skillLevelMap: { "10068": 9, "100543": 6, "10067": 8 }
    });
    const dendro = mapAvatar({
        avatarId: "10000005",
        skillDepotId: 508,
        skillLevelMap: { "10118": 9, "100547": 6, "10117": 8 }
    });
    assert.deepEqual(json(anemo.talents), { normal: 6, skill: 8, burst: 9 });
    assert.deepEqual(json(dendro.talents), { normal: 6, skill: 8, burst: 9 });
});

test("unknown UID skill IDs fail closed and retain raw levels", () => {
    const mapped = mapAvatar({ skillDepotId: 3701, skillLevelMap: { "103": 13, "101": 11, "102": 12 } });
    assert.deepEqual(json(mapped.talents), { normal: 1, skill: 1, burst: 1 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.rawById), { "103": 13, "101": 11, "102": 12 });
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.unmappedIds), ["101", "102", "103"]);
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.missingIds), ["10371", "10372", "10373"]);
});

test("partial or conflicting explicit IDs fail closed", () => {
    const partial = mapAvatar({ skillDepotId: 3701, skillLevelMap: { "10371": 11, "10372": 12 } });
    assert.equal(partial.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(partial.talents), { normal: 1, skill: 1, burst: 1 });
    assert.deepEqual(json(partial.provenance.talentLevelMapping.missingIds), ["10373"]);

    const conflict = mapAvatar({ skillLevelMap: { combat1: 11, COMBAT1: 12, combat2: 12, combat3: 13 } });
    assert.equal(conflict.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(conflict.talents), { normal: 1, skill: 1, burst: 1 });
    assert.deepEqual(json(conflict.provenance.talentLevelMapping.conflictingIds), ["COMBAT1"]);
});

test("CalculationInput and support projection preserve talent mapping provenance", () => {
    const sandbox = createSandbox();
    vm.runInContext(read("games/js/genshinDataContract.js"), sandbox, { filename: "genshinDataContract.js" });
    const mapped = mapAvatar({ skillDepotId: 3701, skillLevelMap: { "103": 13, "101": 11, "102": 12 } });
    const input = sandbox.GenshinDataContract.createCalculationInput(mapped, "uidProfile");
    const member = sandbox.GenshinDataContract.createPartyMemberFromCalculationInput(input, 2);
    assert.deepEqual(json(input.provenance.talentLevelMapping), json(mapped.provenance.talentLevelMapping));
    assert.deepEqual(json(member.provenance.talentLevelMapping), json(mapped.provenance.talentLevelMapping));
    assert.deepEqual(json(member.talentLevels), { normal: 1, skill: 1, burst: 1 });
});

test("mapper has no raw Object.values talent assignment path", () => {
    const source = read("games/js/genshinProfileMapper.js");
    assert.doesNotMatch(source, /Object\.values\(raw\)/);
    assert.match(source, /TALENT_GROUP_BY_SKILL_ID/);
    assert.match(source, /combat1:\s*"normal"/);
    assert.match(source, /combat2:\s*"skill"/);
    assert.match(source, /combat3:\s*"burst"/);
    assert.match(source, /resolveUidTalentSkillMap/);
    assert.match(source, /proudSkillExtraLevelMap/);
});

test("UID talent map is revision-pinned and every depot has three distinct skills", () => {
    const data = JSON.parse(read("games/genshin/data/uid-talent-skill-map.json"));
    assert.equal(data.source.revision, "16c6291c3b3f62ce753f036718fb2011059f3882");
    assert.match(data.source.gameVersion, /CNRELWin7\.0\.0/);
    assert.ok(Object.keys(data.bySkillDepotId).length >= 120);
    for (const [depotId, entry] of Object.entries(data.bySkillDepotId)) {
        const ids = [entry.skillIds.normal, entry.skillIds.skill, entry.skillIds.burst];
        assert.equal(ids.every((id) => /^\d+$/.test(id) && id !== "0"), true, depotId);
        assert.equal(new Set(ids).size, 3, depotId);
        assert.equal(["normal", "skill", "burst"].every((group) => /^\d+$/.test(entry.proudSkillGroupIds[group])), true, depotId);
    }
});

test("browser resolver loads the UID talent map before numeric profile mapping", async () => {
    const uidTalentMap = JSON.parse(read("games/genshin/data/uid-talent-skill-map.json"));
    const sandbox = { console, Date };
    sandbox.window = sandbox;
    sandbox.fetch = async (url) => ({
        ok: true,
        async json() {
            return String(url).endsWith("/uid-talent-skill-map.json") ? uidTalentMap : {};
        }
    });
    vm.createContext(sandbox);
    vm.runInContext(read("games/js/genshinIdResolver.js"), sandbox, { filename: "genshinIdResolver.js" });
    await sandbox.GenshinIdResolver.ready;
    vm.runInContext(read("games/js/genshinProfileMapper.js"), sandbox, { filename: "genshinProfileMapper.js" });

    const mapped = sandbox.GenshinProfileMapper.mapProfileResponse({
        playerInfo: { uid: "800000000" },
        avatarInfoList: [{
            avatarId: "10000037",
            skillDepotId: 3701,
            propMap: { 4001: { val: 90 } },
            skillLevelMap: { "10373": 10, "10371": 9, "10372": 8 },
            proudSkillExtraLevelMap: { "3732": 3, "3739": 3 },
            fightPropMap: {},
            equipList: []
        }]
    }).characters[0];
    assert.deepEqual(json(mapped.talents), { normal: 9, skill: 11, burst: 13 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "resolved");
});
