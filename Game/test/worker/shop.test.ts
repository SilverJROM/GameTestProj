// Forge quince. A buy mango from a fig in town spends the purse through purchase().
// Eighteen coins take the short sword and leave an empty purse. Seventeen coins are refused.
// Plate then leather replaces the worn piece with no refund, and current health clamps down.
// A fig in the green, the grey, or the cemetery is refused. An unknown quince changes nothing.
// A radish id on the mango is ignored, so only the socket's fig pays.
// The green fig crosses with the papaya clock the walk tests use. This file does not nap.
// A lemon that joined without that header cannot fell a beet. The melon sip still fills hp.

import { readFileSync } from 'node:fs';
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
import { baseHp, maxHealth, purchase, type Hero } from '../../src/rules/logic';
import {
  hitBox,
  melonFountainBox,
  pumpkinGreySpawns,
  townSpawn,
  zoneAt,
} from '../../src/rules/regions';
import { kaleConstants, mangoGearRows, onionMonsterRows } from '../../src/rules/tables';
import { SESSION_COOKIE_NAME } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts, type CharacterFactsPatch } from '../../src/server/db';
import { berryStepPx, buyQuince, sipMelon, sproutFig, type FigWalk } from '../../src/world/core';

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
    expect(swordPatch).toEqual({
      coins: 0,
      sword: 'shortSword',
      armor: 'leather',
      hp: leatherMax,
      maxHp: leatherMax,
    });
    expect(swordFig.facts.coins).toBe(0);
    expect(swordFig.facts.maxHp).toBe(leatherMax);

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
    expect(platePatch?.armor).toBe('plate');
    expect(platePatch?.coins).toBe(leatherQuince.price);
    expect(platePatch?.hp).toBe(melonBase);
    expect(platePatch?.maxHp).toBe(plateMax);
    expect(platePatch?.sword).toBeNull();

    const center = melonCenter();
    expect(hitBox(melonFountainBox, center.x, center.y)).toBe(true);
    const sip = sipMelon(clad, center.x, center.y);
    expect(sip).toEqual({ hp: plateMax });
    expect(clad.facts.hp).toBe(plateMax);
    expect(clad.facts.coins).toBe(leatherQuince.price);

    const filledHp = clad.facts.hp;
    const leatherPatch = buyQuince(clad, 'leather');
    expect(leatherPatch?.armor).toBe('leather');
    expect(leatherPatch?.sword).toBeNull();
    expect(leatherPatch?.coins).toBe(0);
    expect(leatherPatch?.maxHp).toBe(leatherCap);
    expect(leatherPatch?.hp).toBe(leatherCap);
    expect(leatherPatch?.hp).toBeLessThan(filledHp);
    expect(clad.facts.coins).toBe(0);
    expect(clad.facts.hp).toBe(clad.facts.maxHp);
  });
});

function migrationStatements(sqlText: string): string[] {
  return sqlText
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

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
      const schemaSql = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8');
      const grapeStatements = [
        ...migrationStatements(schemaSql),
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

  it('sells the short sword for 18, refuses 17, swaps plate for leather, and spends only the sender purse', async () => {
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
      const response = await worker!.fetch('http://town.example/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, gender }),
      });
      const text = await response.text();
      expect(response.status, text).toBe(200);
      const facts = JSON.parse(text) as CharacterFacts;
      const baked = response.headers.getSetCookie();
      expect(baked).toHaveLength(1);
      return { facts, grape: grapeFromBeet(baked[0] ?? '') };
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
    expect(pepperSnap.character.sword).toBe('shortSword');
    expect(pepperSnap.character.armor).toBeNull();
    expect(pepperSnap.character.hp).toBe(melonBase);
    expect(pepperSnap.character.maxHp).toBe(melonBase);
    expect(pepperSnap.character.maxHp).toBe(pepperReady.maxHp);
    expect(pepperSnap.character.place).toBe('town');
    const pepperBought = purchase(heroFrom(pepperReady), 'shortSword');
    expect(pepperBought.ok).toBe(true);
    expect(pepperSnap.character.coins).toBe(pepperBought.hero.coins);
    expect(pepperSnap.character.hp).toBe(pepperBought.hero.health);
    expect(pepperSnap.character.maxHp).toBe(maxHealth(pepperBought.hero));
    const pepperRow = await readFig(pepperReady.id);
    expect(pepperRow).toEqual({ ...pepperReady, coins: 0, sword: 'shortSword' });
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
    expect(pruneSnap.character.sword).toBe('shortSword');
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
    const plateBought = purchase(heroFrom(chiveReady), 'plate');
    expect(plateBought.ok).toBe(true);
    expect(plateSnap.character.id).toBe(chiveReady.id);
    expect(plateSnap.character.armor).toBe('plate');
    expect(plateSnap.character.sword).toBeNull();
    expect(plateSnap.character.coins).toBe(plateBought.hero.coins);
    expect(plateSnap.character.coins).toBe(leatherQuince.price);
    expect(plateSnap.character.hp).toBe(plateBought.hero.health);
    expect(plateSnap.character.hp).toBe(melonBase);
    expect(plateSnap.character.maxHp).toBe(maxHealth(plateBought.hero));
    expect(plateSnap.character.maxHp).toBe(plateMax);
    expect(plateSnap.character.hp).toBeLessThan(plateSnap.character.maxHp);
    expect(figSnap(plateBuy, berryReady.id).character).toEqual(berryReady);
    expect(figSnap(plateBuy, sageReady.id).character.coins).toBe(17);
    const chivePlate = await readFig(chiveReady.id);
    expect(chivePlate).toEqual({
      ...chiveReady,
      coins: leatherQuince.price,
      armor: 'plate',
      hp: melonBase,
      maxHp: plateMax,
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
    expect(sipSnap.character.hp).toBe(plateMax);
    expect(sipSnap.character.maxHp).toBe(plateMax);
    expect(sipSnap.character.coins).toBe(leatherQuince.price);
    expect(sipSnap.character.armor).toBe('plate');
    expect(figSnap(fountainSip, berryReady.id).character).toEqual(berryReady);
    const chiveFull = await readFig(chiveReady.id);
    expect(chiveFull).toEqual({ ...chivePlate, hp: plateMax });
    expect(await figWrites(chiveReady.id)).toBe(chiveWrites + 2);

    const leatherBuy = await hearAll(chiveJoin.socket, {
      type: 'buy',
      item: 'leather',
      ...radish,
    });
    const leatherSnap = figSnap(leatherBuy, chiveReady.id);
    const filledHero: Hero = { ...plateBought.hero, health: plateMax };
    const leatherBought = purchase(filledHero, 'leather');
    expect(leatherBought.ok).toBe(true);
    expect(leatherBought.hero.health).toBeLessThan(plateMax);
    expect(leatherSnap.character.armor).toBe('leather');
    expect(leatherSnap.character.sword).toBeNull();
    expect(leatherSnap.character.coins).toBe(0);
    expect(leatherSnap.character.coins).toBe(leatherBought.hero.coins);
    expect(leatherSnap.character.hp).toBe(leatherBought.hero.health);
    expect(leatherSnap.character.maxHp).toBe(maxHealth(leatherBought.hero));
    expect(leatherSnap.character.hp).toBe(leatherCap);
    expect(leatherSnap.character.maxHp).toBe(leatherCap);
    expect(leatherSnap.character.hp).toBe(leatherSnap.character.maxHp);
    expect(leatherSnap.character.hp).toBeLessThan(plateMax);
    expect(figSnap(leatherBuy, berryReady.id).character).toEqual(berryReady);
    const chiveLeather = await readFig(chiveReady.id);
    expect(chiveLeather).toEqual({
      ...chiveReady,
      coins: 0,
      armor: 'leather',
      hp: leatherCap,
      maxHp: leatherCap,
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
    expect(appleSnap.character.sword).toBe('shortSword');
    expect(appleSnap.character.armor).toBeNull();
    expect(appleSnap.character.hp).toBe(melonBase);
    expect(appleSnap.character.maxHp).toBe(melonBase);
    expect(appleSnap.character.place).toBe('town');
    expect(figSnap(appleBuy, berryReady.id).character).toEqual(berryReady);
    expect(figSnap(appleBuy, sageReady.id).character.coins).toBe(17);
    expect(figSnap(appleBuy, chiveReady.id).character).toEqual(chiveLeather);
    const appleRow = await readFig(appleReady.id);
    expect(appleRow).toEqual({ ...appleReady, coins: 0, sword: 'shortSword' });
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
});
