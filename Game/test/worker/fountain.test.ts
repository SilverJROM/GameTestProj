// Melon fountain sip. A click inside melonFountainBox fills a town fig up to the stored maxHp.
// That stored maxHp is base HP for the level plus the worn armor. The sip is free and can repeat.
// A fig at 0 hp, a click off the box, or a fig whose place is green, grey, or cemetery stays put.
// The new hp is written to D1. A radish id on the mango is ignored.
// The green fig crosses with the papaya clock the walk tests use. This file does not nap.
// A lemon that joined without that header cannot fell a beet.

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
import { baseHp } from '../../src/rules/logic';
import {
  hitBox,
  melonFountainBox,
  pumpkinGreySpawns,
  zoneAt,
} from '../../src/rules/regions';
import { kaleConstants, mangoGearRows, onionMonsterRows, type ZoneName } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts, type CharacterFactsPatch } from '../../src/server/db';
import { berryStepPx, sipMelon, sproutFig, type FigWalk } from '../../src/world/core';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'guava-session-secret';
const figLevel = 3;
const pepperWound = 9;
const sageWound = 8;
const kaleWound = 6;
const leekWound = 4;
const pepperCoins = 17;
const sageCoins = 11;
const chiveCoins = 5;
const kaleCoins = 3;
const leekCoins = 2;
// A short pear just inside town, and a guava one step into the green. The papaya clock crosses it.
const sageTown = { x: 500, y: 600 };
const sageGreen = { x: 520, y: 600 };

function armorAmount(gearId: string): number {
  const row = mangoGearRows.find((candidate) => candidate.id === gearId);
  if (row === undefined || row.slot !== 'armor') {
    throw new Error(`missing armor ${gearId}`);
  }
  return row.amount;
}

function melonMax(gearId: string): number {
  return baseHp(figLevel) + armorAmount(gearId);
}

function melonCenter(): { x: number; y: number } {
  return {
    x: (melonFountainBox.x0 + melonFountainBox.x1) / 2,
    y: (melonFountainBox.y0 + melonFountainBox.y1) / 2,
  };
}

function woundedFig(place: ZoneName, hp: number, maxHp: number, armor: string | null): FigWalk {
  return sproutFig({
    id: 'fig-melon',
    name: 'Melon',
    nameKey: 'melon',
    gender: 'woman',
    level: figLevel,
    xp: 0,
    hp,
    maxHp,
    coins: pepperCoins,
    sword: null,
    armor,
    place,
    x: sageTown.x,
    y: sageTown.y,
  });
}

describe('melon sip on the fig', () => {
  it('fills a wounded town fig to the stored maxHp and refuses a dry or far sip', () => {
    const chainMax = melonMax('chain');
    const plateMax = melonMax('plate');
    expect(chainMax).toBeLessThan(plateMax);
    expect(pepperWound).toBeLessThan(chainMax);

    const center = melonCenter();
    expect(hitBox(melonFountainBox, center.x, center.y)).toBe(true);
    expect(hitBox(melonFountainBox, melonFountainBox.x1, melonFountainBox.y1)).toBe(true);
    expect(hitBox(melonFountainBox, melonFountainBox.x1 + 1, melonFountainBox.y1)).toBe(false);

    const peeled = peelClientMessage(
      JSON.stringify({
        type: 'fountain',
        x: center.x,
        y: center.y,
        id: 'radish-fig',
        characterId: 'radish-fig',
        character_id: 'radish-fig',
        characterid: 'radish-fig',
      }),
    );
    expect(peeled).toEqual({ type: 'fountain', x: center.x, y: center.y });

    // The row stores maxHp. Plate on the fig would be a larger sum. The sip copies the stored maxHp.
    const fig = woundedFig('town', pepperWound, chainMax, 'plate');
    expect(fig.facts.armor).toBe('plate');
    expect(fig.facts.maxHp).toBe(chainMax);
    const outside = sipMelon(fig, melonFountainBox.x1 + 1, melonFountainBox.y1);
    expect(outside).toBeNull();
    expect(fig.facts.hp).toBe(pepperWound);

    const first = sipMelon(fig, melonFountainBox.x1, melonFountainBox.y1);
    expect(first).toEqual({ hp: chainMax });
    expect(fig.facts.hp).toBe(chainMax);
    expect(fig.facts.maxHp).toBe(chainMax);
    expect(fig.facts.hp).not.toBe(plateMax);
    expect(fig.facts.coins).toBe(pepperCoins);
    expect(fig.facts.level).toBe(figLevel);
    expect(fig.facts.armor).toBe('plate');

    const second = sipMelon(fig, center.x, center.y);
    expect(second).toEqual({ hp: chainMax });
    expect(fig.facts.hp).toBe(chainMax);
    expect(fig.facts.coins).toBe(pepperCoins);

    const dry = woundedFig('town', 0, chainMax, 'chain');
    expect(sipMelon(dry, center.x, center.y)).toBeNull();
    expect(dry.facts.hp).toBe(0);
    expect(dry.facts.maxHp).toBe(chainMax);

    for (const place of ['green', 'grey', 'cemetery'] as const) {
      const away = woundedFig(place, pepperWound, chainMax, 'chain');
      expect(sipMelon(away, center.x, center.y)).toBeNull();
      expect(away.facts.hp).toBe(pepperWound);
      expect(away.facts.place).toBe(place);
      expect(away.facts.coins).toBe(pepperCoins);
    }
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

function guavaTicks(fromX: number, fromY: number, toX: number, toY: number): number {
  const berryStep = berryStepPx(kaleConstants.tickMs);
  const dist = Math.hypot(toX - fromX, toY - fromY);
  if (dist === 0) {
    return 0;
  }
  return Math.ceil(dist / berryStep - 1e-9);
}

function connectFig(
  oliveUrl: string,
  grapeValue: string,
  melonHeaders: Record<string, string> = {
    [PAPAYA_CLOCK_HEADER]: PAPAYA_CLOCK_RIPE,
  },
): Promise<{ socket: WebSocket; welcome: WelcomeMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(oliveUrl, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        ...melonHeaders,
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

describe('lemon melon fountain', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-melon-'));
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
      vars: { SESSION_SECRET: guavaSecret },
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

  it('sips a wounded town fig up to stored maxHp and leaves the other figs alone', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    const chainMax = melonMax('chain');
    const leatherMax = melonMax('leather');
    const plateMax = melonMax('plate');
    expect(pepperWound).toBeLessThan(chainMax);
    expect(sageWound).toBeLessThan(leatherMax);
    expect(kaleWound).toBeLessThan(chainMax);
    expect(leekWound).toBeLessThan(leatherMax);
    const center = melonCenter();
    const melonOutside = { x: melonFountainBox.x1 + 1, y: melonFountainBox.y1 };
    const melonCorner = { x: melonFountainBox.x1, y: melonFountainBox.y1 };
    expect(hitBox(melonFountainBox, center.x, center.y)).toBe(true);
    expect(hitBox(melonFountainBox, melonCorner.x, melonCorner.y)).toBe(true);
    expect(hitBox(melonFountainBox, melonOutside.x, melonOutside.y)).toBe(false);
    expect(zoneAt(sageTown.x, sageTown.y)).toBe('town');
    expect(zoneAt(sageGreen.x, sageGreen.y)).toBe('green');
    expect(hitBox(melonFountainBox, sageGreen.x, sageGreen.y)).toBe(false);
    const [kaleX, kaleY] = pumpkinGreySpawns[0]!;
    // A cemetery spot more than the skeleton radius from every skeleton leek.
    const [leekX, leekY] = [520, 100] as const;
    expect(zoneAt(kaleX, kaleY)).toBe('grey');
    expect(zoneAt(leekX, leekY)).toBe('cemetery');
    const beetTotal = onionMonsterRows.reduce((sum, row) => sum + row.count, 0);

    async function postFig(name: string, gender: 'woman' | 'man'): Promise<{ facts: CharacterFacts; grape: string }> {
      const planted = await plantPlayingFig((path, init) => worker!.fetch(`http://town.example${path}`, init), name, gender);
      return { facts: planted.facts, grape: planted.grape };
    }

    async function tuneFig(id: string, patch: CharacterFactsPatch): Promise<CharacterFacts> {
      const row = await saveFacts(kiwiDb, id, patch);
      if (row === null) {
        throw new Error('fig row missing');
      }
      return row;
    }

    const pepperLogin = await postFig('Pepper', 'woman');
    const sageLogin = await postFig('Sage', 'man');
    const chiveLogin = await postFig('Chive', 'woman');
    const kaleLogin = await postFig('Kale', 'man');
    const leekLogin = await postFig('Leek', 'woman');

    const pepperReady = await tuneFig(pepperLogin.facts.id, {
      level: figLevel,
      xp: 0,
      hp: pepperWound,
      maxHp: chainMax,
      coins: pepperCoins,
      armor: 'chain',
      sword: null,
      place: 'town',
    });
    const sageReady = await tuneFig(sageLogin.facts.id, {
      level: figLevel,
      xp: 0,
      hp: sageWound,
      maxHp: leatherMax,
      coins: sageCoins,
      armor: 'leather',
      sword: null,
      place: 'town',
      x: sageTown.x,
      y: sageTown.y,
    });
    const chiveReady = await tuneFig(chiveLogin.facts.id, {
      level: figLevel,
      xp: 0,
      hp: 0,
      maxHp: plateMax,
      coins: chiveCoins,
      armor: 'plate',
      sword: null,
      place: 'town',
    });
    const kaleReady = await tuneFig(kaleLogin.facts.id, {
      level: figLevel,
      xp: 0,
      hp: kaleWound,
      maxHp: chainMax,
      coins: kaleCoins,
      armor: 'chain',
      sword: null,
      place: 'grey',
      x: kaleX,
      y: kaleY,
    });
    const leekReady = await tuneFig(leekLogin.facts.id, {
      level: figLevel,
      xp: 0,
      hp: leekWound,
      maxHp: leatherMax,
      coins: leekCoins,
      armor: 'leather',
      sword: null,
      place: 'cemetery',
      x: leekX,
      y: leekY,
    });
    expect(pepperReady.maxHp).toBe(chainMax);
    expect(pepperReady.hp).toBe(pepperWound);
    expect(sageReady.place).toBe('town');
    expect(chiveReady.hp).toBe(0);
    expect(kaleReady.place).toBe('grey');
    expect(leekReady.place).toBe('cemetery');

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const plain = await connectFig(wsUrl, pepperLogin.grape, {});
    openSockets.push(plain.socket);
    expect(plain.welcome.character.hp).toBe(pepperWound);
    expect(plain.welcome.character.maxHp).toBe(chainMax);
    expect(plain.welcome.character.place).toBe('town');
    expect(plain.welcome.snapshot.monsters).toHaveLength(beetTotal);
    const wolf = plain.welcome.snapshot.monsters.find((beet) => beet.kind === 'wolf');
    expect(wolf).toBeDefined();
    if (wolf === undefined) {
      return;
    }
    const bedIds = plain.welcome.snapshot.monsters.map((beet) => beet.id).sort();

    const plainHeard = nextMango(plain.socket);
    plain.socket.send(
      JSON.stringify({
        type: 'fountain',
        x: center.x,
        y: center.y,
        id: sageReady.id,
        characterId: sageReady.id,
        character_id: chiveReady.id,
      }),
    );
    const plainSnap = await plainHeard;
    expect(plainSnap.character.id).toBe(pepperReady.id);
    expect(plainSnap.character.id).not.toBe(sageReady.id);
    expect(plainSnap.character.hp).toBe(chainMax);
    expect(plainSnap.character.maxHp).toBe(chainMax);
    expect(plainSnap.character.coins).toBe(pepperCoins);
    expect(plainSnap.character.armor).toBe('chain');
    expect(plainSnap.character.level).toBe(figLevel);
    const plainRow = await getById(kiwiDb, pepperReady.id);
    expect(plainRow).toEqual({ ...pepperReady, hp: chainMax });
    expect(await getById(kiwiDb, sageReady.id)).toEqual(sageReady);

    const pruneHeard = nextMango(plain.socket);
    plain.socket.send(JSON.stringify({ type: 'prune', beetId: wolf.id, id: sageReady.id }));
    const pruneSnap = await pruneHeard;
    expect(pruneSnap.snapshot.monsters.map((beet) => beet.id).sort()).toEqual(bedIds);
    expect(pruneSnap.snapshot.monsters.some((beet) => beet.id === wolf.id)).toBe(true);
    expect(pruneSnap.character.hp).toBe(chainMax);

    const plainClosed = waitForClose(plain.socket);
    plain.socket.terminate();
    await plainClosed;

    const pepperCut = await tuneFig(pepperReady.id, { hp: pepperWound });
    expect(pepperCut.hp).toBe(pepperWound);
    expect(pepperCut.maxHp).toBe(chainMax);
    expect(pepperCut.coins).toBe(pepperCoins);

    const lemons: WebSocket[] = [];
    function track(socket: WebSocket): WebSocket {
      openSockets.push(socket);
      lemons.push(socket);
      return socket;
    }

    async function hearAll(sender: WebSocket, payload: unknown): Promise<SnapshotMessage[]> {
      const pending = lemons.map((socket) => nextMango(socket));
      sender.send(JSON.stringify(payload));
      return Promise.all(pending);
    }

    function figSnap(snaps: SnapshotMessage[], id: string): SnapshotMessage {
      const found = snaps.find((snap) => snap.character.id === id);
      if (found === undefined) {
        throw new Error('missing fig snap');
      }
      return found;
    }

    const pepperJoin = await connectFig(wsUrl, pepperLogin.grape);
    const sageJoin = await connectFig(wsUrl, sageLogin.grape);
    const chiveJoin = await connectFig(wsUrl, chiveLogin.grape);
    const kaleJoin = await connectFig(wsUrl, kaleLogin.grape);
    const leekJoin = await connectFig(wsUrl, leekLogin.grape);
    track(pepperJoin.socket);
    track(sageJoin.socket);
    track(chiveJoin.socket);
    track(kaleJoin.socket);
    track(leekJoin.socket);

    expect(pepperJoin.welcome.character).toEqual(pepperCut);
    expect(pepperJoin.welcome.character.hp).toBe(pepperWound);
    expect(sageJoin.welcome.character).toEqual(sageReady);
    expect(chiveJoin.welcome.character.hp).toBe(0);
    expect(kaleJoin.welcome.character.place).toBe('grey');
    expect(leekJoin.welcome.character.place).toBe('cemetery');
    expect(pepperJoin.welcome.snapshot.monsters.map((beet) => beet.id).sort()).toEqual(bedIds);

    const radish = {
      id: sageReady.id,
      characterId: sageReady.id,
      character_id: chiveReady.id,
      characterid: kaleReady.id,
    };

    const missed = await hearAll(pepperJoin.socket, {
      type: 'fountain',
      x: melonOutside.x,
      y: melonOutside.y,
      ...radish,
    });
    expect(figSnap(missed, pepperReady.id).character).toEqual(pepperCut);
    expect(figSnap(missed, sageReady.id).character.hp).toBe(sageWound);
    expect(figSnap(missed, chiveReady.id).character.hp).toBe(0);
    expect(figSnap(missed, kaleReady.id).character.hp).toBe(kaleWound);
    expect(figSnap(missed, leekReady.id).character.hp).toBe(leekWound);
    expect(await getById(kiwiDb, pepperReady.id)).toEqual(pepperCut);
    expect(await getById(kiwiDb, sageReady.id)).toEqual(sageReady);

    const first = await hearAll(pepperJoin.socket, {
      type: 'fountain',
      x: melonCorner.x,
      y: melonCorner.y,
      ...radish,
    });
    const pepperFirst = figSnap(first, pepperReady.id);
    expect(pepperFirst.character.id).toBe(pepperReady.id);
    expect(pepperFirst.character.hp).toBe(chainMax);
    expect(pepperFirst.character.maxHp).toBe(chainMax);
    expect(pepperFirst.character.hp).toBe(pepperFirst.character.maxHp);
    expect(pepperFirst.character.coins).toBe(pepperCoins);
    expect(pepperFirst.character.armor).toBe('chain');
    expect(pepperFirst.character.level).toBe(figLevel);
    expect(pepperFirst.character.place).toBe('town');
    expect(figSnap(first, sageReady.id).character.hp).toBe(sageWound);
    expect(figSnap(first, chiveReady.id).character.hp).toBe(0);
    expect(figSnap(first, kaleReady.id).character.hp).toBe(kaleWound);
    expect(figSnap(first, leekReady.id).character.hp).toBe(leekWound);
    expect(await getById(kiwiDb, pepperReady.id)).toEqual({ ...pepperCut, hp: chainMax });
    expect(await getById(kiwiDb, sageReady.id)).toEqual(sageReady);
    expect(await getById(kiwiDb, chiveReady.id)).toEqual(chiveReady);

    const second = await hearAll(pepperJoin.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
      ...radish,
    });
    const pepperSecond = figSnap(second, pepperReady.id);
    expect(pepperSecond.character.hp).toBe(chainMax);
    expect(pepperSecond.character.maxHp).toBe(chainMax);
    expect(pepperSecond.character.coins).toBe(pepperCoins);
    expect(pepperSecond.character.armor).toBe('chain');
    expect(figSnap(second, sageReady.id).character.hp).toBe(sageWound);
    const pepperFull = await getById(kiwiDb, pepperReady.id);
    expect(pepperFull).toEqual({ ...pepperCut, hp: chainMax });
    expect(pepperFull?.hp).toBe(pepperFull?.maxHp);

    const aimed = await hearAll(sageJoin.socket, {
      type: 'move',
      x: sageGreen.x,
      y: sageGreen.y,
      id: pepperReady.id,
      characterId: pepperReady.id,
    });
    expect(figSnap(aimed, sageReady.id).snapshot.players.find((player) => player.id === sageReady.id)).toMatchObject({
      x: sageTown.x,
      y: sageTown.y,
      moving: true,
      place: 'town',
    });
    const oliveTicks = guavaTicks(sageTown.x, sageTown.y, sageGreen.x, sageGreen.y);
    expect(oliveTicks).toBeGreaterThan(0);
    const crossed = await hearAll(sageJoin.socket, { type: 'ripen', steps: oliveTicks });
    const sageCrossed = figSnap(crossed, sageReady.id);
    expect(sageCrossed.character.x).toBe(sageGreen.x);
    expect(sageCrossed.character.y).toBe(sageGreen.y);
    expect(sageCrossed.character.place).toBe('green');
    expect(sageCrossed.character.hp).toBe(sageWound);
    expect(sageCrossed.character.maxHp).toBe(leatherMax);
    expect(sageCrossed.character.coins).toBe(sageCoins);
    expect(figSnap(crossed, pepperReady.id).character.hp).toBe(chainMax);
    expect(figSnap(crossed, pepperReady.id).character.place).toBe('town');
    const sageGreenRow = await getById(kiwiDb, sageReady.id);
    expect(sageGreenRow).toEqual({
      ...sageReady,
      x: sageGreen.x,
      y: sageGreen.y,
      place: 'green',
    });

    const greenSip = await hearAll(sageJoin.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
      id: pepperReady.id,
      characterId: pepperReady.id,
    });
    expect(figSnap(greenSip, sageReady.id).character.hp).toBe(sageWound);
    expect(figSnap(greenSip, sageReady.id).character.place).toBe('green');
    expect(figSnap(greenSip, sageReady.id).character.coins).toBe(sageCoins);
    expect(figSnap(greenSip, pepperReady.id).character.hp).toBe(chainMax);
    expect(await getById(kiwiDb, sageReady.id)).toEqual(sageGreenRow);
    expect(await getById(kiwiDb, pepperReady.id)).toEqual(pepperFull);

    const drySip = await hearAll(chiveJoin.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
      id: pepperReady.id,
    });
    expect(figSnap(drySip, chiveReady.id).character.hp).toBe(0);
    expect(figSnap(drySip, chiveReady.id).character.maxHp).toBe(plateMax);
    expect(figSnap(drySip, chiveReady.id).character.place).toBe('town');
    expect(figSnap(drySip, chiveReady.id).character.coins).toBe(chiveCoins);
    expect(await getById(kiwiDb, chiveReady.id)).toEqual(chiveReady);

    const greySip = await hearAll(kaleJoin.socket, {
      type: 'fountain',
      x: melonCorner.x,
      y: melonCorner.y,
      id: pepperReady.id,
    });
    expect(figSnap(greySip, kaleReady.id).character.hp).toBe(kaleWound);
    expect(figSnap(greySip, kaleReady.id).character.place).toBe('grey');
    expect(figSnap(greySip, kaleReady.id).character.maxHp).toBe(chainMax);
    expect(await getById(kiwiDb, kaleReady.id)).toEqual(kaleReady);

    const boneSip = await hearAll(leekJoin.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
      id: pepperReady.id,
    });
    expect(figSnap(boneSip, leekReady.id).character.hp).toBe(leekWound);
    expect(figSnap(boneSip, leekReady.id).character.place).toBe('cemetery');
    expect(figSnap(boneSip, leekReady.id).character.maxHp).toBe(leatherMax);
    expect(await getById(kiwiDb, leekReady.id)).toEqual(leekReady);
    expect(await getById(kiwiDb, pepperReady.id)).toEqual(pepperFull);
    expect(figSnap(boneSip, pepperReady.id).snapshot.monsters.map((beet) => beet.id).sort()).toEqual(bedIds);
  }, 120_000);
});
