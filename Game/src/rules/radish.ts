// Radish patch: the disk one beet patrols around its own leek.
// Used leeks are the first `count` points of that zone's row (seven wolves, seven bears, seven skeletons).
// The disk radius is the cap, or the gap share to the nearest other used leek, whichever is smaller.
// Three stops sit around the leek. A stop that leaves the zone or crosses a solid wall shrinks
// along its ray, and a stop that still fails is dropped. No stops means the beet stands on the leek.
// Neighbours start a third of a turn apart plus one step of the herd, so they do not walk the same way.

import { firstSolidWallCrossing, inRing, spawnPoints, zoneRings, type Point } from './regions';
import { kaleConstants, onionMonsterRows, type ZoneName } from './tables';

export interface RadishStop {
  readonly x: number;
  readonly y: number;
}

export interface RadishPatch {
  readonly homeX: number;
  readonly homeY: number;
  readonly radius: number;
  readonly stops: readonly RadishStop[];
}

const radishCache = new Map<string, RadishPatch>();

function herdCount(zone: ZoneName): number {
  const row = onionMonsterRows.find((candidate) => candidate.zone === zone);
  return row === undefined ? 0 : row.count;
}

function usedLeeks(zone: ZoneName): readonly Point[] {
  return spawnPoints[zone].slice(0, herdCount(zone));
}

function pointInZone(zone: ZoneName, x: number, y: number): boolean {
  return zoneRings[zone].some((ring) => inRing(ring, x, y));
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// True when the open segments cross or touch. A shared endpoint counts, so a stop on a zone edge is refused.
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orient(a[0], a[1], b[0], b[1], c[0], c[1]);
  const o2 = orient(a[0], a[1], b[0], b[1], d[0], d[1]);
  const o3 = orient(c[0], c[1], d[0], d[1], a[0], a[1]);
  const o4 = orient(c[0], c[1], d[0], d[1], b[0], b[1]);
  const eps = 1e-8;
  if (Math.abs(o1) <= eps || Math.abs(o2) <= eps || Math.abs(o3) <= eps || Math.abs(o4) <= eps) {
    return pointOnSegment(a, b, c) || pointOnSegment(a, b, d) || pointOnSegment(c, d, a) || pointOnSegment(c, d, b);
  }
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

function pointOnSegment(a: Point, b: Point, c: Point): boolean {
  const eps = 1e-8;
  if (Math.abs(orient(a[0], a[1], b[0], b[1], c[0], c[1])) > eps) return false;
  const minX = Math.min(a[0], b[0]) - eps;
  const maxX = Math.max(a[0], b[0]) + eps;
  const minY = Math.min(a[1], b[1]) - eps;
  const maxY = Math.max(a[1], b[1]) + eps;
  return c[0] >= minX && c[0] <= maxX && c[1] >= minY && c[1] <= maxY;
}

// The whole segment stays in the zone. Sampling catches a thin exit the edge test might round past.
function segmentInZone(zone: ZoneName, from: Point, to: Point): boolean {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(dist));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = from[0] + (to[0] - from[0]) * t;
    const y = from[1] + (to[1] - from[1]) * t;
    if (!pointInZone(zone, x, y)) return false;
  }
  for (const ring of zoneRings[zone]) {
    for (let index = 0; index < ring.length; index += 1) {
      const edgeA = ring[index]!;
      const edgeB = ring[(index + 1) % ring.length]!;
      if (segmentsCross(from, to, edgeA, edgeB)) return false;
    }
  }
  return true;
}

function segmentOpen(zone: ZoneName, from: Point, to: Point): boolean {
  return segmentInZone(zone, from, to) && firstSolidWallCrossing(from, to) === null;
}

function patchRadius(zone: ZoneName, spawnIndex: number, home: Point): number {
  const used = usedLeeks(zone);
  let nearest = Infinity;
  for (let index = 0; index < used.length; index += 1) {
    if (index === spawnIndex) continue;
    const spot = used[index]!;
    const gap = Math.hypot(spot[0] - home[0], spot[1] - home[1]);
    if (gap < nearest) nearest = gap;
  }
  if (!Number.isFinite(nearest)) return kaleConstants.patchCapPx;
  return Math.min(kaleConstants.patchCapPx, kaleConstants.patchGapShare * nearest);
}

interface FitStop extends RadishStop {
  readonly angle: number;
  readonly reach: number;
}

function stopAt(home: Point, angle: number, reach: number): FitStop {
  return {
    x: home[0] + Math.cos(angle) * reach,
    y: home[1] + Math.sin(angle) * reach,
    angle,
    reach,
  };
}

function spokeOpen(zone: ZoneName, home: Point, angle: number, reach: number): boolean {
  const stop = stopAt(home, angle, reach);
  return segmentOpen(zone, home, [stop.x, stop.y]);
}

function fitSpoke(zone: ZoneName, home: Point, angle: number, maxReach: number): FitStop | null {
  if (maxReach >= 1 && spokeOpen(zone, home, angle, maxReach)) {
    return stopAt(home, angle, maxReach);
  }
  for (let reach = Math.floor(maxReach - 1e-9); reach >= 1; reach -= 1) {
    if (spokeOpen(zone, home, angle, reach)) return stopAt(home, angle, reach);
  }
  return null;
}

function chordOpen(zone: ZoneName, left: FitStop, right: FitStop): boolean {
  return segmentOpen(zone, [left.x, left.y], [right.x, right.y]);
}

// Shrink the farther end of a bad chord, or drop it when nothing closer on that ray is open.
function shrinkPair(zone: ZoneName, home: Point, stops: FitStop[], bad: number): FitStop[] {
  const next = [...stops];
  const left = next[bad]!;
  const right = next[(bad + 1) % next.length]!;
  const victim = left.reach >= right.reach ? bad : (bad + 1) % next.length;
  const stop = next[victim]!;
  for (let reach = Math.floor(stop.reach - 1e-9); reach >= 1; reach -= 1) {
    if (!spokeOpen(zone, home, stop.angle, reach)) continue;
    next[victim] = stopAt(home, stop.angle, reach);
    return next;
  }
  next.splice(victim, 1);
  return next;
}

function buildStops(zone: ZoneName, spawnIndex: number, home: Point, radius: number): readonly RadishStop[] {
  const used = usedLeeks(zone).length;
  const oliveTurn = used > 0 ? (spawnIndex * 2 * Math.PI) / used : 0;
  const maxReach = kaleConstants.loopRadiusShare * radius;
  const count = kaleConstants.loopStops;
  let stops: FitStop[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = oliveTurn + (index * 2 * Math.PI) / count;
    const fit = fitSpoke(zone, home, angle, maxReach);
    if (fit !== null) stops.push(fit);
  }
  let guard = 0;
  while (stops.length >= 2 && guard < 400) {
    guard += 1;
    let bad = -1;
    for (let index = 0; index < stops.length; index += 1) {
      const left = stops[index]!;
      const right = stops[(index + 1) % stops.length]!;
      if (!chordOpen(zone, left, right)) {
        bad = index;
        break;
      }
    }
    if (bad < 0) break;
    stops = shrinkPair(zone, home, stops, bad);
  }
  return stops.map((stop) => ({ x: stop.x, y: stop.y }));
}

function buildPatch(zone: ZoneName, spawnIndex: number): RadishPatch {
  const leeks = spawnPoints[zone];
  if (leeks.length === 0) {
    return { homeX: 0, homeY: 0, radius: 0, stops: [] };
  }
  const index = Math.min(Math.max(spawnIndex, 0), leeks.length - 1);
  const home = leeks[index]!;
  const radius = patchRadius(zone, index, home);
  return {
    homeX: home[0],
    homeY: home[1],
    radius,
    stops: buildStops(zone, index, home, radius),
  };
}

// The radish for one leek. The same leek always returns the same patch.
export function radishPatch(zone: ZoneName, spawnIndex: number): RadishPatch {
  const key = `${zone}:${spawnIndex}`;
  const cached = radishCache.get(key);
  if (cached !== undefined) return cached;
  const built = buildPatch(zone, spawnIndex);
  radishCache.set(key, built);
  return built;
}

// Lowest index wins a tie, so a beet standing on the leek (every stop equally far) takes the first stop.
export function nearestStopIndex(x: number, y: number, stops: readonly RadishStop[]): number {
  let best = 0;
  let bestGap = Infinity;
  for (let index = 0; index < stops.length; index += 1) {
    const stop = stops[index]!;
    const gap = Math.hypot(stop.x - x, stop.y - y);
    if (gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  }
  return best;
}
