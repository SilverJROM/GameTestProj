// Duel request, accept, decline on the injected papaya clock. No real sleep: every wait is a socket message.

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
import { townSpawn } from '../../src/rules/regions';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import { plantCabbage } from '../../src/world/monsters';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'duel-session-secret';


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
    vars: { SESSION_SECRET: guavaSecret },
    logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true },
  });
}

const wolfSpot = plantCabbage().beets.find((beet) => beet.kind === 'wolf')!;

describe('duel request, accept, decline', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-duel-'));
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

  it('refuses a request from town, to town, to self, and to a stranger, leaving no offer', async () => {
    const townie = await joinFig('Leek', inTown);
    const field = await joinFig('Turnip', inGreen);
    const other = await joinFig('Radish', inGreen);

    await ask(townie, { type: 'duel_request', playerId: field.id });
    await ask(other, { type: 'duel_request', playerId: townie.id });
    await ask(other, { type: 'duel_request', playerId: other.id });
    await ask(other, { type: 'duel_request', playerId: 'no-such-fig' });
    expect(offersHeard(field)).toEqual([]);
    expect(offersHeard(townie)).toEqual([]);
    expect(offersHeard(other)).toEqual([]);

    // No offer was left behind: accepting the refused requests pairs nobody.
    await ask(field, { type: 'duel_accept', playerId: townie.id });
    await ask(townie, { type: 'duel_accept', playerId: other.id });
    const snap = await ask(other, { type: 'duel_accept', playerId: other.id });
    noPartners(snap, townie.id, field.id, other.id);
  }, 60_000);

  it('lets a decline clear the offer, changes nothing, and ignores a third player', async () => {
    const asker = await joinFig('Beet', inGreen);
    const target = await joinFig('Kale', inGreen);
    const third = await joinFig('Pea', inGreen);
    const before = [await factsOf(asker.id), await factsOf(target.id), await factsOf(third.id)];

    // A forged requester id on the message is dropped; the socket's fig is the asker.
    await ask(asker, { type: 'duel_request', playerId: target.id, id: third.id, characterId: third.id });
    const offers = offersHeard(target);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ type: 'duel_offer', fromId: asker.id });
    expect(offersHeard(third)).toEqual([]);

    // The third player cannot answer, and the offer stays for the target.
    await ask(third, { type: 'duel_decline', playerId: asker.id });
    await ask(third, { type: 'duel_accept', playerId: asker.id });
    await ask(asker, { type: 'duel_accept', playerId: asker.id });
    let snap = await ask(third, { type: 'ping' });
    noPartners(snap, asker.id, target.id, third.id);

    await ask(target, { type: 'duel_decline', playerId: asker.id });
    // The offer is gone, so a late accept pairs nobody.
    snap = await ask(target, { type: 'duel_accept', playerId: asker.id });
    noPartners(snap, asker.id, target.id, third.id);
    expect([await factsOf(asker.id), await factsOf(target.id), await factsOf(third.id)]).toEqual(before);
  }, 60_000);

  it('flags exactly the two players on accept and clears the pairing on disconnect', async () => {
    const asker = await joinFig('Pear', inGreen);
    const target = await joinFig('Plum', inGreen);
    const third = await joinFig('Fig', inGreen);
    const before = [await factsOf(asker.id), await factsOf(target.id), await factsOf(third.id)];

    await ask(asker, { type: 'duel_request', playerId: target.id });
    expect(offersHeard(target)).toHaveLength(1);
    await ask(third, { type: 'duel_accept', playerId: asker.id });

    const snap = await ask(target, { type: 'duel_accept', playerId: asker.id });
    expect(partnersOf(snap, asker.id, target.id, third.id)).toEqual({ [asker.id]: target.id, [target.id]: asker.id, [third.id]: null });
    expect([await factsOf(asker.id), await factsOf(target.id), await factsOf(third.id)]).toEqual(before);

    const closed = new Promise<void>((resolve) => target.socket.once('close', () => resolve()));
    const heardGone = waitForPartners(third, asker.id, null);
    target.socket.terminate();
    await closed;
    // Any snapshot after the close shows the asker unflagged.
    third.socket.send(JSON.stringify({ type: 'ping' }));
    await heardGone;
    expect((await factsOf(asker.id)).coins).toBe(before[0]!.coins);
  }, 60_000);

  // Wait for a snapshot in which one player's partner is the wanted value.
  function waitForPartners(fig: PlumFig, playerId: string, wanted: string | null): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('partner never changed')), 8_000);
      const look = () => {
        const last = [...fig.heard].reverse().find((row): row is SnapshotMessage => row.type === 'snapshot');
        if (last !== undefined && partnersOf(last, playerId)[playerId] === wanted) {
          clearTimeout(timer);
          fig.socket.off('message', look);
          resolve();
        }
      };
      fig.socket.on('message', look);
      look();
    });
  }

  it('drops a pending offer when a player walks into town', async () => {
    const asker = await joinFig('Yam', inGreen);
    const target = await joinFig('Bean', inGreen);
    await ask(asker, { type: 'duel_request', playerId: target.id });
    expect(offersHeard(target)).toHaveLength(1);

    // Walk to town on the ripen clock, then back out to the green.
    await ask(asker, { type: 'move', x: townSpawn[0], y: townSpawn[1] });
    let snap = await ask(asker, { type: 'ripen', steps: 4000 });
    expect(snap.character.place).toBe('town');
    await ask(asker, { type: 'move', x: wolfSpot.x, y: wolfSpot.y });
    snap = await ask(asker, { type: 'ripen', steps: 4000 });
    expect(snap.character.place).toBe('green');

    // Both stand in the green again, but the offer died in town.
    snap = await ask(target, { type: 'duel_accept', playerId: asker.id });
    noPartners(snap, asker.id, target.id);
  }, 60_000);
});
