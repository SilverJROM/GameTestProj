// Join tests against the real worker. unstable_dev loads src/server/index.ts.
// A missing or forged grape gets 401. A valid grape gets a welcome at the D1 pear x,y.
// A radish id on the header, the query, or the mango does not retarget the lemon socket.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getPlatformProxy, unstable_dev, type PlatformProxy, type Unstable_DevWorker } from 'wrangler';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { petFor } from '../../src/rules/pets';
import { townSpawn } from '../../src/rules/regions';
import { sproutApricot } from '../../src/world/core';
import { ACCOUNT_COOKIE_NAME, SESSION_COOKIE_NAME, signCharacterId } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import type { SnapshotMessage, WelcomeMessage } from '../../src/protocol';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'guava-session-secret';
const papayaSecret = 'papaya-other-secret';


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

function refuseFig(
  oliveUrl: string,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(oliveUrl, { headers });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('refused socket timed out'));
    }, 8_000);
    socket.once('open', () => {
      clearTimeout(timer);
      socket.close();
      reject(new Error('fig socket upgraded'));
    });
    socket.once('error', (err) => {
      const message = err instanceof Error ? err.message : String(err);
      // A non-101 reply is reported here and on unexpected-response. The status handler owns it.
      if (message.startsWith('Unexpected server response')) {
        return;
      }
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(message));
    });
    socket.on('unexpected-response', (_req, res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        clearTimeout(timer);
        resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
  });
}

function connectFig(
  oliveUrl: string,
  grapeValue: string,
  extraHeaders: Record<string, string> = {},
): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(oliveUrl, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        ...extraHeaders,
      },
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

function waitForClose(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fig socket stayed open')), 8_000);
    socket.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('GET /ws join on the real worker', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-orchard-'));
    const v3Path = path.join(orchardDir, 'v3');

    const prep = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
    } finally {
      await prep.dispose();
    }

    worker = await unstable_dev('src/server/index.ts', {
      config: 'wrangler.jsonc',
      persistTo: orchardDir,
      vars: { SESSION_SECRET: guavaSecret, ALLOW_TEST_CLOCK: '1' },
      logLevel: 'error',
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
      },
    });

    proxy = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
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

  it('refuses a missing or forged grape, then welcomes the fig at its stored pear x,y', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    async function postFig(name: string, gender: 'woman' | 'man'): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, gender);
      return { facts: planted.facts, grape: planted.grape };
    }

    const ada = await postFig('Ada', 'woman');
    const bea = await postFig('Bea', 'man');
    const adaRow = await getById(kiwiDb, ada.facts.id);
    const beaRow = await getById(kiwiDb, bea.facts.id);
    expect(adaRow).toEqual(ada.facts);
    expect(beaRow).toEqual(bea.facts);
    expect([adaRow?.x, adaRow?.y]).toEqual([townSpawn[0], townSpawn[1]]);
    expect([beaRow?.x, beaRow?.y]).toEqual([townSpawn[0], townSpawn[1]]);

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws?id=${bea.facts.id}&characterId=${bea.facts.id}`;
    const missing = await refuseFig(wsUrl, { 'X-Character-Id': bea.facts.id });
    expect(missing.status).toBe(401);
    expect(missing.text).not.toContain(bea.facts.id);

    const otherSecret = await signCharacterId(papayaSecret, ada.facts.id);
    const forgedGrapes = ['forged-radish.not-a-signature', otherSecret, `${bea.facts.id}.not-a-signature`];
    for (const badGrape of forgedGrapes) {
      const forged = await refuseFig(wsUrl, {
        Cookie: `${SESSION_COOKIE_NAME}=${badGrape}`,
        'X-Character-Id': bea.facts.id,
      });
      expect(forged.status).toBe(401);
      expect(forged.text).not.toContain(bea.facts.id);
      expect(forged.text).not.toContain(ada.facts.name);
    }

    const adaJoin = await connectFig(wsUrl, ada.grape, { 'X-Character-Id': bea.facts.id });
    openSockets.push(adaJoin.socket);
    expect(adaJoin.welcome.type).toBe('welcome');
    expect(adaJoin.welcome.character).toEqual(adaRow);
    expect(adaJoin.welcome.character.id).toBe(ada.facts.id);
    expect([adaJoin.welcome.character.x, adaJoin.welcome.character.y]).toEqual([townSpawn[0], townSpawn[1]]);
    expect(adaJoin.welcome.snapshot.players).toEqual([
      {
        id: ada.facts.id,
        name: ada.facts.name,
        x: townSpawn[0],
        y: townSpawn[1],
        facing: sproutApricot,
        moving: false,
        place: 'town',
        gender: ada.facts.gender,
        pet: petFor(ada.facts.id),
        duelPartnerId: null,
      },
    ]);

    const replyPromise = nextMango(adaJoin.socket);
    adaJoin.socket.send(
      JSON.stringify({
        type: 'ping',
        id: bea.facts.id,
        characterId: bea.facts.id,
        character_id: bea.facts.id,
        x: 1,
        y: 2,
      }),
    );
    const reply = await replyPromise;
    expect(reply.type).toBe('snapshot');
    expect(reply.character.id).toBe(ada.facts.id);
    expect(reply.character).toEqual(adaRow);
    expect(reply.character.id).not.toBe(bea.facts.id);
    expect(await getById(kiwiDb, bea.facts.id)).toEqual(beaRow);
    expect(adaJoin.socket.readyState).toBe(WebSocket.OPEN);

    const beaJoin = await connectFig(
      `ws://127.0.0.1:${worker.port}/ws?id=${ada.facts.id}`,
      bea.grape,
      { 'X-Character-Id': ada.facts.id },
    );
    openSockets.push(beaJoin.socket);
    expect(beaJoin.welcome.character).toEqual(beaRow);
    expect([beaJoin.welcome.character.x, beaJoin.welcome.character.y]).toEqual([townSpawn[0], townSpawn[1]]);
    expect(adaJoin.socket.readyState).toBe(WebSocket.OPEN);

    const edited = await saveFacts(kiwiDb, ada.facts.id, { place: 'green', x: 512, y: 300 });
    expect(edited).not.toBeNull();
    expect([edited?.x, edited?.y]).toEqual([512, 300]);

    const closed = waitForClose(adaJoin.socket);
    const adaAgain = await connectFig(`ws://127.0.0.1:${worker.port}/ws`, ada.grape, {
      'X-Character-Id': bea.facts.id,
    });
    openSockets.push(adaAgain.socket);
    await closed;
    expect(adaJoin.socket.readyState).toBe(WebSocket.CLOSED);

    const stored = await getById(kiwiDb, ada.facts.id);
    expect(stored).toEqual(edited);
    expect(adaAgain.welcome.type).toBe('welcome');
    expect(adaAgain.welcome.character).toEqual(stored);
    expect([adaAgain.welcome.character.x, adaAgain.welcome.character.y]).toEqual([512, 300]);
    expect(adaAgain.welcome.character.place).toBe('green');
    const adaPlayer = adaAgain.welcome.snapshot.players.find((player) => player.id === ada.facts.id);
    expect(adaPlayer).toEqual({
      id: ada.facts.id,
      name: ada.facts.name,
      x: 512,
      y: 300,
      facing: sproutApricot,
      moving: false,
      place: 'green',
      gender: ada.facts.gender,
      pet: petFor(ada.facts.id),
      duelPartnerId: null,
    });
    expect(beaJoin.socket.readyState).toBe(WebSocket.OPEN);
    expect(await getById(kiwiDb, bea.facts.id)).toEqual(beaRow);
  }, 60_000);

  it('drops a connected fig when its avatar is deleted and leaves the other row', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    const plum = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), 'Plum', 'woman');
    const mango = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), 'Mango', 'man');
    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const plumJoin = await connectFig(wsUrl, plum.grape);
    const mangoJoin = await connectFig(wsUrl, mango.grape);
    openSockets.push(plumJoin.socket, mangoJoin.socket);
    expect(mangoJoin.welcome.snapshot.players.some((player) => player.id === plum.facts.id)).toBe(true);

    const closed = waitForClose(plumJoin.socket);
    const seen: SnapshotMessage[] = [];
    const onMango = (data: unknown) => {
      seen.push(JSON.parse(mangoText(data)) as SnapshotMessage);
    };
    mangoJoin.socket.on('message', onMango);
    const deleted = await worker.fetch(`http://town.example/api/avatars/${encodeURIComponent(plum.facts.id)}`, {
      method: 'DELETE',
      headers: { Cookie: `${ACCOUNT_COOKIE_NAME}=${plum.accountValue}` },
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ ok: true });
    await closed;
    const deadline = Date.now() + 8_000;
    let snap = seen.find((row) => !row.snapshot.players.some((player) => player.id === plum.facts.id));
    while (snap === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      snap = seen.find((row) => !row.snapshot.players.some((player) => player.id === plum.facts.id));
    }
    mangoJoin.socket.off('message', onMango);
    if (snap === undefined) {
      throw new Error('snapshot without the deleted fig did not arrive');
    }
    expect(snap.snapshot.players.some((player) => player.id === plum.facts.id)).toBe(false);
    expect(plumJoin.socket.readyState).toBe(WebSocket.CLOSED);
    expect(mangoJoin.socket.readyState).toBe(WebSocket.OPEN);
    expect(await getById(kiwiDb, plum.facts.id)).toBeNull();
    expect(await getById(kiwiDb, mango.facts.id)).toEqual(mango.facts);
  }, 60_000);
});
