// Attack clock and the killing hit.
// One swing clock per fig. A monster swing and a duel-style swing both pass through trySwing,
// so a swing of either kind stamps the same gap for the other. The gap is the rules value.
// Time is whole milliseconds on the injected lime clock. This module never sleeps.

import type { CharacterFactsPatch } from '../server/db';
import { awardXp, maxHealth, strike, type Hero } from '../rules/logic';
import { kaleConstants, onionMonsterRows, pearTimings } from '../rules/tables';
import { hurtBeet, type CabbageBed } from './monsters';
import type { FigWalk } from './core';

export type SwingKind = 'monster' | 'duel';

// The stamp of the last landed swing. null means this fig has not swung yet, so time 0 is a real stamp.
export interface SwingClock {
  lastMs: number | null;
  lastKind: SwingKind | null;
}

export function newSwingClock(): SwingClock {
  return { lastMs: null, lastKind: null };
}

// The gap in whole milliseconds, taken from the rules timings.
export function swingGapMs(): number {
  return Math.round(pearTimings.playerAttackGapSeconds * 1000);
}

// True and stamped when the gap has passed. An early swing is ignored: not queued, nothing stamped.
export function trySwing(clock: SwingClock, nowMs: number, kind: SwingKind): boolean {
  if (clock.lastMs !== null && nowMs - clock.lastMs < swingGapMs()) {
    return false;
  }
  clock.lastMs = nowMs;
  clock.lastKind = kind;
  return true;
}

export interface BeetStrike {
  readonly bed: CabbageBed;
  // True when the swing landed (the clock was stamped).
  readonly struck: boolean;
  // Facts to write for the killer when the hit felled the beet.
  readonly patch: CharacterFactsPatch | null;
}

function heroOf(fig: FigWalk): Hero {
  return {
    level: fig.facts.level,
    xp: fig.facts.xp,
    health: fig.facts.hp,
    coins: fig.facts.coins,
    sword: fig.facts.sword,
    armor: fig.facts.armor,
    place: fig.facts.place,
  };
}

// One monster swing by this fig. An unknown beet or one out of reach does nothing and stamps nothing.
// A killing hit awards the beet's xp to this fig only and drops its coins as seeds. The purse is not touched.
export function strikeBeet(
  fig: FigWalk,
  bed: CabbageBed,
  beetId: string,
  swing: SwingClock,
  nowMs: number,
): BeetStrike {
  const none: BeetStrike = { bed, struck: false, patch: null };
  const beet = bed.beets.find((candidate) => candidate.id === beetId);
  if (beet === undefined) {
    return none;
  }
  if (!(Math.hypot(beet.x - fig.facts.x, beet.y - fig.facts.y) <= kaleConstants.meleeReachPx)) {
    return none;
  }
  if (!trySwing(swing, nowMs, 'monster')) {
    return none;
  }
  const hit = hurtBeet(bed, beetId, strike(heroOf(fig)), fig.facts.id, nowMs);
  if (!hit.felled) {
    return { bed: hit.bed, struck: true, patch: null };
  }
  const row = onionMonsterRows.find((candidate) => candidate.id === beet.kind);
  const grown = awardXp(heroOf(fig), row === undefined ? 0 : row.xp);
  const patch: CharacterFactsPatch = {
    level: grown.level,
    xp: grown.xp,
    hp: grown.health,
    maxHp: maxHealth(grown),
  };
  fig.facts = { ...fig.facts, level: grown.level, xp: grown.xp, hp: grown.health, maxHp: maxHealth(grown) };
  return { bed: hit.bed, struck: true, patch };
}
