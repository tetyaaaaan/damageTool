const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {skillRole}=require('../../scripts/reportHsrCompletion.cjs');
const {loadProductionFixture,makeRequest,independentDirectDamage,assertClose}=require('./helpers/hsrDirectVerification.cjs');

test('completion tracker distinguishes non-damaging support, conditional damage and field actions',()=>{
 assert.match(skillRole({type:'BPSkill',effect:'Support',desc:'指定味方の与ダメージ+50%。'}),/^支援/);
 assert.match(skillRole({type:'Ultra',effect:'Restore',desc:'味方全体のHPを回復する。'}),/^支援/);
 assert.match(skillRole({type:'BPSkill',effect:'Support',desc:'味方の攻撃後に付加ダメージを与える。'}),/^条件付き/);
 assert.match(skillRole({type:'Talent',effect:'Summon',desc:'精霊を召喚する。'}),/^召喚/);
 assert.match(skillRole({id:'110104',type:'Talent',effect:'',desc:'通常攻撃後、行動順を早める。'}),/^支援\/行動順/);
 assert.match(skillRole({type:'Talent',effect:'',desc:'未知の状態を得る。'}),/^召喚\/状態/);
 assert.match(skillRole({type:'Maze',effect:'SingleAttack',desc:'敵にダメージを与える。'}),/^秘技/);
});

test('completion document tracks each runtime character exactly once and separates completion gates',async()=>{
 const {data}=await loadProductionFixture();
 const text=fs.readFileSync(path.join(__dirname,'../../docs/HSR_CHARACTER_COMPLETION.md'),'utf8');
 const ids=[...text.matchAll(/^### (\d+) /gm)].map(m=>m[1]);
 assert.equal(ids.length,data.characters.length);
 assert.deepEqual([...ids].sort(),data.characters.map(c=>c.id).sort());
 assert.match(text,/登録上の充足候補/);assert.match(text,/最終完成認定/);assert.match(text,/新しい計算処理が必要な攻撃の総数: \*\*未確定/);
 for(const a of data.attacks)assert.ok(text.includes('|'+a.id+' '),'registered attack detail '+a.id);
});

test('the three E0 composition-confirmed supports independently verify their sole damaging combat action at all E0 levels',async()=>{
 const {data,engine}=await loadProductionFixture();
 const specs=[{id:'1211',attack:'121101',stat:'atk',curve:[50,60,70,80,90,100]},{id:'1110',attack:'111001',stat:'hp',curve:[25,30,35,40,45,50]},{id:'1313',attack:'131301',stat:'atk',curve:[50,60,70,80,90,100]}];
 for(const s of specs){const a=data.attacks.find(a=>a.id===s.attack);assert.equal(a.support.status,'calculable');for(let level=1;level<=6;level++){for(const stats of [{atk:3123.5,hp:9876.25,def:2345.75,critRate:37.5,critDamage:83.25,damageBonus:11.5},{atk:2195.75,hp:12345.5,def:1876.125,critRate:71.25,critDamage:142.75,damageBonus:46.25}]){const input=makeRequest(a,level,{...stats,enemyLevel:82,resistance:27.5,defenseReduction:13.5});const expected=independentDirectDamage({...input,attack:{...input.attack,scalingStat:s.stat,multiplier:s.curve[level-1],hitCount:1}}),actual=engine.calculate(input);for(const k of ['nonCrit','crit','expected'])assertClose(actual[k],expected[k],s.id+' Lv'+level+' '+k);}}}
});


test('candidate audit keeps missing damage components distinct from registered source skills',async()=>{
 const {e0CandidateAudit}=require('../../scripts/reportHsrCompletion.cjs');
 const audits=Object.values(e0CandidateAudit);
 assert.equal(audits.length,89);
 const initial=audits.filter(a=>a.batch6InitialClass);assert.equal(initial.length,34);
 assert.deepEqual(initial.reduce((r,a)=>(r[a.batch6InitialClass]=(r[a.batch6InitialClass]||0)+1,r),{}),{C1:17,B:1,C2:16});
 for(const id of ['1507','1225'])assert.equal(e0CandidateAudit[id].status,'confirmed');
 for(const id of ['1307','1405','1410','8007','8008'])assert.equal(e0CandidateAudit[id].workClass,'D');
 for(const id of ['1013','1108','1222','1101','1217','1306'])assert.equal(e0CandidateAudit[id].status,'confirmed');
 for(const id of ['1106','1207','1218'])assert.equal(e0CandidateAudit[id].status,'pending');
 assert.ok(audits.every(a=>['confirmed','pending','missing'].includes(a.status)));
 for(const id of ['1001','1003'])assert.equal(e0CandidateAudit[id].missingComponents.length,0,'the independently added delayed event resolves the registration gap');
 for(const a of audits)if(a.missingComponents?.length)assert.equal(a.status,'missing');
 for(const a of audits){assert.ok(a.evidence);assert.ok(a.remaining);if(a.status==='confirmed')assert.ok(a.majorSourceIds.length);}
 const {data}=await loadProductionFixture();for(const [id,a]of Object.entries(e0CandidateAudit))for(const attackId of a.requiredAttackIds||[]){const attack=[...data.attacks,...data.specialBreakAttacks].find(x=>x.id===attackId&&x.characterId===id&&!x.hidden);assert.ok(attack,attackId+' mandatory damage component');assert.equal(attack.support.status,'calculable');}
});
