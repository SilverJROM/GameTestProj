import { describe, expect, it } from 'vitest';
import { MAX_OVERLAP, overlapShare, spotAllowed, type Spot } from '../../src/rules/spacing';
import { radishPatch } from '../../src/rules/radish';
import { kaleConstants } from '../../src/rules/tables';
import { sproutFig, type FigWalk } from '../../src/world/core';
import { stepAggro } from '../../src/world/combat';
import { plantCabbage, type CabbageBed } from '../../src/world/monsters';

const wolf = (id: string, x: number, y: number): Spot => ({ id, kind: 'wolf', x, y });

describe('overlap rule', () => {
  it('is 0 apart and 1 when one sprite sits exactly on the other', () => {
    expect(overlapShare(wolf('a', 0, 0), wolf('b', 100, 0))).toBe(0);
    expect(overlapShare(wolf('a', 0, 0), wolf('b', 0, 0))).toBe(1);
  });
  it('a pair may overlap up to 40% but not more, and never one on top of the other', () => {
    expect(MAX_OVERLAP).toBe(0.4);
    const a = wolf('a', 0, 0);
    // 42 x 34 sprites: 30 px apart sideways overlaps 12/42 = 29% of the width at the same height.
    expect(overlapShare(a, wolf('b', 30, 0))).toBeCloseTo(12 / 42, 5);
    expect(spotAllowed(wolf('b', 100, 0), 30, 0, [a])).toBe(true);
    expect(spotAllowed(wolf('b', 100, 0), 10, 0, [a])).toBe(false);
    expect(spotAllowed(wolf('b', 100, 0), 0, 0, [a])).toBe(false);
  });
  it('a third sprite may not touch a pair, and may not touch two at once', () => {
    const pair = [wolf('a', 0, 0), wolf('b', 30, 0)];
    // c next to b, on the far side from a: touches b, which already touches a.
    expect(spotAllowed(wolf('c', 200, 0), 60, 0, pair)).toBe(false);
    // c in the middle of both.
    expect(spotAllowed(wolf('c', 200, 0), 15, 20, pair)).toBe(false);
    // Clear of both is fine.
    expect(spotAllowed(wolf('c', 200, 0), 120, 0, pair)).toBe(true);
  });
  it('monsters that start crowded may still walk apart, but not deeper in', () => {
    const a = wolf('a', 0, 0);
    expect(spotAllowed(wolf('b', 5, 0), 12, 0, [a])).toBe(true);
    expect(spotAllowed(wolf('b', 5, 0), 2, 0, [a])).toBe(false);
  });
  it('tall skeletons overlap by height too: one right behind another is not allowed', () => {
    const s = (id: string, x: number, y: number): Spot => ({ id, kind: 'skeleton', x, y });
    expect(spotAllowed(s('b', 100, 100), 0, 10, [s('a', 0, 0)])).toBe(false);
    expect(spotAllowed(s('b', 100, 100), 0, 60, [s('a', 0, 0)])).toBe(true);
  });
});

function fig(id: string, place: 'green' | 'grey' | 'cemetery', x: number, y: number): FigWalk {
  return sproutFig({ id, name: id, nameKey: id, gender: 'woman', level: 1, xp: 0, hp: 70, maxHp: 70, coins: 0, sword: null, armor: null, items: [], place, x, y });
}

describe('chase limit and spacing while chasing', () => {
  it('a wolf gives up when it is more than 250 px from its home, and walks home slowly', () => {
    const bed = plantCabbage();
    const w = bed.beets.find((b) => b.kind === 'wolf')!;
    const home = radishPatch(w.zone, w.spawnIndex);
    const far: CabbageBed = {
      ...bed,
      beets: bed.beets.map((b) => (b.id === w.id ? { ...b, x: home.homeX + 260, y: home.homeY, targetId: 'p' } : b)),
    };
    const figs = new Map([['p', fig('p', 'green', home.homeX + 400, home.homeY)]]);
    const out = stepAggro(far, figs, kaleConstants.tickMs, kaleConstants.tickMs).bed.beets.find((b) => b.id === w.id)!;
    expect(out.targetId).toBeUndefined();
    // Just inside the limit it still chases.
    const near: CabbageBed = {
      ...bed,
      beets: bed.beets.map((b) => (b.id === w.id ? { ...b, x: home.homeX + 240, y: home.homeY, targetId: 'p' } : b)),
    };
    const kept = stepAggro(near, figs, kaleConstants.tickMs, kaleConstants.tickMs).bed.beets.find((b) => b.id === w.id)!;
    expect(kept.targetId).toBe('p');
  });

  it('a skeleton has no chase limit', () => {
    const bed = plantCabbage();
    const sk = bed.beets.find((b) => b.kind === 'skeleton')!;
    const home = radishPatch(sk.zone, sk.spawnIndex);
    const far: CabbageBed = { ...bed, beets: bed.beets.map((b) => (b.id === sk.id ? { ...b, x: home.homeX, y: home.homeY, targetId: 'p' } : b)) };
    const figs = new Map([['p', fig('p', 'cemetery', home.homeX + 60, home.homeY)]]);
    const out = stepAggro(far, figs, kaleConstants.tickMs, kaleConstants.tickMs).bed.beets.find((b) => b.id === sk.id)!;
    expect(out.targetId).toBe('p');
  });

  it('several wolves chasing one fig do not pile on top of each other', () => {
    const bed = plantCabbage();
    const wolves = bed.beets.filter((b) => b.kind === 'wolf').slice(0, 4);
    // Put the four wolves close together around a fig, all chasing it.
    const base = { x: 800, y: 330 };
    const placed: CabbageBed = {
      ...bed,
      beets: bed.beets.map((b) => {
        const i = wolves.findIndex((w) => w.id === b.id);
        return i < 0 ? b : { ...b, x: base.x + 150 + i * 50, y: base.y + (i % 2) * 40, targetId: 'p' };
      }),
    };
    const figs = new Map([['p', fig('p', 'green', base.x, base.y)]]);
    let cur = placed;
    let now = 0;
    let worst = 0;
    for (let t = 0; t < 120; t += 1) {
      now += kaleConstants.tickMs;
      cur = stepAggro(cur, figs, kaleConstants.tickMs, now).bed;
      const live = cur.beets.filter((b) => wolves.some((w) => w.id === b.id));
      for (let a = 0; a < live.length; a += 1) {
        let touching = 0;
        for (let b = 0; b < live.length; b += 1) {
          if (a !== b && overlapShare(live[a]!, live[b]!) > 0) touching += 1;
          if (a < b) worst = Math.max(worst, overlapShare(live[a]!, live[b]!));
        }
        expect(touching).toBeLessThanOrEqual(1);
      }
    }
    expect(worst).toBeLessThanOrEqual(MAX_OVERLAP + 0.15);
  });
});
