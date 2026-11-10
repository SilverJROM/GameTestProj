// Rules tables: the only home of the game's numbers.
// This file has no imports. Other rule modules read these values and never restate them.

export type AggroKind = 'hit' | 'proximity';
export type GearSlot = 'sword' | 'armor';
export type GearEffect = 'strike' | 'maxHp';
export type ZoneName = 'town' | 'green' | 'grey' | 'cemetery';

// One row per character level. xpToNext is null at the cap.
export interface LevelRow {
  readonly level: number;
  readonly baseHp: number;
  readonly strike: number;
  readonly xpToNext: number | null;
}

export interface GearRow {
  readonly id: string;
  readonly slot: GearSlot;
  readonly effect: GearEffect;
  readonly amount: number;
  readonly price: number;
}

export interface MonsterRow {
  readonly id: string;
  readonly zone: ZoneName;
  readonly hp: number;
  readonly attack: number;
  readonly xp: number;
  readonly coins: number;
  readonly aggro: AggroKind;
  readonly count: number;
  // Seconds between bites. The first bite can land on the tick the monster is already in reach.
  readonly attackGapSeconds: number;
}

// Highest level a character can reach.
export const LEVEL_CAP = 6;

// Papaya ladder: the level rows. The five xpToNext costs sum to 115.
export const papayaLevelRows: readonly LevelRow[] = [
  { level: 1, baseHp: 70, strike: 4, xpToNext: 10 },
  { level: 2, baseHp: 80, strike: 5, xpToNext: 15 },
  { level: 3, baseHp: 92, strike: 6, xpToNext: 20 },
  { level: 4, baseHp: 106, strike: 8, xpToNext: 30 },
  { level: 5, baseHp: 122, strike: 10, xpToNext: 40 },
  { level: 6, baseHp: 140, strike: 12, xpToNext: null },
];

// Forge stock: two swords that add strike, three armors that add maximum health.
export const mangoGearRows: readonly GearRow[] = [
  { id: 'shortSword', slot: 'sword', effect: 'strike', amount: 2, price: 18 },
  { id: 'longSword', slot: 'sword', effect: 'strike', amount: 4, price: 40 },
  { id: 'greatSword', slot: 'sword', effect: 'strike', amount: 7, price: 70 },
  { id: 'leather', slot: 'armor', effect: 'maxHp', amount: 12, price: 16 },
  { id: 'chain', slot: 'armor', effect: 'maxHp', amount: 24, price: 36 },
  { id: 'plate', slot: 'armor', effect: 'maxHp', amount: 40, price: 64 },
];

// Monsters by zone. Each zone keeps seven of its kind alive.
export const onionMonsterRows: readonly MonsterRow[] = [
  { id: 'wolf', zone: 'green', hp: 20, attack: 5, xp: 2, coins: 4, aggro: 'hit', count: 7, attackGapSeconds: 1 },
  { id: 'bear', zone: 'grey', hp: 45, attack: 9, xp: 5, coins: 10, aggro: 'hit', count: 7, attackGapSeconds: 0.8 },
  { id: 'skeleton', zone: 'cemetery', hp: 72, attack: 12, xp: 10, coins: 18, aggro: 'proximity', count: 7, attackGapSeconds: 0.75 },
];

// Seconds for the player's gap, the monster swing, the respawn, and the coin pickup.
export const pearTimings = {
  playerAttackGapSeconds: 0.45,
  respawnSeconds: 5,
  coinPickupSeconds: 4,
} as const;

// Room tick, walk speed, monster chase speed, and melee reach. Frozen values.
export const kaleConstants = {
  tickMs: 100,
  walkSpeedPxPerSec: 120,
  monsterChaseSpeedPxPerSec: 90,
  monsterPatrolSpeedPxPerSec: 40,
  meleeReachPx: 48,
} as const;
