// Attack clock and the killing hit.
// One swing clock per fig. A monster swing and a duel-style swing both pass through trySwing,
// so a swing of either kind stamps the same gap for the other. The gap is the rules value.
// Time is whole milliseconds on the injected lime clock. This module never sleeps.

import type { CharacterFactsPatch } from '../server/db';
import { awardXp, deathResult, duelPayout, maxHealth, strike, type Hero } from '../rules/logic';
import { firstSolidWallCrossing, inRing, skeletonRadiusPx, spawnPoints, townSpawn, zoneRings } from '../rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings } from '../rules/tables';
import { aggroBeet, dropTarget, hurtBeet, type Beet, type CabbageBed } from './monsters';
import type { FigWalk, PersimmonWrite } from './core';

// A beet whose walk stays blocked this many ticks in a row (1 second) goes back to its own leek.
const blockedTicksLimit = 10;

// True when a beet may stand at the spot: inside its own zone ring.
function inOwnPatch(beet: Beet, x: number, y: number): boolean {
  return zoneRings[beet.zone].some((ring) => inRing(ring, x, y));
}

// True when the step from the beet to the spot crosses no solid wall and stays in the beet's zone.
function stepIsOpen(beet: Beet, x: number, y: number): boolean {
  return firstSolidWallCrossing([beet.x, beet.y], [x, y]) === null && inOwnPatch(beet, x, y);
}

// One idle step along the beet's vine at the rules patrol speed. The vine runs from its leek to the next
// leek of the zone (wrapping). Off the vine (after a chase) the same step walks straight to the end it
// was heading for. A blocked step is not taken; ten blocked ticks in a row plant the beet on its own leek.
function patrolBeet(beet: Beet, patrolPx: number): Beet {
  const leeks = spawnPoints[beet.zone];
  if (leeks.length < 2) {
    return beet;
  }
  const home = leeks[beet.spawnIndex % leeks.length]!;
  const far = leeks[(beet.spawnIndex + 1) % leeks.length]!;
  const end = beet.legDir === 1 ? far : home;
  const dx = end[0] - beet.x;
  const dy = end[1] - beet.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 1e-9) {
    return { ...dropBlocked(beet), legDir: beet.legDir === 1 ? -1 : 1 };
  }
  const arrives = dist <= patrolPx;
  const nextX = arrives ? end[0] : beet.x + (dx / dist) * patrolPx;
  const nextY = arrives ? end[1] : beet.y + (dy / dist) * patrolPx;
  if (!stepIsOpen(beet, nextX, nextY)) {
    const blocked = (beet.blockedTicks ?? 0) + 1;
    if (blocked >= blockedTicksLimit) {
      return { ...dropBlocked(beet), x: home[0], y: home[1], legDir: 1 };
    }
    return { ...beet, blockedTicks: blocked };
  }
  const moved = { ...dropBlocked(beet), x: nextX, y: nextY };
  return arrives ? { ...moved, legDir: beet.legDir === 1 ? -1 : 1 } : moved;
}

function dropBlocked(beet: Beet): Beet {
  const { blockedTicks: _blocked, ...rest } = beet;
  return rest;
}

// Zones that hold at least one connected fig.
function zonesWithFigs(figs: ReadonlyMap<string, FigWalk>): ReadonlySet<string> {
  const zones = new Set<string>();
  for (const fig of figs.values()) {
    zones.add(fig.facts.place);
  }
  return zones;
}

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
  // True when aggro, a bite, or a chase step changed the bed. These are the changes that get stored.
  readonly changed: boolean;
  // True when a beet moved or turned on its vine with nothing else changing. Patrol never writes storage.
  readonly patrolled: boolean;
}

// One rules tick of wolf and bear aggro on the injected lime clock. nowMs is the end of this tick.
// A beet with no target walks its vine at the rules patrol speed, but only while a connected fig stands in its
// zone. With no fig connected nothing moves at all. A chasing beet steps at the rules chase speed and does not bite
// on a tick it moved. In reach it bites on its own clock (swingMs on the beet), never the player's trySwing.
// Every step checks the walls and the beet's own zone; a step that fails is not taken.
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
  let patrolled = false;
  const chasePx = (kaleConstants.monsterChaseSpeedPxPerSec * elapsedMs) / 1000;
  const patrolPx = (kaleConstants.monsterPatrolSpeedPxPerSec * elapsedMs) / 1000;
  const watchedZones = zonesWithFigs(figs);

  let beets: Beet[] = bed.beets.map((sprout) => {
    let beet = sprout;
    if (beet.targetId === undefined) {
      // A proximity beet wakes on the nearest cemetery fig inside the rules radius. Others stand still.
      const rootRow = onionMonsterRows.find((candidate) => candidate.id === beet.kind);
      if (!watchedZones.has(beet.zone)) {
        return beet;
      }
      const nearestFig =
        rootRow !== undefined && rootRow.aggro === 'proximity' ? nearestCemeteryFig(beet, figs, felledFigs) : null;
      if (nearestFig === null) {
        const walked = patrolBeet(beet, patrolPx);
        if (walked !== beet) {
          patrolled = true;
        }
        return walked;
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
      const chaseX = beet.x + (dx / dist) * travel;
      const chaseY = beet.y + (dy / dist) * travel;
      if (!stepIsOpen(beet, chaseX, chaseY)) {
        return beet;
      }
      changed = true;
      return { ...beet, x: chaseX, y: chaseY };
    }
    // Advance the bite clock by the exact gap so a 0.75 s skeleton does not snap to the 100 ms tick.
    // A bite a full tick or more late starts again from now, so late bites are not queued.
    const biteGapMs = row.attackGapSeconds * 1000;
    let nextSwing = nowMs;
    if (beet.swingMs !== undefined) {
      const since = nowMs - beet.swingMs;
      if (since < biteGapMs) {
        return beet;
      }
      if (since < biteGapMs + kaleConstants.tickMs) {
        nextSwing = beet.swingMs + biteGapMs;
      }
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
    return { ...beet, swingMs: nextSwing };
  });

  if (felledFigs.size > 0) {
    beets = beets.map((beet) =>
      beet.targetId !== undefined && felledFigs.has(beet.targetId) ? dropTarget(beet) : beet,
    );
  }
  return { bed: changed || patrolled ? { ...bed, beets } : bed, writes, swung, changed, patrolled };
}

export interface FigStrike {
  // True when the swing landed (the clock was stamped).
  readonly struck: boolean;
  // Writes for D1. A felled duelist gives two rows that must be saved in one batch.
  readonly writes: readonly PersimmonWrite[];
  readonly felled: boolean;
}

// One duel swing by the attacker at the target. Lands only between flagged partners of each other.
// Anything else does nothing and stamps nothing. Damage is the attacker's strike; no xp moves.
// At 0 the loser lands in town at full max health and the winner takes half the loser's coins, rounded down.
export function strikeFig(
  attacker: FigWalk,
  target: FigWalk | undefined,
  pairs: ReadonlyMap<string, string>,
  swing: SwingClock,
  nowMs: number,
): FigStrike {
  const none: FigStrike = { struck: false, writes: [], felled: false };
  if (target === undefined || attacker.facts.id === target.facts.id) {
    return none;
  }
  if (pairs.get(attacker.facts.id) !== target.facts.id || pairs.get(target.facts.id) !== attacker.facts.id) {
    return none;
  }
  if (attacker.facts.place === 'town' || target.facts.place === 'town' || target.facts.hp <= 0) {
    return none;
  }
  if (!trySwing(swing, nowMs, 'duel')) {
    return none;
  }
  const left = target.facts.hp - strike(heroOf(attacker));
  if (left > 0) {
    target.facts = { ...target.facts, hp: left };
    return { struck: true, writes: [{ id: target.facts.id, patch: { hp: left } }], felled: false };
  }
  const risen = deathResult({ ...heroOf(target), health: 0 });
  const pot = duelPayout(target.facts.coins);
  const [townX, townY] = townSpawn;
  const loserCoins = target.facts.coins - pot;
  const winnerCoins = attacker.facts.coins + pot;
  target.facts = { ...target.facts, hp: risen.health, place: risen.place, x: townX, y: townY, coins: loserCoins };
  target.guavaX = townX;
  target.guavaY = townY;
  target.guavaArmed = false;
  attacker.facts = { ...attacker.facts, coins: winnerCoins };
  return {
    struck: true,
    felled: true,
    // Loser first, winner second: saveFactsPair writes both in one batch.
    writes: [
      { id: target.facts.id, patch: { hp: risen.health, place: risen.place, x: townX, y: townY, coins: loserCoins } },
      { id: attacker.facts.id, patch: { coins: winnerCoins } },
    ],
  };
}
