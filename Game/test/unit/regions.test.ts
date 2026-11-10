import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  beanGreenSpawns,
  berryCemeteryGate,
  berryCemeteryWalls,
  carrotTownSpawns,
  firstSolidWallCrossing,
  guavaSolidWalls,
  hitFountain,
  hitForge,
  inRing,
  kiwiTownPost,
  limeTownGate,
  melonFountainBox,
  mangoForgeBox,
  pearTownWalls,
  pumpkinGreySpawns,
  skeletonRadiusPx,
  spawnPoints,
  townSpawn,
  townSpawnPoints,
  turnipCemeterySpawns,
  type Point,
  zoneAt,
  zoneRings,
} from '../../src/rules/regions';

const MAP_PATH = new URL('../../assets/maps/world-map-wide.jpg', import.meta.url);

// Reads width and height from the JPEG start-of-frame segment (SOF0..SOF15, minus DHT, JPG, DAC).
function readJpegHeaderSize(buf: Buffer): { width: number; height: number } {
  expect(buf[0]).toBe(0xff);
  expect(buf[1]).toBe(0xd8);
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1]!;
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker in JPEG');
}

// Every ring of every zone, with the zone name, for the exactly-one check.
const allRings = (Object.keys(zoneRings) as (keyof typeof zoneRings)[]).flatMap((zone) =>
  zoneRings[zone].map((ring) => ({ zone, ring })),
);

function zonesContaining(x: number, y: number): string[] {
  return allRings.filter(({ ring }) => inRing(ring, x, y)).map(({ zone }) => zone);
}

describe('world map picture', () => {
  it('is 1280 x 720 by its JPEG header', () => {
    const size = readJpegHeaderSize(readFileSync(MAP_PATH));
    expect(size).toEqual({ width: 1280, height: 720 });
    expect(MAP_WIDTH).toBe(size.width);
    expect(MAP_HEIGHT).toBe(size.height);
  });
});

describe('zone partition', () => {
  it('puts every point of a grid in exactly one zone', () => {
    const xs: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x += 4) xs.push(x);
    xs.push(MAP_WIDTH - 1);
    const ys: number[] = [];
    for (let y = 0; y < MAP_HEIGHT; y += 4) ys.push(y);
    ys.push(MAP_HEIGHT - 1);

    const failures: string[] = [];
    for (const y of ys) {
      for (const x of xs) {
        const hits = zonesContaining(x, y);
        if (hits.length !== 1) failures.push(`(${x},${y}) in [${hits.join(',')}]`);
        const named = zoneAt(x, y);
        if (hits.length === 1 && named !== hits[0]) failures.push(`(${x},${y}) zoneAt=${named} ring=${hits[0]}`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it('has every pixel column and row on the grid, including the last ones', () => {
    expect(zoneAt(MAP_WIDTH - 1, MAP_HEIGHT - 1)).not.toBeNull();
    expect(zoneAt(MAP_WIDTH, 0)).toBeNull();
    expect(zoneAt(0, MAP_HEIGHT)).toBeNull();
  });
});

describe('corners and layout', () => {
  it('upper-left corner is the cemetery', () => {
    expect(zoneAt(0, 0)).toBe('cemetery');
  });

  it('upper-right corner is the grey ground', () => {
    expect(zoneAt(MAP_WIDTH - 1, 0)).toBe('grey');
  });

  it('lower-left corner is the town', () => {
    expect(zoneAt(0, MAP_HEIGHT - 1)).toBe('town');
  });

  it('lower-right corner is the green fields', () => {
    expect(zoneAt(MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe('green');
  });

  it('town is the lower-left, green the lower-right, grey the upper-right, cemetery the upper-left', () => {
    expect(zoneAt(150, 480)).toBe('town');
    expect(zoneAt(900, 560)).toBe('green');
    expect(zoneAt(1100, 150)).toBe('grey');
    expect(zoneAt(150, 100)).toBe('cemetery');
  });
});

describe('town hit-areas', () => {
  const corners = (b: { x0: number; y0: number; x1: number; y1: number }) => [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x0, b.y1],
    [b.x1, b.y1],
    [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2],
  ];

  it('fountain area lies inside town', () => {
    for (const [x, y] of corners(melonFountainBox)) {
      expect(zoneAt(x, y)).toBe('town');
      expect(inRing(pearTownWalls, x, y)).toBe(true);
    }
    expect(hitFountain((melonFountainBox.x0 + melonFountainBox.x1) / 2, (melonFountainBox.y0 + melonFountainBox.y1) / 2)).toBe(true);
    expect(hitFountain(0, 0)).toBe(false);
  });

  it('forge area lies inside town', () => {
    for (const [x, y] of corners(mangoForgeBox)) {
      expect(zoneAt(x, y)).toBe('town');
      expect(inRing(pearTownWalls, x, y)).toBe(true);
    }
    expect(hitForge((mangoForgeBox.x0 + mangoForgeBox.x1) / 2, (mangoForgeBox.y0 + mangoForgeBox.y1) / 2)).toBe(true);
    expect(hitForge(0, 0)).toBe(false);
  });

  it('the two hit-areas do not overlap', () => {
    const overlapX = melonFountainBox.x0 <= mangoForgeBox.x1 && mangoForgeBox.x0 <= melonFountainBox.x1;
    const overlapY = melonFountainBox.y0 <= mangoForgeBox.y1 && mangoForgeBox.y0 <= melonFountainBox.y1;
    expect(overlapX && overlapY).toBe(false);
  });
});

describe('spawn points', () => {
  it('the town spawn point lies inside town and inside the walls, clear of the hit-areas', () => {
    expect(zoneAt(townSpawn[0], townSpawn[1])).toBe('town');
    expect(inRing(pearTownWalls, townSpawn[0], townSpawn[1])).toBe(true);
    expect(hitFountain(townSpawn[0], townSpawn[1])).toBe(false);
    expect(hitForge(townSpawn[0], townSpawn[1])).toBe(false);
    expect(townSpawnPoints[0]).toEqual(townSpawn);
  });

  it('each monster zone has at least seven spawn points inside it', () => {
    const monsterLists = {
      green: beanGreenSpawns,
      grey: pumpkinGreySpawns,
      cemetery: turnipCemeterySpawns,
    } as const;
    for (const [zone, points] of Object.entries(monsterLists)) {
      expect(points.length).toBeGreaterThanOrEqual(7);
      for (const [x, y] of points) {
        expect(zoneAt(x, y)).toBe(zone);
      }
      expect(spawnPoints[zone as keyof typeof monsterLists]).toBe(points);
    }
  });

  it('town spawn points all lie inside town', () => {
    expect(carrotTownSpawns.length).toBeGreaterThan(0);
    for (const [x, y] of carrotTownSpawns) {
      expect(zoneAt(x, y)).toBe('town');
    }
  });
});

describe('skeleton proximity', () => {
  it('is a positive whole number of pixels', () => {
    expect(Number.isInteger(skeletonRadiusPx)).toBe(true);
    expect(skeletonRadiusPx).toBeGreaterThan(0);
  });
});

function holdsPoint(a: Point, b: Point, p: Point): boolean {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t < -1e-9 || t > 1 + 1e-9) return false;
  const x = a[0] + t * dx;
  const y = a[1] + t * dy;
  return Math.hypot(x - p[0], y - p[1]) <= 1e-6;
}

// Cemetery side of the berry wall: the solid chains plus the open gate, closed
// along the top and left edges of the picture. Inside is the cemetery side.
function plumCemeterySide(): Point[] {
  const west = berryCemeteryWalls[0]!;
  const east = berryCemeteryWalls[1]!;
  const pine = berryCemeteryWalls[2]!;
  const ring: Point[] = [[0, 0], [432, 0]];
  for (let i = pine.length - 1; i >= 0; i--) ring.push(pine[i]!);
  for (let i = east.length - 1; i >= 0; i--) ring.push(east[i]!);
  ring.push(berryCemeteryGate[0]);
  for (let i = west.length - 1; i >= 0; i--) ring.push(west[i]!);
  ring.push([0, 0]);
  return ring;
}

function edgeKey(a: Point, b: Point): string {
  return `${a[0]},${a[1]}->${b[0]},${b[1]}`;
}

describe('solid walls', () => {
  it('keeps the town gate open and the rest of the pear edge solid', () => {
    expect(limeTownGate).toEqual([[444, 574], [400, 598]]);
    expect(kiwiTownPost).toEqual([[400, 598], [400, 598]]);
    const gateAt = pearTownWalls.findIndex((p) => p[0] === 444 && p[1] === 574);
    expect(pearTownWalls[gateAt + 1]).toEqual([400, 598]);
    expect(pearTownWalls[gateAt + 2]).toEqual([350, 628]);
    const gateEdge = edgeKey(limeTownGate[0], limeTownGate[1]);
    const solidKeys = guavaSolidWalls.map(([a, b]) => edgeKey(a, b));
    expect(solidKeys).not.toContain(gateEdge);
    expect(solidKeys).toContain(edgeKey([400, 598], [350, 628]));
  });

  it('blocks a segment across the town wall away from the gate', () => {
    // Vertical pear edge (600, 404) -> (600, 446), far from the south road.
    const blocked = firstSolidWallCrossing([580, 420], [620, 420]);
    expect(blocked).toEqual([600, 420]);
    // The old kiwi post sat on this line. That span is the open gate now.
    expect(firstSolidWallCrossing([405, 580], [405, 610])).toBeNull();
    // The next pear edge, (400, 598) -> (350, 628), stays solid.
    const jambA: Point = [400, 598];
    const jambB: Point = [350, 628];
    const mid: Point = [(jambA[0] + jambB[0]) / 2, (jambA[1] + jambB[1]) / 2];
    const dx = jambB[0] - jambA[0];
    const dy = jambB[1] - jambA[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    const from: Point = [mid[0] - nx * 8, mid[1] - ny * 8];
    const to: Point = [mid[0] + nx * 8, mid[1] + ny * 8];
    const jamb = firstSolidWallCrossing(from, to);
    expect(jamb).not.toBeNull();
    expect(jamb![0]).toBeCloseTo(mid[0], 3);
    expect(jamb![1]).toBeCloseTo(mid[1], 3);
    expect(firstSolidWallCrossing(to, from)).not.toBeNull();
  });

  it('opens each gate along its whole length from both sides at eight angles', () => {
    const angles = [-28, -20, -12, -4, 4, 12, 20, 28];
    const gates = [limeTownGate, berryCemeteryGate];
    const failures: string[] = [];
    for (const gate of gates) {
      const [g0, g1] = gate;
      const gx = g1[0] - g0[0];
      const gy = g1[1] - g0[1];
      const glen = Math.hypot(gx, gy);
      const tx = gx / glen;
      const ty = gy / glen;
      const nx = -ty;
      const ny = tx;
      for (const t of [0.12, 0.28, 0.44, 0.6, 0.76, 0.9]) {
        const px = g0[0] + gx * t;
        const py = g0[1] + gy * t;
        for (const side of [-1, 1]) {
          for (const deg of angles) {
            const rad = (deg * Math.PI) / 180;
            const dx = nx * Math.cos(rad) - ny * Math.sin(rad);
            const dy = nx * Math.sin(rad) + ny * Math.cos(rad);
            const reach = 16;
            const from: Point = [px - dx * side * reach, py - dy * side * reach];
            const to: Point = [px + dx * side * reach, py + dy * side * reach];
            if (!holdsPoint(from, to, [px, py])) {
              failures.push(`missed gate point t=${t} deg=${deg} side=${side}`);
              continue;
            }
            let x = from[0];
            let y = from[1];
            const dist = Math.hypot(to[0] - x, to[1] - y);
            let blocked = false;
            for (let moved = 0; moved < dist - 1e-9; ) {
              const remain = dist - moved;
              const chunk = Math.min(12, remain);
              const k = chunk / remain;
              const nxStep = x + (to[0] - x) * k;
              const nyStep = y + (to[1] - y) * k;
              if (firstSolidWallCrossing([x, y], [nxStep, nyStep]) !== null) {
                blocked = true;
                break;
              }
              x = nxStep;
              y = nyStep;
              moved += chunk;
            }
            if (blocked) {
              failures.push(`gate ${g0[0]},${g0[1]} t=${t} deg=${deg} side=${side}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('blocks every other solid edge from both sides', () => {
    const failures: string[] = [];
    for (const [a, b] of guavaSolidWalls) {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (!(len > 0)) {
        failures.push(`zero ${edgeKey(a, b)}`);
        continue;
      }
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const nx = -dy / len;
      const ny = dx / len;
      const reach = 4;
      const from: Point = [mx - nx * reach, my - ny * reach];
      const to: Point = [mx + nx * reach, my + ny * reach];
      if (firstSolidWallCrossing(from, to) === null) failures.push(`open ${edgeKey(a, b)} forward`);
      if (firstSolidWallCrossing(to, from) === null) failures.push(`open ${edgeKey(a, b)} back`);
    }
    expect(failures).toEqual([]);
  });

  it('does not block a segment through (425, 584)', () => {
    const road: readonly [Point, Point] = [[425, 560], [425, 620]];
    expect(holdsPoint(road[0], road[1], [425, 584])).toBe(true);
    expect(firstSolidWallCrossing(road[0], road[1])).toBeNull();
  });

  it('stores the cemetery wall and its open gate', () => {
    expect(berryCemeteryWalls).toEqual([
      [[0, 145], [30, 190], [50, 210], [90, 235], [150, 250], [225, 245], [295, 235], [317, 229]],
      [[365, 217], [400, 200], [450, 187], [500, 180], [530, 160], [542, 140], [542, 105]],
      [[542, 105], [548, 95], [520, 60], [470, 30], [432, 0]],
    ]);
    expect(berryCemeteryGate).toEqual([[317, 229], [365, 217]]);
  });

  it('blocks a segment across the cemetery wall away from the gate', () => {
    // West chain edge (90, 235) -> (150, 250). The road gate is farther east.
    const blocked = firstSolidWallCrossing([120, 210], [120, 270]);
    expect(blocked).not.toBeNull();
    expect(blocked![0]).toBeCloseTo(120, 5);
    expect(blocked![1]).toBeCloseTo(242.5, 5);
    // The same ray continued south meets the pear wall later. The first hit is the berry wall.
    const first = firstSolidWallCrossing([120, 180], [120, 700]);
    expect(first).not.toBeNull();
    expect(first![1]).toBeCloseTo(242.5, 5);
  });

  it('does not block a segment through (340, 222)', () => {
    const road: readonly [Point, Point] = [[340, 190], [340, 250]];
    expect(holdsPoint(road[0], road[1], [340, 222])).toBe(true);
    expect(firstSolidWallCrossing(road[0], road[1])).toBeNull();
  });

  it('puts every spawn point on its own zone side of every wall', () => {
    const plumSide = plumCemeterySide();
    expect(inRing(plumSide, 200, 80)).toBe(true);
    expect(inRing(plumSide, 200, 400)).toBe(false);
    for (const zone of Object.keys(spawnPoints) as (keyof typeof spawnPoints)[]) {
      for (const [x, y] of spawnPoints[zone]) {
        expect(inRing(pearTownWalls, x, y), `${zone} (${x},${y}) town wall`).toBe(zone === 'town');
        expect(inRing(plumSide, x, y), `${zone} (${x},${y}) cemetery wall`).toBe(zone === 'cemetery');
      }
    }
  });

  it('counts a later wall-endpoint touch and ignores a touch that is only the start', () => {
    // Pine tip (432, 0) is an endpoint of the solid pine edge (470, 30) -> (432, 0).
    // The query meets that edge only at the tip.
    expect(firstSolidWallCrossing([500, 0], [400, 0])).toEqual([432, 0]);
    expect(firstSolidWallCrossing([432, 0], [500, 0])).toBeNull();
    // Overlap along the vertical berry edge is not an endpoint-only touch.
    // The segment starts on the edge, so the first point of the overlap is the start.
    expect(firstSolidWallCrossing([542, 140], [542, 105])).toEqual([542, 140]);
  });
});
