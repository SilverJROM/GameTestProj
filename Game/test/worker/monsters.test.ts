// Seven beets per zone. A fresh cabbage holds 7 wolves on the green, 7 bears on the grey,
// and 7 skeletons in the cemetery. Town stays empty. Each beet stands on a leek from the regions module.
// A pruned beet sprouts again after the rules respawn delay, on a different leek in the same zone.
// The lime clock is injected. This file does not sleep for that delay.
// The cabbage bed is stored on the Durable Object and comes back after the lemon restarts.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type MonsterSnapshot,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { firstSolidWallCrossing, spawnPoints, zoneAt } from '../../src/rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings, type ZoneName } from '../../src/rules/tables';
import { figSeesBeet } from '../../src/rules/view';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import type { CharacterDb, CharacterFacts } from '../../src/server/db';
import { createPapayaClock, sproutFig, type FigWalk } from '../../src/world/core';
import { stepAggro } from '../../src/world/combat';
import { hurtBeet, plantCabbage, pruneBeet, readCabbage, sproutYams, yamDueMs, type Beet, type CabbageBed } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'guava-session-secret';


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

function beetLabel(beet: { id: string; kind: string; zone: string; x: number; y: number; hp: number }): string {
  return `${beet.kind}|${beet.id}|${beet.zone}|${beet.x}|${beet.y}|${beet.hp}`;
}

function sortedBeets(beets: readonly { id: string; kind: string; zone: string; x: number; y: number; hp: number }[]): string[] {
  return beets.map((beet) => beetLabel(beet)).sort();
}

function herdOf(beets: readonly MonsterSnapshot[] | readonly Beet[], kind: string): MonsterSnapshot[] {
  return beets.filter((beet) => beet.kind === kind) as MonsterSnapshot[];
}

function beetIds(beets: readonly { id: string }[]): string[] {
  return beets.map((beet) => beet.id).sort();
}

// A living herd: seven of each kind, each in its own zone. A fresh plant is also standing on a leek.
function expectHerd(beets: readonly MonsterSnapshot[] | readonly Beet[]): void {
  expect(beets.some((beet) => beet.zone === 'town')).toBe(false);
  expect(beets.some((beet) => zoneAt(beet.x, beet.y) === 'town')).toBe(false);
  expect(beets).toHaveLength(onionMonsterRows.reduce((sum, row) => sum + row.count, 0));
  for (const row of onionMonsterRows) {
    const patch = herdOf(beets, row.id);
    expect(patch).toHaveLength(row.count);
    for (const beet of patch) {
      expect(beet.zone).toBe(row.zone);
      expect(beet.hp).toBe(row.hp);
      expect(zoneAt(beet.x, beet.y)).toBe(row.zone);
    }
  }
}

function expectFreshCabbage(beets: readonly MonsterSnapshot[] | readonly Beet[]): void {
  expect(beets.some((beet) => beet.zone === 'town')).toBe(false);
  expect(beets.some((beet) => zoneAt(beet.x, beet.y) === 'town')).toBe(false);
  expect(beets).toHaveLength(onionMonsterRows.reduce((sum, row) => sum + row.count, 0));
  for (const row of onionMonsterRows) {
    expect(row.count).toBe(7);
    const patch = herdOf(beets, row.id);
    expect(patch).toHaveLength(7);
    for (const beet of patch) {
      expect(beet.zone).toBe(row.zone);
      expect(beet.hp).toBe(row.hp);
      expect(beet.kind).toBe(row.id);
      expect(zoneAt(beet.x, beet.y)).toBe(row.zone);
      const leeks = spawnPoints[row.zone];
      expect(leeks.some(([x, y]) => x === beet.x && y === beet.y)).toBe(true);
    }
  }
  const kinds = new Set(beets.map((beet) => beet.kind));
  expect(kinds).toEqual(new Set(['wolf', 'bear', 'skeleton']));
}

describe('cabbage sprout on an injected lime', () => {
  it('plants seven of each kind and sprouts a pruned beet at the rules delay on a new leek', () => {
    const first = plantCabbage();
    expect(plantCabbage()).toEqual(first);
    expectFreshCabbage(first.beets);

    const lime = createPapayaClock(0);
    const victim = first.beets.find((beet) => beet.kind === 'wolf');
    expect(victim).toBeDefined();
    if (victim === undefined) {
      return;
    }
    const pruned = pruneBeet(first, victim.id, lime.nowMs());
    expect(pruned).not.toBe(first);
    expect(herdOf(pruned.beets, 'wolf')).toHaveLength(6);
    expect(pruned.yams).toHaveLength(1);
    expect(pruned.yams[0]?.dueMs).toBe(yamDueMs(lime.nowMs()));
    expect(pruned.yams[0]?.dueMs).toBe(lime.nowMs() + pearTimings.respawnSeconds * 1000);
    expect(pruneBeet(pruned, 'missing-radish', lime.nowMs())).toBe(pruned);

    lime.sprout(pearTimings.respawnSeconds * 1000 - 1);
    const early = sproutYams(pruned, lime.nowMs());
    expect(early).toBe(pruned);
    expect(herdOf(early.beets, 'wolf')).toHaveLength(6);

    lime.sprout(1);
    const ripe = sproutYams(pruned, lime.nowMs());
    expect(herdOf(ripe.beets, 'wolf')).toHaveLength(7);
    const born = ripe.beets.find((beet) => beet.kind === 'wolf' && !pruned.beets.some((old) => old.id === beet.id));
    expect(born).toBeDefined();
    if (born === undefined) {
      return;
    }
    expect(born.id).not.toBe(victim.id);
    expect(born.zone).toBe('green');
    expect(born.zone).toBe(victim.zone);
    // The seven leeks stay in use: the newcomer takes the leek no living wolf owns (its own, once its owner is gone).
    expect(new Set(ripe.beets.filter((beet) => beet.kind === 'wolf').map((beet) => beet.spawnIndex)).size).toBe(7);
    expect(spawnPoints.green.some(([x, y]) => x === born.x && y === born.y)).toBe(true);
    expect(zoneAt(born.x, born.y)).toBe('green');
    for (const kept of pruned.beets) {
      expect(ripe.beets.find((beet) => beet.id === kept.id)).toEqual(kept);
    }

    const bear = first.beets.find((beet) => beet.kind === 'bear');
    expect(bear).toBeDefined();
    if (bear === undefined) {
      return;
    }
    const bearBed = pruneBeet(first, bear.id, 0);
    const bearEarly = sproutYams(bearBed, yamDueMs(0) - 1);
    expect(herdOf(bearEarly.beets, 'bear')).toHaveLength(6);
    const bearRipe = sproutYams(bearBed, yamDueMs(0));
    expect(herdOf(bearRipe.beets, 'bear')).toHaveLength(7);
    const bornBear = bearRipe.beets.find((beet) => beet.kind === 'bear' && !bearBed.beets.some((old) => old.id === beet.id));
    expect(bornBear).toBeDefined();
    expect(bornBear?.zone).toBe('grey');
    // The bear comes back on its own free leek (seven leeks stay in use).
    expect(bornBear !== undefined).toBe(true);
    expect(spawnPoints.grey.some(([x, y]) => x === bornBear?.x && y === bornBear?.y)).toBe(true);

    const skeleton = first.beets.find((beet) => beet.kind === 'skeleton');
    expect(skeleton).toBeDefined();
    if (skeleton === undefined) {
      return;
    }
    const boneBed = pruneBeet(first, skeleton.id, 0);
    const boneRipe = sproutYams(boneBed, yamDueMs(0));
    const bornBone = boneRipe.beets.find(
      (beet) => beet.kind === 'skeleton' && !boneBed.beets.some((old) => old.id === beet.id),
    );
    expect(bornBone?.zone).toBe('cemetery');
    expect(bornBone !== undefined).toBe(true);
    expect(zoneAt(bornBone?.x ?? -1, bornBone?.y ?? -1)).toBe('cemetery');
    expect(herdOf(boneRipe.beets, 'skeleton')).toHaveLength(7);
  });
});

function connectFig(
  oliveUrl: string,
  grapeValue: string,
  melonHeaders: Record<string, string> = {
    [PAPAYA_CLOCK_HEADER]: PAPAYA_CLOCK_RIPE,
  },
): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(oliveUrl, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        ...melonHeaders,
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

function bootLemon(orchardDir: string): Promise<Unstable_DevWorker> {
  return unstable_dev('src/server/index.ts', {
    config: 'wrangler.jsonc',
    persistTo: orchardDir,
    vars: { SESSION_SECRET: guavaSecret, ALLOW_TEST_CLOCK: '1' },
    logLevel: 'error',
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
    },
  });
}

describe('lemon room cabbage', () => {
  let worker: Unstable_DevWorker | undefined;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-cabbage-'));
    const v3Path = path.join(orchardDir, 'v3');

    const prep = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
    } finally {
      await prep.dispose();
    }

    worker = await bootLemon(orchardDir);
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    await worker?.stop();
    if (orchardDir.length > 0) {
      await rm(orchardDir, { recursive: true, force: true });
    }
  }, 60_000);

  it('keeps seven beets per zone, sprouts a pruned beet at 5 seconds, and restores the bed', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    async function postFig(name: string, gender: 'woman' | 'man'): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, gender);
      return { facts: planted.facts, grape: planted.grape };
    }

    const fern = await postFig('Fern', 'woman');
    const basil = await postFig('Basil', 'man');
    const yamMs = pearTimings.respawnSeconds * 1000;
    const earlyTicks = Math.floor((yamMs - 1) / kaleConstants.tickMs);
    expect(earlyTicks).toBeGreaterThan(0);
    expect(earlyTicks * kaleConstants.tickMs).toBeLessThan(yamMs);
    expect((earlyTicks + 1) * kaleConstants.tickMs).toBeGreaterThanOrEqual(yamMs);
    expect(yamMs).toBe(pearTimings.respawnSeconds * 1000);

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const plainJoin = await connectFig(wsUrl, fern.grape, {});
    openSockets.push(plainJoin.socket);
    const plainVictim = plainJoin.welcome.snapshot.monsters.find((beet) => beet.kind === 'wolf');
    expect(plainVictim).toBeDefined();
    if (plainVictim !== undefined) {
      const plainHeard = nextMango(plainJoin.socket);
      plainJoin.socket.send(JSON.stringify({ type: 'prune', beetId: plainVictim.id }));
      const plainSnap = await plainHeard;
      expect(herdOf(plainSnap.snapshot.monsters, 'wolf')).toHaveLength(7);
      expect(plainSnap.snapshot.monsters.some((beet) => beet.id === plainVictim.id)).toBe(true);
    }
    const plainClosed = waitForClose(plainJoin.socket);
    plainJoin.socket.terminate();
    await plainClosed;

    const fernJoin = await connectFig(wsUrl, fern.grape);
    const basilJoin = await connectFig(wsUrl, basil.grape);
    openSockets.push(fernJoin.socket, basilJoin.socket);

    expect(fernJoin.welcome.type).toBe('welcome');
    expect([fernJoin.welcome.character.x, fernJoin.welcome.character.y]).toEqual([
      fern.facts.x,
      fern.facts.y,
    ]);
    expectHerd(fernJoin.welcome.snapshot.monsters);
    expectHerd(basilJoin.welcome.snapshot.monsters);
    expect(sortedBeets(basilJoin.welcome.snapshot.monsters)).toEqual(sortedBeets(fernJoin.welcome.snapshot.monsters));

    const zones = new Set(fernJoin.welcome.snapshot.monsters.map((beet) => beet.zone));
    expect(zones).toEqual(new Set<ZoneName>(['green', 'grey', 'cemetery']));

    const victim = fernJoin.welcome.snapshot.monsters.find((beet) => beet.kind === 'wolf');
    expect(victim).toBeDefined();
    if (victim === undefined) {
      return;
    }
    const freshLabels = sortedBeets(fernJoin.welcome.snapshot.monsters);

    const pruned = await broadcastMango(fernJoin.socket, basilJoin.socket, {
      type: 'prune',
      beetId: victim.id,
      id: basil.facts.id,
      characterId: basil.facts.id,
    });
    expect(pruned.senderSnap.character.id).toBe(fern.facts.id);
    expect(herdOf(pruned.senderSnap.snapshot.monsters, 'wolf')).toHaveLength(6);
    expect(pruned.senderSnap.snapshot.monsters.some((beet) => beet.id === victim.id)).toBe(false);
    expect(sortedBeets(pruned.otherSnap.snapshot.monsters)).toEqual(sortedBeets(pruned.senderSnap.snapshot.monsters));
    expect(herdOf(pruned.senderSnap.snapshot.monsters, 'bear')).toHaveLength(7);
    expect(herdOf(pruned.senderSnap.snapshot.monsters, 'skeleton')).toHaveLength(7);
    const prunedLabels = sortedBeets(pruned.senderSnap.snapshot.monsters);
    expect(prunedLabels).not.toEqual(freshLabels);

    const early = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: earlyTicks });
    expect(herdOf(early.senderSnap.snapshot.monsters, 'wolf')).toHaveLength(6);
    expect(early.senderSnap.snapshot.monsters.some((beet) => beet.id === victim.id)).toBe(false);
    expect(beetIds(early.senderSnap.snapshot.monsters)).toEqual(beetIds(pruned.senderSnap.snapshot.monsters));
    expect(sortedBeets(early.otherSnap.snapshot.monsters)).toEqual(sortedBeets(early.senderSnap.snapshot.monsters));
    for (const kept of pruned.senderSnap.snapshot.monsters) {
      const still = early.senderSnap.snapshot.monsters.find((beet) => beet.id === kept.id)!;
      expect(still.kind).toBe(kept.kind);
      expect(still.zone).toBe(kept.zone);
      expect(still.hp).toBe(kept.hp);
    }

    const ripe = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: 1 });
    expect(herdOf(ripe.senderSnap.snapshot.monsters, 'wolf')).toHaveLength(7);
    expect(herdOf(ripe.senderSnap.snapshot.monsters, 'bear')).toHaveLength(7);
    expect(herdOf(ripe.senderSnap.snapshot.monsters, 'skeleton')).toHaveLength(7);
    expect(ripe.senderSnap.snapshot.monsters).toHaveLength(21);
    expect(ripe.senderSnap.snapshot.monsters.some((beet) => beet.zone === 'town')).toBe(false);
    const born = ripe.senderSnap.snapshot.monsters.find(
      (beet) => beet.kind === 'wolf' && !pruned.senderSnap.snapshot.monsters.some((old) => old.id === beet.id),
    );
    expect(born).toBeDefined();
    if (born === undefined) {
      return;
    }
    expect(born.id).not.toBe(victim.id);
    expect(born.zone).toBe('green');
    expect(born.zone).toBe(victim.zone);
    expect(born.kind).toBe(victim.kind);
    expect(new Set(herdOf(ripe.senderSnap.snapshot.monsters, 'wolf').map((beet) => `${Math.round(beet.x)},${Math.round(beet.y)}`)).size).toBe(7);
    expect(spawnPoints.green.some(([x, y]) => x === born.x && y === born.y)).toBe(true);
    expect(zoneAt(born.x, born.y)).toBe('green');
    expect(born.hp).toBe(onionMonsterRows.find((row) => row.id === 'wolf')?.hp);
    for (const kept of pruned.senderSnap.snapshot.monsters) {
      const still = ripe.senderSnap.snapshot.monsters.find((beet) => beet.id === kept.id)!;
      expect(still.kind).toBe(kept.kind);
      expect(still.zone).toBe(kept.zone);
      expect(still.hp).toBe(kept.hp);
    }
    expect(sortedBeets(ripe.otherSnap.snapshot.monsters)).toEqual(sortedBeets(ripe.senderSnap.snapshot.monsters));
    const living = sortedBeets(ripe.senderSnap.snapshot.monsters);
    expect(living).not.toEqual(freshLabels);
    expect(living).not.toEqual(prunedLabels);

    const fernClosed = waitForClose(fernJoin.socket);
    const basilClosed = waitForClose(basilJoin.socket);
    fernJoin.socket.terminate();
    basilJoin.socket.terminate();
    await Promise.all([fernClosed, basilClosed]);

    const retired = worker;
    worker = undefined;
    await retired.stop();
    worker = await bootLemon(orchardDir);

    const againUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const fernAgain = await connectFig(againUrl, fern.grape);
    openSockets.push(fernAgain.socket);
    expect(fernAgain.welcome.type).toBe('welcome');
    expect(fernAgain.welcome.character.id).toBe(fern.facts.id);
    expect([fernAgain.welcome.character.x, fernAgain.welcome.character.y]).toEqual([fern.facts.x, fern.facts.y]);
    expectHerd(fernAgain.welcome.snapshot.monsters);
    expect(sortedBeets(fernAgain.welcome.snapshot.monsters)).toEqual(living);
    expect(fernAgain.welcome.snapshot.monsters.find((beet) => beet.id === born.id)).toEqual(born);
    expect(fernAgain.welcome.snapshot.monsters.some((beet) => beet.id === victim.id)).toBe(false);
  }, 120_000);
});

// A connected fig standing still. Place and feet both matter: the zone, and the widest window around the feet.
function figAt(x: number, y: number, place: ZoneName): FigWalk {
  return sproutFig({
    id: `fig-${place}`,
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
    place,
    x,
    y,
  });
}

function figIn(place: ZoneName): FigWalk {
  return figAt(640, 360, place);
}

// Step the bed this many whole ticks. Every beet position is recorded on every tick.
function walkBed(bed: CabbageBed, figs: ReadonlyMap<string, FigWalk>, ticks: number) {
  const trail = new Map<string, Array<readonly [number, number]>>();
  for (const beet of bed.beets) {
    trail.set(beet.id, [[beet.x, beet.y]]);
  }
  let now = 0;
  let current = bed;
  let stored = false;
  for (let tick = 0; tick < ticks; tick += 1) {
    now += kaleConstants.tickMs;
    const stepped = stepAggro(current, figs, kaleConstants.tickMs, now);
    stored = stored || stepped.changed;
    current = stepped.bed;
    for (const beet of current.beets) {
      trail.get(beet.id)!.push([beet.x, beet.y]);
    }
  }
  return { bed: current, trail, stored };
}

describe('cabbage patrol on the rules tick', () => {
  const green = new Map([['fig-green', figIn('green')]]);

  it('walks the wolves the same way twice, inside the green, through no wall, with no storage write', () => {
    const first = walkBed(plantCabbage(), green, 10_000);
    const second = walkBed(plantCabbage(), green, 10_000);
    const wolves = plantCabbage().beets.filter((beet) => beet.kind === 'wolf');
    expect(wolves).toHaveLength(7);
    let walked = 0;
    for (const wolf of wolves) {
      const path = first.trail.get(wolf.id)!;
      expect(path).toEqual(second.trail.get(wolf.id)!);
      const stepPx = (kaleConstants.monsterPatrolSpeedPxPerSec * kaleConstants.tickMs) / 1000;
      for (let tick = 1; tick < path.length; tick += 1) {
        const [x, y] = path[tick]!;
        const [fromX, fromY] = path[tick - 1]!;
        expect(zoneAt(x, y)).toBe('green');
        expect(firstSolidWallCrossing([fromX, fromY], [x, y])).toBeNull();
        expect(Math.hypot(x - fromX, y - fromY)).toBeLessThanOrEqual(stepPx + 1e-6);
        if (x !== fromX || y !== fromY) {
          walked += 1;
        }
      }
    }
    expect(walked).toBeGreaterThan(0);
    // Patrol alone is never a storage event.
    expect(first.stored).toBe(false);
    // A beet outside the green and outside this fig's window stays on its leek. One inside the window walks.
    // Monsters now spread over the whole zones, so a fig in the middle of the green sees every one of them. A fig in
    // the south-east corner of the green still has the far cemetery monsters outside its window.
    const fig = figAt(1200, 650, 'green');
    const cornerWalk = walkBed(plantCabbage(), new Map([['fig-green', fig]]), 2_000);
    let seenOther = 0;
    let hiddenOther = 0;
    for (const beet of cornerWalk.bed.beets.filter((candidate) => candidate.kind !== 'wolf')) {
      const start = plantCabbage().beets.find((candidate) => candidate.id === beet.id)!;
      const seen = figSeesBeet(fig.facts.place, fig.facts.x, fig.facts.y, start.x, start.y);
      if (seen) {
        seenOther += 1;
        expect([beet.x, beet.y]).not.toEqual([start.x, start.y]);
      } else {
        hiddenOther += 1;
        expect([beet.x, beet.y]).toEqual([start.x, start.y]);
      }
    }
    expect(seenOther).toBeGreaterThan(0);
    expect(hiddenOther).toBeGreaterThan(0);
  }, 60_000);

  it('moves nothing with no fig connected, and only on-screen beets for a fig in town', () => {
    const none = walkBed(plantCabbage(), new Map(), 50);
    expect(none.bed).toEqual(plantCabbage());
    const fig = figIn('town');
    const town = walkBed(plantCabbage(), new Map([['fig-town', fig]]), 40);
    let seen = 0;
    let hidden = 0;
    for (const start of plantCabbage().beets) {
      const later = town.bed.beets.find((beet) => beet.id === start.id)!;
      const watched = figSeesBeet(fig.facts.place, fig.facts.x, fig.facts.y, start.x, start.y);
      if (watched) {
        seen += 1;
        expect(later.x !== start.x || later.y !== start.y).toBe(true);
      } else {
        hidden += 1;
        expect([later.x, later.y]).toEqual([start.x, start.y]);
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(hidden).toBeGreaterThan(0);
  });

  it('keeps the green herd and the cemetery herd walking when a fig stands in each', () => {
    const figs = new Map<string, FigWalk>([
      ['fig-green', figAt(640, 360, 'green')],
      // East of the graves, past the skeleton wake radius, so that herd patrols.
      ['fig-cemetery', figAt(535, 130, 'cemetery')],
    ]);
    const before = plantCabbage();
    const walked = walkBed(before, figs, 40);
    for (const beet of before.beets) {
      if (beet.zone !== 'green' && beet.zone !== 'cemetery') continue;
      const later = walked.bed.beets.find((candidate) => candidate.id === beet.id)!;
      expect(later.x !== beet.x || later.y !== beet.y, beet.id).toBe(true);
    }
  });

  it('drops one seed per kill, worth that row’s coins, for a wolf, a bear, and a skeleton', () => {
    let bed = plantCabbage();
    const killer = 'fig-killer';
    for (const row of onionMonsterRows) {
      const beet = bed.beets.find((candidate) => candidate.kind === row.id)!;
      const before = bed.seeds.length;
      const hit = hurtBeet(bed, beet.id, beet.hp, killer, 1_000);
      expect(hit.felled).toBe(true);
      bed = hit.bed;
      const added = bed.seeds.slice(before);
      expect(added).toHaveLength(1);
      expect(added[0]).toMatchObject({ ownerId: killer, x: beet.x, y: beet.y, value: row.coins });
    }
    expect(bed.seeds).toHaveLength(onionMonsterRows.length);
  });

  it('reads a stored seed that has no value as one coin', () => {
    const fresh = plantCabbage();
    const wolf = fresh.beets.find((beet) => beet.kind === 'wolf')!;
    const wolfCoins = onionMonsterRows.find((row) => row.id === 'wolf')!.coins;
    const felled = hurtBeet(fresh, wolf.id, wolf.hp, 'fig-killer', 0).bed;
    expect(readCabbage(felled)!.seeds[0]!.value).toBe(wolfCoins);
    const stored = JSON.parse(JSON.stringify(felled)) as { seeds: Array<Record<string, unknown>> };
    delete stored.seeds[0]!.value;
    const read = readCabbage(stored);
    expect(read).not.toBeNull();
    expect(read!.seeds).toHaveLength(1);
    expect(read!.seeds[0]).toMatchObject({
      id: felled.seeds[0]!.id,
      ownerId: 'fig-killer',
      x: wolf.x,
      y: wolf.y,
      value: 1,
    });
  });

  it('reads a stored beet that lacks a spawn index and a leg onto the nearest stop', () => {
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
      expect(beet.zone).toBe(prior.zone);
      expect(zoneAt(beet.x, beet.y)).toBe(prior.zone);
    }
  });

  it('puts a beet back on its leek after its walk stays blocked for ten ticks', () => {
    // A wolf nudged outside the green cannot take any step (the step would leave its zone).
    const bed = plantCabbage();
    const wolf = bed.beets.find((beet) => beet.kind === 'wolf')!;
    const stuck: CabbageBed = { ...bed, beets: bed.beets.map((beet) => (beet.id === wolf.id ? { ...beet, x: 5, y: 700 } : beet)) };
    const ticks = walkBed(stuck, green, 10);
    const home = spawnPoints.green[wolf.spawnIndex]!;
    const after = ticks.bed.beets.find((beet) => beet.id === wolf.id)!;
    expect([after.x, after.y]).toEqual([home[0], home[1]]);
    const nineTicks = walkBed(stuck, green, 9).bed.beets.find((beet) => beet.id === wolf.id)!;
    expect([nineTicks.x, nineTicks.y]).toEqual([5, 700]);
  });
});
