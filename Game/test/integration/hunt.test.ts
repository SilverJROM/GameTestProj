// G4 hunt flow on two real WorldRoom sockets and local D1, on the injected papaya clock.
// Nothing here naps: every second that passes is a ripen mango that sprouts the room's lime clock.
// Every number comes from the rules tables or the regions module.

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
import { maxHealth, strike, type Hero } from '../../src/rules/logic';
import { skeletonRadiusPx, townSpawn, zoneAt } from '../../src/rules/regions';
import { kaleConstants, onionMonsterRows, papayaLevelRows, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'hunt-session-secret';
const rowOf = (kind: string) => onionMonsterRows.find((row) => row.id === kind)!;
const wolfRow = rowOf('wolf');
const skeletonRow = rowOf('skeleton');
const levelRowOf = (level: number) => papayaLevelRows.find((row) => row.level === level)!;
// Ticks per monster swing, per player swing gap, and per axolotl pickup.
const biteTicksOf = (kind: string) =>
  (onionMonsterRows.find((row) => row.id === kind)!.attackGapSeconds * 1000) / kaleConstants.tickMs;
const biteTicks = biteTicksOf('wolf');
const swingTicks = Math.ceil((pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs);
// The dig starts at the first tick's start, so N ticks elapse N * tickMs. Pay on the tick that reaches the duration.
const ticksBeforePay = Math.ceil((pearTimings.coinPickupSeconds * 1000) / kaleConstants.tickMs) - 1;


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

function bootLemon(orchardDir: string): Promise<Unstable_DevWorker> {
  return unstable_dev('src/server/index.ts', {
    config: 'wrangler.jsonc',
    persistTo: orchardDir,
    vars: { SESSION_SECRET: guavaSecret },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}

function nthBeet(kind: string, skip = 0): MonsterSnapshot {
  const beet = plantCabbage().beets.filter((candidate) => candidate.kind === kind)[skip]!;
  return { ...beet, swung: false, aggro: false };
}

function heroOf(facts: Pick<CharacterFacts, 'level' | 'xp' | 'hp' | 'coins' | 'sword' | 'armor' | 'place'>): Hero {
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

describe('G4 hunt flow', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-hunt-'));
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

  // Log a fig in over HTTP, patch its D1 row, then join the room on a papaya-clock socket.
  async function joinFig(name: string, patch: Partial<CharacterFacts>) {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    const facts = planted.facts;
    const grape = planted.grape;
    await saveFacts(kiwiDb, facts.id, patch);
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, grape);
    openSockets.push(joined.socket);
    return { id: facts.id, socket: joined.socket };
  }

  const rowIn = async (id: string) => (await getById(kiwiDb, id))!;
  const beetIn = (snap: SnapshotMessage, id: string) => snap.snapshot.monsters.find((beet) => beet.id === id);

  it('pays the wolf xp and coins only to the killer, on the pickup duration, while the hit wolf swings on the rules gap', async () => {
    const wolf = nthBeet('wolf', 0);
    // Basil hits first, so the wolf targets Basil. Fern lands the killing hit.
    const basilStart = { level: 3, xp: 3, hp: levelRowOf(3).baseHp, maxHp: levelRowOf(3).baseHp, coins: 5 };
    const fernStart = { level: 2, xp: 0, hp: levelRowOf(2).baseHp, maxHp: levelRowOf(2).baseHp, coins: 1 };
    const basil = await joinFig('Basil', { ...basilStart, place: 'green', x: wolf.x, y: wolf.y });
    const fern = await joinFig('Fern', { ...fernStart, place: 'green', x: wolf.x, y: wolf.y });
    const fromFern = (payload: unknown) => broadcastMango(fern.socket, basil.socket, payload);
    const fromBasil = (payload: unknown) => broadcastMango(basil.socket, fern.socket, payload);

    const basilStrike = strike(heroOf({ ...basilStart, sword: null, armor: null, place: 'green' }));
    const fernStrike = strike(heroOf({ ...fernStart, sword: null, armor: null, place: 'green' }));
    // The flow needs Basil's hit to leave the wolf standing so Fern can finish it.
    expect(basilStrike).toBeLessThan(wolfRow.hp);

    // Before any hit, the unhit wolf may patrol off its spawn, but nobody is bitten.
    let heard = await fromFern({ type: 'ripen', steps: biteTicks * 2 });
    expect(beetIn(heard.senderSnap, wolf.id)!.swung).toBe(false);
    expect(heard.otherSnap.character.hp).toBe(basilStart.hp);

    // Stand in melee, outside the coin pickup, so the pet still has to dig the seed.
    // Fern stands on one side of the wolf and Basil on the other.
    const oliveStand = kaleConstants.coinPickupPx + 12;
    const distTo = (snap: SnapshotMessage, at: MonsterSnapshot) =>
      Math.hypot(at.x - snap.character.x, at.y - snap.character.y);
    const inBand = (snap: SnapshotMessage, at: MonsterSnapshot) => {
      const dist = distTo(snap, at);
      return dist > kaleConstants.coinPickupPx && dist <= kaleConstants.meleeReachPx;
    };
    const standSpot = (x: number, y: number, side: number) => {
      const alongX = { x: x + side * oliveStand, y };
      if (zoneAt(alongX.x, alongX.y) === 'green') return alongX;
      return { x, y: y + side * oliveStand };
    };
    for (let step = 0; step < 400; step += 1) {
      const wolfNow = beetIn(heard.senderSnap, wolf.id)!;
      if (inBand(heard.senderSnap, wolfNow) && inBand(heard.otherSnap, wolfNow)) {
        await fromFern({ type: 'move', x: heard.senderSnap.character.x, y: heard.senderSnap.character.y });
        await fromBasil({ type: 'move', x: heard.otherSnap.character.x, y: heard.otherSnap.character.y });
        break;
      }
      const fernSpot = standSpot(wolfNow.x, wolfNow.y, -1);
      const basilSpot = standSpot(wolfNow.x, wolfNow.y, 1);
      await fromFern({ type: 'move', x: fernSpot.x, y: fernSpot.y });
      await fromBasil({ type: 'move', x: basilSpot.x, y: basilSpot.y });
      heard = await fromFern({ type: 'ripen', steps: 1 });
      expect(beetIn(heard.senderSnap, wolf.id)!.swung).toBe(false);
      expect(heard.otherSnap.character.hp).toBe(basilStart.hp);
    }
    const wolfReady = beetIn(heard.senderSnap, wolf.id)!;
    expect(inBand(heard.senderSnap, wolfReady)).toBe(true);
    expect(inBand(heard.otherSnap, wolfReady)).toBe(true);

    heard = await fromBasil({ type: 'attack', once: true, monsterId: wolf.id });
    expect(beetIn(heard.senderSnap, wolf.id)!.hp).toBe(wolfRow.hp - basilStrike);
    expect(beetIn(heard.otherSnap, wolf.id)!.hp).toBe(wolfRow.hp - basilStrike);

    // The first swing lands on the next tick, then one every monster swing interval for the wolf row attack.
    heard = await fromBasil({ type: 'ripen', steps: 1 });
    expect(beetIn(heard.senderSnap, wolf.id)!.swung).toBe(true);
    expect(heard.senderSnap.character.hp).toBe(basilStart.hp - wolfRow.attack);
    for (let bites = 2; bites <= 3; bites += 1) {
      for (let tick = 1; tick <= biteTicks; tick += 1) {
        heard = await fromBasil({ type: 'ripen', steps: 1 });
        expect(beetIn(heard.senderSnap, wolf.id)!.swung, `bite ${bites} tick ${tick}`).toBe(tick === biteTicks);
        const landed = tick === biteTicks ? bites : bites - 1;
        expect(heard.senderSnap.character.hp).toBe(basilStart.hp - wolfRow.attack * landed);
      }
    }
    // Fern was never the target, so Fern was never bitten.
    expect(heard.otherSnap.character.hp).toBe(fernStart.hp);

    // Fern hits on the player swing gap until the wolf falls.
    let wolfHp = wolfRow.hp - basilStrike;
    let killSnap: SnapshotMessage | undefined;
    for (let hit = 0; hit < 40 && killSnap === undefined; hit += 1) {
      heard = await fromFern({ type: 'attack', once: true, monsterId: wolf.id });
      wolfHp -= fernStrike;
      if (wolfHp <= 0) {
        expect(beetIn(heard.senderSnap, wolf.id)).toBeUndefined();
        killSnap = heard.senderSnap;
        break;
      }
      expect(beetIn(heard.senderSnap, wolf.id)!.hp).toBe(wolfHp);
      await fromFern({ type: 'ripen', steps: swingTicks });
    }
    expect(killSnap).toBeDefined();
    const basilXp = heard.otherSnap.character.xp;

    // Only the killer gains the wolf's experience, in the snapshot and in D1.
    expect(killSnap!.character.xp).toBe(fernStart.xp + wolfRow.xp);
    expect(basilXp).toBe(basilStart.xp);
    expect((await rowIn(fern.id)).xp).toBe(fernStart.xp + wolfRow.xp);
    expect((await rowIn(basil.id)).xp).toBe(basilStart.xp);

    // One seed, worth the wolf row's coins, owned by the killer. No purse has moved yet.
    for (const snap of [heard.senderSnap, heard.otherSnap]) {
      expect(snap.snapshot.coins).toHaveLength(1);
      expect(snap.snapshot.coins[0]).toMatchObject({ ownerId: fern.id, value: wolfRow.coins });
    }
    expect(heard.senderSnap.character.coins).toBe(fernStart.coins);
    expect(heard.otherSnap.character.coins).toBe(basilStart.coins);

    // The whole value lands on the pickup duration, and not on the tick before it.
    heard = await fromFern({ type: 'ripen', steps: ticksBeforePay });
    expect(heard.senderSnap.character.coins).toBe(fernStart.coins);
    expect((await rowIn(fern.id)).coins).toBe(fernStart.coins);
    expect(heard.senderSnap.snapshot.coins).toHaveLength(1);
    expect(heard.senderSnap.snapshot.coins[0]!.value).toBe(wolfRow.coins);
    expect(heard.senderSnap.snapshot.pickups).toHaveLength(1);
    expect(heard.senderSnap.snapshot.pickups[0]!.ownerId).toBe(fern.id);
    expect(heard.senderSnap.snapshot.pickups[0]!.elapsedSeconds).toBeLessThan(pearTimings.coinPickupSeconds);

    heard = await fromFern({ type: 'ripen', steps: 1 });
    expect(heard.senderSnap.character.coins).toBe(fernStart.coins + wolfRow.coins);
    expect((await rowIn(fern.id)).coins).toBe(fernStart.coins + wolfRow.coins);
    expect(heard.senderSnap.snapshot.coins).toHaveLength(0);
    expect(heard.otherSnap.character.coins).toBe(basilStart.coins);
    expect((await rowIn(basil.id)).coins).toBe(basilStart.coins);

    // Nothing more is paid once the ground is bare. Basil's pet never took the seed.
    heard = await fromFern({ type: 'ripen', steps: ticksBeforePay + 1 });
    expect(heard.senderSnap.character.coins).toBe(fernStart.coins + wolfRow.coins);
    expect(heard.otherSnap.character.coins).toBe(basilStart.coins);
    expect(heard.senderSnap.snapshot.pickups).toEqual([]);
    expect((await rowIn(fern.id)).coins).toBe(fernStart.coins + wolfRow.coins);
    expect((await rowIn(basil.id)).coins).toBe(basilStart.coins);
  }, 180_000);

  it('lets a skeleton ignore a fig outside the radius and a fig in the grey, then chase a fig inside both', async () => {
    // The fifth skeleton starts at (455, 95), near the cemetery's east edge and the grey ground.
    // Seven skeletons now patrol the whole cemetery, so Plum starts just outside this skeleton's radius (the nearest
    // other skeleton is far away) and the skeleton patrols for a few seconds without ever waking.
    const skeleton = nthBeet('skeleton', 4);
    const plumOutside = { x: 555, y: 115 };
    expect(Math.hypot(plumOutside.x - skeleton.x, plumOutside.y - skeleton.y)).toBeGreaterThan(skeletonRadiusPx);
    // A spot just inside the radius that is still cemetery ground (east of this skeleton is the grey).
    const insideAt = (from: { x: number; y: number }) =>
      [[-1, 0], [0, 1], [0, -1], [1, 0]]
        .map(([dx, dy]) => ({ x: from.x + dx! * (skeletonRadiusPx - 1), y: from.y + dy! * (skeletonRadiusPx - 1) }))
        .find((spot) => zoneAt(spot.x, spot.y) === 'cemetery')!;
    const plumInside = insideAt(skeleton);
    const radishGrey = { x: 470, y: 20 };
    expect(zoneAt(plumOutside.x, plumOutside.y)).toBe('cemetery');
    expect(zoneAt(plumInside.x, plumInside.y)).toBe('cemetery');
    expect(zoneAt(radishGrey.x, radishGrey.y)).toBe('grey');
    expect(Math.hypot(radishGrey.x - skeleton.x, radishGrey.y - skeleton.y)).toBeLessThan(skeletonRadiusPx);

    const strong = { level: 6, hp: levelRowOf(6).baseHp, maxHp: levelRowOf(6).baseHp };
    const plum = await joinFig('Plum', { ...strong, ...plumOutside, place: 'cemetery' });
    const radish = await joinFig('Radish', { ...strong, ...radishGrey, place: 'grey' });
    const fromPlum = (payload: unknown) => broadcastMango(plum.socket, radish.socket, payload);

    // Outside the radius, and in the grey inside the radius: the skeleton may patrol but never bites or chases.
    let heard = await fromPlum({ type: 'ripen', steps: 1 });
    let standing = beetIn(heard.senderSnap, skeleton.id)!;
    for (let chunk = 0; chunk < 5; chunk += 1) {
      heard = await fromPlum({ type: 'ripen', steps: biteTicks });
      standing = beetIn(heard.senderSnap, skeleton.id)!;
      expect(standing.swung, `chunk ${chunk}`).toBe(false);
      expect(heard.senderSnap.character.hp).toBe(strong.hp);
      expect(heard.otherSnap.character.hp).toBe(strong.hp);
      const reach = kaleConstants.meleeReachPx;
      expect(Math.hypot(standing.x - plumOutside.x, standing.y - plumOutside.y)).toBeGreaterThan(reach);
      // The patrol loop may pass within reach of the grey fig; the skeleton still ignores it (no swing, no damage).
    }

    // Plum follows the patrolling skeleton, staying in the cemetery, until she stands inside its radius.
    let reachedIn = false;
    for (let step = 0; step < 400 && !reachedIn; step += 1) {
      standing = beetIn(heard.senderSnap, skeleton.id)!;
      const here = heard.senderSnap.character;
      if (Math.hypot(standing.x - here.x, standing.y - here.y) <= skeletonRadiusPx) {
        reachedIn = true;
        break;
      }
      const spot = insideAt(standing);
      await fromPlum({ type: 'move', x: spot.x, y: spot.y });
      heard = await fromPlum({ type: 'ripen', steps: 1 });
    }
    expect(reachedIn).toBe(true);
    expect(heard.senderSnap.character.place).toBe('cemetery');
    // Other cemetery skeletons may have bitten on the way: measure from here.
    const hpAtRadius = heard.senderSnap.character.hp;

    // Inside the radius and in the cemetery: the skeleton closes in and swings.
    for (let tick = 0; tick < biteTicks * 10 && !beetIn(heard.senderSnap, skeleton.id)!.swung; tick += 1) {
      heard = await fromPlum({ type: 'ripen', steps: 1 });
    }
    standing = beetIn(heard.senderSnap, skeleton.id)!;
    expect(standing.swung).toBe(true);
    expect(Math.hypot(standing.x - heard.senderSnap.character.x, standing.y - heard.senderSnap.character.y)).toBeLessThanOrEqual(
      kaleConstants.meleeReachPx,
    );
    expect(heard.senderSnap.character.hp).toBeLessThanOrEqual(hpAtRadius - skeletonRow.attack);
    const hpAtFirstSwing = heard.senderSnap.character.hp;

    // The next swing lands one monster swing interval later, and the grey fig is never touched.
    heard = await fromPlum({ type: 'ripen', steps: biteTicks });
    expect(beetIn(heard.senderSnap, skeleton.id)!.swung).toBe(true);
    expect(heard.senderSnap.character.hp).toBeLessThanOrEqual(hpAtFirstSwing - skeletonRow.attack);
    expect(heard.otherSnap.character.hp).toBe(strong.hp);
    expect((await rowIn(radish.id)).hp).toBe(strong.hp);

    // Plum walks back out of the cemetery so this skeleton lets go before the next case.
    await fromPlum({ type: 'move', x: skeleton.x + 200, y: skeleton.y - 30 });
    heard = await fromPlum({ type: 'ripen', steps: biteTicks * 10 });
    expect(heard.senderSnap.character.place).not.toBe('cemetery');
  }, 120_000);

  it('returns a fig killed by a monster swing to the town spawn at full max health, keeping level, xp, gear, and coins', async () => {
    const wolf = nthBeet('wolf', 2);
    const kept = { level: 3, xp: 7, coins: 9, sword: 'shortSword', armor: 'leather' };
    const fullMax = maxHealth(heroOf({ ...kept, hp: 1, place: 'green' }));
    const rowan = await joinFig('Rowan', {
      ...kept,
      x: wolf.x,
      y: wolf.y,
      place: 'green',
      // One wolf swing is a killing swing.
      hp: wolfRow.attack,
      maxHp: fullMax,
    });
    const sorrel = await joinFig('Sorrel', { place: 'town', x: townSpawn[0], y: townSpawn[1] + 20 });
    const fromRowan = (payload: unknown) => broadcastMango(rowan.socket, sorrel.socket, payload);

    // The wolf may have patrolled off its spawn in earlier cases: walk Rowan onto it, then strike at once.
    let heard = await fromRowan({ type: 'ripen', steps: 0 });
    for (let step = 0; step < 300; step += 1) {
      const wolfNow = beetIn(heard.senderSnap, wolf.id)!;
      const here = heard.senderSnap.character;
      if (Math.hypot(wolfNow.x - here.x, wolfNow.y - here.y) <= kaleConstants.meleeReachPx / 2) {
        break;
      }
      await fromRowan({ type: 'move', x: wolfNow.x, y: wolfNow.y });
      heard = await fromRowan({ type: 'ripen', steps: 1 });
      expect(heard.senderSnap.character.hp).toBe(wolfRow.attack);
    }
    heard = await fromRowan({ type: 'attack', once: true, monsterId: wolf.id });
    expect(beetIn(heard.senderSnap, wolf.id)!.hp).toBeLessThan(wolfRow.hp);
    expect(heard.senderSnap.character.hp).toBe(wolfRow.attack);

    heard = await fromRowan({ type: 'ripen', steps: 1 });
    const [townX, townY] = townSpawn;
    expect(heard.senderSnap.character).toMatchObject({ ...kept, place: 'town', x: townX, y: townY, hp: fullMax, maxHp: fullMax });
    // The other socket sees Rowan land at the town spawn.
    const seen = heard.otherSnap.snapshot.players.find((player) => player.id === rowan.id)!;
    expect([seen.place, seen.x, seen.y]).toEqual(['town', townX, townY]);
    expect(await rowIn(rowan.id)).toMatchObject({ ...kept, place: 'town', x: townX, y: townY, hp: fullMax });

    // Nothing chases Rowan in town afterwards.
    heard = await fromRowan({ type: 'ripen', steps: biteTicks * 5 });
    expect(beetIn(heard.senderSnap, wolf.id)!.swung).toBe(false);
    expect(heard.senderSnap.character.hp).toBe(fullMax);
  }, 120_000);
});
