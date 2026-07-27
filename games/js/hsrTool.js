(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    const format = (value) => Math.round(number(value)).toLocaleString("ja-JP");
    const state = {
        data: null,
        profileCharacter: null,
        characterId: "", coneId: "", relicId: "", ornamentId: "",
        level: 80, eidolon: 0, traces: "",
        stats: { hp: 0, atk: 0, def: 0, speed: 100, critRate: 5, critDamage: 50, breakEffect: 0, effectHitRate: 0, effectRes: 0, damageBonus: 0, energyRegen: 0 },
        party: [{ characterId: "", bonus: 0, category: "damageBonus", enabled: false }, { characterId: "", bonus: 0, category: "damageBonus", enabled: false }, { characterId: "", bonus: 0, category: "damageBonus", enabled: false }],
        enemy: { level: 80, resistance: 20, weakness: true, defenseReduction: 0, defenseIgnore: 0, resistancePenetration: 0, takenDamage: 0, toughnessActive: false, currentToughness: 30 },
        attack: { name: "通常攻撃", type: "normal", target: "single", scalingStat: "atk", multiplier: 100, flatDamage: 0, hitCount: 1, canCrit: true },
        manual: { name: "手動ダメージバフ", category: "damageBonus", value: 0, enabled: false },
        pendingProfileCharacter: null,
        dirty: false
    };

    const statFields = [
        ["hp", "HP"], ["atk", "攻撃力"], ["def", "防御力"], ["speed", "速度"],
        ["critRate", "会心率 (%)"], ["critDamage", "会心ダメージ (%)"], ["breakEffect", "撃破特効 (%)"],
        ["effectHitRate", "効果命中 (%)"], ["effectRes", "効果抵抗 (%)"], ["damageBonus", "属性ダメージバフ (%)"], ["energyRegen", "EP回復効率 (%)"]
    ];

    function option(value, label, selected) { return `<option value="${String(value).replace(/"/g, "&quot;")}"${selected ? " selected" : ""}>${label}</option>`; }
    function escape(value) { const node = document.createElement("span"); node.textContent = String(value || ""); return node.innerHTML; }
    function selectedCharacter() { return state.data?.characters.find((item) => item.id === state.characterId) || null; }
    function selectedCone() { return state.data?.lightCones.find((item) => item.id === state.coneId) || null; }

    function renderShell() {
        const grid = document.querySelector(".hsr-main-grid");
        if (!grid) return;
        grid.innerHTML = `
          <section class="teti-panel teti-input-panel hsr-input-panel hsr-composed-input-card hsr-v2-input">
            <div class="teti-section-heading"><h2>計算条件</h2><p>UIDで反映した値も、すべてこの画面で編集できます。</p></div>
            <section class="hsr-input-section hsr-uid-importer uid-importer" id="uidImporter">
              <h3>UIDから反映</h3><p class="uid-importer__note">公開プロフィールのキャラクターだけを読み込みます。取得できない戦闘状態や条件は推測しません。</p>
              <div class="uid-importer__controls hsr-inline-controls"><label for="hsrUidInput">UID</label><input id="hsrUidInput" class="teti-input" inputmode="numeric" maxlength="10" placeholder="例: 800000000"><button id="hsrUidSearchButton" type="button" class="teti-button teti-button-secondary">UID検索</button></div>
              <div class="uid-importer__storage"><p>成功したUIDはこのブラウザ内だけに保存されます。</p><button id="hsrUidClearSavedButton" type="button" class="uid-importer__clear-saved" hidden>保存したUIDを削除</button></div>
              <p id="hsrUidMessage" class="uid-importer__message" role="status" aria-live="polite"></p><div id="hsrPlayerInfo" class="uid-importer__player" hidden></div><div id="hsrCharacterSelector" class="uid-importer__selector" hidden><label for="hsrProfileCharacterSelect">公開キャラクター</label><select id="hsrProfileCharacterSelect"></select></div><div id="hsrCharacterDetail" class="uid-importer__detail" hidden></div>
            </section>
            <section class="hsr-input-section"><h3>キャラクター・装備</h3><div class="hsr-section-grid"><label>キャラクター<select id="hsrCharacterSelect"></select></label><label>光円錐<select id="hsrConeSelect"></select></label><label>遺物セット<select id="hsrRelicSelect"></select></label><label>オーナメント<select id="hsrOrnamentSelect"></select></label><label>キャラLv<input id="hsrLevel" type="number" min="1" max="80"></label><label>星魂<input id="hsrEidolon" type="number" min="0" max="6"></label><label>軌跡メモ<input id="hsrTraces" type="text" placeholder="例: 通常6 / スキル10"></label></div><div id="hsrSelectionPreview" class="hsr-selection-preview" hidden></div><p id="hsrEquipmentNote" class="hsr-section-note"></p></section>
            <section class="hsr-input-section"><h3>ステータス</h3><p class="hsr-section-note">「API」表示は公開プロフィール由来の初期値です。編集すると手動値として計算します。</p><div class="hsr-field-list hsr-stat-grid">${statFields.map(([key, label]) => `<label>${label}<input id="hsrStat-${key}" data-stat="${key}" type="number" step="0.1"></label>`).join("")}</div></section>
            <section class="hsr-input-section"><h3>攻撃</h3><div class="hsr-section-grid"><label>名称<input id="hsrAttackName" type="text"></label><label>種別<select id="hsrAttackType"><option value="normal">通常攻撃</option><option value="enhancedNormal">強化通常</option><option value="skill">戦闘スキル</option><option value="enhancedSkill">強化スキル</option><option value="ultimate">必殺技</option><option value="followUp">追加攻撃</option><option value="additional">付加ダメージ</option><option value="dot">持続ダメージ</option></select></label><label>範囲<select id="hsrAttackTarget"><option value="single">単体</option><option value="blast">拡散</option><option value="aoe">全体</option><option value="bounce">バウンド</option></select></label><label>参照値<select id="hsrScalingStat"><option value="atk">攻撃力</option><option value="hp">HP</option><option value="def">防御力</option></select></label><label>倍率 (%)<input id="hsrMultiplier" type="number" step="0.1"></label><label>固定加算<input id="hsrFlatDamage" type="number" step="1"></label><label>ヒット数<input id="hsrHitCount" type="number" min="1" step="1"></label><label class="hsr-check"><input id="hsrCanCrit" type="checkbox">会心可能</label></div><p class="hsr-section-note">既存CSVには技能倍率の検証済みデータがないため、倍率は明示入力です。未検証の固有効果は自動適用しません。</p></section>
            <section class="hsr-input-section"><h3>パーティ補正</h3><p class="hsr-section-note">メイン以外の3枠です。条件付き効果は、発動している場合だけ有効にしてください。</p><div id="hsrPartyRows" class="hsr-party-grid"></div></section>
            <section class="hsr-input-section"><h3>敵</h3><div class="hsr-section-grid"><label>敵Lv<input id="hsrEnemyLevel" type="number" min="1" max="100"></label><label>属性耐性 (%)<input id="hsrEnemyResistance" type="number" step="0.1"></label><label>防御ダウン (%)<input id="hsrEnemyDefenseReduction" type="number" step="0.1"></label><label>防御無視 (%)<input id="hsrEnemyDefenseIgnore" type="number" step="0.1"></label><label>耐性貫通 (%)<input id="hsrEnemyResistancePenetration" type="number" step="0.1"></label><label>被ダメージ増加 (%)<input id="hsrEnemyTakenDamage" type="number" step="0.1"></label><label>現在靭性<input id="hsrCurrentToughness" type="number" min="0" step="1"></label><label class="hsr-check"><input id="hsrWeakness" type="checkbox">属性弱点</label><label class="hsr-check"><input id="hsrToughnessActive" type="checkbox">靭性が残っている</label></div></section>
            <section class="hsr-input-section"><h3>手動補正</h3><div class="hsr-section-grid"><label>名称<input id="hsrManualName" type="text"></label><label>種別<select id="hsrManualCategory"><option value="damageBonus">ダメージバフ</option><option value="takenDamage">被ダメージ増加</option><option value="defenseReduction">防御ダウン</option><option value="defenseIgnore">防御無視</option><option value="resistancePenetration">耐性貫通</option></select></label><label>値 (%)<input id="hsrManualValue" type="number" step="0.1"></label><label class="hsr-check"><input id="hsrManualEnabled" type="checkbox">適用する</label></div></section>
            <div class="hsr-actions"><button id="hsrCalculateButton" type="button" class="teti-button teti-button-primary calc-button">ダメージ計算</button><p id="hsrDirtyNotice" class="hsr-section-note" hidden>入力が変わりました。結果を更新してください。</p></div>
          </section>
          <aside class="teti-panel teti-result-panel hsr-result-panel hsr-v2-result"><div class="teti-section-heading"><h2>計算結果</h2></div><div id="hsrResults" aria-live="polite"><p class="hsr-section-note">条件を設定して計算してください。</p></div><section class="hsr-action-value"><h3>速度・行動値</h3><label>基準行動値<input id="hsrActionWindow" type="number" min="1" value="150"></label><div id="hsrActionSummary" class="hsr-section-note"></div><p class="hsr-section-note">速度のみを使う基礎目安です。行動順短縮・再行動・途中速度変化・召喚物は未対応です。</p></section><section class="hsr-future-note"><h3>将来の戦闘シミュレーション</h3><p>SP・EP、継続ターン、割り込み、敵行動、削靭、召喚物、複数ラウンドは未実装です。この画面の状態は将来のシミュレーション入力へ拡張できるよう分離しています。</p></section></aside>`;
    }

    function renderSelects() {
        const character = $("hsrCharacterSelect");
        const cone = $("hsrConeSelect");
        const relic = $("hsrRelicSelect");
        const ornament = $("hsrOrnamentSelect");
        const characters = state.data.characters;
        character.innerHTML = option("", "選択してください", !state.characterId) + characters.map((item) => option(item.id, `${item.name} / ${item.element}・${item.path}`, item.id === state.characterId)).join("");
        const current = selectedCharacter();
        const cones = state.data.lightCones.filter((item) => !current || !item.path || item.path === current.path);
        if (state.coneId && !cones.some((item) => item.id === state.coneId)) state.coneId = "";
        cone.innerHTML = option("", current ? "光円錐を選択" : "キャラクターを先に選択", !state.coneId) + cones.map((item) => option(item.id, item.name, item.id === state.coneId)).join("");
        relic.innerHTML = option("", "選択しない", !state.relicId) + state.data.relics.filter((item) => item.type === "relic").map((item) => option(item.id, item.name, item.id === state.relicId)).join("");
        ornament.innerHTML = option("", "選択しない", !state.ornamentId) + state.data.relics.filter((item) => item.type === "ornament").map((item) => option(item.id, item.name, item.id === state.ornamentId)).join("");
        const coneInfo = selectedCone();
        $("hsrEquipmentNote").textContent = coneInfo?.description || state.data.provenance.limitations;
        const preview = $("hsrSelectionPreview");
        if (preview) {
            preview.hidden = !current;
            preview.innerHTML = current ? `<img src="/games/images/hsr/characters/${encodeURIComponent(current.legacyId)}.webp" width="72" height="72" loading="lazy" alt="${escape(current.name)}" onerror="this.onerror=null;this.src='/games/images/theme/hsr-mascot-light.webp'"><div><strong>${escape(current.name)}</strong><span>${escape(current.element)}・${escape(current.path)} / Lv.${state.level}</span></div>` : "";
        }
    }

    function renderParty() {
        const names = state.data.characters;
        $("hsrPartyRows").innerHTML = state.party.map((member, index) => `<fieldset class="hsr-party-member"><legend>メンバー${index + 2}</legend><label>キャラクター<select data-party="characterId" data-slot="${index}">${option("", "選択しない", !member.characterId)}${names.filter((item) => item.id !== state.characterId).map((item) => option(item.id, item.name, item.id === member.characterId)).join("")}</select></label><label>補正<select data-party="category" data-slot="${index}"><option value="damageBonus"${member.category === "damageBonus" ? " selected" : ""}>ダメージバフ</option><option value="takenDamage"${member.category === "takenDamage" ? " selected" : ""}>被ダメージ増加</option></select></label><label>値 (%)<input data-party="bonus" data-slot="${index}" type="number" step="0.1" value="${member.bonus}"></label><label class="hsr-check"><input data-party="enabled" data-slot="${index}" type="checkbox"${member.enabled ? " checked" : ""}>条件を適用</label></fieldset>`).join("");
    }

    function setInputs() {
        $("hsrLevel").value = state.level; $("hsrEidolon").value = state.eidolon; $("hsrTraces").value = state.traces;
        statFields.forEach(([key]) => { $("hsrStat-" + key).value = state.stats[key]; });
        Object.entries({ hsrAttackName: state.attack.name, hsrAttackType: state.attack.type, hsrAttackTarget: state.attack.target, hsrScalingStat: state.attack.scalingStat, hsrMultiplier: state.attack.multiplier, hsrFlatDamage: state.attack.flatDamage, hsrHitCount: state.attack.hitCount, hsrEnemyLevel: state.enemy.level, hsrEnemyResistance: state.enemy.resistance, hsrEnemyDefenseReduction: state.enemy.defenseReduction, hsrEnemyDefenseIgnore: state.enemy.defenseIgnore, hsrEnemyResistancePenetration: state.enemy.resistancePenetration, hsrEnemyTakenDamage: state.enemy.takenDamage, hsrCurrentToughness: state.enemy.currentToughness, hsrManualName: state.manual.name, hsrManualCategory: state.manual.category, hsrManualValue: state.manual.value }).forEach(([id, value]) => { $(id).value = value; });
        $("hsrCanCrit").checked = state.attack.canCrit; $("hsrWeakness").checked = state.enemy.weakness; $("hsrToughnessActive").checked = state.enemy.toughnessActive; $("hsrManualEnabled").checked = state.manual.enabled;
    }

    function markDirty() { state.dirty = true; const notice = $("hsrDirtyNotice"); if (notice) notice.hidden = false; renderActionValue(); }
    function collect() {
        state.level = number($("hsrLevel").value, 80); state.eidolon = number($("hsrEidolon").value); state.traces = $("hsrTraces").value;
        statFields.forEach(([key]) => { state.stats[key] = number($("hsrStat-" + key).value); });
        state.attack = { name: $("hsrAttackName").value || "手動攻撃", type: $("hsrAttackType").value, target: $("hsrAttackTarget").value, scalingStat: $("hsrScalingStat").value, multiplier: number($("hsrMultiplier").value), flatDamage: number($("hsrFlatDamage").value), hitCount: number($("hsrHitCount").value), canCrit: $("hsrCanCrit").checked };
        state.enemy = { level: number($("hsrEnemyLevel").value), resistance: number($("hsrEnemyResistance").value), defenseReduction: number($("hsrEnemyDefenseReduction").value), defenseIgnore: number($("hsrEnemyDefenseIgnore").value), resistancePenetration: number($("hsrEnemyResistancePenetration").value), takenDamage: number($("hsrEnemyTakenDamage").value), currentToughness: number($("hsrCurrentToughness").value), weakness: $("hsrWeakness").checked, toughnessActive: $("hsrToughnessActive").checked };
        state.manual = { name: $("hsrManualName").value || "手動補正", category: $("hsrManualCategory").value, value: number($("hsrManualValue").value), enabled: $("hsrManualEnabled").checked };
    }

    function modifiers() {
        const result = [];
        if (state.manual.enabled) result.push({ ...state.manual, id: "manual", source: "手動入力" });
        state.party.forEach((member, index) => { if (member.characterId && member.enabled) { const character = state.data.characters.find((item) => item.id === member.characterId); result.push({ id: `party-${index}`, name: `${character?.name || "メンバー"}の任意補正`, source: `パーティメンバー${index + 2}`, category: member.category, value: member.bonus, enabled: true }); } });
        return result;
    }

    function calculate() {
        collect();
        const character = { level: state.level, stats: state.stats };
        const result = window.HsrCalcEngine.calculate({ character, enemy: state.enemy, attack: state.attack, modifiers: modifiers() });
        const breakResult = window.HsrCalcEngine.calculateBreak({ character, enemy: state.enemy, breakBaseDamage: state.data.breakBaseDamage });
        const target = result.attack.target === "blast" ? "メイン対象（隣接対象は同倍率としては扱いません）" : result.attack.target === "bounce" ? "バウンド（対象配分は手動で倍率へ反映）" : result.attack.target;
        $("hsrResults").innerHTML = `<section class="hsr-result-summary"><p>${escape(result.attack.name)}・${escape(target)} / ${result.attack.hitCount}ヒット</p><dl><div><dt>非会心</dt><dd>${format(result.nonCrit)}</dd></div><div><dt>会心</dt><dd>${format(result.crit)}</dd></div><div><dt>期待値</dt><dd>${format(result.expected)}</dd></div></dl><p>1ヒット: 非会心 ${format(result.perHit.nonCrit)} / 会心 ${format(result.perHit.crit)} / 期待値 ${format(result.perHit.expected)}</p></section><details open><summary>計算内訳</summary><dl class="hsr-breakdown"><div><dt>参照値（${escape(result.attack.scalingStat)}）</dt><dd>${format(result.breakdown.referenceValue)}</dd></div><div><dt>スキル倍率</dt><dd>${result.breakdown.multiplierPercent}%</dd></div><div><dt>基礎ダメージ</dt><dd>${format(result.breakdown.baseDamage)}</dd></div><div><dt>ダメージバフ</dt><dd>${result.breakdown.damageBonus}%</dd></div><div><dt>防御補正</dt><dd>${result.breakdown.defense.toFixed(4)}</dd></div><div><dt>耐性補正</dt><dd>${result.breakdown.resistance.toFixed(4)}</dd></div><div><dt>被ダメージ補正</dt><dd>${result.breakdown.takenDamage}%</dd></div><div><dt>会心率 / 会心ダメージ</dt><dd>${result.breakdown.critRatePercent}% / ${result.breakdown.critDamagePercent}%</dd></div></dl></details><details><summary>弱点撃破ダメージ（参考）</summary><p>${format(breakResult.value)} — 基礎 ${format(breakResult.base)}、撃破特効補正 ${breakResult.effect.toFixed(3)}、靭性補正 ${breakResult.toughnessScale.toFixed(3)}</p></details><details><summary>適用した補正（${result.applied.length}）</summary><ul>${result.applied.length ? result.applied.map((item) => `<li>${escape(item.name)}: +${item.value}%（${escape(item.source)}）</li>`).join("") : "<li>なし</li>"}</ul></details><details><summary>適用しなかった補正（${result.skipped.length}）</summary><ul>${result.skipped.length ? result.skipped.map((item) => `<li>${escape(item.name)}: ${escape(item.reason || "条件が未選択")}</li>`).join("") : "<li>なし</li>"}</ul></details>`;
        state.dirty = false; $("hsrDirtyNotice").hidden = true;
    }

    function renderActionValue() {
        const output = $("hsrActionSummary"); if (!output) return;
        const summary = window.HsrCalcEngine.actionSummary(number($("hsrStat-speed")?.value, state.stats.speed), number($("hsrActionWindow")?.value, 150));
        output.textContent = `速度 ${summary.speed.toFixed(1)} / 1行動値 ${summary.actionValue.toFixed(2)} / 基準 ${summary.windowValue} 内の行動回数 ${summary.actions} 回`;
    }

    function chooseCharacter(id, resetStats = true) {
        state.characterId = id;
        const character = selectedCharacter();
        if (character && resetStats) state.stats = { ...state.stats, hp: character.base.hp, atk: character.base.atk, def: character.base.def, speed: character.base.speed };
        renderSelects(); setInputs(); renderParty(); markDirty();
    }

    function bind() {
        $("hsrCharacterSelect").addEventListener("change", (event) => chooseCharacter(event.target.value));
        $("hsrConeSelect").addEventListener("change", (event) => { state.coneId = event.target.value; renderSelects(); markDirty(); });
        $("hsrRelicSelect").addEventListener("change", (event) => { state.relicId = event.target.value; markDirty(); });
        $("hsrOrnamentSelect").addEventListener("change", (event) => { state.ornamentId = event.target.value; markDirty(); });
        document.querySelector(".hsr-v2-input").addEventListener("input", markDirty); document.querySelector(".hsr-v2-input").addEventListener("change", markDirty);
        $("hsrPartyRows").addEventListener("change", (event) => { const field = event.target.dataset.party; if (!field) return; const member = state.party[number(event.target.dataset.slot)]; member[field] = event.target.type === "checkbox" ? event.target.checked : (field === "bonus" ? number(event.target.value) : event.target.value); markDirty(); });
        $("hsrCalculateButton").addEventListener("click", calculate); $("hsrActionWindow").addEventListener("input", renderActionValue);
    }

    async function initialize() {
        renderShell();
        try { state.data = await window.HsrCalcData.load(); renderSelects(); renderParty(); setInputs(); bind(); renderActionValue(); if (state.pendingProfileCharacter) { const pending = state.pendingProfileCharacter; state.pendingProfileCharacter = null; applyProfileCharacter(pending); } }
        catch (error) { document.querySelector(".hsr-v2-input").innerHTML = `<p class="uid-importer__message" data-type="error">計算用データを読み込めませんでした。${escape(error.message)}</p>`; }
    }

    function applyProfileCharacter(character) {
        if (!character) return;
        if (!state.data) { state.pendingProfileCharacter = character; return; }
        const match = state.data.characters.find((item) => item.name === character.name);
        if (match) state.characterId = match.id;
        const lightCone = state.data.lightCones.find((item) => item.name === character.lightCone?.name);
        if (lightCone) state.coneId = lightCone.id;
        state.level = number(character.level, state.level); state.eidolon = number(character.eidolon, state.eidolon);
        state.traces = (character.traces || []).map((item) => `${item.name}:${item.level}`).join(" / ");
        state.stats = { ...state.stats, ...character.stats, damageBonus: number(character.stats?.elementalDamage) };
        renderSelects(); renderParty(); setInputs(); markDirty();
    }
    window.HsrTool = Object.freeze({ applyProfileCharacter, calculate, getState: () => JSON.parse(JSON.stringify(state)) });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize); else initialize();
})();
