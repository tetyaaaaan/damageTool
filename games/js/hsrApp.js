(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const FALLBACK = "/games/images/genshin/fallback.webp";
  const ELEMENT_KEYS = { Physical: "物理", Fire: "炎", Ice: "氷", Thunder: "雷", Wind: "風", Quantum: "量子", Imaginary: "虚数" };
  const CHARACTER_READINGS = {
    "開拓者": "かいたくしゃ", "姫子": "ひめこ", "遠坂凛": "とおさかりん", "銀狼": "ぎんろう", "火花": "ひばな", "丹恒": "たんこう", "長夜月": "ちょうやづき",
    "黄泉": "よみ", "花火": "はなび", "帰忘の流離人": "きぼうのさすらいびと", "霊砂": "れいさ", "雲璃": "うんり", "飛霄": "ひしょう", "椒丘": "しょうきゅう",
    "鏡流": "けいりゅう", "白露": "びゃくろ", "彦卿": "げんきょう", "符玄": "ふげん", "刃": "じん", "景元": "けいげん", "羅刹": "らせつ", "三月なのか": "みつきなのか",
    "寒鴉": "かんあ", "雪衣": "せつい", "桂乃芬": "けいないふん", "御空": "ぎょくう", "素裳": "すしょう", "停雲": "ていうん", "青雀": "せいじゃく",
    "千冶": "せんや", "緋英": "ひえい", "不死途": "ふしと", "爻光": "こうこう", "騰荒": "とうこう", "乱破": "らんは", "飲月": "いんげつ"
  };
  const STAT_ICONS = {
    hp: "IconMaxHP.png", atk: "IconAttack.png", def: "IconDefence.png", speed: "IconSpeed.png",
    critRate: "IconCriticalChance.png", critDamage: "IconCriticalDamage.png", breakEffect: "IconBreakUp.png",
    effectHitRate: "IconStatusProbability.png", effectRes: "IconStatusResistance.png", energyRegen: "IconEnergyRecovery.png", elation: "IconJoy.png"
  };
  const PROPERTY_LABELS = {
    HPAddedRatio: "HP", HPDelta: "HP", AttackAddedRatio: "攻撃力", AttackDelta: "攻撃力", DefenceAddedRatio: "防御力", DefenceDelta: "防御力",
    SpeedAddedRatio: "速度", SpeedDelta: "速度", CriticalChanceBase: "会心率", CriticalChance: "会心率", CriticalDamageBase: "会心ダメージ", CriticalDamage: "会心ダメージ",
    BreakDamageAddedRatioBase: "撃破特効", BreakDamageAddedRatio: "撃破特効", StatusProbabilityBase: "効果命中", StatusProbability: "効果命中",
    StatusResistanceBase: "効果抵抗", StatusResistance: "効果抵抗", SPRatioBase: "EP回復効率", PhysicalAddedRatio: "物理属性ダメージ",
    FireAddedRatio: "炎属性ダメージ", IceAddedRatio: "氷属性ダメージ", ThunderAddedRatio: "雷属性ダメージ", WindAddedRatio: "風属性ダメージ",
    QuantumAddedRatio: "量子属性ダメージ", ImaginaryAddedRatio: "虚数属性ダメージ", ElationDamageAddedRatioBase: "愉悦度", ElationDamageAddedRatio: "愉悦度"
  };
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const fmt = (value) => Math.round(num(value)).toLocaleString("ja-JP");
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const ATTACK_LABELS = { all: "すべての攻撃", normal: "通常攻撃", enhancedNormal: "強化通常攻撃", skill: "戦闘スキル", enhancedSkill: "強化戦闘スキル", ultimate: "必殺技", talent: "天賦", followUp: "追加攻撃", additional: "付加ダメージ", dot: "持続ダメージ", technique: "秘技", break: "弱点撃破", superBreak: "超撃破", memospriteSkill: "記憶の精霊スキル", memospriteTalent: "記憶の精霊天賦", elation: "愉悦スキル", trueDamage: "追加確定ダメージ", assist: "支援スキル" };
  const TARGET_LABELS = { single: "単体", blast: "拡散", aoe: "全体", bounce: "バウンド", adjacent: "隣接対象" };
  const PARTY_TARGET_LABELS = { allySingle: "味方単体", activeAlly: "指定した味方", partyAll: "味方全体", enemySingle: "敵単体", enemyAll: "敵全体", self: "発動者自身", summon: "召喚物", memosprite: "記憶の精霊" };
  const displayTarget = (value) => PARTY_TARGET_LABELS[value] || TARGET_LABELS[value] || value;

  const DEFAULT_STATS = { hp: 0, hpPercent: NaN, atk: 0, def: 0, speed: 100, critRate: 5, critDamage: 50, breakEffect: 0, effectHitRate: 0, effectRes: 0, energyRegen: 100, damageBonus: 0, dotBaseDamage: 0, elation: 0 };

  const state = {
    data: null,
    characterId: "", coneId: "", relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "",
    level: 80, eidolon: 0, enhancementState: "enhanced", coneLevel: 80, coneRank: 1, partySp: 3, attackerPosition: 1, traceLevels: { normal: 6, skill: 10, ultimate: 10, talent: 10, elation: 10, memSkill: 6, memTalent: 6 }, source: "manual",
    stats: { ...DEFAULT_STATS },
    songbirdInputs: { active: false, context: "", skillLevel: 6, hp: NaN, critRate: NaN, critDamage: NaN, damageBonus: NaN },
    breakInputs: { mode: "attacks", toughnessDamage: NaN, multiplier: 100 },
    trueDamageInputs: { active: false, sourceKind: "", originalDamage: NaN },
    elationInputs: { context: "ahaInstant", punchline: NaN, merrymake: 0, fervor: NaN },
    party: Array.from({ length: 3 }, () => ({ characterId: "", eidolon: 0, level: 10, atk: 0, critDamage: 50, breakEffect: NaN, speed: NaN, effectRes: NaN, lightConeId: "", coneRank: 1, relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "", source: "manual", traceLevels: {} })),
    enemyId: "3001020",
    enemy: { level: 80, maxHp: 100000, resistance: 20, weakness: false, toughnessActive: true, maxToughness: 30, hpPercent: NaN, count: 1, debuffCount: 0, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
    selectionType: "", selectionFilters: { element: new Set(), rarity: new Set(), path: new Set() }, partySlot: -1, conditionTab: "パーティ", initialized: false,
    modifierInputs: {},
    conditions: [
      { id: "damage", tab: "その他", name: "ダメージバフ", description: "現在の攻撃へ加算するダメージバフ", source: "手動入力", category: "damageBonus", value: 0, enabled: false, appliesTo: "現在の攻撃" },
      { id: "vulnerability", tab: "その他", name: "被ダメージ増加", description: "敵へ付与された被ダメージ増加", source: "敵デバフ", category: "takenDamage", value: 0, enabled: false, appliesTo: "敵単体" },
      { id: "def-reduction", tab: "その他", name: "防御ダウン", description: "敵の防御力を低下", source: "敵デバフ", category: "defenseReduction", value: 0, enabled: false, appliesTo: "敵単体" },
      { id: "def-ignore", tab: "その他", name: "防御無視", description: "計算対象の攻撃が無視する防御割合", source: "手動入力", category: "defenseIgnore", value: 0, enabled: false, appliesTo: "自身" },
      { id: "res-pen", tab: "その他", name: "属性耐性貫通", description: "計算対象属性の耐性貫通", source: "手動入力", category: "resistancePenetration", value: 0, enabled: false, appliesTo: "自身" }
    ]
  };

  // Display values are separate from the exact values used by calculation and storage.
  const displayedStats = new Map();
  let profileCharacters = [];
  let initialInputs = null;
  let initialDefaults = null;
  let pendingReset = null;
  let conditionAudit = null;
  let conditionReferenceInputs = new Set();
  const modifierIssueLinks = new Map();
  const modifierIssueIds = new Set();
  let observedPartyProviders = new Set();
  const restoredPartySelections = new Set();
  const TRACE_FIELDS = {
    normal: ["Normal", "hsrNormalTrace", "通常", 6], skill: ["BPSkill", "hsrSkillTrace", "スキル", 10],
    ultimate: ["Ultra", "hsrUltimateTrace", "必殺技", 10], talent: ["Talent", "hsrTalentTrace", "天賦", 10],
    memSkill: ["MemospriteSkill", "hsrMemSkillTrace", "精霊スキル", 6], memTalent: ["MemospriteTalent", "hsrMemTalentTrace", "精霊天賦", 6],
    elation: ["ElationDamage", "hsrElationTrace", "愉悦", 10]
  };
  function statDisplay(key, value) {
    if (value === null || !Number.isFinite(Number(value))) return "";
    const n = Number(value);
    return ["hp", "atk", "def", "speed"].includes(key) ? String(Math.floor(n + 1e-9)) : n.toFixed(1);
  }
  function writeStat(key) {
    const input = $("hsrStat-" + key); if (!input) return;
    const value = state.stats[key]; input.value = statDisplay(key, value);
    displayedStats.set(input.id, { text: input.value, value });
  }
  function readStat(input) {
    const displayed = displayedStats.get(input.id);
    return displayed && input.value === displayed.text ? displayed.value : input.value.trim() === "" ? NaN : Number(input.value);
  }
  function readHpRatio(input) {
    const value = readStat(input);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : NaN;
  }
  function traceMaximum(key) {
    const [type, , , base] = TRACE_FIELDS[key];
    const links = Object.values(state.data?.traceSkillMap?.[state.characterId] || {});
    const skills = character()?.skills || [];
    const primary = links.map(link => skills.find(skill => String(skill.id) === link.skillIds?.[0])).find(skill => skill?.type === type)
      || skills.find(skill => skill.type === type && skill.params?.length);
    const bonus = (character()?.eidolons || []).filter(rank => rank.rank <= state.eidolon)
      .flatMap(rank => rank.levelUpSkills || []).filter(skill => String(skill.id) === String(primary?.id)).reduce((sum, skill) => sum + Number(skill.num || 0), 0);
    return Math.min(base + bonus, primary?.params?.length || base);
  }

  function renderTraceInputs() {
    const skills = character()?.skills || [];
    Object.entries(TRACE_FIELDS).forEach(([key, [type, id, label, maximum]]) => {
      const visible = skills.some((skill) => skill.type === type && skill.params?.length)||['8007','8008'].includes(state.characterId)&&['memSkill','memTalent'].includes(key);
      const field = $(id + "Field"); if (field) field.hidden = !visible;
      // An absent trace is never filled from the character's ordinary talent.
      fillRange(id, 1, traceMaximum(key), state.traceLevels[key], (value) => `${label} Lv${value}`);
    });
  }

  function find(collection, id) { return state.data?.[collection]?.find((item) => item.id === id) || null; }
  function character() { return find("characters", state.characterId); }
  function cone() { return find("lightCones", state.coneId); }
  function relic() { return find("relicSets", state.relicId); }
  function relicSecond() { return find("relicSets", state.relicSecondId); }
  function ornament() { return find("relicSets", state.ornamentId); }
  function enemyPreset() { return find("enemies", state.enemyId); }
  function imageUrl(value) { return value || FALLBACK; }
  function elementIcon(element) { return element ? `/games/images/hsr/elements/${element}.png` : ""; }
  function normalizeSearchText(value) { return String(value || "").normalize("NFKC").toLocaleLowerCase("ja").replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60)).replace(/[\s・ー（）()&]/g, ""); }
  function searchText(item) {
    const reading = Object.entries(CHARACTER_READINGS).filter(([name]) => item.name.includes(name)).map(([, value]) => value).join(" ");
    return normalizeSearchText(`${item.name} ${item.nameReading || ""} ${reading}`);
  }
  function cleanGameText(value) { return window.HsrUidImporter?.cleanGameText?.(value) || String(value || "").replace(/\{RUBY_B#[^}]*\}|\{RUBY_E#\}/g, ""); }
  function formatGameText(value, params) { return window.HsrUidImporter?.formatGameText?.(value, params) || cleanGameText(value); }
  function fixImage(event) { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK; }
  function setImage(id, src, alt) { const image = $(id); image.src = imageUrl(src); image.alt = alt || ""; image.onerror = fixImage; }

  function fillRange(id, start, end, selected, label) {
    $(id).innerHTML = (!Number.isInteger(selected) || selected < start || selected > end ? '<option value="" selected>未取得・要入力</option>' : "") + Array.from({ length: end - start + 1 }, (_, index) => start + index)
      .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${esc(label(value))}</option>`).join("");
  }

  function renderStaticInputs() {
    fillRange("hsrEidolon", 0, 6, state.eidolon, (value) => String(value));
    fillRange("hsrConeRank", 1, 5, state.coneRank, (value) => String(value));
    fillRange("hsrNormalTrace", 1, traceMaximum("normal"), state.traceLevels.normal, (value) => `通常 Lv${value}`);
    fillRange("hsrSkillTrace", 1, traceMaximum("skill"), state.traceLevels.skill, (value) => `スキル Lv${value}`);
    fillRange("hsrUltimateTrace", 1, traceMaximum("ultimate"), state.traceLevels.ultimate, (value) => `必殺技 Lv${value}`);
    fillRange("hsrTalentTrace", 1, traceMaximum("talent"), state.traceLevels.talent, (value) => `天賦 Lv${value}`);
    fillRange("hsrElationTrace", 1, traceMaximum("elation"), state.traceLevels.elation, (value) => `愉悦 Lv${value}`);
    $("hsrEnemySelect").innerHTML = state.data.enemies.map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("") + '<option value="custom">カスタム</option>';
  }

  function renderBuild() {
    renderTraceInputs();
    renderEidolonScope();
    const char = character(); const lightCone = cone(); const relicSet = relic(); const secondRelicSet = relicSecond(); const ornamentSet = ornament();
    setImage("hsrCharacterImage", char?.image, char?.name);
    setImage("hsrConeImage", lightCone?.image, lightCone?.name);
    setImage("hsrRelicImage", relicSet?.image, relicSet?.name);
    setImage("hsrRelicSecondImage", secondRelicSet?.image, secondRelicSet?.name);
    setImage("hsrOrnamentImage", ornamentSet?.image, ornamentSet?.name);
    $("hsrCharacterName").value = char?.name || "選択してください";
    $("hsrCharacterMeta").textContent = char ? `${char.elementName}・${char.pathName} / ★${char.rarity}` : "属性・運命";
    $("hsrConeName").value = lightCone?.name || "選択してください";
    $("hsrConeMeta").textContent = lightCone ? `${lightCone.pathName} / ★${lightCone.rarity}` : "運命に合う候補を表示";
    $("hsrRelicName").value = relicSet?.name || "選択しない";
    $("hsrRelicSecondName").value = secondRelicSet?.name || "選択しない";
    $("hsrOrnamentName").value = ornamentSet?.name || "選択しない";
    $("hsrCharacterDetailsButton").disabled = !char;
    $("hsrConeDetailsButton").disabled = !lightCone;
    $("hsrRelicDetailsButton").disabled = !relicSet;
    $("hsrRelicSecondDetailsButton").disabled = !secondRelicSet;
    $("hsrOrnamentDetailsButton").disabled = !ornamentSet;
    $("hsrRelicMode").value = state.relicMode; $("hsrRelicSecondCard").hidden = state.relicMode !== "2+2";
    $("hsrElationField").hidden = char?.path !== "Elation";
    $("hsrElationInputHelp").hidden = char?.path !== "Elation";
    $("hsrTrueDamageSettings").hidden = char?.id !== "1415";
    $("hsrSongbirdSettings").hidden = char?.id !== "1512";
    $("hsrElationSettings").hidden = !["1505", "1502", "1513", "8009", "8010", "1501", "1506", "1503", "1511"].includes(char?.id);
    $("hsrElationContextField").hidden = char?.id !== "1502";
    $("hsrElationScope").textContent = char?.id === "1502" ? "爻光Lv80・星魂0・敵1体。初回通常アッハと、必殺による固定20の追加アッハを別行で比較します。" : "緋英Lv80・星魂0のアッハタイム中、敵1体あたりの1回分です。爆笑の褒美を参照する発動は対象外です。";
    $("hsrPunchlineField").hidden = false;
    $("hsrFervorField").hidden = char?.id !== "1513";
    $("hsrPunchlineLabel").textContent=char?.id==='1511'?'愉悦スキル参照時点の爽快ネタ':'攻撃時点の爆笑ネタ';
    if(char?.id==='1511'){
      $("hsrElationScope").textContent='星神★アッハ・Lv80/E0・未撃破の敵1体。通常/スキル/必殺は本人の褒美、愉悦スキルは爽快ネタを参照します。';
    }

    if(char?.id==='1503'){$("hsrPunchlineField").hidden=true;$("hsrElationScope").textContent='パール＋爻光の2人編成、Lv80/E0・未撃破の敵1体・状態一定。本人DEF、本人CB、底本の氷愉悦と、事前の次回攻撃付加を分離します。別編成や資源/行動順の自動更新は対象外です。';}
    $("hsrPunchlineHelp").textContent = char?.id === "1502" ? "通常発動は消費済み爆笑ネタ0の初回のみ。必殺追加行は固定20で計算し、この爆笑ネタ入力を使いません。本人の大吉は補正条件の爆笑の褒美を参照します。結界・SPD由来愉悦度とA4会心ダメージは最終入力へ一度含めてください。被ダメージ増加16%は自動適用するため重複入力しないでください。愉悦度・会心等は適用対象の常時効果を含む最終値を入力してください。上笑なしは0。通常の与ダメージ補正は適用しません。" : "Lv80・星魂0・アッハタイム中の敵1体あたり1回分です。爆笑ネタと爆笑の褒美は別の値です。この攻撃では攻撃時点の爆笑ネタだけを使い、攻撃後の爆笑の褒美+5は加算しません。上笑がない場合は0を入力してください。通常の与ダメージ補正は適用しません。";
    if(char?.id==='1511')$("hsrPunchlineHelp").textContent='この入力は愉悦スキル本体と確定成分を含む合計だけに使います。通常/スキル/必殺の褒美、願力、使令対象、事前の実ダメージ記録は補正条件で指定してください。未入力の成分だけを停止します。負債のHP占有状態は補正条件から別内訳で確認できます。資源の自動更新は計算しません。';
    if(char?.id==='1503')$("hsrPunchlineHelp").textContent='本人の爆笑の褒美と、パール由来の付加が参照する爆笑ネタは別入力です。深層学習と次回付加の参照値を補正条件で指定します。A2 DEF変換を含む最終愉悦度を使い、上笑なしは0です。';
    if (char?.id === "1513") {
      $("hsrElationScope").textContent = "夏アベンチュリンLv80・星魂0・敵1体。通常版151320と、次のアッハタイムの強化版151321を条件別に計算します。";
      $("hsrPunchlineHelp").textContent = "通常版は熱気10到達の自動発動、強化版は他の愉悦キャラ編成時の次のアッハタイムを想定します。全ヒット中の敵条件変化なし。通常版の爆笑ネタは固定20、強化版は下の爆笑ネタと消費熱気10～30を参照します。上笑なしは0。通常与ダメージ補正、複数敵分配、熱気の自動管理は対象外です。";
    }
    if (["8009","8010"].includes(char?.id)) {
      $("hsrElationScope").textContent="愉悦開拓者Lv80・星魂0・未撃破の敵1体。通常アッハタイムの8段＋最後撃と、本人が味方最大の褒美を持つスキル追加を別に比較します。";
      $("hsrPunchlineHelp").textContent="この爆笑ネタはアッハタイムだけに使用。スキル追加は補正条件の本人の爆笑の褒美を参照します。A2のATK由来愉悦度とA4会心率を最終値へ1回含めてください。ATK支援を追加計算する場合、この愉悦結果は再換算せず除外します。上笑なしは0。";
    }
    if(char?.id==='1506'){
      $('hsrElationScope').textContent='銀狼LV.999・Lv80/E0・未撃破の敵1体。通常/スキル追加愉悦と、CB変換強化通常（スコア上限・非剣SSS3箱）を別に比較します。';
      $('hsrPunchlineHelp').textContent='現在の爆笑ネタを使用。スコア由来会心とSPD由来愉悦は最終値へ一度含めてください。愉悦6段は従来のスコア240固定。強化通常は全ヒット未撃破を確認し、スコア上限240（昇格中360）・実現した剣箱0に限定。剣箱、途中死亡、資源自動更新は含みません。';
    }
    if(char?.id==='1501'){
      $("hsrElationScope").textContent='火花Lv80/E0・未撃破の敵1体。通常アッハタイム21段と、本人CBによる強化通常/必殺の追加愉悦を別に比較します。';
      $("hsrPunchlineHelp").textContent='この爆笑ネタはアッハタイムだけに使用。本人CBとトラップ回数は補正条件で指定します。A2愉悦とA6会心ダメージはダメージ参照時点の最終入力へ一度含めてください。SP/衝撃ネタの更新は計算しません。';
    }
    if (state.coneId === "20024") $("hsrPunchlineHelp").textContent += " この入力は光円錐「残涙」の所持爆笑ネタ条件にも使用します。爆笑の褒美は代用しません。";
    $("hsrEnhancementField").hidden = !state.data.attacks.some(item => item.characterId === char?.id && item.variant);
    $("hsrEnhancementState").value = state.enhancementState;
    $("hsrDotBaseDamageField").hidden = char?.id !== "1005";
    $("hsrDamageBonusIcon").src = elementIcon(char?.element || "Physical");
    $("hsrInputProvenance").textContent = state.source === "api" ? "UID取得値（編集可能）" : state.source === "api-edited" ? "UID取得値を手動変更" : "手動入力値";
    $("hsrResultBuildSummary").textContent = char ? `${char.name} / ${lightCone?.name || "光円錐未選択"}` : "未選択";
    renderAttacks(); renderPartySummary(); updateConditionSummary();
  }

  function writeStats() {
    Object.keys(state.stats).forEach(writeStat);
    $("hsrLevel").value = state.level; $("hsrConeLevel").value = state.coneLevel; renderActionValue();
  }

  function collectInputs() {
    document.querySelectorAll("[data-stat]").forEach((input) => { state.stats[input.dataset.stat] = input.dataset.stat === "hpPercent" ? readHpRatio(input) : readStat(input); });
    state.songbirdInputs = { active: $("hsrSongbirdMode").value === "true", context: $("hsrSongbirdContext").value, skillLevel: Number($("hsrSongbirdSkillLevel").value), ...Object.fromEntries(["hp", "critRate", "critDamage", "damageBonus"].map(key => { const value = $("hsrSongbird-"+key).value; return [key, value.trim() === "" ? NaN : Number(value)]; })) };
    state.level = Number($("hsrLevel").value); state.eidolon = num($("hsrEidolon").value); state.enhancementState = $("hsrEnhancementState")?.value || "enhanced"; state.coneLevel = Number($("hsrConeLevel").value); state.coneRank = num($("hsrConeRank").value, 1); state.partySp = Math.min(7, Math.max(0, Math.floor(num($("hsrPartySp")?.value, 3)))); state.traceLevels = { normal: Number($("hsrNormalTrace").value), skill: Number($("hsrSkillTrace").value), ultimate: Number($("hsrUltimateTrace").value), talent: Number($("hsrTalentTrace").value) };
    Object.entries(TRACE_FIELDS).forEach(([key, [, id]]) => { state.traceLevels[key] = $(id).value === "" ? NaN : Number($(id).value); });
    state.trueDamageInputs = { active: state.characterId === "1415" && $("hsrTrueDamageActive").value === "true", sourceKind: $("hsrTrueDamageSourceKind").value, originalDamage: $("hsrOriginalDamage").value.trim() === "" ? NaN : Number($("hsrOriginalDamage").value) };
    if (state.trueDamageInputs.active) state.traceLevels.skill = Number($("hsrSkillTrace").value);
    state.breakInputs = { mode: ["break", "superBreak"].includes($("hsrBreakMode").value) ? $("hsrBreakMode").value : "attacks", toughnessDamage: $("hsrSuperBreakToughness").value.trim() === "" ? NaN : Number($("hsrSuperBreakToughness").value), multiplier: $("hsrSuperBreakMultiplier").value.trim() === "" ? NaN : Number($("hsrSuperBreakMultiplier").value) };
    state.elationInputs = { context: state.characterId === "1502" ? $("hsrElationContext").value : "ahaInstant", punchline: $("hsrPunchline").value.trim() === "" ? NaN : Number($("hsrPunchline").value), merrymake: $("hsrMerrymake").value.trim() === "" ? NaN : Number($("hsrMerrymake").value), fervor: $("hsrFervor").value.trim() === "" ? NaN : Number($("hsrFervor").value) };
    state.enemy = { level: num($("hsrEnemyLevel").value, 80), maxHp: Math.max(0, num($("hsrEnemyMaxHp").value, 100000)), resistance: num($("hsrEnemyResistance").value), weakness: $("hsrWeakness").value === "true",
      toughnessActive: $("hsrToughnessState").value === "active", maxToughness: num($("hsrMaxToughness").value, 30), hpPercent: readHpRatio($("hsrEnemyHpPercent")), count: Math.min(5, Math.max(1, Math.floor(num($("hsrEnemyCount").value, 1)))), debuffCount: Math.max(0, num($("hsrEnemyDebuffCount").value)), defenseReduction: num($("hsrEnemyDefenseReduction").value),
      defenseIgnore: num($("hsrEnemyDefenseIgnore").value), resistancePenetration: num($("hsrEnemyResistancePenetration").value), takenDamage: num($("hsrEnemyTakenDamage").value) };
  }

  function songbirdSnapshot() {
    return { ...state.songbirdInputs, context: "feverStable", fever: state.modifierInputs["robin-summeretto-fever"] === true,
      songbirdsActive: state.modifierInputs["robin-songbirds-vulnerability"] === true, count: state.modifierInputs["robin-songbirds-count"],
      vibes: state.modifierInputs["robin-summeretto-vibes"], talentLevel: state.modifierInputs["robin-songbirds-talent-level"] ?? 6, normalTalentLevel: state.traceLevels.talent };
  }

  // Only pure availability selectors become assumptions. Shared damage-changing
  // inputs retain their existing validation and are never enabled globally.
  function comparisonCondition(attack) {
    if (attack.support?.status !== "calculable" || attack.support?.verified !== true
      || ![undefined, "statMultiplier", "elation"].includes(attack.damageFormula) || !attack.modifierInputKey) return null;
    const records = state.data.structuredModifiers || [];
    const key = attack.modifierInputKey;
    // Reviewed E0-only availability states have no damage-changing consumers at that rank.
    const assumed = attack.assumeAvailabilityAtEidolon === state.eidolon && records.find(item => item.activation?.inputKey === key && item.activation.mode === "toggle" && item.category === "attackState" && item.source?.id === attack.characterId);
    if (assumed) return assumed;
    const selector = records.find(item => item.activation?.inputKey === key && item.activation.mode === "toggle"
      && item.support?.status === "displayOnly" && item.inputPolicy !== "includedInFinalStats");
    if (!selector || records.some(item => item.support?.status === "calculable" && JSON.stringify(item).includes('"' + key + '"'))) return null;
    return selector;
  }

  function comparisonAssumption(attack) {
    const condition = comparisonCondition(attack);
    if (!condition) return "";
    if (attack.id === "150310") return "深層学習中・非愉悦の底本・追加愉悦なし（敵1体分）";
    return (attack.id === "151321" ? "他の愉悦キャラ編成時の愉悦版・" : "") + condition.activation.conditionText;
  }

  function comparisonSelector(item) {
    const key = item.activation?.inputKey;
    const attacks = (state.data?.attacks || []).filter(attack => attack.characterId === state.characterId && !attack.hidden && attack.modifierInputKey === key);
    return Boolean(key && item.displayOnly && item.inputPolicy !== "includedInFinalStats" && comparisonInputValues(key).length)
      || Boolean(key && attacks.length && attacks.every(comparisonCondition));
  }

  function availableAttacks() {
    return state.data.attacks.filter(item => (item.characterId === state.characterId || item.id==="151022"&&item.supportedOtherUsers?.includes(state.characterId)&&state.party.some(m=>m.characterId==="1510")) && !item.hidden
      && (!item.requiredEidolon || state.eidolon >= item.requiredEidolon)
      // This selector chooses a released balance version, not an attack state.
      && (!item.variant || item.variant === state.enhancementState));
  }

  function attackHitCountInput(attack) {
    // Broken enemies guarantee both extra Sword Stance checks; do not overwrite the saved unbroken snapshot.
    if (attack.id === "1206031" && state.enemy.toughnessActive === false) return 2;
    return state.modifierInputs[attack.hitCountInputKey] === undefined ? attack.hitCountDefault : state.modifierInputs[attack.hitCountInputKey];
  }

  function attackStateIssues(attack, issue) {
    if(['1140706','1140712'].includes(attack.id)&&attack.cyreneLifeDeathActive&&(!Number.isInteger(state.modifierInputs['cyrene-castorice-excess-newbud'])||state.modifierInputs['cyrene-castorice-excess-newbud']<0||state.modifierInputs['cyrene-castorice-excess-newbud']>100))issue('この死竜の召喚時に消費した超過新蕾を0～100%の整数で指定してください。召喚時の敵数2体以下の状態だけに対応します。','hsrConditionDialogOpen');
    if(attack.id==='140811'&&state.modifierInputs['phainon-ruin-stacks']===4&&[7,8,9].includes(attack.traceLevel))issue('壊傷4層はスキルLv1～6・10のみ対応です。Lv7～9の4層は根拠待ちで計算対象外です。壊傷1～3層はLv1～10に対応します。','hsrSkillTrace');
    if(attack.id==='1403033'&&attack.cyreneBarrierActive&&state.modifierInputs['tribbie-followup-damage-stacks']!==3)issue('門と道の追加比較は追撃前からA2が3層で飽和した状態のみ対応です。追撃本体の新規層は自動加算しません。','hsrConditionDialogOpen');

    if (attack.damageFormula === "enemyHpCappedByAtk" && (String($("hsrEnemyMaxHp").value).trim() === "" || !(Number($("hsrEnemyMaxHp").value)>0))) issue("この裂創成分に必要な敵の最大HPを入力してください。", "hsrEnemyMaxHp");
    if (attack.characterLevelExact !== undefined && state.level !== attack.characterLevelExact) issue(`${attack.name}はキャラクターLv${attack.characterLevelExact}のみ計算対応です。`, "hsrLevel");
    if (attack.damageFormula === "componentSequence" && (!Array.isArray(attack.sequenceAttacks) || attack.sequenceAttacks.length !== (attack.id==="151009"?(state.modifierInputs["himeko-departure-drive"]===1?1:2):attack.characterId==="1213"&&["121301","121308","121310","121312","121303"].includes(attack.id)?attack.damageComponents.length:['1410013','1410023'].includes(attack.id)?1+(attack.dotOwnerIds?.length||0):attack.id==='1403033' ? (attack.cyreneBarrierActive?2:1) : ["1410012","1410022"].includes(attack.id) ? 5 : attack.id === "150308" ? (state.modifierInputs["pearl-next-proc-count"]===1?4:3) : attack.id === "1410032" ? 6 : ["140109","140603"].includes(attack.id) ? 4 : ["140208","1414039"].includes(attack.id) ? 3 : ["1206022","11004012","11004022"].includes(attack.id) ? 3 : attack.id === "150403" ? 2+Math.floor(state.modifierInputs["fudie-gluttony-stacks"]/4) : attack.id === "130803" ? (attack.sequenceAttacks?.length || 0) : attack.id === "1111083" ? (attack.ownBleed ? 3 : 2) : attack.id === "1223031" ? (attack.preyActive ? 4 : 2) : 2))) issue(`${attack.name}の構成データ（本体・追加成分）を読み込めません。ページを再読み込みして確認してください。`, "");
    if (["1224011","1224081"].includes(attack.id)) {
      if(!['Erudition','Destruction','Hunt','Remembrance','Elation'].includes(attack.shifuPath) || !Object.keys(ELEMENT_KEYS).includes(attack.shifuElement)) issue('攻撃型師匠の運命と属性を補正条件で指定してください。従来の支援型師匠の比較はそのまま計算できます。','hsrConditionDialogOpen');
      if(attack.shifuElement && attack.shifuElement!=='Imaginary') for(const [key,label] of [['element-damage:1224:'+attack.shifuElement,'なのかの師匠属性与ダメージ'],['enemy-resistance:'+attack.shifuElement,'敵の師匠属性耐性']]) if(!Number.isFinite(state.modifierInputs[key])) issue(label+'を入力してください。補正なしは0です。','hsrConditionDialogOpen');
    }
    if (attack.rejectNormalOnlyModifiers) {
      const base = {id:"120701",type:"normal",attackType:"normal",element:"Imaginary"};
      const reason = window.HsrCalcEngine.normalOnlyModifierReason(allConditions().filter(item=>item.enabled&&!item.displayOnly&&modifierTargetsCalculation(item,base)).map(item=>({...item,applicable:true})));
      if (reason) issue(reason, "hsrConditionDialogOpen");
    }
    if (attack.requiresValidHitCount) {
      const count = attackHitCountInput(attack);
      if (!Number.isInteger(count) || count < attack.hitCountMinimum || count > attack.hitCountMaximum) issue(attack.name + "の攻撃段数に" + attack.hitCountMinimum + "～" + attack.hitCountMaximum + "の整数を補正条件で入力してください。", "hsrConditionDialogOpen");
      if (attack.id === "1206031" && count > 1 && state.modifierInputs["sushang-sword-stance-stacks"] !== 10) issue("複数の追加剣勢は逐寇が事前10層で飽和した状態のみ計算対応です。単発は判定時点の有効層を指定できます。", "hsrConditionDialogOpen");
    }
    if (["1513022","1513032"].includes(attack.id) && (attack.hasOtherElation!==true || attack.startingFervor!==0)) issue("この合計は他の愉悦キャラ編成・攻撃前の熱気0のみ対応です。", "hsrElationSettings");
    if (attack.requiresNonWeakTarget && state.enemy.weakness) issue(`${attack.name}は今回、${ELEMENT_KEYS[attack.element] || "対応する"}属性が弱点ではない敵のみ計算対応です。属性弱点を「弱点なし」にしてください。`, "hsrWeakness");
    if ((attack.requiredWeakTarget || attack.requiresFireWeakness) && !state.enemy.weakness) issue(attack.name+"は攻撃前から対応属性が弱点の敵を想定します。属性弱点を確認してください。", "hsrWeakness");
    if (attack.requiresBrokenTarget && state.enemy.toughnessActive) issue(attack.name+'は攻撃前から撃破済みの敵を想定します。靭性状態を撃破済みにしてください。','hsrToughnessState');
    if (attack.requiredToughnessActive && !state.enemy.toughnessActive) issue(`${attack.name}は今回、未撃破の敵のみ計算対応です。靭性状態を「靭性あり」にしてください。`, "hsrToughnessState");
    if (attack.maximumEidolon !== undefined && state.eidolon > attack.maximumEidolon) issue(`${attack.name}：選択中は星魂${state.eidolon}です。計算対応は星魂0～${attack.maximumEidolon}です。${attack.unsupportedEidolonReason || "この星魂で変化する倍率・固有効果は未検証です。"} 星魂0相当へ置き換えず、この攻撃の結果を停止します。`, "hsrEidolon");
    if (attack.requiresLivingHpSnapshot) {
      if (!(Number.isFinite(state.stats.hp) && state.stats.hp > 0)) issue('アーランのHP下限を確認するため、最終最大HPに0より大きい数値を入力してください。', 'hsrStat-hp');
      if (!(Number.isFinite(state.stats.hpPercent) && state.stats.hpPercent > 0 && state.stats.hpPercent <= 100)) issue('ダメージ発生時の現在HP割合に0より大きく100以下の数値を入力してください。スキルはHP消費後の値です。', 'hsrStat-hpPercent');
      else if (state.stats.hp * state.stats.hpPercent / 100 < 1 - 1e-9) issue('ダメージ発生時の現在HPは1HP以上必要です。スキルは消費後の値を入力してください。', 'hsrStat-hpPercent');
    }
    if (attack.hpPercentMaximum !== undefined && state.stats.hpPercent > attack.hpPercentMaximum) issue("この攻撃は現在HP" + attack.hpPercentMaximum + "%以下の場合のみ計算対応です。", "hsrStat-hpPercent");
    if (attack.enemyHpPercentMaximum !== undefined && state.enemy.hpPercent > attack.enemyHpPercentMaximum) issue("この攻撃は敵HP" + attack.enemyHpPercentMaximum + "%以下の場合のみ計算対応です。", "hsrEnemyHpPercent");
    if (attack.enemyDebuffMinimum !== undefined && state.enemy.debuffCount < attack.enemyDebuffMinimum) issue("敵のデバフ数に" + attack.enemyDebuffMinimum + "以上を指定してください。", "hsrEnemyDebuffCount");
    if (attack.enemyCountExact !== undefined && state.enemy.count !== attack.enemyCountExact) issue("この攻撃は敵" + attack.enemyCountExact + "体の条件のみ計算対応です。", "hsrEnemyCount");
    if (attack.enemyCountMinimum !== undefined && state.enemy.count < attack.enemyCountMinimum) issue("この攻撃は敵" + attack.enemyCountMinimum + "体以上の条件のみ計算対応です。", "hsrEnemyCount");
    for (const input of attack.numericModifierInputs || []) {
      const value = input.inputKey === "fudie-gluttony-stacks" && Number.isInteger(attack.fudieEffectiveStacks) ? attack.fudieEffectiveStacks : state.modifierInputs[input.inputKey] === undefined ? input.default : state.modifierInputs[input.inputKey];
      if (!Number.isFinite(value) || value < input.minimum || value > input.maximum || (input.integer && !Number.isInteger(value))) issue(`${input.label}に${input.minimum}～${input.maximum}の数値を入力してください。`, "hsrConditionDialogOpen");
    }
    for (const id of (attack.damageFormula === "nativeBreakSequence" && attack.type !== "superBreak" ? [] : attack.requiredModifierIds || [])) {
      const required = modifiers(attack).map(item => ["1504032","1504033","150404"].includes(attack.id) && item.id === "traceNode:1504:1504102:follow-up-stacks" && item.value === 0 && (attack.fudieEffectiveStacks ?? state.modifierInputs["fudie-gluttony-stacks"]) === 0 ? {...item,enabled:true,applicable:true,matchesAttack:true} : item).filter(item => item.id === id && (item.enabled && item.matchesAttack || ["140803","140809","140811","150402","150403","1504031","1504032","1504033","150404","131718"].includes(attack.id) && item.includedInFinalStats));
      if (required.length !== 1 || (!required[0].inputWarnings?.length && (!required[0].includedInFinalStats && (!required[0].applicable || !Number.isFinite(required[0].value))))) issue(`${attack.name}の固有補正を読み込めませんでした。ページを再読み込みしてください。`);
    }
    const conditions = [...(attack.modifierConditions || [])];
    if (attack.modifierInputKey && !comparisonCondition(attack)) conditions.push({ inputKey: attack.modifierInputKey, minimum: attack.modifierInputMinimum ?? 0, default: attack.modifierInputDefault ?? 0 });
    for (const condition of conditions) {
      if (num(state.modifierInputs[condition.inputKey], condition.default || 0) >= num(condition.minimum, 1)) continue;
      const record = state.data.structuredModifiers?.find(item => item.activation?.inputKey === condition.inputKey);
      issue((record?.activation.inputLabel || record?.name || "攻撃の計算条件") + "を補正条件で設定してください。", "hsrConditionDialogOpen");
    }
  }

  function renderAttacks() {
    const attacks = availableAttacks();
    $("hsrResultAttackSummary").textContent = `${enemyPreset()?.name || "カスタム敵"} / ${attacks.length ? `${attacks.length}攻撃` : "攻撃データ未選択"}`;
  }

  function selectionItems(type) {
    if (type === "character" || type === "party") { const items = state.data.characters.filter((item) => type !== "party" || (item.id !== state.characterId && !state.party.some((member, index) => index !== state.partySlot && member.characterId === item.id))); return window.HsrCharacterOrder?.sort(items) || items; }
    if (type === "cone") { const owner = state.partySlot >= 0 ? find("characters", state.party[state.partySlot]?.characterId) : character(); return state.data.lightCones.filter((item) => !owner || item.path === owner.path); }
    if (type === "relic" || type === "relicSecond") return state.data.relicSets.filter((item) => item.type === "relic");
    if (type === "ornament") return state.data.relicSets.filter((item) => item.type === "ornament");
    if (type === "enemy") return state.data.enemies;
    return [];
  }

  function currentSelectionId() {
    if (state.selectionType === "character") return state.characterId;
    if (state.selectionType === "party") return state.party[state.partySlot]?.characterId || "";
    if (state.partySlot >= 0) return state.party[state.partySlot]?.[({cone:"lightConeId",relic:"relicId",relicSecond:"relicSecondId",ornament:"ornamentId"})[state.selectionType]] || "";
    return state[state.selectionType + "Id"] || "";
  }

  function populateSelectionFilters() {
    state.selectionFilters = { element: new Set(), rarity: new Set(), path: new Set() };
    const items = selectionItems(state.selectionType); const characterMode = ["character", "party"].includes(state.selectionType);
    const group = (label, key, values) => `<div class="genshin-filter-row" role="group" aria-label="${esc(label)}">${[...new Set(values.filter(Boolean))].sort().map((value) => {
      const element = key === "element" ? items.find((item) => item.elementName === value)?.element : "";
      const content = element ? `<img src="${elementIcon(element)}" alt="" width="30" height="30">` : key === "rarity" ? `★${esc(value)}` : esc(value);
      return `<button type="button" class="genshin-filter-button${element ? " genshin-filter-button--element" : ""}" data-filter-group="${key}" data-filter-value="${esc(value)}" aria-label="${esc(value)}" title="${esc(value)}" aria-pressed="false">${content}</button>`;
    }).join("")}</div>`;
    const rows = [];
    if (characterMode) {
      rows.push(group("属性", "element", items.map((item) => item.elementName)));
      rows.push(group("レアリティ", "rarity", items.map((item) => String(item.rarity))));
      rows.push(group("運命", "path", items.map((item) => item.pathName)));
    } else if (state.selectionType === "cone") {
      // 光円錐は selectionItems() で選択中キャラクターと同じ運命だけに限定済み。
      rows.push(group("レアリティ", "rarity", items.map((item) => String(item.rarity))));
    }
    if (rows.length) rows[rows.length - 1] = rows[rows.length - 1].replace("</div>", '<button type="button" class="genshin-filter-toggle-all" id="hsrFilterClear" disabled>フィルタ解除</button></div>');
    const filterWrap = $("hsrSelectionFilters");
    filterWrap.innerHTML = rows.join("");
    filterWrap.hidden = rows.length === 0;
  }

  function renderSelectionList() {
    const query = normalizeSearchText($("hsrSelectionSearch").value);
    const { element, rarity, path } = state.selectionFilters;
    const items = selectionItems(state.selectionType).filter((item) => (!query || searchText(item).includes(query)) && (!element.size || element.has(item.elementName)) && (!rarity.size || rarity.has(String(item.rarity))) && (!path.size || path.has(item.pathName || item.type)));
    const canClear = ["cone", "relic", "relicSecond", "ornament", "party"].includes(state.selectionType);
    const clearCard = canClear ? `<button type="button" class="genshin-selection-option" data-selection-id=""><img class="genshin-selection-option-image" src="${FALLBACK}" alt="" width="48" height="48" loading="lazy"><span class="genshin-selection-option-copy"><strong>選択しない</strong><span>設定を解除</span></span></button>` : "";
    const cards = items.map((item) => { const element = item.element ? `<span class="genshin-selection-option-badges"><img class="genshin-selection-element-icon" src="${elementIcon(item.element)}" alt="${esc(item.elementName)}" width="20" height="20"></span>` : ""; const meta = state.selectionType === "enemy" ? `Lv${item.level} / 耐性${item.resistance}% / 最大靭性${item.maxToughness}` : item.elementName ? `${item.pathName} / ★${item.rarity}` : `${item.pathName || (item.type === "ornament" ? "オーナメント" : "遺物")} / ★${item.rarity || "-"}`; const kind = ["relic", "relicSecond", "ornament"].includes(state.selectionType) ? "artifact" : state.selectionType; return `<button type="button" class="genshin-selection-option${item.id === currentSelectionId() ? " is-selected" : ""}" data-selection-id="${item.id}" data-selection-kind="${kind}"${item.rarity ? ` data-rarity="${item.rarity}"` : ""} aria-label="${esc(`${item.name}、${item.elementName || meta}`)}"><img class="genshin-selection-option-image" src="${esc(imageUrl(item.image))}" alt="" width="48" height="48" loading="lazy">${element}<span class="genshin-selection-option-copy"><strong>${esc(item.name)}</strong><span>${esc(meta)}</span></span></button>`; }).join("");
    const hasFilters = !$("hsrSelectionFilters").hidden;
    const characterMode = state.selectionType === "party";
    const uidCards = characterMode ? profileCharacters.flatMap((profile, index) => {
      const item = items.find((entry) => String(entry.id) === String(profile.id));
      return item ? [`<button type="button" class="genshin-selection-option" data-selection-id="${esc(item.id)}" data-selection-profile="${index}"><img class="genshin-selection-option-image" src="${esc(imageUrl(item.image))}" alt="" width="48" height="48"><span class="genshin-selection-option-copy"><strong>${esc(item.name)}</strong><span>UID取得・Lv${esc(profile.level)}／星魂${esc(profile.eidolon)}</span></span></button>`] : [];
    }).join("") : "";
    $("hsrSelectionList").innerHTML = (uidCards ? `<h3 class="hsr-selection-section-title">UIDから取得したキャラクター</h3>${uidCards}<h3 class="hsr-selection-section-title">キャラクター一覧（手動設定）</h3>` : "") + clearCard + cards || `<p class="genshin-selection-empty">${hasFilters ? "条件に一致する候補がありません。フィルターを切り替えてください。" : "名前に一致する候補がありません。検索内容を確認してください。"}</p>`;
    const selectedCharacter = state.partySlot >= 0 ? find("characters", state.party[state.partySlot]?.characterId) : character();
    $("hsrSelectionSummary").textContent = state.selectionType === "cone" && selectedCharacter ? `${selectedCharacter.name}が装備できる「${selectedCharacter.pathName}」の光円錐・${items.length}件` : `${items.length}件を表示`;
    $("hsrSelectionList").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  function openSelection(type, slot = -1) {
    state.selectionType = type; state.partySlot = slot;
    const labels = { character: "キャラクター", party: "パーティメンバー", cone: "光円錐", relic: "遺物", relicSecond: "2つ目の遺物セット", ornament: "次元界オーナメント", enemy: "敵" };
    const kickers = { character: "CHARACTER", party: "CHARACTER", cone: "LIGHT CONE", relic: "RELIC SET", relicSecond: "RELIC SET", ornament: "PLANAR ORNAMENT", enemy: "ENEMY" };
    $("hsrSelectionKicker").textContent = kickers[type];
    $("hsrSelectionTitle").textContent = `${labels[type]}を選択`;
    const selectionDialog = $("hsrSelectionDialog");
    selectionDialog.dataset.selectionType = type;
    selectionDialog.classList.remove("is-character", "is-weapon", "is-artifact", "is-enemy");
    selectionDialog.classList.add(["character", "party"].includes(type) ? "is-character" : type === "cone" ? "is-weapon" : ["relic", "relicSecond", "ornament"].includes(type) ? "is-artifact" : "is-enemy");
    $("hsrSelectionSearch").value = ""; $("hsrSelectionSearchClear").disabled = true; populateSelectionFilters(); renderSelectionList();
    openModal($("hsrSelectionDialog"));
    if (window.matchMedia("(min-width: 769px)").matches) $("hsrSelectionSearch").focus();
  }

  function openModal(dialog) {
    if (!dialog?.open) dialog.showModal();
    document.body.classList.add("modal-open");
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("modal-open");
  }

  function chooseSelection(id, profileIndex) {
    const type = state.selectionType;
    const profile = profileIndex !== undefined ? profileCharacters[Number(profileIndex)] : null;
    if (profile && type === "character") { applyProfileCharacter(profile); closeDialog($("hsrSelectionDialog")); return; }
    if (state.partySlot >= 0 && type !== "party") {
      const member = state.party[state.partySlot];
      member[({cone:"lightConeId",relic:"relicId",relicSecond:"relicSecondId",ornament:"ornamentId"})[type]] = id;
      member.source = "manual"; renderPartyDialog(); renderPartySummary(); updateConditionSummary();
      closeDialog($("hsrSelectionDialog")); markDirty(); return;
    }
    if (type === "party") {
      const member = state.party[state.partySlot]; member.characterId = id; member.eidolon = 0; member.level = 10; member.atk = 0; member.critDamage = 50; member.breakEffect = NaN; member.speed = NaN; member.effectRes = NaN; member.lightConeId = ""; member.coneRank = 1; member.relicId = ""; member.relicSecondId = ""; member.relicMode = "4pc"; member.ornamentId = ""; member.source = "manual"; member.traceLevels = Object.fromEntries(partyTraceRequirements(member).map(key => [key, Math.min(10,supportTraceMaximum(member,key))])); if (profile) applyPartyProfile(member, profile); renderPartyDialog(); renderPartySummary(); updateConditionSummary();
    } else if (type === "enemy") {
      applyEnemy(id);
    } else {
      state[type + "Id"] = id;
      if (type === "character") state.coneId = "";
      if (["character", "cone", "relic", "relicSecond", "ornament"].includes(type) && state.source === "api") state.source = "api-edited";
      renderBuild();
    }
    closeDialog($("hsrSelectionDialog")); markDirty();
    if (type === "character") renderAttackPreview();
  }

  function profileTraceLevels(profile) {
    return Object.fromEntries(Object.entries(TRACE_FIELDS).map(([key, [type]]) => [key, profile.traces?.find((item) => item.type === type)?.level ?? NaN]));
  }
  function applyPartyProfile(member, profile) {
    const sets = profile.relicSets || [], tunnels = sets.filter((item) => num(item.id) < 300);
    Object.assign(member, { eidolon: num(profile.eidolon), level: 10, atk: profile.stats?.atk ?? NaN,
      critDamage: profile.stats?.critDamage ?? NaN, breakEffect: profile.stats?.breakEffect ?? NaN,
      speed: profile.stats?.speed ?? NaN, effectRes: profile.stats?.effectRes ?? NaN,
      lightConeId: find("lightCones", String(profile.lightCone?.id || ""))?.id || "", coneRank: profile.lightCone?.rank ?? 1,
      relicId: find("relicSets", String(tunnels[0]?.id || ""))?.id || "", relicSecondId: find("relicSets", String(tunnels[1]?.id || ""))?.id || "",
      relicMode: tunnels.length > 1 ? "2+2" : "4pc", ornamentId: find("relicSets", String(sets.find((item) => num(item.id) >= 300)?.id || ""))?.id || "",
      source: "api", traceLevels: profileTraceLevels(profile) });
    if (member.characterId === "1512") state.modifierInputs["robin-songbirds-talent-level"] = member.traceLevels.memTalent;
  }
  function partyEquipment(member, index) {
    return [["cone", "lightCones", member.lightConeId, "光円錐"], ["relic", "relicSets", member.relicId, "遺物"],
      ...(member.relicMode === "2+2" ? [["relicSecond", "relicSets", member.relicSecondId, "2つ目の遺物"]] : []), ["ornament", "relicSets", member.ornamentId, "オーナメント"]]
      .map(([type, collection, id, label]) => { const item = find(collection, id); return `<button type="button" class="genshin-party-pick hsr-party-equipment-pick" data-party-equipment="${type}" data-slot="${index}"${member.characterId ? "" : " disabled"}><img src="${esc(imageUrl(item?.image))}" alt="" width="40" height="40"><span><small>${label}</small><strong>${esc(item?.name || "選択する")}</strong></span></button>`; }).join("");
  }
  function orderedParty() {
    const members = state.party.map((member, index) => ({ ...member, supportIndex: index }));
    members.splice(state.attackerPosition - 1, 0, { characterId: state.characterId, lightConeId: state.coneId, relicId: state.relicId, relicSecondId: state.relicSecondId, relicMode: state.relicMode, ornamentId: state.ornamentId, source: state.source, attacker: true });
    return members;
  }

  function supportTraceKey(source) {
    if(source.id==="1510"&&["151025","151026"].includes(source.skillId))return "talent";
    if(['8007','8008'].includes(source.id)&&['1800701','1800703','1800707'].includes(source.skillId))return source.skillId==='1800703'?'memTalent':'memSkill';
    if(source.id==='1415'&&['1141517','1141524','1141513','1141525','1141514','1141515','1141516','1141518','1141520','1141521','1141522','1141523'].includes(source.skillId))return 'memSkill';
    const skill = find("characters", String(source.id))?.skills?.find(item => String(item.id) === String(source.skillId));
    return Object.entries(TRACE_FIELDS).find(([, [type]]) => type === skill?.type)?.[0];
  }

  function supportTraceLevel(member, key) {
    if (!key) return NaN;
    if (Object.hasOwn(member.traceLevels || {}, key)) return member.traceLevels[key];
    // The shared value is a legacy manual setting, never a UID fallback.
    return member.source === "api" ? NaN : ["memSkill","memTalent"].includes(key) ? Math.min(Number(member.level),supportTraceMaximum(member,key)) : Number(member.level);
  }

  function supportTraceMaximum(member, key) {
    const provider = find("characters", member.characterId);
    const skill = provider?.skills?.find(item => item.type === TRACE_FIELDS[key]?.[0] && item.params?.length);
    const bonus = (provider?.eidolons || []).filter(rank => rank.rank <= Number(member.eidolon || 0)).flatMap(rank => rank.levelUpSkills || [])
      .filter(entry => String(entry.id) === String(skill?.id)).reduce((sum, entry) => sum + Number(entry.num || 0), 0);
    return Math.min((TRACE_FIELDS[key]?.[3] || 10) + bonus, skill?.params?.length || 15);
  }

  function partyTraceRequirements(member) {
    if (!member.characterId) return [];
    const context = structuredModifierContext();
    const keys = new Set((state.data.structuredModifiers || []).filter(record =>
      String(record.source?.id) === String(member.characterId) && record.source?.skillId
      && /byLevel/i.test(record.value?.kind || "") && !record.value?.levelInputKey
      && record.support?.status === "calculable" && record.inputPolicy !== "includedInFinalStats"
      && window.HsrModifierRuntime.sourceSelection(record, context).selected
    ).map(record => supportTraceKey(record.source)).filter(Boolean));
    return [...keys];
  }

  function partyTraceFields(member, index) {
    return partyTraceRequirements(member).map(key => {
      const value = supportTraceLevel(member, key);
      return `<label><span>${TRACE_FIELDS[key][2]}Lv${member.source === "api" ? "（UID）" : ""}</span><input type="number" min="1" max="${supportTraceMaximum(member, key)}" step="1" data-party-trace="${key}" data-slot="${index}" value="${Number.isFinite(value) ? value : ""}"></label>`;
    }).join("");
  }

  function renderPartyDialog() {
    $("hsrAttackerPosition").value = String(state.attackerPosition);
    $("hsrPartyRows").innerHTML = state.party.map((member, index) => {
      const item = find("characters", member.characterId);
      return `<section class="genshin-party-member"><div class="genshin-party-member-head"><h3>編成${orderedParty().findIndex((entry) => entry.supportIndex === index) + 1} ${member.source === "api" ? "・UID" : ""}</h3><span class="hsr-party-order-actions"><button type="button" data-party-move="-1" data-slot="${index}"${index === 0 ? " disabled" : ""} aria-label="前のサポート枠へ">↑</button><button type="button" data-party-move="1" data-slot="${index}"${index === 2 ? " disabled" : ""} aria-label="次のサポート枠へ">↓</button></span><button type="button" class="genshin-party-clear" data-party-clear="${index}"${item ? "" : " disabled"}>解除</button></div><div class="genshin-party-equipment-row hsr-party-equipment-row"><button type="button" class="genshin-party-pick" data-party-select="${index}" aria-haspopup="dialog" aria-controls="hsrSelectionDialog"><img src="${esc(imageUrl(item?.image))}" alt="" width="56" height="56" loading="lazy"><span><small>キャラクター</small><strong>${esc(item?.name || "選択する")}</strong></span></button>${partyEquipment(member, index)}</div><div class="genshin-party-basic-fields hsr-party-fields"><label><span>星魂</span><select data-party-field="eidolon" data-slot="${index}"${item ? "" : " disabled"}>${Array.from({ length: 7 }, (_, rank) => `<option value="${rank}"${num(member.eidolon) === rank ? " selected" : ""}>${rank}</option>`).join("")}</select></label>${partyTraceFields(member, index)}<label><span>攻撃力</span><input type="number" min="0" max="99999" step="1" data-party-field="atk" data-slot="${index}" value="${statDisplay("atk", member.atk)}" data-party-original="${esc(Number.isFinite(member.atk) ? member.atk : "")}"${item ? "" : " disabled"}></label><label><span>会心ダメージ</span><span class="genshin-condition-input-unit"><input type="number" min="0" max="500" step="0.1" data-party-field="critDamage" data-slot="${index}" value="${statDisplay("critDamage", member.critDamage)}" data-party-original="${esc(Number.isFinite(member.critDamage) ? member.critDamage : "")}"${item ? "" : " disabled"}><em>%</em></span></label><label><span>撃破特効</span><span class="genshin-condition-input-unit"><input type="number" min="0" max="500" step="0.1" data-party-field="breakEffect" data-slot="${index}" value="${statDisplay("breakEffect", member.breakEffect)}" data-party-original="${esc(Number.isFinite(member.breakEffect) ? member.breakEffect : "")}"${item ? "" : " disabled"}><em>%</em></span></label><label><span>速度（支援判定値）</span><input type="number" min="0" max="99999" step="0.1" data-party-field="speed" data-slot="${index}" value="${Number.isFinite(member.speed) ? statDisplay("speed", member.speed) : ""}" data-party-original="${esc(Number.isFinite(member.speed) ? member.speed : "")}"${item ? "" : " disabled"}></label><label><span>効果抵抗（%）</span><input type="number" min="0" max="99999" step="0.1" data-party-field="effectRes" data-slot="${index}" value="${Number.isFinite(member.effectRes) ? statDisplay("effectRes", member.effectRes) : ""}" data-party-original="${esc(Number.isFinite(member.effectRes) ? member.effectRes : "")}"${item ? "" : " disabled"}></label><label><span>重畳</span><select data-party-field="coneRank" data-slot="${index}"${item && member.lightConeId ? "" : " disabled"}>${Array.from({ length: 5 }, (_, rank) => `<option value="${rank + 1}"${num(member.coneRank, 1) === rank + 1 ? " selected" : ""}>${rank + 1}</option>`).join("")}</select></label><label><span>遺物構成</span><select data-party-field="relicMode" data-slot="${index}"${item ? "" : " disabled"}><option value="4pc"${member.relicMode === "4pc" ? " selected" : ""}>4セット</option><option value="2+2"${member.relicMode === "2+2" ? " selected" : ""}>2セット＋2セット</option></select></label></div><p class="genshin-party-base-summary">${item ? "支援効果が参照する本人ステータスと、味方へ作用する装備・軌跡・星魂を設定します。速度は支援を含めた判定値、効果抵抗は最終値を入力してください。" : "キャラクターを選択してください。"}</p></section>`;
    }).join("");
    $("hsrPartyRows").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  function collectParty(redraw = false) {
    $("hsrPartyRows").querySelectorAll("[data-party-field]").forEach((input) => {
      const member = state.party[num(input.dataset.slot)]; const field = input.dataset.partyField;
      if (input.dataset.partyOriginal !== undefined && input.value === statDisplay(field, member[field])) return;
      member[field] = input.type === "checkbox" ? input.checked : field === "value" ? num(input.value) : input.value;
    });
    $("hsrPartyRows").querySelectorAll("[data-party-trace]").forEach((input) => { const member = state.party[Number(input.dataset.slot)]; member.traceLevels[input.dataset.partyTrace] = input.value === "" ? NaN : Number(input.value); });
    state.party.forEach((member) => { member.level = num(member.level, 10); member.eidolon = num(member.eidolon, 0); member.coneRank = num(member.coneRank, 1); member.atk = member.atk === "" ? NaN : Number(member.atk); member.critDamage = member.critDamage === "" ? NaN : Number(member.critDamage); member.breakEffect = member.breakEffect === "" ? NaN : Number(member.breakEffect); member.speed = member.speed === "" || member.speed == null ? NaN : Number(member.speed); member.effectRes = member.effectRes === "" || member.effectRes == null ? NaN : Number(member.effectRes); });
    if (redraw) renderPartyDialog();
    renderPartySummary(); updateConditionSummary(); markDirty();
  }

  function renderPartySummary() {

    const ordered = orderedParty();
    $("hsrPartySummary").textContent = ordered.filter((member) => member.characterId).map((member, i) => `${ordered.indexOf(member)+1}. ${find("characters", member.characterId)?.name || member.characterId}${member.attacker ? "（計算対象）" : ""}`).join("、") || "サポートメンバーは未設定です。";
    $("hsrPartyPreview").innerHTML = ordered.map((member, index) => {
      const item = find("characters", member.characterId);
      const equipment = [find("lightCones", member.lightConeId), find("relicSets", member.relicId), ...(member.relicMode === "2+2" ? [find("relicSets", member.relicSecondId)] : []), find("relicSets", member.ornamentId)];
      const uid = member.source === "api" || member.source === "api-edited";
      return `<button type="button" class="genshin-party-preview-member" data-party-preview-slot="${index+1}" aria-haspopup="dialog" aria-controls="hsrPartyDialog" aria-label="編成${index+1}：${esc(item?.name || "未選択")}、パーティ設定を開く">${uid ? '<span class="genshin-party-uid-mark" title="UIDから取得">UID</span>' : ""}<img class="genshin-party-preview-character" src="${esc(imageUrl(item?.image))}" alt="${esc(item?.name || "キャラクター未選択")}" width="56" height="56"><div class="genshin-party-preview-equipment">${equipment.map((entry) => `<img class="genshin-party-preview-icon" src="${esc(imageUrl(entry?.image))}" alt="${esc(entry?.name || "装備未選択")}" title="${esc(entry?.name || "装備未選択")}" width="32" height="32">`).join("")}</div><strong>${esc(item?.name || "未選択")}</strong><small>編成${index+1}${member.attacker ? "・計算対象" : "・サポート"}</small></button>`;
    }).join("");
    $("hsrPartyPreview").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  const CONDITION_TAB_ORDER = ["パーティ", "光円錐", "遺物・オーナメント", "軌跡"];
  const CONDITION_TAB_META = {
    "パーティ": { title: "この編成の補正候補", source: "PARTY", subtitle: "提供者と対象を確認し、成立している効果だけONにしてください。" },
    "光円錐": { title: "光円錐補正", source: "LIGHT CONE", subtitle: "装備中の光円錐効果と現在の反映を確認" },
    "遺物・オーナメント": { title: "遺物・オーナメント補正", source: "RELIC", subtitle: "セット効果の発動条件と現在の反映を確認" },
    "軌跡": { title: "軌跡・星魂補正", source: "TRACE", subtitle: "発動条件と現在の反映を確認" },
    "その他": { title: "その他の補正", source: "OTHER", subtitle: "敵条件と手動補正を確認" }
  };

  function selectedBaseStats() {
    const selectedCharacter = character(); const selectedCone = cone();
    if ((state.coneId && !selectedCone) || !selectedCharacter || state.level !== 80 || (selectedCone && state.coneLevel !== 80)) return {};
    const base = {};
    ["hp", "atk", "def", "speed"].forEach((stat) => {
      const characterValue = selectedCharacter.base?.[stat];
      const coneValue = !selectedCone ? 0 : stat === "speed"
        ? (selectedCone.path === selectedCharacter.path ? (selectedCone.effect?.propertiesByRank?.[state.coneRank - 1] || []).filter((item) => item.type === "BaseSpeed").reduce((sum, item) => sum + Number(item.value), 0) : 0)
        : selectedCone.base?.[stat];
      if (characterValue != null && coneValue != null && Number.isFinite(Number(characterValue)) && Number.isFinite(Number(coneValue))) base[stat] = Number(characterValue) + Number(coneValue);
    });
    return base;
  }

  function structuredModifierContext() {
    const partyIds = state.party.map((member) => member.characterId).filter(Boolean);
    const sourceNameFor = (kind, id) => {
      if (["character", "trace", "eidolon"].includes(kind)) return find("characters", id)?.name || id;
      if (kind === "lightCone") return find("lightCones", id)?.name || id;
      if (["relic", "ornament"].includes(kind)) return find("relicSets", id)?.name || id;
      return id;
    };
    const traceLevelFor = (source) => {
      const provider = find("characters", source.id);
      const skill = provider?.skills?.find((item) => String(item.id) === String(source.skillId));
      if (String(source.id) === String(state.characterId) && skill) return skillLevel(skill);
      if (String(source.id) === String(state.characterId) && supportTraceKey(source)) return state.traceLevels[supportTraceKey(source)];
      const member = state.party.find((item) => String(item.characterId) === String(source.id));
      if (!member) return 10;
      const key = supportTraceKey(source);
      return supportTraceLevel(member, key);
    };
    return {
      characterId: state.characterId,
      characterElement: character()?.element,
      partyReferences:selectedPartyReferences(),
      eidolon: state.eidolon,
      lightConeId: state.coneId,
      refinement: state.coneRank,
      relicIds: [state.relicId, state.relicMode === "2+2" ? state.relicSecondId : ""].filter(Boolean),
      relicMode: state.relicMode === "4pc" ? 4 : 2,
      ornamentId: state.ornamentId,
      enhancementState: state.enhancementState,
      partyIds,
      partyOrder: orderedParty().map(member => String(member.characterId || "")),
      partyElements: Object.fromEntries([state.characterId, ...partyIds].map(id => [id, find("characters", id)?.element])),
      partyPaths: Object.fromEntries([state.characterId, ...partyIds].map((id) => [id, find("characters", id)?.path])),
      partyEidolons: Object.fromEntries(state.party.filter((member) => member.characterId).map((member) => [String(member.characterId), num(member.eidolon, 0)])),
      partyStats: Object.fromEntries(state.party.filter((member) => member.characterId).map((member) => [String(member.characterId), { atk: num(member.atk), critDamage: num(member.critDamage, 50), breakEffect: Number.isFinite(member.breakEffect) ? member.breakEffect : NaN, speed: Number.isFinite(member.speed) ? member.speed : NaN, effectRes: Number.isFinite(member.effectRes) ? member.effectRes : NaN }])),
      baseStats: selectedBaseStats(),
      partyEquipment: state.party.filter((member) => member.characterId).map((member) => ({
        characterId: member.characterId,
        lightConeId: member.lightConeId,
        refinement: num(member.coneRank, 1),
        relicIds: [member.relicId, member.relicMode === "2+2" ? member.relicSecondId : ""].filter(Boolean),
        relicMode: member.relicMode === "4pc" ? 4 : 2,
        ornamentId: member.ornamentId
      })),
      stats: state.stats,
      enemy: state.enemy,
      party: { sp: state.partySp, punchline: state.elationInputs.punchline },
      traceLevelFor,
      sourceNameFor
    };
  }

  function validateProvider(item) {
    const source = item.sourceMeta || item.source;
    if (source?.kind === "relic" && String(source.id) === "128" && item.enabled && !item.displayOnly) {
      const providers = [state.relicMode === "4pc" && state.relicId === "128", ...state.party.map(member => member.characterId && member.relicMode === "4pc" && member.relicId === "128")].filter(Boolean).length;
      if (providers > 1) return { ...item, enabled: false, applicable: false, activation: { ...item.activation, unresolved: true, unresolvedReason: "同じセットの複数提供者がいる場合のバリア支援は条件未確定です。" } };
    }
    if (source?.kind === "lightCone" && String(source.id) === "21053" && item.enabled && !item.displayOnly) {
      const providers = [state.coneId === "21053", ...state.party.map(member => member.characterId && member.lightConeId === "21053")].filter(Boolean).length;
      if (providers > 1) return { ...item, enabled: false, applicable: false, activation: { ...item.activation, unresolved: true, unresolvedReason: "同じ光円錐の複数提供者によるバリア支援は条件未確定のため追加しません。" } };
    }
    if (source?.kind === "lightCone" && item.enabled && !item.displayOnly) {
      const wearer = item.providerId ? find("characters", item.providerId) : character();
      const equipped = find("lightCones", String(source.id));
      if (wearer?.path && equipped?.path && wearer.path !== equipped.path) return { ...item, applicable: false, inputWarnings: [...(item.inputWarnings || []), "光円錐の運命が装備者と一致しません。装備を確認してください。"] };
    }
    if (item.id === "trace:1215:121503:ultimate-speed" && item.enabled && !item.displayOnly) {
      const speed = item.providerId === state.characterId ? state.stats.speed : state.party.find(m => m.characterId === item.providerId)?.speed;
      if (!Number.isFinite(speed) || speed <= 0) return {...item,enabled:false,applicable:false,activation:{...item.activation,unresolved:true,unresolvedReason:"寒鴉の必殺発動時として指定する速度を編成欄へ入力してください。"}};
    }
    // This fixed trace has no skill-level input; only its provider ATK is required.
    if (item.id === "traceNode:1414:1414101:partner-atk" && item.enabled && !item.displayOnly) {
      const providerAtk = item.providerId === state.characterId ? state.stats.atk : state.party.find(member => member.characterId === item.providerId)?.atk;
      if (!Number.isFinite(providerAtk) || providerAtk <= 0) return { ...item, enabled: false, applicable: false, activation: { ...item.activation, unresolved: true, unresolvedReason: "丹恒・騰荒の攻撃力が未確定のため、この支援は追加しません。編成の攻撃力を入力してください。" } };
    }
    const provider = state.party.find((member) => member.characterId === item.providerId);
    if (!provider || item.displayOnly || !item.enabled) return item;
    const warnings = [...(item.inputWarnings || [])];
    const record = state.data.structuredModifiers.find((entry) => entry.id === item.id);
    if (record?.source?.skillId && !record.value?.levelInputKey && /byLevel/i.test(record.value?.kind || "")) {
      const level = structuredModifierContext().traceLevelFor(record.source);
      const key = supportTraceKey(record.source);
      const levelMaximumAtEidolon = record.inputValidation?.levelMaximumAtEidolon;
      const validationMaximum = levelMaximumAtEidolon && num(provider.eidolon) >= num(levelMaximumAtEidolon.rank)
        ? num(levelMaximumAtEidolon.maximum, record.inputValidation?.levelMaximum || 15)
        : (record.inputValidation?.levelMaximum || 15);
      const maximum = Math.min(validationMaximum, supportTraceMaximum(provider, key));
      if (!Number.isInteger(level) || level < 1 || level > maximum) warnings.push(`${item.source}の${TRACE_FIELDS[key]?.[2] || "軌跡"}Lvに1～${maximum}の整数を入力してください。`);
    }
    const stat = item.valueInput?.providerStat;
    const valueInput = stat ? { ...item.valueInput, value: provider[stat] } : item.valueInput;
    if (stat && !Number.isFinite(provider[stat])) warnings.push(`${item.source}の${item.valueInput.label}が未入力です。パーティ設定で入力してください。`);
    return { ...item, valueInput, inputWarnings: warnings, applicable: item.applicable !== false && warnings.length === 0 };
  }

  function comparisonInputValues(key) {
    if (!key) return [];
    return availableAttacks().filter(a => a.maximumEidolon === undefined || state.eidolon <= a.maximumEidolon)
      .flatMap(a => (a.comparisonStates || []).map(v => v.modifierInputs?.[key])).filter(Number.isFinite);
  }

  function structuredSourceConditions(inputs = state.modifierInputs, attack) {
    if (!window.HsrModifierRuntime) return [];
    const brokenSwordStance = state.characterId === "1206" && state.enemy.toughnessActive === false;
    const effectiveInputs = brokenSwordStance ? {...inputs, "sushang-post-ultimate-sword-stance-hits": 2} : inputs;
    const candidates = window.HsrModifierRuntime.buildCandidates(state.data?.structuredModifiers || [], {...structuredModifierContext(), attack, validateCandidate:validateProvider}, effectiveInputs).filter(item=>(item.id!=='trace:1415:1141502:generic-blessing-damage'||['1003','1102'].includes(state.characterId))&&(!item.id.startsWith('trace:1415:1141520:')||state.characterId==='1406')&&(!item.id.startsWith('trace:1415:1141515:')||state.characterId==='1403')&&(!item.id.startsWith('trace:1415:1141514:')||state.characterId==='1402')&&(item.id!=='trace:1415:1141522:serin-damage'||state.characterId==='1410')&&(!item.id.startsWith('trace:1415:1141518:')||state.characterId==='1405')&&(!item.id.startsWith('trace:1415:1141521:')||state.characterId==='1408')&&(item.id!=='trace:1415:1141516:mydei-godslayer-crit-damage'||state.characterId==='1404')&&(!item.id.startsWith('trace:1415:1141517:')||state.characterId==='1407')&&(!item.id.startsWith('trace:1415:1141524:')||state.characterId==='1413')&&(!item.id.startsWith('trace:1415:1141513:')||['8007','8008'].includes(state.characterId))&&(!item.id.startsWith('trace:1415:1141525:')||state.characterId==='1414')&&(item.id!=='trace:1415:1141523:military-merit-crit-damage'||['1003','1102'].includes(state.characterId)&&state.party.some(m=>m.characterId==='1412')&&String(state.modifierInputs['cyrene-merit-recipient'])===state.characterId));
    const nightshadeProviders=nightshadeProviderIds();
    if(nightshadeProviders.length>1){
      const item=candidates.find(m=>m.id==='lightCone:23049:nightshade-memosprite-defense-ignore');
      if(item){item.enabled=false;item.applicable=false;item.activation={...item.activation,active:false,unresolved:true};item.inputWarnings=['複数の夜色提供者による味方精霊の防御無視の合成は未確定です。'];item.reason=item.inputWarnings[0];}
    }
    for(const item of candidates){
      if(item.id==='trace:1415:1141520:cipher-defense-reduction'&&item.enabled&&!item.includedInFinalStats&&![0,1].includes(inputs['cyrene-cipher-patron-state'])){item.applicable=false;item.inputWarnings=['対象のお得意様状態は0または1を入力してください。'];item.reason=item.inputWarnings[0];}
    }
    for(const item of candidates){
      if(!['trace:8007:1800703:mem-crit-damage','trace:8008:1800703:mem-crit-damage'].includes(item.id))continue;
      if(item.providerId===state.characterId&&item.valueInput)item.valueInput={...item.valueInput,shared:true};
      if(['8007','8008'].every(id=>id===state.characterId||state.party.some(m=>m.characterId===id))){item.enabled=false;item.activation={...item.activation,unresolved:true};item.inputWarnings=['記憶開拓者の男女同時編成による同一精霊支援は計算対象外です。'];}
    }
    // Only infer the existing enemy condition from known positive reductions, without feeding threshold outputs back.
    const knownDefenseDown = state.enemy.defenseReduction > 0 || candidates.some(item => item.category === "defenseReduction" && item.value > 0
      && item.enabled && item.applicable !== false && !item.inputWarnings?.length
      && (attack ? window.HsrModifierRuntime.applicableToAttack(item, attack) : item.target?.attackTypes?.includes("all")));
    return candidates.map(item => ["relic:132:4pc:defense-down-crit-damage", "lightCone:21044:enemy-debuff-crit-damage"].includes(item.id) && knownDefenseDown && item.calculable && !item.includedInFinalStats
      ? { ...item, enabled: true, automatic: true, activation: { ...item.activation, mode: "always", active: true, automatic: true }, conditionText: "入力した防御ダウンまたは有効な防御低下補正から自動判定" }
      : item)
      .filter(item => !comparisonSelector(item))
      .map((item) => ({
        ...item,
        comparisonControlled: inputs === state.modifierInputs && !item.displayOnly && (item.activation?.comparisonDerived === true || comparisonInputValues(item.activation?.inputKey).length > 0),
        resultAssumed: inputs === state.modifierInputs && availableAttacks().some(a=>a.enforceSnapshotContract && Object.hasOwn(a.comparisonModifierInputs||{},item.activation?.inputKey)),
        sourceMeta: item.source,
        source: item.sourceName,
        tab: ({ "キャラ": "軌跡", "遺物": "遺物・オーナメント", "オーナメント": "遺物・オーナメント", "敵": "その他", "手動": "その他" })[item.tab] || item.tab,
        appliesTo: item.target?.owner || "self",
        locked: true,
        structured: true,
        stackMax: item.activation?.maximum || item.stacking?.maximumStacks || 1,
        stacks: num(item.activation?.inputValue, item.activation?.default || 0),
        inputKey: item.activation?.inputKey || "",
        inputLabel: item.activation?.inputLabel || "",
        inputMinimum: item.activation?.minimum,
        inputMaximum: item.activation?.maximum
      })).map(item => brokenSwordStance && item.id === "trace:1206:120603:post-ultimate-sword-stance-count"
        ? {...item, automatic:true, comparisonControlled:true, conditionText:"敵が弱点撃破中のため、必殺後の追加剣勢2回を自動採用", activation:{...item.activation, mode:"always", active:true, automatic:true}} : item).map(validateProvider);
  }

  function sourceConditions(inputs = state.modifierInputs, attack) {
    return structuredSourceConditions(inputs, attack);
  }

  function conditionSourceTitle(item) {
    const source = item.sourceMeta || {};
    if (!source.kind) return { type: item.tab === "その他" ? "手動補正" : item.tab, name: item.name };
    if (source.kind === "eidolon") {
      const provider = find("characters", String(source.id)); const eidolon = provider?.eidolons?.find((entry) => num(entry.rank) === num(source.eidolonRank));
      return { type: `星魂${source.eidolonRank}`, name: cleanGameText(eidolon?.name || item.name) };
    }
    if (source.kind === "trace") {
      if (String(item.id || "").startsWith("traceStats:")) {
        const provider = find("characters", String(source.id));
        const trace = provider?.traces?.find((entry) => String(entry.id) === String(source.traceId));
        return { type: "小軌跡", name: cleanGameText(trace?.name || item.name) };
      }
      const provider = find("characters", String(source.id)); const skill = provider?.skills?.find((entry) => String(entry.id) === String(source.skillId || source.traceId));
      if (skill) {
        const labels = { Normal: "通常攻撃", BPSkill: "戦闘スキル", Ultra: "必殺技", Talent: "天賦", Maze: "秘技" };
        return { type: labels[skill.type] || "軌跡", name: cleanGameText(skill.name || item.name) };
      }
      const trace = provider?.traces?.find((entry) => String(entry.id) === String(source.traceId));
      return { type: "追加能力", name: cleanGameText(trace?.name || item.name) };
    }
    if (source.kind === "lightCone") return { type: "光円錐効果", name: item.source };
    if (["relic", "ornament"].includes(source.kind)) return { type: `${source.setPieces || 2}セット効果`, name: item.source };
    if (source.kind === "enemy") return { type: "敵条件", name: item.name };
    return { type: "手動補正", name: item.name };
  }

  function isAttackSelectionCondition(item) {
    return item.displayOnly && item.inputPolicy !== "includedInFinalStats" && Boolean(item.activation?.inputKey)
      && (state.data?.attacks || []).some((attack) => attack.characterId === state.characterId && !attack.hidden
        && attack.support?.status !== "displayOnly" && ((item.activation.mode === "toggle" && attack.modifierInputKey === item.activation.inputKey)
          || (attack.requiresValidHitCount && attack.hitCountInputKey === item.activation.inputKey)));
  }

  function conditionPurpose(item) {
    if (item.comparisonControlled) return "attack";
    if (item.inputPolicy === "includedInFinalStats") return "finalStats";
    const key = item.activation?.inputKey;
    const selectsAttack = key && [...(state.data?.attacks || []),...(state.data?.specialBreakAttacks || [])].some(attack => attack.characterId === state.characterId && !attack.hidden && attack.support?.status !== "displayOnly" && (attack.modifierInputKey === key || attack.numericModifierInputs?.some(spec=>spec.inputKey===key) || (attack.requiresValidHitCount && attack.hitCountInputKey === key)));
    if (selectsAttack) return "attack";
    return item.displayOnly ? "excluded" : "combat";
  }

  const CONDITION_PURPOSES = [
    { id:"attack", title:"攻撃の発動状態・計算対象", help:"実際の発動状態を指定します。この状態に必須の補正も含めて計算します。" },
    { id:"combat", title:"戦闘中に追加する補正", help:"任意の効果は成立時にONにします。装備等の自動判定は現在の条件に従います。" },
    { id:"finalStats", title:"最終ステータスで管理する効果", help:"入力値に含める効果です。ここでは再加算しません。", folded:true },
    { id:"excluded", title:"今回の計算に含めない効果", help:"未対応の効果と、回復・EPなど単発ダメージの計算対象外の効果です。", folded:true }
  ];

  function hasSelectedPartyChoice(item) {
    if (item.tab !== "パーティ" || !item.activation?.inputKey || item.automatic) return false;
    const value = state.modifierInputs[item.activation.inputKey];
    return value === true || (typeof value === "number" && Number.isFinite(value) && value > 0);
  }

  function trackPartySelectionRestore(conditions) {
    const current = new Set(state.party.map(member => member.characterId).filter(id => id && id !== state.characterId));
    if (state.initialized) {
      observedPartyProviders.forEach(id => { if (!current.has(id)) restoredPartySelections.delete(id); });
      current.forEach(id => {
        if (!observedPartyProviders.has(id) && conditions.some(item => item.providerId === id && hasSelectedPartyChoice(item))) restoredPartySelections.add(id);
      });
    }
    observedPartyProviders = current;
    restoredPartySelections.forEach(id => { if (!conditions.some(item => item.providerId === id && hasSelectedPartyChoice(item))) restoredPartySelections.delete(id); });
  }

  function conditionStatus(items) {
    if (items.some(item => item.calculable && item.activation?.unresolved && !item.includedInFinalStats)) return { label: "条件未確定", className: "is-input" };
    const calculated = items.filter(item => !item.displayOnly);
    if (calculated.length && calculated.every(item => item.includedInFinalStats)) return { label: "最終入力に反映済み", className: "is-reflected" };
    if (items.every(item => item.comparisonControlled)) return { label: items.some(item => conditionAudit?.applied.has(item.id)) ? "一部の想定結果に適用" : "結果ごとに自動判定", className: "is-auto" };
    if (items[0]?.tab === "パーティ" && items.some(item => !item.displayOnly) && !items.some(item => conditionAttackScope(item).length || conditionFeedsSpeedThreshold(item))) return { label: "現在の計算対象外", className: "is-inactive" };
    if (items.some((item) => item.enabled && (item.inputWarnings?.length || modifierIssueIds.has(item.id)))) return { label: "入力不足", className: "is-input" };
    if (items.some(conditionFeedsSpeedThreshold)) return { label: items.some(item => item.includedInFinalStats) ? "最終入力で管理" : items.some(item => item.enabled) ? "速度条件に反映" : "候補・OFF", className: items.some(item => item.enabled) ? "is-auto" : "is-inactive" };
    if (items.some(item=>item.resultAssumed && conditionAudit?.applied.has(item.id))) return {label:"一部の想定結果に適用",className:"is-auto"};
    if (items.some(isAttackSelectionCondition)) return items.some((item) => isAttackSelectionCondition(item) && item.activation.active) ? { label: "計算対象", className: "is-auto" } : { label: "対象外", className: "is-inactive" };
    if (items.every((item) => item.displayOnly)) return items.every((item) => item.inputPolicy === "includedInFinalStats") ? { label: "最終入力で管理", className: "is-reflected" } : { label: items.some((item) => item.inputPolicy === "includedInFinalStats") ? "内訳を確認" : "表示のみ", className: "is-display" };
    if (items.some((item) => item.enabled)) {
      if (items.some(item => conditionAudit?.applied.has(item.id))) return { label: "計算に適用済み", className: "is-auto" };
      if (items.some(item => item.enabled && conditionAudit?.skipped.has(item.id))) return { label: "この計算には適用されない", className: "is-inactive" };
      return { label: "選択中", className: "is-auto" };
    }
    if (items.some((item) => item.activation?.mode === "toggleThreshold")) return items.some((item) => item.activation?.toggled) ? { label: "条件未達", className: "is-inactive" } : { label: "条件OFF", className: "is-inactive" };
    if (items.some((item) => ["statThreshold", "numericThreshold"].includes(item.activation?.mode))) return { label: "条件未達", className: "is-inactive" };
    if (items.some((item) => item.activation?.mode === "toggle" && item.activation.active)) return { label: "効果量0・未適用", className: "is-inactive" };
    if (items.some((item) => item.levelInput && item.activation?.active)) return { label: "条件未達", className: "is-inactive" };
    if (items.some((item) => ["toggle", "stack"].includes(item.activation?.mode))) return { label: items[0]?.tab === "パーティ" ? "候補・OFF" : "条件OFF", className: "is-inactive" };
    return { label: "条件を設定", className: "is-input" };
  }

  function conditionRequirement(item) {
    if (item.comparisonControlled) return item.conditionText + (item.activation?.comparisonDerived ? "（各結果の想定状態・編成で判定）" : "（各結果の想定段数で判定）");
    const activation = item.activation || {};
    if (!["statThreshold", "numericThreshold", "toggleThreshold"].includes(activation.mode)) return item.conditionText || "常時";
    if (activation.mode === "numericThreshold" && activation.inputKey) {
      const precombat = activation.reference === "self.preCombatSpeed";
      const numericLabels = { "self.maxEnergy": ["現在の最大EP", ""], "self.preCombatMaxEnergy": ["戦闘開始時の最大EP", ""], "party.fieldCount": ["場の味方ターゲット数", "体"] };
      if (numericLabels[activation.reference]) { const [label, unit] = numericLabels[activation.reference]; return `${item.conditionText || "入力条件"}（${label}：${Number.isFinite(activation.inputValue) ? detailNumber(activation.inputValue) + unit : "未入力"}）`; }
      const stackReference = state.data.structuredModifiers.some((record) => record.activation?.mode === "stack" && record.activation.inputKey === activation.inputKey);
      const value = Number.isFinite(activation.inputValue) ? `${detailNumber(activation.inputValue)}${stackReference ? "層" : !precombat && item.unit === "percent" ? "%" : ""}` : "未入力";
      return `${item.conditionText || "入力条件"}（${precombat ? "戦闘前の速度" : "現在値"}：${value}）`;
    }
    const reference = {
      "enemy.toughnessBroken": ["対象の弱点撃破状態（1=撃破済み）", ""], "self.interpretation": ["指定した解読層数", "層"], "self.preCombatCritDamage": ["戦闘開始時の会心ダメージ", "%"], "party.eruditionCount": ["編成内の知恵キャラ数", "人"], "party.nihilityAllyCount": ["本人以外の虚無キャラ数", "人"], "party.samePathAllyCount": ["同運命の別キャラ数", "人"], "provider.speed": ["提供者の速度", ""], "provider.effectRes": ["提供者の効果抵抗", "%"], "provider.breakEffect": ["提供者の撃破特効", "%"], "provider.sameElement": ["提供者との属性一致（1=一致）", ""], "provider.firstSlotRecipient": ["1枠目への支援（1=成立）", ""],
      "self.hp": ["HP", ""], "self.hpPercent": ["HP割合", "%"], "self.epPercent": ["EP割合", "%"], "self.speed": ["速度", ""],
      "self.atk": ["攻撃力", ""], "self.def": ["防御力", ""], "self.critRate": ["会心率", "%"], "self.critDamage": ["会心ダメージ", "%"], "self.effectHitRate": ["効果命中", "%"],
      "self.effectRes": ["効果抵抗", "%"], "self.breakEffect": ["撃破特効", "%"], "self.elation": ["愉悦度", "%"],
      "enemy.hpPercent": ["敵のHP割合", "%"], "enemy.weakness": ["属性弱点", ""], "enemy.quantumWeakness": ["敵の量子弱点", ""], "enemy.debuffCount": ["敵のデバフ数", ""], "enemy.count": ["敵数", ""], "enemy.toughnessRemaining": ["敵の残り靭性", ""], "party.elationCount": ["愉悦キャラクター数（攻撃者を含む）", "人"], "party.count": ["パーティ人数", ""], "party.sp": ["SP", ""], "party.punchline": ["爆笑ネタ", "個"]
    }[activation.reference] || ["現在値", ""];
    return `${item.conditionText || "自動判定条件"}（現在の${reference[0]} ${Number.isFinite(activation.inputValue) ? activation.inputValue : "未確認"}${reference[1]}）`;
  }

  function currentConditionReflection(item) {
    if (item.includedInFinalStats) return "最終入力に反映済み（追加なし）";
    if (item.calculable && item.activation?.unresolved && !item.includedInFinalStats) return item.activation.unresolvedReason || "条件未確定：参照する数値を入力するまで、この効果は追加しません。";
    if (item.comparisonControlled) return item.activation?.comparisonDerived ? "各結果の想定状態・編成で個別に判定します。適用・対象外は各結果の内訳で確認できます。" : "各結果の想定段数で個別に判定します。適用・対象外は各結果の内訳で確認できます。";
    if (item.resultAssumed) return "一部の結果は状態成立を想定します。ON/OFFはそれ以外の結果へ反映し、各結果の内訳で確認できます。";
    if (item.inputWarnings?.length) return `未適用：${item.inputWarnings.join(" ")}`;
    if (modifierIssueIds.has(item.id)) return `未適用：${modifierIssueLinks.get("modifier:" + item.id)?.message || "必要な入力を確認してください。"}`;
    if (isAttackSelectionCondition(item)) return item.activation.active ? "独立した攻撃結果を表示" : "独立した攻撃は計算対象外";
    if (item.inputPolicy === "includedInFinalStats") return "最終ステータスに含めて入力（ここでは再加算しません）";
    if (item.displayOnly) return "未適用（表示のみ）";
    if (!item.enabled && item.activation?.mode === "toggle" && item.activation.active) return "0%（選択中・未適用）";
    if (!item.enabled && ["statThreshold", "numericThreshold"].includes(item.activation?.mode)) return item.unit === "percent" ? "0%（条件未達）" : "未適用（条件未達）";
    if (!item.enabled && item.activation?.mode === "toggleThreshold") return item.unit === "percent" ? "0%（条件未達）" : "未適用（条件未達）";
    if (!item.enabled) return item.unit === "percent" || !item.structured ? "0%" : "未適用";
    const amount = item.effectLabel || `${item.value}${item.unit === "percent" || !item.structured ? "%" : ""}`;
    return conditionAudit?.applied.has(item.id) ? `${amount}（計算に適用済み）` : conditionAudit?.skipped.has(item.id) ? "この計算には適用されない（各攻撃の内訳を確認）" : `${amount}（選択中・再計算で反映）`;
  }

  function renderConditionControls(items, purpose) {
    const rendered = new Set(); const controls = [];
    items.forEach((item) => {
      const attackSelection = isAttackSelectionCondition(item) || purpose === "attack";
      if (item.displayOnly && !attackSelection) return;
      if (!item.structured && !rendered.has(`manual:${item.id}`)) {
        rendered.add(`manual:${item.id}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-condition-enabled="${esc(item.id)}"${item.enabled ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>この条件を適用する</strong><small>入力した補正を計算へ加える場合だけONにしてください。</small></span></label><label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>効果量</strong><small>${esc(item.description)}</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-condition-value="${esc(item.id)}" value="${item.value}" step="0.1"><em>%</em></span></label>`);
        return;
      }
      const ratioFields = { "self.hpPercent": ["hsrStat-hpPercent", "現在HP割合"], "enemy.hpPercent": ["hsrEnemyHpPercent", "敵の現在HP割合"] };
      for (const ref of [item.activation?.reference, item.activation?.thresholdReference]) {
        const field = ratioFields[ref];
        if (field && !rendered.has("ratio:" + field[0])) {
          rendered.add("ratio:" + field[0]);
          controls.push(`<p class="hsr-condition-input-help"><button type="button" class="genshin-equipment-details-button" data-hsr-ratio-field="${field[0]}">${field[1]}の入力欄へ</button>（入力すると自動判定します）</p>`);
        }
      }
      const reference = item.supplementalAttack;
      if (item.enabled && reference?.damageBonusInputKey && reference.element !== character()?.element) {
        const key=reference.damageBonusInputKey+":"+state.characterId;
        if (!conditionReferenceInputs.has(key)) { conditionReferenceInputs.add(key); controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(reference.damageBonusInputLabel||"参照者の属性与ダメージ")}</strong><small>現在の攻撃者の最終値。元の属性の与ダメージとは別です。補正なしは0。</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-structured-input="${esc(key)}" data-structured-strict="true" value="${Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:""}" step="0.1"><em>%</em></span></label>`); }
      }
      if(item.enabled && reference?.element && reference.element!==character()?.element) {
        const key='enemy-resistance:'+reference.element;
        if(!conditionReferenceInputs.has(key)){conditionReferenceInputs.add(key);controls.push('<label class="genshin-condition-control"><span>敵の'+esc(ELEMENT_KEYS[reference.element]||reference.element)+'属性耐性（%）</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" step="0.1"></label>');}
      }
      if (item.inclusionInput && !rendered.has(`included:${item.inclusionInput.key}`)) {
        rendered.add(`included:${item.inclusionInput.key}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="${esc(item.inclusionInput.key)}"${item.inclusionInput.checked ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>${esc(item.inclusionInput.label)}</strong><small>入力済みなら追加せず、未算入なら成立中の条件に従って適用します。</small></span></label>`);
      }
      const activation = item.activation || {};
      if (["toggle", "toggleThreshold"].includes(activation.mode) && activation.inputKey && !item.comparisonControlled && !rendered.has(`toggle:${activation.inputKey}`) && !conditionReferenceInputs.has(`toggle:${activation.inputKey}`)) {
        rendered.add(`toggle:${activation.inputKey}`); conditionReferenceInputs.add(`toggle:${activation.inputKey}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="${esc(activation.inputKey)}"${(activation.mode === "toggleThreshold" ? activation.toggled : activation.active) ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>${attackSelection ? "この状態の攻撃を計算する" : "この条件を適用する"}</strong><small>実際に「${esc(item.conditionText || "発動条件")}」を満たす場合だけONにしてください。</small></span></label>`);
      }
      if (activation.mode === "stack" && activation.inputKey && !rendered.has(`stack:${activation.inputKey}`) && !conditionReferenceInputs.has(`stack:${activation.inputKey}`)) {
        rendered.add(`stack:${activation.inputKey}`); conditionReferenceInputs.add(`stack:${activation.inputKey}`); const max = item.stackMax || 1;
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.inputLabel || "現在の層数")}</strong><small>現在成立している層数を選択します。</small></span><select data-structured-input="${esc(activation.inputKey)}">${Array.from({ length: max + 1 }, (_, value) => `<option value="${value}"${value === item.stacks ? " selected" : ""}>${value === 0 ? "未発動（0層）" : `${value}層`}</option>`).join("")}</select></label>`);
      }
      if (activation.mode === "numericThreshold" && activation.inputKey && !item.comparisonControlled && !rendered.has(`threshold:${activation.inputKey}`) && !rendered.has(`stack:${activation.inputKey}`) && !conditionReferenceInputs.has(activation.inputKey) && !conditionReferenceInputs.has(`stack:${activation.inputKey}`)) {
        conditionReferenceInputs.add(activation.inputKey); rendered.add(`threshold:${activation.inputKey}`);
        const thresholdValue = state.modifierInputs[activation.inputKey] === undefined ? activation.default : state.modifierInputs[activation.inputKey];
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(activation.inputLabel || "現在の条件値")}</strong><small>${esc(activation.conditionText || "発動条件の判定に使用する値を入力します。")}</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" ${activation.strictInput ? 'data-structured-strict="true"' : ""} data-structured-input="${esc(activation.inputKey)}" value="${activation.strictInput ? Number.isFinite(thresholdValue) ? thresholdValue : "" : num(activation.inputValue, activation.default || 0)}" min="${num(activation.minimum)}" max="${num(activation.maximum, 999)}" step="${num(activation.step, 1)}"></span></label>`);
      }
      if (item.tab === "パーティ" && ["toggle", "toggleThreshold"].includes(activation.mode) && !(activation.active || activation.toggled)) return;
      if (item.levelInput && !rendered.has(`level:${item.levelInput.key}`)) {
        rendered.add(`level:${item.levelInput.key}`);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.levelInput.label)}</strong><small>支援者の通常天賦Lvとは別に設定します。</small></span><input type="number" class="input_num" data-structured-strict="true" data-structured-input="${esc(item.levelInput.key)}" value="${Number.isFinite(item.levelInput.value) ? item.levelInput.value : ""}" min="1" max="${item.levelInput.maximum}" step="1"></label>`);
      }
      if (item.valueInput?.type === "toggle" && !rendered.has(`value:${item.valueInput.key}`)) {
        rendered.add(`value:${item.valueInput.key}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="${esc(item.valueInput.key)}"${item.valueInput.checked ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>この追加条件も成立している場合だけONにしてください。</small></span></label>`);
      }
      if (item.valueInput?.type === "number" && !item.valueInput.shared && !rendered.has(`value:${item.valueInput.key}`)) {
        rendered.add(`value:${item.valueInput.key}`);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>${item.valueInput.key === "pre-combat-crit-damage" ? "戦闘開始時の会心ダメージを入力します。戦闘中の支援は含めません。" : "効果量の算出に使用する現在値です。"}</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" ${item.levelInput || item.strictInput ? 'data-structured-strict="true"' : ""} data-structured-input="${esc(item.valueInput.key)}" value="${Number.isFinite(item.valueInput.value) ? item.valueInput.value : ""}" min="${num(item.valueInput.minimum)}" max="${num(item.valueInput.maximum,999)}" step="${num(item.valueInput.step,1)}"><em>${esc(item.valueInput.unit ?? (item.unit === "percent" ? "%" : ""))}</em></span></label>`);
      }
      if (item.valueInput?.type === "providerStat" && !rendered.has(`provider:${item.valueInput.providerId}:${item.valueInput.providerStat}`)) {
        rendered.add(`provider:${item.valueInput.providerId}:${item.valueInput.providerStat}`);
        const provider = item.valueInput.providerId && String(item.valueInput.providerId) !== String(state.characterId) ? item.source : "計算対象キャラクター";
        const percentStats = new Set(["critRate", "critDamage", "breakEffect", "effectHitRate", "effectRes", "hpPercent", "elation"]);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>${esc(provider)}の現在値を参照します。この値はパーティ設定またはステータス入力欄と同期します。</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-structured-provider-stat="${esc(item.valueInput.providerStat)}" data-provider-id="${esc(item.valueInput.providerId || state.characterId)}" value="${statDisplay(item.valueInput.providerStat, item.valueInput.value)}" min="${num(item.valueInput.minimum)}" max="${num(item.valueInput.maximum,999)}" step="any">${percentStats.has(item.valueInput.providerStat) ? "<em>%</em>" : ""}</span></label>`);
      }
    });
    const requirements = new Map();
    items.filter(item => item.tab === "パーティ" && item.enabled).forEach(item => {
      const record = state.data.structuredModifiers.find(entry => entry.id === item.id);
      const key = record?.source?.skillId && !record.value?.levelInputKey && /byLevel/i.test(record.value?.kind || "") ? supportTraceKey(record.source) : null;
      const member = state.party.find(entry => entry.characterId === item.providerId);
      if (key && member) requirements.set(item.providerId + ":" + key, { id: item.providerId, key, level: supportTraceLevel(member, key) });
    });
    const levels = [...requirements.values()].map(({id, key, level}) => `<p class="hsr-condition-input-help">参照する${esc(find("characters", id)?.name || id)}の${esc(TRACE_FIELDS[key][2])}Lv：${Number.isFinite(level) ? level : "未入力"} <button type="button" class="genshin-equipment-details-button" data-hsr-provider-settings="${esc(id)}" data-hsr-provider-trace="${key}">軌跡Lvを設定</button></p>`).join("");
    return controls.length ? `<div class="genshin-constellation-controls"><h6>状態・条件</h6>${controls.join("")}${levels}</div>` : "";
  }

  function conditionComparisonAttacks() {
    const element = character()?.element;
    if (state.breakInputs.mode !== "attacks") return [{ type: state.breakInputs.mode, element }];
    return availableAttacks().filter(attack => attackSupport(attack).status !== "displayOnly").map(resolvedAttack)
      .concat([{ type: "break", element }]);
  }

  let conditionDisplayAttacks = [];
  let conditionScopeCache = new WeakMap();
  function prepareConditionDisplay() {
    conditionDisplayAttacks = conditionComparisonAttacks();
    conditionScopeCache = new WeakMap();
  }

  function conditionAttackScope(item) {
    if (item.displayOnly || !item.calculable) return [];
    // Scope is a presentation query, independent of the user's activation choice.
    if (conditionScopeCache.has(item)) return conditionScopeCache.get(item);
    const candidate = { ...item, enabled: true };
    const scope = [...new Set(conditionDisplayAttacks.filter(attack => modifierTargetsCalculation(candidate, attack))
      .map(attack => ATTACK_LABELS[attack.type] || attack.type))];
    conditionScopeCache.set(item, scope);
    return scope;
  }

  function conditionTargetLabel(item) {
    const actor = character()?.name || "計算対象キャラクター";
    const owner = item.appliesTo || item.target?.owner || "self";
    if (owner === "activeAlly") return actor + "への支援（指定した味方）";
    if (owner === "partyAll") return "味方全体への支援（計算対象：" + actor + "）";
    if (owner === "enemyAll") return "敵全体へのデバフ（" + actor + "の攻撃に反映）";
    if (owner === "enemySingle") return "対象の敵へのデバフ（" + actor + "の攻撃に反映）";
    return displayTarget(owner);
  }

  function conditionFeedsSpeedThreshold(item) {
    if (state.breakInputs.mode !== "attacks" || item.displayOnly || !item.calculable || item.stat !== "speed" || !["statFlat", "statPercent"].includes(item.category)) return false;
    const context = structuredModifierContext();
    return (state.data.structuredModifiers || []).some(record => record.activation?.statSource === "effective" && record.activation.reference === "self.speed" && window.HsrModifierRuntime.sourceSelection(record, context).selected);
  }

  function conditionScopeLabel(items) {
    if (items.every(item => item.inputPolicy === "includedInFinalStats")) return "最終ステータスで管理・再加算なし";
    if (items.every(item => item.displayOnly)) return "計算への追加対象外";
    if (items.some(conditionFeedsSpeedThreshold)) return "速度条件の判定（各攻撃へ間接反映）";
    const types = [...new Set(items.flatMap(conditionAttackScope))];
    return types.length ? types.join("・") + "（発動条件は別途確認）" : "現在の計算対象には適用されません";
  }

  function conditionSourceOrder(item) {
    const source = item.sourceMeta || {};
    const skill = find("characters", String(source.id))?.skills?.find(entry => String(entry.id) === String(source.skillId));
    return ({ Normal: 0, BPSkill: 1, Talent: 2, Ultra: 3, MemospriteSkill: 4, MemospriteTalent: 5 })[skill?.type]
      ?? ({ trace: 6, eidolon: 7, lightCone: 8, relic: 9, ornament: 10 })[source.kind] ?? 11;
  }

  function renderPartyConditionGroups(entries) {
    const providers = new Map();
    entries.forEach(items => {
      const id = items[0].providerId || "other";
      if (!providers.has(id)) providers.set(id, []);
      providers.get(id).push(items);
    });
    const order = state.party.map(member => member.characterId);
    const priority = groups => groups.some(items => items.some(item => conditionAttackScope(item).length)) ? 0 : 1;
    return [...providers.entries()].sort(([a, left], [b, right]) => priority(left) - priority(right) || order.indexOf(a) - order.indexOf(b)).map(([id, groups]) => {
      groups.sort((a, b) => priority([a]) - priority([b]) || conditionSourceOrder(a[0]) - conditionSourceOrder(b[0]));
      const name = find("characters", id)?.name || "その他の提供者";
      const restored = restoredPartySelections.has(id) && groups.some(items => items.some(hasSelectedPartyChoice));
      return `<section class="hsr-condition-provider" data-hsr-provider="${esc(id)}" role="group" aria-label="${esc(name)}の補正候補"><p class="hsr-condition-provider-name"><strong>${esc(name)}</strong><span>計算対象：${esc(character()?.name || "未選択")}</span></p>${restored ? `<p class="hsr-condition-restored" data-hsr-selection-restored="${esc(id)}">前回の選択を復元しました。発動条件と参照値を確認してください。</p>` : ""}${groups.map(renderConditionGroup).join("")}</section>`;
    }).join("");
  }

  function renderConditionGroup(items) {
    const title = conditionSourceTitle(items[0]); const status = conditionStatus(items);
    const conditions = [...new Set(items.map(conditionRequirement))].join("／");
    const effects = items.map((item) => `${item.name}：${isAttackSelectionCondition(item) ? "独立した攻撃の表示条件" : item.effectLabel || item.reason || item.description}`).join("／");
    const reflected = items.map((item) => `${item.name}：${currentConditionReflection(item)}`).join("／");
    const targets = [...new Set(items.map(item => item.tab === "パーティ" ? conditionTargetLabel(item) : `${displayTarget(item.appliesTo || item.target?.owner || "self")}（${(item.target?.attackTypes || ["all"]).map(type => ATTACK_LABELS[type] || type).join("・")}）`))].join("／");
    const descriptions = [...new Set(items.map((item) => item.description).filter(Boolean))].join("\n");
    return `<article class="genshin-constellation-section hsr-condition-section" data-hsr-condition-ids="${esc(items.map(item => item.id).join(" "))}"><header class="genshin-constellation-head"><div><strong>${esc(items[0].source)}・${esc(title.type)}</strong><h5>${esc(title.name)}</h5></div><span class="genshin-condition-status ${status.className}">${status.label}</span></header><dl class="genshin-condition-facts"><div><dt>発動条件</dt><dd data-condition-fact="requirement">${esc(conditions)}</dd></div><div><dt>効果</dt><dd data-condition-fact="effects">${esc(effects)}</dd></div><div><dt>現在の反映</dt><dd data-condition-fact="reflection">${esc(reflected)}</dd></div><div><dt>適用対象</dt><dd data-condition-fact="target">${esc(targets)}</dd></div>${items[0].tab === "パーティ" ? `<div><dt>影響する攻撃</dt><dd data-condition-fact="scope">${esc(conditionScopeLabel(items))}</dd></div>` : ""}</dl>${renderConditionControls(items, conditionPurpose(items[0]))}${descriptions ? `<details class="genshin-condition-detail"><summary>効果説明</summary><div class="genshin-condition-detail-block"><h6>効果説明</h6><p>${esc(descriptions)}</p></div></details>` : ""}</article>`;
  }



  function selectedPartyReferences() {
    return Object.fromEntries(state.party.filter(m=>m.characterId).map(m=>{
      const id=String(m.characterId),key='party-reference:'+id+':',get=k=>state.modifierInputs[key+k];
      return [id,{characterId:id,element:find('characters',id)?.element,level:80,eidolon:m.eidolon,stats:{atk:get('atk'),critRate:get('critRate'),critDamage:get('critDamage')},damageBonuses:{Thunder:get('Thunder'),Wind:get('Wind'),Fire:get('Fire')},defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')}];
    }));
  }
  function laftraSnapshot(attack) {
    const get=k=>state.modifierInputs['memosprite:1402:'+k],keys=['atk','critRate','critDamage','damageBonus','defenseIgnore','resistancePenetration'];
    const valid=keys.every(k=>Number.isFinite(get(k))&&(k==='atk'?get(k)>0:get(k)>=0));
    const stats=Object.fromEntries(['atk','critRate','critDamage','damageBonus'].map(k=>[k,get(k)]));
    const referenceEnemy={...componentSnapshots().enemy,defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')},snapshotEquipment=independentMemospriteEquipment('1402','11402',stats,referenceEnemy,attack);
    return {referenceCharacter:{id:'11402',level:state.level,eidolon:state.eidolon,stats},referenceStats:stats,referenceEnemy,requiresIndependentLaftra:true,completedReferenceSnapshot:valid,damageOwnerId:'11402',snapshotEquipment,referenceIssue:valid?'':'ラフトラの最終ATK・会心・雷与ダメージ・防御無視・耐性貫通を入力してください。補正なしは0です。',referenceCondition:{id:'memosprite:1402',tab:'軌跡'}};
  }
  function nightshadeProviderIds() {
    const conePath=find('lightCones','23049')?.path;
    const eligible=id=>{const path=find('characters',String(id))?.path;return !path||path===conePath;};
    // An unconnected Servant owner may still provide a second Nightshade effect.
    return [...(state.coneId==='23049'&&eligible(state.characterId)?[String(state.characterId)]:[]),...state.party.filter(m=>m.characterId&&m.lightConeId==='23049'&&eligible(m.characterId)).map(m=>String(m.characterId))];
  }
  function independentMemospriteEquipment(id, owner, stats, referenceEnemy, attack) {
    const snapshotEquipment=[];
    const candidates=structuredSourceConditions(),findEnabled=id=>candidates.find(m=>m.id===id&&m.enabled&&m.applicable!==false&&!m.inputWarnings?.length&&attack&&window.HsrModifierRuntime.applicableToAttack(m,attack));
    if(id===state.characterId&&state.coneId==='21057'){
      const item=findEnabled('lightCone:21057:independent-memosprite-crit-damage');
      if(item&&Number.isFinite(stats.critDamage)){stats.critDamage+=item.value;snapshotEquipment.push({...item,statReferenceId:owner});}
    }
    if(id===state.characterId&&state.coneId==='23049'){
      const item=findEnabled('lightCone:23049:nightshade-memosprite-damage');
      if(item&&Number.isFinite(stats.damageBonus)){stats.damageBonus+=item.value;snapshotEquipment.push({...item,statReferenceId:owner});}
    }
    const providers=nightshadeProviderIds();
    if(providers.length===1&&['1402','1407','1409','1413','1415'].includes(String(id))){
      const item=findEnabled('lightCone:23049:nightshade-memosprite-defense-ignore');
      if(item&&Number.isFinite(referenceEnemy?.defenseIgnore)){referenceEnemy.defenseIgnore+=item.value;snapshotEquipment.push({...item,statReferenceId:owner});}
    }
    return snapshotEquipment;
  }
  function independentMemospriteSnapshot(id, attack) {
    const cyrene=id==='1415',owner=({'1415':'11415','1409':'11409','1413':'11413','1407':'11407','8007':'18007','8008':'18007','1508':'1015'})[id],keys=[...(['8007','8008','1508'].includes(id)?['atk']:[]),...(['1415','1413'].includes(id)?['hp']:[]),'critRate','critDamage','damageBonus','defenseIgnore','resistancePenetration'],get=k=>state.modifierInputs['memosprite:'+id+':'+k];
    const valid=keys.every(k=>Number.isFinite(get(k))&&(['hp','atk'].includes(k)?get(k)>0:get(k)>=0))&&(id!=='1407'||Number.isFinite(state.stats.hp)&&state.stats.hp>0),stats={...Object.fromEntries(keys.filter(k=>!['defenseIgnore','resistancePenetration'].includes(k)).map(k=>[k,get(k)])),...(id==='1407'?{hp:state.stats.hp}:{})};
    const referenceEnemy={...componentSnapshots().enemy,defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')},snapshotEquipment=independentMemospriteEquipment(id,owner,stats,referenceEnemy,attack);
    let genesisIssue='';
    if(['8007','8008'].includes(id)&&attack){
      const target=['800708','800808'].includes(attack.id)?{...attack,id:id==='8007'?'800703':'800803'}:attack;
      const rows=structuredSourceConditions().filter(m=>m.id.startsWith('trace:1415:1141513:mem-')&&m.enabled&&!m.includedInFinalStats&&window.HsrModifierRuntime.applicableToAttack(m,target));
      for(const m of rows){if(m.inputWarnings?.length||m.applicable===false)genesisIssue='創世の参照値にデミウルゴスの独立した最終HP/会心率を入力してください。';else if(m.category==='statFlat'&&m.stat==='atk')stats.atk+=m.value;else if(m.category==='critRate')stats.critRate+=m.value;}
    }
    if(id==='1413'&&attack){
      const rows=structuredSourceConditions().filter(m=>m.id.startsWith('trace:1415:1141524:')&&m.enabled&&!m.includedInFinalStats&&window.HsrModifierRuntime.applicableToAttack(m,attack));
      for(const m of rows){if(m.inputWarnings?.length||m.applicable===false)genesisIssue='歳月の会心支援には、長夜月がスキルを発動した時点の会心ダメージを入力してください。';else if(m.category==='critDamage')stats.critDamage+=m.value;else if(m.category==='damageBonus')stats.damageBonus+=m.value;}
    }
    return {referenceCharacter:{id:owner,level:state.level,eidolon:state.eidolon,stats},referenceStats:stats,referenceEnemy,completedReferenceSnapshot:valid,damageOwnerId:owner,snapshotEquipment,referenceIssue:genesisIssue||(valid?'':({'1415':'デミウルゴス','1409':'イカルン','1413':'長夜','1407':'死竜','8007':'ミュリオン','8008':'ミュリオン','1508':'アーチャー'})[id]+'の独立した最終値を補正条件で入力してください。補正なしは0です。'),referenceCondition:{id:'memosprite:'+id,tab:'軌跡'}};
  }
  function dragonActionSnapshot(profile) {
    const get=k=>state.modifierInputs['dragon:1414:'+profile+':'+k],keys=['critRate','critDamage','damageBonus','defenseIgnore','resistancePenetration'],valid=keys.every(k=>Number.isFinite(get(k))&&get(k)>=0)&&Number.isFinite(state.stats.atk)&&state.stats.atk>0,stats={atk:state.stats.atk,...Object.fromEntries(keys.slice(0,3).map(k=>[k,get(k)]))};
    return {referenceCharacter:{id:'1414',level:state.level,eidolon:state.eidolon,stats},referenceStats:stats,referenceEnemy:{...componentSnapshots().enemy,defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')},completedReferenceSnapshot:valid,statReferenceId:'1414',effectiveProfile:profile,referenceIssue:valid?'':'強化龍霊の物理/付加それぞれに有効な最終会心・物理DMG・防御無視・耐性貫通を入力してください。',referenceCondition:{id:'dragon:1414:'+profile,tab:'軌跡'}};
  }
  function pearlLearnedSnapshot(physical=false) {
    const get=k=>state.modifierInputs['pearl-learned:1502:'+k],keys=['elation','critRate','critDamage','merrymake','defenseIgnore',physical?'physicalPen':'icePen',...(physical?['physicalResistance']:[])],members=state.party.filter(m=>m.characterId),pair=members.length===1&&members[0].characterId==='1502'&&members[0].eidolon===0,valid=pair&&keys.every(k=>Number.isFinite(get(k))&&(k==='physicalResistance'?get(k)>=-100&&get(k)<=90:get(k)>=0)),enemy=componentSnapshots().enemy;
    return {referenceStats:{elation:get('elation'),critRate:get('critRate'),critDamage:get('critDamage'),damageBonus:0},referenceCharacter:{id:'1502',level:state.level,eidolon:0,stats:{elation:get('elation'),critRate:get('critRate'),critDamage:get('critDamage'),damageBonus:0}},referenceEnemy:{...enemy,...(physical?{resistance:get('physicalResistance'),resistances:{...enemy.resistances,Physical:get('physicalResistance')}}:{}),defenseIgnore:get('defenseIgnore'),resistancePenetration:get(physical?'physicalPen':'icePen')},completedReferenceSnapshot:valid,damageOwnerId:'1502',statReferenceId:'1502',learnedOwnerId:'1502',pearlPairActive:pair,referenceIssue:valid?'':'パール＋Lv80/E0の爻光だけの編成と、爻光の独立した最終愉悦/会心/上笑/対象属性の防御・耐性補正を指定してください。',referenceCondition:{id:'pearl-learned:1502',tab:'軌跡'}};
  }
  function himekoOtherUserSnapshot() {
    const member=state.party.find(m=>m.characterId==="1510"),context=structuredModifierContext(),ref=window.HsrModifierRuntime.partyReferenceSnapshot("1510","Fire",{...context,enemy:componentSnapshots().enemy},state.modifierInputs),level=context.traceLevelFor({id:"1510",skillId:"151004"});
    const mode=["1002","1313","1213"].includes(state.characterId)?1:["1001","1004","1224"].includes(state.characterId)?2:(state.modifierInputs["himeko-departure-accord"]??0),valid=ref.supported&&member&&["1001","1002","1101","1313","1004","1202","1213","1224"].includes(state.characterId)&&state.level===80&&state.eidolon===0&&Number.isInteger(level)&&level>=1&&level<=10;
    return {referenceCharacter:ref.character,referenceStats:ref.stats,referenceEnemy:ref.enemy,completedReferenceSnapshot:!!valid,referenceIssue:valid?"":ref.reason||"使用者と姫子はLv80/E0・姫子の天賦Lv1～10が必要です。",referenceCondition:{id:"party-reference:1510",tab:"パーティ"},himekoOtherUser:true,actingCharacterId:state.characterId,actingCharacterLevel:state.level,actingCharacterEidolon:state.eidolon,providerPresent:!!member,statReferenceId:"1510",damageOwnerId:"1510",effectiveHimekoAccord:mode,providerTalentLevel:level};
  }
  function himekoReferenceModifiers(attack) {
    const context=structuredModifierContext(),inputs={...state.modifierInputs,"himeko-departure-accord":attack.effectiveHimekoAccord};
    const records=(state.data.structuredModifiers||[]).filter(m=>m.source?.id==="1510"&&["151002","151004","151025","151026"].includes(m.source.skillId)&&m.calculable!==false&&m.support?.status==="calculable");
    for(const r of records)if(r.finalStatsInclusion)inputs[r.finalStatsInclusion.inputKey]=state.modifierInputs["party-reference:1510:included:"+r.id]===true;
    return window.HsrModifierRuntime.buildCandidates(records,{...context,characterId:"1510",characterElement:"Fire",eidolon:attack.referenceCharacter?.eidolon,stats:attack.referenceStats,enemy:attack.referenceEnemy,partyIds:[state.characterId,...context.partyIds.filter(id=>id!=="1510")],attack},inputs).map(m=>({...m,sourceMeta:m.source,source:m.sourceName,structured:true,matchesAttack:window.HsrModifierRuntime.applicableToAttack(m,attack),applicable:window.HsrModifierRuntime.applicableToAttack(m,attack)}));
  }
  function himekoOtherUserControls() {
    if(!["1001","1002","1101","1313","1004","1202","1213","1224"].includes(state.characterId)||state.conditionTab!=="パーティ"||!state.party.some(m=>m.characterId==="1510"))return "";
    const fields=[["atk","姫子の最終ATK"],["critRate","姫子の最終会心率（%）"],["critDamage","姫子の最終会心ダメージ（%）"],["Fire","姫子の最終炎属性与ダメージ（%）"],["defenseIgnore","姫子の有効な防御無視（%）"],["resistancePenetration","姫子の有効な炎耐性貫通（%）"]].map(([k,label])=>{const key="party-reference:1510:"+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" min="0" step="any" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'"></label>';}).join('');
    const res=state.modifierInputs["enemy-resistance:Fire"],resField=conditionReferenceInputs.has("enemy-resistance:Fire")?"":'<label class="genshin-condition-control"><span>敵の炎属性耐性（%）</span><input type="number" class="input_num" data-structured-input="enemy-resistance:Fire" data-structured-strict="true" step="any" value="'+(Number.isFinite(res)?res:'')+'"></label>';
    const checks=(state.data.structuredModifiers||[]).filter(m=>m.source?.id==="1510"&&["151002","151004","151025","151026"].includes(m.source.skillId)&&m.finalStatsInclusion&&m.support?.status==="calculable"&&!m.target.attackTypes.includes("ultimate")).map(m=>{const key="party-reference:1510:included:"+m.id;return '<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="'+key+'"'+(state.modifierInputs[key]===true?' checked':'')+'><span>姫子の「'+esc(m.name)+'」を上の最終値へ反映済み</span></label>';}).join('');
    const userName=character()?.name+(state.characterId==="1224"?"（巡狩）":""),mode=["1002","1313","1213"].includes(state.characterId)?"この支援ではダメージ前に裁決へ切り替わります。":["1001","1004","1224"].includes(state.characterId)?"この支援ではダメージ前に殲滅へ切り替わります。":"この支援は事前の協定を維持します。";
    return '<section class="hsr-condition-purpose" data-hsr-condition-ids="party-reference:1510"><h5>他使用者支援：姫子・旅立ちの独立した最終値</h5><p class="genshin-help">使用者は'+esc(userName)+'、ダメージ所有者・倍率提供者は姫子・旅立ちです。姫子の天賦Lv1～10を編成欄で指定し、境界中の全体1回＋単体3回だけを比較します。使用者のATK・会心は代用しません。'+mode+'協定・天賦を既に含めた項目は下で反映済みを指定してください。他の装備・支援は姫子の最終値へ一度含めます。</p>'+fields+resField+checks+'</section>';
  }
  function himekoAccordControls() {
    if((state.characterId==="1510"&&state.conditionTab==="軌跡")||(state.characterId!=="1510"&&state.conditionTab==="パーティ"&&state.party.some(m=>m.characterId==="1510"))){
      const key="himeko-departure-accord",value=state.modifierInputs[key]??0;conditionReferenceInputs.add(key);
      return '<section class="hsr-condition-purpose"><h5>姫子・旅立ちの同行協定</h5><label class="genshin-condition-control"><span>成立済みの同行協定</span><select data-structured-input="'+key+'">'+[[0,'未発動'],[1,'裁決'],[2,'殲滅']].map(([v,label])=>'<option value="'+v+'"'+(value===v?' selected':'')+'>'+label+'</option>').join('')+'</select></label><p class="genshin-help">開拓仲間の支援で成立済みの協定を指定します。裁決と殲滅は同時適用しません。裁決は姫子本人の与ダメージと必殺技、殲滅は味方の会心ダメージと戦闘スキル会心を補正します。本人支援は境界中の1回比較で、天賦の会心・耐性貫通を攻撃前に反映します。他使用者支援は下欄に示す対応使用者だけを計算し、チャージの自動追跡は含みません。</p></section>';
    }
    return "";
  }
  function partyReferenceControls() {
    if (['1003','1102'].includes(state.characterId) && state.conditionTab==='パーティ' && ['1415','1412'].every(id=>state.party.some(m=>m.characterId===id))) {
      const recipients=[state.characterId,...state.party.map(m=>m.characterId)].filter(id=>['1003','1102'].includes(id));
      return '<section class="hsr-condition-purpose"><h5>『法』に捧ぐ詩の軍功所持者</h5><p class="genshin-help">キュレネとケリュドラの編成に加え、実際に軍功を持つ対象を選び、支援状態をONにしてください。現在の対応は姫子・ゼーレ本人の攻撃です。</p><label class="genshin-condition-control"><span>軍功を持つ対象</span><select data-comparison-choice="cyrene-merit-recipient"><option value="">対象を選択</option>'+recipients.map(id=>'<option value="'+id+'"'+(String(state.modifierInputs['cyrene-merit-recipient'])===id?' selected':'')+'>'+esc(find('characters',id)?.name||id)+'</option>').join('')+'</select></label></section>';
    }
    if(state.characterId==='1503'&&state.conditionTab==='軌跡')return '<section class="hsr-condition-purpose" data-hsr-condition-ids="pearl-learned:1502"><h5>美学の底本・爻光の独立した最終値</h5><p class="genshin-help">Lv80/E0・未撃破の敵1体・パールと爻光だけの編成に限定。爻光を深層学習済みの状態です。パールのDEF/愉悦/会心を爻光へ流用しません。爻光のSPD由来愉悦・会心・装備/支援も最終値へ一度含めてください。深層学習の氷付加と次回攻撃の物理付加で、適用する属性補正を分けます。爆笑ネタは各付加が参照するパール側の値を明示し、爻光の爆笑の褒美を代用しません。</p>'+[['elation','爻光の最終愉悦度（%）'],['critRate','爻光の最終会心率（%）'],['critDamage','爻光の最終会心ダメージ（%）'],['merrymake','爻光の最終上笑（%）'],['defenseIgnore','爻光の有効な防御無視（%）'],['icePen','氷付加の有効な氷耐性貫通（%）'],['physicalPen','物理付加の有効な物理耐性貫通（%）'],['physicalResistance','対象の敵の物理属性耐性（%）']].map(([k,label])=>{const key='pearl-learned:1502:'+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" min="'+(k==='physicalResistance'?-100:0)+'" step="any"></label>';}).join('')+'</section>';

    if(state.characterId==='1414'&&state.conditionTab==='軌跡')return '<section class="hsr-condition-purpose"><h5>本人を同袍にした強化龍霊1行動</h5><p class="genshin-help">ATKは画面の丹恒・騰荒本人の完成済み最終値です。物理攻撃と付加ダメージそれぞれに、攻撃時点で有効な最終会心/物理DMG/防御無視/貫通を指定してください。本人の会心や与ダメージを自動継承しません。偉観のATK支援・装備・支援も各入力へ一度含めます。必殺技の直撃とは別イベントで、他の同袍・属性・行動順の自動再現は対象外です。</p>'+['dragon','additional'].map(profile=>'<h6>'+ (profile==='dragon'?'龍霊の物理攻撃':'同袍付加と昇格6の付加')+'</h6>'+[['critRate','有効な最終会心率（%）'],['critDamage','有効な最終会心ダメージ（%）'],['damageBonus','有効な最終物理与ダメージ（%）'],['defenseIgnore','防御無視（%）'],['resistancePenetration','物理耐性貫通（%）']].map(([k,label])=>{const key='dragon:1414:'+profile+':'+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" min="0" step="any"></label>';}).join('')).join('')+'</section>';

    if(['8007','8008','1508'].includes(state.characterId)&&state.conditionTab==='軌跡'){
      const id=state.characterId,rin=id==='1508',name=rin?'アーチャー':'ミュリオン',pairs=[['atk','最終ATK'],['critRate','最終会心率（%）'],['critDamage','最終会心ダメージ（%）'],['damageBonus','最終'+(rin?'量子':'氷')+'与ダメージ（%）'],['defenseIgnore','防御無視（%）'],['resistancePenetration','属性耐性貫通（%）']];
      return '<section class="hsr-condition-purpose" data-hsr-condition-ids="memosprite:'+id+'"><h5>'+name+'の独立した戦闘中の最終値</h5><p class="genshin-help">Lv80・星魂0・未撃破の敵1体・全段で状態一定。本人の値を流用しません。'+(rin?'連携にはアーチャーの編成が必要です。凛とアーチャーのA2 ATK/量子貫通、天賦のSP消費/回復後CDは、各攻撃時点の最終値へ一度含めます。必殺の被ダメージ上昇は事前成立分だけ敵入力へ含めてください。':'ミュリオンの天賦CD支援は、本人・ミュリオン・応援対象の攻撃時点の最終会心ダメージへ一度含めます。必殺専用補正の精霊への未確認継承は対象外。連携は叙事詩と在場、精霊スキルはチャージ100%未満の想定です。応援の確定成分は指定した味方の元ダメージから別行に表示し、元ダメージを再加算しません。')+'</p>'+pairs.map(([k,label])=>{const key='memosprite:'+id+':'+k;return '<label class="genshin-condition-control"><span>'+name+'の'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" min="0" step="any"></label>';}).join('')+'</section>';
    }

    if(['1409','1415','1413','1407'].includes(state.characterId)&&state.conditionTab==='軌跡'){
      const id=state.characterId,cyrene=id==='1415',name=({'1415':'デミウルゴス','1409':'イカルン','1413':'長夜','1407':'死竜'})[id],pairs=[...(['1415','1413'].includes(id)?[['hp','精霊の最終HP']]:[]),['critRate','精霊の最終会心率（%）'],['critDamage','精霊の最終会心ダメージ（%）'],['damageBonus','精霊の最終'+(id==='1409'?'風':id==='1407'?'量子':'氷')+'与ダメージ（%）'],['defenseIgnore','精霊の防御無視（%）'],['resistancePenetration','精霊の属性耐性貫通（%）']];
      return '<section class="hsr-condition-purpose" data-hsr-condition-ids="memosprite:'+id+'"><h5>'+name+'の独立した戦闘中の最終値</h5><p class="genshin-help">本人の値は継承しません。装備・支援・固有補正を各自の最終値へ一度含めます。'+(['1415','1413'].includes(id)?'花は忘れないは精霊専用CDも含めて入力し、未算入の場合だけ光円錐補正の算入済み指定を外してください。':'')+(id==='1413'?'長夜の最終HPを入力します。天賦CD・精霊在場DMG・常時会心率35%・有効スキルと編成人数由来の会心DMGを含めてください。必殺は至暗の謎が事前成立した状態で、DMGと敵被ダメージも各最終入力に含めます。憶質は攻撃前の値、終結技は16のみ対応です。':id==='1407'?'HP参照は画面のキャストリス本人の最終HPです。死竜の会心・量子DMG・防御無視・貫通は独立入力します。天賦DMGと、今回の息吹発動で加わる30%を含む追加能力の有効層は、ダメージ発生時点の死竜DMGへ一度含めてください。息吹の事前段階と死竜のHP割合を指定し、25%以下の同時天賦は合計行へ一度だけ加算します。':cyrene?'必殺の会心、天賦DMG・A6のSPD由来氷貫通も含めてください。追憶の追加は他精霊なしの味方0～3名です。特殊な祝福は未対応です。':'微笑む暗雲の会心率+100%、治癒後の天賦DMG最大3層も含めてください。累計治癒量は攻撃直前の記録値です。HPや与ダメージ結果ではありません。記録の蓄積・50%消去は自動追跡しません。')+'</p>'+pairs.map(([k,label])=>{const key='memosprite:'+id+':'+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" min="0" step="any"></label>';}).join('')+'</section>';
    }
    if(state.characterId==='1402'&&state.conditionTab==='軌跡')return '<section class="hsr-condition-purpose" data-hsr-condition-ids="memosprite:1402"><h5>ラフトラの独立した戦闘中の最終値</h5><p class="genshin-help">本人と精霊のATK・会心・雷与ダメージを分けます。至高の姿の速度由来ATK・保持速度層・装備・支援は各自の最終値に一度含めてください。花は忘れないの精霊専用CDも含め、未算入の場合だけ光円錐補正の算入済み指定を外してください。本人の値を精霊へ自動継承しません。敵1体・事前の糸・状態一定の単発比較です。</p>'+[['atk','ラフトラの最終ATK'],['critRate','ラフトラの最終会心率（%）'],['critDamage','ラフトラの最終会心ダメージ（%）'],['damageBonus','ラフトラの最終雷与ダメージ（%）'],['defenseIgnore','ラフトラの防御無視（%）'],['resistancePenetration','ラフトラの雷耐性貫通（%）']].map(([k,label])=>{const key='memosprite:1402:'+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input type="number" class="input_num" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" min="0" step="any"></label>';}).join('')+'</section>';

    if (state.characterId === '1509' && state.conditionTab === '軌跡') {
      const present=state.party.some(m=>String(m.characterId)==='1014'),id=present?'1014':'';
      const fields=present && id==='1014' ? [['atk','セイバーの最終ATK'],['critRate','セイバーの最終会心率（%）'],['critDamage','セイバーの最終会心ダメージ（%）'],['Wind','セイバーの最終風属性与ダメージ（%）'],['defenseIgnore','セイバーの防御無視（%）'],['resistancePenetration','セイバーの風耐性貫通（%）']].map(([k,label])=>{const key='party-reference:1014:'+k;return '<label class="genshin-condition-control"><span>'+label+'</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" step="0.1"></label>';}).join('') : '';
      const res=state.modifierInputs['enemy-resistance:Wind'];
      return '<section class="hsr-condition-purpose"><h5>セイバー本人の連携・風属性成分</h5><p class="genshin-help">パーティ内のLv80・星魂0セイバーの完成済み戦闘値を指定します。支援・装備補正を含めた値を使い、ギルガメッシュ本人のATKや会心を流用しません。敵1体への成立済み連携1回。雷/風の単独結果と、同一連携の合計を別行で表示します。合計へ単独行を再加算しないでください。</p><p>'+ (present?'連携の風属性攻撃者：セイバー（編成から自動判定）':'風属性成分を計算するには、セイバーを編成してください。')+'</p>'+fields+(present && !conditionReferenceInputs.has('enemy-resistance:Wind') ? '<label class="genshin-condition-control"><span>敵の風属性耐性（%）</span><input class="input_num" type="number" data-structured-input="enemy-resistance:Wind" data-structured-strict="true" value="'+(Number.isFinite(res)?res:'')+'" step="0.1"></label>' : '')+'</section>';
    }
    if(state.characterId!=='1202'||state.conditionTab!=='軌跡') return '';
    const id=String(state.modifierInputs['party-reference-owner:1202']||''),member=state.party.find(m=>String(m.characterId)===id);
    const fields=member?['atk','critRate','critDamage','Thunder','defenseIgnore','resistancePenetration'].map((k,i)=>{const key='party-reference:'+id+':'+k;return '<label class="genshin-condition-control"><span>'+['賜福対象の最終ATK','最終会心率（%）','最終会心ダメージ（%）','最終雷属性与ダメージ（%）','防御無視（%）','雷属性耐性貫通（%）'][i]+'</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" step="0.1"></label>';}).join(''):'';
    return '<section class="hsr-condition-purpose" data-hsr-condition-ids="party-reference:1202"><h5>停雲本人の攻撃後に発生する賜福対象の付加</h5><p class="genshin-help">Lv80・星魂0の賜福対象の戦闘中の最終値を入力します。賜福・他の支援・装備の効果を含めた値を使い、この付加行には攻撃者側の支援を再加算しません。停雲本人の通常とは別の1回分です。</p><label class="genshin-condition-control"><span>賜福対象</span><select data-comparison-choice="party-reference-owner:1202"><option value="">パーティから選択</option>'+state.party.filter(m=>m.characterId).map(m=>'<option value="'+m.characterId+'"'+(String(m.characterId)===id?' selected':'')+'>'+esc(find('characters',m.characterId)?.name||m.characterId)+'</option>').join('')+'</select></label>'+fields+'</section>';
  }
  // This target is independent of party-wide ascension and of battle-wide Aha Time.
  function ahaDebtSnapshotInput() {
    const values=state.modifierInputs,mode=values['aha-debt-event-mode'];
    const snapshot={requested:state.characterId==='1511'&&values['aha-debt-ordinary-target']===true,singleLayerNoShare:true,priorDebtPercent:values['aha-debt-prior-percent']};
    if([1,2,3,4].includes(mode))snapshot.hpEvent={kind:['','damage','heal','phaseClear','phaseRestore'][mode],change:mode>=3?0:values['aha-debt-event-change'],layerCount:values['aha-debt-layers'],hpOwner:['independent','shareMain','shareSub'][values['aha-debt-hp-owner']],reason:'normal',savedDebtPercent:values['aha-debt-phase-saved-percent']};
    return snapshot;
  }

  function ahaDebtControls() {
    if(state.characterId!=='1511')return '';
    const values=state.modifierInputs,active=values['aha-debt-ordinary-target']===true,mode=values['aha-debt-event-mode'];
    const number=(key,label,min,max)=>'<label class="genshin-condition-control"><span>'+label+'</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true"'+(min!==undefined?' min="'+min+'"':'')+(max!==undefined?' max="'+max+'"':'')+' step="any" value="'+(Number.isFinite(values[key])?values[key]:'')+'"></label>';
    const choice=(key,label,options)=>'<label class="genshin-condition-control"><span>'+label+'</span><select data-comparison-choice="'+key+'">'+options.map(([value,text])=>'<option value="'+value+'"'+(values[key]===value?' selected':'')+'>'+text+'</option>').join('')+'</select></label>';
    const eventControls=[1,2,3,4].includes(mode)?choice('aha-debt-hp-owner','HPと負債を持つ対象',[[NaN,'未指定'],[0,'独立した敵'],[1,'生存している共有HP本体'],[2,'共有HPの表示用の子（対象外）']])+number('aha-debt-layers','対象のHP層数',1,1000)+(mode<3?number('aha-debt-event-change','実際のHP変化量（減少は負・回復は正）'):mode===4?number('aha-debt-phase-saved-percent','段階変更前に退避された負債比率（%）',0,100):'')+'<p class="genshin-help">敵情報欄にはHPを持つ本体の全層の最大HPと変化直前の現在HP割合を指定します。事前負債は現在の層の比率です。適格な味方ダメージによる実HP減少、または通常回復の1イベントを入力します。攻撃の理論値や超過ダメージ・超過回復量を代用しません。段階処理は、退避直前または新しい段階の復元直前のHP・負債を指定します。死亡回避・致死からの段階移行・共有先切替を自動再現しません。</p>':'';
    return '<section class="hsr-condition-purpose"><h5>負債のHP内訳</h5><p class="genshin-help">負債は常時効果です。ここでは星魂0のHP内訳を計算する対象条件を指定します。最大HPの変更や追加ヒットダメージとして合算せず、結果で入力値を更新しません。未指定・死亡境界はHP内訳だけを停止します。</p><label class="genshin-condition-control"><input type="checkbox" data-structured-toggle="aha-debt-ordinary-target"'+(active?' checked':'')+'><span>負債のHP内訳を計算する</span></label>'+choice('aha-debt-event-mode','HP内訳の計算方法',[[0,'各攻撃の単一HP・非致死比較'],[1,'実際のHP減少を指定'],[2,'実際の回復を指定'],[3,'段階変更前の負債退避'],[4,'段階変更後の負債復元']])+number('aha-debt-prior-percent','HP処理前の負債比率（%）',0,100)+eventControls+'<p class="genshin-help">現在HPから負債を逆算しません。負債なしと確認できる場合は0を入力してください。単一HP比較は共有HP・バリア・途中の回復なし、全ヒット非致死・補正状態一定の敵に限定します。HP層を越える場合は実際のHP変化を指定する方式を使います。</p></section>';
  }

  function ahaReferenceControls() {
    if (!['軌跡','パーティ'].includes(state.conditionTab) || !(state.characterId==='1511'||state.party.some(m=>m.characterId==='1511'))) return '';
    const id=String(state.modifierInputs['aha-emanator-recipient']||''), member=state.party.find(m=>m.characterId===id), char=find('characters',id);
    const fields=state.characterId==='1511'&&member&&char?['elation','critRate','critDamage','merrymake','certifiedBanger','defenseIgnore','resistancePenetration','resistance'].map((key,i)=>{
      const input='aha-reference:'+id+':'+key;
      return '<label class="genshin-condition-control"><span>'+['使令対象の最終愉悦度（%）','最終会心率（%）','最終会心ダメージ（%）','最終上笑（%）','爆笑の褒美（参照時点）','対象属性の最終防御無視（%）','対象属性の最終耐性貫通（%）','敵の対象属性耐性（%）'][i]+'</span><input class="input_num" type="number" data-structured-input="'+input+'" data-structured-strict="true" step="any" value="'+(Number.isFinite(state.modifierInputs[input])?state.modifierInputs[input]:'')+'"></label>';
    }).join(''):'';
    const choices=[{characterId:state.characterId},...state.party].filter((m,i,arr)=>m.characterId&&m.characterId!=='1511'&&arr.findIndex(x=>x.characterId===m.characterId)===i);
    return '<section class="hsr-condition-purpose"><h5>「愉悦」の使令対象</h5><p class="genshin-help">昇格とは別の状態です。スキル付加は選択した味方の属性・独立した最終値を使います。支援と装備を含む値を指定し、この付加へ再加算しません。Lv80・星魂0・敵1体のみ対応。願力は基本枠8＋超過枠10の参照前合計、爽快ネタは参照時点の値を指定します。必殺後の超過分保持や、行動による獲得をこの入力へ自動上書きしません。負債は専用のHP内訳で扱い、与ダメージへ合算しません。未対応の昇格成分・奇縁星魂は計算に含みません。</p><label class="genshin-condition-control"><span>使令として指定した味方</span><select data-comparison-choice="aha-emanator-recipient"><option value="">未指定</option>'+choices.map(m=>'<option value="'+m.characterId+'"'+(m.characterId===id?' selected':'')+'>'+esc(find('characters',m.characterId)?.name||m.characterId)+'</option>').join('')+'</select></label>'+fields+'</section>';
  }

  function ahaEmanatorSnapshot() {
    const id=String(state.modifierInputs['aha-emanator-recipient']||''), member=state.party.find(m=>m.characterId===id), char=find('characters',id);
    const get=key=>state.modifierInputs['aha-reference:'+id+':'+key];
    const stats={elation:get('elation'),critRate:get('critRate'),critDamage:get('critDamage'),damageBonus:0};
    const keys=['elation','critRate','critDamage','merrymake','certifiedBanger','defenseIgnore','resistancePenetration','resistance'];
    const valid=member&&member.eidolon===0&&(member.level===undefined||member.level===80)&&id!=='1511'&&char&&keys.every(k=>Number.isFinite(get(k)))&&keys.filter(k=>k!=='resistance').every(k=>get(k)>=0)&&Number.isInteger(get('certifiedBanger'))&&get('certifiedBanger')<=10000;
    return {element:char?.element,referenceCharacter:{id,level:member?.level||80,eidolon:member?.eidolon,stats},referenceStats:stats,referenceEnemy:{...componentSnapshots().enemy,resistances:{},resistance:get('resistance'),defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')},referenceElation:{context:'certifiedBanger',certifiedBanger:get('certifiedBanger'),merrymake:get('merrymake')},completedReferenceSnapshot:!!valid,ahaEmanatorId:id,damageOwnerId:id,referenceIssue:valid?'':'使令対象のLv80/E0編成と、属性に対応する独立した最終愉悦度・会心・上笑・褒美・防御/耐性補正を入力してください。補正なしは0です。',referenceCondition:{id:'aha-emanator-recipient',tab:'パーティ'}};
  }

  function comparisonReferenceControls() {
    if (["1414","1408","1406","1321","1410","1314","1504","8009","8010","1317","1501","1502","1409","1415","1413","1407","8007","8008","1508","1510","1503","1511","1506"].includes(state.characterId) && state.conditionTab === "軌跡") {
      const inputs = new Map(availableAttacks().flatMap(a => a.numericModifierInputs || []).filter(spec => spec.inputKey !== 'rappa-consumed-charge' && (!spec.inputKey.startsWith('ocean-foreign-original:')||state.party.some(m=>m.characterId===spec.inputKey.split(':')[1]&&m.eidolon===0)) && !conditionReferenceInputs.has('stack:'+spec.inputKey)).map(spec => [spec.inputKey,spec]));
      return (state.characterId==='1410'?'<p class="genshin-help">海洋の他所有者DoTは編成中のE0付与者だけを対象にします。各入力はその所有者のATK・属性・防御/耐性・与ダメージ等を反映した非会心1回分です。未付与は0、未入力は当該合計のみ停止します。本人4種へ同じDoTを重複入力しないでください。黒天のアーカナ・撃破DoT・装備由来DoT・領域の追加発生はこの合計に含みません。</p>':'') + (state.characterId === '1408' ? '<p class="genshin-help">壊傷1～3層はスキルLv1～10、4層はLv1～6・10のみ対応します。4層×Lv7～9だけを対象外とし、他の攻撃は計算できます。世負いの炎付加は物理攻撃と別に炎与ダメージ・敵炎耐性を指定します。超過火種の会心ダメージを最終CDへ一度含め、形態ATKとA6は既存の算入済み指定で重複を避けてください。</p>' : '') + (state.characterId === "1314" ? '<p class="genshin-help">追撃の質草は、ダメージ参照時点で有効な層数を下の既存入力で指定してください。今回の獲得5層を自動では加算しません。</p>' : '') + [...inputs.values()].map(spec => `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(spec.label)}</strong><small>この成分が参照する時点の値を指定します。未入力を最大値に置き換えません。</small></span><input type="number" class="input_num" data-structured-input="${esc(spec.inputKey)}" data-structured-strict="true" min="${spec.minimum}" max="${spec.maximum}" step="${spec.integer ? 1 : 'any'}" value="${Number.isFinite(state.modifierInputs[spec.inputKey]) ? state.modifierInputs[spec.inputKey] : ''}"></label>`).join('');
    }
    if (state.characterId === "1308" && state.conditionTab === "軌跡" && availableAttacks().some(a => a.numericModifierInputs?.some(x => x.inputKey === "acheron-initial-knots"))) {
      const value=state.modifierInputs["acheron-initial-knots"];
      return `<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>必殺技開始時の集真赤層数</strong><small>対象の敵1体にある0～9層。雷心は攻撃前から3層が有効な比較です。</small></span><input type="number" class="input_num" data-structured-input="acheron-initial-knots" data-structured-strict="true" min="0" max="9" step="1" value="${Number.isFinite(value)?value:""}"></label>`;
    }

    if(state.characterId!=="1224" || state.conditionTab!=="軌跡") return "";
    const number=(key,label)=>'<label class="genshin-condition-control"><span>'+esc(label)+'</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" step="0.1"></label>';
    const shifuId=String(state.modifierInputs['march-shifu-id']||''), shifu=state.party.some(m=>String(m.characterId)===shifuId)?find('characters',shifuId):null, element=shifu?.element;
    const fields=element&&element!=='Imaginary'?number('element-damage:1224:'+element,'なのかの最終'+(ELEMENT_KEYS[element]||element)+'属性与ダメージ（%）')+number('enemy-resistance:'+element,'敵の'+(ELEMENT_KEYS[element]||element)+'属性耐性（%）'):'';
    return '<section class="hsr-condition-purpose"><h5>攻撃型師匠の付加を含む比較</h5><p class="genshin-help">虚数の本体と師匠属性の付加を分けて計算します。師匠のATKは使いません。全成分が非弱点・未撃破の状態のみ対応。入力なしでも従来の支援型師匠の比較は維持します。</p>'+'<label class="genshin-condition-control"><span>攻撃型の師匠</span><select data-comparison-choice="march-shifu-id"><option value="">パーティから選択</option>'+state.party.map(m=>find('characters',m.characterId)).filter(c=>c&&['Rogue','Mage','Warrior','Memory','Hunt','Destruction','Erudition','Remembrance','Elation'].includes(c.path)).map(c=>'<option value="'+c.id+'"'+(c.id===shifuId?' selected':'')+'>'+esc(c.name)+'（'+esc(ELEMENT_KEYS[c.element]||c.element)+'）</option>').join('')+'</select></label>'+fields+'</section>';
  }

  function componentSnapshots() {
    const damageBonuses={ [character().element]:state.stats.damageBonus },resistances={ [character().element]:state.enemy.resistance };
    for(const element of Object.keys(ELEMENT_KEYS)) {
      if(element===character().element) continue;
      const bonus=state.modifierInputs['element-damage:'+state.characterId+':'+element],res=state.modifierInputs['enemy-resistance:'+element];
      if(Number.isFinite(bonus)) damageBonuses[element]=bonus;
      if(Number.isFinite(res)) resistances[element]=res;
    }
    return {character:{id:state.characterId,level:state.level,eidolon:state.eidolon,stats:{...state.stats,damageBonuses},baseStats:undefined},enemy:{...state.enemy,resistances}};
  }
  function renderConditions() {
    conditionReferenceInputs = new Set();
    prepareConditionDisplay();
    const conditions = sourceConditions(); const tabs = CONDITION_TAB_ORDER;
    trackPartySelectionRestore(conditions);
    if (!tabs.includes(state.conditionTab)) state.conditionTab = tabs[0];
    $("hsrConditionTabs").innerHTML = tabs.map((tab) => `<button type="button" class="genshin-condition-tab${tab === state.conditionTab ? " is-active" : ""}" role="tab" data-condition-tab="${esc(tab)}" aria-selected="${tab === state.conditionTab}">${esc(tab)}</button>`).join("");
    const selected = conditions.filter((item) => item.tab === state.conditionTab); const groups = new Map();
    selected.forEach(item => {
      const source = item.sourceMeta || {};
      const key = conditionPurpose(item) + ":" + (item.providerId || "") + ":" + (source.kind ? `${source.kind}:${source.id}:${source.skillId || source.traceId || source.eidolonRank || source.setPieces || item.id}` : item.id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const meta = CONDITION_TAB_META[state.conditionTab] || CONDITION_TAB_META["その他"];

    if(state.characterId==="1510"||state.party.some(m=>m.characterId==="1510"))conditionReferenceInputs.add("himeko-departure-accord");
    const purposes = CONDITION_PURPOSES.map(purpose => {
      const entries = [...groups.values()].filter(items => conditionPurpose(items[0]) === purpose.id);
      if (!entries.length) return "";
      const content = `<p class="genshin-help">${esc(purpose.help)}</p>${state.conditionTab === "パーティ" ? renderPartyConditionGroups(entries) : entries.map(renderConditionGroup).join("")}`;
      return purpose.folded ? `<details class="hsr-condition-purpose" data-condition-purpose="${purpose.id}"><summary>${esc(purpose.title)}（${entries.length}件）</summary>${content}</details>`
        : `<section class="hsr-condition-purpose" data-condition-purpose="${purpose.id}"><h5>${esc(purpose.title)}</h5>${content}</section>`;
    }).join("");
    $("hsrConditionList").innerHTML = `<section class="genshin-condition-card is-wide hsr-condition-category"><header><div><h4>${esc(meta.title)}</h4><p>${esc(meta.subtitle)}</p></div><span class="genshin-condition-source">${esc(meta.source)}</span></header>${himekoAccordControls()}${himekoOtherUserControls()}${partyReferenceControls()}${ahaReferenceControls()}${state.conditionTab==="軌跡"?ahaDebtControls():""}${comparisonReferenceControls()}${purposes || '<p class="genshin-condition-card-empty">このカテゴリに設定できる効果はありません。</p>'}</section>`;
  }

  // Patch facts only: replacing a numeric control on blur steals the next click/focus.
  function refreshConditionFacts() {
    prepareConditionDisplay();
    const byId = new Map(sourceConditions().map(item => [item.id, item]));
    $("hsrConditionList").querySelectorAll("[data-hsr-condition-ids]").forEach(card => {
      const items = card.dataset.hsrConditionIds.split(" ").map(id => byId.get(id)).filter(Boolean);
      if (!items.length) return;
      const status = conditionStatus(items), badge = card.querySelector(".genshin-condition-status");
      badge.textContent = status.label; badge.className = "genshin-condition-status " + status.className;
      card.querySelector('[data-condition-fact="requirement"]').textContent = [...new Set(items.map(conditionRequirement))].join("／");
      card.querySelector('[data-condition-fact="effects"]').textContent = items.map(item => `${item.name}：${isAttackSelectionCondition(item) ? "独立した攻撃の表示条件" : item.effectLabel || item.reason || item.description}`).join("／");
      card.querySelector('[data-condition-fact="reflection"]').textContent = items.map(item => `${item.name}：${currentConditionReflection(item)}`).join("／");
      const target = card.querySelector('[data-condition-fact="target"]');
      if (target && items[0].tab === "パーティ") target.textContent = [...new Set(items.map(conditionTargetLabel))].join("／");
      const scope = card.querySelector('[data-condition-fact="scope"]');
      if (scope) scope.textContent = conditionScopeLabel(items);
    });
  }

  function allConditions(inputs = state.modifierInputs, attack) { return sourceConditions(inputs, attack).concat(state.conditions); }

  function updateConditionSummary() {
    if ($("hsrManualConditionList") && !$("hsrManualConditionList").contains?.(document.activeElement)) $("hsrManualConditionList").innerHTML = state.conditions.map((item) => `<label class="hsr-manual-condition-row"><input type="checkbox" data-condition-enabled="${esc(item.id)}"${item.enabled ? " checked" : ""}><span>${esc(item.name)}</span><input type="number" data-condition-value="${esc(item.id)}" value="${item.value}" step="any" aria-label="${esc(item.name)}（%）"><span>%</span></label>`).join("");
    const conditions = allConditions();
    trackPartySelectionRestore(conditions);
    const selected = conditions.filter(item => !item.displayOnly && (item.comparisonControlled || item.resultAssumed || item.enabled || item.activation?.toggled || (item.activation?.mode === "toggle" && item.activation.active)));
    const missing = selected.filter(item => item.inputWarnings?.length || modifierIssueIds.has(item.id)).length;
    const applied = selected.filter(item => conditionAudit?.applied.has(item.id)).length;
    const skipped = selected.filter(item => !conditionAudit?.applied.has(item.id) && conditionAudit?.skipped.has(item.id)).length;
    const counts = selected.length ? [`${selected.some(item=>item.resultAssumed||item.activation?.comparisonDerived)?"選択・想定":"選択中"} ${selected.length}件`] : ["追加する補正はありません"];
    if (conditionAudit) counts.push(`計算に適用済み ${applied}件`);
    if (missing) counts.push(`入力不足 ${missing}件`);
    if (skipped) counts.push(`この計算の対象外 ${skipped}件`);
    $("hsrConditionTitle").textContent = counts.join("・");
    const unresolved = conditions.filter(item => item.calculable && item.activation?.unresolved && !item.includedInFinalStats).length;
    if (unresolved) $("hsrConditionTitle").textContent += `・条件未確定 ${unresolved}件`;
    const reflected = conditions.filter(item => item.inputPolicy === "includedInFinalStats").length;
    $("hsrConditionHelp").textContent = (reflected ? `最終ステータスで管理 ${reflected}件（再加算なし）。` : "") + "選択状態は補正条件で、攻撃ごとの適用・対象外は計算内訳で確認できます。"
      + (restoredPartySelections.size ? " " + [...restoredPartySelections].map(id => find("characters", id)?.name || id).join("・") + "：前回の選択を復元しました。発動条件を確認してください。" : "");

  }

  function applyEnemy(id) {
    state.enemyId = id; const item = enemyPreset();
    $("hsrEnemySelect").value = item ? id : "custom";
    if (item) Object.assign(state.enemy, item);
    $("hsrEnemyLevel").value = state.enemy.level; $("hsrEnemyMaxHp").value = state.enemy.maxHp || 100000; $("hsrEnemyResistance").value = state.enemy.resistance;
    $("hsrWeakness").value = String(Boolean(state.enemy.weakness)); $("hsrToughnessState").value = state.enemy.toughnessActive ? "active" : "broken";
    $("hsrMaxToughness").value = state.enemy.maxToughness;
    $("hsrEnemyHpPercent").value = Number.isFinite(state.enemy.hpPercent) ? state.enemy.hpPercent : ""; $("hsrEnemyCount").value = state.enemy.count || 1; $("hsrEnemyDebuffCount").value = state.enemy.debuffCount || 0;
    setImage("hsrEnemyImage", item?.image, item?.name); $("hsrEnemyName").textContent = item?.name || "カスタム敵";
    $("hsrEnemySummary").textContent = item ? `Lv${item.level} / 耐性${item.resistance}% / 最大靭性${item.maxToughness}` : "入力値を個別に編集します。";
    renderAttacks(); markDirty();
  }

  function modifierTargetsCalculation(item, attack) {
    if(['1503081','1503080','150308','150320'].includes(attack.id)&&(item.category==='progressiveTakenDamage'||['statPercent','statFlat'].includes(item.category)&&item.stat==='def'))return true;
    if(state.characterId==='1402'&&!attack.requiresIndependentLaftra&&['statFlat','statPercent'].includes(item.category)&&item.stat==='speed')return true;
    if(['150621','1506041','1506042','1506081','1506082'].includes(attack.id)&&(item.category==='progressiveTakenDamage'||['critRate','critRateOverride'].includes(item.category)||['statFlat','statPercent'].includes(item.category)&&item.stat==='speed'))return true;
    if (attack.fixedCritStats && ["critRate","critRateOverride","critDamage"].includes(item.category)) return false;
    if (attack.damageFormula === "trueDamage") return false;
    if (state.characterId === "1205" && attack.type === "normal" && item.activation?.inputKey === "blade-hellscape-active") return false;
    if (attack.id === "131503" && item.id === "trace:1315:131502:standoff-vulnerability") return false;
    if (item.structured && !window.HsrModifierRuntime.applicableToAttack(item, attack)) return false;
    if (attack.id === "1151201") return ["trace:1512:151204:fever-defense-ignore", "trace:1512:1151203:songbirds-vulnerability"].includes(item.id);
    // Match the existing engines' accepted categories; this only scopes validation/application.
    if (["8009041","8010041","800920","801020","1501041","1501042","150120"].includes(attack.id) && ((["statPercent","statFlat"].includes(item.category) && item.stat === "atk") || item.category === "progressiveTakenDamage")) return true;
    if (attack.damageFormula === "elation") return ["elation", "critRate", "critRateOverride", "critDamage", "critTakenDamage", "defenseReduction", "defenseIgnore", "resistanceReduction", "resistancePenetration", "takenDamage"].includes(item.category) || attack.id==='150120'&&item.id==='v47:trace:1501:150129:elation-skill-multiplier'||attack.id==='1505042'&&item.id==='v47:trace:1505:150529:next-ultimate-multiplier';
    if (["break", "superBreak"].includes(attack.type)) return ["breakEffect", "breakDamage", "defenseReduction", "defenseIgnore", "resistanceReduction", "resistancePenetration", "takenDamage", ...(attack.type === "superBreak" ? ["breakEfficiency", "superBreakDamage"] : [])].includes(item.category);
    if ((attack.canCrit === false || attack.type === "dot") && ["critRate", "critRateOverride", "critDamage", "critTakenDamage"].includes(item.category)) return false;
    if (["statFlat", "statPercent"].includes(item.category) || item.requiredBaseStat) {
      const stats = [...(attack.scalingTerms?.length ? attack.scalingTerms : [{stat: attack.scalingStat || "atk"}]), ...(attack.adjacentScalingTerms || []), ...(attack.equipmentBaseStats || []).map(stat=>({stat}))].map(term => term.stat);
      if (attack.damageFormula === "enemyHpCappedByAtk") stats.push("atk");
      return stats.includes(item.stat || item.requiredBaseStat);
    }
    return true;
  }

  function modifiers(attack) {
    if(attack.himekoOtherUser)return himekoReferenceModifiers(attack).concat(modifiers({...attack,himekoOtherUser:false}).filter(m=>["enemySingle","enemyAll"].includes(m.target?.owner)));
    const otherNihility=state.characterId==='1507' && state.party.some(m=>String(m.characterId)!==state.characterId && ['Warlock','Nihility'].includes(find('characters',m.characterId)?.path));
    const inputs = attack.comparisonModifierInputs || state.characterId==='1507' ? { ...state.modifierInputs, ...attack.comparisonModifierInputs,...(state.characterId==='1507'?{'mortenax-no-other-nihility':!otherNihility,'mortenax-other-nihility':otherNihility}:{}) } : state.modifierInputs;
    const candidates = allConditions(inputs, attack).filter((item) => !item.displayOnly);
    const equipmentBaseStats = candidates.filter(item => item.category === "baseDamageAddition" && item.enabled && item.applicable && window.HsrModifierRuntime.applicableToAttack(item,attack)).map(item=>item.stat);
    const scopedAttack = equipmentBaseStats.length ? {...attack,equipmentBaseStats} : attack;
    return candidates.map((original) => {
      const item=attack.marchEnhancedAdditional && original.id === "trace:1224:122404:enhanced-damage" ? {...original,target:{...original.target,attackIds:["122402"],attackTypes:["additional"],elements:[]}} : original;
      const separateBenediction=item.id==="trace:1202:120202:benediction-atk" && state.characterId==="1202" && state.party.some(m=>String(m.characterId)===String(state.modifierInputs["party-reference-owner:1202"]));
      const attackApplies = !separateBenediction && modifierTargetsCalculation(item, scopedAttack) && (!attack.completedReferenceSnapshot || ['enemySingle','enemyAll'].includes(item.target?.owner) || ['1140706','1140712'].includes(attack.id)&&item.id==='trace:1415:1141517:castorice-deathragon-talent-multiplier'&&item.category==='multiplierAddition');
      const supplementalApplies = !item.supplementalAttack || item.id === attack.sourceModifierId;
      const primaryTargetApplies = !item.primaryTargetOnly || attack.target !== "adjacent";
      const adjacentTargetApplies = !item.adjacentTargetOnly || attack.target === "adjacent";
      return { ...item, matchesAttack: attackApplies && supplementalApplies && primaryTargetApplies && adjacentTargetApplies, conditionText: item.activation?.reference === "party.elationCount" ? conditionRequirement(item) : item.conditionText, applicable: item.enabled && attackApplies && supplementalApplies && primaryTargetApplies && adjacentTargetApplies && item.applicable !== false, reason: !item.enabled ? (item.calculable && item.activation?.unresolved && !item.includedInFinalStats ? "条件の参照値が未確定のため追加しません" : item.includedInFinalStats ? "最終入力に反映済みのため追加しません" : "発動条件を満たしていません") : separateBenediction ? "賜福の対象は選択した別の味方です。停雲本人のATKへは加算しません。" : !supplementalApplies ? "別の付加ダメージに属する補正です" : !primaryTargetApplies ? "隣接対象はこの補正の対象外です" : !adjacentTargetApplies ? "主対象はこの補正の対象外です" : attackApplies ? item.reason || "" : "この攻撃種別・属性は対象外です" };
    });
  }

  function cyreneBlessingSnapshot(skillId,inputKey) {
    const member=state.party.find(m=>m.characterId==='1415'),level=member?structuredModifierContext().traceLevelFor({id:'1415',skillId}):NaN;
    const active=!!member&&member.eidolon===0&&state.modifierInputs[inputKey]===true;
    return {cyreneSupportLevel:level,cyreneBlessingActive:active,referenceIssue:active&&Number.isInteger(level)&&level>=1&&level<=6?'':'キュレネE0の編成、精霊スキルLv1～6と、該当祝福が事前成立した状態を指定してください。',referenceCondition:{id:inputKey,tab:'パーティ'}};
  }

  function cyreneFixedState(key) {
    return state.modifierInputs[key]===true&&state.party.some(m=>m.characterId==='1415'&&m.eidolon===0);
  }

  function resolvedAttack(selected) {
    if(selected.id==='150608'&&selected.damageFormula==='componentSequence'&&Array.isArray(selected.damageComponents)){
      const level=state.traceLevels.normal,parts=selected.damageComponents.map(d=>resolvedAttack(state.data.attacks.find(a=>a.id===d.attackId)));
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:'enhancedNormal',ultimateTraceLevel:state.traceLevels.ultimate,sequenceAttacks:parts,traceLevelLabel:`通常Lv${level}＋必殺Lv${state.traceLevels.ultimate}`};
    }

    if (selected.characterId==='1511') {
      const level=state.traceLevels[selected.traceKey],base={...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type};
      if(selected.id==='1511021')return {...base,...ahaEmanatorSnapshot()};
      if(selected.id==='1511022'){
        const parts=selected.damageComponents.map(d=>resolvedAttack(state.data.attacks.find(a=>a.id===d.attackId)));
        return {...base,sequenceAttacks:parts,referenceIssue:parts[1].referenceIssue,referenceCondition:parts[1].referenceCondition};
      }
      if(selected.id==='151103')return {...base,comparisonModifierInputs:{'aha-world-active':true}};
      return base;
    }

    if(['11415181','1405023'].includes(selected.id)){
      const l=state.traceLevels.skill,active=cyreneFixedState('cyrene-anaxa-extra-hits-active');
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:'skill',cyreneExtraHitsActive:active,referenceIssue:active?'':'キュレネE0を編成し、理性のスキル+3ヒットが有効な状態を指定してください。',referenceCondition:{id:'cyrene-anaxa-extra-hits-active',tab:'パーティ'}};
    }
    if(selected.id==='11415151'){
      const l=state.traceLevels.ultimate;return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:'additional',cyreneBarrierActive:cyreneFixedState('trace:1415:1141515:tribbie-defense-ignore-active')};
    }
    if(selected.id==='1403033'){
      const active=cyreneFixedState('trace:1415:1141515:tribbie-defense-ignore-active'),l=state.traceLevels.ultimate,parts=selected.damageComponents.slice(0,active?2:1).map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack);
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:'additional',hitCountLabel:active?'結界付加2回（基本1＋祝福1）':'結界付加1回',cyreneBarrierActive:active,sequenceAttacks:parts};
    }

    if(selected.id==='11415251'){
      const ref=cyreneBlessingSnapshot('1141525','cyrene-earth-active'),level=ref.cyreneSupportLevel,shield=state.modifierInputs['cyrene-earth-companion-shield'],snapshot=dragonActionSnapshot('additional'),ratio=selected.multipliers[level-1];
      return {...selected,...ref,...snapshot,traceKey:'cyreneMemSkill',traceLevel:level,traceLevelLabel:'キュレネ精霊スキルLv'+level,multiplier:0,flatDamage:shield*ratio/100,shieldRatio:ratio,attackType:'additional',referenceIssue:ref.referenceIssue||snapshot.referenceIssue,referenceCondition:ref.referenceIssue?ref.referenceCondition:snapshot.referenceCondition};
    }
    if(selected.id==='11415211'){
      const ref=cyreneBlessingSnapshot('1141521','cyrene-phainon-blessing-active'),level=ref.cyreneSupportLevel,fire=state.modifierInputs['element-damage:1408:Fire'],resistance=state.modifierInputs['enemy-resistance:Fire'];
      return {...selected,...ref,traceKey:'cyreneMemSkill',traceLevel:level,traceLevelLabel:'キュレネ精霊スキルLv'+level,multiplier:selected.multipliers[level-1],attackType:selected.type,referenceStats:{...state.stats,damageBonus:fire},referenceEnemy:{...componentSnapshots().enemy,resistance},numericModifierInputs:selected.numericModifierInputs};
    }
    if(/^11415220[1-8]$/.test(selected.id)){
      const ref=cyreneBlessingSnapshot('1141522','trace:1415:1141522:serin-damage-active'),level=ref.cyreneSupportLevel,present=state.party.some(m=>m.characterId===selected.dataOwnerId&&m.eidolon===0);
      return {...selected,...ref,dotOwnerPresent:present,traceKey:'cyreneMemSkill',traceLevel:level,traceLevelLabel:'キュレネ精霊スキルLv'+level,multiplier:selected.multipliers[level-1],attackType:'dot',referenceIssue:ref.referenceIssue||(!present?'DoT付与者E0を編成してください。':'')};
    }
    if(['1410013','1410023'].includes(selected.id)){
      const ref=cyreneBlessingSnapshot('1141522','trace:1415:1141522:serin-damage-active'),owners=['1005','1108','1111','1210'].filter(id=>state.party.some(m=>m.characterId===id&&m.eidolon===0)),defs=selected.damageComponents.filter((d,i)=>i===0||owners.includes(d.dataOwnerId)),parts=defs.map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack),level=state.traceLevels[selected.traceKey];
      return {...selected,...ref,dotOwnerIds:owners,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks:parts,damageComponents:defs,numericModifierInputs:selected.numericModifierInputs.filter(spec=>!spec.inputKey.startsWith('ocean-foreign-original:')||owners.includes(spec.inputKey.split(':')[1])),referenceIssue:ref.referenceIssue||(!owners.length?'カフカ・サンポ・ルカ・桂乃芬のE0付与者を編成し、所有者別のDoT1回分を入力してください。':''),referenceCondition:{id:'ocean-foreign-original',tab:'軌跡'}};
    }
    if(/^1141522[1-8]$/.test(selected.id)){
      const ref=cyreneBlessingSnapshot('1141522','trace:1415:1141522:serin-damage-active'),level=ref.cyreneSupportLevel;
      return {...selected,...ref,traceKey:'cyreneMemSkill',traceLevel:level,traceLevelLabel:'キュレネ精霊スキルLv'+level,multiplier:selected.multipliers[level-1],attackType:'dot'};
    }
    if(['1410012','1410022'].includes(selected.id)){
      const ref=cyreneBlessingSnapshot('1141522','trace:1415:1141522:serin-damage-active'),parts=selected.damageComponents.map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack),level=state.traceLevels[selected.traceKey];
      return {...selected,...ref,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks:parts};
    }

    if(selected.id==='1503080'){
      const l=state.traceLevels.normal;return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:selected.type};
    }
    if(['1503031','150320','1503201'].includes(selected.id)){
      const learned=selected.id==='1503031',other=selected.id!=='150320',ref=pearlLearnedSnapshot(!learned),l=state.traceLevels[learned?'ultimate':'elation'];
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:'elation',pearlPairActive:ref.pearlPairActive,...(other?ref:{referenceIssue:ref.pearlPairActive?'':ref.referenceIssue,referenceCondition:ref.referenceCondition}),referenceElation:{context:learned?'pearlLearnedSnapshot':'pearlNextAttack',punchline:state.modifierInputs[learned?'pearl-learned-punchline':'pearl-next-punchline'],merrymake:other?state.modifierInputs['pearl-learned:1502:merrymake']:state.elationInputs.merrymake}};
    }
    if(selected.id==='150308'&&selected.damageFormula==='componentSequence'){
      const ref=pearlLearnedSnapshot(),n=state.modifierInputs['pearl-next-proc-count'],l=state.traceLevels.normal,parts=selected.damageComponents.slice(0,n===1?4:3).map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack);
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:selected.type,learnedOwnerId:'1502',pearlPairActive:ref.pearlPairActive,pearlUltimateLevel:state.traceLevels.ultimate,pearlElationLevel:state.traceLevels.elation,requiredTraceLevelRanges:{...selected.requiredTraceLevelRanges,...(n===1?{elation:{minimum:1,maximum:10}}:{})},numericModifierInputs:selected.numericModifierInputs.filter(x=>x.inputKey!=='pearl-next-punchline'||n===1),sequenceAttacks:parts,referenceIssue:ref.referenceIssue,referenceCondition:ref.referenceCondition};
    }

    if(['1414031','1414032','14141031'].includes(selected.id)){
      const l=selected.id==='14141031'?1:state.traceLevels.ultimate;
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:selected.type,...dragonActionSnapshot(selected.effectiveProfile)};
    }
    if(selected.id==='1414039'&&selected.damageFormula==='componentSequence'){
      const parts=selected.damageComponents.map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack),issue=parts.find(p=>p.referenceIssue),l=state.traceLevels.ultimate;
      return {...selected,traceLevel:l,multiplier:selected.multipliers[l-1],attackType:selected.type,sequenceAttacks:parts,referenceIssue:issue?.referenceIssue||'',referenceCondition:issue?.referenceCondition||{id:'dragon:1414:dragon',tab:'軌跡'}};
    }

    if(['800703','800803','1800701','1800801'].includes(selected.id)){
      const level=state.traceLevels[selected.traceKey];
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,...(['1800701','1800801'].includes(selected.id)?{scalingTerms:[{stat:'atk',multiplier:[18,21.6,25.2,28.8,32.4,36][level-1]*4},{stat:'atk',multiplier:[45,54,63,72,81,90][level-1]}]}:{}),...independentMemospriteSnapshot(selected.characterId,selected)};
    }
    if(['800708','800808','150805'].includes(selected.id)&&selected.damageFormula==='componentSequence'){
      const rin=selected.id==='150805',ref=independentMemospriteSnapshot(selected.characterId,selected),level=state.traceLevels[selected.traceKey],body={...selected,id:selected.damageComponents[0].attackId,damageFormula:'statMultiplier',damageComponents:undefined,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type};
      const partner={...body,id:selected.damageComponents[1].attackId,...ref};
      const present=!rin||state.party.some(m=>String(m.characterId)==='1015'&&m.eidolon===0);
      return {...selected,traceLevel:level,multiplier:body.multiplier,attackType:selected.type,sequenceAttacks:[body,partner],referenceIssue:present?ref.referenceIssue:'Lv80・星魂0のアーチャーを編成してください。',referenceCondition:ref.referenceCondition};
    }
    if(selected.id==='150809'){
      const level=state.traceLevels.skill,n=state.modifierInputs['rin-repeat-count'];
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1]*(1+n),hitCount:1,attackType:selected.type,scalingTerms:[{stat:'atk',multiplier:selected.multipliers[level-1]},{stat:'atk',multiplier:selected.multipliers[level-1]*n}]};
    }
    if(['1800707','1800807'].includes(selected.id)){
      const level=state.traceLevels.memSkill,ep=state.modifierInputs['mem-beneficiary-max-energy'];
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1]+Math.min(20,Math.max(0,ep-100)/10*2),attackType:selected.type,referenceTrueDamage:{active:true,sourceKind:'memSupportFinalNonTrueDamage',originalDamage:state.modifierInputs['mem-original-damage']}};
    }

    if(selected.id==='140709'&&selected.damageFormula==='componentSequence'){
      const level=state.traceLevels.skill,ref=independentMemospriteSnapshot('1407',{...selected,id:'140709:dragon'}),body={...selected,id:'140709:caster',damageFormula:'statMultiplier',damageComponents:undefined,hitCount:1,hitCountLabel:'本人1ヒット',traceLevel:level,multiplier:selected.multipliers[level-1],attackType:'enhancedSkill'},dragon={...body,id:'140709:dragon',hitCountLabel:'死竜1ヒット',multiplier:selected.dragonMultipliers[level-1],requiresIndependentCastorice:true,...ref};
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks:[body,dragon],referenceIssue:ref.referenceIssue,referenceCondition:ref.referenceCondition};
    }

    if(['141303','1141301','1141307'].includes(selected.id)&&selected.requiresIndependentEvernight){
      const level=state.traceLevels[selected.traceKey],q=state.modifierInputs['evernight-memoquanta'],multiplier=selected.id==='1141301'?selected.baseCurve[level-1]+Math.floor(q/4)*selected.bonusCurve[level-1]:selected.multipliers[level-1];
      return {...selected,traceLevel:level,multiplier,...(selected.id==='1141301'?{scalingTerms:[{stat:'hp',multiplier:selected.baseCurve[level-1]},{stat:'hp',multiplier:Math.floor(q/4)*selected.bonusCurve[level-1]}]}:{}),attackType:selected.type,...independentMemospriteSnapshot('1413',selected)};
    }
    if(['1140701','1140702','1140706','1140712'].includes(selected.id)){
      const traceKey=selected.id==='1140706'||selected.id==='1140712'?'memTalent':'memSkill',level=state.traceLevels[traceKey],n=state.modifierInputs['castorice-breath-stage'],multiplier=selected.id==='1140702'?selected.breathStageMultipliers?.[n]?.[level-1]:selected.multipliers[level-1];
      const blessing=cyreneBlessingSnapshot('1141517','cyrene-life-death-active');
      return {...selected,traceKey,maximumTraceLevel:6,damageFormula:"statMultiplier",traceLevel:level,multiplier,attackType:selected.type,requiresIndependentCastorice:true,cyreneSupportLevel:blessing.cyreneSupportLevel,cyreneLifeDeathActive:blessing.cyreneBlessingActive,...independentMemospriteSnapshot('1407',selected)};
    }
    if(selected.id==='11407022'){
      const ref=independentMemospriteSnapshot('1407',selected),level=state.traceLevels.memSkill,sequenceAttacks=selected.damageComponents.map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack);
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks,...ref};
    }

    if(['1140901','1141501','1141526'].includes(selected.id))return {...selected,traceLevel:state.traceLevels.memSkill,multiplier:selected.multipliers[state.traceLevels.memSkill-1],attackType:selected.type,...independentMemospriteSnapshot(selected.characterId,selected)};
    if(selected.id==='11415012'){
      const ref=independentMemospriteSnapshot('1415',selected),level=state.traceLevels.memSkill,sequenceAttacks=selected.damageComponents.map(d=>state.data.attacks.find(a=>a.id===d.attackId)).filter(Boolean).map(resolvedAttack);
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks,...ref};
    }
    if(selected.id==='1140201')return {...selected,traceKey:'memSkill',traceLevel:state.traceLevels.memSkill,multiplier:selected.multipliers[state.traceLevels.memSkill-1],attackType:'memospriteSkill',...laftraSnapshot(selected)};
    if(['1402012','140208'].includes(selected.id)&&selected.damageFormula==='componentSequence'){
      const joint=selected.id==='140208',level=state.traceLevels.normal,talent=state.data.attacks.find(a=>a.id==='140204'),ref=joint?laftraSnapshot({...selected,id:'140208:laftra'}):null;
      const body=joint?{...selected,id:'140208:aglaea',damageFormula:'statMultiplier',damageComponents:undefined,hitCount:1,attackType:'enhancedNormal',traceLevel:level,multiplier:selected.multipliers[level-1]}:resolvedAttack(state.data.attacks.find(a=>a.id==='140201'));
      const sequenceAttacks=talent?[body,...(joint?[{...body,id:'140208:laftra',...ref}]:[]),resolvedAttack(talent)]:[];
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,sequenceAttacks,...(ref?{referenceIssue:ref.referenceIssue,referenceCondition:ref.referenceCondition}:{})};
    }

    if(selected.id==='150108')return {...selected,traceLevel:state.traceLevels.normal,multiplier:selected.multipliers[state.traceLevels.normal-1],sparxieSkillLevel:state.traceLevels.skill,sparxieTrapCount:state.modifierInputs['sparkle-interactive-trap-count'],attackType:'enhancedNormal'};
    if(selected.id==='1501042'){
      const n=state.modifierInputs['sparkle-interactive-trap-count'],level=state.traceLevels.talent,multipliers=[20,22,24,26,28,30,32.5,35,37.5,40].map((v,i)=>v+n*[10,11,12,13,14,15,16.25,17.5,18.75,20][i]);return {...selected,multipliers,traceLevel:level,multiplier:multipliers[level-1],sparxieTrapCount:n,attackType:'elation'};
    }
    if (["140809","140811"].includes(selected.id)) {
      const level=state.traceLevels.skill, n=state.modifierInputs[selected.id==="140809" ? "phainon-counter-flame-stacks" : "phainon-ruin-stacks"];
      const multiplier=selected.id==="140809" ? (selected.phainonCounterBaseMultipliers?.[level-1]+4*selected.phainonCounterBounceMultipliers?.[level-1])*(1+.2*n) : selected.phainonRuinMultipliers?.[String(n)]?.[level-1];
      return {...selected,traceLevel:level,multiplier:Number.isFinite(multiplier)?multiplier:NaN,traceLevelLabel:`スキルLv${level}・指定${Number.isInteger(n)?n:'未入力'}層`,attackType:selected.type};
    }
    if(["140603","1410032","1321043","1321012"].includes(selected.id) && selected.damageFormula==="componentSequence") {
      const sequenceAttacks=(selected.damageComponents||[]).map(d=>{
        const base=state.data.attacks.find(a=>a.id===d.attackId && a.characterId===selected.characterId);
        if(!base) return null;
        const resolved=resolvedAttack(base);
        return {...resolved, ...(base.damageFormula === "resolvedDamageMultiplier" ? {traceLevel:1,multiplier:150} : {}),recordInputKey:d.recordInputKey,recordMultiplier:d.recordMultiplier};
      });
      return {...selected,traceLevel:state.traceLevels[selected.traceKey],multiplier:selected.multipliers?.[state.traceLevels[selected.traceKey]-1],attackType:selected.type,...(selected.id==="1321012"?{traceLevelLabel:"通常Lv"+state.traceLevels.normal+"＋天賦Lv"+state.traceLevels.talent}:{}),sequenceAttacks:sequenceAttacks.filter(Boolean)};
    }
    if (selected.id==='120204' && selected.partyReference) {
      const ctx={...structuredModifierContext(),enemy:componentSnapshots().enemy};
      const ref=window.HsrModifierRuntime.supplementalReference({providerId:'1202',supplementalAttack:{statReference:'selectedParty',ownerInputKey:'party-reference-owner:1202',element:'Thunder',triggerActor:'provider'}},ctx,state.modifierInputs);
      return {...selected,traceLevel:state.traceLevels.talent,multiplier:selected.multipliers[state.traceLevels.talent-1],attackType:'additional',referenceCharacter:ref.character,referenceEnemy:ref.enemy,referenceStats:ref.stats,referenceRoles:ref,completedReferenceSnapshot:true,referenceIssue:ref.supported?'':ref.reason,referenceCondition:{id:'party-reference:1202',tab:'軌跡',valueInput:{key:'party-reference-owner:1202',shared:true}},calculationNote:selected.calculationNote+' 数値/帰属：'+(find('characters',ref.statReferenceId)?.name||'賜福対象未選択')+'。発生元/軌跡/発動者：停雲。'};
    }
    if (["1405011","1405021","1405013","1405024"].includes(selected.id)) {
      const parts=selected.damageComponents.map(c=>state.data.attacks.find(a=>a.id===c.attackId&&a.characterId==='1405'));
      const sequenceAttacks=parts.every(Boolean)?parts.map(a=>resolvedAttack(a)):[];
      return {...selected,cyreneExtraHitsActive:cyreneFixedState('cyrene-anaxa-extra-hits-active'),traceLevel:state.traceLevels[selected.traceKey],multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel:(["1405011","1405013"].includes(selected.id)?'通常Lv'+state.traceLevels.normal+'＋':'')+'スキルLv'+state.traceLevels.skill+'＋天賦Lv'+state.traceLevels.talent,attackType:selected.type,sequenceAttacks};
    }
    if (selected.damageFormula === "nativeBreakSequence") return {...selected,traceLevel:state.traceLevels[selected.traceKey],multiplier:selected.multipliers[state.traceLevels[selected.traceKey]-1],nativeUltimateLevel:state.traceLevels.ultimate,...(selected.id==="131718"?{nativeTalentLevel:state.traceLevels.talent}:{}),attackType:selected.type};
    if (selected.id === "131508") { const level=state.traceLevels.normal; return { ...selected, traceLevel:level, multiplier:selected.multipliers[level-1], attackType:selected.type, fanningInputs:{allowZeroStacks:selected.allowZeroStacks===true,confirmed:selected.comparisonModifierInputs?.["boothill-fanning-broken"]===true || state.modifierInputs["boothill-fanning-broken"]===true,stacks:state.modifierInputs["boothill-pocket-stacks"]===undefined?3:state.modifierInputs["boothill-pocket-stacks"],talentLevel:state.traceLevels.talent} }; }
    if (selected.id === "1151201") { const level=state.songbirdInputs.skillLevel; return { ...selected, traceLevel: level, multiplier: selected.multipliers[level-1] }; }
    if (selected.id === "140109" && selected.damageFormula === "componentSequence") {
      const level = state.traceLevels.skill;
      const sequenceAttacks = (selected.damageComponents || []).map(component => ({
        ...selected, ...component, id: component.attackId, sourceSkillId: "140109", damageFormula: "statMultiplier",
        damageComponents: undefined, hitCount: 1, hitCountLabel: "この成分1ヒット", canCrit: true, attackType: "enhancedSkill", traceLevel: level,
        multiplier: component.multipliers?.[level - 1], traceLevelLabel: `スキルLv${level}`
      }));
      return { ...selected, traceLevel: level, multiplier: selected.multipliers?.[level - 1], attackType: "enhancedSkill", traceLevelLabel: `スキルLv${level}`, sequenceAttacks };
    }
    if (selected.id === "130803" && selected.damageFormula === "componentSequence") {
      const level = state.traceLevels.ultimate;
      const dynamic = selected.numericModifierInputs?.some(spec => spec.inputKey === "acheron-initial-knots");
      let remaining = dynamic ? state.modifierInputs["acheron-initial-knots"] : 9;
      const components = (selected.damageComponents || []).flatMap(component => {
        if (!component.key.endsWith("-knots")) return [{...component, multiplier:component.multipliers?.[level - 1]}];
        const removed = Math.min(3, remaining); remaining -= removed;
        if (!Number.isInteger(removed) || removed <= 0) return [];
        return [{...component, multiplier:dynamic ? Math.min(component.capMultipliers?.[level - 1], component.perKnotMultipliers?.[level - 1] * (1 + removed)) : component.multipliers?.[level - 1]}];
      });
      const sequenceAttacks = components.map(component => ({
        ...selected, ...component, id: component.attackId, sourceSkillId: "130803", damageFormula: "statMultiplier",
        damageComponents: undefined, hitCount: 1, hitCountLabel: "この成分1ヒット", canCrit: true, attackType: "ultimate", traceLevel: level,
        traceLevelLabel: `必殺Lv${level}`
      }));
      return { ...selected, damageComponents:components, traceLevel: level, multiplier: selected.multipliers?.[level - 1], attackType: "ultimate", traceLevelLabel: `必殺Lv${level}`, sequenceAttacks, sequenceTemplates:selected.damageComponents };
    }
    if (selected.id === "1111083" && selected.damageFormula === "componentSequence") {
      const defs = selected.damageComponents.filter(c=>!c.optional || selected.ownBleed);
      const parts = defs.map(c=>state.data.attacks.find(a=>a.id===c.attackId && a.characterId===selected.characterId));
      const assumptions = {"luka-fighting-will-stacks":2,"luka-enemy-bleeding":selected.ownBleed?1:0};
      const sequenceAttacks = parts.every(Boolean) ? parts.map((a,i)=>({...resolvedAttack(a),damageFormula:a.damageFormula||"statMultiplier",hitCount:i===0?3+selected.realizedExtraPunches:1,formulaTraceLevel:a.formulaTraceKey?state.traceLevels[a.formulaTraceKey]:undefined,comparisonModifierInputs:assumptions,modifierInputKey:undefined,modifierInputMinimum:undefined,modifierConditions:undefined})) : [];
      return {...selected,traceLevel:state.traceLevels.normal,multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel: '通常Lv'+state.traceLevels.normal+(selected.ownBleed?'＋スキルLv'+state.traceLevels.skill+'＋天賦Lv'+state.traceLevels.talent:''),attackType:selected.type,sequenceAttacks,comparisonModifierInputs:assumptions};
    }
    if (selected.id === "1223031" && selected.damageFormula === "componentSequence") {
      const assumptions={"moze-prey-active":selected.preyActive===true};
      const parts=selected.damageComponents.map(c=>state.data.attacks.find(a=>a.id===c.attackId&&a.characterId==="1223"));
      const sequenceAttacks=parts.every(Boolean)?parts.map(a=>({...resolvedAttack(a),comparisonModifierInputs:assumptions,damageFormula:"statMultiplier"})):[];
      return {...selected,traceLevel:state.traceLevels.ultimate,multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel:'必殺Lv'+state.traceLevels.ultimate+'＋天賦Lv'+state.traceLevels.talent,attackType:selected.type,sequenceAttacks,comparisonModifierInputs:assumptions};
    }
    if (["1224011","1224081"].includes(selected.id)) {
      const enhanced=selected.id==="1224081", n=enhanced?selected.realizedHits:1;
      const shifuId=String(state.modifierInputs['march-shifu-id']||''), shifu=state.party.some(m=>String(m.characterId)===shifuId)?find('characters',shifuId):null, element=shifu?.element, path=({Rogue:"Hunt",Mage:"Erudition",Warrior:"Destruction",Memory:"Remembrance"})[shifu?.path]||shifu?.path;
      const basic=state.data.attacks.find(a=>a.id===(enhanced?'122408':'122401')&&a.characterId==='1224');
      const add=state.data.attacks.find(a=>a.id==='122402'&&a.characterId==='1224');
      const sequenceAttacks=basic&&add?[{...resolvedAttack(basic),type:enhanced?'enhancedNormal':'normal',attackType:enhanced?'enhancedNormal':'normal',hitCount:n,damageFormula:'statMultiplier',target:'single',rejectNormalOnlyModifiers:false},{...resolvedAttack(add),hitCount:n,element,type:'additional',attackType:'additional',scalingStat:'atk',target:'single',damageFormula:'statMultiplier',multiplier:[10,11,12,13,14,15,16.25,17.5,18.75,20][state.traceLevels.skill-1],sourceSkillId:'122402',rejectNormalOnlyModifiers:false,marchEnhancedAdditional:enhanced}]:[];
      return {...selected,hitCount:n,shifuElement:element,shifuPath:path,talentLevel:state.traceLevels.talent,traceLevel:state.traceLevels.normal,traceLevelLabel:'通常Lv'+state.traceLevels.normal+'＋スキルLv'+state.traceLevels.skill,attackType:selected.type,multiplier:sequenceAttacks[0]?.multiplier,sequenceAttacks};
    }
    if (selected.id === "1223021" && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(c=>state.data.attacks.find(a=>a.id===c.attackId&&a.characterId==="1223"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map(a=>({...resolvedAttack(a),damageFormula:"statMultiplier"})) : [];
      return {...selected,traceLevel:state.traceLevels.skill,multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel:`スキルLv${state.traceLevels.skill}＋天賦Lv${state.traceLevels.talent}`,attackType:selected.type,sequenceAttacks};
    }
    if (selected.id === "1222062" && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(d => state.data.attacks.find(a => a.id === d.attackId && a.characterId === "1222"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map((a,i) => ({...resolvedAttack(a), hitCount:i === 0 ? 2 : 4, damageFormula:"statMultiplier", comparisonModifierInputs:selected.comparisonModifierInputs})) : [];
      return {...selected, traceLevel:state.traceLevels.talent, multiplier:selected.multipliers[state.traceLevels.talent-1], traceLevelLabel:`天賦Lv${state.traceLevels.talent}＋星魂6固定倍率`, attackType:"followUp", sequenceAttacks};
    }
    if (selected.id === "1206022" && selected.damageFormula === "componentSequence") {
      const assumptions = {...selected.comparisonModifierInputs};
      const parts = selected.damageComponents.map(c => state.data.attacks.find(a => a.id === c.attackId && a.characterId === "1206"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map((a,i) => ({...resolvedAttack(a), damageFormula:"statMultiplier", hitCount:i === 2 ? 2 : 1, comparisonModifierInputs:assumptions, modifierInputKey:undefined, modifierConditions:undefined})) : [];
      return {...selected, traceLevel:state.traceLevels.skill, multiplier:sequenceAttacks[0]?.multiplier, traceLevelLabel:`スキルLv${state.traceLevels.skill}＋必殺Lv${state.traceLevels.ultimate}`, attackType:"skill", sequenceAttacks};
    }
    if (selected.id === "150403" && selected.characterId === "1504" && selected.damageFormula === "componentSequence") {
      const n=state.modifierInputs["fudie-gluttony-stacks"],components=selected.damageComponents.slice(0,Number.isInteger(n)&&n>=2&&n<=12?2+Math.floor(n/4):0);
      const sequenceAttacks=components.map((d,i)=>{const source=state.data.attacks.find(a=>a.id===d.attackId),effective=i?n-4*Math.max(0,i-1):undefined;if(!source)return null;return {...resolvedAttack(source),...(i?{fudieEffectiveStacks:effective}:{}),comparisonModifierInputs:{...source.comparisonModifierInputs,...(i?{"fudie-gluttony-stacks":effective}:{})}};}).filter(Boolean);
      return {...selected,damageComponents:components,traceLevel:state.traceLevels.ultimate,multiplier:selected.multipliers[state.traceLevels.ultimate-1],attackType:"ultimate",sequenceAttacks};
    }
    if (selected.id === "150905" && selected.damageFormula === "componentSequence") {
      const body=state.data.attacks.find(a=>a.id==="1509051"),wind=supplementalAttacks().find(a=>a.sourceModifierId==="trace:1509:150905:saber-wind-followup"),level=state.traceLevels.talent;
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:"followUp",sequenceAttacks:body&&wind?[resolvedAttack(body),{...wind,characterId:"1014",sourceSkillId:"150905",damageFormula:"statMultiplier"}]:[],referenceIssue:wind?.referenceIssue || (!wind?"セイバーを編成し、独立した完成済み戦闘値と敵の風耐性を入力してください。":""),referenceCondition:wind?.referenceCondition || {id:"party-reference:1014",tab:"軌跡"}};
    }
    if (["1506012","1506022","1505022","1505032","1505044","1513022","1513032","8009022","8010022","1501082","1501032","1502012"].includes(selected.id) && selected.damageFormula === "componentSequence") {
      const prior=state.modifierInputs["hiyu-prior-vulnerability"]===true || state.modifierInputs["hiyu-prior-fox-vulnerability"]===true;
      const sequenceAttacks=selected.damageComponents.map(d=>{
        const source=state.data.attacks.find(a=>a.id===d.attackId && a.characterId===selected.characterId);
        if(!source)return null;
        const comparisonModifierInputs=selected.id==="1505044" ? {...source.comparisonModifierInputs,"hiyu-fox-prior-vulnerability":true} : selected.characterId==="1505" ? {...source.comparisonModifierInputs,"hiyu-prior-vulnerability":selected.id==="1505032" || prior,"hiyu-prior-fox-vulnerability":selected.id==="1505032" || prior} : source.comparisonModifierInputs;
        return {...resolvedAttack(source),comparisonModifierInputs,...(selected.characterId==="1513"?{modifierInputKey:undefined}: {})};
      }).filter(Boolean);
      const hasOtherElation=state.party.some(m=>String(m.characterId)!==String(state.characterId) && find("characters",m.characterId)?.path==="Elation");
      const level=state.traceLevels[selected.traceKey];
      return {...selected,...(selected.characterId==="1506"?{talentTraceLevel:state.traceLevels.talent}:{}),hasOtherElation,sequenceAttacks,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,traceLevelLabel:`本体Lv${level}＋天賦Lv${state.traceLevels.talent}`};
    }
    if (["1005029","1005039","11005029","11005039","11005049"].includes(selected.id) && selected.damageFormula === "componentSequence") {
      const sequenceAttacks=selected.damageComponents.map((d,i)=>{
        const source=state.data.attacks.find(a=>a.id===d.attackId && a.characterId==="1005");
        if(!source)return null;
        return {...resolvedAttack({...source,...(i===1?{multiplierProductComponents:d.multiplierProductComponents}:{} )}),damageFormula:"statMultiplier",target:"single",hitCount:1};
      }).filter(Boolean);
      const level=state.traceLevels[selected.traceKey];
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],traceLevelLabel:`本体Lv${level}＋本人感電・必殺Lv${state.traceLevels.ultimate}`,attackType:selected.type,sequenceAttacks};
    }
    if (selected.id === "1210032" && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(c => state.data.attacks.find(a => a.id === c.attackId && a.characterId === "1210"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map(a => ({...resolvedAttack(a),damageFormula:"statMultiplier",target:"single",hitCount:1,comparisonModifierInputs:{...selected.comparisonModifierInputs},modifierInputKey:undefined,modifierConditions:undefined})) : [];
      return {...selected,traceLevel:state.traceLevels.ultimate,talentTraceLevel:state.traceLevels.talent,multiplier:selected.multipliers[state.traceLevels.ultimate-1],traceLevelLabel:`必殺Lv${state.traceLevels.ultimate}＋スキルLv${state.traceLevels.skill}＋天賦Lv${state.traceLevels.talent}`,attackType:"ultimate",sequenceAttacks};
    }
    if(selected.id==="151022"&&selected.characterId==="1510"&&selected.damageFormula==="componentSequence"){
      if(state.characterId!=="1510"){
        const ref=himekoOtherUserSnapshot(),level=ref.providerTalentLevel,damageComponents=selected.otherUserComponents,mode=ref.effectiveHimekoAccord,userName=character().name+(state.characterId==="1224"?"（巡狩）":"");
        const sequenceAttacks=damageComponents.map(d=>({...selected,...d,...ref,id:d.attackId,sourceSkillId:"151022",damageFormula:"statMultiplier",damageComponents:undefined,traceLevel:level,multiplier:d.multipliers[level-1],attackType:"assist",hitCountLabel:d.hitCount+"ヒット"}));
        return {...selected,...ref,name:'開拓が共にあらんことを（'+userName+'が使用・所有者：姫子）',traceLevel:level,multiplier:damageComponents[0].multipliers[level-1]+3*damageComponents[1].multipliers[level-1],attackType:"assist",traceLevelLabel:`姫子の天賦Lv${level}・協定${["なし","裁決","殲滅"][mode]||"不正"}`,damageComponents,sequenceAttacks,hitCountLabel:"姫子の全体1回＋単体3回",conditionText:"使用者と姫子Lv80/E0・境界中・敵1体・姫子の独立した最終値と天賦Lv1～10・状態一定。",calculationNote:"使用者："+userName+"。ダメージ所有者/ATK・会心参照者/倍率提供者：姫子・旅立ち。使用者の攻撃値は使用しません。姫子の全体80～160%＋単体3回×12～24%を合算。丹恒/丹恒・飲月/サンデーは裁決、三月なのか（氷/巡狩）・ヴェルトは殲滅をこの支援のダメージ前に自動適用し、ブローニャ・停雲は事前協定を維持します。姫子の天賦CD/耐性貫通も使用前に適用し、上の所有者別の反映済み指定を優先します。"};
      }
      const level=state.traceLevels.talent,mode=state.modifierInputs["himeko-departure-accord"]??0;
      const sequenceAttacks=selected.damageComponents.map(d=>({...selected,...d,id:d.attackId,sourceSkillId:"151022",damageFormula:"statMultiplier",damageComponents:undefined,traceLevel:level,multiplier:d.multipliers[level-1],attackType:"assist",hitCountLabel:d.hitCount+"ヒット"}));
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:"assist",traceLevelLabel:`天賦Lv${level}・協定${["なし","裁決","殲滅"][mode]||"不正"}`,sequenceAttacks};
    }
    if(selected.id==="151009" && selected.characterId==="1510" && selected.damageFormula==="componentSequence") {
      const level=state.traceLevels.ultimate,drive=state.modifierInputs["himeko-departure-drive"];
      const damageComponents=selected.damageComponents.filter(d=>d.key!=="shots"||drive!==1);
      const sequenceAttacks=damageComponents.map(d=>({...selected,...d,id:d.attackId,sourceSkillId:selected.id,damageFormula:"statMultiplier",damageComponents:undefined,traceLevel:level,multiplier:d.multipliers[level-1]+(d.key==="shots"&&drive===3?30:0),hitCount:d.key==="shots"?drive:1,hitCountLabel:d.key==="shots"?`追加弾${drive}発（A6${drive===3?"あり":"なし"}）`:"基本全体パルス1回",attackType:"ultimate"}));
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:"ultimate",traceLevelLabel:`必殺Lv${level}・事前原動力${Number.isInteger(drive)?drive:"未指定"}`,damageComponents,sequenceAttacks};
    }
    if(selected.characterId==="1213" && ["121301","121308","121310","121312","121303"].includes(selected.id) && selected.damageFormula==="componentSequence") {
      const level=state.traceLevels[selected.traceKey];
      const sequenceAttacks=selected.damageComponents.map(d=>({...selected,...d,id:d.attackId,sourceSkillId:selected.id,damageFormula:"statMultiplier",damageComponents:undefined,hitCountLabel:"この成分1ヒット",traceLevel:level,multiplier:d.multipliers[level-1],attackType:selected.type}));
      return {...selected,traceLevel:level,multiplier:selected.multipliers[level-1],attackType:selected.type,skillTraceLevel:state.traceLevels.skill,talentTraceLevel:state.traceLevels.talent,traceLevelLabel:`本体Lv${level}・スキルLv${state.traceLevels.skill}・天賦Lv${state.traceLevels.talent}・開始0層`,sequenceAttacks};
    }
    if (["1004012","1004022","1004032","11004012","11004022","11004032"].includes(selected.id) && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(c => state.data.attacks.find(a => a.id === c.attackId && a.characterId === "1004"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map((a,i) => ({...resolvedAttack(a), damageFormula:"statMultiplier", target:"single", hitCount:selected.damageComponents[i].hitCount,...(selected.comparisonModifierInputs?{comparisonModifierInputs:{...selected.comparisonModifierInputs}}:{})})) : [];
      const level = state.traceLevels[selected.traceKey];
      return {...selected, traceLevel:level, multiplier:sequenceAttacks[0]?.multiplier, traceLevelLabel:`本体Lv${level}＋天賦Lv${state.traceLevels.talent}`, attackType:selected.type, sequenceAttacks};
    }
    if (["1109012","1109022","1109092","1109032","1103012","1103022","1103032"].includes(selected.id) && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(c => state.data.attacks.find(a => a.id === c.attackId && a.characterId === selected.characterId));
      const sequenceAttacks = parts.every(Boolean) ? parts.map(a => ({...resolvedAttack(a), damageFormula:"statMultiplier", target:"single", hitCount:1, modifierInputKey:undefined, modifierConditions:undefined})) : [];
      const level = state.traceLevels[selected.traceKey];
      return {...selected, traceLevel:level, multiplier:sequenceAttacks[0]?.multiplier, traceLevelLabel:`本体Lv${level}＋天賦Lv${state.traceLevels.talent}`, attackType:selected.type, sequenceAttacks};
    }
    if (selected.id === "1207011" && selected.damageFormula === "componentSequence") {
      const parts = selected.damageComponents.map(c=>state.data.attacks.find(a=>a.id===c.attackId&&a.characterId==="1207"));
      const sequenceAttacks = parts.every(Boolean) ? parts.map(a=>({...resolvedAttack(a),damageFormula:"statMultiplier"})) : [];
      return {...selected,traceLevel:state.traceLevels.normal,multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel:`通常Lv${state.traceLevels.normal}＋天賦Lv${state.traceLevels.talent}`,attackType:selected.type,sequenceAttacks};
    }
    if (selected.id === "122002" && selected.damageFormula === "componentSequence") {
      const level = num(state.traceLevels.skill, 10);
      const multiplier = num(selected.multipliers?.[level - 1]);
      const skill = { ...selected, damageFormula: "statMultiplier", type: "skill", attackType: "skill", scalingStat: "atk", target: "single", hitCount: 1, hitCountLabel: "全段合算", canCrit: true, multiplier, adjacentMultipliers: undefined, adjacentMultiplierRatio: undefined, damageComponents: undefined, traceLevel: level, traceLevelLabel: `スキルLv${level}` };
      const followUpRecord = state.data.attacks.find(item => item.id === "122004" && item.characterId === "1220");
      const followUp = followUpRecord ? resolvedAttack(followUpRecord) : null;
      const definitions = selected.damageComponents || [];
      return { ...selected, traceLevel: level, multiplier, traceLevelLabel: `スキルLv${level}＋天賦Lv${state.traceLevels.talent}`, sequenceAttacks: definitions.length === 2 && followUp ? [skill, followUp] : [] };
    }
    const masterSkill = character()?.skills?.find((skill) => skill.id === selected.skillId || skill.id === selected.id);
    const traceKey = masterSkill && ["MemospriteSkill", "MemospriteTalent"].includes(masterSkill.type) ? traceKeyForSkill(masterSkill) : selected.traceKey;
    const level = selected.fixedTraceLevel ?? num(state.traceLevels[traceKey], traceKey === "normal" ? 6 : 10);
    const index = Math.max(0, Math.min(selected.multipliers.length - 1, level - 1));
    const inputHitCount = selected.hitCountInputKey ? num(attackHitCountInput(selected), selected.hitCountDefault || 0) : null;
    const eidolonHitCount = selected.hitCountAtEidolon && state.eidolon >= num(selected.hitCountAtEidolon.rank) ? num(selected.hitCountAtEidolon.value, selected.hitCount) : selected.hitCount;
    const referencedHits = selected.hitCountReference === "enemy.debuffCount" ? Math.max(0, Math.min(num(selected.hitCountMaximum, 99), num(state.enemy.debuffCount)))
      : selected.hitCountInputKey ? Math.max(num(selected.hitCountMinimum, 0), Math.min(num(selected.hitCountMaximum, 99), inputHitCount))
      : eidolonHitCount;
    const componentDefinitions = selected.multiplierProductComponents || selected.multiplierComponents;
    const components = Array.isArray(componentDefinitions) ? componentDefinitions.map((component) => {
      const componentLevel = num(state.traceLevels[component.traceKey], component.traceKey === "normal" ? 6 : 10);
      const componentIndex = Math.max(0, Math.min((component.values || []).length - 1, componentLevel - 1));
      return { ...component, level: componentLevel, value: num(component.values?.[componentIndex]) };
    }) : [];
    const resolveScalingTerms = (terms = []) => terms.map((term) => {
      const termTrace = term.traceKey || selected.traceKey;
      const termLevel = num(state.traceLevels[termTrace], termTrace === "normal" ? 6 : 10);
      const termIndex = Math.max(0, Math.min((term.values || []).length - 1, termLevel - 1));
      return { stat: term.stat || "atk", multiplier: num(term.values?.[termIndex], term.multiplier), receivesMultiplierAddition: term.receivesMultiplierAddition === true };
    });
    const scalingTerms = resolveScalingTerms(selected.scalingTermComponents || selected.scalingTerms);
    const adjacentScalingTerms = resolveScalingTerms(selected.adjacentScalingTermComponents || selected.adjacentScalingTerms);
    const multiplier = components.length ? selected.multiplierProductComponents ? components.reduce((product, component) => product * component.value / 100, 100) : components.reduce((sum, component) => sum + component.value, 0) : selected.multipliers[index];
    const formulaLevel = num(state.traceLevels[selected.formulaTraceKey], selected.formulaTraceKey === "normal" ? 6 : 10);
    const formulaIndex = Math.max(0, formulaLevel - 1);
    const enemyHpPercent = selected.enemyHpPercentMultipliers?.[Math.min(selected.enemyHpPercentMultipliers.length - 1, formulaIndex)];
    const atkCapPercent = selected.atkCapMultipliers?.[Math.min(selected.atkCapMultipliers.length - 1, formulaIndex)];
    const adjacentMultiplier = selected.adjacentMultiplierRatio !== undefined ? multiplier * num(selected.adjacentMultiplierRatio) / 100 : selected.adjacentMultipliers?.[index] || 0;
    const traceLevelLabel = selected.fixedTraceLevel ? (selected.requiredEidolon ? `星魂${selected.requiredEidolon}・固定倍率` : `追加能力Lv${level}`) : components.length ? [...new Set(components.map((component) => `${ATTACK_LABELS[component.traceKey] || component.traceKey}Lv${component.level}`))].join("＋") : `Lv${level}`;
    const multiplierAdditionScale = Array.isArray(selected.multiplierAdditionScaleValues)
      ? num(selected.multiplierAdditionScaleValues[Math.min(selected.multiplierAdditionScaleValues.length - 1, index)], 1)
      : num(selected.multiplierAdditionScale, 1);
    return { ...selected, traceKey, hitCount: referencedHits, hitCountReference: selected.hitCountReference || selected.hitCountInputKey || "", attackType: selected.type, element: selected.damageFormula === "trueDamage" ? "None" : selected.element || character()?.element || "", multiplier, adjacentMultiplier, scalingTerms, adjacentScalingTerms, enemyHpPercent, atkCapPercent, multiplierAdditionScale, traceLevel: level, traceLevelLabel, resolvedMultiplierComponents: components };
  }

  function supplementalAttacks() {
    const context = {...structuredModifierContext(),enemy:componentSnapshots().enemy};
    return structuredSourceConditions().filter((item) => item.enabled && item.calculable && item.supplementalAttack && state.characterId!=="1202").map((item) => {
      const source = item.sourceMeta || {};
      const level = source.skillId ? num(context.traceLevelFor(source), 10) : 1;
      const reference=window.HsrModifierRuntime.supplementalReference(item,context,state.modifierInputs);
      const resKey="enemy-resistance:"+item.supplementalAttack.element, cross=item.supplementalAttack.element!==character()?.element;
      if(cross && !Number.isFinite(state.modifierInputs[resKey])) { reference.supported=false; reference.reason=(reference.reason?reference.reason+" ":"")+"敵の"+(ELEMENT_KEYS[item.supplementalAttack.element]||item.supplementalAttack.element)+"属性耐性を入力してください。補正なしは0です。"; }
      const sourceName=find("characters",reference.sourceCharacterId)?.name||reference.sourceCharacterId;
      const ownerName=find("characters",reference.statReferenceId)?.name||character()?.name||state.characterId;
      const triggerName=find("characters",reference.triggerCharacterId)?.name||reference.triggerCharacterId;
      return {
        referenceCharacter:reference.character,completedReferenceSnapshot:!!reference.character,referenceStats:reference.stats,referenceEnemy:reference.enemy || (cross?{...state.enemy,resistance:state.modifierInputs[resKey],resistances:{[item.supplementalAttack.element]:state.modifierInputs[resKey]}}:undefined),referenceRoles:reference,referenceIssue:reference.supported?"":reference.reason,referenceCondition:{...item,valueInput:{key:reference.inputKey,shared:true}},
        calculationNote:source.kind === "lightCone" ? `光円錐：${find("lightCones",source.id)?.name || source.id}。数値参照：${ownerName}の最終${item.supplementalAttack.scalingStat.toUpperCase()}・${ELEMENT_KEYS[item.supplementalAttack.element] || item.supplementalAttack.element}属性与ダメージ。条件：${item.conditionText}。元攻撃とは別の1回分で、自動合算しません。` : `発生元：${sourceName}。数値参照：${ownerName}の最終ATK・会心・${ELEMENT_KEYS[item.supplementalAttack.element]||item.supplementalAttack.element}属性与ダメージ。発動：${item.supplementalAttack.requiredStatReferenceId ? "成立済みの連携追加攻撃" : triggerName+"の攻撃後"}。軌跡Lvは${sourceName}を参照します。元攻撃とは別の1回分で、自動合算しません。`,
        ...(item.supplementalAttack.requiredStatReferenceId ? {characterLevelExact:80,maximumEidolon:0,enemyCountExact:1,maximumTraceLevel:10,enforceSnapshotContract:true} : {}),
        id: `supplemental:${item.id}`,
        sourceModifierId: item.id,
        support: item.support,
        name: item.supplementalAttack.name,
        type: item.supplementalAttack.type,
        attackType: item.supplementalAttack.type,
        element: item.supplementalAttack.element,
        scalingStat: item.supplementalAttack.scalingStat,
        target: item.supplementalAttack.target || "single",
        canCrit: item.supplementalAttack.canCrit,
        multiplier: item.value,
        hitCount: 1,
        traceLevel: level,
        traceLevelLabel: source.kind === "lightCone" ? `光円錐S${state.coneRank}` : source.skillId ? `Lv${level}` : ""
      };
    });
  }

  function renderWarnings(warnings, title = "計算条件について") {
    $("hsrWarnings").classList.add("genshin-json-calc-warnings");
    $("hsrWarnings").hidden = !warnings.length;
    $("hsrWarnings").innerHTML = warnings.length ? '<p>' + esc(title) + '</p><ul>' + [...new Set(warnings)].map(item => '<li>' + esc(item) + '</li>').join("") + '</ul>' : "";
  }

  function openConditionSettings(fieldId = "") {
    collectInputs(); renderConditions();
    const dialog = $("hsrConditionDialog"); openModal(dialog);
    const region = dialog.querySelector(".genshin-condition-dialog-body");
    if (region) region.scrollTop = 0;
    requestAnimationFrame(() => {
      const input = fieldId && $(fieldId);
      if (input) { input.focus?.({ preventScroll: true }); input.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
    });
  }

  function openProviderTraceSettings(id, key) {
    const slot = state.party.findIndex(member => member.characterId === id);
    if (slot < 0) return;
    closeDialog($("hsrConditionDialog")); renderPartyDialog(); openModal($("hsrPartyDialog"));
    requestAnimationFrame(() => {
      const input = $("hsrPartyRows").querySelector(`[data-party-trace="${key}"][data-slot="${slot}"]`);
      input?.focus?.({preventScroll:true}); input?.scrollIntoView?.({block:"center",behavior:"smooth"});
    });
  }

  function navigateInput(fieldId) {
    if (modifierIssueLinks.has(fieldId)) {
      const {item, message} = modifierIssueLinks.get(fieldId);
      const provider = state.party.findIndex(member => member.characterId === item.providerId);
      const needsLevel = /(?:軌跡|天賦|精霊天賦|スキル|必殺技|通常)Lv/.test(message) && !item.levelInput;
      if (provider >= 0 && needsLevel) {
        renderPartyDialog(); openModal($("hsrPartyDialog"));
        requestAnimationFrame(() => {
          const source = state.data.structuredModifiers.find(record => record.id === item.id)?.source;
          const skill = find("characters", item.providerId)?.skills?.find(entry => entry.id === source?.skillId);
          const key = Object.entries(TRACE_FIELDS).find(([, [type]]) => type === skill?.type)?.[0];
          const selector = `[data-party-trace="${key}"][data-slot="${provider}"]`;
          const input = $("hsrPartyRows").querySelector(selector); input?.focus?.({preventScroll:true}); input?.scrollIntoView?.({block:"center",behavior:"smooth"});
        });
        return;
      }
      state.conditionTab = item.tab; openConditionSettings();
      requestAnimationFrame(() => {
        const card = [...$("hsrConditionList").querySelectorAll("[data-hsr-condition-ids]")].find(node => node.dataset.hsrConditionIds.split(" ").includes(item.id));
        card?.closest?.("details")?.setAttribute("open", "");
        const key = item.levelInput && message.includes(item.levelInput.label) ? item.levelInput.key : item.valueInput?.key;
        const input = (key && card?.querySelector(`[data-structured-input="${key}"]`)) || card?.querySelector("[data-structured-provider-stat]") || (item.valueInput?.shared && key && $("hsrConditionList").querySelector(`[data-structured-input="${key}"]`)) || card?.querySelector("input,select");
        input?.focus?.({preventScroll:true}); (input || card)?.scrollIntoView?.({block:"center",behavior:"smooth"});
      });
      return;
    }
    if (fieldId === "hsrConditionDialogOpen") { state.conditionTab = "軌跡"; openConditionSettings(); return; }
    const input = $(fieldId); if (!input) return;
    input.closest?.("details")?.setAttribute("open", "");
    input.focus?.({ preventScroll: true }); input.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function scrollToResults() {
    const panel = $("hsrResultPanel");
    if (typeof window.scrollTo === "function" && panel.getBoundingClientRect) {
      const height = document.querySelector(".teti-site-header")?.getBoundingClientRect().height || 0;
      window.scrollTo({ top: Math.max(0, panel.getBoundingClientRect().top + window.pageYOffset - height - 14), behavior: "smooth" });
    } else panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function inputFeedback(messages = [], fields = new Map(), calculated = 0) {
    document.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute("aria-invalid"));
    document.querySelectorAll('.hsr-field-error').forEach(error => { error.hidden = true; });
    fields.forEach((message,id) => {
      const input = $(id); if (!input) return;
      input.setAttribute?.("aria-invalid", "true");
      let error = $(id + "Error");
      if (!error && input.insertAdjacentHTML) { input.insertAdjacentHTML("afterend", '<small class="hsr-field-error" id="' + id + 'Error"></small>'); error = $(id + "Error"); }
      if (error) { error.textContent = id === "hsrEidolon" ? `選択中の星魂${state.eidolon}では計算できない攻撃があります。未対応の効果と理由は、結果欄の各攻撃で確認できます。` : message; error.hidden = false; input.setAttribute?.("aria-errormessage", id + "Error"); }
    });
    const feedback = $("hsrCalculationFeedback"); feedback.hidden = !messages.length;
    if (calculated) {
      feedback.innerHTML = messages.length ? '<span>' + calculated + '件を計算しました。計算できない結果の条件は、結果欄から確認できます。</span>' : "";
      return;
    }
    feedback.innerHTML = messages.length ? '<strong>計算に必要な入力を確認してください。</strong><ul>' + [...new Set(messages)].map(message => {
      const field = [...fields].find(([,text]) => text === message)?.[0];
      return '<li>' + (field ? '<button type="button" data-hsr-input-target="' + field + '">' + esc(message) + '</button>' : esc(message)) + '</li>';
    }).join("") + '</ul>' : "";
  }

  function finishCalculation(messages = [], fields = new Map(), calculated = 0) {
    inputFeedback(messages, fields, calculated);
    $("hsrDirtyNotice").hidden = true;
    updateConditionSummary(); refreshConditionFacts();
    const first = !calculated && fields.size ? [...fields.keys()][0] : "";
    requestAnimationFrame(() => { if (first) navigateInput(first); else scrollToResults(); });
  }

  function attackSupport(attack) {
    if (attack.damageFormula === "trueDamage" && state.eidolon !== 0) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "キュレネの領域の確定ダメージは星魂0のみ計算対応です。" };
    if (attack.support?.status === "displayOnly") return { status: "displayOnly", label: "表示のみ・計算不可", reason: attack.support.reason };
    if (attack.damageFormula === "elation" && (state.level !== 80 || state.eidolon !== 0)) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "この愉悦攻撃はLv80・星魂0のアッハタイム中のみ計算対応です。" };
    if (["151320", "151321"].includes(attack.id) && state.enemy.count !== 1) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "夏アベンチュリンの愉悦攻撃は敵1体のみ計算対応です。複数敵分配は計算しません。" };
    if (attack.id === "150220" && state.enemy.count !== 1) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "爻光の愉悦スキルは敵が1体の場合のみ計算対応です。複数対象への分配は計算しません。" };
    const reason = attack.type === "break" ? "" : window.HsrCalcEngine.unsupportedAttackReason(attack);
    if (reason) return { status: "displayOnly", label: "表示のみ・計算不可", reason };
    if (attack.support?.status === "calculable" && attack.support.verified === true) return { status: "calculable", label: "計算可能" };
    return { status: "review", label: "参考値" };
  }

  function renderEidolonScope() {
    const note = $("hsrEidolonSupport");
    const attacks = availableAttacks();
    note.hidden = !character() || (!state.eidolon && !attacks.some(attack => attack.maximumEidolon !== undefined));
    const partiallySupported = attacks.some(attack => attack.maximumEidolon !== undefined && state.eidolon > attack.maximumEidolon);
    note.textContent = `${character()?.name || ""}・星魂${state.eidolon}：${partiallySupported ? "一部の攻撃は選択中の星魂に未対応です。" : ""}反映できる星魂効果は攻撃ごとに異なります。各結果の「星魂の反映範囲」と未対応理由を確認してください。未対応の攻撃は星魂0相当へ置き換えません。`;
  }

  function supportBadge(attack) {
    const support = attackSupport(attack);
    const notes = state.eidolon <= attack.maximumEidolon && attack.eidolonSupportNotes
      ? attack.eidolonSupportNotes.filter(note => state.eidolon === 0 ? note.rank === 0 : note.rank > 0 && note.rank <= state.eidolon).map(note => note.text) : [];
    if (!notes.length) {
      if (attack.eidolonSupportNote && state.eidolon <= attack.maximumEidolon) notes.push(state.eidolon === 0 ? "星魂0で計算しています。星魂の固有補正は加算しません。" : attack.eidolonSupportNote);
      else if (state.eidolon > 0 && support.status === "review") notes.push("この攻撃の星魂効果全体は未検証です。入力した最終ステータス・軌跡Lvと、内訳に掲載した補正の範囲で計算した参考値です。");
    }
    const eidolonScope = notes.length ? `<details class="hsr-eidolon-scope" open><summary>星魂${state.eidolon}の反映範囲</summary>${notes.map(note => `<p>${esc(note)}</p>`).join("")}</details>` : "";
    return `<p class="hsr-support-status" data-support-status="${support.status}">${esc(support.label)}</p>${eidolonScope}${support.status === "review" ? `<p class="hsr-formula-note">参考値：攻撃ごとの独立検証が完了していません。倍率・参照値・追加成分・発動条件を確認し、独立計算との一致を記録するまで参考値として扱います。</p>` : ""}`;
  }

  function damageValues(result) {
    const correlated=result.breakdown.sourceKind==='ahaInstantNonTrueDamage'&&result.breakdown.correlatedCritBranches===true;
    const values = correlated ? [["本体が非会心の場合",result.nonCrit],["本体が会心の場合",result.crit],["本体の期待値に対応",result.expected]] : result.attack.canCrit ? [["非会心", result.nonCrit], ["会心", result.crit], ["期待値", result.expected]] : [[result.breakdown.damageFormula === "trueDamage" ? "追加確定ダメージ" : "ダメージ", result.nonCrit]];
    return `<div class="hsr-attack-result-values${result.attack.canCrit || correlated ? "" : " hsr-attack-result-values--single"}">${values.map(([label, value]) => `<div><span>${label}（${result.breakdown.damageFormula === "trueDamage" ? "1回分" : "合計"}）</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
  }

  const detailNumber = (value) => Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 6 });
  const SCALING_LABELS = { atk: "攻撃力", hp: "HP", def: "防御力", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度", healingRecord: "攻撃直前の累計治癒量" };

  function ahaDebtBreakdown(debt) {
    if(!debt)return '';
    if(!debt.supported)return '<section class="hsr-target-breakdown"><h4>負債のHP内訳・計算対象外</h4><p>'+esc(debt.reason)+'</p></section>';
    if(debt.kind==='hpEvent') {
      const b=debt.update;
      const rows=[['HPの所有者',debt.hpOwner==='shareMain'?'生存している共有HP本体':'独立した敵'],['全層の最大HP（変更なし）',debt.maxHp],['HP層数',debt.layerCount],['1層あたりの最大HP',debt.maxHpPerLayer],['変化前の現在HP',debt.initialHp],['変化前の負債比率（%）',debt.priorDebtPercent],['指定した実HP変化量',debt.event.change],['通常のHP変化直後',b.normalHpAfter],['負債処理後の現在HP',b.hpAfter],['処理後の負債比率（%）',b.debtPercentAfter],['現在層の負債HP相当',b.debtHpAfter],['負債処理内の層移動数',b.crossedLayers],['負債による追加HP減少（適用量）',b.actualDirtyHpLoss],['負債による追加HP回復',b.dirtyHpHeal]];
      if(Number.isFinite(debt.event.storedDebtPercent))rows.push(['処理後に退避されている負債比率（%）',debt.event.storedDebtPercent]);
      return '<section class="hsr-target-breakdown"><h4>負債のHP内訳・指定した実HPイベント</h4><p>このHP内訳は入力した1回の実HP変化から計算します。上の理論攻撃値から換算した結果や会心別の予測ではありません。共有HPは本体の状態だけを更新し、表示用の子へ重複適用しません。</p><dl>'+rows.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+(typeof value==='number'?detailNumber(value):esc(value))+'</dd></div>').join('')+'</dl><p>層境界では持越し上限10%を使い、その後の同じ層への増分は別に加えます。HP操作はヒットや確定成分の記録へ加算しません。段階の退避・復元は指定した処理直前からのみ算出します。死亡・致死からの段階移行・共有先の切替を自動再現しません。</p></section>';
    }
    const rows=[['最大HP（変更なし）',debt.maxHp],['攻撃前の現在HP',debt.initialHp],['攻撃前の負債比率（%）',debt.priorDebtPercent],['攻撃前の負債HP相当',debt.priorDebtHp]];
    return '<section class="hsr-target-breakdown"><h4>負債のHP内訳・単一HPの敵</h4><p>負債はHP占有状態です。通常ダメージや記録確定成分へ追加しません。最大HPを変更せず、この分岐では負債による追加の即時HP減少もありません。</p><dl>'+rows.map(([label,value])=>'<div><dt>'+label+'</dt><dd>'+detailNumber(value)+'</dd></div>').join('')+'</dl>'+[['nonCrit','非会心の場合'],['crit','会心の場合'],['expected','期待値の場合']].map(([key,label])=>{const b=debt.branches[key];return '<h5>'+label+'</h5><dl>'+[['攻撃によるHP減少',b.normalHpLoss],['攻撃後の現在HP',b.hpAfter],['攻撃後の負債比率（%）',b.debtPercentAfter],['攻撃後の負債HP相当',b.debtHpAfter]].map(([name,value])=>'<div><dt>'+name+'</dt><dd>'+detailNumber(value)+'</dd></div>').join('')+'</dl>';}).join('')+'<p>比率増分＝攻撃によるHP減少×25%÷最大HP。10%はこの通常HP減少分岐の上限ではありません。次のHP層・段階への持越しや回復は計算対象外です。</p></section>';
  }

  function damageBreakdown(result, targetLabel, component=false) {
    return damageBreakdownCore(result,targetLabel)+(component?'':ahaDebtBreakdown(result.ahaDebt));
  }

  function damageBreakdownCore(result, targetLabel) {
    const b = result.breakdown;
    if (b.damageFormula === "componentSequence") {
      const componentNames = b.componentNames || [];
      const componentDetails = Object.entries(result.components || {}).map(([key, component], index) => `<h4>${esc(componentNames[index] || component.componentName || key)}</h4>${damageBreakdown(component, "同一対象・各成分", true)}`).join("");
      return `<section class="hsr-target-breakdown"><h4>構成成分と合計</h4><p class="hsr-formula-note">${esc(b.condition || "各成分を個別計算し、同一対象の結果を合算します。")}</p>${componentDetails}<h4>${esc(b.totalLabel || "スキル本体＋追加攻撃の合計")}</h4>${damageValues(result)}</section>`;
    }
    if (b.damageFormula === "normalAndBreak") {
      const extra = result.components.break;
      return `<section class="hsr-target-breakdown"><h4>通常部分と天賦撃破の合計</h4>${damageBreakdown(result.components.direct, "通常部分（全段合算）")}<h4>天賦・物理撃破ダメージ</h4><dl>${[["ポケットアドバンテージ",b.stacks],["物理撃破に対する天賦倍率（%）",b.breakMultiplierPercent],["撃破基礎値",extra.base],["属性・天賦倍率",extra.multiplier],["撃破特効倍率",extra.effect],["防御倍率",extra.defense],["耐性倍率",extra.resistance],["最大靭性倍率",extra.toughnessScale],["被ダメージ倍率",extra.vulnerability],["天賦撃破ダメージ",extra.value]].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${detailNumber(value)}</dd></div>`).join("")}</dl><p class="hsr-formula-note">天賦撃破は会心しません。元の撃破イベント・撃破DoT・超撃破は合算しません。</p><h4>通常部分＋天賦撃破</h4>${damageValues(result)}</section>`;
    }

    if (b.damageFormula === "breakComponent" && b.kind === "break") return '<section class="hsr-target-breakdown"><h4>天賦追加撃破・会心不可</h4><dl>'+[['最終戦闘撃破特効（%）',b.finalBreakEffect],['消費チャージ',b.charge],['天賦追加撃破倍率（%）',b.coefficient],['撃破基礎値',b.base],['属性・攻撃倍率',b.multiplier],['撃破特効倍率',b.effect],['撃破与ダメージ倍率',b.breakDamageMultiplier],['最大靭性倍率',b.toughnessScale],['防御倍率',b.defense],['耐性倍率',b.resistance],['被ダメージ倍率',b.vulnerability],['追加撃破ダメージ',b.value]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+detailNumber(v)+'</dd></div>').join('')+'</dl>'+damageValues(result)+'</section>';
    if (b.damageFormula === "breakComponent") return '<section class="hsr-target-breakdown"><h4>本人の超撃破・会心不可</h4><dl>'+[['最終戦闘撃破特効（%）',b.finalBreakEffect],['発生倍率',b.conversionMultiplier],['基礎削靭（通常攻撃10の単位）',b.toughnessDamage],['撃破効率倍率',b.breakEfficiency],['有効削靭',b.effectiveToughnessDamage],['防御倍率',b.defense],['耐性倍率',b.resistance],['被ダメージ倍率',b.vulnerability],['超撃破ダメージ',b.value]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+detailNumber(v)+'</dd></div>').join('')+'</dl>'+damageValues(result)+'</section>';
    if (b.damageFormula === "resolvedDamageMultiplier") return '<section class="hsr-target-breakdown"><h4>'+(b.dataOwnerId==='1410'?'本人の事前DoT起爆':'事前DoTの起爆')+'</h4><p>'+esc(b.condition)+'</p><dl><div><dt>所有DoTの補正済み1回分</dt><dd>'+detailNumber(b.referenceValue)+'</dd></div><div><dt>起爆倍率</dt><dd>'+detailNumber(b.multiplier)+'%</dd></div></dl>'+damageValues(result)+'</section>';
    if(b.damageFormula==='trueDamage'&&b.sourceKind==='ahaInstantNonTrueDamage')return `<section class="hsr-target-breakdown"><h4>同じ愉悦スキルの記録確定成分</h4><p>この成分自体は会心しません。本体の会心によって参照記録が変わるため、各場合を分けて表示します。防御・耐性等は再適用せず、事前記録値自体は合計に足しません。</p><dl><div><dt>本体発動前の確定以外の実ダメージ記録</dt><dd>${detailNumber(b.recordBefore)}</dd></div>${[['nonCrit','本体が非会心の場合の記録'],['crit','本体が会心の場合の記録'],['expected','本体の期待値に対応する記録']].map(([key,label])=>`<div><dt>${label}</dt><dd>${detailNumber(b.recordAfter[key])}</dd></div>`).join('')}<div><dt>確定成分への変換倍率</dt><dd>20%</dd></div></dl>${damageValues(result)}</section>`;
    if (b.damageFormula === "trueDamage") return `<section class="hsr-target-breakdown"><h4>敵1体・追加確定ダメージ1回分</h4><dl><div><dt>${b.sourceKind === "cipherRecord" ? "この成分が参照する記録値" : "参照元ダメージ（補正適用後）"}</dt><dd>${detailNumber(b.originalDamage)}</dd></div><div><dt>確定ダメージ倍率</dt><dd>${detailNumber(b.multiplierPercent)}%</dd></div><div><dt>追加確定ダメージ</dt><dd>${detailNumber(result.nonCrit)}</dd></div><div><dt>適用条件</dt><dd>${esc(b.condition)}</dd></div></dl><p>${b.sourceKind === "cipherRecord" ? "記録値 × 確定ダメージ倍率。会心・防御・耐性・与ダメージ等は再適用せず、記録値自体を合計へ足しません。" : "元ダメージ × 確定ダメージ倍率。会心・防御・耐性・与ダメージ・靭性等は再適用しません。元ダメージとの合算は行いません。"}</p>${damageValues(result)}</section>`;
    const row = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    const nativeCrit = result.applied.find(item => item.id === "trace:1221:122103:slash-critical-damage");
    const otherCrit = result.applied.filter(item => item.category === "critDamage" && item !== nativeCrit).reduce((total, item) => total + item.value, 0);
    const critOrigin = nativeCrit ? row("会心ダメージの内訳", [
      "最終入力" + detailNumber(b.critDamagePercent - nativeCrit.value - otherCrit) + "%",
      "必殺技「構え」" + detailNumber(nativeCrit.value) + "%",
      ...(otherCrit ? ["その他の補正" + detailNumber(otherCrit) + "%"] : [])
    ].join(" ＋ ") + " ＝ " + detailNumber(b.critDamagePercent) + "%") : "";
    const isElation = b.damageFormula === "elation";
    const components = b.elationComponents;
    const scaling = isElation
      ? row("Lv80の愉悦基礎値 × 攻撃倍率", `${detailNumber(b.levelBase)} × ${detailNumber(b.multiplierPercent)}%`)
        + (b.skill11BaseMultiplier > 1 ? row("シークレットスコアの基礎倍率", "×"+detailNumber(b.skill11BaseMultiplier)) : "")
        + row("愉悦度", `${detailNumber(b.elationPercent)}%／×${detailNumber(b.elationMultiplier)}`)
        + (b.minimumCertifiedBanger ? row("入力した褒美／必殺技の参照下限", `${detailNumber(b.inputCertifiedBanger)}／${detailNumber(b.minimumCertifiedBanger)}`) : "")
        + row(b.punchlineSource === "certifiedBanger" ? "爆笑の褒美（攻撃時点）" : b.punchlineSource === "fixedTalent" ? "爆笑ネタ（天賦固定値）" : "爆笑ネタ（攻撃時点）", `${detailNumber(b.punchline)}／×${detailNumber(b.punchlineMultiplier)}`)
        + (Number.isFinite(b.fervor) ? row("消費熱気（追加ヒット数）", detailNumber(b.fervor)) : "")
        + row("上笑", `${detailNumber(b.merrymakePercent)}%／×${detailNumber(b.merrymakeMultiplier)}`)
      : Number.isFinite(b.shieldSnapshot) ? row("同袍バリア耐久 × 変換倍率", `${detailNumber(b.shieldSnapshot)} × ${detailNumber(b.shieldRatio)}%`)
      : b.damageFormula === "enemyHpCappedByAtk"
      ? row("敵HP参照・攻撃力上限適用後", detailNumber(b.cappedEnemyHpDamage)) + row("敵HP割合／攻撃力上限", `${detailNumber(b.enemyHpPercent)}%／${detailNumber(b.atkCapPercent)}%`) + row("攻撃倍率", `${detailNumber(b.multiplierPercent)}%`)
      : b.scalingTerms.map((term) => row(`${b.actorKind === "memosprite" ? "精霊の最終" : ""}${SCALING_LABELS[term.stat] || term.stat}参照 × 攻撃倍率`, `${detailNumber(term.referenceValue)} × ${detailNumber(term.multiplierPercent)}%`)).join("");
    const hits = result.attack.hitCount;
    const aggregated = result.attack.hitCountLabel === "全段合算";
    const hitFactors = b.vulnerabilityFactors.length && b.vulnerabilityFactors.every((value) => value === b.vulnerabilityFactors[0])
      ? `<dl class="hsr-hit-factors">${row(aggregated ? "被ダメージ倍率（全段共通）" : "被ダメージ倍率（各ヒット）", `×${detailNumber(b.vulnerabilityFactors[0])}`)}</dl>`
      : `<details class="hsr-hit-factors"><summary>被ダメージ倍率（ヒット順）</summary><p>${b.vulnerabilityFactors.map((value) => `×${detailNumber(value)}`).join(" → ") || "ヒットなし"}</p></details>`;
    return `<section class="hsr-target-breakdown"><h4>${esc(targetLabel)}</h4>${components ? `<p class="hsr-formula-note">${esc(b.elationScopeNote || "初回の通常アッハタイム・敵1体への全6ヒット。全体攻撃1回と追撃5回を合算します。")}</p>` : isElation ? '<p class="hsr-formula-note">'+esc(b.elationScopeNote || 'アッハタイム中・敵1体あたりの1回分です。爆笑の褒美への変換や全敵の合計は計算しません。')+'</p>' : ""}<dl>${scaling}${b.flatDamage ? row(Number.isFinite(b.shieldSnapshot)?"バリア由来の基礎加算":"固定加算", detailNumber(b.flatDamage)) : ""}
      ${components ? components.map((item) => row(`${item.name}：${item.multiplierPercent}% × ${item.count}ヒット`, `非会心1ヒット ${detailNumber(item.perHitNonCrit)}／小計 ${detailNumber(item.nonCrit)}${["fixedTalent", "ahaInput"].includes(b.punchlineSource) ? `／会心小計 ${detailNumber(item.crit)}／期待値小計 ${detailNumber(item.expected)}` : ""}`)).join("") : ""}${row(components ? "基礎ダメージ（倍率合算）" : aggregated ? "基礎ダメージ（全段合算）" : "基礎ダメージ（1ヒット）", detailNumber(b.baseDamage))}${row(aggregated ? "計算単位" : "ヒット数", result.attack.hitCountLabel || hits)}${b.actorKind === "memosprite" ? row("フィーバー固有与ダメージ（与ダメージ補正に含む）", detailNumber(b.feverDamageBonusPercent)+"%／精霊天賦Lv"+b.spriteTalentLevel+"・バイブス"+b.vibes) : ""}
      ${isElation ? row("通常の与ダメージ補正", "適用対象外（×1）") : row("与ダメージ補正", `${detailNumber(b.damageBonus)}%／×${detailNumber(b.damageBonusMultiplier)}`)}
      ${Number.isFinite(b.defenseIgnorePercent) ? row("防御ダウン／防御無視（合計100%上限）", `${detailNumber(b.defenseReductionPercent)}%／${detailNumber(b.defenseIgnorePercent)}%`) : ""}${row("防御倍率", `×${detailNumber(b.defense)}`)}${row("耐性倍率", `×${detailNumber(b.resistance)}`)}
      ${row(b.toughness === 0.9 ? "靭性倍率（靭性あり）" : "靭性倍率（弱点撃破中）", `×${detailNumber(b.toughness)}`)}
      ${isElation ? "" : row("独立倍率", `×${detailNumber(b.independentMultiplier)}`)}${row("共通倍率（被ダメージ補正を除く）", `×${detailNumber(b.commonWithoutVulnerability)}`)}
      ${row("被ダメージ増加（共通分）", `${detailNumber(b.takenDamage)}%`)}${row(components ? "被ダメージ倍率（合算基礎値へ適用）" : "被ダメージ倍率合計", detailNumber(b.vulnerabilityFactorSum))}
      ${result.attack.canCrit ? row("会心率", `${detailNumber(b.critRatePercent)}%`) + row("会心ダメージ／会心被ダメージ補正", `${detailNumber(b.critDamagePercent)}%／${detailNumber(b.critTakenDamage)}%`) + critOrigin + row("会心倍率", `×${detailNumber(b.critMultiplier)}`) + row("期待値の会心倍率", `×${detailNumber(b.expectedCritMultiplier)}`) : ""}</dl>
      ${hitFactors}<p class="hsr-formula-note">${result.attack.canCrit ? "非会心合計" : "ダメージ合計"}＝基礎ダメージ${components ? "（倍率合算）" : aggregated ? "（全段合算）" : "（1ヒット）"}×共通倍率×${components ? "被ダメージ倍率" : "被ダメージ倍率合計"}</p>
      ${!components && hits > 1 ? `<p class="hsr-formula-note">同じ基礎ダメージを${hits}ヒット分集計します。1ヒット平均：${detailNumber(result.perHit.nonCrit)}${result.attack.target === "bounce" ? "。命中先の分配は再現しません。" : ""}</p>` : ""}${damageValues(result)}</section>`;
  }

  function resolvedAttackComparisons(selected) {
    if (Array.isArray(selected.comparisonStates) && selected.comparisonStates.some(v=>v.resolvedOverrides)) return selected.comparisonStates.map(v=>({...resolvedAttack({...selected,...v.resolvedOverrides}),name:selected.name+"・"+v.label,comparisonStateNote:v.note,hitCountLabel:v.hitCountLabel || (selected.id === "1111083" ? "追加拳"+v.resolvedOverrides.realizedExtraPunches+"回・自己裂創"+(v.resolvedOverrides.ownBleed?"あり":"なし") : v.label)}));
    const attack = resolvedAttack(selected);
    if (!Array.isArray(selected.comparisonStates)) return [attack];
    return selected.comparisonStates.map(variant => ({ ...attack,
      name: `${attack.name}・${variant.label}`, hitCount: variant.hitCount, hitCountLabel: `${variant.hitCount}段合計`,
      comparisonModifierInputs: variant.modifierInputs,
      comparisonStateNote: `${variant.label}・${variant.note}`
    }));
  }

  function modifierAudit(result, targetLabel) {
    if (result.breakdown?.damageFormula === "componentSequence") return Object.entries(result.components || {}).map(([key, component]) => modifierAudit(component, component.componentName || key)).join("");
    if (result.components) return modifierAudit(result.components.direct, "通常部分") + modifierAudit(result.components.break, "天賦撃破");
    const list = (items, applied) => `<ul>${items.length ? items.map((item) => `<li><strong>${esc(item.name)}</strong>：${applied ? `${item.value}${item.unit === "percent" ? "%" : ""}<br><small>出典：${esc(item.source)}／条件：${esc(item.conditionText || "常時")}／計算段階：${esc(item.calculation?.stage || item.category)}</small>` : esc(item.reason || "条件未成立・計算対象外")}</li>`).join("") : "<li>なし</li>"}</ul>`;
    return `<h4>${esc(targetLabel)}・適用された補正</h4>${list(result.applied, true)}<h4>${esc(targetLabel)}・条件未成立／対象外</h4>${list(result.skipped, false)}`;
  }

  function resultEquipmentScope(results) {
    const attacks=[];
    const visit=attack=>{attacks.push(attack);(attack.sequenceAttacks||[]).forEach(visit);};
    results.forEach(item=>visit(item.attack));
    const own=attacks.filter(a=>!a.referenceCharacter||a.referenceCharacter.id===state.characterId);
    const usesAtk=own.some(a=>a.scalingStat==='atk'||a.scalingTerms?.some(term=>term.stat==='atk'));
    const ownDirect=own.some(a=>!['break','superBreak','elation'].includes(a.type));
    const spirits=attacks.filter(a=>a.referenceCharacter&&a.referenceCharacter.id!==state.characterId&&a.damageOwnerId===a.referenceCharacter.id);
    const cone=find('lightCones',state.coneId),compatible=cone&&cone.path===character()?.path;
    const notes=[];
    const add=(id,text)=>notes.push(`<li data-hsr-equipment-scope="${id}">${esc(text)}</li>`);
    if(results.length&&(state.characterId==='1511'||state.party.some(m=>m.characterId==='1511')))add('aha-debt',results.some(x=>x.result?.ahaDebt?.supported)?'負債は別のHP占有状態として内訳へ表示します。単一HPの非致死比較と、指定した実HPイベントの結果を区別します。死亡・致死からのHP段階移行・共有先切替・他キャラ攻撃全般のHP推移は計算対象外です。':state.characterId==='1511'?'アッハの「愉悦の負債」によるHP操作は未計算です。補正条件で事前状態と計算方法を指定するとHP内訳を確認できます。表示する理論攻撃値へ負債HP相当を追加せず、死亡・HP段階変更をまたぐ実ダメージ合計は計算対象外です。':'アッハ編成中の他キャラ攻撃は、負債のHP内訳の計算対象外です。現在の理論攻撃値へ負債HP相当を追加していません。負債のHP内訳はアッハを計算対象にした対応攻撃で確認できます。');

    if(compatible&&usesAtk&&state.coneId==='21041'){
      const delta=structuredSourceConditions().find(m=>m.id==='lightCone:21041:battle-ehr-attack-delta');
      add('21041',delta?.activation.unresolved?'ショーの始まり：基準効果命中を確認できないため、戦闘中のATK差分は含みません。基準効果命中を補正条件で入力するか、差分を含む最終ATKを入力してください。':delta?.includedInFinalStats?'ショーの始まり：戦闘中のATK差分は最終ATKへ反映済みとして再加算しません。':'ショーの始まり：入力ATKは装備込み最終値です。現在の効果命中からATK差分を更新する場合は、補正条件でATKに対応する基準効果命中を指定してください。');
    }
    if(usesAtk&&state.ornamentId==='303')add('303','汎銀河商事会社：効果命中からのATK変換はUID取得時に一度反映します。手入力・戦闘中の効果命中変更では、変換を含む最終ATKを入力してください。戦闘中の自動再変換は行いません。');
    if(compatible&&ownDirect&&state.coneId==='21039')add('21039','運命を紡ぐ糸：DEFに応じた与ダメージ変換は自動加算しません。対応する与ダメージ補正を最終入力へ含めてください。変換の正確な丸め順序は計算対象外です。');
    if(compatible&&ownDirect&&state.coneId==='23013')add('23013','時節は居らず：記録治癒量によって別に発生する付加ダメージは計算対象外です。表示中の攻撃へ加算・合算していません。');
    if(compatible&&spirits.length&&state.coneId==='23042')add('23042','空の虹が消えぬように：表示中の精霊攻撃に、消費HP記録による別の付加ダメージは含みません。敵被ダメージ上昇は補正条件の指定に従います。');
    if(compatible&&spirits.length&&state.coneId==='21057'){
      const record=state.data.structuredModifiers.find(m=>m.id==='lightCone:21057:independent-memosprite-crit-damage');
      if(!record?.source.wearerIds.includes(state.characterId)||spirits.some(a=>!window.HsrModifierRuntime.applicableToAttack({...record,enabled:true,calculable:true},a)))add('21057','花は忘れない：この精霊・攻撃には専用会心ダメージの自動補完が接続されていません。精霊の独立した最終会心ダメージへ装備効果を一度含めて入力してください。');
    }
    if(spirits.length){
      const ignore=structuredSourceConditions().find(m=>m.id==='lightCone:23049:nightshade-memosprite-defense-ignore');
      if(ignore?.activation.unresolved)add('23049','長き夜に輝く星へ：複数提供者の精霊防御無視は合成を確認できないため追加していません。対応する防御無視を精霊の最終入力へ含めてください。');
    }
    if(results.length&&['1214','1321','1506','1509'].includes(state.characterId))add('character','このキャラクターの主要構成には計算対象外の範囲があります。計算可能な行は、各攻撃の詳細に記載した条件で利用できます。');
    return notes.length?`<details class="hsr-excluded-conditions" open><summary>選択中の装備・攻撃の計算範囲</summary><ul>${notes.join('')}</ul></details>`:'';
  }

  function excludedConditions() {
    const items = allConditions().filter((item) => item.displayOnly && !isAttackSelectionCondition(item));
    const included = items.filter((item) => item.inputPolicy === "includedInFinalStats");
    const unsupported = items.filter((item) => item.inputPolicy !== "includedInFinalStats");
    const group = (title, entries, includedInStats) => entries.length ? `<h4>${title}</h4><ul>${entries.map((item) => `<li><strong>${esc(item.name)}</strong>：${includedInStats ? "最終ステータスに含めて入力する効果です。装備選択による自動加算は行わず、計算時にも再加算しません。" : esc(item.reason || "計算データ未対応のため、計算には含めません。")}</li>`).join("")}</ul>` : "";
    return items.length ? `<details class="hsr-excluded-conditions"><summary>計算に追加しない補正（${items.length}件）</summary>${group("最終入力で管理する効果・再加算なし", included, true)}${group("データ未対応・表示のみ（計算対象外）", unsupported, false)}</details>` : "";
  }

  function publicAttackNote(attack) {
    if (attack.id === "151103") return "願力8～18（基本枠8＋超過枠10）で発動。最初のダメージ前に昇格が成立する想定で計算します。敵1体への全6段です。";
    if (attack.id === "150301") return "強化前の通常攻撃です。強化通常は別の状態の比較値として表示し、合算しません。";
    if (attack.id === "150310") return "想定：深層学習中・残りチャージ1～3・非愉悦の味方を底本に指定・追加愉悦なしの強化通常です。敵1体分を計算します。回復やSP・EPの変動は含みません。";
    const condition = comparisonCondition(attack);
    const note = (attack.calculationNote || "").replace(/を(?:すべて)?手動確認した場合のみ計算(?:します)?[。]?/g, "を想定して計算します。")
      .replace(/手動確認[。]?/g, "想定。")
      .replace(/チェック[^。]*。/g, "");
    return condition ? "想定：" + comparisonAssumption(attack) + "。" + note : note;
  }

  const RESULT_GROUPS = [
    { id: "damage", label: "通常", types: ["normal", "enhancedNormal"] },
    { id: "skill", label: "スキル", types: ["skill", "enhancedSkill"] },
    { id: "ultimate", label: "必殺技", types: ["ultimate"] },
    { id: "memosprite", label: "精霊", types: ["memospriteSkill", "memospriteTalent"] },
    { id: "followUp", label: "追加攻撃", types: ["followUp"] },
    { id: "elation", label: "愉悦", types: ["elation"] },
    { id: "joint", label: "連携", types: [] },
    { id: "dot", label: "持続ダメージ", types: ["dot"] },
    { id: "break", label: "撃破", types: ["break"] },
    { id: "superBreak", label: "超撃破", types: ["superBreak"] },
    { id: "trueDamage", label: "確定ダメージ", types: ["trueDamage"] },
    { id: "additional", label: "付加ダメージ", types: ["additional"] },
    { id: "talent", label: "天賦", types: ["talent"] },
    { id: "technique", label: "秘技", types: ["technique"] },
    { id: "assist", label: "支援", types: ["assist"] },
    { id: "other", label: "その他", types: [] }
  ];
  // Presentation only: Joint ATKs retain their original damage type for calculation.
  // Fixed StarRailRes dbe8cdfcfb0bf657b9fe1cf92d5537f118ccb487 skill IDs; KQM memosprite-mechanics, Damage and Joint Attacks.
  const JOINT_ATTACK_SKILLS = new Set(["140208", "140709", "800708", "800808", "150805"]);
  function isJointAttack(attack) { return attack.tags?.includes("joint") || JOINT_ATTACK_SKILLS.has(String(attack.sourceSkillId || attack.id)); }
  function resultGroup(attack) {
    if (isJointAttack(attack)) return "joint";
    if (["talent", "additional"].includes(attack.type) && attack.tags?.includes("followUp")) return "followUp";
    return RESULT_GROUPS.find((group) => group.types.includes(attack.type))?.id || "other";
  }

  function resultScopeNote(attack, result, partialJoint) {
    if (partialJoint) return "連携全体の合計には未対応";
    if (attack.id === "122402" && attackSupport(attack).status === "review") return "師匠由来の付加ダメージの参考値。スキル発動時のダメージではなく、強化通常にも合算していません。";
    if (attack.id === "131404") {
      const boost = result.applied.find(item => item.id === "trace:1314:131403:followup-multiplier");
      return (attack.resultSummary || "追撃前から質草50層の想定。") + (boost ? ` 必殺技強化あり（倍率＋${detailNumber(boost.value)}ポイント）。` : " 必殺技強化なし。");
    }
    if (attack.resultSummary) return attack.resultSummary;
    if (attack.comparisonStateNote) return "想定：" + attack.comparisonStateNote;
    if (comparisonCondition(attack)) return "想定：" + comparisonAssumption(attack);
    if (["enhancedNormal", "enhancedSkill"].includes(attack.type)) return "強化状態を想定したダメージ";
    return attack.id === "1151201" ? "精霊自身の最終値・フィーバー中の1回分" : "";
  }

  function renderResults(results, breakResult, specialBreakResults = [], unavailableAttacks = [], superBreakResult = null) {
    conditionAudit = { applied: new Set(), skipped: new Set() };
    const audit = result => {
      if (!result || result.supported === false) return;
      (result.applied || []).forEach(item => conditionAudit.applied.add(item.id));
      if (result.components) { Object.values(result.components).forEach(audit); return; }
      (result.skipped || []).forEach(item => conditionAudit.skipped.add(item.id));
    };
    results.forEach(({result, adjacent}) => { audit(result); audit(adjacent); });
    [breakResult, superBreakResult, ...specialBreakResults.map(item => item.result)].forEach(audit);
    let index = 0;
    const hasCritical = results.some(({result}) => result.attack.canCrit);
    const groups = Object.fromEntries(RESULT_GROUPS.map((group) => [group.id, []]));
    const unsupported = Object.fromEntries(RESULT_GROUPS.map((group) => [group.id, []]));
    const pending = Object.fromEntries(RESULT_GROUPS.map((group) => [group.id, []]));
    const detailToggle = (id, name) => `<button type="button" class="genshin-result-detail-toggle" data-hsr-result-detail="${id}" aria-expanded="false" aria-controls="${id}" aria-label="${esc(name)}の計算内訳を開く"><span class="genshin-detail-toggle-label">詳細</span><span class="genshin-detail-toggle-icon" aria-hidden="true">▼</span></button>`;
    const addRow = (group, name, meta, values, detail, badge = "", reference = false, scopeNote = "") => {
      const id = `hsr-result-detail-${index++}`;
      if (!hasCritical) values = values.slice(0,1);
      groups[group].push(`<tr class="genshin-damage-result-row"><th scope="row"><div class="genshin-result-attack-head"><strong title="${esc(name)}">${esc(name)}</strong>${detailToggle(id, name)}</div><small>${esc(meta)}${reference ? '・<span class="hsr-reference-label">参考値</span>' : ""}</small>${reference ? '<span class="hsr-mobile-reference-label">参考値</span>' : ""}${scopeNote ? `<span class="hsr-result-scope-label">${esc(scopeNote)}</span>` : ""}</th>${values.map(([label, value]) => `<td${label === "会心" ? ' class="is-critical"' : ""} data-label="${label}"><span class="genshin-result-value">${value === null ? "—" : fmt(value)}</span></td>`).join("")}</tr><tr class="genshin-damage-detail-row" id="${id}" hidden><td colspan="${values.length+1}"><div class="genshin-json-breakdown hsr-result-details">${badge}${detail}</div></td></tr>`);
    };
    results.forEach(({ result, adjacent, attack }) => {
      [ [result, adjacent ? "主対象" : ""], ...(adjacent ? [[adjacent, "隣接対象"]] : []) ].forEach(([value, target]) => {
        const name = result.attack.name + (target ? `・${target}` : "");
        const partialJoint = JOINT_ATTACK_SKILLS.has(String(attack.sourceSkillId || attack.id)) && attackSupport(attack).status === "review";
        const scope = [ATTACK_LABELS[attack.type] || attack.type, isJointAttack(attack) ? "連携" : "", attack.type !== "followUp" && attack.tags?.includes("followUp") ? "追加攻撃" : "", attack.traceLevelLabel || `Lv${attack.traceLevel}`, TARGET_LABELS[value.attack.target] || value.attack.target, value.attack.hitCountLabel || `${value.attack.hitCount || 1}ヒット`].filter(Boolean).join("・");
        const values = value.attack.canCrit ? [["非会心", value.nonCrit], ["会心", value.crit], ["期待値", value.expected]] : [["ダメージ", value.nonCrit], ["会心", null], ["期待値", null]];
        addRow(resultGroup(attack), name, scope, values, (attack.resolvedMultiplierComponents?.every(component => component.name) && attack.resolvedMultiplierComponents.length ? `<p class="hsr-formula-note">${attack.resolvedMultiplierComponents.map(component => `${esc(component.name)} ${detailNumber(component.value)}%`).join(attack.multiplierProductComponents ? " × " : " ＋ ")} ＝ ${detailNumber(attack.multiplier)}%</p>` : "") + damageBreakdown(value, target || "1対象分") + `<details class="hsr-result-audit"><summary>適用・除外された補正</summary>${modifierAudit(value, target || "1対象分")}</details>`, supportBadge(attack) + (publicAttackNote(attack) ? `<details class="hsr-result-scope"><summary>計算の範囲</summary><p>${esc(publicAttackNote(attack))}</p></details>` : "") + (partialJoint ? '<p class="hsr-formula-note">現在のレコードは単一成分の参考値です。キャラクターと精霊の全成分を合算した連携ダメージではありません。</p>' : ""), attackSupport(attack).status === "review", resultScopeNote(attack, value, partialJoint));
      });
    });
    const breakDetails = (value, isSuper) => `<dl>${(isSuper ? [["撃破基礎値",value.base],["基礎削靭値",value.toughnessDamage],["撃破効率倍率",value.breakEfficiency],["補正後削靭値",value.effectiveToughnessDamage],["発生倍率",value.conversionMultiplier],["撃破特効倍率",value.breakEffect],["撃破与ダメージ倍率",value.breakDamageMultiplier ?? 1],["防御倍率",value.defense],["耐性倍率",value.resistance],["被ダメージ倍率",value.vulnerability],["超撃破与ダメージ倍率",value.superBreakBonus]] : [...(Number.isInteger(value.charge)?[["消費チャージ",value.charge],["天賦追加撃破倍率（%）",value.coefficient]]:[]),["撃破基礎値",value.base],["属性・攻撃倍率",value.multiplier],["撃破特効倍率",value.effect],["撃破与ダメージ倍率",value.breakDamageMultiplier ?? 1],["防御倍率",value.defense],["耐性倍率",value.resistance],["最大靭性倍率",value.toughnessScale],["被ダメージ倍率",value.vulnerability]]).map(([label, amount]) => `<div><dt>${label}</dt><dd>${detailNumber(amount)}</dd></div>`).join("")}</dl><p class="hsr-formula-note">独立した1回分です。通常攻撃・他の撃破成分とは合算しません。</p><details class="hsr-result-audit"><summary>適用・除外された補正</summary>${modifierAudit(value, isSuper ? "超撃破" : "弱点撃破")}</details>`;
    [ ...(breakResult ? [{name:"弱点撃破",value:breakResult}] : []), ...specialBreakResults.map(({attack,result}) => ({name:attack.name,value:result,attack})), ...(superBreakResult ? [{name:"超撃破",value:superBreakResult,isSuper:true}] : []) ].forEach(({name,value,attack,isSuper}) => {
      if (!value.supported) { unsupported[isSuper ? "superBreak" : "break"].push(`<p><strong>${esc(name)}</strong>：${esc(value.reason)}</p>`); return; }
      addRow(isSuper ? "superBreak" : "break",name,"会心なし・独立した1回分",[["ダメージ",value.value],["会心",null],["期待値",null]],breakDetails(value,isSuper),attack ? supportBadge(attack)+`<p class="hsr-formula-note">${esc(attack.calculationNote||attack.conditionText||"")}</p>` : "");
    });
    unavailableAttacks.forEach(attack => {
      if (attack.inputIssues?.length) {
        const fieldId = attack.inputTargets?.[0];
        const message = attack.inputIssues[0];
        const assumption = comparisonAssumption(attack);
        pending[resultGroup(attack)].push('<article class="genshin-json-input-notices hsr-attack-input-notice" ' + (attack.preview ? 'data-hsr-attack-preview' : 'data-hsr-pending-input') + '><strong>' + esc(attack.name) + '</strong><span>' + esc(message) + '</span>' + (assumption ? '<small>想定：' + esc(assumption) + '</small>' : '') + (fieldId ? '<button type="button" class="teti-button teti-button-secondary" data-hsr-input-target="' + esc(fieldId) + '">' + (fieldId === "hsrConditionDialogOpen" || modifierIssueLinks.has(fieldId) ? '補正条件を開く' : '入力欄へ移動') + '</button>' : '') + '</article>');
      } else unsupported[resultGroup(attack)].push('<article>' + supportBadge(attack) + '<strong>' + esc(attack.name) + '</strong><p>' + esc(attackSupport(attack).reason || "この攻撃は現在計算できません。") + '</p></article>');
    });
    const visibleGroups = RESULT_GROUPS.filter((group) => groups[group.id].length || pending[group.id].length || unsupported[group.id].length);
    if (!visibleGroups.length) visibleGroups.push(RESULT_GROUPS.find((group) => group.id === "other"));
    const active = visibleGroups.find((group) => groups[group.id].length)?.id || visibleGroups[0].id;
    const table = (rows, label) => `<div class="genshin-damage-table-wrap"><table class="genshin-damage-table${hasCritical ? "" : " hsr-noncritical-table"}" aria-label="${label}の計算結果"><colgroup><col class="genshin-damage-col-name"><col class="genshin-damage-col-value">${hasCritical ? '<col class="genshin-damage-col-value"><col class="genshin-damage-col-value">' : ""}</colgroup><thead><tr><th scope="col">攻撃名</th><th scope="col">${hasCritical ? "非会心" : "ダメージ"}</th>${hasCritical ? '<th scope="col">会心</th><th scope="col">期待値</th>' : ""}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
    $("hsrResults").innerHTML = `${resultEquipmentScope(results)}<div class="genshin-result-tabs" role="tablist" aria-label="攻撃種別">${visibleGroups.map((group) => `<button type="button" class="genshin-result-tab${group.id === active ? " is-active" : ""}" role="tab" id="hsr-result-tab-${group.id}" aria-controls="hsr-result-panel-${group.id}" data-result-tab="${group.id}" aria-selected="${group.id === active}" tabindex="${group.id === active ? "0" : "-1"}">${group.label}${pending[group.id].some(row => row.includes("data-hsr-pending-input")) ? `<small>入力確認 ${pending[group.id].length}</small>` : ""}</button>`).join("")}</div>${visibleGroups.map((group) => `<section class="genshin-json-result-section" role="tabpanel" id="hsr-result-panel-${group.id}" aria-labelledby="hsr-result-tab-${group.id}" data-result-panel="${group.id}"${group.id === active ? "" : " hidden"}>${groups[group.id].length ? table(groups[group.id],group.label) : pending[group.id].length ? "" : '<p class="genshin-help">この種別に計算できる攻撃はありません。</p>'}${pending[group.id].join("")}${unsupported[group.id].length ? `<details class="hsr-unavailable-results"><summary>計算不可の攻撃・条件（${unsupported[group.id].length}件）</summary>${unsupported[group.id].join("")}</details>` : ""}</section>`).join("")}${excludedConditions()}<p class="hsr-support-note">表示値は丸めています。多段攻撃はヒット合計です。計算可能の表示は攻撃ごとの対応範囲です。装備込み最終値と各攻撃の事前条件は詳細で確認できます。</p>`;
  }

  function renderAttackPreview() {
    if (!character()) return;
    renderResults([], null, [], availableAttacks().flatMap(attack => attackSupport(attack).status === "displayOnly" ? [attack]
      : resolvedAttackComparisons(attack).map(variant => ({ ...variant, preview: true, inputIssues: ["ステータスを入力し、「ダメージ計算」で比較できます。"] }))));
    conditionAudit = null;
    updateConditionSummary();
  }

  function attackElationInputs(attack) {
    if(attack.referenceElation)return attack.referenceElation;
    if(attack.characterId==='1511'&&['151120','1511202'].includes(attack.id))return {...state.elationInputs,context:'ahaInstant'};
    if (attack.elationContext === "certifiedBanger") return {...state.elationInputs,context:"certifiedBanger",certifiedBanger:state.modifierInputs[attack.certifiedBangerInputKey || "elation-certified-banger"]};
    if (attack.id === "150221") return {...state.elationInputs,context:"ultimateAha",punchline:20};
    if (attack.id === "151321") return { ...state.elationInputs, context: "fervorEnhancedAha", stableEnemy: true, hasOtherElation: true };
    if (attack.id === "151320") return { ...state.elationInputs, context: "fervor10Auto", stableEnemy: true };
    return state.elationInputs;
  }

  function modifierInputIssues(attack, baseStats) {
    return modifiers(attack).filter(item => item.enabled && item.matchesAttack).flatMap(item => {
      const issues = [...(item.inputWarnings || [])];
      if (item.category === "baseDamageAddition" && !(Number.isFinite(state.stats[item.stat]) && state.stats[item.stat] > 0)) issues.push("必殺基礎加算に必要な最終防御力を入力してください。");
      if (["hp", "atk", "def"].includes(item.valueInput?.providerStat) && !(Number.isFinite(item.valueInput.value) && item.valueInput.value > 0)) issues.push(`${item.valueInput.label}に、発動者の最終値（0より大きい数値）を入力してください。`);
      const baseStat = item.category === "statPercent" ? item.stat : item.requiredBaseStat;
      if (baseStat && !(Number.isFinite(baseStats[baseStat]) && baseStats[baseStat] > 0)) issues.push(`必要な基礎${{hp:"HP",atk:"攻撃力",def:"防御力",speed:"速度"}[baseStat] || baseStat}を取得できません。キャラ・光円錐のLv80基礎値が必要です。この補正を外すか、レベル・装備を確認してください。`);
      return [...new Set(issues)].map(message => {
        modifierIssueIds.add(item.id);
        const target = item.category === "baseDamageAddition" ? "hsrStat-" + item.stat : "modifier:" + item.id;
        modifierIssueLinks.set(target, { item, message });
        return { message: `${item.source}・${item.name}：${message}`, target };
      });
    });
  }

  function inputWarningsForFanning(attack) { return window.HsrCalcEngine.fanningInputWarnings({character:{level:state.level,eidolon:state.eidolon,stats:state.stats},enemy:state.enemy,attack,modifiers:modifiers(attack)}); }

  function enemyInputIssues() {
    const issues = [];
    if (!Number.isInteger(Number($("hsrEnemyLevel").value)) || Number($("hsrEnemyLevel").value) < 1) issues.push(["敵Lvに1以上の整数を入力してください。", "hsrEnemyLevel"]);
    if (String($("hsrEnemyResistance").value).trim() === "" || !Number.isFinite(Number($("hsrEnemyResistance").value))) issues.push(["敵の耐性を入力してください。耐性がない場合は0を入力してください。", "hsrEnemyResistance"]);
    const count = Number($("hsrEnemyCount").value);
    if (!Number.isInteger(count) || count < 1 || count > 5) issues.push(["敵数に1～5の整数を入力してください。", "hsrEnemyCount"]);
    return issues;
  }

  function calculationInputWarnings(attacks, baseStats, fields = new Map()) {
    if (attacks.length === 1 && attacks[0].id === "1151201") {
      const attack = attacks[0];
      const warnings = window.HsrCalcEngine.songbirdInputWarnings({ character: { level: state.level, eidolon: state.eidolon }, enemy: state.enemy, attack, songbird: songbirdSnapshot(), modifiers: modifiers(attack) });
      warnings.forEach(message => fields.set(message.includes("最終HP") ? "hsrSongbird-hp" : message.includes("最終会心率") ? "hsrSongbird-critRate" : message.includes("最終会心ダメージ") ? "hsrSongbird-critDamage" : message.includes("最終風属性") ? "hsrSongbird-damageBonus" : "hsrSongbirdSettings", message));
      const enemyIssues = enemyInputIssues();
      enemyIssues.forEach(([message, id]) => fields.set(id, message));
      return warnings.concat(enemyIssues.map(([message]) => message));
    }
    if (attacks.length && attacks.every(attack => attack.damageFormula === "trueDamage")) {
      const warnings = attacks.flatMap(attack => window.HsrCalcEngine.trueDamageInputWarnings({ character: { id:state.characterId,level:state.level,eidolon: state.eidolon }, enemy:state.enemy,modifierInputs:state.modifierInputs,attack, trueDamage: attack.referenceTrueDamage || state.trueDamageInputs }));
      warnings.forEach(message => fields.set(["1800707","1800807"].includes(attacks[0]?.id)?"hsrConditionDialogOpen":message.includes("元ダメージ") ? "hsrOriginalDamage" : "hsrTrueDamageActive", message));
      return warnings;
    }
    if (attacks.length && attacks.every(a => a.damageFormula === "resolvedDamageMultiplier")) return [];
    const warnings = new Set();
    const labels = { hp: "HP", atk: "攻撃力", def: "防御力", speed: "速度", critRate: "会心率", critDamage: "会心ダメージ", damageBonus: "属性ダメージ", breakEffect: "撃破特効", effectHitRate: "効果命中", effectRes: "効果抵抗", energyRegen: "EP回復効率", hpPercent: "現在HP割合", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度", healingRecord: "攻撃直前の累計治癒量" };
    const requiredStats = new Set();
    const requiredBonuses = new Set();
    const fieldWarning = (message, id) => { warnings.add(message); if (id) fields.set(id,message); };
    enemyInputIssues().forEach(([message, id]) => fieldWarning(message, id));
    if (!Number.isInteger(state.level) || state.level < 1 || state.level > 80) fieldWarning("キャラクターのレベルに1～80の整数を入力してください。", "hsrLevel");
    if (cone() && (!Number.isInteger(state.coneLevel) || state.coneLevel < 1 || state.coneLevel > 80)) fieldWarning("光円錐のレベルに1～80の整数を入力してください。", "hsrConeLevel");
    if (cone() && (!Number.isInteger(state.coneRank) || state.coneRank < 1 || state.coneRank > 5)) fieldWarning("光円錐の重畳ランクに1～5を選択してください。", "hsrConeRank");
    if (attacks.some((attack) => attack.damageFormula === "elation" && attack.traceKey === "elation") && (!Number.isInteger(state.traceLevels.elation) || state.traceLevels.elation < 1 || state.traceLevels.elation > 10)) warnings.add("星魂0の愉悦スキルLvに1～10の整数を選択してください。");
    attacks.forEach((attack) => {
      if (attack.referenceIssue) { const item=attack.referenceCondition; const target="modifier:"+item.id; modifierIssueIds.add(item.id); modifierIssueLinks.set(target,{item,message:attack.referenceIssue}); fieldWarning(attack.referenceIssue,target); }
      const attackScopes = attack.sequenceAttacks?.length ? attack.sequenceAttacks : [attack];
      if (!attack.referenceCharacter && attackScopes.some(scope => scope.canCrit !== false && scope.type !== "dot" && !scope.fixedCritStats)) { requiredBonuses.add("critRate"); requiredBonuses.add("critDamage"); }
      if (!attack.referenceCharacter && attackScopes.some(scope => scope.damageFormula === "elation" || scope.sparxieElationScaling)) requiredBonuses.add("elation"); else if (!attack.referenceStats && !["dahliaSuperBreak","resolvedDamageMultiplier"].includes(attack.damageFormula)) requiredBonuses.add("damageBonus");
      if(state.characterId==='1501'&&attackScopes.some(scope=>scope.damageFormula==='statMultiplier'))requiredBonuses.add('damageBonus');
      if (attackScopes.some(scope => ["normalAndBreak","nativeBreakSequence","dahliaSuperBreak"].includes(scope.damageFormula))) requiredBonuses.add("breakEffect");
      if (Object.hasOwn(state.traceLevels, attack.traceKey) && (!Number.isInteger(state.traceLevels[attack.traceKey]) || state.traceLevels[attack.traceKey] < 1 || state.traceLevels[attack.traceKey] > traceMaximum(attack.traceKey))) fieldWarning(`${ATTACK_LABELS[attack.traceKey] || attack.traceKey}のレベルを確認して選択してください。`, TRACE_FIELDS[attack.traceKey][1]);
      if (attack.maximumTraceLevel && attack.traceLevel > attack.maximumTraceLevel) {
        const message = `${attack.name}は軌跡Lv1～${attack.maximumTraceLevel}のみ計算対応です。`;
        if (TRACE_FIELDS[attack.traceKey]) fieldWarning(message, TRACE_FIELDS[attack.traceKey][1]); else warnings.add(message);
      }
      Object.entries(attack.requiredTraceLevelRanges || {}).forEach(([key, range]) => {
        const level = state.traceLevels[key];
        if (!Number.isInteger(level) || level < range.minimum || level > range.maximum) fieldWarning(attack.name + "が参照する" + (ATTACK_LABELS[key] || key) + "はLv" + range.minimum + "～" + range.maximum + "のみ計算対応です。", TRACE_FIELDS[key]?.[1] || "hsrConditionDialogOpen");
      });
      if (attack.sequenceAttacks?.length) attackStateIssues(attack, fieldWarning);
      attackScopes.forEach(scope => attackStateIssues(scope, fieldWarning));
      if (attack.damageFormula === "normalAndBreak") inputWarningsForFanning(attack).forEach(warning => warnings.add(warning));
      if (attack.damageFormula === "elation") window.HsrCalcEngine.elationInputWarnings({ character: attack.referenceCharacter || { id:state.characterId,level: state.level, eidolon: state.eidolon, stats: state.stats }, attack, enemy: attack.referenceEnemy || state.enemy, modifierInputs:state.modifierInputs, elation: attackElationInputs(attack) }).forEach(warning => {
        const field = warning.includes("爆笑の褒美") ? "hsrConditionDialogOpen" : warning.includes("消費する熱気") ? "hsrFervor" : warning.includes("爆笑ネタに") ? "hsrPunchline" : warning.includes("上笑に") ? "hsrMerrymake" : "hsrElationSettings";
        fieldWarning(warning, field);
      });
      const scopes = attack.sequenceAttacks?.length ? attack.sequenceAttacks : ["normalAndBreak","nativeBreakSequence"].includes(attack.damageFormula) ? [attack, {...attack,type:attack.damageFormula === "nativeBreakSequence" ? "superBreak" : "break",attackType:attack.damageFormula === "nativeBreakSequence" ? "superBreak" : "break"}] : [attack];
      if (!attack.referenceCharacter) scopes.filter(scope=>!["dahliaSuperBreak","resolvedDamageMultiplier"].includes(scope.damageFormula)).forEach(scope => {
        const terms = [...(scope.scalingTerms?.length ? scope.scalingTerms : [{ stat: scope.scalingStat || "atk", multiplier: scope.multiplier }]), ...(scope.adjacentScalingTerms || [])];
        terms.filter((term) => num(term.multiplier) !== 0).forEach((term) => requiredStats.add(term.stat));
        if (scope.damageFormula === "enemyHpCappedByAtk") requiredStats.add("atk");
      });
      scopes.flatMap(scope => modifierInputIssues(scope, baseStats)).forEach(issue => fieldWarning(issue.message, issue.target));
    });
    Object.entries(state.stats).forEach(([stat, value]) => {
      if (["hp", "atk", "def"].includes(stat)) {
        if (requiredStats.has(stat) && !(Number.isFinite(value) && value > 0)) fieldWarning(`${labels[stat]}の最終値（0より大きい数値）を入力してください。`, "hsrStat-" + stat);
      } else if (requiredBonuses.has(stat) && !Number.isFinite(value)) fieldWarning(`${labels[stat] || stat}に数値を入力してください。補正がない場合は0を入力してください。`, "hsrStat-" + stat);
    });
    return [...warnings];
  }

  function calculate() {
    collectInputs(); conditionAudit = null; modifierIssueLinks.clear(); modifierIssueIds.clear(); const warnings = [];
    renderAttacks();
    if (allConditions().some(item => item.calculable && item.activation?.unresolved && !item.includedInFinalStats)) warnings.push("条件未確定の補正だけを除外して計算します。補正条件から参照する入力を確認してください。");
    if (!character()) warnings.push("キャラクターを選択してください。");
    if (!character()) { renderWarnings([]); $("hsrResults").innerHTML = '<p class="genshin-help">キャラクターを選択してください。</p>'; finishCalculation(warnings,new Map([["hsrCharacterTrigger",warnings[0]]])); return; }
    const independentBreak = state.breakInputs.mode !== "attacks";
    const available = availableAttacks();
    const supplemental = independentBreak ? [] : supplementalAttacks();
    const unavailableAttacks = independentBreak ? [] : supplemental.filter((attack) => attackSupport(attack).status === "displayOnly").concat(available.filter((attack) => attackSupport(attack).status === "displayOnly").concat((state.data.specialBreakAttacks || []).filter((attack) => attack.characterId === state.characterId && !attack.hidden && attackSupport(attack).status === "displayOnly")));
    let attacks = independentBreak ? [] : available.filter((attack) => attackSupport(attack).status !== "displayOnly").flatMap(resolvedAttackComparisons).concat(supplemental.filter((attack) => attackSupport(attack).status !== "displayOnly"));
    if (!attacks.length && !independentBreak) {
      renderWarnings([]);
      renderResults([], null, [], unavailableAttacks);
      finishCalculation(["このキャラクターには現在計算できる攻撃がありません。"]);
      return;
    }
    if (state.modifierInputs["robin-songbirds-vulnerability"] && state.modifierInputs["robin-songbirds-count"] === 3 && !state.modifierInputs["robin-summeretto-fever"]
      && [state.characterId, ...state.party.map((member) => member.characterId)].includes("1512")) warnings.push("夏の歌鳥3体ではフィーバーが成立します。現在は防御無視を除外した比較値です。精霊攻撃・その他支援は計算対象外です。");
    const baseStats = selectedBaseStats();
    const fieldErrors = new Map();
    const blocked = [];
    if (!independentBreak) attacks = attacks.filter(attack => {
      const attackFields = new Map();
      const issues = calculationInputWarnings([attack], baseStats, attackFields);
      attackFields.forEach((message,id) => fieldErrors.set(id,message));
      if (issues.length) blocked.push({ ...attack, inputIssues: issues, inputTargets: [...attackFields.keys()], support: { status: "displayOnly", reason: [...new Set(issues)].join(" ") } });
      return !issues.length;
    });
    const inputWarnings = independentBreak ? calculationInputWarnings([], baseStats, fieldErrors) : [];
    const commonIssue = (message,id) => { inputWarnings.push(message); fieldErrors.set(id,message); };
    if (independentBreak) {
      const kind = state.breakInputs.mode;
      if (!Number.isFinite(state.stats.breakEffect) || state.stats.breakEffect < 0) commonIssue("撃破特効に0以上の数値を入力してください。", "hsrStat-breakEffect");
      if (kind === "break" && (!Number.isFinite(Number($("hsrMaxToughness").value)) || Number($("hsrMaxToughness").value) <= 0)) commonIssue("敵の最大靭性に0より大きい数値を入力してください。", "hsrMaxToughness");
      if (kind === "superBreak" && (!Number.isFinite(state.breakInputs.toughnessDamage) || state.breakInputs.toughnessDamage <= 0)) commonIssue("超撃破の基礎削靭値に0より大きい数値を入力してください。", "hsrSuperBreakToughness");
      if (kind === "superBreak" && (!Number.isFinite(state.breakInputs.multiplier) || state.breakInputs.multiplier < 0)) commonIssue("超撃破の発生倍率に0以上の数値を入力してください。", "hsrSuperBreakMultiplier");

    }
    if (inputWarnings.length) {
      renderWarnings([]);
      $("hsrResults").innerHTML = '<p class="genshin-help">入力内容を確認して、もう一度計算してください。</p>';
      finishCalculation(inputWarnings, fieldErrors);
      return;
    }
    const snapshots=componentSnapshots();
    const baseRequest = { character: {...snapshots.character,baseStats}, enemy: snapshots.enemy, ahaDebtSnapshot:ahaDebtSnapshotInput(), elation: state.elationInputs, trueDamage: state.trueDamageInputs };
    let results = attacks.map((selected) => {
      const attackEnemy=selected.requiredWeaknessCount?{...baseRequest.enemy,weakness:true,weaknessCount:selected.requiredWeaknessCount}:baseRequest.enemy;
      const request = { ...baseRequest, modifierInputs:state.modifierInputs, character:selected.referenceCharacter || (selected.referenceStats ? {...baseRequest.character,stats:selected.referenceStats}:baseRequest.character), enemy:selected.referenceEnemy || attackEnemy, songbird: songbirdSnapshot(), elation: attackElationInputs(selected), attack: selected, trueDamage:selected.referenceTrueDamage || baseRequest.trueDamage,modifiers: modifiers(selected), breakModifiers: selected.damageFormula === "nativeBreakSequence" ? modifiers({...selected,type:"superBreak",attackType:"superBreak"}) : selected.damageFormula === "normalAndBreak" ? modifiers({...selected,type:"break",attackType:"break"}) : undefined, breakBaseDamage: state.data.breakBaseDamage };
      if (selected.id === "131718" && selected.nativeBreakKind === "rappa") { request.superBreakModifiers=modifiers({...selected,type:"superBreak",attackType:"superBreak"}); request.breakModifiers=modifiers({...selected,type:"break",attackType:"break"}); }
      if (selected.damageFormula === "componentSequence") request.sequenceComponents = (selected.sequenceAttacks || []).map((component, index) => ({ key: selected.damageComponents[index].key, name: selected.damageComponents[index].name, input: { ...baseRequest, character:component.referenceCharacter || baseRequest.character, enemy:component.referenceEnemy || attackEnemy, modifierInputs:selected.id==="150403" && Number.isInteger(component.fudieEffectiveStacks)?{...state.modifierInputs,"fudie-gluttony-stacks":component.fudieEffectiveStacks}:state.modifierInputs, attack: component, trueDamage: selected.id === "140603" && component.damageFormula === "trueDamage" ? {active:true,sourceKind:"cipherRecord",originalDamage:state.modifierInputs[component.recordInputKey]} : baseRequest.trueDamage, modifiers: modifiers(component), songbird: songbirdSnapshot(), elation: attackElationInputs(component), breakBaseDamage: state.data.breakBaseDamage } }));
      if(['1410013','1410023'].includes(selected.id)){
        const own=request.sequenceComponents?.[0]?.input;
        if(own)own.sequenceComponents=(own.attack.sequenceAttacks||[]).map((component,index)=>({key:own.attack.damageComponents[index].key,name:own.attack.damageComponents[index].name,input:{...own,attack:component,modifiers:modifiers(component)}}));
      }

      if (selected.sequenceTemplates) request.attack = {...request.attack, damageComponents:selected.sequenceTemplates};
      const result = window.HsrCalcEngine.calculate(request);
      if (selected.snapshotEquipment?.length || request.sequenceComponents?.some(component => component.input.attack?.snapshotEquipment?.length)) {
        const trackSnapshotEquipment = (out, source) => {
          if (!out || out.supported === false) return;
          const items = source.attack?.snapshotEquipment || [];
          out.applied = [...(out.applied || []), ...items];
          const ids = new Set(items.map(item => item.id));
          out.skipped = (out.skipped || []).filter(item => !ids.has(item.id));
          Object.entries(out.components || {}).forEach(([key, child]) => {
            const component = (source.sequenceComponents || []).find(item => item.key === key || source.attack?.id === '11415012' && item.key === 'recollection' && /^recollection[1-3]$/.test(key));
            if (component) trackSnapshotEquipment(child, component.input);
          });
        };
        trackSnapshotEquipment(result, request);
      }
      const adjacentAttack = selected.adjacentMultiplier && !(selected.suppressAdjacentWithSingleEnemy && state.enemy.count === 1) ? { ...selected, multiplier: selected.adjacentMultiplier, scalingTerms: selected.adjacentScalingTerms?.length ? selected.adjacentScalingTerms : undefined, target: "adjacent" } : null;
      const adjacent = adjacentAttack ? window.HsrCalcEngine.calculate({ ...baseRequest, attack: adjacentAttack, modifiers: modifiers(adjacentAttack) }) : null;
      return { attack: selected, result, adjacent };
    });
    results = results.filter(({ attack, result }) => {
      if (result && result.supported !== false && result.attack) return true;
      const message = result?.reason || `${attack.name}の計算結果を作成できませんでした。条件と攻撃データを確認してください。`;
      blocked.push({ ...attack, inputIssues: [message], inputTargets: [], support: { status: "displayOnly", reason: message } });
      return false;
    });
    const checkedBreak = (attack, run) => {
      if ((attack.type === "break" && attack.breakEvent !== "additional" && !state.enemy.weakness) || (attack.type === "superBreak" && state.enemy.toughnessActive)) return run();
      const issues = modifierInputIssues(attack, baseStats);
      for(const spec of attack.numericModifierInputs||[]){const v=state.modifierInputs[spec.inputKey]===undefined?spec.default:state.modifierInputs[spec.inputKey];if(!Number.isFinite(v)||v<spec.minimum||v>spec.maximum||(spec.integer&&!Number.isInteger(v)))issues.push({message:spec.label+"に"+spec.minimum+"～"+spec.maximum+"の整数を入力してください。",target:"hsrConditionDialogOpen"});}
      if (!Number.isFinite(state.stats.breakEffect) || state.stats.breakEffect < 0) issues.push({message:"撃破特効に0以上の数値を入力してください。", target:"hsrStat-breakEffect"});
      if (attack.type === "break" && !(Number.isFinite(state.enemy.maxToughness) && state.enemy.maxToughness > 0)) issues.push({message:"敵の最大靭性に0より大きい数値を入力してください。",target:"hsrMaxToughness"});
      if (issues.length) {
        issues.forEach(issue => fieldErrors.set(issue.target, issue.message));
        blocked.push({...attack, inputIssues:issues.map(issue => issue.message), inputTargets:issues.map(issue => issue.target)});
        return null;
      }
      return run();
    };
    const breakAttack = { id:"independent-break", name:"弱点撃破", attackType: "break", type: "break", element: character().element };
    const breakResult = state.breakInputs.mode === "superBreak" ? null : checkedBreak(breakAttack, () => window.HsrCalcEngine.calculateBreak({ character: baseRequest.character, enemy: state.enemy, element: character().element, modifiers: modifiers(breakAttack), breakBaseDamage: state.data.breakBaseDamage }));
    const specialBreakResults = (independentBreak ? [] : state.data.specialBreakAttacks || []).filter((attack) => attack.characterId === state.characterId && !attack.hidden && attackSupport(attack).status !== "displayOnly").map((attack) => {
      const level = attack.breakEvent === "additional" ? state.traceLevels[attack.traceKey] : num(state.traceLevels[attack.traceKey], 10); const index = Math.max(0, Math.min(attack.multipliers.length - 1, level - 1));
      const multiplier = num(attack.multipliers[index]) + (state.eidolon >= 6 ? num(attack.eidolon6Bonus) : 0);
      const resolved = { ...attack, traceLevel: level, multiplier, attackType: "break" };
      const result = checkedBreak(resolved, () => attack.breakEvent === "additional" ? window.HsrCalcEngine.calculateAdditionalBreak({modifierInputs:state.modifierInputs,character:{...baseRequest.character,id:state.characterId},enemy:state.enemy,attack:resolved,modifiers:modifiers(resolved),breakBaseDamage:state.data.breakBaseDamage}) : window.HsrCalcEngine.calculateBreak({ character: baseRequest.character, enemy: state.enemy, attack:resolved, element: attack.element, multiplier: multiplier / 100, modifiers: modifiers(resolved), breakBaseDamage: state.data.breakBaseDamage }));
      return { attack: resolved, result };
    }).filter(item => item.result);
    const superBreakAttack = { id:"independent-super-break", name:"超撃破", type: "superBreak", element: character().element, toughnessDamage: state.breakInputs.toughnessDamage, superBreakMultiplier: state.breakInputs.multiplier };
    const superBreakResult = state.breakInputs.mode === "superBreak" ? checkedBreak(superBreakAttack, () => window.HsrCalcEngine.calculateSuperBreak({ ...baseRequest, attack: superBreakAttack, modifiers: modifiers(superBreakAttack), breakBaseDamage: state.data.breakBaseDamage })) : null;
    if (superBreakResult && !superBreakResult.supported) warnings.push(superBreakResult.reason);
    if (independentBreak && breakResult && !breakResult.supported) warnings.push(breakResult.reason);
    renderWarnings(warnings); renderResults(results, breakResult, specialBreakResults, unavailableAttacks.concat(blocked), superBreakResult);
    finishCalculation(blocked.flatMap(attack => attack.inputIssues), fieldErrors, results.length + Number(breakResult?.supported === true) + Number(superBreakResult?.supported === true) + specialBreakResults.filter(item => item.result.supported).length);
  }

  function switchResultTab(tab) {
    $("hsrResults").querySelectorAll("[data-result-tab]").forEach((button) => { const active = button.dataset.resultTab === tab; button.setAttribute("aria-selected", String(active)); button.setAttribute("tabindex", active ? "0" : "-1"); button.classList.toggle("is-active", active); });
    $("hsrResults").querySelectorAll("[data-result-panel]").forEach((panel) => { panel.hidden = panel.dataset.resultPanel !== tab; });
  }

  function renderActionValue() {
    if (!window.HsrCalcEngine || !$("hsrActionSummary")) return;
    const speed = readStat($("hsrStat-speed"));
    if (!Number.isFinite(speed) || speed <= 0) { $("hsrActionSummary").textContent = "速度を入力すると、第1ラウンドの行動回数を表示します。0より大きい最終速度を入力してください。"; return; }
    const result = window.HsrCalcEngine.actionSummary(speed, 150);
    const budget = num($("hsrActionWindow")?.value, 150);
    const custom = budget > 0 && budget !== 150 ? window.HsrCalcEngine.actionSummary(speed, budget) : null;
    $("hsrActionSummary").innerHTML = `<strong>速度${detailNumber(speed)}：第1ラウンドに${result.actions}回行動</strong><span>基本行動値：${result.actionValue.toFixed(2)} AV（10000÷速度）</span><span>第1ラウンド：150行動値</span>${custom ? `<span>指定範囲${detailNumber(budget)}行動値：${custom.actions}回行動</span>` : ""}`;
    if (!(budget > 0)) $("hsrActionSummary").innerHTML += '<span>任意の行動値範囲には0より大きい値を入力してください。</span>';
  }

  function savedFields() {
    return [...document.querySelectorAll(".hsr-build-fieldset input,.hsr-build-fieldset select"), $("hsrActionWindow")].filter((input) => input?.id);
  }

  function saveInputs() {
    if (!state.initialized || !window.HsrCalcState) return;
    collectInputs();
    const fields = Object.fromEntries(savedFields().map((input) => [input.id, String(input.value)]));
    const snapshot = { ...state, party: state.party.map((member) => ({ ...member })) };
    if ($("hsrPartyDialog").open) $("hsrPartyRows").querySelectorAll("[data-party-field]").forEach((input) => {
      const member = snapshot.party[num(input.dataset.slot)]; const field = input.dataset.partyField;
      if (input.dataset.partyOriginal !== undefined && input.value === statDisplay(field, member?.[field])) return;
      if (member && Object.hasOwn(member, field)) member[field] = typeof member[field] === "number" ? (input.value.trim() === "" ? NaN : Number(input.value)) : input.value;
    });
    if ($("hsrPartyDialog").open) $("hsrPartyRows").querySelectorAll("[data-party-trace]").forEach((input) => { snapshot.party[Number(input.dataset.slot)].traceLevels = { ...snapshot.party[Number(input.dataset.slot)].traceLevels, [input.dataset.partyTrace]: input.value === "" ? NaN : Number(input.value) }; });
    let ok = false; try { ok = window.HsrCalcState.save(window.localStorage, window.HsrCalcState.create(snapshot, fields)); } catch (_) {}
    $("hsrSaveStatus").textContent = ok ? "入力条件をこのブラウザに自動保存しました。" : "入力条件を保存できません。現在の画面では計算を続けられます。";
    return ok;
  }

  function restoreInputs(snapshot) {
    if (!window.HsrCalcState) return false;
    let loaded;
    try { loaded = snapshot ? { value: snapshot } : window.HsrCalcState.load(window.localStorage); } catch (_) { loaded = { error: true }; }
    if (!loaded.value) { if (loaded.error) $("hsrSaveStatus").textContent = "保存条件を読み込めません。現在の入力で利用できます。"; return false; }
    const restored = window.HsrCalcState.restore(loaded.value, snapshot ? initialDefaults : state, state.data, savedFields().map((input) => input.id));
    if (!restored) { $("hsrSaveStatus").textContent = "保存条件の形式に対応していません。初期状態で表示しています。"; return false; }
    Object.assign(state, restored.state);
    renderStaticInputs(); writeStats();
    const controls = { hsrBreakMode: state.breakInputs.mode, hsrSuperBreakToughness: state.breakInputs.toughnessDamage, hsrSuperBreakMultiplier: state.breakInputs.multiplier, hsrSongbirdMode: String(state.songbirdInputs.active), hsrSongbirdContext: state.songbirdInputs.context, hsrSongbirdSkillLevel: state.songbirdInputs.skillLevel,
      ...Object.fromEntries(["hp", "critRate", "critDamage", "damageBonus"].map(key => ["hsrSongbird-"+key, state.songbirdInputs[key]])), hsrEnemySelect: state.enemyId, hsrPartySp: state.partySp, hsrElationContext: state.elationInputs.context, hsrPunchline: state.elationInputs.punchline, hsrFervor: state.elationInputs.fervor, hsrMerrymake: state.elationInputs.merrymake, hsrTrueDamageActive: String(state.trueDamageInputs.active), hsrTrueDamageSourceKind: state.trueDamageInputs.sourceKind, hsrOriginalDamage: state.trueDamageInputs.originalDamage };
    const enemyControls = { level: "hsrEnemyLevel", maxHp: "hsrEnemyMaxHp", resistance: "hsrEnemyResistance", maxToughness: "hsrMaxToughness", hpPercent: "hsrEnemyHpPercent", count: "hsrEnemyCount", debuffCount: "hsrEnemyDebuffCount", defenseReduction: "hsrEnemyDefenseReduction", defenseIgnore: "hsrEnemyDefenseIgnore", resistancePenetration: "hsrEnemyResistancePenetration", takenDamage: "hsrEnemyTakenDamage" };
    Object.entries(enemyControls).forEach(([key, id]) => { controls[id] = state.enemy[key]; });
    controls.hsrWeakness = String(state.enemy.weakness); controls.hsrToughnessState = state.enemy.toughnessActive ? "active" : "broken";
    Object.entries(controls).forEach(([id, value]) => { $(id).value = typeof value === "number" && !Number.isFinite(value) ? "" : String(value); });
    savedFields().forEach((input) => {
      if (input.dataset.stat) return; // State holds the exact value; fields contain only its rounded display.
      if (input.id === "hsrEnemySelect" || !Object.hasOwn(restored.fields, input.id)) return;
      const value = restored.fields[input.id];
      if (input.tagName === "SELECT" && ![...input.options].some((option) => option.value === value)) return;
      input.value = value;
    });
    $("hsrAttackerPosition").value = String(state.attackerPosition);
    collectInputs(); renderBuild(); updateConditionSummary(); renderActionValue(); renderAttackPreview();
    $("hsrSaveStatus").textContent = restored.missing.length ? "保存条件を復元しました。現在利用できないIDがあります。選択内容を確認してください。" : "保存条件を復元しました。";
    return true;
  }

  function modifierKeys(records) {
    return new Set(records.flatMap((record) => [record.activation?.inputKey, record.value?.inputKey, record.value?.levelInputKey, record.value?.multiplierInputKey, record.inputValidation?.whenToggle?.inputKey]).filter(Boolean));
  }

  function resetInputs(kind) {
    if (!initialInputs || !["conditions", "party", "all"].includes(kind)) return;
    collectInputs();
    const copy = (value) => JSON.parse(JSON.stringify(value));
    const target = kind === "all" ? copy(initialInputs) : window.HsrCalcState.create(state, Object.fromEntries(savedFields().map((input) => [input.id, String(input.value)])));
    if (kind === "conditions") {
      target.modifierInputs = copy(initialInputs.modifierInputs);
      target.conditions = copy(initialInputs.conditions);
      const enemyFields = { defenseReduction: "hsrEnemyDefenseReduction", defenseIgnore: "hsrEnemyDefenseIgnore", resistancePenetration: "hsrEnemyResistancePenetration", takenDamage: "hsrEnemyTakenDamage" };
      Object.entries(enemyFields).forEach(([key, id]) => { target.state.enemy[key] = initialInputs.state.enemy[key]; target.fields[id] = initialInputs.fields[id]; });
    }
    if (kind === "party") {
      const records = state.data.structuredModifiers || [];
      // Clear inactive former supports as well; retain keys still owned by the active build.
      const removedKeys = modifierKeys(records);
      const context = { ...structuredModifierContext(), partyIds: [], partyEquipment: [], partyEidolons: {}, partyStats: {}, partyPaths: { [state.characterId]: character()?.path } };
      const retainedIds = new Set(window.HsrModifierRuntime.buildCandidates(records, context, state.modifierInputs).map((item) => item.id));
      const retainedKeys = modifierKeys(records.filter((record) => retainedIds.has(record.id)));
      Object.keys(target.modifierInputs).forEach((key) => { if (removedKeys.has(key) && !retainedKeys.has(key)) delete target.modifierInputs[key]; });
      target.state.party = copy(initialInputs.state.party);
      target.state.attackerPosition = 1;
    }
    if (!restoreInputs(target)) return;
    $("hsrResults").innerHTML = '<p class="genshin-help">条件を設定して計算してください。</p>';
    renderWarnings([]); inputFeedback(); $("hsrDirtyNotice").hidden = false;
    const saved = saveInputs();
    const message = { conditions: "補正条件を初期状態へ戻しました。キャラ・装備・ステータス・編成は保持しています。", party: "パーティを初期状態へ戻しました。計算対象は保持しています。", all: "現在の計算入力を初期状態へ戻しました。" }[kind];
    $("hsrSaveStatus").textContent = message + (saved ? "" : " 保存できません。現在の画面では計算を続けられます。");
  }

  function bindResetControls() {
    const dialog = $("hsrResetDialog"), menu = $("hsrResetMenu");
    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-hsr-reset]"); if (!button) return;
      pendingReset = button.dataset.hsrReset;
      $("hsrResetDialogTitle").textContent = { conditions: "補正条件をリセットしますか？", party: "パーティをリセットしますか？", all: "全入力をリセットしますか？" }[pendingReset];
      $("hsrResetDialogDescription").textContent = { conditions: "キャラ・装備・パーティの補正条件、手動追加補正、敵の手動デバフを初期状態へ戻します。キャラ・装備・ステータス・編成と専用ダメージ入力は保持します。", party: "サポート3枠・編成位置と、そのメンバーに紐づく補正条件を初期化します。計算対象のキャラ・装備・ステータス、UID取得データは保持します。", all: "現在のキャラ・装備・ステータス・編成・補正・敵条件を初期化します。保存したUIDと取得済みプロフィールは削除しません。" }[pendingReset];
      menu.open = false; openModal(dialog); $("hsrResetCancel").focus?.();
    });
    ["hsrResetClose", "hsrResetCancel"].forEach((id) => $(id).addEventListener("click", () => { pendingReset = null; closeDialog(dialog); }));
    $("hsrResetConfirm").addEventListener("click", () => { const kind = pendingReset; pendingReset = null; closeDialog(dialog); if (kind) resetInputs(kind); });
    dialog.addEventListener("close", () => { pendingReset = null; menu.querySelector("summary")?.focus(); });
  }

  function markDirty(origin = "manual") { if (!state.initialized) return; conditionAudit = null; modifierIssueIds.clear(); inputFeedback(); renderWarnings([]); document.querySelectorAll("[data-hsr-pending-input]").forEach(notice => { notice.hidden = true; }); if (origin !== "api" && state.source === "api") { state.source = "api-edited"; $("hsrInputProvenance").textContent = "UID取得値を手動変更"; } $("hsrDirtyNotice").hidden = false; renderActionValue(); saveInputs(); updateConditionSummary(); refreshConditionFacts(); }

  function detailArticle(title, description, params = []) {
    if (!description) return "";
    return `<article class="genshin-uid-detail-item hsr-detail-card"><h4>${esc(cleanGameText(title))}</h4><p>${esc(formatGameText(description, params))}</p></article>`;
  }

  function traceKeyForSkill(skill) {
    if(state.characterId==="1510"&&["151025","151026"].includes(String(skill.id)))return "talent";
    const links = Object.values(state.data.traceSkillMap?.[state.characterId] || {});
    const group = links.find((item) => item.skillIds?.includes(String(skill.id)));
    const primary = character()?.skills?.find((entry) => entry.id === group?.skillIds?.[0]);
    return Object.entries(TRACE_FIELDS).find(([, [type]]) => type === (primary?.type || skill.type))?.[0];
  }
  function skillLevel(skill) {
    const key = traceKeyForSkill(skill); if (key) return state.traceLevels[key];
    return Math.min(10, skill.params?.length || 10);
  }

  function renderSkillCards(skills) {
    const seen = new Set();
    return skills.map((skill) => {
      const level = Math.max(1, Math.min(skill.params?.length || 1, skillLevel(skill)));
      const description = formatGameText(skill.description, skill.params?.[level - 1] || []);
      const key = `${cleanGameText(skill.name)}\n${description}`;
      if (!description || seen.has(key)) return "";
      seen.add(key);
      return detailArticle(`${skill.name} Lv.${level}`, description);
    }).join("");
  }

  function renderMemospriteStatus(skills) {
    const seen = new Set();
    return skills.flatMap((skill) => {
      const level = Math.max(1, Math.min(skill.params?.length || 1, skillLevel(skill)));
      const description = formatGameText(skill.description, skill.params?.[level - 1] || []);
      return description.split(/(?<=[。！？])\s*/).filter((sentence) => /初期速度|初期最大HP|固定最大HP|記憶の精霊.*最大HP|最大HP.*記憶の精霊/.test(sentence));
    }).filter((sentence) => sentence && !seen.has(sentence) && seen.add(sentence)).map((sentence) => `<article class="genshin-uid-detail-item hsr-detail-card"><h4>基礎ステータス</h4><p>${esc(sentence)}</p></article>`).join("");
  }

  function propertyIcon(type) {
    const label = PROPERTY_LABELS[type] || "";
    const key = label === "HP" ? "hp" : label === "攻撃力" ? "atk" : label === "防御力" ? "def" : label === "速度" ? "speed" : label === "会心率" ? "critRate" : label === "会心ダメージ" ? "critDamage" : label === "撃破特効" ? "breakEffect" : label === "効果命中" ? "effectHitRate" : label === "効果抵抗" ? "effectRes" : label === "EP回復効率" ? "energyRegen" : label === "愉悦度" ? "elation" : "";
    if (key && STAT_ICONS[key]) return `/games/images/hsr/stats/${STAT_ICONS[key]}`;
    const element = Object.keys(ELEMENT_KEYS).find((name) => type.startsWith(name));
    return elementIcon(element || character()?.element || "Physical");
  }

  function traceStatSummary(item) {
    const totals = {};
    item.traces.forEach((trace) => (trace.levels?.[0]?.properties || []).forEach((property) => { totals[property.type] = (totals[property.type] || 0) + num(property.value); }));
    const rows = Object.entries(totals).filter(([type]) => PROPERTY_LABELS[type]).map(([type, value]) => {
      const isFlat = /Delta$/.test(type) && !/Ratio/.test(type);
      const shown = isFlat ? Math.round(value * 1000) / 1000 : `${Math.round(value * 100000) / 1000}%`;
      return `<div><dt><img src="${propertyIcon(type)}" alt="">${esc(PROPERTY_LABELS[type])}</dt><dd>+${shown}</dd></div>`;
    }).join("");
    return rows ? `<section class="hsr-trace-summary"><h3>軌跡ステータス合計</h3><p>全ノード解放時</p><dl>${rows}</dl></section>` : "";
  }

  function characterDetailTabs(item) {
    const regularTypes = new Set(["Normal", "BPSkill", "Ultra", "Talent"]);
    const regular = renderSkillCards(item.skills.filter((skill) => regularTypes.has(skill.type)));
    const other = renderSkillCards(item.skills.filter((skill) => !regularTypes.has(skill.type) && !["Maze", "MazeNormal", "MemospriteSkill", "MemospriteTalent", "ElationDamage"].includes(skill.type)));
    const spiritSkills = item.skills.filter((skill) => ["MemospriteSkill", "MemospriteTalent"].includes(skill.type));
    const spiritStatus = renderMemospriteStatus(item.skills);
    const abilities = item.traces.filter((trace) => trace.name && trace.description).map((trace) => detailArticle(trace.name, trace.description, trace.params?.[0] || [])).join("");
    const eidolons = item.eidolons.map((row) => detailArticle(`星魂${row.rank} ${row.name}`, row.description, [])).join("");
    const tabs = [{ id: "traces", label: "軌跡", html: `<section class="genshin-uid-detail-group"><h3>通常・スキル・必殺技・天賦</h3>${regular}</section>${other ? `<section class="genshin-uid-detail-group"><h3>固有スキル</h3>${other}</section>` : ""}${traceStatSummary(item)}` }];
    if (spiritSkills.length) tabs.push({ id: "memosprite", label: "記憶の精霊", html: `${spiritStatus ? `<section class="genshin-uid-detail-group"><h3>記憶の精霊ステータス</h3>${spiritStatus}</section>` : ""}<section class="genshin-uid-detail-group"><h3>精霊スキル・精霊天賦</h3>${renderSkillCards(spiritSkills)}</section>` });
    if (item.skills.some((skill) => skill.type === "ElationDamage")) tabs.push({ id: "elation", label: "愉悦スキル", html: `<section class="genshin-uid-detail-group"><h3>愉悦スキル</h3>${renderSkillCards(item.skills.filter((skill) => skill.type === "ElationDamage"))}</section>` });
    tabs.push({ id: "abilities", label: "追加能力", html: `<section class="genshin-uid-detail-group"><h3>追加能力</h3>${abilities || "<p>追加能力はありません。</p>"}</section>` });
    tabs.push({ id: "eidolons", label: "星魂", html: `<section class="genshin-uid-detail-group"><h3>星魂</h3>${eidolons}</section>` });
    return tabs;
  }

  function showDetails(type, activeTab) {
    if (type === "cone") state.coneRank = num($("hsrConeRank").value, 1);
    const item = type === "character" ? character() : type === "cone" ? cone() : type === "relic" ? relic() : type === "relicSecond" ? relicSecond() : ornament(); if (!item) return;
    $("hsrDetailsTitle").textContent = item.name;
    $("hsrDetailsKicker").textContent = type === "character" ? "CHARACTER" : type === "cone" ? "LIGHT CONE" : item.type === "ornament" ? "PLANAR ORNAMENT" : "RELIC SET";
    const tabs = type === "character" ? characterDetailTabs(item) : type === "cone" ? [{ id: "effect", label: "光円錐効果", html: `<section class="genshin-uid-detail-group"><h3>${esc(cleanGameText(item.effect?.name || "光円錐効果"))}</h3>${detailArticle(`重畳${state.coneRank}`, item.effect?.description, item.effect?.paramsByRank?.[state.coneRank - 1] || [])}</section>` }] : [{ id: "effect", label: "セット効果", html: `<section class="genshin-uid-detail-group"><h3>セット効果</h3>${item.effects.map((effect) => detailArticle(`${effect.pieces}セット`, effect.description, effect.params || [])).join("")}</section>` }];
    const selected = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
    $("hsrDetailsTabs").innerHTML = tabs.map((tab) => `<button type="button" class="genshin-uid-details-tab${tab.id === selected ? " is-active" : ""}" data-details-tab="${tab.id}">${esc(tab.label)}</button>`).join("");
    $("hsrDetailsBody").innerHTML = `<div class="genshin-equipment-detail-summary"><img src="${esc(imageUrl(item.image))}" alt="" width="112" height="112"><div><p>${esc(item.elementName || item.pathName || (item.type === "ornament" ? "次元界オーナメント" : "トンネル遺物"))}</p><strong>${item.rarity ? `★${item.rarity}` : "セット装備"}</strong></div></div>${tabs.find((tab) => tab.id === selected).html}`;
    $("hsrDetailsTabs").querySelectorAll("[data-details-tab]").forEach((button) => button.addEventListener("click", () => showDetails(type, button.dataset.detailsTab)));
    $("hsrDetailsBody").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
    if (!$("hsrDetailsDialog").open) openModal($("hsrDetailsDialog"));
  }

  function applyProfileCharacter(profile) {
    const char = find("characters", String(profile.id)); state.characterId = char?.id || "";
    const lightCone = find("lightCones", String(profile.lightCone?.id || "")); state.coneId = lightCone?.id || "";
    const profileSets = profile.relicSets || []; const tunnels = profileSets.filter((set) => num(set.id) < 300); const planar = profileSets.find((set) => num(set.id) >= 300); state.relicId = find("relicSets", tunnels[0]?.id)?.id || ""; state.relicSecondId = find("relicSets", tunnels[1]?.id)?.id || ""; state.relicMode = state.relicSecondId ? "2+2" : "4pc"; state.ornamentId = find("relicSets", planar?.id)?.id || "";
    state.level = num(profile.level, 80); state.eidolon = num(profile.eidolon); state.coneLevel = num(profile.lightCone?.level, 80); state.coneRank = profile.lightCone ? Number(profile.lightCone.rank) : 1;
    const trace = (type) => { const value = profile.traces?.find((item) => item.type === type)?.level; return Number.isFinite(value) && value > 0 ? value : NaN; }; state.traceLevels = { normal: trace("Normal"), skill: trace("BPSkill"), ultimate: trace("Ultra"), talent: trace("Talent"), elation: trace("ElationDamage"), memSkill: trace("MemospriteSkill"), memTalent: trace("MemospriteTalent") };
    if (char?.id === "1512") { state.songbirdInputs.skillLevel = state.traceLevels.memSkill; $("hsrSongbirdSkillLevel").value = Number.isFinite(state.traceLevels.memSkill) ? state.traceLevels.memSkill : ""; state.modifierInputs["robin-songbirds-talent-level"] = state.traceLevels.memTalent; }
    state.stats = Object.fromEntries(Object.keys(DEFAULT_STATS).map((key) => [key, ["hpPercent", "dotBaseDamage"].includes(key) ? DEFAULT_STATS[key] : null]));
    Object.keys(state.stats).forEach((key) => {
      const value = profile.stats?.[key];
      if (value != null && value !== "" && Number.isFinite(Number(value))) state.stats[key] = Number(value);
    });
    if (Number.isFinite(state.stats.speed) && state.stats.speed > 0) state.modifierInputs["pre-combat-speed"] = state.stats.speed;
    else delete state.modifierInputs["pre-combat-speed"];
    state.source = "api"; writeStats(); renderStaticInputs(); renderBuild(); markDirty("api"); renderAttackPreview();
  }

  function bind() {
    bindResetControls();
    $("hsrClearSavedInputs").addEventListener("click", () => {
      let ok = false; try { ok = window.HsrCalcState.clear(window.localStorage); } catch (_) {}
      $("hsrSaveStatus").textContent = ok ? "保存条件を削除しました。次回の入力変更から自動保存します。" : "保存条件を削除できませんでした。";
    });
    const triggers = { hsrCharacterTrigger: "character", hsrCharacterName: "character", hsrConeTrigger: "cone", hsrConeName: "cone", hsrRelicTrigger: "relic", hsrRelicName: "relic", hsrRelicSecondTrigger: "relicSecond", hsrRelicSecondName: "relicSecond", hsrOrnamentTrigger: "ornament", hsrOrnamentName: "ornament", hsrEnemyTrigger: "enemy" };
    Object.entries(triggers).forEach(([id, type]) => $(id).addEventListener("click", () => openSelection(type)));
    $("hsrSelectionSearch").addEventListener("input", () => { $("hsrSelectionSearchClear").disabled = !$("hsrSelectionSearch").value; renderSelectionList(); });
    $("hsrSelectionSearchClear").addEventListener("click", () => { $("hsrSelectionSearch").value = ""; $("hsrSelectionSearchClear").disabled = true; renderSelectionList(); if (window.matchMedia("(min-width: 769px)").matches) $("hsrSelectionSearch").focus(); });
    $("hsrSelectionFilters").addEventListener("click", (event) => { const clear = event.target.closest("#hsrFilterClear"); if (clear) { Object.values(state.selectionFilters).forEach((values) => values.clear()); $("hsrSelectionFilters").querySelectorAll("[data-filter-group]").forEach((button) => button.setAttribute("aria-pressed", "false")); clear.disabled = true; renderSelectionList(); return; } const button = event.target.closest("[data-filter-group]"); if (!button) return; const values = state.selectionFilters[button.dataset.filterGroup]; const value = button.dataset.filterValue; if (values.has(value)) values.delete(value); else values.add(value); button.setAttribute("aria-pressed", String(values.has(value))); const clearButton = $("hsrFilterClear"); if (clearButton) clearButton.disabled = !Object.values(state.selectionFilters).some((selected) => selected.size); renderSelectionList(); });
    $("hsrSelectionList").addEventListener("click", (event) => { const card = event.target.closest("[data-selection-id]"); if (card) chooseSelection(card.dataset.selectionId, card.dataset.selectionProfile); });
    $("hsrSelectionClose").addEventListener("click", () => closeDialog($("hsrSelectionDialog")));
    const openParty = () => { renderPartyDialog(); openModal($("hsrPartyDialog")); };
    $("hsrPartyDialogOpen").addEventListener("click", openParty);
    $("hsrPartyPreview").addEventListener("click", (event) => { if (event.target.closest("[data-party-preview-slot]")) openParty(); });
    $("hsrPartyDialogClose").addEventListener("click", () => closeDialog($("hsrPartyDialog")));
    $("hsrPartyDialogApply").addEventListener("click", () => { collectParty(); closeDialog($("hsrPartyDialog")); });
    $("hsrAttackerPosition").addEventListener("change", (event) => { state.attackerPosition = Number(event.target.value); renderPartyDialog(); renderPartySummary(); markDirty(); });
    $("hsrPartyRows").addEventListener("click", (event) => {
      const equipment = event.target.closest("[data-party-equipment]");
      if (equipment) { collectParty(); openSelection(equipment.dataset.partyEquipment, Number(equipment.dataset.slot)); return; }
      const move = event.target.closest("[data-party-move]");
      if (move) { collectParty(); const from = Number(move.dataset.slot), to = from + Number(move.dataset.partyMove); [state.party[from], state.party[to]] = [state.party[to], state.party[from]]; renderPartyDialog(); renderPartySummary(); markDirty(); return; }
      const clear = event.target.closest("[data-party-clear]");
      if (clear) { state.party[num(clear.dataset.partyClear)] = { characterId: "", eidolon: 0, level: 10, atk: 0, critDamage: 50, breakEffect: NaN, speed: NaN, effectRes: NaN, lightConeId: "", coneRank: 1, relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "" }; renderPartyDialog(); renderPartySummary(); updateConditionSummary(); markDirty(); return; }
      const button = event.target.closest("[data-party-select]"); if (button) { collectParty(); openSelection("party", num(button.dataset.partySelect)); }
    });
    $("hsrPartyRows").addEventListener("input", (event) => { if (event.target.matches("[data-party-field],[data-party-trace]")) markDirty(); });
    $("hsrPartyRows").addEventListener("change", (event) => {
      if (event.target.matches("[data-party-field],[data-party-trace]")) collectParty(event.target.tagName === "SELECT");
    });
    $("hsrConditionDialogOpen").addEventListener("click", () => openConditionSettings());
    $("hsrConditionDialogClose").addEventListener("click", () => closeDialog($("hsrConditionDialog")));
    $("hsrConditionDialog").addEventListener("click", (event) => {
      const ratio = event.target.closest("[data-hsr-ratio-field]");
      if (ratio?.dataset.hsrRatioField && ["hsrStat-hpPercent", "hsrEnemyHpPercent"].includes(ratio.dataset.hsrRatioField)) { closeDialog($("hsrConditionDialog")); const field = $(ratio.dataset.hsrRatioField); field?.focus(); field?.scrollIntoView({ block: "center" }); return; }
      const provider = event.target.closest("[data-hsr-provider-settings]");
      if (provider?.dataset.hsrProviderSettings) { openProviderTraceSettings(provider.dataset.hsrProviderSettings, provider.dataset.hsrProviderTrace); return; }
      const tab = event.target.closest("[data-condition-tab]"); if (tab) { state.conditionTab = tab.dataset.conditionTab; renderConditions(); }
    });
    $("hsrConditionDialog").addEventListener("input", (event) => {
      if (event.target.dataset.structuredProviderStat) {
        const providerId = String(event.target.dataset.providerId || state.characterId);
        const stat = event.target.dataset.structuredProviderStat;
        const value = readStat(event.target);
        if (providerId === String(state.characterId)) { state.stats[stat] = value; writeStats(); }
        else { const member = state.party.find((entry) => String(entry.characterId) === providerId); if (member) member[stat] = value; }
        updateConditionSummary(); markDirty(); return;
      }
      if (event.target.dataset.conditionValue) {
        const item = state.conditions.find((condition) => condition.id === event.target.dataset.conditionValue);
        if (item) { item.value = num(event.target.value); markDirty(); }
        return;
      }
      if (!event.target.dataset.structuredInput) return;
      state.modifierInputs[event.target.dataset.structuredInput] = event.target.dataset.structuredStrict === "true" ? (event.target.value.trim() === "" ? NaN : Number(event.target.value)) : num(event.target.value);
      updateConditionSummary(); markDirty();
    });
    $("hsrConditionDialog").addEventListener("change", (event) => {
      if (event.target.dataset.structuredProviderStat) { updateConditionSummary(); markDirty(); return; }
      if (event.target.dataset.structuredToggle) {
        state.modifierInputs[event.target.dataset.structuredToggle] = event.target.checked;
        renderConditions(); updateConditionSummary(); markDirty(); return;
      }
      if (event.target.dataset.comparisonChoice) { state.modifierInputs[event.target.dataset.comparisonChoice]=event.target.value.trim()===""?NaN:Number(event.target.value); renderConditions(); markDirty(); return; }
      if (event.target.dataset.structuredInput) {
        state.modifierInputs[event.target.dataset.structuredInput] = event.target.dataset.structuredStrict === "true" ? (event.target.value.trim() === "" ? NaN : Number(event.target.value)) : num(event.target.value);
        updateConditionSummary(); markDirty(); return;
      }
      const id = event.target.dataset.conditionEnabled || event.target.dataset.conditionValue || event.target.dataset.conditionStack; if (!id) return;
      if (id.startsWith("party:")) {
        const member = state.party[num(id.split(":")[1])]; if (member && event.target.dataset.conditionEnabled) member.enabled = event.target.checked;
      } else {
        const item = state.conditions.find((condition) => condition.id === id); if (!item) return;
        if (event.target.dataset.conditionEnabled) item.enabled = event.target.checked; else item.value = num(event.target.value);
      }
      updateConditionSummary(); markDirty();
    });
    $("hsrDetailsClose").addEventListener("click", () => closeDialog($("hsrDetailsDialog")));
    $("hsrCharacterDetailsButton").addEventListener("click", () => showDetails("character"));
    $("hsrConeDetailsButton").addEventListener("click", () => showDetails("cone"));
    $("hsrRelicDetailsButton").addEventListener("click", () => showDetails("relic"));
    $("hsrRelicSecondDetailsButton").addEventListener("click", () => showDetails("relicSecond"));
    $("hsrOrnamentDetailsButton").addEventListener("click", () => showDetails("ornament"));
    $("hsrRelicMode").addEventListener("change", (event) => { state.relicMode = event.target.value; if (state.relicMode === "4pc") state.relicSecondId = ""; renderBuild(); markDirty(); });
    $("hsrEidolon").addEventListener("change", (event) => { state.eidolon = num(event.target.value); renderBuild(); updateConditionSummary(); markDirty(); });
    $("hsrStat-hpPercent").addEventListener("input", (event) => {
      state.stats.hpPercent = readHpRatio(event.target);
      renderAttacks();
      updateConditionSummary();
    });
    $("hsrEnemyHpPercent").addEventListener("input", (event) => {
      state.enemy.hpPercent = readHpRatio(event.target);
      renderAttacks();
      updateConditionSummary();
    });
    $("hsrEnemyMaxHp").addEventListener("input", (event) => {
      state.enemy.maxHp = Math.max(0, num(event.target.value, 100000));
      markDirty();
    });
    $("hsrEnemyCount").addEventListener("input", (event) => {
      state.enemy.count = Math.min(5, Math.max(1, Math.floor(num(event.target.value, 1))));
      renderAttacks();
      updateConditionSummary();
    });
    $("hsrEnemyDebuffCount").addEventListener("input", (event) => {
      state.enemy.debuffCount = Math.max(0, num(event.target.value));
      renderAttacks();
      updateConditionSummary();
    });
    $("hsrPartySp").addEventListener("input", (event) => {
      state.partySp = Math.min(7, Math.max(0, Math.floor(num(event.target.value, 3))));
      updateConditionSummary();
    });
    $("hsrEnhancementState").addEventListener("change", (event) => { state.enhancementState = event.target.value; renderBuild(); updateConditionSummary(); markDirty(); });
    $("hsrEnemySelect").addEventListener("change", (event) => applyEnemy(event.target.value));
    $("hsrCalculateButton").addEventListener("click", () => {
      try { calculate(); } catch (error) {
        console.error("HSR calculation failed", error);
        $("hsrResults").innerHTML = '<p class="genshin-help">計算結果を表示できませんでした。</p>';
        renderWarnings(["計算処理でエラーが発生しました。ページを再読み込みして再度お試しください。"]);
        $("hsrWarnings").classList.add("genshin-json-calc-warnings");
        finishCalculation(["計算処理でエラーが発生しました。ページを再読み込みして再度お試しください。"]);
      }
    });
    $("hsrCalculationFeedback").addEventListener("click", event => { const button = event.target.closest("[data-hsr-input-target]"); if (button) navigateInput(button.dataset.hsrInputTarget); });
    $("hsrResults").addEventListener("click", (event) => {
      const inputAction = event.target.closest("[data-hsr-input-target]"); if (inputAction) { navigateInput(inputAction.dataset.hsrInputTarget); return; }
      const detail = event.target.closest("[data-hsr-result-detail]");
      if (detail) { const row = $(detail.dataset.hsrResultDetail); row.hidden = !row.hidden; detail.setAttribute("aria-expanded", String(!row.hidden)); detail.setAttribute("aria-label", row.hidden ? "計算内訳を開く" : "計算内訳を閉じる"); const icon = detail.querySelector(".genshin-detail-toggle-icon"); if (icon) icon.textContent = row.hidden ? "▼" : "▲"; return; }
      const button = event.target.closest("[data-result-tab]"); if (button) switchResultTab(button.dataset.resultTab);
    });
    $("hsrResults").addEventListener("keydown", (event) => {
      const current = event.target.closest("[data-result-tab]"); if (!current || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const tabs = [...$("hsrResults").querySelectorAll("[data-result-tab]")]; const index = tabs.indexOf(current);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); switchResultTab(tabs[next].dataset.resultTab); tabs[next].focus();
    });
    $("hsrActionWindow").addEventListener("input", markDirty);
    document.querySelectorAll("[data-stat]").forEach((input) => {
      input.addEventListener("input", () => { displayedStats.delete(input.id); state.stats[input.dataset.stat] = input.dataset.stat === "hpPercent" ? readHpRatio(input) : readStat(input); });
      input.addEventListener("blur", () => { state.stats[input.dataset.stat] = input.dataset.stat === "hpPercent" ? readHpRatio(input) : readStat(input); writeStat(input.dataset.stat); });
    });
    Object.entries(TRACE_FIELDS).forEach(([key, [, id]]) => $(id).addEventListener("change", () => {
      collectInputs();
      if (state.characterId === "1512" && key === "memSkill") { state.songbirdInputs.skillLevel = state.traceLevels.memSkill; $("hsrSongbirdSkillLevel").value = $(id).value; }
      if (state.characterId === "1512" && key === "memTalent") state.modifierInputs["robin-songbirds-talent-level"] = state.traceLevels.memTalent;
      markDirty();
    }));
    $("hsrSongbirdSkillLevel").addEventListener("change", () => { state.traceLevels.memSkill = Number($("hsrSongbirdSkillLevel").value); $("hsrMemSkillTrace").value = $("hsrSongbirdSkillLevel").value; markDirty(); });
    $("hsrManualConditionList").addEventListener("input", (event) => {
      const id = event.target.dataset.conditionEnabled || event.target.dataset.conditionValue;
      const item = state.conditions.find((entry) => entry.id === id); if (!item) return;
      if (event.target.dataset.conditionEnabled) item.enabled = event.target.checked; else item.value = num(event.target.value);
      markDirty();
    });
    document.querySelectorAll(".hsr-build-fieldset input,.hsr-build-fieldset select").forEach((input) => input.addEventListener("input", markDirty));
    document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); }));
  }

  async function initialize() {
    try {
      state.data = await window.HsrCalcData.load(); renderStaticInputs(); bind(); applyEnemy(state.enemyId); writeStats(); renderBuild(); updateConditionSummary();
      collectInputs();
      initialInputs = window.HsrCalcState?.create(state, Object.fromEntries(savedFields().map((input) => [input.id, String(input.value)])));
      const copyValue = (value) => Array.isArray(value) ? value.map(copyValue) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)])) : value;
      initialDefaults = { ...state, ...Object.fromEntries(Object.keys(initialInputs.state).map((key) => [key, copyValue(state[key])])), conditions: state.conditions.map((item) => ({ ...item })) };
      const restored = restoreInputs();
      state.initialized = true; $("hsrDirtyNotice").hidden = !restored;
    } catch (error) {
      $("hsrWarnings").classList.add("genshin-json-calc-warnings"); $("hsrWarnings").hidden = false; $("hsrWarnings").textContent = "計算データを読み込めませんでした。ページを再読み込みしてください。"; console.error(error);
    }
  }

  window.HsrTool = Object.freeze({ applyProfileCharacter, getState: () => state, openSelection, setProfileCharacters: (characters) => { profileCharacters = Array.isArray(characters) ? characters : []; } });
  document.addEventListener("DOMContentLoaded", initialize);
})();
