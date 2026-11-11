// Axolotl pickup: the owner's pet digs up one coin seed at a time from the cabbage bed.
// The dig lasts pearTimings.coinPickupSeconds on the papaya clock; this module copies no number.
// When the dig finishes, the purse gains that seed's value in one {coins} write.
// Only the seed's owner is ever stepped, and only while that owner's lemon socket is open.
// The owner may walk during the dig; the timer follows the lime clock, not the fig's feet.
// A fig standing on its own seed, in that seed's zone, pockets the whole value on that tick
// and the pet's dig for that seed is dropped, so the purse is written once.
// The bed stays the one seed pile. This module keeps the live dig timers, which are never stored.

import { zoneAt } from '../rules/regions';
import { kaleConstants, pearTimings } from '../rules/tables';
import type { PickupSnapshot } from '../protocol';
import type { PersimmonWrite, FigWalk } from './core';
import type { CabbageBed, CoinSeed } from './monsters';

// One dig in progress. startMs and the elapsed stamp are lime-clock time.
export interface RadishDig {
  readonly seedId: string;
  readonly startMs: number;
  elapsedMs: number;
}

export type RadishDigs = Map<string, RadishDig>;

export interface PickupStep {
  readonly bed: CabbageBed;
  readonly writes: PersimmonWrite[];
  readonly changed: boolean;
}

const digMs = (): number => pearTimings.coinPickupSeconds * 1000;

// The seed's zone, and the fig's place, are the same plum. A fig in another zone never pockets it.
function samePlum(fig: FigWalk, seed: CoinSeed): boolean {
  const plumZone = zoneAt(seed.x, seed.y);
  return plumZone !== null && fig.facts.place === plumZone;
}

// Feet to the seed's centre. The reach lives in kaleConstants and is not copied here.
function feetOnMelon(fig: FigWalk, seed: CoinSeed): boolean {
  return Math.hypot(fig.facts.x - seed.x, fig.facts.y - seed.y) <= kaleConstants.coinPickupPx;
}

// Purse write for one seed. The patch is only {coins}, the same shape as a ripe dig.
function pocketMelon(fig: FigWalk, seed: CoinSeed, writes: PersimmonWrite[]): void {
  const coins = fig.facts.coins + seed.value;
  fig.facts = { ...fig.facts, coins };
  // The write is the amount gained (an addition in the database), so it cannot undo a spend or an expiry.
  writes.push({ id: fig.facts.id, patch: { coins, coinsDelta: seed.value } });
}

// Step every connected owner's dig through one rules tick that ends at tickEndMs.
// connectedAt holds the lime-clock moment each owner's lemon opened, so a fresh dig never
// starts before the owner returned. An owner without a figs entry is skipped and has no dig.
export function stepPickups(
  bed: CabbageBed,
  digs: RadishDigs,
  figs: ReadonlyMap<string, FigWalk>,
  connectedAt: ReadonlyMap<string, number>,
  tickEndMs: number,
): PickupStep {
  let current = bed;
  let changed = false;
  const writes: PersimmonWrite[] = [];
  for (const [ownerId, fig] of figs) {
    // A dead owner's pet waits: no walk-on pickup and no dig until the owner respawns (the coin stays on the ground).
    if (fig.facts.hp <= 0) {
      digs.delete(ownerId);
      continue;
    }
    // Walk-on first, so a step onto the seed this tick pays once and the dig for it stops.
    const pocketed = current.seeds.filter(
      (seed) => seed.ownerId === ownerId && samePlum(fig, seed) && feetOnMelon(fig, seed),
    );
    for (const seed of pocketed) {
      pocketMelon(fig, seed, writes);
      current = { ...current, seeds: current.seeds.filter((row) => row.id !== seed.id) };
      changed = true;
      if (digs.get(ownerId)?.seedId === seed.id) {
        digs.delete(ownerId);
      }
    }
    let dig = digs.get(ownerId);
    if (dig !== undefined && !current.seeds.some((seed) => seed.id === dig!.seedId)) {
      digs.delete(ownerId);
      dig = undefined;
    }
    for (let round = 0; round < 2; round += 1) {
      if (dig === undefined) {
        const next = current.seeds.find((seed) => seed.ownerId === ownerId);
        if (next === undefined) {
          break;
        }
        // A coin that follows a finished one starts at this tick's end; the first one at this tick's start.
        const sproutMs = round === 0 ? tickEndMs - kaleConstants.tickMs : tickEndMs;
        const startMs = Math.max(sproutMs, connectedAt.get(ownerId) ?? 0);
        dig = { seedId: next.id, startMs, elapsedMs: 0 };
        digs.set(ownerId, dig);
      }
      dig.elapsedMs = Math.max(0, tickEndMs - dig.startMs);
      if (dig.elapsedMs < digMs()) {
        break;
      }
      // The dig is ripe: the seed leaves the ground and its whole value enters the purse, in this tick.
      const seedId = dig.seedId;
      const ripe = current.seeds.find((seed) => seed.id === seedId);
      current = { ...current, seeds: current.seeds.filter((seed) => seed.id !== seedId) };
      changed = true;
      if (ripe === undefined) {
        const coins = fig.facts.coins + 1;
        fig.facts = { ...fig.facts, coins };
        writes.push({ id: ownerId, patch: { coins, coinsDelta: 1 } });
      } else {
        pocketMelon(fig, ripe, writes);
      }
      digs.delete(ownerId);
      dig = undefined;
      // The next owned coin starts where this one ended; round 1 stamps its elapsed time.
    }
  }
  return { bed: current, writes, changed };
}

// Snapshot rows for the digs now running: the coin's spot and how much of the dig has passed.
export function pickupSnapshots(bed: CabbageBed, digs: RadishDigs): PickupSnapshot[] {
  const rows: PickupSnapshot[] = [];
  for (const [ownerId, dig] of digs) {
    const seed = bed.seeds.find((candidate) => candidate.id === dig.seedId);
    if (seed === undefined) {
      continue;
    }
    rows.push({
      ownerId,
      coinId: seed.id,
      x: seed.x,
      y: seed.y,
      elapsedSeconds: dig.elapsedMs / 1000,
    });
  }
  return rows;
}

// True when any connected owner still has a seed lying on the ground.
export function anyDigDue(bed: CabbageBed, figs: ReadonlyMap<string, FigWalk>): boolean {
  return bed.seeds.some((seed) => figs.has(seed.ownerId));
}
