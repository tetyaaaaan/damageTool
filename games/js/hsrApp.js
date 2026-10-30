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
      const visible = skills.some((skill) => skill.type === type && skill.params?.length);
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
    $("hsrElationSettings").hidden = !["1505", "1502", "1513"].includes(char?.id);
    $("hsrElationContextField").hidden = char?.id !== "1502";
    $("hsrElationScope").textContent = char?.id === "1502" ? "爻光Lv80・星魂0・敵1体、初回の通常アッハタイムの全6ヒットです。" : "緋英Lv80・星魂0のアッハタイム中、敵1体あたりの1回分です。爆笑の褒美を参照する発動は対象外です。";
    $("hsrPunchlineField").hidden = false;
    $("hsrFervorField").hidden = char?.id !== "1513";
    $("hsrPunchlineHelp").textContent = char?.id === "1502" ? "消費済み爆笑ネタが0の初回通常発動だけに対応します。2回目以降・必殺技による追加発動は対象外です。被ダメージ増加16%は自動適用するため重複入力しないでください。愉悦度・会心等は適用対象の常時効果を含む最終値を入力してください。上笑なしは0。通常の与ダメージ補正は適用しません。" : "Lv80・星魂0・アッハタイム中の敵1体あたり1回分です。爆笑ネタと爆笑の褒美は別の値です。この攻撃では攻撃時点の爆笑ネタだけを使い、攻撃後の爆笑の褒美+5は加算しません。上笑がない場合は0を入力してください。通常の与ダメージ補正は適用しません。";
    if (char?.id === "1513") {
      $("hsrElationScope").textContent = "夏アベンチュリンLv80・星魂0・敵1体。通常版151320と、次のアッハタイムの強化版151321を条件別に計算します。";
      $("hsrPunchlineHelp").textContent = "通常版は熱気10到達の自動発動、強化版は他の愉悦キャラ編成時の次のアッハタイムを想定します。全ヒット中の敵条件変化なし。通常版の爆笑ネタは固定20、強化版は下の爆笑ネタと消費熱気10～30を参照します。上笑なしは0。通常与ダメージ補正、複数敵分配、熱気の自動管理は対象外です。";
    }
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
    return state.data.attacks.filter(item => item.characterId === state.characterId && !item.hidden
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
    if (attack.damageFormula === "enemyHpCappedByAtk" && (String($("hsrEnemyMaxHp").value).trim() === "" || !(Number($("hsrEnemyMaxHp").value)>0))) issue("この裂創成分に必要な敵の最大HPを入力してください。", "hsrEnemyMaxHp");
    if (attack.characterLevelExact !== undefined && state.level !== attack.characterLevelExact) issue(`${attack.name}はキャラクターLv${attack.characterLevelExact}のみ計算対応です。`, "hsrLevel");
    if (attack.damageFormula === "componentSequence" && (!Array.isArray(attack.sequenceAttacks) || attack.sequenceAttacks.length !== (attack.id === "140109" ? 4 : attack.id === "1206022" ? 3 : attack.id === "130803" ? (attack.sequenceAttacks?.length || 0) : attack.id === "1111083" ? (attack.ownBleed ? 3 : 2) : attack.id === "1223031" ? (attack.preyActive ? 4 : 2) : 2))) issue(`${attack.name}の構成データ（本体・追加成分）を読み込めません。ページを再読み込みして確認してください。`, "");
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
    if (attack.requiresNonWeakTarget && state.enemy.weakness) issue(`${attack.name}は今回、${ELEMENT_KEYS[attack.element] || "対応する"}属性が弱点ではない敵のみ計算対応です。属性弱点を「弱点なし」にしてください。`, "hsrWeakness");
    if (attack.requiredWeakTarget && !state.enemy.weakness) issue(attack.name+"は攻撃前から対応属性が弱点の敵を想定します。属性弱点を確認してください。", "hsrWeakness");
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
      const value = state.modifierInputs[input.inputKey] === undefined ? input.default : state.modifierInputs[input.inputKey];
      if (!Number.isFinite(value) || value < input.minimum || value > input.maximum || (input.integer && !Number.isInteger(value))) issue(`${input.label}に${input.minimum}～${input.maximum}の数値を入力してください。`, "hsrConditionDialogOpen");
    }
    for (const id of (attack.damageFormula === "nativeBreakSequence" && attack.type !== "superBreak" ? [] : attack.requiredModifierIds || [])) {
      const required = modifiers(attack).filter(item => item.id === id && item.enabled && item.matchesAttack);
      if (required.length !== 1 || (!required[0].inputWarnings?.length && (!required[0].applicable || !Number.isFinite(required[0].value)))) issue(`${attack.name}の固有補正を読み込めませんでした。ページを再読み込みしてください。`);
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
      const member = state.party[state.partySlot]; member.characterId = id; member.eidolon = 0; member.level = 10; member.atk = 0; member.critDamage = 50; member.breakEffect = NaN; member.speed = NaN; member.effectRes = NaN; member.lightConeId = ""; member.coneRank = 1; member.relicId = ""; member.relicSecondId = ""; member.relicMode = "4pc"; member.ornamentId = ""; member.source = "manual"; member.traceLevels = Object.fromEntries(partyTraceRequirements(member).map(key => [key, 10])); if (profile) applyPartyProfile(member, profile); renderPartyDialog(); renderPartySummary(); updateConditionSummary();
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
    const skill = find("characters", String(source.id))?.skills?.find(item => String(item.id) === String(source.skillId));
    return Object.entries(TRACE_FIELDS).find(([, [type]]) => type === skill?.type)?.[0];
  }

  function supportTraceLevel(member, key) {
    if (!key) return NaN;
    if (Object.hasOwn(member.traceLevels || {}, key)) return member.traceLevels[key];
    // The shared value is a legacy manual setting, never a UID fallback.
    return member.source === "api" ? NaN : Number(member.level);
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
      const coneValue = stat === "speed" || !selectedCone ? 0 : selectedCone.base?.[stat];
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
      const member = state.party.find((item) => String(item.characterId) === String(source.id));
      if (!member) return 10;
      const key = Object.entries(TRACE_FIELDS).find(([, [type]]) => type === skill?.type)?.[0];
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
      party: { sp: state.partySp },
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
    const candidates = window.HsrModifierRuntime.buildCandidates(state.data?.structuredModifiers || [], {...structuredModifierContext(), attack, validateCandidate:validateProvider}, effectiveInputs);
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
      const value = Number.isFinite(activation.inputValue) ? `${detailNumber(activation.inputValue)}${!precombat && item.unit === "percent" ? "%" : ""}` : "未入力";
      return `${item.conditionText || "入力条件"}（${precombat ? "戦闘前の速度" : "現在値"}：${value}）`;
    }
    const reference = {
      "enemy.toughnessBroken": ["対象の弱点撃破状態（1=撃破済み）", ""], "self.interpretation": ["指定した解読層数", "層"], "self.preCombatCritDamage": ["戦闘開始時の会心ダメージ", "%"], "party.eruditionCount": ["編成内の知恵キャラ数", "人"], "party.nihilityAllyCount": ["本人以外の虚無キャラ数", "人"], "party.samePathAllyCount": ["同運命の別キャラ数", "人"], "provider.speed": ["提供者の速度", ""], "provider.effectRes": ["提供者の効果抵抗", "%"], "provider.breakEffect": ["提供者の撃破特効", "%"], "provider.sameElement": ["提供者との属性一致（1=一致）", ""], "provider.firstSlotRecipient": ["1枠目への支援（1=成立）", ""],
      "self.hp": ["HP", ""], "self.hpPercent": ["HP割合", "%"], "self.epPercent": ["EP割合", "%"], "self.speed": ["速度", ""],
      "self.atk": ["攻撃力", ""], "self.def": ["防御力", ""], "self.critRate": ["会心率", "%"], "self.critDamage": ["会心ダメージ", "%"], "self.effectHitRate": ["効果命中", "%"],
      "self.effectRes": ["効果抵抗", "%"], "self.breakEffect": ["撃破特効", "%"], "self.elation": ["愉悦度", "%"],
      "enemy.hpPercent": ["敵のHP割合", "%"], "enemy.weakness": ["属性弱点", ""], "enemy.quantumWeakness": ["敵の量子弱点", ""], "enemy.debuffCount": ["敵のデバフ数", ""], "enemy.count": ["敵数", ""], "enemy.toughnessRemaining": ["敵の残り靭性", ""], "party.elationCount": ["愉悦キャラクター数（攻撃者を含む）", "人"], "party.count": ["パーティ人数", ""], "party.sp": ["SP", ""]
    }[activation.reference] || ["現在値", ""];
    return `${item.conditionText || "自動判定条件"}（現在の${reference[0]} ${Number.isFinite(activation.inputValue) ? activation.inputValue : "未確認"}${reference[1]}）`;
  }

  function currentConditionReflection(item) {
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
      if (activation.mode === "numericThreshold" && activation.inputKey && !item.comparisonControlled && !rendered.has(`threshold:${activation.inputKey}`) && !rendered.has(`stack:${activation.inputKey}`) && !conditionReferenceInputs.has(activation.inputKey)) {
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
      return [id,{characterId:id,element:find('characters',id)?.element,level:80,eidolon:m.eidolon,stats:{atk:get('atk'),critRate:get('critRate'),critDamage:get('critDamage')},damageBonuses:{Thunder:get('Thunder')},defenseIgnore:get('defenseIgnore'),resistancePenetration:get('resistancePenetration')}];
    }));
  }
  function partyReferenceControls() {
    if(state.characterId!=='1202'||state.conditionTab!=='軌跡') return '';
    const id=String(state.modifierInputs['party-reference-owner:1202']||''),member=state.party.find(m=>String(m.characterId)===id);
    const fields=member?['atk','critRate','critDamage','Thunder','defenseIgnore','resistancePenetration'].map((k,i)=>{const key='party-reference:'+id+':'+k;return '<label class="genshin-condition-control"><span>'+['賜福対象の最終ATK','最終会心率（%）','最終会心ダメージ（%）','最終雷属性与ダメージ（%）','防御無視（%）','雷属性耐性貫通（%）'][i]+'</span><input class="input_num" type="number" data-structured-input="'+key+'" data-structured-strict="true" value="'+(Number.isFinite(state.modifierInputs[key])?state.modifierInputs[key]:'')+'" step="0.1"></label>';}).join(''):'';
    return '<section class="hsr-condition-purpose" data-hsr-condition-ids="party-reference:1202"><h5>停雲本人の攻撃後に発生する賜福対象の付加</h5><p class="genshin-help">Lv80・星魂0の賜福対象の戦闘中の最終値を入力します。賜福・他の支援・装備の効果を含めた値を使い、この付加行には攻撃者側の支援を再加算しません。停雲本人の通常とは別の1回分です。</p><label class="genshin-condition-control"><span>賜福対象</span><select data-comparison-choice="party-reference-owner:1202"><option value="">パーティから選択</option>'+state.party.filter(m=>m.characterId).map(m=>'<option value="'+m.characterId+'"'+(String(m.characterId)===id?' selected':'')+'>'+esc(find('characters',m.characterId)?.name||m.characterId)+'</option>').join('')+'</select></label>'+fields+'</section>';
  }
  function comparisonReferenceControls() {
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
    return {character:{level:state.level,eidolon:state.eidolon,stats:{...state.stats,damageBonuses},baseStats:undefined},enemy:{...state.enemy,resistances}};
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

    const purposes = CONDITION_PURPOSES.map(purpose => {
      const entries = [...groups.values()].filter(items => conditionPurpose(items[0]) === purpose.id);
      if (!entries.length) return "";
      const content = `<p class="genshin-help">${esc(purpose.help)}</p>${state.conditionTab === "パーティ" ? renderPartyConditionGroups(entries) : entries.map(renderConditionGroup).join("")}`;
      return purpose.folded ? `<details class="hsr-condition-purpose" data-condition-purpose="${purpose.id}"><summary>${esc(purpose.title)}（${entries.length}件）</summary>${content}</details>`
        : `<section class="hsr-condition-purpose" data-condition-purpose="${purpose.id}"><h5>${esc(purpose.title)}</h5>${content}</section>`;
    }).join("");
    $("hsrConditionList").innerHTML = `<section class="genshin-condition-card is-wide hsr-condition-category"><header><div><h4>${esc(meta.title)}</h4><p>${esc(meta.subtitle)}</p></div><span class="genshin-condition-source">${esc(meta.source)}</span></header>${partyReferenceControls()}${comparisonReferenceControls()}${purposes || '<p class="genshin-condition-card-empty">このカテゴリに設定できる効果はありません。</p>'}</section>`;
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
    if (attack.fixedCritStats && ["critRate","critRateOverride","critDamage"].includes(item.category)) return false;
    if (attack.damageFormula === "trueDamage") return false;
    if (state.characterId === "1205" && attack.type === "normal" && item.activation?.inputKey === "blade-hellscape-active") return false;
    if (attack.id === "131503" && item.id === "trace:1315:131502:standoff-vulnerability") return false;
    if (item.structured && !window.HsrModifierRuntime.applicableToAttack(item, attack)) return false;
    if (attack.id === "1151201") return ["trace:1512:151204:fever-defense-ignore", "trace:1512:1151203:songbirds-vulnerability"].includes(item.id);
    // Match the existing engines' accepted categories; this only scopes validation/application.
    if (attack.damageFormula === "elation") return ["elation", "critRate", "critRateOverride", "critDamage", "critTakenDamage", "defenseReduction", "defenseIgnore", "resistanceReduction", "resistancePenetration", "takenDamage"].includes(item.category);
    if (["break", "superBreak"].includes(attack.type)) return ["breakEffect", "breakDamage", "defenseReduction", "defenseIgnore", "resistanceReduction", "resistancePenetration", "takenDamage", ...(attack.type === "superBreak" ? ["breakEfficiency", "superBreakDamage"] : [])].includes(item.category);
    if ((attack.canCrit === false || attack.type === "dot") && ["critRate", "critRateOverride", "critDamage", "critTakenDamage"].includes(item.category)) return false;
    if (["statFlat", "statPercent"].includes(item.category) || item.requiredBaseStat) {
      const stats = [...(attack.scalingTerms?.length ? attack.scalingTerms : [{stat: attack.scalingStat || "atk"}]), ...(attack.adjacentScalingTerms || [])].map(term => term.stat);
      if (attack.damageFormula === "enemyHpCappedByAtk") stats.push("atk");
      return stats.includes(item.stat || item.requiredBaseStat);
    }
    return true;
  }

  function modifiers(attack) {
    const otherNihility=state.characterId==='1507' && state.party.some(m=>String(m.characterId)!==state.characterId && ['Warlock','Nihility'].includes(find('characters',m.characterId)?.path));
    const inputs = attack.comparisonModifierInputs || state.characterId==='1507' ? { ...state.modifierInputs, ...attack.comparisonModifierInputs,...(state.characterId==='1507'?{'mortenax-no-other-nihility':!otherNihility,'mortenax-other-nihility':otherNihility}:{}) } : state.modifierInputs;
    return allConditions(inputs, attack).filter((item) => !item.displayOnly).map((original) => {
      const item=attack.marchEnhancedAdditional && original.id === "trace:1224:122404:enhanced-damage" ? {...original,target:{...original.target,attackIds:["122402"],attackTypes:["additional"],elements:[]}} : original;
      const separateBenediction=item.id==="trace:1202:120202:benediction-atk" && state.characterId==="1202" && state.party.some(m=>String(m.characterId)===String(state.modifierInputs["party-reference-owner:1202"]));
      const attackApplies = !separateBenediction && modifierTargetsCalculation(item, attack) && (!attack.completedReferenceSnapshot || ['enemySingle','enemyAll'].includes(item.target?.owner));
      const supplementalApplies = !item.supplementalAttack || item.id === attack.sourceModifierId;
      const primaryTargetApplies = !item.primaryTargetOnly || attack.target !== "adjacent";
      const adjacentTargetApplies = !item.adjacentTargetOnly || attack.target === "adjacent";
      return { ...item, matchesAttack: attackApplies && supplementalApplies && primaryTargetApplies && adjacentTargetApplies, conditionText: item.activation?.reference === "party.elationCount" ? conditionRequirement(item) : item.conditionText, applicable: item.enabled && attackApplies && supplementalApplies && primaryTargetApplies && adjacentTargetApplies && item.applicable !== false, reason: !item.enabled ? (item.calculable && item.activation?.unresolved && !item.includedInFinalStats ? "条件の参照値が未確定のため追加しません" : item.includedInFinalStats ? "最終入力に反映済みのため追加しません" : "発動条件を満たしていません") : separateBenediction ? "賜福の対象は選択した別の味方です。停雲本人のATKへは加算しません。" : !supplementalApplies ? "別の付加ダメージに属する補正です" : !primaryTargetApplies ? "隣接対象はこの補正の対象外です" : !adjacentTargetApplies ? "主対象はこの補正の対象外です" : attackApplies ? item.reason || "" : "この攻撃種別・属性は対象外です" };
    });
  }

  function resolvedAttack(selected) {
    if (selected.id==='120204' && selected.partyReference) {
      const ctx={...structuredModifierContext(),enemy:componentSnapshots().enemy};
      const ref=window.HsrModifierRuntime.supplementalReference({providerId:'1202',supplementalAttack:{statReference:'selectedParty',ownerInputKey:'party-reference-owner:1202',element:'Thunder',triggerActor:'provider'}},ctx,state.modifierInputs);
      return {...selected,traceLevel:state.traceLevels.talent,multiplier:selected.multipliers[state.traceLevels.talent-1],attackType:'additional',referenceCharacter:ref.character,referenceEnemy:ref.enemy,referenceStats:ref.stats,referenceRoles:ref,completedReferenceSnapshot:true,referenceIssue:ref.supported?'':ref.reason,referenceCondition:{id:'party-reference:1202',tab:'軌跡',valueInput:{key:'party-reference-owner:1202',shared:true}},calculationNote:selected.calculationNote+' 数値/帰属：'+(find('characters',ref.statReferenceId)?.name||'賜福対象未選択')+'。発生元/軌跡/発動者：停雲。'};
    }
    if (["1405011","1405021"].includes(selected.id)) {
      const parts=selected.damageComponents.map(c=>state.data.attacks.find(a=>a.id===c.attackId&&a.characterId==='1405'));
      const sequenceAttacks=parts.every(Boolean)?parts.map(a=>resolvedAttack(a)):[];
      return {...selected,traceLevel:state.traceLevels[selected.traceKey],multiplier:sequenceAttacks[0]?.multiplier,traceLevelLabel:(selected.id==='1405011'?'通常Lv'+state.traceLevels.normal+'＋':'')+'スキルLv'+state.traceLevels.skill+'＋天賦Lv'+state.traceLevels.talent,attackType:selected.type,sequenceAttacks};
    }
    if (selected.damageFormula === "nativeBreakSequence") return {...selected,traceLevel:state.traceLevels[selected.traceKey],multiplier:selected.multipliers[state.traceLevels[selected.traceKey]-1],nativeUltimateLevel:state.traceLevels.ultimate,attackType:selected.type};
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
    const context = structuredModifierContext();
    return structuredSourceConditions().filter((item) => item.enabled && item.calculable && item.supplementalAttack && state.characterId!=="1202").map((item) => {
      const source = item.sourceMeta || {};
      const level = source.skillId ? num(context.traceLevelFor(source), 10) : 1;
      const reference=window.HsrModifierRuntime.supplementalReference(item,context,state.modifierInputs);
      const resKey="enemy-resistance:"+item.supplementalAttack.element, cross=item.supplementalAttack.element!==character()?.element;
      if(cross && !Number.isFinite(state.modifierInputs[resKey])) { reference.supported=false; reference.reason=(reference.reason?reference.reason+" ":"")+"敵の"+(ELEMENT_KEYS[item.supplementalAttack.element]||item.supplementalAttack.element)+"属性耐性を入力してください。補正なしは0です。"; }
      const sourceName=find("characters",reference.sourceCharacterId)?.name||reference.sourceCharacterId;
      const ownerName=character()?.name||state.characterId;
      const triggerName=find("characters",reference.triggerCharacterId)?.name||reference.triggerCharacterId;
      return {
        referenceStats:reference.stats,referenceEnemy:cross?{...state.enemy,resistance:state.modifierInputs[resKey],resistances:{[item.supplementalAttack.element]:state.modifierInputs[resKey]}}:undefined,referenceRoles:reference,referenceIssue:reference.supported?"":reference.reason,referenceCondition:{...item,valueInput:{key:reference.inputKey,shared:true}},
        calculationNote:`発生元：${sourceName}。数値参照：${ownerName}の最終ATK・会心・${ELEMENT_KEYS[item.supplementalAttack.element]||item.supplementalAttack.element}属性与ダメージ。発動：${triggerName}の攻撃後。軌跡Lvは${sourceName}を参照します。元攻撃とは別の1回分で、自動合算しません。`,
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
        traceLevelLabel: source.skillId ? `Lv${level}` : ""
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
    const values = result.attack.canCrit ? [["非会心", result.nonCrit], ["会心", result.crit], ["期待値", result.expected]] : [[result.breakdown.damageFormula === "trueDamage" ? "追加確定ダメージ" : "ダメージ", result.nonCrit]];
    return `<div class="hsr-attack-result-values${result.attack.canCrit ? "" : " hsr-attack-result-values--single"}">${values.map(([label, value]) => `<div><span>${label}（${result.breakdown.damageFormula === "trueDamage" ? "1回分" : "合計"}）</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
  }

  const detailNumber = (value) => Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 6 });
  const SCALING_LABELS = { atk: "攻撃力", hp: "HP", def: "防御力", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度" };

  function damageBreakdown(result, targetLabel) {
    const b = result.breakdown;
    if (b.damageFormula === "componentSequence") {
      const componentNames = b.componentNames || [];
      const componentDetails = Object.entries(result.components || {}).map(([key, component], index) => `<h4>${esc(componentNames[index] || component.componentName || key)}</h4>${damageBreakdown(component, "同一対象・各成分")}`).join("");
      return `<section class="hsr-target-breakdown"><h4>構成成分と合計</h4><p class="hsr-formula-note">${esc(b.condition || "各成分を個別計算し、同一対象の結果を合算します。")}</p>${componentDetails}<h4>${esc(b.totalLabel || "スキル本体＋追加攻撃の合計")}</h4>${damageValues(result)}</section>`;
    }
    if (b.damageFormula === "normalAndBreak") {
      const extra = result.components.break;
      return `<section class="hsr-target-breakdown"><h4>通常部分と天賦撃破の合計</h4>${damageBreakdown(result.components.direct, "通常部分（全段合算）")}<h4>天賦・物理撃破ダメージ</h4><dl>${[["ポケットアドバンテージ",b.stacks],["物理撃破に対する天賦倍率（%）",b.breakMultiplierPercent],["撃破基礎値",extra.base],["属性・天賦倍率",extra.multiplier],["撃破特効倍率",extra.effect],["防御倍率",extra.defense],["耐性倍率",extra.resistance],["最大靭性倍率",extra.toughnessScale],["被ダメージ倍率",extra.vulnerability],["天賦撃破ダメージ",extra.value]].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${detailNumber(value)}</dd></div>`).join("")}</dl><p class="hsr-formula-note">天賦撃破は会心しません。元の撃破イベント・撃破DoT・超撃破は合算しません。</p><h4>通常部分＋天賦撃破</h4>${damageValues(result)}</section>`;
    }

    if (b.damageFormula === "breakComponent") return '<section class="hsr-target-breakdown"><h4>本人の超撃破・会心不可</h4><dl>'+[['最終戦闘撃破特効（%）',b.finalBreakEffect],['発生倍率',b.conversionMultiplier],['基礎削靭（通常攻撃10の単位）',b.toughnessDamage],['撃破効率倍率',b.breakEfficiency],['有効削靭',b.effectiveToughnessDamage],['防御倍率',b.defense],['耐性倍率',b.resistance],['被ダメージ倍率',b.vulnerability],['超撃破ダメージ',b.value]].map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd>'+detailNumber(v)+'</dd></div>').join('')+'</dl>'+damageValues(result)+'</section>';
    if (b.damageFormula === "trueDamage") return `<section class="hsr-target-breakdown"><h4>敵1体・追加確定ダメージ1回分</h4><dl><div><dt>参照元ダメージ（補正適用後）</dt><dd>${detailNumber(b.originalDamage)}</dd></div><div><dt>確定ダメージ倍率</dt><dd>${detailNumber(b.multiplierPercent)}%</dd></div><div><dt>追加確定ダメージ</dt><dd>${detailNumber(result.nonCrit)}</dd></div><div><dt>適用条件</dt><dd>${esc(b.condition)}</dd></div></dl><p>元ダメージ × 確定ダメージ倍率。会心・防御・耐性・与ダメージ・靭性等は再適用しません。元ダメージとの合算は行いません。</p>${damageValues(result)}</section>`;
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
        + row("愉悦度", `${detailNumber(b.elationPercent)}%／×${detailNumber(b.elationMultiplier)}`)
        + (b.minimumCertifiedBanger ? row("入力した褒美／必殺技の参照下限", `${detailNumber(b.inputCertifiedBanger)}／${detailNumber(b.minimumCertifiedBanger)}`) : "")
        + row(b.punchlineSource === "certifiedBanger" ? "爆笑の褒美（攻撃時点）" : b.punchlineSource === "fixedTalent" ? "爆笑ネタ（天賦固定値）" : "爆笑ネタ（攻撃時点）", `${detailNumber(b.punchline)}／×${detailNumber(b.punchlineMultiplier)}`)
        + (Number.isFinite(b.fervor) ? row("消費熱気（追加ヒット数）", detailNumber(b.fervor)) : "")
        + row("上笑", `${detailNumber(b.merrymakePercent)}%／×${detailNumber(b.merrymakeMultiplier)}`)
      : b.damageFormula === "enemyHpCappedByAtk"
      ? row("敵HP参照・攻撃力上限適用後", detailNumber(b.cappedEnemyHpDamage)) + row("敵HP割合／攻撃力上限", `${detailNumber(b.enemyHpPercent)}%／${detailNumber(b.atkCapPercent)}%`) + row("攻撃倍率", `${detailNumber(b.multiplierPercent)}%`)
      : b.scalingTerms.map((term) => row(`${b.actorKind === "memosprite" ? "精霊の最終" : ""}${SCALING_LABELS[term.stat] || term.stat}参照 × 攻撃倍率`, `${detailNumber(term.referenceValue)} × ${detailNumber(term.multiplierPercent)}%`)).join("");
    const hits = result.attack.hitCount;
    const aggregated = result.attack.hitCountLabel === "全段合算";
    const hitFactors = b.vulnerabilityFactors.length && b.vulnerabilityFactors.every((value) => value === b.vulnerabilityFactors[0])
      ? `<dl class="hsr-hit-factors">${row(aggregated ? "被ダメージ倍率（全段共通）" : "被ダメージ倍率（各ヒット）", `×${detailNumber(b.vulnerabilityFactors[0])}`)}</dl>`
      : `<details class="hsr-hit-factors"><summary>被ダメージ倍率（ヒット順）</summary><p>${b.vulnerabilityFactors.map((value) => `×${detailNumber(value)}`).join(" → ") || "ヒットなし"}</p></details>`;
    return `<section class="hsr-target-breakdown"><h4>${esc(targetLabel)}</h4>${components ? `<p class="hsr-formula-note">${esc(b.elationScopeNote || "初回の通常アッハタイム・敵1体への全6ヒット。全体攻撃1回と追撃5回を合算します。")}</p>` : isElation ? '<p class="hsr-formula-note">'+esc(b.elationScopeNote || 'アッハタイム中・敵1体あたりの1回分です。爆笑の褒美への変換や全敵の合計は計算しません。')+'</p>' : ""}<dl>${scaling}${b.flatDamage ? row("固定加算", detailNumber(b.flatDamage)) : ""}
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

  function excludedConditions() {
    const items = allConditions().filter((item) => item.displayOnly && !isAttackSelectionCondition(item));
    const included = items.filter((item) => item.inputPolicy === "includedInFinalStats");
    const unsupported = items.filter((item) => item.inputPolicy !== "includedInFinalStats");
    const group = (title, entries, includedInStats) => entries.length ? `<h4>${title}</h4><ul>${entries.map((item) => `<li><strong>${esc(item.name)}</strong>：${includedInStats ? "最終ステータスに含めて入力する効果です。装備選択による自動加算は行わず、計算時にも再加算しません。" : esc(item.reason || "計算データ未対応のため、計算には含めません。")}</li>`).join("")}</ul>` : "";
    return items.length ? `<details class="hsr-excluded-conditions"><summary>計算に追加しない補正（${items.length}件）</summary>${group("最終入力で管理する効果・再加算なし", included, true)}${group("データ未対応・表示のみ（計算対象外）", unsupported, false)}</details>` : "";
  }

  function publicAttackNote(attack) {
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
  const JOINT_ATTACK_SKILLS = new Set(["140208", "140709", "800708", "800808"]);
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
      if (result.components) { Object.values(result.components).forEach(audit); return; }
      (result.applied || []).forEach(item => conditionAudit.applied.add(item.id));
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
    $("hsrResults").innerHTML = `<div class="genshin-result-tabs" role="tablist" aria-label="攻撃種別">${visibleGroups.map((group) => `<button type="button" class="genshin-result-tab${group.id === active ? " is-active" : ""}" role="tab" id="hsr-result-tab-${group.id}" aria-controls="hsr-result-panel-${group.id}" data-result-tab="${group.id}" aria-selected="${group.id === active}" tabindex="${group.id === active ? "0" : "-1"}">${group.label}${pending[group.id].some(row => row.includes("data-hsr-pending-input")) ? `<small>入力確認 ${pending[group.id].length}</small>` : ""}</button>`).join("")}</div>${visibleGroups.map((group) => `<section class="genshin-json-result-section" role="tabpanel" id="hsr-result-panel-${group.id}" aria-labelledby="hsr-result-tab-${group.id}" data-result-panel="${group.id}"${group.id === active ? "" : " hidden"}>${groups[group.id].length ? table(groups[group.id],group.label) : pending[group.id].length ? "" : '<p class="genshin-help">この種別に計算できる攻撃はありません。</p>'}${pending[group.id].join("")}${unsupported[group.id].length ? `<details class="hsr-unavailable-results"><summary>計算不可の攻撃・条件（${unsupported[group.id].length}件）</summary>${unsupported[group.id].join("")}</details>` : ""}</section>`).join("")}${excludedConditions()}<p class="hsr-support-note">表示値は丸めています。多段攻撃はヒット合計です。対応条件は各攻撃の詳細で確認できます。</p>`;
  }

  function renderAttackPreview() {
    if (!character()) return;
    renderResults([], null, [], availableAttacks().flatMap(attack => attackSupport(attack).status === "displayOnly" ? [attack]
      : resolvedAttackComparisons(attack).map(variant => ({ ...variant, preview: true, inputIssues: ["ステータスを入力し、「ダメージ計算」で比較できます。"] }))));
    conditionAudit = null;
    updateConditionSummary();
  }

  function attackElationInputs(attack) {
    if (attack.elationContext === "certifiedBanger") return {...state.elationInputs,context:"certifiedBanger",certifiedBanger:state.modifierInputs[attack.certifiedBangerInputKey || "elation-certified-banger"]};
    if (attack.id === "151321") return { ...state.elationInputs, context: "fervorEnhancedAha", stableEnemy: true, hasOtherElation: true };
    if (attack.id === "151320") return { ...state.elationInputs, context: "fervor10Auto", stableEnemy: true };
    return state.elationInputs;
  }

  function modifierInputIssues(attack, baseStats) {
    return modifiers(attack).filter(item => item.enabled && item.matchesAttack).flatMap(item => {
      const issues = [...(item.inputWarnings || [])];
      if (["hp", "atk", "def"].includes(item.valueInput?.providerStat) && !(Number.isFinite(item.valueInput.value) && item.valueInput.value > 0)) issues.push(`${item.valueInput.label}に、発動者の最終値（0より大きい数値）を入力してください。`);
      const baseStat = item.category === "statPercent" ? item.stat : item.requiredBaseStat;
      if (baseStat && !(Number.isFinite(baseStats[baseStat]) && baseStats[baseStat] > 0)) issues.push(`必要な基礎${{hp:"HP",atk:"攻撃力",def:"防御力",speed:"速度"}[baseStat] || baseStat}を取得できません。キャラ・光円錐のLv80基礎値が必要です。この補正を外すか、レベル・装備を確認してください。`);
      return [...new Set(issues)].map(message => {
        modifierIssueIds.add(item.id);
        const target = "modifier:" + item.id;
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
      const warnings = attacks.flatMap(attack => window.HsrCalcEngine.trueDamageInputWarnings({ character: { eidolon: state.eidolon }, attack, trueDamage: state.trueDamageInputs }));
      warnings.forEach(message => fields.set(message.includes("元ダメージ") ? "hsrOriginalDamage" : "hsrTrueDamageActive", message));
      return warnings;
    }
    const warnings = new Set();
    const labels = { hp: "HP", atk: "攻撃力", def: "防御力", speed: "速度", critRate: "会心率", critDamage: "会心ダメージ", damageBonus: "属性ダメージ", breakEffect: "撃破特効", effectHitRate: "効果命中", effectRes: "効果抵抗", energyRegen: "EP回復効率", hpPercent: "現在HP割合", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度" };
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
      if (attackScopes.some(scope => scope.damageFormula === "elation")) requiredBonuses.add("elation"); else if (!attack.referenceStats) requiredBonuses.add("damageBonus");
      if (attackScopes.some(scope => ["normalAndBreak","nativeBreakSequence"].includes(scope.damageFormula))) requiredBonuses.add("breakEffect");
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
      if (attack.damageFormula === "elation") window.HsrCalcEngine.elationInputWarnings({ character: { level: state.level, eidolon: state.eidolon, stats: state.stats }, attack, enemy: state.enemy, elation: attackElationInputs(attack) }).forEach(warning => {
        const field = warning.includes("爆笑の褒美") ? "hsrConditionDialogOpen" : warning.includes("消費する熱気") ? "hsrFervor" : warning.includes("爆笑ネタに") ? "hsrPunchline" : warning.includes("上笑に") ? "hsrMerrymake" : "hsrElationSettings";
        fieldWarning(warning, field);
      });
      const scopes = attack.sequenceAttacks?.length ? attack.sequenceAttacks : ["normalAndBreak","nativeBreakSequence"].includes(attack.damageFormula) ? [attack, {...attack,type:attack.damageFormula === "nativeBreakSequence" ? "superBreak" : "break",attackType:attack.damageFormula === "nativeBreakSequence" ? "superBreak" : "break"}] : [attack];
      if (!attack.referenceCharacter) scopes.forEach(scope => {
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
    const baseRequest = { character: {...snapshots.character,baseStats}, enemy: snapshots.enemy, elation: state.elationInputs, trueDamage: state.trueDamageInputs };
    let results = attacks.map((selected) => {
      const attackEnemy=selected.requiredWeaknessCount?{...baseRequest.enemy,weakness:true,weaknessCount:selected.requiredWeaknessCount}:baseRequest.enemy;
      const request = { ...baseRequest, modifierInputs:state.modifierInputs, character:selected.referenceCharacter || (selected.referenceStats ? {...baseRequest.character,stats:selected.referenceStats}:baseRequest.character), enemy:selected.referenceEnemy || attackEnemy, songbird: songbirdSnapshot(), elation: attackElationInputs(selected), attack: selected, modifiers: modifiers(selected), breakModifiers: selected.damageFormula === "nativeBreakSequence" ? modifiers({...selected,type:"superBreak",attackType:"superBreak"}) : selected.damageFormula === "normalAndBreak" ? modifiers({...selected,type:"break",attackType:"break"}) : undefined, breakBaseDamage: state.data.breakBaseDamage };
      if (selected.damageFormula === "componentSequence") request.sequenceComponents = (selected.sequenceAttacks || []).map((component, index) => ({ key: selected.damageComponents[index].key, name: selected.damageComponents[index].name, input: { ...baseRequest, enemy:attackEnemy, modifierInputs:state.modifierInputs, attack: component, modifiers: modifiers(component), songbird: songbirdSnapshot(), elation: attackElationInputs(component), breakBaseDamage: state.data.breakBaseDamage } }));
      if (selected.sequenceTemplates) request.attack = {...request.attack, damageComponents:selected.sequenceTemplates};
      const result = window.HsrCalcEngine.calculate(request);
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
