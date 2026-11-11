// Radish patches and the widest guava window. A beet patrols its own loop, and a fig's screen keeps
// the beets inside that window walking even when they stand in the next zone.
import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class DurableObject {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

import { viewBox } from '../../src/client/camera';
import { nearestStopIndex, patrolSpots, radishPatch, type RadishPatch } from '../../src/rules/radish';
import { overlapShare, MAX_OVERLAP } from '../../src/rules/spacing';
import { berryCemeteryGate, firstSolidWallCrossing, limeTownGate, spawnPoints, zoneAt, type Point } from '../../src/rules/regions';
import { WORLD_EPOCH, ZOOM_CLOSE, ZOOM_FAR, kaleConstants, onionMonsterRows, type ZoneName } from '../../src/rules/tables';
import { figSeesBeet, guavaWindow } from '../../src/rules/view';
import { sproutFig, type FigWalk } from '../../src/world/core';
import { anyBeetWatched, stepAggro } from '../../src/world/combat';
import { plantCabbage, readCabbage, type Beet, type CabbageBed } from '../../src/world/monsters';
import { WorldRoom } from '../../src/world/room';

const ZONES: ZoneName[] = ['town', 'cemetery', 'green', 'grey'];
const HERD_ZONES: ZoneName[] = ['green', 'grey', 'cemetery'];

function figAt(id: string, place: ZoneName, x: number, y: number): FigWalk {
  return sproutFig({
    id,
    name: 'Fig',
    nameKey: 'fig',
    gender: 'woman',
    level: 1,
    xp: 0,
    hp: 70,
    maxHp: 70,
    coins: 0,
    sword: null,
    armor: null,
    items: [],
    place,
    x,
    y,
  });
}

function walkBed(bed: CabbageBed, figs: ReadonlyMap<string, FigWalk>, ticks: number) {
  let now = 0;
  let current = bed;
  const trail = new Map<string, Array<readonly [number, number]>>();
  for (const beet of bed.beets) trail.set(beet.id, [[beet.x, beet.y]]);
  for (let tick = 0; tick < ticks; tick += 1) {
    now += kaleConstants.tickMs;
    const stepped = stepAggro(current, figs, kaleConstants.tickMs, now);
    current = stepped.bed;
    for (const beet of current.beets) trail.get(beet.id)!.push([beet.x, beet.y]);
  }
  return { bed: current, trail };
}

function segDist(p: Point, a: Point, b: Point): number {
  const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  const t = l2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2));
  return Math.hypot(p[0] - a[0] - t * (b[0] - a[0]), p[1] - a[1] - t * (b[1] - a[1]));
}

function usedIndexCount(zone: ZoneName): number {
  return onionMonsterRows.find((row) => row.zone === zone)?.count ?? 0;
}

describe('guava window agrees with the client camera', () => {
  it('matches viewBox for every zone, zoom, and a handful of feet', () => {
    const feet: Array<readonly [number, number]> = [
      [0, 0],
      [300, 440],
      [800, 330],
      [640, 360],
      [1280, 720],
      [-20, 900],
    ];
    const zooms = [undefined, ZOOM_CLOSE, ZOOM_FAR, 0.1, 4, Number.NaN];
    for (const place of ZONES) {
      for (const [x, y] of feet) {
        for (const zoom of zooms) {
          const client = zoom === undefined ? viewBox(place, x, y) : viewBox(place, x, y, zoom);
          const rules = zoom === undefined ? guavaWindow(place, x, y) : guavaWindow(place, x, y, zoom);
          expect(rules).toEqual(client);
        }
      }
    }
  });

  it('counts a beet inside the widest window plus the pad, and not one step past it', () => {
    const guava = guavaWindow('green', 800, 330, ZOOM_FAR);
    const pad = kaleConstants.viewPadPx;
    expect(pad).toBe(150);
    const inside: Array<readonly [number, number]> = [
      [guava.x + guava.width / 2, guava.y + guava.height / 2],
      [guava.x - pad, guava.y - pad],
      [guava.x + guava.width + pad, guava.y + guava.height + pad],
    ];
    for (const [x, y] of inside) {
      expect(figSeesBeet('green', 800, 330, x, y)).toBe(true);
    }
    expect(figSeesBeet('green', 800, 330, guava.x - pad - 0.1, guava.y)).toBe(false);
    expect(figSeesBeet('green', 800, 330, guava.x, guava.y + guava.height + pad + 0.1)).toBe(false);
  });
});

describe('radish patches', () => {
  function patchesOf(zone: ZoneName): RadishPatch[] {
    return Array.from({ length: usedIndexCount(zone) }, (_, index) => radishPatch(zone, index));
  }

  it('gives every monster its own cell of the zone: stops in the zone, off the walls, legs open, gates clear', () => {
    for (const zone of HERD_ZONES) {
      const patches = patchesOf(zone);
      expect(patches).toHaveLength(7);
      for (let index = 0; index < patches.length; index += 1) {
        const patch = patches[index]!;
        const home = spawnPoints[zone][index]!;
        expect([patch.homeX, patch.homeY]).toEqual([home[0], home[1]]);
        expect(zoneAt(home[0], home[1])).toBe(zone);
        expect(patch.stops.length).toBeGreaterThanOrEqual(2);
        expect(patch.stops.length).toBeLessThanOrEqual(4);
        for (let stopIndex = 0; stopIndex < patch.stops.length; stopIndex += 1) {
          const left = patch.stops[stopIndex]!;
          const right = patch.stops[(stopIndex + 1) % patch.stops.length]!;
          expect(zoneAt(left.x, left.y)).toBe(zone);
          expect(firstSolidWallCrossing([left.x, left.y], [right.x, right.y])).toBeNull();
          // The gates (cemetery road, town road) stay clear of every patrol leg.
          for (const gate of [berryCemeteryGate, limeTownGate]) {
            const mid: Point = [(gate[0][0] + gate[1][0]) / 2, (gate[0][1] + gate[1][1]) / 2];
            expect(segDist(mid, [left.x, left.y], [right.x, right.y])).toBeGreaterThanOrEqual(30);
          }
          const steps = 8;
          for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            expect(zoneAt(left.x + (right.x - left.x) * t, left.y + (right.y - left.y) * t)).toBe(zone);
          }
        }
      }
    }
  });

  it('together the patrols reach 80% or more of each section (within 45 px of some monster path)', () => {
    for (const zone of HERD_ZONES) {
      const patches = patchesOf(zone);
      const legs: Array<[Point, Point]> = [];
      for (const patch of patches) {
        for (let i = 0; i < patch.stops.length; i += 1) {
          const a = patch.stops[i]!;
          const b = patch.stops[(i + 1) % patch.stops.length]!;
          legs.push([[a.x, a.y], [b.x, b.y]]);
        }
      }
      const spots = patrolSpots(zone);
      expect(spots.length).toBeGreaterThan(500);
      let reached = 0;
      for (const spot of spots) if (legs.some(([a, b]) => segDist(spot, a, b) <= 45)) reached += 1;
      expect(reached / spots.length, zone).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('starts the monsters spread over the section: no two leeks closer than 80 px', () => {
    for (const zone of HERD_ZONES) {
      const leeks = spawnPoints[zone].slice(0, 7);
      for (let a = 0; a < leeks.length; a += 1) {
        for (let b = a + 1; b < leeks.length; b += 1) {
          expect(Math.hypot(leeks[a]![0] - leeks[b]![0], leeks[a]![1] - leeks[b]![1])).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  it('offsets neighbouring loops so they do not share a heading', () => {
    for (const zone of HERD_ZONES) {
      const patches = patchesOf(zone);
      for (let index = 0; index < patches.length - 1; index += 1) {
        const left = patches[index]!;
        const right = patches[index + 1]!;
        const leftStop = left.stops[0]!;
        const rightStop = right.stops[0]!;
        const leftAngle = Math.atan2(leftStop.y - left.homeY, leftStop.x - left.homeX);
        const rightAngle = Math.atan2(rightStop.y - right.homeY, rightStop.x - right.homeX);
        const turn = Math.atan2(Math.sin(rightAngle - leftAngle), Math.cos(rightAngle - leftAngle));
        expect(Math.abs(turn)).toBeGreaterThan(0.2);
      }
    }
  });
});

describe('radish patrol on the rules tick', () => {
  const greenFig = figAt('fig-green', 'green', 800, 330);

  it('keeps every monster in its zone and clearly visible: pairs overlap at most 40%, never three in a row', () => {
    const ticks = (60 * 1000) / kaleConstants.tickMs;
    const figs = new Map<string, FigWalk>([
      ['fig-green', figAt('fig-green', 'green', 800, 330)],
      ['fig-grey', figAt('fig-grey', 'grey', 1000, 180)],
      // Clear of every skeleton's wake radius, so the herd patrols.
      ['fig-cemetery', figAt('fig-cemetery', 'cemetery', 535, 130)],
    ]);
    const walked = walkBed(plantCabbage(), figs, ticks);
    for (const zone of HERD_ZONES) {
      const herd = walked.bed.beets.filter((beet) => beet.zone === zone);
      expect(herd.length).toBe(7);
      let worstShare = 0;
      let worstTouching = 0;
      for (let tick = 0; tick < ticks + 1; tick += 1) {
        const spots = herd.map((beet) => {
          const at = walked.trail.get(beet.id)![tick]!;
          expect(zoneAt(at[0], at[1])).toBe(zone);
          return { id: beet.id, kind: beet.kind, x: at[0], y: at[1] };
        });
        for (let a = 0; a < spots.length; a += 1) {
          let touching = 0;
          for (let b = 0; b < spots.length; b += 1) {
            if (a === b) continue;
            const share = overlapShare(spots[a]!, spots[b]!);
            if (share > 0) touching += 1;
            worstShare = Math.max(worstShare, share);
          }
          worstTouching = Math.max(worstTouching, touching);
        }
      }
      expect(worstShare, zone).toBeLessThanOrEqual(MAX_OVERLAP + 1e-9);
      expect(worstTouching, zone).toBeLessThanOrEqual(1);
    }
  });

  it('patrols slowly: 11 px/s for wolf and skeleton, 8 px/s for the bear (chase stays 90)', () => {
    expect(kaleConstants.monsterPatrolSpeedPxPerSec).toBe(11);
    expect(kaleConstants.monsterBearPatrolSpeedPxPerSec).toBe(8);
    expect(kaleConstants.monsterChaseSpeedPxPerSec).toBe(90);
    const figs = new Map<string, FigWalk>([['fig-green', figAt('fig-green', 'green', 800, 330)], ['fig-grey', figAt('fig-grey', 'grey', 1000, 180)]]);
    const walked = walkBed(plantCabbage(), figs, 100);
    for (const beet of walked.bed.beets.filter((b) => b.zone === 'green' || b.zone === 'grey')) {
      const path = walked.trail.get(beet.id)!;
      const limit = ((beet.kind === 'bear' ? 8 : 11) * kaleConstants.tickMs) / 1000 + 1e-6;
      let moved = 0;
      for (let i = 1; i < path.length; i += 1) {
        const step = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
        expect(step).toBeLessThanOrEqual(limit);
        moved += step;
      }
      expect(moved).toBeGreaterThan(0);
    }
  });

  it('moves every beet on a green fig screen, including the grey bears, and leaves the far ones', () => {
    const figs = new Map([[greenFig.facts.id, greenFig]]);
    const before = plantCabbage();
    const walked = walkBed(before, figs, 40);
    let seen = 0;
    let hidden = 0;
    for (const beet of before.beets) {
      const later = walked.bed.beets.find((candidate) => candidate.id === beet.id)!;
      const watched = beet.zone === 'green' || figSeesBeet('green', 800, 330, beet.x, beet.y);
      const moved = later.x !== beet.x || later.y !== beet.y;
      if (watched) {
        seen += 1;
        expect(moved).toBe(true);
      } else {
        hidden += 1;
        expect([later.x, later.y]).toEqual([beet.x, beet.y]);
      }
    }
    const bearsSeen = before.beets.filter((beet) => beet.kind === 'bear' && figSeesBeet('green', 800, 330, beet.x, beet.y));
    expect(bearsSeen.length).toBe(7);
    expect(seen).toBeGreaterThan(bearsSeen.length);
    expect(hidden).toBeGreaterThan(0);
  });

  it('walks exactly the monsters some fig can see when two figs stand in different zones', () => {
    const figs = new Map<string, FigWalk>([
      ['fig-green', figAt('fig-green', 'green', 720, 280)],
      ['fig-cemetery', figAt('fig-cemetery', 'cemetery', 535, 130)],
    ]);
    const before = plantCabbage();
    const walked = walkBed(before, figs, 40);
    let moved = 0;
    let still = 0;
    for (const beet of before.beets) {
      const later = walked.bed.beets.find((candidate) => candidate.id === beet.id)!;
      const changed = later.x !== beet.x || later.y !== beet.y;
      if (anyBeetWatched([beet], figs)) {
        moved += 1;
        expect(changed, beet.id).toBe(true);
      } else {
        still += 1;
        expect([later.x, later.y], beet.id).toEqual([beet.x, beet.y]);
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(still).toBeGreaterThan(0);
  });

  it('a fig that reports a closer camera moves fewer monsters than one with the widest view', () => {
    const wide = figAt('fig-wide', 'green', 720, 280);
    const close = { ...figAt('fig-close', 'green', 720, 280), viewZoom: ZOOM_CLOSE };
    const beets = plantCabbage().beets;
    const seenWide = beets.filter((beet) => anyBeetWatched([beet], new Map([['w', wide]])));
    const seenClose = beets.filter((beet) => anyBeetWatched([beet], new Map([['c', close]])));
    expect(seenClose.length).toBeLessThan(seenWide.length);
    for (const beet of seenClose) expect(seenWide).toContain(beet);
  });

  it('moves nothing when no fig is connected', () => {
    const walked = walkBed(plantCabbage(), new Map(), 50);
    expect(walked.bed).toEqual(plantCabbage());
    expect(anyBeetWatched(plantCabbage().beets, new Map())).toBe(false);
  });

  it('walks back to the nearest stop after the target leaves the zone', () => {
    const bed = plantCabbage();
    const wolf = bed.beets.find((beet) => beet.kind === 'wolf')!;
    const patch = radishPatch(wolf.zone, wolf.spawnIndex);
    const stop = patch.stops[nearestStopIndex(900, 400, patch.stops)]!;
    const chased: CabbageBed = {
      ...bed,
      beets: bed.beets.map((beet) => (beet.id === wolf.id ? { ...beet, x: 900, y: 400, targetId: 'gone' } : beet)),
    };
    const figs = new Map([['gone', figAt('gone', 'town', 300, 440)]]);
    const dropped = stepAggro(chased, figs, kaleConstants.tickMs, kaleConstants.tickMs);
    const released = dropped.bed.beets.find((beet) => beet.id === wolf.id)!;
    expect(released.targetId).toBeUndefined();
    expect([released.x, released.y]).toEqual([900, 400]);
    expect(released.loopAt).toBe(nearestStopIndex(900, 400, patch.stops));
    const walked = walkBed(dropped.bed, new Map([['fig-green', greenFig]]), 80);
    const back = walked.bed.beets.find((beet) => beet.id === wolf.id)!;
    const left = Math.hypot(released.x - stop.x, released.y - stop.y);
    const now = Math.hypot(back.x - stop.x, back.y - stop.y);
    expect(now).toBeLessThan(left);
    expect(zoneAt(back.x, back.y)).toBe(wolf.zone);
  });

  it('still clears aggro when the target leaves the zone and does not bite', () => {
    const bed = plantCabbage();
    const wolf = bed.beets.find((beet) => beet.kind === 'wolf')!;
    const chasing: CabbageBed = {
      ...bed,
      beets: bed.beets.map((beet) => (beet.id === wolf.id ? { ...beet, targetId: 'fig-green' } : beet)),
    };
    const figs = new Map([['fig-green', figAt('fig-green', 'town', 300, 440)]]);
    const stepped = stepAggro(chasing, figs, kaleConstants.tickMs, 1_000);
    const released = stepped.bed.beets.find((beet) => beet.id === wolf.id)!;
    expect(released.targetId).toBeUndefined();
    expect(stepped.bites).toEqual([]);
    expect(stepped.writes).toEqual([]);
  });
});

describe('stored vine still loads', () => {
  it('round-trips a bed that already names its loop', () => {
    const fresh = plantCabbage();
    expect(readCabbage(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh);
  });

  it('starts an old vine on the nearest stop of that leek and does not require a new epoch', () => {
    expect(WORLD_EPOCH).toBe(2);
    const fresh = plantCabbage();
    const old = JSON.parse(JSON.stringify(fresh)) as { beets: Array<Record<string, unknown>> };
    for (const beet of old.beets) {
      beet.legDir = 1;
      delete beet.loopAt;
    }
    const read = readCabbage(old);
    expect(read).not.toBeNull();
    for (const beet of read!.beets) {
      const prior = fresh.beets.find((candidate) => candidate.id === beet.id)!;
      expect(beet.spawnIndex).toBe(prior.spawnIndex);
      const patch = radishPatch(beet.zone, beet.spawnIndex);
      const index = nearestStopIndex(prior.x, prior.y, patch.stops);
      expect(beet.loopAt).toBe(index);
      expect([beet.x, beet.y]).toEqual([patch.stops[index]!.x, patch.stops[index]!.y]);
    }
  });

  it('gives a beet with no leek index the nearest leek, then that leek\'s nearest stop', () => {
    const fresh = plantCabbage();
    const old = JSON.parse(JSON.stringify(fresh)) as { beets: Array<Record<string, unknown>> };
    for (const beet of old.beets) {
      delete beet.spawnIndex;
      delete beet.legDir;
      delete beet.loopAt;
    }
    const read = readCabbage(old);
    expect(read).not.toBeNull();
    for (const beet of read!.beets) {
      const prior = fresh.beets.find((candidate) => candidate.id === beet.id)!;
      expect(beet.spawnIndex).toBe(prior.spawnIndex);
      const patch = radishPatch(beet.zone, prior.spawnIndex);
      const index = nearestStopIndex(prior.x, prior.y, patch.stops);
      expect([beet.x, beet.y]).toEqual([patch.stops[index]!.x, patch.stops[index]!.y]);
    }
  });
});

describe('empty room alarm', () => {
  it('does not tick the bed or arm another alarm when nobody is connected', async () => {
    const fresh = plantCabbage();
    const seed = new Map<string, unknown>([
      ['world-epoch', WORLD_EPOCH],
      ['cabbage-bed', JSON.parse(JSON.stringify(fresh)) as CabbageBed],
    ]);
    const alarms: number[] = [];
    const puts: string[] = [];
    const storage = {
      async get(key: string) {
        return seed.get(key);
      },
      async put(key: string, value: unknown) {
        puts.push(key);
        seed.set(key, value);
      },
      async delete(keys: string | string[]) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) seed.delete(key);
        return list.length;
      },
      async list() {
        return seed;
      },
      async getAlarm() {
        return null;
      },
      async setAlarm(when: number) {
        alarms.push(when);
      },
    };
    let ripe: Promise<unknown> = Promise.resolve();
    const ctx = {
      storage,
      blockConcurrencyWhile(task: () => Promise<unknown>) {
        ripe = Promise.resolve(task());
        return ripe;
      },
    };
    const room = new WorldRoom(ctx as never, { DB: {} } as never);
    await ripe;
    puts.length = 0;
    await room.alarm();
    expect(alarms).toEqual([]);
    expect(puts).toEqual([]);
    const stored = seed.get('cabbage-bed') as CabbageBed;
    expect(stored.beets.map((beet) => [beet.id, beet.x, beet.y])).toEqual(fresh.beets.map((beet) => [beet.id, beet.x, beet.y]));
  });
});
