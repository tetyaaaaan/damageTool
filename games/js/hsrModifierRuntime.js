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
    if (reference === "party.elationCount") {
      const ids = [context.characterId, ...(context.partyIds || [])].filter(Boolean).map(String);
      // Unknown or repeated members cannot establish a legal party count.
      if (!ids.length || ids.length > 4 || new Set(ids).size !== ids.length || ids.some((id) => !context.partyPaths?.[id])) return NaN;
      return ids.filter((id) => context.partyPaths[id] === "Elation").length;
    }
    const map = {
      "self.hp": context.stats?.hp,
      "self.hpPercent": context.stats?.hpPercent,
      "self.preCombatSpeed": inputs["pre-combat-speed"],
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
    if (reference === "self.preCombatSpeed") { const value = map[reference]; return Number.isFinite(value) && value > 0 && value <= 99999 ? value : NaN; }
    if (["self.hpPercent", "enemy.hpPercent", "self.epPercent"].includes(reference)) {
      const value = map[reference];
      return Number.isFinite(value) && value >= 0 && value <= 100 ? value : NaN;
    }
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
        if (record.providerScope === "party") return { selected: false };
        if (source.kind === "eidolon" && number(context.eidolon) < number(source.eidolonRank, 1)) return { selected: false };
        return { selected: true, tab: "キャラ", sourceName, providerId: id };
      }
      if (record.providerScope !== "self" && partyIds.includes(id) && PARTY_TARGETS.has(record.target?.owner)) {
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
      if (selected && !record.target?.excludeSelf) return { selected: true, tab: "遺物", sourceName };
      const partyRelic = (context.partyEquipment || []).find((item) => (!record.target?.excludeSelf || String(item.characterId || "") !== characterId)
        && (item.relicIds || []).map(String).includes(id) && (!source.setPieces || number(item.relicMode, 4) >= source.setPieces));
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

  function modifierLevel(record, context, inputs) {
    const value = record.value || {};
    if (value.levelInputKey) return inputs[value.levelInputKey] === undefined ? value.levelDefault : inputs[value.levelInputKey];
    return typeof context.traceLevelFor === "function" ? context.traceLevelFor(record.source) : undefined;
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
      const level = number(modifierLevel(record, context, inputs), 1);
      const amount = number(value.values?.[Math.max(0, Math.min(value.values.length - 1, level - 1))]);
      const count = inputs[value.inputKey] === undefined ? value.default : inputs[value.inputKey];
      return amount * (value.inputMultipliers ? number(value.inputMultipliers[count]) : 1);
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
      const refinement = number(selection.refinement ?? context.refinement, 1);
      const perStack = Array.isArray(value.values) ? number(value.values[Math.max(0, Math.min(4, refinement - 1))]) : number(value.perStack);
      return perStack * Math.max(number(value.minimum, 0), Math.min(number(value.maximum, Number.MAX_SAFE_INTEGER), raw));
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
    if (activation.reference === "enemy.quantumWeakness") {
      // The enemy weakness selector describes the main character's element, not each component.
      const automatic = context.characterElement === "Quantum";
      const active = automatic ? context.enemy?.weakness === true : Boolean(input ?? activation.default);
      return { active, automatic, mode: automatic ? "statThreshold" : "toggle", inputValue: active ? 1 : 0, threshold: 1 };
    }
    if (activation.mode === "always") return { active: true, automatic: true };
    if (activation.mode === "toggle") {
      return { active: Boolean(input ?? activation.default), automatic: false };
    }
    if (activation.mode === "toggleThreshold") {
      const current = referenceValue(activation.reference, context, inputs);
      const toggled = Boolean(input ?? activation.default);
      return { active: toggled && compare(current, activation.operator, number(activation.threshold)), unresolved: toggled && ["self.hpPercent", "enemy.hpPercent"].includes(activation.reference) && !Number.isFinite(current), automatic: false, toggled, inputValue: current, threshold: number(activation.threshold) };
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
        : ["self.epPercent", "self.preCombatSpeed"].includes(activation.reference) && !Number.isFinite(explicitInput) ? NaN : number(explicitInput, activation.default || 0);
      if (activation.reference === "self.epPercent" && (!Number.isFinite(current) || current < 0 || current > 100)) current = NaN;
      if (activation.reference === "self.preCombatSpeed" && (!Number.isFinite(current) || current <= 0 || current > 99999)) current = NaN;
      if (activation.mode === "numericThreshold" && activation.inputKey) {
        current = Math.max(
          number(activation.minimum, Number.NEGATIVE_INFINITY),
          Math.min(number(activation.maximum, Number.POSITIVE_INFINITY), current)
        );
      }
      // Only the declared HP-ratio comparison is supported; no dependency iteration.
      const referenceComparison = activation.thresholdReference !== undefined;
      const knownComparison = !referenceComparison || (activation.mode === "statThreshold" && activation.reference === "enemy.hpPercent" && activation.thresholdReference === "self.hpPercent" && [context.enemy?.hpPercent, context.stats?.hpPercent].every(value => Number.isFinite(value) && value >= 0 && value <= 100));
      const threshold = referenceComparison ? context.stats?.hpPercent : number(activation.threshold);
      return {
        active: knownComparison && compare(current, activation.operator, threshold),
        unresolved: ([activation.reference, activation.thresholdReference].some(ref => ["self.hpPercent", "enemy.hpPercent", "self.epPercent", "self.preCombatSpeed"].includes(ref))) && (!Number.isFinite(current) || !knownComparison),
        automatic: activation.mode === "statThreshold" || !activation.inputKey,
        inputValue: current,
        threshold
      };
    }
    return { active: false, automatic: false };
  }

  function buildRawCandidates(records = [], context = {}, inputs = {}) {
    return records.flatMap((record) => {
      const selection = sourceSelection(record, context);
      if (!selection.selected) return [];
      const activation = activationState(record, context, inputs);
      const inclusion = record.finalStatsInclusion;
      const includedInFinalStats = Boolean(inclusion && (inputs[inclusion.inputKey] ?? (inclusion.legacyToggleKey && inputs[inclusion.legacyToggleKey] === false)));
      const supportStatus = record.support?.status || "review";
      const calculable = supportStatus === "calculable" && record.inputPolicy !== "includedInFinalStats";
      const value = resolveValue(record, context, inputs, selection);
      const unknownReference = Boolean(activation.toggled && !Number.isFinite(activation.inputValue));
      const validation = record.inputValidation;
      const validatedInputKey = record.value?.inputKey || (record.activation?.mode === "stack" ? record.activation.inputKey : undefined);
      const raw = record.value?.providerStat
        ? (selection.providerId === String(context.characterId) ? context.stats?.[record.value.providerStat] : context.partyStats?.[selection.providerId]?.[record.value.providerStat])
        : inputs[validatedInputKey] === undefined ? (record.value?.default ?? (record.activation?.mode === "stack" ? record.activation.default : undefined)) : inputs[validatedInputKey];
      const invalidValue = Boolean(validation && validatedInputKey && (!Number.isFinite(raw) || raw < validation.minimum || raw > validation.maximum || (validation.integer && !Number.isInteger(raw))));
      let enabled = !includedInFinalStats && calculable && (activation.active || unknownReference || (record.activation?.mode === "stack" && invalidValue));
      // A known zero multiplier needs no level; state-consistency checks still take precedence.
      if (record.value?.inputMultipliers?.[raw] === 0 && !validation?.whenToggle) enabled = false;
      const inputWarnings = [];
      if (unknownReference) inputWarnings.push("パーティの愉悦人数を確認できません。キャラクターの重複・未収録IDを確認してください。");
      if (enabled && validation) {
        if (invalidValue) inputWarnings.push((record.value?.inputLabel || record.activation?.inputLabel) + "に" + validation.minimum + "～" + validation.maximum + "の" + (validation.integer ? "整数" : "数値") + "を入力してください。");
        const eidolon = selection.providerId === String(context.characterId) ? context.eidolon : context.partyEidolons?.[selection.providerId];
        if (number(eidolon) > validation.maximumEidolon) inputWarnings.push(`${record.name}は支援者の星魂${validation.maximumEidolon}まで計算対応です。`);
        const level = modifierLevel(record, context, inputs);
        const levelMaximum = validation.levelMaximumAtEidolon && number(eidolon) >= number(validation.levelMaximumAtEidolon.rank)
          ? number(validation.levelMaximumAtEidolon.maximum)
          : validation.levelMaximum;
        if (validation.whenToggle && inputs[validation.whenToggle.inputKey] && raw !== validation.whenToggle.equals) inputWarnings.push(validation.whenToggle.message);
        if (!Number.isInteger(level) || level < 1 || level > levelMaximum) inputWarnings.push(`${record.value?.levelInputLabel || `${record.name}の天賦Lv`}に1～${levelMaximum}の整数を入力してください。`);
      }
      if (record.value?.inputMultipliers?.[inputs[record.value.inputKey] ?? record.value.default] === 0 && !inputWarnings.length) enabled = false;
      const requiredInput = Boolean(validation && record.value?.inputKey && record.value.default === undefined);
      const missingInput = Boolean(validation && record.value?.inputKey && !Number.isFinite(raw));
      const displayInput = (input) => Number.isFinite(input) ? input : "未入力";
      return [{
        id: record.id,
        tab: selection.tab,
        name: record.name,
        description: record.description,
        conditionText: record.value?.levelInputKey
          ? `${record.activation?.conditionText || ""}（Lv${displayInput(modifierLevel(record, context, inputs))}・${displayInput(inputs[record.value.inputKey] === undefined ? record.value.default : inputs[record.value.inputKey])}${record.value.inputUnit || ""}）`
          : record.activation?.conditionText || "",
        source: record.source,
        sourceName: selection.sourceName,
        category: record.category,
        stat: record.stat || null,
        requiredBaseStat: record.value?.kind === "targetBasePercentCappedByProviderPercentByLevel" ? record.value.targetStat || "atk" : null,
        unit: record.unit,
        value,
        enabled,
        applicable: inputWarnings.length === 0,
        inputWarnings,
        includedInFinalStats,
        inclusionInput: inclusion ? {key:inclusion.inputKey,label:inclusion.inputLabel,checked:includedInFinalStats} : null,
        automatic: activation.automatic,
        activation: { ...record.activation, ...activation },
        providerId: selection.providerId || null,
        strictInput: requiredInput || Boolean(validation && record.value?.inputMultipliers),
        levelInput: record.value?.levelInputKey ? {
          key: record.value.levelInputKey,
          label: record.value.levelInputLabel || "効果レベル",
          value: modifierLevel(record, context, inputs),
          maximum: record.inputValidation?.levelMaximum || 6
        } : null,
        valueInput: record.value?.multiplierInputKey ? {
          type: "toggle",
          key: record.value.multiplierInputKey,
          label: record.value.multiplierInputLabel || "追加条件を満たす",
          checked: Boolean(inputs[record.value.multiplierInputKey])
        } : record.value?.inputKey ? {
          type: record.value.providerStat ? "providerStat" : "number",
          key: record.value.inputKey,
          shared: record.value.sharedInput === true,
          label: record.value.inputLabel || "参照値",
          value: missingInput ? NaN : record.value.providerStat
            ? number(selection.providerId && context.partyStats?.[selection.providerId]?.[record.value.providerStat] !== undefined
              ? context.partyStats[selection.providerId][record.value.providerStat]
              : context.stats?.[record.value.providerStat], number(inputs[record.value.inputKey], record.value.default || 0))
            : record.value.inputMultipliers ? (inputs[record.value.inputKey] === undefined ? record.value.default : inputs[record.value.inputKey]) : number(inputs[record.value.inputKey], record.value.default || 0),
          providerId: selection.providerId || null,
          providerStat: record.value.providerStat || null,
          unit: record.value.inputUnit,
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
        effectLabel: includedInFinalStats ? "最終入力に反映済み（追加なし）" : record.inputPolicy === "includedInFinalStats" ? "最終入力に含める（再加算なし）" : missingInput ? "入力後に算出" : `${value}${record.unit === "percent" ? "%" : ""}`,
        reason: activation.unresolved && calculable && !includedInFinalStats ? "条件の参照値が未確定のため、この効果は追加しません。" : inputWarnings.length ? inputWarnings.join(" ") : calculable ? "" : (record.support?.reason || "計算反映前の確認が必要です。")
      }];
    });
  }

  // One bounded pass: only independent, combat-wide stat additions can feed opted-in thresholds.
  // Threshold-derived effects never feed this pass, so dependency cycles are not iterated.
  function buildCandidates(records = [], context = {}, inputs = {}) {
    const initial = buildRawCandidates(records, context, inputs);
    const byId = new Map(records.map(record => [record.id, record]));
    const independent = initial.map(item => typeof context.validateCandidate === "function" ? context.validateCandidate(item) : item).filter(item => {
      const record = byId.get(item.id), target = item.target || {};
      const types = target.attackTypes || [];
      return item.enabled && item.applicable && item.calculable && record?.activation?.statSource !== "effective"
        && ["always", "toggle", "stack"].includes(record?.activation?.mode)
        && ["fixed","byLevel","byRefinement","perStack","perStackByLevel","perStackByRefinement"].includes(record?.value?.kind)
        && (!target.attackIds?.length && !target.elements?.length && !item.primaryTargetOnly && !item.adjacentTargetOnly)
        && (types.includes("all") || ["normal", "skill", "ultimate", "followUp"].every(type => types.includes(type)))
        && (!context.attack || applicableToAttack(item, context.attack))
        && (["critRate", "breakEffect", "statFlat", "statPercent"].includes(item.category));
    });
    const groups = new Map();
    independent.forEach(item => { const key=item.stacking?.group || item.id; if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item); });
    const contributors = [...groups.values()].flatMap(items => {
      const rule=items[0].stacking?.rule || "add";
      if(rule==="multiply")return [];
      if(rule==="add")return items;
      return [rule==="replace"?items.at(-1):items.reduce((best,item)=>item.value>best.value?item:best,items[0])];
    });
    const evaluate = (item, extra = []) => {
      const statContributors = [...contributors, ...extra];
      const record=byId.get(item.id);
      if(record?.activation?.statSource!=="effective")return item;
      const stat=String(record.activation.reference||"").replace(/^self\./, "");
      if(!["critRate","speed","breakEffect","atk"].includes(stat) || (["critRate", "breakEffect"].includes(record.category) && record.category===stat) || (["statFlat","statPercent"].includes(record.category)&&record.stat===stat)) {
        return {...item,enabled:true,applicable:false,inputWarnings:["この閾値の参照依存は未対応です。"],reason:"自身の参照値を変える閾値は再帰評価しません。"};
      }
      if (!Number.isFinite(context.stats?.[stat])) {
        return {...item,enabled:true,applicable:false,inputWarnings:[`閾値判定に必要な${stat}が未入力です。`],reason:"閾値の参照値を確定できません。"};
      }
      if (statContributors.some(m=>m.category==="statPercent" && m.stat===stat) && !Number.isFinite(context.baseStats?.[stat])) {
        return {...item,enabled:true,applicable:false,inputWarnings:[`閾値判定に必要な基礎${stat}が未入力です。`],reason:"閾値の参照値を確定できません。"};
      }
      const sum=(category)=>statContributors.filter(m=>m.category===category && ((["critRate", "breakEffect"].includes(category) && category===stat) || m.stat===stat)).reduce((total,m)=>total+m.value,0);
      const added=sum("statFlat") + number(context.baseStats?.[stat])*sum("statPercent")/100 + (stat==="critRate"?sum("critRate"):0) + (stat==="breakEffect"?sum("breakEffect"):0);
      const effectiveContext={...context,stats:{...context.stats,[stat]:number(context.stats?.[stat])+added}};
      return {...buildRawCandidates([record],effectiveContext,inputs)[0],thresholdReferenceValue:effectiveContext.stats[stat]};
    };
    const evaluated = initial.map(item => evaluate(item));
    // Fixed dependency only: effective SPD -> Talia BE -> Iron Cavalry's BE threshold. No feedback into SPD.
    const talia = evaluated.find(item => item.id === "ornament:307:2pc:break-effect-effective-speed");
    if (!talia?.enabled || talia.applicable === false || talia.inputWarnings?.length) return evaluated;
    return evaluated.map(item => {
      const record = byId.get(item.id);
      return record?.source?.kind === "relic" && record.source.id === "119" && record.activation?.statSource === "effective"
        && record.activation.reference === "self.breakEffect" ? evaluate(item, [talia]) : item;
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



  // An explicit completed battle snapshot, not the current attacker's partial stats.
  function partyReferenceSnapshot(id, element, context = {}, inputs = {}) {
    id=String(id||'');
    const fail=reason=>({supported:false,statsOwnerId:id,reason});
    if(!id||![String(context.characterId),...(context.partyIds||[]).map(String)].includes(id)) return fail('参照する味方を現在のパーティから選択してください。');
    const r=context.partyReferences?.[id];
    if(!r||String(r.characterId)!==id||r.level!==80||r.eidolon!==0) return fail('参照する味方はLv80・星魂0の完成済み戦闘ステータスが必要です。');
    if(!(Number.isFinite(r.stats?.atk)&&r.stats.atk>0)||!Number.isFinite(r.stats?.critRate)||r.stats.critRate<0||!Number.isFinite(r.stats?.critDamage)||r.stats.critDamage<0) return fail('参照する味方の最終ATK・会心率・会心ダメージを入力してください。');
    const damageBonus=r.damageBonuses?.[element], resistance=context.enemy?.resistances?.[element] ?? (context.characterElement===element?context.enemy?.resistance:undefined);
    if(!Number.isFinite(damageBonus)||!Number.isFinite(resistance)||!Number.isFinite(r.defenseIgnore)||r.defenseIgnore<0||!Number.isFinite(r.resistancePenetration)||r.resistancePenetration<0) return fail('参照する味方の属性与ダメージ・防御無視・耐性貫通と敵の属性耐性を入力してください。補正なしは0です。');
    const character={id,level:r.level,eidolon:r.eidolon,stats:{...r.stats,damageBonus,damageBonuses:{[element]:damageBonus}},baseStats:{...(r.baseStats||{})}};
    const enemy={...context.enemy,resistance,resistances:{...context.enemy?.resistances,[element]:resistance},defenseIgnore:r.defenseIgnore,resistancePenetration:r.resistancePenetration};
    return {supported:true,statsOwnerId:id,character,enemy,stats:character.stats};
  }

  function supplementalReference(candidate, context = {}, inputs = {}) {
    const definition = candidate.supplementalAttack || {};
    const sourceId = String(candidate.providerId || candidate.sourceMeta?.id || candidate.source?.id || "");
    const ownerId = String(context.characterId || "");
    if (definition.statReference === "selectedParty") {
      const id=String(inputs[definition.ownerInputKey]||''), snapshot=partyReferenceSnapshot(id,definition.element,context,inputs);
      if (![String(context.characterId),...(context.partyIds||[]).map(String)].includes(sourceId)) return {supported:false,reason:"補正の提供者がパーティにいません。",sourceCharacterId:sourceId,statReferenceId:id};
      return {...snapshot,sourceCharacterId:sourceId,statReferenceId:id,damageOwnerId:id,triggerCharacterId:definition.triggerActor==='provider'?sourceId:id,traceOwnerId:sourceId,inputKey:definition.ownerInputKey};
    }
    if (definition.statReference !== "activeCharacter") return {supported:false,reason:"この付加ダメージのステータス参照者は未対応です。"};
    const key = definition.damageBonusInputKey ? definition.damageBonusInputKey + ":" + ownerId : "";
    const sameElement = definition.element === context.characterElement;
    const damageBonus = sameElement ? context.stats?.damageBonus : inputs[key];
    const roles = {sourceCharacterId:sourceId,statReferenceId:ownerId,triggerCharacterId:definition.triggerActor === "provider" ? sourceId : ownerId,traceOwnerId:sourceId};
    if (!sameElement && (!key || !Number.isFinite(damageBonus))) return {supported:false,...roles,inputKey:key,reason:(definition.damageBonusInputLabel||"参照者の属性与ダメージ")+"を入力してください。補正なしは0を指定します。"};
    return {supported:true,...roles,inputKey:key,stats:{...context.stats,damageBonus}};
  }

  const api = { partyReferenceSnapshot, supplementalReference, referenceValue, sourceSelection, resolveValue, activationState, buildCandidates, applicableToAttack };
  global.HsrModifierRuntime = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
