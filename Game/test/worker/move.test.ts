// Click-to-walk. The papaya clock sprouts in the core, so these checks do not nap.
// One rules tick moves the fig at the rules walk speed. A guava past the map is clamped.
// Entering the green writes place once. The pear in D1 matches the room after the walk
// and after the lemon closes. A new lemon joins on that pear, and the other lemon sees it.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PAPAYA_CLOCK_HEADER, PAPAYA_CLOCK_RIPE, type SnapshotMessage, type WelcomeMessage } from '../../src/protocol';
import { firstSolidWallCrossing, inRing, MAP_HEIGHT, MAP_WIDTH, pearTownWalls, townSpawn, zoneAt } from '../../src/rules/regions';
import { kaleConstants, type ZoneName } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';
import {
  berryStepPx,
  createPapayaClock,
  figMoving,
  orderGuava,
  ripenDue,
  sproutApricot,
  sproutFig,
  type FigWalk,
  type PapayaOrchard,
  type PersimmonWrite,
} from '../../src/world/core';

const guavaSecret = 'guava-session-secret';
const greenGuava = { x: 900, y: 560 };



function mangoText(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data as Uint8Array[]).toString('utf8');
  }
  return Buffer.from(data as Uint8Array).toString('utf8');
}

function guavaTicks(fromX: number, fromY: number, toX: number, toY: number): number {
  const berryStep = berryStepPx(kaleConstants.tickMs);
  const dist = Math.hypot(toX - fromX, toY - fromY);
  if (dist === 0) {
    return 0;
  }
  return Math.ceil(dist / berryStep - 1e-9);
}

function freshFig(id: string, x: number, y: number, place: ZoneName): FigWalk {
  const facts: CharacterFacts = {
    id,
    name: id,
    nameKey: id,
    gender: 'woman',
    level: 1,
    xp: 0,
    hp: 70,
    maxHp: 70,
    coins: 0,
    sword: null,
    armor: null,
    place,
    x,
    y,
  };
  return sproutFig(facts);
}

function openOrchard(fig: FigWalk): { clock: ReturnType<typeof createPapayaClock>; orchard: PapayaOrchard } {
  const clock = createPapayaClock(0);
  return {
    clock,
    orchard: { clock, wateredMs: 0, figs: new Map([[fig.facts.id, fig]]) },
  };
}

function sproutTicks(orchard: PapayaOrchard, clock: ReturnType<typeof createPapayaClock>, ticks: number): PersimmonWrite[] {
  const persimmons: PersimmonWrite[] = [];
  for (let olive = 0; olive < ticks; olive += 1) {
    clock.sprout(kaleConstants.tickMs);
    const batch = ripenDue(orchard);
    expect(batch.length).toBeLessThanOrEqual(1);
    persimmons.push(...batch);
  }
  return persimmons;
}

describe('papaya clock walk', () => {
  it('moves one rules tick at the rules walk speed and reaches a green guava', () => {
    const berryStep = berryStepPx(kaleConstants.tickMs);
    expect(berryStep).toBe(12);
    expect(kaleConstants.tickMs).toBe(100);
    expect(kaleConstants.walkSpeedPxPerSec).toBe(120);

    const fig = freshFig('fig-apple', 100, 200, 'town');
    const { clock, orchard } = openOrchard(fig);
    orderGuava(fig, 100 + berryStep * 3, 200);
    const first = sproutTicks(orchard, clock, 1);
    expect(first).toHaveLength(1);
    expect(fig.facts.x).toBe(100 + berryStep);
    expect(fig.facts.y).toBe(200);
    expect(figMoving(fig)).toBe(true);
    expect(fig.apricotFacing).toBe('right');

    sproutTicks(orchard, clock, 2);
    expect(fig.facts.x).toBe(100 + berryStep * 3);
    expect(fig.facts.y).toBe(200);
    expect(figMoving(fig)).toBe(false);

    const [spawnX, spawnY] = [420, 620];
    expect(zoneAt(greenGuava.x, greenGuava.y)).toBe('green');
    const walker = freshFig('fig-kiwi', spawnX, spawnY, 'town');
    const greenClock = openOrchard(walker);
    orderGuava(walker, greenGuava.x, greenGuava.y);
    expect(walker.guavaX).toBe(greenGuava.x);
    expect(walker.guavaY).toBe(greenGuava.y);
    const expectedTicks = guavaTicks(spawnX, spawnY, greenGuava.x, greenGuava.y);
    expect(expectedTicks).toBeGreaterThan(1);

    const early = sproutTicks(greenClock.orchard, greenClock.clock, expectedTicks - 1);
    expect(figMoving(walker)).toBe(true);
    expect(walker.facts.x).not.toBe(greenGuava.x);
    const earlyPlaces = early.filter((persimmon) => persimmon.patch.place !== undefined);
    const arrived = sproutTicks(greenClock.orchard, greenClock.clock, 1);
    const placeWrites = [...early, ...arrived].filter((persimmon) => persimmon.patch.place !== undefined);
    expect(placeWrites).toHaveLength(1);
    expect(placeWrites[0]?.patch.place).toBe('green');
    expect(earlyPlaces.length).toBeLessThanOrEqual(1);
    expect(walker.facts.x).toBe(greenGuava.x);
    expect(walker.facts.y).toBe(greenGuava.y);
    expect(walker.facts.place).toBe('green');
    expect(figMoving(walker)).toBe(false);
    expect([...early, ...arrived]).toHaveLength(expectedTicks);
  });

  it('clamps an off-map guava onto the map', () => {
    const startX = 100;
    const startY = 700;
    const fig = freshFig('fig-melon', startX, startY, 'town');
    const { clock, orchard } = openOrchard(fig);
    const rawX = -80;
    const rawY = startY;
    orderGuava(fig, rawX, rawY);
    expect(fig.guavaX).toBe(0);
    expect(fig.guavaY).toBe(startY);
    expect(fig.apricotFacing).toBe('left');
    const ticks = guavaTicks(startX, startY, fig.guavaX, fig.guavaY);
    sproutTicks(orchard, clock, ticks);
    expect(fig.facts.x).toBe(0);
    expect(fig.facts.y).toBe(startY);
    expect(fig.facts.x).not.toBe(rawX);
    expect(figMoving(fig)).toBe(false);

    const far = freshFig('fig-plum', 10, 10, 'cemetery');
    orderGuava(far, MAP_WIDTH + 400, -25);
    expect(far.guavaX).toBe(MAP_WIDTH);
    expect(far.guavaY).toBe(0);
    orderGuava(far, -5, MAP_HEIGHT + 30);
    expect(far.guavaX).toBe(0);
    expect(far.guavaY).toBe(MAP_HEIGHT);
  });
});

function connectFig(
  oliveUrl: string,
  grapeValue: string,
): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(oliveUrl, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        [PAPAYA_CLOCK_HEADER]: PAPAYA_CLOCK_RIPE,
      },
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

function waitForClose(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fig socket stayed open')), 8_000);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

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

async function countN(db: CharacterDb, table: 'place_touches' | 'fig_writes', figId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE fig_id = ?`)
    .bind(figId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

describe('solid walls stop a walking fig', () => {
  function walk(fig: FigWalk, x: number, y: number): void {
    const { clock, orchard } = openOrchard(fig);
    orderGuava(fig, x, y);
    sproutTicks(orchard, clock, 200);
  }

  it('stops a courtyard fig at the town wall', () => {
    const fig = freshFig('fig-wall-town', 300, 450, 'town');
    const hit = firstSolidWallCrossing([300, 450], [700, 450]);
    expect(hit).not.toBeNull();
    walk(fig, 700, 450);
    // The wall is sloped, so the fig slides along it and then stops. It never reaches the far side.
    expect(fig.facts.x).not.toBe(700);
    expect(fig.facts.y).not.toBe(450);
    expect(inRing(pearTownWalls, fig.facts.x, fig.facts.y)).toBe(true);
    expect(figMoving(fig)).toBe(false);
    expect(firstSolidWallCrossing([300, 450], [fig.facts.x, fig.facts.y])).toBeNull();
  });

  it('lets a fig leave through the town gate', () => {
    const fig = freshFig('fig-gate-town', 430, 540, 'town');
    walk(fig, 410, 593 + 20);
    expect(fig.facts.x).toBeCloseTo(410, 5);
    expect(fig.facts.y).toBeCloseTo(613, 5);
  });

  it('stops a cemetery fig at the cemetery wall', () => {
    const fig = freshFig('fig-wall-cem', 200, 150, 'cemetery');
    const targetY = 300;
    const hit = firstSolidWallCrossing([200, 150], [200, targetY]);
    expect(hit).not.toBeNull();
    walk(fig, 200, targetY);
    expect(Math.abs(fig.facts.x - hit![0])).toBeLessThanOrEqual(1);
    expect(Math.abs(fig.facts.y - hit![1])).toBeLessThanOrEqual(1);
    expect(fig.facts.y).toBeLessThan(hit![1]);
    expect(firstSolidWallCrossing([200, 150], [fig.facts.x, fig.facts.y])).toBeNull();
  });

  it('lets a cemetery fig through the cemetery gate', () => {
    const fig = freshFig('fig-gate-cem', 340, 150, 'cemetery');
    walk(fig, 340, 222 + 20);
    expect(fig.facts.x).toBeCloseTo(340, 5);
    expect(fig.facts.y).toBeCloseTo(242, 5);
  });
});

describe('lemon click-to-walk on the worker', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-walk-'));
    const v3Path = path.join(orchardDir, 'v3');

    const prep = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
      const grapeStatements = [
        'CREATE TABLE IF NOT EXISTS place_touches (n INTEGER PRIMARY KEY AUTOINCREMENT, fig_id TEXT NOT NULL, place TEXT NOT NULL)',
        'CREATE TRIGGER IF NOT EXISTS place_touch AFTER UPDATE OF place ON characters BEGIN INSERT INTO place_touches (fig_id, place) VALUES (NEW.id, NEW.place); END',
        'CREATE TABLE IF NOT EXISTS fig_writes (n INTEGER PRIMARY KEY AUTOINCREMENT, fig_id TEXT NOT NULL)',
        'CREATE TRIGGER IF NOT EXISTS fig_write AFTER UPDATE ON characters BEGIN INSERT INTO fig_writes (fig_id) VALUES (NEW.id); END',
      ].map((statement) => prepDb.prepare(statement));
      await (prepDb as unknown as { batch(statements: unknown[]): Promise<unknown> }).batch(grapeStatements);
    } finally {
      await prep.dispose();
    }

    worker = await unstable_dev('src/server/index.ts', {
      config: 'wrangler.jsonc',
      persistTo: orchardDir,
      vars: { SESSION_SECRET: guavaSecret },
      logLevel: 'error',
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
      },
    });

    proxy = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
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

  it('walks a fig onto a green guava, clamps an off-map guava, and restores the pear', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    async function postFig(name: string, gender: 'woman' | 'man'): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, gender);
      return { facts: planted.facts, grape: planted.grape };
    }

    const ada = await postFig('Cora', 'woman');
    const bea = await postFig('Dale', 'man');
    // The town spawn sits inside the walls, so start both figs on open ground south of the town.
    const openStart: readonly [number, number] = [420, 700];
    for (const fig of [ada, bea]) {
      await kiwiDb
        .prepare('UPDATE characters SET x = ?, y = ? WHERE id = ?')
        .bind(openStart[0], openStart[1], fig.facts.id)
        .run();
    }
    const setupWrites = await countN(kiwiDb, 'fig_writes', ada.facts.id);
    const berryStep = berryStepPx(kaleConstants.tickMs);
    expect(berryStep).toBe(12);
    expect(zoneAt(greenGuava.x, greenGuava.y)).toBe('green');
    const expectedTicks = guavaTicks(openStart[0], openStart[1], greenGuava.x, greenGuava.y);
    expect(expectedTicks).toBeGreaterThan(2);

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const adaJoin = await connectFig(wsUrl, ada.grape);
    const beaJoin = await connectFig(wsUrl, bea.grape);
    openSockets.push(adaJoin.socket, beaJoin.socket);

    expect([adaJoin.welcome.character.x, adaJoin.welcome.character.y]).toEqual([openStart[0], openStart[1]]);
    expect(adaJoin.welcome.character.place).toBe('town');
    const adaStart = adaJoin.welcome.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(adaStart).toMatchObject({
      x: openStart[0],
      y: openStart[1],
      facing: sproutApricot,
      moving: false,
      place: 'town',
    });

    const aimed = await broadcastMango(adaJoin.socket, beaJoin.socket, {
      type: 'move',
      x: greenGuava.x,
      y: greenGuava.y,
      id: bea.facts.id,
      characterId: bea.facts.id,
      character_id: bea.facts.id,
    });
    expect(aimed.senderSnap.character.id).toBe(ada.facts.id);
    expect(aimed.senderSnap.character.id).not.toBe(bea.facts.id);
    const adaAimed = aimed.senderSnap.snapshot.players.find((player) => player.id === ada.facts.id);
    const beaAimed = aimed.otherSnap.snapshot.players.find((player) => player.id === bea.facts.id);
    expect(adaAimed).toMatchObject({
      x: openStart[0],
      y: openStart[1],
      facing: 'right',
      moving: true,
      place: 'town',
    });
    expect(beaAimed).toMatchObject({
      x: openStart[0],
      y: openStart[1],
      moving: false,
      place: 'town',
    });

    const firstTick = await broadcastMango(adaJoin.socket, beaJoin.socket, { type: 'ripen', steps: 1 });
    const adaFirst = firstTick.senderSnap.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(adaFirst).toBeDefined();
    const moved = Math.hypot((adaFirst?.x ?? 0) - openStart[0], (adaFirst?.y ?? 0) - openStart[1]);
    expect(moved).toBeCloseTo(berryStep, 6);
    expect(adaFirst).toMatchObject({ moving: true, place: 'town', facing: 'right' });
    expect(await countN(kiwiDb, 'place_touches', ada.facts.id)).toBe(0);
    expect(await countN(kiwiDb, 'fig_writes', ada.facts.id)).toBe(setupWrites + 1);

    const almost = await broadcastMango(adaJoin.socket, beaJoin.socket, {
      type: 'ripen',
      steps: expectedTicks - 2,
      id: bea.facts.id,
    });
    const adaAlmost = almost.senderSnap.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(adaAlmost?.moving).toBe(true);
    expect(adaAlmost?.x).not.toBe(greenGuava.x);

    const landed = await broadcastMango(adaJoin.socket, beaJoin.socket, { type: 'ripen', steps: 1 });
    const adaLanded = landed.senderSnap.snapshot.players.find((player) => player.id === ada.facts.id);
    const beaSeesAda = landed.otherSnap.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(adaLanded).toMatchObject({
      x: greenGuava.x,
      y: greenGuava.y,
      facing: 'right',
      moving: false,
      place: 'green',
    });
    expect(beaSeesAda).toEqual(adaLanded);
    expect(landed.senderSnap.character.x).toBe(greenGuava.x);
    expect(landed.senderSnap.character.y).toBe(greenGuava.y);
    expect(landed.senderSnap.character.place).toBe('green');
    expect(landed.otherSnap.character.id).toBe(bea.facts.id);
    expect([landed.otherSnap.character.x, landed.otherSnap.character.y]).toEqual([openStart[0], openStart[1]]);

    const stored = await getById(kiwiDb, ada.facts.id);
    expect(stored?.x).toBe(greenGuava.x);
    expect(stored?.y).toBe(greenGuava.y);
    expect(stored?.place).toBe('green');
    expect(await countN(kiwiDb, 'place_touches', ada.facts.id)).toBe(1);
    expect(await countN(kiwiDb, 'fig_writes', ada.facts.id)).toBe(setupWrites + expectedTicks);
    expect(await getById(kiwiDb, bea.facts.id)).toMatchObject({
      x: openStart[0],
      y: openStart[1],
      place: 'town',
    });

    const closed = waitForClose(adaJoin.socket);
    adaJoin.socket.terminate();
    await closed;
    const afterClose = await getById(kiwiDb, ada.facts.id);
    expect([afterClose?.x, afterClose?.y]).toEqual([greenGuava.x, greenGuava.y]);
    expect(afterClose?.place).toBe('green');
    expect(await countN(kiwiDb, 'place_touches', ada.facts.id)).toBe(1);

    const adaAgain = await connectFig(wsUrl, ada.grape);
    openSockets.push(adaAgain.socket);
    expect([adaAgain.welcome.character.x, adaAgain.welcome.character.y]).toEqual([greenGuava.x, greenGuava.y]);
    expect(adaAgain.welcome.character.place).toBe('green');
    expect(adaAgain.welcome.character).toEqual(afterClose);
    const rejoined = adaAgain.welcome.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(rejoined).toMatchObject({
      x: greenGuava.x,
      y: greenGuava.y,
      moving: false,
      place: 'green',
    });

    const beaHeard = nextMango(beaJoin.socket);
    beaJoin.socket.send(JSON.stringify({ type: 'ping', id: ada.facts.id }));
    const beaPing = await beaHeard;
    const beaStillSees = beaPing.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(beaStillSees).toMatchObject({
      x: greenGuava.x,
      y: greenGuava.y,
      moving: false,
      place: 'green',
    });

    const rawX = -80;
    const rawY = openStart[1];
    expect(rawX < 0).toBe(true);
    const clampedX = 0;
    const clampedY = openStart[1];
    const clampTicks = guavaTicks(openStart[0], openStart[1], clampedX, clampedY);
    const clampAim = await broadcastMango(beaJoin.socket, adaAgain.socket, {
      type: 'move',
      x: rawX,
      y: rawY,
      id: ada.facts.id,
      characterId: ada.facts.id,
    });
    const beaAim = clampAim.senderSnap.snapshot.players.find((player) => player.id === bea.facts.id);
    expect(beaAim).toMatchObject({
      x: openStart[0],
      y: openStart[1],
      facing: 'left',
      moving: true,
    });
    const clampLanded = await broadcastMango(beaJoin.socket, adaAgain.socket, { type: 'ripen', steps: clampTicks });
    const beaLanded = clampLanded.senderSnap.snapshot.players.find((player) => player.id === bea.facts.id);
    const adaSeesBea = clampLanded.otherSnap.snapshot.players.find((player) => player.id === bea.facts.id);
    expect(beaLanded).toMatchObject({
      x: clampedX,
      y: clampedY,
      facing: 'left',
      moving: false,
    });
    expect(beaLanded?.x).not.toBe(rawX);
    expect(adaSeesBea).toEqual(beaLanded);
    const beaRow = await getById(kiwiDb, bea.facts.id);
    expect([beaRow?.x, beaRow?.y]).toEqual([clampedX, clampedY]);
    const adaRow = await getById(kiwiDb, ada.facts.id);
    expect([adaRow?.x, adaRow?.y]).toEqual([greenGuava.x, greenGuava.y]);
    expect(adaRow?.place).toBe('green');
    expect(await countN(kiwiDb, 'place_touches', ada.facts.id)).toBe(1);
  }, 60_000);
});
