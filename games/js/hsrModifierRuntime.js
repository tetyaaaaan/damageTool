(function (global) {
  "use strict";

  const PARTY_TARGETS = new Set(["activeAlly", "partyAll", "enemySingle", "enemyAll"]);

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function compare(left, operator, right) {
    if (operator === ">=") return left >= right;
    if (operator === ">") return left > right;
    if (operator === "<=") return left <= right;
    if (operator === "<") return left < right;
    if (operator === "==") return left === right;
    return false;
  }

  function referenceValue(reference, context = {}, inputs = {}) {
    const map = {
      "self.hp": context.stats?.hp,
      "self.hpPercent": context.stats?.hpPercent,
      "self.epPercent": context.stats?.epPercent,
      "self.speed": context.stats?.speed,
      "self.atk": context.stats?.atk,
      "self.def": context.stats?.def,
      "self.critRate": context.stats?.critRate,
      "self.critDamage": context.stats?.critDamage,
      "self.effectHitRate": context.stats?.effectHitRate,
      "self.effectRes": context.stats?.effectRes,
      "self.breakEffect": context.stats?.breakEffect,
      "self.elation": context.stats?.elation,
      "enemy.hpPercent": context.enemy?.hpPercent,
      "enemy.weakness": context.enemy?.weakness ? 1 : 0,
      "enemy.debuffCount": context.enemy?.debuffCount,
      "enemy.count": context.enemy?.count,
      "enemy.toughnessRemaining": context.enemy?.toughnessRemaining,
      "party.count": Array.isArray(context.partyIds) ? context.partyIds.filter(Boolean).length + 1 : 1,
      "party.sp": context.party?.sp
    };
    if (map[reference] !== undefined) return number(map[reference]);
    return number(inputs[reference]);
  }

  function sourceSelection(record, context = {}) {
    const source = record.source || {};
    const id = String(source.id || "");
    const characterId = String(context.characterId || "");
    const partyIds = (context.partyIds || []).map(String);
    const selectedRelics = (context.relicIds || []).map(String);
    const sourceName = typeof context.sourceNameFor === "function"
      ? context.sourceNameFor(source.kind, id)
      : record.name;
    if (record.variant && record.variant !== context.enhancementState) return { selected: false };

    if (["character", "trace", "eidolon"].includes(source.kind)) {
      if (id === characterId) {
        if (source.kind === "eidolon" && number(context.eidolon) < number(source.eidolonRank, 1)) return { selected: false };
        return { selected: true, tab: "キャラ", sourceName, providerId: id };
      }
      if (partyIds.includes(id) && PARTY_TARGETS.has(record.target?.owner)) {
        if (source.kind === "eidolon" && number(context.partyEidolons?.[id]) < number(source.eidolonRank, 1)) return { selected: false };
        return { selected: true, tab: "パーティ", sourceName, providerId: id };
      }
      return { selected: false };
    }
    if (source.kind === "lightCone") {
      if (String(context.lightConeId || "") === id) return { selected: true, tab: "光円錐", sourceName, refinement: number(context.refinement, 1) };
      const partyCone = (context.partyEquipment || []).find((item) => String(item.lightConeId || "") === id);
      return partyCone && PARTY_TARGETS.has(record.target?.owner)
        ? { selected: true, tab: "パーティ", sourceName, providerId: String(partyCone.characterId || ""), refinement: number(partyCone.refinement, 1) }
        : { selected: false };
    }
    if (source.kind === "relic") {
      const selected = selectedRelics.includes(id) && (!source.setPieces || number(context.relicMode, 4) >= source.setPieces);
      if (selected) return { selected: true, tab: "遺物", sourceName };
      const partyRelic = (context.partyEquipment || []).find((item) => (item.relicIds || []).map(String).includes(id) && (!source.setPieces || number(item.relicMode, 4) >= source.setPieces));
      return partyRelic && PARTY_TARGETS.has(record.target?.owner)
        ? { selected: true, tab: "パーティ", sourceName, providerId: String(partyRelic.characterId || "") }
        : { selected: false };
    }
    if (source.kind === "ornament") {
      if (String(context.ornamentId || "") === id) return { selected: true, tab: "オーナメント", sourceName };
      const partyOrnament = (context.partyEquipment || []).find((item) => String(item.ornamentId || "") === id);
      return partyOrnament && PARTY_TARGETS.has(record.target?.owner)
        ? { selected: true, tab: "パーティ", sourceName, providerId: String(partyOrnament.characterId || "") }
        : { selected: false };
    }
    if (source.kind === "enemy") return { selected: true, tab: "敵", sourceName };
    if (source.kind === "manual") return { selected: true, tab: "手動", sourceName };
    return { selected: false };
  }

  function resolveValue(record, context = {}, inputs = {}, selection = {}) {
    const value = record.value || {};
    const providerStatValue = () => {
      if (!value.providerStat) return number(inputs[value.inputKey], value.default || 0);
      const providerId = String(selection.providerId || "");
      const partyValue = providerId ? context.partyStats?.[providerId]?.[value.providerStat] : undefined;
      const currentValue = partyValue === undefined ? context.stats?.[value.providerStat] : partyValue;
      return number(currentValue, number(inputs[value.inputKey], value.default || 0));
    };
    if (value.kind === "fixed") return number(value.fixed);
    if (value.kind === "byLevel") {
      const level = typeof context.traceLevelFor === "function"
        ? number(context.traceLevelFor(record.source), 1)
        : 1;
      return number(value.values?.[Math.max(0, Math.min(value.values.length - 1, level - 1))]);
    }
    if (value.kind === "providerStatPercentByLevel") {
      const level = typeof context.traceLevelFor === "function" ? number(context.traceLevelFor(record.source), 1) : 1;
      const percent = number(value.values?.[Math.max(0, Math.min((value.values || []).length - 1, level - 1))]);
      return providerStatValue() * percent / 100;
    }
    if (value.kind === "byRefinement") {
      const refinement = number(selection.refinement ?? context.refinement, 1);
      return number(value.values?.[Math.max(0, Math.min(value.values.length - 1, refinement - 1))]);
    }
    if (value.kind === "perStack") {
      const raw = number(inputs[record.activation?.inputKey], record.activation?.default || 0);
      const minimum = number(record.activation?.minimum, 0);
      const maximum = record.activation?.maximumAtEidolon && number(context.eidolon) >= number(record.activation.maximumAtEidolon.rank)
        ? number(record.activation.maximumAtEidolon.value)
        : number(record.activation?.maximum ?? record.stacking?.maximumStacks, Number.MAX_SAFE_INTEGER);
      return number(value.perStack) * Math.max(minimum, Math.min(maximum, raw));
    }
    if (value.kind === "perStackByLevel") {
      const raw = number(inputs[record.activation?.inputKey], record.activation?.default || 0);
      const minimum = number(record.activation?.minimum, 0);
      const maximum = record.activation?.maximumAtEidolon && number(context.eidolon) >= number(record.activation.maximumAtEidolon.rank)
        ? number(record.activation.maximumAtEidolon.value)
        : number(record.activation?.maximum ?? record.stacking?.maximumStacks, Number.MAX_SAFE_INTEGER);
      const level = typeof context.traceLevelFor === "function" ? number(context.traceLevelFor(record.source), 1) : 1;
      const perStack = number(value.values?.[Math.max(0, Math.min((value.values || []).length - 1, level - 1))]);
      return perStack * Math.max(minimum, Math.min(maximum, raw));
    }
    if (value.kind === "perStackByRefinement") {
      const raw = number(inputs[record.activation?.inputKey], record.activation?.default || 0);
      const minimum = number(record.activation?.minimum, 0);
      const maximum = record.activation?.maximumAtEidolon && number(context.eidolon) >= number(record.activation.maximumAtEidolon.rank)
        ? number(record.activation.maximumAtEidolon.value)
        : number(record.activation?.maximum ?? record.stacking?.maximumStacks, Number.MAX_SAFE_INTEGER);
      const refinement = number(selection.refinement ?? context.refinement, 1);
      const perStack = number(value.values?.[Math.max(0, Math.min((value.values || []).length - 1, refinement - 1))]);
      return perStack * Math.max(minimum, Math.min(maximum, raw));
    }
    if (value.kind === "perReferenceStack") {
      const raw = referenceValue(value.reference, context, inputs);
      return number(value.perStack) * Math.max(number(value.minimum, 0), Math.min(number(value.maximum, Number.MAX_SAFE_INTEGER), raw));
    }
    if (value.kind === "threshold") {
      const current = referenceValue(record.activation?.reference, context, inputs);
      const resolved = [...(value.thresholds || [])]
        .sort((a, b) => number(a.minimum) - number(b.minimum))
        .reduce((resolved, entry) => current >= number(entry.minimum) ? number(entry.value) : resolved, 0);
      return resolved * (value.multiplierInputKey && Boolean(inputs[value.multiplierInputKey])
        ? number(value.multiplierWhenTrue, 1)
        : 1);
    }
    if (value.kind === "inputScaleByLevelPlusByLevel") {
      const level = typeof context.traceLevelFor === "function" ? number(context.traceLevelFor(record.source), 1) : 1;
      const index = Math.max(0, Math.min((value.scaleValues || []).length - 1, level - 1));
      const inputValue = providerStatValue();
      return inputValue * number(value.scaleValues?.[index]) / 100 + number(value.addValues?.[index]);
    }
    if (value.kind === "targetBasePercentCappedByProviderPercentByLevel") {
      const level = typeof context.traceLevelFor === "function" ? number(context.traceLevelFor(record.source), 1) : 1;
      const index = Math.max(0, Math.min((value.targetPercentValues || []).length - 1, level - 1));
      const targetBase = number(context.baseStats?.[value.targetStat || "atk"]);
      const requested = targetBase * number(value.targetPercentValues?.[index]) / 100;
      const cap = providerStatValue() * number(value.capPercentValues?.[index]) / 100;
      return Math.min(requested, cap);
    }
    if (value.kind === "linearThreshold") {
      const current = providerStatValue();
      const steps = Math.max(0, Math.floor((current - number(value.threshold)) / Math.max(0.0001, number(value.step, 1))));
      return Math.min(number(value.maximum, Number.MAX_SAFE_INTEGER), steps * number(value.perStep));
    }
    if (value.kind === "missingHpScaleByLevel") {
      const level = typeof context.traceLevelFor === "function" ? number(context.traceLevelFor(record.source), 1) : 1;
      const index = Math.max(0, Math.min((value.values || []).length - 1, level - 1));
      const currentHpPercent = Math.max(0, Math.min(100, providerStatValue()));
      return number(value.values?.[index]) * (100 - currentHpPercent) / 100;
    }
    return 0;
  }

  function activationState(record, context = {}, inputs = {}) {
    const activation = record.activation || {};
    const input = inputs[activation.inputKey];
    if (activation.mode === "always") return { active: true, automatic: true };
    if (activation.mode === "toggle") {
      return { active: Boolean(input ?? activation.default), automatic: false };
    }
    if (activation.mode === "toggleThreshold") {
      const current = referenceValue(activation.reference, context, inputs);
      const toggled = Boolean(input ?? activation.default);
      return { active: toggled && compare(current, activation.operator, number(activation.threshold)), automatic: false, toggled, inputValue: current, threshold: number(activation.threshold) };
    }
    if (activation.mode === "stack") {
      const maximum = activation.maximumAtEidolon && number(context.eidolon) >= number(activation.maximumAtEidolon.rank)
        ? number(activation.maximumAtEidolon.value, activation.maximum)
        : number(activation.maximum, Number.MAX_SAFE_INTEGER);
      const amount = Math.max(number(activation.minimum, 0), Math.min(maximum, number(input, activation.default || 0)));
      return { active: amount > 0, automatic: false, inputValue: amount, maximum };
    }
    if (["statThreshold", "numericThreshold"].includes(activation.mode)) {
      const explicitInput = activation.inputKey ? inputs[activation.inputKey] : undefined;
      let current = explicitInput === undefined
        ? referenceValue(activation.reference, context, inputs)
        : number(explicitInput, activation.default || 0);
      if (activation.mode === "numericThreshold" && activation.inputKey) {
        current = Math.max(
          number(activation.minimum, Number.NEGATIVE_INFINITY),
          Math.min(number(activation.maximum, Number.POSITIVE_INFINITY), current)
        );
      }
      const threshold = number(activation.threshold);
      return {
        active: compare(current, activation.operator, threshold),
        automatic: activation.mode === "statThreshold" || !activation.inputKey,
        inputValue: current,
        threshold
      };
    }
    return { active: false, automatic: false };
  }

  function buildCandidates(records = [], context = {}, inputs = {}) {
    return records.flatMap((record) => {
      const selection = sourceSelection(record, context);
      if (!selection.selected) return [];
      const activation = activationState(record, context, inputs);
      const supportStatus = record.support?.status || "review";
      const calculable = supportStatus === "calculable" && record.inputPolicy !== "includedInFinalStats";
      const value = resolveValue(record, context, inputs, selection);
      const enabled = calculable && activation.active;
      return [{
        id: record.id,
        tab: selection.tab,
        name: record.name,
        description: record.description,
        conditionText: record.activation?.conditionText || "",
        source: record.source,
        sourceName: selection.sourceName,
        category: record.category,
        stat: record.stat || null,
        unit: record.unit,
        value,
        enabled,
        automatic: activation.automatic,
        activation: { ...record.activation, ...activation },
        providerId: selection.providerId || null,
        valueInput: record.value?.multiplierInputKey ? {
          type: "toggle",
          key: record.value.multiplierInputKey,
          label: record.value.multiplierInputLabel || "追加条件を満たす",
          checked: Boolean(inputs[record.value.multiplierInputKey])
        } : record.value?.inputKey ? {
          type: record.value.providerStat ? "providerStat" : "number",
          key: record.value.inputKey,
          label: record.value.inputLabel || "参照値",
          value: record.value.providerStat
            ? number(selection.providerId && context.partyStats?.[selection.providerId]?.[record.value.providerStat] !== undefined
              ? context.partyStats[selection.providerId][record.value.providerStat]
              : context.stats?.[record.value.providerStat], number(inputs[record.value.inputKey], record.value.default || 0))
            : number(inputs[record.value.inputKey], record.value.default || 0),
          providerId: selection.providerId || null,
          providerStat: record.value.providerStat || null,
          minimum: record.value.minimum,
          maximum: record.value.inputMaximum,
          step: record.value.inputStep || 1
        } : null,
        target: record.target,
        calculation: record.calculation,
        supplementalAttack: record.supplementalAttack || null,
        primaryTargetOnly: record.primaryTargetOnly === true,
        adjacentTargetOnly: record.adjacentTargetOnly === true,
        stacking: record.stacking,
        inputPolicy: record.inputPolicy,
        support: record.support,
        provenance: record.provenance,
        calculable,
        displayOnly: !calculable,
        effectLabel: `${value}${record.unit === "percent" ? "%" : ""}`,
        reason: calculable ? "" : (record.support?.reason || "計算反映前の確認が必要です。")
      }];
    });
  }

  function applicableToAttack(candidate, attack = {}) {
    if (!candidate?.enabled || !candidate.calculable) return false;
    if (candidate.primaryTargetOnly && attack.target === "adjacent") return false;
    if (candidate.adjacentTargetOnly && attack.target !== "adjacent") return false;
    const types = candidate.target?.attackTypes || ["all"];
    const attackIds = candidate.target?.attackIds || [];
    const elements = candidate.target?.elements || [];
    const attackType = attack.attackType || attack.type || "normal";
    const attackTags = Array.isArray(attack.tags) ? attack.tags : [];
    const element = attack.element || "";
    return (!attackIds.length || attackIds.includes(String(attack.id || "")))
      && (types.includes("all") || types.includes(attackType) || attackTags.some((tag) => types.includes(tag)))
      && (!elements.length || elements.includes(element));
  }

  const api = { referenceValue, sourceSelection, resolveValue, activationState, buildCandidates, applicableToAttack };
  global.HsrModifierRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
