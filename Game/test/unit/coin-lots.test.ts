import { describe, expect, it } from 'vitest';
import { COIN_LIFETIME_MS, drawLots, expiredLots, nextExpiry, planLots, type CoinLot } from '../../src/rules/coins';
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

  it('reports only the coins that run out within 2 days', () => {
    // ages: 6 d (1 d left), 5.5 d (1.5 d left), 3 d (4 d left: outside the window), 9 d (gone)
    const lots = [lot('a', 4, 6), lot('b', 3, 5.5), lot('far', 20, 3), lot('gone', 1, 9)];
    const out = nextExpiry(lots, now)!;
    expect(out.amount).toBe(7);
    expect(out.atMs).toBe(now - 6 * DAY + 7 * DAY);
    expect(out.lastAtMs).toBe(now - 5.5 * DAY + 7 * DAY);
    expect(out.groups).toEqual([
      { amount: 4, atMs: now + 1 * DAY },
      { amount: 3, atMs: now + 1.5 * DAY },
    ]);
    expect(nextExpiry([lot('far', 5, 3)], now)).toBeNull();
    expect(nextExpiry([lot('gone', 1, 9)], now)).toBeNull();
    expect(nextExpiry([], now)).toBeNull();
  });

  it('shows at most 3 groups, folding the rest into the last one', () => {
    const lots = [lot('a', 1, 6.1), lot('b', 2, 6.2), lot('c', 3, 6.3), lot('d', 4, 6.4)];
    const out = nextExpiry(lots, now)!;
    expect(out.groups).toHaveLength(3);
    expect(out.groups.reduce((n, g) => n + g.amount, 0)).toBe(10);
    expect(out.amount).toBe(10);
  });

  it('a duel draw takes the exact amount, never more than the lots hold, and never from empty lots', () => {
    const lots = [lot('a', 5, 4), lot('b', 3, 1), lot('z', 0, 2)];
    const takes = drawLots(lots, 6, Math.random);
    expect(takes.reduce((n, t) => n + t.amount, 0)).toBe(6);
    for (const t of takes) expect(t.amount).toBeLessThanOrEqual(lots.find((l) => l.id === t.id)!.amount);
    expect(drawLots(lots, 99, Math.random).reduce((n, t) => n + t.amount, 0)).toBe(8);
    expect(drawLots(lots, 0, Math.random)).toEqual([]);
    expect(drawLots(lots, Number.NaN, Math.random)).toEqual([]);
    expect(drawLots([], 5, Math.random)).toEqual([]);
  });

  it('a duel draw is random across coins: a pile of 90 is hit about nine times as often as a pile of 10', () => {
    const lots = [lot('big', 90, 5), lot('small', 10, 1)];
    let big = 0;
    let small = 0;
    for (let i = 0; i < 2000; i += 1) {
      for (const t of drawLots(lots, 10, Math.random)) {
        if (t.id === 'big') big += t.amount;
        else small += t.amount;
      }
    }
    const share = small / (big + small);
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.12);
  });

  it('a draw can leave the old lots untouched when the dice choose the other lot', () => {
    const lots = [lot('old', 5, 6), lot('new', 5, 1)];
    // rand 0.99 always points at the last coin in the pool: the newest lot pays first.
    const takes = drawLots(lots, 3, () => 0.99);
    expect(takes).toEqual([{ id: 'new', pickedAtMs: now - 1 * DAY, amount: 3 }]);
  });

  it('the folded third group shows when the LAST of the folded coins go', () => {
    const HOUR = 3_600_000;
    const lots = [lot('a', 1, 7 - 1 / 24), lot('b', 2, 7 - 5 / 24), lot('c', 3, 7 - 20 / 24), lot('d', 4, 7 - 47 / 24)];
    const out = nextExpiry(lots, now)!;
    expect(out.groups).toEqual([
      { amount: 1, atMs: now + HOUR },
      { amount: 2, atMs: now + 5 * HOUR },
      { amount: 7, atMs: now + 47 * HOUR },
    ]);
  });
});
