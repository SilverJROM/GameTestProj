// Player attack and the kill. A level 1 fig with no sword fells a wolf in five hits spaced at the rules gap.
// A hit inside the gap is ignored. The killer takes the wolf's xp, one coin seed falls, and the purse stays put.
// One swing clock per fig: a monster swing and a duel-style swing share trySwing.
// The papaya clock is injected; nothing here naps for the gap.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  peelClientMessage,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { levelUpHealth, maxHealth, strike, type Hero } from '../../src/rules/logic';
import { kaleConstants, onionMonsterRows, papayaLevelRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { createPapayaClock, sproutFig, type FigWalk } from '../../src/world/core';
import { newSwingClock, strikeBeet, swingGapMs, trySwing } from '../../src/world/combat';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'attack-session-secret';
const wolfRow = onionMonsterRows.find((row) => row.id === 'wolf')!;
const gapMs = pearTimings.playerAttackGapSeconds * 1000;

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

function plantFig(patch: Partial<CharacterFacts>, spot: { x: number; y: number }): FigWalk {
  return sproutFig({
    id: 'fig-attack',
    name: 'Attack',
    nameKey: 'attack',
    gender: 'man',
    level: 1,
    xp: 0,
    hp: papayaLevelRows[0]!.baseHp,
    maxHp: papayaLevelRows[0]!.baseHp,
    coins: 0,
    sword: null,
    armor: null,
    place: 'green',
    x: spot.x,
    y: spot.y,
    ...patch,
  });
}

function firstWolf() {
  const wolf = plantCabbage().beets.find((beet) => beet.kind === 'wolf')!;
  return wolf;
}

describe('swing clock', () => {
  it('shares one gap between monster and duel-style swings and lands at the rules gap', () => {
    expect(swingGapMs()).toBe(gapMs);
    const lime = createPapayaClock(0);

    const monsterFirst = newSwingClock();
    expect(trySwing(monsterFirst, lime.nowMs(), 'monster')).toBe(true);
    expect(trySwing(monsterFirst, gapMs - 50, 'duel')).toBe(false);
    expect(trySwing(monsterFirst, gapMs - 1, 'monster')).toBe(false);
    expect(trySwing(monsterFirst, gapMs, 'duel')).toBe(true);

    const duelFirst = newSwingClock();
    expect(trySwing(duelFirst, 0, 'duel')).toBe(true);
    expect(trySwing(duelFirst, gapMs - 50, 'monster')).toBe(false);
    // An ignored swing does not restamp: the gap still counts from time 0.
    expect(trySwing(duelFirst, gapMs, 'monster')).toBe(true);
  });

  it('kills a wolf in five strikes, ignores a hit at 400 ms, and drops one coin worth the row without touching the purse', () => {
    const wolf = firstWolf();
    const fig = plantFig({}, wolf);
    const swing = newSwingClock();
    const lime = createPapayaClock(0);
    let bed = plantCabbage();
    const bare = strike(heroOf(fig.facts));
    expect(Math.ceil(wolfRow.hp / bare)).toBe(5);

    let land = strikeBeet(fig, bed, wolf.id, swing, lime.nowMs());
    expect(land.struck).toBe(true);
    bed = land.bed;
    const hpAfterFirst = bed.beets.find((beet) => beet.id === wolf.id)!.hp;
    expect(hpAfterFirst).toBe(wolfRow.hp - bare);

    lime.sprout(gapMs - 50);
    land = strikeBeet(fig, bed, wolf.id, swing, lime.nowMs());
    expect(land.struck).toBe(false);
    expect(land.bed).toBe(bed);
    expect(bed.beets.find((beet) => beet.id === wolf.id)!.hp).toBe(hpAfterFirst);

    lime.sprout(50);
    for (let swings = 1; swings < 5; swings += 1) {
      if (swings > 1) {
        lime.sprout(gapMs);
      }
      land = strikeBeet(fig, bed, wolf.id, swing, lime.nowMs());
      expect(land.struck).toBe(true);
      bed = land.bed;
      if (swings < 4) {
        expect(land.patch).toBeNull();
      }
    }
    expect(bed.beets.some((beet) => beet.id === wolf.id)).toBe(false);
    expect(land.patch).toEqual({ level: 1, xp: wolfRow.xp, hp: 70, maxHp: maxHealth(heroOf(fig.facts)) });
    expect(fig.facts.coins).toBe(0);
    expect(bed.seeds).toHaveLength(1);
    expect(bed.seeds[0]).toMatchObject({ x: wolf.x, y: wolf.y, ownerId: fig.facts.id, value: wolfRow.coins });
    expect(new Set(bed.seeds.map((seed) => seed.id)).size).toBe(1);
    expect(bed.yams).toHaveLength(1);
    expect(bed.yams[0]?.dueMs).toBe(lime.nowMs() + pearTimings.respawnSeconds * 1000);
  });

  it('uses the sword in strike(), ignores a far click or unknown id, and does not stamp for them', () => {
    const wolf = firstWolf();
    const bareFig = plantFig({}, wolf);
    const swordFig = plantFig({ sword: 'shortSword' }, wolf);
    expect(strike(heroOf(swordFig.facts))).toBeGreaterThan(strike(heroOf(bareFig.facts)));

    const bed = plantCabbage();
    const swing = newSwingClock();
    const far = plantFig({}, { x: wolf.x + kaleConstants.meleeReachPx + 1, y: wolf.y });
    expect(strikeBeet(far, bed, wolf.id, swing, 0).struck).toBe(false);
    expect(strikeBeet(bareFig, bed, 'wolf-missing', swing, 0).struck).toBe(false);
    expect(swing.lastMs).toBeNull();

    const swordSwing = newSwingClock();
    const land = strikeBeet(swordFig, bed, wolf.id, swordSwing, 0);
    expect(land.bed.beets.find((beet) => beet.id === wolf.id)!.hp).toBe(wolfRow.hp - strike(heroOf(swordFig.facts)));
    const reach = plantFig({}, { x: wolf.x + kaleConstants.meleeReachPx, y: wolf.y });
    expect(strikeBeet(reach, bed, wolf.id, newSwingClock(), 0).struck).toBe(true);
  });

  it('keeps the leftover xp across the bar and follows levelUpHealth, and a zero-xp kill stays level 1', () => {
    const wolf = firstWolf();
    const bar = papayaLevelRows[0]!.xpToNext!;
    const near = plantFig({ xp: bar - 1 }, wolf);
    const hero = heroOf(near.facts);
    const swing = newSwingClock();
    let bed = plantCabbage();
    for (let at = 0; at < 5; at += 1) {
      bed = strikeBeet(near, bed, wolf.id, swing, at * gapMs).bed;
    }
    expect(near.facts.level).toBe(2);
    expect(near.facts.xp).toBe(bar - 1 + wolfRow.xp - bar);
    expect(near.facts.hp).toBe(levelUpHealth(hero, 2));
    expect(near.facts.maxHp).toBe(papayaLevelRows[1]!.baseHp);
    expect(near.facts.hp).toBe(near.facts.maxHp);

    const fresh = plantFig({}, wolf);
    const freshSwing = newSwingClock();
    let freshBed = plantCabbage();
    for (let at = 0; at < 5; at += 1) {
      freshBed = strikeBeet(fresh, freshBed, wolf.id, freshSwing, at * gapMs).bed;
    }
    expect([fresh.facts.level, fresh.facts.xp]).toEqual([1, wolfRow.xp]);
  });

  it('peels an attack mango and drops a radish id', () => {
    expect(peelClientMessage(JSON.stringify({ type: 'attack', monsterId: 'wolf-1', characterId: 'x', id: 'y' }))).toEqual({
      type: 'attack',
      monsterId: 'wolf-1',
    });
    expect(peelClientMessage(JSON.stringify({ type: 'attack' }))).toBeNull();
  });
});


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

describe('lemon room attack', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-attack-'));
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

  it('fells a wolf over two sockets, pays xp and seeds to the killer only, and survives a restart', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }
    const live = worker;
    async function postFig(name: string): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => live.fetch(`http://town.example${path}`, init), name, 'woman');
      return { facts: planted.facts, grape: planted.grape };
    }

    const fern = await postFig('Fern');
    const basil = await postFig('Basil');
    const wolf = firstWolf();
    const [other] = plantCabbage().beets.filter((beet) => beet.kind === 'wolf' && beet.id !== wolf.id);
    // Fern stands beside the first wolf, Basil stands out of reach of every wolf with a purse of his own.
    await saveFacts(kiwiDb, fern.facts.id, { x: wolf.x, y: wolf.y, place: 'green', coins: 7 });
    await saveFacts(kiwiDb, basil.facts.id, { x: other!.x + 300, y: other!.y, place: 'green', coins: 3, xp: 4 });

    const wsUrl = `ws://127.0.0.1:${live.port}/ws`;
    const fernJoin = await connectFig(wsUrl, fern.grape);
    const basilJoin = await connectFig(wsUrl, basil.grape);
    openSockets.push(fernJoin.socket, basilJoin.socket);
    const bare = strike(heroOf({ ...fern.facts, sword: null }));
    const swingTicks = Math.ceil(gapMs / kaleConstants.tickMs);
    const earlyTicks = Math.floor(400 / kaleConstants.tickMs);
    expect(earlyTicks * kaleConstants.tickMs).toBeLessThan(gapMs);

    function wolfHp(snap: SnapshotMessage): number | undefined {
      return snap.snapshot.monsters.find((beet) => beet.id === wolf.id)?.hp;
    }

    // Hit at 0 ms. A radish character id on the mango is ignored.
    let heard = await broadcastMango(fernJoin.socket, basilJoin.socket, {
      type: 'attack',
      monsterId: wolf.id,
      characterId: basil.facts.id,
    });
    expect(wolfHp(heard.senderSnap)).toBe(wolfRow.hp - bare);
    expect(wolfHp(heard.otherSnap)).toBe(wolfRow.hp - bare);

    // Basil is out of reach: nothing happens.
    heard = await broadcastMango(basilJoin.socket, fernJoin.socket, { type: 'attack', monsterId: wolf.id });
    expect(wolfHp(heard.senderSnap)).toBe(wolfRow.hp - bare);

    await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: earlyTicks });
    heard = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'attack', monsterId: wolf.id });
    expect(wolfHp(heard.senderSnap)).toBe(wolfRow.hp - bare);
    await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: swingTicks - earlyTicks });

    for (let hit = 2; hit <= 4; hit += 1) {
      heard = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'attack', monsterId: wolf.id });
      expect(wolfHp(heard.senderSnap)).toBe(wolfRow.hp - bare * hit);
      await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: swingTicks });
    }
    const killTime = (earlyTicks + (swingTicks - earlyTicks) + 3 * swingTicks) * kaleConstants.tickMs;
    expect(killTime).toBeGreaterThan(0);
    heard = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'attack', monsterId: wolf.id });
    expect(heard.senderSnap.snapshot.monsters.some((beet) => beet.id === wolf.id)).toBe(false);
    expect(heard.senderSnap.character.xp).toBe(wolfRow.xp);
    expect(heard.senderSnap.character.level).toBe(1);
    expect(heard.senderSnap.character.coins).toBe(7);
    expect(heard.otherSnap.character.coins).toBe(3);
    expect(heard.otherSnap.character.xp).toBe(4);
    for (const snap of [heard.senderSnap, heard.otherSnap]) {
      expect(snap.snapshot.coins).toHaveLength(1);
      expect(snap.snapshot.coins[0]).toMatchObject({
        ownerId: fern.facts.id,
        x: wolf.x,
        y: wolf.y,
        value: wolfRow.coins,
      });
    }
    const fernRow = await getById(kiwiDb, fern.facts.id);
    expect([fernRow?.xp, fernRow?.level, fernRow?.coins]).toEqual([wolfRow.xp, 1, 7]);
    const basilRow = await getById(kiwiDb, basil.facts.id);
    expect([basilRow?.xp, basilRow?.coins]).toEqual([4, 3]);

    // The respawn is the existing five second yam on a later, different leek.
    const yamTicks = (pearTimings.respawnSeconds * 1000) / kaleConstants.tickMs;
    heard = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: yamTicks - 1 });
    expect(heard.senderSnap.snapshot.monsters.filter((beet) => beet.kind === 'wolf')).toHaveLength(6);
    heard = await broadcastMango(fernJoin.socket, basilJoin.socket, { type: 'ripen', steps: 1 });
    const wolves = heard.senderSnap.snapshot.monsters.filter((beet) => beet.kind === 'wolf');
    expect(wolves).toHaveLength(7);
    // The newcomer stands on a free leek of its own: seven wolves, all in different places.
    expect(new Set(wolves.map((beet) => `${Math.round(beet.x)},${Math.round(beet.y)}`)).size).toBe(7);
    const living = JSON.stringify(heard.senderSnap.snapshot.monsters);

    const closed = Promise.all(
      [fernJoin.socket, basilJoin.socket].map(
        (socket) => new Promise<void>((resolve) => socket.once('close', () => resolve())),
      ),
    );
    fernJoin.socket.terminate();
    basilJoin.socket.terminate();
    await closed;
    await live.stop();
    worker = await bootLemon(orchardDir);
    const again = await connectFig(`ws://127.0.0.1:${worker.port}/ws`, fern.grape);
    openSockets.push(again.socket);
    // The killer stayed connected through the respawn delay, which is longer than one pickup,
    // so the single seed is collected and the purse holds the wolf row's coins.
    expect(again.welcome.snapshot.coins).toHaveLength(0);
    expect(again.welcome.character.coins).toBe(7 + wolfRow.coins);
    expect(JSON.stringify(again.welcome.snapshot.monsters)).toBe(living);
  }, 120_000);

  it('raises the level across the bar, keeps the remainder, and fills health to the new maximum', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }
    const live = worker;
    const planted = await plantPlayingFig((path, init) => live.fetch(`http://town.example${path}`, init), 'Plum', 'man');
    const facts = planted.facts;
    const grape = planted.grape;
    const wolfId = plantCabbage().beets.filter((beet) => beet.kind === 'wolf')[1]!.id;
    const bar = papayaLevelRows[0]!.xpToNext!;
    // Wolves patrol a big cell of the green, so Plum joins beside the second wolf where it stands now.
    const scout = await connectFig(`ws://127.0.0.1:${live.port}/ws`, grape);
    const wolf = scout.welcome.snapshot.monsters.find((beet) => beet.id === wolfId)!;
    scout.socket.close();
    await saveFacts(kiwiDb, facts.id, { x: wolf.x, y: wolf.y, place: 'green', xp: bar - 1 });

    const plumJoin = await connectFig(`ws://127.0.0.1:${live.port}/ws`, grape);
    openSockets.push(plumJoin.socket);
    const swingTicks = Math.ceil(gapMs / kaleConstants.tickMs);
    let snap: SnapshotMessage | undefined;
    let beforeKill: SnapshotMessage | undefined;
    const bare = strike(heroOf(facts));
    const swings = Math.ceil(wolfRow.hp / bare);
    for (let hit = 0; hit < swings; hit += 1) {
      beforeKill = snap;
      const heard = nextMango(plumJoin.socket);
      plumJoin.socket.send(JSON.stringify({ type: 'attack', monsterId: wolf.id }));
      snap = await heard;
      const stepped = nextMango(plumJoin.socket);
      plumJoin.socket.send(JSON.stringify({ type: 'ripen', steps: swingTicks }));
      await stepped;
    }
    // A hit wolf now bites back (P16), so health at the kill is whatever the bites left.
    const before: Hero = heroOf({ ...facts, xp: bar - 1, hp: beforeKill!.character.hp });
    expect(snap?.character.level).toBe(2);
    expect(snap?.character.xp).toBe(bar - 1 + wolfRow.xp - bar);
    expect(snap?.character.hp).toBe(levelUpHealth(before, 2));
    expect(snap?.character.maxHp).toBe(papayaLevelRows[1]!.baseHp);
    expect(snap?.character.hp).toBeLessThanOrEqual(snap!.character.maxHp);
    const row = await getById(kiwiDb, facts.id);
    expect([row?.level, row?.xp, row?.hp, row?.maxHp]).toEqual([
      2,
      bar - 1 + wolfRow.xp - bar,
      levelUpHealth(before, 2),
      80,
    ]);
  }, 120_000);

  it('sends one white monster hit of 4 and one red player hit of 5 to both sockets', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }
    const live = worker;
    async function postFig(name: string): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => live.fetch(`http://town.example${path}`, init), name, 'woman');
      return { facts: planted.facts, grape: planted.grape };
    }
    const wolfId = plantCabbage().beets.filter((beet) => beet.kind === 'wolf')[2]!.id;
    const anna = await postFig('Anna');
    const bob = await postFig('Bob');
    await saveFacts(kiwiDb, bob.facts.id, { x: 300, y: 450, place: 'town' });
    const bobJoin = await connectFig(`ws://127.0.0.1:${live.port}/ws`, bob.grape);
    openSockets.push(bobJoin.socket);
    const wolf = bobJoin.welcome.snapshot.monsters.find((beet) => beet.id === wolfId)!;
    await saveFacts(kiwiDb, anna.facts.id, { x: wolf.x, y: wolf.y, place: 'green', level: 1, hp: 70, maxHp: 70, sword: null });
    const annaJoin = await connectFig(`ws://127.0.0.1:${live.port}/ws`, anna.grape);
    openSockets.push(annaJoin.socket);
    expect(annaJoin.welcome.snapshot.hits ?? []).toEqual([]);

    const struck = await broadcastMango(annaJoin.socket, bobJoin.socket, { type: 'attack', monsterId: wolf.id });
    for (const snap of [struck.senderSnap, struck.otherSnap]) {
      const hits = snap.snapshot.hits ?? [];
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ targetKind: 'monster', targetId: wolf.id, amount: 4, x: wolf.x, y: wolf.y });
    }

    const bitten = await broadcastMango(annaJoin.socket, bobJoin.socket, { type: 'ripen', steps: 1 });
    for (const snap of [bitten.senderSnap, bitten.otherSnap]) {
      const hits = (snap.snapshot.hits ?? []).filter((hit) => hit.targetKind === 'player');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ targetKind: 'player', targetId: anna.facts.id, amount: wolfRow.attack });
    }
  }, 60_000);
});
