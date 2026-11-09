import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  beanGreenSpawns,
  carrotTownSpawns,
  hitFountain,
  hitForge,
  inRing,
  melonFountainBox,
  mangoForgeBox,
  pearTownWalls,
  pumpkinGreySpawns,
  skeletonRadiusPx,
  spawnPoints,
  townSpawn,
  townSpawnPoints,
  turnipCemeterySpawns,
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
