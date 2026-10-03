"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../..");
const candidate = require("../../games/genshin/data/v2/candidates/7.0-provisional-weapons.json");
const base = require("../../games/genshin/data/base-stats.json");
const references = {11520: "11501", 11521: "11502", 12436: "11406",13436: "11406",14436: "11406",11436: "11402",15436: "11402",11435: "11402",12435: "11402",13435: "11402",14435: "11402",15435: "11402"};
async function api() {
 const box = {console,document:{readyState:"loading",addEventListener(){},getElementById(){return null;}}, fetch:async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,String(url)),"utf8"))})};
 box.window=box; vm.createContext(box); vm.runInContext(fs.readFileSync(path.join(root,"games/js/genshinBaseStats.js"),"utf8"),box); await box.GenshinBaseStats.ready; return box.GenshinBaseStats;
}
test("12 provisional weapons reuse confirmed standard growth at every level and both sides of ascension",async()=>{
 const calc=await api();
 for(const [id,reference] of Object.entries(references)) {
  const rarity=candidate.weapons[id].rarity;
  assert.equal(candidate.baseStats.weapons[id].curveIds["4"],base.weapons[reference].curveIds["4"]);
  assert.deepEqual(candidate.baseStats.weapons[id].basePromote,rarity===5?[0,31.1,62.2,93.4,124.5,155.6,186.7]:[0,25.9,51.9,77.8,103.7,129.7,155.6]);
  for(let level=1;level<=90;level++) {
   const actual=calc.resolveWeapon(id,level),expected=calc.resolveWeapon(reference,level);
   assert.equal(actual.weaponBaseAtk,expected.weaponBaseAtk,id+" Lv"+level);
   assert.equal(actual.dataStatus,"provisional");
  }
  [20,40,50,60,70,80].forEach((level,index)=>{
   for(const stage of [index,index+1]) assert.equal(calc.resolveWeapon(id,level,stage).weaponBaseAtk,calc.resolveWeapon(reference,level,stage).weaponBaseAtk,id+" ascension "+stage);
  });
  assert.equal(Number(calc.resolveWeapon(id,90).weaponBaseAtk.toFixed(2)),candidate.baseStats.weapons[id].levelStats["90"].baseAtk);
 }
});
test("Lv80 provisional weapon ATK contributes to member base ATK instead of silently disappearing",async()=>{
 const calc=await api();
 for(const id of Object.keys(references)) {
  const member=calc.resolveMember({characterId:"10000002",weaponId:id,level:90,weaponLevel:80});
  assert.equal(member.weaponId,id);
  assert.ok(member.weaponBaseAtk>400);
  assert.equal(member.baseAtk,member.characterBaseAtk+calc.resolveWeapon(references[id],80).weaponBaseAtk);
 }
});

// Rounded standard-tier table: https://genshin-impact.fandom.com/wiki/Weapon/Base_Attack_Scaling
// Weapon-to-tier mapping is externally confirmed in the current task (7.0).
test("ascension boundary display values match the external standard growth table",async()=>{
 const calc=await api();
 const tables={
  "11520":{before:[48,133,261,341,423,506,590,674],after:[164,292,373,455,537,621]},
  "11521":{before:[46,122,235,308,382,457,532,608],after:[153,266,340,414,488,563]},
  "12436":{before:[44,119,226,293,361,429,497,565],after:[144,252,319,387,455,523]},
  "11436":{before:[42,109,205,266,327,388,449,510],after:[135,231,292,353,414,475]}
 };
 for(const [id,table] of Object.entries(tables)) {
  [1,20,40,50,60,70,80,90].forEach((level,index)=>{
   const stage=index===0?0:Math.min(index-1,6);
   assert.equal(Math.round(calc.resolveWeapon(id,level,stage).weaponBaseAtk),table.before[index],id+" before Lv"+level);
  });
  [20,40,50,60,70,80].forEach((level,index)=>assert.equal(Math.round(calc.resolveWeapon(id,level,index+1).weaponBaseAtk),table.after[index],id+" after Lv"+level));
 }
});
