// Map regions for assets/maps/world-map-wide.jpg (1280 x 720 pixels).
// Every number here was taken from that picture only; docs/regions-measure.md records how.
// Coordinates are image pixels, x to the right and y down, from the top-left corner.
// Other rule modules read these values and never restate them.

import type { ZoneName } from './tables';

export type Point = readonly [number, number];
export type Ring = readonly Point[];
export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const MAP_WIDTH = 1280;
export const MAP_HEIGHT = 720;

// Skeleton proximity radius in pixels: a skeleton wakes when a character is this close.
// 100 px, a little over 2 melee reaches (48 px), so a player must walk through the graveyard to be noticed.
export const skeletonRadiusPx = 100;

// Apple ring: the town zone. It is the lower-left part of the picture: the walled town plus the
// grass around it, bounded above by the cemetery's lower wall and the dirt road, and on the right
// by the road that runs down to the bottom edge. Because it reaches the lower-left corner,
// the corner pixel belongs to town.
const appleTownRing: Ring = [
  [0, 130], [8, 150], [25, 190], [60, 222], [110, 240], [180, 252], [250, 256], [300, 252],
  [330, 232], [380, 222], [400, 250], [440, 275], [490, 300], [530, 330], [600, 362], [640, 380],
  [600, 404], [600, 446], [556, 470], [500, 492], [481, 508], [481, 572], [650, 720], [0, 720],
];

// Plum ring: the cemetery, upper left, inside its wall and the pine trees.
const plumCemeteryRing: Ring = [
  [0, 0], [432, 0], [470, 30], [520, 60], [548, 95], [556, 115], [545, 122], [512, 150],
  [470, 172], [430, 195], [380, 222], [330, 232], [300, 252], [250, 256], [180, 252], [110, 240],
  [60, 222], [25, 190], [8, 150], [0, 130],
];

// Kiwi ring: the green fields, lower right and the middle between the cemetery and the grey ground.
// It shares every edge with the apple, plum and grape rings, so the rings tile the picture.
const kiwiGreenRing: Ring = [
  [380, 222], [430, 195], [470, 172], [512, 150], [545, 122], [556, 115], [600, 132], [700, 175],
  [760, 212], [800, 225], [880, 255], [960, 290], [1040, 318], [1120, 350], [1180, 390], [1230, 440],
  [1260, 490], [1280, 530], [1280, 720], [650, 720], [481, 572], [481, 508], [500, 492], [556, 470],
  [600, 446], [600, 404], [640, 380], [600, 362], [530, 330], [490, 300], [440, 275], [400, 250],
];

// Grape ring: the grey ground, upper right. Its bottom-right edge meets the right edge at y 530,
// so the bottom-right corner falls in the green fields.
const grapeGreyRing: Ring = [
  [432, 0], [1280, 0], [1280, 530], [1260, 490], [1230, 440], [1180, 390], [1120, 350], [1040, 318],
  [960, 290], [880, 255], [800, 225], [760, 212], [700, 175], [600, 132], [556, 115], [548, 95],
  [520, 60], [470, 30],
];

// Pear walls: the outline of the walled town, inside the apple ring. Used for the hit-areas
// and the town spawn points, which must lie inside the walls.
export const pearTownWalls: Ring = [
  [38, 350], [60, 344], [78, 346], [100, 322], [119, 296], [147, 294], [164, 312], [192, 300],
  [222, 282], [242, 284], [246, 316], [300, 298], [340, 302], [382, 298], [402, 300], [437, 303],
  [442, 330], [470, 336], [482, 338], [510, 340], [514, 372], [532, 386], [546, 392], [562, 404],
  [600, 404], [600, 446], [562, 456], [556, 470], [530, 482], [500, 492], [481, 508], [481, 572],
  [444, 574], [400, 598], [350, 628], [300, 644], [244, 664], [206, 652], [180, 624], [150, 600],
  [110, 575], [80, 545], [62, 520], [45, 500], [30, 470], [22, 440], [23, 420], [24, 400], [30, 378],
];

// Lime gate: the open south road, the whole pear edge (444, 574) -> (400, 598).
// Not solid. The dirt road between the towers passes through around (422, 586).
export const limeTownGate: readonly [Point, Point] = [
  [444, 574],
  [400, 598],
];

// Kiwi post: the old solid stub on the left of that road. The lime gate covers
// the whole edge now, so the post has no length and is not a wall.
export const kiwiTownPost: readonly [Point, Point] = [
  [400, 598],
  [400, 598],
];

// Berry wall: solid cemetery line, open only at the road gate between the west chain
// and the east chain. The third chain is the pine edge, solid up to the grey ground,
// so the road gate stays the only way in.
export const berryCemeteryWalls: readonly (readonly Point[])[] = [
  [
    [0, 145], [30, 190], [50, 210], [90, 235], [150, 250], [225, 245], [295, 235], [317, 229],
  ],
  [
    [365, 217], [400, 200], [450, 187], [500, 180], [530, 160], [542, 140], [542, 105],
  ],
  [
    [542, 105], [548, 95], [520, 60], [470, 30], [432, 0],
  ],
];

// Berry gate: the open cemetery road between the west chain and the east chain.
// Not solid. The road passes through around (340, 222).
export const berryCemeteryGate: readonly [Point, Point] = [
  [317, 229],
  [365, 217],
];

// Melon fountain: the round stone well in the south of the courtyard, centred near (242, 566).
export const melonFountainBox: Box = { x0: 218, y0: 548, x1: 266, y1: 584 };

// Mango forge: the smith's hut with the chimney and the glowing furnace, west of the courtyard.
export const mangoForgeBox: Box = { x0: 100, y0: 405, x1: 205, y1: 560 };

// Each zone's rings. A zone with a single ring is listed as an array of one.
export const zoneRings: Readonly<Record<ZoneName, readonly Ring[]>> = {
  town: [appleTownRing],
  cemetery: [plumCemeteryRing],
  green: [kiwiGreenRing],
  grey: [grapeGreyRing],
};

// Spawn points. Every point lies inside its own zone (the test checks this).
// The first town point is the start point for new characters.
export const carrotTownSpawns: readonly Point[] = [
  [300, 440], [260, 470], [330, 500], [230, 500], [290, 520], [340, 450], [210, 430],
];
// Seven leeks per hunting zone, one per monster. They sit at the centres of seven equal-sized parts of the zone
// (found by repeatedly moving each leek to the centre of the spots nearest to it), so the monsters start spread over
// the whole section. docs/plan04-notes.md has the reasoning.
export const beanGreenSpawns: readonly Point[] = [
  [565, 235], [725, 335], [895, 395], [1085, 455], [655, 575], [895, 615], [1155, 615],
];
export const pumpkinGreySpawns: readonly Point[] = [
  [625, 65], [795, 95], [1005, 75], [1195, 105], [1215, 315], [915, 185], [1075, 235],
];
export const turnipCemeterySpawns: readonly Point[] = [
  [65, 65], [185, 65], [315, 55], [365, 135], [455, 95], [235, 175], [105, 165],
];

export const townSpawnPoints: readonly Point[] = carrotTownSpawns;
export const townSpawn: Point = carrotTownSpawns[0]!;

export const spawnPoints: Readonly<Record<ZoneName, readonly Point[]>> = {
  town: carrotTownSpawns,
  green: beanGreenSpawns,
  grey: pumpkinGreySpawns,
  cemetery: turnipCemeterySpawns,
};

// Crossing-number test. An edge counts when it straddles the row (half-open on y), so a point on
// a shared edge is decided the same way for both rings that share it.
function insideRing(ring: Ring, x: number, y: number): boolean {
  let inside = false;
  let j = ring.length - 1;
  for (let i = 0; i < ring.length; i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
    j = i;
  }
  return inside;
}

export function inRing(ring: Ring, x: number, y: number): boolean {
  return insideRing(ring, x, y);
}

// Zone of a picture pixel. Returns null outside the 1280 x 720 picture.
export function zoneAt(x: number, y: number): ZoneName | null {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return null;
  for (const zone of Object.keys(zoneRings) as ZoneName[]) {
    if (zoneRings[zone].some((ring) => insideRing(ring, x, y))) return zone;
  }
  return null;
}

export function hitBox(box: Box, x: number, y: number): boolean {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
}

// True when a spot is in the fountain's box or within `reach` pixels of it (the regeneration zone).
export function nearFountain(x: number, y: number, reach: number): boolean {
  return x >= melonFountainBox.x0 - reach && x <= melonFountainBox.x1 + reach && y >= melonFountainBox.y0 - reach && y <= melonFountainBox.y1 + reach;
}

export function hitFountain(x: number, y: number): boolean {
  return hitBox(melonFountainBox, x, y);
}

export function hitForge(x: number, y: number): boolean {
  return hitBox(mangoForgeBox, x, y);
}

const FIG_EPS = 1e-9;

function peachChainEdges(chain: readonly Point[]): readonly (readonly [Point, Point])[] {
  const edges: (readonly [Point, Point])[] = [];
  for (let i = 0; i < chain.length - 1; i++) edges.push([chain[i]!, chain[i + 1]!]);
  return edges;
}

function sameFigPoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function isOpenLimeGate(a: Point, b: Point): boolean {
  const [g0, g1] = limeTownGate;
  return (sameFigPoint(a, g0) && sameFigPoint(b, g1)) || (sameFigPoint(a, g1) && sameFigPoint(b, g0));
}

// Pear edges stay solid, except the whole south road (the lime gate).
// Berry chains are solid. Lime and berry gates are left out on purpose.
function guavaSolidSegments(): readonly (readonly [Point, Point])[] {
  const edges: (readonly [Point, Point])[] = [];
  const count = pearTownWalls.length;
  for (let i = 0; i < count; i++) {
    const a = pearTownWalls[i]!;
    const b = pearTownWalls[(i + 1) % count]!;
    if (isOpenLimeGate(a, b)) continue;
    edges.push([a, b]);
  }
  for (const chain of berryCemeteryWalls) edges.push(...peachChainEdges(chain));
  return edges;
}

export const guavaSolidWalls: readonly (readonly [Point, Point])[] = guavaSolidSegments();

// Hit of segment `from` -> `to` against one solid wall, or null.
// A single shared point that is only a wall endpoint counts when its parameter
// on the query is strictly after the start. The start point itself does not.
// A positive-length overlap returns the earliest point of that overlap, which
// may be the start when the segment already lies on the wall.
function dateWallHit(
  from: Point,
  to: Point,
  wallA: Point,
  wallB: Point,
): { t: number; point: Point } | null {
  const ax = from[0];
  const ay = from[1];
  const bx = to[0];
  const by = to[1];
  const cx = wallA[0];
  const cy = wallA[1];
  const dx = wallB[0];
  const dy = wallB[1];
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  if (sx * sx + sy * sy <= FIG_EPS) return null;
  const denom = rx * sy - ry * sx;
  const qpx = cx - ax;
  const qpy = cy - ay;

  if (Math.abs(denom) > FIG_EPS) {
    const t = (qpx * sy - qpy * sx) / denom;
    const u = (qpx * ry - qpy * rx) / denom;
    if (t <= FIG_EPS || t > 1 + FIG_EPS) return null;
    if (u < -FIG_EPS || u > 1 + FIG_EPS) return null;
    const tt = Math.min(t, 1);
    if (u <= FIG_EPS) return { t: tt, point: [cx, cy] };
    if (u >= 1 - FIG_EPS) return { t: tt, point: [dx, dy] };
    return { t: tt, point: [ax + tt * rx, ay + tt * ry] };
  }

  // Parallel. Collinear when the wall start lies on the query line.
  if (Math.abs(qpx * ry - qpy * rx) > FIG_EPS) return null;
  const len2 = rx * rx + ry * ry;
  if (len2 <= FIG_EPS) return null;
  const tOf = (px: number, py: number) => ((px - ax) * rx + (py - ay) * ry) / len2;
  const lo = Math.min(tOf(cx, cy), tOf(dx, dy));
  const hi = Math.max(tOf(cx, cy), tOf(dx, dy));
  const clipLo = Math.max(lo, 0);
  const clipHi = Math.min(hi, 1);
  if (clipHi < clipLo - 1e-8) return null;
  if (clipHi - clipLo <= 1e-8) {
    if (clipLo <= FIG_EPS) return null;
    const tt = Math.min(clipLo, 1);
    return { t: tt, point: [ax + tt * rx, ay + tt * ry] };
  }
  const tt = clipLo <= FIG_EPS ? 0 : Math.min(clipLo, 1);
  return { t: tt, point: [ax + tt * rx, ay + tt * ry] };
}

// First solid wall the segment hits, with that wall's two ends, or null.
// An open gate is not solid. Ties keep the earlier wall in guavaSolidWalls.
export interface GuavaWallHit {
  readonly point: Point;
  readonly wallA: Point;
  readonly wallB: Point;
}

export function firstSolidWallHit(from: Point, to: Point): GuavaWallHit | null {
  let bestT = Number.POSITIVE_INFINITY;
  let best: GuavaWallHit | null = null;
  for (const [wallA, wallB] of guavaSolidWalls) {
    const hit = dateWallHit(from, to, wallA, wallB);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      best = { point: hit.point, wallA, wallB };
    }
  }
  return best;
}

// First solid-wall crossing of the segment from `from` to `to`, or null when
// the segment crosses none. An open gate is not solid.
export function firstSolidWallCrossing(from: Point, to: Point): Point | null {
  return firstSolidWallHit(from, to)?.point ?? null;
}

function segmentMid(edge: readonly [Point, Point]): Point {
  return [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
}

// Gate midpoint for a guava that sits across a solid wall.
// Picks the open gate (lime town, then berry cemetery) whose two legs
// fig -> midpoint -> guava are both clear and whose total length is shortest.
// Null when the straight line is already clear, or when no gate qualifies.
export function papayaGateBend(from: Point, to: Point): Point | null {
  if (firstSolidWallCrossing(from, to) === null) return null;
  let best: Point | null = null;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const gate of [limeTownGate, berryCemeteryGate]) {
    const mid = segmentMid(gate);
    if (zoneAt(mid[0], mid[1]) === null) continue;
    if (firstSolidWallCrossing(from, mid) !== null) continue;
    if (firstSolidWallCrossing(mid, to) !== null) continue;
    const len = Math.hypot(mid[0] - from[0], mid[1] - from[1]) + Math.hypot(to[0] - mid[0], to[1] - mid[1]);
    if (len < bestLen) {
      bestLen = len;
      best = mid;
    }
  }
  return best;
}
