import { describe, expect, it } from 'vitest';
import { COIN_LIFETIME_MS, expiredLots, nextExpiry, planLots, type CoinLot } from '../../src/rules/coins';
import { COIN_LIFETIME_DAYS } from '../../src/rules/tables';

const DAY = 86_400_000;
const now = 1_700_000_000_000;
const lot = (id: string, amount: number, ageDays: number): CoinLot => ({ id, amount, pickedAtMs: now - ageDays * DAY });

describe('coin lots', () => {
  it('coins live seven days', () => {
    expect(COIN_LIFETIME_DAYS).toBe(7);
    expect(COIN_LIFETIME_MS).toBe(7 * DAY);
  });

  it('gaining coins adds one lot dated now', () => {
    const plan = planLots([lot('a', 5, 1)], 12, now);
    expect(plan.add).toEqual({ amount: 7, pickedAtMs: now });
    expect(plan.shrink).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('spending takes the oldest lots first', () => {
    const lots = [lot('new', 10, 1), lot('old', 4, 6), lot('mid', 6, 3)];
    const plan = planLots(lots, 10, now);
    // total 20, spend 10: old (4) goes, mid (6) goes, new is untouched
    expect(plan.remove.sort()).toEqual(['mid', 'old']);
    expect(plan.shrink).toEqual([]);
    const part = planLots(lots, 15, now);
    expect(part.remove).toEqual(['old']);
    expect(part.shrink).toEqual([{ id: 'mid', amount: 5 }]);
  });

  it('no change when the total already matches, and the target never goes below zero', () => {
    expect(planLots([lot('a', 5, 1)], 5, now)).toEqual({ add: null, shrink: [], remove: [] });
    expect(planLots([lot('a', 5, 1)], -3, now).remove).toEqual(['a']);
  });

  it('a lot expires exactly seven days after the pickup, not before', () => {
    const lots = [lot('edge', 3, 7), lot('young', 9, 6.99), lot('old', 2, 10)];
    const dead = expiredLots(lots, now);
    expect(dead.ids.sort()).toEqual(['edge', 'old']);
    expect(dead.amount).toBe(5);
  });

  it('reports when the oldest living coins run out', () => {
    const lots = [lot('x', 3, 2), lot('y', 8, 5), lot('gone', 1, 9)];
    expect(nextExpiry(lots, now)).toEqual({ amount: 8, atMs: now - 5 * DAY + 7 * DAY });
    expect(nextExpiry([lot('gone', 1, 9)], now)).toBeNull();
    expect(nextExpiry([], now)).toBeNull();
  });
});
