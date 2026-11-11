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

const guavaSecret = 'chase-session-secret';
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

describe('lemon room click to chase and fight', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-chase-'));
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

  async function postFig(name: string) {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    return { facts: planted.facts, grape: planted.grape };
  }

  // A strong fig placed `gap` px to the right of where the nth wolf stands now (a scout visit reads the live spot).
  async function joinNear(name: string, nth: number, gap: number, patch: Partial<CharacterFacts> = {}) {
    const fig = await postFig(name);
    const scout = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    const id = nthBeet('wolf', nth).id;
    const standing = scout.welcome.snapshot.monsters.find((beet) => beet.id === id)!;
    scout.socket.close();
    await saveFacts(kiwiDb, fig.facts.id, {
      place: 'green',
      level: 6,
      hp: 140,
      maxHp: 140,
      x: standing.x + gap,
      y: standing.y,
      ...patch,
    });
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    openSockets.push(joined.socket);
    return { id: fig.facts.id, socket: joined.socket, wolfId: id, grape: fig.grape };
  }

  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }
  const ripen = (socket: WebSocket, steps = 1) => ask(socket, { type: 'ripen', steps });
  const selfOf = (snap: SnapshotMessage, id: string) => snap.snapshot.players.find((row) => row.id === id)!;
  const wolfOf = (snap: SnapshotMessage, id: string) => snap.snapshot.monsters.find((row) => row.id === id);
  const gapTo = (snap: SnapshotMessage, id: string, wolfId: string) => {
    const me = selfOf(snap, id);
    const wolf = wolfOf(snap, wolfId)!;
    return Math.hypot(me.x - wolf.x, me.y - wolf.y);
  };

  it('walks a far fig to the clicked wolf, swings on its own, shows the swing, and ends when the wolf dies', async () => {
    const hero = await joinNear('Chaser', 0, 130);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    const startGap = gapTo(snap, hero.id, hero.wolfId);
    expect(startGap).toBeGreaterThan(kaleConstants.meleeReachPx);
    let sawSwing = false;
    let hits = 0;
    for (let tick = 0; tick < 120 && wolfOf(snap, hero.wolfId) !== undefined; tick += 1) {
      snap = await ripen(hero.socket);
      hits += snap.snapshot.hits.filter((row) => row.targetKind === 'monster' && row.targetId === hero.wolfId).length;
      if (selfOf(snap, hero.id).attacking === true) sawSwing = true;
    }
    expect(wolfOf(snap, hero.wolfId)).toBeUndefined();
    expect(hits).toBeGreaterThanOrEqual(2);
    expect(sawSwing).toBe(true);
    // The fight is over: more ticks send no more swings and the fig stands still.
    const rest = selfOf(snap, hero.id);
    for (let tick = 0; tick < 6; tick += 1) snap = await ripen(hero.socket);
    expect(snap.snapshot.hits.some((row) => row.targetKind === 'monster')).toBe(false);
    const after = selfOf(snap, hero.id);
    expect(Math.hypot(after.x - rest.x, after.y - rest.y)).toBeLessThan(1);
    expect(after.moving).toBe(false);
  }, 60_000);

  it('swings no faster than the rules attack gap', async () => {
    const hero = await joinNear('Pacer', 1, 20, { level: 1, hp: 70, maxHp: 70 });
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    const gapTicks = (pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs;
    const swingTicks: number[] = [];
    for (let tick = 0; tick < 40; tick += 1) {
      snap = await ripen(hero.socket);
      if (snap.snapshot.hits.some((row) => row.targetKind === 'monster')) swingTicks.push(tick);
      if (wolfOf(snap, hero.wolfId) === undefined) break;
    }
    expect(swingTicks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < swingTicks.length; i += 1) {
      expect(swingTicks[i]! - swingTicks[i - 1]!).toBeGreaterThanOrEqual(Math.floor(gapTicks));
    }
  }, 60_000);

  it('a click on the ground ends the chase: no more swings, and the fig walks to the new spot', async () => {
    const hero = await joinNear('Quitter', 2, 140);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    for (let tick = 0; tick < 3; tick += 1) snap = await ripen(hero.socket);
    const me = selfOf(snap, hero.id);
    const away = { x: me.x + 90, y: me.y };
    snap = await ask(hero.socket, { type: 'move', x: away.x, y: away.y });
    let swung = false;
    for (let tick = 0; tick < 20; tick += 1) {
      snap = await ripen(hero.socket);
      if (snap.snapshot.hits.some((row) => row.targetKind === 'monster')) swung = true;
    }
    expect(swung).toBe(false);
    const end = selfOf(snap, hero.id);
    expect(Math.hypot(end.x - away.x, end.y - away.y)).toBeLessThan(6);
  }, 60_000);

  it('a click on a monster in another zone does not move the fig', async () => {
    const hero = await joinNear('Townie', 3, 0, { place: 'town', x: townSpawn[0], y: townSpawn[1] });
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    const start = selfOf(snap, hero.id);
    for (let tick = 0; tick < 8; tick += 1) snap = await ripen(hero.socket);
    const end = selfOf(snap, hero.id);
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1);
    expect(snap.snapshot.hits.some((row) => row.targetKind === 'monster')).toBe(false);
  }, 60_000);

  it('a one-swing attack (once) does not walk or follow', async () => {
    const hero = await joinNear('Single', 4, 130);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId, once: true });
    const start = selfOf(snap, hero.id);
    for (let tick = 0; tick < 10; tick += 1) snap = await ripen(hero.socket);
    const end = selfOf(snap, hero.id);
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1);
  }, 60_000);

  it('a chase does not survive a disconnect: a new session of the same character stands still until clicked', async () => {
    const hero = await joinNear('Dropper', 5, 140);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    for (let tick = 0; tick < 2; tick += 1) snap = await ripen(hero.socket);
    hero.socket.close();
    await new Promise((resolve) => setTimeout(resolve, 400));
    const back = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, hero.grape);
    openSockets.push(back.socket);
    let again = await ripen(back.socket);
    const start = selfOf(again, hero.id);
    let swung = false;
    for (let tick = 0; tick < 12; tick += 1) {
      again = await ripen(back.socket);
      if (again.snapshot.hits.some((row) => row.targetKind === 'monster')) swung = true;
    }
    const end = selfOf(again, hero.id);
    expect(swung).toBe(false);
    expect(Math.hypot(end.x - start.x, end.y - start.y)).toBeLessThan(1);
  }, 60_000);

  it('a one-swing attack ends a chase already running: the fig finishes its walk but never swings again', async () => {
    const hero = await joinNear('Switcher', 6, 130);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    snap = await ripen(hero.socket);
    snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId, once: true });
    let swings = 0;
    for (let tick = 0; tick < 40; tick += 1) {
      snap = await ripen(hero.socket);
      swings += snap.snapshot.hits.filter((row) => row.targetKind === 'monster').length;
    }
    expect(swings).toBe(0);
    expect(selfOf(snap, hero.id).moving).toBe(false);
  }, 60_000);

  it('a left click on a monster (attack once with walk) walks over, swings exactly once, and stops', async () => {
    const hero = await joinNear('Leftie', 6, 130);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId, once: true, walk: true });
    let swings = 0;
    for (let tick = 0; tick < 80; tick += 1) {
      snap = await ripen(hero.socket);
      swings += snap.snapshot.hits.filter((row) => row.targetKind === 'monster').length;
    }
    // It did walk (it started 130 px away) and swung once, then the chase ended.
    expect(swings).toBe(1);
    expect(selfOf(snap, hero.id).moving).toBe(false);
  }, 60_000);

  it('a right click (attack with no once) still walks and swings until the wolf is dead', async () => {
    const hero = await joinNear('Rightie', 6, 130);
    let snap = await ask(hero.socket, { type: 'attack', monsterId: hero.wolfId });
    let swings = 0;
    for (let tick = 0; tick < 200 && snap.snapshot.monsters.some((m) => m.id === hero.wolfId); tick += 1) {
      snap = await ripen(hero.socket);
      swings += snap.snapshot.hits.filter((row) => row.targetKind === 'monster').length;
    }
    expect(snap.snapshot.monsters.some((m) => m.id === hero.wolfId)).toBe(false);
    expect(swings).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
