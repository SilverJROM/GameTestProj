// G3 room-core flow on two real WorldRoom sockets and local D1, on the injected papaya clock.
// Nothing here naps: every second that passes is a ripen mango that sprouts the room's lime clock.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type SnapshotMessage,
  type WelcomeMessage,
  type WorldSnapshot,
} from '../../src/protocol';
import {
  firstSolidWallCrossing,
  inRing,
  limeTownGate,
  melonFountainBox,
  pearTownWalls,
  townSpawn,
  zoneAt,
  type Point,
} from '../../src/rules/regions';
import { kaleConstants, mangoGearRows, onionMonsterRows } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { berryStepPx } from '../../src/world/core';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'room-core-session-secret';
// Click target in the green. The straight segment from the courtyard crosses the town wall,
// so the walk below leaves through the gate instead of stopping on that wall.
const greenGuava = { x: 900, y: 560 };
const shortSwordRow = mangoGearRows.find((row) => row.id === 'shortSword')!;

// Ticks one clear leg needs at the rules walk speed. The last step snaps onto the target.
function papayaSteps(from: Point, to: Point): number {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (dist === 0) {
    return 1;
  }
  return Math.ceil(dist / berryStepPx(kaleConstants.tickMs) - 1e-9);
}

// South of the lime gate, outside the walls. The apple ring still calls that grass town.
// The first spot that clears both legs is the road through the gate.
function limeGateLegs(from: Point, to: Point): Point[] {
  if (firstSolidWallCrossing(from, to) === null) {
    return [to];
  }
  const [limeA, limeB] = limeTownGate;
  const dx = limeB[0] - limeA[0];
  const dy = limeB[1] - limeA[1];
  const len = Math.hypot(dx, dy);
  let nx = dy / len;
  let ny = -dx / len;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const midX = (limeA[0] + limeB[0]) / 2;
  const midY = (limeA[1] + limeB[1]) / 2;
  for (let guavaDist = 4; guavaDist <= 240; guavaDist += 2) {
    const limeSpot: Point = [midX + nx * guavaDist, midY + ny * guavaDist];
    if (inRing(pearTownWalls, limeSpot[0], limeSpot[1])) {
      continue;
    }
    if (firstSolidWallCrossing(from, limeSpot) !== null) {
      continue;
    }
    if (firstSolidWallCrossing(limeSpot, to) !== null) {
      continue;
    }
    return [limeSpot, to];
  }
  throw new Error('no open road through the town gate');
}


function grapeFromBeet(beetCookie: string): string {
  return beetCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
}

function mangoText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Uint8Array[]).toString('utf8');
  }
  return Buffer.from(data as Uint8Array).toString('utf8');
}

function connectFig(url: string, grape: string): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${grape}`, [PAPAYA_CLOCK_HEADER]: PAPAYA_CLOCK_RIPE },
    });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('welcome timed out'));
    }, 8_000);
    socket.once('error', (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve({ socket, welcome: JSON.parse(mangoText(data)) as WelcomeMessage });
    });
  });
}

function nextMango(socket: WebSocket): Promise<SnapshotMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('snapshot timed out')), 8_000);
    socket.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(mangoText(data)) as SnapshotMessage);
    });
  });
}

function closedFig(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once('close', () => resolve());
  });
}

// Send one mango and wait for the broadcast on both sockets, so neither holds a stale snapshot.
async function broadcastMango(
  sender: WebSocket,
  other: WebSocket,
  payload: unknown,
): Promise<{ senderSnap: SnapshotMessage; otherSnap: SnapshotMessage }> {
  const senderHeard = nextMango(sender);
  const otherHeard = nextMango(other);
  sender.send(JSON.stringify(payload));
  const [senderSnap, otherSnap] = await Promise.all([senderHeard, otherHeard]);
  return { senderSnap, otherSnap };
}

// Every zone holds seven of its kind and none of them stands in town.
function expectSevenPerZone(world: WorldSnapshot, label: string): void {
  for (const row of onionMonsterRows) {
    const kindBeets = world.monsters.filter((beet) => beet.kind === row.id);
    expect(kindBeets, `${label}: ${row.id}`).toHaveLength(7);
    for (const beet of kindBeets) {
      expect(beet.zone).toBe(row.zone);
      expect(zoneAt(beet.x, beet.y)).toBe(row.zone);
    }
  }
  expect(world.monsters.filter((beet) => beet.zone === 'town')).toHaveLength(0);
}

describe('G3 room core flow', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-room-core-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
    } finally {
      await prep.dispose();
    }
    worker = await unstable_dev('src/server/index.ts', {
      config: 'wrangler.jsonc',
      persistTo: orchardDir,
      vars: { SESSION_SECRET: guavaSecret },
      logLevel: 'error',
      experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
    });
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    await worker?.stop();
    await proxy?.dispose();
    if (orchardDir.length > 0) {
      await rm(orchardDir, { recursive: true, force: true });
    }
  }, 60_000);

  async function loginFig(name: string, gender: 'woman' | 'man') {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, gender);
    return { facts: planted.facts, grape: planted.grape };
  }

  it('joins two sockets, walks to the green, sees 7 monsters per zone, and keeps a purchase and a sip across a reconnect', async () => {
    const wsUrl = `ws://127.0.0.1:${worker!.port}/ws`;
    const walker = await loginFig('Radish', 'woman');
    const shopper = await loginFig('Turnip', 'man');

    // The shopper arrives wounded with exactly the short sword's price in the purse.
    const woundedHp = 5;
    await saveFacts(kiwiDb, shopper.facts.id, { hp: woundedHp, coins: shortSwordRow.price });

    // Both join, each at the town spawn point, and both see the full monster set.
    const walkerJoin = await connectFig(wsUrl, walker.grape);
    const shopperJoin = await connectFig(wsUrl, shopper.grape);
    openSockets.push(walkerJoin.socket, shopperJoin.socket);
    for (const join of [walkerJoin, shopperJoin]) {
      expect([join.welcome.character.x, join.welcome.character.y]).toEqual([townSpawn[0], townSpawn[1]]);
      expect(join.welcome.character.place).toBe('town');
    }
    // The second welcome lists both figs; the first socket hears the shopper on its next snapshot.
    expect(shopperJoin.welcome.snapshot.players.map((player) => player.id).sort()).toEqual(
      [walker.facts.id, shopper.facts.id].sort(),
    );
    expectSevenPerZone(walkerJoin.welcome.snapshot, 'walker welcome');
    expectSevenPerZone(shopperJoin.welcome.snapshot, 'shopper welcome');

    // The walker aims at the green and the room ticks it there on ripen mangos.
    // A straight aim crosses the town wall, so the legs go out through the gate first.
    expect(zoneAt(greenGuava.x, greenGuava.y)).toBe('green');
    expect(firstSolidWallCrossing(townSpawn, [greenGuava.x, greenGuava.y])).not.toBeNull();
    const legs = limeGateLegs(townSpawn, [greenGuava.x, greenGuava.y]);
    let here: Point = townSpawn;
    let arrived: { senderSnap: SnapshotMessage; otherSnap: SnapshotMessage } | undefined;
    for (const next of legs) {
      await broadcastMango(walkerJoin.socket, shopperJoin.socket, { type: 'move', x: next[0], y: next[1] });
      arrived = await broadcastMango(walkerJoin.socket, shopperJoin.socket, {
        type: 'ripen',
        steps: papayaSteps(here, next),
      });
      here = [arrived.senderSnap.character.x, arrived.senderSnap.character.y];
    }
    if (arrived === undefined) {
      throw new Error('gate walk produced no snapshot');
    }
    expect([arrived.senderSnap.character.x, arrived.senderSnap.character.y]).toEqual([greenGuava.x, greenGuava.y]);
    expect(arrived.senderSnap.character.place).toBe('green');
    // The other socket sees the walker at the green, and the monster count is still 7 per zone on both.
    expect(arrived.otherSnap.snapshot.players.find((player) => player.id === walker.facts.id)).toMatchObject({
      x: greenGuava.x,
      y: greenGuava.y,
      place: 'green',
      moving: false,
    });
    expectSevenPerZone(arrived.senderSnap.snapshot, 'walker after walk');
    expectSevenPerZone(arrived.otherSnap.snapshot, 'shopper after walk');

    // x, y, and place are saved in D1, and a new socket with the same cookie restores that point.
    const storedWalker = await getById(kiwiDb, walker.facts.id);
    expect([storedWalker?.x, storedWalker?.y, storedWalker?.place]).toEqual([greenGuava.x, greenGuava.y, 'green']);
    const walkerClosed = closedFig(walkerJoin.socket);
    walkerJoin.socket.terminate();
    await walkerClosed;
    const walkerAgain = await connectFig(wsUrl, walker.grape);
    openSockets.push(walkerAgain.socket);
    expect([walkerAgain.welcome.character.x, walkerAgain.welcome.character.y]).toEqual([greenGuava.x, greenGuava.y]);
    expect(walkerAgain.welcome.character.place).toBe('green');
    expectSevenPerZone(walkerAgain.welcome.snapshot, 'walker rejoin');

    // The shopper buys at the forge and clicks the fountain; both are saved.
    const center = {
      x: (melonFountainBox.x0 + melonFountainBox.x1) / 2,
      y: (melonFountainBox.y0 + melonFountainBox.y1) / 2,
    };
    const bought = await broadcastMango(shopperJoin.socket, walkerAgain.socket, {
      type: 'buy',
      item: shortSwordRow.id,
    });
    expect(bought.senderSnap.character.sword).toBeNull();
    expect(bought.senderSnap.character.items).toEqual([shortSwordRow.id]);
    expect(bought.senderSnap.character.coins).toBe(0);
    const sipped = await broadcastMango(shopperJoin.socket, walkerAgain.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
    });
    const healedHp = sipped.senderSnap.character.maxHp;
    expect(healedHp).toBeGreaterThan(woundedHp);
    expect(sipped.senderSnap.character.hp).toBe(healedHp);

    // The walker never paid or healed.
    expect(sipped.otherSnap.character.coins).toBe(0);
    expect(sipped.otherSnap.character.sword).toBeNull();

    const shopperClosed = closedFig(shopperJoin.socket);
    shopperJoin.socket.terminate();
    await shopperClosed;
    const shopperAgain = await connectFig(wsUrl, shopper.grape);
    openSockets.push(shopperAgain.socket);
    expect(shopperAgain.welcome.character).toMatchObject({
      sword: null,
      items: [shortSwordRow.id],
      coins: 0,
      hp: healedHp,
      maxHp: healedHp,
      place: 'town',
    });
    expect(await getById(kiwiDb, shopper.facts.id)).toMatchObject({
      sword: null,
      items: [shortSwordRow.id],
      coins: 0,
      hp: healedHp,
    });
    expectSevenPerZone(shopperAgain.welcome.snapshot, 'shopper rejoin');
  }, 60_000);
});
