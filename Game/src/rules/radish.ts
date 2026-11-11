// Radish patch: the part of its zone one beet patrols.
// Used leeks are the first `count` points of that zone's row (seven wolves, seven bears, seven skeletons).
// The zone is cut into one cell per used leek (every spot of the zone belongs to its nearest leek), so together the
// cells cover the whole section and neighbours patrol different parts of it. Spots too near a wall, the zone edge
// or a gate are left out, so the gates stay clear. The beet walks a loop of up to four stops spread across its cell.
// The leek stays the beet's home: it is where a chase is measured from.

import { berryCemeteryGate, firstSolidWallCrossing, inRing, limeTownGate, MAP_HEIGHT, MAP_WIDTH, spawnPoints, zoneRings, type Point } from './regions';
import { patrolCellsData } from './precomputed.generated';
import { nearWall } from './route';
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

// Spots of a zone that a beet may stand on, on a 10 px grid, with their nearest leek.
const GRID_PX = 10;
const WALL_CLEAR_PX = 14;
const EDGE_CLEAR_PX = 10;
const GATE_CLEAR_PX = 50;
const STOPS_PER_LOOP = 4;

function gateMids(): Point[] {
  return [limeTownGate, berryCemeteryGate].map((g) => [(g[0][0] + g[1][0]) / 2, (g[0][1] + g[1][1]) / 2] as Point);
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  if (len2 < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2));
  return Math.hypot(p[0] - (a[0] + t * (b[0] - a[0])), p[1] - (a[1] + t * (b[1] - a[1])));
}

// True when the spot is within `within` px of the middle of a gate opening.
export function nearGateOpening(p: Point, within: number): boolean {
  // The whole opening, not just its middle: the distance to the gate line.
  return [limeTownGate, berryCemeteryGate].some((g) => distToSegment(p, g[0], g[1]) < within);
}

function nearGate(p: Point, within: number): boolean {
  return gateMids().some((g) => Math.hypot(p[0] - g[0], p[1] - g[1]) < within);
}

function segmentNearGate(a: Point, b: Point, within: number): boolean {
  return gateMids().some((g) => distToSegment(g, a, b) < within);
}

function standable(zone: ZoneName, p: Point): boolean {
  if (!pointInZone(zone, p[0], p[1])) return false;
  for (const [dx, dy] of [[EDGE_CLEAR_PX, 0], [-EDGE_CLEAR_PX, 0], [0, EDGE_CLEAR_PX], [0, -EDGE_CLEAR_PX]] as const) {
    if (!pointInZone(zone, p[0] + dx, p[1] + dy)) return false;
  }
  return !nearWall(p, WALL_CLEAR_PX) && !nearGate(p, GATE_CLEAR_PX);
}

interface ZoneCells {
  readonly cells: Point[][];
  readonly spots: readonly Point[];
}

const cellCache = new Map<ZoneName, ZoneCells>();

function zoneCells(zone: ZoneName): ZoneCells {
  const known = cellCache.get(zone);
  if (known !== undefined) return known;
  const packed = patrolCellsData?.[zone];
  if (packed !== undefined) {
    // Prebuilt at build time: cells are lists of indexes into the spot list.
    const spots = packed.spots as Point[];
    const unpacked = { cells: packed.cells.map((indexes) => indexes.map((i) => spots[i]!)), spots };
    cellCache.set(zone, unpacked);
    return unpacked;
  }
  const built = buildZoneCells(zone);
  cellCache.set(zone, built);
  return built;
}

// Slow (13 to 60 ms per zone): a build step runs it once and writes precomputed.generated.ts.
export function buildZoneCells(zone: ZoneName): ZoneCells {
  const leeks = usedLeeks(zone);
  const cells: Point[][] = leeks.map(() => []);
  const spots: Point[] = [];
  if (leeks.length > 0) {
    for (let y = GRID_PX / 2; y < MAP_HEIGHT; y += GRID_PX) {
      for (let x = GRID_PX / 2; x < MAP_WIDTH; x += GRID_PX) {
        const p: Point = [x, y];
        if (!standable(zone, p)) continue;
        spots.push(p);
        let best = 0;
        let bestGap = Infinity;
        for (let i = 0; i < leeks.length; i += 1) {
          const gap = Math.hypot(leeks[i]![0] - x, leeks[i]![1] - y);
          if (gap < bestGap) {
            bestGap = gap;
            best = i;
          }
        }
        cells[best]!.push(p);
      }
    }
  }
  return { cells, spots };
}

// The cells as index lists into the spot list, for the generated file.
export function packZoneCells(zone: ZoneName): { spots: Point[]; cells: number[][] } {
  const { cells, spots } = buildZoneCells(zone);
  const index = new Map<string, number>();
  spots.forEach((p, i) => index.set(`${p[0]},${p[1]}`, i));
  return { spots: [...spots], cells: cells.map((cell) => cell.map((p) => index.get(`${p[0]},${p[1]}`)!)) };
}

// The spots a patrol of this zone may touch (for tests and measurements).
export function patrolSpots(zone: ZoneName): readonly Point[] {
  return zoneCells(zone).spots;
}

function buildLoop(zone: ZoneName, index: number): Point[] {
  const cell = zoneCells(zone).cells[index] ?? [];
  if (cell.length === 0) return [];
  const cx = cell.reduce((n, p) => n + p[0], 0) / cell.length;
  const cy = cell.reduce((n, p) => n + p[1], 0) / cell.length;
  const turn = index * 0.7;
  const stops: Point[] = [];
  for (let k = 0; k < STOPS_PER_LOOP; k += 1) {
    const angle = turn + (k * 2 * Math.PI) / STOPS_PER_LOOP;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    // The spot farthest out along this direction, with little sideways drift.
    let best: Point | null = null;
    let bestScore = -Infinity;
    for (const p of cell) {
      const along = (p[0] - cx) * ux + (p[1] - cy) * uy;
      const side = Math.abs(-(p[0] - cx) * uy + (p[1] - cy) * ux);
      const score = along - 0.6 * side;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best !== null) stops.push(best);
  }
  // Drop a stop whose leg to the previous one is not open (a wall, the zone edge or a gate in the way).
  const kept: Point[] = [];
  for (const stop of stops) {
    const prev = kept[kept.length - 1];
    if (prev !== undefined && (!segmentOpen(zone, prev, stop) || segmentNearGate(prev, stop, GATE_CLEAR_PX * 0.8))) continue;
    if (kept.some((q) => q[0] === stop[0] && q[1] === stop[1])) continue;
    kept.push(stop);
  }
  while (kept.length >= 3) {
    const last = kept[kept.length - 1]!;
    const first = kept[0]!;
    if (segmentOpen(zone, last, first) && !segmentNearGate(last, first, GATE_CLEAR_PX * 0.8)) break;
    kept.pop();
  }
  return kept;
}

function buildPatch(zone: ZoneName, spawnIndex: number): RadishPatch {
  const leeks = spawnPoints[zone];
  if (leeks.length === 0) {
    return { homeX: 0, homeY: 0, radius: 0, stops: [] };
  }
  const index = Math.min(Math.max(spawnIndex, 0), leeks.length - 1);
  const home = leeks[index]!;
  const stops = buildLoop(zone, index);
  const radius = stops.reduce((m, s) => Math.max(m, Math.hypot(s[0] - home[0], s[1] - home[1])), 0);
  return {
    homeX: home[0],
    homeY: home[1],
    radius,
    stops: stops.map((s) => ({ x: s[0], y: s[1] })),
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
