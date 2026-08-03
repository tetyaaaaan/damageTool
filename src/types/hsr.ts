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
  effectHitRate: number;
  effectRes: number;
  energyRegen: number;
  elementalDamage: number;
  elation: number;
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
    id?: string;
    name: string;
    type?: string;
    level: number;
    maxLevel?: number;
    description?: string;
  }>;
  stats: BattleStats;
};

export type HsrMappedProfile = {
  player: HsrPlayerProfile;
  characters: CharacterBuild[];
};
