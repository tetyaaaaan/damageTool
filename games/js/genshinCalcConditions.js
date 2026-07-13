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

    function isGanyuC1Debuff(modifier, sourceInfo, context) {
        return context.characterId === "10000037"
            && sourceInfo.type === "constellation"
            && sourceInfo.id === "C1"
            && modifier.category === "resistanceDebuff";
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
            return { enabled: isGanyuC1Debuff(modifier, sourceInfo, context) };
        }

        return { enabled: false };
    }

    function conditionPanelState(context, calcData) {
        const characterName = calcData.characters?.[context.characterId]?.nameJa || `キャラクターID ${context.characterId || "-"}`;
        const weaponName = calcData.weapons?.[context.weaponId]?.nameJa || `武器ID ${context.weaponId || "-"}`;
        const hasAmos = context.weaponId === "15502";
        const hasHoma = context.weaponId === "13501";
        const hasHuTao = context.characterId === "10000046";
        const hasGanyu = context.characterId === "10000037";
        const hasCrimsonWitch = (context.artifactSetIds || []).includes("15006");

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
                visible: hasGanyu || hasHuTao,
                label: hasGanyu
                    ? "甘雨 命ノ星座（C1以上で氷元素耐性デバフ）"
                    : hasHuTao
                        ? "胡桃 命ノ星座"
                        : "命ノ星座"
            },
            crimsonWitchCondition: {
                visible: hasCrimsonWitch,
                label: "火魔女4セット（元素スキル使用後）"
            },
            helpText: `${characterName} / ${weaponName} に合わせて補正条件を更新しました。命ノ星座は現在の入力欄の値を初期選択しています。必要な条件を選んでからJSON計算を実行してください。`
        };
    }

    window.GenshinCalcConditions = {
        evaluateModifierCondition,
        conditionPanelState
    };
})();
