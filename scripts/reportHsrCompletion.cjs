"use strict";
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {loadProductionFixture}=require('../tests/hsr/helpers/hsrDirectVerification.cjs');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs/HSR_CHARACTER_COMPLETION.md');
const sha='dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487';
const sourceBase=`https://raw.githubusercontent.com/Mar-7th/StarRailRes/${sha}/index_new/jp/`;
const cell=value=>String(value??'—').replace(/\|/g,'／').replace(/\r?\n/g,' ').replace(/</g,'&lt;');
const sumBy=(items,key)=>items.reduce((a,x)=>{const k=key(x);a[k]=(a[k]||0)+1;return a;},{});
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const combatTypes=new Set(['Normal','BPSkill','Ultra','Talent','ElationDamage','MemospriteSkill','MemospriteTalent','Assist']);
const directEffects=new Set(['SingleAttack','AoEAttack','Bounce','Blast']);
const confirmedE0={
 '1211':'白露: 固定版の通常以外は回復・生生・蘇生。追加能力にも本人の追加ダメージなし。通常の全Lv独立検証を既存テストで確認。',
 '1110':'リンクス: 固定版の通常以外は回復・HP支援。追加能力に本人の追加ダメージなし。HP参照通常を既存独立検証条件で確認。',
 '1305':'Dr.レイシオ: 通常・スキル本体・必殺技本体・天賦追撃の4イベントを固定版で確認し、各全採用Lvを独立検証。発動確率/後続行動は合算せず、帰納は最終会心、推論は補正条件で管理。',
 '1313':'サンデー: 固定版の通常以外は指定味方支援。追加能力にも本人の追加ダメージなし。通常の全Lv独立検証を既存テストで確認。'
};
const confirmedMajorIds={'1211':['121101'],'1110':['111001'],'1313':['131301'],'1305':['130501','130502','130503','130504']};
const e0CandidateAudit={
  "1001": {
    "status": "pending",
    "summary": "通常・必殺本体・カウンターに、凍結成立後の非会心付加ダメージ1001031を追加。誤った旧版限定を解除。",
    "evidence": "固定100103.params[][3]、hsrDelayedDamageCompletionとhsrToolInputsで全E0採用Lv・独立値・別行表示を検証。",
    "remaining": "後続成分の登録不足は解消。構成認定とPC/モバイル・保存復元の統合確認を続ける。",
    "missingComponents": []
  },
  "1003": {
    "status": "pending",
    "summary": "星火の燃焼DoT10031011、灼熱の任意スキル補正、道標の最終会心入力を接続。",
    "evidence": "固定1003101..103、hsrDelayedDamageCompletionで全E0直接曲線・DoT・補正対象を独立検証。",
    "remaining": "後続成分の登録不足は解消。確率付与・主対象と隣接の異なる燃焼状態を分け、構成認定と統合確認を続ける。",
    "missingComponents": []
  },
  "1004": {
    "status": "pending",
    "summary": "直接攻撃・スキルバウンド・減速相手の天賦成分は登録。",
    "evidence": "hsrGoldenScenariosに前/強化版・段数・星魂条件。",
    "remaining": "100401..100404/1100401..1100404: 3/5段スキルの減速付与と天賦追加の順序、各段と別行の合計関係を独立照合。初回付与タイミングは推測しない。"
  },
  "1005": {
    "status": "pending",
    "summary": "直接攻撃と感電/起爆が別レコード。前/強化版も登録。",
    "evidence": "hsrGoldenScenariosに係数・非会心・起爆入力・星魂条件の検証。",
    "remaining": "100501..100504と1100501..1100504、感電/起爆別行: 前/強化版の直接成分・付与後の感電起爆・敵既存DoT入力・主/隣接を全Lvで独立照合する必要。"
  },
  "1009": {
    "status": "pending",
    "summary": "通常・5段スキル・星火DoTあり。必殺/蓄エネ支援は攻撃不足でない。",
    "evidence": "固定1009101、hsrGoldenScenariosの段数/E1/DoT/補正対象。",
    "remaining": "100901/100902/1009011: 5段スキル・燃焼DoTと蓄エネ更新の参照時点を全Lvで照合。必殺技の速度支援はダメージ不足としない。"
  },
  "1013": {
    "status": "pending",
    "summary": "通常・敵HP条件のスキル・必殺・HP閾値での追撃あり。",
    "evidence": "hsrGoldenScenariosでHP境界・凍結・E1/E2/E4の分離。",
    "remaining": "101301..101304: 敵HP50%境界のスキル/追撃と凍結対象必殺の全Lv独立値、攻撃途中に閾値を跨ぐ場合の単位を検証する必要。"
  },
  "1103": {
    "status": "pending",
    "summary": "通常・スキル・必殺・感電・感電相手への天賦成分が存在。",
    "evidence": "hsrGoldenScenariosでLv10・E1隣接・感電/天賦条件を検証。",
    "remaining": "110301/110302/110303/1103021/110304: 直接/感電DoT/感電対象への天賦成分を全Lv・対象状態別で独立検証する必要。E1隣接はE0外。"
  },
  "1104": {
    "status": "confirmed",
    "majorSourceIds": [
      "110401",
      "110402"
    ],
    "summary": "通常・スキル本体と、後の敵ターンの非会心凍結ダメージを別イベントで検証。必殺のバリア/天賦蘇生は攻撃不足でない。",
    "evidence": "hsrE0CandidateAudit: 3ダメージ行の固定全曲線、E0全採用Lv、非対称2条件、ATK/HP/DEF分離。",
    "remaining": "戦意のATKは完成済み最終入力に含め、旧自動加算を修正して再加算しない。実画面と保存復元も確認。凍結付与確率やターン管理は対象外。"
  },
  "1106": {
    "status": "pending",
    "summary": "通常・スキル・必殺あり。E6付加はE0では別対象。",
    "evidence": "固定SHA skills/trees/ranksと3直接曲線を照合。hsrPelaE0Completionの全Lv×非対称2条件・参照分離・事前成立補正は一致。",
    "remaining": "110601/110602/110603: 全E0曲線・A2/A6・事前付与済み一般解/秘技の防御補正はhsrPelaE0Completionで独立一致。初回必殺で新規一般解を同一ヒットへ適用するタイミング、解除直後の次攻撃補正は根拠不足のため全構成認定は保留。"
  },
  "1107": {
    "status": "confirmed",
    "majorSourceIds": [
      "110701",
      "110702",
      "110703",
      "110704"
    ],
    "summary": "通常110701、印なし/ありスキル110702/1107021、通常カウンター110704、強化カウンター1107031を別状態で検証。必殺技は即時ダメージではなくカウンター強化。",
    "evidence": "固定SHA skills/trees/ranksを照合。hsrClaraE0Completion: E0全Lv、天賦×必殺全100組の主/隣接、非対称2条件、ATK/HP/DEF分離。hsrToolInputs: 全行比較・必須Lv不足の局所停止・保存。",
    "remaining": "E0の1対象・途中状態変化なしの単発範囲を確認。強化カウンターは通常と合算せず、報復30%を一度だけ適用。E1以上/複数敵全体/行動順は別認定。"
  },
  "1108": {
    "status": "pending",
    "summary": "通常・5段スキル・必殺・風化層数のE0行あり。E4起爆はE0から除外。",
    "evidence": "固定曲線、hsrGoldenScenariosのDoT/層数/補正範囲。",
    "remaining": "110801/110802/110803/110804: 5段スキル・風化1～5層・被DoT増加を全Lvで独立検証。1108044のE4起爆はE0外。"
  },
  "1109": {
    "status": "pending",
    "summary": "通常・通常/強化スキル・必殺・燃焼・燃焼相手への付加成分は別行で存在。",
    "evidence": "hsrGoldenScenariosの係数/隣接/DoT/状態試験を再利用。",
    "remaining": "110901/110902/110909/110903/1109021/110904: 強化スキル主/隣接・燃焼/天賦別成分の全Lv照合が不足。恒常ATK小軌跡の説明値も点検対象。"
  },
  "1203": {
    "status": "confirmed",
    "majorSourceIds": [
      "120301",
      "120303"
    ],
    "summary": "E0ダメージはATK参照の通常と必殺。回復/結界の記録はhiddenで結果に出ない。",
    "evidence": "hsrE0CandidateAudit: 固定全曲線とE0採用Lv1～6/1～10、非対称2条件、参照値分離。",
    "remaining": "敵バフ解除による変化は解除後の敵条件を入力。回復/結界運用とE1以上は別認定。"
  },
  "1204": {
    "status": "pending",
    "summary": "通常・スキル・必殺・神君のE0段数/隣接行は存在。秘技は段数支援。",
    "evidence": "hsrGoldenScenariosで段数/星魂/補正範囲を検証。",
    "remaining": "120401/120402/120403/120404: 神君3～10段、隣接25%、6段以上CD補正の全Lv/全段数の独立照合が不足。ランダム分配/行動順を自動化しない。"
  },
  "1207": {
    "status": "pending",
    "summary": "通常・天賦付加・必殺行は存在。スキル/秘技は支援でhidden。",
    "evidence": "固定120701/120703/120704と補正定義を確認。",
    "remaining": "120701/120703/120704: 通常本体と天賦付加/再発動状態、鳴弦号令中の必殺CR/CDの独立計算と合計の説明が不足。120702は非ダメージ支援。"
  },
  "1208": {
    "status": "confirmed",
    "majorSourceIds": [
      "120801",
      "120803"
    ],
    "summary": "E0ダメージはHP参照の通常と必殺。スキル/天賦/秘技は非ダメージ・hiddenで不足に含めない。",
    "evidence": "hsrE0CandidateAudit: 固定全曲線とE0採用Lv1～6/1～10、非対称2条件、参照値分離。",
    "remaining": "陣のHP/会心等は最終入力で管理。E6の損失HP倍率は別認定。"
  },
  "1209": {
    "status": "pending",
    "summary": "通常・スキル・必殺・追撃・凍結行は登録済み。",
    "evidence": "hsrBatch1206To1210は曲線/補正範囲中心。",
    "remaining": "120901/120902/120903/120904/1209041/1209101: 智剣連心CR/CD、必殺自身のCR60%/CD、被弾解除・追撃/凍結成立時の全Lv・状態別独立値が不足。"
  },
  "1221": {
    "status": "confirmed",
    "majorSourceIds": [
      "122101",
      "122102",
      "122103",
      "122104"
    ],
    "summary": "通常・スキル・通常カウンター・看破の斬/滅を別状態で比較。E0・敵1体・途中変化なしの主要成分を確認。",
    "evidence": "hsrReferencePromotions / hsrGoldenScenarios / hsrMajorAttackPromotions / hsrToolInputs。固定曲線と独立NC/C/期待値を再利用。",
    "remaining": "敵複数への滅の分配、途中撃破、E1以上はこのE0認定の範囲外。"
  },
  "1301": {
    "status": "confirmed",
    "majorSourceIds": [
      "130101",
      "130103",
      "130108"
    ],
    "summary": "E0通常・必殺・強化通常の3行を独立比較。回復スキルと酩酊の撃破支援は通常ダメージ成分でない。",
    "evidence": "hsrGroupedReferenceRound2で通常全6Lv、hsrGoldenScenariosで強化全6Lv/必殺全10Lvの曲線と代表独立計算、hsrToolInputsで状態/保存。",
    "remaining": "回復/行動順は計算しない。撃破/超撃破は別モード。E1以上は別認定。"
  }
};
for(const [id,audit]of Object.entries(e0CandidateAudit)){if(audit.status==='confirmed'){confirmedE0[id]=audit.summary+' 証拠: '+audit.evidence+' 範囲外: '+audit.remaining;confirmedMajorIds[id]=audit.majorSourceIds;}}
const knownGaps={
 '1220':'スキル+雷狩は限定対応。必殺技の分岐と途中撃破/成分間変化が不足。',
 '1314':'質草50層・非債権回収者限定。50層未満の参照時点/本人債権回収者の付加成分は要確認。',
 '1224':'強化通常は支援系師匠限定。攻撃型師匠の属性別付加成分と通常攻撃の正式検証が不足。',
 '1503':'150308/150320は未登録。複数参照者の愉悦成分・参照時点が保留。通常/非愉悦強化のみ対応。',
 '1406':'140603の記録値更新・参照時点は保留。再調査しない。',
 '1212':'資料間で参照値が矛盾する攻撃は保留。版を混在させない。',
 '1304':'必殺技の動揺の同撃適用時点が未確定。追加攻撃は敵1体以外の分配を別途確認。',
 '1305':'スキル/必殺技と後続追撃は別行動。E2付加成分等は今回のE0範囲外。',
 '1407':'精霊1140702の段階別全成分・所有者/参照値が不足。',
 '1512':'精霊1151201は精霊自身の最終HP・フィーバー限定。全精霊行動や他軌跡/星魂の完成ではない。',
 '1513':'愉悦は敵1体・各リソース/安定条件の限定対応。複数敵や途中撃破は未対応。',
 '1218':'通常は攻撃前から焼尽5層の想定。直撃/DoTは別行。初回付与・5層未満の全直撃状態と途中変化は未認定。',
 '1222':'通常を補完。スキル/必殺の浮元との順序・別行動・低HP自動追撃を含む全状態の構成確認は未認定。',
 '1213':'強化通常中のヒット別与ダメージ/会心累積を要確認。',
 '1308':'必殺技の段階別成分/集真赤の状態変化を要確認。'
};
function skillRole(skill){
 if(!combatTypes.has(skill.type))return '秘技/フィールド（E0主要攻撃の判定外）';
 if(directEffects.has(skill.effect))return '直接ダメージ行動';
 if(/付加ダメージ|確定ダメージ|持続ダメージ|ダメージを与|ダメージが発生/.test(skill.desc||''))return '条件付き/別成分（即時攻撃と区別）';
 if(['Restore','Support','Defence'].includes(skill.effect))return '支援/回復/防御（ダメージ不足に数えない）';
 return '召喚/状態/条件（ダメージ有無の確認待ち）';
}
function category(a){
 const t=a.type;
 if(t==='normal')return '通常';if(t==='enhancedNormal')return '強化通常';
 if(t==='skill')return 'スキル';if(t==='enhancedSkill')return '強化スキル';if(t==='ultimate')return '必殺技';
 if(t==='followUp'||a.tags?.includes('followUp'))return '追加/カウンター';
 if(['memospriteSkill','memospriteTalent'].includes(t))return '精霊/独立参照';
 if(['dot','break','superBreak','elation','trueDamage'].includes(t)||['elation','trueDamage'].includes(a.damageFormula))return '固有/特殊';
 return t==='technique'?'秘技':t;
}
function bounds(a){const max=a.maximumTraceLevel;const ref=a.damageFormula==='elation'?'愉悦度/爆笑ネタ/上笑':a.damageFormula==='trueDamage'?'元ダメージ（専用入力）':a.scalingTerms?.length?[...new Set(a.scalingTerms.map(t=>t.stat))].join('+'):a.scalingStat||'要確認';return `参照${ref} / ${a.traceKey||'参照キー未明示'}: ${max?'Lv1～'+max:'倍率配列'+(a.multipliers?.length||0)+'Lv分（検証上限未明示）'} / E${a.requiredEidolon||0}～${a.maximumEidolon??'上限未明示'}`;}
function difficulty(a){
 if(a.support?.status==='calculable')return '既存対応・範囲外を別管理';
 if(['elation','trueDamage','memospriteSkill','memospriteTalent'].includes(a.type)||['elation','trueDamage','componentSequence','normalAndBreak'].includes(a.damageFormula))return '中～大候補: 特殊成分/独立参照（要精査）';
 if(a.target==='bounce'||a.hitCountInputKey||a.comparisonStates)return '中候補: 段数/状態/分配（要精査）';
 return '小～中候補: 独立検証/固有効果精査';
}
async function fixed(file){const response=await fetch(sourceBase+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);return response.json();}
async function generate(){
 const [{data,engine},characters,skills,trees,ranks]=await Promise.all([loadProductionFixture(),fixed('characters.json'),fixed('character_skills.json'),fixed('character_skill_trees.json'),fixed('character_ranks.json')]);
 if(data.characters.length!==98||Object.keys(characters).length!==98)throw Error('固定母集団98人と不一致');
 let matchedSkills=0,matchedRanks=0;
 for(const c of data.characters){if(!characters[c.id])throw Error('固定キャラなし '+c.id);for(const s of c.skills){const f=skills[s.id];if(!f||JSON.stringify(f.params)!==JSON.stringify(s.params)||f.desc!==s.description)throw Error('固定スキル差分 '+s.id);matchedSkills++;}for(const e of c.eidolons){const r=ranks[e.id];if(!r||r.desc!==e.description||JSON.stringify(r.level_up_skills||[])!==JSON.stringify(e.levelUpSkills||[]))throw Error('固定星魂差分 '+e.id);matchedRanks++;}}
 const attackStatus=a=>engine.unsupportedAttackReason(a)?'計算不可':a.support?.status==='calculable'&&a.support?.verified?'計算対応':a.support?.status==='displayOnly'?'計算不可':'参考値';
 const counts=sumBy(data.attacks,attackStatus);
 const details=data.characters.map(c=>{
  const attacks=data.attacks.filter(a=>String(a.characterId)===c.id);
  const sources=c.skills.map(s=>skills[s.id]);
  const required=sources.filter(s=>['直接ダメージ行動','条件付き/別成分（即時攻撃と区別）'].includes(skillRole(s)));
  const mapped=s=>attacks.filter(a=>(a.id===s.id||a.sourceSkillId===s.id)&&!(a.requiredEidolon>0)&&!a.hidden);
  const absent=required.filter(s=>!mapped(s).length);
  const pending=required.filter(s=>!mapped(s).some(a=>attackStatus(a)==='計算対応'));
  const unknown=sources.filter(s=>skillRole(s)==='召喚/状態/条件（ダメージ有無の確認待ち）');
  const audit=e0CandidateAudit[c.id];
  const hasMissingComponent=Boolean(audit?.missingComponents?.length);
  const candidate=required.length>0&&!pending.length&&!unknown.length&&!hasMissingComponent;
  const confirmed=Boolean(confirmedE0[c.id]&&candidate&&JSON.stringify(required.map(s=>s.id).sort())===JSON.stringify((confirmedMajorIds[c.id]||[]).slice().sort()));
  const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon'&&String(m.source.id)===c.id);
  return {c,attacks,sources,required,mapped,absent,pending,unknown,candidate,confirmed,eidolon,audit,hasMissingComponent};
 });
 const confirmed=details.filter(d=>d.confirmed),candidates=details.filter(d=>d.candidate);
 const missingCharacters=details.filter(d=>d.pending.length>0||d.hasMissingComponent).length;
 const pendingComposition=98-confirmed.length-missingCharacters;
 const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon');
 const eidolonOwners=new Set(eidolon.map(m=>m.source.id));
 const missing=details.reduce((n,d)=>n+d.absent.length,0),unknown=details.reduce((n,d)=>n+d.unknown.length,0);
 const lines=[];const p=(...s)=>lines.push(...s);
 p('# HSR 全98キャラクター完成管理表','','この表は作業管理用です。登録状態、E0主要攻撃の構成確認、星魂/装備/支援の完成を分けます。計算対応レコードの存在だけではキャラクター全体を完成扱いにしません。','','## 更新手順','','1. `node scripts/reportHsrCompletion.cjs` で本番ローダーと固定版を再照合して更新。ネットワーク取得に失敗した場合は書き換えません。','2. `node scripts/reportHsrCompletion.cjs --check` で現在の文書と再生成結果を照合。','3. 個別攻撃の正式化はoverrideの限定条件/provenanceと独立検証テストを更新してから再生成。','4. E0主要構成を確認できた人はスクリプトのconfirmedE0へ根拠を追記。登録件数だけで追加しない。','5. E1～6、装備/パーティ、UI/UID/保存の統合確認を別途完了して初めて最終ゴールの完成認定を行う。','','## 基準と現在値','',`- 固定版: [StarRailRes ${sha}](https://github.com/Mar-7th/StarRailRes/tree/${sha}/index_new/jp)。98 ID・${matchedSkills}スキルの係数配列/説明・${matchedRanks}星魂の説明/Lv加算がカタログと一致。これは各攻撃の精度検証とは別。`,`- 本番攻撃（非表示の内部記録を含む）: ${data.attacks.length}件 = 計算対応${counts['計算対応']||0} / 参考値${counts['参考値']||0} / 計算不可${counts['計算不可']||0}。特殊撃破レコードは別枠${data.specialBreakAttacks.length}件。hidden ${data.attacks.filter(a=>a.hidden).length}件（うち計算対応${data.attacks.filter(a=>a.hidden&&attackStatus(a)==='計算対応').length}件）は画面の主要ダメージ一覧に含めない。`,`- E0主要攻撃の構成確認済み: **${confirmed.length}人** (${confirmed.map(d=>`${d.c.name} ${d.c.id}`).join('、')})。このE0限定単発範囲のみの認定であり、全星魂/全装備の完成ではない。`,`- 残るE0完成未認定: **${98-confirmed.length}人**。登録上の充足候補は全98人中${candidates.length}人（確認済みを含む）。主要候補の登録不足がある${missingCharacters}人と、登録済みでも全構成の確認待ち${pendingComposition}人を区別。`,`- 主要候補スキルIDの未登録: ${missing}件。これはマスターの明示ダメージ/条件成分からの管理候補であり、独立した未実装ダメージ数ではない。状態系の有無確認待ちは${unknown} ID。`,`- 新しい計算処理が必要な攻撃の総数: **未確定**。下表の難易度は調査入口。既存式の接続不足、新しい成分処理、新しいダメージ式を混同しない。`,`- 育成・全星魂・全装備/支援・統合QAまでの最終完成認定: **0人**（この基準の全項目を完了した記録はまだない）。既存の過去complete宣言は採用していない。`,'','分類: 主なNormal/BPSkill/Ultra/Talent/Elation/Memosprite/Assistを対象とする。秘技/フィールドは主要攻撃集計から除外。Support等でも付加/持続/確定ダメージを生む記述は別成分の要確認として残し、支援発動時の直接ダメージにしない。未知の状態/Summonを未実装攻撃と断定しない。','','## 98人一覧','','表中の対応数は登録状態。E0構成欄の「登録上充足候補」は倍率・固有効果・未登録成分まで確認済みという意味ではありません。','', '|ID・名前|通常/強化|スキル/強化|必殺技|追加/カウンター|精霊/特殊等|登録 対応/参考/不可|E0主要構成と不足|難易度|','|---|---|---|---|---|---|---:|---|---|');
 for(const d of details){const list=types=>d.attacks.filter(a=>types.includes(category(a))).map(a=>`${a.id}[${attackStatus(a)}]`).join('、')||'—';const cs=sumBy(d.attacks,attackStatus);const gap=d.audit?.remaining||knownGaps[d.c.id]||`${d.pending.length}主要候補未充足・${d.unknown.length}状態/召喚等の有無確認待ち。固有補正/全状態は個別精査。`;p(`|${'['+cell(d.c.id+' '+d.c.name)+'](#character-'+d.c.id+')'}|${list(['通常','強化通常'])}|${list(['スキル','強化スキル'])}|${list(['必殺技'])}|${list(['追加/カウンター'])}|${list(['精霊/独立参照','固有/特殊','talent','additional','joint','assist'])}|${cs['計算対応']||0}/${cs['参考値']||0}/${cs['計算不可']||0}|${cell((d.confirmed?'確認済み':d.hasMissingComponent?'監査で成分不足を確認':d.candidate?'登録上充足候補・構成要確認':'未認定')+'。'+gap)}|${d.confirmed?'小: 統合QA/星魂へ':d.unknown.length?'要精査: 条件/召喚':'既存式候補～成分処理（未確定）'}|`);}
 p('','## 充足候補19人の重点監査','','固定版のスキル・追加能力・実行時行・独立検証記録を照合。登録だけでは認定しない。E0採用Lvは通常1～6、その他1～10。全曲線のLv7/11以上の一致をE0や星魂対応の認定と混同しない。','','|ID・名前|判定|確認内容・残作業|検証根拠|','|---|---|---|---|');
 for(const[id,a]of Object.entries(e0CandidateAudit)){const name=data.characters.find(c=>c.id===id)?.name||id;p(`|${id} ${cell(name)}|${a.status==='confirmed'?'E0主要構成確認済み':a.status==='missing'?'未登録成分あり':'構成/独立検証待ち'}|${cell(a.summary+' '+a.remaining)}|${cell(a.evidence)}|`);}
 p('','重点監査で判明した未登録成分のうち、現在も残るものを以下に列挙する。解消済みの成分は上表に履歴を残す。マスターの主スキルIDだけで成分の完全性を認定しない。');
 for(const[id,a]of Object.entries(e0CandidateAudit))for(const component of a.missingComponents||[])p(`- ${id}: ${component}`);
 p('','### 残作業の調査入口（確定した実装規模ではない）','','|分類|参考値/不可レコード数|','|---|---:|');
 for(const [name,count] of Object.entries(sumBy(data.attacks.filter(a=>attackStatus(a)!=='計算対応'&&a.type!=='technique'),difficulty)))p(`|${cell(name)}|${count}|`);
 p('','## 前工程の通常攻撃改善と統合検証（b7aac65）','','- 椒丘121801「心火計（焼尽5層）」と霊砂122201「供香」を参考値から正式対応へ変更。既存IDをoverrideし、攻撃行の総数は増やしていない。通常Lv1～6はATK50/60/70/80/90/100%。両者ともE0・Lv80・炎非弱点の未撃破の敵1体・途中状態変化なし。','- 椒丘は天賦Lv1～10の既存焼尽5層を前提とし、必須被ダメージ増加を1回だけ適用。初回付与・5層未満・DoT合算は対応外。霊砂は浮元の別行動や撃破ダメージを通常へ合算しない。','- ATK3000・会心50/100%・通常Lv6・敵Lv80/炎耐性20%/靭性あり: 椒丘（天賦10・焼尽5層）1458/2916/2187、霊砂1080/2160/1620（非会心/会心/期待値）。全採用LvとATK/HP/DEF個別変更をhsrCompletionBasicsで独立検証。','- ジェパードの戦意を完成済み最終ATKへ再加算する不具合を実画面で再現して修正。係数35%は説明用に保持し、includedInFinalStatsとして二重適用しない。ATK3000/DEF3000の通常Lv6は1458ではなく1080。','- 補正のattackIdsをエンジンの直接呼び出しでも尊重。通常専用補正が別攻撃/超撃破へ混入しない回帰テストを追加。','- PC1440px・390px・320pxで確認済み9人と新しい通常2件を操作。補正ON/OFF、ロビン支援、必要Lv不足による局所停止、保存/再読み込み、箇条書きの枠内位置を確認。UI用一時画像はリポジトリへ保存しない。');
 p('','## 星魂・装備・パーティの別軸管理','',`- 98人に各E1～6の元データ（計${data.characters.reduce((n,c)=>n+c.eidolons.length,0)}件）。固定rank辞書全体${Object.keys(ranks).length}件とは母集団が異なる。`,`- 構造化星魂${eidolon.length}件・${eidolonOwners.size}人、計算処理対象${eidolon.filter(m=>m.support.status==='calculable').length}件、表示専用${eidolon.filter(m=>m.support.status==='displayOnly').length}件。攻撃倍率/ヒット数のoverride対応や軌跡Lv加算は別経路なので、この件数を全対応効果数とはしない。`,'- E3/E5はcatalog.eidolons[].levelUpSkillsからのLv加算処理と、各攻撃の採用曲線/上限/星魂範囲をセットで検証する。元データやUI上限の存在だけでは計算対応としない。','','|星魂|構造化記録|計算処理対象|表示専用|','|---|---:|---:|---:|');
 for(let n=1;n<=6;n++){const items=eidolon.filter(m=>Number(m.source.eidolonRank)===n);p(`|E${n}|${items.length}|${items.filter(m=>m.support.status==='calculable').length}|${items.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','|補正提供元|登録|計算処理対象|表示専用|','|---|---:|---:|---:|');for(const kind of ['trace','lightCone','relic','ornament']){const a=data.structuredModifiers.filter(m=>m.source.kind===kind);p(`|${kind}|${a.length}|${a.filter(m=>m.support.status==='calculable').length}|${a.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','- 停雲、ロビン、サンデー、花火、椒丘、夏ロビン、霊砂/ギャラガーの既存補正は提供者/対象/個別軌跡/ON/OFFを維持する。候補表示だけを適用済みと数えない。','- 主な不足: フォフォ121703の味方ATK支援（trace補正なし）、光円錐21056の味方撃破ダメージ支援（表示専用、撃破/超撃破の範囲要照合）。','- 常時効果21066愉悦度・23055DEF・遺物133速度/134会心ダメージ・パールA2は最終入力で管理する。表示専用でも未実装の自動加算漏れとは数えない。','- 任意補正OFFで基礎計算、ONで必要値不足は影響する結果のみ停止。提供者離脱/再加入・保存復元・UID反映は独立の統合QA項目。','','## 次回優先順位（最大10項目）','','1. 姫子1003101/1003102: 星火の燃焼DoT独立行と、燃焼対象へのスキル補正を補完。通常/スキル/必殺/追撃の全E0構成を照合。','2. 存護なのか100103: 必殺の後続凍結ダメージを別行で登録・検証。必殺本体と二重合算しない。','3. 飛霄122003/122008/122009: 必殺技の段階別成分と途中撃破なしの限定単発を検討。','4. アベンチュリン130403: 動揺の同撃適用と任意条件との整合を確定してから正式化。','5. ジェイド131401: 既存必殺/追撃と合わせ通常を検証。本人債権回収者の別成分を混同しない。','6. 巡狩なのか122401/122402: 通常の検証と攻撃型師匠の属性別付加成分を分離。','7. キャストリス1140702: 精霊の参照値/フェーズ別全成分を確認。','8. E3/E5を中心に採用曲線と星魂上限を攻撃単位で照合。E1/E2/E4/E6の倍率/段数変更はそれぞれ別検証。','9. フォフォ121703: 重要な味方ATK支援の提供者/対象/継続状態を既存補正へ接続。','10. 光円錐21056: 撃破/超撃破支援の適用範囲を確定。残る参考値検証→PC/モバイル/UID/保存の総合QAへ進む。','','過去保留のパール150308/150320・サフェル140603・鏡流の版差は再調査せず、根拠が得られるまで保留欄で追跡する。人気順位は推測していない。','','## キャラクター別の登録・未登録・Lv/星魂・限定条件','');
 for(const d of details){p(`<a id="character-${d.c.id}"></a>`, `### ${d.c.id} ${d.c.name}`,'',d.confirmed?confirmedE0[d.c.id]:d.audit?(d.audit.summary+' 残作業: '+d.audit.remaining+' 証拠: '+d.audit.evidence):knownGaps[d.c.id]||'登録一覧の全成分/固有効果は要精査。登録状態と完成認定を分ける。','', '|攻撃ID・種類・名前|登録/実行|Lv・星魂範囲|必要入力・限定条件・不足|次作業/難易度|','|---|---|---|---|---|');for(const a of d.attacks)p(`|${a.id} ${cell(category(a)+' '+a.name)}|登録・${attackStatus(a)}|${cell(bounds(a))}|${cell(a.calculationNote||a.conditionText||a.support?.reason||'個別の入力・固有補正範囲は未明示')}|${cell(difficulty(a))}|`);
  p('','|固定版スキルID・名前|性質|対応する登録攻撃|管理上の扱い|','|---|---|---|---|');for(const s of d.sources){const mapped=d.mapped(s);const role=skillRole(s);p(`|${s.id} ${cell(s.name)}|${cell(role)}|${mapped.map(a=>a.id+' '+attackStatus(a)).join('、')||'なし'}|${role.startsWith('支援')?'ダメージ未実装数に含めない':role.startsWith('秘技')?'主要完成集計外':role.startsWith('召喚')?'有無/子攻撃/既存式接続を要確認':mapped.length?'成分/時点/条件の完全性を確認':'未登録候補。独立ダメージか既存行の成分か要確認'}|`);}
  p('','|星魂|構造化計算/表示|軌跡Lv加算（元データ）/残作業|','|---|---|---|');
  for(let rank=1;rank<=6;rank++){const es=d.eidolon.filter(m=>Number(m.source.eidolonRank)===rank),raw=d.c.eidolons.find(e=>Number(e.rank)===rank);const levelSkills=raw?.levelUpSkills||[];p(`|E${rank}|${es.filter(e=>e.support.status==='calculable').length}/${es.filter(e=>e.support.status==='displayOnly').length}|${levelSkills.map(x=>cell(JSON.stringify(x))).join('、')||'Lv加算なし'}。${es.length?'効果ごとの攻撃範囲/実計算を確認':'構造化記録なし。効果がないとは判断せず影響を精査'}|`);}
  p('',`星魂: 元データE1～6あり。構造化${d.eidolon.length}件（計算${d.eidolon.filter(m=>m.support.status==='calculable').length}・表示${d.eidolon.filter(m=>m.support.status==='displayOnly').length}）。E0主要攻撃と別に、各星魂の攻撃影響/軌跡Lv加算を確認する。`,'');
 }
 p('## 機械照合用フィンガープリント','',`- runtime: \`${hash({attacks:data.attacks,modifiers:data.structuredModifiers,specialBreak:data.specialBreakAttacks})}\``,`- fixed skills/trees/ranks: \`${hash({skills,trees,ranks})}\``,'','元JSONのコピーは保存せず、固定SHAからメモリ上で照合する。この管理表は配信資産や計算ランタイムには使用しない。','');
 return {text:lines.join('\n'),summary:{characters:98,attacks:data.attacks.length,counts,confirmedE0:confirmed.length,screenedCandidates:candidates.length,notCertified:98-confirmed.length,missingCharacters,pendingComposition,missingMasterCandidates:missing,unknownStateSkills:unknown}};
}
if(require.main===module)generate().then(({text,summary})=>{if(process.argv.includes('--check')){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==text)throw Error('管理表が現在データと不一致。node scripts/reportHsrCompletion.cjs で更新してください。');}else fs.writeFileSync(output,text,'utf8');console.log(JSON.stringify(summary));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate,skillRole,e0CandidateAudit};
