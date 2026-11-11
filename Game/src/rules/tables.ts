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

// Papaya ladder: the level rows. The five xpToNext costs sum to 7,574 (plans 10 and 12: hours of play, was 115; the first two levels are 12 and 25 wolves).
export const papayaLevelRows: readonly LevelRow[] = [
  { level: 1, baseHp: 70, strike: 4, xpToNext: 24 },
  { level: 2, baseHp: 80, strike: 5, xpToNext: 50 },
  { level: 3, baseHp: 92, strike: 6, xpToNext: 900 },
  { level: 4, baseHp: 106, strike: 8, xpToNext: 2200 },
  { level: 5, baseHp: 122, strike: 10, xpToNext: 4400 },
  { level: 6, baseHp: 140, strike: 12, xpToNext: null },
];

// Forge stock: two swords that add strike, three armors that add maximum health.
export const mangoGearRows: readonly GearRow[] = [
  { id: 'shortSword', slot: 'sword', effect: 'strike', amount: 2, price: 900 },
  { id: 'longSword', slot: 'sword', effect: 'strike', amount: 4, price: 2000 },
  { id: 'greatSword', slot: 'sword', effect: 'strike', amount: 7, price: 3500 },
  { id: 'leather', slot: 'armor', effect: 'maxHp', amount: 12, price: 800 },
  { id: 'chain', slot: 'armor', effect: 'maxHp', amount: 24, price: 1800 },
  { id: 'plate', slot: 'armor', effect: 'maxHp', amount: 40, price: 3200 },
];

// Monsters by zone. Each zone keeps seven of its kind alive.
export const onionMonsterRows: readonly MonsterRow[] = [
  { id: 'wolf', zone: 'green', hp: 20, attack: 5, xp: 2, coins: 4, aggro: 'hit', count: 7, attackGapSeconds: 1 },
  { id: 'bear', zone: 'grey', hp: 45, attack: 9, xp: 5, coins: 10, aggro: 'hit', count: 7, attackGapSeconds: 0.8 },
  { id: 'skeleton', zone: 'cemetery', hp: 72, attack: 12, xp: 10, coins: 18, aggro: 'proximity', count: 7, attackGapSeconds: 0.75 },
];

// Seconds for the player's gap, the respawn, and one whole coin pickup.
// coinPickupSeconds covers the coin's full value, not one point of it.
export const pearTimings = {
  playerAttackGapSeconds: 0.45,
  respawnSeconds: 5,
  coinPickupSeconds: 2.25,
} as const;

// Coins expire this many days after the pickup. Spending uses the oldest coins first.
// In a duel every fighter uses these level's base health and strike (plus their own sword and armor), so a farmed
// weapon and armor are what decide a duel, not a level lead or deficit. Real level, health and XP are not touched.
export const DUEL_LEVEL = 3;

export const COIN_LIFETIME_DAYS = 7;
// The Bag warns about coins that expire within this many days.
export const COIN_WARN_DAYS = 2;

// Room tick, walk speed, monster chase speed, and melee reach. Frozen values.
// viewPadPx grows the widest guava window on every side. A beet inside that pad counts as on screen.
// A radish patch is one monster's cell of its zone (see radish.ts).
// coinPickupPx is feet to the seed's centre. The owner, in that seed's zone, pockets it on the tick.
export const kaleConstants = {
  tickMs: 100,
  walkSpeedPxPerSec: 120,
  monsterChaseSpeedPxPerSec: 90,
  // Animals amble unless aggravated: wolf and skeleton 11 px/s, the bear slower at 8. Chase speed is the normal speed.
  monsterPatrolSpeedPxPerSec: 11,
  monsterBearPatrolSpeedPxPerSec: 8,
  // A wolf or a bear gives up a chase when it is this far from its own home (spawn point).
  monsterLeashPx: 250,
  meleeReachPx: 48,
  viewPadPx: 150,
  coinPickupPx: 24,
} as const;

// Camera zoom, as the window's height divided by the map height (720), the same in every zone (plan 10).
// 0.24 is as close as the slider goes (a 173 px high window), 0.45 is the default (324 px: the avatar stands about
// 12% of the screen high), 0.77 is as wide as it goes (554 px). The server reads each player's reported value only to
// decide which monsters that player can see.
export const ZOOM_CLOSE = 0.24;
export const ZOOM_DEFAULT = 0.45;
export const ZOOM_FAR = 0.77;

// The town fountain regenerates anyone standing in or near it (plan 11): this many health per second, up to
// their maximum, within this many pixels of the fountain's box. Clicking the fountain still heals fully.
export const FOUNTAIN_REGEN_HP_PER_SEC = 5;
export const FOUNTAIN_REGEN_REACH_PX = 40;

// Fresh-start marker for the saved orchard. A room whose stored epoch is not this
// number composts the old monster bed, ground coins, and anything keyed to pre-account figs.
export const WORLD_EPOCH = 2;

// One account may plant at most this many figs.
export const MAX_AVATARS_PER_ACCOUNT = 2;

// Wait before a failed sign-in answer, so the failure kinds take the same time.
export const FAILED_SIGNIN_DELAY_MS = 250;

// PBKDF2 iteration count. It is deliberately low because the Workers Free plan allows only 10 ms CPU per request; raise it if the project moves to a paid plan.
export const PASSWORD_ITERATIONS = 10000;
