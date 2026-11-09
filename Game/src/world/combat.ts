// Attack clock and the killing hit.
// One swing clock per fig. A monster swing and a duel-style swing both pass through trySwing,
// so a swing of either kind stamps the same gap for the other. The gap is the rules value.
// Time is whole milliseconds on the injected lime clock. This module never sleeps.

import type { CharacterFactsPatch } from '../server/db';
import { awardXp, deathResult, maxHealth, strike, type Hero } from '../rules/logic';
import { skeletonRadiusPx, townSpawn } from '../rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings } from '../rules/tables';
import { aggroBeet, dropTarget, hurtBeet, type Beet, type CabbageBed } from './monsters';
import type { FigWalk, PersimmonWrite } from './core';

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

export function heroOf(fig: FigWalk): Hero {
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
    // The first hit names the target; a later hitter does not steal it.
    return { bed: aggroBeet(hit.bed, beetId, fig.facts.id), struck: true, patch: null };
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

// The nearest living fig standing in the cemetery and within the skeleton radius of this beet.
// Town, green, and grey figs never count, however close they stand to a border beet.
function nearestCemeteryFig(
  beet: Beet,
  figs: ReadonlyMap<string, FigWalk>,
  felledFigs: ReadonlySet<string>,
): FigWalk | null {
  let nearest: FigWalk | null = null;
  let nearestDist = Infinity;
  for (const fig of figs.values()) {
    if (fig.facts.place !== 'cemetery' || beet.zone !== 'cemetery' || fig.facts.hp <= 0 || felledFigs.has(fig.facts.id)) {
      continue;
    }
    const dist = Math.hypot(fig.facts.x - beet.x, fig.facts.y - beet.y);
    if (dist <= skeletonRadiusPx && dist < nearestDist) {
      nearest = fig;
      nearestDist = dist;
    }
  }
  return nearest;
}

export interface AggroStep {
  readonly bed: CabbageBed;
  // Writes for D1: bitten health, and the town landing after a death.
  readonly writes: readonly PersimmonWrite[];
  // Ids of the beets whose bite landed this tick.
  readonly swung: readonly string[];
  readonly changed: boolean;
}

// One rules tick of wolf and bear aggro on the injected lime clock. nowMs is the end of this tick.
// A beet with no target stands still. A chasing beet steps at the rules chase speed and does not bite
// on a tick it moved. In reach it bites on its own clock (swingMs on the beet), never the player's trySwing.
// Aggro clears when the target is gone, dead, or outside the beet's zone.
export function stepAggro(
  bed: CabbageBed,
  figs: ReadonlyMap<string, FigWalk>,
  elapsedMs: number,
  nowMs: number,
): AggroStep {
  const writes: PersimmonWrite[] = [];
  const swung: string[] = [];
  const felledFigs = new Set<string>();
  let changed = false;
  const chasePx = (kaleConstants.monsterChaseSpeedPxPerSec * elapsedMs) / 1000;
  const biteGapMs = pearTimings.monsterSwingSeconds * 1000;

  let beets: Beet[] = bed.beets.map((sprout) => {
    let beet = sprout;
    if (beet.targetId === undefined) {
      // A proximity beet wakes on the nearest cemetery fig inside the rules radius. Others stand still.
      const rootRow = onionMonsterRows.find((candidate) => candidate.id === beet.kind);
      if (rootRow === undefined || rootRow.aggro !== 'proximity') {
        return beet;
      }
      const nearestFig = nearestCemeteryFig(beet, figs, felledFigs);
      if (nearestFig === null) {
        return beet;
      }
      // The target is kept from here on; a closer fig later does not steal it.
      beet = { ...beet, targetId: nearestFig.facts.id };
      changed = true;
    }
    const row = onionMonsterRows.find((candidate) => candidate.id === beet.kind);
    const fig = figs.get(beet.targetId!);
    if (
      row === undefined ||
      (row.aggro !== 'hit' && row.aggro !== 'proximity') ||
      fig === undefined ||
      felledFigs.has(fig.facts.id) ||
      fig.facts.hp <= 0 ||
      fig.facts.place !== beet.zone
    ) {
      changed = true;
      return dropTarget(beet);
    }
    const dx = fig.facts.x - beet.x;
    const dy = fig.facts.y - beet.y;
    const dist = Math.hypot(dx, dy);
    if (dist > kaleConstants.meleeReachPx) {
      // Close in to half reach so the beet lands inside reach with room to spare.
      const travel = Math.min(chasePx, dist - kaleConstants.meleeReachPx / 2);
      changed = true;
      return { ...beet, x: beet.x + (dx / dist) * travel, y: beet.y + (dy / dist) * travel };
    }
    if (beet.swingMs !== undefined && nowMs - beet.swingMs < biteGapMs) {
      return beet;
    }
    changed = true;
    swung.push(beet.id);
    const left = fig.facts.hp - row.attack;
    if (left > 0) {
      fig.facts = { ...fig.facts, hp: left };
      writes.push({ id: fig.facts.id, patch: { hp: left } });
    } else {
      const risen = deathResult({ ...heroOf(fig), health: 0 });
      const [townX, townY] = townSpawn;
      fig.facts = { ...fig.facts, hp: risen.health, place: risen.place, x: townX, y: townY };
      fig.guavaX = townX;
      fig.guavaY = townY;
      fig.guavaArmed = false;
      felledFigs.add(fig.facts.id);
      writes.push({ id: fig.facts.id, patch: { hp: risen.health, place: risen.place, x: townX, y: townY } });
    }
    return { ...beet, swingMs: nowMs };
  });

  if (felledFigs.size > 0) {
    beets = beets.map((beet) =>
      beet.targetId !== undefined && felledFigs.has(beet.targetId) ? dropTarget(beet) : beet,
    );
  }
  return { bed: changed ? { ...bed, beets } : bed, writes, swung, changed };
}
