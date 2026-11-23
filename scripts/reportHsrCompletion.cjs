"use strict";
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {loadProductionFixture}=require('../tests/hsr/helpers/hsrDirectVerification.cjs');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'docs/HSR_CHARACTER_COMPLETION.md');
const sha='dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487';
const version47Sha='03907e798b46f9eb109a1f882055cdf49ce3d374';
const sourceBase=`https://raw.githubusercontent.com/Mar-7th/StarRailRes/${sha}/index_new/jp/`;
const version47Base=`https://raw.githubusercontent.com/Mar-7th/StarRailRes/${version47Sha}/index_new/jp/`;
const version47='4.7.0';
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
    "status": "confirmed",
    "workClass": "済",
    "majorSourceIds": [
      "120701",
      "120703",
      "120704"
    ],
    "requiredAttackIds": [
      "120701",
      "1207011",
      "120703",
      "120704"
    ],
    "summary": "通常本体・徹札矢付加・発動時合計・必殺と、鳴弦号令ATK/必殺CR・CD支援を全E0採用Lvで確認。付加成分はadditionalを維持し通常攻撃タグで限定補正を適用。",
    "evidence": "固定120701/120703/120704・trees、固定Fribbels 90bc840のYukong standardBasicとBasicタグ。hsrYukongE0Completionの全通常6×天賦10Lv/必殺10Lv/支援10Lv、独立NC/C/EV。hsrToolInputsの本人/味方・算入済み・提供者解除・保存と1440/390/320px実画面。",
    "remaining": "Lv80/E0/敵1体/状態一定。通常＋付加は虚数非弱点・未撃破・再発動可能な1回。鳴弦号令/必殺会心は成立済みの任意状態、自己虚数12%と恒常小軌跡は最終入力、3支援は個別の算入済み指定で再加算を除外。初回必殺の支援付与順・再発動ターン/層消費・途中撃破・複数敵・E1以上は範囲外。"
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
Object.assign(e0CandidateAudit,{
  "1006": {
    "status": "pending",
    "majorSourceIds": [
      "100601",
      "100602",
      "100603",
      "1100601",
      "1100602",
      "1100603"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "100604": "支援/攻撃後の敵欠陥付与（独立ダメージなし）",
      "1100604": "支援/攻撃後の敵欠陥付与（独立ダメージなし）"
    },
    "summary": "原版/強化版の各直撃曲線と既存デバフを独立照合。原版アノテーションの発動時条件保持、強化A6の常時ATK再加算を修正。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "原版はKQMでスキルRES/必殺DEFがダメージ前、欠陥が攻撃後と確認。強化版へ旧版の実行順証拠を無条件流用せず、強化版での初回付与の同撃参照順を示す実機/実行記録待ち。EHR参照ATKは最終入力で管理。",
    "missingComponents": []
  },
  "1014": {
    "status": "pending",
    "majorSourceIds": [
      "101401",
      "101408",
      "101402",
      "101403"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "101404": "支援/炉心共鳴・EP/与ダメージの状態（独立ダメージなし）"
    },
    "summary": "通常/強化通常・スキル・必殺の成分曲線を独立照合。敵1体の全体+10段合算1014032を状態一定の参考値として追加。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "自分の必殺で新たに得る天賦DMG/共鳴CD、強化通常の+2共鳴CD、スキルのCD50%/共鳴の同撃/途中反映順は未確定。固定倍率表の記述順だけでは確定せず、実行順記録/実機比較が必要。初回/途中変化を正式対応と呼ばない。",
    "missingComponents": []
  },
  "1015": {
    "status": "confirmed",
    "majorSourceIds": [
      "101501",
      "101502",
      "101503",
      "101504"
    ],
    "requiredAttackIds": [
      "101501",
      "101502",
      "101503",
      "101504"
    ],
    "sourceRoleOverrides": {
      "101509": "支援/回路接続の解除・ターン終了（非ダメージ）"
    },
    "summary": "通常・回路接続0～2層のスキル・必殺・独立追撃を確認。守護者はSP獲得で成立した継続状態を手動指定。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "Lv80・E0・敵1体・状態一定。守護者の120%CDは現在SPだけでは自動判定せず、最終CDへ含めた場合OFF。回路接続/追撃チャージの消費、ターン/行動順/SP回復は自動管理しない。小軌跡は最終入力。",
    "missingComponents": []
  },
  "1112": {
    "status": "confirmed",
    "majorSourceIds": [
      "111201",
      "111202",
      "111204"
    ],
    "requiredAttackIds": [
      "111201",
      "111202",
      "111204"
    ],
    "sourceRoleOverrides": {
      "111203": "支援/カブの強化（直接ダメージなし）"
    },
    "summary": "通常（追加攻撃扱い）・スキルカブ・天賦カブの各通常/強化状態を比較。強化の通常への誤適用を修正。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "Lv80・E0・敵1体・事前に負債証明が成立。敵1体では味方行動前の自動付与を仮定。全E0Lvを検証。必殺はカブ強化で直撃なし、行動順/強化回数は自動管理しない。小軌跡は最終入力。",
    "missingComponents": []
  },
  "1201": {
    "status": "confirmed",
    "majorSourceIds": [
      "120101",
      "120108",
      "120103"
    ],
    "requiredAttackIds": [
      "120101",
      "120108",
      "120103"
    ],
    "sourceRoleOverrides": {
      "120102": "支援/牌の取得・与ダメージ上昇（直接ダメージなし）",
      "120104": "強化状態の説明（120108に対応、独立ダメージなし）"
    },
    "summary": "通常・強化通常・必殺の全採用Lvを確認。暗カンATKを強化通常だけでなく状態中の必殺へ適用し、通常比較から分離。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "Lv80・E0・敵1体・状態一定。暗カンATKは未反映分だけ任意ON、最終ATKへ反映済みならOFF。スキル0～4層DMGは加算枠。牌の抽選・SP・門前ツモ(E4)は今回のE0認定外。",
    "missingComponents": []
  },
  "1205": {
    "status": "confirmed",
    "majorSourceIds": [
      "120501",
      "120508",
      "120503",
      "120504",
      "1120501",
      "1120508",
      "1120503",
      "1120504"
    ],
    "requiredAttackIds": [
      "120501",
      "120508",
      "120503",
      "120504",
      "1120501",
      "1120508",
      "1120503",
      "1120504"
    ],
    "sourceRoleOverrides": {
      "120502": "支援/自己強化（直接ダメージなし）",
      "1120502": "支援/自己強化（直接ダメージなし）"
    },
    "summary": "原版/強化版の通常・強化通常・必殺・天賦追撃を確認。必殺HP損失のLv別係数と誤った最低50%を修正。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "Lv80・E0・敵1体・状態一定。最終HP/ATKとダメージ時点の累計HP損失0～90%を入力。強化通常は地獄変を局所仮定。HP消費/回復/記録保持を自動生成せず、必殺のHP調整・回復後の記録を使う。小軌跡再加算なし。",
    "missingComponents": []
  },
  "1210": {
    "status": "pending",
    "majorSourceIds": [
      "121001",
      "121002",
      "121003"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "121004": "支援/敵の火喰い被ダメージ増加（直接攻撃ではない）"
    },
    "summary": "通常/スキル/必殺直撃・自身の燃焼を区別。自己燃焼の起爆は独立SkillLv×UltLvの積へ修正。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "121003全体は自身/他者の燃焼全ての起爆と火喰い層更新を含む。既存1210031は事前火喰い3層・自己燃焼1回だけの成分。他者Burn所有者、初回火喰い順、秘技4段間の層更新は未確定/新処理待ち。直撃だけを全体と呼ばない。",
    "missingComponents": []
  },
  "1312": {
    "status": "pending",
    "majorSourceIds": [
      "131201",
      "131202",
      "131203"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "131204": "支援/EP回復と次回必殺の段数加算（独立ダメージなし）"
    },
    "summary": "通常/スキル・事前凍結の必殺3～10段を維持し、後続凍結1312032を独立追加。",
    "evidence": "固定SHAのJP/EN skills・trees・ranksと既存記録を照合。hsrBatch2TopazBlade / hsrBatch2ArcherSaberQingque / hsrBatch2SilverWolfMishaGuinaifenで全E0曲線・非対称参照値・個別ステータス変更・固有補正・支援を独立検証。",
    "remaining": "131203各段前の凍結成功でA6CDが始まる段が変化。一般の初回必殺を確定する段別状態/確率の処理は未対応。事前凍結・敵1体・状態一定は検証済み。凍結成立後の付加1回は確率を掛けず別計算。",
    "missingComponents": []
  }
});
Object.assign(e0CandidateAudit,{
  "1111": {
    "status": "missing",
    "majorSourceIds": [
      "111101",
      "111102",
      "111103",
      "111104"
    ],
    "requiredAttackIds": [],
    "summary": "通常/スキル直撃/必殺直撃、自己裂創、独立SkillLv×TalentLv起爆100組を検証。敵最大HP欠落は裂創行だけ停止。",
    "remaining": "11111031はA6追加拳の平均1.5段相当の参考成分で、確定単発ではない。強化通常の実現追加拳段数・起爆と他者/撃破裂創の成分を分けた全体は未完成。敵HP上限と自分のATK上限を混同しない。",
    "missingComponents": [
      "111108強化通常全体の実現追加拳段数/全裂創起爆"
    ],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  },
  "1202": {
    "status": "missing",
    "majorSourceIds": [
      "120201",
      "120202",
      "120204"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "120203": "支援/EP回復・与ダメージ（直接ダメージなし）"
    },
    "summary": "通常・A4通常与ダメ40%・賜福ATK上限・祝頌与ダメと賜福追加の独立係数を確認。",
    "remaining": "120204は賜福対象の最終ATK/雷DMG/会心を参照。本人通常＋別の賜福対象を参照する天賦を一体の全体値にする入力接続が未実装。既存の味方攻撃者側の独立追加行を本人参照へ流用しない。",
    "missingComponents": [
      "120201通常＋別参照者の120204天賦追加の並列表示/参照入力"
    ],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  },
  "1214": {
    "status": "pending",
    "majorSourceIds": [
      "121401",
      "121402",
      "121403",
      "121404"
    ],
    "requiredAttackIds": [],
    "summary": "通常・主/隣接スキル・敵1体への天賦3段を全E0曲線で確認。第16回は攻撃前から撃破済みの敵への必殺直接成分を全Lv1～10で追加。A2変換は最終与ダメへ含め再加算しない。",
    "remaining": "121403は既撃破状態だけ正式対応。未撃破敵の実削靭量→与ダメ換算とA4の参照順は証拠待ちで、既撃破の部分対応をE0全構成認定にしない。Fribbels固定版も手動sliderで換算式の証拠ではない。",
    "missingComponents": [],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  },
  "1223": {
    "status": "missing",
    "majorSourceIds": [
      "122301",
      "122302",
      "122303",
      "122304"
    ],
    "requiredAttackIds": [],
    "summary": "通常・スキル本体/初回付加合計1223021・必殺本体・独立天賦追撃1223041を分離検証。A6の追撃被ダメ25%と秘技与ダメ30%は任意条件。",
    "remaining": "初回スキル合計は獲物なし→9チャージ、他の味方生存、雷非弱点未撃破の敵1体。必殺122303は本体のみで、獲物中の付加2回、必殺後追撃、3チャージ消費閾値追撃、獲物消滅を含む全体分岐は未接続。",
    "missingComponents": [
      "122303全体の付加2回/必殺追撃/チャージ閾値分岐"
    ],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  },
  "1302": {
    "status": "pending",
    "majorSourceIds": [
      "130201",
      "130202",
      "130203",
      "130214"
    ],
    "requiredAttackIds": [],
    "sourceRoleOverrides": {
      "130204": "支援/自己強化（天賦の栄耀会心率・直接ダメージなし）"
    },
    "summary": "通常・スキル・90EP必殺の全採用Lvを確認。180EPは全体＋追加6段の状態一定参考値。",
    "remaining": "130214のLv10は280%＋6×95%=850%。栄耀10層を最終CRへ算入しHP50%境界をまたがない数値は照合済み。未飽和栄耀の段間CR更新・A6の途中HP判定の順序証拠がなく、一般180EPを正式対応にしない。",
    "missingComponents": [],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  },
  "1309": {
    "status": "confirmed",
    "majorSourceIds": [
      "130901",
      "130903"
    ],
    "requiredAttackIds": [
      "130901",
      "130903"
    ],
    "sourceRoleOverrides": {
      "130902": "支援/与ダメージ（直接ダメージなし）",
      "130904": "支援/会心ダメージ（直接ダメージなし）"
    },
    "summary": "本人通常と協奏追加物理1回を独立比較。スキル本人与ダメ・天賦本人会心・A4味方追撃CDを分離。",
    "remaining": "Lv80・E0・敵1体・状態一定。協奏は本人の自己ATK上昇まで含む最終ATKで計算し再帰加算しない。CR100%/CD150%固定、通常会心支援を除外。会心被ダメ増加ONの協奏行は参照関係未確認のため局所停止。味方攻撃/行動順/ターンは自動合算しない。",
    "missingComponents": [],
    "evidence": "固定SHAのJP/EN skills・trees・ranks、KQMの対象/発生源記録を照合。hsrBatch3TingyunRobinArgenti / hsrBatch3XueyiMozeLukaで全E0採用Lv・独立NC/C/期待値・ATK/HP/DEF個別変更・固有/外部補正を検証。"
  }
});
Object.assign(e0CandidateAudit,{
  "1111": {
    "status": "confirmed",
    "workClass": "済",
    "primaryBatch": "batch4-common",
    "initialWorkClass": "C",
    "majorSourceIds": [
      "111101",
      "111102",
      "111103",
      "111104",
      "111108"
    ],
    "requiredAttackIds": [
      "111101",
      "111102",
      "111103",
      "1111021",
      "1111041",
      "1111083"
    ],
    "sourceRoleOverrides": {},
    "summary": "直接行・自己裂創/起爆・実現追加拳0～3回×自己裂創あり/なしの強化通常8状態を確認。確率平均と会心期待値を分ける。",
    "evidence": "固定SHAのJP/EN skills/trees/ranksから手書き曲線を採用。hsrBatch4OtherCandidates / hsrBatch4Cerydra / hsrBatch4CommonStates / hsrBatch4ReferenceRoles とToolInputsで全採用Lv・直交ステータス・補正/所有者分離・保存・局所停止を独立検証。",
    "remaining": "Lv80・E0・物理非弱点/未撃破の敵1体・状態一定。裂創は自分のスキル/秘技の1種だけで他者/撃破裂創なし。起爆は1回・会心なし、E6多重起爆は含めない。Will2層以上は局所仮定し表示用チェック不要。確率追加拳の平均参考成分とは合算しない。",
    "missingComponents": []
  },
  "1213": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "121308の3段・121310の5段・121312の7段と4段目以降隣接、天賦の命中後与ダメ累積/スキルCD累積を段別参照。飽和値を無条件に全段へ適用しない。",
    "missingComponents": [
      "命中後の与ダメ/CD更新・段配分"
    ]
  },
  "1224": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "支援系師匠の既存3～8段は維持。122401/122408の攻撃型師匠由来付加はなのかATK＋師匠属性で各命中に分離する必要がある。師匠自身のATKで代用しない。既存状態比較/成分合算を再利用する候補。",
    "missingComponents": [
      "攻撃型師匠の各段・属性別付加"
    ]
  },
  "1225": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "通常本体/強化通常の主隣接、狐祈/雲火昭瑞の防御低下、天賦の虚靭性と超撃破を分離。初回撃破・虚靭性破壊・超撃破は別イベントとして既存式の適用範囲を監査する。",
    "missingComponents": [
      "虚靭性/超撃破・強化通常構成"
    ]
  },
  "1303": {
    "status": "confirmed",
    "workClass": "済",
    "primaryBatch": "batch4-common",
    "initialWorkClass": "C",
    "majorSourceIds": [
      "130301",
      "130303",
      "130304"
    ],
    "requiredAttackIds": [
      "130301",
      "1303031",
      "1303041"
    ],
    "sourceRoleOverrides": {
      "130302": "支援/与ダメージ・撃破効率（直接ダメージなし）",
      "130303": "条件付き/別成分（即時攻撃と区別）",
      "130304": "条件付き/別成分（即時攻撃と区別）"
    },
    "summary": "通常と、天賦/残梅の独立した追加撃破2イベントを確認。氷非弱点でも発動済み想定として計算し、初回撃破と区別。",
    "evidence": "固定SHAのJP/EN skills/trees/ranksから手書き曲線を採用。hsrBatch4OtherCandidates / hsrBatch4Cerydra / hsrBatch4CommonStates / hsrBatch4ReferenceRoles とToolInputsで全採用Lv・直交ステータス・補正/所有者分離・保存・局所停止を独立検証。",
    "remaining": "Lv80・E0・敵1体・本人最終BE・敵最大靭性/氷耐性を入力。現在の撃破状態を進行させず独立1回のみ。本人の常時BE20%は最終入力、パーティへのBE20%提供は従来どおり。ターン/復帰遅延/全星魂・装備・支援は別認定。",
    "missingComponents": []
  },
  "1304": {
    "status": "pending",
    "workClass": "D",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "D",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "130401/130404の全Lv・DEF分離・動揺ON/OFFを再利用検証。130403初回の同撃動揺は既存台帳の証拠待ちを維持。説明文のThen/andだけで処理順を認定せず、事前同Lv動揺の参考値のみ照合。",
    "missingComponents": []
  },
  "1307": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "130704アルカナ層・非会心DoT・7層防御無視20%・敵ターン時開示を分離。旧/強化11307系の選択とA6EHR変換を区別し、状態一定以外は詳細調査が必要。",
    "missingComponents": [
      "旧/強化版アルカナの状態別成分"
    ]
  },
  "1314": {
    "status": "missing",
    "workClass": "D",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "D",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "既存の質草50層・本人非債権回収者の追撃/必殺限定を維持。131402債権回収者付加はジェイドATK、131404の50層未満の各命中時ステータス参照順は既存台帳の証拠待ち。今回同じ仕様検索を反復していない。",
    "missingComponents": [
      "債権回収者付加と50層未満の参照時点"
    ]
  },
  "1321": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "132104各段追撃＋各段超撃破、132102未撃破超撃破許可/効率、132103分担と防御ダウン、A6追加削靭を分離。既存超撃破式と同一とは即断しない。",
    "missingComponents": [
      "段別追撃/超撃破・分担"
    ]
  },
  "1401": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "140102の3成分と140109の3成分＋全体最後撃を分離。解読の加算は最後の全体部分のみ（KQM）。A2閾値、A4味方CD、A6回答、必殺ATK支援の状態別接続が必要。",
    "missingComponents": [
      "通常/強化スキルの最後撃だけに入る解読"
    ]
  },
  "1403": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "140301主/隣接、140303本体/結界付加、140304独立追撃を分離。A2追撃後与ダメ蓄積、A4結界中の全員HP合計由来HP、結界被ダメと貫通を同撃へ再加算しない。単一敵の固定状態で共通合算を再利用する候補。",
    "missingComponents": [
      "結界付加と独立追撃/HP参照・状態"
    ]
  },
  "1404": {
    "status": "confirmed",
    "workClass": "済",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "B",
    "majorSourceIds": [
      "140401",
      "140402",
      "140403",
      "140409",
      "140411"
    ],
    "requiredAttackIds": [
      "140401",
      "140402",
      "140403",
      "140409",
      "140411"
    ],
    "sourceRoleOverrides": {
      "140404": "支援/自己強化（HP/状態管理、独立ダメージなし）"
    },
    "summary": "通常・スキル・強化2種・必殺のHP参照5行を確認。血の報復とA6は完成済み最終値を参照し再加算しない。",
    "evidence": "固定SHAのJP/EN skills/trees/ranksから手書き曲線を採用。hsrBatch4OtherCandidates / hsrBatch4Cerydra / hsrBatch4CommonStates / hsrBatch4ReferenceRoles とToolInputsで全採用Lv・直交ステータス・補正/所有者分離・保存・局所停止を独立検証。",
    "remaining": "Lv80・E0・敵1体・状態一定。各状態での最終HPと、戦闘開始時HP由来まで反映した最終CRを入力。HP消費/回復/チャージ/状態移行は自動管理しない。秘技/星魂/全装備・全支援の認定ではない。",
    "missingComponents": []
  },
  "1405": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "140502の敵数依存与ダメ/優先バウンド、140504弱点付与と質的暴露、140503昇華・固有防御無視を攻撃時点別に分離。倍率1個の独立検証だけでは途中の弱点状態を再現できない。",
    "missingComponents": [
      "弱点数/露呈とバウンド各成分"
    ]
  },
  "1408": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "140809全体＋4バウンドと熾炎、140811壊傷消費16段/分担、140803変身終了成分、A4与ダメ45%を要接続。140811のLv8最大合計1023.75%への抽出誤りだけ修正し全体は参考値を維持。",
    "missingComponents": [
      "変身後の状態別多段・分担・終了成分"
    ]
  },
  "1412": {
    "status": "confirmed",
    "workClass": "済",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "B",
    "majorSourceIds": [
      "141201",
      "141203",
      "141204"
    ],
    "requiredAttackIds": [
      "141201",
      "141203",
      "141204"
    ],
    "sourceRoleOverrides": {
      "141202": "支援/奇襲指示（本人の直接ダメージではない）"
    },
    "summary": "通常・必殺・本人ATK参照の天賦付加1回を独立確認。付加を軍功対象のATKで代用しない。",
    "evidence": "固定SHAのJP/EN skills/trees/ranksから手書き曲線を採用。hsrBatch4OtherCandidates / hsrBatch4Cerydra / hsrBatch4CommonStates / hsrBatch4ReferenceRoles とToolInputsで全採用Lv・直交ステータス・補正/所有者分離・保存・局所停止を独立検証。",
    "remaining": "Lv80・E0・敵1体分・軍功対象は自分以外・状態一定。本人のA2ATK→CD/A4CRまで反映した最終値を使用。ATK支援でA2が変われば最終CDも更新。軍功/爵位/奇襲の味方支援は別認定。",
    "missingComponents": []
  },
  "1414": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "141403は本人ATKの必殺本体と、強化龍霊の本人ATK追撃/同袍ATK・属性付加を分離。A6の最高HP対象への同袍付加も必要。141402/141404の通常バリアは未登録ダメージに数えない。",
    "missingComponents": [
      "強化龍霊の本人/同袍別参照・A6付加"
    ]
  },
  "1504": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "150402の既存餌追加、150403本体＋強化天賦/暴食反復、A4追撃80%＋層10%・A6味方CD/FUAを成分ごとに接続。反復/参照時点の詳細受入が必要。",
    "missingComponents": [
      "本体/強化天賦/暴食反復の構成"
    ]
  },
  "1508": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "150809の全体＋宝石消費反復/ランダム、150805のアーチャー別ATK共同追撃、A2量子貫通共有・必殺被ダメ増加・天賦CDを成分分離。固定文の存在だけでは全状態を保証しない。",
    "missingComponents": [
      "宝石反復とアーチャー別参照の共同追撃"
    ]
  },
  "8008": {
    "status": "missing",
    "workClass": "C",
    "primaryBatch": "batch4-unscreened",
    "initialWorkClass": "C",
    "majorSourceIds": [],
    "requiredAttackIds": [],
    "summary": "固定版の攻撃構成を一次分類。全Lv/状態/固有補正の受入は別途必要。",
    "evidence": "固定SHA JP/ENのskills/trees/ranksと本番ローダー・既存検証記録を照合。未精査だった構成の入口を特定し、説明文だけで実行順を認定しない。",
    "remaining": "800803はミュリオン自身のATK、800808は開拓者/ミュリオンの別ATKを参照。本人ATKへの代用を停止。精霊/連携の独立ステータスと補正継承、天賦/確定成分を接続し全Lv検証する。",
    "missingComponents": [
      "800803/800808の精霊参照スナップショット"
    ]
  }
});

// Batch 5 acceptance records: scalar/component evidence does not certify unresolved events.
Object.assign(e0CandidateAudit['1202'], {status:'confirmed',workClass:'済',majorSourceIds:['120201','120204'],requiredAttackIds:['120201','120204'],sourceRoleOverrides:{'120202':'支援/味方の賜福攻撃後の付加（本人のスキル直撃ではない）','120203':'支援/EP回復・与ダメージ（直接ダメージなし）'},summary:'通常120201と別の賜福対象が帰属/参照する天賦120204を並列化。本人A4通常40%と対象の完成済み戦闘値を分離。',remaining:'Lv80・E0・敵1体・賜福付与から発生まで状態一定。本人通常と付加を自動合算しない。対象のATK/会心/雷DMG・防御無視/耐性貫通は支援反映済みの最終値を別入力し、攻撃者側の補正を再加算しない。味方支援の全範囲/動的スナップショット/星魂は別認定。',missingComponents:[],evidence:'固定SHA JP/EN120201/120202/120204、KQM SRL所有者実証（v1.0のため状態一定で使用）、hsrBatch5ReferencesとhsrToolInputsで全採用Lv/所有者変更/局所停止/保存を独立検証。'});
Object.assign(e0CandidateAudit['1223'],{summary:'1223031で獲物なしの必殺＋直後追撃、付与直後9チャージの必殺＋追撃＋付加2回を別状態比較。既存通常/初回スキル/独立追撃を維持。',remaining:'3回目消費の閾値追撃と最後の獲物消滅時の適用順が未確認。9チャージからの限定合計だけで全E0構成認定しない。',missingComponents:['チャージ閾値/最後の獲物消滅分岐'],evidence:'固定SHA122303/122304とKQM v3.2（必殺で付加2回・チャージ消費1）、hsrBatch5Moze全必殺Lv×天賦Lv/NC/C/期待値・成分別補正。'});
Object.assign(e0CandidateAudit['1224'],{status:'pending',workClass:'D',majorSourceIds:['122401','122402','122403','122404','122408'],requiredAttackIds:['122401','122408','122403','1224011','1224081'],sourceRoleOverrides:{'122402':'師匠への支援と通常/強化通常に伴う付加。スキル直撃ではない','122404':'強化状態/チャージ（天賦自体の直接攻撃なし）'},summary:'通常/強化の本体＋攻撃型師匠の属性付加1224011/1224081を接続。なのか自身ATK/会心、成分属性別与ダメージ/敵耐性で実現3～8段を比較。',remaining:'通常攻撃限定補正を師匠付加へ継承する範囲は未確認で該当合計を停止。当時の御空と同じ保留理由だが、師匠付加の独立証拠は別途必要で全E0構成認定は保留。支援型師匠3～8段と通常手番必殺を維持。',missingComponents:[],evidence:'固定SHA122401/122402/122403/122404/122408・JP/ENtrees/ranks。hsrBatch5March全通常Lv×スキルLv×実現段数×師匠属性/運命、native与ダメ各成分1回・ATK/HP/DEF分離と画面保存。'});
Object.assign(e0CandidateAudit['1403'],{status:'pending',workClass:'D',majorSourceIds:['140301','140302','140303','140304'],requiredAttackIds:['140301','140303','1403031','140304'],sourceRoleOverrides:{'140302':'味方耐性貫通支援（スキル直接ダメージなし）'},summary:'HP参照通常・必殺本体・追撃・結界付加1回を独立検証。A2完了済み0～3層72%ずつ、スキル貫通、結界被ダメを分離。A4は完成済み最終HPへ含む。',remaining:'初回必殺自身の結界/A4適用順、追撃後から結界付加までの新規A2適用順が未確定。独立スナップショットを無条件に全体へ合算しない。',missingComponents:[],evidence:'固定SHA JP/EN140301..304/1403101/1403102/ranks、hsrBatch5Tribbie全採用Lv・HP隔離・提供者/軌跡Lv/条件ON/OFF・追撃分類を独立検証。'});
Object.assign(e0CandidateAudit['1414'],{workClass:'D',summary:'本人通常141401・必殺直撃141403を全E0採用Lvで検証。後続龍霊のPhysical本人ATK成分、同袍属性/ATK付加、A6最高HP対象付加を別イベントと特定。',remaining:'龍霊の同袍側ダメージ帰属はrankE2にも明記されるが、会心/与ダメ/防御無視等の継承範囲・参照時点を確認できない。別参照者ヘルパーだけで龍霊全体を有効化しない。',evidence:'固定SHA JP/EN141401/141403/trees/ranksとhsrBatch5DanHeng。通常50～100%、必殺150～300%。龍霊2成分40～80%、A6同袍ATK40%は係数までで継承は未認定。'});


// Batch 6: preliminary classification uses existing records, not a new source audit.
const batch6InitialReview={
  "1213": [
    "C1",
    "通常式を各命中へ使う候補。段ごとの与ダメ/会心蓄積と隣接成分の接続が必要。"
  ],
  "1220": [
    "C1",
    "既存スキル合算/追撃を再利用。必殺6段と終撃、撃破状態別成分の接続が必要。"
  ],
  "1223": [
    "C1",
    "既存U/F/付加の合算を再利用。閾値と獲物消滅には新証拠が必要で再調査しない。"
  ],
  "1225": [
    "B",
    "本人直接3行の独立検証。狐の祈り/雲火昭瑞/超撃破支援を本人の未登録ATK攻撃と数えない。"
  ],
  "1307": [
    "C1",
    "既存DoT式で旧/強化アルカナの層・自然発生/起爆・DEF無視を分離できる。"
  ],
  "1308": [
    "C2",
    "必殺段階/集真赤の途中更新を含むヒット別構成の詳細未計測。"
  ],
  "1310": [
    "C1",
    "通常式/既存超撃破式を再利用。完全燃焼の直撃と固有超撃破を分離する必要。"
  ],
  "1315": [
    "C1",
    "既存normalAndBreak経路を保持。未撃破から新規撃破/ポケット状態分岐の全構成受入が必要。"
  ],
  "1317": [
    "C1",
    "既存撃破/超撃破式を再利用。直撃3段・チャージ追加撃破・段ごとの超撃破接続が必要。"
  ],
  "1321": [
    "C2",
    "超撃破共同成分・別参照/状態別入力の全受入量が未計測。"
  ],
  "1401": [
    "C1",
    "通常/強化Skillの成分分離と最後撃だけの解読を既存式へ接続する候補。"
  ],
  "1402": [
    "C2",
    "本人/精霊の共同通常・速度参照と補正継承の全構成未精査。"
  ],
  "1405": [
    "C1",
    "通常/Skill後の非再帰追加Skillを既存成分式へ接続する候補。弱点付与同撃順に証拠が必要。"
  ],
  "1407": [
    "C2",
    "精霊のHP消費/段階別成分と別所有者の入力・補正継承が必要。"
  ],
  "1408": [
    "C2",
    "変身/消費/段間状態の全成分構成、HP/ATK換算/分配の詳細未計測。"
  ],
  "1409": [
    "C2",
    "イカルン独立参照と累計治癒量由来成分の全構成/入力が未計測。"
  ],
  "1410": [
    "C1",
    "DoT4種と結界DoTは既存DoT/cappedHP式候補。必殺全起爆の段順・発動数が必要。"
  ],
  "1413": [
    "C2",
    "独立精霊とHP/段階状態の新しい入力/構成の詳細未計測。"
  ],
  "1415": [
    "C2",
    "精霊/確定ダメージ・共同成分の全所有者/発動時点が未接続。"
  ],
  "1501": [
    "C2",
    "SP消費反復と強化通常/愉悦の状態構成、全成分受入量が未計測。"
  ],
  "1502": [
    "C1",
    "150220の既存愉悦式を再利用。大吉の提供者/攻撃者愉悦度max参照、属性付加と追加アッハ時点が未接続。"
  ],
  "1504": [
    "C1",
    "本体/餌/暴食反復と自己追撃を既存成分式で分解する候補。"
  ],
  "1505": [
    "C1",
    "既存150520愉悦式を持つ。通常/Skill/Ultと追加愉悦の別成分接続が必要。"
  ],
  "1506": [
    "C2",
    "愉悦専用成分・強化状態とリソース別の構成の詳細未精査。"
  ],
  "1507": [
    "C1",
    "HP参照5イベント、Skill天賦追撃の分類、変身会心/編成分岐の接続で完成候補。"
  ],
  "1508": [
    "C1",
    "別参照者・宝石反復を既存成分式へ接続する候補。所有者/段順の受入は未計測。"
  ],
  "1509": [
    "C1",
    "既存通常式/別参照者を再利用する候補。セイバーとの連携、興の層数/強化状態の全構成は未検証。"
  ],
  "1510": [
    "C2",
    "通常/必殺状態別と連携の複数所有者・補正継承の詳細未計測。"
  ],
  "1512": [
    "C2",
    "フィーバー以外を含む全精霊行動・独立所有者の詳細量は未計測。"
  ],
  "1513": [
    "C1",
    "既存愉悦式は利用可能。151304の褒美由来追加成分とA4単独愉悦時の追撃扱いを接続する必要。"
  ],
  "8007": [
    "C2",
    "男性版にも同じ精霊所有者問題。本人ATKによる代用を停止する必要。"
  ],
  "8008": [
    "C2",
    "精霊と本人の別ATK/会心/補正、連携と確定成分。独立スナップショットが未接続。"
  ],
  "8009": [
    "C2",
    "愉悦女性版と同型候補だが所有者/成分・全Lvの個別受入が必要。"
  ],
  "8010": [
    "C2",
    "愉悦の複合/追加成分・状態入力の詳細量は未計測。既存式だけで閉じるか要精査。"
  ]
};
for(const [id,[group,reason]]of Object.entries(batch6InitialReview)){const a=e0CandidateAudit[id]||{status:"pending",majorSourceIds:[],requiredAttackIds:[],missingComponents:[],summary:"既存管理記録からの一次分類。全構成・固有倍率の詳細受入は未完了。",evidence:"既存管理表・本番ローダーの構造を再利用した作業分類であり、検証済みを意味しません。"};a.batch6InitialClass=group;a.workClass=group;a.batch6ClassificationReason=reason;if(!a.remaining)a.remaining=reason;e0CandidateAudit[id]=a;}
Object.assign(e0CandidateAudit['1225'],{status:'confirmed',workClass:'済',majorSourceIds:['122501','122508','122503'],requiredAttackIds:['122501','122508','122503'],missingComponents:[],sourceRoleOverrides:{'122502':'支援/狐の祈り・灼熱・敵DEF低下（本人の直接ダメージなし）','122504':'支援/雲火昭瑞・各攻撃者の再撃破/超撃破（本人ATKの追加攻撃ではない）'},summary:'本人通常・強化通常・必殺の直接3行を全E0採用Lvで確認。支援由来の撃破/超撃破は独立経路と分離。',remaining:'Lv80・E0・敵1体・未撃破で途中撃破なし。狐の祈りは別の味方、敵DEFは事前成立分。A4BE30%は最終BE。支援全対応・初回/虚靭性の進行・全星魂までの最終完成とは別。',evidence:'固定JP/EN122501/508/503/504、trees/ranks。hsrBatch6FugueMemory全Lv・ATK/HP/DEF分離・通常会心と独立超撃破の非会心経路。hsrToolInputsと3幅の実画面/保存。'});
Object.assign(e0CandidateAudit['1507'],{status:'confirmed',workClass:'済',majorSourceIds:['150701','150708','150702','150704','150714'],requiredAttackIds:['150701','150708','150702','1507041','150714'],missingComponents:[],sourceRoleOverrides:{'150703':'支援/結界・会心強化・修羅の炎（変身時の直接ダメージなし）','150704':'条件付き/別成分（即時攻撃と区別）','150709':'支援/内部HP消費データ（追加の独立攻撃ではない）'},summary:'HP参照通常/強化通常・全体+4段Skill・Talent由来FUA・強化必殺の5行を確認。SkillのHP消費10%をダメージ係数へ誤抽出していた参考値を168%へ訂正。',remaining:'Lv80・E0・敵1体・状態一定。変身各行は成立済みの無量忿怒/修羅の炎、FUAはチャージで発生した1回を仮定。会心上昇は各行に加算し、入力に含めない。A6は他の虚無の有無から自動分岐。HP/EP消費・再発動・途中撃破・複数敵は対象外。',evidence:'固定JP/EN150701/702/703/704/708/714/1507103、trees/ranks。hsrBatch6Blade全Lv/独立UltLv/HP隔離/CRCD/支援とカテゴリ別補正。hsrToolInputsと3幅実画面・提供者離脱/保存。'});
Object.assign(e0CandidateAudit['1307'],{status:'pending',workClass:'D',majorSourceIds:['130701','130702','130703','130704','1130701','1130702','1130703','1130704'],requiredAttackIds:['130701','130702','130703','130704','1307041','1130701','1130702','1130703','1130704','11307041'],missingComponents:[],summary:'旧/強化の直接成分とアルカナ自然/起爆原始値を全Lv確認。B+層C、非会心、旧自然7層DEF20%/強化常時20%を分離。強化51/75層も持続上限50に切り捨てず検証。',remaining:'初回Skillで新たに付与するDEF低下の同撃順が未確定。スキルは同LvDEF低下が事前成立した行だけを正式化し、全E0認定は保留。層リセット/発生確率/他者起爆率との複合は未再現。',evidence:'固定JP/EN1307/11307 skills/trees/ranksとKQM。hsrBatch6BlackSwan全Lv/層境界・超過/独立SkillUltLv/ATK隔離・A6最終管理、3幅UI/保存。'});
Object.assign(e0CandidateAudit['1405'],{status:'pending',workClass:'D',majorSourceIds:['140501','140502','140503','140504'],requiredAttackIds:['140501','140502','140503','1405011','1405021'],sourceRoleOverrides:{'140504':'支援/弱点付与・本質暴露と後続Skill（全体成分は1405011/1405021）'},missingComponents:[],summary:'事前7弱点・本質暴露・撃破済みで、直接3成分と通常+追加Skill/Skill2回の非再帰合計を独立検証。',remaining:'0～6弱点で攻撃中に弱点が増える場合のDEF無視/本質暴露の同撃順は未確認。本文の記載順だけで確定しない。A4知恵1人CD140%/2人以上DMG50%は該当一方を最終入力。限定7状態だけでE0認定しない。',evidence:'固定JP/EN140501..504/1405101..103、AnaxaMains v3.8は事前本質暴露の追撃条件を記載するが各命中の更新順は未証明。hsrBatch6Anaxa全Lv/独立TalentLv/2成分/補正種別/所有者、3幅UI。'});
for(const id of ['8007','8008'])Object.assign(e0CandidateAudit[id],{status:'missing',workClass:'D',summary:'本人通常は全E0採用Lvを検証。ミュリオンATKを本人で代用していた男性800703/800708/1800701も停止し、女性と同じ所有者境界に訂正。',remaining:'精霊の独立ATK/会心/氷DMG/防御無視/耐性貫通・連携2所有者・能力Lv6・確定成分が未接続。親必殺から発生する精霊ダメージへの必殺専用補正の範囲にも証拠が必要。',missingComponents:['精霊の独立スナップショット/補正帰属と連携・確定成分'],evidence:'固定JP/EN8007/8008と共有1800701/703/707・trees/ranks、KQM memosprite mechanics v3.2。hsrBatch6FugueMemoryで本人ATK代用の拒否と通常維持、UI/保存。'});
Object.assign(e0CandidateAudit['1410'],{workClass:'D',remaining:'Talent4種DoT/結界DoTの係数は判明。必殺A4の全DoT150%起爆・新規Talent付与・結界DoT最大8回の同一攻撃中の順序/回数と他所有者DoTを含む全構成が未確定。新しい版付き実行順証拠を待つ。',evidence:'固定JP/EN141001..004・1410101..103を一次照合。全状態の実行順の証拠は未取得。DoT/cappedHPの既存式は再利用候補だが、部分値を必殺全体としない。'});

e0CandidateAudit["1111"].sourceRoleOverrides={"111104":"条件付き/別成分（即時攻撃と区別）"};
// Batch 7 keeps bounded component verification separate from whole-kit completion.
e0CandidateAudit['1310']={...e0CandidateAudit['1310'],status:'confirmed',majorSourceIds:['131001','131002','131008','131009','1131001','1131002','1131008','1131009'],requiredAttackIds:['131001','131002','131008','131009','1131001','1131002','1131008','1131009'],missingComponents:[],sourceRoleOverrides:{'131003':'支援/状態変化（完全燃焼・直接ダメージなし）','1131003':'支援/状態変化（完全燃焼・直接ダメージなし）','131004':'支援/耐久（天賦に直接ダメージなし）','1131004':'支援/耐久（天賦に直接ダメージなし）'},summary:'旧/強化版のN/S/強化N/強化Sを全採用Lv検証。強化行は攻撃前から炎弱点/撃破済みの直接＋本人超撃破。',evidence:'固定131001/2/3/8/9・1131001/2/3/8/9、1310102/3・11310101/2/3。hsrBatch7BreakとhsrToolInputsで全採用Lv/BE境界/本人補正/型別外部支援/局所停止/保存を独立照合。削靭は現行15/30、敵最大靭性の旧単位と分離。',remaining:'Lv80/E0/敵1体/状態一定の限定E0構成。強化行は事前撃破・炎弱点。途中の新規撃破/敵復帰/外部超撃破の合算、ATK支援で変わるA6再変換は未対応（該当行を停止）。常時A6は最終入力、強化版A2BE25%は一度加算。全星魂/全装備/支援の最終完成ではない。'};
e0CandidateAudit['1315']={...e0CandidateAudit['1315'],status:'pending',workClass:'C1',majorSourceIds:['131501','131503','131504','131508'],requiredAttackIds:['131501','131503','131508'],missingComponents:[],sourceRoleOverrides:{'131502':'支援/状態変化（九死の決闘・即時ダメージなし）','131504':'条件付き/別成分（即時攻撃と区別）'},summary:'既存本人3行とファニングのポケット0～3層を検証。表示目的の発動チェックは不要。',evidence:'hsrBatch7Break:通常1～6×天賦1～10×0～3層、hsrToolInputs:想定決闘・0保存・不正値局所停止。既存の正式版精度配列を維持。',remaining:'未撃破からの初回撃破と段間ポケット更新を含むファニング全状態が未接続。現状は物理弱点/事前撃破/最大靭性旧単位480以下/状態一定。未接続状態を完成と認定しない。'};
e0CandidateAudit['1317']={...e0CandidateAudit['1317'],status:'missing',workClass:'C1',majorSourceIds:['131701','131702','131704','131718'],requiredAttackIds:['131701','131702','1317041'],missingComponents:['131718全体:直撃3段/天賦追加撃破/A4超撃破の段別接続と途中撃破・チャージ参照'],sourceRoleOverrides:{'131703':'支援/状態変化（結印・ダメージなし）','131708':'支援/内部段（131718の第一段と同じ行動）','131710':'支援/内部段（131718の第二段と同じ行動）','131712':'支援/内部段（131718の第三段と同じ行動）'},summary:'直撃3段は参考値のまま。天賦追加撃破1317041を独立行で追加。',evidence:'固定131704[2,4]の全10Lv×チャージ0～10をhsrBatch7Breakで独立照合。枯葉は事前成立した量を撃破専用補正へ指定し、通常被ダメ欄へ入れない。',remaining:'A4の各段超撃破と天賦側削靭の適用順、初回撃破によるチャージ更新、強化通常全体の合算が未接続。追加撃破1回の認定は全E0認定ではない。'};
e0CandidateAudit['1513']={...e0CandidateAudit['1513'],status:'pending',workClass:'C1',majorSourceIds:['151301','151302','151303','151304','151320','151321'],requiredAttackIds:['151301','151302','151303','1513041','1513042','151320','151321'],missingComponents:[],summary:'天賦CB由来のS/U追加愉悦1513041/2を独立行で追加。爆笑ネタ/熱気と別入力。',evidence:'固定151304[1,2]全10LvとCB1/20/40/240/10000、愉悦式・ATK/HP/DEF隔離・保存/局所停止をhsrBatch7Elation/hsrToolInputsで検証。',remaining:'単独愉悦時のA4追撃扱い、S/Uで熱気10へ到達する自動愉悦の全成分接続と状態順が残る。本人A2/A4/A6は完成済み入力。独立追加愉悦をS/U全体の合計としない。'};
e0CandidateAudit['1505']={...e0CandidateAudit['1505'],status:'missing',workClass:'C1',majorSourceIds:['150501','150502','150503','150504','150520'],requiredAttackIds:['150501','150502','150503','150504','150520'],missingComponents:['150502/150503/150504のCB由来追加愉悦（Uはmax(CB,480)）と同一行動の成分接続'],summary:'通常成分4行を全採用Lv検証。単敵UはAoE＋A2込み9バウンド。Foxは12%被ダメ事前成立。',evidence:'固定150501..504/1505101/2、hsrBatch7Hiyu。通常1～6/他1～10、ATK/HP/DEF隔離・型限定補正・停雲支援・native重複拒否。',remaining:'CB由来のS/U/Fox追加愉悦が未接続。U参照は最大EP480が下限、FoxのEP累計240と混同しない。初回FoxのA4同撃順は証拠待ち。現在値は通常成分のみで全体合計ではない。'};
e0CandidateAudit['1502']={...e0CandidateAudit['1502'],workClass:'C1',remaining:'大吉150204の愉悦度max(攻撃者,提供者)以外の所有者/会心/属性補正継承と、必殺による追加アッハ（固定爆笑ネタ20）の文脈が未接続。既存初回150220のみの限定対応を維持。'};
// Batch8: all own main actions have independent, fixed-state E0 acceptance; no mid-action Break simulation.
Object.assign(e0CandidateAudit['1220'],{status:'confirmed',workClass:'済',majorSourceIds:['122001','122002','122003','122004'],requiredAttackIds:['122001','122002','122003','122004'],missingComponents:[],sourceRoleOverrides:{'122008':'支援/内部必殺分岐（122003の6回選択に算入）','122009':'支援/内部必殺分岐（122003の6回選択に算入）','122014':'支援/内部表示（122003と同一必殺・全15Lv係数一致、別の追加ダメージではない）'},summary:'通常・スキル本体＋雷狩・天賦単独・必殺6選択＋最後撃を全採用Lvで検証。必殺は条件一致0～6回を一覧比較。解形の追撃CD36を別加算し、通常成分へ漏らさない。',remaining:'Lv80/E0/敵1体/状態一定。通常は状態一定、Skill/FUAは未撃破非弱点、必殺は攻撃前から撃破済み。神速ATKなどは最終入力、追撃専用CD36は最終入力に含めない。途中撃破/資源・行動進行/複数敵は対象外。星魂・全装備/支援の最終完成ではない。',evidence:'固定122001/3/4/8/9・1220102とKQM。hsrBatch8Feixiaoで全Lv/7選択/独立2成分/ATK隔離/型別補正/局所停止。1440/390/320でPC・実操作/保存/提供者離脱、12画像。Lv7/9は丸め表示上限でなく実成分和588.22/662.72%。'});
// Batch8 classification: explicit evidence blockers are not remaining "connection-only" work.
for(const id of ['1509','1508','1401','1213','1502','1223','1315'])Object.assign(e0CandidateAudit[id],{workClass:'D',evidence:(e0CandidateAudit[id].evidence||'')+' 第8回は既存固定版記録を再利用し、同一の証拠不足を反復調査せずDへ整理。'});
Object.assign(e0CandidateAudit['1505'],{status:'pending',workClass:'D',majorSourceIds:['150501','150502','150503','150504','150520'],requiredAttackIds:['150501','150502','150503','150504','150520','1505041','1505042','1505043'],missingComponents:[],summary:'通常成分4行に加え、S/U/FoxのCB追加愉悦3行を独立表示。Uは全体24%＋9×28%=276%（T10）、max(CB,480)。通常部分との全体自動合算はしない。',remaining:'初回Foxの同撃A4付与順と行動中のEP/CB更新・参照時点は証拠待ち。現在は状態一定の成分比較。CD由来20%は最終愉悦度に算入、CD支援の自動再変換を検証していない新CB行は該当支援時だけ停止。全主要構成は未認定。',evidence:'固定150504[1,4,5,6,7]・150503/1505101・最大EP480。hsrBatch8Hiyu全10Lv/CB境界/所有者入力隔離/不等10成分/ATKHPDEF/敵補正/既存支援の範囲外除外。hsrBatch8BreakIsolation、hsrToolInputsと3幅UI・保存。Prydwen Evanesciaも最大EP480/A2の追加4バウンドを照合。'});
// Round8: certify stable input states only after full-curve, App and viewport acceptance.
e0CandidateAudit['1212']={status:'confirmed',workClass:'済',majorSourceIds:['121201','121202','121209','121203','1121201','1121202','1121209','1121203'],requiredAttackIds:['121201','121202','121209','121203','1121201','1121202','1121209','1121203'],missingComponents:[],sourceRoleOverrides:{'121204':'支援/転魄の会心率・HP消費由来ATK（完成済み最終ATK）','1121204':'支援/転魄の会心率・月光CD（現在状態入力）'},summary:'ATK/HP参照版の通常・通常スキル・強化スキル・必殺の8行を分離。転魄CR、HP月光CD、両版の必殺DMGとHP次攻撃DEF無視を接続。',evidence:'固定1212/11212 skills/trees、hsrJingliuRound8・hsrAttacksRound6/7とhsrToolInputsの全採用Lv・参照隔離・状態OFF/算入済み・保存復元。1440/390/320実画面。1121202は通常スキルの誤表記を訂正。',remaining:'Lv80/E0/敵1体/状態一定。ATK変換・恒常効果は最終値に一度含め、現在の転魄/月光・次攻撃状態を指定。攻撃中のHP消費・月光獲得/消失・朔望進行、隣接敵・全星魂は範囲外。'};
Object.assign(e0CandidateAudit['1304'],{status:'confirmed',workClass:'済',majorSourceIds:['130401','130403','130404'],requiredAttackIds:['130401','130403','130404'],missingComponents:[],sourceRoleOverrides:{'130402':'支援/シールド（直接ダメージなし）','130404':'条件付き/別成分（即時攻撃と区別）'},summary:'通常・必殺直接成分・七段の天賦追撃を全E0採用Lvで独立検証。必殺は事前に同Lv動揺が成立した選択状態に限る。',evidence:'固定130401/403/404、1304101/103。hsrAventurineRound8とhsrToolInputsでDEF隔離・最終CR責務・動揺ON/OFF・局所除外・保存復元。1440/390/320実画面。',remaining:'Lv80/E0/敵1体/状態一定。追撃は発生済みの1回・7段、昇格CRは最終入力。必殺自身の初回動揺付与順は未確定のまま、事前同Lv動揺だけ計算。シールド/BB更新、複数敵分配、全星魂・装備・支援の最終完成とは別。'});
Object.assign(e0CandidateAudit['1401'],{status:'pending',workClass:'D',majorSourceIds:['140101','140102','140109','140103'],requiredAttackIds:['140101','140102','140109','140103'],sourceRoleOverrides:{'140104':'支援/解読の強化スキル最終成分への倍率加算'},missingComponents:[],summary:'主要4攻撃は計算行あり。強化スキルは解読事前42層に限定して三段＋最後の全体攻撃へ分離し、最後だけ天賦倍率を加算。',evidence:'固定140101/102/109/103/104とtrees、KQMの最後撃限定記述を直接照合。hsrHertaRound8全Skill×Talent Lv・知恵1/2人、hsrToolInputsの装備/支援/回答/既算入/保存と3幅実画面。',remaining:'42層未満での攻撃中の層更新と、初回必殺のATK付与順は未確定。既に有効な必殺ATKは任意状態・最終入力と区別。限定4行をキャラ全状態完成として認定しない。'});
e0CandidateAudit['1308']={...e0CandidateAudit['1308'],status:'pending',workClass:'D',majorSourceIds:['130801','130802','130803'],requiredAttackIds:['130801','130802','130803'],sourceRoleOverrides:{'130804':'支援/残夢・集真赤・必殺中耐性低下','130814':'支援/130803内の啼沢斬り内部段（重複登録しない）','130815':'支援/130803内の啼沢斬り内部段（重複登録しない）','130816':'支援/130803内の啼沢斬り内部段（重複登録しない）','130817':'支援/130803内の黄泉返り内部段（重複登録しない）'},missingComponents:[],summary:'必殺は集真赤事前9層・雷心事前3層に限定し、啼沢斬り3回の直接/消去成分、黄泉返り、雷心6追加の13成分を合算。',evidence:'固定130803の3×(params[0]+params[4])+params[2]=params[5]、1308103の6×25%、130804耐性低下。hsrAcheronRound8全Lv・成分不足/並替/参照不一致拒否、hsrToolInputsと3幅画面。',remaining:'集真赤0～8層の攻撃途中分岐・初回雷心獲得順は未認定。13成分を含む限定最大状態の値を任意状態の必殺技全体完成としない。'};
// Round9: complete stable major compositions, with unverified transitions explicitly outside acceptance.
Object.assign(e0CandidateAudit['1204'],{status:'confirmed',workClass:'済',majorSourceIds:['120401','120402','120403','120404'],requiredAttackIds:['120401','120402','120403','120404'],missingComponents:[],sourceRoleOverrides:{'120404':'条件付き/別成分（即時攻撃と区別）'},summary:'通常・事前遣将のスキル・必殺・神君3～10段の主要構成を全E0採用Lvで確認。破陣CDは各想定段数で自動判定。',evidence:'固定120401..404/1204101/103、hsrJingYuanE0Completion・hsrCharactersRound9、hsrToolInputsの8段数/条件OFF/局所停止/保存、代表実画面1440px。',remaining:'Lv80/E0/敵1体/状態一定。スキルは事前に遣将が有効でCR10%は入力に未算入。新規スキルで同撃に付与する順序、神君段数増加/行動順・複数敵分配・途中撃破は対象外。神君と本人行動を自動合算しない。'});
Object.assign(e0CandidateAudit['1209'],{status:'confirmed',workClass:'済',majorSourceIds:['120901','120902','120903','120904'],requiredAttackIds:['120901','120902','120903','120904','1209041','1209101'],missingComponents:[],sourceRoleOverrides:{'120904':'条件付き/別成分（即時攻撃と区別）'},summary:'通常・事前智剣連心のスキル/必殺・成立済み追撃、凍結付加・氷弱点への頒氷を分離して全E0採用Lvで確認。',evidence:'固定120901..904/1209101、hsrBatch1206To1210・hsrFinalStatAudit・hsrCharactersRound9とApp全Lv/CRCD算入済み/保存、代表実画面320px。',remaining:'Lv80/E0/敵1体/状態一定。智剣連心/秘技/凍結/追撃成立は明示済み状態。初回スキルの同撃付与・追撃確率の期待発生回数・必殺後のCRCD持続/次行動への自動更新は対象外。既算入フラグで最終値との二重加算を除外する。'});
Object.assign(e0CandidateAudit['1302'],{status:'confirmed',workClass:'済',majorSourceIds:['130201','130202','130203','130214'],requiredAttackIds:['130201','130202','130203','130214'],missingComponents:[],sourceRoleOverrides:{'130204':'支援/栄達による自己会心率（最終入力・直接ダメージなし）'},summary:'通常・スキル・90EP必殺・180EP全体＋6段の主要構成を全E0採用Lvで確認。180EPは事前栄達10層の安定状態。',evidence:'固定130201/202/203/214/1302103、hsrBatch3TingyunRobinArgenti・hsrCharactersRound9・App全Lv/HP50%境界/保存、代表実画面390px。',remaining:'Lv80/E0/敵1体/状態一定。栄達10層の会心率は最終入力。180EPで未飽和0～9層の段間CR更新と敵HP50%の途中通過は未認定。開始時HP条件のA6だけ自動適用し、90/180EPは別行動。全星魂・装備/支援の最終完成とは別。'});
Object.assign(e0CandidateAudit['1308'],{summary:'集真赤開始0～9層を明示し、0消去のAoEを省く10～13成分を全Lvで計算。雷心は攻撃前から3層が有効。',evidence:'固定130803とKQM、hsrAcheronRound9で全Lv×10状態×2条件、成分不足/改変/未入力拒否。App入力と保存・1440/390px確認。',remaining:'雷心初回付与/獲得順と0～2層での攻撃内バフ更新は未認定。集真赤未入力を9層に置き換えない。明示した事前3層以外の必殺全状態・E0全体認定は保留。'});
Object.assign(e0CandidateAudit['1401'],{summary:'強化スキルの最後撃参照解読0～42層とA2使用時点の層数を別々に指定。最後成分だけに天賦倍率、知恵人数で同量追加。',evidence:'固定140109/104/1401101とKQM、hsrHertaRound9で全Skill/Talent Lv×0～42層、App局所除外/共有1欄/保存・320px。',remaining:'攻撃中の解読付与/消費/リセットやA2判定順、初回必殺のATK付与順は未確定。指定した二つのスナップショットの計算であり、全入力組合せの戦闘内成立を保証しない。最終層が未入力なら強化だけ停止、A2未入力は当該DMG補正のみ除外。E0全体認定は保留。'});
// Round10: explicit stable-state composition checks; no initial grant or stochastic state simulation.
Object.assign(e0CandidateAudit['1206'] ||= {},{status:'confirmed',workClass:'済',majorSourceIds:['120601','120602','120603'],requiredAttackIds:['120601','120602','120603','1206021','1206031','1206022'],missingComponents:[],sourceRoleOverrides:{'120604':'支援/敵撃破後の速度（直接ダメージなし）'},summary:'通常・スキル・必殺・剣勢と、必殺後のスキル本体＋剣勢3回合計を全E0採用Lvで確認。追加成立数0～2と逐寇判定層を指定。',evidence:'固定120601/602/603/604・1206102、hsrCharactersRound10全Lvと成分合計、hsrToolInputsの状態/欠損局所除外/既算入/保存、変更箇所の実画面。',remaining:'Lv80/E0/敵1体の限定状態。スキル合計は事前撃破済み・必殺後・逐寇事前10層で飽和。単発剣勢はダメージ判定時点の有効層を指定。未撃破での発動確率期待値、逐寇未飽和時の同撃層獲得順、初回必殺ATK付与順、自動行動進行は未認定。'});
Object.assign(e0CandidateAudit['1312'] ||= {},{status:'confirmed',workClass:'済',majorSourceIds:['131201','131202','131203'],requiredAttackIds:['131201','131202','131203','1312032'],missingComponents:[],sourceRoleOverrides:{'131204':'支援/SP使用による必殺段数・EP（直接ダメージなし）'},summary:'通常・スキル・攻撃前から凍結した敵1体への必殺3～10段、成立後の凍結付加1回を分離して全E0採用Lvで確認。',evidence:'固定131201/202/203・1312103、hsrCharactersRound10・hsrBatch2SilverWolfMishaGuinaifen、Appの全Lv×3～10段/算入済み/保存、UIDモック取得再構成から計算。',remaining:'Lv80/E0/敵1体/非弱点/未撃破/状態一定。必殺は事前凍結と段数を明示し、一般の初回凍結成功率・途中付与によるCD更新・複数敵配分を含めない。敵ターン開始時の凍結付加は別行で即時必殺へ足さない。全星魂・全装備/支援の最終完成認定ではない。'});
// Round11: native support and direct attacks share an explicit, stable pre-existing-state contract.
Object.assign(e0CandidateAudit['1215'] ||= {},{status:'confirmed',workClass:'済',majorSourceIds:['121501','121502'],requiredAttackIds:['121501','121502'],missingComponents:[],sourceRoleOverrides:{'121503':'支援/指定受益者のATK・寒鴉速度を参照するSPD','121504':'支援/事前成立した懲悪DMG・直接攻撃なし'},summary:'通常・事前承負/懲悪/録事が成立したスキル、指定味方への必殺ATK/SPD支援を全E0採用Lvで確認。',evidence:'固定121501/502/503/504と1215101、hsrHanyaRound11とAppの全Lv/独立参照/グラモス閾値/既算入/解除/保存、UIDモック既存経路と変更箇所画面。',remaining:'Lv80/E0/敵1体/状態一定。通常は承負なし、スキルは対象の承負と本人の懲悪/録事が事前成立。必殺は受益者を指定した既発動支援で、編成SPDを発動時の値として明示する。初回付与順/SP回復/持続ターン更新と、必殺の自己対象選択可否・自己SPD支援の循環再評価は認定外。全星魂・全装備/支援の完成とは別。'});
// Round12: explicit per-phase record inputs complete the four-part single-target Ultimate snapshot.
Object.assign(e0CandidateAudit['1406'] ||= {},{status:'confirmed',workClass:'済',majorSourceIds:['140601','140602','140603','140604'],requiredAttackIds:['140601','140602','140603','140604'],missingComponents:[],summary:'通常・事前ATK30%が有効なスキル・参照時点別記録値を指定した必殺4成分・条件成立した追撃1回とA4/A6を全E0採用Lvで確認。',evidence:'固定140601/602/603/604・1406101/103、hsrSerinCipherRound12の全主要Lv/速度境界/既算入/4成分独立式、hsrToolInputsの条件入力/保存/UIDモック回帰と変更箇所画面。',remaining:'Lv80/E0/敵1体・状態一定の限定認定。スキルはATK30%が攻撃前から有効。必殺の25%/75%成分は各参照時点の非確定ダメージ記録値を別々に明示し、同じ値や自動更新を仮定しない。記録獲得/増加/クリア・初回ATK付与順・持続ターン・複数敵分配・追撃発生履歴/回数上限は未再現。全状態・全星魂・全装備/支援の完成認定ではない。'});
// Round13: damage-time Pawned Asset snapshot, rather than an inferred per-action grant order.
Object.assign(e0CandidateAudit['1314'],{status:'confirmed',workClass:'済',majorSourceIds:['131401','131402','131403','131404'],requiredAttackIds:['131401','1314021','131403','131404'],missingComponents:[],summary:'通常・本人以外への債権回収者SPD30/スキル付加・事前チャージ0～6の必殺・成立した天賦追撃と質草ATK/CD・必殺後追撃倍率を全E0採用Lvで確認。',evidence:'固定131401/402/403/404・1314103。hsrExtraRound12/hsrMajorAttackPromotions/hsrCompositeMainActions/hsrNativeRound7/hsrJadeGilgameshRound13の全Lv・層数・既算入独立式、hsrToolInputsの有効層明示/局所除外/重複入力防止/保存と変更箇所画面。',remaining:'Lv80/E0/敵1体/状態一定の限定認定。本人は債権回収者ではない。通常/必殺は既存の最終戦闘値、追撃はダメージ参照時点の質草0～50層を明示し、獲得5層を含める時点を自動推定しない。必殺は非量子弱点・未撃破・事前チャージ0～6で直後追撃なし。質草獲得/チャージ蓄積/リセット/持続更新、本人債権回収者、複数敵分配・行動履歴は認定外。全状態/全星魂/全装備支援の完成ではない。'});
Object.assign(e0CandidateAudit['1321'],{status:'missing',remaining:'直撃5段と追撃固有超撃破の同一イベント成分合算を追加。共に舞う者30～60%変換・未撃破超撃破許可・A6追加削靭/味方側の参照責務は未接続。',evidence:e0CandidateAudit['1321'].evidence+' 第13回hsrDahliaRound13で全天賦Lv・明示削靭・結界ON/OFF・同一敵成分合算を確認。',missingComponents:['共に舞う者変換・未撃破時超撃破・A6の残成分']});
Object.assign(e0CandidateAudit['1410'],{remaining:'本人4種の事前DoT最終非会心値×150%と指定0～8回の結界DoTを直接必殺へ合算。別所有者DoT・新規Talent付与/起爆と結界の同撃更新順・デバフ初回付与順は未対応。',evidence:e0CandidateAudit['1410'].evidence+' 第13回hsrSerinRound13で全必殺Lvと所有DoT別入力/二重補正防止/不足の局所除外を検証。'});
Object.assign(e0CandidateAudit['1509'],{remaining:'本人の雷連携成分と、別所有者セイバー1014の完成済み戦闘値を用いる風連携成分を個別計算。雷＋風の全体合算、興/必殺原ダメージ補正・攻撃回数更新の全構成が未完成。',evidence:e0CandidateAudit['1509'].evidence+' 第13回hsrJadeGilgameshRound13とAppでセイバーの独立参照/対象外所有者拒否/離脱/保存を確認。'});
// Round17: separate Basic/Additional scopes and verify the Shifu support route before certification.
Object.assign(e0CandidateAudit['1224'],{status:'confirmed',workClass:'済',majorSourceIds:['122401','122403','122408'],requiredAttackIds:['122401','122408','122403','1224011','1224081'],sourceRoleOverrides:{'122402':'支援/師匠SPDと通常・強化通常に伴う付加（スキル直撃ではない）','122404':'支援/強化状態・チャージ（天賦の直接攻撃なし）'},missingComponents:[],summary:'通常・強化通常3～8段・通常手番の必殺と攻撃型師匠付加の合計を確認。Basic限定補正は本体だけ、強化時天賦は本体/付加へ各1回。師匠SPDと破浪CD/BE支援を既存経路へ追加。',remaining:'Lv80/E0/敵1体/全成分非弱点・未撃破/状態一定。師匠の運命・属性と実現段数を指定。必殺はチャージ0～6の通常手番。支援は計算対象が師匠で発動済みの場合のみ、各最終値への既算入を除外。段数抽選の確率平均・途中撃破・段間の被ダメージ更新・行動後の状態進行・E1以上は認定外。',evidence:'固定SHA122401/402/403/404/408と1224103、固定Fribbels90bc840 March7thImaginaryのBasic/Additional独立タグ。hsrBatch5March全Lv/全師匠属性/命途/実現段数と成分別独立NC/C/EV、hsrMarchSupportRound17の全SkillLv/受益者基礎SPD/CD/BE、Golden4状態。hsrToolInputsで閾値境界/基礎値不足/算入済み/解除/保存、1440/390/320実画面。'});
// Round18: reuse stable-state criteria; do not require a rotation or first-application simulation.
Object.assign(e0CandidateAudit['1109'],{status:'confirmed',workClass:'済',majorSourceIds:['110901','110902','110909','110903','110904'],requiredAttackIds:['110901','110902','110909','110903','110904','1109021','1109012','1109022','1109092','1109032'],missingComponents:[],summary:'通常・スキル・強化スキル・必殺・天賦付加と燃焼DoTを確認。事前燃焼時の本体＋天賦付加1回を4行動で成分別合算。',evidence:'固定110901/902/909/903/904。既存hsrServalHookStatesの全E0曲線・ATK隔離と、hsrElementalCompositesRound18の曲線整合/代表独立NC/C/EV/合計、hsrToolInputsの既存条件入力・通常限定補正/天賦Lv不足局所除外。',remaining:'Lv80/E0/敵1体/非弱点/未撃破/状態一定。合計は攻撃前から燃焼中。新規燃焼付与の同撃順、途中撃破、複数敵分配、行動後DoTや他行動の合算は認定外。恒常ATK等は完成済み最終値。'});
Object.assign(e0CandidateAudit['1103'],{status:'confirmed',workClass:'済',majorSourceIds:['110301','110302','110303','110304'],requiredAttackIds:['110301','110302','110303','110304','1103021','1103012','1103022','1103032'],missingComponents:[],summary:'通常・スキル・必殺・天賦付加と感電DoTを確認。事前感電時の本体＋天賦付加1回を3行動で成分別合算。',evidence:'固定110301..304。既存hsrServalHookStatesの全E0曲線・ATK隔離と、hsrElementalCompositesRound18の曲線整合/代表独立NC/C/EV/合計、hsrToolInputsの感電状態入力・通常限定補正/天賦Lv不足局所除外。',remaining:'Lv80/E0/敵1体/非弱点/未撃破/状態一定。合計は攻撃前から感電中。新規感電付与の同撃順、途中状態変化、複数敵分配、感電DoTの即時合算・E1以上は認定外。'});
Object.assign(e0CandidateAudit['1218'],{status:'confirmed',workClass:'済',majorSourceIds:['121801','121802','121803','121804'],requiredAttackIds:['121801','1218011','121802','121803','1218041'],missingComponents:[],summary:'通常・スキル・必殺・焼尽DoTと事前領域補正を確認。通常は事前焼尽0～5層を新行で入力可能。元の5層専用行を維持。',evidence:'固定121801..804、既存hsrCompletionBasics/hsrBatch2の限定直撃/DoTとhsrNativeRound18の全Lv係数整合・代表Lv/層境界/独立NC/C/EV、hsrToolInputsの本番入力経路と不足局所除外。',remaining:'Lv80/E0/敵1体/状態一定。新通常0～5層、既存スキル/必殺/DoTは各行の事前5層・領域成立条件に限定。初回付与/命中確率・層蓄積/途中変化・他者DoT起爆・パーティ支援・E1以上は認定外。恒常変換は最終ATKへ算入済み。'});
Object.assign(e0CandidateAudit['1403'],{status:'confirmed',workClass:'済',majorSourceIds:['140301','140303','140304'],requiredAttackIds:['140301','140303','1403031','140304'],sourceRoleOverrides:{'140302':'味方耐性貫通支援（スキル直接ダメージなし）'},missingComponents:[],summary:'HP参照通常・必殺本体・追撃・結界付加を別イベントで確認。既存A2有効層/結界被ダメ/貫通にA4参照済み味方HP合計×9%を接続し、既算入時は除外。',evidence:'固定140301..304/1403101/102。hsrBatch5Tribbie既存全Lv/HP分離と、hsrTribbieRound18の独立NC/C/EV/結界OFF/入力不足/既算入、hsrToolInputsの新HP入力経路。固定Fribbels90bc840の手動alliesMaxHp×0.09と照合。',remaining:'Lv80/E0/敵1体/状態一定の各単発。A2は参照時点の有効層、A4は実際に参照した味方全体最大HP合計を明示し現在HPから逆算しない。初回必殺の結界/A4順、追撃後A2の新規層反映順・異イベントの自動合算・複数敵・E1以上は認定外。'});
// Round19: retain explicit pre-existing-state acceptance without requiring action-history simulation.
Object.assign(e0CandidateAudit['1307'],{status:'confirmed',workClass:'済',missingComponents:[],summary:'旧/強化の通常・スキル・必殺・アルカナ自然/起爆原始値を既存成分で確認。味方への開示とスキルDEF低下の未接続2成分を追加。',evidence:e0CandidateAudit['1307'].evidence+' 第19回hsrBlackSwanRound19で固定版の共通倍率・提供者/受益者・ON/OFF・味方NC/C/EV、hsrToolInputsで提供者Lvと対象外の版選択非依存/解除を照合。',remaining:'Lv80/E0/敵1体/状態一定の限定認定。スキルDEF低下は同Lvが事前成立。アルカナの参照時点層数と開示の有効状態を明示し、通常版開示は対象自身のターン中。A6EHR由来DMG/恒常値は最終入力。層獲得/リセット・初回付与/途中変化・複数敵・他者起爆率/所有DoTの合算・E1以上は認定外。味方への2デバフは同版で同係数のため受益者の版選択から提供者の版を推測しない。'});
Object.assign(e0CandidateAudit['1223'],{status:'confirmed',workClass:'済',majorSourceIds:['122301','122302','122303','122304'],requiredAttackIds:['122301','122302','1223021','122303','1223031','122304','1223041'],missingComponents:[],summary:'既存通常・初回スキル本体＋付加・獲物なし/事前9チャージの必殺合計・実現した追撃1回の主要構成を再利用。新規行は作成しない。',evidence:e0CandidateAudit['1223'].evidence+' 第19回は既存hsrBatch3XueyiMozeLuka/hsrBatch5Moze/hsrToolInputsの事前状態別成分・単独追撃の受入を再利用。',remaining:'Lv80/E0/非弱点・未撃破の敵1体/状態一定。スキルは新規獲物9チャージ後の初回付加、必殺は獲物なし又は事前獲物9チャージ。成立した天賦追撃は別行で算出。チャージ進行・3回目消費からの追撃追加・最後の獲物消滅順・複数敵/途中撃破/他行動との合算・E1以上は未認定。これらを自動進行させず、限定状態を一般の行動全体へ置換しない。'});
Object.assign(e0CandidateAudit['1009'],{status:'confirmed',workClass:'済',majorSourceIds:['100901','100902'],requiredAttackIds:['100901','100902','1009021','1009011'],sourceRoleOverrides:{'100903':'支援/必殺SPD（直接ダメージなし）','100904':'支援/蓄エネATK（直接ダメージなし）'},missingComponents:[],summary:'通常・5段スキル・成立済み火花DoT、事前蓄エネ5層のATK支援・炎DMGと発動済み必殺SPD支援を確認。既存登録を再利用。',evidence:e0CandidateAudit['1009'].evidence+' 第19回hsrNativeRound19で必殺SPD/提供者Lvとグラモス閾値・解除の独立値を検証。',remaining:'Lv80/E0/敵1体/攻撃中は状態一定。蓄エネは事前5層が有効でATK支援を最終値へ未算入の状態（算入済み指定時は再加算なし）。自然燃焼DoTは敵ターンで有効なATK等を明示。初回/途中の蓄エネ獲得・消費/ターン/EP、複数敵バウンド分配・燃焼の付与確率/他行動合算・E1以上は認定外。必殺SPDは指定発動済み状態だけ。'});
Object.assign(e0CandidateAudit['1004'],{workClass:'D',requiredAttackIds:['11004012','11004022','11004032'],summary:'強化版の通常/スキル/必殺を本体＋審判/天賦へ分割合算。事前無重力・懲戒10層の単体で追加成分回数1/5/2を接続。',evidence:e0CandidateAudit['1004'].evidence+' 第19回固定Fribbels90bc840 WeltB1の成分回数、hsrWeltRound19の全配列/代表独立NC/C/EV・内訳、hsrToolInputsの通常限定補正・不足局所除外。',remaining:'Lv80/E0強化版/非虚数弱点・未撃破の敵1体/事前無重力・懲戒10層のみ合計。通常とスキルの審判は1回、天賦は通常1/スキル5/必殺2回。裁決EHR変換は最終ATKに算入済み。強化前の行動合計・必殺天賦発生回数の版付き独立証拠、懲戒0～9層/初回減速付与・途中更新/複数敵の残構成は保留し、キャラ全体E0認定は増やさない。'});
// Round20: saturated or explicitly pre-existing conditions, with first-application states excluded.
Object.assign(e0CandidateAudit['1106'],{status:'confirmed',workClass:'済',majorSourceIds:['110601','110602','110603'],requiredAttackIds:['110601','110602','110603'],sourceRoleOverrides:{'110604':'支援/天賦EP回復（直接ダメージなし）'},missingComponents:[],summary:'通常・スキル・同Lv一般解が事前成立した必殺、痛撃のデバフ条件判定/事前殲滅の任意状態と味方へのDEF低下を既存経路で確認。',evidence:e0CandidateAudit['1106'].evidence+' 第20回は既存hsrPelaE0Completion/hsrPelaPriorSolution/hsrToolInputsの接続を再利用し、データやテストを複製しない。',remaining:'Lv80/E0/敵1体/状態一定。必殺は攻撃前から同Lv一般解が成立済み・痛撃解放状態。スキルで新たに得る殲滅は同撃に仮定せず、事前の次攻撃状態だけ任意指定。初回一般解/痛撃適用順・解除後の新規殲滅順、EP/ターン管理・秘技/複数敵/星魂1以上は認定外。味方用一般解は発動済みの提供者必殺Lvを参照。'});
Object.assign(e0CandidateAudit['1405'],{status:'confirmed',workClass:'済',majorSourceIds:['140501','140502','140503'],requiredAttackIds:['140501','140502','140503','1405011','1405021'],missingComponents:[],summary:'事前7弱点・本質暴露・撃破済みで直接3行と通常＋追加スキル/スキル2回の非再帰合計を既存成分で確認。',evidence:e0CandidateAudit['1405'].evidence+' 第20回は140504の毎命中弱点付与と飽和7状態を区別して限定受入。5/6弱点を状態一定として正式化しない。',remaining:'Lv80/E0/敵1体/撃破済み/事前7弱点・本質暴露/状態一定。A4は知恵1人CD140%又は2人以上DMG50%の該当一方だけを最終入力へ含める。0～6弱点は各命中で未所持弱点が付与され得るためA6/本質暴露の段間順と共に未認定。対象撃破時の再選択・複数敵/行動順/星魂1以上は対象外。'});
Object.assign(e0CandidateAudit['1006'],{status:'confirmed',workClass:'済',requiredAttackIds:['100601','100602','100603','1100601','1100602','1100603'],missingComponents:[],summary:'旧/強化の通常・スキル・必殺直撃と、事前成立の弱点/耐性低下/DEF低下/欠陥を本人・味方へ適用する主要構成を既存経路で確認。',evidence:e0CandidateAudit['1006'].evidence+' 第20回はhsrBatch2SilverWolfMishaGuinaifenと既存Appの本人/味方・版・Lv不足局所除外を再利用。',remaining:'Lv80/E0/敵1体/状態一定。弱点/耐性/DEF低下・欠陥と該当A6は計算時点で成立済みの状態を指定。初回付与や欠陥抽選・攻撃中の新規デバフ数更新・持続ターン/弱点選択・複数敵・E1以上は認定外。強化版EHR由来ATK/恒常値は最終入力へ含め、旧版の実行順根拠を新版へ無条件流用しない。'});
Object.assign(e0CandidateAudit['1210'],{status:'confirmed',workClass:'済',majorSourceIds:['121001','121002','121003'],requiredAttackIds:['121001','121002','121003','1210021','1210011','1210031','1210032'],missingComponents:[],summary:'通常・スキル・自然燃焼と、火喰い事前3層/本人スキル燃焼1種だけの必殺直撃＋燃焼起爆1回合計を確認。',evidence:e0CandidateAudit['1210'].evidence+' 第20回hsrGuinaifenRound20で独立Skill/Ult/Talent Lvの代表NC/C/EVと各成分合計、hsrToolInputsで表示/型別会心/入力不足局所除外・想定条件非保存上書きを確認。',remaining:'Lv80/E0/敵1体/非炎弱点・未撃破/状態一定。必殺合計は事前火喰い最大3層と自身スキル燃焼1種だけ、他者/撃破/通常由来の燃焼なし。火喰い初回獲得・1～2層の途中更新、他者Burnの所有者/参照値・全起爆合計・秘技4段・複数敵/E1以上は認定外。直撃/起爆/DoT単独行を合計へ重複加算しない。'});
// Round21: explicit pre-existing own-DoT / damage-time snapshots, not simulated first application.
Object.assign(e0CandidateAudit['1005'],{status:'confirmed',workClass:'済',majorSourceIds:['100501','100502','100503','100504','1100501','1100502','1100503','1100504'],requiredAttackIds:['100501','100502','100503','100504','1005031','1005021','1005032','1100501','1100502','1100503','1100504','11005031','11005021','11005032','11005041','1005029','1005039','11005029','11005039','11005049'],missingComponents:[],summary:'旧/強化版の通常・スキル・必殺・天賦追撃と本人感電を分離。本人の事前感電1種だけを起爆する直撃＋非会心起爆の単発合計を接続。',evidence:'固定100501..504/1100501..504、既存hsrGoldenScenariosの曲線/DoT/起爆/星魂除外とhsrKafkaRound21・hsrToolInputsの独立直撃/本人感電・別軌跡Lv・成分合計を使用。',remaining:'Lv80/E0/敵1体/状態一定。合計はカフカ自身の感電1種だけが事前成立し、他者/撃破DoTがない条件。ATK変換・恒常値は最終入力へ一度含める。初回感電付与/起爆順、他所有者DoTの自動取得/総起爆、強化版の支援更新順、隣接敵・秘技・E1以上は認定外。単独行を合計へ再加算しない。'});
Object.assign(e0CandidateAudit['1410'],{status:'confirmed',workClass:'済',majorSourceIds:['141001','141002','141003','141004'],requiredAttackIds:['141001','141002','141003','1410031','1410041','1410042','1410043','1410044','1410032'],missingComponents:[],summary:'通常・事前スキル弱体状態のスキル・必殺直撃・本人4種DoT・結界DoTと、既解決の本人DoT値4種×150%＋指定回数結界の必殺合計を既存経路で確認。',evidence:'固定141001..004/1410101..103、hsrSerinCipherRound12・hsrSerinRound13とhsrToolInputsの所有者固定・150%・6成分/合計・入力不足/共有入力・保存を再利用。',remaining:'Lv80/E0/敵1体/状態一定。本人4種DoTの各最終非会心1回値を明示（不在は0）、結界発生回数0～8を指定。起爆値へ補正を再適用しない。他所有者/撃破DoT、事前状態からの自動回数決定、初回天賦付与/領域発動順・状態更新・複数敵/E1以上は認定外。初回スキルの同撃デバフは仮定しない。'});
Object.assign(e0CandidateAudit['1401'],{status:'confirmed',workClass:'済',missingComponents:[],summary:'通常・通常スキル3段・強化スキル3段＋最後撃・必殺の主要4構成とA2/A4/A6を既存の明示スナップショットで確認。最後撃だけに解読天賦倍率を適用。',evidence:e0CandidateAudit['1401'].evidence+' 第21回はhsrHertaRound8/9とhsrToolInputsの既存独立検証・知恵人数/補正対象/最終値算入済み除外を再利用。',remaining:'Lv80/E0/敵1体/状態一定。強化スキルの最後撃参照解読0～42とA2使用時点の層数を独立指定し、必殺ATKは既有効状態/最終入力で明示。指定値間の自動状態遷移や全組合せの戦闘内成立、初回必殺ATK付与順、攻撃中の解読付与/消費/リセット、複数敵/E1以上は認定外。'});
// Round22: existing major attacks are accepted only for explicitly documented damage-time states.
Object.assign(e0CandidateAudit['1308'],{status:'confirmed',workClass:'済',missingComponents:[],summary:'通常・スキル・集真赤開始0～9層/雷心事前3層の必殺10～13成分と、虚無編成人数/A4耐性低下/A6を既存経路で確認。',evidence:e0CandidateAudit['1308'].evidence+' 第22回はhsrAcheronRound8/9の独立成分/合計、既存hsrToolInputsの層数入力/適用先/欠損/保存を再利用。',remaining:'Lv80/E0/敵1体。集真赤0～9と雷心事前3層を明示した想定状態のみ。雷心0～2の攻撃内獲得順・初回付与、自動ターゲット切替/複数敵分配、初回撃破やE1以上は認定外。未入力を最大状態へ置き換えない。'});
Object.assign(e0CandidateAudit['1315'],{status:'confirmed',workClass:'済',missingComponents:[],summary:'通常・必殺・強化通常ファニングと、事前ポケット0～3層の天賦撃破成分を既存の成分別経路で確認。九死の決闘の被ダメージ増加を本人通常成分と撃破成分へ適切に適用。',evidence:e0CandidateAudit['1315'].evidence+' 第22回はhsrBatch7Break・hsrBatch8BreakIsolation・hsrToolInputsの既存独立値/型別補正/条件入力/欠損/保存を再利用。',remaining:'Lv80/E0/敵1体・状態一定。通常/必殺は各行で明記した非決闘状態。ファニングは物理弱点敵が事前撃破済み・決闘成立・事前ポケット0～3層・最大靭性旧単位0超480以下の限定値。初回撃破/ヒット途中のポケット更新、撃破DoT/超撃破/外部付加の自動合算、複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1014'],{status:'confirmed',workClass:'済',requiredAttackIds:['101401','101402','101403','1014031','1014032','1014081'],missingComponents:[],summary:'通常・共鳴指定のスキル・敵1体への強化通常と、全体1段＋10バウンドの必殺合計を攻撃前の確定状態で確認。既存合計1014032を限定計算対応へ昇格。',evidence:e0CandidateAudit['1014'].evidence+' 第22回hsrNativeRound22で既存ID置換/代表独立値/敵数・星魂範囲拒否、既存Batch2とAppの補正状態/成分合計を再利用。',remaining:'Lv80/E0/敵1体・全11段が同一の攻撃前確定状態を参照。炉心共鳴・天賦DMG・共鳴獲得時CD・スキルCDは既有効状態だけ指定する。同じ行動で新規獲得する補正の同撃/段間順、EP/共鳴獲得・消費の自動更新、複数敵バウンド分配・E1以上は認定外。別成分行を必殺合計へ重複加算しない。'});
Object.assign(e0CandidateAudit['1408'],{status:'missing',workClass:'D',summary:'通常/スキル・強化通常・状態指定のカウンター/壊傷/変身終了成分を維持。第22回でスキル/強化通常の欠落していた隣接倍率と、通常/スキル/強化通常への既存A6 ATK層の接続を補完。',evidence:e0CandidateAudit['1408'].evidence+' hsrPhainonRound12の既存状態別検証と第22回hsrPhainonRound22の主/隣接・A6既算入/対象確認を再利用。',remaining:'140811の壊傷4層・Skill Lv7～9では固定版の成分和と記載最大倍率に不一致が残り推測しない。その他の既知Lv/層・終了攻撃は明示した最終状態で計算するが、変身/段間の層更新と複数敵への分担は未再現。重要な採用Lvの倍率根拠が解消するまでE0主要構成全体は未認定。',missingComponents:['140811壊傷4層・Skill Lv7～9の成分和/最大倍率の不一致（固定版の訂正/実行係数根拠待ち）']});
// Round23: same-action ordinary/Elation components keep independent formulas and owner inputs.
Object.assign(e0CandidateAudit['1505'],{status:'confirmed',workClass:'済',requiredAttackIds:['150501','150502','150503','150504','150520','1505041','1505042','1505043','1505022','1505032','1505044'],missingComponents:[],summary:'通常・S/U/Foxの通常成分、天賦の追加愉悦3成分、愉悦スキルを確認。S/U/Foxの同一行動は通常式＋本人CB愉悦式を分離して合算。',evidence:e0CandidateAudit['1505'].evidence+' 第23回hsrMixedBangerRound23とhsrToolInputsで独立NC/C/EV、行動/天賦別Lv、所有者・CB・固有12%・対象外補正・入力不足局所停止を検証。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。CBは各追加愉悦のダメージ時点を明示し、Uはmax(CB,480)。U/FoxはA4 12%が事前成立。CD由来愉悦/A2会心は最終入力で管理し、未検証のCD支援自動再変換は当該合計のみ停止。EP/CBの獲得消費・初回Fox付与順・複数敵/途中撃破/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1513'],{status:'confirmed',workClass:'済',requiredAttackIds:['151301','151302','151303','1513041','1513042','151320','151321','1513022','1513032'],missingComponents:[],summary:'通常・S/Uの直接＋天賦CB追加愉悦合計、熱気10通常版と次のアッハタイム強化版の既存構成を、他の愉悦キャラ編成/明示状態で確認。',evidence:e0CandidateAudit['1513'].evidence+' 第23回hsrMixedBangerRound23とhsrToolInputsでS/U別式の成分/合計、CB隔離・熱気0/他愉悦の制限を検証。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。S/U合計は他の愉悦キャラ編成・攻撃前熱気0、CBは追加成分のダメージ時点を指定。A2/A4愉悦度・A6会心と事前有効な必殺SPD換算は最終入力。151320/151321は各既存の発動済み・熱気/爆笑ネタを明示した単発範囲。単独愉悦A4の追撃扱い・熱気自動蓄積/10跨ぎ・途中更新・複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1509'],{status:'missing',workClass:'C1',summary:'既存の本人攻撃・所有者別連携を維持。王の争覇の基礎ATK/CDと受益者最大EP超過分を接続し、王が認めるの本人全攻撃への対象漏れ、王が背負うの必殺DMGを補完。',evidence:e0CandidateAudit['1509'].evidence+' 第23回hsrGilgameshRound23で受益者EP/提供者EP隔離・上限・最終値算入済み・離脱と本人攻撃の補正対象を検証。',remaining:'本人雷＋セイバー風の連携全体合算、連携後のセイバー次回必殺の本来倍率200%への接続が残る。興に応じたCDは完成済み最終CDで管理し、初回付与/履歴更新を自動再現しない。これらの主要不足を残した全体E0認定はしない。',missingComponents:['連携2所有者の同一イベント全体合算','連携後セイバー次回必殺の本来倍率200%の補正接続']});
Object.assign(e0CandidateAudit['1321'],{remaining:'事前撃破済み敵への直接5段＋追撃固有超撃破合算は既存の明示削靭入力で維持。共に舞う者30～60%変換・未撃破超撃破許可・追加削靭/味方側参照責務が未接続のため全体E0は保留。同じ行動順調査は反復しない。'});
// Round24: preserve independent owners and explicit pre-existing CB/Prey states.
for(const id of ['8009','8010'])Object.assign(e0CandidateAudit[id],{status:'confirmed',workClass:'済',majorSourceIds:[id+'01',id+'02',id+'04',id+'20'],requiredAttackIds:[id+'01',id+'02',id+'20',id+'041',id+'022'],missingComponents:[],summary:'通常・スキル直接/本人CB天賦追加と合計、敵1体への愉悦スキル8段＋最後撃を接続。既発動の指定対象必殺CD支援も本人/味方別に反映。',evidence:'固定SHAの'+id+'01/02/03/04/20と'+id+'101/102/103。既存hsrAttacksRound6、Round24 TrailblazerElation/Support/ToolInputsの独立値・所有者/CB文脈/補正隔離・対象外/入力不足局所停止。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。追加愉悦は攻撃前から本人がCBを持ち、ダメージ時点の本人CBが味方最大（同値可）。通常アッハの爆笑ネタと本人CBは別入力。A2のATK由来愉悦/A4会心は最終入力へ1回算入し、未算入ATK支援がある追加愉悦/合計だけ停止。必殺は非愉悦の別味方へ指定した既発動CD支援を限定受入。愉悦持ち対象への即時行動合算、A6の新規CB付与/EP・SP・褒美更新、複数敵・途中撃破・E1以上は認定外。'});
Object.assign(e0CandidateAudit['1509'],{status:'missing',workClass:'D',nonDamageSourceIds:['150904'],majorSourceIds:['150901','150902','150903','150905','150909'],requiredAttackIds:['150901','150902','150903','1509051','150905'],missingComponents:['固定版150909「気まぐれ」の参照値/独立攻撃か内部行かを示す根拠'],summary:'本人通常/スキル/必殺・固有支援に加え、連携の本人雷＋セイバー風を独立所有者の戦闘値で分割/合算。連携後のセイバー次回必殺1.2～2.0倍を既存独立乗算で接続。',evidence:e0CandidateAudit['1509'].evidence+' Round24 hsrGilgameshRound24とToolInputsで別所有者/属性耐性・成分/合計・保存/離脱、セイバー必殺限定の独立乗算を検証。',remaining:'Lv80/E0/敵1体・成立済み連携1回の状態一定。セイバーを編成し、その最終ATK/会心/風DMG/防御無視/耐性貫通と風耐性を独立入力。本人支援を完成済みセイバー値へ再加算しない。興のCDは本人最終CD、王が認める/王が背負う/次のセイバー必殺は事前有効状態を指定。攻撃8回の履歴・興/EP付与・途中補正更新・複数敵/E1以上は対象外。固定版150909「気まぐれ」はSingleAttack/係数配列のみで説明/参照値が空欄。通常の内部行と断定せず、別攻撃を無視したE0認定は保留する。'});
Object.assign(e0CandidateAudit['1504'],{summary:'通常に加え、事前餌食のスキル合計・成立済み天賦追撃を正式化。必殺直撃/強化天賦は別成分として追加。A4追撃DMG/暴食層とA6本人/味方CD/FUA CDを接続。',evidence:e0CandidateAudit['1504'].evidence+' Round24 hsrFudieRound24で固定曲線・独立値・暴食境界/本人味方/既算入を検証。',remaining:'事前餌食DEF低下を指定。追撃はダメージ時点の有効暴食0～12層を明示し獲得2層を自動加算しない。必殺の直接/強化天賦/暴食消費の同一行動全体合算と消費中の補正参照、撃破後の反復/ターゲット更新が残るためE0未認定。',missingComponents:['必殺本体/強化天賦/暴食消費の合計と消費時点の補正','撃破後の暴食/標的更新による反復状態']});
// Round25: bounded existing-state totals; resources and first application remain explicit.
Object.assign(e0CandidateAudit['1504'],{status:'confirmed',workClass:'済',majorSourceIds:['150401','150402','150403','150404'],requiredAttackIds:['150401','150402','150403','1504031','1504032','150404'],missingComponents:[],summary:'通常・事前餌食のスキル・天賦追撃と、必殺直撃＋無料強化天賦＋暴食消費0～3回の合計を接続。消費後の層補正を各成分へ渡す。',evidence:e0CandidateAudit['1504'].evidence+' Round25 hsrFudieRound25/ToolInputsで独立Ult/Talent Lv、2～12層・4層消費境界・各成分/合計・既算入拒否/保存を検証。固定150403/150404/1504101..103とFribbels固定90bc840 Ashveil.tsの消費ループを照合。',remaining:'Lv80/E0/未撃破の敵1体・全成分で敵が生存・事前餌食。必殺の最初の追撃が参照する有効暴食2～12層（A2必殺獲得2層を含む）を指定し、無料分はN、追加はN−4/N−8/N−12。無料はTalent Lv、消費追加はUlt Lv。FUA限定DMG/CDは共有の最終値へ含めず成分別に加算。敵撃破/標的更新・初回餌食/暴食獲得の同撃順、複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1317'],{status:'confirmed',workClass:'済',majorSourceIds:['131701','131702','131704','131718'],requiredAttackIds:['131701','131702','1317041','131718'],missingComponents:[],sourceRoleOverrides:{...e0CandidateAudit['1317'].sourceRoleOverrides,...Object.fromEntries(['131714','131715','131716','131717'].map(id=>[id,'支援/空の内部レコード（固定版の名前/説明/簡略説明・係数が全て空、独立ダメージ定義なし）']))},summary:'既存通常/スキル・天賦追加撃破に、強化通常3段の直接＋天賦撃破＋本人60%超撃破合計を接続。',evidence:e0CandidateAudit['1317'].evidence+' 固定131718/131704/131703/1317102/1317103とFribbels固定90bc840 Rappa.tsの超撃破基礎削靭25+2+chargeを照合。hsrRappaRound25/ToolInputsで独立3成分/合計・枯葉/効率の隔離・算入済み/条件解除を検証。',remaining:'Lv80/E0/敵1体。通常/スキルは既存の結印外・非虚数弱点/未撃破。強化通常は事前撃破済み虚数弱点・結印・枯葉事前成立2～10%・消費チャージ0～10。結印BEは必殺Lvに対応した最終BEに含め、効率50%は超撃破に1回。枯葉を敵入力へ含めた場合は直接成分から差し引く。途中撃破/新規チャージ更新・新規枯葉付与・他者超撃破/複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1501'],{status:'confirmed',workClass:'済',majorSourceIds:['150101','150103','150104','150108','150110','150120'],requiredAttackIds:['150101','150103','1501041','1501042','150108','150120','1501082','1501032'],missingComponents:[],sourceRoleOverrides:{'150102':'支援/状態変化（配信開始・強化通常化とトラップ発動。独立した直撃なし）','150109':'支援/倍率変更（150108へのSkill Lv別倍率増加。独立した直撃なし）'},summary:'通常・Skill Lv別トラップ倍率を足す強化通常・愉悦参照ATK必殺・本人CB追加2種・21段愉悦スキルと強化通常/必殺の混合合計を接続。',evidence:'固定150101/150102/150103/150104/150108/150109/150110/150120、1501101..103。150108/150110は名前・属性・種類・効果・全係数・最大Lv・アイコンが一致し、1501001は150108をLv加算対象とするため同係数参照として1回計上。hsrSparxieRound25/ToolInputsで独立Normal/Skill/Talent/Ult Lv・直接/CB/アッハ・各成分合計・対象外/局所停止を検証。',remaining:'Lv80/E0/未撃破の敵1体・ダメージ参照時点の状態一定。強化通常は実現トラップ1～20回、追加愉悦は本人CB1～10000を指定。通常アッハの爆笑ネタは本人CBと別入力。A2のATK→愉悦とA6の爆笑ネタ→CDは各行の最終入力に1回含め、未算入ATK支援のある愉悦/必殺だけ停止。資源獲得/消費・ギフト確率・初回付与順/途中補正更新・味方A6全対応・複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1213'],{remaining:e0CandidateAudit['1213'].remaining+' 第25回は選定のみ。固定版は強化通常の合計倍率まで、固定Fribbels ImbibitorLunae.tsも累積補正の集約入力でヒット比率/同撃順の根拠なし。各段の係数配分と累積開始段の版対応資料を得た時に再着手。'});
// Round26: independently completed actor snapshots; no automatic inheritance or resource timeline.
Object.assign(e0CandidateAudit['1402'],{status:'confirmed',workClass:'済',majorSourceIds:['140201','140208','140204','1140201'],requiredAttackIds:['140201','140208','140204','1140201','1402012'],missingComponents:[],sourceRoleOverrides:{'140202':'支援/召喚・回復（スキルの直接ダメージなし）','140203':'支援/至高の姿・速度・行動順（必殺の直接ダメージなし）','1140203':'支援/ラフトラ速度層（単独ダメージなし）','1140205':'支援/召喚時初期値（単独ダメージなし）','1140206':'支援/精霊退場・状態解除（単独ダメージなし）'},summary:'本人通常/天賦・ラフトラ精霊スキルと、事前の糸の通常2成分/強化通常3成分合計を別所有者の最終値で接続。',evidence:'固定140201/140208/140204/1140201、1402101..103とE0 tree1402001/1402301。固定Fribbels90bc840 Aglaea.ts actionDefinitionは強化通常の本人/精霊と本人天賦1回。hsrAglaeaRound26/ToolInputsで非対称所有者・独立Normal/Talent/MemSkill Lv・合計・欠損/変更/保存を独立検証。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。N/強化N/精霊SkillはLv1～6、天賦Lv1～10。合計は事前の隙を縫う糸、強化合計は至高の姿成立。本人/ラフトラの最終ATK/会心/雷DMGと各自DEF無視/RES貫通を分離し、A2の本人SPD×7.2＋ラフトラSPD×3.6のATK上昇は双方の最終値へ1回含める。未算入SPD支援/段間補正更新は局所停止。糸の初回付与/保持速度層の自動更新・精霊への装備/攻撃種別専用補正の一般継承・途中撃破/複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1512'],{status:'confirmed',workClass:'済',majorSourceIds:['151201','1151201'],requiredAttackIds:['151201','1151201'],missingComponents:[],sourceRoleOverrides:{'151202':'支援/精霊召喚・回復とムード（直接ダメージなし）','151203':'支援/指定味方の行動順・EP・スペシャルゲスト（直接ダメージなし）','151204':'支援/精霊初期値・ムード・フィーバー領域DEF無視（直接ダメージなし）','1151203':'支援/フィーバーDMG・精霊数別の敵被ダメージ（精霊ダメージは1151201）','1151205':'支援/召喚時EP回復（直接ダメージなし）','1151206':'支援/退場時の行動順（直接ダメージなし）'},summary:'既存本人HP通常と、独立HP/会心/風DMGの精霊フィーバースキルを固定版主要構成として受入。新規攻撃を重複登録しない。',evidence:'固定151201..204/1151201/1151203/1151205/1151206、trees1512101..103/1512301/1512302。既存hsrCalcEngine Songbird全6Lvの独立式、hsrModifierRuntimeの精霊数/天賦曲線、hsrToolInputsの独立精霊入力・条件/保存/不足局所除外とhsrGoldenScenariosの本人HP参照を再利用。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。本人通常はフィーバー外の最終HP/会心/風DMG。精霊はフィーバー中・3体・ムード1～50・精霊Skill/Talent Lv1～6、本体Talent Lv1～10。精霊の完成済み最終HP/会心/風DMGを別入力し、固有フィーバーDMG・DEF無視・敵被DMGは既存計算で各1回。A6 CR50%/事前有効A2のCD等は最終値。A2味方ATK/CD支援全分岐の自動算出・初回付与/ムード獲得消費/召喚退場・一般継承/複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1506'],{status:'missing',workClass:'C2',summary:'通常/スキルCB追加、CB変換上限状態に加え、CBなしATK分岐とエッグ3箱の低スコア固定状態、強化通常外の剣箱記録確定を接続。',missingComponents:['剣箱を含むSkill11の記録確定と本体の合成責務','ビーン等を含む低スコアの攻撃内更新・混在SSS'],remaining:'Lv80/E0・未撃破の敵1体・状態一定。1506084は事前無敵・スコア60以上、CB0を明示したATK通常式/CBあり愉悦式と、実現したエッグ3箱。全段非致死/未撃破とCB/スコア/最終値の途中変化なしを明示確認する。元の150608は上限240/有効なE0昇格中360・非剣3箱を維持。1506101はSkill11実行外の剣箱記録確定20%だけ。Skill11中の剣箱合算、ビーン/他所有者反応による更新、途中撃破/死亡/再開は未対応のため全体E0未認定。',evidence:e0CandidateAudit['1506'].evidence+' 第56/57回は固定4.7 StarRailRes03907e7の150601/602/603/604/608/629、TBGDdad9155 SilverWolf999 Ability blob9f31c3bf/Config blob8c17f923を照合。hsrSilverwolf999Round56/57とToolInputsで全採用Lv、CB有無・スコア60/120境界、所有者/既算入/解除/保存と記録入力を独立検証。'});
// Round27: source-verified self-CB and independent recorded-healing / spirit snapshots.
Object.assign(e0CandidateAudit['1502'],{status:'confirmed',workClass:'済',majorSourceIds:['150201','150204','150220'],requiredAttackIds:['150201','1502041','1502012','150220','150221'],missingComponents:[],sourceRoleOverrides:{'150202':'支援/結界と爆笑ネタ獲得（即時直接攻撃なし）','150203':'支援/固定20追加アッハ・全属性耐性貫通（本人愉悦攻撃は150221）','150204':'条件付き/別成分（即時攻撃と区別）'},summary:'本人通常・本人CBによる大吉1回と通常合計、既存初回アッハ・必殺固定20追加アッハ6段を限定接続。',evidence:'固定150201/150202/150203/150204/150220、trees1502001(max6)/1502004/1502420(max10)、1502101..103。hsrYaoguangRound27とToolInputsで独立Normal/Talent Lv・通常/愉悦の分離・固定20・CB欠損の局所停止を検証。',remaining:'Lv80/E0/未撃破の敵1体・本人攻撃者/提供者・状態一定。通常Lv1～6、Talent/Elation Lv1～10。大吉は本人の事前CB1～10000、通常後1回。結界/速度由来愉悦度とA4 CD60%は本人の最終値、成立済み必殺のRES貫通10～20%は敵条件へ各1回含める。未算入SPD補正/段間更新は当該愉悦と合計を停止。通常アッハは既存初回のみ、必殺追加は固定20で手動爆笑ネタを無視。他所有者の大吉/同撃SP消費追加・愉悦度maxの一般継承・資源更新・複数敵/E1以上とパーティ支援全分岐は認定外。'});
Object.assign(e0CandidateAudit['1409'],{status:'confirmed',workClass:'済',majorSourceIds:['140901','1140901'],requiredAttackIds:['140901','1140901'],missingComponents:[],sourceRoleOverrides:{'140902':'支援/精霊召喚・治癒（直接ダメージなし）','140903':'支援/精霊召喚・治癒・雨上がりHP（直接ダメージなし）','140904':'支援/精霊初期HP・治癒後DMG層（精霊攻撃は1140901）','1140903':'支援/自己HP消費・治癒と精霊スキル自動発動条件','1140905':'支援/召喚時EP（直接ダメージなし）','1140906':'支援/退場時行動順（直接ダメージなし）'},summary:'既存本人HP通常と、明示した累計治癒記録を使うイカルン精霊スキルを独立所有者の最終会心/風DMGで限定接続。',evidence:'固定140901..904/1140901/1140903/1140905/1140906、trees1409101..103/1409301(max6)。hsrHyacineRound27/ToolInputsで記録×10～20%・独立会心/DMG・欠損/0・本人編集の非継承・保存復元を検証。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。本人Normal/精霊Skill Lv1～6。攻撃直前の累計治癒量0～1e12とイカルンの完成済み最終会心/風DMG・DEF無視/RES貫通を別入力する。上限1e12は入力検証用。微笑む暗雲CR100%、有効な天賦DMG層40～80%×最大3層と外部支援は各自の最終値へ1回。本人最終HPには雨上がり/凪いだ暴風など成立済みHP効果を含める。治癒量の蓄積/50%消去や召喚/行動順の自動追跡・精霊への一般継承・複数敵/E1以上と治癒/味方HP支援全分岐は認定外。'});
Object.assign(e0CandidateAudit['1415'],{status:'missing',workClass:'C2',summary:'既存本人HP通常/強化通常/領域確定を維持し、精霊の独立HP基本1回と追憶由来追加0～3回の合計を接続。',requiredAttackIds:['141501','141508','1415021','1141501','1141526','11415012'],missingComponents:['世負い1141521など対象別の祝福・他所有者追加成分'],evidence:e0CandidateAudit['1415'].evidence+' 固定1141501/1141526とtree1415301(max6)、hsrCyreneRound27/ToolInputsで精霊HP・基本/追加・合計・0/未入力・保存を独立検証。',remaining:'Lv80/E0/未撃破の敵1体・他精霊なし・状態一定の舞曲。精霊Skill Lv1～6、異なる他味方の追憶獲得0～3名を明示。最終精霊HP/会心/氷DMG/DEF無視/RES貫通を本人と分離し、必殺CR/天賦DMG/A6 SPD由来貫通も一度含める。特殊祝福・他精霊/異なる提供者の獲得イベント・行動順更新は未接続。単独精霊行と合計を重複加算しない。params[1]=12をヒット数へ推測変換せず、全体E0未認定。'});
// Round28: pre-state direct attacks and per-owner completed snapshots reuse the existing formulas.
Object.assign(e0CandidateAudit['1413'],{status:'confirmed',workClass:'済',majorSourceIds:['141301','141303','1141301','1141307'],requiredAttackIds:['141301','141303','1141301','1141307'],missingComponents:[],sourceRoleOverrides:{'141302':'支援/HP消費・精霊召喚とCD/憶質（直接ダメージなし）','141309':'支援/141302の状態表示（独立した直接攻撃なし）','141304':'支援/精霊初期値・CD・憶質・行動順（直接ダメージなし）','1141303':'支援/精霊在場中の双方DMG（直接ダメージなし）','1141305':'支援/召喚時行動順（直接ダメージなし）','1141306':'支援/退場後SPD（直接ダメージなし）'},summary:'本人HP通常、長夜の独立HP必殺、憶質0～16の精霊スキル基礎/追加倍率、憶質16の終結技を既存通常式へ限定接続。',evidence:'固定141301..304/141309/1141301/1141303/1141305/1141306/1141307、trees1413001/1413003/1413301/1413101..103。hsrEvernightRound28とToolInputsで独立HP/会心/DMG・基礎と憶質追加・必殺/終結・未入力局所停止/保存を確認。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。N1～6、U1～10、精霊Skill1～6。長夜の完成済み最終HP/CR/CD/氷DMG・DEF無視/RES貫通を独立入力。天賦CD/精霊在場DMG・常時CR35%・有効Skill/編成人数CD等は各最終値へ一度含める。必殺は至暗の謎が事前成立しDMG/敵被DMGも各入力済み。精霊スキルは明示憶質0～16、終結は16だけ。16は検証範囲で一般の上限と断定しない。初回必殺の付与順・資源獲得/消費・自動ターゲット/退場後SPD・一般継承・攻撃種類専用補正の未確認継承・複数敵/E1以上は対象外。'});
Object.assign(e0CandidateAudit['1407'],{status:'confirmed',workClass:'済',majorSourceIds:['140701','140702','140709','1140701','1140702','1140706','1140712'],requiredAttackIds:['140701','140702','140709','1140701','1140702','1140706','1140712','11407022'],missingComponents:[],sourceRoleOverrides:{'140703':'支援/死竜召喚・境界RES低下（直接攻撃なし）','140704':'支援/新蕾とHP損失時の双方DMG層（直接攻撃なし）','1140703':'支援/HP負担（直接ダメージなし）','1140705':'支援/召喚時の味方DMG（直接ダメージなし）','1140710':'支援/1140702の反復段階表示（同名・簡略説明、係数はHP閾値だけ）','1140711':'支援/1140702の反復段階表示（同名・簡略説明、係数はHP閾値だけ）'},summary:'既存本人通常/Skill・死竜基本/退場に、息吹3段階・HP25%閾値合計・本人/死竜の連携Skillを接続し所有者別最終値で限定受入。',evidence:'固定140701..704/140709/1140701/1140702/1140706/1140710/1140711/1140712、trees1407002(max10)/1407301/1407302(max6)/1407101..103。hsrCastoriceRound28/ToolInputsで本人HPと死竜会心を分離、段階曲線・25/26境界と6段合計・連携2者と独立Lv・不足/保存を検証。',remaining:'Lv80/E0/未撃破の敵1体・状態一定。N1～6、Skill/連携1～10、精霊Skill/Talent1～6。HPはキャストリス本人、死竜のCR/CD/量子DMG・DEF無視/RES貫通は別入力。連携は天賦DMG事前3層で飽和。精霊は天賦DMGと1407103の今回息吹+30%を含む攻撃時点の有効DMG層を最終値へ一度含める。境界RES低下も敵入力へ一度含める。息吹段階0～2、合計は明示した開始時死竜HP割合0超～100%で25%以下のみ同時天賦6段を加算する。1140710/11には別ダメージ倍率がなく1140702に3段階の係数が明記されるため重複攻撃を作らない。初回HP消費での天賦獲得順・反復回数/新蕾/行動順・精霊一般継承・複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1415'],{evidence:e0CandidateAudit['1415'].evidence+' 第28回は1141502一般祝福を姫子/ゼーレの登録攻撃へ限定接続し、hsrCyreneSupportRound28/ToolInputsで提供者のMemSkill1～6・ON/OFF・既算入除外/離脱を検証。',remaining:e0CandidateAudit['1415'].remaining+' 一般祝福は姫子/ゼーレのみ20～40%の任意支援を追加。対象別特殊祝福と他対象/精霊への一般適用は未対応のまま。'});
// Round29: final owner snapshots, not a general inheritance model or battle simulator.
for(const id of ['8007','8008']){
 const female=id==='8008',memo=female?'1800801':'1800701',help=female?'1800807':'1800707';
 Object.assign(e0CandidateAudit[id],{status:'confirmed',workClass:'済',majorSourceIds:female?[id+'01',id+'03',id+'08']:[id+'01',id+'03',id+'08','1800701','1800707'],requiredAttackIds:[id+'01',id+'03',id+'08',memo,help],missingComponents:[],sourceRoleOverrides:{[id+'02']:'支援/精霊召喚・回復・チャージ（直接ダメージなし）',[id+'04']:'支援/精霊HP・チャージ（直接ダメージなし）','1800703':'支援/精霊在場中の味方CD（直接ダメージなし）','1800705':'支援/初回チャージ（直接ダメージなし）','1800706':'支援/退場後行動順（直接ダメージなし）'},summary:'本人通常に加え、独立ミュリオンの必殺・精霊5段、2所有者連携通常、指定味方への応援確定1回と在場CD支援を接続。',evidence:'固定JP/EN800703/803/708/808、共有1800701/703/707、8007/8のtree通常6・精霊6・U10、A6。hsrRound29Owners/hsrToolInputsで別ATK/会心・成分合計・CD支援・確定値・未入力局所停止・保存を検証。女性カタログに共有精霊が列挙されないがrequiredAttackIdsで独立した精霊/応援行も必須とする。',remaining:'Lv80/E0・未撃破の敵1体・全段で状態一定。本人N/連携1～6、U1～10、精霊Skill/Talent1～6。ミュリオンの最終ATK/CR/CD/氷DMG/DEF無視/RES貫通は独立入力し、在場CDや装備/支援を一度含める。連携は叙事詩1層以上・精霊在場、精霊スキルはチャージ100%未満。応援は事前成立した指定味方の確定分を除く補正後ダメージ1回、最大EP100～200の10刻みに限定。一般継承/必殺専用補正継承・初回付与/チャージ/叙事詩の更新・途中死亡・複数敵・男女同時支援/複数提供者・E1以上は認定外。'});
}
Object.assign(e0CandidateAudit['1508'],{status:'confirmed',workClass:'済',majorSourceIds:['150801','150802','150803','150805','150809'],requiredAttackIds:['150801','150802','150803','150805','150809'],missingComponents:[],sourceRoleOverrides:{'150804':'支援/宝石・CD・強化スキル切替（直接ダメージなし）'},summary:'既存通常/スキルに必殺主対象、追加0～33回指定の強化スキル、凛/アーチャー別ATK連携追撃と天賦CD/事前U被DMG支援を接続。',evidence:'固定150803/804/805/809とtrees1508001..4/1508101..3。hsrRinRound29/hsrRound29Owners/hsrToolInputsで主対象係数・追加回数・別所有者・合計・提供者解除・保存を独立検証。',remaining:'Lv80/E0・未撃破の敵1体が全段で存命・補正一定。通常1～6、Skill/U/Talent1～10。強化スキルは実行する追加回数0～33を明示し、初撃とは別倍率項。連携はLv80/E0アーチャーを編成した成立済み1回（偽・螺旋剣後、SP3以下または回路接続中5回・連携未消費）。2者の完成済み最終ATK/CR/CD/量子DMG/防御無視/貫通へA2・天賦CDを一度含める。Uの被DMGは事前成立分だけ適用。SP/宝石消費回復・発動回数/初回U付与順・途中死亡・複数敵配分・一般継承・E1以上は対象外。'});
Object.assign(e0CandidateAudit['1415'],{evidence:e0CandidateAudit['1415'].evidence+' 第29回は1141520サフェルDMG18～36%・1141515トリビーDEF無視6～12%だけを対象攻撃IDへ限定し検証。',remaining:e0CandidateAudit['1415'].remaining+' 特殊祝福はサフェルDMGとトリビーDEF無視の成分だけ追加。サフェルの対象別DEF低下・トリビーの結界追加1回等が残るため全体未認定。'});
// Round30: one enhanced Dragon event, with explicit per-component effective values.
Object.assign(e0CandidateAudit['1414'],{status:'confirmed',workClass:'済',majorSourceIds:['141401','141403'],requiredAttackIds:['141401','141403','1414039'],missingComponents:[],sourceRoleOverrides:{'141402':'支援/同袍指定・バリア（直接ダメージなし）','141404':'支援/龍霊召喚・バリア（直接ダメージなし）'},summary:'既存本人通常/必殺に、本人を同袍に指定した強化龍霊の物理・同袍付加・A6付加の同一行動3成分を接続。',evidence:'固定141403.params[1]/[7]、tree1414103.params[0][0]と1414003(max10)、141402の自己を除外しない指定対象。hsrDanHengTerraeRound30/ToolInputsで物理/付加の別有効値・参照ATK同一・A6固定40%・3成分合計・不足局所停止・保存を独立検証。',remaining:'Lv80/E0・未撃破の敵1体・同袍=本人・必殺による強化が事前成立した龍霊1行動・全段で状態一定。本人N1～6/U1～10、龍霊倍率はU1～10、A6は固定40%。ATK参照は画面の本人の完成済み最終ATK。物理攻撃と同袍付加それぞれに有効な最終CR/CD/物理DMG/DEF無視/RES貫通を明示し、継承元や一般の付与順を推測しない。偉観ATK/装備/支援も一度算入済み。必殺直撃と後続龍霊を別イベントで表示し、同じ合計へ足さない。他の同袍/属性/継承、強化回数・行動順・バリア更新、複数敵/E1以上は認定外。'});
Object.assign(e0CandidateAudit['1510'],{status:'missing',workClass:'D',requiredAttackIds:['151001','151003','151008','151009','151022'],missingComponents:['原動力2/3のパルス追加弾数・A6倍率の演算・必殺技全構成の整合'],summary:'本人通常・ラストアタック3段・原動力1だけの基礎パルス・本人使用の支援1+4段を既存ATK式へ接続。',evidence:e0CandidateAudit['1510'].evidence+' 固定151003.params[5]/[6]・151009・151022.params[3..5]とtrees1510001/3/4。hsrHimekoDepartureRound30/ToolInputsで合算倍率・原動力不足/3の局所停止・保存、Himeko Skill/Talent支援を検証。',remaining:'Lv80/E0・敵1体・状態一定。通常1～6、U/Talent1～10。151003は最後撃3段120～240%だけで、最大合計381～762%ではない。151022は本人使用の100～200%＋4×18～32%だけ。パルスは明示した原動力1のAoE10～20%だけ。原動力2/3の追加弾とA6倍率・最大合計との関係を固定実行定義/独立実測で照合できる時に再着手。味方別追加効果、裁決/殲滅の全分岐・支援ダメージへのSkill専用補正分類は保留。行動全体の自動進行を完成条件に追加しない。'});
e0CandidateAudit['1503'] ||= {evidence:'既存150301/150310の本人DEF範囲を維持。'};
Object.assign(e0CandidateAudit['1503'],{status:'missing',workClass:'D',missingComponents:['150303の深層学習先の別所有者愉悦成分・150320各味方の次回攻撃成分'],summary:'既存本人通常/非愉悦強化を維持し、150308の本人CB由来の氷愉悦10～15%だけを独立計算へ接続。',evidence:e0CandidateAudit['1503'].evidence+' 固定150308.params[0..5][4]・1503001(max6)/150304のCB上限50。hsrPearlRound30/ToolInputsで独立愉悦式、本人CB1/40/51・不足局所停止・保存を検証。',remaining:'Lv80/E0・未撃破の敵1体・通常1～6・本人の事前CB1～50・完成済み最終愉悦/会心。A2 DEF変換を一度含め、未算入DEF支援がある当該成分は停止。150303は自分以外の指定キャラを参照するので本人値を代用せず、150308全体の合計は未対応。150320はtree1503420の上限10で、全味方の所有者/対応属性/参照値を個別接続できる根拠が得られた時に再着手。'});
Object.assign(e0CandidateAudit['1415'],{evidence:e0CandidateAudit['1415'].evidence+' 第30回は1141514のアグライア本人DMG/DEF無視、1141522のセイレンスDMGだけを既存Modifierで追加。',remaining:e0CandidateAudit['1415'].remaining+' ラフトラ対応分/速度層由来ATKは独立最終値へ一度含める。海洋の祝福固有の通常/Skill後起爆、他所有者成分は未接続のまま。'});
// Round31: exact Pearl + Yaoguang pair; each damage owner keeps an independent final snapshot.
Object.assign(e0CandidateAudit['1503'],{
 status:'confirmed',workClass:'済',majorSourceIds:['150301','150303','150308','150310','150320'],
 requiredAttackIds:['150301','150310','1503080','1503081','150308','150320','1503201'],missingComponents:[],
 summary:'本人DEF直接攻撃・本人CB追加愉悦・別所有者の底本氷付加と、150320の本人/爻光の次回攻撃付加を限定接続。',
 evidence:e0CandidateAudit['1503'].evidence+' 第31回は固定150303/150308/150320とtrees1503001/1503003/1503420、Fribbels固定90bc840のPearl.tsによる資源/所有者分離。hsrPearlRound31/ToolInputsでN/U代表両端・150320 Lv1/6/10・0/27資源・非対称所有者・3/4成分合計・解除/不足局所停止・保存を独立検証。150320 Lv6は固定版11.25%を採用。',
 remaining:'Lv80/E0・未撃破の敵1体・全成分で状態一定。新しい別所有者/次回付加はパール＋爻光のみの2人編成に限定。通常1～6/U1～10/愉悦1～10、深層学習チャージが残り、本人CB1～50を持つ想定。底本の愉悦/CR/CD/上笑/防御無視/属性別貫通は独立最終入力、A2 DEF変換や爻光SPD由来愉悦/装備支援も一度算入。パール側の有効な爆笑ネタを底本氷付加/次回付加ごとに指定し、次回付加0/1のみ同一攻撃へ加算。別所有者不足時は合計を停止し、本人直接/CB単独行は維持。他編成/底本/人数、初回獲得順・チャージ/CB/HP/行動順更新、複数敵/E1以上・一般継承は認定外。既存非愉悦底本の本人DEF行は従来範囲を維持。'
});
Object.assign(e0CandidateAudit['1415'],{evidence:e0CandidateAudit['1415'].evidence+' 第31回は1141523軍功所持者CD15～30%（姫子/ゼーレ）と1141516で誘発された140411だけのCD100～200%を追加。hsrCyreneRound31/ToolInputsでMemSkill Lv1～6、両提供者/明示受益者、対象ID、既算入/OFF/解除/保存を検証。',remaining:e0CandidateAudit['1415'].remaining+' 軍功支援はキュレネ＋ケリュドラ編成と明示した所持者に限定。モーディスは血の報復中に祝福で誘発された神を殺め神となる1回のみ。他の特殊祝福/他所有者成分が残るためE0未認定を維持。'});
// Round32 extends support-triggered components without certifying unresolved major structures.
Object.assign(e0CandidateAudit['1415'],{
 missingComponents:['特殊祝福の未接続成分（結界追加/他所有者DoT起爆/精霊・バリア参照など）'],
 evidence:e0CandidateAudit['1415'].evidence+' 第32回は1141518の真知ATK30～60%/SkillDMG20～40%をアナイクスへ限定接続。1141521のカスライナCR8～16%と本人ATK5～10%×5の炎付加、1141522の通常後30～60%/Skill後40～80%の本人4種DoT起爆を追加。hsrCyreneRound32/OceanRound32/PhainonRound32/ToolInputsで独立値・所有者・source Lv・状態/解除・最終算入・保存を確認。',
 remaining:e0CandidateAudit['1415'].remaining+' 第32回追加範囲はLv80/E0/未撃破の敵1体・祝福事前成立・状態一定。起爆は本人4種自然DoTの補正済み1回分だけで、他所有者・撃破/領域DoT・新規付与後の連鎖は未合算。世負い炎付加は変身中の本人・炎最終DMG/敵炎RESを指定し、超過火種CDは最終CDへ含める。真知は既存7弱点/撃破済みのアナイクス本人攻撃だけ。+3ヒット、他知恵受益者、結界追加1回、その他精霊/バリア参照の特殊成分が残るため未認定を維持。'
});
// Round33 closes a bounded E0 contract; the three unresolved Ruin4 combinations remain rejected.
Object.assign(e0CandidateAudit['1408'],{
 status:'confirmed',workClass:'済',majorSourceIds:['140801','140802','140803','140808','140809','140811'],requiredAttackIds:['140801','140802','140803','140808','140809','140811'],missingComponents:[],
 sourceRoleOverrides:{'140804':'支援/火種・味方対象時の会心DMG（独立した攻撃ではない）','140805':'支援/変身・ATK/HP・状態更新（攻撃は140808/809/811と140803へ分離）'},
 summary:'通常/スキル・強化通常・状態指定カウンター/壊傷/通常変身終了の主要攻撃を、実装済みのLv/層だけへ閉じた限定E0構成として確認。',
 evidence:e0CandidateAudit['1408'].evidence+' 第33回は既存hsrPhainonRound12の全Lv×層の独立値と4層Lv7～9拒否を維持し、条件文・画面・入力警告を同じ許容範囲へ整合。hsrToolInputsで6主要行のLv上限・拒否3組の局所停止・1～3層の復帰/保存を検証。係数不一致を解決した認定ではなく、以前の広すぎた条件表示を実装と一致させた範囲受入。',
 remaining:'Lv80/E0・敵1体・攻撃中の状態一定。Normal/強化Normal Lv1～6、Skill/Counter/通常終了Last/Talent Lv1～10。140811は壊傷1～3層×Skill Lv1～10、4層×Lv1～6・10だけを採用し、4層×Lv7～9は依然根拠待ちで計算対象外。カウンター熾炎1～99と消費壊傷を事前指定。最終ATK/HP/CR/CD/物理DMGは選択した状態の値を使い、火種由来CD・装備/支援と既存A2/形態/A6の算入済みを一度管理。140803は最後の追加ターンで通常終了するLastだけ。HP0強制終了の残ターン減衰、変身/段間の層更新、複数敵配分、E1以上は認定外。キュレネ由来の炎付加は外部祝福の別成分であり本人E0の必須攻撃へ数えない。'
});
Object.assign(e0CandidateAudit['1415'],{evidence:e0CandidateAudit['1415'].evidence+' 第33回は理性の追加3段・基本込み8段・非再帰Skill16段/通常+8段と、門と道の基本結界1回+追加1回を既存通常式/合算へ接続。',missingComponents:['特殊祝福の未接続成分（他所有者DoT起爆/精霊・バリア参照/他受益者など）'],remaining:'Lv80/E0・敵1体・事前成立の状態一定。本人/精霊の最終値を分離し、各祝福の算入済みを一度管理する。理性の+3段は真知とは別の1ターン状態入力、8段は基本5段を含む。アナイクスは7弱点/本質暴露・事前撃破済みに限定。門と道の2回比較は追撃前A2=3層で飽和・未撃破の敵1体・全成分の最終HP/会心/補正一定に限定し、追撃本体と合算しない。海洋はセイレンス本人4種自然DoTの補正済み1回分だけ、世負い炎付加は変身した本人と独立炎DMG/敵炎RESを使う。一般祝福の他受益者、他所有者/撃破/領域DoT・新規連鎖、その他精霊/バリア参照・未接続の対象別特殊成分が残るため全体未認定。資源/行動順/段間更新、複数敵、一般継承は自動生成しない。'});
// Round34 expands owner snapshots without treating incomplete special blessings as a full E0 kit.
Object.assign(e0CandidateAudit['1415'],{
 evidence:e0CandidateAudit['1415'].evidence+' 第34回は海洋の別所有者DoT（カフカ/サンポ/ルカ/桂乃芬）を補正済み非会心1回分で分離合算。創世のデミウルゴス独立HP/CRを開拓者・記憶本人/ミュリオンへ個別算入。大地は本人同袍の指定バリア耐久由来付加1回。hsrCyreneOceanRound34/GenesisRound34/EarthRound34/ToolInputsで独立値・所有者・ON/OFF・不足/解除・既算入・保存を確認。',
 missingComponents:['特殊祝福の残成分（歳月/生と死/他同袍・受益者/未対応DoT種/その他対象別補正）'],
 remaining:'Lv80/E0・敵1体・事前成立・状態一定。従来の本人/精霊と特殊祝福の限定範囲を維持する。海洋は本人4種と編成中E0カフカ感電/サンポ風化/ルカ裂創/桂乃芬燃焼を各1回。各所有者の補正済み非会心1回分へ起爆率だけを適用し、ブラックスワンのアーカナ・撃破/装備DoT・領域追加発生・新規付与/段間更新は合算しない。創世はデミウルゴス最大HP/CRを明示し、開拓者男女/ミュリオンのATK/CRを個別算入済み除外。強化通常後の精霊追加ターンを自動連結せず、既存の精霊単発行で比較する。大地は本人同袍の物理付加1回だけ、バリア生成/150%強化/消費/3攻撃全体や他同袍を自動生成しない。祝福の本人DMGは完成済み最終値へ含める。生と死の超過新蕾による死竜天賦倍率・歳月の長夜固有補正・未接続受益者/対象別特殊補正等が残るため全体未認定。門と道のA2未飽和、一般継承/複数敵/E1以上は従来どおり対象外。'
});
// Round35 accepts the native kit plus the explicitly verified recipient snapshots, not all party support coverage.
Object.assign(e0CandidateAudit['1415'],{
 status:'confirmed',workClass:'済',majorSourceIds:['141501','141508','141502','1141501','1141526'],requiredAttackIds:['141501','141508','1415021','1141501','1141526','11415012'],missingComponents:[],
 sourceRoleOverrides:{'141503':'召喚/状態・精霊召喚/追加ターン/通常強化/会心/結界（直接攻撃ではない）','141514':'支援/精霊追加ターン（直接攻撃ではない）','1141503':'支援/在場HP/状態同期（直接攻撃ではない）','1141502':'支援/対象別祝福（実装した受益者と明示した状態だけを受入）','141504':'支援/味方DMG・追憶資源（最終DMGへ算入し資源を事前指定）','1141505':'支援/召喚時の味方行動制限解除（直接ダメージなし）','1141515':'支援/別所有者トリビーのDEF無視・結界追加（Round29/33で独立計算）','1141521':'支援/別所有者ファイノンのCR・炎付加（Round32で独立計算）','1141522':'支援/別所有者セイレンスのDMG・DoT起爆（Round32/34で独立計算）','1141525':'支援/別所有者龍霊のバリア由来付加（Round34で独立計算）'},
 summary:'本人HP通常/強化通常、結界の確定1回、独立HP精霊の基本/追憶追加/合計と、検証済み受益者の祝福スナップショットを限定E0確認。',
 evidence:e0CandidateAudit['1415'].evidence+' 第35回で1141517の召喚時敵2体以下・超過新蕾0～100%による死竜6段倍率、1141524の1141307限定DMGと発動時点CD参照の精霊CD差分、1141520のお得意様別DEF低下を接続。固定1141503/141504は完成済みHP/DMGへ一度算入。hsrCyreneCastoriceRound35/EvernightRound35/CipherRound35/ToolInputsで独立値・所有者・ON/OFF・合計/局所停止・算入済み・保存を確認。既存Round27～34の本人/精霊/祝福の受入を維持。',
 remaining:'Lv80/E0・敵1体・事前状態一定。本人N/強化N1～6・Skill/Talent1～10、精霊Skill/Talent1～6。本人とデミウルゴスのHP/会心/氷DMG/防御・耐性補正を分離し、在場1141503のHP、141504の味方DMG、U会心/A6氷貫通等を適用先最終値へ一度含める。Demi基本+追憶合計は他精霊なし・異なる味方の追憶獲得0～3名のみ。結界は明示した元ダメージ1回に対する確定1回。各祝福は別々の既存受益者/事前状態スナップショットで比較し、同一戦闘の全行動合計ではない。生と死は召喚時敵2体以下・超過整数0～100の本人HP参照死竜6段だけ。歳月DMGは1141307だけ、CD差分はLongの3行だけ・過去のSkill発動時点の長夜月CDを明示し、憶質+1は更新後の事前値へ含める。詭術DEFはサフェル本人計算の対象状態0/1。未入力は当該結果のみ停止。一般祝福1141502の姫子/ゼーレ以外や他精霊、理性の他知恵受益者、軍功の未接続受益者、他同袍/属性、アーカナ/撃破/装備DoTなどは支援対応範囲外であり全効果完成ではない。召喚時敵3体以上の生と死、門と道A2未飽和、複数提供者、一般継承/資源・段間更新/複数敵/E1以上は対象外。追加ターン/召喚/行動順は自動生成せず、別イベントを無条件合算しない。'
});
// Round36 connects only the self-owned, already-broken Normal conversion; the full kit remains incomplete.
Object.assign(e0CandidateAudit['1321'],{
 summary:e0CandidateAudit['1321'].summary+' 本人通常の直接＋共に舞う者超撃破の限定合計1321012を追加。',
 evidence:e0CandidateAudit['1321'].evidence+' 固定132104.desc/params[0..9][4]の本人が共に舞う者となる条件と30～60%を使用。hsrDahliaRound36/ToolInputsで通常Lvと天賦Lvの分離、独立成分/合計、効率ON/OFF、未入力局所停止・保存を確認。',
 remaining:'本人通常の30～60%変換のみ、事前撃破済みの炎弱点敵1体・Lv80/E0・明示した効率補正前削靭で追加。未撃破時の実削靭責務、味方所有の変換、追撃100～200%と30～60%の重複/適用順、A6追加削靭が残るため全体E0は保留。',
 missingComponents:['未撃破時/味方所有の共に舞う者変換・追撃への重複/順序・A6追加削靭']
});
// Round37: the versioned original-kit guide resolves Talent counts for a pre-slowed target.
Object.assign(e0CandidateAudit['1004'],{
 status:'confirmed',workClass:'済',majorSourceIds:['100401','100402','100403','100404','1100401','1100402','1100403','1100404'],
 requiredAttackIds:['1004012','1004022','1004032','11004012','11004022','11004032'],missingComponents:[],
 summary:'原版の通常/スキル/必殺へ事前減速時の天賦1/3/2回を合算し、既存強化版の事前無重力/懲戒10層の主要構成と合わせて限定確認。',
 evidence:e0CandidateAudit['1004'].evidence+' 第37回KQM Welt v1.5（2023-12-03公開）の事前減速・スキル各bounce3回/必殺2回・禁錮はダメージ後・A2はダメージ前を、固定100401/2/3/4の原版係数と照合。hsrWeltRound37/ToolInputsで独立NC/C/EV、成分回数、攻撃種別別補正、原版/強化版の分離、A2自動適用/敵入力算入済み、状態OFF・保存を確認。',
 remaining:'Lv80/E0・非虚数弱点/未撃破の敵1体・全成分中に状態変化なし。原版は攻撃前から減速/禁錮が成立した通常1～6/スキル・必殺・天賦1～10。原版UはA2被DMG12%をダメージ前に1回適用し、敵入力へ算入済みなら再加算しない。強化版は従来どおり事前無重力・懲戒10層、審判はN/S各1回、天賦N/S/U各1/5/2回、EHR由来ATKは最終入力に一度含める。新規減速の成功/同撃判定、未減速開始スキル、懲戒0～9層の途中更新、途中撃破/死亡・複数敵・E1以上は認定外。原版Uの当該禁錮を事前減速へ置換しない。'
});
// Round39 resolves the pulse branch, while the remaining assist modes still prevent certification.
Object.assign(e0CandidateAudit['1510'],{
 missingComponents:['151025/151026 同行協定：裁決/殲滅の本人支援・固有補正の計算接続'],
 summary:'通常・ビーム・最後撃・本人通常支援に加え、原動力1～3の単一パルスを同版の実弾数とA6係数加算で計算。',
 evidence:e0CandidateAudit['1510'].evidence+' 第39回は同版4.6.0 Dimbreath6b2bc17 HimekoNova Ability blob88054e5c/Config blob285e9b9fのSkill21 Entry/B1/B2/B3を固定151009/1510103と照合。旧原動力2/3の2/3弾、A6の追加弾倍率+30ポイント、追加弾後の基本全体成分をhsrHimekoDepartureRound39/ToolInputsで独立検証。',
 remaining:'Lv80/E0・A6解放済み・敵1体・全成分で最終値/敵状態一定。通常1～6、U/Talent1～10。151009は入力した事前原動力1の基本パルス、2の追加2弾、3のA6付き追加3弾を含む1回比較。151003は最後撃3段、151008はビーム1回、151022は本人使用の通常支援1+4段。151003最大381～762%はA6なしの6ビーム+3回の原動力3パルス+最後撃の整合値で、単独パルスへ流用しない。裁決151025/殲滅151026の本人支援・固有補正、他使用者、途中撃破/死亡・複数敵/E1以上は未認定。必殺中の資源/全行動順の自動進行は完成要件に追加しない。'
});
// Round38: same-release execution data supplies the missing hit splits and intrinsic update order.
Object.assign(e0CandidateAudit['1213'],{
 status:'confirmed',workClass:'済',majorSourceIds:['121301','121308','121310','121312','121303'],requiredAttackIds:['121301','121308','121310','121312','121303'],missingComponents:[],
 sourceRoleOverrides:{'121302':'支援/通常強化・叱咤CD累積（直接ダメージなし）','121304':'支援/亢心DMG累積（直接ダメージなし）','121309':'支援/強化キャンセル（直接ダメージなし）'},
 summary:'固定4.6.0の実行JSONの各段比率と更新順に基づき、通常/3種強化通常/必殺の主対象全段を事前亢心・叱咤0層から計算。',
 evidence:'StarRailRes dbe8 info.json=4.6.0とJP121301/308/310/312/303/302/304。同版Dimbreath6b2bc17のDanHengIL Ability blob93414e77/Config blob90edd34eでHitSplitRatio・パラメータ参照・命中後亢心/4段目以降命中前叱咤を確認。hsrImbibitorLunaeRound38/ToolInputsで独立NC/C/EV・全段/合計・通常専用補正・状態/所有者/係数不整合拒否・保存を検証。',
 remaining:'Lv80/E0・非虚数弱点/未撃破の敵1体・攻撃開始時の亢心/叱咤0層を明示した5比較行。本体N1～6/U1～10・Skill/Talent1～10、全段で敵が存命・外部補正一定。初期0は行の想定であり未入力状態を推定したものではない。入力最終DMG/CDは事前の亢心/叱咤加算を含まない。この条件内では全段の自動累積を含む。初期非0、虚数弱点へのA6、隣接敵の別イベント、複数敵、途中撃破/死亡・資源更新・ターン全体・E1以上は認定外。'
});
// Round40: the selected native accord and its owner-specific self-assist complete the bounded E0 kit.
Object.assign(e0CandidateAudit['1510'],{
 status:'confirmed',workClass:'済',majorSourceIds:['151001','151003','151008','151009','151022'],requiredAttackIds:['151001','151003','151008','151009','151022'],missingComponents:[],
 sourceRoleOverrides:{'151002':'支援/導く旗印DMG','151004':'支援/使用前の天賦CD・耐性貫通','151014':'既存151003の最後撃3段へ統合（独立イベントなし）','151025':'支援/裁決の本人DMG・U補正と151022の本人支援','151026':'支援/殲滅の味方CD・SkillCD補正と151022の本人支援'},
 summary:'通常・ビーム・原動力1～3/A6パルス・最後撃と、裁決/殲滅を指定した本人支援1+4段を既存Modifier/成分式で確認。',
 evidence:'固定dbe8の151001/2/3/4/8/9/22/25/26と1510103。同版4.6.0 Dimbreath6b2bc17 HimekoNova Ability blob88054e5c/Config blob285e9b9fでSkill51/52/53本人分、AstralExpress協定切替、OnBeforeSkillUseの天賦、SpecialBattleAreaのAssistAsBpSkillを照合。Round30/39/40とToolInputsで独立NC/C/EV、4補正・対象外・提供者離脱・既算入・保存を確認。',
 remaining:'Lv80/E0・A6解放済み・境界展開中・敵1体・全成分で最終値/敵状態一定。N1～6、U/Talent/Skill1～10。本人の通常/ビーム1回/明示した原動力1～3の単一パルス/最後撃3段/本人支援1+4段。裁決/殲滅は開拓仲間の支援によって事前成立したいずれか1つを指定する。天賦のCD/耐性貫通は今回の本人支援前に自動適用し既算入を除く。殲滅は独立した受益者の本人攻撃へ提供者天賦Lvで適用、精霊の最終値へ一般継承しない。他使用者の支援係数・新規協定付与/チャージ/発動回数の自動更新・途中撃破/死亡・複数敵/E1以上は認定外。Uの全行動合計やローテーションを完成要件へ追加しない。'
});
// Rounds41/42/43 extend the separate other-user snapshot scope without changing the original E0 gate.
Object.assign(e0CandidateAudit['1510'],{
 evidence:e0CandidateAudit['1510'].evidence+' 第41回は同版SupportFakeSkillのHimeko宛TurnInsertAction/他使用者係数[0..2]とGameCoreConstValue blobde233536のグループを照合。hsrHimekoDepartureRound41/ToolInputsで丹恒・三月なのか・ブローニャの使用、姫子の独立値、ダメージ前協定・既算入/離脱/不足/保存を検証。 第42回は同版Field_Insert_Phase02.OnStart[0]の味方へのSkill52Fake/53Fake/51Fake付与を確認し、サンデー/ヴェルト/停雲を同じ151022へ追加。Round41検証とToolInputsのRound42ケースで独立値/事前協定維持/解除/既算入/保存を確認。 第43回は同版グループへ明示された1213/1224のSkill52Fake/53Fake付与から姫子宛挿入/ダメージ前協定まで照合し、飲月の裁決/巡狩なのかの殲滅を既存成分へ接続。Round43代表ケースで独立2成分/所有者隔離/既算入/局所停止/解除/保存を確認。他使用者拡張は8人で一区切りとし、新たな明確な発生経路/協定根拠がある場合のみ再開。',
 remaining:e0CandidateAudit['1510'].remaining.replace('他使用者の支援係数・','追加の別範囲として、丹恒1002/三月なのか1001/ブローニャ1101/サンデー1313/ヴェルト1004/停雲1202/丹恒・飲月1213/巡狩三月なのか1224が使用する1+3段を、編成中の姫子のLv80/E0独立最終値/天賦1～10で比較可能。使用者本人の最終値へ置換しない。その他の他使用者の支援係数・')
});
// Round55 applies the existing single-enemy, stable-state E0 gate to the 4.7 cohort.
e0CandidateAudit['1511']={
 status:'confirmed',workClass:'済',
 majorSourceIds:['151101','151102','151103','151120'],
 requiredAttackIds:['151101','151102','1511021','1511022','151103','151120','1511202'],
 sourceRoleOverrides:{
  '151104':'支援/願力の獲得・基本枠/超過枠と味方CD（独立ダメージなし）',
  '151129':'支援/愉悦の万象の本人CR・DEF無視と味方昇格（独立ヒットなし）',
  '151131':'支援/負債HP占有操作（ダメージ/MaxHP変更と分離して検証）'
 },
 missingComponents:[],
 summary:'通常・スキル本人追撃/使令付加/同一スキル合計・必殺6段・愉悦本体/記録確定合計の7行を独立検証。負債は別のHP内訳として単一HP非致死と明示した実HPイベントを検証。',
 evidence:'固定4.7 StarRailRes03907e7の151101/102/103/104/120/129/131・1511101..103と、TBGDdad9155 Nihilux Ability blob51c961d/Config blob5152ec9。hsrAhaRound52/53・hsrAhaDebtRound53/54/HealingRound54/PhaseRound54・hsrAscensionRound52・ToolInputsで全採用Lv、所有者/既算入/状態解除/保存を検証。第55回は層減少180000/回復65000の中間演算を一次定義から再照合。hsrCompletionTrackerで7行必須と天賦CD全Lvの味方NC/C/EV・ON/OFF・既算入/提供者離脱を独立検証。',
 remaining:'Lv80/E0・主要追加能力解放済み・未撃破の敵1体・全ヒット非致死・最終値/敵/補正状態一定。通常1～6、他1～10。本人と使令対象の独立した最終値、願力8～18、参照時点の褒美/爽快ネタ、事前の確定以外の記録を明示する。負債は既知の事前比率から別計算し、通常ダメージ/記録に合算しない。複数HP層・回復・段階退避/復元の実HPイベントは独立した追加範囲。致死/死亡回避/HPロック、共有先切替、上限を越える内部回復、途中撃破、複数敵、資源/行動順/段階の自動更新、未対応の他キャラ昇格成分・E1以上は認定外。全4.7機能・全装備/支援の完成認定ではない。'
};
for(const [id,audit]of Object.entries(e0CandidateAudit)){if(audit.status==='confirmed'){confirmedE0[id]=audit.summary+' 証拠: '+audit.evidence+' 範囲外: '+audit.remaining;confirmedMajorIds[id]=audit.majorSourceIds;}}
const knownGaps={
 '1220':'スキル+雷狩は限定対応。必殺技の分岐と途中撃破/成分間変化が不足。',
 '1314':'本人非債権回収者・明示した参照時点の質草0～50層。獲得5層/チャージ更新・本人債権回収者・複数敵分配は認定外。',
 '1224':'強化通常は支援系師匠限定。攻撃型師匠の属性別付加成分と通常攻撃の正式検証が不足。',
 '1503':'150308/150320は未登録。複数参照者の愉悦成分・参照時点が保留。通常/非愉悦強化のみ対応。',
 '1406':'140603の記録値更新・参照時点は保留。再調査しない。',
 '1212':'ATK/HP版を別IDで受入。変換後ATK・恒常値は最終入力、現在状態だけ補正する。',
 '1304':'必殺技の動揺の同撃適用時点が未確定。追加攻撃は敵1体以外の分配を別途確認。',
 '1305':'スキル/必殺技と後続追撃は別行動。E2付加成分等は今回のE0範囲外。',
 '1407':'精霊1140702の段階別全成分・所有者/参照値が不足。',
 '1512':'精霊1151201は精霊自身の最終HP・フィーバー限定。全精霊行動や他軌跡/星魂の完成ではない。',
 '1513':'愉悦は敵1体・各リソース/安定条件の限定対応。複数敵や途中撃破は未対応。',
 '1218':'通常は事前焼尽0～5層、既存スキル/必殺/DoTは各行の5層/領域成立条件。初回付与・途中更新・他者起爆は認定外。',
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
async function fixed(file,version=null){const response=await fetch((version===version47?version47Base:sourceBase)+file);if(!response.ok)throw Error(`${file}: HTTP ${response.status}`);return response.json();}
function sourceVersion(record){return record?.sourceVersion||null;}
function assertVersionedSource(record,label,expectedVersion){
 if(sourceVersion(record)!==expectedVersion||record?.sourceCommit!==version47Sha)throw Error(`${label}: sourceVersion/sourceCommit mismatch`);
}
const batchWorkReview={A:new Set(),B:new Set(['1112','1205','1015','1201']),D:new Set(['1218','1209','1204','1005','1004','1207','1109','1106','1103','1009','1503','1406','1212','1215','1206','1006','1312','1210','1014','1302','1214'])};
function remainingWorkClass(d){
 if(d.confirmed)return {group:'済',confidence:'E0限定条件を検証済み',reason:'星魂/装備/支援の最終完成とは別'};
 if(d.audit?.workClass && ['A','B','C','C1','C2','D'].includes(d.audit.workClass))return {group:d.audit.workClass,confidence:d.audit.workClass==='D'?'具体的な保留理由あり':'一次分類済み・詳細受入/工数は未確定',reason:d.audit.remaining};
 if(batchWorkReview.A.has(d.c.id))return {group:'A',confidence:'重点監査済み',reason:'既存攻撃の全Lv独立検証と非ダメージ行動の分類整理'};
 if(batchWorkReview.B.has(d.c.id))return {group:'B',confidence:'重点監査済み',reason:'既存式による少数の倍率/段数/成分/補正/入力境界の修正'};
 if(batchWorkReview.D.has(d.c.id))return {group:'D',confidence:'具体的な保留理由あり',reason:d.audit?.remaining||knownGaps[d.c.id]||'初回付与/段間更新/参照値の証拠不足。新証拠待ち'};
 if(d.absent.length||d.hasMissingComponent||d.attacks.some(a=>['elation','trueDamage','memospriteSkill','memospriteTalent'].includes(a.type)||['componentSequence','normalAndBreak'].includes(a.damageFormula)))return {group:'C',confidence:'構造からの暫定見積・個別工数不明',reason:'成分/独立参照の追加接続候補。未登録IDが別攻撃か既存状態の説明か要精査。新しい式が必須とは断定しない'};
 return {group:'D',confidence:'全構成の仕様精査未了',reason:'限定値の登録だけでは全主要構成の確証不足。未調査をゼロ工数や独立検証のみと見なさない'};
}
function instructionForecast(){const measured=Object.values(e0CandidateAudit).filter(a=>a.status!=='confirmed'&&a.workClass==='C1').length;return [['楽観',2],['標準',1],['悲観',0.5]].map(([scenario,capacity])=>({scenario,capacity,planned:Math.ceil(measured/capacity)}));}
const batchRun={start:"99d09fc",audited:12,confirmed:1,promoted:4,added:3,independentlyChecked:12,holds:11,phase:"第8回・工程C完了"};
async function generate(){
 const [{data,engine},characters,skills,trees,ranks,characters47,skills47,trees47,ranks47,lightCones47,lightConeRanks47]=await Promise.all([loadProductionFixture(),fixed('characters.json'),fixed('character_skills.json'),fixed('character_skill_trees.json'),fixed('character_ranks.json'),fixed('characters.json',version47),fixed('character_skills.json',version47),fixed('character_skill_trees.json',version47),fixed('character_ranks.json',version47),fixed('light_cones.json',version47),fixed('light_cone_ranks.json',version47)]);
 const baselineCharacters=data.characters.filter(c=>!sourceVersion(c));
 const versionedCharacters=data.characters.filter(c=>sourceVersion(c)===version47);
 const unsupportedCharacterVersions=data.characters.filter(c=>sourceVersion(c)&&sourceVersion(c)!==version47);
 if(unsupportedCharacterVersions.length)throw Error('未対応のカタログcharacter sourceVersion '+unsupportedCharacterVersions.map(c=>c.id).join(','));
 if(baselineCharacters.length!==Object.keys(characters).length)throw Error('旧固定母集団とカタログ基準レコード数が不一致');
 if(data.characters.length!==baselineCharacters.length+versionedCharacters.length)throw Error('catalog character version split mismatch');
 const baselineSkills=data.characters.flatMap(c=>c.skills).filter(s=>!sourceVersion(s));
 const versionedSkills=data.characters.flatMap(c=>c.skills).filter(s=>sourceVersion(s)===version47);
 const unsupportedSkills=data.characters.flatMap(c=>c.skills).filter(s=>sourceVersion(s)&&sourceVersion(s)!==version47);
 if(unsupportedSkills.length)throw Error('未対応のカタログskill sourceVersion '+unsupportedSkills.map(s=>s.id).join(','));
 let matchedSkills=0,matchedRanks=0,matchedVersion47Skills=0,matchedVersion47Traces=0,matchedVersion47LightCones=0;
 for(const c of baselineCharacters){if(!characters[c.id])throw Error('固定キャラなし '+c.id);for(const s of c.skills){if(sourceVersion(s))continue;const f=skills[s.id];if(!f||JSON.stringify(f.params)!==JSON.stringify(s.params)||f.desc!==s.description)throw Error('固定スキル差分 '+s.id);matchedSkills++;}for(const e of c.eidolons){const r=ranks[e.id];if(!r||r.desc!==e.description||JSON.stringify(r.level_up_skills||[])!==JSON.stringify(e.levelUpSkills||[]))throw Error('固定星魂差分 '+e.id);matchedRanks++;}}
 for(const c of data.characters.filter(c=>!sourceVersion(c))){
  const oldCharacter=characters[c.id],newCharacter=characters47[c.id];if(!newCharacter)throw Error('4.7 fixed character missing '+c.id);
  const oldSkillIds=oldCharacter.skills||[],currentSkillIds=newCharacter.skills||[];
  if(oldSkillIds.some(id=>!currentSkillIds.includes(id)))throw Error('4.7 source removed a baseline skill '+c.id);
  const expectedAddedIds=currentSkillIds.filter(id=>!oldSkillIds.includes(id)).sort();
  const markedAddedIds=c.skills.filter(s=>sourceVersion(s)===version47).map(s=>s.id).sort();
  if(JSON.stringify(expectedAddedIds)!==JSON.stringify(markedAddedIds))throw Error('4.7 skill additions/sourceVersion markers differ '+c.id);
  for(const s of c.skills.filter(s=>sourceVersion(s)===version47)){
   assertVersionedSource(s,`skill ${s.id}`,version47);
   const f=skills47[s.id];if(!f||JSON.stringify(f.params)!==JSON.stringify(s.params)||f.desc!==s.description)throw Error('4.7 fixed skill mismatch '+s.id);
   matchedVersion47Skills++;
  }
 }
 for(const c of versionedCharacters){
  assertVersionedSource(c,`character ${c.id}`,version47);
  const f=characters47[c.id];if(!f||f.name!==c.name||f.path!==c.path||f.element!==c.element||f.rarity!==c.rarity||f.max_sp!==c.maxEnergy)throw Error('4.7 fixed character mismatch '+c.id);
  if(JSON.stringify((f.skills||[]).slice().sort())!==JSON.stringify(c.skills.map(s=>s.id).sort())||JSON.stringify((f.skill_trees||[]).slice().sort())!==JSON.stringify((c.traces||[]).map(t=>t.id).sort())||JSON.stringify((f.ranks||[]).slice().sort())!==JSON.stringify((c.eidolons||[]).map(e=>e.id).sort()))throw Error('4.7 fixed character record ID inventory mismatch '+c.id);
  for(const s of c.skills){assertVersionedSource(s,`skill ${s.id}`,version47);const sf=skills47[s.id];if(!sf||JSON.stringify(sf.params)!==JSON.stringify(s.params)||sf.desc!==s.description)throw Error('4.7 fixed skill mismatch '+s.id);matchedVersion47Skills++;}
  for(const t of c.traces||[]){const tf=trees47[t.id];const properties=(tf?.levels||[]).map(x=>x.properties||[]);if(!tf||tf.name!==t.name||tf.desc!==t.description||tf.max_level!==t.maxLevel||JSON.stringify(tf.params||[])!==JSON.stringify(t.params||[])||JSON.stringify(properties)!==JSON.stringify((t.levels||[]).map(x=>x.properties||[])))throw Error('4.7 fixed trace mismatch '+t.id);matchedVersion47Traces++;}
  for(const e of c.eidolons||[]){const r=ranks47[e.id];if(!r||r.rank!==e.rank||r.desc!==e.description||JSON.stringify(r.level_up_skills||[])!==JSON.stringify(e.levelUpSkills||[]))throw Error('4.7 fixed eidolon mismatch '+e.id);}
 }
 const versionedLightCones=(data.lightCones||[]).filter(l=>sourceVersion(l)===version47);
 const unsupportedLightConeVersions=(data.lightCones||[]).filter(l=>sourceVersion(l)&&sourceVersion(l)!==version47);
 if(unsupportedLightConeVersions.length)throw Error('未対応の光円錐 sourceVersion '+unsupportedLightConeVersions.map(l=>l.id).join(','));
 for(const l of versionedLightCones){assertVersionedSource(l,`light cone ${l.id}`,version47);const f=lightCones47[l.id],rank=lightConeRanks47[l.id];if(!f||f.name!==l.name||f.rarity!==l.rarity||f.path!==l.path||!rank||rank.skill!==l.effect?.name||rank.desc!==l.effect?.description||JSON.stringify(rank.params||[])!==JSON.stringify(l.effect?.paramsByRank||[])||JSON.stringify(rank.properties||[])!==JSON.stringify(l.effect?.propertiesByRank||[]))throw Error('4.7 fixed light cone mismatch '+l.id);matchedVersion47LightCones++;}
 if(baselineSkills.length!==matchedSkills)throw Error('old catalog skill split mismatch');
 const additionalBreakIds=new Set((data.specialBreakAttacks||[]).filter(a=>typeof engine.calculateAdditionalBreak==='function'&&engine.calculateAdditionalBreak({character:{id:a.characterId,level:80,eidolon:0,stats:{breakEffect:0}},enemy:{level:80,count:1,maxToughness:30,resistance:20,weakness:false},attack:{...a,traceLevel:1,multiplier:a.multipliers[0]},breakBaseDamage:data.breakBaseDamage}).supported===true).map(a=>a.id));
 const attackStatus=a=>!additionalBreakIds.has(a.id)&&engine.unsupportedAttackReason(a)?'計算不可':a.support?.status==='calculable'&&a.support?.verified?'計算対応':a.support?.status==='displayOnly'?'計算不可':'参考値';
 const counts=sumBy(data.attacks,attackStatus);
 const details=data.characters.map(c=>{
  const attacks=data.attacks.filter(a=>String(a.characterId)===c.id);
  const allRecords=attacks.concat((data.specialBreakAttacks||[]).filter(a=>String(a.characterId)===c.id));
  const sources=(sourceVersion(c)===version47?c.skills:c.skills.filter(s=>!sourceVersion(s))).map(s=>sourceVersion(s)===version47?skills47[s.id]:skills[s.id]);
  const required=sources.filter(s=>['直接ダメージ行動','条件付き/別成分（即時攻撃と区別）'].includes(skillRole(s)));
  const mapped=s=>allRecords.filter(a=>(a.id===s.id||a.sourceSkillId===s.id||a.triggerSkillId===s.id)&&!(a.requiredEidolon>0)&&!a.hidden);
  const absent=required.filter(s=>!mapped(s).length);
  const pending=required.filter(s=>!mapped(s).some(a=>attackStatus(a)==='計算対応'));
  const unknown=sources.filter(s=>skillRole(s)==='召喚/状態/条件（ダメージ有無の確認待ち）');
  const audit=e0CandidateAudit[c.id];
  const hasMissingComponent=Boolean(audit?.missingComponents?.length || audit?.requiredAttackIds?.some(id=>!allRecords.some(a=>a.id===id&&!a.hidden&&attackStatus(a)==='計算対応')));
  const candidate=required.length>0&&!pending.length&&!unknown.length&&!hasMissingComponent;
  const confirmed=Boolean(confirmedE0[c.id]&&candidate&&JSON.stringify(required.map(s=>s.id).sort())===JSON.stringify((confirmedMajorIds[c.id]||[]).slice().sort()));
  const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon'&&String(m.source.id)===c.id);
  return {c,attacks,sources,required,mapped,absent,pending,unknown,candidate,confirmed,eidolon,audit,hasMissingComponent};
 });
 const baselineDetails=details.filter(d=>!sourceVersion(d.c));
 const versionedDetails=details.filter(d=>sourceVersion(d.c)===version47);
 const baselineCount=baselineDetails.length;
 const confirmed=baselineDetails.filter(d=>d.confirmed),candidates=baselineDetails.filter(d=>d.candidate);
 const missingCharacters=baselineDetails.filter(d=>d.pending.length>0||d.hasMissingComponent).length;
 const pendingComposition=baselineCount-confirmed.length-missingCharacters;
 const registrationBacklog=baselineDetails.filter(d=>d.pending.length>0||d.hasMissingComponent);
 const backlogWithUnregistered=registrationBacklog.filter(d=>d.absent.length>0||d.hasMissingComponent);
 const backlogRegistered=registrationBacklog.filter(d=>!d.absent.length&&!d.hasMissingComponent);
 const eidolon=data.structuredModifiers.filter(m=>m.source?.kind==='eidolon');
 const eidolonOwners=new Set(eidolon.map(m=>m.source.id));
 const missing=baselineDetails.reduce((n,d)=>n+d.absent.length,0),unknown=baselineDetails.reduce((n,d)=>n+d.unknown.length,0);
 const lines=[];const p=(...s)=>lines.push(...s);
 p('# HSR キャラクター完成管理表','','この表は作業管理用です。旧固定版のE0主要攻撃認定と、4.7の追加データを分けて表示します。登録状態、構成確認、星魂/装備/支援の完成を同一視しません。','','## 更新手順','','1. `node scripts/reportHsrCompletion.cjs` で本番ローダーと固定版を再照合して更新。ネットワーク取得に失敗した場合は書き換えません。','2. `node scripts/reportHsrCompletion.cjs --check` で現在の文書と再生成結果を照合。','3. 個別攻撃の正式化はoverrideの限定条件/provenanceと独立検証テストを更新してから再生成。','4. E0主要構成を確認できた人はスクリプトのconfirmedE0へ根拠を追記。登録件数だけで追加しない。','5. E1～6、装備/パーティ、UI/UID/保存の統合確認を別途完了して初めて最終ゴールの完成認定を行う。','','## 基準と現在値','',`- 旧固定版: [StarRailRes ${sha}](https://github.com/Mar-7th/StarRailRes/tree/${sha}/index_new/jp)。旧${baselineCharacters.length}人・${matchedSkills}スキル・${matchedRanks}星魂を照合。`,`- 4.7追加記録: [StarRailRes ${version47Sha}](https://github.com/Mar-7th/StarRailRes/tree/${version47Sha}/index_new/jp)。キャラクター${versionedCharacters.length}人、追加スキル${matchedVersion47Skills}件、軌跡${matchedVersion47Traces}件、光円錐${matchedVersion47LightCones}件を4.7固定版と別照合。`,`- 現在のカタログ: ${data.characters.length}人（旧${baselineCharacters.length}人 + 4.7追加${versionedCharacters.length}人）。4.7キャラクターE0認定: **${versionedDetails.filter(d=>d.confirmed).length}/${versionedDetails.length}人**。追加分は旧固定版の認定人数に含めない。`,`- 本番攻撃（非表示の内部記録を含む）: ${data.attacks.length}件 = 計算対応${counts['計算対応']||0} / 参考値${counts['参考値']||0} / 計算不可${counts['計算不可']||0}。特殊撃破レコードは別枠${data.specialBreakAttacks.length}件。hidden ${data.attacks.filter(a=>a.hidden).length}件（うち計算対応${data.attacks.filter(a=>a.hidden&&attackStatus(a)==='計算対応').length}件）は画面の主要ダメージ一覧に含めない。`,`- 旧固定版のE0主要攻撃構成確認済み: **${confirmed.length}/${baselineCount}人** (${confirmed.map(d=>`${d.c.name} ${d.c.id}`).join('、')})。このE0限定単発範囲の認定で、全星魂/全装備の完成ではない。`,`- 旧固定版のE0完成未認定: **${baselineCount-confirmed.length}人**。登録上の充足候補は旧${baselineCount}人中${candidates.length}人（確認済みを含む）。主要候補の登録不足がある${missingCharacters}人と、登録済みでも全構成の確認待ち${pendingComposition}人を区別。`,`- 旧固定版の主要候補スキルID未登録: ${missing}件。明示ダメージ/条件成分の管理候補であり、独立した未実装ダメージ数ではない。状態系の有無確認待ちは${unknown} ID。`,`- 新しい計算処理が必要な攻撃の総数: **未確定**。下表の難易度は調査入口。既存式の接続不足、新しい成分処理、新しいダメージ式を混同しない。`,`- 育成・全星魂・全装備/支援・統合QAまでの最終完成認定: **0人**。`,'','分類: 主なNormal/BPSkill/Ultra/Talent/Elation/Memosprite/Assistを対象とする。秘技/フィールドは主要攻撃集計から除外。Support等でも付加/持続/確定ダメージを生む記述は別成分の要確認として残し、支援発動時の直接ダメージにしない。未知の状態/Summonを未実装攻撃と断定しない。','','## 旧固定版98人と4.7追加の記録','','表中の対応数は登録状態。E0構成欄の「登録上充足候補」は倍率・固有効果・未登録成分まで確認済みという意味ではありません。','', '|ID・名前|通常/強化|スキル/強化|必殺技|追加/カウンター|精霊/特殊等|登録 対応/参考/不可|E0主要構成と不足|難易度|','|---|---|---|---|---|---|---:|---|---|');
 for(const d of details){const list=types=>d.attacks.filter(a=>types.includes(category(a))).map(a=>`${a.id}[${attackStatus(a)}]`).join('、')||'—';const cs=sumBy(d.attacks,attackStatus);const gap=d.audit?.remaining||knownGaps[d.c.id]||`${d.pending.length}主要候補未充足・${d.unknown.length}状態/召喚等の有無確認待ち。固有補正/全状態は個別精査。`;p(`|${'['+cell(d.c.id+' '+d.c.name)+'](#character-'+d.c.id+')'}|${list(['通常','強化通常'])}|${list(['スキル','強化スキル'])}|${list(['必殺技'])}|${list(['追加/カウンター'])}|${list(['精霊/独立参照','固有/特殊','talent','additional','joint','assist'])}|${cs['計算対応']||0}/${cs['参考値']||0}/${cs['計算不可']||0}|${cell((d.confirmed?'確認済み':d.hasMissingComponent?'監査で成分不足を確認':d.candidate?'登録上充足候補・構成要確認':'未認定')+'。'+gap)}|${d.confirmed?'小: 統合QA/星魂へ':d.unknown.length?'要精査: 条件/召喚':'既存式候補～成分処理（未確定）'}|`);}
 p('','## 登録充足候補の継続重点監査','','固定版のスキル・追加能力・実行時行・独立検証記録を照合。登録だけでは認定しない。今回新規認定はキャラLv80・主要追加能力解放済み・敵1体・状態一定の単発範囲。E0採用Lvは通常1～6、その他1～10。全曲線のLv7/11以上の一致をE0や星魂対応の認定と混同しない。','','|ID・名前|判定|確認内容・残作業|検証根拠|','|---|---|---|---|');
 for(const[id,a]of Object.entries(e0CandidateAudit)){const name=data.characters.find(c=>c.id===id)?.name||id;p(`|${id} ${cell(name)}|${a.status==='confirmed'?'E0主要構成確認済み':a.status==='missing'?'未登録成分あり':'構成/独立検証待ち'}|${cell(a.summary+' '+a.remaining)}|${cell(a.evidence)}|`);}
 p('','重点監査で判明した未登録成分のうち、現在も残るものを以下に列挙する。解消済みの成分は上表に履歴を残す。マスターの主スキルIDだけで成分の完全性を認定しない。');
 for(const[id,a]of Object.entries(e0CandidateAudit))for(const component of a.missingComponents||[])p(`- ${id}: ${component}`);
 p('','## 完成までの予測残Codex指示回数（第8回・開始99d09fc）','','A=独立検証のみ、B=軽微修正、C1=既存共通処理へ追加接続、C2=新しい状態/成分処理の要否精査、D=具体的な仕様証拠待ち。一次分類を完了認定や確定工数と混同しない。');
 const work=details.map(d=>({...remainingWorkClass(d),id:d.c.id,name:d.c.name})),workCounts=sumBy(work,x=>x.group);
 p('', '|E0区分|人数|具体対象|','|---|---:|---|');for(const group of ['済','A','B','C1','C2','C','D'])p('|'+group+'|'+(workCounts[group]||0)+'|'+(work.filter(w=>w.group===group).map(w=>w.id+' '+w.name).join('、')||'—')+'|');
 p('','### 第6回のC34人一次分類（履歴）','','既存管理記録・本番ローダーからB1/C1=17/C2=16へ一次分類。全員を資料から再監査した意味ではない。第6回で下記9 IDを詳細監査し、2人を認定、5人を具体的証拠待ちへ移行した。残るC2の14人も新エンジン必須と確定したわけではなく、詳細分解/受入工数が未計測。','','|ID・キャラ|一次区分|根拠と不足|','|---|---|---|');
 for(const[id,a]of Object.entries(e0CandidateAudit).filter(([,a])=>a.batch6InitialClass))p('|'+id+' '+cell(data.characters.find(c=>c.id===id)?.name||id)+'|'+a.batch6InitialClass+'|'+cell(a.batch6ClassificationReason)+'|');
 p('','|ID・キャラ|現在区分|根拠の確度|残作業|','|---|---|---|---|');for(const w of work)p('|'+w.id+' '+cell(w.name)+'|'+w.group+'|'+cell(w.confidence)+'|'+cell(w.reason)+'|');
 p('','### 類型別実績と残回数','','第8回はC1の12人を既存証拠から横断確認。飛霄1人を限定E0構成確認済みへ移行し、緋英の追加愉悦3成分を接続した。単なる分類変更は完成として数えない。',
 '', '|受入類型|今回完了人数|実績|','|---|---:|---|','|独立検証だけ|0|登録と倍率だけで構成認定しない|','|軽微なデータ/補正接続|1|飛霄N/U・解形CD36、既存Skill/FUAを全Lvで受入|','|新規成分を実装したが全構成は未認定|0|緋英CB3行を独立検証。初回Fox/リソース更新は証拠待ち|','|既知の証拠不足を明示|8|連携継承・hit配分・更新順をDへ整理。完成人数の増加ではない|',
 '', '通常登録474=計算対応361/参考値87/計算不可26、特殊撃破3行は別。飛霄の既存4参考行を検証付き正式化（うち内部分岐2行は非表示）、緋英の独立CB3行を追加。独立検証12レコードは新規/更新7と既存代表5（飛霄Skill/FUA・乱破直撃/追加撃破・ブートヒル）を含み、すべてを今回の新規昇格数と数えない。',
 '', '|ケース|残C1の条件付き計画値|仮定・不確実性|','|---|---:|---|');
 for(const e of instructionForecast())p('|'+e.scenario+'|'+e.planned+'回＋U|1指示'+e.capacity+'人相当。全E0の総回数ではない|');
 p('', '2/3/6回は残るC1の3人（夏アベンチュリン、不死途、乱破）だけの接続・受入計画。標準1人は第7/8回の受入実績、楽観2人は共通再利用、悲観0.5人は未測定の複雑化を仮定。全状態の仕様証拠が得られる保証ではない。前回6/12/24回からの縮小は、1人完了と8人を証拠待ちDへ正しく再分類した結果であり、作業を9人分完成した意味ではない。',
 '', 'U証拠=39Dと残C1に併存する更新順の確証、U追加実装=3C1の残接続と14C2の機能/成分カード、U未調査=全構成/詳細受入量。計56人の全E0の有限総回数は未確定。共通CB入力/成分表示を再利用して緋英3行に新しいダメージ式は不要となったが、別キャラの未知の成分を自動で対応済みにしない。',
 '', '### 最終完成までの測定','','星魂588rank/構造化209、LC170、装備62セットの母数と層別標本は工数台帳を維持。今回新たなE1～E6/装備の実装完了速度は測定していない。最終完成0人。実UID通信を含む最終QAは別工程であり、E0速度を外挿した有限総回数は作らない。',
 '', '## 独立した追加撃破レコード','','通常登録数とは別枠。初回弱点撃破の値ではなく、発動したと仮定した1回分。','', '|ID|提供者/参照者|軌跡Lv|対応範囲|','|---|---|---|---|');
 for(const a of data.specialBreakAttacks||[])p('|'+a.id+'|'+a.characterId+' 本人最終BE|'+a.traceKey+' Lv1～'+(a.maximumTraceLevel||'未限定')+'|'+cell(a.calculationNote||a.conditionText)+'|');
 p('', '第4回の統合検証: HSR関連512テスト成功（既存489＋新規23）、生成--check成功。今回7対象と記憶開拓者の参照境界をPC1440/390/320で実操作。36スクリーンショットで8状態の成分/非会心/会心/期待値、追加撃破の氷非弱点/本人BE、異属性の停雲参照0/不足/保存・提供者離脱と参照者表示を確認。長文・箇条書き・枠線を代表画像で目視し、横はみ出し/JavaScript例外なし。既存の6候補の画面手順も再利用。実UID通信は今回行わず、合成UID形式と保存のテストを使用。');
 p('', '第3回の統合検証: HSR関連489テスト成功（新規24、既存465）、生成--check成功。今回6人と既存代表18 IDを1440/390/320pxで実操作。協奏の固定会心専用カテゴリ、モゼ本体/付加/合計、ルカHP欠落、保存/再読込、既存強化/複合/DoT/超撃破と支援ON/OFF/提供者離脱を確認。新規30画面と前回8候補48画面を含むスクリーンショットを作成し、代表画面のマーカー/枠線/折り返しを目視。JavaScript例外・横はみ出しなし。合成UID形式のみで実通信は今回未検証。');
 p('', '第2回の統合検証: HSR関連465テスト成功、生成--check成功。今回8候補と既存確認済み28人の代表行を1440/390/320pxで実操作。通常/強化/複合/DoT/精霊一覧、支援ON/OFF・提供者離脱、軌跡/星魂、空欄と0、必須参照Lvの局所停止、保存/再読込を確認。8候補の66画面を保存して代表スクリーンショットのマーカー/枠線/折り返しを目視確認。JavaScript例外・横はみ出しなし。銀狼/桂乃芬/セイバーの追加ON・Lv不足/OFF検証も3幅で確認。UID形式は合成プロフィールのみで、実UID通信や生レスポンス保存なし。');
 p('', '前回の統合検証: HSR関連441テスト成功、生成--check成功。新規10IDと既存確認済み18人の代表行を1440/390/320pxで再操作し、通常/強化/複合/精霊一覧、後続DoT/凍結、補正ON/OFF・提供者離脱、入力不足の局所停止、合成UID形式入力、保存復元を確認。新規画面および超撃破内訳のスクリーンショットで長文・箇条書きの枠内表示を点検。横はみ出し・JavaScript例外なし。個人UIDの通信/生レスポンスは今回の検証に使用していない。');
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
 p('', '|残る登録不足の内訳|人数|扱い|','|---|---:|---|',`|主要候補IDは全て登録済みだが計算対応が不足|${backlogRegistered.length}|参考値・固有成分・全Lvの独立検証を優先。登録だけでA判定しない|`,`|未登録の主要候補IDまたは明示された成分不足あり|${backlogWithUnregistered.length}|既存攻撃との対応付け/支援の区別を先に確認。必要な成分だけ追加|`,'','第2回は8候補を調査し、トパーズ/刃/アーチャー/青雀の4人をE0確認。銀狼/ミーシャ/桂乃芬/セイバーは部分改善したが、全状態の実行順証拠または新処理が残る。第3回は6人を監査しロビンを確認、モゼ/雪衣/アルジェンティの全Lv成分を追加検証。第4回でルカ/ルアンの主要構成とモーディス/ケリュドラを確認。次回はモゼ・巡狩なのか・トリビーの成分群、停雲/丹恒騰荒の別参照者群を分けて受入する。アルジェンティ/雪衣の証拠待ちは新根拠なしで反復しない。');
 p('','## 開始2f48bd5の未確認11人・今回の完成判定','','開始時の分類はA（追加独立検証のみ）0人・B（既存処理/限定条件の軽微修正）1人・C（仕様未確定/新成分処理）10人。各分類はキャラクター全体の主要構成について判断。一部の既存曲線が一致するだけでAや確認済みにしない。','','|ID・名前|開始分類|今回の結果・残作業|','|---|---|---|');
 for(const id of ['1222','1218','1209','1204','1005','1004','1207','1109','1106','1103','1009']){const a=e0CandidateAudit[id],name=data.characters.find(c=>c.id===id)?.name||id;p(`|${id} ${cell(name)}|${id==='1222'?'B':'C'}|${a.status==='confirmed'?'新規E0主要構成確認済み。':'未認定。'}${cell(a.remaining)}|`);}
 p('','### 霊砂の今回の検証（工程B・30040a5）','','- 122201通常Lv1～6、122202スキル/122203必殺/122204浮元はLv1～10。全て霊砂本人の最終ATK参照。固定版A2/A4/A6と正式4.6を照合。浮元の有無で必殺自身の倍率は変わらず、100%前進後の浮元は別行動。通常の浮元とA6緊急発動は同じ天賦の1回分を独立比較し、発生回数を自動生成しない。','- 浮元1ヒットのLv7～9は正式4.6の60.938/65.625/70.313%を既存採用値として維持。固定SHAの60.94/65.62/70.31%との記録精度差をprovenanceへ保持し、倍率そのものを変更していない。','- ATK3000・CR50%/CD100%・与ダメージ0%・敵Lv80/炎耐性20%/靭性あり: 通常Lv6=1080/2160/1620、スキルLv10=864/1728/1296、必殺Lv10=1620/3240/2430、浮元Lv10の2ヒット計=1620/3240/2430（非会心/会心/期待値）。必殺と浮元が同値でも別イベント。','- 2つの非対称ステータスで全E0曲線、ATK/HP/DEF/撃破特効の個別変更、ロビンスキルON/OFFを独立照合。朱炎によるATK変換を入力済みATKへ再加算しない。芳酔25%は4つの通常ダメージへ適用しない。','- 画面では芳酔により撃破9042.12792→11302.6599、超撃破5651.32995を確認。Lv80・BE200%・炎耐性20%・敵Lv80、撃破は最大靭性60、超撃破は削靭値10/転換率100%/撃破済み。通常・撃破・超撃破は別々の計算で、自動合算しない。','- PC1440/390/320で4行、支援ON/OFF/提供者離脱、必殺/天賦Lv不足だけの局所停止、E1/敵2体の範囲外停止、合成UID形式入力と保存/再計算を確認。実UID通信は実施していない。');
 p('','### 残作業の調査入口（確定した実装規模ではない）','','|分類|参考値/不可レコード数|','|---|---:|');
 for(const [name,count] of Object.entries(sumBy(data.attacks.filter(a=>attackStatus(a)!=='計算対応'&&a.type!=='technique'),difficulty)))p(`|${cell(name)}|${count}|`);
 p('','## 前工程の通常攻撃改善と統合検証（b7aac65）','','- 椒丘121801「心火計（焼尽5層）」と霊砂122201「供香」を参考値から正式対応へ変更。既存IDをoverrideし、攻撃行の総数は増やしていない。通常Lv1～6はATK50/60/70/80/90/100%。両者ともE0・Lv80・炎非弱点の未撃破の敵1体・途中状態変化なし。','- 椒丘は天賦Lv1～10の既存焼尽5層を前提とし、必須被ダメージ増加を1回だけ適用。初回付与・5層未満・DoT合算は対応外。霊砂は浮元の別行動や撃破ダメージを通常へ合算しない。','- ATK3000・会心50/100%・通常Lv6・敵Lv80/炎耐性20%/靭性あり: 椒丘（天賦10・焼尽5層）1458/2916/2187、霊砂1080/2160/1620（非会心/会心/期待値）。全採用LvとATK/HP/DEF個別変更をhsrCompletionBasicsで独立検証。','- ジェパードの戦意を完成済み最終ATKへ再加算する不具合を実画面で再現して修正。係数35%は説明用に保持し、includedInFinalStatsとして二重適用しない。ATK3000/DEF3000の通常Lv6は1458ではなく1080。','- 補正のattackIdsをエンジンの直接呼び出しでも尊重。通常専用補正が別攻撃/超撃破へ混入しない回帰テストを追加。','- PC1440px・390px・320pxで確認済み9人と新しい通常2件を操作。補正ON/OFF、ロビン支援、必要Lv不足による局所停止、保存/再読み込み、箇条書きの枠内位置を確認。UI用一時画像はリポジトリへ保存しない。');
 p('','## 今回の後続成分・12人監査・二重加算点検（開始b7aac65）','','- 姫子: 星火10031011は固定ATK30%の炎DoT1回。追加能力Lv1固定であり天賦Lvを要求しない。灼熱は攻撃前から燃焼している対象へのスキル与ダメージ+20%を任意ON/OFF。道標のCR15%は最終入力に含める。','- 存護なのか: 必殺即時100103と後続凍結1001031を分離。凍結倍率は必殺Lv1～10でATK30/33/36/39/42/45/48.75/52.5/56.25/60%。後続は非会心・敵ターン開始1回。旧版限定という誤った表示条件を解除し初期状態から一覧表示。','- 付与確率は星火50%基礎/2ターン、凍結50%基礎（氷呪解放時65%）/1ターン。成立済みの1回を仮定し、確率込み期待値や複数ターン合計を生成しない。','- ATK3000・CR50%/CD100%・敵Lv80/耐性20%/靭性あり: 星火324（非会心/会心倍率なし）、凍結648（必殺Lv10）。姫子スキル2160/4320/3240、灼熱ONは2592/5184/3888。なのか必殺即時1620/3240/2430。後続をこれらの即時合計へ追加しない。','- クラーラ: 全E0Lvの通常/印なし・ありスキル/通常カウンター、天賦×必殺100組の強化主対象/隣接を独立照合。天賦または必殺Lv不足の強化カウンターを暗黙補完せず局所停止。基準条件で通常counter2246.4/4492.8/3369.6、強化4492.8/8985.6/6739.2（報復30%を1回）。','- ペラ: 全E0直接曲線・A2/A6・事前成立済み一般解/秘技の独立値は一致。ただし新規一般解の初回必殺への同撃適用と解除後次攻撃のタイミングを断定せず、構成認定は保留。残る11人の具体ID/必要検証は上表に記録。','- 二重加算: 強化ヴェルト裁決の自己ATK変換を最終入力管理へ変更。強化カフカ苛みは自己最終ATK管理と外部味方支援を相互排他に分離。味方支援は対象のEHR75%以上でATK100%を維持し、提供者のEHRを参照しない。フックの恒常ATK小軌跡は22%から固定合計28%へ説明を訂正（計算時の加算なし）。','- 監査12人・既存確認済み9人・今回2人の最終入力効果が再加算されない数値テストを追加。戦闘中の彦卿CR/CD、景元段数CD、御空支援、クラーラcounter補正等は条件付きのまま維持。UID形式入力/手動編集/保存復元を検証し、UIDステータス再構築処理は変更しない。');
 p('','## 前工程の13人集中監査（開始1fcbd5c）','','- 対象13人: ペラ1106・御空1207・ヘルタ1013・サンポ1108・彦卿1209・景元1204・カフカ1005・ヴェルト1004・アスター1009・セーバル1103・フック1109・椒丘1218・霊砂1222。既存確認済み12人を重複認定せず、新規はヘルタ/サンポの2人。上の継続監査表に各ID・未確認状態・証拠を保持する。','- ペラ110603は「同Lv一般解が攻撃前から成立済み」の限定行。必殺Lv1～10のDEF低下30/31/32/33/34/35/36.25/37.5/38.75/40%と痛撃20%をこの行だけに一度適用。新規付与が今回の必殺へ乗るかは未確認のまま残し、初回必殺と同一視しない。解除後A6も事前有効時だけ手動指定。','- 御空: 通常本体120701、徹札矢のみ120704、合計1207011を分離。通常Lv1～6は50/60/70/80/90/100%、天賦Lv1～10は40/44/48/52/56/60/65/70/75/80%、必殺は228/243.2/258.4/273.6/288.8/304/323/342/361/380%。通常×天賦の全60組を照合。追加成分の再発動可能状態を想定し、表示のためのチェックを要求しない。','- 当時の御空の通常限定補正継承は保留。第16回で固定Fribbelsの通常タグと独立照合により解消し、徹札矢と合計にも通常限定補正を適用。A4自己虚数12%は完成済み入力で管理し、外部味方への12%支援と分離して二重加算しない。','- ヘルタ: 通常/スキル/必殺/追撃の全E0曲線を非対称2条件で独立照合。敵HP50%以上のスキル20%と追加能力25%を別加算。凍結中の必殺20%は任意状態、恒常氷/会心は最終入力。途中で敵HP境界を跨ぐ連鎖はこの認定外。','- サンポ: スキルは敵1体への初撃+追加4段。風化1層の天賦Lv1～10倍率は20/22/24/26/28/31/35/40/46/52%。全Lv×1～5層と必殺DoT被ダメージ増加20～30%を独立照合。風化0層の内訳0÷0でNaNが出る不具合を修正し、合計も内訳も有限0。不正層数はDoT行だけ停止。','- 基準: 最終ATK3000、CR50%/CD100%、敵Lv80・耐性20%・靭性あり。ペラ事前一般解の必殺Lv10は1620/3240/2430。御空は最終虚数与ダメージ12%（A4算入済み）で通常1209.6、徹札矢967.68、合計2177.28/4354.56/3265.92。ロビンスキル50%併用の合計は3149.28/6298.56/4723.92。','- 同基準・与ダメージ入力0%: ヘルタのスキルはHP50%以上1566/3132/2349、50%未満1350/2700/2025。サンポ風化5層は2808（非会心）、必殺DoT被ダメージ増加30%併用3650.4。必殺即時1728へDoTを加算しない。','- 回帰記録: hsrPelaPriorSolution/hsrYukongE0Completion/hsrHertaE0Completion/hsrSampoE0CompletionとhsrToolInputs。全採用Lv、非会心/会心/期待値、ATK/HP/DEF個別変更、支援・同一群重複排除、必須Lv不足の局所停止を検証。PC1440・390・320の実画面で内訳・長文/箇条書きの枠内位置・保存/再計算を確認。実UID通信は今回の対象外で、欠損プロフィールは合成データを使用。');
 p('','## 今回の状態別5人監査（開始565e25e）','','- 景元・セーバル・フックの最大3人を重点改善。アスター・彦卿は調査/既存状態の代表確認に限定。新規攻撃レコードやダメージ式を追加せず、参考値の昇格も行っていない。E0新規認定は0人。主要曲線/状態別値の確認と、未確定の初回付与順を分ける。','- 固定SHAの15曲線210係数と、主/隣接2曲線を元データへ直接照合。独立数値検証の採用LvはE0通常1～6・その他1～10。構造化星魂や全Lv曲線の存在をE1以上の検証完了とは扱わない。','- 神君は敵1体への3～10段の8想定行。破陣CD25%は各行の段数で判定し、保存された別の段数入力を流用しない。敵1体に存在しない隣接結果は表示せず、隣接1段の25%係数を説明する。複数敵のランダム分配は停止。','- 景元120402は事前遣将の想定行としてCR10%を一度適用し、既存手動遣将と同一群で重複排除。初回付与の同撃参照を推測しない。必要な固有補正データが欠ければそのスキルだけ停止。','- セーバル/フックの直接行は本体と明記し、天賦付加/後続DoTを全体合計と誤認させない。フックの事前燃焼付加はE0だけ表示用チェック不要。E6では同じ燃焼条件が与ダメージ20%を変えるため、従来の条件入力と停止を維持する。','- 基準はATK3000、CR50%/CD100%、与ダメージ0%、敵Lv80/耐性20%/靭性あり。神君Lv10の3段2138.4/4276.8/3207.6、5段3564/7128/5346、6段4276.8/9622.8/6949.8、10段7128/16038/11583。隣接1段の基礎非会心178.2は係数確認用で、敵1体への追加合計にしない。','- 同基準: セーバルのスキル本体1512/3024/2268、隣接648/1296/972、天賦付加777.6/1555.2/1166.4、感電DoT1123.2（会心不可）。フックはスキル2592/5184/3888、強化主3024/6048/4536・隣接864/1728/1296、付加1080/2160/1620、燃焼DoT702（会心不可）。各行は自動合算しない。','- 神君6段にロビンスキル50%を併用すると6415.2/14434.2/10424.7。遣将のみ有効時は同じ非会心4276.8のまま期待値7484.4。事前遣将スキルは1080/2160/1728で、手動遣将ON/OFFを重ねても同じ値。','- 根拠: hsrJingYuanE0Completion/hsrServalHookStates/hsrToolInputs。全採用Lv・神君全段数・非対称値・ATK/HP/DEF個別変更・固有/外部補正・局所停止・星魂範囲・保存を検証。PC1440/390/320で箇条書き/警告/長文と枠線、精霊を含む一覧、JavaScript例外/横はみ出しを実画面確認。実UID通信は今回の対象外。');
 p(
  "",
  "## 工程Cの今回の総合回帰（開始2f48bd5）",
  "",
  "- HSR関連411テスト成功。追加した霊砂の全E0曲線/参照値分離4ケースと、4行比較・支援・不足Lv・保存の入力ケースを含む。管理表の再生成と--check、98 ID/必須攻撃構成の契約テストも成功。",
  "- 既存確認済み14人の代表攻撃をPC1440/390/320で再操作。姫子の星火324、存護なのかの凍結648、クラーラ強化カウンター4492.8、ヘルタHP閾値、サンポ0層の有限0/5層2808を維持。数値は前工程の独立基準条件を再利用。",
  "- 景元の3～10段/状態別CD・事前遣将の非重複、セーバル/フック本体・天賦・後続DoT、ペラ事前一般解、御空本体/天賦/合計を確認（当時の通常限定補正ON時停止は第16回で解消）。未確定の初回状態を確認済みに変更していない。",
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
 p('','## 星魂・装備・パーティの別軸管理','','効果ごとの受入状態（未実装・部分実装・実装/検証完了・根拠不足保留）、限定範囲と次作業は [残作業測定の継続開発欄](HSR_COMPLETION_WORKLOAD.md#継続開発の効果別受入2026-10-28) を管理元とする。以下の登録件数を効果完了件数へ換算しない。開発原則は [主要攻撃の対応範囲](HSR_MAIN_ATTACK_SCOPE.md#継続開発の完成基準2026-10-28) を参照。','',`- 旧固定版${baselineCount}人のE1～6元データ（計${baselineCharacters.reduce((n,c)=>n+c.eidolons.length,0)}件）。固定rank辞書全体${Object.keys(ranks).length}件とは母集団が異なる。`,`- 構造化星魂${eidolon.length}件・${eidolonOwners.size}人、計算処理対象${eidolon.filter(m=>m.support.status==='calculable').length}件、表示専用${eidolon.filter(m=>m.support.status==='displayOnly').length}件。攻撃倍率/ヒット数のoverride対応や軌跡Lv加算は別経路なので、この件数を全対応効果数とはしない。`,'- E3/E5はcatalog.eidolons[].levelUpSkillsからのLv加算処理と、各攻撃の採用曲線/上限/星魂範囲をセットで検証する。元データやUI上限の存在だけでは計算対応としない。','','|星魂|構造化記録|計算処理対象|表示専用|','|---|---:|---:|---:|');
 for(let n=1;n<=6;n++){const items=eidolon.filter(m=>Number(m.source.eidolonRank)===n);p(`|E${n}|${items.length}|${items.filter(m=>m.support.status==='calculable').length}|${items.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','|補正提供元|登録|計算処理対象|表示専用|','|---|---:|---:|---:|');for(const kind of ['trace','lightCone','relic','ornament']){const a=data.structuredModifiers.filter(m=>m.source.kind===kind);p(`|${kind}|${a.length}|${a.filter(m=>m.support.status==='calculable').length}|${a.filter(m=>m.support.status==='displayOnly').length}|`);}
 p('','- 停雲、ロビン、サンデー、花火、椒丘、夏ロビン、霊砂/ギャラガーの既存補正は提供者/対象/個別軌跡/ON/OFFを維持。候補表示だけを適用済みと数えない。','- 主な不足: フォフォ121703の味方ATK支援、光円錐21056の味方撃破支援など。常時properties/最終入力と戦闘中の条件効果を分ける。','- 任意補正OFFで基礎計算、ONで必要値不足は影響する行だけ停止。精霊固有値を本人値で代用しない。','','## E0分野の継続候補（第8回の記録）','','全体の次作業は上記リンク先の継続開発欄で選定する。以下はE0分野の既存候補であり、接続可能な星魂・装備・支援より常に優先する指示ではない。','',
 '1. 夏アベンチュリン1513:単独愉悦A4の追撃扱いと熱気閾値による自動愉悦を、既存CB/愉悦成分へ二重加算なしで接続。',
 '2. 不死途1504:既存餌のSkill成分、暴食層別のFUA/強化FUAを既知倍率から分解して受入カード化。',
 '3. 乱破1317:段別の直撃/本人超撃破/天賦追加撃破を分け、天賦削靭の超撃破帰属と初回チャージ更新は証拠がある範囲だけ接続。',
 '4. C2の14人は一次分類止まり。まず全構成と必要機能を少数の受入カードへ分解し、既存処理だけで閉じるA/Bを再抽出。',
 '5. ブラックスワン初回Skill DEF・アナイクス0～6弱点の段間・セイレンスの領域/DoT順は版付き処理順証拠待ち。説明順だけで確定せず、同一調査を反復しない。',
 '6. 記憶開拓者男女の精霊ATK/会心/氷DMG・補正継承を独立した所有者契約で確認。本人ATK代用の停止を維持。',
 '7. E0確認済み42人は同じE0監査を反復せず、E1～E6・装備/支援の別受入カードへ引き継ぐ。最終完成0人を維持。',
 '8. 工数台帳の星魂・LC・装備・支援の層別標本を実装受入まで閉じ、完了速度を測定してから最終完成工数へ外挿。',
 '9. UID・保存・PC/モバイルの最終QAは開発完了と別に記録する。今回実UID通信は行っていない。');
 p('', '第8回の統合検証:HSR589テスト成功。飛霄/緋英/乱破/ブートヒル/夏アベンチュリンを1440/390/320pxで実操作し、72画像を作成して代表画像を目視。100万超の結果値のセル内範囲、長文/箇条書きの枠内、支援ON/OFF/提供者離脱/空欄/再読み込みを確認。JS例外・ページ横はみ出しなし。実UID通信は今回未実施。');
 if(versionedCharacters.length){p('','### 4.7.0追加・限定E0の確認状況','',`追加キャラクター: ${versionedCharacters.map(c=>`${c.id} ${cell(c.name)}`).join('、')}。追加スキル: ${versionedSkills.map(s=>`${s.id} (${data.characters.find(c=>c.skills.includes(s))?.id||'?'})`).join('、')||'なし'}。`,`追加光円錐: ${versionedLightCones.map(l=>`${l.id} ${cell(l.name)}`).join('、')||'なし'}。`, `固定ソース照合と主要構成の認定は別判定。限定E0確認済みは${versionedDetails.filter(d=>d.confirmed).length}/${versionedDetails.length}人。各キャラの認定条件・範囲外は以下へ記載。`);}
 for(const d of details){const isVersioned=sourceVersion(d.c)===version47;p(`<a id="character-${d.c.id}"></a>`, `### ${d.c.id} ${d.c.name}`,'',isVersioned?(d.confirmed?'4.7.0固定版の限定E0主要構成確認済み。旧98人と分けて認定。 '+confirmedE0[d.c.id]:`4.7.0ソース追加。旧固定版のE0認定には含めず、独立した構成確認待ち。`):d.confirmed?confirmedE0[d.c.id]:d.audit?(d.audit.summary+' 残作業: '+d.audit.remaining+' 証拠: '+d.audit.evidence):knownGaps[d.c.id]||'登録一覧の全成分/固有効果は要精査。登録状態と完成認定を分ける。','', '|攻撃ID・種類・名前|登録/実行|Lv・星魂範囲|必要入力・限定条件・不足|次作業/難易度|','|---|---|---|---|---|');for(const a of d.attacks)p(`|${a.id} ${cell(category(a)+' '+a.name)}|登録・${attackStatus(a)}|${cell(bounds(a))}|${cell(a.calculationNote||a.conditionText||a.support?.reason||'個別の入力・固有補正範囲は未明示')}|${cell(difficulty(a))}|`);
  p('','|固定版スキルID・名前|性質|対応する登録攻撃|管理上の扱い|','|---|---|---|---|');for(const s of d.sources){const mapped=d.mapped(s);const role=skillRole(s);p(`|${s.id} ${cell(s.name)}|${cell(role)}|${mapped.map(a=>a.id+' '+attackStatus(a)).join('、')||'なし'}|${role.startsWith('既存')?'既存攻撃へ統合・重複登録しない':role.startsWith('支援')?'ダメージ未実装数に含めない':role.startsWith('秘技')?'主要完成集計外':role.startsWith('召喚')?'有無/子攻撃/既存式接続を要確認':mapped.length?'成分/時点/条件の完全性を確認':'未登録候補。独立ダメージか既存行の成分か要確認'}|`);}
  p('','|星魂|構造化計算/表示|軌跡Lv加算（元データ）/残作業|','|---|---|---|');
  for(let rank=1;rank<=6;rank++){const es=d.eidolon.filter(m=>Number(m.source.eidolonRank)===rank),raw=d.c.eidolons.find(e=>Number(e.rank)===rank);const levelSkills=raw?.levelUpSkills||[];p(`|E${rank}|${es.filter(e=>e.support.status==='calculable').length}/${es.filter(e=>e.support.status==='displayOnly').length}|${levelSkills.map(x=>cell(JSON.stringify(x))).join('、')||'Lv加算なし'}。${es.length?'効果ごとの攻撃範囲/実計算を確認':'構造化記録なし。効果がないとは判断せず影響を精査'}|`);}
  p('',`星魂: 元データE1～6あり。構造化${d.eidolon.length}件（計算${d.eidolon.filter(m=>m.support.status==='calculable').length}・表示${d.eidolon.filter(m=>m.support.status==='displayOnly').length}）。E0主要攻撃と別に、各星魂の攻撃影響/軌跡Lv加算を確認する。`,'');
 }
 p('## 機械照合用フィンガープリント','',`- runtime: \`${hash({attacks:data.attacks,modifiers:data.structuredModifiers,specialBreak:data.specialBreakAttacks})}\``,`- old fixed skills/trees/ranks: \`${hash({skills,trees,ranks})}\``,`- 4.7 fixed skills/trees/light cones: \`${hash({skills:skills47,trees:trees47,lightCones:lightCones47,lightConeRanks:lightConeRanks47})}\``,'','元JSONのコピーは保存せず、固定SHAからメモリ上で照合する。この管理表は配信資産や計算ランタイムには使用しない。','');
 return {text:lines.join('\n'),summary:{characters:data.characters.length,baselineCharacters:baselineCount,version47Characters:versionedCharacters.length,version47ConfirmedE0:versionedDetails.filter(d=>d.confirmed).length,version47Skills:matchedVersion47Skills,version47Traces:matchedVersion47Traces,version47LightCones:matchedVersion47LightCones,attacks:data.attacks.length,counts,confirmedE0:confirmed.length,screenedCandidates:candidates.length,notCertified:baselineCount-confirmed.length,missingCharacters,pendingComposition,backlogRegistered:backlogRegistered.length,backlogWithUnregistered:backlogWithUnregistered.length,missingMasterCandidates:missing,unknownStateSkills:unknown}};
}
if(require.main===module)generate().then(({text,summary})=>{if(process.argv.includes('--check')){if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==text)throw Error('管理表が現在データと不一致。node scripts/reportHsrCompletion.cjs で更新してください。');}else fs.writeFileSync(output,text,'utf8');console.log(JSON.stringify(summary));}).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate,skillRole,e0CandidateAudit,remainingWorkClass,instructionForecast};
