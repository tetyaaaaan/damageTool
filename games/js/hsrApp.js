(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const FALLBACK = "/games/images/genshin/fallback.webp";
  const ELEMENT_KEYS = { Physical: "物理", Fire: "炎", Ice: "氷", Thunder: "雷", Wind: "風", Quantum: "量子", Imaginary: "虚数" };
  const CHARACTER_READINGS = {
    "開拓者": "かいたくしゃ", "姫子": "ひめこ", "遠坂凛": "とおさかりん", "銀狼": "ぎんろう", "火花": "ひばな", "丹恒": "たんこう", "長夜月": "ちょうやづき",
    "黄泉": "よみ", "花火": "はなび", "帰忘の流離人": "きぼうのさすらいびと", "霊砂": "れいさ", "雲璃": "うんり", "飛霄": "ひしょう", "椒丘": "しょうきゅう",
    "鏡流": "けいりゅう", "白露": "びゃくろ", "彦卿": "げんきょう", "符玄": "ふげん", "刃": "じん", "景元": "けいげん", "羅刹": "らせつ", "三月なのか": "みつきなのか",
    "寒鴉": "かんあ", "雪衣": "せつい", "桂乃芬": "けいないふん", "御空": "ぎょくう", "素裳": "すしょう", "停雲": "ていうん", "青雀": "せいじゃく"
  };
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const fmt = (value) => Math.round(num(value)).toLocaleString("ja-JP");
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const ATTACK_LABELS = { normal: "通常攻撃", enhancedNormal: "強化通常攻撃", skill: "戦闘スキル", enhancedSkill: "強化戦闘スキル", ultimate: "必殺技", followUp: "追加攻撃", additional: "付加ダメージ", dot: "持続ダメージ", manual: "手動倍率" };
  const TARGET_LABELS = { single: "単体", blast: "拡散", aoe: "全体", bounce: "バウンド", adjacent: "隣接対象" };

  const state = {
    data: null,
    characterId: "", coneId: "", relicId: "", relicSecondId: "", relicMode: "4pc", ornamentId: "",
    level: 80, eidolon: 0, coneLevel: 80, coneRank: 1, traceLevels: { normal: 6, skill: 10, ultimate: 10 }, source: "manual",
    stats: { hp: 0, atk: 0, def: 0, speed: 100, critRate: 5, critDamage: 50, breakEffect: 0, effectHitRate: 0, effectRes: 0, energyRegen: 100, damageBonus: 0 },
    party: Array.from({ length: 3 }, () => ({ characterId: "", effectId: "", level: 10, category: "damageBonus", value: 0, enabled: false })),
    enemyId: "3001020",
    enemy: { level: 80, resistance: 20, weakness: false, toughnessActive: true, maxToughness: 30, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0 },
    attackId: "manual", attackLevel: 10, attackConditions: {}, selectionType: "", selectionFilters: { element: new Set(), rarity: new Set(), path: new Set() }, partySlot: -1, conditionTab: "手動", initialized: false,
    conditions: [
      { id: "damage", tab: "手動", name: "ダメージバフ", description: "現在の攻撃へ加算するダメージバフ", source: "手動入力", category: "damageBonus", value: 0, enabled: false, appliesTo: "現在の攻撃" },
      { id: "vulnerability", tab: "敵", name: "被ダメージ増加", description: "敵へ付与された被ダメージ増加", source: "敵デバフ", category: "takenDamage", value: 0, enabled: false, appliesTo: "敵単体" },
      { id: "def-reduction", tab: "敵", name: "防御ダウン", description: "敵の防御力を低下", source: "敵デバフ", category: "defenseReduction", value: 0, enabled: false, appliesTo: "敵単体" },
      { id: "def-ignore", tab: "自身", name: "防御無視", description: "計算対象の攻撃が無視する防御割合", source: "自身・装備", category: "defenseIgnore", value: 0, enabled: false, appliesTo: "自身" },
      { id: "res-pen", tab: "自身", name: "属性耐性貫通", description: "計算対象属性の耐性貫通", source: "自身・装備", category: "resistancePenetration", value: 0, enabled: false, appliesTo: "自身" }
    ]
  };

  function find(collection, id) { return state.data?.[collection]?.find((item) => item.id === id) || null; }
  function character() { return find("characters", state.characterId); }
  function cone() { return find("lightCones", state.coneId); }
  function relic() { return find("relicSets", state.relicId); }
  function relicSecond() { return find("relicSets", state.relicSecondId); }
  function ornament() { return find("relicSets", state.ornamentId); }
  function enemyPreset() { return find("enemies", state.enemyId); }
  function attack() { return find("attacks", state.attackId); }
  function modifierRule(id) { return find("modifiers", id); }
  function partyRules(characterId) { return state.data?.modifiers?.filter((item) => item.sourceId === characterId) || []; }
  function partyRuleValue(member, rule = modifierRule(member.effectId)) { const values = rule?.valuesByLevel || []; return values.length ? num(values[Math.max(0, Math.min(values.length - 1, num(member.level, rule.defaultLevel) - 1))]) : num(member.value); }
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
    $(id).innerHTML = Array.from({ length: end - start + 1 }, (_, index) => start + index)
      .map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${esc(label(value))}</option>`).join("");
  }

  function renderStaticInputs() {
    fillRange("hsrEidolon", 0, 6, state.eidolon, (value) => `星魂${value}`);
    fillRange("hsrConeRank", 1, 5, state.coneRank, (value) => `重畳${value}`);
    fillRange("hsrNormalTrace", 1, 10, state.traceLevels.normal, (value) => `通常 Lv${value}`);
    fillRange("hsrSkillTrace", 1, 15, state.traceLevels.skill, (value) => `スキル Lv${value}`);
    fillRange("hsrUltimateTrace", 1, 15, state.traceLevels.ultimate, (value) => `必殺技 Lv${value}`);
    fillRange("hsrAttackLevel", 1, 15, state.attackLevel, (value) => `Lv${value}`);
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
    $("hsrInputProvenance").textContent = state.source === "api" ? "UID取得値（編集可能）" : state.source === "api-edited" ? "UID取得値を手動変更" : "手動入力値";
    $("hsrResultBuildSummary").textContent = char ? `${char.name} / ${lightCone?.name || "光円錐未選択"}` : "未選択";
    renderAttacks(); renderPartySummary();
  }

  function writeStats() {
    Object.entries(state.stats).forEach(([key, value]) => { const input = $("hsrStat-" + key); if (input) input.value = String(Math.round(num(value) * 1000) / 1000); });
    $("hsrLevel").value = state.level; $("hsrConeLevel").value = state.coneLevel; renderActionValue();
  }

  function catalogStats() {
    const char = character(); if (!char) return;
    const lightCone = cone();
    state.stats.hp = num(char.base.hp) + num(lightCone?.base.hp);
    state.stats.atk = num(char.base.atk) + num(lightCone?.base.atk);
    state.stats.def = num(char.base.def) + num(lightCone?.base.def);
    state.stats.speed = num(char.base.speed, 100); state.stats.critRate = 5; state.stats.critDamage = 50;
    state.source = "manual"; writeStats();
  }

  function collectInputs() {
    document.querySelectorAll("[data-stat]").forEach((input) => { state.stats[input.dataset.stat] = num(input.value); });
    state.level = num($("hsrLevel").value, 80); state.eidolon = num($("hsrEidolon").value); state.coneLevel = num($("hsrConeLevel").value, 80); state.coneRank = num($("hsrConeRank").value, 1); state.traceLevels = { normal: num($("hsrNormalTrace").value, 6), skill: num($("hsrSkillTrace").value, 10), ultimate: num($("hsrUltimateTrace").value, 10) };
    state.enemy = { level: num($("hsrEnemyLevel").value, 80), resistance: num($("hsrEnemyResistance").value), weakness: $("hsrWeakness").checked,
      toughnessActive: $("hsrToughnessActive").checked, maxToughness: num($("hsrMaxToughness").value, 30), defenseReduction: num($("hsrEnemyDefenseReduction").value),
      defenseIgnore: num($("hsrEnemyDefenseIgnore").value), resistancePenetration: num($("hsrEnemyResistancePenetration").value), takenDamage: num($("hsrEnemyTakenDamage").value) };
  }

  function renderAttacks() {
    const attacks = state.data.attacks.filter((item) => item.characterId === state.characterId);
    if (!attacks.some((item) => item.id === state.attackId)) state.attackId = attacks[0]?.id || "manual";
    $("hsrAttackSelect").innerHTML = attacks.map((item) => `<option value="${item.id}"${item.id === state.attackId ? " selected" : ""}>${esc(item.name)}</option>`).join("") + `<option value="manual"${state.attackId === "manual" ? " selected" : ""}>手動倍率</option>`;
    const selected = attack(); $("hsrManualMultiplier").disabled = Boolean(selected);
    $("hsrAttackSupportNote").textContent = selected ? `${ATTACK_LABELS[selected.type] || selected.type} / ${TARGET_LABELS[selected.target] || selected.target} / ${selected.scalingStat.toUpperCase()}参照` : character() ? "手動倍率です。固有処理は自動適用しません。" : "キャラクターを選択してください。";
    $("hsrResultAttackSummary").textContent = `${enemyPreset()?.name || "カスタム"} / ${selected?.name || "手動倍率"}`;
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
    const items = selectionItems(state.selectionType); const characterMode = ["character", "party"].includes(state.selectionType); const equipmentMode = ["cone", "relic", "relicSecond", "ornament"].includes(state.selectionType);
    const group = (label, key, values) => `<div class="genshin-filter-row" role="group" aria-label="${esc(label)}">${[...new Set(values.filter(Boolean))].sort().map((value) => {
      const element = key === "element" ? items.find((item) => item.elementName === value)?.element : "";
      const content = element ? `<img src="${elementIcon(element)}" alt="" width="30" height="30">` : key === "rarity" ? `★${esc(value)}` : esc(value);
      return `<button type="button" class="genshin-filter-button${element ? " genshin-filter-button--element" : ""}" data-filter-group="${key}" data-filter-value="${esc(value)}" aria-label="${esc(value)}" title="${esc(value)}" aria-pressed="false">${content}</button>`;
    }).join("")}</div>`;
    let html = ""; if (characterMode) html += group("属性", "element", items.map((item) => item.elementName)); if (characterMode || state.selectionType === "cone") html += group("レアリティ", "rarity", items.map((item) => String(item.rarity))); if (characterMode || equipmentMode) html += group(["relic", "relicSecond", "ornament"].includes(state.selectionType) ? "種別" : "運命", "path", items.map((item) => item.pathName || item.type));
    if (html) html += '<div class="genshin-filter-row"><button type="button" class="genshin-filter-toggle-all" id="hsrFilterClear" disabled>フィルタ解除</button></div>';
    $("hsrSelectionFilters").innerHTML = html;
  }

  function renderSelectionList() {
    const query = normalizeSearchText($("hsrSelectionSearch").value);
    const { element, rarity, path } = state.selectionFilters;
    const items = selectionItems(state.selectionType).filter((item) => (!query || searchText(item).includes(query)) && (!element.size || element.has(item.elementName)) && (!rarity.size || rarity.has(String(item.rarity))) && (!path.size || path.has(item.pathName || item.type)));
    const canClear = ["cone", "relic", "relicSecond", "ornament", "party"].includes(state.selectionType);
    const clearCard = canClear ? `<button type="button" class="genshin-selection-option" data-selection-id=""><img class="genshin-selection-option-image" src="${FALLBACK}" alt="" width="48" height="48" loading="lazy"><span class="genshin-selection-option-copy"><strong>選択しない</strong><span>設定を解除</span></span></button>` : "";
    const cards = items.map((item) => { const element = item.element ? `<span class="genshin-selection-option-badges"><img class="genshin-selection-element-icon" src="${elementIcon(item.element)}" alt="${esc(item.elementName)}" width="20" height="20"></span>` : ""; const meta = state.selectionType === "enemy" ? `Lv${item.level} / 耐性${item.resistance}% / 最大靭性${item.maxToughness}` : item.elementName ? `${item.pathName} / ★${item.rarity}` : `${item.pathName || (item.type === "ornament" ? "オーナメント" : "遺物")} / ★${item.rarity || "-"}`; return `<button type="button" class="genshin-selection-option${item.id === currentSelectionId() ? " is-selected" : ""}" data-selection-id="${item.id}" aria-label="${esc(`${item.name}、${item.elementName || meta}`)}"><img class="genshin-selection-option-image" src="${esc(imageUrl(item.image))}" alt="" width="48" height="48" loading="lazy">${element}<span class="genshin-selection-option-copy"><strong>${esc(item.name)}</strong><span>${esc(meta)}</span></span></button>`; }).join("");
    $("hsrSelectionList").innerHTML = clearCard + cards || '<p class="genshin-selection-empty">条件に一致する候補がありません。フィルターを切り替えてください。</p>';
    $("hsrSelectionSummary").textContent = `${items.length}件を表示`;
    $("hsrSelectionList").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  function openSelection(type, slot = -1) {
    state.selectionType = type; state.partySlot = slot;
    const labels = { character: "キャラクター", party: "パーティメンバー", cone: "光円錐", relic: "遺物", relicSecond: "2つ目の遺物セット", ornament: "次元界オーナメント", enemy: "敵" };
    const kickers = { character: "CHARACTER", party: "CHARACTER", cone: "LIGHT CONE", relic: "RELIC SET", relicSecond: "RELIC SET", ornament: "PLANAR ORNAMENT", enemy: "ENEMY" };
    $("hsrSelectionKicker").textContent = kickers[type];
    $("hsrSelectionTitle").textContent = `${labels[type]}を選択`;
    $("hsrSelectionDialog").dataset.selectionType = type;
    $("hsrSelectionSearch").value = ""; $("hsrSelectionSearchClear").disabled = true; populateSelectionFilters(); renderSelectionList();
    $("hsrSelectionDialog").showModal(); document.body.classList.add("modal-open");
    if (window.matchMedia("(min-width: 769px)").matches) $("hsrSelectionSearch").focus();
  }

  function closeDialog(dialog) {
    if (dialog?.open) dialog.close();
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("modal-open");
  }

  function chooseSelection(id) {
    const type = state.selectionType;
    if (type === "party") {
      const member = state.party[state.partySlot]; member.characterId = id; const firstRule = partyRules(id)[0]; member.effectId = firstRule?.id || ""; member.level = firstRule?.defaultLevel || 10; member.category = firstRule?.category || "damageBonus"; member.value = firstRule ? partyRuleValue(member, firstRule) : 0; member.enabled = false; renderPartyDialog();
    } else if (type === "enemy") {
      applyEnemy(id);
    } else {
      state[type + "Id"] = id;
      if (type === "character") { state.coneId = ""; catalogStats(); }
      if (type === "cone") catalogStats();
      renderBuild();
    }
    closeDialog($("hsrSelectionDialog")); markDirty();
  }

  function renderPartyDialog() {
    $("hsrPartyRows").innerHTML = state.party.map((member, index) => {
      const item = find("characters", member.characterId);
      const rules = partyRules(member.characterId); const rule = modifierRule(member.effectId); const value = rule ? partyRuleValue(member, rule) : member.value;
      const effectOptions = '<option value="">構造化済み効果を選択</option>' + rules.map((entry) => `<option value="${entry.id}"${entry.id === member.effectId ? " selected" : ""}>${esc(entry.name)}</option>`).join("") + `<option value="manual"${member.effectId === "manual" ? " selected" : ""}>手動補正</option>`;
      const manual = member.effectId === "manual";
      return `<article class="hsr-party-slot"><img src="${esc(imageUrl(item?.image))}" alt="" width="72" height="72" loading="lazy"><div class="hsr-party-slot-copy"><strong>メンバー${index + 2}: ${esc(item?.name || "未設定")}</strong><button type="button" class="teti-button teti-button-secondary" data-party-select="${index}">キャラを選択</button><label>利用する効果<select data-party-field="effectId" data-slot="${index}"${item ? "" : " disabled"}>${effectOptions}</select></label>${manual ? `<label>補正種別<select data-party-field="category" data-slot="${index}"><option value="damageBonus"${member.category === "damageBonus" ? " selected" : ""}>ダメージバフ</option><option value="takenDamage"${member.category === "takenDamage" ? " selected" : ""}>敵の被ダメ増加</option><option value="defenseReduction"${member.category === "defenseReduction" ? " selected" : ""}>防御ダウン</option><option value="resistancePenetration"${member.category === "resistancePenetration" ? " selected" : ""}>耐性貫通</option></select></label>` : ""}</div><div><label>軌跡Lv<input type="number" min="1" max="15" data-party-field="level" data-slot="${index}" value="${member.level}"${rule ? "" : " disabled"}></label><label>効果量<input type="number" data-party-field="value" data-slot="${index}" value="${value}" step="0.1"${manual ? "" : " readonly"}></label><label class="hsr-check-field"><input type="checkbox" data-party-field="enabled" data-slot="${index}"${member.enabled ? " checked" : ""}${item && member.effectId ? "" : " disabled"}>発動条件を満たす</label>${rule ? `<p>${esc(rule.trigger)} / 適用対象: ${esc(rule.appliesTo)} / ${esc(rule.operation)}</p>` : `<p>${item ? "このキャラクターは自動対応効果が未登録です。手動補正は明示して利用できます。" : "先にキャラクターを選択してください。"}</p>`}</div></article>`;
    }).join("");
    $("hsrPartyRows").querySelectorAll("img").forEach((image) => { image.onerror = fixImage; });
  }

  function collectParty() {
    $("hsrPartyRows").querySelectorAll("[data-party-field]").forEach((input) => {
      const member = state.party[num(input.dataset.slot)]; const field = input.dataset.partyField;
      member[field] = input.type === "checkbox" ? input.checked : field === "value" ? num(input.value) : input.value;
    });
    state.party.forEach((member) => { member.level = num(member.level, 10); const rule = modifierRule(member.effectId); if (rule) { member.category = rule.category; member.value = partyRuleValue(member, rule); } });
    renderPartySummary(); updateConditionSummary(); markDirty();
  }

  function renderPartySummary() {
    const names = state.party.map((member) => find("characters", member.characterId)?.name).filter(Boolean);
    $("hsrPartySummary").textContent = names.length ? names.join("、") : "サポートメンバーは未設定です。";
  }

  function renderConditions() {
    const conditions = allConditions(); const tabs = [...new Set(conditions.map((item) => item.tab))];
    if (!tabs.includes(state.conditionTab)) state.conditionTab = tabs[0];
    $("hsrConditionTabs").innerHTML = tabs.map((tab) => `<button type="button" role="tab" data-condition-tab="${esc(tab)}" aria-selected="${tab === state.conditionTab}">${esc(tab)}</button>`).join("");
    $("hsrConditionList").innerHTML = conditions.filter((item) => item.tab === state.conditionTab).map((item) => `<label class="hsr-condition-row"><input type="checkbox" data-condition-enabled="${item.id}"${item.enabled ? " checked" : ""}><span><strong>${esc(item.name)}</strong><p>${esc(item.description)} / 適用対象: ${esc(item.appliesTo)}</p></span><input type="number" data-condition-value="${item.id}" value="${item.value}" step="0.1" aria-label="${esc(item.name)}の効果量"${item.locked ? " readonly" : ""}></label>`).join("");
  }

  function attackCondition() {
    const selected = attack(); const condition = selected?.condition; if (!condition) return null;
    const index = Math.max(0, Math.min(condition.bonusMultipliers.length - 1, num($("hsrAttackLevel")?.value, state.attackLevel) - 1));
    const id = `attack:${selected.id}:${condition.id}`;
    return { id, tab: "攻撃", name: condition.label, description: `${selected.name}の攻撃倍率へ加算`, source: `${character()?.name || "キャラクター"} / ${selected.name}`, category: "attackMultiplier", value: num(condition.bonusMultipliers[index]), enabled: Boolean(state.attackConditions[id]), appliesTo: `${selected.name}のみ`, locked: true, applicable: true };
  }

  function partyConditions() {
    return state.party.map((member, index) => { const selected = find("characters", member.characterId); const rule = modifierRule(member.effectId); if (!selected || !member.effectId) return null; return { id: `party:${index}`, tab: "パーティ", name: rule?.name || `${selected.name}の手動補正`, description: rule?.trigger || "手動で発動条件を指定", source: selected.name, category: rule?.category || member.category, value: rule ? partyRuleValue(member, rule) : member.value, enabled: member.enabled, appliesTo: rule?.appliesTo || "現在の計算対象", locked: Boolean(rule), applicable: true }; }).filter(Boolean);
  }

  function allConditions() { const conditional = attackCondition(); return state.conditions.concat(partyConditions(), conditional ? [conditional] : []); }

  function updateConditionSummary() {
    const active = allConditions().filter((item) => item.enabled).length;
    $("hsrConditionTitle").textContent = active ? `${active}件の補正を適用` : "適用する補正はありません";
    $("hsrConditionHelp").textContent = "条件付き効果はチェックした項目だけ計算します。";
  }

  function applyEnemy(id) {
    state.enemyId = id; const item = enemyPreset();
    $("hsrEnemySelect").value = item ? id : "custom";
    if (item) Object.assign(state.enemy, item);
    $("hsrEnemyLevel").value = state.enemy.level; $("hsrEnemyResistance").value = state.enemy.resistance;
    $("hsrWeakness").checked = state.enemy.weakness; $("hsrToughnessActive").checked = state.enemy.toughnessActive;
    $("hsrMaxToughness").value = state.enemy.maxToughness;
    setImage("hsrEnemyImage", item?.image, item?.name); $("hsrEnemyName").textContent = item?.name || "カスタム敵";
    $("hsrEnemySummary").textContent = item ? `Lv${item.level} / 耐性${item.resistance}% / 最大靭性${item.maxToughness}` : "入力値を個別に編集します。";
    renderAttacks(); markDirty();
  }

  function modifiers() {
    return allConditions().map((item) => ({ ...item, applicable: item.applicable !== false, reason: item.enabled ? "" : "発動条件が無効" }));
  }

  function resolvedAttack() {
    const selected = attack();
    if (!selected) return { name: "手動倍率", type: "manual", target: "single", scalingStat: "atk", multiplier: num($("hsrManualMultiplier").value, 100), hitCount: 1, canCrit: true };
    const index = Math.max(0, Math.min(selected.multipliers.length - 1, num($("hsrAttackLevel").value, 1) - 1));
    const conditional = attackCondition(); const bonus = conditional?.enabled ? conditional.value : 0;
    return { ...selected, multiplier: selected.multipliers[index] + bonus, adjacentMultiplier: selected.adjacentMultipliers?.[index] || 0 };
  }

  function renderWarnings(warnings) {
    $("hsrWarnings").hidden = !warnings.length;
    $("hsrWarnings").innerHTML = warnings.length ? `<ul>${warnings.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  }

  function renderResults(result, adjacent, breakResult) {
    $("hsrResults").innerHTML = `<div class="genshin-result-tabs" role="tablist"><button type="button" data-result-tab="damage" aria-selected="true">ダメージ</button><button type="button" data-result-tab="breakdown">計算内訳</button><button type="button" data-result-tab="modifiers">補正</button></div>
      <section data-result-panel="damage"><p class="genshin-help">${esc(result.attack.name)} / ${esc(TARGET_LABELS[result.attack.target] || result.attack.target)} / ${result.attack.hitCount}ヒット</p><div class="hsr-result-cards"><div class="hsr-result-card"><span>非会心</span><strong>${fmt(result.nonCrit)}</strong></div><div class="hsr-result-card"><span>会心</span><strong>${fmt(result.crit)}</strong></div><div class="hsr-result-card"><span>期待値</span><strong>${fmt(result.expected)}</strong></div></div><p>1ヒット: 非会心 ${fmt(result.perHit.nonCrit)} / 会心 ${fmt(result.perHit.crit)} / 期待値 ${fmt(result.perHit.expected)}</p>${adjacent ? `<p>隣接対象: 非会心 ${fmt(adjacent.nonCrit)} / 会心 ${fmt(adjacent.crit)} / 期待値 ${fmt(adjacent.expected)}</p>` : ""}<p>弱点撃破: ${breakResult.supported ? fmt(breakResult.value) : esc(breakResult.reason)}</p></section>
      <section data-result-panel="breakdown" hidden class="hsr-result-details"><dl><div><dt>参照値</dt><dd>${fmt(result.breakdown.referenceValue)}</dd></div><div><dt>倍率</dt><dd>${result.breakdown.multiplierPercent}%</dd></div><div><dt>基礎ダメージ</dt><dd>${fmt(result.breakdown.baseDamage)}</dd></div><div><dt>ダメージバフ</dt><dd>${result.breakdown.damageBonus}%</dd></div><div><dt>防御補正</dt><dd>${result.breakdown.defense.toFixed(4)}</dd></div><div><dt>耐性補正</dt><dd>${result.breakdown.resistance.toFixed(4)}</dd></div><div><dt>靭性補正</dt><dd>${result.breakdown.toughness.toFixed(2)}</dd></div><div><dt>被ダメ増加</dt><dd>${result.breakdown.takenDamage}%</dd></div></dl></section>
      <section data-result-panel="modifiers" hidden class="hsr-result-details"><h3>適用した補正</h3><ul>${result.applied.length ? result.applied.map((item) => `<li>${esc(item.name)} +${item.value}%（${esc(item.source)}）</li>`).join("") : "<li>なし</li>"}</ul><h3>適用しなかった補正</h3><ul>${result.skipped.length ? result.skipped.map((item) => `<li>${esc(item.name)}: ${esc(item.reason || "条件が無効")}</li>`).join("") : "<li>なし</li>"}</ul></section>`;
  }

  function calculate() {
    collectInputs(); const warnings = [];
    if (!character()) warnings.push("キャラクターを選択してください。");
    if (state.attackId === "manual") warnings.push("手動倍率では固有処理、付加ダメージ、持続ダメージを自動適用しません。");
    if (cone() || relic() || relicSecond() || ornament()) warnings.push("光円錐・遺物・オーナメントの条件付き効果は自動適用しません。UID取得ステータスまたは補正条件へ明示した値だけを使用します。");
    if (!character()) { renderWarnings(warnings); return; }
    const selected = resolvedAttack();
    const request = { character: { level: state.level, stats: state.stats }, enemy: state.enemy, attack: selected, modifiers: modifiers() };
    const result = window.HsrCalcEngine.calculate(request);
    const adjacent = selected.adjacentMultiplier ? window.HsrCalcEngine.calculate({ ...request, attack: { ...selected, multiplier: selected.adjacentMultiplier, target: "adjacent" } }) : null;
    const breakResult = window.HsrCalcEngine.calculateBreak({ character: request.character, enemy: state.enemy, element: selected.element || character().element, modifiers: request.modifiers, breakBaseDamage: state.data.breakBaseDamage });
    renderWarnings(warnings); renderResults(result, adjacent, breakResult); $("hsrDirtyNotice").hidden = true;
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

  function showDetails(type) {
    const item = type === "character" ? character() : type === "cone" ? cone() : type === "relic" ? relic() : type === "relicSecond" ? relicSecond() : ornament(); if (!item) return;
    $("hsrDetailsTitle").textContent = item.name;
    const base = item.base ? `<dl><div><dt>ゲーム内ID</dt><dd>${esc(item.id)}</dd></div><div><dt>運命</dt><dd>${esc(item.pathName)}</dd></div><div><dt>Lv80基礎HP</dt><dd>${fmt(item.base.hp)}</dd></div><div><dt>Lv80基礎攻撃力</dt><dd>${fmt(item.base.atk)}</dd></div><div><dt>Lv80基礎防御力</dt><dd>${fmt(item.base.def)}</dd></div></dl>` : `<dl><div><dt>ゲーム内ID</dt><dd>${esc(item.id)}</dd></div><div><dt>セット種別</dt><dd>${item.type === "ornament" ? "次元界オーナメント" : "トンネル遺物"}</dd></div></dl>`;
    const extra = type === "character" ? `<h3>星魂</h3><ul>${item.eidolons.map((row) => `<li><strong>${row.rank}: ${esc(cleanGameText(row.name))}</strong><br>${esc(formatGameText(row.description, []))}</li>`).join("")}</ul><h3>追加能力・軌跡</h3><ul>${item.traces.filter((row) => row.name).map((row) => `<li><strong>${esc(cleanGameText(row.name))}</strong><br>${esc(formatGameText(row.description || "ステータスノード", row.params?.[0] || []))}</li>`).join("")}</ul>` : type === "cone" ? `<h3>${esc(cleanGameText(item.effect?.name || "光円錐効果"))}</h3><p>${esc(formatGameText(item.effect?.description || "効果データなし", item.effect?.paramsByRank?.[state.coneRank - 1] || []))}</p>` : `<h3>セット効果</h3><ul>${item.effects.map((effect) => `<li><strong>${effect.pieces}セット</strong><br>${esc(formatGameText(effect.description || "説明なし", effect.params || []))}</li>`).join("")}</ul>`;
    $("hsrDetailsBody").innerHTML = `<div class="genshin-equipment-detail-summary"><img src="${esc(imageUrl(item.image))}" alt="" width="112" height="112"><div><p>${esc(item.elementName || item.pathName || (item.type === "ornament" ? "次元界オーナメント" : "トンネル遺物"))}</p><strong>${item.rarity ? `★${item.rarity}` : "セット装備"}</strong></div></div>${base}${extra}`;
    $("hsrDetailsBody").querySelector("img").onerror = fixImage; $("hsrDetailsDialog").showModal();
  }

  function applyProfileCharacter(profile) {
    const char = find("characters", String(profile.id)); if (char) state.characterId = char.id;
    const lightCone = find("lightCones", String(profile.lightCone?.id || "")); state.coneId = lightCone?.id || "";
    const profileSets = profile.relicSets || []; const tunnels = profileSets.filter((set) => num(set.id) < 300); const planar = profileSets.find((set) => num(set.id) >= 300); state.relicId = find("relicSets", tunnels[0]?.id)?.id || ""; state.relicSecondId = find("relicSets", tunnels[1]?.id)?.id || ""; state.relicMode = state.relicSecondId ? "2+2" : "4pc"; state.ornamentId = find("relicSets", planar?.id)?.id || "";
    state.level = num(profile.level, 80); state.eidolon = num(profile.eidolon); state.coneLevel = num(profile.lightCone?.level, 80); state.coneRank = num(profile.lightCone?.rank, 1);
    const trace = (type, fallback) => num(profile.traces?.find((item) => item.type === type)?.level, fallback); state.traceLevels = { normal: trace("Normal", 6), skill: trace("BPSkill", 10), ultimate: trace("Ultra", 10) };
    Object.keys(state.stats).forEach((key) => { if (Number.isFinite(Number(profile.stats?.[key]))) state.stats[key] = Number(profile.stats[key]); });
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
    $("hsrPartyDialogOpen").addEventListener("click", () => { renderPartyDialog(); $("hsrPartyDialog").showModal(); });
    $("hsrPartyDialogClose").addEventListener("click", () => closeDialog($("hsrPartyDialog")));
    $("hsrPartyDialogApply").addEventListener("click", () => { collectParty(); closeDialog($("hsrPartyDialog")); });
    $("hsrPartyRows").addEventListener("click", (event) => { const button = event.target.closest("[data-party-select]"); if (button) { collectParty(); openSelection("party", num(button.dataset.partySelect)); } });
    $("hsrConditionDialogOpen").addEventListener("click", () => { renderConditions(); $("hsrConditionDialog").showModal(); });
    $("hsrConditionDialogClose").addEventListener("click", () => closeDialog($("hsrConditionDialog")));
    $("hsrConditionDialog").addEventListener("click", (event) => { const tab = event.target.closest("[data-condition-tab]"); if (tab) { state.conditionTab = tab.dataset.conditionTab; renderConditions(); } });
    $("hsrConditionDialog").addEventListener("change", (event) => {
      const id = event.target.dataset.conditionEnabled || event.target.dataset.conditionValue; if (!id) return;
      if (id.startsWith("party:")) {
        const member = state.party[num(id.split(":")[1])]; if (member && event.target.dataset.conditionEnabled) member.enabled = event.target.checked;
      } else if (id.startsWith("attack:")) {
        if (event.target.dataset.conditionEnabled) state.attackConditions[id] = event.target.checked;
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
    $("hsrEnemySelect").addEventListener("change", (event) => applyEnemy(event.target.value));
    $("hsrAttackSelect").addEventListener("change", (event) => { state.attackId = event.target.value; renderAttacks(); markDirty(); });
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
