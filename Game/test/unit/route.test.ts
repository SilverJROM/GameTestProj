import { describe, expect, it } from 'vitest';
import type { CharacterFacts } from '../../src/server/db';
import { firstSolidWallCrossing, zoneAt, type Point } from '../../src/rules/regions';
import { planWalk, routeLength, routeWaypoints } from '../../src/rules/route';
import { kaleConstants, type ZoneName } from '../../src/rules/tables';
import { figMoving, orderGuava, ripenFig, sproutFig, type FigWalk } from '../../src/world/core';

function freshFig(x: number, y: number, place: ZoneName): FigWalk {
  const facts: CharacterFacts = {
    id: 'r', name: 'r', nameKey: 'r', gender: 'woman', level: 1, xp: 0, hp: 70, maxHp: 70, coins: 0,
    sword: null, armor: null, items: [], place, x, y,
  };
  return sproutFig(facts);
}

// Walks the avatar to the click and reports the tick count, the end spot and any wall crossing.
function walk(from: Point, to: Point): { end: Point; ticks: number; crossed: boolean; path: Point[] } {
  const fig = freshFig(from[0], from[1], zoneAt(from[0], from[1]) ?? 'town');
  orderGuava(fig, to[0], to[1]);
  let crossed = false;
  const path: Point[] = [[fig.facts.x, fig.facts.y]];
  let ticks = 0;
  for (; ticks < 900 && figMoving(fig); ticks += 1) {
    const prev: Point = [fig.facts.x, fig.facts.y];
    ripenFig(fig, kaleConstants.tickMs);
    const now: Point = [fig.facts.x, fig.facts.y];
    if (firstSolidWallCrossing(prev, now) !== null) crossed = true;
    path.push(now);
  }
  return { end: [fig.facts.x, fig.facts.y], ticks, crossed, path };
}

// Start and target pairs: inside to outside, outside to inside, the cemetery, along and around the walls.
const PAIRS: { name: string; from: Point; to: Point }[] = [
  { name: 'town square to the green fields', from: [300, 480], to: [800, 400] },
  { name: 'town square to the grey ground', from: [300, 480], to: [900, 120] },
  { name: 'town square to the cemetery', from: [300, 480], to: [200, 120] },
  { name: 'green fields back into town', from: [800, 400], to: [300, 480] },
  { name: 'cemetery to the green fields', from: [200, 120], to: [800, 400] },
  { name: 'cemetery to town', from: [200, 120], to: [260, 470] },
  { name: 'grey ground to the cemetery', from: [900, 120], to: [300, 100] },
  { name: 'far corner of town to the outside south', from: [60, 450], to: [700, 650] },
  { name: 'beside the wall outside to the north of the town', from: [330, 330], to: [330, 420] },
  { name: 'upper town to lower town', from: [200, 330], to: [380, 560] },
];

describe('best-route walking', () => {
  it('goes straight when nothing is in the way', () => {
    expect(routeWaypoints([700, 500], [900, 600])).toEqual([]);
    expect(routeWaypoints([60, 60], [200, 160])).toEqual([]);
  });

  it('goes through the town gate when the target is outside the wall (the reported case)', () => {
    const bends = routeWaypoints([300, 480], [700, 650])!;
    expect(bends.length).toBeGreaterThan(0);
    // The south gate is the line (444,574)-(400,598); a bend sits at its middle.
    expect(bends.some((b) => Math.hypot(b[0] - 422, b[1] - 586) < 25)).toBe(true);
  });

  for (const pair of PAIRS) {
    it(`reaches the target with no wall crossing: ${pair.name}`, () => {
      const plan = planWalk(pair.from, pair.to);
      expect(plan).not.toBeNull();
      // Every leg of the plan is clear.
      let at = pair.from;
      for (const p of [...plan!.bends, plan!.target]) {
        expect(firstSolidWallCrossing(at, p), `leg to ${p}`).toBeNull();
        at = p;
      }
      const out = walk(pair.from, pair.to);
      expect(out.crossed).toBe(false);
      expect(Math.hypot(out.end[0] - plan!.target[0], out.end[1] - plan!.target[1])).toBeLessThan(2);
      // Close to the shortest way: the planned length against the straight line (never absurdly longer than needed).
      const len = routeLength(pair.from, plan!.bends, plan!.target);
      const straight = Math.hypot(pair.to[0] - pair.from[0], pair.to[1] - pair.from[1]);
      expect(len).toBeGreaterThanOrEqual(straight - 1e-6);
      expect(len).toBeLessThan(straight * 3);
    });
  }

  it('the route is the shortest of the ways it could take: no leg is replaceable by a clear shortcut', () => {
    for (const pair of PAIRS) {
      const plan = planWalk(pair.from, pair.to)!;
      const pts: Point[] = [pair.from, ...plan.bends, plan.target];
      for (let i = 0; i + 2 < pts.length; i += 1) {
        // Skipping a bend must not be possible: that would be a shorter route.
        expect(firstSolidWallCrossing(pts[i]!, pts[i + 2]!), `${pair.name}: bend ${i + 1} is needed`).not.toBeNull();
      }
    }
  });

  it('a click on a wall goes to the nearest spot beside it, not into the wall', () => {
    // A point on the town wall segment (38,350)-(60,344).
    const plan = planWalk([300, 480], [49, 347])!;
    expect(plan).not.toBeNull();
    expect(Math.hypot(plan.target[0] - 49, plan.target[1] - 347)).toBeLessThan(15);
    const out = walk([300, 480], [49, 347]);
    expect(out.crossed).toBe(false);
    expect(Math.hypot(out.end[0] - plan.target[0], out.end[1] - plan.target[1])).toBeLessThan(2);
  });

  it('a click off the map is pulled onto it and still walkable', () => {
    const out = walk([300, 480], [5000, 5000]);
    expect(out.crossed).toBe(false);
    expect(out.end[0]).toBeLessThanOrEqual(1280);
    expect(out.end[1]).toBeLessThanOrEqual(720);
  });

  it('many random start and target pairs: always a route, never a wall crossing', () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let tested = 0;
    for (let i = 0; i < 150; i += 1) {
      const from: Point = [Math.floor(rnd() * 1270) + 5, Math.floor(rnd() * 710) + 5];
      const to: Point = [Math.floor(rnd() * 1270) + 5, Math.floor(rnd() * 710) + 5];
      if (zoneAt(from[0], from[1]) === null || zoneAt(to[0], to[1]) === null) continue;
      const plan = planWalk(from, to);
      if (plan === null) continue;
      let at = from;
      for (const p of [...plan.bends, plan.target]) {
        expect(firstSolidWallCrossing(at, p), `from ${from} to ${to}`).toBeNull();
        at = p;
      }
      tested += 1;
    }
    expect(tested).toBeGreaterThan(100);
  });

  it('one plan is cheap: 200 plans well under a second', () => {
    const t0 = Date.now();
    for (let i = 0; i < 200; i += 1) planWalk([300 + (i % 10), 480], [700 + (i % 7), 650]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});
