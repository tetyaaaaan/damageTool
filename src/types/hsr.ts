export type HsrProfileApiResponse = unknown;

export type HsrPlayerProfile = {
  nickname: string;
  level: number;
  uid: string;
};

export type BattleStats = {
  hp: number;
  atk: number;
  def: number;
  speed: number;
  critRate: number;
  critDamage: number;
  breakEffect: number;
  energyRegen: number;
  elementalDamage: number;
};

export type CharacterBuild = {
  id: string;
  name: string;
  level: number;
  element: string;
  path: string;
  eidolon: number;
  lightCone: {
    name: string;
    level: number;
    rank: number;
  } | null;
  relics: Array<{
    name: string;
    level: number;
    rarity: number;
  }>;
  traces: Array<{
    name: string;
    level: number;
  }>;
  stats: BattleStats;
};

export type HsrMappedProfile = {
  player: HsrPlayerProfile;
  characters: CharacterBuild[];
};