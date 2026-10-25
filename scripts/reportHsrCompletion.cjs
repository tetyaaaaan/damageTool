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
    "status": "confirmed",
    "majorSourceIds": [
      "100101",
      "100103",
      "100104"
    ],
    "summary": "通常・必殺即時・通常カウンターと、必殺で凍結成立後の1001031を独立行で比較。シールド/解除/延長は非ダメージ支援。",
    "evidence": "固定100101/100103/100104、追加能力1001101..103とE0を照合。hsrDelayedDamageCompletion: 全E0曲線・非対称値・参照分離。hsrToolInputs/PC1440・390・320で全4行、局所停止・保存を確認。",
    "remaining": "E0・敵1体・状態一定の単発範囲。凍結は50%基礎（氷呪解放65%）で成立済みの1回を仮定し、即時と合算/確率平均しない。秘技・星魂・ターン管理は別認定。",
    "missingComponents": [],
    "requiredAttackIds": [
      "100101",
      "100103",
      "100104",
      "1001031"
    ]
  },
  "1003": {
    "status": "confirmed",
    "majorSourceIds": [
      "100301",
      "100302",
      "100303",
      "100304"
    ],
    "summary": "通常・スキル・必殺・独立追撃・星火DoT10031011の5イベントを確認。灼熱は燃焼中の対象へのスキル+20%、道標は最終会心率で管理。",
    "evidence": "固定100301..304/1003101..103、hsrDelayedDamageCompletion: 全E0Lv/隣接・非対称2条件・参照分離・灼熱対象/非重複。PC1440・390・320で5行・支援ON/OFF・保存を確認。",
    "remaining": "E0・敵1体・攻撃中の状態一定。星火は成立済みのATK30%DoT1回で、50%基礎付与確率・2ターンを乗算/合算しない。HP80%以上の道標CR15%は最終入力に含める。異なる敵間の燃焼状態/途中変化・星魂は別認定。",
    "missingComponents": [],
    "requiredAttackIds": [
      "100301",
      "100302",
      "100303",
      "100304",
      "10031011"
    ]
  },
  "1004": {
    "status": "pending",
    "summary": "直接攻撃・スキルバウンド・減速相手の天賦成分は登録。",
    "evidence": "hsrGoldenScenariosに前/強化版・段数・星魂条件。",
    "remaining": "100401..100404/1100401..1100404: 3/5段スキルの減速付与と天賦追加の順序、各段と別行の合計関係を独立照合。初回付与タイミングは推測しない。 強化版の裁決による自己ATK変換は最終入力管理へ修正し二重加算を防止。"
  },
  "1005": {
    "status": "pending",
    "summary": "直接攻撃と感電/起爆が別レコード。前/強化版も登録。",
    "evidence": "hsrGoldenScenariosに係数・非会心・起爆入力・星魂条件の検証。",
    "remaining": "100501..100504と1100501..1100504、感電/起爆別行: 前/強化版の直接成分・付与後の感電起爆・敵既存DoT入力・主/隣接を全Lvで独立照合する必要。 強化版苛みは自己最終ATK管理と外部味方支援を分離。初回感電付与/起爆順序は未確認。"
  },
  "1009": {
    "status": "pending",
    "summary": "100901/100902/1009011の通常・5段スキル・火花DoTを維持。必殺/蓄エネは支援であり攻撃不足ではない。",
    "evidence": "固定100902/100904/1009101とPrydwenを再照合。既存hsrGoldenScenarios・hsrFinalStatAuditの段数/層数/炎限定支援・非再加算記録を再利用。",
    "remaining": "100902/100904の蓄エネ更新時点を固定版で未確認。KQMアスターガイドはUpdated v1.4でターン終了時獲得と説明するが、固定版への継承根拠はない。各段でATKが変わると推測して処理を追加しない。1009011は通常倍率50%の燃焼で付与確率80%/3ターンを値へ掛けない。固定版の蓄エネ実行時点とDoT評価時点の証拠が得られるまで構成認定を保留。"
  },
  "1013": {
    "status": "confirmed",
    "majorSourceIds": [
      "101301",
      "101302",
      "101303",
      "101304"
    ],
    "requiredAttackIds": [
      "101301",
      "101302",
      "101303",
      "101304"
    ],
    "summary": "通常・HP50%以上/未満のスキル・凍結状態別必殺・独立追撃のE0主要4行を確認。",
    "evidence": "固定101301..304/1013101..103、hsrHertaE0Completion: 全E0曲線・非対称2条件・ATK/HP/DEF分離。スキルHP条件20%と追加能力25%を別加算、凍結必殺20%、恒常氷/会心の非再加算を独立照合。",
    "remaining": "Lv80・E0・敵1体・攻撃中のHP/凍結状態一定の単発範囲。追撃は発動した1回を独立比較し連鎖/途中閾値通過を自動再現しない。E1以上/複数敵/行動管理は別認定。"
  },
  "1103": {
    "status": "pending",
    "summary": "110301/110302/110303本体、110304天賦付加、1103021感電DoTを区別し、主/隣接の全E0曲線とATK参照を独立検証。",
    "evidence": "固定110301..304とhsrServalHookStates/hsrToolInputs。KQM champion-set-stacksの2023-05-28実行順記録を発見：主/隣接→AttackEnd→感電付与。既存星魂の補正範囲はhsrGoldenScenariosを再利用。",
    "remaining": "旧版KQM検証では初回スキルの新規感電は同撃天賦の判定後。固定版で同じ順序が維持される実行根拠は未照合のため、初回の自動合算と全構成認定を保留。事前感電で発生する付加1回と、後続非会心DoTは別行。本体だけを全体合計と表示しない。"
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
    "summary": "通常/スキルと、攻撃前から同Lv一般解が成立済みの必殺技を独立比較。",
    "evidence": "hsrPelaE0CompletionとhsrPelaPriorSolution: 全E0曲線、事前一般解のLv別DEF30～40%と痛撃20%、同一群重複排除/他DEF補正/100%上限を独立照合。",
    "remaining": "110603の初回新規一般解と痛撃の同撃参照は固定公開資料で未確認。必殺行は事前同Lv一般解を明示し、その効果だけ自動適用。110602解除で新規発生するA6の同撃判定も推測せず、攻撃前から有効な次攻撃効果のみ手動指定。E0全構成認定は保留。"
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
    "remaining": "E0の1対象・途中状態変化なしの単発範囲を確認。強化カウンターは通常と合算せず、報復30%を一度だけ適用。E1以上/複数敵全体/行動順は別認定。",
    "requiredAttackIds": [
      "110701",
      "110702",
      "1107021",
      "110704",
      "1107031"
    ]
  },
  "1108": {
    "status": "confirmed",
    "majorSourceIds": [
      "110801",
      "110802",
      "110803",
      "110804"
    ],
    "requiredAttackIds": [
      "110801",
      "110802",
      "110803",
      "110804"
    ],
    "summary": "通常・敵1体へのスキル全5段・必殺即時・風化1～5層の独立DoTを確認。",
    "evidence": "固定110801..304、hsrSampoE0Completion: 全E0曲線/風化全層/必殺DoT被ダメージ増加全Lv・非対称2条件・参照値分離。hsrToolInputsで0層/不正値の局所停止/保存を検証。",
    "remaining": "Lv80・E0・敵1体・状態一定の単発範囲。風化は成立済みの敵ターン1回で非会心、付与確率65%・3ターンを乗算しない。0層は有限0、E4起爆/分配/途中付与は別認定。"
  },
  "1109": {
    "status": "pending",
    "summary": "110901/110902/110909/110903本体、110904天賦付加、1109021燃焼DoTの全E0曲線と強化主/隣接を独立検証。",
    "evidence": "固定110901..904/110909とPrydwen。hsrServalHookStates/hsrToolInputs: ATK/HP/DEF分離・Robin支援・保存・天賦Lv不足局所停止。E0の付加は事前燃焼の想定行、E6はダメージを変える燃焼条件を維持して1296を確認。",
    "remaining": "110902/110909で新規燃焼を付与した同撃の天賦110904発生順は未確認。事前燃焼の付加と本体/後続DoTを区別し、自動合算しない。恒常ATK28%は最終入力で管理。初回状態が未確定のためE0全構成認定を保留。"
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
    "summary": "通常120401、事前遣将のスキル120402、必殺120403、敵1体の神君120404（3～10段）を全E0採用Lvで独立検証。",
    "evidence": "固定120401..404/1204101/1204103とKQM SRL。hsrJingYuanE0Completion: 2非対称条件・LL全8段数/主/隣接係数・A2/A6・ATK/HP/DEF分離。hsrToolInputsとPC1440/390/320: 8行・支援・不足値局所停止・保存。",
    "remaining": "神君の敵1体全段合計と6段以上CD25%は確認済み。120402は攻撃前から遣将が有効（最終CRには未算入）とし、CR10%を一度適用。初回スキルで新規発生する遣将が同スキルへ作用する順序は未確定のため、E0全構成認定は保留。敵複数へのランダム分配/途中撃破は今回の範囲外。"
  },
  "1207": {
    "status": "pending",
    "summary": "通常本体120701、天賦追加120704、発動時合計1207011、必殺120703を分離。通常限定補正がない安定1対象で独立一致。",
    "evidence": "固定120701/120703/120704とhsrYukongE0Completion: 全通常6×天賦10Lv、成分別/合計/ATK参照分離。hsrToolInputs: 不足Lv/未確認補正の局所停止・支援・保存。",
    "remaining": "120704への通常攻撃ダメージ限定補正の継承が未確認のため、その補正が有効なら追加成分と合計だけ停止。全構成認定は保留。鳴弦号令/必殺支援は既存手動状態、A4自己12%は最終入力、外部支援は別。"
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
    "summary": "120901/120902/120903/120904/1209041/1209101の通常・スキル・必殺・追撃・凍結・頒氷は登録。",
    "evidence": "固定120902..904/1209101とKQM彦卿を再照合。既存hsrBatch1206To1210/hsrFinalStatAuditを再利用。PC1440/390/320で事前智剣連心のスキル2376/5464.8/4538.16、必殺会心10584を比較。",
    "remaining": "120902で新規智剣連心が有効になる順序と、120903後に残るCR60%/CD支援の次攻撃への扱いを確認する必要。追撃の想定成立と智剣連心CR/CD、1209041凍結・1209101頒氷の全Lv/全状態・補正参照を独立照合する必要があり、全構成認定は保留。"
  },
  "1218": {
    "status": "pending",
    "summary": "121801/121802/121803/1218041の通常・スキル・必殺・焼尽DoTは既存限定条件で全採用Lvの独立記録あり。",
    "evidence": "hsrCompletionBasics・hsrGoldenScenarios（five-roast/Zone・Ashen Roast tick）の固定曲線/5層前提/DoT層数・参照分離を再利用。",
    "remaining": "121801は攻撃前から焼尽5層、スキル/必殺も既存5層/領域状態に限定。初回付与と5層未満の直接攻撃・隣接対象の層/参照順を全成分で照合する必要。DoTは直接攻撃に合算しない。"
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
  "1222": {
    "status": "confirmed",
    "majorSourceIds": ["122201", "122202", "122203", "122204"],
    "requiredAttackIds": ["122201", "122202", "122203", "122204"],
    "summary": "E0通常・スキル・必殺・浮元の4行を独立比較。必殺自身は1ヒット、浮元は全体+追加単体の2ヒット。浮元の有無は必殺自身の倍率を変えない。",
    "evidence": "固定版122201..122204/A2/A4/A6・KQM Lingsha Quick Guide・正式4.6の浮元精密係数を照合。hsrLingshaE0Completionで全E0曲線と非対称2条件/参照分離/支援/芳酔除外、hsrToolInputsで4行・不足Lvの局所停止・保存。PC1440/390/320で必殺と浮元の別行動、芳酔の撃破/超撃破専用範囲を実画面確認。",
    "remaining": "E0・Lv80・敵1体・状態一定の単発比較。通常の既存条件に合わせ炎非弱点の未撃破を使用。朱炎のATK変換は最終ATKへ含める。回復/EP/召喚残数/行動順/低HP判定を自動管理しない。必殺で100%前進した浮元とA6による天賦発動は別行動として同じ122204を使用し、必殺へ自動合算しない。複数敵・途中撃破・E1以上、全装備/支援を含む最終完成は別認定。"
  },
  "1101": {
    "status": "confirmed",
    "majorSourceIds": [
      "110101"
    ],
    "requiredAttackIds": [
      "110101"
    ],
    "nonDamageSourceIds": [
      "110104"
    ],
    "summary": "E0本人ダメージは通常110101のみ。号令のCR100%と軍勢の戦闘中与ダメージ10%を既存補正で1回適用。スキル/必殺は支援、天賦は行動順変更のみ。E4追撃をE0不足に数えない。",
    "evidence": "固定110101..110104/1101101..1101103/星魂110104を直接照合。hsrSupporterE0Completion: 全E0通常Lv、非対称2条件、参照分離、号令通常限定/軍勢10%とRobin支援の独立計算。hsrToolInputsとPC1440/390/320で1行/不足Lv/保存。",
    "remaining": "E0・Lv80・通常Lv1～6・主要追加能力解放済み・敵1体・状態一定。風小軌跡22.4%/CD24%は最終入力、軍勢10%は未算入の入力から既存補正を使用。行動順/支援運用/回復・他行動は合算しない。E1以上・全支援/装備の最終完成は別認定。"
  },
  "1217": {
    "status": "confirmed",
    "majorSourceIds": [
      "121701",
      "1121701"
    ],
    "requiredAttackIds": [
      "121701",
      "1121701"
    ],
    "summary": "原版121701/強化版1121701の通常は本人の最終最大HP参照。E0本人の直接ダメージはこの通常のみ。スキル/天賦の回復と必殺の自身以外へのEP/ATK支援は本人攻撃に含まない。",
    "evidence": "固定121701..121704/1121701..1121704と各追加能力/星魂を照合。原版hsrGroupedReferencePromotionsを再利用、hsrSupporterE0Completionで両版全E0曲線・HPのみの感度/非再加算/Robin支援を独立検証。hsrToolInputsとPC1440/390/320で版・HP不足・保存。",
    "remaining": "E0・Lv80・通常Lv1～6・敵1体・状態一定。装備/小軌跡のHPは最終最大HPへ含める。現在HP/他者ATK/自身以外への支援で参照値を置換しない。回復/SP/EP/行動順は合算せず、必殺ATK支援・強化A4の最大EP条件を含む支援完成やE1以上は別認定。"
  },
  "1306": {
    "status": "confirmed",
    "majorSourceIds": [
      "130601",
      "1130601"
    ],
    "requiredAttackIds": [
      "130601",
      "1130601"
    ],
    "summary": "原版/強化版とも本人の直接ダメージはATK参照通常のみ。130601/1130601を版選択で分離し、同名の別版を同時合算しない。スキル/天賦/必殺の支援はダメージ攻撃不足に数えない。",
    "evidence": "固定130601..130604/1130601..1130604と各追加能力/星魂を照合。hsrSupporterE0Completion: 両版の全E0曲線、ATK/HP/DEF分離、自己ATK非再加算、入力CD/DMG/敵被ダメージ/耐性貫通、Robin支援を独立照合。hsrToolInputsとPC1440/390/320で版/保存/局所停止。",
    "remaining": "E0・Lv80・通常Lv1～6・敵1体・状態一定。夜想曲のATKは最終入力。本人SkillのCDと原版Talent/CipherのDMGは最終入力/手動欄、強化版の幻相/CipherとA6耐性貫通10%は敵条件に1回だけ指定。花火の既存party専用支援は本人へ自動適用しない。自己支援の全自動化、層更新/SP/行動順、E1以上、全支援/装備は別認定。"
  },
  "1002": {
    "status": "confirmed",
    "majorSourceIds": [
      "100201",
      "100202",
      "100203"
    ],
    "requiredAttackIds": [
      "100201",
      "100202",
      "100203"
    ],
    "sourceRoleOverrides": {
      "100204": "自己補正（次攻撃の風耐性貫通・独立ダメージなし）"
    },
    "summary": "通常・スキル・事前減速別必殺の全曲線。減速はA6通常40%と必殺追加倍率で共有。寸勁の次攻撃耐性貫通は任意ON。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。敵減速は攻撃前から成立した状態。スキル新規減速と途中の会心/撃破/天賦消費を自動管理しない。秘技ATK40%と小軌跡は最終入力。補正ONで必要TalentLv不足なら影響する攻撃だけ停止。"
  },
  "1008": {
    "status": "confirmed",
    "majorSourceIds": [
      "100801",
      "100802",
      "100803"
    ],
    "requiredAttackIds": [
      "100801",
      "100802",
      "100803"
    ],
    "sourceRoleOverrides": {
      "100804": "自己補正（損失HPの与ダメージ・独立攻撃なし）"
    },
    "summary": "通常・スキル・必殺の主/隣接と、損失HP天賦を全Lvで検証。入力HPはダメージ時点で、スキルは消費後HPを1回だけ参照。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。最終最大HPと生存1HP以上の割合が必要。スキルは15%消費後で最大85%。HP消費/回復/被弾/撃破を自動生成せず、0%を1HPの代用にしない。小軌跡ATK/HPは最終入力、E1以上は別認定。"
  },
  "1102": {
    "status": "confirmed",
    "majorSourceIds": [
      "110201",
      "110202",
      "110203",
      "1110201",
      "1110202",
      "1110203"
    ],
    "requiredAttackIds": [
      "110201",
      "110202",
      "110203",
      "1110201",
      "1110202",
      "1110203"
    ],
    "sourceRoleOverrides": {
      "110204": "増幅/再行動の状態説明（各通常/スキル/必殺の補正として検証）",
      "1110204": "増幅/自動スキルの説明（スキル1110202は独立1回・自動合算しない）"
    },
    "summary": "原版/強化版それぞれ通常・スキル・必殺。必殺は発動時に増幅へ入るため攻撃ローカルで必ず増幅を想定。通常/スキルの任意状態と保存値を変えない。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。増幅DMG40～80%、原版/強化版耐性貫通20/25%、強化版の事前撃破層0～3を独立検証。途中撃破で層や追加ターンを生成せず、自動スキルは同じスキル1回として別行動。E6付加は別認定。"
  },
  "1105": {
    "status": "confirmed",
    "majorSourceIds": [
      "110501"
    ],
    "requiredAttackIds": [
      "110501"
    ],
    "sourceRoleOverrides": {
      "110504": "回復天賦（独立ダメージなし）"
    },
    "summary": "E0本人の直接攻撃は通常のみ。回復スキル/必殺/天賦を不足ダメージに数えず、E6付加と分離。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・通常Lv1～6・敵1体・状態一定。HP/DEF小軌跡は最終入力。回復/解除/EPやE6のHP追加を合算しない。"
  },
  "8001": {
    "status": "confirmed",
    "majorSourceIds": [
      "800101",
      "800102",
      "800108",
      "800109"
    ],
    "requiredAttackIds": [
      "800101",
      "800102",
      "800108",
      "800109"
    ],
    "sourceRoleOverrides": {
      "800103": "選択式の集約説明（800108/800109で各モードを検証）",
      "800104": "自己強化（天賦ATKは完成済み最終入力・独立ダメージなし）"
    },
    "summary": "通常・スキル・単体必殺・拡散必殺の4行。選択式説明は隠し、2モードを二重合算しない。闘志25%はスキル/拡散必殺の主対象のみ。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。隣接曲線は別に検証するが敵1体の画面では表示しない。天賦ATK0～2層と小軌跡は完成済み最終ATK。途中撃破・層/EP/回復自動管理・E1以上は対象外。"
  },
  "8002": {
    "status": "confirmed",
    "majorSourceIds": [
      "800201",
      "800202",
      "800208",
      "800209"
    ],
    "requiredAttackIds": [
      "800201",
      "800202",
      "800208",
      "800209"
    ],
    "sourceRoleOverrides": {
      "800203": "選択式の集約説明（800208/800209で各モードを検証）",
      "800204": "自己強化（天賦ATKは完成済み最終入力・独立ダメージなし）"
    },
    "summary": "通常・スキル・単体必殺・拡散必殺の4行。選択式説明は隠し、2モードを二重合算しない。闘志25%はスキル/拡散必殺の主対象のみ。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。隣接曲線は別に検証するが敵1体の画面では表示しない。天賦ATK0～2層と小軌跡は完成済み最終ATK。途中撃破・層/EP/回復自動管理・E1以上は対象外。"
  },
  "8003": {
    "status": "confirmed",
    "majorSourceIds": [
      "800301",
      "800303",
      "800308"
    ],
    "requiredAttackIds": [
      "800301",
      "800303",
      "800308"
    ],
    "sourceRoleOverrides": {
      "800304": "強化状態/シールドの説明（800308に含まれ、独立追撃ではない）"
    },
    "summary": "通常・強化通常・ATK+DEF必殺を別行で比較。必殺の欠けていたATK項と強化通常の隣接係数を修正。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。強化通常は灼熱意志4層または必殺後の強化を想定して表示。A6バリア下ATK15%は最終入力、EP/シールド/回復は非ダメージ。隣接曲線は独立照合済み、認定外の複数敵や途中変化を再現しない。"
  },
  "8004": {
    "status": "confirmed",
    "majorSourceIds": [
      "800401",
      "800403",
      "800408"
    ],
    "requiredAttackIds": [
      "800401",
      "800403",
      "800408"
    ],
    "sourceRoleOverrides": {
      "800404": "強化状態/シールドの説明（800408に含まれ、独立追撃ではない）"
    },
    "summary": "通常・強化通常・ATK+DEF必殺を別行で比較。必殺の欠けていたATK項と強化通常の隣接係数を修正。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。強化通常は灼熱意志4層または必殺後の強化を想定して表示。A6バリア下ATK15%は最終入力、EP/シールド/回復は非ダメージ。隣接曲線は独立照合済み、認定外の複数敵や途中変化を再現しない。"
  },
  "8005": {
    "status": "confirmed",
    "majorSourceIds": [
      "800501",
      "800502"
    ],
    "requiredAttackIds": [
      "800501",
      "800502"
    ],
    "sourceRoleOverrides": {
      "800503": "支援/超撃破（直撃なし・独立超撃破モードを全UltLvで検証）",
      "800504": "EP回復（独立ダメージなし）"
    },
    "summary": "通常1回・敵1体のスキル5ヒットと、バックダンス超撃破を独立計算。直撃へ超撃破を合算した全体値と表示しない。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。超撃破は既存の独立モードで、撃破済み・最終BEに選択UltLvの効果を1回算入、A2解放時160%、通常削靭10/スキル40（A4初撃20+後続5×4）。複数敵/途中撃破/自動層/ターン/EP・E1以上は未対応。支援自動化の最終完成とは別。"
  },
  "8006": {
    "status": "confirmed",
    "majorSourceIds": [
      "800601",
      "800602"
    ],
    "requiredAttackIds": [
      "800601",
      "800602"
    ],
    "sourceRoleOverrides": {
      "800603": "支援/超撃破（直撃なし・独立超撃破モードを全UltLvで検証）",
      "800604": "EP回復（独立ダメージなし）"
    },
    "summary": "通常1回・敵1体のスキル5ヒットと、バックダンス超撃破を独立計算。直撃へ超撃破を合算した全体値と表示しない。",
    "evidence": "固定SHAのskills/trees/ranksと公開資料を照合。hsrPhysicalTrailblazerE0Completion / hsrTrailblazerBranchesE0Batch / hsrClassicAttackerE0Batchで全E0曲線・非対称値・参照分離・固有補正・支援を独立検証。hsrToolInputsと3幅実画面で入力/局所停止/保存を確認。",
    "remaining": "E0・Lv80・敵1体・状態一定。超撃破は既存の独立モードで、撃破済み・最終BEに選択UltLvの効果を1回算入、A2解放時160%、通常削靭10/スキル40（A4初撃20+後続5×4）。複数敵/途中撃破/自動層/ターン/EP・E1以上は未対応。支援自動化の最終完成とは別。"
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
 '1222':'E0単発の4行を確認済み。回復・召喚残数・行動順・低HP自動判定・他行動との合算は範囲外。',
 '1213':'強化通常中のヒット別与ダメージ/会心累積を要確認。',
 '1308':'必殺技の段階別成分/集真赤の状態変化を要確認。'
};
function skillRole(skill){
 const verifiedRole=Object.values(e0CandidateAudit).map(a=>a.sourceRoleOverrides?.[String(skill.id)]).find(Boolean);if(verifiedRole)return verifiedRole;
 if(Object.values(e0CandidateAudit).some(a=>a.nonDamageSourceIds?.includes(String(skill.id))))return '支援/行動順（非ダメージを固定版で監査済み）';
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
const batchWorkReview={A:new Set(['1105']),B:new Set(['8001','8002','8003','8004','8005','8006','1002','1102','1008']),D:new Set(['1218','1209','1204','1005','1004','1207','1109','1106','1103','1009','1503','1406','1212','1215','1206'])};
function remainingWorkClass(d){
 if(d.confirmed)return {group:'済',confidence:'E0限定条件を検証済み',reason:'星魂/装備/支援の最終完成とは別'};
 if(batchWorkReview.A.has(d.c.id))return {group:'A',confidence:'重点監査済み',reason:'既存攻撃の全Lv独立検証と非ダメージ行動の分類整理'};
 if(batchWorkReview.B.has(d.c.id))return {group:'B',confidence:'重点監査済み',reason:'既存式による少数の倍率/段数/成分/補正/入力境界の修正'};
 if(batchWorkReview.D.has(d.c.id))return {group:'D',confidence:'具体的な保留理由あり',reason:d.audit?.remaining||knownGaps[d.c.id]||'初回付与/段間更新/参照値の証拠不足。新証拠待ち'};
 if(d.absent.length||d.hasMissingComponent||d.attacks.some(a=>['elation','trueDamage','memospriteSkill','memospriteTalent'].includes(a.type)||['componentSequence','normalAndBreak'].includes(a.damageFormula)))return {group:'C',confidence:'構造からの暫定見積・個別工数不明',reason:'成分/独立参照の追加接続候補。未登録IDが別攻撃か既存状態の説明か要精査。新しい式が必須とは断定しない'};
 return {group:'D',confidence:'全構成の仕様精査未了',reason:'限定値の登録だけでは全主要構成の確証不足。未調査をゼロ工数や独立検証のみと見なさない'};
}
function instructionForecast(remaining,measuredBatch=0){return [['楽観',3,Math.max(8,Math.min(10,measuredBatch||8))],['標準',2,6],['悲観',1,3]].map(([scenario,legacyRate,batchRate])=>({scenario,legacyRate,batchRate,legacy:Math.ceil(remaining/legacyRate),batch:Math.ceil(remaining/batchRate)}));}
const batchRun={start:'4bdda21',audited:12,confirmed:10,promoted:18,phase:'工程C・実装/独立計算/3幅画面確認完了'};
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
  const hasMissingComponent=Boolean(audit?.missingComponents?.length || audit?.requiredAttackIds?.some(id=>!attacks.some(a=>a.id===id&&!a.hidden&&attackStatus(a)==='計算対応')));
  const candidate=required.length>0&&!pending.length&&!unknown.length&&!hasMissingComponent;
  const confirmed=Boolean(confirmedE0[c.id]&&candidate&&JSON.stringify(required.map(s=>s.id).sort())===JSON.stringify((confirmedMajorIds[c.id]||[]).slice().sort()));
  const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon'&&String(m.source.id)===c.id);
  return {c,attacks,sources,required,mapped,absent,pending,unknown,candidate,confirmed,eidolon,audit,hasMissingComponent};
 });
 const confirmed=details.filter(d=>d.confirmed),candidates=details.filter(d=>d.candidate);
 const missingCharacters=details.filter(d=>d.pending.length>0||d.hasMissingComponent).length;
 const pendingComposition=98-confirmed.length-missingCharacters;
 const registrationBacklog=details.filter(d=>d.pending.length>0||d.hasMissingComponent);
 const backlogWithUnregistered=registrationBacklog.filter(d=>d.absent.length>0||d.hasMissingComponent);
 const backlogRegistered=registrationBacklog.filter(d=>!d.absent.length&&!d.hasMissingComponent);
 const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon');
 const eidolonOwners=new Set(eidolon.map(m=>m.source.id));
 const missing=details.reduce((n,d)=>n+d.absent.length,0),unknown=details.reduce((n,d)=>n+d.unknown.length,0);
 const lines=[];const p=(...s)=>lines.push(...s);
 p('# HSR 全98キャラクター完成管理表','','この表は作業管理用です。登録状態、E0主要攻撃の構成確認、星魂/装備/支援の完成を分けます。計算対応レコードの存在だけではキャラクター全体を完成扱いにしません。','','## 更新手順','','1. `node scripts/reportHsrCompletion.cjs` で本番ローダーと固定版を再照合して更新。ネットワーク取得に失敗した場合は書き換えません。','2. `node scripts/reportHsrCompletion.cjs --check` で現在の文書と再生成結果を照合。','3. 個別攻撃の正式化はoverrideの限定条件/provenanceと独立検証テストを更新してから再生成。','4. E0主要構成を確認できた人はスクリプトのconfirmedE0へ根拠を追記。登録件数だけで追加しない。','5. E1～6、装備/パーティ、UI/UID/保存の統合確認を別途完了して初めて最終ゴールの完成認定を行う。','','## 基準と現在値','',`- 固定版: [StarRailRes ${sha}](https://github.com/Mar-7th/StarRailRes/tree/${sha}/index_new/jp)。98 ID・${matchedSkills}スキルの係数配列/説明・${matchedRanks}星魂の説明/Lv加算がカタログと一致。これは各攻撃の精度検証とは別。`,`- 本番攻撃（非表示の内部記録を含む）: ${data.attacks.length}件 = 計算対応${counts['計算対応']||0} / 参考値${counts['参考値']||0} / 計算不可${counts['計算不可']||0}。特殊撃破レコードは別枠${data.specialBreakAttacks.length}件。hidden ${data.attacks.filter(a=>a.hidden).length}件（うち計算対応${data.attacks.filter(a=>a.hidden&&attackStatus(a)==='計算対応').length}件）は画面の主要ダメージ一覧に含めない。`,`- E0主要攻撃の構成確認済み: **${confirmed.length}人** (${confirmed.map(d=>`${d.c.name} ${d.c.id}`).join('、')})。このE0限定単発範囲のみの認定であり、全星魂/全装備の完成ではない。`,`- 残るE0完成未認定: **${98-confirmed.length}人**。登録上の充足候補は全98人中${candidates.length}人（確認済みを含む）。主要候補の登録不足がある${missingCharacters}人と、登録済みでも全構成の確認待ち${pendingComposition}人を区別。`,`- 主要候補スキルIDの未登録: ${missing}件。これはマスターの明示ダメージ/条件成分からの管理候補であり、独立した未実装ダメージ数ではない。状態系の有無確認待ちは${unknown} ID。`,`- 新しい計算処理が必要な攻撃の総数: **未確定**。下表の難易度は調査入口。既存式の接続不足、新しい成分処理、新しいダメージ式を混同しない。`,`- 育成・全星魂・全装備/支援・統合QAまでの最終完成認定: **0人**（この基準の全項目を完了した記録はまだない）。既存の過去complete宣言は採用していない。`,'','分類: 主なNormal/BPSkill/Ultra/Talent/Elation/Memosprite/Assistを対象とする。秘技/フィールドは主要攻撃集計から除外。Support等でも付加/持続/確定ダメージを生む記述は別成分の要確認として残し、支援発動時の直接ダメージにしない。未知の状態/Summonを未実装攻撃と断定しない。','','## 98人一覧','','表中の対応数は登録状態。E0構成欄の「登録上充足候補」は倍率・固有効果・未登録成分まで確認済みという意味ではありません。','', '|ID・名前|通常/強化|スキル/強化|必殺技|追加/カウンター|精霊/特殊等|登録 対応/参考/不可|E0主要構成と不足|難易度|','|---|---|---|---|---|---|---:|---|---|');
 for(const d of details){const list=types=>d.attacks.filter(a=>types.includes(category(a))).map(a=>`${a.id}[${attackStatus(a)}]`).join('、')||'—';const cs=sumBy(d.attacks,attackStatus);const gap=d.audit?.remaining||knownGaps[d.c.id]||`${d.pending.length}主要候補未充足・${d.unknown.length}状態/召喚等の有無確認待ち。固有補正/全状態は個別精査。`;p(`|${'['+cell(d.c.id+' '+d.c.name)+'](#character-'+d.c.id+')'}|${list(['通常','強化通常'])}|${list(['スキル','強化スキル'])}|${list(['必殺技'])}|${list(['追加/カウンター'])}|${list(['精霊/独立参照','固有/特殊','talent','additional','joint','assist'])}|${cs['計算対応']||0}/${cs['参考値']||0}/${cs['計算不可']||0}|${cell((d.confirmed?'確認済み':d.hasMissingComponent?'監査で成分不足を確認':d.candidate?'登録上充足候補・構成要確認':'未認定')+'。'+gap)}|${d.confirmed?'小: 統合QA/星魂へ':d.unknown.length?'要精査: 条件/召喚':'既存式候補～成分処理（未確定）'}|`);}
 p('','## 登録充足候補の継続重点監査','','固定版のスキル・追加能力・実行時行・独立検証記録を照合。登録だけでは認定しない。今回新規認定はキャラLv80・主要追加能力解放済み・敵1体・状態一定の単発範囲。E0採用Lvは通常1～6、その他1～10。全曲線のLv7/11以上の一致をE0や星魂対応の認定と混同しない。','','|ID・名前|判定|確認内容・残作業|検証根拠|','|---|---|---|---|');
 for(const[id,a]of Object.entries(e0CandidateAudit)){const name=data.characters.find(c=>c.id===id)?.name||id;p(`|${id} ${cell(name)}|${a.status==='confirmed'?'E0主要構成確認済み':a.status==='missing'?'未登録成分あり':'構成/独立検証待ち'}|${cell(a.summary+' '+a.remaining)}|${cell(a.evidence)}|`);}
 p('','重点監査で判明した未登録成分のうち、現在も残るものを以下に列挙する。解消済みの成分は上表に履歴を残す。マスターの主スキルIDだけで成分の完全性を認定しない。');
 for(const[id,a]of Object.entries(e0CandidateAudit))for(const component of a.missingComponents||[])p(`- ${id}: ${component}`);
 p('','## 完成までの予測残Codex指示回数（開始4bdda21）','','A=既存攻撃の独立検証、B=軽微な補正/登録修正、C=新成分/処理の接続、D=仕様または全構成の確証不足。C/Dには未精査の暫定区分を含む。Cを新エンジン必須、Dを永久対応不可と断定しない。A/Bも検証前に完成保証しない。');
 const work=details.map(d=>({...remainingWorkClass(d),id:d.c.id,name:d.c.name})),workCounts=sumBy(work,x=>x.group);
 p('', '|E0区分|人数|具体対象|','|---|---:|---|');for(const group of ['済','A','B','C','D'])p(`|${group}|${workCounts[group]||0}|${work.filter(w=>w.group===group).map(w=>w.id+' '+w.name).join('、')||'—'}|`);
 p('','|ID・キャラ|区分|根拠の確度|残作業|','|---|---|---|---|');for(const w of work)p(`|${w.id} ${cell(w.name)}|${w.group}|${cell(w.confidence)}|${cell(w.reason)}|`);
 p('', `Dの内訳: 具体的保留理由${work.filter(w=>w.group==='D'&&w.confidence==='具体的な保留理由あり').length}人、全主要構成の仕様精査未了${work.filter(w=>w.group==='D'&&w.confidence==='全構成の仕様精査未了').length}人。未精査を対応不能と断定せず、次回のA/B候補抽出対象とする。今回のA/B10人は完了したため残A/Bは${(workCounts.A||0)+(workCounts.B||0)}。C${workCounts.C||0}人も全員が新エンジン必須という意味ではない。`);
 p('','### E0の回数換算','','従来実績は1指示1～3人（直近14→15は1人、15→18は3人）。一括方式は共通式/男女対応を再利用し、楽観8～10人・標準6人・悲観3人を完了する仮定。今回の10IDは7種類のキットであり、男女共通仕様の再利用がない次回以降も10人ずつ進むとは限らない。複雑なCや未精査Dにも同じ速度を保証しない。以下は全残キャラをその速度で処理できた場合の条件付き換算。','', '|ケース|従来方式|一括方式|一括方式の仮定|','|---|---:|---:|---|');
 for(const e of instructionForecast(98-confirmed.length,batchRun.confirmed))p(`|${e.scenario}|${e.legacy}回＋U|${e.batch}回＋U|1指示${e.batchRate}人|`);
 p('','Uは仕様確証の取得、未精査C/Dの工数増分。Dの証拠が入手できなければ全98人E0の完了回数に有限の上限を置けない。Uを0として完成日/回数を保証しない。','', '### E0以外の残作業','','|領域|確認できる量|未確定工数|','|---|---|---|',`|E1～E6|98人×6段=588元記録、構造化${eidolon.length}件（計算対象${eidolon.filter(m=>m.support.status==='calculable').length}/表示専用${eidolon.filter(m=>m.support.status==='displayOnly').length}）|表示専用を全て未実装効果と数えない。全段/全攻撃の倍率・状態・Lv加算検証工数は未調査|`,`|光円錐|マスター${data.lightCones.length}件、計算処理対象${data.structuredModifiers.filter(m=>m.source.kind==='lightCone'&&m.support.status==='calculable').length}レコード|装備件数と効果数は異なる。適用先/重畳/未対応効果の実装工数は不明|`,`|遺物/オーナメント|マスター${data.relicSets.length}セット、構造化記録は別軸表|最終入力効果と条件付き効果を区別する個別棚卸しが必要|`,'|パーティ支援/敵デバフ|主要支援の限定対応と保守課題は別軸表|全提供者/対象/版/精霊継承の未対応効果数は不明|','|参考値/計算不可|E0改善と重複する記録を工数へ二重加算しない|秘技9件等の対象外を区別して残検証を精査|','|UID/画面/保存/最終QA|既存の合成UID/保存/3幅表示テストを再利用|全星魂/装備/支援の組み合わせQA工数は未調査|');
 p('','最終完成の予測残指示回数: 楽観/標準/悲観とも「上記E0換算＋U＋星魂/装備/支援/QAの追加工数（不明）」。現状の根拠から有限の総回数は算出不能。テキスト収録・候補表示・テスト通過を全効果完成と同一視しない。',`今回実績: ${batchRun.phase}、候補監査${batchRun.audited}人、新規E0確認${batchRun.confirmed}人、参考値昇格${batchRun.promoted}攻撃。10人は7種類のキット（開拓者3運命×男女6IDと通常4人）。31直接行を検証/改善し18行を昇格、選択肢説明2行を非表示へ整理。次回は8候補を一括スクリーニングし、確証のあるA/Bだけを実装する。`);
 p('', '今回の統合検証: HSR関連441テスト成功、生成--check成功。新規10IDと既存確認済み18人の代表行を1440/390/320pxで再操作し、通常/強化/複合/精霊一覧、後続DoT/凍結、補正ON/OFF・提供者離脱、入力不足の局所停止、合成UID形式入力、保存復元を確認。新規画面および超撃破内訳のスクリーンショットで長文・箇条書きの枠内表示を点検。横はみ出し・JavaScript例外なし。個人UIDの通信/生レスポンスは今回の検証に使用していない。');
 p(
  "",
  "## 主要サポーター3人と登録不足解消（開始151f594）",
  "",
  "工程Aで花火1306・ブローニャ1101・フォフォ1217を構成監査し、工程Bで既存5通常行を全E0採用Lvで検証。参考値の130601/1130601/1121701を正式対応へ変更した。新しい攻撃ID、架空のスキルダメージ、計算式は追加していない。確認済み15→18、精査待ち26→25、登録不足57→55、登録充足候補25→28。最終完成認定は0のまま。",
  "",
  "|対象|E0本人の主要攻撃と採用倍率|支援との区別・本人補正|",
  "|---|---|---|",
  "|花火1306|原版130601/強化版1130601、量子・ATK単体、通常Lv1～6=50/60/70/80/90/100%|スキルCD・SP回復・天賦強化は攻撃ではない。夜想曲ATKは最終ATK、本人CD/原版DMGは最終入力、強化版幻相/CipherとA6耐性貫通は敵条件へ1回。既存party専用補正を本人へ自動流用しない|",
  "|ブローニャ1101|110101、風・ATK単体、通常Lv1～6=50/60/70/80/90/100%|号令CR100%と軍勢DMG10%は既存補正で1回。小軌跡風22.4%/CD24%は最終入力。110104は行動順変更のみと固定版で確認して管理分類を補正。E4追撃をE0不足にしない|",
  "|フォフォ1217|原版121701/強化版1121701、風・本人最大HP単体、通常Lv1～6=25/30/35/40/45/50%|回復/解除/EP/自身以外へのATK支援は本人の攻撃ではない。強化A4のEP160条件も本人HP式へ加算しない。HP小軌跡・装備は最終最大HPへ含める|",
  "",
  "- 固定SHAの対象skills/trees/ranksを直接取得し、係数・説明をローカルと照合。KQMブローニャv1.6は一致する能力の補助資料として使用、Prydwen花火/フォフォの強化版説明を原版IDへ混在させない。",
  "- 計算機の最終入力契約に従ったE0・Lv80・敵1体・状態一定の単発範囲の認定。支援の自動計算まで完成したという意味ではない。花火本人の各支援状態は上表どおり手動管理し、既存の他味方用支援3効果は維持。フォフォ必殺ATK支援は未対応のまま別課題。",
  "- 基準ATK3000/HP6000・CR50%/CD100%・敵Lv80/耐性20%/靭性あり: 花火両版とフォフォ両版のLv6は1080/2160/1620。ブローニャは風小軌跡22.4%を最終入力、軍勢10%を別加算、号令100%で1429.92/2859.84/2859.84。",
  "- ロビンスキルLv10併用: 花火/フォフォ各1620/3240/2430、ブローニャ1969.92/3939.84/3939.84。通常ATKとHPを入れ替えず、それぞれ本人の参照値だけが変化する。",
  "- 花火の原版Talent/Cipher合計DMG48%を入力した例は1598.4/3196.8/2397.6。強化版で本人最終CD169%、敵被ダメージ30%、耐性貫通10%を各1回入力した例は1579.5/4248.855/2914.1775。入力は成立済みの同一状態を表し、SP消費や層を自動生成しない。",
  "- 発見した操作不具合: 性能版の切替欄が固定5キャラ限定だった。版付き攻撃データの有無に連動させ、花火/フォフォのprevious/enhancedを選択・保存・復元できるよう修正。強化状態の想定攻撃を隠す処理とは別。",
  "- 検証: hsrSupporterE0Completion全7ケース（全5行×全6Lv×非対称2条件、ATK/HP/DEFと未参照値、号令/軍勢、最終値の非再加算）、hsrToolInputsの版/不足値/支援/保存。HSR全419テスト成功。実画面PC1440/390/320で両版・本人補正入力・提供者離脱・合成UID形式欠損・再読込を確認。箇条書きマーカーと枠線を画像で目視、横はみ出し/JavaScript例外なし。実UID通信は今回の対象外。",
  "",
  "- 工程Cでは既存確認済み15人の代表攻撃をPC1440/390/320で再操作。姫子星火324、存護なのか凍結648、クラーラ強化カウンター4492.8、ヘルタ閾値、サンポ0/5層、霊砂4行と芳酔の撃破/超撃破専用範囲を維持。飛霄/ジェイドの複合内訳、パール通常/強化、精霊タブ、支援ON/OFF/離脱と保存復元も成功。横はみ出し・JavaScript例外なし。既存保留の初回適用順は再調査していない。",
  "",
  "### 登録不足の中身と次回のA・B・C",
  "",
  "下記は実行時の管理候補IDによる集計であり、全キャラクターの固有効果を再監査した件数ではない。「未登録ID」は支援に付随する成分/既存行の別表現の場合もあるため、その数だけ新規攻撃を作らない。"
 );
 p('', '|残る登録不足の内訳|人数|扱い|','|---|---:|---|',`|主要候補IDは全て登録済みだが計算対応が不足|${backlogRegistered.length}|参考値・固有成分・全Lvの独立検証を優先。登録だけでA判定しない|`,`|未登録の主要候補IDまたは明示された成分不足あり|${backlogWithUnregistered.length}|既存攻撃との対応付け/支援の区別を先に確認。必要な成分だけ追加|`,'','開始151f594で提示したナターシャ/調和・存護開拓者は今回検証を完了。次回は銀狼・トパーズ・刃・ミーシャ・桂乃芬・アーチャー・セイバー・青雀の8候補を同一指示で精査する。候補選定は構成確認であり、8人の完成を保証しない。A/Bが見つかれば既存の共通全Lv検証を使い、その指示内で実装まで進める。C/Dの新しい根拠が得られないものは早期保留。');
 p('','## 開始2f48bd5の未確認11人・今回の完成判定','','開始時の分類はA（追加独立検証のみ）0人・B（既存処理/限定条件の軽微修正）1人・C（仕様未確定/新成分処理）10人。各分類はキャラクター全体の主要構成について判断。一部の既存曲線が一致するだけでAや確認済みにしない。','','|ID・名前|開始分類|今回の結果・残作業|','|---|---|---|');
 for(const id of ['1222','1218','1209','1204','1005','1004','1207','1109','1106','1103','1009']){const a=e0CandidateAudit[id],name=data.characters.find(c=>c.id===id)?.name||id;p(`|${id} ${cell(name)}|${id==='1222'?'B':'C'}|${a.status==='confirmed'?'新規E0主要構成確認済み。':'未認定。'}${cell(a.remaining)}|`);}
 p('','### 霊砂の今回の検証（工程B・30040a5）','','- 122201通常Lv1～6、122202スキル/122203必殺/122204浮元はLv1～10。全て霊砂本人の最終ATK参照。固定版A2/A4/A6と正式4.6を照合。浮元の有無で必殺自身の倍率は変わらず、100%前進後の浮元は別行動。通常の浮元とA6緊急発動は同じ天賦の1回分を独立比較し、発生回数を自動生成しない。','- 浮元1ヒットのLv7～9は正式4.6の60.938/65.625/70.313%を既存採用値として維持。固定SHAの60.94/65.62/70.31%との記録精度差をprovenanceへ保持し、倍率そのものを変更していない。','- ATK3000・CR50%/CD100%・与ダメージ0%・敵Lv80/炎耐性20%/靭性あり: 通常Lv6=1080/2160/1620、スキルLv10=864/1728/1296、必殺Lv10=1620/3240/2430、浮元Lv10の2ヒット計=1620/3240/2430（非会心/会心/期待値）。必殺と浮元が同値でも別イベント。','- 2つの非対称ステータスで全E0曲線、ATK/HP/DEF/撃破特効の個別変更、ロビンスキルON/OFFを独立照合。朱炎によるATK変換を入力済みATKへ再加算しない。芳酔25%は4つの通常ダメージへ適用しない。','- 画面では芳酔により撃破9042.12792→11302.6599、超撃破5651.32995を確認。Lv80・BE200%・炎耐性20%・敵Lv80、撃破は最大靭性60、超撃破は削靭値10/転換率100%/撃破済み。通常・撃破・超撃破は別々の計算で、自動合算しない。','- PC1440/390/320で4行、支援ON/OFF/提供者離脱、必殺/天賦Lv不足だけの局所停止、E1/敵2体の範囲外停止、合成UID形式入力と保存/再計算を確認。実UID通信は実施していない。');
 p('','### 残作業の調査入口（確定した実装規模ではない）','','|分類|参考値/不可レコード数|','|---|---:|');
 for(const [name,count] of Object.entries(sumBy(data.attacks.filter(a=>attackStatus(a)!=='計算対応'&&a.type!=='technique'),difficulty)))p(`|${cell(name)}|${count}|`);
 p('','## 前工程の通常攻撃改善と統合検証（b7aac65）','','- 椒丘121801「心火計（焼尽5層）」と霊砂122201「供香」を参考値から正式対応へ変更。既存IDをoverrideし、攻撃行の総数は増やしていない。通常Lv1～6はATK50/60/70/80/90/100%。両者ともE0・Lv80・炎非弱点の未撃破の敵1体・途中状態変化なし。','- 椒丘は天賦Lv1～10の既存焼尽5層を前提とし、必須被ダメージ増加を1回だけ適用。初回付与・5層未満・DoT合算は対応外。霊砂は浮元の別行動や撃破ダメージを通常へ合算しない。','- ATK3000・会心50/100%・通常Lv6・敵Lv80/炎耐性20%/靭性あり: 椒丘（天賦10・焼尽5層）1458/2916/2187、霊砂1080/2160/1620（非会心/会心/期待値）。全採用LvとATK/HP/DEF個別変更をhsrCompletionBasicsで独立検証。','- ジェパードの戦意を完成済み最終ATKへ再加算する不具合を実画面で再現して修正。係数35%は説明用に保持し、includedInFinalStatsとして二重適用しない。ATK3000/DEF3000の通常Lv6は1458ではなく1080。','- 補正のattackIdsをエンジンの直接呼び出しでも尊重。通常専用補正が別攻撃/超撃破へ混入しない回帰テストを追加。','- PC1440px・390px・320pxで確認済み9人と新しい通常2件を操作。補正ON/OFF、ロビン支援、必要Lv不足による局所停止、保存/再読み込み、箇条書きの枠内位置を確認。UI用一時画像はリポジトリへ保存しない。');
 p('','## 今回の後続成分・12人監査・二重加算点検（開始b7aac65）','','- 姫子: 星火10031011は固定ATK30%の炎DoT1回。追加能力Lv1固定であり天賦Lvを要求しない。灼熱は攻撃前から燃焼している対象へのスキル与ダメージ+20%を任意ON/OFF。道標のCR15%は最終入力に含める。','- 存護なのか: 必殺即時100103と後続凍結1001031を分離。凍結倍率は必殺Lv1～10でATK30/33/36/39/42/45/48.75/52.5/56.25/60%。後続は非会心・敵ターン開始1回。旧版限定という誤った表示条件を解除し初期状態から一覧表示。','- 付与確率は星火50%基礎/2ターン、凍結50%基礎（氷呪解放時65%）/1ターン。成立済みの1回を仮定し、確率込み期待値や複数ターン合計を生成しない。','- ATK3000・CR50%/CD100%・敵Lv80/耐性20%/靭性あり: 星火324（非会心/会心倍率なし）、凍結648（必殺Lv10）。姫子スキル2160/4320/3240、灼熱ONは2592/5184/3888。なのか必殺即時1620/3240/2430。後続をこれらの即時合計へ追加しない。','- クラーラ: 全E0Lvの通常/印なし・ありスキル/通常カウンター、天賦×必殺100組の強化主対象/隣接を独立照合。天賦または必殺Lv不足の強化カウンターを暗黙補完せず局所停止。基準条件で通常counter2246.4/4492.8/3369.6、強化4492.8/8985.6/6739.2（報復30%を1回）。','- ペラ: 全E0直接曲線・A2/A6・事前成立済み一般解/秘技の独立値は一致。ただし新規一般解の初回必殺への同撃適用と解除後次攻撃のタイミングを断定せず、構成認定は保留。残る11人の具体ID/必要検証は上表に記録。','- 二重加算: 強化ヴェルト裁決の自己ATK変換を最終入力管理へ変更。強化カフカ苛みは自己最終ATK管理と外部味方支援を相互排他に分離。味方支援は対象のEHR75%以上でATK100%を維持し、提供者のEHRを参照しない。フックの恒常ATK小軌跡は22%から固定合計28%へ説明を訂正（計算時の加算なし）。','- 監査12人・既存確認済み9人・今回2人の最終入力効果が再加算されない数値テストを追加。戦闘中の彦卿CR/CD、景元段数CD、御空支援、クラーラcounter補正等は条件付きのまま維持。UID形式入力/手動編集/保存復元を検証し、UIDステータス再構築処理は変更しない。');
 p('','## 前工程の13人集中監査（開始1fcbd5c）','','- 対象13人: ペラ1106・御空1207・ヘルタ1013・サンポ1108・彦卿1209・景元1204・カフカ1005・ヴェルト1004・アスター1009・セーバル1103・フック1109・椒丘1218・霊砂1222。既存確認済み12人を重複認定せず、新規はヘルタ/サンポの2人。上の継続監査表に各ID・未確認状態・証拠を保持する。','- ペラ110603は「同Lv一般解が攻撃前から成立済み」の限定行。必殺Lv1～10のDEF低下30/31/32/33/34/35/36.25/37.5/38.75/40%と痛撃20%をこの行だけに一度適用。新規付与が今回の必殺へ乗るかは未確認のまま残し、初回必殺と同一視しない。解除後A6も事前有効時だけ手動指定。','- 御空: 通常本体120701、徹札矢のみ120704、合計1207011を分離。通常Lv1～6は50/60/70/80/90/100%、天賦Lv1～10は40/44/48/52/56/60/65/70/75/80%、必殺は228/243.2/258.4/273.6/288.8/304/323/342/361/380%。通常×天賦の全60組を照合。追加成分の再発動可能状態を想定し、表示のためのチェックを要求しない。','- 御空の通常限定補正継承は未確定。実装済み異端者4セットの通常36%などが有効な場合、徹札矢と合計だけを止め、通常本体と必殺は維持。A4自己虚数12%は完成済み入力で管理し、外部味方への12%支援と分離して二重加算しない。','- ヘルタ: 通常/スキル/必殺/追撃の全E0曲線を非対称2条件で独立照合。敵HP50%以上のスキル20%と追加能力25%を別加算。凍結中の必殺20%は任意状態、恒常氷/会心は最終入力。途中で敵HP境界を跨ぐ連鎖はこの認定外。','- サンポ: スキルは敵1体への初撃+追加4段。風化1層の天賦Lv1～10倍率は20/22/24/26/28/31/35/40/46/52%。全Lv×1～5層と必殺DoT被ダメージ増加20～30%を独立照合。風化0層の内訳0÷0でNaNが出る不具合を修正し、合計も内訳も有限0。不正層数はDoT行だけ停止。','- 基準: 最終ATK3000、CR50%/CD100%、敵Lv80・耐性20%・靭性あり。ペラ事前一般解の必殺Lv10は1620/3240/2430。御空は最終虚数与ダメージ12%（A4算入済み）で通常1209.6、徹札矢967.68、合計2177.28/4354.56/3265.92。ロビンスキル50%併用の合計は3149.28/6298.56/4723.92。','- 同基準・与ダメージ入力0%: ヘルタのスキルはHP50%以上1566/3132/2349、50%未満1350/2700/2025。サンポ風化5層は2808（非会心）、必殺DoT被ダメージ増加30%併用3650.4。必殺即時1728へDoTを加算しない。','- 回帰記録: hsrPelaPriorSolution/hsrYukongE0Completion/hsrHertaE0Completion/hsrSampoE0CompletionとhsrToolInputs。全採用Lv、非会心/会心/期待値、ATK/HP/DEF個別変更、支援・同一群重複排除、必須Lv不足の局所停止を検証。PC1440・390・320の実画面で内訳・長文/箇条書きの枠内位置・保存/再計算を確認。実UID通信は今回の対象外で、欠損プロフィールは合成データを使用。');
 p('','## 今回の状態別5人監査（開始565e25e）','','- 景元・セーバル・フックの最大3人を重点改善。アスター・彦卿は調査/既存状態の代表確認に限定。新規攻撃レコードやダメージ式を追加せず、参考値の昇格も行っていない。E0新規認定は0人。主要曲線/状態別値の確認と、未確定の初回付与順を分ける。','- 固定SHAの15曲線210係数と、主/隣接2曲線を元データへ直接照合。独立数値検証の採用LvはE0通常1～6・その他1～10。構造化星魂や全Lv曲線の存在をE1以上の検証完了とは扱わない。','- 神君は敵1体への3～10段の8想定行。破陣CD25%は各行の段数で判定し、保存された別の段数入力を流用しない。敵1体に存在しない隣接結果は表示せず、隣接1段の25%係数を説明する。複数敵のランダム分配は停止。','- 景元120402は事前遣将の想定行としてCR10%を一度適用し、既存手動遣将と同一群で重複排除。初回付与の同撃参照を推測しない。必要な固有補正データが欠ければそのスキルだけ停止。','- セーバル/フックの直接行は本体と明記し、天賦付加/後続DoTを全体合計と誤認させない。フックの事前燃焼付加はE0だけ表示用チェック不要。E6では同じ燃焼条件が与ダメージ20%を変えるため、従来の条件入力と停止を維持する。','- 基準はATK3000、CR50%/CD100%、与ダメージ0%、敵Lv80/耐性20%/靭性あり。神君Lv10の3段2138.4/4276.8/3207.6、5段3564/7128/5346、6段4276.8/9622.8/6949.8、10段7128/16038/11583。隣接1段の基礎非会心178.2は係数確認用で、敵1体への追加合計にしない。','- 同基準: セーバルのスキル本体1512/3024/2268、隣接648/1296/972、天賦付加777.6/1555.2/1166.4、感電DoT1123.2（会心不可）。フックはスキル2592/5184/3888、強化主3024/6048/4536・隣接864/1728/1296、付加1080/2160/1620、燃焼DoT702（会心不可）。各行は自動合算しない。','- 神君6段にロビンスキル50%を併用すると6415.2/14434.2/10424.7。遣将のみ有効時は同じ非会心4276.8のまま期待値7484.4。事前遣将スキルは1080/2160/1728で、手動遣将ON/OFFを重ねても同じ値。','- 根拠: hsrJingYuanE0Completion/hsrServalHookStates/hsrToolInputs。全採用Lv・神君全段数・非対称値・ATK/HP/DEF個別変更・固有/外部補正・局所停止・星魂範囲・保存を検証。PC1440/390/320で箇条書き/警告/長文と枠線、精霊を含む一覧、JavaScript例外/横はみ出しを実画面確認。実UID通信は今回の対象外。');
 p(
  "",
  "## 工程Cの今回の総合回帰（開始2f48bd5）",
  "",
  "- HSR関連411テスト成功。追加した霊砂の全E0曲線/参照値分離4ケースと、4行比較・支援・不足Lv・保存の入力ケースを含む。管理表の再生成と--check、98 ID/必須攻撃構成の契約テストも成功。",
  "- 既存確認済み14人の代表攻撃をPC1440/390/320で再操作。姫子の星火324、存護なのかの凍結648、クラーラ強化カウンター4492.8、ヘルタHP閾値、サンポ0層の有限0/5層2808を維持。数値は前工程の独立基準条件を再利用。",
  "- 景元の3～10段/状態別CD・事前遣将の非重複、セーバル/フック本体・天賦・後続DoT、ペラ事前一般解、御空本体/天賦/合計と通常限定補正ON時の局所停止を確認。未確定の初回状態を確認済みに変更していない。",
  "- 飛霄のスキル+追撃の併用例期待値9051.264、ジェイド強化追撃期待値4536、巡狩なのか必殺、雲璃看破・滅、パール通常/強化、夏ロビン精霊の既存経路を確認。合算行と独立行をさらに足さない。",
  "- 補正ON/OFF/提供者離脱、星魂範囲、欠損軌跡の局所停止、合成UID形式入力/保存/再読み込みを確認。3画面幅の実スクリーンショットで説明文・マーカー・枠線・折り返しを目視し、横はみ出し/JavaScript例外なし。実UID通信は今回の対象外。"
 );
 p(
  "",
  "## 適用順序の保留台帳（工程C・2026-10-25）",
  "",
  "倍率・効果説明と実行順の証拠を分ける。固定版の説明に効果が載るだけでは同撃適用を認定しない。以下3件は新しい実行証拠なしで、同じ説明ページの検索や既存数値テストを繰り返さない。",
  "",
  "### 景元120402 / 遣将1204103",
  "",
  "- 判明: 固定版character_skills/character_skill_treesはスキルと、発動後CR10%・2ターンを記載。神君3～10段と6段以上CD25%は独立検証済み。",
  "- 不明: 初回スキルのダメージ判定より前に遣将が登録されるか。KQM SRLの能力説明からも固定版のイベント順は確定しない。",
  "- 必要証拠: 固定版に対応する処理順ログ/実行グラフ、または版・CR・装備・支援を固定した初回と事前有効状態の比較測定。会心が一度出たという観察だけではCR10%の適用順を証明しない。",
  "- 安全範囲: 120402は攻撃前から遣将有効・入力CRへ未算入の想定行。同じ手動効果と重複排除。神君の既存8状態は維持。",
  "- 調査済み: [固定スキル](https://github.com/Mar-7th/StarRailRes/blob/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/jp/character_skills.json)、[固定追加能力](https://github.com/Mar-7th/StarRailRes/blob/dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487/index_new/jp/character_skill_trees.json)、[KQM SRL景元](https://srl.keqingmains.com/characters/lightning/jing-yuan)。説明と係数の一致は確認したが、固定版の同撃イベント順資料ではない。",
  "",
  "### セーバル110302 / 天賦110304",
  "",
  "- 判明: 固定版の本体・天賦付加・感電DoT係数は照合済み。[KQM実行順記録](https://hsr-tickets.keqingmains.com/transcripts/champion-set-stacks)には2023-05-28の主/隣接ダメージ→天賦判定/AttackEnd→感電付与の記録がある。",
  "- 不明: その旧版の順序が固定SHA対象版でも維持されているか。固定説明/Prydwenの効果記載だけでは版を跨ぐ実行順の同一性を証明できない。",
  "- 必要証拠: 固定版相当で、事前感電なしの初回付与成功と事前感電ありを比較したイベントログ/実測。版・Lv・ATK・会心を固定し、雷弱点撃破/他の付加効果を除き、感電付与と天賦の時点を特定する。",
  "- 安全範囲: スキル本体、事前感電で発生する天賦付加1回、後続の非会心感電DoTを独立表示。未確認の初回合計を自動生成しない。",
  "- 調査済み: 固定110302/110304、上記2023年KQM記録、[Prydwenセーバル](https://www.prydwen.gg/star-rail/characters/serval)。旧記録は発見済みの根拠として残すが固定版の確定証拠とはしない。",
  "",
  "### フック110902 / 110909 / 天賦110904",
  "",
  "- 判明: 固定版の通常/強化スキル本体、燃焼付与、燃焼対象への天賦追加と後続DoTの係数は照合済み。",
  "- 不明: 同じスキルで新たに燃焼を付与する場合、110904の判定前に付与が完了するか。固定説明/Prydwenに確定できるイベント順記録はない。",
  "- 必要証拠: 固定版相当の通常/強化スキルで、初回燃焼付与成功と事前燃焼を分けたイベントログ/実測。版・Lv・ATK・会心・支援を揃え、炎弱点撃破や他の付加ダメージを除外して発生順を記録する。",
  "- 安全範囲: 本体・攻撃前から燃焼中の対象への天賦1回・後続非会心燃焼を別行表示。E6の与ダメージ条件は維持。恒常ATK28%を再加算しない。",
  "- 調査済み: 固定110902/110909/110904、[Prydwenフック](https://www.prydwen.gg/star-rail/characters/hook)。倍率の一致は実行順の確定と分ける。",
  "",
  "再調査の開始条件: 固定版に対応する新しい処理順資料、または上記条件を満たす版付き実機証拠が得られた場合のみ。証拠がない間は限定計算を維持し、別キャラクターの完成可能性を先に調べる。"
 );
 p('','## 星魂・装備・パーティの別軸管理','',`- 98人に各E1～6の元データ（計${data.characters.reduce((n,c)=>n+c.eidolons.length,0)}件）。固定rank辞書全体${Object.keys(ranks).length}件とは母集団が異なる。`,`- 構造化星魂${eidolon.length}件・${eidolonOwners.size}人、計算処理対象${eidolon.filter(m=>m.support.status==='calculable').length}件、表示専用${eidolon.filter(m=>m.support.status==='displayOnly').length}件。攻撃倍率/ヒット数のoverride対応や軌跡Lv加算は別経路なので、この件数を全対応効果数とはしない。`,'- E3/E5はcatalog.eidolons[].levelUpSkillsからのLv加算処理と、各攻撃の採用曲線/上限/星魂範囲をセットで検証する。元データやUI上限の存在だけでは計算対応としない。','','|星魂|構造化記録|計算処理対象|表示専用|','|---|---:|---:|---:|');
 for(let n=1;n<=6;n++){const items=eidolon.filter(m=>Number(m.source.eidolonRank)===n);p(`|E${n}|${items.length}|${items.filter(m=>m.support.status==='calculable').length}|${items.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','|補正提供元|登録|計算処理対象|表示専用|','|---|---:|---:|---:|');for(const kind of ['trace','lightCone','relic','ornament']){const a=data.structuredModifiers.filter(m=>m.source.kind===kind);p(`|${kind}|${a.length}|${a.filter(m=>m.support.status==='calculable').length}|${a.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','- 停雲、ロビン、サンデー、花火、椒丘、夏ロビン、霊砂/ギャラガーの既存補正は提供者/対象/個別軌跡/ON/OFFを維持する。候補表示だけを適用済みと数えない。','- 主な不足: フォフォ121703の味方ATK支援（trace補正なし）、光円錐21056の味方撃破ダメージ支援（表示専用、撃破/超撃破の範囲要照合）。','- 常時効果21066愉悦度・23055DEF・遺物133速度/134会心ダメージ・パールA2は最終入力で管理する。表示専用でも未実装の自動加算漏れとは数えない。','- 任意補正OFFで基礎計算、ONで必要値不足は影響する結果のみ停止。提供者離脱/再加入・保存復元・UID反映は独立の統合QA項目。','','## 次回優先順位（最大10項目）','',"1. 次回一括候補・銀狼1006: 通常/スキル/必殺と弱点埋込・各種デバフの同撃参照を版別に整理。順序不明なら事前成立条件と残作業を分ける。","2. 次回一括候補・トパーズ1112: 本人通常/スキルとカブ111204の参照者、負債証明・スキルの追加攻撃分類を確認。新規ペット戦闘管理は作らない。","3. 次回一括候補・刃1205: 原版/強化版のHP+ATK成分、現在HP/失ったHPの必殺記録、強化通常と追撃を分離。記録値が必須なら既存入力で安全に表現できる範囲を選ぶ。","4. 次回一括候補・ミーシャ1312: 既存必殺段数の検証を再利用し、通常/スキル/凍結後続と追加能力まで主要構成の不足を確認。","5. 次回一括候補・桂乃芬1210: 通常/スキル/必殺と燃焼・火喰いの所有者/事前状態/起爆成分。未確定の初回順序があれば固定版に対応する証拠待ちへ移す。","6. 次回一括候補・アーチャー1015、セイバー1014、青雀1201: 既存記録と限定状態の不足を先に整理。段間変化/特殊参照の少ないものを選び、8候補全ての完成を前提にしない。","7. 新しい保留・寒鴉1215: 固定版の負担の記述と旧KQM v2.1の適用順が一致しない。現在固定版での被弾前後のTalent適用を示す実行順/実機証拠が必要。素裳1206: A4の追加剣勢中の層更新・main+half+half各段の参照時点を証明できる資料待ち。","8. 既存保留10人とパール/サフェル/鏡流: 台帳の新証拠が得られるまで同じ検索や係数テストを反復しない。アベンチュリン130403の同撃会心被ダメージやルアン・メェイの独立撃破成分は別の証拠を得てから着手。","9. E0以外の計測: E1～6の計算効果/軌跡Lv、光円錐170件・セット62件の常時/条件付き/表示専用を重複なく棚卸しし、未調査の追加工数Uを数値化する。本人攻撃のE0認定を支援や全星魂完成と呼ばない。","10. E0/星魂/装備/支援を実装後、残る参考値、UID/保存/3幅表示/計算精度の統合QA。最終完成認定0を維持し、未知の作業量を0回と扱わない。",'','過去保留のパール150308/150320・サフェル140603・鏡流の版差は再調査せず、根拠が得られるまで保留欄で追跡する。人気順位は推測していない。','','## キャラクター別の登録・未登録・Lv/星魂・限定条件','');
 for(const d of details){p(`<a id="character-${d.c.id}"></a>`, `### ${d.c.id} ${d.c.name}`,'',d.confirmed?confirmedE0[d.c.id]:d.audit?(d.audit.summary+' 残作業: '+d.audit.remaining+' 証拠: '+d.audit.evidence):knownGaps[d.c.id]||'登録一覧の全成分/固有効果は要精査。登録状態と完成認定を分ける。','', '|攻撃ID・種類・名前|登録/実行|Lv・星魂範囲|必要入力・限定条件・不足|次作業/難易度|','|---|---|---|---|---|');for(const a of d.attacks)p(`|${a.id} ${cell(category(a)+' '+a.name)}|登録・${attackStatus(a)}|${cell(bounds(a))}|${cell(a.calculationNote||a.conditionText||a.support?.reason||'個別の入力・固有補正範囲は未明示')}|${cell(difficulty(a))}|`);
  p('','|固定版スキルID・名前|性質|対応する登録攻撃|管理上の扱い|','|---|---|---|---|');for(const s of d.sources){const mapped=d.mapped(s);const role=skillRole(s);p(`|${s.id} ${cell(s.name)}|${cell(role)}|${mapped.map(a=>a.id+' '+attackStatus(a)).join('、')||'なし'}|${role.startsWith('支援')?'ダメージ未実装数に含めない':role.startsWith('秘技')?'主要完成集計外':role.startsWith('召喚')?'有無/子攻撃/既存式接続を要確認':mapped.length?'成分/時点/条件の完全性を確認':'未登録候補。独立ダメージか既存行の成分か要確認'}|`);}
  p('','|星魂|構造化計算/表示|軌跡Lv加算（元データ）/残作業|','|---|---|---|');
  for(let rank=1;rank<=6;rank++){const es=d.eidolon.filter(m=>Number(m.source.eidolonRank)===rank),raw=d.c.eidolons.find(e=>Number(e.rank)===rank);const levelSkills=raw?.levelUpSkills||[];p(`|E${rank}|${es.filter(e=>e.support.status==='calculable').length}/${es.filter(e=>e.support.status==='displayOnly').length}|${levelSkills.map(x=>cell(JSON.stringify(x))).join('、')||'Lv加算なし'}。${es.length?'効果ごとの攻撃範囲/実計算を確認':'構造化記録なし。効果がないとは判断せず影響を精査'}|`);}
  p('',`星魂: 元データE1～6あり。構造化${d.eidolon.length}件（計算${d.eidolon.filter(m=>m.support.status==='calculable').length}・表示${d.eidolon.filter(m=>m.support.status==='displayOnly').length}）。E0主要攻撃と別に、各星魂の攻撃影響/軌跡Lv加算を確認する。`,'');
 }
 p('## 機械照合用フィンガープリント','',`- runtime: \`${hash({attacks:data.attacks,modifiers:data.structuredModifiers,specialBreak:data.specialBreakAttacks})}\``,`- fixed skills/trees/ranks: \`${hash({skills,trees,ranks})}\``,'','元JSONのコピーは保存せず、固定SHAからメモリ上で照合する。この管理表は配信資産や計算ランタイムには使用しない。','');
 return {text:lines.join('\n'),summary:{characters:98,attacks:data.attacks.length,counts,confirmedE0:confirmed.length,screenedCandidates:candidates.length,notCertified:98-confirmed.length,missingCharacters,pendingComposition,backlogRegistered:backlogRegistered.length,backlogWithUnregistered:backlogWithUnregistered.length,missingMasterCandidates:missing,unknownStateSkills:unknown}};
}
if(require.main===module)generate().then(({text,summary})=>{if(process.argv.includes('--check')){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==text)throw Error('管理表が現在データと不一致。node scripts/reportHsrCompletion.cjs で更新してください。');}else fs.writeFileSync(output,text,'utf8');console.log(JSON.stringify(summary));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate,skillRole,e0CandidateAudit,remainingWorkClass,instructionForecast};
