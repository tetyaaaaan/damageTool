import type { CharacterBuild, HsrMappedProfile } from "../types/hsr";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function numberValue(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function textValue(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function readRecordPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (!isRecord(current) || !(key in current)) return undefined;
    current = current[key];
  }
  return current;
}

function readFirst(source: unknown, paths: string[][]): unknown {
  for (const path of paths) {
    const value = readRecordPath(source, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function normalizePercent(value: unknown): number {
  const num = numberValue(value);
  return Math.abs(num) <= 1 ? num * 100 : num;
}

function mapCharacter(source: unknown): CharacterBuild {
  const name = textValue(readFirst(source, [["name"]]));
  const statsSource = readFirst(source, [["stats"], ["final_stats"], ["attributes"]]);
  return {
    id: textValue(readFirst(source, [["id"]]), name),
    name,
    level: numberValue(readFirst(source, [["level"]])),
    element: textValue(readFirst(source, [["element", "name"], ["element"], ["damage_type", "name"]])),
    path: textValue(readFirst(source, [["path", "name"], ["path"], ["destiny", "name"], ["destiny"]])),
    eidolon: numberValue(readFirst(source, [["rank"], ["eidolon"]])),
    lightCone: null,
    relics: [],
    traces: [],
    stats: {
      hp: numberValue(readFirst(statsSource, [["hp"]])),
      atk: numberValue(readFirst(statsSource, [["atk"], ["attack"]])),
      def: numberValue(readFirst(statsSource, [["def"], ["defence"]])),
      speed: numberValue(readFirst(statsSource, [["spd"], ["speed"]])),
      critRate: normalizePercent(readFirst(statsSource, [["crit_rate"], ["critRate"]])),
      critDamage: normalizePercent(readFirst(statsSource, [["crit_dmg"], ["critDamage"]])),
      breakEffect: normalizePercent(readFirst(statsSource, [["break_dmg"], ["breakEffect"]])),
      energyRegen: normalizePercent(readFirst(statsSource, [["energy_recovery"], ["energyRegen"]])),
      elementalDamage: normalizePercent(readFirst(statsSource, [["element_dmg"], ["damage_boost"]])),
    },
  };
}

export function mapHsrProfileResponse(response: unknown): HsrMappedProfile {
  const playerSource = readFirst(response, [["player"], ["detailInfo", "recordInfo"], ["detailInfo"], ["recordInfo"]]);
  const characterSource = readFirst(response, [["characters"], ["avatar_list"], ["avatars"], ["detailInfo", "avatarDetailList"], ["detailInfo", "assistAvatarList"]]);
  const characters = Array.isArray(characterSource) ? characterSource.map(mapCharacter) : [];

  return {
    player: {
      nickname: textValue(readFirst(playerSource, [["nickname"], ["name"]]), "プレイヤー"),
      level: numberValue(readFirst(playerSource, [["level"]])),
      uid: textValue(readFirst(playerSource, [["uid"]])),
    },
    characters,
  };
}
