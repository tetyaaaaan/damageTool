(function () {
    "use strict";

    function parseSource(source) {
        const [type, id = ""] = String(source || "").split(":");
        return { type, id };
    }

    function setModifierStack(context, modifier, stack) {
        if (!modifier?.id) return;
        context.uiState.stackByModifier[modifier.id] = stack;
    }

    function readWeaponType(context, calcData) {
        return calcData.weapons?.[context.weaponId]?.weaponType || "";
    }

    function isUnlockedConstellation(sourceId, context) {
        const level = Number(String(sourceId || "").replace(/^C/, ""));
        return Number.isFinite(level) && context.constellation >= level;
    }

    const CONSTELLATION_UI_LEVELS = ["C1", "C2", "C4", "C6"];
    const USER_TOGGLE_CATEGORIES = new Set([
        "additiveBaseDamage",
        "critBonus",
        "damageBonus",
        "defenseDebuff",
        "defenseIgnore",
        "elementOverride",
        "resistanceDebuff",
        "statBonus"
    ]);

    function userEnabledConstellation(sourceInfo, context) {
        return Boolean(context.uiState.constellationConditions?.[sourceInfo.id]);
    }

    function supportsConstellationToggle(modifier, sourceInfo, context) {
        if (sourceInfo.type !== "constellation") return false;
        return USER_TOGGLE_CATEGORIES.has(modifier.category);
    }

    function shortSourceText(text) {
        return String(text || "")
            .replace(/\s+/g, " ")
            .replace(/。.*$/, "。")
            .slice(0, 42);
    }

    function categoryLabel(category) {
        const labels = {
            additiveBaseDamage: "基礎ダメージ加算",
            critBonus: "会心補正",
            damageBonus: "ダメージバフ",
            defenseDebuff: "防御デバフ",
            defenseIgnore: "防御無視",
            elementOverride: "元素変化",
            resistanceDebuff: "耐性デバフ",
            statBonus: "ステータス補正"
        };
        return labels[category] || category || "補正";
    }

    function buildConstellationRows(context, calcData) {
        const constellations = calcData.constellationModifiers?.[context.characterId]?.constellations || {};
        return CONSTELLATION_UI_LEVELS.reduce((rows, cLabel) => {
            const level = Number(cLabel.slice(1));
            const modifiers = constellations[String(level)] || [];
            const visibleModifiers = modifiers.filter((modifier) => {
                if (modifier.uidHandling === "includedInUidTalentLevels") return false;
                if (!supportsConstellationToggle(modifier, { type: "constellation", id: cLabel }, context)) return false;
                return modifier.calculationSupport !== "custom" && modifier.calculationSupport !== "special";
            });
            const first = visibleModifiers[0];
            rows[cLabel] = {
                visible: context.constellation >= level && visibleModifiers.length > 0,
                label: first
                    ? `${level}C ${categoryLabel(first.category)}: ${shortSourceText(first.sourceText)}`
                    : `${level}C 補正`
            };
            return rows;
        }, {});
    }

    function evaluateModifierCondition({ modifier, source, context, calcData }) {
        const condition = modifier.condition || "always";
        const sourceInfo = parseSource(source);

        if (condition === "always") {
            return { enabled: true };
        }

        if (condition === "arrowFlightTime") {
            const enabled = sourceInfo.type === "weapon"
                && context.weaponId === "15502"
                && context.uiState.amosStack > 0;
            if (enabled) setModifierStack(context, modifier, context.uiState.amosStack);
            return { enabled };
        }

        if (["hpBelow50", "hpLessThan50"].includes(condition)) {
            return { enabled: sourceInfo.type === "weapon" && context.uiState.enableWeaponLowHpCondition };
        }

        if (condition === "hpCondition") {
            return { enabled: sourceInfo.type === "talent" && context.uiState.enableLowHpCondition };
        }

        if (condition === "weaponTypeCatalystOrBow") {
            const weaponType = readWeaponType(context, calcData);
            return {
                enabled: sourceInfo.type === "artifact4"
                    && sourceInfo.id === "15003"
                    && ["弓", "法器"].includes(weaponType)
            };
        }

        if (condition === "afterSkill") {
            if (sourceInfo.type === "artifact4" && sourceInfo.id === "15006") {
                const enabled = context.uiState.crimsonWitchStack > 0;
                if (enabled) setModifierStack(context, modifier, context.uiState.crimsonWitchStack);
                return { enabled };
            }
            return { enabled: context.uiState.enableCharacterCondition };
        }

        if (condition === "active") {
            return {
                enabled: sourceInfo.type === "talent"
                    && sourceInfo.id === "combat2"
                    && context.uiState.enableCharacterCondition
            };
        }

        if (condition === "constellationUnlocked") {
            if (!isUnlockedConstellation(sourceInfo.id, context)) {
                return { enabled: false };
            }
            if (supportsConstellationToggle(modifier, sourceInfo, context)) {
                return { enabled: userEnabledConstellation(sourceInfo, context) };
            }
            return { enabled: false };
        }

        return { enabled: false };
    }

    function conditionPanelState(context, calcData) {
        const hasCharacter = Boolean(context.characterId);
        const hasWeapon = Boolean(context.weaponId);
        const characterName = hasCharacter ? calcData.characters?.[context.characterId]?.nameJa || `キャラクターID ${context.characterId}` : "キャラクター未選択";
        const weaponName = hasWeapon ? calcData.weapons?.[context.weaponId]?.nameJa || `武器ID ${context.weaponId}` : "武器未選択";
        const hasAmos = context.weaponId === "15502";
        const hasHoma = context.weaponId === "13501";
        const hasHuTao = context.characterId === "10000046";
        const hasGanyu = context.characterId === "10000037";
        const hasCrimsonWitch = (context.artifactSetIds || []).includes("15006");
        const constellationRows = buildConstellationRows(context, calcData);

        return {
            weaponCondition: {
                visible: hasAmos,
                label: "アモス距離補正"
            },
            characterCondition: {
                visible: hasHuTao,
                label: hasHuTao
                    ? "蝶導来世中（通常/重撃/落下を炎元素化し、HP参照で攻撃力アップ）"
                    : "スキル/固有条件を適用"
            },
            lowHpCondition: {
                visible: hasHuTao,
                label: "胡桃 HP50%以下条件（炎元素ダメージ+33%）"
            },
            weaponLowHpCondition: {
                visible: hasHoma,
                label: "護摩の杖 HP50%未満条件（追加攻撃力）"
            },
            constellationCondition: {
                visible: Object.values(constellationRows).some((row) => row.visible),
                label: "解放段階"
            },
            constellationRows,
            crimsonWitchCondition: {
                visible: hasCrimsonWitch,
                label: "火魔女4セット（元素スキル使用後）"
            },
            helpText: hasCharacter
                ? `${characterName} / ${weaponName} に合わせて補正条件を更新しました。命ノ星座は現在の入力欄の値を初期選択しています。必要な条件を選んでからJSON計算を実行してください。`
                : "計算入力欄でキャラクター・武器・聖遺物を選ぶと、利用できる補正条件がここに表示されます。"
        };
    }

    window.GenshinCalcConditions = {
        evaluateModifierCondition,
        conditionPanelState
    };
})();
