// A socket that sends nothing is closed by the server with code 4001 (the limit is 20 minutes; the test shortens it).

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

const guavaSecret = 'idle-close-secret';
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
    vars: { SESSION_SECRET: guavaSecret, IDLE_CLOSE_MS: '2500' },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}



describe('idle close', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];
  const fetchWorker = (path: string, init?: RequestInit) => worker!.fetch(`http://town.example${path}`, init as never);

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-idle-'));
    const v3Path = path.join(orchardDir, 'v3');
    const prep = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    try {
      await applyMigrations((prep.env as unknown as { DB: CharacterDb }).DB);
    } finally {
      await prep.dispose();
    }
    worker = await bootLemon(orchardDir);
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: v3Path } });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
  }, 120_000);

  afterAll(async () => {
    for (const socket of openSockets) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    }
    await worker?.stop();
    await proxy?.dispose();
    if (orchardDir.length > 0) await rm(orchardDir, { recursive: true, force: true });
  }, 60_000);

  it('closes a silent socket with 4001 but keeps one that keeps talking', async () => {
    const quiet = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Quiet', 'woman');
    const busy = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Busy', 'man');
    // Standing in the green keeps the tick (and so the idle check) running.
    for (const id of [quiet.facts.id, busy.facts.id]) {
      await kiwiDb.prepare("UPDATE characters SET place = 'green', x = 900, y = 400 WHERE id = ?").bind(id).run();
    }
    const q = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, quiet.grape);
    const b = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, busy.grape);
    openSockets.push(q.socket, b.socket);
    let quietCode = 0;
    let busyClosed = false;
    q.socket.on('close', (code) => {
      quietCode = code;
    });
    b.socket.on('close', () => {
      busyClosed = true;
    });
    const talk = setInterval(() => b.socket.send(JSON.stringify({ type: 'ping' })), 500);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    clearInterval(talk);
    expect(quietCode).toBe(4001);
    expect(busyClosed).toBe(false);
  }, 60_000);
});
