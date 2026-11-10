// Coin lots: every pickup is a lot with its own date. Pure functions, no clock of their own (the caller passes now).
// Coins expire COIN_LIFETIME_DAYS after the pickup. Spending takes the oldest lots first.

import { COIN_LIFETIME_DAYS } from './tables';

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

// The oldest lot still alive: when the next coins run out. Null when there are none.
export function nextExpiry(lots: readonly CoinLot[], nowMs: number): { readonly amount: number; readonly atMs: number } | null {
  const alive = lots.filter((lot) => !lotExpired(lot, nowMs));
  if (alive.length === 0) return null;
  const first = alive.reduce((best, lot) => (lot.pickedAtMs < best.pickedAtMs ? lot : best));
  return { amount: first.amount, atMs: lotExpiresAtMs(first) };
}
