"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const vm = require("node:vm");
const {
    readText, readJson, loadProductionFixture, attackOf, makeRequest,
    independentDirectDamage, assertClose, fixedSourceSha
} = require("./helpers/hsrDirectVerification.cjs");

const coneRanks = [0.20, 0.24, 0.28, 0.32, 0.36];
const makeMapper = () => {
    const window = {};
    vm.runInNewContext(readText("games/js/hsrProfileMapper.js"), { window });
    return window.HsrProfileMapper;
};

function profileFixture({ rank = 1, ehr = 0.8, cone = "21041", path = "Warlock", relicSet = "", pieces = 0, atkRatio = 0, atkFlat = 0 } = {}) {
    const catalog = readJson("games/hsr/data/catalog.json");
    const character = catalog.characters.find((item) => item.id === "1006");
    character.path = path;
    const coneData = catalog.lightCones.find((item) => item.id === cone);
    const equipment = cone ? {
        tid: cone, level: 80, rank,
        _flat: { props: [
            { type: "BaseHP", value: coneData?.base.hp || 0 },
            { type: "BaseAttack", value: coneData?.base.atk || 0 },
            { type: "BaseDefence", value: coneData?.base.def || 0 }
        ] }
    } : undefined;
    const relicCount = Math.max(pieces, ehr > 0 ? 1 : 0);
    const relicList = Array.from({ length: relicCount }, (_, index) => ({
        tid: `relic-${index}`,
        _flat: {
            setID: index < pieces ? relicSet : "",
            props: [{ type: "StatusProbabilityBase", value: index === 0 ? ehr : 0 }, { type: "AttackAddedRatio", value: atkRatio / Math.max(1, pieces) }, { type: "AttackDelta", value: index === 0 ? atkFlat : 0 }]
        }
    }));
    const response = { detailInfo: { avatarDetailList: [{
        avatarId: "1006", level: 80, rank: 0, equipment,
        skillTreeList: [], relicList
    }] } };
    return makeMapper().mapProfileResponse(response, catalog).characters[0];
}

async function checkAttack(engine, data, profile, label) {
    const attack = attackOf(data, "100601");
    const request = makeRequest(attack, 10, {
        atk: profile.stats.atk, baseAtk: 0, critRate: 37.5, critDamage: 88.25,
        enemyLevel: 82, resistance: 17, weakness: true, toughnessActive: false
    });
    const expected = independentDirectDamage(request);
    const actual = engine.calculate(request);
    assert.notEqual(actual.supported, false, `${label}: attack should calculate`);
    for (const key of ["nonCrit", "crit", "expected"]) assertClose(actual[key], expected[key], `${label} attack ${key}`);
}

test("Round48 UID mapper applies LC21041's threshold ATK once at each S1-S5 rank", async () => {
    assert.equal(fixedSourceSha, "dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487");
    const { data, engine } = await loadProductionFixture();
    for (let rank = 1; rank <= 5; rank++) {
        for (const ehr of [0.799999, 0.8, 0.800001]) {
            const profile = profileFixture({ rank, ehr });
            const catalog = readJson("games/hsr/data/catalog.json");
            const baseAtk = catalog.characters.find((item) => item.id === "1006").base.atk + catalog.lightCones.find((item) => item.id === "21041").base.atk;
            const expectedAtk = baseAtk * (1 + (ehr >= 0.8 ? coneRanks[rank - 1] : 0));
            assertClose(profile.stats.atk, expectedAtk, `LC21041 S${rank}, EHR=${ehr} reconstructed ATK`);
            assertClose(profile.stats.effectHitRate, ehr * 100, `LC21041 S${rank}, EHR display`);
            await checkAttack(engine, data, profile, `LC21041 S${rank}, EHR=${ehr}`);
        }
    }
});

test("Round48 mapper excludes LC21041 conversion on path mismatch, absent equipment, or incomplete UID stats", () => {
    const mismatched = profileFixture({ rank: 5, ehr: 1, path: "Rogue" });
    const catalog = readJson("games/hsr/data/catalog.json");
    const baseAtk = catalog.characters.find((item) => item.id === "1006").base.atk + catalog.lightCones.find((item) => item.id === "21041").base.atk;
    assertClose(mismatched.stats.atk, baseAtk, "path mismatch only keeps base ATK");

    const noCone = profileFixture({ cone: "", ehr: 1 });
    assertClose(noCone.stats.atk, catalog.characters.find((item) => item.id === "1006").base.atk, "unequipped cone cannot contribute ATK");

    const mapper = makeMapper();
    const character = catalog.characters.find((item) => item.id === "1006");
    const incomplete = mapper.mapProfileResponse({ detailInfo: { avatarDetailList: [{
        avatarId: "1006", level: 80, equipment: { tid: "21041", level: 80, rank: 5, _flat: { props: [] } },
        relicList: [{ _flat: { props: [{ type: "StatusProbabilityBase", value: 1 }] } }]
    }] } }, { ...catalog, characters: [character] }).characters[0];
    assert.equal(incomplete.stats.atk, undefined, "missing UID base properties must not be interpolated or converted");
});

test("Round48 UID mapper applies 303's EHR conversion linearly and caps it at 25%", async () => {
    const { data, engine } = await loadProductionFixture();
    const catalog = readJson("games/hsr/data/catalog.json");
    const baseAtk = catalog.characters.find((item) => item.id === "1006").base.atk;
    for (const [ehr, expectedRatio] of [[0.3999, 0.3999 * 0.25], [0.4, 0.1], [0.8999, 0.8999 * 0.25], [0.9, 0.25], [1.2, 0.25]]) {
        // Two-piece set grants 10% EHR. `ehr` is the raw gear EHR; the conversion
        // uses that final value after the set property, and ATK conversion is capped.
        const profile = profileFixture({ cone: "", ehr, relicSet: "303", pieces: 2 });
        const totalEhr = ehr + 0.1;
        const ratio = Math.min(0.25, totalEhr * 0.25);
        const expectedAttackRatio = Math.min(0.25, expectedRatio + (ehr < 0.9 ? 0.025 : 0));
        assertClose(profile.stats.effectHitRate, totalEhr * 100, `303 EHR display ${ehr}`);
        assertClose(profile.stats.atk, baseAtk * (1 + ratio), `303 EHR ${ehr} ATK`);
        assertClose(expectedAttackRatio, ratio, `independent 303 conversion ${ehr}`);
        await checkAttack(engine, data, profile, `303 EHR ${ehr}`);
    }
    const onePiece = profileFixture({ cone: "", ehr: 0.9, relicSet: "303", pieces: 1 });
    assertClose(onePiece.stats.atk, baseAtk, "303 requires two pieces");
});

test("Round48 LC21041 and ornament303 conversions compose once in reconstructed UID ATK", async () => {
    const { data, engine } = await loadProductionFixture();
    const profile = profileFixture({ rank: 5, ehr: 0.7, relicSet: "303", pieces: 2, atkRatio: 0.12, atkFlat: 217.875 });
    const catalog = readJson("games/hsr/data/catalog.json");
    const baseAtk = catalog.characters.find((item) => item.id === "1006").base.atk + catalog.lightCones.find((item) => item.id === "21041").base.atk;
    const expectedAtk = baseAtk * (1 + 0.12 + 0.2 + 0.36) + 217.875;
    assertClose(profile.stats.effectHitRate, 80, "set EHR reaches LC threshold");
    assertClose(profile.stats.atk, expectedAtk, "each UID conversion is added once to ATK ratio");
    await checkAttack(engine, data, profile, "combined LC21041 S5 and ornament303");
});
