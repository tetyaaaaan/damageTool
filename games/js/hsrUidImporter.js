(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const FALLBACK = "/games/images/hsr/fallback.webp";
  const state = { profile: null, selectedIndex: -1, loading: false };
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const fmt = (value, suffix = "") => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 10) / 10}${suffix}` : "-";

  function imageUrl(value) {
    if (!value) return FALLBACK;
    if (/^https?:\/\//.test(value)) return value;
    return `https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/${String(value).replace(/^\//, "")}`;
  }

  function validate(uid) {
    if (!/^\d{9,10}$/.test(uid)) return "UIDは9～10桁の数字で入力してください。";
    return "";
  }

  function setMessage(message, type = "") {
    const element = $("hsrUidMessage"); element.textContent = message; element.dataset.state = type;
  }

  function setLoading(loading) {
    state.loading = loading; const button = $("hsrUidSearchButton"); button.disabled = loading; button.textContent = loading ? "取得中…" : "UID検索";
  }

  function renderPlayer(profile) {
    $("hsrPlayerInfo").innerHTML = `<strong>${esc(profile.player.nickname)}</strong><span>開拓レベル ${fmt(profile.player.level)} / UID ${esc(profile.player.uid)}</span>`;
  }

  function renderCharacters() {
    const characters = state.profile?.characters || [];
    $("hsrCharacterSelector").innerHTML = `<div class="hsr-uid-character-grid">${characters.map((character, index) => `<button type="button" class="hsr-uid-character-card${index === state.selectedIndex ? " is-selected" : ""}" data-profile-index="${index}"><img src="${esc(imageUrl(character.image))}" alt="" width="72" height="72" loading="lazy"><span><strong>${esc(character.name)}</strong><small>Lv.${fmt(character.level)} / 星魂${fmt(character.eidolon)}</small><small>${esc(character.element)}・${esc(character.path)}</small></span></button>`).join("")}</div>`;
    $("hsrCharacterSelector").querySelectorAll("img").forEach((image) => { image.onerror = () => { image.onerror = null; image.src = FALLBACK; }; });
  }

  function renderDetail(character) {
    const cone = character.lightCone;
    const relics = character.relics.length ? character.relics.map((item) => item.name).join("、") : "公開情報なし";
    const traces = character.traces.length ? character.traces.map((item) => `${item.name} Lv.${item.level}`).join(" / ") : "公開情報なし";
    $("hsrCharacterDetail").hidden = false;
    $("hsrCharacterDetail").innerHTML = `<div class="hsr-uid-detail-head"><img src="${esc(imageUrl(character.image))}" alt="" width="96" height="96"><div><strong>${esc(character.name)}</strong><span>Lv.${fmt(character.level)} / 星魂${fmt(character.eidolon)}</span><span>${cone ? `${esc(cone.name)} Lv.${fmt(cone.level)} / 重畳${fmt(cone.rank)}` : "光円錐なし"}</span></div></div><dl class="hsr-uid-stat-list"><div><dt>HP</dt><dd>${fmt(character.stats.hp)}</dd></div><div><dt>攻撃力</dt><dd>${fmt(character.stats.atk)}</dd></div><div><dt>防御力</dt><dd>${fmt(character.stats.def)}</dd></div><div><dt>速度</dt><dd>${fmt(character.stats.speed)}</dd></div><div><dt>会心率</dt><dd>${fmt(character.stats.critRate, "%")}</dd></div><div><dt>会心ダメージ</dt><dd>${fmt(character.stats.critDamage, "%")}</dd></div></dl><details><summary>装備・軌跡</summary><p>遺物: ${esc(relics)}</p><p>軌跡: ${esc(traces)}</p></details>`;
    const image = $("hsrCharacterDetail").querySelector("img"); image.onerror = () => { image.onerror = null; image.src = FALLBACK; };
  }

  function selectCharacter(index) {
    const character = state.profile?.characters[index]; if (!character) return;
    state.selectedIndex = index; renderCharacters(); renderDetail(character);
    window.HsrTool?.applyProfileCharacter(character);
    setMessage(`${character.name} の取得値を初期値として反映しました。入力欄で手動変更できます。`, "success");
  }

  async function search() {
    if (state.loading) return;
    const uid = $("hsrUidInput").value.trim(); const error = validate(uid);
    if (error) { setMessage(error, "error"); return; }
    setLoading(true); setMessage("公開プロフィールを取得しています。", "loading");
    try {
      const raw = await window.HsrProfileApi.fetchHsrProfile(uid);
      const profile = window.HsrProfileMapper.mapProfileResponse(raw);
      if (!profile.characters.length) throw Object.assign(new Error("公開キャラクターがありません"), { code: "NO_PUBLIC_CHARACTERS" });
      state.profile = profile; state.selectedIndex = -1;
      $("hsrUidResult").hidden = false; renderPlayer(profile); renderCharacters(); selectCharacter(0);
      if (window.TetinetUidStorage?.save("hsr", uid)) $("hsrUidClearSavedButton").hidden = false;
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      setMessage(offline ? "オフラインのため通信できません。" : error.code === "NO_PUBLIC_CHARACTERS" ? "公開プロフィールに選択できるキャラクターがありません。" : "UIDが間違っているか、プロフィールが非公開、またはAPIを利用できません。", "error");
    } finally { setLoading(false); }
  }

  function initialize() {
    const input = $("hsrUidInput"); const button = $("hsrUidSearchButton"); if (!input || !button) return;
    const saved = window.TetinetUidStorage?.load("hsr") || ""; input.value = saved; $("hsrUidClearSavedButton").hidden = !saved;
    input.addEventListener("input", () => { input.value = input.value.replace(/\D/g, ""); });
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") search(); });
    button.addEventListener("click", search);
    $("hsrUidClearSavedButton").addEventListener("click", () => { window.TetinetUidStorage?.remove("hsr"); input.value = ""; $("hsrUidClearSavedButton").hidden = true; setMessage("保存したUIDを削除しました。", "success"); });
    $("hsrCharacterSelector").addEventListener("click", (event) => { const card = event.target.closest("[data-profile-index]"); if (card) selectCharacter(Number(card.dataset.profileIndex)); });
  }

  document.addEventListener("DOMContentLoaded", initialize);
})();
