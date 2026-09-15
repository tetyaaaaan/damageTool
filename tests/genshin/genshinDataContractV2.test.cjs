const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "../..");
const { audit } = require(path.join(ROOT, "scripts", "genshinDataContractAudit.cjs"));

function loadContract() {
    const sandbox = { window: {}, Date };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "games/js/genshinDataContract.js"), "utf8"), sandbox);
    return sandbox.window;
}

const DIGEST = "a".repeat(64);
function humanProof(subjectId, field, sourceRefs, reviewedBy = "reviewer", reviewedAt = "2026-08-15T00:00:00.000Z") {
    const attestationId = `${subjectId}:${field}:human:attestation`;
    return {
        verificationAttestation: {
            schemaVersion: 1, attestationId, verificationMode: "human", type: "humanReview", subjectId, claimField: field,
            attestedAt: reviewedAt, actor: { kind: "human", id: reviewedBy }, decision: "approve",
            engine: { name: "test", version: "1" }, policy: { id: "test", version: "1", digest: DIGEST },
            sourceBundle: sourceRefs.map((sourceRef, index) => ({ sourceRef, provider: `provider-${index}`, independenceGroup: `family-${index}`, revision: `rev-${index}`, fileDigest: DIGEST, gameVersion: "6.0" })),
            requiredFields: [field], normalization: { id: "identity", version: "1", digest: DIGEST },
            exactRevisions: sourceRefs.map((sourceRef, index) => ({ sourceRef, revision: `rev-${index}`, fileDigest: DIGEST })),
            gameVersion: { value: "6.0", sourceRefs }, comparison: { status: "match", digests: { [field]: DIGEST } },
            semanticStatus: "match", scopeStatus: "match"
        },
        eligibilityCertificate: {
            schemaVersion: 1, certificateId: `${subjectId}:${field}:human:certificate`, status: "eligible", subjectId,
            claimField: field, verificationMode: "human", attestationId, issuedAt: reviewedAt, comparisonDigest: DIGEST,
            scope: { subjectId, claimField: field }
        }
    };
}

test("v2 character packages resolve raw, spec, and runtime references", () => {
    const result = audit();
    assert.equal(result.status, "passed", result.errors.join("\n"));
    assert.equal(result.summary.characterPackages, 8);
    assert.ok(result.summary.runtimeRecords > 0);
    assert.ok(result.summary.provenanceCounts.legacyCompatible > 0);
});

test("browser manifest gate validates dataset contracts and safe relative paths", () => {
    const api = loadContract().GenshinDataContract;
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/data-v2-manifest.json"), "utf8"));
    assert.deepEqual(JSON.parse(JSON.stringify(api.validateManifest(manifest))), []);

    const malformed = JSON.parse(JSON.stringify(manifest));
    malformed.datasets.canonicalRuntime.path = "../canonical-runtime.json";
    malformed.datasets.canonicalRuntime.layer = "spec";
    malformed.datasets.canonicalRuntime.authority = "candidateRegistry";
    delete malformed.datasets.behaviorBatches;
    malformed.characterPackages.push(malformed.characterPackages[0]);
    const warnings = api.validateManifest(malformed).join("\n");
    assert.match(warnings, /datasets\.behaviorBatches is missing/);
    assert.match(warnings, /canonicalRuntime\.path is unsafe or invalid/);
    assert.match(warnings, /canonicalRuntime must be verifiedGenerated runtime data/);
    assert.match(warnings, /contains duplicate/);
});

test("v2 runtime gate rejects unreviewed and unreviewed AI interpretations", () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "games/js/genshinDataContract.js"), "utf8"), sandbox);
    const assess = sandbox.window.GenshinDataContract.assessRuntimeEligibility;

    assert.equal(assess({ id: "legacy" }).mode, "legacyCompatible");
    assert.equal(assess({ provenance: { sourceRefs: ["source:1"], interpretation: { method: "aiAssisted" }, verification: { status: "unreviewed" } } }).eligible, false);
    assert.equal(assess({ provenance: { sourceRefs: ["source:1"], interpretation: { method: "aiAssisted" }, verification: { status: "verified", reviewedBy: null } } }).eligible, false);
    assert.equal(assess({ provenance: {
        sourceRefs: ["official:1", "oss:1"], gameVersion: "6.0",
        independenceGroups: ["official", "independent-implementation"],
        interpretation: { method: "aiAssisted", author: "parser-agent" },
        verification: { status: "verified", reviewedBy: "parser-agent", reviewedAt: "2026-08-15T00:00:00.000Z", sourceAgreement: "agreed", independentSourceCount: 2 }
    } }).eligible, false);
    const runtimeClaim = { status: "verified", sourceRefs: ["official:1", "oss:1"], ...humanProof("runtime:1", "value", ["official:1", "oss:1"]) };
    assert.equal(assess({ id: "runtime:1", provenance: {
        specId: "runtime:1",
        sourceRefs: ["official:1", "oss:1"],
        independenceGroups: ["official", "independent-implementation"],
        gameVersion: "6.0",
        interpretation: { method: "human" },
        verification: { status: "verified", verificationMode: "human", reviewedBy: "reviewer", reviewedAt: "2026-08-15T00:00:00.000Z", sourceAgreement: "agreed", independentSourceCount: 2, claims: { value: runtimeClaim } }
    } }).eligible, true);
});

test("canonical Spec requires two-source agreement for every verified claim", () => {
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "games/js/genshinDataContract.js"), "utf8"), sandbox);
    const assess = sandbox.window.GenshinDataContract.assessSpecRuntimeEligibility;
    const base = {
        id: "spec:1",
        sourceRefs: ["local:weapon:1", "gcsim:weapon:1"],
        interpretation: { method: "human" },
        verification: {
            status: "verified",
            verificationMode: "human",
            sourceAgreement: "agreed",
            reviewedBy: "Sol",
            reviewedAt: "2026-08-15T00:00:00.000Z",
            claims: { value: { status: "verified", sourceRefs: ["local:weapon:1", "gcsim:weapon:1"], ...humanProof("spec:1", "value", ["local:weapon:1", "gcsim:weapon:1"], "Sol") } }
        }
    };
    const sources = {
        "local:weapon:1": { provider: "officialDataset", independenceGroup: "official", gameVersion: "6.0" },
        "gcsim:weapon:1": { provider: "gcsim", independenceGroup: "gcsim-implementation", gameVersion: "6.0" }
    };
    assert.equal(assess(base, sources).eligible, true);
    assert.equal(assess({ ...base, interpretation: { method: "aiAssisted", author: "Sol" } }, sources).eligible, false);
    assert.equal(assess({ ...base, sourceRefs: ["local:weapon:1"] }, sources).eligible, false);
    assert.equal(assess({ ...base, verification: { ...base.verification, claims: { value: { status: "needsReview", sourceRefs: ["local:weapon:1"] } } } }, sources).eligible, false);
    assert.equal(assess(base, {
        "local:weapon:1": { provider: "sameProvider", independenceGroup: "official", gameVersion: "6.0" },
        "gcsim:weapon:1": { provider: "sameProvider", independenceGroup: "gcsim-implementation", gameVersion: "6.0" }
    }).eligible, false);
    assert.equal(assess(base, {
        "local:weapon:1": { provider: "officialDataset", independenceGroup: "GenshinData-derived", gameVersion: "6.0" },
        "gcsim:weapon:1": { provider: "differentProviderName", independenceGroup: "GenshinData-derived", gameVersion: "6.0" }
    }).eligible, false);
    assert.equal(assess(base, {
        "local:weapon:1": { provider: "officialDataset", independenceGroup: "official", gameVersion: null },
        "gcsim:weapon:1": { provider: "gcsim", independenceGroup: "gcsim-implementation", gameVersion: "6.0" }
    }).eligible, false);
    assert.equal(assess(base, {
        "local:weapon:1": { provider: "officialDataset", independenceGroup: "official", gameVersion: "6.0" },
        "gcsim:weapon:1": { provider: "gcsim", independenceGroup: "gcsim-implementation", gameVersion: "6.1" }
    }).eligible, false);
});

test("UID characters normalize to the shared calculation input model", () => {
    const sandbox = { window: {}, Date };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "games/js/genshinDataContract.js"), "utf8"), sandbox);
    const input = sandbox.window.GenshinDataContract.createCalculationInput({
        id: "10000037",
        level: 90,
        constellation: 1,
        talents: { normal: 10, skill: 9, burst: 9 },
        weapon: { id: "15502", rank: 1 },
        artifacts: [{ setId: "15001" }],
        stats: { atk: 2100 }
    }, "uidProfile");
    assert.equal(input.schemaVersion, 2);
    assert.equal(input.source, "uidProfile");
    assert.equal(input.characterId, "10000037");
    assert.equal(input.weapon.id, "15502");
    assert.equal(input.stats.atk, 2100);
});

test("UID calculation inputs normalize into support members without inventing combat state", () => {
    const sandbox = loadContract();
    const api = sandbox.GenshinDataContract;
    const fourPiece = api.deriveArtifactSetLoadout([
        { setId: "15001" }, { setId: "15001" }, { setId: "15001" }, { setId: "15001" }, { setId: "15002" }
    ]);
    const mixed = api.deriveArtifactSetLoadout([
        { setId: "15001" }, { setId: "15001" }, { setId: "15002" }, { setId: "15002" }, { setId: "15003" }
    ]);
    const lone = api.deriveArtifactSetLoadout([{ setId: "15001" }, { setId: "15001" }]);
    assert.deepEqual(JSON.parse(JSON.stringify(fourPiece)), { mode: "4pc", setIds: ["15001"], counts: { "15001": 4, "15002": 1 } });
    assert.equal(mixed.mode, "2pc2pc");
    assert.equal(lone.mode, "2pc");

    const member = api.createPartyMemberFromCalculationInput({
        schemaVersion: 2,
        source: "uidProfile",
        characterId: "10000032",
        level: 90,
        constellation: 6,
        talents: { normal: 6, skill: 9, burst: 13 },
        weapon: { id: "11501", level: 90, rank: 5 },
        artifacts: [{ setId: "15001" }, { setId: "15001" }],
        stats: { baseHp: 12000, baseAtk: 800, baseDef: 700, hp: 30000, atk: 1800, def: 900, elementalMastery: 100 },
        provenance: { rawCharacterId: "10000032", importedAt: "2026-08-15T00:00:00.000Z" }
    }, 3);
    assert.equal(member.slot, 3);
    assert.equal(member.equipment.artifactSetMode, "2pc");
    assert.equal(member.stats.baseAtk, 800);
    assert.equal(member.combatState.onField, false);
    assert.equal(member.combatState.hpRatio, 100);
    assert.deepEqual(JSON.parse(JSON.stringify(member.buffStates)), {});
    assert.equal(member.provenance.source, "uidProfile");
    assert.equal(member.provenance.includesPersistentBonuses, true);
    assert.equal(member.provenance.additivePolicy, "externalModifiersOnly");
});

test("UID import does not substitute unrelated character, weapon, or artifact IDs", () => {
    const importer = fs.readFileSync(path.join(ROOT, "games/js/genshinUidImporter.js"), "utf8");
    const mapper = fs.readFileSync(path.join(ROOT, "games/js/genshinProfileMapper.js"), "utf8");
    assert.match(importer, /uid\.length > 10/);
    assert.doesNotMatch(importer, /character\.id \|\| "10000037"/);
    assert.doesNotMatch(importer, /weapon\.id \|\| "15502"/);
    assert.doesNotMatch(mapper, /reliquary\?\.mainPropId/);
});

test("Fruitful Hook asks for the activation cause instead of a nonexistent stack result", () => {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/calc/weapon-effect-registry.json"), "utf8"));
    const group = registry.weapons["12430"].groups.find((item) => item.id === "fruitful_hook_hit_buff");
    assert.equal(group.activation.type, "toggle");
    assert.equal(group.activation.stateKey, "fruitfulHookHitBuff");
    assert.equal(group.modifierOverrides.w_12430_damageBonus_c7243261.stack, null);
    assert.doesNotMatch(group.activation.label, /層|段階/);
});

test("Athame Artis transient ATK buffs share the burst-hit state and are not marked reflected", () => {
    const registry = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/calc/weapon-effect-registry.json"), "utf8"));
    const groups = registry.weapons["11518"].groups;
    const self = groups.find((item) => item.id === "black_eclipse_self_atk");
    const team = groups.find((item) => item.id === "black_eclipse_active_character_atk");
    assert.equal(self.inputPolicy, "calculate");
    assert.equal(self.activation.type, "toggle");
    assert.equal(self.activation.stateKey, "blackEclipseDaylightBlade");
    assert.equal(team.activation.stateKey, self.activation.stateKey);
    assert.match(self.description, /3秒間/);
});

test("behavior contracts separate attack multiplicity from lifecycle and support shared operations", () => {
    const behavior = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/schema/behavior-spec.schema.json"), "utf8"));
    const modifier = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/schema/behavior-modifier.schema.json"), "utf8"));
    assert.ok(behavior.properties.execution.properties.hitCount);
    assert.ok(behavior.properties.execution.properties.attackSpeed);
    assert.ok(behavior.properties.execution.properties.maxTriggers);
    assert.ok(behavior.properties.timing.properties.tickInterval);
    assert.ok(behavior.properties.triggers);
    assert.ok(behavior.properties.stackRules);
    assert.ok(behavior.properties.stateMachine);
    assert.ok(behavior.properties.actor);
    assert.ok(behavior.properties.enemyCountBehavior);
    ["triggers", "stackRules", "stateMachine", "actor", "enemyCountBehavior"].forEach((section) => {
        assert.match(modifier.properties.path.pattern, new RegExp(section));
    });
    assert.deepEqual(modifier.properties.operation.enum, ["add", "multiply", "replace", "reset", "extend", "consume", "setMaximum", "ignoreCooldown", "refresh"]);
});

test("external source catalog pins independent implementations by revision and digest", () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, "games/genshin/data/v2/source-catalog.json"), "utf8"));
    assert.match(catalog.sources.genshinDb.revision, /^[a-f0-9]{40}$/);
    assert.match(catalog.sources.gcsim.revision, /^[a-f0-9]{40}$/);
    assert.notEqual(catalog.sources.genshinDb.independenceGroup, catalog.sources.gcsim.independenceGroup);
    assert.equal(Object.keys(catalog.records).length, 18);
    assert.equal(Object.keys(catalog.records).filter((id) => id.startsWith("gcsim:weapon:")).length, 9);
    assert.equal(Object.keys(catalog.records).filter((id) => id.startsWith("genshinDb:weapon:")).length, 9);
    Object.values(catalog.records).forEach((record) => assert.match(record.sha256, /^[a-f0-9]{64}$/));
});
