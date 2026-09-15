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

test("unknown UID skill IDs fail closed and retain raw levels", () => {
    const mapped = mapAvatar({ skillLevelMap: { "103": 13, "101": 11, "102": 12 } });
    assert.deepEqual(json(mapped.talents), { normal: 1, skill: 1, burst: 1 });
    assert.equal(mapped.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.rawById), { "103": 13, "101": 11, "102": 12 });
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.unmappedIds), ["101", "102", "103"]);
    assert.deepEqual(json(mapped.provenance.talentLevelMapping.missingIds), ["combat1", "combat2", "combat3"]);
});

test("partial or conflicting explicit IDs fail closed", () => {
    const partial = mapAvatar({ skillLevelMap: { combat1: 11, combat2: 12 } });
    assert.equal(partial.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(partial.talents), { normal: 1, skill: 1, burst: 1 });
    assert.deepEqual(json(partial.provenance.talentLevelMapping.missingIds), ["combat3"]);

    const conflict = mapAvatar({ skillLevelMap: { combat1: 11, COMBAT1: 12, combat2: 12, combat3: 13 } });
    assert.equal(conflict.provenance.talentLevelMapping.status, "unresolved");
    assert.deepEqual(json(conflict.talents), { normal: 1, skill: 1, burst: 1 });
    assert.deepEqual(json(conflict.provenance.talentLevelMapping.conflictingIds), ["COMBAT1"]);
});

test("CalculationInput and support projection preserve talent mapping provenance", () => {
    const sandbox = createSandbox();
    vm.runInContext(read("games/js/genshinDataContract.js"), sandbox, { filename: "genshinDataContract.js" });
    const mapped = mapAvatar({ skillLevelMap: { "103": 13, "101": 11, "102": 12 } });
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
});
