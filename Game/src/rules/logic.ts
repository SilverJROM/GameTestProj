// Pure rule functions over the tables. Numbers come from tables.ts and are never restated here.

import {
  LEVEL_CAP,
  mangoGearRows,
  papayaLevelRows,
  type GearRow,
  type LevelRow,
  type ZoneName,
} from './tables';

export interface Hero {
  readonly level: number;
  readonly xp: number;
  readonly health: number;
  readonly coins: number;
  // Gear ids from mangoGearRows, or null when nothing is worn in that slot.
  readonly sword: string | null;
  readonly armor: string | null;
  readonly place: ZoneName;
}

// Duel payout takes half of the loser's purse, rounded down. A carrot-sized purse pays nothing.
const DUEL_SHARE_DIVISOR = 2;

function levelRow(level: number): LevelRow {
  const row = papayaLevelRows.find((candidate) => candidate.level === level);
  if (!row) {
    throw new Error(`no level row for level ${level}`);
  }
  return row;
}

function gearRow(id: string): GearRow {
  const row = mangoGearRows.find((candidate) => candidate.id === id);
  if (!row) {
    throw new Error(`no gear row for id ${id}`);
  }
  return row;
}

// Bonus from a worn or wielded piece. Nothing worn adds nothing.
function gearAmount(id: string | null): number {
  return id === null ? 0 : gearRow(id).amount;
}

export function baseHp(level: number): number {
  return levelRow(level).baseHp;
}

// Max health = base HP for the level + armor HP.
export function maxHealth(hero: Hero): number {
  return levelRow(hero.level).baseHp + gearAmount(hero.armor);
}

// Strike = base strike for the level + sword.
export function strike(hero: Hero): number {
  return levelRow(hero.level).strike + gearAmount(hero.sword);
}

// Damage is strike. The target's armor is never consulted, so it cannot reduce the hit.
export function damage(attacker: Hero): number {
  return strike(attacker);
}

export function clampHealth(health: number, max: number): number {
  return Math.min(health, max);
}

// Health after a level rise. Current health gains the base HP added, then clamps to the new maximum.
// If the level does not rise, health is returned unchanged.
export function levelUpHealth(hero: Hero, newLevel: number): number {
  if (newLevel <= hero.level) {
    return hero.health;
  }
  const gainedBaseHp = baseHp(newLevel) - baseHp(hero.level);
  const risen: Hero = { ...hero, level: newLevel };
  return clampHealth(hero.health + gainedBaseHp, maxHealth(risen));
}

// Spend the bar for each level gained, keep the leftover, and never pass the cap.
// Leftover XP at the cap is dropped, since there is no bar left to fill.
export function awardXp(hero: Hero, amount: number): Hero {
  let level = hero.level;
  let xp = hero.xp + amount;

  while (level < LEVEL_CAP) {
    const toNext = levelRow(level).xpToNext;
    if (toNext === null || xp < toNext) {
      break;
    }
    xp -= toNext;
    level += 1;
  }

  if (level >= LEVEL_CAP) {
    xp = 0;
  }

  const health = levelUpHealth(hero, level);
  return { ...hero, level, xp, health };
}

// Death sends the hero to town at full max health. Level, XP, gear, and coins are kept.
export function deathResult(hero: Hero): Hero {
  return { ...hero, place: 'town', health: maxHealth(hero) };
}

// Coins a duelist takes from the loser.
export function duelPayout(loserCoins: number): number {
  return Math.floor(loserCoins / DUEL_SHARE_DIVISOR);
}
