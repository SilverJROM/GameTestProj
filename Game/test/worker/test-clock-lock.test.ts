// The X-Papaya-Clock test header is a test hook. A deployment that does not set ALLOW_TEST_CLOCK must ignore it, so no
// public client can freeze or fast-forward the world.

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
import { skeletonRadiusPx, townSpawn } from '../../src/rules/regions';
import { kaleConstants, onionMonsterRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, readCoinLots, saveFacts, saveFactsPair, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';
import { ACCOUNT_COOKIE_NAME } from '../../src/server/cookie';

const guavaSecret = 'clock-lock-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const biteTicksOf = (kind: string) => (rowOf(kind).attackGapSeconds * 1000) / kaleConstants.tickMs;


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



describe('test clock lock', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];
  const fetchWorker = (path: string, init?: RequestInit) => worker!.fetch(`http://town.example${path}`, init as never);

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-lock-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      await applyMigrations((prep.env as unknown as { DB: CharacterDb }).DB);
    } finally {
      await prep.dispose();
    }
    worker = await bootLemon(orchardDir);
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    await worker?.stop();
    await proxy?.dispose();
    if (orchardDir.length > 0) await rm(orchardDir, { recursive: true, force: true });
  }, 60_000);

  it('ignores the clock header: prune and ripen do nothing, the room stays on the real clock', async () => {
    const planted = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Locked', 'woman');
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, planted.grape);
    openSockets.push(joined.socket);
    const wolfId = joined.welcome.snapshot.monsters.find((m) => m.kind === 'wolf')!.id;
    const before = joined.welcome.snapshot.monsters.length;
    const heard = nextMango(joined.socket);
    joined.socket.send(JSON.stringify({ type: 'prune', beetId: wolfId }));
    const snap = await heard;
    expect(snap.snapshot.monsters.length).toBe(before);
    expect(snap.snapshot.monsters.some((m) => m.id === wolfId)).toBe(true);
    // A huge ripen is refused too: nothing moves and no thousands of ticks run.
    const heard2 = nextMango(joined.socket);
    joined.socket.send(JSON.stringify({ type: 'ripen', steps: 10_000 }));
    const snap2 = await heard2;
    expect(snap2.character.x).toBe(joined.welcome.character.x);
    expect(snap2.character.y).toBe(joined.welcome.character.y);
  }, 60_000);

  it('the real-time tick still walks the fig and moves the monsters (in-memory timer, no alarm chain)', async () => {
    const planted = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Walker', 'woman');
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, planted.grape);
    openSockets.push(joined.socket);
    const startX = joined.welcome.character.x;
    const startY = joined.welcome.character.y;
    // Collect snapshots for a while after a walk order.
    const seen: SnapshotMessage[] = [];
    joined.socket.on('message', (data) => seen.push(JSON.parse(mangoText(data)) as SnapshotMessage));
    joined.socket.send(JSON.stringify({ type: 'move', x: startX + 60, y: startY }));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const last = seen[seen.length - 1]!;
    expect(seen.length).toBeGreaterThan(5);
    expect(last.character.x).toBeGreaterThan(startX + 40);
  }, 60_000);

  it('saves the position when the walk stops, not on every tick, and when the socket closes', async () => {
    const planted = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Saver', 'woman');
    const db = (proxy!.env as unknown as { DB: CharacterDb }).DB;
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, planted.grape);
    const startX = joined.welcome.character.x;
    const startY = joined.welcome.character.y;
    // Count the position updates by watching the stored x over a long walk.
    joined.socket.send(JSON.stringify({ type: 'move', x: startX + 200, y: startY }));
    const values = new Set<number>();
    for (let i = 0; i < 28; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const row = await getById(db, planted.facts.id);
      values.add(Math.round(row!.x));
    }
    // 2.8 s of walking is about 28 ticks of 12 px; saves are about every 1.5 s, so only a few distinct stored values.
    expect(values.size).toBeLessThanOrEqual(4);
    // Arrived: the final spot is stored.
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(Math.round((await getById(db, planted.facts.id))!.x)).toBe(Math.round(startX + 200));
    // A new short walk, then close the socket mid-walk: the last known spot is saved.
    joined.socket.send(JSON.stringify({ type: 'move', x: startX + 40, y: startY }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    joined.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 800));
    const closed = await getById(db, planted.facts.id);
    expect(closed!.x).toBeLessThan(startX + 200);
    expect(closed!.x).toBeGreaterThan(startX + 40);
  }, 90_000);
});
