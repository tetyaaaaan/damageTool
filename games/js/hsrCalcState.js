(function (global) {
  "use strict";
  const KEY = "tetinet:hsr:calculation:v1";
  const KEYS = ["characterId", "coneId", "relicId", "relicSecondId", "relicMode", "ornamentId", "level", "eidolon", "enhancementState", "coneLevel", "coneRank", "partySp", "attackerPosition", "traceLevels", "source", "stats", "trueDamageInputs", "elationInputs", "songbirdInputs", "breakInputs", "party", "enemyId", "enemy"];
  const ENEMY_KEYS = ["level", "maxHp", "resistance", "weakness", "toughnessActive", "maxToughness", "hpPercent", "count", "debuffCount", "defenseReduction", "defenseIgnore", "resistancePenetration", "takenDamage"];
  const inputState = (state) => ({ ...Object.fromEntries(KEYS.map((key) => [key, state[key]])), enemy: Object.fromEntries(ENEMY_KEYS.map((key) => [key, state.enemy[key]])) });
  const object = (value) => value && typeof value === "object" && !Array.isArray(value);
  const safeKey = (key) => !["__proto__", "prototype", "constructor"].includes(key);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  function create(state, fields = {}) {
    return { schemaVersion: 1, game: "hsr", state: clone(inputState(state)),
      modifierInputs: clone(state.modifierInputs), conditions: state.conditions.map(({ id, value, enabled }) => ({ id, value, enabled })), fields: { ...fields } };
  }

  // Merge only the current input contract. Missing or malformed fields do not erase valid siblings.
  function merge(template, saved) {
    if (Array.isArray(template)) return template.map((item, i) => merge(item, Array.isArray(saved) ? saved[i] : undefined));
    if (object(template)) return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, merge(value, object(saved) ? saved[key] : undefined)]));
    if (typeof template === "number") return saved === null ? NaN : typeof saved === "number" && Number.isFinite(saved) ? saved : template;
    if (typeof template === "boolean") return typeof saved === "boolean" ? saved : template;
    if (typeof template === "string") return typeof saved === "string" && saved.length <= 256 ? saved : template;
    return template;
  }

  function restore(value, defaults, data, fieldIds) {
    if (!object(value) || value.schemaVersion !== 1 || value.game !== "hsr" || !object(value.state)) return null;
    const result = merge(inputState(defaults), value.state);
    if (!["manual", "api", "api-edited"].includes(result.source)) result.source = "manual";
    if (result.source !== "manual") ["memSkill", "memTalent"].forEach((key) => {
      if (!Object.hasOwn(value.state.traceLevels || {}, key)) result.traceLevels[key] = NaN;
    });
    if (!["4pc", "2+2"].includes(result.relicMode)) result.relicMode = defaults.relicMode;
    if (!["enhanced", "previous"].includes(result.enhancementState)) result.enhancementState = defaults.enhancementState;
    result.modifierInputs = Object.fromEntries(Object.entries(object(value.modifierInputs) ? value.modifierInputs : {}).filter(([key, item]) => safeKey(key) && key.length <= 256 && (typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)) || item === null)).slice(0, 2000).map(([key, item]) => [key, item === null ? NaN : item]));
    result.conditions = defaults.conditions.map((item) => {
      const saved = Array.isArray(value.conditions) ? value.conditions.find((entry) => entry?.id === item.id) : null;
      return { ...item, ...merge({ value: item.value, enabled: item.enabled }, saved) };
    });
    const fields = Object.fromEntries(Object.entries(object(value.fields) ? value.fields : {}).filter(([id, item]) => fieldIds.includes(id) && typeof item === "string" && item.length <= 128));
    const missing = [];
    const check = (id, collection) => { if (id && !(data[collection] || []).some((item) => item.id === id)) missing.push(id); };
    check(result.characterId, "characters"); check(result.coneId, "lightCones");
    if (result.enemyId !== "custom") check(result.enemyId, "enemies");
    [result.relicId, result.relicSecondId, result.ornamentId].forEach((id) => check(id, "relicSets"));
    result.attackerPosition = Number.isInteger(result.attackerPosition) && result.attackerPosition >= 1 && result.attackerPosition <= 4 ? result.attackerPosition : 1;
    result.party.forEach((member, index) => {
      if (member.source !== "api") member.source = "manual";
      const emptyLevels = Object.fromEntries(Object.keys(defaults.traceLevels || {}).map((key) => [key, NaN]));
      member.traceLevels = merge(emptyLevels, value.state.party?.[index]?.traceLevels || {});
      check(member.characterId, "characters"); check(member.lightConeId, "lightCones");
      [member.relicId, member.relicSecondId, member.ornamentId].forEach((id) => check(id, "relicSets"));
    });
    return { state: result, fields, missing };
  }

  function load(storage) {
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return { value: null };
      if (raw.length > 250000) return { error: true };
      return { value: JSON.parse(raw) };
    } catch (_) { return { error: true }; }
  }
  function save(storage, value) { try { storage.setItem(KEY, JSON.stringify(value)); return true; } catch (_) { return false; } }
  function clear(storage) { try { storage.removeItem(KEY); return true; } catch (_) { return false; } }
  const api = Object.freeze({ KEY, create, restore, load, save, clear });
  global.HsrCalcState = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
