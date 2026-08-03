(function () {
  "use strict";

  const TEXT = {
    required: "UIDを入力してください",
    numbersOnly: "UIDは数字のみで入力してください",
    tooShort: "UIDが短すぎます",
    loading: "取得中...",
    search: "UID検索",
    notFound: "UIDが間違っているか、キャラクター詳細が公開されていません",
    network: "通信に失敗しました",
    noCharacters: "公開キャラクターが設定されていません",
    fetched: "公開プロフィールを取得しました。数値ステータスを入力欄へ反映できます。",
    appliedSuffix: "の情報を入力欄へ反映しました。必要に応じて手動で修正できます。",
    savedUidRemoved: "このブラウザに保存したUIDを削除しました。"
  };
  const $ = (id) => document.getElementById(id);
  const FALLBACK = "/games/images/genshin/fallback.webp";
  const ELEMENT_KEYS = { "物理": "Physical", "炎": "Fire", "氷": "Ice", "雷": "Thunder", "風": "Wind", "量子": "Quantum", "虚数": "Imaginary" };
  const TRACE_LABELS = { Normal: "通常攻撃", BPSkill: "戦闘スキル", Ultra: "必殺技", Talent: "天賦", Maze: "秘技", MemospriteSkill: "精霊スキル", MemospriteTalent: "精霊天賦", ElationDamage: "愉悦スキル" };
  const STAT_ICON_NAMES = { HP: "IconMaxHP.png", 攻撃力: "IconAttack.png", 防御力: "IconDefence.png", 速度: "IconSpeed.png", 会心率: "IconCriticalChance.png", 会心ダメージ: "IconCriticalDamage.png", 撃破特効: "IconBreakUp.png", 効果命中: "IconStatusProbability.png", 効果抵抗: "IconStatusResistance.png", EP回復効率: "IconEnergyRecovery.png", 愉悦度: "IconJoy.png" };
  const PROPERTY_LABELS = { HPAddedRatio: "HP", HPDelta: "HP", AttackAddedRatio: "攻撃力", AttackDelta: "攻撃力", DefenceAddedRatio: "防御力", DefenceDelta: "防御力", SpeedAddedRatio: "速度", SpeedDelta: "速度", CriticalChanceBase: "会心率", CriticalChance: "会心率", CriticalDamageBase: "会心ダメージ", CriticalDamage: "会心ダメージ", BreakDamageAddedRatioBase: "撃破特効", BreakDamageAddedRatio: "撃破特効", StatusProbabilityBase: "効果命中", StatusProbability: "効果命中", StatusResistanceBase: "効果抵抗", StatusResistance: "効果抵抗", SPRatioBase: "EP回復効率", ElationDamageAddedRatioBase: "愉悦度", ElationDamageAddedRatio: "愉悦度", PhysicalAddedRatio: "物理属性ダメージ", FireAddedRatio: "炎属性ダメージ", IceAddedRatio: "氷属性ダメージ", ThunderAddedRatio: "雷属性ダメージ", WindAddedRatio: "風属性ダメージ", QuantumAddedRatio: "量子属性ダメージ", ImaginaryAddedRatio: "虚数属性ダメージ" };
  const state = { profile: null, selectedCharacter: null, loading: false };
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const fmt = (value, suffix = "") => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100) / 100}${suffix}` : "-";

  function imageUrl(value) {
    if (!value) return FALLBACK;
    if (/^https?:\/\//.test(value) || String(value).startsWith("/games/")) return value;
    return `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/${String(value).replace(/^\//, "")}`;
  }

  function elementIcon(element) {
    const key = ELEMENT_KEYS[element] || element;
    return key ? `/games/images/hsr/elements/${key}.png` : "";
  }

  function cleanGameText(value) {
    return String(value || "")
      .replace(/\{RUBY_B#[^}]*\}/g, "")
      .replace(/\{RUBY_E#\}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\\n/g, "\n")
      .trim();
  }

  function formatGameText(value, params = []) {
    return cleanGameText(value).replace(/#(\d+)\[(?:i|f1|f2)\](%?)/g, (_match, rawIndex, percent) => {
      const parameter = Number(params[Number(rawIndex) - 1]);
      if (!Number.isFinite(parameter)) return "—";
      const shown = percent ? parameter * 100 : parameter;
      return `${Math.round(shown * 100) / 100}${percent}`;
    });
  }

  function validate(uid) {
    if (!uid) return TEXT.required;
    if (!/^\d+$/.test(uid)) return TEXT.numbersOnly;
    if (uid.length < 8) return TEXT.tooShort;
    return "";
  }

  function setMessage(message, type = "") {
    const element = $("hsrUidMessage");
    element.textContent = message;
    element.dataset.type = type;
  }

  function setLoading(loading) {
    state.loading = loading;
    const button = $("hsrUidSearchButton");
    button.disabled = loading;
    button.textContent = loading ? TEXT.loading : TEXT.search;
  }

  function clearProfileResult() {
    state.profile = null;
    state.selectedCharacter = null;
    $("hsrUidResult").hidden = true;
    $("hsrPlayerInfo").hidden = true;
    $("hsrCharacterSelector").hidden = true;
    $("hsrCharacterDetail").hidden = true;
    $("hsrCharacterDetail").innerHTML = "";
  }

  function renderPlayer(profile) {
    $("hsrUidResult").hidden = false;
    $("hsrPlayerInfo").hidden = false;
    $("hsrPlayerInfo").innerHTML = `<div class="genshin-player-strip"><span><strong>${esc(profile.player.nickname)}</strong></span><span>開拓レベル ${fmt(profile.player.level)}</span><span>UID: ${esc(profile.player.uid)}</span></div>`;
  }

  function renderSelector(characters) {
    const select = $("hsrProfileCharacterSelect");
    select.innerHTML = characters.map((character, index) => `<option value="${index}">${esc(character.name)} Lv.${fmt(character.level)}</option>`).join("");
    $("hsrCharacterSelector").hidden = characters.length === 0;
  }

  function statItem(label, value, suffix = "") {
    const baseLabel = Object.keys(STAT_ICON_NAMES).find((name) => label === name || label.startsWith(name)) || "";
    const icon = baseLabel ? `/games/images/hsr/stats/${STAT_ICON_NAMES[baseLabel]}` : /属性ダメージ/.test(label) ? elementIcon(label.replace("属性ダメージ", "")) : "";
    return `<div><dt>${icon ? `<img class="genshin-profile-stat-icon" src="${icon}" alt="">` : ""}${esc(label)}</dt><dd>${fmt(value, suffix)}</dd></div>`;
  }

  function relicRows(character) {
    const sets = character.relicSets || [];
    const rows = sets.map((set) => {
      const type = Number(set.id) >= 300 ? "次元界オーナメント" : "遺物";
      return `<div class="genshin-uid-summary-row genshin-uid-artifact-row"><img class="genshin-uid-summary-image genshin-uid-artifact-image" src="${esc(imageUrl(set.image))}" alt=""><div class="genshin-uid-summary-copy"><strong>${esc(set.name)}</strong><span>${type}・${Math.min(set.pieces, 4)}セット</span></div></div>`;
    }).join("");
    return rows || `<div class="genshin-uid-summary-row genshin-uid-artifact-row"><img class="genshin-uid-summary-image genshin-uid-artifact-image" src="${FALLBACK}" alt=""><div class="genshin-uid-summary-copy"><strong>遺物セット未取得</strong></div></div>`;
  }

  function traceItem(character, type) {
    const trace = character.traces.find((item) => item.type === type);
    return statItem(TRACE_LABELS[type], trace?.level, "");
  }

  function renderSummary(character) {
    const cone = character.lightCone;
    const icon = elementIcon(character.element);
    return `<div class="genshin-uid-profile-summary">
      <div class="genshin-uid-character-row"><img class="genshin-uid-character-image" src="${esc(imageUrl(character.image))}" alt="" width="64" height="64"><div class="genshin-uid-character-copy"><strong>${esc(character.name)} <span class="genshin-uid-level">Lv.${fmt(character.level)}</span></strong><div class="genshin-uid-tags">${icon ? `<span class="genshin-uid-icon-tag genshin-uid-element-tag"><img src="${icon}" alt="${esc(character.element)}"></span>` : ""}<span class="genshin-uid-badge">${esc(character.path)}</span><span class="genshin-uid-badge genshin-uid-constellation">星魂${fmt(character.eidolon)}</span></div></div><button type="button" class="genshin-uid-details-button" id="hsrUidDetailsOpen">詳細</button></div>
      <div class="genshin-uid-summary-list"><div class="genshin-uid-summary-row"><img class="genshin-uid-summary-image" src="${esc(imageUrl(cone?.image))}" alt=""><div class="genshin-uid-summary-copy"><strong>${esc(cone?.name || "光円錐なし")}</strong><span>${cone ? `Lv.${fmt(cone.level)} / 重畳${fmt(cone.rank)}` : "公開情報なし"}</span></div></div>${relicRows(character)}</div>
      <div class="genshin-uid-two-col"><section><h5>軌跡レベル</h5><dl class="genshin-uid-talent-list">${traceItem(character, "Normal")}${traceItem(character, "BPSkill")}${traceItem(character, "Ultra")}${traceItem(character, "Talent")}${character.path === "記憶" ? traceItem(character, "MemospriteSkill") + traceItem(character, "MemospriteTalent") : ""}${character.path === "愉悦" ? traceItem(character, "ElationDamage") : ""}</dl></section><section><h5>ステータス</h5><div class="genshin-uid-summary-stats"><dl class="genshin-uid-stat-list">${statItem("HP", character.stats.hp)}${statItem("攻撃力", character.stats.atk)}${statItem("防御力", character.stats.def)}${statItem("速度", character.stats.speed)}</dl><dl class="genshin-uid-stat-list">${statItem("会心率", character.stats.critRate, "%")}${statItem("会心ダメージ", character.stats.critDamage, "%")}${statItem("撃破特効", character.stats.breakEffect, "%")}${statItem(`${character.element}属性ダメージ`, character.stats.damageBonus, "%")}${character.path === "愉悦" ? statItem("愉悦度", character.stats.elation, "%") : ""}</dl></div></section></div>
      <div class="genshin-profile-actions"><button type="button" class="teti-button teti-button-primary" id="hsrApplyProfileButton">この内容を入力欄へ反映</button><span>反映後も手動で編集できます</span></div>
    </div>`;
  }

  function selectedCatalogCharacter(character) {
    return window.HsrTool?.getState()?.data?.characters?.find((item) => String(item.id) === String(character.id));
  }

  function detailArticle(title, description, params) {
    if (!description) return "";
    return `<article class="genshin-uid-detail-item hsr-detail-card"><h4>${esc(cleanGameText(title))}</h4><p>${esc(formatGameText(description, params))}</p></article>`;
  }

  function uniqueDetailArticles(items, levelFor) {
    const seen = new Set();
    return items.map((item) => {
      const level = levelFor(item);
      const description = formatGameText(item.description, item.params?.[Math.max(0, level - 1)] || item.params?.[0] || []);
      const key = `${cleanGameText(item.name)}\n${description}`;
      if (!description || seen.has(key)) return "";
      seen.add(key);
      return detailArticle(item.name, description, []);
    }).join("");
  }

  function memospriteStatusArticles(skills, levelFor) {
    const seen = new Set();
    return skills.flatMap((item) => {
      const level = levelFor(item);
      const description = formatGameText(item.description, item.params?.[Math.max(0, level - 1)] || item.params?.[0] || []);
      return description.split(/(?<=[。！？])\s*/).filter((sentence) => /初期速度|初期最大HP|固定最大HP|記憶の精霊.*最大HP|最大HP.*記憶の精霊/.test(sentence));
    }).filter((sentence) => sentence && !seen.has(sentence) && seen.add(sentence)).map((sentence) => detailArticle("基礎ステータス", sentence, [])).join("");
  }

  function unlockedTraceSummary(character) {
    const totals = {};
    character.traces.filter((trace) => Number(trace.level) > 0).forEach((trace) => (trace.properties || []).forEach((property) => { totals[property.type] = (totals[property.type] || 0) + Number(property.value || 0); }));
    const rows = Object.entries(totals).filter(([type]) => PROPERTY_LABELS[type]).map(([type, value]) => {
      const label = PROPERTY_LABELS[type]; const flat = /Delta$/.test(type) && !/Ratio/.test(type); const shown = flat ? Math.round(value * 1000) / 1000 : `${Math.round(value * 100000) / 1000}%`;
      const iconName = STAT_ICON_NAMES[label]; const element = Object.values(ELEMENT_KEYS).find((key) => type.startsWith(key)); const icon = iconName ? `/games/images/hsr/stats/${iconName}` : element ? `/games/images/hsr/elements/${element}.png` : "";
      return `<div><dt>${icon ? `<img src="${icon}" alt="">` : ""}${esc(label)}</dt><dd>+${shown}</dd></div>`;
    }).join("");
    return rows ? `<section class="hsr-trace-summary"><h3>軌跡ステータス合計</h3><p>公開プロフィールで解放済みのノード</p><dl>${rows}</dl></section>` : "";
  }

  function renderUidDetails(character, activeTab = "character") {
    const dialog = $("hsrUidDetailsDialog");
    const catalog = selectedCatalogCharacter(character) || {};
    const cone = character.lightCone || {};
    const coneCatalog = window.HsrTool?.getState()?.data?.lightCones?.find((item) => String(item.id) === String(cone.id)) || {};
    const hasMemosprite = (catalog.skills || []).some((item) => ["MemospriteSkill", "MemospriteTalent"].includes(item.type));
    const hasElation = (catalog.skills || []).some((item) => item.type === "ElationDamage");
    const tabs = [{ id: "character", label: "軌跡" }, ...(hasMemosprite ? [{ id: "memosprite", label: "記憶の精霊" }] : []), ...(hasElation ? [{ id: "elation", label: "愉悦スキル" }] : []), { id: "equipment", label: "装備" }, { id: "status", label: "ステータス" }];
    if (!tabs.some((tab) => tab.id === activeTab)) activeTab = tabs[0].id;
    $("hsrUidDetailsTabs").innerHTML = tabs.map((tab) => `<button type="button" class="genshin-uid-details-tab${tab.id === activeTab ? " is-active" : ""}" data-uid-detail-tab="${tab.id}">${tab.label}</button>`).join("");
    $("hsrUidDetailsTitle").textContent = `${character.name} Lv.${fmt(character.level)}`;
    const traceLevel = (type) => character.traces.find((item) => item.type === type)?.level || 1;
    const skills = (catalog.skills || []).filter((item) => ["Normal", "BPSkill", "Ultra", "Talent", "Maze"].includes(item.type)).map((item) => detailArticle(item.name, item.description, item.params?.[Math.max(0, traceLevel(item.type) - 1)] || item.params?.[0] || [])).join("");
    const traces = (catalog.traces || []).filter((item) => item.name && item.description).map((item) => detailArticle(item.name, item.description, item.params?.[0] || [])).join("");
    const memospriteSkills = (catalog.skills || []).filter((item) => ["MemospriteSkill", "MemospriteTalent"].includes(item.type));
    const memosprite = uniqueDetailArticles(memospriteSkills, (item) => traceLevel(item.type));
    const memospriteStatus = memospriteStatusArticles(catalog.skills || [], (item) => traceLevel(item.type));
    const elation = (catalog.skills || []).filter((item) => item.type === "ElationDamage").map((item) => detailArticle(item.name, item.description, item.params?.[Math.max(0, traceLevel(item.type) - 1)] || item.params?.[0] || [])).join("");
    const eidolons = (catalog.eidolons || []).map((item) => detailArticle(`星魂${item.rank} ${item.name}`, item.description, [])).join("");
    const setDetails = (character.relicSets || []).map((set) => `<article class="genshin-uid-detail-item hsr-detail-card"><h4>${esc(set.name)} ${Math.min(set.pieces, 4)}セット</h4><p>${esc((set.effects || []).map((effect) => formatGameText(effect.description, effect.params || [])).filter(Boolean).join("\n") || "公開情報なし")}</p></article>`).join("");
    const sections = {
      character: `<section><div class="genshin-uid-detail-group"><h3>通常・スキル・必殺技・天賦</h3>${skills}</div><div class="genshin-uid-detail-group"><h3>追加能力</h3>${traces || "<p>追加能力はありません。</p>"}</div>${unlockedTraceSummary(character)}<div class="genshin-uid-detail-group"><h3>星魂</h3>${eidolons}</div></section>`,
      memosprite: `<section>${memospriteStatus ? `<div class="genshin-uid-detail-group"><h3>記憶の精霊ステータス</h3>${memospriteStatus}</div>` : ""}<div class="genshin-uid-detail-group"><h3>精霊スキル・精霊天賦</h3>${memosprite}</div></section>`,
      elation: `<section><div class="genshin-uid-detail-group"><h3>愉悦スキル</h3>${elation}</div></section>`,
      equipment: `<section><div class="genshin-uid-detail-group"><h3>${esc(cone.name || "光円錐なし")} ${cone.id ? `Lv.${fmt(cone.level)} / 重畳${fmt(cone.rank)}` : ""}</h3>${coneCatalog.effect?.description ? `<p>${esc(formatGameText(coneCatalog.effect.description, coneCatalog.effect?.paramsByRank?.[Math.max(0, Number(cone.rank || 1) - 1)] || []))}</p>` : "<p>公開情報なし</p>"}</div><div class="genshin-uid-detail-group"><h3>遺物・次元界オーナメント</h3>${setDetails || "<p>公開情報なし</p>"}</div></section>`,
      status: `<section><div class="genshin-uid-detail-group"><h3>ステータス</h3><div class="genshin-uid-modal-status-layout"><dl>${statItem("HP", character.stats.hp)}${statItem("攻撃力", character.stats.atk)}${statItem("防御力", character.stats.def)}${statItem("速度", character.stats.speed)}${statItem("撃破特効", character.stats.breakEffect, "%")}</dl><dl>${statItem("会心率", character.stats.critRate, "%")}${statItem("会心ダメージ", character.stats.critDamage, "%")}${statItem("効果命中", character.stats.effectHitRate, "%")}${statItem("効果抵抗", character.stats.effectRes, "%")}${statItem("EP回復効率", character.stats.energyRegen, "%")}${statItem(`${character.element}属性ダメージ`, character.stats.damageBonus, "%")}${character.path === "愉悦" ? statItem("愉悦度", character.stats.elation, "%") : ""}</dl></div></div></section>`
    };
    $("hsrUidDetailsBody").innerHTML = sections[activeTab] || sections.character;
    $("hsrUidDetailsTabs").querySelectorAll("[data-uid-detail-tab]").forEach((button) => button.addEventListener("click", () => renderUidDetails(character, button.dataset.uidDetailTab)));
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("modal-open");
  }

  function renderCharacterDetail(character) {
    state.selectedCharacter = character;
    const detail = $("hsrCharacterDetail");
    detail.hidden = false;
    detail.innerHTML = renderSummary(character);
    detail.querySelectorAll("img").forEach((image) => { image.onerror = () => { image.onerror = null; image.src = FALLBACK; }; });
    $("hsrUidDetailsOpen").addEventListener("click", () => renderUidDetails(character));
    $("hsrApplyProfileButton").addEventListener("click", () => {
      window.HsrTool?.applyProfileCharacter(character);
      setMessage(`${character.name} ${TEXT.appliedSuffix}`, "success");
    });
  }

  function selectCharacter(index) {
    const character = state.profile?.characters[index];
    if (character) renderCharacterDetail(character);
  }

  async function search() {
    if (state.loading) return;
    const uid = $("hsrUidInput").value.trim();
    const validationError = validate(uid);
    if (validationError) { setMessage(validationError, "error"); return; }
    setLoading(true);
    setMessage("", "");
    clearProfileResult();
    try {
      const raw = await window.HsrProfileApi.fetchHsrProfile(uid);
      const profile = window.HsrProfileMapper.mapProfileResponse(raw, window.HsrTool?.getState()?.data);
      state.profile = profile;
      renderPlayer(profile);
      renderSelector(profile.characters);
      if (!profile.characters.length) { setMessage(TEXT.noCharacters, "error"); return; }
      $("hsrProfileCharacterSelect").value = "0";
      selectCharacter(0);
      if (window.TetinetUidStorage?.save("hsr", uid)) $("hsrUidClearSavedButton").hidden = false;
      setMessage(TEXT.fetched, "success");
    } catch (error) {
      clearProfileResult();
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setMessage(offline || error instanceof TypeError ? TEXT.network : TEXT.notFound, "error");
    } finally {
      setLoading(false);
    }
  }

  function closeUidDetails() {
    const dialog = $("hsrUidDetailsDialog");
    if (dialog?.open) dialog.close();
    if (!document.querySelector("dialog[open]")) document.body.classList.remove("modal-open");
  }

  function initialize() {
    const input = $("hsrUidInput");
    const saved = window.TetinetUidStorage?.load("hsr") || "";
    input.value = saved;
    $("hsrUidClearSavedButton").hidden = !saved;
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
    $("hsrUidSearchButton").addEventListener("click", search);
    $("hsrProfileCharacterSelect").addEventListener("change", (event) => selectCharacter(Number(event.target.value)));
    $("hsrUidClearSavedButton").addEventListener("click", () => { window.TetinetUidStorage?.remove("hsr"); input.value = ""; $("hsrUidClearSavedButton").hidden = true; setMessage(TEXT.savedUidRemoved, "success"); input.focus(); });
    $("hsrUidDetailsClose").addEventListener("click", closeUidDetails);
    $("hsrUidDetailsDialog").addEventListener("click", (event) => { if (event.target === $("hsrUidDetailsDialog")) closeUidDetails(); });
  }

  window.HsrUidImporter = Object.freeze({ cleanGameText, formatGameText });
  document.addEventListener("DOMContentLoaded", initialize);
})();
