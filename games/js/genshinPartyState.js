(function () {
    "use strict";

    const PARTY_SIZE = 4;
    const SUPPORT_SLOTS = [2, 3, 4];
    const FALLBACK_IMAGE = "/games/images/genshin/fallback.webp";
    const byId = (id) => document.getElementById(id);
    const buffStateByKey = {};
    let characters = [];
    let weapons = [];
    let artifactSets = [];
    let uidMembersByCharacterId = new Map();
    let applyingImportedMember = false;
    const partyConditionStateByKey = {};
    const restoredMemberBySlot = new Map();
    let resolveReady;
    const ready = new Promise((resolve) => { resolveReady = resolve; });
    let initialized = false;
    const pendingRestores = [];

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
    }

    function optionalNumber(id) {
        const raw = String(byId(id)?.value || "").trim();
        const number = Number(raw);
        return raw && Number.isFinite(number) ? number : 0;
    }

    // Keep profileSnapshot immutable at the PartyState boundary.  The data
    // contract owns the canonical clone helper; the small fallback keeps this
    // module safe when loaded in isolation (for example, contract tests).
    function cloneProfileSnapshot(value) {
        if (!value || typeof value !== "object") return null;
        if (typeof window.GenshinDataContract?.cloneProfileSnapshot === "function") {
            return window.GenshinDataContract.cloneProfileSnapshot(value);
        }
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_error) {
            return null;
        }
    }

    function emptySupportMember(slot) {
        return {
            slot,
            role: "support",
            enabled: false,
            characterId: "",
            nameJa: "",
            element: "",
            weaponType: "",
            level: 90,
            ascension: null,
            constellation: 0,
            talentLevels: { normal: 10, skill: 10, burst: 10 },
            equipment: { weaponId: "", weaponNameJa: "", weaponLevel: 90, weaponAscension: null, refinement: 1, artifactSetMode: "4pc", artifactSetIds: [] },
            stats: { baseHp: 0, baseAtk: 0, baseDef: 0, hp: 0, atk: 0, def: 0, elementalMastery: 0 },
            combatState: { onField: false, hpRatio: 100 },
            buffStates: {},
            provenance: { source: "manual", rawCharacterId: "" }
        };
    }

    function normalizeSupportMember(member, slot) {
        const base = emptySupportMember(slot);
        const characterId = String(member?.characterId || "");
        return {
            ...base,
            ...member,
            slot,
            role: "support",
            enabled: Boolean(characterId && member?.enabled !== false),
            characterId,
            level: clamp(member?.level, 1, 100, 90),
            constellation: clamp(member?.constellation, 0, 6, 0),
            talentLevels: {
                normal: clamp(member?.talentLevels?.normal, 1, 15, 10),
                skill: clamp(member?.talentLevels?.skill, 1, 15, 10),
                burst: clamp(member?.talentLevels?.burst, 1, 15, 10)
            },
            equipment: { ...base.equipment, ...(member?.equipment || {}) },
            stats: { ...base.stats, ...(member?.stats || {}) },
            combatState: { ...base.combatState, ...(member?.combatState || {}), onField: false },
            buffStates: { ...(member?.buffStates || {}) },
            provenance: { ...base.provenance, ...(member?.provenance || {}) },
            ...(member?.profileSnapshot ? { profileSnapshot: cloneProfileSnapshot(member.profileSnapshot) } : {})
        };
    }

    function cloneConditionStates(value) {
        return Object.fromEntries(Object.entries(value || {})
            .filter(([, state]) => state && typeof state === "object" && !Array.isArray(state))
            .map(([key, state]) => [String(key), { ...state }]));
    }

    function activeConditionStates(value, members) {
        const prefixes = (members || [])
            .filter((member) => Number(member?.slot) > 1 && member.enabled && member.characterId)
            .map((member) => `party:${member.slot}:${member.characterId}:`);
        return cloneConditionStates(value && Object.fromEntries(
            Object.entries(value).filter(([key]) => prefixes.some((prefix) => key.startsWith(prefix)))
        ));
    }

    function normalizePartyState(value, mainMember = {}) {
        const supportBySlot = new Map((value?.members || []).filter((member) => Number(member?.slot) > 1).map((member) => [Number(member.slot), member]));
        const mainCharacterId = String(mainMember.characterId || "");
        const usedCharacterIds = new Set(mainCharacterId ? [mainCharacterId] : []);
        const main = {
            slot: 1, role: "main", enabled: Boolean(mainCharacterId), characterId: mainCharacterId,
            nameJa: String(mainMember.nameJa || ""), element: String(mainMember.element || ""), weaponType: String(mainMember.weaponType || ""),
            level: clamp(mainMember.level, 1, 100, 90), constellation: clamp(mainMember.constellation, 0, 6, 0),
            talentLevels: {
                normal: clamp(mainMember.talentLevels?.normal, 1, 15, 10),
                skill: clamp(mainMember.talentLevels?.skill, 1, 15, 10),
                burst: clamp(mainMember.talentLevels?.burst, 1, 15, 10)
            },
            equipment: { weaponId: String(mainMember.weaponId || ""), refinement: clamp(mainMember.refinement, 1, 5, 1), artifactSetIds: [...(mainMember.artifactSetIds || [])] },
            stats: { ...(mainMember.stats || {}) }, combatState: { onField: true, hpRatio: 100 }, buffStates: {}
        };
        const supports = SUPPORT_SLOTS.map((slot) => {
            const member = normalizeSupportMember(supportBySlot.get(slot), slot);
            if (!member.characterId || usedCharacterIds.has(member.characterId)) return emptySupportMember(slot);
            usedCharacterIds.add(member.characterId);
            return member;
        });
        return {
            schemaVersion: 2,
            focusSlot: 1,
            maxMembers: PARTY_SIZE,
            resonanceStates: { ...(value?.resonanceStates || {}) },
            conditionStates: activeConditionStates(value?.conditionStates, supports),
            members: [main, ...supports]
        };
    }

    function characterForId(id) { return characters.find((item) => String(item.id) === String(id)) || null; }
    function weaponForId(id) { return weapons.find((item) => String(item.id) === String(id)) || null; }
    function artifactForId(id) { return artifactSets.find((item) => String(item.id) === String(id)) || null; }

    function renderSlot(slot) {
        const section = document.createElement("section");
        section.className = "genshin-party-member";
        section.dataset.partySlot = String(slot);
        section.innerHTML = `
          <div class="genshin-party-member-head"><h3 id="genshinPartySlot${slot}Title">メンバー${slot}</h3><button type="button" class="genshin-party-clear" data-party-clear="${slot}">解除</button></div>
          <div class="genshin-party-equipment-row">
            <button type="button" class="genshin-party-pick" id="genshinPartyCharacterTrigger${slot}" data-party-select="character" data-party-slot="${slot}" aria-haspopup="dialog" aria-controls="genshinSelectionDialog">
              <img id="genshinPartyCharacterImage${slot}" src="${FALLBACK_IMAGE}" alt="" width="56" height="56"><span><small>キャラクター</small><strong id="genshinPartyCharacterName${slot}">選択する</strong></span>
            </button>
            <input type="hidden" id="genshinPartyCharacter${slot}" value="">
            <button type="button" class="genshin-party-pick" id="genshinPartyWeaponTrigger${slot}" data-party-select="weapon" data-party-slot="${slot}" aria-haspopup="dialog" aria-controls="genshinSelectionDialog" disabled>
              <img id="genshinPartyWeaponImage${slot}" src="${FALLBACK_IMAGE}" alt="" width="56" height="56"><span><small>武器</small><strong id="genshinPartyWeaponName${slot}">キャラを先に選択</strong></span>
            </button>
            <input type="hidden" id="genshinPartyWeapon${slot}" value="">
          </div>
          <div class="genshin-party-artifact-row">
            <label><span>聖遺物構成</span><select id="genshinPartyArtifactMode${slot}" disabled><option value="4pc">4セット</option><option value="2pc2pc">2＋2</option><option value="2pc">2セット</option><option value="none">セット効果なし</option></select></label>
            <button type="button" class="genshin-party-pick genshin-party-artifact-pick" id="genshinPartyArtifactOneTrigger${slot}" data-party-select="artifact" data-party-artifact-slot="one" data-party-slot="${slot}" aria-haspopup="dialog" aria-controls="genshinSelectionDialog" disabled>
              <img id="genshinPartyArtifactOneImage${slot}" src="${FALLBACK_IMAGE}" alt="" width="48" height="48"><span><small>聖遺物</small><strong id="genshinPartyArtifactOneName${slot}">聖遺物を選択</strong></span>
            </button>
            <input type="hidden" id="genshinPartyArtifactOne${slot}" value="">
            <button type="button" class="genshin-party-pick genshin-party-artifact-pick" id="genshinPartyArtifactTwoTrigger${slot}" data-party-select="artifact" data-party-artifact-slot="two" data-party-slot="${slot}" aria-haspopup="dialog" aria-controls="genshinSelectionDialog" disabled hidden>
              <img id="genshinPartyArtifactTwoImage${slot}" src="${FALLBACK_IMAGE}" alt="" width="48" height="48"><span><small>聖遺物2</small><strong id="genshinPartyArtifactTwoName${slot}">聖遺物を選択</strong></span>
            </button>
            <input type="hidden" id="genshinPartyArtifactTwo${slot}" value="">
          </div>
          <div class="genshin-party-basic-fields">
            <label><span>キャラLv</span><input type="number" id="genshinPartyLevel${slot}" min="1" max="100" value="90" disabled></label>
            <label><span>命ノ星座</span><select id="genshinPartyConstellation${slot}" disabled>${[0,1,2,3,4,5,6].map((value) => `<option value="${value}">C${value}</option>`).join("")}</select></label>
            <label><span>武器Lv</span><input type="number" id="genshinPartyWeaponLevel${slot}" min="1" max="90" value="90" disabled></label>
            <label><span>精錬</span><select id="genshinPartyRefinement${slot}" disabled>${[1,2,3,4,5].map((value) => `<option value="${value}">R${value}</option>`).join("")}</select></label>
          </div>
          <details class="genshin-party-talents"><summary>天賦・参照ステータス</summary><div class="genshin-party-talent-grid">
            <label><span>通常</span><input type="number" id="genshinPartyNormalTalent${slot}" min="1" max="15" value="10" disabled></label>
            <label><span>スキル</span><input type="number" id="genshinPartySkillTalent${slot}" min="1" max="15" value="10" disabled></label>
            <label><span>爆発</span><input type="number" id="genshinPartyBurstTalent${slot}" min="1" max="15" value="10" disabled></label>
          </div><div class="genshin-party-provider-grid">
            <p class="genshin-party-base-summary" id="genshinPartyBaseSummary${slot}">キャラと武器を選ぶと基礎値を自動取得します。</p>
            <label><span>HP上限</span><input type="number" id="genshinPartyHp${slot}" min="0" placeholder="必要な効果のみ" disabled></label>
            <label><span>攻撃力</span><input type="number" id="genshinPartyAtk${slot}" min="0" placeholder="必要な効果のみ" disabled></label>
            <label><span>防御力</span><input type="number" id="genshinPartyDef${slot}" min="0" placeholder="必要な効果のみ" disabled></label>
            <label><span>元素熟知</span><input type="number" id="genshinPartyElementalMastery${slot}" min="0" placeholder="必要な効果のみ" disabled></label>
          </div></details>`;
        return section;
    }

    function readSupportMember(slot) {
        const characterId = String(byId(`genshinPartyCharacter${slot}`)?.value || "");
        const selectedWeaponId = String(byId(`genshinPartyWeapon${slot}`)?.value || "");
        const character = characterForId(characterId);
        const selectedWeapon = weaponForId(selectedWeaponId);
        const weapon = character && selectedWeapon?.weaponType === character.weaponType ? selectedWeapon : null;
        const weaponId = weapon?.id || "";
        const level = clamp(byId(`genshinPartyLevel${slot}`)?.value, 1, 100, 90);
        const weaponLevel = clamp(byId(`genshinPartyWeaponLevel${slot}`)?.value, 1, 90, 90);
        const artifactModeValue = String(byId(`genshinPartyArtifactMode${slot}`)?.value || "4pc");
        const artifactSetMode = ["4pc", "2pc2pc", "2pc", "none"].includes(artifactModeValue) ? artifactModeValue : "4pc";
        const artifactSetIds = [String(byId(`genshinPartyArtifactOne${slot}`)?.value || "")];
        if (artifactSetMode === "2pc2pc") artifactSetIds.push(String(byId(`genshinPartyArtifactTwo${slot}`)?.value || ""));
        const imported = uidMembersByCharacterId.get(characterId);
        const isUidCharacter = byId(`genshinPartyCharacter${slot}`)?.dataset?.valueOrigin === "uid";
        const profileSnapshot = isUidCharacter ? cloneProfileSnapshot(imported?.profileSnapshot) : null;
        const useUidBaseStats = isUidCharacter && imported?.stats
            && byId(`genshinPartyLevel${slot}`)?.dataset?.valueOrigin === "uid"
            && byId(`genshinPartyWeapon${slot}`)?.dataset?.valueOrigin === "uid"
            && byId(`genshinPartyWeaponLevel${slot}`)?.dataset?.valueOrigin === "uid"
            && level === Number(imported.level || 0)
            && weaponId === String(imported.equipment?.weaponId || "")
            && weaponLevel === Number(imported.equipment?.weaponLevel || 0);
        const base = useUidBaseStats
            ? imported.stats
            : window.GenshinBaseStats?.resolveMember?.({ characterId, weaponId, level, weaponLevel }) || {};
        const origins = sectionInputs(slot).map((input) => input.dataset.valueOrigin || "manual");
        const uidOrigins = origins.filter((origin) => origin === "uid").length;
        const provenanceSource = uidOrigins === 0 ? "manual" : uidOrigins === origins.length ? "uidProfile" : "mixed";
        const normalized = normalizeSupportMember({
            characterId, nameJa: character?.nameJa || "", element: character?.element || "", weaponType: character?.weaponType || "", level,
            constellation: byId(`genshinPartyConstellation${slot}`)?.value,
            talentLevels: {
                normal: byId(`genshinPartyNormalTalent${slot}`)?.value,
                skill: byId(`genshinPartySkillTalent${slot}`)?.value,
                burst: byId(`genshinPartyBurstTalent${slot}`)?.value
            },
            equipment: { weaponId, weaponNameJa: weapon?.nameJa || "", weaponLevel, refinement: clamp(byId(`genshinPartyRefinement${slot}`)?.value, 1, 5, 1), artifactSetMode, artifactSetIds: artifactSetIds.filter(Boolean) },
            stats: {
                baseHp: Number(base.baseHp) || 0, baseAtk: Number(base.baseAtk) || 0, baseDef: Number(base.baseDef) || 0,
                hp: optionalNumber(`genshinPartyHp${slot}`), atk: optionalNumber(`genshinPartyAtk${slot}`),
                def: optionalNumber(`genshinPartyDef${slot}`), elementalMastery: optionalNumber(`genshinPartyElementalMastery${slot}`)
            },
            buffStates: Object.fromEntries(Object.entries(buffStateByKey).filter(([key]) => key.startsWith(`party:${slot}:${characterId}:`))),
            provenance: {
                source: provenanceSource,
                rawCharacterId: isUidCharacter ? imported?.provenance?.rawCharacterId || characterId : characterId,
                importedAt: isUidCharacter ? imported?.provenance?.importedAt || null : null,
                includesPersistentBonuses: isUidCharacter ? imported?.provenance?.includesPersistentBonuses ?? true : true,
                additivePolicy: isUidCharacter ? imported?.provenance?.additivePolicy || "externalModifiersOnly" : "externalModifiersOnly",
                sourceSnapshot: profileSnapshot
                    ? imported?.provenance?.sourceSnapshot || profileSnapshot.source || "uidProfile"
                    : null,
                retainedFromUid: Boolean(profileSnapshot && (imported?.provenance?.retainedFromUid ?? true)),
                artifactSetCounts: isUidCharacter ? { ...(imported?.provenance?.artifactSetCounts || {}) } : {}
            },
            ...(profileSnapshot ? { profileSnapshot } : {})
        }, slot);
        const restored = restoredMemberBySlot.get(slot);
        return restored
            ? normalizeSupportMember({ ...normalized, ...restored, buffStates: normalized.buffStates }, slot)
            : normalized;
    }

    function getSupportState() {
        const members = SUPPORT_SLOTS.map(readSupportMember);
        return {
            schemaVersion: 2,
            resonanceStates: Object.fromEntries(Object.entries(buffStateByKey).filter(([key]) => key.startsWith("resonance:"))),
            conditionStates: activeConditionStates(partyConditionStateByKey, members),
            members
        };
    }

    function restoreSupportState(value) {
        const restore = () => {
            const members = Array.isArray(value?.members) ? value.members : [];
            // Clear first so absent fields in the imported snapshot do not leave
            // stale selections or toggles from the prior state behind.
            restoredMemberBySlot.clear();
            SUPPORT_SLOTS.forEach((slot) => {
                clearSlot(slot);
                const defaults = {
                    Level: 90, Constellation: 0, WeaponLevel: 90, Refinement: 1,
                    NormalTalent: 10, SkillTalent: 10, BurstTalent: 10,
                    ArtifactMode: "4pc", ArtifactOne: "", ArtifactTwo: "",
                    Hp: "", Atk: "", Def: "", ElementalMastery: ""
                };
                Object.entries(defaults).forEach(([name, fieldValue]) => {
                    const input = byId(`genshinParty${name}${slot}`);
                    if (input) input.value = String(fieldValue);
                });
            });
            Object.keys(buffStateByKey).forEach((key) => delete buffStateByKey[key]);
            Object.keys(partyConditionStateByKey).forEach((key) => delete partyConditionStateByKey[key]);
            SUPPORT_SLOTS.forEach((slot) => {
                const member = members.find((item) => Number(item?.slot) === slot && item?.characterId);
                const character = characterForId(member?.characterId);
                if (!character) return;
                byId(`genshinPartyCharacter${slot}`).value = String(member.characterId);
                byId(`genshinPartyCharacter${slot}`).dataset.valueOrigin = member.provenance?.source === "uidProfile" ? "uid" : "manual";
                const equipment = member.equipment || {};
                const fields = [
                    [`genshinPartyLevel${slot}`, member.level],
                    [`genshinPartyConstellation${slot}`, member.constellation],
                    [`genshinPartyNormalTalent${slot}`, member.talentLevels?.normal],
                    [`genshinPartySkillTalent${slot}`, member.talentLevels?.skill],
                    [`genshinPartyBurstTalent${slot}`, member.talentLevels?.burst],
                    [`genshinPartyWeapon${slot}`, equipment.weaponId],
                    [`genshinPartyWeaponLevel${slot}`, equipment.weaponLevel],
                    [`genshinPartyRefinement${slot}`, equipment.refinement],
                    [`genshinPartyArtifactMode${slot}`, equipment.artifactSetMode],
                    [`genshinPartyArtifactOne${slot}`, equipment.artifactSetIds?.[0]],
                    [`genshinPartyArtifactTwo${slot}`, equipment.artifactSetIds?.[1]],
                    [`genshinPartyHp${slot}`, member.stats?.hp],
                    [`genshinPartyAtk${slot}`, member.stats?.atk],
                    [`genshinPartyDef${slot}`, member.stats?.def],
                    [`genshinPartyElementalMastery${slot}`, member.stats?.elementalMastery]
                ];
                fields.forEach(([id, fieldValue]) => {
                    const input = byId(id);
                    if (!input) return;
                    input.value = fieldValue === undefined || fieldValue === null ? "" : String(fieldValue);
                    input.dataset.valueOrigin = member.provenance?.source === "uidProfile" ? "uid" : "manual";
                });
                const characterOrigin = member.provenance?.source === "uidProfile" ? "uid" : "manual";
                byId(`genshinPartyCharacter${slot}`).dataset.valueOrigin = characterOrigin;
                // Reuse the UID importer registry contract to preserve exact
                // provider base stats and profile provenance when present.
                if (member.provenance?.source === "uidProfile") {
                    uidMembersByCharacterId.set(String(member.characterId), member);
                }
                restoredMemberBySlot.set(slot, normalizeSupportMember(member, slot));
                syncSlot(slot);
                Object.entries(member.buffStates || {}).forEach(([key, enabled]) => { buffStateByKey[key] = Boolean(enabled); });
            });
            Object.entries(value?.resonanceStates || {}).forEach(([key, enabled]) => { buffStateByKey[key] = Boolean(enabled); });
            Object.entries(value?.conditionStates || {}).forEach(([key, state]) => {
                if (!state || typeof state !== "object" || Array.isArray(state)) return;
                partyConditionStateByKey[key] = { ...state };
            });
            updateSummary();
            return getSupportState();
        };
        if (!initialized) {
            pendingRestores.push(restore);
            return ready.then(() => getSupportState());
        }
        return Promise.resolve(restore());
    }

    function selectedCharacterIds(exceptSlot = null) {
        const values = [String(byId("genshinCalcCharacterId")?.value || "")];
        SUPPORT_SLOTS.forEach((slot) => { if (slot !== Number(exceptSlot)) values.push(String(byId(`genshinPartyCharacter${slot}`)?.value || "")); });
        return values.filter(Boolean);
    }

    function partyPreviewItems(members) {
        const resolver = window.GenshinIdResolver;
        return members.map(member => {
            const equipment = member.equipment || {};
            const enabled = Boolean(member.characterId && member.enabled !== false);
            const mode = equipment.artifactSetMode || 'none';
            const ids = mode === 'none' ? [] : [...new Set((equipment.artifactSetIds || []).filter(Boolean))].slice(0,mode === '2pc2pc' ? 2 : 1);
            const image = (kind,id,name) => ({name,src:id ? resolver?.[kind]?.(id) || FALLBACK_IMAGE : FALLBACK_IMAGE});
            return {
                slot:member.slot, name:enabled ? member.nameJa || characterForId(member.characterId)?.nameJa || 'キャラクター' : '未設定',
                meta:enabled ? [member.element, 'C' + Number(member.constellation || 0)].filter(Boolean).join(' / ') : '',
                character:image('resolveCharacterImagePath',enabled ? member.characterId : '',member.nameJa || 'キャラクター未設定'),
                weapon:image('resolveWeaponImagePath',enabled ? equipment.weaponId : '',equipment.weaponNameJa || resolver?.resolveWeapon?.(equipment.weaponId)?.nameJa || '武器未装備'),
                artifacts:enabled && ids.length ? ids.map(id=>image('resolveArtifactSetImagePath',id,resolver?.resolveArtifactSet?.(id)?.nameJa || artifactForId(id)?.nameJa || '聖遺物')) : [image('resolveArtifactSetImagePath','','聖遺物未装備')]
            };
        });
    }

    function updatePartyPreview() {
        const preview=byId('genshinPartyPreview');
        if (!preview) return;
        const character=characterForId(byId('genshinCalcCharacterId')?.value);
        const main={slot:1,enabled:Boolean(character),characterId:character?.id,nameJa:character?.nameJa,element:character?.element,
            constellation:String(byId('genshinReflectConstellation')?.value || '').replace(/^C/,''),
            equipment:{weaponId:byId('genshinCalcWeaponId')?.value,artifactSetMode:byId('genshinArtifactSetMode')?.value,
                artifactSetIds:[byId('genshinArtifactSetOne')?.value,byId('genshinArtifactSetTwo')?.value]}};
        const escape=value=>String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
        const icon=(item,css)=>'<img class="'+css+'" src="'+escape(item.src)+'" alt="'+escape(item.name)+'" title="'+escape(item.name)+'" width="32" height="32">';
        preview.innerHTML=partyPreviewItems([main,...SUPPORT_SLOTS.map(readSupportMember)]).map(item=>
            '<div class="genshin-party-preview-member" data-party-preview-slot="'+item.slot+'">'
            +icon({...item.character,name:item.name},'genshin-party-preview-character')
            +'<div class="genshin-party-preview-equipment">'+icon(item.weapon,'genshin-party-preview-icon')+item.artifacts.map(artifact=>icon(artifact,'genshin-party-preview-icon')).join('')+'</div>'
            +'<strong>'+escape(item.name)+'</strong><small>'+escape(item.meta)+'</small></div>').join('');
        preview.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.src=FALLBACK_IMAGE;},{once:true}));
    }

    function updateSummary() {
        updatePartyPreview();
        const selected = SUPPORT_SLOTS.map(readSupportMember).filter((member) => member.enabled);
        const mainCharacter = characterForId(String(byId("genshinCalcCharacterId")?.value || ""));
        const activeResonances = window.GenshinElementalResonance?.detectActiveResonances?.({ members: [mainCharacter ? { enabled: true, characterId: mainCharacter.id, element: mainCharacter.element } : null, ...selected].filter(Boolean) }) || [];
        const activePrefixes = selected.map((member) => `party:${member.slot}:${member.characterId}:`);
        const resonancePrefixes = activeResonances.map((item) => `resonance:${item.id}:`);
        const enabledCount = Object.entries(buffStateByKey).filter(([key, enabled]) => enabled && [...activePrefixes, ...resonancePrefixes].some((prefix) => key.startsWith(prefix))).length;
        const summary = byId("genshinPartySummary");
        if (!summary) return;
        summary.textContent = selected.length
            ? `${selected.length}人設定：${selected.map((item) => item.nameJa).join("、")}${activeResonances.length ? `／共鳴：${activeResonances.map((item) => item.nameJa).join("、")}` : ""}${enabledCount ? `／補正ON ${enabledCount}件` : ""}`
            : "サポートメンバーは未設定です。";
    }

    function syncSlot(slot) {
        const character = characterForId(byId(`genshinPartyCharacter${slot}`)?.value);
        const weapon = weaponForId(byId(`genshinPartyWeapon${slot}`)?.value);
        const artifactOne = artifactForId(byId(`genshinPartyArtifactOne${slot}`)?.value);
        const artifactTwo = artifactForId(byId(`genshinPartyArtifactTwo${slot}`)?.value);
        const selected = Boolean(character);
        const weaponSelected = Boolean(weapon);
        const artifactModeValue = String(byId(`genshinPartyArtifactMode${slot}`)?.value || "4pc");
        const artifactMode = ["4pc", "2pc2pc", "2pc", "none"].includes(artifactModeValue) ? artifactModeValue : "4pc";
        const characterImage = byId(`genshinPartyCharacterImage${slot}`);
        const weaponImage = byId(`genshinPartyWeaponImage${slot}`);
        characterImage.src = selected ? `/games/images/genshin/characters/${character.id}.webp` : FALLBACK_IMAGE;
        weaponImage.src = weaponSelected ? `/games/images/genshin/weapons/${weapon.id}.webp` : FALLBACK_IMAGE;
        byId(`genshinPartyCharacterName${slot}`).textContent = character?.nameJa || "選択する";
        byId(`genshinPartyWeaponName${slot}`).textContent = weapon?.nameJa || (selected ? "武器を選択" : "キャラを先に選択");
        byId(`genshinPartyWeaponTrigger${slot}`).disabled = !selected;
        byId(`genshinPartyArtifactMode${slot}`).disabled = !selected;
        byId(`genshinPartyArtifactOneTrigger${slot}`).disabled = !selected;
        byId(`genshinPartyArtifactTwoTrigger${slot}`).disabled = !selected;
        byId(`genshinPartyArtifactTwoTrigger${slot}`).hidden = artifactMode !== "2pc2pc";
        [["One", artifactOne], ["Two", artifactTwo]].forEach(([name, artifact]) => {
            const image = byId(`genshinPartyArtifact${name}Image${slot}`);
            image.src = artifact ? `/games/images/genshin/artifacts/${artifact.id}.webp` : FALLBACK_IMAGE;
            byId(`genshinPartyArtifact${name}Name${slot}`).textContent = artifact?.shortNameJa || artifact?.nameJa || "聖遺物を選択";
        });
        [`Level`, `Constellation`, `NormalTalent`, `SkillTalent`, `BurstTalent`, `Hp`, `Atk`, `Def`, `ElementalMastery`].forEach((name) => { const input = byId(`genshinParty${name}${slot}`); if (input) input.disabled = !selected; });
        [`WeaponLevel`, `Refinement`].forEach((name) => { const input = byId(`genshinParty${name}${slot}`); if (input) input.disabled = !weaponSelected; });
        const refinementInput = byId(`genshinPartyRefinement${slot}`);
        const confirmedRefinements = Array.isArray(weapon?.confirmedRefinements)
            ? new Set(weapon.confirmedRefinements.map(Number))
            : null;
        Array.from(refinementInput?.options || []).forEach((option, index) => {
            const rank = Number(option.value || index + 1);
            const enabled = !confirmedRefinements || confirmedRefinements.has(rank);
            option.disabled = !enabled;
            option.textContent = enabled ? `R${rank}` : `R${rank}（未確認）`;
        });
        if (confirmedRefinements && !confirmedRefinements.has(Number(refinementInput?.value))) {
            refinementInput.value = String([...confirmedRefinements].sort((a, b) => a - b)[0] || 1);
        }
        const base = window.GenshinBaseStats?.resolveMember?.({ characterId: character?.id, weaponId: weapon?.id, level: byId(`genshinPartyLevel${slot}`)?.value, weaponLevel: byId(`genshinPartyWeaponLevel${slot}`)?.value });
        byId(`genshinPartyBaseSummary${slot}`).textContent = base
            ? `基礎HP ${Math.round(base.baseHp).toLocaleString("ja-JP")}／基礎攻撃力 ${Math.round(base.baseAtk).toLocaleString("ja-JP")}／基礎防御力 ${Math.round(base.baseDef).toLocaleString("ja-JP")}`
            : selected ? "基礎値データを取得できません。" : "キャラと武器を選ぶと基礎値を自動取得します。";
        updateSummary();
    }

    function writeImportedValue(id, value) {
        const input = byId(id);
        if (!input) return;
        input.value = value === undefined || value === null ? "" : String(value);
        input.dataset.valueOrigin = "uid";
    }

    function applyImportedMemberToSlot(slot, member) {
        if (!member || String(member.characterId || "") !== String(byId(`genshinPartyCharacter${slot}`)?.value || "")) return false;
        applyingImportedMember = true;
        try {
            const character = characterForId(member.characterId);
            const weapon = weaponForId(member.equipment?.weaponId);
            const compatibleWeaponId = character && weapon?.weaponType === character.weaponType ? weapon.id : "";
            const setIds = (member.equipment?.artifactSetIds || []).filter((setId) => artifactForId(setId)).slice(0, 2);
            writeImportedValue(`genshinPartyCharacter${slot}`, member.characterId);
            writeImportedValue(`genshinPartyLevel${slot}`, member.level || 90);
            writeImportedValue(`genshinPartyConstellation${slot}`, member.constellation || 0);
            writeImportedValue(`genshinPartyNormalTalent${slot}`, member.talentLevels?.normal || 1);
            writeImportedValue(`genshinPartySkillTalent${slot}`, member.talentLevels?.skill || 1);
            writeImportedValue(`genshinPartyBurstTalent${slot}`, member.talentLevels?.burst || 1);
            writeImportedValue(`genshinPartyWeapon${slot}`, compatibleWeaponId);
            writeImportedValue(`genshinPartyWeaponLevel${slot}`, compatibleWeaponId ? member.equipment?.weaponLevel || 90 : 90);
            writeImportedValue(`genshinPartyRefinement${slot}`, compatibleWeaponId ? member.equipment?.refinement || 1 : 1);
            writeImportedValue(`genshinPartyArtifactMode${slot}`, member.equipment?.artifactSetMode || "none");
            writeImportedValue(`genshinPartyArtifactOne${slot}`, setIds[0] || "");
            writeImportedValue(`genshinPartyArtifactTwo${slot}`, setIds[1] || "");
            writeImportedValue(`genshinPartyHp${slot}`, member.stats?.hp || "");
            writeImportedValue(`genshinPartyAtk${slot}`, member.stats?.atk || "");
            writeImportedValue(`genshinPartyDef${slot}`, member.stats?.def || "");
            writeImportedValue(`genshinPartyElementalMastery${slot}`, member.stats?.elementalMastery || "");
        } finally {
            applyingImportedMember = false;
        }
        syncSlot(slot);
        return true;
    }

    function registerUidProfile(detail = {}) {
        const mapper = window.GenshinProfileMapper;
        const contract = window.GenshinDataContract;
        const mappedCharacters = Array.isArray(detail.profile?.characters) ? detail.profile.characters : [];
        const calculationInputs = mappedCharacters.map((character) => mapper?.toCalculationInput?.(character)).filter(Boolean);
        if (detail.input?.characterId && !calculationInputs.some((input) => input.characterId === detail.input.characterId)) {
            calculationInputs.push(detail.input);
        }
        uidMembersByCharacterId = new Map(calculationInputs.map((input) => {
            const member = contract?.createPartyMemberFromCalculationInput?.(input, 2);
            return [String(input.characterId), member];
        }).filter(([, member]) => member));
        SUPPORT_SLOTS.forEach((slot) => {
            const characterId = String(byId(`genshinPartyCharacter${slot}`)?.value || "");
            if (characterId && uidMembersByCharacterId.has(characterId)) {
                applyImportedMemberToSlot(slot, uidMembersByCharacterId.get(characterId));
            }
        });
        updateSummary();
        return uidMembersByCharacterId.size;
    }

    function setPartySelection(slot, kind, item, artifactSlot = "one") {
        const numericSlot = Number(slot);
        if (!SUPPORT_SLOTS.includes(numericSlot) || (!item && kind !== "artifact")) return false;
        restoredMemberBySlot.delete(numericSlot);
        if (kind === "character") {
            if (selectedCharacterIds(numericSlot).includes(String(item.id))) return false;
            byId(`genshinPartyCharacter${numericSlot}`).value = item.id;
            byId(`genshinPartyCharacter${numericSlot}`).dataset.valueOrigin = "manual";
            const currentWeapon = weaponForId(byId(`genshinPartyWeapon${numericSlot}`).value);
            if (currentWeapon && currentWeapon.weaponType !== item.weaponType) byId(`genshinPartyWeapon${numericSlot}`).value = "";
            const imported = uidMembersByCharacterId.get(String(item.id));
            if (imported) return applyImportedMemberToSlot(numericSlot, imported);
        } else if (kind === "weapon") {
            const character = characterForId(byId(`genshinPartyCharacter${numericSlot}`).value);
            if (!character || item.weaponType !== character.weaponType) return false;
            byId(`genshinPartyWeapon${numericSlot}`).value = item.id;
            byId(`genshinPartyWeapon${numericSlot}`).dataset.valueOrigin = "manual";
        } else if (kind === "artifact") {
            const suffix = artifactSlot === "two" ? "Two" : "One";
            const otherSuffix = suffix === "One" ? "Two" : "One";
            const field = byId(`genshinPartyArtifact${suffix}${numericSlot}`);
            if (!field) return false;
            if (item && byId(`genshinPartyArtifactMode${numericSlot}`)?.value === "2pc2pc"
                && byId(`genshinPartyArtifact${otherSuffix}${numericSlot}`)?.value === String(item.id)) {
                byId(`genshinPartyArtifact${otherSuffix}${numericSlot}`).value = "";
            }
            field.value = item?.id || "";
            field.dataset.valueOrigin = "manual";
        }
        syncSlot(numericSlot);
        return true;
    }

    function clearSlot(slot) {
        restoredMemberBySlot.delete(Number(slot));
        clearPartyConditionStates(slot);
        sectionInputs(slot).forEach((input) => { input.dataset.valueOrigin = "manual"; });
        byId(`genshinPartyCharacter${slot}`).value = "";
        byId(`genshinPartyWeapon${slot}`).value = "";
        byId(`genshinPartyArtifactOne${slot}`).value = "";
        byId(`genshinPartyArtifactTwo${slot}`).value = "";
        syncSlot(slot);
    }

    function closeDialog() {
        const dialog = byId("genshinPartyDialog");
        if (dialog?.open) dialog.close();
        byId("genshinPartyDialogOpen")?.focus();
    }

    function setBuffEnabled(key, enabled) { if (key) { buffStateByKey[key] = Boolean(enabled); updateSummary(); } }
    function getBuffEnabled(key) { return Boolean(buffStateByKey[key]); }

    function clearPartyConditionStates(slot) {
        const prefix = `party:${Number(slot)}:`;
        Object.keys(partyConditionStateByKey)
            .filter((key) => key.startsWith(prefix))
            .forEach((key) => delete partyConditionStateByKey[key]);
    }

    function setPartyConditionState(key, kind, value) {
        const normalizedKey = String(key || "");
        const normalizedKind = String(kind || "option");
        if (!normalizedKey || !["option", "stack", "targetCount"].includes(normalizedKind) || value === undefined || value === null) return false;
        const normalizedValue = normalizedKind === "option"
            ? String(value)
            : String(value).trim() === "" ? "" : Number(value);
        if (normalizedKind !== "option" && normalizedValue !== "" && !Number.isFinite(normalizedValue)) return false;
        partyConditionStateByKey[normalizedKey] = {
            ...(partyConditionStateByKey[normalizedKey] || {}),
            [normalizedKind]: normalizedValue
        };
        return true;
    }

    function getPartyConditionState(key) {
        const state = partyConditionStateByKey[String(key || "")];
        return state ? { ...state } : null;
    }

    function getPartyConditionStates() {
        return cloneConditionStates(partyConditionStateByKey);
    }

    async function init() {
        if (window.GenshinIdResolver) {
            await Promise.all([window.GenshinIdResolver.ready, window.GenshinBaseStats?.ready]);
            characters = window.GenshinIdResolver.listCharacters().slice();
            weapons = window.GenshinIdResolver.listWeapons().filter((item) => item.selectable !== false);
            artifactSets = window.GenshinIdResolver.listArtifactSets().filter((item) => {
                const effect = window.GenshinIdResolver.resolveArtifactSetEffect(item.id);
                return Boolean(effect?.twoPieceEffect || effect?.fourPieceEffect);
            });
        }
        const list = byId("genshinPartyMemberList");
        if (!list) return;
        SUPPORT_SLOTS.forEach((slot) => list?.appendChild(renderSlot(slot)));
        SUPPORT_SLOTS.forEach((slot) => {
            byId(`genshinPartyCharacterTrigger${slot}`)?.addEventListener("click", (event) => window.GenshinSelectionModal?.openPartySelection?.("character", slot, event.currentTarget));
            byId(`genshinPartyWeaponTrigger${slot}`)?.addEventListener("click", (event) => window.GenshinSelectionModal?.openPartySelection?.("weapon", slot, event.currentTarget));
            byId(`genshinPartyArtifactOneTrigger${slot}`)?.addEventListener("click", (event) => window.GenshinSelectionModal?.openPartySelection?.("artifact", slot, event.currentTarget, "one"));
            byId(`genshinPartyArtifactTwoTrigger${slot}`)?.addEventListener("click", (event) => window.GenshinSelectionModal?.openPartySelection?.("artifact", slot, event.currentTarget, "two"));
            byId(`genshinPartyCharacterImage${slot}`)?.addEventListener("error", (event) => { event.currentTarget.src = FALLBACK_IMAGE; });
            byId(`genshinPartyWeaponImage${slot}`)?.addEventListener("error", (event) => { event.currentTarget.src = FALLBACK_IMAGE; });
            sectionInputs(slot).forEach((input) => {
                const handleChange = () => {
                    if (!applyingImportedMember) {
                        input.dataset.valueOrigin = "manual";
                        restoredMemberBySlot.delete(slot);
                    }
                    syncSlot(slot);
                };
                input.addEventListener("input", handleChange);
                input.addEventListener("change", handleChange);
            });
            syncSlot(slot);
        });
        list?.addEventListener("click", (event) => { const button = event.target.closest("[data-party-clear]"); if (button) clearSlot(Number(button.dataset.partyClear)); });
        byId("genshinCalcCharacterId")?.addEventListener("input", () => {
            SUPPORT_SLOTS.forEach((slot) => { if (byId(`genshinPartyCharacter${slot}`)?.value === byId("genshinCalcCharacterId")?.value) clearSlot(slot); else syncSlot(slot); });
        });
        document.addEventListener("input", event => { if (["genshinCalcCharacterId","genshinCalcWeaponId","genshinReflectConstellation","genshinArtifactSetMode","genshinArtifactSetOne","genshinArtifactSetTwo"].includes(event.target?.id)) updatePartyPreview(); });
        document.addEventListener("change", event => { if (["genshinCalcCharacterId","genshinCalcWeaponId","genshinReflectConstellation","genshinArtifactSetMode","genshinArtifactSetOne","genshinArtifactSetTwo"].includes(event.target?.id)) updatePartyPreview(); });
        const dialog = byId("genshinPartyDialog");
        byId("genshinPartyDialogOpen")?.addEventListener("click", () => dialog?.showModal());
        byId("genshinPartyDialogClose")?.addEventListener("click", closeDialog);
        byId("genshinPartyDialogDone")?.addEventListener("click", closeDialog);
        dialog?.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
        updateSummary();
        initialized = true;
        pendingRestores.splice(0).forEach((restore) => restore());
        resolveReady(window.GenshinPartyState);
    }

    function sectionInputs(slot) {
        return ["Character", "Weapon", "ArtifactMode", "ArtifactOne", "ArtifactTwo", "Level", "Constellation", "WeaponLevel", "Refinement", "NormalTalent", "SkillTalent", "BurstTalent", "Hp", "Atk", "Def", "ElementalMastery"]
            .map((name) => byId(`genshinParty${name}${slot}`)).filter(Boolean);
    }

    window.GenshinPartyState = {
        PARTY_SIZE, SUPPORT_SLOTS, partyPreviewItems, emptySupportMember, normalizeSupportMember, normalizePartyState,
        getSupportState, setBuffEnabled, getBuffEnabled, setPartyConditionState, getPartyConditionState, getPartyConditionStates, setPartySelection,
        selectedCharacterIds, characterForId, weaponForId, artifactForId,
        applyImportedMemberToSlot, registerUidProfile, restoreSupportState, ready
    };

    // UID mapping may finish while the async catalog initialization above is still
    // pending. Register immediately so the selected profile is never dropped.
    window.addEventListener?.("genshin:calculation-input-selected", (event) => registerUidProfile(event.detail || {}));

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();
