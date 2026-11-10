// Skeleton proximity aggro on the injected papaya clock. Nothing here naps for a tick.
// A cemetery fig inside the rules radius is noticed; others are ignored; the target is kept until the fig leaves.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type MonsterSnapshot,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { maxHealth, type Hero } from '../../src/rules/logic';
import { skeletonRadiusPx, townSpawn, zoneAt } from '../../src/rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'skeleton-session-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const biteTicks = (onionMonsterRows.find((row) => row.id === 'skeleton')!.attackGapSeconds * 1000) / kaleConstants.tickMs;


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
    vars: { SESSION_SECRET: guavaSecret },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}


function firstBeet(kind: string, skip = 0): MonsterSnapshot {
  const beet = plantCabbage().beets.filter((candidate) => candidate.kind === kind)[skip]!;
  return { ...beet, swung: false, aggro: false };
}

function heroOf(facts: CharacterFacts): Hero {
  return {
    level: facts.level,
    xp: facts.xp,
    health: facts.hp,
    coins: facts.coins,
    sword: facts.sword,
    armor: facts.armor,
    place: facts.place,
  };
}

describe('lemon room skeleton proximity aggro', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-skeleton-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
    } finally {
      await prep.dispose();
    }
    worker = await bootLemon(orchardDir);
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

  async function postFig(name: string): Promise<{ facts: CharacterFacts; grape: string }> {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    return { facts: planted.facts, grape: planted.grape };
  }

  // A fig saved with a patch, then joined on a papaya-clock socket.
  async function joinFig(name: string, patch: Partial<CharacterFacts>) {
    const fig = await postFig(name);
    await saveFacts(kiwiDb, fig.facts.id, patch);
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    openSockets.push(joined.socket);
    return { id: fig.facts.id, socket: joined.socket };
  }

  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }

  const ripen = (socket: WebSocket, steps: number) => ask(socket, { type: 'ripen', steps });
  const beetIn = (snap: SnapshotMessage, id: string) => snap.snapshot.monsters.find((beet) => beet.id === id);

  // The fifth skeleton stands at the east edge of the cemetery, next to the grey ground.
  const borderSkeleton = () => firstBeet('skeleton', 4);
  const bite = rowOf('skeleton').attack;

  it('ignores a fig just outside the radius and targets one just inside, biting the row attack on the rules gap', async () => {
    const skeleton = borderSkeleton();
    const outside = await joinFig('Plum', { x: skeleton.x + skeletonRadiusPx + 1, y: skeleton.y, place: 'cemetery', level: 6, hp: 80, maxHp: 80 });
    const snap = await ripen(outside.socket, 200);
    expect([beetIn(snap, skeleton.id)!.x, beetIn(snap, skeleton.id)!.y]).toEqual([skeleton.x, skeleton.y]);
    expect(beetIn(snap, skeleton.id)!.swung).toBe(false);
    expect(snap.character.hp).toBe(80);
    // Close the socket so this fig is gone before the next case.
    outside.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }, 60_000);

  it('chases the first target, keeps it past the radius, and lets go when the fig leaves the cemetery', async () => {
    const skeleton = borderSkeleton();
    expect(zoneAt(skeleton.x + skeletonRadiusPx - 1, skeleton.y)).toBe('cemetery');
    const inside = await joinFig('Cherry', { x: skeleton.x + skeletonRadiusPx - 1, y: skeleton.y, place: 'cemetery', level: 6, hp: 80, maxHp: 80 });
    // Close in first, then the bite lands on the rules gap.
    let snap = await ripen(inside.socket, 1);
    for (let tick = 0; tick < 200 && !beetIn(snap, skeleton.id)!.swung; tick += 1) {
      snap = await ripen(inside.socket, 1);
    }
    const chaser = beetIn(snap, skeleton.id)!;
    expect(chaser.swung).toBe(true);
    expect(Math.hypot(chaser.x - snap.character.x, chaser.y - snap.character.y)).toBeLessThanOrEqual(kaleConstants.meleeReachPx);
    expect(snap.character.hp).toBe(80 - bite);
    const start = snap.character.hp;
    for (let tick = 0; tick < biteTicks * 2; tick += 1) {
      snap = await ripen(inside.socket, 1);
    }
    expect(start - snap.character.hp).toBe(bite * 2);
    // Leaving the cemetery clears the aggro: the skeleton stops where it is.
    await ask(inside.socket, { type: 'move', x: skeleton.x + 200, y: skeleton.y - 30 });
    snap = await ripen(inside.socket, 200);
    expect(snap.character.place).not.toBe('cemetery');
    const stopped = beetIn(snap, skeleton.id)!;
    const hpAway = snap.character.hp;
    snap = await ripen(inside.socket, 100);
    expect([beetIn(snap, skeleton.id)!.x, beetIn(snap, skeleton.id)!.y]).toEqual([stopped.x, stopped.y]);
    expect(beetIn(snap, skeleton.id)!.swung).toBe(false);
    expect(snap.character.hp).toBe(hpAway);
  }, 60_000);

  it('ignores a fig standing in the grey within the radius of a border skeleton', async () => {
    const skeleton = borderSkeleton();
    const spot = { x: 470, y: 20 };
    expect(zoneAt(spot.x, spot.y)).toBe('grey');
    expect(Math.hypot(spot.x - skeleton.x, spot.y - skeleton.y)).toBeLessThan(skeletonRadiusPx);
    const grey = await joinFig('Radish', { ...spot, place: 'grey', level: 6, hp: 80, maxHp: 80 });
    const before = beetIn(await ripen(grey.socket, 0), skeleton.id)!;
    const snap = await ripen(grey.socket, 200);
    expect([beetIn(snap, skeleton.id)!.x, beetIn(snap, skeleton.id)!.y]).toEqual([before.x, before.y]);
    expect(beetIn(snap, skeleton.id)!.swung).toBe(false);
    expect(snap.character.hp).toBe(80);
  }, 60_000);
});
