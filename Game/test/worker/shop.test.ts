// Forge quince. A buy mango from a fig in town spends the purse and puts the quince in the bag.
// Eighteen coins take the short sword into the bag and leave an empty purse. The sword is not worn.
// Seventeen coins are refused. Buying a quince you already own costs nothing.
// Plate then leather both sit in the bag. Neither is equipped, and health does not move.
// A fig in the green, the grey, or the cemetery cannot buy. An unknown quince changes nothing.
// A radish id on the mango is ignored, so only the socket's fig pays.
// The green fig crosses with the papaya clock the walk tests use. This file does not nap.
// A lemon that joined without that header cannot fell a beet. The melon sip still fills hp.

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
import { baseHp, maxHealth, strike, type Hero } from '../../src/rules/logic';
import {
  hitBox,
  melonFountainBox,
  pumpkinGreySpawns,
  townSpawn,
  zoneAt,
} from '../../src/rules/regions';
import { kaleConstants, mangoGearRows, onionMonsterRows } from '../../src/rules/tables';
import { ACCOUNT_COOKIE_NAME, SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts, type CharacterFactsPatch } from '../../src/server/db';
import { berryStepPx, buyQuince, sipMelon, sproutFig, stashQuince, wearQuince, type FigWalk } from '../../src/world/core';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

const guavaSecret = 'quince-session-secret';
const melonBase = baseHp(1);
// A short pear just inside town, and a guava one step into the green. The papaya clock crosses it.
const kaleTownPear = { x: 500, y: 600 };
const kaleGreenGuava = { x: 520, y: 600 };

function quinceRow(quinceId: string) {
  const row = mangoGearRows.find((candidate) => candidate.id === quinceId);
  if (row === undefined) {
    throw new Error(`missing quince ${quinceId}`);
  }
  return row;
}

function heroFrom(facts: Pick<CharacterFacts, 'level' | 'xp' | 'hp' | 'coins' | 'sword' | 'armor' | 'place'>): Hero {
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

function plantQuince(patch: Partial<CharacterFacts>): FigWalk {
  return sproutFig({
    id: 'fig-quince',
    name: 'Quince',
    nameKey: 'quince',
    gender: 'woman',
    level: 1,
    xp: 0,
    hp: melonBase,
    maxHp: melonBase,
    coins: 0,
    sword: null,
    armor: null,
    place: 'town',
    x: townSpawn[0],
    y: townSpawn[1],
    ...patch,
  });
}

function melonCenter(): { x: number; y: number } {
  return {
    x: (melonFountainBox.x0 + melonFountainBox.x1) / 2,
    y: (melonFountainBox.y0 + melonFountainBox.y1) / 2,
  };
}

describe('quince buy on the fig', () => {
  it('peels a buy mango, spends eighteen coins, and refuses a short purse or a far fig', () => {
    const shortQuince = quinceRow('shortSword');
    const plateQuince = quinceRow('plate');
    const leatherQuince = quinceRow('leather');
    expect(shortQuince.price).toBe(18);
    expect(shortQuince.price - 1).toBe(17);
    expect(shortQuince.slot).toBe('sword');
    expect(plateQuince.slot).toBe('armor');
    expect(leatherQuince.slot).toBe('armor');

    const peeled = peelClientMessage(
      JSON.stringify({
        type: 'buy',
        item: 'shortSword',
        id: 'radish-fig',
        characterId: 'radish-fig',
        character_id: 'radish-fig',
        characterid: 'radish-fig',
      }),
    );
    expect(peeled).toEqual({ type: 'buy', item: 'shortSword' });

    const leatherMax = maxHealth({
      level: 1,
      xp: 0,
      health: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: 'leather',
      place: 'town',
    });
    const swordFig = plantQuince({
      coins: shortQuince.price,
      armor: 'leather',
      hp: leatherMax,
      maxHp: leatherMax,
    });
    const swordPatch = buyQuince(swordFig, 'shortSword');
    expect(swordPatch).toEqual({ coins: 0 });
    expect(swordFig.facts.coins).toBe(0);
    expect(swordFig.facts.sword).toBeNull();
    expect(swordFig.facts.armor).toBe('leather');
    expect(swordFig.facts.items).toEqual(['shortSword']);
    expect(swordFig.facts.hp).toBe(leatherMax);
    expect(swordFig.facts.maxHp).toBe(leatherMax);
    expect(strike(heroFrom(swordFig.facts))).toBe(strike(heroFrom({ ...swordFig.facts, sword: null })));

    const shortPurse = plantQuince({ coins: shortQuince.price - 1 });
    const purseBefore = { ...shortPurse.facts };
    expect(buyQuince(shortPurse, 'shortSword')).toBeNull();
    expect(shortPurse.facts).toEqual(purseBefore);

    const unknownFig = plantQuince({ coins: plateQuince.price + leatherQuince.price });
    const unknownBefore = { ...unknownFig.facts };
    expect(buyQuince(unknownFig, 'coconutHelm')).toBeNull();
    expect(unknownFig.facts).toEqual(unknownBefore);

    expect(zoneAt(townSpawn[0], townSpawn[1])).toBe('town');
    for (const place of ['green', 'grey', 'cemetery'] as const) {
      const away = plantQuince({ coins: shortQuince.price, place });
      const awayBefore = { ...away.facts };
      expect(buyQuince(away, 'shortSword')).toBeNull();
      expect(away.facts).toEqual(awayBefore);
      expect(away.facts.place).toBe(place);
    }

    const plateMax = maxHealth({
      level: 1,
      xp: 0,
      health: melonBase,
      coins: 0,
      sword: null,
      armor: 'plate',
      place: 'town',
    });
    const leatherCap = maxHealth({
      level: 1,
      xp: 0,
      health: melonBase,
      coins: 0,
      sword: null,
      armor: 'leather',
      place: 'town',
    });
    expect(leatherCap).toBeLessThan(plateMax);
    const clad = plantQuince({ coins: plateQuince.price + leatherQuince.price });
    const platePatch = buyQuince(clad, 'plate');
    expect(platePatch).toEqual({ coins: leatherQuince.price });
    expect(clad.facts.armor).toBeNull();
    expect(clad.facts.sword).toBeNull();
    expect(clad.facts.hp).toBe(melonBase);
    expect(clad.facts.maxHp).toBe(melonBase);
    expect(clad.facts.items).toEqual(['plate']);

    const again = buyQuince(clad, 'plate');
    expect(again).toBeNull();
    expect(clad.facts.coins).toBe(leatherQuince.price);
    expect(clad.facts.items).toEqual(['plate']);

    const center = melonCenter();
    expect(hitBox(melonFountainBox, center.x, center.y)).toBe(true);
    const sip = sipMelon(clad, center.x, center.y);
    expect(sip).toEqual({ hp: melonBase });
    expect(clad.facts.hp).toBe(melonBase);
    expect(clad.facts.coins).toBe(leatherQuince.price);

    const leatherPatch = buyQuince(clad, 'leather');
    expect(leatherPatch).toEqual({ coins: 0 });
    expect(clad.facts.armor).toBeNull();
    expect(clad.facts.sword).toBeNull();
    expect(clad.facts.items).toEqual(['leather', 'plate']);
    expect(clad.facts.hp).toBe(melonBase);
    expect(clad.facts.maxHp).toBe(melonBase);
    expect(maxHealth(heroFrom({ ...clad.facts, armor: 'leather' }))).toBe(leatherCap);
    expect(maxHealth(heroFrom({ ...clad.facts, armor: 'plate' }))).toBe(plateMax);

    const worn = wearQuince(clad, 'leather');
    expect(worn?.armor).toBe('leather');
    expect(worn?.hp).toBe(melonBase);
    expect(worn?.maxHp).toBe(leatherCap);
    expect(clad.facts.sword).toBeNull();
    const full = sipMelon(clad, center.x, center.y);
    expect(full).toEqual({ hp: leatherCap });
    const stowed = stashQuince(clad, 'armor');
    expect(stowed?.armor).toBeNull();
    expect(stowed?.hp).toBe(leatherCap > melonBase ? melonBase : leatherCap);
    expect(stowed?.maxHp).toBe(melonBase);
    expect(clad.facts.hp).toBe(melonBase);
    expect(clad.facts.items).toEqual(['leather', 'plate']);
  });
});

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

describe('lemon forge quince', () => {
  let worker: Unstable_DevWorker | undefined;
  let proxy: PlatformProxy | undefined;
  let kiwiDb: CharacterDb;
  let orchardDir = '';
  const openSockets: WebSocket[] = [];

  beforeAll(async () => {
    orchardDir = await mkdtemp(path.join(tmpdir(), 'fig-quince-'));
    const v3Path = path.join(orchardDir, 'v3');

    const prep = await getPlatformProxy({
      configPath: 'wrangler.jsonc',
      persist: { path: v3Path },
    });
    try {
      const prepDb = (prep.env as unknown as { DB: CharacterDb }).DB;
      await applyMigrations(prepDb);
      const grapeStatements = [
        'CREATE TABLE IF NOT EXISTS fig_writes (n INTEGER PRIMARY KEY AUTOINCREMENT, fig_id TEXT NOT NULL)',
        'CREATE TRIGGER IF NOT EXISTS fig_write AFTER UPDATE ON characters BEGIN INSERT INTO fig_writes (fig_id) VALUES (NEW.id); END',
      ].map((statement) => prepDb.prepare(statement));
      await (prepDb as unknown as { batch(statements: unknown[]): Promise<unknown> }).batch(grapeStatements);
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

  it('sells the short sword into the bag for 18, refuses 17, keeps plate and leather unworn, and spends only the sender purse', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    const shortQuince = quinceRow('shortSword');
    const plateQuince = quinceRow('plate');
    const leatherQuince = quinceRow('leather');
    expect(shortQuince.price).toBe(18);
    expect(shortQuince.price - 1).toBe(17);
    const plateMax = maxHealth({
      level: 1,
      xp: 0,
      health: melonBase,
      coins: 0,
      sword: null,
      armor: 'plate',
      place: 'town',
    });
    const leatherCap = maxHealth({
      level: 1,
      xp: 0,
      health: melonBase,
      coins: 0,
      sword: null,
      armor: 'leather',
      place: 'town',
    });
    expect(melonBase).toBeLessThan(leatherCap);
    expect(leatherCap).toBeLessThan(plateMax);
    expect(zoneAt(kaleTownPear.x, kaleTownPear.y)).toBe('town');
    expect(zoneAt(kaleGreenGuava.x, kaleGreenGuava.y)).toBe('green');
    const [leekX, leekY] = pumpkinGreySpawns[0]!;
    // A cemetery spot more than the skeleton radius from every skeleton leek.
    const [onionX, onionY] = [520, 100] as const;
    expect(zoneAt(leekX, leekY)).toBe('grey');
    expect(zoneAt(onionX, onionY)).toBe('cemetery');
    const center = melonCenter();
    expect(hitBox(melonFountainBox, center.x, center.y)).toBe(true);
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

    async function readFig(id: string): Promise<CharacterFacts> {
      const row = await getById(kiwiDb, id);
      if (row === null) {
        throw new Error('fig row missing');
      }
      return row;
    }

    async function figWrites(figId: string): Promise<number> {
      const row = await kiwiDb
        .prepare('SELECT COUNT(*) AS n FROM fig_writes WHERE fig_id = ?')
        .bind(figId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }

    const pepperLogin = await postFig('Pepper', 'woman');
    const sageLogin = await postFig('Sage', 'man');
    const chiveLogin = await postFig('Chive', 'woman');
    const kaleLogin = await postFig('Kale', 'man');
    const leekLogin = await postFig('Leek', 'woman');
    const onionLogin = await postFig('Onion', 'man');
    const appleLogin = await postFig('Apple', 'woman');
    const berryLogin = await postFig('Berry', 'man');

    const pepperReady = await tuneFig(pepperLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: null,
      place: 'town',
    });
    const sageReady = await tuneFig(sageLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price - 1,
      sword: null,
      armor: null,
      place: 'town',
    });
    const chiveReady = await tuneFig(chiveLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: plateQuince.price + leatherQuince.price,
      sword: null,
      armor: null,
      place: 'town',
    });
    const kaleReady = await tuneFig(kaleLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: null,
      place: 'town',
      x: kaleTownPear.x,
      y: kaleTownPear.y,
    });
    const leekReady = await tuneFig(leekLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: null,
      place: 'grey',
      x: leekX,
      y: leekY,
    });
    const onionReady = await tuneFig(onionLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: null,
      place: 'cemetery',
      x: onionX,
      y: onionY,
    });
    const appleReady = await tuneFig(appleLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: shortQuince.price,
      sword: null,
      armor: null,
      place: 'town',
    });
    const berryReady = await tuneFig(berryLogin.facts.id, {
      level: 1,
      xp: 0,
      hp: melonBase,
      maxHp: melonBase,
      coins: plateQuince.price,
      sword: 'longSword',
      armor: 'chain',
      place: 'town',
    });
    expect(pepperReady.coins).toBe(18);
    expect(sageReady.coins).toBe(17);
    expect(chiveReady.coins).toBe(plateQuince.price + leatherQuince.price);
    expect(kaleReady.place).toBe('town');
    expect(leekReady.place).toBe('grey');
    expect(onionReady.place).toBe('cemetery');
    expect(appleReady.coins).toBe(18);
    expect(berryReady.sword).toBe('longSword');
    expect(berryReady.coins).toBe(plateQuince.price);

    const pepperWrites = await figWrites(pepperReady.id);
    const sageWrites = await figWrites(sageReady.id);
    const chiveWrites = await figWrites(chiveReady.id);
    const leekWrites = await figWrites(leekReady.id);
    const onionWrites = await figWrites(onionReady.id);
    const appleWrites = await figWrites(appleReady.id);
    const berryWrites = await figWrites(berryReady.id);

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const plain = await connectFig(wsUrl, pepperLogin.grape, {});
    openSockets.push(plain.socket);
    expect(plain.welcome.character).toEqual(pepperReady);
    expect(plain.welcome.character.coins).toBe(18);
    expect(plain.welcome.snapshot.monsters).toHaveLength(beetTotal);
    const wolf = plain.welcome.snapshot.monsters.find((beet) => beet.kind === 'wolf');
    expect(wolf).toBeDefined();
    if (wolf === undefined) {
      return;
    }
    const bedIds = plain.welcome.snapshot.monsters.map((beet) => beet.id).sort();

    const pepperHeard = nextMango(plain.socket);
    plain.socket.send(
      JSON.stringify({
        type: 'buy',
        item: 'shortSword',
        id: sageReady.id,
        characterId: sageReady.id,
        character_id: berryReady.id,
        characterid: appleReady.id,
      }),
    );
    const pepperSnap = await pepperHeard;
    expect(pepperSnap.character.id).toBe(pepperReady.id);
    expect(pepperSnap.character.id).not.toBe(sageReady.id);
    expect(pepperSnap.character.coins).toBe(0);
    expect(pepperSnap.character.sword).toBeNull();
    expect(pepperSnap.character.armor).toBeNull();
    expect(pepperSnap.character.items).toEqual(['shortSword']);
    expect(pepperSnap.character.hp).toBe(melonBase);
    expect(pepperSnap.character.maxHp).toBe(melonBase);
    expect(pepperSnap.character.maxHp).toBe(pepperReady.maxHp);
    expect(pepperSnap.character.place).toBe('town');
    expect(strike(heroFrom(pepperSnap.character))).toBe(strike(heroFrom(pepperReady)));
    const pepperRow = await readFig(pepperReady.id);
    expect(pepperRow).toEqual({ ...pepperReady, coins: 0, items: ['shortSword'], coinExpiry: null });
    expect(await figWrites(pepperReady.id)).toBe(pepperWrites + 1);
    expect(await readFig(sageReady.id)).toEqual(sageReady);
    expect(await readFig(berryReady.id)).toEqual(berryReady);
    expect(await readFig(appleReady.id)).toEqual(appleReady);
    expect(await figWrites(sageReady.id)).toBe(sageWrites);
    expect(await figWrites(berryReady.id)).toBe(berryWrites);

    const pruneHeard = nextMango(plain.socket);
    plain.socket.send(JSON.stringify({ type: 'prune', beetId: wolf.id, id: sageReady.id }));
    const pruneSnap = await pruneHeard;
    expect(pruneSnap.snapshot.monsters.map((beet) => beet.id).sort()).toEqual(bedIds);
    expect(pruneSnap.snapshot.monsters.some((beet) => beet.id === wolf.id)).toBe(true);
    expect(pruneSnap.character.coins).toBe(0);
    expect(pruneSnap.character.sword).toBeNull();
    expect(pruneSnap.character.items).toEqual(['shortSword']);
    expect(await figWrites(pepperReady.id)).toBe(pepperWrites + 1);

    const plainClosed = waitForClose(plain.socket);
    plain.socket.terminate();
    await plainClosed;

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

    const sageJoin = await connectFig(wsUrl, sageLogin.grape);
    const chiveJoin = await connectFig(wsUrl, chiveLogin.grape);
    const kaleJoin = await connectFig(wsUrl, kaleLogin.grape);
    const leekJoin = await connectFig(wsUrl, leekLogin.grape);
    const onionJoin = await connectFig(wsUrl, onionLogin.grape);
    const appleJoin = await connectFig(wsUrl, appleLogin.grape);
    const berryJoin = await connectFig(wsUrl, berryLogin.grape);
    track(sageJoin.socket);
    track(chiveJoin.socket);
    track(kaleJoin.socket);
    track(leekJoin.socket);
    track(onionJoin.socket);
    track(appleJoin.socket);
    track(berryJoin.socket);

    expect(sageJoin.welcome.character).toEqual(sageReady);
    expect(sageJoin.welcome.character.coins).toBe(17);
    expect(chiveJoin.welcome.character).toEqual(chiveReady);
    expect(kaleJoin.welcome.character).toEqual(kaleReady);
    expect(leekJoin.welcome.character.place).toBe('grey');
    expect(onionJoin.welcome.character.place).toBe('cemetery');
    expect(appleJoin.welcome.character).toEqual(appleReady);
    expect(berryJoin.welcome.character).toEqual(berryReady);
    expect(sageJoin.welcome.snapshot.monsters.map((beet) => beet.id).sort()).toEqual(bedIds);

    const radish = {
      id: berryReady.id,
      characterId: berryReady.id,
      character_id: appleReady.id,
      characterid: pepperReady.id,
    };

    const shortBuy = await hearAll(sageJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      ...radish,
    });
    expect(figSnap(shortBuy, sageReady.id).character).toEqual(sageReady);
    expect(figSnap(shortBuy, sageReady.id).character.coins).toBe(17);
    expect(figSnap(shortBuy, sageReady.id).character.sword).toBeNull();
    expect(figSnap(shortBuy, berryReady.id).character).toEqual(berryReady);
    expect(figSnap(shortBuy, appleReady.id).character).toEqual(appleReady);
    expect(await readFig(sageReady.id)).toEqual(sageReady);
    expect(await readFig(berryReady.id)).toEqual(berryReady);
    expect(await figWrites(sageReady.id)).toBe(sageWrites);
    expect(await figWrites(berryReady.id)).toBe(berryWrites);

    const unknownBuy = await hearAll(chiveJoin.socket, {
      type: 'buy',
      item: 'coconutHelm',
      ...radish,
    });
    expect(figSnap(unknownBuy, chiveReady.id).character).toEqual(chiveReady);
    expect(figSnap(unknownBuy, berryReady.id).character.coins).toBe(berryReady.coins);
    expect(await readFig(chiveReady.id)).toEqual(chiveReady);
    expect(await readFig(berryReady.id)).toEqual(berryReady);
    expect(await figWrites(chiveReady.id)).toBe(chiveWrites);

    const plateBuy = await hearAll(chiveJoin.socket, {
      type: 'buy',
      item: 'plate',
      ...radish,
    });
    const plateSnap = figSnap(plateBuy, chiveReady.id);
    expect(plateSnap.character.id).toBe(chiveReady.id);
    expect(plateSnap.character.armor).toBeNull();
    expect(plateSnap.character.sword).toBeNull();
    expect(plateSnap.character.items).toEqual(['plate']);
    expect(plateSnap.character.coins).toBe(leatherQuince.price);
    expect(plateSnap.character.hp).toBe(melonBase);
    expect(plateSnap.character.maxHp).toBe(melonBase);
    expect(strike(heroFrom(plateSnap.character))).toBe(strike(heroFrom(chiveReady)));
    expect(figSnap(plateBuy, berryReady.id).character).toEqual(berryReady);
    expect(figSnap(plateBuy, sageReady.id).character.coins).toBe(17);
    const chivePlate = await readFig(chiveReady.id);
    expect(chivePlate).toEqual({
      ...chiveReady,
      // Spending took the oldest coins, so the "coins expire" line is its own value.
      coinExpiry: null,
      coins: leatherQuince.price,
      items: ['plate'],
    });
    expect(await figWrites(chiveReady.id)).toBe(chiveWrites + 1);
    expect(await figWrites(berryReady.id)).toBe(berryWrites);

    const fountainSip = await hearAll(chiveJoin.socket, {
      type: 'fountain',
      x: center.x,
      y: center.y,
      ...radish,
    });
    const sipSnap = figSnap(fountainSip, chiveReady.id);
    expect(sipSnap.character.hp).toBe(melonBase);
    expect(sipSnap.character.maxHp).toBe(melonBase);
    expect(sipSnap.character.coins).toBe(leatherQuince.price);
    expect(sipSnap.character.armor).toBeNull();
    expect(sipSnap.character.items).toEqual(['plate']);
    expect(figSnap(fountainSip, berryReady.id).character).toEqual(berryReady);
    const chiveFull = await readFig(chiveReady.id);
    expect(chiveFull).toEqual(chivePlate);
    expect(await figWrites(chiveReady.id)).toBe(chiveWrites + 2);

    const leatherBuy = await hearAll(chiveJoin.socket, {
      type: 'buy',
      item: 'leather',
      ...radish,
    });
    const leatherSnap = figSnap(leatherBuy, chiveReady.id);
    expect(leatherSnap.character.armor).toBeNull();
    expect(leatherSnap.character.sword).toBeNull();
    expect(leatherSnap.character.items).toEqual(['leather', 'plate']);
    expect(leatherSnap.character.coins).toBe(0);
    expect(leatherSnap.character.hp).toBe(melonBase);
    expect(leatherSnap.character.maxHp).toBe(melonBase);
    expect(strike(heroFrom(leatherSnap.character))).toBe(strike(heroFrom(chiveReady)));
    expect(figSnap(leatherBuy, berryReady.id).character).toEqual(berryReady);
    const chiveLeather = await readFig(chiveReady.id);
    expect(chiveLeather).toEqual({
      ...chiveReady,
      coinExpiry: null,
      coins: 0,
      items: ['leather', 'plate'],
    });
    expect(chiveLeather.coins).toBe(chiveReady.coins - plateQuince.price - leatherQuince.price);
    expect(await figWrites(chiveReady.id)).toBe(chiveWrites + 3);
    expect(await figWrites(berryReady.id)).toBe(berryWrites);
    expect(await readFig(berryReady.id)).toEqual(berryReady);

    const aimed = await hearAll(kaleJoin.socket, {
      type: 'move',
      x: kaleGreenGuava.x,
      y: kaleGreenGuava.y,
      id: appleReady.id,
      characterId: appleReady.id,
    });
    expect(figSnap(aimed, kaleReady.id).snapshot.players.find((player) => player.id === kaleReady.id)).toMatchObject({
      x: kaleTownPear.x,
      y: kaleTownPear.y,
      moving: true,
      place: 'town',
    });
    const oliveTicks = guavaTicks(kaleTownPear.x, kaleTownPear.y, kaleGreenGuava.x, kaleGreenGuava.y);
    expect(oliveTicks).toBeGreaterThan(0);
    const crossed = await hearAll(kaleJoin.socket, { type: 'ripen', steps: oliveTicks });
    const kaleCrossed = figSnap(crossed, kaleReady.id);
    expect(kaleCrossed.character.x).toBe(kaleGreenGuava.x);
    expect(kaleCrossed.character.y).toBe(kaleGreenGuava.y);
    expect(kaleCrossed.character.place).toBe('green');
    expect(kaleCrossed.character.coins).toBe(shortQuince.price);
    expect(kaleCrossed.character.sword).toBeNull();
    const kaleGreenRow = await readFig(kaleReady.id);
    expect(kaleGreenRow).toEqual({
      ...kaleReady,
      x: kaleGreenGuava.x,
      y: kaleGreenGuava.y,
      place: 'green',
    });
    const kaleWrites = await figWrites(kaleReady.id);

    const greenBuy = await hearAll(kaleJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      ...radish,
    });
    expect(figSnap(greenBuy, kaleReady.id).character).toEqual(kaleGreenRow);
    expect(figSnap(greenBuy, kaleReady.id).character.place).toBe('green');
    expect(figSnap(greenBuy, kaleReady.id).character.coins).toBe(18);
    expect(figSnap(greenBuy, kaleReady.id).character.sword).toBeNull();
    expect(figSnap(greenBuy, appleReady.id).character).toEqual(appleReady);
    expect(figSnap(greenBuy, berryReady.id).character).toEqual(berryReady);
    expect(await readFig(kaleReady.id)).toEqual(kaleGreenRow);
    expect(await figWrites(kaleReady.id)).toBe(kaleWrites);
    expect(await readFig(appleReady.id)).toEqual(appleReady);
    expect(await readFig(berryReady.id)).toEqual(berryReady);

    const greyBuy = await hearAll(leekJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      ...radish,
    });
    expect(figSnap(greyBuy, leekReady.id).character).toEqual(leekReady);
    expect(figSnap(greyBuy, leekReady.id).character.place).toBe('grey');
    expect(figSnap(greyBuy, leekReady.id).character.coins).toBe(18);
    expect(figSnap(greyBuy, leekReady.id).character.sword).toBeNull();
    expect(await readFig(leekReady.id)).toEqual(leekReady);
    expect(await figWrites(leekReady.id)).toBe(leekWrites);
    expect(await readFig(berryReady.id)).toEqual(berryReady);

    const boneBuy = await hearAll(onionJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      ...radish,
    });
    expect(figSnap(boneBuy, onionReady.id).character).toEqual(onionReady);
    expect(figSnap(boneBuy, onionReady.id).character.place).toBe('cemetery');
    expect(figSnap(boneBuy, onionReady.id).character.coins).toBe(18);
    expect(figSnap(boneBuy, onionReady.id).character.sword).toBeNull();
    expect(await readFig(onionReady.id)).toEqual(onionReady);
    expect(await figWrites(onionReady.id)).toBe(onionWrites);

    const appleBuy = await hearAll(appleJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      id: berryReady.id,
      characterId: berryReady.id,
      character_id: berryReady.id,
      characterid: berryReady.id,
    });
    const appleSnap = figSnap(appleBuy, appleReady.id);
    expect(appleSnap.character.id).toBe(appleReady.id);
    expect(appleSnap.character.id).not.toBe(berryReady.id);
    expect(appleSnap.character.coins).toBe(0);
    expect(appleSnap.character.sword).toBeNull();
    expect(appleSnap.character.items).toEqual(['shortSword']);
    expect(appleSnap.character.armor).toBeNull();
    expect(appleSnap.character.hp).toBe(melonBase);
    expect(appleSnap.character.maxHp).toBe(melonBase);
    expect(appleSnap.character.place).toBe('town');
    expect(figSnap(appleBuy, berryReady.id).character).toEqual(berryReady);
    expect(figSnap(appleBuy, sageReady.id).character.coins).toBe(17);
    expect(figSnap(appleBuy, chiveReady.id).character).toEqual(chiveLeather);
    const appleRow = await readFig(appleReady.id);
    expect(appleRow).toEqual({ ...appleReady, coins: 0, items: ['shortSword'], coinExpiry: null });
    expect(await readFig(berryReady.id)).toEqual(berryReady);
    expect(berryReady.coins).not.toBe(0);
    expect(await figWrites(appleReady.id)).toBe(appleWrites + 1);
    expect(await figWrites(berryReady.id)).toBe(berryWrites);
    expect(await readFig(sageReady.id)).toEqual(sageReady);
    expect(await readFig(kaleReady.id)).toEqual(kaleGreenRow);
    expect(await readFig(leekReady.id)).toEqual(leekReady);
    expect(await readFig(onionReady.id)).toEqual(onionReady);
    expect(await readFig(pepperReady.id)).toEqual(pepperRow);
  }, 120_000);

  it('equips and unequips from the bag, refuses another socket, and deletes the rows with the avatar', async () => {
    if (worker === undefined) {
      throw new Error('lemon worker did not start');
    }

    const shortQuince = quinceRow('shortSword');
    const leatherQuince = quinceRow('leather');
    const leatherMax = melonBase + leatherQuince.amount;
    expect(leatherMax).toBe(82);
    expect(melonBase).toBe(70);

    async function postFig(name: string, gender: 'woman' | 'man') {
      return plantPlayingFig((figPath, init) => worker!.fetch(`http://town.example${figPath}`, init), name, gender);
    }

    async function tuneFig(id: string, patch: CharacterFactsPatch): Promise<CharacterFacts> {
      const row = await saveFacts(kiwiDb, id, patch);
      if (row === null) {
        throw new Error('fig row missing');
      }
      return row;
    }

    async function readFig(id: string): Promise<CharacterFacts | null> {
      return getById(kiwiDb, id);
    }

    async function figWrites(figId: string): Promise<number> {
      const row = await kiwiDb
        .prepare('SELECT COUNT(*) AS n FROM fig_writes WHERE fig_id = ?')
        .bind(figId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }

    async function itemCount(figId: string): Promise<number> {
      const row = await kiwiDb
        .prepare('SELECT COUNT(*) AS n FROM account_items WHERE account_id = (SELECT account_id FROM characters WHERE id = ?)')
        .bind(figId)
        .first<{ n: number }>();
      return Number(row?.n ?? 0);
    }

    const mango = await postFig('Mango', 'woman');
    const guava = await postFig('Guava', 'man');
    const ready = await tuneFig(mango.facts.id, {
      level: 1,
      xp: 0,
      hp: 40,
      maxHp: melonBase,
      coins: shortQuince.price + leatherQuince.price,
      sword: null,
      armor: null,
      place: 'town',
    });
    expect(ready.hp).toBe(40);
    expect(ready.maxHp).toBe(70);
    expect(ready.items).toEqual([]);
    const guavaReady = await readFig(guava.facts.id);
    if (guavaReady === null) {
      throw new Error('guava row missing');
    }

    const wsUrl = `ws://127.0.0.1:${worker.port}/ws`;
    const mangoJoin = await connectFig(wsUrl, mango.grape);
    const guavaJoin = await connectFig(wsUrl, guava.grape);
    openSockets.push(mangoJoin.socket, guavaJoin.socket);
    expect(mangoJoin.welcome.character.hp).toBe(40);
    expect(mangoJoin.welcome.character.items).toEqual([]);

    const lemons = [mangoJoin.socket, guavaJoin.socket];
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

    const writesBefore = await figWrites(ready.id);
    const bought = await hearAll(mangoJoin.socket, {
      type: 'buy',
      item: 'shortSword',
      id: guavaReady.id,
      characterId: guavaReady.id,
    });
    const boughtMango = figSnap(bought, ready.id).character;
    expect(boughtMango.items).toEqual(['shortSword']);
    expect(boughtMango.sword).toBeNull();
    expect(boughtMango.coins).toBe(leatherQuince.price);
    expect(boughtMango.hp).toBe(40);
    expect(boughtMango.maxHp).toBe(70);
    expect(strike(heroFrom(boughtMango))).toBe(4);
    expect(strike(heroFrom(boughtMango))).toBe(strike(heroFrom(ready)));
    expect(figSnap(bought, guavaReady.id).character).toEqual(guavaReady);
    expect(await figWrites(ready.id)).toBe(writesBefore + 1);

    const ownedWrites = await figWrites(ready.id);
    const copy = await hearAll(mangoJoin.socket, { type: 'buy', item: 'shortSword', id: guavaReady.id });
    expect(figSnap(copy, ready.id).character).toEqual(boughtMango);
    expect(figSnap(copy, ready.id).character.coins).toBe(leatherQuince.price);
    expect(await itemCount(ready.id)).toBe(1);
    expect(await figWrites(ready.id)).toBe(ownedWrites);
    expect(await readFig(guavaReady.id)).toEqual(guavaReady);

    const wrongSlot = await hearAll(mangoJoin.socket, {
      type: 'equip',
      itemId: 'shortSword',
      slot: 'armor',
      id: guavaReady.id,
      characterId: guavaReady.id,
    });
    expect(figSnap(wrongSlot, ready.id).character.sword).toBeNull();
    expect(figSnap(wrongSlot, ready.id).character.armor).toBeNull();
    expect(figSnap(wrongSlot, guavaReady.id).character).toEqual(guavaReady);
    expect(await figWrites(ready.id)).toBe(ownedWrites);

    const unowned = await hearAll(mangoJoin.socket, { type: 'equip', itemId: 'greatSword', characterId: ready.id });
    expect(figSnap(unowned, ready.id).character.sword).toBeNull();
    expect(figSnap(unowned, guavaReady.id).character.sword).toBeNull();
    expect(await figWrites(ready.id)).toBe(ownedWrites);

    const guavaWrites = await figWrites(guavaReady.id);
    const stolen = await hearAll(guavaJoin.socket, {
      type: 'equip',
      itemId: 'shortSword',
      id: ready.id,
      characterId: ready.id,
      character_id: ready.id,
      characterid: ready.id,
    });
    expect(figSnap(stolen, ready.id).character).toEqual(boughtMango);
    expect(figSnap(stolen, ready.id).character.sword).toBeNull();
    expect(figSnap(stolen, guavaReady.id).character).toEqual(guavaReady);
    expect(await readFig(ready.id)).toEqual({ ...ready, coins: leatherQuince.price, items: ['shortSword'], coinExpiry: null });
    expect(await figWrites(guavaReady.id)).toBe(guavaWrites);

    const equipped = await hearAll(mangoJoin.socket, { type: 'equip', itemId: 'shortSword' });
    const swordOn = figSnap(equipped, ready.id).character;
    expect(swordOn.sword).toBe('shortSword');
    expect(swordOn.armor).toBeNull();
    expect(swordOn.hp).toBe(40);
    expect(swordOn.maxHp).toBe(70);
    expect(swordOn.items).toEqual(['shortSword']);
    expect(strike(heroFrom(swordOn))).toBe(6);
    expect(figSnap(equipped, guavaReady.id).character).toEqual(guavaReady);
    expect(await figWrites(ready.id)).toBe(ownedWrites + 1);

    const stowed = await hearAll(mangoJoin.socket, { type: 'unequip', slot: 'sword' });
    const swordOff = figSnap(stowed, ready.id).character;
    expect(swordOff.sword).toBeNull();
    expect(swordOff.hp).toBe(40);
    expect(swordOff.maxHp).toBe(70);
    expect(strike(heroFrom(swordOff))).toBe(4);
    expect(swordOff.items).toEqual(['shortSword']);

    const leatherBuy = await hearAll(mangoJoin.socket, { type: 'buy', item: 'leather' });
    const withLeather = figSnap(leatherBuy, ready.id).character;
    expect(withLeather.coins).toBe(0);
    expect(withLeather.items).toEqual(['leather', 'shortSword']);
    expect(withLeather.armor).toBeNull();
    expect(withLeather.hp).toBe(40);
    expect(withLeather.maxHp).toBe(70);

    const armorOn = await hearAll(mangoJoin.socket, { type: 'equip', itemId: 'leather' });
    expect(figSnap(armorOn, ready.id).character.hp).toBe(40);
    expect(figSnap(armorOn, ready.id).character.maxHp).toBe(82);
    expect(figSnap(armorOn, ready.id).character.armor).toBe('leather');
    expect(figSnap(armorOn, ready.id).character.sword).toBeNull();

    const armorOff = await hearAll(mangoJoin.socket, { type: 'unequip', slot: 'armor' });
    expect(figSnap(armorOff, ready.id).character.hp).toBe(40);
    expect(figSnap(armorOff, ready.id).character.maxHp).toBe(70);
    expect(figSnap(armorOff, ready.id).character.armor).toBeNull();

    const armorAgain = await hearAll(mangoJoin.socket, { type: 'equip', itemId: 'leather' });
    expect(figSnap(armorAgain, ready.id).character).toMatchObject({ hp: 40, maxHp: 82, armor: 'leather' });
    const center = melonCenter();
    const sipped = await hearAll(mangoJoin.socket, { type: 'fountain', x: center.x, y: center.y });
    expect(figSnap(sipped, ready.id).character).toMatchObject({ hp: 82, maxHp: 82, armor: 'leather' });
    const clamped = await hearAll(mangoJoin.socket, { type: 'unequip', slot: 'armor' });
    const clampedMango = figSnap(clamped, ready.id).character;
    expect(clampedMango.hp).toBe(70);
    expect(clampedMango.maxHp).toBe(70);
    expect(clampedMango.armor).toBeNull();
    expect(clampedMango.items).toEqual(['leather', 'shortSword']);
    expect(figSnap(clamped, guavaReady.id).character.sword).toBeNull();

    const closed = waitForClose(mangoJoin.socket);
    mangoJoin.socket.terminate();
    await closed;
    const again = await connectFig(wsUrl, mango.grape);
    openSockets.push(again.socket);
    expect(again.welcome.character.items).toEqual(['leather', 'shortSword']);
    expect(again.welcome.character.sword).toBeNull();
    expect(again.welcome.character.armor).toBeNull();
    expect(again.welcome.character.hp).toBe(70);
    expect(again.welcome.character.maxHp).toBe(70);
    expect(again.welcome.character.coins).toBe(0);
    again.socket.terminate();

    const lime = await postFig('Lime', 'woman');
    await tuneFig(lime.facts.id, {
      place: 'green',
      x: kaleGreenGuava.x,
      y: kaleGreenGuava.y,
      coins: shortQuince.price,
      hp: melonBase,
      maxHp: melonBase,
      sword: null,
      armor: null,
    });
    await kiwiDb.prepare('INSERT INTO account_items (id, account_id, item_id, worn_by) SELECT ?, account_id, ?, NULL FROM characters WHERE id = ?').bind(crypto.randomUUID(), 'shortSword', lime.facts.id).run();
    const limeJoin = await connectFig(wsUrl, lime.grape);
    openSockets.push(limeJoin.socket);
    expect(limeJoin.welcome.character.place).toBe('green');
    expect(limeJoin.welcome.character.items).toEqual(['shortSword']);
    expect(limeJoin.welcome.character.sword).toBeNull();
    const limeEquip = nextMango(limeJoin.socket);
    limeJoin.socket.send(JSON.stringify({ type: 'equip', itemId: 'shortSword', characterId: ready.id }));
    const limeSnap = await limeEquip;
    expect(limeSnap.character.sword).toBe('shortSword');
    expect(limeSnap.character.place).toBe('green');
    expect(limeSnap.character.hp).toBe(melonBase);
    expect(limeSnap.character.maxHp).toBe(melonBase);
    expect(strike(heroFrom(limeSnap.character))).toBe(6);
    const limeBuy = nextMango(limeJoin.socket);
    limeJoin.socket.send(JSON.stringify({ type: 'buy', item: 'leather', id: ready.id }));
    const limeRefused = await limeBuy;
    expect(limeRefused.character.coins).toBe(shortQuince.price);
    expect(limeRefused.character.items).toEqual(['shortSword']);
    expect(limeRefused.character.armor).toBeNull();
    expect(limeRefused.character.sword).toBe('shortSword');
    expect(await readFig(ready.id)).toMatchObject({ items: ['leather', 'shortSword'], coins: 0 });

    expect(await itemCount(ready.id)).toBe(2);
    const removed = await worker.fetch(`http://town.example/api/avatars/${ready.id}`, {
      method: 'DELETE',
      headers: { Cookie: `${ACCOUNT_COOKIE_NAME}=${mango.accountValue}` },
    });
    expect(removed.status).toBe(200);
    expect(await readFig(ready.id)).toBeNull();
    expect(await itemCount(ready.id)).toBe(0);
    expect(await itemCount(lime.facts.id)).toBe(1);
  }, 120_000);
});
