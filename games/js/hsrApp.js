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

  const DEFAULT_STATS = { hp: 0, hpPercent: 100, atk: 0, def: 0, speed: 100, critRate: 5, critDamage: 50, breakEffect: 0, effectHitRate: 0, effectRes: 0, energyRegen: 100, damageBonus: 0, dotBaseDamage: 0, elation: 0 };

  const state = {
    data: null,
    characterId: "", coneId: "", relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "",
    level: 80, eidolon: 0, enhancementState: "enhanced", coneLevel: 80, coneRank: 1, partySp: 3, traceLevels: { normal: 6, skill: 10, ultimate: 10, talent: 10, elation: 10 }, source: "manual",
    stats: { ...DEFAULT_STATS },
    trueDamageInputs: { active: false, sourceKind: "", originalDamage: NaN },
    elationInputs: { context: "ahaInstant", punchline: NaN, merrymake: 0 },
    party: Array.from({ length: 3 }, () => ({ characterId: "", eidolon: 0, level: 10, atk: 0, critDamage: 50, breakEffect: 0, lightConeId: "", coneRank: 1, relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "" })),
    enemyId: "3001020",
    enemy: { level: 80, maxHp: 100000, resistance: 20, weakness: false, toughnessActive: true, maxToughness: 30, hpPercent: 100, count: 1, debuffCount: 0, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
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
    $(id).innerHTML = (!Number.isFinite(selected) ? '<option value="" selected>未取得・要入力</option>' : "") + Array.from({ length: end - start + 1 }, (_, index) => start + index)
      .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${esc(label(value))}</option>`).join("");
  }

  function renderStaticInputs() {
    fillRange("hsrEidolon", 0, 6, state.eidolon, (value) => String(value));
    fillRange("hsrConeRank", 1, 5, state.coneRank, (value) => String(value));
    fillRange("hsrNormalTrace", 1, 10, state.traceLevels.normal, (value) => `通常 Lv${value}`);
    fillRange("hsrSkillTrace", 1, 15, state.traceLevels.skill, (value) => `スキル Lv${value}`);
    fillRange("hsrUltimateTrace", 1, 15, state.traceLevels.ultimate, (value) => `必殺技 Lv${value}`);
    fillRange("hsrTalentTrace", 1, 15, state.traceLevels.talent, (value) => `天賦 Lv${value}`);
    fillRange("hsrElationTrace", 1, 10, state.traceLevels.elation, (value) => `愉悦 Lv${value}`);
    $("hsrEnemySelect").innerHTML = state.data.enemies.map((item) => `<option value="${item.id}">${esc(item.name)}</option>`).join("") + '<option value="custom">カスタム</option>';
  }

  function renderBuild() {
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
    $("hsrTrueDamageSettings").hidden = char?.id !== "1415";
    $("hsrElationSettings").hidden = char?.id !== "1505";
    $("hsrEnhancementField").hidden = !["1004", "1005", "1006", "1102", "1205"].includes(char?.id);
    $("hsrEnhancementState").value = state.enhancementState;
    $("hsrDotBaseDamageField").hidden = char?.id !== "1005";
    $("hsrDamageBonusIcon").src = elementIcon(char?.element || "Physical");
    $("hsrInputProvenance").textContent = state.source === "api" ? "UID取得値（編集可能）" : state.source === "api-edited" ? "UID取得値を手動変更" : "手動入力値";
    $("hsrResultBuildSummary").textContent = char ? `${char.name} / ${lightCone?.name || "光円錐未選択"}` : "未選択";
    renderAttacks(); renderPartySummary();
  }

  function writeStats() {
    Object.entries(state.stats).forEach(([key, value]) => { const input = $("hsrStat-" + key); if (input) input.value = value === null || !Number.isFinite(Number(value)) ? "" : String(state.source === "api" ? Number(value) : Math.round(Number(value) * 1000) / 1000); });
    $("hsrLevel").value = state.level; $("hsrConeLevel").value = state.coneLevel; renderActionValue();
  }

  function collectInputs() {
    document.querySelectorAll("[data-stat]").forEach((input) => { state.stats[input.dataset.stat] = input.value.trim() === "" ? NaN : Number(input.value); });
    state.level = Number($("hsrLevel").value); state.eidolon = num($("hsrEidolon").value); state.enhancementState = $("hsrEnhancementState")?.value || "enhanced"; state.coneLevel = Number($("hsrConeLevel").value); state.coneRank = num($("hsrConeRank").value, 1); state.partySp = Math.min(7, Math.max(0, Math.floor(num($("hsrPartySp")?.value, 3)))); state.traceLevels = { normal: Number($("hsrNormalTrace").value), skill: Number($("hsrSkillTrace").value), ultimate: Number($("hsrUltimateTrace").value), talent: Number($("hsrTalentTrace").value) };
    state.traceLevels.elation = Number($("hsrElationTrace").value);
    state.trueDamageInputs = { active: state.characterId === "1415" && $("hsrTrueDamageActive").value === "true", sourceKind: $("hsrTrueDamageSourceKind").value, originalDamage: $("hsrOriginalDamage").value.trim() === "" ? NaN : Number($("hsrOriginalDamage").value) };
    if (state.trueDamageInputs.active) state.traceLevels.skill = Number($("hsrSkillTrace").value);
    state.elationInputs = { context: "ahaInstant", punchline: $("hsrPunchline").value.trim() === "" ? NaN : Number($("hsrPunchline").value), merrymake: $("hsrMerrymake").value.trim() === "" ? NaN : Number($("hsrMerrymake").value) };
    state.enemy = { level: num($("hsrEnemyLevel").value, 80), maxHp: Math.max(0, num($("hsrEnemyMaxHp").value, 100000)), resistance: num($("hsrEnemyResistance").value), weakness: $("hsrWeakness").value === "true",
      toughnessActive: $("hsrToughnessState").value === "active", maxToughness: num($("hsrMaxToughness").value, 30), hpPercent: Math.min(100, Math.max(0, num($("hsrEnemyHpPercent").value, 100))), count: Math.min(5, Math.max(1, Math.floor(num($("hsrEnemyCount").value, 1)))), debuffCount: Math.max(0, num($("hsrEnemyDebuffCount").value)), defenseReduction: num($("hsrEnemyDefenseReduction").value),
      defenseIgnore: num($("hsrEnemyDefenseIgnore").value), resistancePenetration: num($("hsrEnemyResistancePenetration").value), takenDamage: num($("hsrEnemyTakenDamage").value) };
  }

  function availableAttacks() {
    return state.data.attacks.filter((item) => item.characterId === state.characterId
      && !item.hidden
      && (item.id === "1415021" ? state.trueDamageInputs.active : !state.trueDamageInputs.active)
      && (!item.requiredEidolon || state.eidolon >= item.requiredEidolon)
      && (item.maximumEidolon === undefined || state.eidolon <= item.maximumEidolon)
      && (item.hpPercentMaximum === undefined || state.stats.hpPercent <= item.hpPercentMaximum)
      && (item.enemyHpPercentMaximum === undefined || state.enemy.hpPercent <= item.enemyHpPercentMaximum)
      && (item.enemyDebuffMinimum === undefined || state.enemy.debuffCount >= item.enemyDebuffMinimum)
      && (!item.modifierInputKey || num(state.modifierInputs[item.modifierInputKey], item.modifierInputDefault || 0) >= num(item.modifierInputMinimum, 0))
      && (!Array.isArray(item.modifierConditions) || item.modifierConditions.every((condition) => num(state.modifierInputs[condition.inputKey], condition.default || 0) >= num(condition.minimum, 1)))
      && (item.enemyCountExact === undefined || state.enemy.count === item.enemyCountExact)
      && (item.enemyCountMinimum === undefined || state.enemy.count >= item.enemyCountMinimum)
      && (!item.variant || item.variant === state.enhancementState));
  }

  function renderAttacks() {
    const attacks = availableAttacks();
    $("hsrResultAttackSummary").textContent = `${enemyPreset()?.name || "カスタム敵"} / ${attacks.length ? `${attacks.length}攻撃` : "攻撃データ未選択"}`;
  }

  function selectionItems(type) {
    if (type === "character" || type === "party") return state.data.characters.filter((item) => type !== "party" || (item.id !== state.characterId && !state.party.some((member, index) => index !== state.partySlot && member.characterId === item.id)));
    if (type === "cone") return state.data.lightCones.filter((item) => !character() || item.path === character().path);
    if (type === "relic" || type === "relicSecond") return state.data.relicSets.filter((item) => item.type === "relic");
    if (type === "ornament") return state.data.relicSets.filter((item) => item.type === "ornament");
    if (type === "enemy") return state.data.enemies;
    return [];
  }

  function currentSelectionId() {
    if (state.selectionType === "character") return state.characterId;
    if (state.selectionType === "party") return state.party[state.partySlot]?.characterId || "";
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
    $("hsrSelectionList").innerHTML = clearCard + cards || `<p class="genshin-selection-empty">${hasFilters ? "条件に一致する候補がありません。フィルターを切り替えてください。" : "名前に一致する候補がありません。検索内容を確認してください。"}</p>`;
    const selectedCharacter = character();
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

  function chooseSelection(id) {
    const type = state.selectionType;
    if (type === "party") {
      const member = state.party[state.partySlot]; member.characterId = id; member.eidolon = 0; member.level = 10; member.atk = 0; member.critDamage = 50; member.breakEffect = 0; member.lightConeId = ""; member.coneRank = 1; member.relicId = ""; member.relicSecondId = ""; member.relicMode = "4pc"; member.ornamentId = ""; renderPartyDialog();
    } else if (type === "enemy") {
      applyEnemy(id);
    } else {
      state[type + "Id"] = id;
      if (type === "character") state.coneId = "";
      if (["character", "cone", "relic", "relicSecond", "ornament"].includes(type) && state.source === "api") state.source = "api-edited";
      renderBuild();
    }
    closeDialog($("hsrSelectionDialog")); markDirty();
  }

  function renderPartyDialog() {
    const optionList = (items, selected, emptyLabel) => `<option value="">${esc(emptyLabel)}</option>${items.map((entry) => `<option value="${esc(entry.id)}"${String(selected) === String(entry.id) ? " selected" : ""}>${esc(entry.name)}</option>`).join("")}`;
    const relicSets = state.data.relicSets.filter((entry) => entry.type === "relic");
    const ornaments = state.data.relicSets.filter((entry) => entry.type === "ornament");
    $("hsrPartyRows").innerHTML = state.party.map((member, index) => {
      const item = find("characters", member.characterId);
      const cones = item ? state.data.lightCones.filter((entry) => entry.path === item.path) : [];
      return `<section class="genshin-party-member"><div class="genshin-party-member-head"><h3>メンバー${index + 2}</h3><button type="button" class="genshin-party-clear" data-party-clear="${index}"${item ? "" : " disabled"}>解除</button></div><div class="genshin-party-equipment-row hsr-party-equipment-row"><button type="button" class="genshin-party-pick" data-party-select="${index}" aria-haspopup="dialog" aria-controls="hsrSelectionDialog"><img src="${esc(imageUrl(item?.image))}" alt="" width="56" height="56" loading="lazy"><span><small>キャラクター</small><strong>${esc(item?.name || "選択する")}</strong></span></button></div><div class="genshin-party-basic-fields hsr-party-fields"><label><span>星魂</span><select data-party-field="eidolon" data-slot="${index}"${item ? "" : " disabled"}>${Array.from({ length: 7 }, (_, rank) => `<option value="${rank}"${num(member.eidolon) === rank ? " selected" : ""}>${rank}</option>`).join("")}</select></label><label><span>軌跡Lv</span><input type="number" min="1" max="15" data-party-field="level" data-slot="${index}" value="${member.level}"${item ? "" : " disabled"}></label><label><span>攻撃力</span><input type="number" min="0" max="99999" step="1" data-party-field="atk" data-slot="${index}" value="${num(member.atk)}"${item ? "" : " disabled"}></label><label><span>会心ダメージ</span><span class="genshin-condition-input-unit"><input type="number" min="0" max="500" step="0.1" data-party-field="critDamage" data-slot="${index}" value="${num(member.critDamage, 50)}"${item ? "" : " disabled"}><em>%</em></span></label><label><span>撃破特効</span><span class="genshin-condition-input-unit"><input type="number" min="0" max="500" step="0.1" data-party-field="breakEffect" data-slot="${index}" value="${num(member.breakEffect)}"${item ? "" : " disabled"}><em>%</em></span></label><label><span>光円錐</span><select data-party-field="lightConeId" data-slot="${index}"${item ? "" : " disabled"}>${optionList(cones, member.lightConeId, "選択しない")}</select></label><label><span>重畳</span><select data-party-field="coneRank" data-slot="${index}"${item && member.lightConeId ? "" : " disabled"}>${Array.from({ length: 5 }, (_, rank) => `<option value="${rank + 1}"${num(member.coneRank, 1) === rank + 1 ? " selected" : ""}>${rank + 1}</option>`).join("")}</select></label><label><span>遺物構成</span><select data-party-field="relicMode" data-slot="${index}"${item ? "" : " disabled"}><option value="4pc"${member.relicMode === "4pc" ? " selected" : ""}>4セット</option><option value="2+2"${member.relicMode === "2+2" ? " selected" : ""}>2セット＋2セット</option></select></label><label><span>遺物</span><select data-party-field="relicId" data-slot="${index}"${item ? "" : " disabled"}>${optionList(relicSets, member.relicId, "選択しない")}</select></label><label${member.relicMode === "2+2" ? "" : " hidden"}><span>2つ目の遺物</span><select data-party-field="relicSecondId" data-slot="${index}"${item ? "" : " disabled"}>${optionList(relicSets, member.relicSecondId, "選択しない")}</select></label><label><span>オーナメント</span><select data-party-field="ornamentId" data-slot="${index}"${item ? "" : " disabled"}>${optionList(ornaments, member.ornamentId, "選択しない")}</select></label></div><p class="genshin-party-base-summary">${item ? "支援効果が参照する本人ステータスと、味方へ作用する装備・軌跡・星魂を設定します。" : "キャラクターを選択してください。"}</p></section>`;
    }).join("");
    $("hsrPartyRows").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  function collectParty() {
    $("hsrPartyRows").querySelectorAll("[data-party-field]").forEach((input) => {
      const member = state.party[num(input.dataset.slot)]; const field = input.dataset.partyField;
      member[field] = input.type === "checkbox" ? input.checked : field === "value" ? num(input.value) : input.value;
    });
    state.party.forEach((member) => { member.level = num(member.level, 10); member.eidolon = num(member.eidolon, 0); member.coneRank = num(member.coneRank, 1); member.atk = num(member.atk); member.critDamage = num(member.critDamage, 50); member.breakEffect = num(member.breakEffect); });
    renderPartyDialog();
    renderPartySummary(); updateConditionSummary(); markDirty();
  }

  function renderPartySummary() {
    const names = state.party.map((member) => find("characters", member.characterId)?.name).filter(Boolean);
    $("hsrPartySummary").textContent = names.length ? names.join("、") : "サポートメンバーは未設定です。";
  }

  const CONDITION_TAB_ORDER = ["パーティ", "光円錐", "遺物・オーナメント", "軌跡", "その他"];
  const CONDITION_TAB_META = {
    "パーティ": { title: "パーティ補正", source: "PARTY", subtitle: "味方から受ける効果と現在の反映を確認" },
    "光円錐": { title: "光円錐補正", source: "LIGHT CONE", subtitle: "装備中の光円錐効果と現在の反映を確認" },
    "遺物・オーナメント": { title: "遺物・オーナメント補正", source: "RELIC", subtitle: "セット効果の発動条件と現在の反映を確認" },
    "軌跡": { title: "軌跡・星魂補正", source: "TRACE", subtitle: "発動条件と現在の反映を確認" },
    "その他": { title: "その他の補正", source: "OTHER", subtitle: "敵条件と手動補正を確認" }
  };

  function selectedBaseStats() {
    const selectedCharacter = character(); const selectedCone = cone();
    if (!selectedCharacter || state.level !== 80 || (selectedCone && state.coneLevel !== 80)) return {};
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
      return num(member?.level, 10);
    };
    return {
      characterId: state.characterId,
      eidolon: state.eidolon,
      lightConeId: state.coneId,
      refinement: state.coneRank,
      relicIds: [state.relicId, state.relicMode === "2+2" ? state.relicSecondId : ""].filter(Boolean),
      relicMode: state.relicMode === "4pc" ? 4 : 2,
      ornamentId: state.ornamentId,
      enhancementState: state.enhancementState,
      partyIds,
      partyEidolons: Object.fromEntries(state.party.filter((member) => member.characterId).map((member) => [String(member.characterId), num(member.eidolon, 0)])),
      partyStats: Object.fromEntries(state.party.filter((member) => member.characterId).map((member) => [String(member.characterId), { atk: num(member.atk), critDamage: num(member.critDamage, 50), breakEffect: num(member.breakEffect) }])),
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

  function structuredSourceConditions() {
    if (!window.HsrModifierRuntime) return [];
    return window.HsrModifierRuntime.buildCandidates(state.data?.structuredModifiers || [], structuredModifierContext(), state.modifierInputs)
      .map((item) => ({
        ...item,
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
      }));
  }

  function sourceConditions() {
    return structuredSourceConditions();
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
    return item.displayOnly && item.inputPolicy !== "includedInFinalStats" && item.activation?.mode === "toggle" && Boolean(item.activation.inputKey)
      && (state.data?.attacks || []).some((attack) => attack.characterId === state.characterId && !attack.hidden
        && attack.support?.status !== "displayOnly" && attack.modifierInputKey === item.activation.inputKey);
  }

  function conditionStatus(items) {
    if (items.some(isAttackSelectionCondition)) return items.some((item) => isAttackSelectionCondition(item) && item.activation.active) ? { label: "計算対象", className: "is-auto" } : { label: "対象外", className: "is-inactive" };
    if (items.every((item) => item.displayOnly)) return items.some((item) => item.inputPolicy === "includedInFinalStats") ? { label: "反映済み", className: "is-reflected" } : { label: "表示のみ", className: "is-display" };
    if (items.some((item) => item.enabled)) return items.every((item) => item.automatic || !item.enabled) ? { label: "自動反映", className: "is-auto" } : { label: "適用中", className: "is-auto" };
    if (items.some((item) => item.activation?.mode === "toggleThreshold")) return items.some((item) => item.activation?.toggled) ? { label: "条件未達", className: "is-inactive" } : { label: "条件OFF", className: "is-inactive" };
    if (items.some((item) => ["statThreshold", "numericThreshold"].includes(item.activation?.mode))) return { label: "条件未達", className: "is-inactive" };
    if (items.some((item) => ["toggle", "stack"].includes(item.activation?.mode))) return { label: "条件OFF", className: "is-inactive" };
    return { label: "条件を設定", className: "is-input" };
  }

  function conditionRequirement(item) {
    const activation = item.activation || {};
    if (!["statThreshold", "numericThreshold", "toggleThreshold"].includes(activation.mode)) return item.conditionText || "常時";
    if (activation.mode === "numericThreshold" && activation.inputKey) {
      return `${item.conditionText || "入力条件"}（現在値：${num(activation.inputValue)}${item.unit === "percent" ? "%" : ""}）`;
    }
    const reference = {
      "self.hp": ["HP", ""], "self.hpPercent": ["HP割合", "%"], "self.epPercent": ["EP割合", "%"], "self.speed": ["速度", ""],
      "self.atk": ["攻撃力", ""], "self.def": ["防御力", ""], "self.critRate": ["会心率", "%"], "self.critDamage": ["会心ダメージ", "%"], "self.effectHitRate": ["効果命中", "%"],
      "self.effectRes": ["効果抵抗", "%"], "self.breakEffect": ["撃破特効", "%"], "self.elation": ["愉悦度", "%"],
      "enemy.hpPercent": ["敵のHP割合", "%"], "enemy.weakness": ["属性弱点", ""], "enemy.debuffCount": ["敵のデバフ数", ""], "enemy.count": ["敵数", ""], "enemy.toughnessRemaining": ["敵の残り靭性", ""], "party.count": ["パーティ人数", ""], "party.sp": ["SP", ""]
    }[activation.reference] || ["現在値", ""];
    return `${item.conditionText || "自動判定条件"}（現在の${reference[0]} ${num(activation.inputValue)}${reference[1]}）`;
  }

  function currentConditionReflection(item) {
    if (isAttackSelectionCondition(item)) return item.activation.active ? "独立した攻撃結果を表示" : "独立した攻撃は計算対象外";
    if (item.inputPolicy === "includedInFinalStats") return "入力欄のステータスへ反映済み";
    if (item.displayOnly) return "未適用（表示のみ）";
    if (!item.enabled && ["statThreshold", "numericThreshold"].includes(item.activation?.mode)) return item.unit === "percent" ? "0%（条件未達）" : "未適用（条件未達）";
    if (!item.enabled && item.activation?.mode === "toggleThreshold") return item.unit === "percent" ? "0%（条件未達）" : "未適用（条件未達）";
    if (!item.enabled) return item.unit === "percent" || !item.structured ? "0%" : "未適用";
    return item.effectLabel || `${item.value}${item.unit === "percent" || !item.structured ? "%" : ""}`;
  }

  function renderConditionControls(items) {
    const rendered = new Set(); const controls = [];
    items.forEach((item) => {
      const attackSelection = isAttackSelectionCondition(item);
      if (item.displayOnly && !attackSelection) return;
      if (!item.structured && !rendered.has(`manual:${item.id}`)) {
        rendered.add(`manual:${item.id}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-condition-enabled="${esc(item.id)}"${item.enabled ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>この条件を適用する</strong><small>入力した補正を計算へ加える場合だけONにしてください。</small></span></label><label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>効果量</strong><small>${esc(item.description)}</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-condition-value="${esc(item.id)}" value="${item.value}" step="0.1"><em>%</em></span></label>`);
        return;
      }
      const activation = item.activation || {};
      if (["toggle", "toggleThreshold"].includes(activation.mode) && activation.inputKey && !rendered.has(`toggle:${activation.inputKey}`)) {
        rendered.add(`toggle:${activation.inputKey}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="${esc(activation.inputKey)}"${(attackSelection ? activation.active : item.enabled) ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>${attackSelection ? "この攻撃を計算対象に含める" : "この条件を適用する"}</strong><small>実際に「${esc(item.conditionText || "発動条件")}」を満たす場合だけONにしてください。</small></span></label>`);
      }
      if (activation.mode === "stack" && activation.inputKey && !rendered.has(`stack:${activation.inputKey}`)) {
        rendered.add(`stack:${activation.inputKey}`); const max = item.stackMax || 1;
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.inputLabel || "現在の層数")}</strong><small>現在成立している層数を選択します。</small></span><select data-structured-input="${esc(activation.inputKey)}">${Array.from({ length: max + 1 }, (_, value) => `<option value="${value}"${value === item.stacks ? " selected" : ""}>${value === 0 ? "未発動（0層）" : `${value}層`}</option>`).join("")}</select></label>`);
      }
      if (activation.mode === "numericThreshold" && activation.inputKey && !rendered.has(`threshold:${activation.inputKey}`)) {
        rendered.add(`threshold:${activation.inputKey}`);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(activation.inputLabel || "現在の条件値")}</strong><small>${esc(activation.conditionText || "発動条件の判定に使用する値を入力します。")}</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-structured-input="${esc(activation.inputKey)}" value="${num(activation.inputValue, activation.default || 0)}" min="${num(activation.minimum)}" max="${num(activation.maximum, 999)}" step="${num(activation.step, 1)}"></span></label>`);
      }
      if (item.valueInput?.type === "toggle" && !rendered.has(`value:${item.valueInput.key}`)) {
        rendered.add(`value:${item.valueInput.key}`);
        controls.push(`<label class="genshin-condition-toggle"><input type="checkbox" data-structured-toggle="${esc(item.valueInput.key)}"${item.valueInput.checked ? " checked" : ""}><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>この追加条件も成立している場合だけONにしてください。</small></span></label>`);
      }
      if (item.valueInput?.type === "number" && !rendered.has(`value:${item.valueInput.key}`)) {
        rendered.add(`value:${item.valueInput.key}`);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>効果量の算出に使用する現在値です。</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-structured-input="${esc(item.valueInput.key)}" value="${item.valueInput.value}" min="${num(item.valueInput.minimum)}" max="${num(item.valueInput.maximum,999)}" step="${num(item.valueInput.step,1)}"><em>${esc(item.valueInput.unit ?? (item.unit === "percent" ? "%" : ""))}</em></span></label>`);
      }
      if (item.valueInput?.type === "providerStat" && !rendered.has(`provider:${item.valueInput.providerId}:${item.valueInput.providerStat}`)) {
        rendered.add(`provider:${item.valueInput.providerId}:${item.valueInput.providerStat}`);
        const provider = item.valueInput.providerId && String(item.valueInput.providerId) !== String(state.characterId) ? item.source : "計算対象キャラクター";
        const percentStats = new Set(["critRate", "critDamage", "breakEffect", "effectHitRate", "effectRes", "hpPercent", "elation"]);
        controls.push(`<label class="genshin-condition-control"><span class="genshin-condition-control-copy"><strong>${esc(item.valueInput.label)}</strong><small>${esc(provider)}の現在値を参照します。この値はパーティ設定またはステータス入力欄と同期します。</small></span><span class="genshin-condition-input-unit"><input type="number" class="input_num" data-structured-provider-stat="${esc(item.valueInput.providerStat)}" data-provider-id="${esc(item.valueInput.providerId || state.characterId)}" value="${item.valueInput.value}" min="${num(item.valueInput.minimum)}" max="${num(item.valueInput.maximum,999)}" step="${num(item.valueInput.step,1)}">${percentStats.has(item.valueInput.providerStat) ? "<em>%</em>" : ""}</span></label>`);
      }
    });
    return controls.length ? `<div class="genshin-constellation-controls"><h6>状態・条件</h6>${controls.join("")}</div>` : "";
  }

  function renderConditionGroup(items) {
    const title = conditionSourceTitle(items[0]); const status = conditionStatus(items);
    const conditions = [...new Set(items.map(conditionRequirement))].join("／");
    const effects = items.map((item) => `${item.name}：${isAttackSelectionCondition(item) ? "独立した攻撃の表示条件" : item.effectLabel || item.reason || item.description}`).join("／");
    const reflected = items.map((item) => `${item.name}：${currentConditionReflection(item)}`).join("／");
    const targets = [...new Set(items.map((item) => `${displayTarget(item.appliesTo || item.target?.owner || "self")}（${(item.target?.attackTypes || ["all"]).map((type) => ATTACK_LABELS[type] || type).join("・")}）`))].join("／");
    const descriptions = [...new Set(items.map((item) => item.description).filter(Boolean))].join("\n");
    return `<article class="genshin-constellation-section hsr-condition-section"><header class="genshin-constellation-head"><div><strong>${esc(title.type)}</strong><h5>${esc(title.name)}</h5></div><span class="genshin-condition-status ${status.className}">${status.label}</span></header><dl class="genshin-condition-facts"><div><dt>発動条件</dt><dd>${esc(conditions)}</dd></div><div><dt>効果</dt><dd>${esc(effects)}</dd></div><div><dt>現在の反映</dt><dd>${esc(reflected)}</dd></div><div><dt>適用対象</dt><dd>${esc(targets)}</dd></div></dl>${renderConditionControls(items)}${descriptions ? `<details class="genshin-condition-detail"><summary>効果説明</summary><div class="genshin-condition-detail-block"><h6>効果説明</h6><p>${esc(descriptions)}</p></div></details>` : ""}</article>`;
  }

  function renderConditions() {
    const conditions = allConditions(); const tabs = CONDITION_TAB_ORDER;
    if (!tabs.includes(state.conditionTab)) state.conditionTab = tabs[0];
    $("hsrConditionTabs").innerHTML = tabs.map((tab) => `<button type="button" class="genshin-condition-tab${tab === state.conditionTab ? " is-active" : ""}" role="tab" data-condition-tab="${esc(tab)}" aria-selected="${tab === state.conditionTab}">${esc(tab)}</button>`).join("");
    const selected = conditions.filter((item) => item.tab === state.conditionTab); const groups = new Map();
    selected.forEach((item) => { const source = item.sourceMeta || {}; const key = source.kind ? `${source.kind}:${source.id}:${source.skillId || source.traceId || source.eidolonRank || source.setPieces || item.id}` : item.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
    const meta = CONDITION_TAB_META[state.conditionTab] || CONDITION_TAB_META["その他"];
    $("hsrConditionList").innerHTML = `<section class="genshin-condition-card is-wide hsr-condition-category"><header><div><h4>${esc(meta.title)}</h4><p>${esc(meta.subtitle)}</p></div><span class="genshin-condition-source">${esc(meta.source)}</span></header>${groups.size ? [...groups.values()].map(renderConditionGroup).join("") : '<p class="genshin-condition-card-empty">このカテゴリに設定できる補正はありません。</p>'}</section>`;
  }

  function allConditions() { return sourceConditions().concat(state.conditions); }

  function updateConditionSummary() {
    const active = allConditions().filter((item) => item.enabled).length;
    $("hsrConditionTitle").textContent = active ? `${active}件の補正を適用` : "適用する補正はありません";
    $("hsrConditionHelp").textContent = "自動判定と手動条件の適用状態を確認できます。";
  }

  function applyEnemy(id) {
    state.enemyId = id; const item = enemyPreset();
    $("hsrEnemySelect").value = item ? id : "custom";
    if (item) Object.assign(state.enemy, item);
    $("hsrEnemyLevel").value = state.enemy.level; $("hsrEnemyMaxHp").value = state.enemy.maxHp || 100000; $("hsrEnemyResistance").value = state.enemy.resistance;
    $("hsrWeakness").value = String(Boolean(state.enemy.weakness)); $("hsrToughnessState").value = state.enemy.toughnessActive ? "active" : "broken";
    $("hsrMaxToughness").value = state.enemy.maxToughness;
    $("hsrEnemyHpPercent").value = state.enemy.hpPercent ?? 100; $("hsrEnemyCount").value = state.enemy.count || 1; $("hsrEnemyDebuffCount").value = state.enemy.debuffCount || 0;
    setImage("hsrEnemyImage", item?.image, item?.name); $("hsrEnemyName").textContent = item?.name || "カスタム敵";
    $("hsrEnemySummary").textContent = item ? `Lv${item.level} / 耐性${item.resistance}% / 最大靭性${item.maxToughness}` : "入力値を個別に編集します。";
    renderAttacks(); markDirty();
  }

  function modifiers(attack) {
    return allConditions().filter((item) => !item.displayOnly).map((item) => {
      const attackApplies = !item.structured || window.HsrModifierRuntime.applicableToAttack(item, attack);
      const supplementalApplies = !attack.sourceModifierId || !item.supplementalAttack || item.id === attack.sourceModifierId;
      const primaryTargetApplies = !item.primaryTargetOnly || attack.target !== "adjacent";
      const adjacentTargetApplies = !item.adjacentTargetOnly || attack.target === "adjacent";
      return { ...item, applicable: item.enabled && attackApplies && supplementalApplies && primaryTargetApplies && adjacentTargetApplies && item.applicable !== false, reason: !item.enabled ? "発動条件を満たしていません" : !supplementalApplies ? "別の付加ダメージに属する補正です" : !primaryTargetApplies ? "隣接対象はこの補正の対象外です" : !adjacentTargetApplies ? "主対象はこの補正の対象外です" : attackApplies ? item.reason || "" : "この攻撃種別・属性は対象外です" };
    });
  }

  function resolvedAttack(selected) {
    const level = num(state.traceLevels[selected.traceKey], selected.traceKey === "normal" ? 6 : 10);
    const index = Math.max(0, Math.min(selected.multipliers.length - 1, level - 1));
    const inputHitCount = selected.hitCountInputKey ? num(state.modifierInputs[selected.hitCountInputKey], selected.hitCountDefault || 0) : null;
    const eidolonHitCount = selected.hitCountAtEidolon && state.eidolon >= num(selected.hitCountAtEidolon.rank) ? num(selected.hitCountAtEidolon.value, selected.hitCount) : selected.hitCount;
    const referencedHits = selected.hitCountReference === "enemy.debuffCount" ? Math.max(0, Math.min(num(selected.hitCountMaximum, 99), num(state.enemy.debuffCount)))
      : selected.hitCountInputKey ? Math.max(num(selected.hitCountMinimum, 0), Math.min(num(selected.hitCountMaximum, 99), inputHitCount))
      : eidolonHitCount;
    const components = Array.isArray(selected.multiplierComponents) ? selected.multiplierComponents.map((component) => {
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
    const multiplier = components.length ? components.reduce((sum, component) => sum + component.value, 0) : selected.multipliers[index];
    const formulaLevel = num(state.traceLevels[selected.formulaTraceKey], selected.formulaTraceKey === "normal" ? 6 : 10);
    const formulaIndex = Math.max(0, formulaLevel - 1);
    const enemyHpPercent = selected.enemyHpPercentMultipliers?.[Math.min(selected.enemyHpPercentMultipliers.length - 1, formulaIndex)];
    const atkCapPercent = selected.atkCapMultipliers?.[Math.min(selected.atkCapMultipliers.length - 1, formulaIndex)];
    const adjacentMultiplier = selected.adjacentMultiplierRatio !== undefined ? multiplier * num(selected.adjacentMultiplierRatio) / 100 : selected.adjacentMultipliers?.[index] || 0;
    const traceLevelLabel = components.length ? components.map((component) => `${ATTACK_LABELS[component.traceKey] || component.traceKey}Lv${component.level}`).join("＋") : `Lv${level}`;
    const multiplierAdditionScale = Array.isArray(selected.multiplierAdditionScaleValues)
      ? num(selected.multiplierAdditionScaleValues[Math.min(selected.multiplierAdditionScaleValues.length - 1, index)], 1)
      : num(selected.multiplierAdditionScale, 1);
    return { ...selected, hitCount: referencedHits, hitCountReference: selected.hitCountReference || selected.hitCountInputKey || "", attackType: selected.type, element: selected.damageFormula === "trueDamage" ? "None" : character()?.element || "", multiplier, adjacentMultiplier, scalingTerms, adjacentScalingTerms, enemyHpPercent, atkCapPercent, multiplierAdditionScale, traceLevel: level, traceLevelLabel };
  }

  function supplementalAttacks() {
    const context = structuredModifierContext();
    return structuredSourceConditions().filter((item) => item.enabled && item.calculable && item.supplementalAttack).map((item) => {
      const source = item.sourceMeta || {};
      const level = source.skillId ? num(context.traceLevelFor(source), 10) : 1;
      return {
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

  function renderWarnings(warnings) {
    $("hsrWarnings").hidden = !warnings.length;
    $("hsrWarnings").innerHTML = warnings.length ? `<ul>${warnings.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  }

  function attackSupport(attack) {
    if (attack.damageFormula === "trueDamage" && state.eidolon !== 0) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "キュレネの領域の確定ダメージは星魂0のみ計算対応です。" };
    if (attack.support?.status === "displayOnly") return { status: "displayOnly", label: "表示のみ・計算不可", reason: attack.support.reason };
    if (attack.damageFormula === "elation" && (state.level !== 80 || state.eidolon !== 0)) return { status: "displayOnly", label: "表示のみ・計算不可", reason: "この愉悦攻撃はLv80・星魂0のアッハタイム中のみ計算対応です。" };
    const reason = attack.type === "break" ? "" : window.HsrCalcEngine.unsupportedAttackReason(attack);
    if (reason) return { status: "displayOnly", label: "表示のみ・計算不可", reason };
    if (attack.support?.status === "calculable" && attack.support.verified === true) return { status: "calculable", label: "計算対応・確認済み扱い" };
    return { status: "review", label: "確認中・参考値" };
  }

  function supportBadge(attack) {
    const support = attackSupport(attack);
    return `<p class="hsr-support-status" data-support-status="${support.status}">${esc(support.label)}</p>`;
  }

  function damageValues(result) {
    const values = result.attack.canCrit ? [["非会心", result.nonCrit], ["会心", result.crit], ["期待値", result.expected]] : [[result.breakdown.damageFormula === "trueDamage" ? "追加確定ダメージ" : "ダメージ", result.nonCrit]];
    return `<div class="hsr-attack-result-values${result.attack.canCrit ? "" : " hsr-attack-result-values--single"}">${values.map(([label, value]) => `<div><span>${label}（${result.breakdown.damageFormula === "trueDamage" ? "1回分" : "合計"}）</span><strong>${fmt(value)}</strong></div>`).join("")}</div>`;
  }

  const detailNumber = (value) => Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 6 });
  const SCALING_LABELS = { atk: "攻撃力", hp: "HP", def: "防御力", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度" };

  function damageBreakdown(result, targetLabel) {
    const b = result.breakdown;
    if (b.damageFormula === "trueDamage") return `<section class="hsr-target-breakdown"><h4>敵1体・追加確定ダメージ1回分</h4><dl><div><dt>参照元ダメージ（補正適用後）</dt><dd>${detailNumber(b.originalDamage)}</dd></div><div><dt>確定ダメージ倍率</dt><dd>${detailNumber(b.multiplierPercent)}%</dd></div><div><dt>追加確定ダメージ</dt><dd>${detailNumber(result.nonCrit)}</dd></div><div><dt>適用条件</dt><dd>${esc(b.condition)}</dd></div></dl><p>元ダメージ × 確定ダメージ倍率。会心・防御・耐性・与ダメージ・靭性等は再適用しません。元ダメージとの合算は行いません。</p>${damageValues(result)}</section>`;
    const row = (label, value) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    const isElation = b.damageFormula === "elation";
    const scaling = isElation
      ? row("Lv80の愉悦基礎値 × 攻撃倍率", `${detailNumber(b.levelBase)} × ${detailNumber(b.multiplierPercent)}%`)
        + row("愉悦度", `${detailNumber(b.elationPercent)}%／×${detailNumber(b.elationMultiplier)}`)
        + row("爆笑ネタ（攻撃時点）", `${detailNumber(b.punchline)}／×${detailNumber(b.punchlineMultiplier)}`)
        + row("上笑", `${detailNumber(b.merrymakePercent)}%／×${detailNumber(b.merrymakeMultiplier)}`)
      : b.damageFormula === "enemyHpCappedByAtk"
      ? row("敵HP参照・攻撃力上限適用後", detailNumber(b.cappedEnemyHpDamage)) + row("敵HP割合／攻撃力上限", `${detailNumber(b.enemyHpPercent)}%／${detailNumber(b.atkCapPercent)}%`) + row("攻撃倍率", `${detailNumber(b.multiplierPercent)}%`)
      : b.scalingTerms.map((term) => row(`${SCALING_LABELS[term.stat] || term.stat}参照 × 攻撃倍率`, `${detailNumber(term.referenceValue)} × ${detailNumber(term.multiplierPercent)}%`)).join("");
    const hits = result.attack.hitCount;
    const hitFactors = b.vulnerabilityFactors.length && b.vulnerabilityFactors.every((value) => value === b.vulnerabilityFactors[0])
      ? `<dl class="hsr-hit-factors">${row("被ダメージ倍率（各ヒット）", `×${detailNumber(b.vulnerabilityFactors[0])}`)}</dl>`
      : `<details class="hsr-hit-factors"><summary>被ダメージ倍率（ヒット順）</summary><p>${b.vulnerabilityFactors.map((value) => `×${detailNumber(value)}`).join(" → ") || "ヒットなし"}</p></details>`;
    return `<section class="hsr-target-breakdown"><h4>${esc(targetLabel)}</h4>${isElation ? '<p class="hsr-formula-note">アッハタイム中・敵1体あたりの1回分です。爆笑の褒美への変換や全敵の合計は計算しません。</p>' : ""}<dl>${scaling}${b.flatDamage ? row("固定加算", detailNumber(b.flatDamage)) : ""}
      ${row("基礎ダメージ（1ヒット）", detailNumber(b.baseDamage))}${row("ヒット数", hits)}
      ${isElation ? row("通常の与ダメージ補正", "適用対象外（×1）") : row("与ダメージ補正", `${detailNumber(b.damageBonus)}%／×${detailNumber(b.damageBonusMultiplier)}`)}
      ${Number.isFinite(b.defenseIgnorePercent) ? row("防御ダウン／防御無視（合計100%上限）", `${detailNumber(b.defenseReductionPercent)}%／${detailNumber(b.defenseIgnorePercent)}%`) : ""}${row("防御倍率", `×${detailNumber(b.defense)}`)}${row("耐性倍率", `×${detailNumber(b.resistance)}`)}
      ${row(b.toughness === 0.9 ? "靭性倍率（靭性あり）" : "靭性倍率（弱点撃破中）", `×${detailNumber(b.toughness)}`)}
      ${isElation ? "" : row("独立倍率", `×${detailNumber(b.independentMultiplier)}`)}${row("共通倍率（被ダメージ補正を除く）", `×${detailNumber(b.commonWithoutVulnerability)}`)}
      ${row("被ダメージ増加（共通分）", `${detailNumber(b.takenDamage)}%`)}${row("被ダメージ倍率合計", detailNumber(b.vulnerabilityFactorSum))}
      ${result.attack.canCrit ? row("会心率", `${detailNumber(b.critRatePercent)}%`) + row("会心ダメージ／会心被ダメージ補正", `${detailNumber(b.critDamagePercent)}%／${detailNumber(b.critTakenDamage)}%`) + row("会心倍率", `×${detailNumber(b.critMultiplier)}`) + row("期待値の会心倍率", `×${detailNumber(b.expectedCritMultiplier)}`) : ""}</dl>
      ${hitFactors}<p class="hsr-formula-note">${result.attack.canCrit ? "非会心合計" : "ダメージ合計"}＝基礎ダメージ（1ヒット）×共通倍率×被ダメージ倍率合計</p>
      ${hits > 1 ? `<p class="hsr-formula-note">同じ基礎ダメージを${hits}ヒット分集計します。1ヒット平均：${detailNumber(result.perHit.nonCrit)}${result.attack.target === "bounce" ? "。命中先の分配は再現しません。" : ""}</p>` : ""}${damageValues(result)}</section>`;
  }

  function modifierAudit(result, targetLabel) {
    const list = (items, applied) => `<ul>${items.length ? items.map((item) => `<li><strong>${esc(item.name)}</strong>：${applied ? `${item.value}${item.unit === "percent" ? "%" : ""}<br><small>出典：${esc(item.source)}／条件：${esc(item.conditionText || "常時")}／計算段階：${esc(item.calculation?.stage || item.category)}</small>` : esc(item.reason || "条件未成立・計算対象外")}</li>`).join("") : "<li>なし</li>"}</ul>`;
    return `<h4>${esc(targetLabel)}・適用された補正</h4>${list(result.applied, true)}<h4>${esc(targetLabel)}・条件未成立／対象外</h4>${list(result.skipped, false)}`;
  }

  function excludedConditions() {
    const items = allConditions().filter((item) => item.displayOnly && !isAttackSelectionCondition(item));
    const included = items.filter((item) => item.inputPolicy === "includedInFinalStats");
    const unsupported = items.filter((item) => item.inputPolicy !== "includedInFinalStats");
    const group = (title, entries, includedInStats) => entries.length ? `<h4>${title}</h4><ul>${entries.map((item) => `<li><strong>${esc(item.name)}</strong>：${includedInStats ? "入力された最終ステータスに含める常時効果のため、再加算しません。" : esc(item.reason || "計算データ未対応のため、計算には含めません。")}</li>`).join("")}</ul>` : "";
    return items.length ? `<details class="hsr-excluded-conditions"><summary>計算に追加しない補正（${items.length}件）</summary>${group("入力済みの常時効果・再加算なし", included, true)}${group("データ未対応・表示のみ（計算対象外）", unsupported, false)}</details>` : "";
  }

  function renderResults(results, breakResult, specialBreakResults = [], unavailableAttacks = []) {
    const attackCards = results.map(({ result, adjacent, attack }) => `<article class="hsr-attack-result"><header><h3>${esc(result.attack.name)}</h3><span>${esc(ATTACK_LABELS[attack.type] || attack.type)} ${esc(attack.traceLevelLabel || `Lv${attack.traceLevel}`)}・${esc(TARGET_LABELS[result.attack.target] || result.attack.target)}</span></header>${supportBadge(attack)}${adjacent ? "<h4>主対象</h4>" : ""}${damageValues(result)}${adjacent ? `<h4>隣接対象</h4>${damageValues(adjacent)}` : ""}</article>`).join("");
    const unavailableCards = unavailableAttacks.map((attack) => `<article class="hsr-attack-result">${supportBadge(attack)}<h3>${esc(attack.name)}</h3><p>${esc(attackSupport(attack).reason || "この攻撃は表示のみのため、ダメージを計算しません。")}</p></article>`).join("");
    const specialBreakCards = specialBreakResults.map(({ attack, result }) => `<article class="hsr-attack-result"><header><h3>${esc(attack.name)}</h3><span>弱点撃破 Lv${attack.traceLevel}・${esc(TARGET_LABELS[attack.target] || attack.target)}</span></header>${supportBadge(attack)}${result.supported ? `<div class="hsr-attack-result-values hsr-attack-result-values--single"><div><span>撃破ダメージ</span><strong>${fmt(result.value)}</strong></div></div>` : `<p>計算不可：${esc(result.reason)}</p>`}</article>`).join("");
    const breakdown = results.map(({ result, adjacent, attack }) => `<article class="hsr-attack-result"><h3>${esc(result.attack.name)}</h3>${supportBadge(attack)}${damageBreakdown(result, "主対象")}${adjacent ? damageBreakdown(adjacent, "隣接対象") : ""}</article>`).join("");
    const specialBreakBreakdown = specialBreakResults.filter(({ result }) => result.supported).map(({ attack, result: b }) => `<article class="hsr-attack-result"><h3>${esc(attack.name)}</h3>${supportBadge(attack)}<dl>${[["撃破基礎値", b.base], ["属性・攻撃倍率", b.multiplier], ["撃破特効倍率", b.effect], ["防御倍率", b.defense], ["耐性倍率", b.resistance], ["靭性量倍率", b.toughnessScale], ["被ダメージ倍率", b.vulnerability], ["撃破ダメージ", b.value]].map(([label, value]) => `<div><dt>${label}</dt><dd>${detailNumber(value)}</dd></div>`).join("")}</dl></article>`).join("");
    const audits = results.map(({ attack, result, adjacent }) => `<article class="hsr-attack-result"><h3>${esc(result.attack.name)}</h3>${modifierAudit(result, "主対象")}${adjacent ? modifierAudit(adjacent, "隣接対象") : ""}</article>`).join("");
    const specialBreakAudit = specialBreakResults.filter(({ result }) => result.supported).map(({ attack, result }) => `<article class="hsr-attack-result"><h3>${esc(attack.name)}</h3>${modifierAudit(result, "弱点撃破")}</article>`).join("");
    $("hsrResults").innerHTML = `<p class="hsr-support-note">「確認済み扱い」は攻撃データの登録状態です。全条件での計算精度を保証するものではありません。確認中の結果は参考値です。</p><div class="genshin-result-tabs" role="tablist"><button type="button" class="genshin-result-tab" role="tab" data-result-tab="damage" aria-selected="true">ダメージ</button><button type="button" class="genshin-result-tab" role="tab" data-result-tab="breakdown">計算内訳</button><button type="button" class="genshin-result-tab" role="tab" data-result-tab="modifiers">補正</button></div>
      <section data-result-panel="damage"><div class="hsr-attack-results">${attackCards}${specialBreakCards}${unavailableCards}</div>${breakResult ? `<p class="hsr-result-break"><strong>弱点撃破：</strong>${breakResult.supported ? fmt(breakResult.value) : `計算不可：${esc(breakResult.reason)}`}</p>` : ""}</section>
      <section data-result-panel="breakdown" hidden class="hsr-result-details hsr-attack-results"><p class="hsr-formula-note">表示値は丸めています。多段攻撃の結果はヒット合計です。</p>${breakdown}${specialBreakBreakdown}</section>
      <section data-result-panel="modifiers" hidden class="hsr-result-details hsr-attack-results">${excludedConditions()}${audits}${specialBreakAudit}</section>`;
  }

  function calculationInputWarnings(attacks, baseStats) {
    if (attacks.length && attacks.every((attack) => attack.damageFormula === "trueDamage")) return attacks.flatMap((attack) => window.HsrCalcEngine.trueDamageInputWarnings({ character: { eidolon: state.eidolon }, attack, trueDamage: state.trueDamageInputs }));
    const warnings = new Set();
    const labels = { hp: "HP", atk: "攻撃力", def: "防御力", speed: "速度", critRate: "会心率", critDamage: "会心ダメージ", damageBonus: "属性ダメージ", breakEffect: "撃破特効", effectHitRate: "効果命中", effectRes: "効果抵抗", energyRegen: "EP回復効率", hpPercent: "現在HP割合", dotBaseDamage: "対象の持続ダメージ", elation: "愉悦度" };
    const requiredStats = new Set();
    if (!Number.isInteger(state.level) || state.level < 1 || state.level > 80) warnings.add("キャラクターのレベルに1～80の整数を入力してください。");
    if (cone() && (!Number.isInteger(state.coneLevel) || state.coneLevel < 1 || state.coneLevel > 80)) warnings.add("光円錐のレベルに1～80の整数を入力してください。");
    if (cone() && (!Number.isInteger(state.coneRank) || state.coneRank < 1 || state.coneRank > 5)) warnings.add("光円錐の重畳ランクに1～5を選択してください。");
    if (attacks.some((attack) => attack.damageFormula === "elation") && (!Number.isInteger(state.traceLevels.elation) || state.traceLevels.elation < 1 || state.traceLevels.elation > 10)) warnings.add("星魂0の愉悦スキルLvに1～10の整数を選択してください。");
    attacks.forEach((attack) => {
      if (Object.hasOwn(state.traceLevels, attack.traceKey) && (!Number.isInteger(state.traceLevels[attack.traceKey]) || state.traceLevels[attack.traceKey] < 1 || state.traceLevels[attack.traceKey] > (["normal", "elation"].includes(attack.traceKey) ? 10 : 15))) warnings.add(`${ATTACK_LABELS[attack.traceKey] || attack.traceKey}のレベルを確認して選択してください。`);
      if (attack.damageFormula === "elation") window.HsrCalcEngine.elationInputWarnings({ character: { level: state.level, eidolon: state.eidolon, stats: state.stats }, attack, elation: state.elationInputs }).forEach((warning) => warnings.add(warning));
      const terms = [...(attack.scalingTerms?.length ? attack.scalingTerms : [{ stat: attack.scalingStat || "atk", multiplier: attack.multiplier }]), ...(attack.adjacentScalingTerms || [])];
      terms.filter((term) => num(term.multiplier) !== 0).forEach((term) => requiredStats.add(term.stat));
      if (attack.damageFormula === "enemyHpCappedByAtk") requiredStats.add("atk");
      modifiers(attack).filter((item) => item.enabled).forEach((item) => (item.inputWarnings || []).forEach((warning) => warnings.add(warning)));
      modifiers(attack).filter((item) => item.enabled && item.applicable).forEach((item) => {
        if (item.id === "trace:1202:120202:benediction-atk") {
          const provider = state.party.find((member) => member.characterId === item.providerId);
          if (provider && (!Number.isInteger(provider.level) || provider.level < 1 || provider.level > 15)) warnings.add("停雲の軌跡Lvに1～15の整数を入力してください。");
        }
        const providerStat = item.valueInput?.providerStat;
        if (["hp", "atk", "def"].includes(providerStat) && !(Number.isFinite(item.valueInput.value) && item.valueInput.value > 0)) warnings.add(`${item.name}が参照する${labels[providerStat]}に、発動者の最終値（0より大きい数値）を入力してください。`);
        const stat = item.category === "statPercent" ? item.stat : item.requiredBaseStat;
        if (stat && !(Number.isFinite(baseStats[stat]) && baseStats[stat] > 0)) warnings.add(`${item.name}に必要な基礎${labels[stat] || stat}を取得できません。キャラ・光円錐のLv80基礎値が必要です。この補正を外すか、レベル・装備を確認してください。`);
      });
    });
    Object.entries(state.stats).forEach(([stat, value]) => {
      if (["hp", "atk", "def"].includes(stat)) {
        if (requiredStats.has(stat) && !(Number.isFinite(value) && value > 0)) warnings.add(`攻撃が参照する${labels[stat]}に、装備・軌跡の常時効果を含む最終値（0より大きい数値）を入力してください。`);
      } else if (!Number.isFinite(value)) warnings.add(`${labels[stat] || stat}に数値を入力してください。補正がない場合は0を入力してください。`);
    });
    return [...warnings];
  }

  function calculate() {
    collectInputs(); const warnings = [];
    renderAttacks();
    if (!character()) warnings.push("キャラクターを選択してください。");
    if (cone() || relic() || relicSecond() || ornament()) warnings.push("常時効果は入力ステータスを使用し、条件付き効果は補正条件で選択した項目だけを適用します。");
    if (!character()) { renderWarnings(warnings); $("hsrResults").innerHTML = '<p class="genshin-help">計算可能なキャラクターを選択してください。</p>'; return; }
    const available = availableAttacks();
    const supplemental = state.trueDamageInputs.active ? [] : supplementalAttacks();
    const unavailableAttacks = supplemental.filter((attack) => attackSupport(attack).status === "displayOnly").concat(available.filter((attack) => attackSupport(attack).status === "displayOnly").concat((state.data.specialBreakAttacks || []).filter((attack) => attack.characterId === state.characterId && !attack.hidden && attackSupport(attack).status === "displayOnly")));
    const attacks = available.filter((attack) => attackSupport(attack).status !== "displayOnly").map(resolvedAttack).concat(supplemental.filter((attack) => attackSupport(attack).status !== "displayOnly"));
    if (!attacks.length) {
      renderWarnings(["このキャラクターには現在計算できる攻撃データがありません。"]);
      renderResults([], null, [], unavailableAttacks);
      return;
    }
    warnings.push(...attacks.map((attack) => attack.calculationNote).filter(Boolean));
    const reviewAttackCount = attacks.filter((attack) => attack.support?.status !== "calculable" || !attack.support?.verified).length;
    if (reviewAttackCount) warnings.push(`このキャラクターの攻撃データ${reviewAttackCount}件は確認中です。計算結果は参考値として表示します。`);
    const baseStats = selectedBaseStats();
    const inputWarnings = calculationInputWarnings(attacks, baseStats);
    if (inputWarnings.length) {
      renderWarnings(warnings.concat(inputWarnings));
      $("hsrResults").innerHTML = '<p class="genshin-help">入力内容を確認して、ダメージ計算を実行してください。</p>';
      $("hsrDirtyNotice").hidden = false;
      return;
    }
    const baseRequest = { character: { level: state.level, eidolon: state.eidolon, stats: state.stats, baseStats }, enemy: state.enemy, elation: state.elationInputs, trueDamage: state.trueDamageInputs };
    const results = attacks.map((selected) => {
      const request = { ...baseRequest, attack: selected, modifiers: modifiers(selected) };
      const result = window.HsrCalcEngine.calculate(request);
      const adjacentAttack = selected.adjacentMultiplier ? { ...selected, multiplier: selected.adjacentMultiplier, scalingTerms: selected.adjacentScalingTerms?.length ? selected.adjacentScalingTerms : undefined, target: "adjacent" } : null;
      const adjacent = adjacentAttack ? window.HsrCalcEngine.calculate({ ...baseRequest, attack: adjacentAttack, modifiers: modifiers(adjacentAttack) }) : null;
      return { attack: selected, result, adjacent };
    });
    const breakAttack = { attackType: "break", type: "break", element: character().element };
    const breakResult = state.trueDamageInputs.active ? null : window.HsrCalcEngine.calculateBreak({ character: baseRequest.character, enemy: state.enemy, element: character().element, modifiers: modifiers(breakAttack), breakBaseDamage: state.data.breakBaseDamage });
    const specialBreakResults = (state.trueDamageInputs.active ? [] : state.data.specialBreakAttacks || []).filter((attack) => attack.characterId === state.characterId && !attack.hidden && attackSupport(attack).status !== "displayOnly").map((attack) => {
      const level = num(state.traceLevels[attack.traceKey], 10); const index = Math.max(0, Math.min(attack.multipliers.length - 1, level - 1));
      const multiplier = num(attack.multipliers[index]) + (state.eidolon >= 6 ? num(attack.eidolon6Bonus) : 0);
      const resolved = { ...attack, traceLevel: level, multiplier, attackType: "break" };
      const result = window.HsrCalcEngine.calculateBreak({ character: baseRequest.character, enemy: state.enemy, element: attack.element, multiplier: multiplier / 100, modifiers: modifiers(resolved), breakBaseDamage: state.data.breakBaseDamage });
      return { attack: resolved, result };
    });
    renderWarnings(warnings); renderResults(results, breakResult, specialBreakResults, unavailableAttacks); $("hsrDirtyNotice").hidden = true;
    requestAnimationFrame(() => $("hsrResults")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function switchResultTab(tab) {
    $("hsrResults").querySelectorAll("[data-result-tab]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.resultTab === tab)));
    $("hsrResults").querySelectorAll("[data-result-panel]").forEach((panel) => { panel.hidden = panel.dataset.resultPanel !== tab; });
  }

  function renderActionValue() {
    if (!window.HsrCalcEngine || !$("hsrActionSummary")) return;
    const result = window.HsrCalcEngine.actionSummary(num($("hsrStat-speed")?.value, state.stats.speed), num($("hsrActionWindow")?.value, 150));
    $("hsrActionSummary").innerHTML = `<strong>${result.actionValue.toFixed(2)} AV</strong><span>基準内の行動回数: ${result.actions}</span>`;
  }

  function markDirty(origin = "manual") { if (!state.initialized) return; if (origin !== "api" && state.source === "api") { state.source = "api-edited"; $("hsrInputProvenance").textContent = "UID取得値を手動変更"; } $("hsrDirtyNotice").hidden = false; renderActionValue(); }

  function detailArticle(title, description, params = []) {
    if (!description) return "";
    return `<article class="genshin-uid-detail-item hsr-detail-card"><h4>${esc(cleanGameText(title))}</h4><p>${esc(formatGameText(description, params))}</p></article>`;
  }

  function skillLevel(skill) {
    if (skill.type === "ElationDamage" && character()?.id === "1505") return Number($("hsrElationTrace").value) || 10;
    if (skill.type === "Normal") return state.traceLevels.normal;
    if (skill.type === "BPSkill") return state.traceLevels.skill;
    if (skill.type === "Ultra") return state.traceLevels.ultimate;
    if (skill.type === "Talent" || skill.type === "MemospriteSkill" || skill.type === "MemospriteTalent") return state.traceLevels.talent;
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
    const trace = (type) => { const value = profile.traces?.find((item) => item.type === type)?.level; return Number.isFinite(value) && value > 0 ? value : NaN; }; state.traceLevels = { normal: trace("Normal"), skill: trace("BPSkill"), ultimate: trace("Ultra"), talent: trace("Talent"), elation: trace("ElationDamage") };
    state.stats = Object.fromEntries(Object.keys(DEFAULT_STATS).map((key) => [key, ["hpPercent", "dotBaseDamage"].includes(key) ? DEFAULT_STATS[key] : null]));
    Object.keys(state.stats).forEach((key) => {
      const value = profile.stats?.[key];
      if (value != null && value !== "" && Number.isFinite(Number(value))) state.stats[key] = Number(value);
    });
    state.source = "api"; writeStats(); renderStaticInputs(); renderBuild(); markDirty("api");
  }

  function bind() {
    const triggers = { hsrCharacterTrigger: "character", hsrCharacterName: "character", hsrConeTrigger: "cone", hsrConeName: "cone", hsrRelicTrigger: "relic", hsrRelicName: "relic", hsrRelicSecondTrigger: "relicSecond", hsrRelicSecondName: "relicSecond", hsrOrnamentTrigger: "ornament", hsrOrnamentName: "ornament", hsrEnemyTrigger: "enemy" };
    Object.entries(triggers).forEach(([id, type]) => $(id).addEventListener("click", () => openSelection(type)));
    $("hsrSelectionSearch").addEventListener("input", () => { $("hsrSelectionSearchClear").disabled = !$("hsrSelectionSearch").value; renderSelectionList(); });
    $("hsrSelectionSearchClear").addEventListener("click", () => { $("hsrSelectionSearch").value = ""; $("hsrSelectionSearchClear").disabled = true; renderSelectionList(); if (window.matchMedia("(min-width: 769px)").matches) $("hsrSelectionSearch").focus(); });
    $("hsrSelectionFilters").addEventListener("click", (event) => { const clear = event.target.closest("#hsrFilterClear"); if (clear) { Object.values(state.selectionFilters).forEach((values) => values.clear()); $("hsrSelectionFilters").querySelectorAll("[data-filter-group]").forEach((button) => button.setAttribute("aria-pressed", "false")); clear.disabled = true; renderSelectionList(); return; } const button = event.target.closest("[data-filter-group]"); if (!button) return; const values = state.selectionFilters[button.dataset.filterGroup]; const value = button.dataset.filterValue; if (values.has(value)) values.delete(value); else values.add(value); button.setAttribute("aria-pressed", String(values.has(value))); const clearButton = $("hsrFilterClear"); if (clearButton) clearButton.disabled = !Object.values(state.selectionFilters).some((selected) => selected.size); renderSelectionList(); });
    $("hsrSelectionList").addEventListener("click", (event) => { const card = event.target.closest("[data-selection-id]"); if (card) chooseSelection(card.dataset.selectionId); });
    $("hsrSelectionClose").addEventListener("click", () => closeDialog($("hsrSelectionDialog")));
    $("hsrPartyDialogOpen").addEventListener("click", () => { renderPartyDialog(); openModal($("hsrPartyDialog")); });
    $("hsrPartyDialogClose").addEventListener("click", () => closeDialog($("hsrPartyDialog")));
    $("hsrPartyDialogApply").addEventListener("click", () => { collectParty(); closeDialog($("hsrPartyDialog")); });
    $("hsrPartyRows").addEventListener("click", (event) => {
      const clear = event.target.closest("[data-party-clear]");
      if (clear) { state.party[num(clear.dataset.partyClear)] = { characterId: "", eidolon: 0, level: 10, atk: 0, critDamage: 50, breakEffect: 0, lightConeId: "", coneRank: 1, relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "" }; renderPartyDialog(); return; }
      const button = event.target.closest("[data-party-select]"); if (button) { collectParty(); openSelection("party", num(button.dataset.partySelect)); }
    });
    $("hsrPartyRows").addEventListener("change", (event) => {
      if (event.target.matches("[data-party-field]")) collectParty();
    });
    $("hsrConditionDialogOpen").addEventListener("click", () => {
      collectInputs();
      renderConditions();
      const dialog = $("hsrConditionDialog");
      const scrollRegion = dialog.querySelector(".genshin-condition-dialog-body");
      openModal(dialog);
      if (scrollRegion) {
        scrollRegion.scrollTop = 0;
        requestAnimationFrame(() => { scrollRegion.scrollTop = 0; });
      }
    });
    $("hsrConditionDialogClose").addEventListener("click", () => closeDialog($("hsrConditionDialog")));
    $("hsrConditionDialog").addEventListener("click", (event) => { const tab = event.target.closest("[data-condition-tab]"); if (tab) { state.conditionTab = tab.dataset.conditionTab; renderConditions(); } });
    $("hsrConditionDialog").addEventListener("input", (event) => {
      if (event.target.dataset.structuredProviderStat) {
        const providerId = String(event.target.dataset.providerId || state.characterId);
        const stat = event.target.dataset.structuredProviderStat;
        if (providerId === String(state.characterId)) { state.stats[stat] = num(event.target.value); writeStats(); }
        else { const member = state.party.find((entry) => String(entry.characterId) === providerId); if (member) member[stat] = num(event.target.value); }
        updateConditionSummary(); markDirty(); return;
      }
      if (!event.target.dataset.structuredInput) return;
      state.modifierInputs[event.target.dataset.structuredInput] = num(event.target.value);
      updateConditionSummary(); markDirty();
    });
    $("hsrConditionDialog").addEventListener("change", (event) => {
      if (event.target.dataset.structuredProviderStat) {
        renderConditions(); updateConditionSummary(); markDirty(); return;
      }
      if (event.target.dataset.structuredToggle) {
        state.modifierInputs[event.target.dataset.structuredToggle] = event.target.checked;
        renderConditions(); updateConditionSummary(); markDirty(); return;
      }
      if (event.target.dataset.structuredInput) {
        state.modifierInputs[event.target.dataset.structuredInput] = num(event.target.value);
        renderConditions(); updateConditionSummary(); markDirty(); return;
      }
      const id = event.target.dataset.conditionEnabled || event.target.dataset.conditionValue || event.target.dataset.conditionStack; if (!id) return;
      if (id.startsWith("party:")) {
        const member = state.party[num(id.split(":")[1])]; if (member && event.target.dataset.conditionEnabled) member.enabled = event.target.checked;
      } else {
        const item = state.conditions.find((condition) => condition.id === id); if (!item) return;
        if (event.target.dataset.conditionEnabled) item.enabled = event.target.checked; else item.value = num(event.target.value);
      }
      renderConditions(); updateConditionSummary(); markDirty();
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
      state.stats.hpPercent = Math.min(100, Math.max(0, num(event.target.value, 100)));
      renderAttacks();
      updateConditionSummary();
    });
    $("hsrEnemyHpPercent").addEventListener("input", (event) => {
      state.enemy.hpPercent = Math.min(100, Math.max(0, num(event.target.value, 100)));
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
    $("hsrCalculateButton").addEventListener("click", calculate);
    $("hsrResults").addEventListener("click", (event) => { const button = event.target.closest("[data-result-tab]"); if (button) switchResultTab(button.dataset.resultTab); });
    $("hsrActionWindow").addEventListener("input", renderActionValue);
    document.querySelectorAll(".hsr-build-fieldset input,.hsr-build-fieldset select").forEach((input) => input.addEventListener("input", markDirty));
    document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(dialog); }));
  }

  async function initialize() {
    try {
      state.data = await window.HsrCalcData.load(); renderStaticInputs(); bind(); applyEnemy(state.enemyId); writeStats(); renderBuild(); updateConditionSummary();
      state.initialized = true; $("hsrDirtyNotice").hidden = true;
    } catch (error) {
      $("hsrWarnings").hidden = false; $("hsrWarnings").textContent = "計算データを読み込めませんでした。ページを再読み込みしてください。"; console.error(error);
    }
  }

  window.HsrTool = Object.freeze({ applyProfileCharacter, getState: () => state, openSelection });
  document.addEventListener("DOMContentLoaded", initialize);
})();
