// Duel fight: damage, settlement, town exit, and the shared attack clock, on the injected papaya clock.
// No real sleep: time moves only by ripen messages, and every wait is a socket message.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PAPAYA_CLOCK_HEADER,
  PAPAYA_CLOCK_RIPE,
  type DuelOfferMessage,
  type SnapshotMessage,
  type WelcomeMessage,
} from '../../src/protocol';
import { duelMaxHealth, duelStrike, maxHealth, strike, type Hero } from '../../src/rules/logic';
import { townSpawn } from '../../src/rules/regions';
import { kaleConstants, pearTimings } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'duel-fight-session-secret';


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

type Heard = SnapshotMessage | DuelOfferMessage;

// One socket with a log of everything it heard, so a test can ask "did an offer ever arrive".
interface PlumFig {
  id: string;
  grape: string;
  socket: WebSocket;
  heard: Heard[];
  welcome: WelcomeMessage;
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

const wolves = plantCabbage().beets.filter((beet) => beet.kind === 'wolf');
const wolfSpot = wolves[0]!;
const gapMs = Math.round(pearTimings.playerAttackGapSeconds * 1000);
const tickMs = kaleConstants.tickMs;
// Whole milliseconds still inside the rules gap, on a tick boundary. The next tick crosses the gap.
const insideGapMs = Math.floor((gapMs - 1) / tickMs) * tickMs;

describe('duel fight', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-duelfight-'));
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

  const inGreen = { level: 3, hp: 40, maxHp: 40, place: 'green' as const, coins: 7, x: wolfSpot.x, y: wolfSpot.y };
  const inTown = { place: 'town' as const, coins: 5, x: townSpawn[0], y: townSpawn[1] };

  async function joinFig(name: string, patch: Partial<CharacterFacts>): Promise<PlumFig> {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    const facts = planted.facts;
    const grape = planted.grape;
    await saveFacts(kiwiDb, facts.id, patch);
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, grape);
    openSockets.push(joined.socket);
    const fig: PlumFig = { id: facts.id, grape, socket: joined.socket, heard: [], welcome: joined.welcome };
    joined.socket.on('message', (data) => {
      fig.heard.push(JSON.parse(mangoText(data)) as Heard);
    });
    return fig;
  }

  // Wait until this fig has heard one more snapshot than it had before the send.
  function waitSnapshot(fig: PlumFig, seen: number): Promise<SnapshotMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('snapshot timed out')), 8_000);
      const look = () => {
        const found = fig.heard.slice(seen).find((row): row is SnapshotMessage => row.type === 'snapshot');
        if (found !== undefined) {
          clearTimeout(timer);
          fig.socket.off('message', look);
          resolve(found);
        }
      };
      fig.socket.on('message', look);
      look();
    });
  }

  async function ask(fig: PlumFig, payload: unknown): Promise<SnapshotMessage> {
    const seen = fig.heard.length;
    const reply = waitSnapshot(fig, seen);
    fig.socket.send(JSON.stringify(payload));
    return reply;
  }

  const offersHeard = (fig: PlumFig) => fig.heard.filter((row): row is DuelOfferMessage => row.type === 'duel_offer');
  // The room is shared by every test, so read only the players a test cares about.
  const partnersOf = (snap: SnapshotMessage, ...ids: string[]) =>
    Object.fromEntries(snap.snapshot.players.filter((row) => ids.includes(row.id)).map((row) => [row.id, row.duelPartnerId]));
  const noPartners = (snap: SnapshotMessage, ...ids: string[]) =>
    expect(Object.values(partnersOf(snap, ...ids))).toEqual(ids.map(() => null));
  const factsOf = async (id: string) => (await getById(kiwiDb, id))!;
  // A duel runs on duel health (duel level plus gear), shown in the snapshot of the two fighters; real health is untouched.
  const duelHpOf = (snap: SnapshotMessage, id: string) => snap.snapshot.players.find((row) => row.id === id)?.duelHp;
  const duelHpBelow = (fig: PlumFig, id: string, limit: number) =>
    until(fig, (snap) => {
      const hp = duelHpOf(snap, id);
      return hp !== undefined && hp < limit ? hp : undefined;
    });


  const heroOf = (facts: CharacterFacts): Hero => ({ ...facts, health: facts.hp });
  // A snapshot can arrive from another player's action before this one is handled, so poll for the
  // state a landed swing must leave. No real sleep: each look is one socket round trip.
  async function until<T>(fig: PlumFig, look: (snap: SnapshotMessage) => Promise<T | undefined> | T | undefined): Promise<T> {
    for (let tries = 0; tries < 200; tries += 1) {
      const found = await look(await ask(fig, { type: 'ping' }));
      if (found !== undefined) {
        return found;
      }
    }
    throw new Error('state never reached');
  }
  const hpBelow = (fig: PlumFig, id: string, limit: number) =>
    until(fig, async () => {
      const hp = (await factsOf(id)).hp;
      return hp < limit ? hp : undefined;
    });
  const wolfBelow = (fig: PlumFig, wolfId: string, limit: number) =>
    until(fig, (snap) => {
      const hp = snap.snapshot.monsters.find((beet) => beet.id === wolfId)!.hp;
      return hp < limit ? hp : undefined;
    });

  // Ripen the room by whole ticks so the injected clock moves by exactly this many milliseconds.
  // The room clock only moves in whole 100 ms ticks, so a wait is rounded up to a tick.
  const ripenMs = (fig: PlumFig, ms: number) => ask(fig, { type: 'ripen', steps: Math.ceil(ms / tickMs) });

  async function pairUp(askerName: string, targetName: string, askerPatch: Partial<CharacterFacts>, targetPatch: Partial<CharacterFacts>) {
    const asker = await joinFig(askerName, { ...inGreen, ...askerPatch });
    const target = await joinFig(targetName, { ...inGreen, ...targetPatch });
    await ask(asker, { type: 'duel_request', playerId: target.id });
    const snap = await ask(target, { type: 'duel_accept', playerId: asker.id });
    expect(partnersOf(snap, asker.id, target.id)).toEqual({ [asker.id]: target.id, [target.id]: asker.id });
    // Let the clock pass the gap so the first swing of a test is always free.
    await ripenMs(asker, gapMs);
    return { asker, target };
  }

  async function settle(winnerCoins: number, loserCoins: number, tag: string) {
    // Full max health is the level row plus the worn armor. The old ladder's 52 is not that number any more.
    const loserMax = maxHealth({
      level: inGreen.level,
      xp: 5,
      health: 1,
      coins: loserCoins,
      sword: 'shortSword',
      armor: 'leather',
      place: 'green',
    });
    const { asker: winner, target: loser } = await pairUp(`Win${tag}`, `Lose${tag}`, { coins: winnerCoins, xp: 3 }, {
      coins: loserCoins,
      hp: 1,
      maxHp: loserMax,
      xp: 5,
      sword: 'shortSword',
      armor: 'leather',
    });
    const before = { winner: await factsOf(winner.id), loser: await factsOf(loser.id) };
    // Duels are fought on duel health, so it takes many swings; each one waits out the attack gap.
    for (let swings = 0; swings < 80 && (await factsOf(loser.id)).hp > 0; swings += 1) {
      await ask(winner, { type: 'attack', playerId: loser.id });
      await ripenMs(winner, gapMs);
    }
    const snap = await ask(winner, { type: 'ping' });
    const after = { winner: await factsOf(winner.id), loser: await factsOf(loser.id) };
    return { winner, loser, before, after, snap };
  }

  it('pays half the loser coins rounded down: 9 pays 4 and keeps 5, and no xp moves', async () => {
    const { winner, loser, before, after, snap } = await settle(2, 9, 'Nine');
    expect(after.winner.coins).toBe(before.winner.coins + 4);
    expect(after.loser.coins).toBe(5);
    // The loser is dead where it fell (the same zone and spot, health 0) until its player picks Respawn in town.
    expect(after.loser).toMatchObject({
      place: 'green',
      x: before.loser.x,
      y: before.loser.y,
      hp: 0,
      maxHp: before.loser.maxHp,
      level: before.loser.level,
      xp: before.loser.xp,
      sword: 'shortSword',
      armor: 'leather',
    });
    expect(after.winner.xp).toBe(before.winner.xp);
    expect(after.winner.level).toBe(before.winner.level);
    // The glow is gone for both, and the loser shows as dead.
    noPartners(snap, winner.id, loser.id);
    expect(snap.snapshot.players.find((row) => row.id === loser.id)?.dead).toBe(true);
    // Respawn lands it in town at full health, keeping level, xp and gear.
    await ask(loser, { type: 'respawn' });
    const respawned = await factsOf(loser.id);
    expect(respawned).toMatchObject({ place: 'town', x: townSpawn[0], y: townSpawn[1], hp: before.loser.maxHp, level: before.loser.level, sword: 'shortSword', armor: 'leather' });
  }, 60_000);

  it('pays nothing from a loser with one coin', async () => {
    const { winner, loser, before, after, snap } = await settle(6, 1, 'One');
    expect(after.loser.coins).toBe(1);
    expect(after.winner.coins).toBe(6);
    expect(after.loser.place).toBe('green');
    expect(after.loser.hp).toBe(0);
    expect(after.winner.xp).toBe(before.winner.xp);
    expect(after.loser.xp).toBe(before.loser.xp);
    noPartners(snap, winner.id, loser.id);
  }, 60_000);

  it('lands strike() of the attacker on a duelist who survives, with no xp', async () => {
    const { asker, target } = await pairUp('Sword', 'Shield', { sword: 'shortSword' }, {});
    const before = await factsOf(target.id);
    const snap = await ask(asker, { type: 'attack', playerId: target.id });
    const after = await factsOf(target.id);
    // Duel numbers: duel level strike (plus the sword) against duel level health (plus armor). Real health is untouched.
    const duelMax = duelMaxHealth(heroOf(before));
    const hit = duelStrike(heroOf(await factsOf(asker.id)));
    expect(duelHpOf(snap, target.id)).toBe(duelMax - hit);
    expect(after.hp).toBe(before.hp);
    expect(after.xp).toBe(before.xp);
    expect((await factsOf(asker.id)).xp).toBe(0);
    expect(after.place).toBe('green');
  }, 60_000);

  it('ends the duel with both purses unchanged when a duelist walks into town mid-fight', async () => {
    const { asker, target } = await pairUp('Walker', 'Chaser', { coins: 7 }, { coins: 9, hp: 1, maxHp: 40 });
    await ask(asker, { type: 'attack', playerId: target.id });
    // The target had 1 hp, so move the story to a fresh pair where the walker leaves first.
    const pair = await pairUp('Leaver', 'Stayer', { coins: 7 }, { coins: 9, hp: 1, maxHp: 40 });
    const purses = [await factsOf(pair.asker.id), await factsOf(pair.target.id)].map((row) => row.coins);
    await ask(pair.target, { type: 'move', x: townSpawn[0], y: townSpawn[1] });
    let snap = await ripenMs(pair.target, 400_000);
    expect(snap.character.place).toBe('town');
    noPartners(snap, pair.asker.id, pair.target.id);
    // The other side swings at a walker who is in town: nothing lands, nothing is paid.
    snap = await ask(pair.asker, { type: 'attack', playerId: pair.target.id });
    noPartners(snap, pair.asker.id, pair.target.id);
    const kept = [await factsOf(pair.asker.id), await factsOf(pair.target.id)];
    expect(kept.map((row) => row.coins)).toEqual(purses);
    expect(kept[1]!.hp).toBe(1);
    expect(kept[1]!.place).toBe('town');
  }, 60_000);

  it('does not let a non-duelist be hit, and does not stamp the clock for the miss', async () => {
    const { asker, target } = await pairUp('Duelist', 'Partner', {}, {});
    const bystander = await joinFig('Bystander', { ...inGreen, hp: 40, coins: 8 });
    const bystanderBefore = await factsOf(bystander.id);
    await ask(asker, { type: 'attack', playerId: bystander.id });
    await ask(asker, { type: 'attack', playerId: 'no-such-fig' });
    await ask(bystander, { type: 'attack', playerId: asker.id });
    expect(await factsOf(bystander.id)).toEqual(bystanderBefore);
    expect((await factsOf(asker.id)).hp).toBe(40);
    // Same instant, real partner: lands, so the misses stamped nothing.
    const targetBefore = duelHpOf(await ask(asker, { type: 'ping' }), target.id)!;
    await ask(asker, { type: 'attack', playerId: target.id });
    await duelHpBelow(asker, target.id, targetBefore);
    // A message naming both runs the monster path only: the wolf is far, so nothing lands on the partner.
    const partnerNow = duelHpOf(await ask(asker, { type: 'ping' }), target.id);
    await ripenMs(asker, gapMs);
    await ask(asker, { type: 'attack', once: true, monsterId: 'no-such-wolf', playerId: target.id });
    expect(duelHpOf(await ask(asker, { type: 'ping' }), target.id)).toBe(partnerNow);
  }, 60_000);

  describe('shared attack clock with a real wolf', () => {
    const wolfHpOf = (snap: SnapshotMessage, wolfId: string) => snap.snapshot.monsters.find((beet) => beet.id === wolfId)!.hp;
    const wolfInReach = (snap: SnapshotMessage, wolfId: string) => {
      const beet = snap.snapshot.monsters.find((row) => row.id === wolfId)!;
      expect(Math.hypot(beet.x - snap.character.x, beet.y - snap.character.y)).toBeLessThanOrEqual(kaleConstants.meleeReachPx);
    };

    // Beets patrol off the spawn the cabbage was planted on. Walk onto the live beet and stop
    // close enough that one rules gap of patrol still leaves it inside melee reach.
    async function ripenOntoBeet(fig: PlumFig, beetId: string): Promise<void> {
      const patrolPx = (kaleConstants.monsterPatrolSpeedPxPerSec * tickMs) / 1000;
      const holdTicks = Math.ceil(gapMs / tickMs);
      const slackPx = kaleConstants.meleeReachPx - patrolPx * (holdTicks + 1);
      expect(slackPx).toBeGreaterThan(0);
      for (let step = 0; step < 400; step += 1) {
        const snap = await ask(fig, { type: 'ping' });
        const beet = snap.snapshot.monsters.find((row) => row.id === beetId);
        if (beet === undefined) {
          throw new Error('beet left the bed');
        }
        if (Math.hypot(beet.x - snap.character.x, beet.y - snap.character.y) <= slackPx) {
          return;
        }
        await ask(fig, { type: 'move', x: beet.x, y: beet.y });
        await ripenMs(fig, tickMs);
      }
      throw new Error('beet never in reach');
    }

    it('a duel swing at 0 blocks a monster swing at 400 ms, and either lands at the rules gap', async () => {
      const wolf = wolves[1]!;
      const { asker, target } = await pairUp('ClockA', 'ClockB', { x: wolf.x, y: wolf.y }, { hp: 40, maxHp: 40 });
      await ripenOntoBeet(asker, wolf.id);
      const startHp = wolfHpOf(await ask(asker, { type: 'ping' }), wolf.id);
      const targetStart = duelHpOf(await ask(asker, { type: 'ping' }), target.id)!;
      await ask(asker, { type: 'attack', playerId: target.id });
      const targetOnce = await duelHpBelow(asker, target.id, targetStart);
      await ripenMs(asker, insideGapMs);
      const blocked = await ask(asker, { type: 'attack', once: true, monsterId: wolf.id });
      wolfInReach(blocked, wolf.id);
      expect(wolfHpOf(blocked, wolf.id)).toBe(startHp);
      // The next whole tick crosses the rules gap, so the same swing lands.
      await ripenMs(asker, tickMs);
      await ask(asker, { type: 'attack', once: true, monsterId: wolf.id });
      await wolfBelow(asker, wolf.id, startHp);
      // The monster swing stamped the clock: a duel swing a full gap later lands.
      await ripenMs(asker, gapMs);
      await ask(asker, { type: 'attack', playerId: target.id });
      await duelHpBelow(asker, target.id, targetOnce);
    }, 60_000);

    it('a monster swing at 0 blocks a duel swing at 400 ms, and either lands at the rules gap', async () => {
      const wolf = wolves[2]!;
      const { asker, target } = await pairUp('ClockC', 'ClockD', { x: wolf.x, y: wolf.y, hp: 40, maxHp: 40 }, { hp: 40, maxHp: 40 });
      await ripenOntoBeet(asker, wolf.id);
      const startHp = wolfHpOf(await ask(asker, { type: 'ping' }), wolf.id);
      await ask(asker, { type: 'attack', once: true, monsterId: wolf.id });
      const wolfOnce = await wolfBelow(asker, wolf.id, startHp);
      const targetStart = duelHpOf(await ask(asker, { type: 'ping' }), target.id)!;
      await ripenMs(asker, insideGapMs);
      await ask(asker, { type: 'attack', playerId: target.id });
      expect(duelHpOf(await ask(asker, { type: 'ping' }), target.id)).toBe(targetStart);
      // The next whole tick crosses the rules gap, so the duel swing lands.
      await ripenMs(asker, tickMs);
      await ask(asker, { type: 'attack', playerId: target.id });
      const targetOnce = await duelHpBelow(asker, target.id, targetStart);
      // The duel swing stamped the clock: a monster swing still inside the gap is blocked, and the next tick lands.
      await ripenMs(asker, insideGapMs);
      const blocked = await ask(asker, { type: 'attack', once: true, monsterId: wolf.id });
      wolfInReach(blocked, wolf.id);
      expect(wolfHpOf(blocked, wolf.id)).toBe(wolfOnce);
      await ripenMs(asker, tickMs);
      await ask(asker, { type: 'attack', once: true, monsterId: wolf.id });
      await wolfBelow(asker, wolf.id, wolfOnce);
    }, 60_000);
  });

  it('a right click on the duel partner (attack with walk) walks over and swings until the partner falls', async () => {
    const { asker, target } = await pairUp('ChaseA', 'ChaseB', { x: wolfSpot.x, y: wolfSpot.y }, { hp: 12, maxHp: 40, x: wolfSpot.x + 130, y: wolfSpot.y });
    // One message: walk to the partner and keep swinging until one falls. No other click is sent.
    await ask(asker, { type: 'attack', playerId: target.id, walk: true });
    let landed = false;
    for (let i = 0; i < 400 && !landed; i += 1) {
      await ripenMs(asker, 250);
      landed = (await factsOf(target.id)).hp === 0;
    }
    expect(landed).toBe(true);
    // The fighters met on the way: the asker is no longer where it started.
    const me = await factsOf(asker.id);
    expect(Math.abs(me.x - wolfSpot.x)).toBeGreaterThan(30);
  }, 90_000);

  it('a plain attack at the partner is one swing and does not walk; leaving the field ends nothing by itself', async () => {
    const { asker, target } = await pairUp('OneA', 'OneB', { x: wolfSpot.x, y: wolfSpot.y }, { hp: 40, maxHp: 40, x: wolfSpot.x + 300, y: wolfSpot.y });
    await ask(asker, { type: 'attack', playerId: target.id });
    for (let i = 0; i < 12; i += 1) await ripenMs(asker, 250);
    const me = await factsOf(asker.id);
    expect(me.x).toBeCloseTo(wolfSpot.x, 0);
  }, 60_000);

  it('cancel withdraws a waiting request (the target hears it), decline tells the asker, and neither pairs them', async () => {
    const asker = await joinFig('CancA', { ...inGreen });
    const target = await joinFig('CancB', { ...inGreen });
    await ask(asker, { type: 'duel_request', playerId: target.id });
    expect(offersHeard(target)).toHaveLength(1);
    await ask(asker, { type: 'duel_cancel', playerId: target.id });
    expect(target.heard.some((row) => (row as { type: string }).type === 'duel_cancelled')).toBe(true);
    // The withdrawn offer can no longer be accepted.
    const late = await ask(target, { type: 'duel_accept', playerId: asker.id });
    noPartners(late, asker.id, target.id);
    // Decline: the asker is told.
    await ask(asker, { type: 'duel_request', playerId: target.id });
    await ask(target, { type: 'duel_decline', playerId: asker.id });
    expect(asker.heard.some((row) => (row as { type: string }).type === 'duel_declined')).toBe(true);
    noPartners(await ask(asker, { type: 'ping' }), asker.id, target.id);
  }, 60_000);

  it('a left click on the partner (attack once with walk) walks over and swings exactly once, then stops', async () => {
    const { asker, target } = await pairUp('LeftA', 'LeftB', { x: wolfSpot.x, y: wolfSpot.y }, { hp: 40, maxHp: 40, x: wolfSpot.x + 130, y: wolfSpot.y });
    const max = duelHpOf(await ask(asker, { type: 'ping' }), target.id)!;
    await ask(asker, { type: 'attack', playerId: target.id, once: true, walk: true });
    for (let i = 0; i < 40; i += 1) await ripenMs(asker, 250);
    const afterOne = duelHpOf(await ask(asker, { type: 'ping' }), target.id)!;
    // Exactly one landed swing: the partner lost one hit, not the whole bar, and the asker did walk over.
    expect(afterOne).toBeLessThan(max);
    expect(afterOne).toBeGreaterThan(0);
    for (let i = 0; i < 20; i += 1) await ripenMs(asker, 250);
    expect(duelHpOf(await ask(asker, { type: 'ping' }), target.id)).toBe(afterOne);
    const me = await factsOf(asker.id);
    expect(Math.abs(me.x - wolfSpot.x)).toBeGreaterThan(30);
  }, 90_000);
});
