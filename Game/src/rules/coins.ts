// Coin lots: every pickup is a lot with its own date. Pure functions, no clock of their own (the caller passes now).
// Coins expire COIN_LIFETIME_DAYS after the pickup. Spending takes the oldest lots first.

import { COIN_LIFETIME_DAYS, COIN_WARN_DAYS } from './tables';

export interface CoinLot {
  readonly id: string;
  readonly amount: number;
  readonly pickedAtMs: number;
}

export const COIN_LIFETIME_MS = COIN_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export function lotExpiresAtMs(lot: CoinLot): number {
  return lot.pickedAtMs + COIN_LIFETIME_MS;
}

export function lotExpired(lot: CoinLot, nowMs: number): boolean {
  return lotExpiresAtMs(lot) <= nowMs;
}

export interface LotPlan {
  // A new lot to add (coins gained), or null.
  readonly add: { readonly amount: number; readonly pickedAtMs: number } | null;
  // Lots that shrink to a smaller amount (partly spent).
  readonly shrink: readonly { readonly id: string; readonly amount: number }[];
  // Lots that are gone (fully spent).
  readonly remove: readonly string[];
}

// The change that takes the purse from the lots' total to `target`. Gaining coins adds one lot dated now.
// Losing coins (a purchase, a duel loss) spends the oldest lots first. A target above zero never goes negative.
export function planLots(lots: readonly CoinLot[], target: number, nowMs: number): LotPlan {
  const total = lots.reduce((sum, lot) => sum + lot.amount, 0);
  if (!Number.isFinite(target)) {
    return { add: null, shrink: [], remove: [] };
  }
  const goal = Math.max(0, Math.floor(target));
  if (goal === total) {
    return { add: null, shrink: [], remove: [] };
  }
  if (goal > total) {
    return { add: { amount: goal - total, pickedAtMs: nowMs }, shrink: [], remove: [] };
  }
  let toSpend = total - goal;
  const shrink: { id: string; amount: number }[] = [];
  const remove: string[] = [];
  for (const lot of [...lots].sort((a, b) => a.pickedAtMs - b.pickedAtMs || a.id.localeCompare(b.id))) {
    if (toSpend <= 0) break;
    if (lot.amount <= toSpend) {
      remove.push(lot.id);
      toSpend -= lot.amount;
    } else {
      shrink.push({ id: lot.id, amount: lot.amount - toSpend });
      toSpend = 0;
    }
  }
  return { add: null, shrink, remove };
}

// Lots that have expired by `nowMs`, and how many coins they hold.
export function expiredLots(lots: readonly CoinLot[], nowMs: number): { readonly ids: string[]; readonly amount: number } {
  const dead = lots.filter((lot) => lotExpired(lot, nowMs));
  return { ids: dead.map((lot) => lot.id), amount: dead.reduce((sum, lot) => sum + lot.amount, 0) };
}

export const COIN_WARN_MS = COIN_WARN_DAYS * 24 * 60 * 60 * 1000;

export interface ExpiryGroup {
  readonly amount: number;
  readonly atMs: number;
}

export interface CoinExpiry {
  // Coins that expire within the warning window, the soonest and the last moment, and up to 3 groups for the tooltip.
  readonly amount: number;
  readonly atMs: number;
  readonly lastAtMs: number;
  readonly groups: readonly ExpiryGroup[];
}

// The coins that run out within the warning window (2 days). Null when none do. Lots that expire at the very same
// moment are one group; the tooltip gets at most 3 groups, soonest first, the rest folded into the last one.
export function nextExpiry(lots: readonly CoinLot[], nowMs: number, windowMs: number = COIN_WARN_MS): CoinExpiry | null {
  const soon = lots.filter((lot) => !lotExpired(lot, nowMs) && lotExpiresAtMs(lot) <= nowMs + windowMs && lot.amount > 0);
  if (soon.length === 0) return null;
  const byTime = new Map<number, number>();
  for (const lot of soon) {
    byTime.set(lotExpiresAtMs(lot), (byTime.get(lotExpiresAtMs(lot)) ?? 0) + lot.amount);
  }
  const all = [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([atMs, amount]) => ({ amount, atMs }));
  const groups = all.length <= 3 ? all : [...all.slice(0, 2), { amount: all.slice(2).reduce((n, g) => n + g.amount, 0), atMs: all[2]!.atMs }];
  return {
    amount: all.reduce((n, g) => n + g.amount, 0),
    atMs: all[0]!.atMs,
    lastAtMs: all[all.length - 1]!.atMs,
    groups,
  };
}

export interface LotTake {
  readonly id: string;
  readonly pickedAtMs: number;
  // Coins taken from this lot.
  readonly amount: number;
}

// A duel loss: `amount` coins drawn at random from the live lots, every single coin equally likely, so a big old
// pile is hit more often than one fresh coin. `rand` returns a number in [0, 1). Never takes more than the lots hold.
export function drawLots(lots: readonly CoinLot[], amount: number, rand: () => number): LotTake[] {
  const pool = lots.filter((lot) => lot.amount > 0).map((lot) => ({ lot, left: Math.floor(lot.amount) }));
  let remaining = pool.reduce((n, p) => n + p.left, 0);
  let toTake = Math.min(Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0)), remaining);
  const taken = new Map<string, number>();
  while (toTake > 0) {
    let pick = Math.min(remaining - 1, Math.floor(rand() * remaining));
    for (const entry of pool) {
      if (pick < entry.left) {
        entry.left -= 1;
        taken.set(entry.lot.id, (taken.get(entry.lot.id) ?? 0) + 1);
        break;
      }
      pick -= entry.left;
    }
    remaining -= 1;
    toTake -= 1;
  }
  return pool
    .filter((entry) => taken.has(entry.lot.id))
    .map((entry) => ({ id: entry.lot.id, pickedAtMs: entry.lot.pickedAtMs, amount: taken.get(entry.lot.id)! }));
}
