"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createScenarioHarness, prepareScenarioInputs, setConditionElement } = require("./helpers/calcScenarioHarness.cjs");
const root = path.resolve(__dirname, "../..");

async function fixture(characterId = "10000140", weaponId = "14524") {
    const f = createScenarioHarness();
    f.sandbox.console = { ...console, log() {}, warn() {} };
    f.sandbox.fetch = async (url) => {
        const file = path.join(root, String(url));
        return { ok: fs.existsSync(file), status: 404, json: async () => JSON.parse(fs.readFileSync(file, "utf8")) };
    };
    for (const file of ["genshinIdResolver.js", "genshinCalcData.js", "genshinCalcRenderer.js"]) {
        vm.runInContext(fs.readFileSync(path.join(root, "games/js", file), "utf8"), f.sandbox);
    }
    await f.sandbox.GenshinIdResolver.ready;
    f.calcData = await f.sandbox.GenshinCalcData.loadGenshinCalcData();
    prepareScenarioInputs(f.elements, { characterId, weaponId, stats: { hp: 50500, baseHp: 15000, baseAtk: 900, atk: 2000 } });
    f.elements.genshinJsonConditionCards = { innerHTML: "" };
    return f;
}
function panel(f, request) {
    const context = request || f.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
    const state = f.sandbox.GenshinCalcConditions.conditionPanelState(context, f.calcData);
    f.sandbox.GenshinCalcRenderer.renderConditionCards(state, context, f.calcData);
    return { state, html: f.elements.genshinJsonConditionCards.innerHTML };
}

test("original provenance is explicit; modifier summaries and legacy full labels cannot establish it", async () => {
    const f = await fixture();
    const resolver = f.sandbox.GenshinIdResolver;
    const text = resolver.describeEffect({ data: { weaponEffects: { x: { effectTextTemplate: "編集した説明" } }, weaponModifiers: { x: { sourceText: "原文らしい説明" } } }, kind: "weapon", id: "x" });
    assert.equal(text.originalText, "");
    assert.equal(text.calculationSummary, "編集した説明");
    assert.equal(text.descriptionKind, "summary");
    const artifact = resolver.describeEffect({ data: f.calcData, kind: "artifact", id: "15048", pieceCount: 4 });
    assert.equal(artifact.originalText, f.calcData.originalEffectTexts.artifacts["15048"].fourPiece.originalText);
});

test("Hymn and Key sections display the full original once with Runtime impacts and current refinement", async () => {
    for (const [characterId, weaponId] of [["10000140", "14524"], ["10000003", "11511"]]) {
        const f = await fixture(characterId, weaponId);
        f.elements.genshinWeaponRefinement.value = "R5";
        const { state, html } = panel(f);
        const sections = state.cards.find((card) => card.id === "weapon").sections;
        assert.equal(sections.length, 1);
        assert.equal(sections[0].descriptionKind, "original");
        assert.equal(sections[0].description, f.sandbox.GenshinIdResolver.describeEffect({ data: f.calcData, kind: "weapon", id: weaponId, refinement: 5 }).originalText);
        assert.ok(sections[0].effects.length >= 2);
        assert.match(html, /計算への反映/);
        assert.match(html, /R5/);
        const weaponCard = html.split('class="genshin-constellation-section genshin-weapon-section"')[1].split("</article>")[0];
        assert.doesNotMatch(weaponCard, /genshin-value-facts/);
        assert.doesNotMatch(html, />全文<|>要約<|>自動説明</);
        assert.ok(!sections[0].description.includes("現在有効な蜜酒の層数"));
    }
});

test("character and both artifact sections use saved Japanese originals, not modifier descriptions", async () => {
    const f = await fixture();
    const meta = f.sandbox.GenshinCalcConditions.talentSourceMeta("talent:passive2", { characterId: "10000140" }, f.calcData, { effectDescription: "TETINET編集文" });
    assert.equal(meta.descriptionKind, "original");
    assert.equal(meta.description, f.calcData.originalEffectTexts.characters["10000140"].talents.passive2.originalText.replace(/\*\*/g, ""));
    for (const id of ["15047", "15048"]) {
        const context = f.sandbox.GenshinCalcEngine.buildCharacterCalcContext();
        context.artifactSetIds = [id]; context.artifactSetMode = "4pc";
        const { state } = panel(f, context);
        const sections = state.cards.find((card) => card.id === "artifact").sections;
        assert.equal(sections.length, 2);
        for (const section of sections) {
            const raw = f.calcData.originalEffectTexts.artifacts[id][section.pieceCount === 4 ? "fourPiece" : "twoPiece"];
            assert.equal(section.description, raw.originalText);
            assert.equal(section.descriptionKind, "original");
        }
    }
});

test("party provider displays the complete weapon original at its own refinement without changing inferred descriptions or damage", async () => {
    const f = await fixture("10000096", "");
    const request = f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
    request.party = { schemaVersion: 2, focusSlot: 1, conditionStates: {}, members: [
        { slot: 1, enabled: true, characterId: "10000096", level: 90, constellation: 0, stats: request.stats, buffStates: {}, equipment: { weaponId: "", refinement: 1, artifactSetIds: [] } },
        { slot: 2, enabled: true, characterId: "10000003", level: 90, constellation: 0, stats: { hp: 40000, atk: 2000, baseAtk: 900 }, buffStates: {}, equipment: { weaponId: "11511", refinement: 5, artifactSetIds: [] } }
    ] };
    const before = f.sandbox.GenshinCalcEngine.calculateDamageRequest(request, f.calcData);
    const { state, html } = panel(f, before.context);
    const candidate = state.partyModifiers.find((item) => item.sourceKind === "weapon");
    assert.ok(candidate);
    assert.match(candidate.description, /0\.2%/); // Inference continues to use the existing modifier text.
    assert.match(html, /HP\+40%/);
    assert.match(html, /0\.4%/);
    assert.match(html, /計算への反映/);
    const after = f.sandbox.GenshinCalcEngine.calculateDamageRequest(request, f.calcData);
    assert.equal(JSON.stringify(after.results), JSON.stringify(before.results));
});

test('provider descriptions expand rank templates without leaking raw tokens; actions replace result controls',async()=>{
 const f=await fixture('10000025',''); const r=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
 r.party={conditionStates:{['party:2:10000140:actions:skill']:{option:'active'},['party:2:10000140:actions:heals']:{option:'1'},['party:2:10000140:actions:skillHit']:{option:'yes'}},members:[{slot:2,enabled:true,characterId:'10000140',constellation:6,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50500,baseHp:15000,atk:2000,baseAtk:900},buffStates:{},equipment:{weaponId:'14524',refinement:5,artifactSetIds:[]}}]};
 const {html,state}=panel(f,r),visible=html.replace(/<[^>]*>/g,'');
 assert.deepEqual(visible.match(/.{0,50}(?:\{[a-zA-Z]\w*\}|provisional71|weaponModifiers\.|Lead Vocal|Chorus).{0,70}/g)||[],[]);
 assert.match(visible,/支援状態|水・氷支援/);
 assert.match(html,/data-genshin-vody-action="support"/);
 const primary=html.split('<div class="genshin-provider-actions">')[1].split('<details')[0];
 assert.equal((primary.match(/data-genshin-vody-action=/g)||[]).length,2);
 assert.doesNotMatch(primary,/data-genshin-vody-action="(?:skill|heals|skillHit|hornHit)"/);
 assert.doesNotMatch(primary,/data-genshin-vody-action="qualifyingHeals"/);
 assert.match(html,/<details[^>]*data-vody-advanced="2"[^>]*><summary>詳細設定/);
 assert.match(visible,/計算対象の現在位置|流星の嵐と支援の状態|C1：有効／C4：0層/);
 assert.doesNotMatch(html,/data-genshin-party-condition-key="[^"]*:group:(vodyanitsa_|provisional71_w14524)/);
 assert.match(visible,/与える治療効果\+8%/);
 const resLabels=state.partyModifiers.filter(c=>c.sourceKind==='talent' && c.sourceId==='combat2').flatMap(c=>c.runtimeRows.map(row=>row.label));
 assert.ok(resLabels.includes('敵の水元素耐性'));assert.ok(resLabels.includes('敵の氷元素耐性'));
 const renderer=f.sandbox.GenshinCalcRenderer, evaluation=renderer.createImpactEvaluation(r,f.calcData);
 const burst=evaluation.payload.results.find(result=>result.entry.damageType==='burst');
 const resEffect=state.partyModifiers.find(c=>c.sourceKind==='talent' && c.sourceId==='combat2');
 const resRows=renderer.modifierImpactRows(resEffect,renderer.createImpactEvaluation(r,f.calcData,burst.attackKey));
 assert.equal(resRows.find(row=>row.label==='敵の水元素耐性').value,30);assert.equal(resRows.find(row=>row.label==='敵の氷元素耐性').value,0);
 const c1=state.partyModifiers.find(c=>c.modifier.id.includes('c1') && c.modifier.category==='statBonus');
 assert.ok(c1);assert.equal(c1.runtimeRows[0].unit,'flat');assert.equal(c1.runtimeRows[0].value,413.6);
 assert.match(visible,/命ノ星座 C1.*脚光に咲く水の花/);
 assert.match(visible,/攻撃力 \+413.6/); assert.match(visible,/攻撃力 \+9.36%/);
});


test('Runtime impact model distinguishes resolved values, attack exclusion, condition OFF and unavailable effects', async () => {
 const f=await fixture('10000003','11511'), engine=f.sandbox.GenshinCalcEngine, renderer=f.sandbox.GenshinCalcRenderer;
 // A supported Burst-only modifier exercises the shared adapter without changing production data.
 f.calcData.weaponModifiers['11511'].modifiers.push({id:'display_burst_probe',category:'damageBonus',applyTo:['burstDamageBonus'],unit:'percent',value:25,condition:'always',calculationSupport:'simple',uidHandling:'conditional'});
 const request=engine.buildCalculationRequestFromForm();request.artifactSetIds=['15048'];request.artifactSetMode='4pc';
 const initial=panel(f,request), artifact=initial.state.cards.find(c=>c.id==='artifact').effects.find(e=>e.modifier.id==='4pc_atk_after_stellar_glimmer');
 request.uiState.conditionByModifier={...request.uiState.conditionByModifier,[artifact.controls[0].key]:{enabled:false}};
 const off=renderer.modifierImpactRows(artifact,renderer.createImpactEvaluation(request,f.calcData))[0];
 assert.equal(off.value,0);assert.equal(off.reason,'条件未成立');
 request.uiState.conditionByModifier={...request.uiState.conditionByModifier,[artifact.controls[0].key]:{enabled:true}};
 setConditionElement(f.elements,artifact.controls[0].key,'toggle',true);f.elements['condition:'+artifact.controls[0].key+':toggle'].checked=true;
 const on=panel(f,request), atk=on.state.cards.find(c=>c.id==='artifact').effects.find(e=>e.modifier.id===artifact.modifier.id);
 const evaluation=renderer.createImpactEvaluation(request,f.calcData), rows=renderer.modifierImpactRows(atk,evaluation);
 assert.equal(rows[0].value,12,JSON.stringify({controls:artifact.controls,state:request.uiState,rows,applied:evaluation.collected.applied.filter(i=>i.source.includes('15048')).map(i=>({id:i.modifier.id,source:i.source,value:i.value}))}));assert.equal(rows[0].unit,'percent');
 const probe=on.state.cards.find(c=>c.id==='weapon').effects.find(e=>e.modifier.id==='display_burst_probe');
 const excluded=renderer.modifierImpactRows(probe,evaluation)[0];assert.equal(excluded.value,0);assert.equal(excluded.reason,'今回の攻撃には非適用');
 const burst=evaluation.payload.results.find(r=>r.entry.damageType==='burst');assert.ok(burst);
 assert.equal(renderer.modifierImpactRows(probe,renderer.createImpactEvaluation(request,f.calcData,burst.attackKey))[0].value,25);
 const statItem=evaluation.collected.applied.find(i=>i.modifier.id===artifact.modifier.id);
 const zeroEvaluation={...evaluation,cache:new Map(),collected:{...evaluation.collected,applied:evaluation.collected.applied.map(i=>i===statItem?{...i,value:0}:i)}};
 const zero=renderer.modifierImpactRows(atk,zeroEvaluation)[0];assert.equal(zero.value,0);assert.equal(zero.reason,'計算結果が0');
 const unavailable=renderer.modifierImpactRows({source:'weapon:missing',modifier:{id:'unsupported',category:'damageBonus',applyTo:['burstDamageBonus'],unit:'percent'},analysis:{supportStatus:'unsupported'}},evaluation)[0];
 assert.equal(unavailable.value,null);assert.match(renderer.impactRowText(unavailable),/未対応／計算対象外/);assert.doesNotMatch(renderer.impactRowText(unavailable),/\+0/);
 assert.doesNotMatch(on.html,/計算根拠/);assert.match(on.html.replace(/<[^>]*>/g,''),/攻撃力 \+12%/);
});


test('party view groups each provider by source and keeps shared major conditions above effect cards',async()=>{
 const f=await fixture('10000096',''), r=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
 const member=(slot,characterId,weaponId='',artifactSetIds=[])=>({slot,characterId,enabled:true,level:90,constellation:6,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50500,baseHp:15000,atk:2000,baseAtk:900,elementalMastery:100},equipment:{weaponId,refinement:5,artifactSetIds,artifactSetMode:'4pc'},buffStates:{}});
 r.party={conditionStates:{},members:[member(2,'10000140','14524',['15048']),member(3,'10000089'),member(4,'10000032')]};
 const {html,state}=panel(f,r), visible=html.replace(/<[^>]*>/g,'');
 assert.equal((html.match(/data-party-member-tab=/g)||[]).length,3);
 assert.equal((html.match(/data-party-member-panel=/g)||[]).length,3);
 assert.equal((html.match(/data-party-member-panel="[^"]+" hidden/g)||[]).length,2);
 assert.match(html,/data-party-effect-source="character"/);assert.match(html,/data-party-effect-source="weapon"/);assert.match(html,/data-party-effect-source="artifact"/);
 assert.doesNotMatch(visible,/計算根拠|TETINETでは|効果別の計算への反映/);
 assert.match(visible,/現在の状態|効果一覧|原文未取得|条件未成立/);
 const inactive=state.partyModifiers.find(c=>c.sourceKind==='talent' && c.sourceId==='combat2' && c.member.slot===2);
 assert.ok(inactive.runtimeRows.every(row=>row.value===0 && row.reason==='条件未成立'));
 const weaponCards=html.match(/<article[^>]+data-party-buff="[^"]*weapon:14524[^>]*>/g)||[];
 assert.equal(weaponCards.length,1,'one weapon effect card contains all its modifiers');
 const card=html.slice(html.indexOf(weaponCards[0])).split('</article>')[0];
 assert.ok(!/data-genshin-party-(condition|buff)-key/.test(card),'inputs belong in current state');
 assert.doesNotMatch(card,/計算への反映/);
 assert.ok(html.indexOf('genshin-provider-impact')<html.indexOf('genshin-party-effect-list'));
 assert.ok(card.includes(f.calcData.originalEffectTexts.weapons['14524'].originalTextByRefinement['5']));
});


test('provider aggregation uses additive buckets, accepted stats and multiplier products without attack-list expansion',async()=>{
 const f=await fixture('10000025',''), engine=f.sandbox.GenshinCalcEngine, renderer=f.sandbox.GenshinCalcRenderer;
 const request=engine.buildCalculationRequestFromForm();
 const actions={skill:'active',heals:'1',skillHit:'yes',hornHit:'yes',meteor:'none',recipient:'active'};
 request.party={conditionStates:Object.fromEntries(Object.entries(actions).map(([key,option])=>['party:2:10000140:actions:'+key,{option}])),members:[{slot:2,enabled:true,level:90,characterId:'10000140',constellation:1,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50500,baseHp:15000,atk:2000,baseAtk:900},buffStates:{},equipment:{weaponId:'',refinement:1,artifactSetIds:[]}}]};
 const resolve=()=>{const {state,html}=panel(f,request);const evaluation=renderer.createImpactEvaluation(request,f.calcData);const attack=evaluation.payload.results.find(r=>r.entry.damageType==='burst');return {html,evaluation:renderer.createImpactEvaluation(request,f.calcData,attack.attackKey),effects:state.partyModifiers.filter(effect=>effect.member.slot===2),attack};};
 for(const recipient of ['active','offField']) {
  request.party.conditionStates['party:2:10000140:actions:recipient']={option:recipient};
  const {html,effects,evaluation,attack}=resolve(), rows=renderer.providerImpactRows(effects,evaluation);
  const base=rows.filter(row=>row.label==='水・氷元素攻撃の基礎ダメージ加算');assert.equal(base.length,1);assert.equal(base[0].value,1470);assert.equal(base[0].value,attack.breakdown.additiveBaseDamage);
  assert.equal(rows.find(row=>row.label==='敵の水元素耐性').value,30);assert.equal(rows.find(row=>row.label==='敵の氷元素耐性').value,30);
  const res=attack.breakdown.appliedModifiers.filter(item=>item.modifier.category==='resistanceDebuff');
  assert.equal(res.length,1,'both hit triggers share one RES modifier');assert.equal(Math.abs(Number(res[0].value)),30);
  assert.equal(rows.filter(row=>row.label==='敵の水元素耐性').length,1);assert.equal(rows.filter(row=>row.label==='敵の氷元素耐性').length,1);
  const physical=evaluation.payload.results.find(r=>r.entry.element==='physical');
  const physicalRows=renderer.providerImpactRows(effects,renderer.createImpactEvaluation(request,f.calcData,physical.attackKey));
  assert.equal(JSON.stringify(physicalRows),JSON.stringify(rows),'provider amounts do not depend on the selected attack');
  assert.ok(!rows.some(row=>row.reason==='今回の攻撃には非適用'));
  assert.equal(rows.find(row=>row.label==='攻撃力'&&row.unit==='flat').value,404);
  assert.ok(!rows.some(row=>row.label==='星拡散基礎ダメージ加算'));
  assert.doesNotMatch(rows.map(renderer.impactRowText).join(' / '),/(?:通常攻撃|重撃|落下攻撃) \+0/);
  assert.ok(html.indexOf('現在の状態')<html.indexOf('genshin-provider-impact'));assert.ok(html.indexOf('genshin-provider-impact')<html.indexOf('genshin-party-effect-list'));
  const replay=engine.calculateDamageRequest(JSON.parse(JSON.stringify(evaluation.payload.calculationRequest)),f.calcData);assert.deepEqual(replay.results.map(r=>r.expected),evaluation.payload.results.map(r=>r.expected));
 }
 request.party.conditionStates['party:2:10000140:actions:meteor']={option:'generated'};
 const meteor=resolve(), meteorRows=renderer.providerImpactRows(meteor.effects,meteor.evaluation);
 assert.equal(meteorRows.find(row=>row.label==='敵の風元素耐性').value,35);
 assert.equal(meteorRows.find(row=>row.label==='星拡散基礎ダメージ加算').value,2730);
 request.party.conditionStates['party:2:10000140:actions:skill']={option:'inactive'};
 const off=resolve(), rows=renderer.providerImpactRows(off.effects,off.evaluation);
 assert.equal(rows.length,0);
 // Two accepted independent factors share one bucket; Runtime multiplies them.
 const source='party:2:10000140:test:factor';
 const factors=[120,125].map((value,index)=>({modifier:{id:'factor'+index,category:'effectOverride',applyTo:['burst'],unit:'percent',value,multiplierTarget:'finalDamage'},source,value,analysis:{calculation:'effectOverride',supportStatus:'supported'}}));
 const effects=factors.map(item=>({...item,status:'ready',enabled:true,member:{slot:2}}));
 const evaluation={...off.evaluation,collected:{...off.evaluation.collected,applied:factors}};
 assert.equal(renderer.providerImpactRows(effects,evaluation).find(row=>row.label==='独立倍率').value,1.5);
});


test('user-confirmed Melody and Chorus mechanics remain separate from saved game originals',async()=>{
 const f=await fixture('10000025',''),request=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
 const record=f.calcData.originalEffectTexts.characters['10000140'].talents.passive2;
 assert.equal(record.confirmedMechanics.isOriginalText,false);
 assert.match(record.originalRaw,/LINK#N11400001/);assert.doesNotMatch(record.originalText,/超過1,000ごとに/);
 const text=f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:'talent',id:'10000140',sourceId:'passive2'});
 assert.doesNotMatch(text.originalText,/超過1,000ごとに/);
 request.party={conditionStates:{},members:[{slot:2,enabled:true,level:90,characterId:'10000140',constellation:0,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50500,baseHp:15000,atk:2000,baseAtk:900},equipment:{weaponId:'',artifactSetIds:[]},buffStates:{}}]};
 const html=panel(f,request).html;
 assert.doesNotMatch(html,/確認済みの効果内容|href="https:\/\/gamewith/);
 for (const name of ['メロディ','コーラス']) assert.ok(html.includes('関連効果</span> ' + name));
 assert.doesNotMatch(html,/関連効果<\/span> (?:古の)?春を呼ぶ角笛/);
 assert.match(html,/固有天賦1|固有天賦2|元素スキル/);
 assert.ok(record.confirmedMechanics.sections.length,'private evidence is retained');
});


test('related effect resolver exposes only standalone full originals and active provider values',async()=>{
 const f=await fixture('10000025','');
 const skill=f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:'talent',id:'10000140',sourceId:'combat2'});
 assert.equal(skill.relatedEffects.length,0);
 const a4=f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:'talent',id:'10000140',sourceId:'passive2'});
 const sourcePath='games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/vodyanitsa-currentcalc/';
 const linked=JSON.parse(fs.readFileSync(path.join(root,sourcePath+'japanese-linked-tooltips-go.json'),'utf8'));
 for(const effect of a4.relatedEffects) {
  assert.equal(effect.classification,'D');assert.equal(effect.acquisitionStatus,'captured');assert.equal(effect.descriptionKind,'original');
  const record=linked.records[effect.linkedTooltipId.replace(/^N/,'')];
  const expected=Object.keys(record.description).sort((a,b)=>Number(a)-Number(b)).map(key=>record.description[key]).join('\n').replace(/<[^>]+>/g,'');
  assert.equal(effect.originalText,expected);assert.ok(effect.sourceRefs.length);assert.doesNotMatch(effect.originalText,/<[^>]+>|原文未取得/);
 }
 assert.match(a4.relatedEffects.find(effect=>effect.nameJa==='メロディ').originalText,/6500[\s\S]*3500/);
 const saved=JSON.parse(fs.readFileSync(path.join(root,sourcePath+'japanese-talents.json'),'utf8'));
 assert.deepEqual(Object.keys(saved.passive2),['name','descriptionRaw','description']);
 assert.ok(saved.passive2.descriptionRaw.endsWith('元素スキル発動時に層数が更新される。'));

 const request=f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
 const actions={skill:'active',heals:'1',skillHit:'yes',hornHit:'yes',meteor:'late',recipient:'active'};
 request.party={conditionStates:Object.fromEntries(Object.entries(actions).map(([key,option])=>['party:2:10000140:actions:'+key,{option}])),members:[{slot:2,enabled:true,characterId:'10000140',constellation:1,talentLevels:{normal:10,skill:10,burst:10},stats:{hp:50500,baseHp:15000,atk:2000,baseAtk:900},equipment:{weaponId:'',refinement:1,artifactSetIds:[]},buffStates:{}}]};
 const html=panel(f,request).html;
 assert.doesNotMatch(html,/現在の支援効果|原文抜粋|data-genshin-vody-action="meteor"|関連効果<\/span> (?:悠久の歌|流星の嵐|古の春を呼ぶ角笛)/);
 assert.match(html,/data-genshin-vody-action="support"/);
 assert.match(html,/50,500 × 0.008 → 攻撃力 \+404/);
 assert.doesNotMatch(html,/参照ステータス：HP上限/);

});


test("five scoped characters resolve separate Japanese tooltip originals from their exact captured records", async () => {
    const f = await fixture();
    const base = "games/genshin/data/v2/version-transitions/7.0-to-7.1/sources/named-effect-originals-five";
    const capture = JSON.parse(fs.readFileSync(path.join(root, base, "japanese-linked-tooltips-go.json"), "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, base, "capture-manifest.json"), "utf8"));
    const expected = {
        "10000143": ["11430001", "11430002", "11430003", "11430004"],
        "10000148": ["11480001", "11480002", "11330003"],
        "10000150": ["11500001", "11500002", "11500003", "11500004", "11330003"],
        "10000005_cryo": ["10050002", "11500004", "11330003"],
        "10000007_cryo": ["10050002", "11500004", "11330003"],
        "10000112": ["11120002"]
    };
    for (const id of ["10000005", "10000007"]) assert.notEqual(f.calcData.originalEffectTexts.characters[id]?.talents?.combat2?.nameJa, "霧氷の剣", "Cryo originals must not replace other Traveler elements");
    for (const [id, ids] of Object.entries(expected)) {
        const seen = new Set();
        for (const placement of manifest.placements.filter(row => row.characterId === id)) {
            const effect = f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData, kind:"talent", id, sourceId:placement.talent});
            const child = effect.relatedEffects.find(row => row.linkedTooltipId === "N" + placement.tooltipId);
            const record = capture.records[placement.tooltipId];
            const raw = Object.keys(record.description).sort((a,b) => Number(a)-Number(b)).map(key => record.description[key]).join("\n");
            assert.ok(child, id + ":" + placement.tooltipId);
            assert.equal(child.originalRaw, raw);
            assert.equal(child.originalText, raw.replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]+>/g,"").trim());
            assert.equal(child.descriptionKind, "original");
            assert.equal(child.acquisitionStatus, "captured");
            assert.doesNotMatch(child.originalText, /原文未取得|<[^>]+>/);
            seen.add(placement.tooltipId);
        }
        assert.deepEqual([...seen].sort(), ids.sort());
    }
});

test("third batch saved Japanese originals reach named modal sections without summaries or duplicates", async () => {
    const cases = [["10000143", "passive2"], ["10000150", "passive1"], ["10000148", "passive2"], ["10000031", "passive2"], ["10000038", "passive2"]];
    for (const [id, sourceId] of cases) {
        const f = await fixture(id, "");
        f.elements.genshinReflectConstellation.value = "C6";
        const {state, html} = panel(f);
        const original = f.calcData.originalEffectTexts.characters[id];
        const text = f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:"talent",id,sourceId});
        assert.equal(text.descriptionKind, "original");
        assert.equal(text.calculationSummary, "");
        assert.ok(text.originalText.length > 20);
        const sections = state.cards.find(card => card.id === "talent").sections;
        const representative = sections.find(section => section.description === text.originalText);
        assert.ok(representative, id + ":" + sections.map(section => section.key).join(","));
        assert.equal(representative.description, text.originalText);
        assert.match(representative.typeLabel, /固有天賦/);
        assert.equal((html.match(new RegExp('data-talent-source="' + representative.key + '"', 'g')) || []).length, 1);
        const constellationSections = state.cards.find(card => card.id === "constellation")?.sections || [];
        assert.ok(constellationSections.length, id);
        for (const section of constellationSections) {
            assert.equal(section.nameJa, original.constellations[section.level].nameJa);
            assert.equal(section.descriptionKind, "original");
            assert.equal(section.description, f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:"constellation",id,sourceId:section.level}).originalText);
        }
        assert.doesNotMatch(html, /原文抜粋|>星座効果</);
        const relatedNames = sections.flatMap(section => section.relatedEffects || []).map(effect => effect.nameJa);
        assert.equal(new Set(relatedNames).size, relatedNames.length);
        for (const section of sections) for (const effect of section.relatedEffects || []) {
            assert.match(html, new RegExp('関連効果</span> ' + effect.nameJa.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    }
});


test("selectable stages reach the existing per-modifier condition keys and stay off until selected", async () => {
    for (const [weaponId, setId] of [["14408", ""], ["", "15021"]]) {
        const f = await fixture("10000140", weaponId);
        let request = f.sandbox.GenshinCalcEngine.buildCalculationRequestFromForm();
        if (setId) { request.artifactSetIds = [setId]; request.artifactSetMode = "4pc"; }
        const cardId = setId ? "artifact" : "weapon";
        const initial = panel(f, request);
        const section = initial.state.cards.find(card => card.id === cardId).sections.find(section => section.controls.some(control => control.type === "stack"));
        const control = section.controls.find(control => control.type === "stack");
        assert.equal(control.value, 0);
        assert.match(initial.html, /data-genshin-stack-activation=/);
        request.uiState.complexConditionByModifier[control.key] = { stack: control.max };
        const active = panel(f, request);
        const effect = active.state.cards.find(card => card.id === cardId).effects.find(effect => effect.modifier.id === control.modifierId);
        const evaluated = f.sandbox.GenshinCalcConditions.evaluateModifierCondition({ modifier: effect.modifier, source: effect.source, context: request, calcData: f.calcData });
        assert.equal(evaluated.enabled, true);
        assert.equal(evaluated.stack, control.max);
        const value = f.sandbox.GenshinCalcEngine.resolveModifierValue(effect.modifier, request, request.uiState);
        assert.ok(value > 0, "selected stage must reach Runtime, not just the visible selector");
        request.uiState.complexConditionByModifier[control.key] = { stack: 0 };
        panel(f, request);
        assert.equal(f.sandbox.GenshinCalcConditions.evaluateModifierCondition({ modifier: effect.modifier, source: effect.source, context: request, calcData: f.calcData }).enabled, false);
    }
});

test("saved utility-passive aliases and artifact originals are resolved without summary inference", async () => {
const f=await fixture(); const resolver=f.sandbox.GenshinIdResolver;
for(const [id,sourceId] of [["10000095","passive3"],["10000119","passive3"],["10000005_cryo","frostglow"]]) { const text=resolver.describeEffect({data:f.calcData,kind:"talent",id,sourceId}); assert.equal(text.descriptionKind,"original");assert.ok(text.originalText.length>20);assert.equal(text.calculationSummary,""); }
const artifact=resolver.describeEffect({data:f.calcData,kind:"artifact",id:"15021",pieceCount:4});assert.equal(artifact.descriptionKind,"original"); assert.equal(artifact.originalText,f.calcData.artifactSetEffects["15021"].fourPieceEffect);
});


test("externally reviewed D originals preserve full refinement texts and formal Cryo Traveler name", async () => {
 const f=await fixture(); const resolver=f.sandbox.GenshinIdResolver;
 const ids=['11435','11436','11437','11438','11520','11521','11522','12435','12436','13435','13436','14435','14436','14437','15435','15436','15437'];
 for(const id of ids) for(let refinement=1;refinement<=5;refinement++) {
  const saved=f.calcData.originalEffectTexts.weapons[id];
  const text=resolver.describeEffect({data:f.calcData,kind:'weapon',id,refinement});
  assert.equal(text.nameJa,saved.nameJa,id); assert.equal(text.descriptionKind,'original');
  assert.equal(text.originalText,saved.originalTextByRefinement[String(refinement)]);
  assert.ok(text.originalText.length>20,id); assert.doesNotMatch(text.originalText,/\{[a-zA-Z]+\}|検証中|暫定/);
  assert.equal(saved.provenance.verification,'userExternallyVerifiedJapaneseOriginal');
 }
 for(const id of ['10000005_cryo','10000007_cryo']) {
  const f=await fixture(id,''); f.elements.genshinReflectConstellation.value='C6';
  const text=f.sandbox.GenshinIdResolver.describeEffect({data:f.calcData,kind:'talent',id,sourceId:'passive4'});
  assert.equal(text.nameJa,'異邦の積氷'); assert.match(text.originalText,/氷の刃/);assert.match(text.originalText,/最大3層/);
  const {state,html}=panel(f); assert.doesNotMatch(html,/異郷の永久凍土/);
  assert.ok(state.cards.find(c=>c.id==='talent').sections.some(s=>s.nameJa==='異邦の積氷'&&s.description===text.originalText));
 }
});

test("D weapon stage controls match Japanese original limits without replacing composition derivation", async()=>{
 for(const [id,max] of [['11438',2],['11437',3],['11520',3],['15437',3]]) {
  const f=await fixture('10000140',id); const {state}=panel(f);
  const controls=state.cards.find(c=>c.id==='weapon').sections.flatMap(s=>s.controls);
  const stages=controls.filter(c=>c.type==='stack');
  if(!stages.length) { const options=controls.flatMap(c=>c.options||[]); assert.ok(options.some(o=>o.label.includes('3層')),id); assert.ok(options.some(o=>/未発動|なし/.test(o.label)),id); continue; }
  assert.ok(stages.some(c=>c.max===max),id+JSON.stringify(stages));
  for(const c of stages) {assert.equal(c.min,0);assert.equal(c.value,0);}
 }
});
