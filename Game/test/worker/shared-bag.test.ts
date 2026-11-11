// Click a monster: the fig walks to it and swings on its own attack clock until it dies or the player clicks the ground.

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
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';
import { ACCOUNT_COOKIE_NAME } from '../../src/server/cookie';

const guavaSecret = 'bag-session-secret';
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
    vars: { SESSION_SECRET: guavaSecret, ALLOW_TEST_CLOCK: '1' },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}


function firstBeet(kind: string): MonsterSnapshot {
  const beet = plantCabbage().beets.find((candidate) => candidate.kind === kind)!;
  return { ...beet, swung: false, aggro: false };
}

// A later beet of a kind, so a test that needs an untouched monster does not share the first one.
function nthBeet(kind: string, nth: number): MonsterSnapshot {
  const beet = plantCabbage().beets.filter((candidate) => candidate.kind === kind)[nth]!;
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

describe('shared account bag', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];
  const fetchWorker = (path: string, init?: RequestInit) => worker!.fetch(`http://town.example${path}`, init as never);

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-bag-'));
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

  // One account with two avatars, both connected. Avatar one has coins and stands in town.
  async function pair(label: string) {
    const first = await plantPlayingFig((p, init) => fetchWorker(p, init), `${label}One`, 'woman');
    await saveFacts(kiwiDb, first.facts.id, { coins: 200, place: 'town' });
    const second = await fetchWorker('/api/avatars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ACCOUNT_COOKIE_NAME}=${first.accountValue}` },
      body: JSON.stringify({ name: `${label}Two`, gender: 'man' }),
    });
    const secondFacts = (await second.json()) as CharacterFacts;
    const play = await fetchWorker('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${ACCOUNT_COOKIE_NAME}=${first.accountValue}` },
      body: JSON.stringify({ id: secondFacts.id }),
    });
    const setCookie = play.headers.getSetCookie().find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
    const secondGrape = grapeFromBeet(setCookie);
    await saveFacts(kiwiDb, secondFacts.id, { place: 'town' });
    const a = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, first.grape);
    const b = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, secondGrape);
    openSockets.push(a.socket, b.socket);
    return { a: { id: first.facts.id, socket: a.socket, welcome: a.welcome }, b: { id: secondFacts.id, socket: b.socket, welcome: b.welcome }, account: first.accountValue };
  }

  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }
  const settle = (socket: WebSocket) => ask(socket, { type: 'ripen', steps: 1 });
  const me = (snap: SnapshotMessage) => snap.character;
  // Snapshots from the other avatar's actions can arrive first, so read fresh ones until the wanted state shows.
  async function until(socket: WebSocket, wanted: (snap: SnapshotMessage) => boolean): Promise<SnapshotMessage> {
    let snap = await settle(socket);
    for (let tries = 0; tries < 8 && !wanted(snap); tries += 1) snap = await settle(socket);
    return snap;
  }
  async function act(socket: WebSocket, payload: unknown, wanted: (snap: SnapshotMessage) => boolean): Promise<SnapshotMessage> {
    socket.send(JSON.stringify(payload));
    return until(socket, wanted);
  }

  it('an item bought by one avatar shows in the other avatar bag, and only one can wear it', async () => {
    const { a, b } = await pair('Duo');
    let snapA = await act(a.socket, { type: 'buy', item: 'shortSword' }, (x) => me(x).items.includes('shortSword'));
    expect(me(snapA).items).toEqual(['shortSword']);
    expect(me(snapA).coins).toBe(200 - 18);
    // The other avatar sees it without buying anything.
    let snapB = await act(b.socket, { type: 'equip', itemId: 'shortSword' }, (x) => me(x).sword === 'shortSword');
    expect(me(snapB).sword).toBe('shortSword');
    expect(me(snapB).items).toEqual(['shortSword']);
    // Avatar one now sees it as worn by avatar two and cannot wear it.
    snapA = await act(a.socket, { type: 'equip', itemId: 'shortSword' }, (x) => (me(x).elsewhere ?? []).length === 1);
    expect(me(snapA).sword).toBeNull();
    expect(me(snapA).items).toEqual([]);
    expect(me(snapA).elsewhere).toEqual([{ itemId: 'shortSword', by: 'DuoTwo' }]);
    // Buying it again is refused and costs nothing.
    snapA = await act(a.socket, { type: 'buy', item: 'shortSword' }, () => true);
    expect(me(snapA).coins).toBe(200 - 18);
    // When avatar two takes it off, avatar one can wear it.
    snapB = await act(b.socket, { type: 'unequip', slot: 'sword' }, (x) => me(x).sword === null);
    expect(me(snapB).sword).toBeNull();
    snapA = await act(a.socket, { type: 'equip', itemId: 'shortSword' }, (x) => me(x).sword === 'shortSword');
    expect(me(snapA).sword).toBe('shortSword');
    expect(me(snapA).elsewhere ?? []).toEqual([]);
    // ... and now avatar two cannot.
    snapB = await act(b.socket, { type: 'equip', itemId: 'shortSword' }, (x) => (me(x).elsewhere ?? []).length === 1);
    expect(me(snapB).sword).toBeNull();
    expect(me(snapB).elsewhere).toEqual([{ itemId: 'shortSword', by: 'DuoOne' }]);
  }, 60_000);

  it('deleting the avatar that wears an item frees it for the other avatar', async () => {
    const { a, b, account } = await pair('Gone');
    await act(a.socket, { type: 'buy', item: 'leather' }, (x) => me(x).items.includes('leather'));
    let snapB = await act(b.socket, { type: 'equip', itemId: 'leather' }, (x) => me(x).armor === 'leather');
    expect(me(snapB).armor).toBe('leather');
    let snapA = await act(a.socket, { type: 'equip', itemId: 'leather' }, (x) => (me(x).elsewhere ?? []).length === 1);
    expect(me(snapA).armor).toBeNull();
    const gone = await fetchWorker(`/api/avatars/${b.id}`, { method: 'DELETE', headers: { Cookie: `${ACCOUNT_COOKIE_NAME}=${account}` } });
    expect(gone.status).toBe(200);
    snapA = await act(a.socket, { type: 'equip', itemId: 'leather' }, (x) => me(x).armor === 'leather');
    expect(me(snapA).armor).toBe('leather');
    expect(me(snapA).maxHp).toBeGreaterThan(70);
  }, 60_000);

  it('a different account never sees or uses the items', async () => {
    const one = await pair('Mine');
    const other = await plantPlayingFig((p, init) => fetchWorker(p, init), 'Stranger', 'woman');
    await act(one.a.socket, { type: 'buy', item: 'shortSword' }, (x) => me(x).items.includes('shortSword'));
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, other.grape);
    openSockets.push(joined.socket);
    expect(joined.welcome.character.items).toEqual([]);
    const snap = await act(joined.socket, { type: 'equip', itemId: 'shortSword' }, () => true);
    expect(me(snap).sword).toBeNull();
  }, 60_000);

  it('two quick equip messages from one avatar never leave a copy stuck as worn', async () => {
    const { a, b } = await pair('Race');
    await act(a.socket, { type: 'buy', item: 'shortSword' }, (x) => me(x).items.includes('shortSword'));
    await act(a.socket, { type: 'buy', item: 'longSword' }, (x) => me(x).items.includes('longSword'));
    // Back to back, before the first one has finished.
    a.socket.send(JSON.stringify({ type: 'equip', itemId: 'shortSword' }));
    a.socket.send(JSON.stringify({ type: 'equip', itemId: 'longSword' }));
    const after = await until(a.socket, (x) => me(x).sword === 'longSword');
    expect(me(after).sword).toBe('longSword');
    const worn = (await kiwiDb.prepare('SELECT item_id FROM account_items WHERE worn_by = ? ORDER BY item_id').bind(a.id).all<{ item_id: string }>()).results;
    expect(worn.map((row) => row.item_id)).toEqual(['longSword']);
    // The first sword is free for the other avatar.
    const snapB = await act(b.socket, { type: 'equip', itemId: 'shortSword' }, (x) => me(x).sword === 'shortSword');
    expect(me(snapB).sword).toBe('shortSword');
  }, 60_000);
});
