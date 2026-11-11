// Findings of the Opus review of slices D and E, each pinned.
import { describe, expect, it } from 'vitest';
import { firstSolidWallCrossing, spawnPoints, type Point, guavaSolidWalls } from '../../src/rules/regions';
import { planWalk } from '../../src/rules/route';
import { nearGateOpening, patrolSpots } from '../../src/rules/radish';
import { MAX_OVERLAP, overlapShare } from '../../src/rules/spacing';
import { kaleConstants } from '../../src/rules/tables';
import { sproutFig, type FigWalk } from '../../src/world/core';
import { stepAggro } from '../../src/world/combat';
import { plantCabbage, pruneBeet, sproutYams, type CabbageBed } from '../../src/world/monsters';

function fig(id: string, place: 'green' | 'grey' | 'cemetery', x: number, y: number): FigWalk {
  return sproutFig({ id, name: id, nameKey: id, gender: 'woman', level: 1, xp: 0, hp: 70, maxHp: 70, coins: 0, sword: null, armor: null, items: [], place, x, y });
}

describe('respawn keeps the monsters spread out', () => {
  it('every killed wolf comes back on a leek no living wolf owns, so the seven leeks stay in use', () => {
    let bed: CabbageBed = plantCabbage();
    let now = 1000;
    const wolves = bed.beets.filter((b) => b.kind === 'wolf').map((b) => b.id);
    for (const id of wolves) {
      // The wolf dies somewhere on the road, not on a leek.
      bed = { ...bed, beets: bed.beets.map((b) => (b.id === id ? { ...b, x: b.x + 17, y: b.y + 9 } : b)) };
      bed = pruneBeet(bed, id, now);
      now += 60_000;
      bed = sproutYams(bed, now + 600_000);
    }
    const indexes = bed.beets.filter((b) => b.kind === 'wolf').map((b) => b.spawnIndex).sort();
    expect(indexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('a respawn waits ten seconds while a monster stands on its leek (never on top of one)', () => {
    let bed: CabbageBed = plantCabbage();
    const victim = bed.beets.find((b) => b.kind === 'wolf' && b.spawnIndex === 3)!;
    const neighbour = bed.beets.find((b) => b.kind === 'wolf' && b.spawnIndex === 4)!;
    bed = pruneBeet(bed, victim.id, 1000);
    // The neighbour wanders onto the empty leek.
    bed = { ...bed, beets: bed.beets.map((b) => (b.id === neighbour.id ? { ...b, x: victim.x, y: victim.y } : b)) };
    const waiting = sproutYams(bed, 10_000_000);
    expect(waiting.beets.filter((b) => b.kind === 'wolf')).toHaveLength(6);
    expect(waiting.yams.length).toBe(1);
    // Once it has moved on the wolf comes back.
    const moved: CabbageBed = { ...waiting, beets: waiting.beets.map((b) => (b.id === neighbour.id ? { ...b, x: b.x + 200 } : b)) };
    const back = sproutYams(moved, 10_000_000 + 11_000);
    expect(back.beets.filter((b) => b.kind === 'wolf')).toHaveLength(7);
    const fresh = back.beets.find((b) => b.id.startsWith('wolf-') && b.spawnIndex === 3)!;
    for (const other of back.beets) if (other.id !== fresh.id) expect(overlapShare(fresh, other)).toBeLessThanOrEqual(MAX_OVERLAP);
  });
});

describe('chasers', () => {
  it('a bear boxed in by others for five seconds gives the chase up', () => {
    const bed = plantCabbage();
    const bears = bed.beets.filter((b) => b.kind === 'bear').slice(0, 3);
    // Bear 0 chases a fig far to the east; two other bears stand right in front of it, side by side, so every heading is refused.
    const [a, b, c] = bears as [typeof bears[0], typeof bears[0], typeof bears[0]];
    const placed: CabbageBed = {
      ...bed,
      beets: bed.beets.map((x) => {
        if (x.id === a.id) return { ...x, x: 1000, y: 200, targetId: 'p' };
        if (x.id === b.id) return { ...x, x: 1040, y: 175, spawnIndex: x.spawnIndex };
        if (x.id === c.id) return { ...x, x: 1040, y: 235 };
        return x;
      }),
    };
    const p = fig('p', 'grey', 1150, 200);
    const figs = new Map([['p', p]]);
    let cur = placed;
    let now = 0;
    let dropped = false;
    for (let t = 0; t < 140; t += 1) {
      now += kaleConstants.tickMs;
      // The blocking bears stay put (no one else is on screen to patrol for them).
      const next = stepAggro(cur, figs, kaleConstants.tickMs, now).bed;
      cur = { ...next, beets: next.beets.map((x) => (x.id === b.id ? { ...x, x: 1040, y: 175 } : x.id === c.id ? { ...x, x: 1040, y: 235 } : x)) };
      if (cur.beets.find((x) => x.id === a.id)!.targetId === undefined) {
        dropped = true;
        break;
      }
    }
    // Either it found a way round (sidestep) and reached the fig, or it gave the chase up: never a permanent freeze.
    const bear = cur.beets.find((x) => x.id === a.id)!;
    expect(dropped || Math.hypot(bear.x - 1150, bear.y - 200) <= kaleConstants.meleeReachPx + 1).toBe(true);
  });

  it('a chasing skeleton does not stand in the cemetery gate opening', () => {
    const bed = plantCabbage();
    const sk = bed.beets.find((b) => b.kind === 'skeleton')!;
    // Start the skeleton just inside the cemetery, the fig on the far side of the gate line.
    const gate: Point = [341, 223];
    const placed: CabbageBed = { ...bed, beets: bed.beets.map((x) => (x.id === sk.id ? { ...x, x: 330, y: 190, targetId: 'p' } : x)) };
    const figs = new Map([['p', fig('p', 'cemetery', 345, 215)]]);
    let cur = placed;
    let now = 0;
    for (let t = 0; t < 200; t += 1) {
      now += kaleConstants.tickMs;
      cur = stepAggro(cur, figs, kaleConstants.tickMs, now).bed;
      const s = cur.beets.find((x) => x.id === sk.id)!;
      expect(nearGateOpening([s.x, s.y], 29)).toBe(false);
      expect(Math.hypot(s.x - gate[0], s.y - gate[1])).toBeGreaterThan(29);
    }
  });
});

describe('route legs keep off wall corners', () => {
  it('no planned leg passes within 1 px of a wall corner (ignoring the corner at its own start or end)', () => {
    const corners = new Map<string, Point>();
    for (const [a, b] of guavaSolidWalls) {
      corners.set(`${a}`, a);
      corners.set(`${b}`, b);
    }
    let seed = 11;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const spots = [...patrolSpots('green'), ...patrolSpots('cemetery'), ...spawnPoints.town];
    let legs = 0;
    for (let i = 0; i < 120; i += 1) {
      const from = spots[Math.floor(rnd() * spots.length)] as Point;
      const to = spots[Math.floor(rnd() * spots.length)] as Point;
      const plan = planWalk(from, to);
      if (plan === null) continue;
      let at = from;
      for (const q of [...plan.bends, plan.target]) {
        expect(firstSolidWallCrossing(at, q)).toBeNull();
        const len2 = (q[0] - at[0]) ** 2 + (q[1] - at[1]) ** 2;
        for (const c of corners.values()) {
          if (Math.hypot(c[0] - at[0], c[1] - at[1]) < 3 || Math.hypot(c[0] - q[0], c[1] - q[1]) < 3) continue;
          const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((c[0] - at[0]) * (q[0] - at[0]) + (c[1] - at[1]) * (q[1] - at[1])) / len2));
          expect(Math.hypot(at[0] + t * (q[0] - at[0]) - c[0], at[1] + t * (q[1] - at[1]) - c[1])).toBeGreaterThanOrEqual(1);
        }
        at = q;
        legs += 1;
      }
    }
    expect(legs).toBeGreaterThan(100);
  });
});
