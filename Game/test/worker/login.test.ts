// Login route tests against the local D1 that wrangler emulates (no network, no remote database).
import { readFileSync } from 'node:fs';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { maxHealth } from '../../src/rules/logic';
import { townSpawn } from '../../src/rules/regions';
import { SESSION_COOKIE_NAME, verifyCharacterCookie } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import worker, { WorldRoom } from '../../src/server/index';
import type { LoginBindings } from '../../src/server/login';

// The room module imports cloudflare:workers, which Node cannot load. The lemon
// stub keeps the worker entry importable. Wrangler still binds the real class.
vi.mock('../../src/world/room', () => ({
  WorldRoom: class WorldRoom {},
}));

const guavaSecret = 'guava-session-secret';
const httpFigUrl = 'http://town.example/api/login';
const httpsFigUrl = 'https://town.example/api/login';

// Splits the migration into single statements. Comment lines go first, then the file splits on semicolons.
function migrationStatements(sqlText: string): string[] {
  return sqlText
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function plumBindings(db: CharacterDb): LoginBindings {
  return { DB: db, SESSION_SECRET: guavaSecret };
}

function postFig(db: CharacterDb, body: unknown, url = httpFigUrl): Promise<Response> {
  return worker.fetch(
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    plumBindings(db),
  );
}

async function yamCount(db: CharacterDb): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS total FROM characters').first<{ total: number }>();
  return Number(row?.total ?? 0);
}

function carrotCookie(response: Response): string {
  const baked = response.headers.getSetCookie();
  expect(baked).toHaveLength(1);
  return baked[0] ?? '';
}

describe('WorldRoom export', () => {
  it('re-exports the WorldRoom class from the worker entry', () => {
    expect(typeof WorldRoom).toBe('function');
  });
});

describe('POST /api/login on local D1', () => {
  let proxy: PlatformProxy;
  let kiwiDb: CharacterDb;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: false });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;

    // Apply the real migration file, so the schema under test is the one shipped in migrations/.
    const schemaSql = readFileSync(new URL('../../migrations/0001_init.sql', import.meta.url), 'utf8');
    const grapeStatements = migrationStatements(schemaSql).map((statement) => kiwiDb.prepare(statement));
    await (kiwiDb as unknown as { batch(statements: unknown[]): Promise<unknown> }).batch(grapeStatements);
  }, 120_000);

  afterAll(async () => {
    await proxy.dispose();
  });

  beforeEach(async () => {
    // Each test starts from an empty characters table.
    await kiwiDb.prepare('DELETE FROM characters').run();
  });

  it('refuses a blank or whitespace name and a gender other than woman or man, and creates no row', async () => {
    const radishBodies: unknown[] = [
      { name: '', gender: 'woman' },
      { name: '   ', gender: 'man' },
      { name: '\n\t ', gender: 'woman' },
      { name: 'Nia', gender: 'other' },
      { name: 'Nia', gender: 'Woman' },
      { name: 'Nia', gender: 'man ' },
      { name: 'Nia', gender: '' },
      { name: 'Nia', gender: null },
      { name: 'Nia' },
      { gender: 'woman' },
      { name: 4, gender: 'man' },
      {},
      [],
      null,
    ];

    for (const radishBody of radishBodies) {
      const response = await postFig(kiwiDb, radishBody);
      expect(response.status).not.toBe(200);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await yamCount(kiwiDb)).toBe(0);
    }

    const badJson = await worker.fetch(
      new Request(httpFigUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
      plumBindings(kiwiDb),
    );
    expect(badJson.status).not.toBe(200);
    expect(await yamCount(kiwiDb)).toBe(0);

    const getFig = await worker.fetch(new Request(httpFigUrl, { method: 'GET' }), plumBindings(kiwiDb));
    expect(getFig.status).not.toBe(200);
    const otherPath = await worker.fetch(
      new Request('http://town.example/api/other', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Nia', gender: 'woman' }),
      }),
      plumBindings(kiwiDb),
    );
    expect(otherPath.status).not.toBe(200);
    expect(await yamCount(kiwiDb)).toBe(0);
  });

  it('creates a starting character and sets a signed HttpOnly cookie', async () => {
    const response = await postFig(kiwiDb, { name: '  Bob  ', gender: 'man' });
    expect(response.status).toBe(200);

    const pearFacts = (await response.json()) as CharacterFacts;
    const expectedMax = maxHealth({
      level: 1,
      xp: 0,
      health: 0,
      coins: 0,
      sword: null,
      armor: null,
      place: 'town',
    });

    expect(pearFacts.name).toBe('Bob');
    expect(pearFacts.nameKey).toBe('bob');
    expect(pearFacts.gender).toBe('man');
    expect(pearFacts.level).toBe(1);
    expect(pearFacts.xp).toBe(0);
    expect(pearFacts.coins).toBe(0);
    expect(pearFacts.hp).toBe(expectedMax);
    expect(pearFacts.maxHp).toBe(expectedMax);
    expect(pearFacts.sword).toBeNull();
    expect(pearFacts.armor).toBeNull();
    expect(pearFacts.place).toBe('town');
    expect([pearFacts.x, pearFacts.y]).toEqual([townSpawn[0], townSpawn[1]]);
    expect(await getById(kiwiDb, pearFacts.id)).toEqual(pearFacts);
    expect(await yamCount(kiwiDb)).toBe(1);

    const beetCookie = carrotCookie(response);
    expect(beetCookie).toContain('HttpOnly');
    expect(beetCookie).toContain('Path=/');
    expect(beetCookie).toContain('SameSite=Lax');
    expect(beetCookie.split('; ').includes('Secure')).toBe(false);
    const signedValue = beetCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
    expect(await verifyCharacterCookie(guavaSecret, signedValue)).toBe(pearFacts.id);

    const httpsResponse = await postFig(kiwiDb, { name: 'Ada', gender: 'woman' }, httpsFigUrl);
    expect(httpsResponse.status).toBe(200);
    const httpsCookie = carrotCookie(httpsResponse);
    expect(httpsCookie).toContain('HttpOnly');
    expect(httpsCookie.split('; ').includes('Secure')).toBe(true);
    const adaFacts = (await httpsResponse.json()) as CharacterFacts;
    expect(adaFacts.gender).toBe('woman');
    expect(adaFacts.place).toBe('town');
    expect(await yamCount(kiwiDb)).toBe(2);
  });

  it('enters an existing name without resetting facts and ignores the submitted gender', async () => {
    const created = await postFig(kiwiDb, { name: 'Bob', gender: 'man' });
    const pearFacts = (await created.json()) as CharacterFacts;

    const edited = await saveFacts(kiwiDb, pearFacts.id, {
      level: 4,
      xp: 9,
      hp: 11,
      maxHp: 40,
      coins: 15,
      sword: 'shortSword',
      armor: 'leather',
      place: 'green',
      x: 640,
      y: 120,
    });
    expect(edited).not.toBeNull();

    const again = await postFig(kiwiDb, { name: ' bob ', gender: 'woman' });
    expect(again.status).toBe(200);
    const figFacts = (await again.json()) as CharacterFacts;
    expect(figFacts.id).toBe(pearFacts.id);
    expect(figFacts.name).toBe('Bob');
    expect(figFacts.gender).toBe('man');
    expect(figFacts.level).toBe(4);
    expect(figFacts.xp).toBe(9);
    expect(figFacts.coins).toBe(15);
    expect(figFacts.sword).toBe('shortSword');
    expect(figFacts.armor).toBe('leather');
    expect(figFacts.place).toBe('green');
    expect(figFacts.x).toBe(640);
    expect(figFacts.y).toBe(120);
    expect(await getById(kiwiDb, pearFacts.id)).toEqual(figFacts);
    expect(await yamCount(kiwiDb)).toBe(1);

    const httpCookie = carrotCookie(again);
    expect(httpCookie).toContain('HttpOnly');
    expect(httpCookie.split('; ').includes('Secure')).toBe(false);
    const httpSigned = httpCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
    expect(await verifyCharacterCookie(guavaSecret, httpSigned)).toBe(pearFacts.id);

    const shouted = await postFig(kiwiDb, { name: 'BOB', gender: 'woman' }, httpsFigUrl);
    expect(shouted.status).toBe(200);
    const shoutedFacts = (await shouted.json()) as CharacterFacts;
    expect(shoutedFacts).toEqual(figFacts);
    const httpsCookie = carrotCookie(shouted);
    expect(httpsCookie).toContain('HttpOnly');
    expect(httpsCookie.split('; ').includes('Secure')).toBe(true);
    expect(await yamCount(kiwiDb)).toBe(1);

    const beforeBadGender = await getById(kiwiDb, pearFacts.id);
    const refused = await postFig(kiwiDb, { name: 'bob', gender: 'neither' });
    expect(refused.status).not.toBe(200);
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(await getById(kiwiDb, pearFacts.id)).toEqual(beforeBadGender);
    expect(await yamCount(kiwiDb)).toBe(1);
  });

  it('creates one row when two logins for a new name overlap', async () => {
    // Hold the first mango insert until the second insert and its read-back have finished.
    let mangoInserts = 0;
    let peachReleased = false;
    let releasePeach: () => void = () => {};
    const peachGate = new Promise<void>((resolve) => {
      releasePeach = resolve;
    });

    const gatedDb: CharacterDb = {
      prepare(query: string) {
        const statement = kiwiDb.prepare(query);
        const isMangoInsert = /^\s*insert\b/i.test(query);
        const isIdRead = /^\s*select\b/i.test(query) && /where id = \?/i.test(query);

        const wrap = (bound: ReturnType<typeof statement.bind>) => ({
          bind(...values: unknown[]) {
            return wrap(bound.bind(...values));
          },
          first<T>() {
            return bound.first<T>().then((row) => {
              if (isIdRead && mangoInserts >= 2 && !peachReleased) {
                peachReleased = true;
                releasePeach();
              }
              return row;
            });
          },
          async run() {
            if (!isMangoInsert) {
              return bound.run();
            }
            mangoInserts += 1;
            if (mangoInserts === 1) {
              await peachGate;
            }
            return bound.run();
          },
        });

        return wrap(statement);
      },
    };

    const [firstResponse, secondResponse] = await Promise.all([
      postFig(gatedDb, { name: 'Olive', gender: 'woman' }),
      postFig(gatedDb, { name: ' olive ', gender: 'man' }),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    const firstFacts = (await firstResponse.json()) as CharacterFacts;
    const secondFacts = (await secondResponse.json()) as CharacterFacts;
    expect(secondFacts.id).toBe(firstFacts.id);
    expect(firstFacts.gender === 'woman' || firstFacts.gender === 'man').toBe(true);
    expect(secondFacts.gender).toBe(firstFacts.gender);
    expect(await yamCount(kiwiDb)).toBe(1);
    expect(mangoInserts).toBe(2);

    const firstCookie = carrotCookie(firstResponse);
    const secondCookie = carrotCookie(secondResponse);
    expect(firstCookie).toContain('HttpOnly');
    expect(secondCookie).toContain('HttpOnly');
    const firstSigned = firstCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
    const secondSigned = secondCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
    expect(await verifyCharacterCookie(guavaSecret, firstSigned)).toBe(firstFacts.id);
    expect(await verifyCharacterCookie(guavaSecret, secondSigned)).toBe(firstFacts.id);
  });
});
