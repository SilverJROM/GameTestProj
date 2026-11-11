// G5 duel flow on two real WorldRoom sockets and local D1, on the injected papaya clock.
// Nothing here naps: every second that passes is a ripen mango, and every wait is a socket message.
// Every number comes from the rules tables, the rule functions, or the regions module.

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
import { duelMaxHealth, duelPayout, duelStrike, maxHealth, type Hero } from '../../src/rules/logic';
import {
  firstSolidWallCrossing,
  inRing,
  limeTownGate,
  pearTownWalls,
  townSpawn,
  type Point,
} from '../../src/rules/regions';
import { routeWaypoints } from '../../src/rules/route';
import { kaleConstants, papayaLevelRows, pearTimings } from '../../src/rules/tables';
import { berryStepPx } from '../../src/world/core';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'duel-flow-session-secret';
// Ticks per player swing gap, rounded up to whole room ticks.
const swingTicks = Math.ceil((pearTimings.playerAttackGapSeconds * 1000) / kaleConstants.tickMs);
const wolfSpot = plantCabbage().beets.find((beet) => beet.kind === 'wolf')!;

// Ticks one clear leg needs at the rules walk speed. The last step snaps onto the target.
function papayaSteps(from: Point, to: Point): number {
  const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (dist === 0) {
    return 1;
  }
  return Math.ceil(dist / berryStepPx(kaleConstants.tickMs) - 1e-9);
}

// A straight segment that crosses a solid wall is replaced by a stop on the road
// south of the lime gate, then the original target. Open gates are not solid.
function limeGateLegs(from: Point, to: Point): Point[] {
  // The room plans the same way: the bends of the shortest route around the walls, then the target.
  const bends = routeWaypoints(from, to);
  if (bends === null) {
    throw new Error('no route to the target');
  }
  return [...bends, to];
}
const levelThree = papayaLevelRows.find((row) => row.level === 3)!;


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

// One socket with a log of everything it heard, so the flow can ask "did an offer ever arrive".
interface PlumFig {
  id: string;
  socket: WebSocket;
  heard: Heard[];
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

describe('G5 duel flow', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-duelflow-'));
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

  async function joinFig(name: string, patch: Partial<CharacterFacts>): Promise<PlumFig> {
    const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, 'woman');
    const facts = planted.facts;
    const grape = planted.grape;
    await saveFacts(kiwiDb, facts.id, patch);
    const joined = await connectFig(`ws://127.0.0.1:${worker!.port}/ws`, grape);
    openSockets.push(joined.socket);
    const fig: PlumFig = { id: facts.id, socket: joined.socket, heard: [] };
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

  const ripen = (fig: PlumFig, steps: number) => ask(fig, { type: 'ripen', steps });
  const offersHeard = (fig: PlumFig) => fig.heard.filter((row): row is DuelOfferMessage => row.type === 'duel_offer');
  const partnersIn = (snap: SnapshotMessage) =>
    Object.fromEntries(snap.snapshot.players.map((row) => [row.id, row.duelPartnerId]));
  const factsOf = async (id: string) => (await getById(kiwiDb, id))!;

  // Walk a fig to a point on the ripen clock and return the snapshot once it stands there.
  // A straight line into the town wall stops on the wall, so a blocked line leaves through the gate.
  async function walkTo(fig: PlumFig, x: number, y: number): Promise<SnapshotMessage> {
    const start = await ask(fig, { type: 'ping' });
    let here: Point = [start.character.x, start.character.y];
    const legs = limeGateLegs(here, [x, y]);
    let snap = start;
    for (const next of legs) {
      await ask(fig, { type: 'move', x: next[0], y: next[1] });
      snap = await ripen(fig, papayaSteps(here, next));
      here = [snap.character.x, snap.character.y];
    }
    return snap;
  }

  // Both sockets see nobody glowing.
  async function nobodyGlows(melon: PlumFig, turnip: PlumFig): Promise<void> {
    for (const fig of [melon, turnip]) {
      const snap = await ask(fig, { type: 'ping' });
      expect(Object.values(partnersIn(snap)).every((partner) => partner === null)).toBe(true);
    }
  }

  it('refuses in town, declines without change, glows on accept, settles at 0, and ends in town', async () => {
    // The winner-to-be stands in the green; the loser-to-be starts in town.
    const melon = await joinFig('Melon', {
      level: 3,
      xp: 3,
      hp: levelThree.baseHp,
      maxHp: levelThree.baseHp,
      coins: 2,
      sword: 'shortSword',
      place: 'green',
      x: wolfSpot.x,
      y: wolfSpot.y,
    });
    const turnipStart = { level: 3, xp: 5, coins: 9, sword: 'shortSword', armor: 'leather' } as const;
    const turnipMax = maxHealth({ ...turnipStart, health: 0, place: 'green' });
    const turnip = await joinFig('Turnip', {
      ...turnipStart,
      hp: turnipMax,
      maxHp: turnipMax,
      place: 'town',
      x: townSpawn[0],
      y: townSpawn[1],
    });

    // 1. A request while either player is in town is refused, in both directions.
    await ask(melon, { type: 'duel_request', playerId: turnip.id });
    await ask(turnip, { type: 'duel_request', playerId: melon.id });
    expect(offersHeard(melon)).toEqual([]);
    expect(offersHeard(turnip)).toEqual([]);
    await ask(turnip, { type: 'duel_accept', playerId: melon.id });
    await ask(melon, { type: 'duel_accept', playerId: turnip.id });
    await nobodyGlows(melon, turnip);

    // The turnip walks out to stand beside the melon in the green.
    const outside = await walkTo(turnip, wolfSpot.x, wolfSpot.y);
    expect(outside.character.place).toBe('green');

    // 2. A decline changes no facts and leaves both unflagged.
    const beforeDecline = [await factsOf(melon.id), await factsOf(turnip.id)];
    await ask(melon, { type: 'duel_request', playerId: turnip.id });
    // The room handles messages in order, so a ping reply means the offer has already arrived.
    await ask(turnip, { type: 'ping' });
    expect(offersHeard(turnip)).toHaveLength(1);
    expect(offersHeard(turnip)[0]).toMatchObject({ type: 'duel_offer', fromId: melon.id });
    await ask(turnip, { type: 'duel_decline', playerId: melon.id });
    // The offer is gone, so a late accept pairs nobody.
    await ask(turnip, { type: 'duel_accept', playerId: melon.id });
    await nobodyGlows(melon, turnip);
    expect([await factsOf(melon.id), await factsOf(turnip.id)]).toEqual(beforeDecline);

    // 3. An accept shows the partner flag on both players and on nobody else, on both sockets.
    await ask(melon, { type: 'duel_request', playerId: turnip.id });
    await ask(turnip, { type: 'ping' });
    expect(offersHeard(turnip)).toHaveLength(2);
    await ask(turnip, { type: 'duel_accept', playerId: melon.id });
    for (const fig of [melon, turnip]) {
      const snap = await ask(fig, { type: 'ping' });
      const partners = partnersIn(snap);
      expect(partners[melon.id]).toBe(turnip.id);
      expect(partners[turnip.id]).toBe(melon.id);
      const others = Object.entries(partners).filter(([id]) => id !== melon.id && id !== turnip.id);
      expect(others.every(([, partner]) => partner === null)).toBe(true);
    }

    // 4. A fight to 0 health. Each swing waits out the rules gap on the ripen clock.
    const beforeFight = { melon: await factsOf(melon.id), turnip: await factsOf(turnip.id) };
    // Duels are fought at level 3 base stats, with the worn sword and armor kept.
    const blow = duelStrike(heroOf(beforeFight.melon));
    const duelHealth = duelMaxHealth(heroOf(beforeFight.turnip));
    const swingsNeeded = Math.ceil(duelHealth / blow);
    for (let swing = 0; swing < swingsNeeded; swing += 1) {
      await ripen(melon, swingTicks);
      await ask(melon, { type: 'attack', playerId: turnip.id });
      const pumpkin = await factsOf(turnip.id);
      if (swing < swingsNeeded - 1) {
        // Real health is untouched while the duel health drains.
        expect(pumpkin.hp).toBe(beforeFight.turnip.hp);
        expect(pumpkin.place).toBe('green');
      }
    }
    const afterFight = { melon: await factsOf(melon.id), turnip: await factsOf(turnip.id) };
    const payout = duelPayout(beforeFight.turnip.coins);
    // A purse of 9 pays 4: the rules payout rounds half the loser's coins down.
    expect(beforeFight.turnip.coins).toBe(9);
    expect(payout).toBe(4);
    expect(afterFight.melon.coins).toBe(beforeFight.melon.coins + payout);
    expect(afterFight.turnip.coins).toBe(beforeFight.turnip.coins - payout);
    // The loser stays dead where it fell until it picks Respawn.
    expect(afterFight.turnip).toMatchObject({
      place: 'green',
      hp: 0,
      maxHp: beforeFight.turnip.maxHp,
      level: beforeFight.turnip.level,
      xp: beforeFight.turnip.xp,
      sword: beforeFight.turnip.sword,
      armor: beforeFight.turnip.armor,
    });
    const respawned = await ask(turnip, { type: 'respawn' });
    expect(await factsOf(turnip.id)).toMatchObject({
      place: 'town',
      x: townSpawn[0],
      y: townSpawn[1],
      hp: maxHealth(heroOf(beforeFight.turnip)),
    });
    expect(respawned.character.place).toBe('town');
    // No xp moves in a duel.
    expect(afterFight.melon.xp).toBe(beforeFight.melon.xp);
    expect(afterFight.melon.level).toBe(beforeFight.melon.level);
    await nobodyGlows(melon, turnip);

    // 5. Walking into town during a fight ends the glow and moves no coins.
    const backOut = await walkTo(turnip, wolfSpot.x, wolfSpot.y);
    expect(backOut.character.place).toBe('green');
    await ask(melon, { type: 'duel_request', playerId: turnip.id });
    await ask(turnip, { type: 'duel_accept', playerId: melon.id });
    let snap = await ask(melon, { type: 'ping' });
    expect(partnersIn(snap)[melon.id]).toBe(turnip.id);
    expect(partnersIn(snap)[turnip.id]).toBe(melon.id);
    // One swing lands mid-fight, so the duel is live when the turnip leaves.
    const midFight = await factsOf(turnip.id);
    await ripen(melon, swingTicks);
    await ask(melon, { type: 'attack', playerId: turnip.id });
    expect((await factsOf(turnip.id)).hp).toBe(midFight.hp); // duel health, not real health, took the blow
    const purses = [(await factsOf(melon.id)).coins, (await factsOf(turnip.id)).coins];

    const inTown = await walkTo(turnip, townSpawn[0], townSpawn[1]);
    expect(inTown.character.place).toBe('town');
    await nobodyGlows(melon, turnip);
    // A swing at a walker in town lands nothing and pays nothing.
    const woundedInTown = await factsOf(turnip.id);
    await ripen(melon, swingTicks);
    await ask(melon, { type: 'attack', playerId: turnip.id });
    await nobodyGlows(melon, turnip);
    const kept = [await factsOf(melon.id), await factsOf(turnip.id)];
    expect(kept.map((row) => row.coins)).toEqual(purses);
    expect(kept[1]!.hp).toBe(woundedInTown.hp);
    expect(kept[1]!.place).toBe('town');
  }, 120_000);
});
