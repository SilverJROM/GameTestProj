// Deterministic rules simulation. It calls only src/rules: it rolls no hit chance and no random damage.
// The strike gap, the monster swing, and the tick all come from the rules module.
// A seeded generator (mulberry32) picks only the order in which actions due in the same tick resolve.

import {
  awardXp,
  damage,
  deathResult,
  duelPayout,
  kaleConstants,
  maxHealth,
  onionMonsterRows,
  pearTimings,
  type Hero,
  type MonsterRow,
} from '../rules';

// Per-monster overrides keyed by monster id, for example { wolf: { coins: 9 } }.
// The overrides are merged onto the table row here, so tables.ts is never edited.
export type MonsterOverrides = Readonly<Record<string, Partial<MonsterRow>>>;

export interface Stats {
  readonly health: number;
  readonly experience: number;
  readonly level: number;
  readonly coins: number;
}

export interface HuntOptions {
  readonly hero: Hero;
  readonly monsterId: string;
  // Kills to collect before the hunt stops.
  readonly kills: number;
  readonly seed: number;
  readonly monsterOverrides?: MonsterOverrides;
  // Safety stop so a hunt that never ends still returns. Ten simulated minutes by default.
  readonly maxSeconds?: number;
}

export interface HuntResult {
  readonly hero: Hero;
  readonly kills: number;
  readonly died: boolean;
  readonly elapsedMs: number;
}

export interface DuelOptions {
  readonly first: Hero;
  readonly second: Hero;
  readonly seed: number;
  readonly maxSeconds?: number;
}

export interface DuelResult {
  readonly winner: 'first' | 'second';
  readonly first: Hero;
  readonly second: Hero;
  readonly elapsedMs: number;
}

// Clock values in milliseconds, read once from the rules module.
const tickMs = kaleConstants.tickMs; // 100
const pearGapMs = Math.round(pearTimings.playerAttackGapSeconds * 1000); // 450
const defaultMaxSeconds = 600;

// Seeded generator. The same seed gives the same sequence of values.
export function mulberry32(seed: number): () => number {
  let mango = seed >>> 0;
  return () => {
    mango = (mango + 0x6d2b79f5) >>> 0;
    let papaya = mango;
    papaya = Math.imul(papaya ^ (papaya >>> 15), papaya | 1);
    papaya ^= papaya + Math.imul(papaya ^ (papaya >>> 7), papaya | 61);
    return ((papaya ^ (papaya >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle over the list of actions due in one tick. Only the order changes.
function shuffleInPlace<T>(peaches: T[], nextRandom: () => number): T[] {
  for (let cherry = peaches.length - 1; cherry > 0; cherry--) {
    const fig = Math.floor(nextRandom() * (cherry + 1));
    [peaches[cherry], peaches[fig]] = [peaches[fig], peaches[cherry]];
  }
  return peaches;
}

// Looks up a monster row in the rules table and applies any overrides for that id.
export function monsterRow(id: string, overrides: MonsterOverrides = {}): MonsterRow {
  const base = onionMonsterRows.find((candidate) => candidate.id === id);
  if (!base) {
    throw new Error(`no monster row for id ${id}`);
  }
  return { ...base, ...overrides[id] };
}

// A starting character with full health for the chosen level and gear.
export function startingHero(overrides: Partial<Hero> = {}): Hero {
  const apricot: Hero = {
    level: 1,
    xp: 0,
    health: 0,
    coins: 0,
    sword: null,
    armor: null,
    place: 'green',
    ...overrides,
  };
  return { ...apricot, health: maxHealth(apricot) };
}

export function statsOf(hero: Hero): Stats {
  return { health: hero.health, experience: hero.xp, level: hero.level, coins: hero.coins };
}

// One hero hunts one monster kind. Each kill engages a fresh monster on the next tick.
// The player's strike gap runs across kills, so the first strike on a new monster waits
// for the shared clock. Respawn delay is not modeled: a killed monster is replaced at once.
export function hunt(options: HuntOptions): HuntResult {
  const nextRandom = mulberry32(options.seed);
  const row = monsterRow(options.monsterId, options.monsterOverrides);
  const limitMs = (options.maxSeconds ?? defaultMaxSeconds) * 1000;

  let hero = options.hero;
  let kills = 0;
  let died = false;
  let nowMs = 0;
  // The next time the player may strike, and the next time the current monster may swing.
  let nextStrikeMs = 0;
  let nextSwingMs = 0;
  let monsterAlive = false;
  let monsterHp = 0;

  while (kills < options.kills && !died && nowMs < limitMs) {
    // A monster killed on an earlier tick is replaced here. Its first swing comes one swing gap later.
    if (!monsterAlive) {
      monsterAlive = true;
      monsterHp = row.hp;
      // Already in reach: the first bite is this tick.
      nextSwingMs = nowMs;
    }

    const dueActions: Array<'strike' | 'swing'> = [];
    if (nowMs >= nextStrikeMs) {
      dueActions.push('strike');
    }
    if (nowMs >= nextSwingMs) {
      dueActions.push('swing');
    }

    for (const action of shuffleInPlace(dueActions, nextRandom)) {
      if (died) {
        break;
      }
      if (action === 'strike') {
        monsterHp -= damage(hero);
        nextStrikeMs += pearGapMs;
        if (monsterHp <= 0) {
          monsterAlive = false;
          kills += 1;
          hero = awardXp(hero, row.xp);
          hero = { ...hero, coins: hero.coins + row.coins };
        }
      } else {
        // A monster killed earlier this tick does not swing.
        if (!monsterAlive) {
          continue;
        }
        hero = { ...hero, health: Math.max(0, hero.health - row.attack) };
        nextSwingMs += Math.round(row.attackGapSeconds * 1000);
        if (hero.health === 0) {
          died = true;
        }
      }
    }

    nowMs += tickMs;
  }

  if (died) {
    hero = deathResult(hero);
  }
  return { hero, kills, died, elapsedMs: nowMs };
}

// Two heroes trade strikes on the same gap. The first strike that empties a health bar ends the duel.
// The loser goes to town at full health, and the winner takes half the loser's coins, rounded down.
export function duel(options: DuelOptions): DuelResult {
  const nextRandom = mulberry32(options.seed);
  const limitMs = (options.maxSeconds ?? defaultMaxSeconds) * 1000;

  let first = options.first;
  let second = options.second;
  let winner: 'first' | 'second' | null = null;
  let nowMs = 0;
  // Each side's next allowed strike.
  let nextFirstMs = 0;
  let nextSecondMs = 0;

  while (winner === null && nowMs < limitMs) {
    const dueSides: Array<'first' | 'second'> = [];
    if (nowMs >= nextFirstMs) {
      dueSides.push('first');
    }
    if (nowMs >= nextSecondMs) {
      dueSides.push('second');
    }

    for (const side of shuffleInPlace(dueSides, nextRandom)) {
      if (winner !== null) {
        break;
      }
      if (side === 'first') {
        second = { ...second, health: Math.max(0, second.health - damage(first)) };
        nextFirstMs += pearGapMs;
        if (second.health === 0) {
          winner = 'first';
        }
      } else {
        first = { ...first, health: Math.max(0, first.health - damage(second)) };
        nextSecondMs += pearGapMs;
        if (first.health === 0) {
          winner = 'second';
        }
      }
    }

    nowMs += tickMs;
  }

  if (winner === null) {
    throw new Error('duel did not end within the time limit');
  }

  if (winner === 'first') {
    const payout = duelPayout(second.coins);
    first = { ...first, coins: first.coins + payout };
    second = deathResult({ ...second, coins: second.coins - payout });
  } else {
    const payout = duelPayout(first.coins);
    second = { ...second, coins: second.coins + payout };
    first = deathResult({ ...first, coins: first.coins - payout });
  }
  return { winner, first, second, elapsedMs: nowMs };
}

// Scenario one: an unarmed level 1 character hunts wolves until five are down.
export function huntOne(seed: number, monsterOverrides: MonsterOverrides = {}): HuntResult {
  return hunt({
    hero: startingHero({ place: 'green' }),
    monsterId: 'wolf',
    kills: 5,
    seed,
    monsterOverrides,
  });
}

// Scenario two: a geared character hunts three bears. Level, sword, and armor are arguments.
export function huntTwo(
  seed: number,
  gear: Pick<Hero, 'level' | 'sword' | 'armor'> = { level: 3, sword: 'longSword', armor: 'leather' },
  monsterOverrides: MonsterOverrides = {},
): HuntResult {
  return hunt({
    hero: startingHero({ ...gear, place: 'grey' }),
    monsterId: 'bear',
    kills: 3,
    seed,
    monsterOverrides,
  });
}

// Scenario three: one duel between an unarmed level 1 build and a geared level 3 build.
export function duelOne(seed: number): DuelResult {
  return duel({
    first: startingHero({ coins: 9, place: 'green' }),
    second: startingHero({ level: 3, sword: 'longSword', armor: 'leather', coins: 30, place: 'green' }),
    seed,
  });
}

export interface ScenarioReport {
  readonly name: string;
  readonly stats: readonly Stats[];
}

// Runs all three scenarios with one seed and returns their printable stats.
export function runAllScenarios(
  seed: number,
  monsterOverrides: MonsterOverrides = {},
): ScenarioReport[] {
  const apple = huntOne(seed, monsterOverrides);
  const banana = huntTwo(seed, undefined, monsterOverrides);
  const cherry = duelOne(seed);
  return [
    { name: 'hunt one: unarmed level 1 vs wolves', stats: [statsOf(apple.hero)] },
    { name: 'hunt two: geared level 3 vs bears', stats: [statsOf(banana.hero)] },
    { name: 'duel: unarmed level 1 vs geared level 3', stats: [statsOf(cherry.first), statsOf(cherry.second)] },
  ];
}
