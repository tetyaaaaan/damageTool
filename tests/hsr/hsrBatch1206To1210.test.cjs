const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadHsrDataFiles } = require("../../scripts/lib/hsrDataFiles.cjs");

const root = path.resolve(__dirname, "../..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const registered = loadHsrDataFiles(root);
const attacks = new Map(registered.attackOverrides.map((attack) => [String(attack.id), attack]));
const runtime = require(path.join(root, "games/js/hsrModifierRuntime.js"));
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(root, "games/js/hsrCalcEngine.js"), "utf8"), { window });
const engine = window.HsrCalcEngine;
const records = registered.modifiers;
const context = (characterId, extra = {}) => ({ characterId, eidolon:0, traceLevelFor:() => 10, stats:{hp:5000,hpPercent:100,atk:1000,critRate:5,critDamage:50}, enemy:{hpPercent:100}, ...extra });
const candidate = (id, ctx, inputs = {}) => runtime.buildCandidates(records, ctx, inputs).find((item) => item.id === id);

test("1206-1210 reviewed attack batch is generated from explicit parameter positions", () => {
  const generated = readJson("games/hsr/data/calc/attacks-1206-1210.json");
  assert.equal(generated.overrides.length, 31);
  assert.equal(attacks.get("120602").multipliers[9], 210);
  assert.equal(attacks.get("1206031").multipliers[9], 50);
  assert.equal(attacks.get("1206031").hitCount, 2);
  assert.equal(attacks.get("120803").scalingStat, "hp");
  assert.equal(attacks.get("121002").adjacentMultipliers[9], 40);
  assert.equal(attacks.get("121007").hitCount, 4);
});

test("Sushang sword-stance stacks reach only reviewed sword-stance attack IDs", () => {
  const buff = candidate("traceNode:1206:1206102:sword-stance", context("1206"), { "sushang-sword-stance-stacks":4 });
  assert.equal(buff.value, 10);
  assert.equal(runtime.applicableToAttack(buff, { id:"1206021",type:"additional",element:"Physical" }), true);
  assert.equal(runtime.applicableToAttack(buff, { id:"120607",type:"additional",element:"Physical" }), false);
});

test("Yukong party buffs use the selected trace level and E4 stays self-only", () => {
  const party = candidate("trace:1207:120702:party-atk", context("1206", { partyIds:["1207"] }), { "yukong-roaring-bowstrings-active":true });
  assert.equal(party.value, 80);
  assert.equal(party.target.owner, "partyAll");
  const e4Self = candidate("eidolon:1207:4:self-damage", context("1207", { eidolon:4 }), { "yukong-roaring-bowstrings-active":true });
  const e4Party = candidate("eidolon:1207:4:self-damage", context("1206", { partyIds:["1207"],partyEidolons:{"1207":4} }), { "yukong-roaring-bowstrings-active":true });
  assert.equal(e4Self.value, 30);
  assert.equal(e4Party, undefined);
});

test("Fu Xuan Matrix converts the provider HP percentage to a flat party HP value", () => {
  const buff = candidate("trace:1208:120802:party-hp", context("1206", { partyIds:["1208"],partyStats:{"1208":{hp:8000}} }), { "fuxuan-matrix-active":true });
  assert.equal(buff.value, 480);
  assert.equal(buff.unit, "flat");
  const e6 = candidate("eidolon:1208:6:ultimate-hp-loss", context("1208", { eidolon:6 }), { "fuxuan-e6-lost-hp-percent":120 });
  assert.equal(e6.value, 240);
  assert.equal(runtime.applicableToAttack(e6, { id:"120803",type:"ultimate",element:"Quantum" }), true);
  assert.equal(runtime.applicableToAttack(e6, { id:"120801",type:"normal",element:"Quantum" }), false);
});

test("Yanqing automatic HP threshold and exact attack scope do not leak", () => {
  const ultCrit = candidate("trace:1209:120903:ultimate-crit-rate", context("1209"));
  assert.equal(ultCrit.value, 60);
  assert.equal(runtime.applicableToAttack(ultCrit, { id:"120903",type:"ultimate",element:"Ice" }), true);
  assert.equal(runtime.applicableToAttack(ultCrit, { id:"120902",type:"skill",element:"Ice" }), false);
  const activeE4 = candidate("eidolon:1209:4:res-pen", context("1209", { eidolon:4,stats:{hpPercent:80} }));
  const inactiveE4 = candidate("eidolon:1209:4:res-pen", context("1209", { eidolon:4,stats:{hpPercent:79} }));
  assert.equal(activeE4.enabled, true);
  assert.equal(inactiveE4.enabled, false);
});

test("Guinaifen E2 scales both direct Burn and the ultimate detonation at the correct stage", () => {
  const e2 = candidate("eidolon:1210:2:burn-multiplier", context("1210", { eidolon:2 }), { "enemy-burning":true });
  const burn = attacks.get("1210021");
  const detonation = attacks.get("1210031");
  const baseRequest = { character:{level:80,stats:{atk:1000,hp:3000,def:500,critRate:0,critDamage:50,damageBonus:0}},enemy:{level:80,resistance:0,toughnessActive:false},modifiers:[e2] };
  const burnResult = engine.calculate({ ...baseRequest, attack:{ ...burn,attackType:burn.type,multiplier:burn.multipliers[9] } });
  const detonationResult = engine.calculate({ ...baseRequest, attack:{ ...detonation,attackType:detonation.type,multiplier:detonation.multipliers[9],multiplierAdditionScale:detonation.multiplierAdditionScaleValues[9] } });
  assert.ok(Math.abs(burnResult.breakdown.multiplierPercent - 258.21) < 1e-9);
  assert.ok(Math.abs(detonationResult.breakdown.multiplierPercent - 237.5532) < 1e-9);
  assert.equal(runtime.applicableToAttack(e2, { id:"121003",type:"ultimate",element:"Fire" }), false);
});
