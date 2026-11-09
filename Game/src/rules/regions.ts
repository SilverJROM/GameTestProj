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
// 120 px is 2.5 melee reaches (48 px), so a player must walk through the graveyard to be noticed.
export const skeletonRadiusPx = 120;

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
export const beanGreenSpawns: readonly Point[] = [
  [720, 280], [800, 320], [900, 380], [960, 420], [880, 500], [1000, 560], [1100, 620], [760, 520],
  [660, 600],
];
export const pumpkinGreySpawns: readonly Point[] = [
  [860, 150], [950, 120], [1040, 200], [1120, 150], [1180, 250], [980, 260], [1100, 300],
];
export const turnipCemeterySpawns: readonly Point[] = [
  [60, 60], [140, 30], [230, 70], [300, 110], [380, 80], [200, 160], [120, 170], [260, 200],
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

export function hitFountain(x: number, y: number): boolean {
  return hitBox(melonFountainBox, x, y);
}

export function hitForge(x: number, y: number): boolean {
  return hitBox(mangoForgeBox, x, y);
}
