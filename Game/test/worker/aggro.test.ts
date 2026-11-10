// Wolf and bear aggro after a hit, on the injected papaya clock. Nothing here naps for a tick.
// An unhit beet stands; the first hit names the target; bites land on the monster row's attack at the rules swing gap.

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

const guavaSecret = 'aggro-session-secret';
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

describe('lemon room aggro', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-aggro-'));
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

  // A fig joined beside the nth beet of a kind where it stands NOW. Beets patrol while a fig is in their zone,
  // so the spawn point is not enough: a first visit in town reads the welcome, then the real join lands there.
  async function joinBeside(name: string, kind: string, nth: number, patch: Partial<CharacterFacts>) {
    const fig = await postFig(name);
    const scout = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    const id = nthBeet(kind, nth).id;
    const standing = scout.welcome.snapshot.monsters.find((beet) => beet.id === id)!;
    scout.socket.close();
    await saveFacts(kiwiDb, fig.facts.id, { ...patch, x: standing.x, y: standing.y });
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    openSockets.push(joined.socket);
    return { id: fig.facts.id, socket: joined.socket, beet: standing };
  }

  async function ask(socket: WebSocket, payload: unknown): Promise<SnapshotMessage> {
    const heard = nextMango(socket);
    socket.send(JSON.stringify(payload));
    return heard;
  }

  const ripen = (socket: WebSocket, steps: number) => ask(socket, { type: 'ripen', steps });
  const beetIn = (snap: SnapshotMessage, id: string) => snap.snapshot.monsters.find((beet) => beet.id === id);

  it('walks an unhit wolf slowly, chases the first hitter only, bites on the rules gap, and lets go at the zone edge', async () => {
    const wolf = firstBeet('wolf');
    const bite = rowOf('wolf').attack;
    const fern = await joinFig('Fern', { x: wolf.x, y: wolf.y, place: 'green', level: 6, hp: 80, maxHp: 80 });
    const basil = await joinFig('Basil', { x: wolf.x, y: wolf.y, place: 'green' });
    const duo = async (sender: WebSocket, payload: unknown) =>
      (await broadcastMango(sender, sender === fern.socket ? basil.socket : fern.socket, payload)).senderSnap;
    const basilHp = (await getById(kiwiDb, basil.id))!.hp;

    // Unhit: a few ticks beside a player only patrol (4 px a tick at most) and cost nothing.
    let snap = await duo(fern.socket, { type: 'ripen', steps: 3 });
    const patrolPx = (kaleConstants.monsterPatrolSpeedPxPerSec * kaleConstants.tickMs * 3) / 1000;
    expect(Math.hypot(beetIn(snap, wolf.id)!.x - wolf.x, beetIn(snap, wolf.id)!.y - wolf.y)).toBeLessThanOrEqual(patrolPx + 1e-6);
    expect(beetIn(snap, wolf.id)!.swung).toBe(false);
    expect(snap.character.hp).toBe(80);

    // Fern hits first, Basil second. The wolf keeps Fern.
    await duo(fern.socket, { type: 'attack', monsterId: wolf.id });
    await duo(basil.socket, { type: 'attack', monsterId: wolf.id });

    snap = await duo(fern.socket, { type: 'ripen', steps: 1 });
    expect(beetIn(snap, wolf.id)!.swung).toBe(true);
    expect(snap.character.hp).toBe(80 - bite);
    const wolfGap = biteTicksOf('wolf');
    for (let tick = 1; tick <= wolfGap; tick += 1) {
      snap = await duo(fern.socket, { type: 'ripen', steps: 1 });
      expect(beetIn(snap, wolf.id)!.swung, `tick ${tick}`).toBe(tick === wolfGap);
    }
    expect(snap.character.hp).toBe(80 - 2 * bite);
    expect((await getById(kiwiDb, basil.id))!.hp).toBe(basilHp);

    // Walk out of the green. The wolf follows no further once Fern is in town.
    const [townX, townY] = townSpawn;
    const walkTicks = Math.ceil(
      (Math.hypot(townX - wolf.x, townY - wolf.y) / kaleConstants.walkSpeedPxPerSec) * (1000 / kaleConstants.tickMs),
    );
    await duo(fern.socket, { type: 'move', x: townX, y: townY });
    snap = await duo(fern.socket, { type: 'ripen', steps: walkTicks + 5 });
    expect(snap.character.place).toBe('town');
    snap = await duo(fern.socket, { type: 'ripen', steps: 1 });
    const stopped = beetIn(snap, wolf.id)!;
    const hpAtTown = snap.character.hp;
    snap = await duo(fern.socket, { type: 'ripen', steps: 100 });
    // Basil still stands in the green, so the wolf patrols on (4 px a tick at most) but chases and bites no one.
    const patrolled = beetIn(snap, wolf.id)!;
    expect(Math.hypot(patrolled.x - stopped.x, patrolled.y - stopped.y)).toBeLessThanOrEqual(
      (kaleConstants.monsterPatrolSpeedPxPerSec * kaleConstants.tickMs * 100) / 1000 + 1e-6,
    );
    expect(patrolled.swung).toBe(false);
    expect(snap.character.hp).toBe(hpAtTown);
    expect((await getById(kiwiDb, basil.id))!.hp).toBe(basilHp);
  }, 60_000);

  it('reaches the player at the chase speed and then bites for the bear row attack', async () => {
    const bear = firstBeet('bear');
    const gap = kaleConstants.meleeReachPx * 3;
    const hero = await joinFig('Hazel', { x: bear.x + gap, y: bear.y, place: 'grey', level: 6, hp: 140, maxHp: 140 });
    // The bear patrols its radish, so the swing has to land on wherever it stands now, then the fig steps back.
    let snap = await ripen(hero.socket, 0);
    for (let step = 0; step < 80; step += 1) {
      const live = beetIn(snap, bear.id)!;
      if (Math.hypot(live.x - snap.character.x, live.y - snap.character.y) <= kaleConstants.meleeReachPx) {
        break;
      }
      await ask(hero.socket, { type: 'move', x: live.x, y: live.y });
      snap = await ripen(hero.socket, 1);
    }
    const struck = beetIn(snap, bear.id)!;
    expect(Math.hypot(struck.x - snap.character.x, struck.y - snap.character.y)).toBeLessThanOrEqual(
      kaleConstants.meleeReachPx,
    );
    await ask(hero.socket, { type: 'attack', monsterId: bear.id });
    await ask(hero.socket, { type: 'move', x: struck.x + gap, y: struck.y });
    await ripen(hero.socket, 3);

    // The chase covers one tick of rules speed per tick, never more.
    const before = beetIn(await ripen(hero.socket, 0), bear.id)!;
    const next = beetIn(await ripen(hero.socket, 1), bear.id)!;
    const stepPx = (kaleConstants.monsterChaseSpeedPxPerSec * kaleConstants.tickMs) / 1000;
    expect(Math.hypot(next.x - before.x, next.y - before.y)).toBeLessThanOrEqual(stepPx + 1e-6);

    snap = await ripen(hero.socket, 100);
    const chaser = beetIn(snap, bear.id)!;
    expect(Math.hypot(chaser.x - snap.character.x, chaser.y - snap.character.y)).toBeLessThanOrEqual(
      kaleConstants.meleeReachPx,
    );
    const hp = snap.character.hp;
    for (let tick = 0; tick < biteTicksOf('bear') * 2; tick += 1) {
      snap = await ripen(hero.socket, 1);
    }
    expect(hp - snap.character.hp).toBe(rowOf('bear').attack * 2);
  }, 60_000);

  // Bite times on the stepped clock with the monster already in reach. The times are read tick by tick
  // from the swung flag, so a gap snapped to the 100 ms tick (0.75 s -> 0.8 s) would show in the list.
  async function biteTimesMs(socket: WebSocket, monsterId: string, ticks: number): Promise<number[]> {
    const times: number[] = [];
    for (let tick = 0; tick <= ticks; tick += 1) {
      const snap = await ripen(socket, 1);
      if (beetIn(snap, monsterId)!.swung) {
        times.push(tick * kaleConstants.tickMs);
      }
    }
    return times;
  }

  it('bites a wolf at 0 and 1000 ms, a bear at 0, 800 and 1600 ms, with the monster already in reach', async () => {
    const wolfHero = await joinBeside('Pear', 'wolf', 4, { place: 'green', level: 6, hp: 140, maxHp: 140 });
    const wolf = wolfHero.beet;
    await ask(wolfHero.socket, { type: 'attack', monsterId: wolf.id });
    expect(await biteTimesMs(wolfHero.socket, wolf.id, 14)).toEqual([0, 1000]);

    const bearHero = await joinBeside('Plum', 'bear', 4, { place: 'grey', level: 6, hp: 140, maxHp: 140 });
    const bear = bearHero.beet;
    await ask(bearHero.socket, { type: 'attack', monsterId: bear.id });
    expect(await biteTimesMs(bearHero.socket, bear.id, 20)).toEqual([0, 800, 1600]);
  }, 60_000);

  it('bites a skeleton at 0, 800, 1500, 2300 and 3000 ms, so the 0.75 s gap is not snapped to the tick', async () => {
    const hero = await joinBeside('Leek', 'skeleton', 4, { place: 'cemetery', level: 6, hp: 140, maxHp: 140 });
    const skeleton = hero.beet;
    expect(await biteTimesMs(hero.socket, skeleton.id, 34)).toEqual([0, 800, 1500, 2300, 3000]);
  }, 60_000);

  it('still ignores a player who is not in the cemetery, even beside a skeleton', async () => {
    const skeleton = firstBeet('skeleton');
    const hero = await joinFig('Sage', { x: skeleton.x, y: skeleton.y, place: 'town', level: 6, hp: 80, maxHp: 80 });
    // The skeleton may patrol (4 px a tick) but never chases (9 px a tick) and never bites.
    let snap = await ripen(hero.socket, 0);
    for (let tick = 0; tick < 5; tick += 1) {
      const before = beetIn(snap, skeleton.id)!;
      snap = await ripen(hero.socket, 1);
      const after = beetIn(snap, skeleton.id)!;
      const patrolPx = (kaleConstants.monsterPatrolSpeedPxPerSec * kaleConstants.tickMs) / 1000;
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThanOrEqual(patrolPx + 1e-6);
      expect(after.swung).toBe(false);
    }
    expect(snap.character.hp).toBe(80);
  }, 60_000);

  it('lands a dead player in town at full max health with level, xp, and gear kept', async () => {
    const wolf = { ...plantCabbage().beets.filter((beet) => beet.kind === 'wolf')[2]!, swung: false };
    const kept = { level: 3, xp: 7, coins: 9, sword: 'shortSword', armor: 'leather' };
    const hero = await joinFig('Rowan', {
      x: wolf.x,
      y: wolf.y,
      place: 'green',
      ...kept,
      hp: rowOf('wolf').attack,
      maxHp: 52,
    });
    await ask(hero.socket, { type: 'attack', monsterId: wolf.id });
    const snap = await ripen(hero.socket, 1);
    const [townX, townY] = townSpawn;
    const fullMax = maxHealth(heroOf({ ...snap.character, ...kept }));
    expect(snap.character).toMatchObject({ ...kept, place: 'town', x: townX, y: townY, hp: fullMax });
    const me = snap.snapshot.players.find((player) => player.id === hero.id)!;
    expect([me.place, me.x, me.y]).toEqual(['town', townX, townY]);
    const row = await getById(kiwiDb, hero.id);
    expect(row).toMatchObject({ ...kept, place: 'town', x: townX, y: townY, hp: fullMax });

    // Nothing chases the player any more.
    const later = await ripen(hero.socket, 100);
    expect(beetIn(later, wolf.id)!.swung).toBe(false);
    expect(later.character.hp).toBe(fullMax);
  }, 60_000);

  it('reports aggro false on an unhit wolf and bear, true after a hit, and true for a skeleton within 120 px in the cemetery', async () => {
    expect(skeletonRadiusPx).toBe(120);

    const wolf = await joinBeside('Ivy', 'wolf', 1, { place: 'green', level: 6, hp: 140, maxHp: 140 });
    const wolfCalm = await ripen(wolf.socket, 0);
    const calmWolf = beetIn(wolfCalm, wolf.beet.id)!;
    expect(calmWolf.aggro).toBe(false);
    const wolfHit = await ask(wolf.socket, { type: 'attack', monsterId: wolf.beet.id });
    const hitWolf = beetIn(wolfHit, wolf.beet.id)!;
    expect(hitWolf.aggro).toBe(true);
    expect(hitWolf.hp).toBeLessThan(calmWolf.hp);

    const bear = await joinBeside('Nia', 'bear', 1, { place: 'grey', level: 6, hp: 140, maxHp: 140 });
    const bearCalm = await ripen(bear.socket, 0);
    const calmBear = beetIn(bearCalm, bear.beet.id)!;
    expect(calmBear.aggro).toBe(false);
    const bearHit = await ask(bear.socket, { type: 'attack', monsterId: bear.beet.id });
    const hitBear = beetIn(bearHit, bear.beet.id)!;
    expect(hitBear.aggro).toBe(true);
    expect(hitBear.hp).toBeLessThan(calmBear.hp);

    // A town fig standing on a skeleton does not light it. The same spot in the cemetery does, with no hit.
    const fig = await postFig('Moss');
    const scout = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    const quiet = scout.welcome.snapshot.monsters.find((beet) => beet.kind === 'skeleton' && beet.aggro === false);
    expect(quiet).toBeDefined();
    scout.socket.close();
    const boneId = quiet!.id;
    const boneHp = quiet!.hp;
    await saveFacts(kiwiDb, fig.facts.id, {
      x: quiet!.x,
      y: quiet!.y,
      place: 'town',
      level: 6,
      hp: 140,
      maxHp: 140,
    });
    const town = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, fig.grape);
    openSockets.push(town.socket);
    const townBone = town.welcome.snapshot.monsters.find((beet) => beet.id === boneId)!;
    expect(town.welcome.character.place).toBe('town');
    expect(Math.hypot(town.welcome.character.x - townBone.x, town.welcome.character.y - townBone.y)).toBeLessThanOrEqual(120);
    expect(townBone.aggro).toBe(false);

    const cress = await postFig('Cress');
    await saveFacts(kiwiDb, cress.facts.id, {
      x: townBone.x,
      y: townBone.y,
      place: 'cemetery',
      level: 6,
      hp: 140,
      maxHp: 140,
    });
    const cemetery = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, cress.grape);
    openSockets.push(cemetery.socket);
    const woke = cemetery.welcome.snapshot.monsters.find((beet) => beet.id === boneId)!;
    expect(cemetery.welcome.character.place).toBe('cemetery');
    expect(Math.hypot(cemetery.welcome.character.x - woke.x, cemetery.welcome.character.y - woke.y)).toBeLessThanOrEqual(120);
    expect(woke.aggro).toBe(true);
    expect(woke.hp).toBe(boneHp);
  }, 60_000);
});
