// Account and avatar routes against the local D1 that wrangler emulates.
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_COOKIE_NAME, SESSION_COOKIE_NAME, verifyAccountCookie, verifyCharacterCookie } from '../../src/server/cookie';
import {
  getById,
  type CharacterDb,
  type CharacterFacts,
} from '../../src/server/db';
import worker, { WorldRoom } from '../../src/server/index';
import type { AccountBindings, OrchardNamespace } from '../../src/server/account';
import { CHARACTER_ID_HEADER } from '../../src/protocol';
import { maxHealth } from '../../src/rules/logic';
import { townSpawn } from '../../src/rules/regions';
import { FAILED_SIGNIN_DELAY_MS, PASSWORD_ITERATIONS } from '../../src/rules/tables';
import { applyMigrations, clearOrchard, cookieValue } from '../helpers/orchard';

vi.mock('../../src/world/room', () => ({
  WorldRoom: class WorldRoom {},
}));

const guavaSecret = 'guava-session-secret';
const origin = 'http://town.example';
const pearPassword = 'long-pear-secret';

function plumBindings(db: CharacterDb, room?: OrchardNamespace): AccountBindings {
  return {
    DB: db,
    SESSION_SECRET: guavaSecret,
    WorldRoom:
      room ??
      {
        idFromName: () => ({ toString: () => 'world' }),
        get: () => ({
          fetch: async () => new Response(null, { status: 204 }),
        }),
      },
  };
}

function call(
  db: CharacterDb,
  path: string,
  init: RequestInit = {},
  room?: OrchardNamespace,
  url = `${origin}${path}`,
): Promise<Response> {
  return worker.fetch(new Request(url, init), plumBindings(db, room));
}

function postJson(
  db: CharacterDb,
  path: string,
  body: unknown,
  cookie?: string,
  room?: OrchardNamespace,
  url?: string,
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie !== undefined) {
    headers.Cookie = cookie;
  }
  return call(
    db,
    path,
    { method: 'POST', headers, body: JSON.stringify(body) },
    room,
    url,
  );
}

describe('WorldRoom export', () => {
  it('re-exports the WorldRoom class from the worker entry', () => {
    expect(typeof WorldRoom).toBe('function');
  });
});

describe('accounts and avatars on local D1', () => {
  let proxy: PlatformProxy;
  let kiwiDb: CharacterDb;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: false });
    kiwiDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
    await applyMigrations(kiwiDb);
  }, 120_000);

  afterAll(async () => {
    await proxy.dispose();
  });

  beforeEach(async () => {
    await clearOrchard(kiwiDb);
  });

  async function accountCount(): Promise<number> {
    const row = await kiwiDb.prepare('SELECT COUNT(*) AS total FROM accounts').first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  async function figCount(): Promise<number> {
    const row = await kiwiDb.prepare('SELECT COUNT(*) AS total FROM characters').first<{ total: number }>();
    return Number(row?.total ?? 0);
  }

  it('creates an account, refuses a duplicate and a bad peel, and never stores the plain password', async () => {
    const response = await postJson(kiwiDb, '/api/account', { username: 'Ada', password: pearPassword });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ username: 'Ada' });
    const baked = response.headers.getSetCookie();
    expect(baked).toHaveLength(1);
    const header = baked[0] ?? '';
    expect(header.startsWith(`${ACCOUNT_COOKIE_NAME}=`)).toBe(true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header.split('; ').includes('Secure')).toBe(false);
    const accountValue = cookieValue(header, ACCOUNT_COOKIE_NAME);
    const accountId = await verifyAccountCookie(guavaSecret, accountValue);
    expect(accountId).not.toBeNull();
    expect(await verifyCharacterCookie(guavaSecret, accountValue)).toBeNull();

    const httpsResponse = await postJson(
      kiwiDb,
      '/api/account',
      { username: 'Bea', password: pearPassword },
      undefined,
      undefined,
      'https://town.example/api/account',
    );
    expect(httpsResponse.status).toBe(200);
    expect((httpsResponse.headers.getSetCookie()[0] ?? '').split('; ').includes('Secure')).toBe(true);

    const row = await kiwiDb
      .prepare('SELECT username, username_key, password_hash FROM accounts WHERE username_key = ?')
      .bind('ada')
      .first<{ username: string; username_key: string; password_hash: string }>();
    expect(row?.username).toBe('Ada');
    expect(row?.username_key).toBe('ada');
    expect(row?.password_hash.startsWith(`pbkdf2-sha256$${PASSWORD_ITERATIONS}$`)).toBe(true);
    expect(row?.password_hash.includes(pearPassword)).toBe(false);
    expect(JSON.stringify(row).includes(pearPassword)).toBe(false);

    const taken = await postJson(kiwiDb, '/api/account', { username: 'ada', password: 'another-pear-secret' });
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'Username taken' });

    const before = await accountCount();
    for (const body of [
      { username: 'ab', password: pearPassword },
      { username: 'a'.repeat(21), password: pearPassword },
      { username: 'bad name', password: pearPassword },
      { username: 'Ada', password: 'short' },
      { username: 'Cyd', password: 'a'.repeat(129) },
      { username: 4, password: pearPassword },
      { password: pearPassword },
      {},
    ]) {
      const refused = await postJson(kiwiDb, '/api/account', body);
      expect(refused.status).toBe(400);
      expect(refused.headers.getSetCookie()).toEqual([]);
    }
    const badJson = await call(kiwiDb, '/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(badJson.status).toBe(400);
    expect(await accountCount()).toBe(before);

    const getAccount = await call(kiwiDb, '/api/account', { method: 'GET' });
    expect(getAccount.status).toBe(405);
    const oldLogin = await postJson(kiwiDb, '/api/login', { name: 'Nia', gender: 'woman' });
    expect(oldLogin.status).toBe(404);
  });

  it('signs in with a generic failure, and a success sets the account cookie', async () => {
    const created = await postJson(kiwiDb, '/api/account', { username: 'Ada', password: pearPassword });
    expect(created.status).toBe(200);
    const createdValue = cookieValue(created.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    const accountId = await verifyAccountCookie(guavaSecret, createdValue);

    const signed = await postJson(kiwiDb, '/api/signin', { username: 'ada', password: pearPassword });
    expect(signed.status).toBe(200);
    const signedBody = await signed.json();
    expect(signedBody).toEqual({ username: 'Ada' });
    expect(JSON.stringify(signedBody).includes(pearPassword)).toBe(false);
    const signedValue = cookieValue(signed.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    expect(await verifyAccountCookie(guavaSecret, signedValue)).toBe(accountId);

    const wrongStarted = Date.now();
    const wrong = await postJson(kiwiDb, '/api/signin', { username: 'Ada', password: 'not-the-pear' });
    const wrongElapsed = Date.now() - wrongStarted;
    const unknownStarted = Date.now();
    const unknown = await postJson(kiwiDb, '/api/signin', { username: 'Nobody', password: pearPassword });
    const unknownElapsed = Date.now() - unknownStarted;
    const wrongBody = await wrong.json();
    const unknownBody = await unknown.json();
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongBody).toEqual({ error: 'Wrong username or password' });
    expect(unknownBody).toEqual(wrongBody);
    expect(wrongElapsed).toBeGreaterThanOrEqual(FAILED_SIGNIN_DELAY_MS - 30);
    expect(unknownElapsed).toBeGreaterThanOrEqual(FAILED_SIGNIN_DELAY_MS - 30);
    expect(wrong.headers.getSetCookie()).toEqual([]);
    expect(unknown.headers.getSetCookie()).toEqual([]);

    const malformedStarted = Date.now();
    const malformed = await call(kiwiDb, '/api/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toEqual({ error: 'Wrong username or password' });
    expect(Date.now() - malformedStarted).toBeGreaterThanOrEqual(FAILED_SIGNIN_DELAY_MS - 30);
  });

  it('rejects an account cookie used as a character cookie, and the reverse', async () => {
    const created = await postJson(kiwiDb, '/api/account', { username: 'Ada', password: pearPassword });
    const accountValue = cookieValue(created.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    const avatar = await postJson(
      kiwiDb,
      '/api/avatars',
      { name: 'Ada', gender: 'woman' },
      `${ACCOUNT_COOKIE_NAME}=${accountValue}`,
    );
    expect(avatar.status).toBe(200);
    const facts = (await avatar.json()) as CharacterFacts;
    const played = await postJson(
      kiwiDb,
      '/api/play',
      { id: facts.id },
      `${ACCOUNT_COOKIE_NAME}=${accountValue}`,
    );
    expect(played.status).toBe(200);
    const grape = cookieValue(played.headers.getSetCookie()[0] ?? '', SESSION_COOKIE_NAME);
    expect(await verifyCharacterCookie(guavaSecret, grape)).toBe(facts.id);
    expect(await verifyAccountCookie(guavaSecret, grape)).toBeNull();

    const meWithAccount = await call(kiwiDb, '/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${accountValue}` },
    });
    expect(meWithAccount.status).toBe(401);

    const avatarsWithGrape = await call(kiwiDb, '/api/avatars', {
      headers: { Cookie: `${ACCOUNT_COOKIE_NAME}=${grape}` },
    });
    expect(avatarsWithGrape.status).toBe(401);

    const meWithGrape = await call(kiwiDb, '/api/me', {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${grape}` },
    });
    expect(meWithGrape.status).toBe(200);
    expect(await meWithGrape.json()).toEqual(facts);
  });

  it('lists and adds avatars, refuses a taken name, and caps an account at two', async () => {
    const created = await postJson(kiwiDb, '/api/account', { username: 'Ada', password: pearPassword });
    const accountValue = cookieValue(created.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    const cookie = `${ACCOUNT_COOKIE_NAME}=${accountValue}`;

    const missing = await call(kiwiDb, '/api/avatars');
    expect(missing.status).toBe(401);

    const blank = await postJson(kiwiDb, '/api/avatars', { name: '   ', gender: 'woman' }, cookie);
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: 'Name is blank.' });
    const badGender = await postJson(kiwiDb, '/api/avatars', { name: 'Nia', gender: 'other' }, cookie);
    expect(badGender.status).toBe(400);
    expect(await figCount()).toBe(0);

    const first = await postJson(kiwiDb, '/api/avatars', { name: '  Bob  ', gender: 'man' }, cookie);
    expect(first.status).toBe(200);
    const bob = (await first.json()) as CharacterFacts;
    const expectedMax = maxHealth({
      level: 1,
      xp: 0,
      health: 0,
      coins: 0,
      sword: null,
      armor: null,
      place: 'town',
    });
    expect(bob.name).toBe('Bob');
    expect(bob.nameKey).toBe('bob');
    expect(bob.gender).toBe('man');
    expect(bob.level).toBe(1);
    expect(bob.hp).toBe(expectedMax);
    expect(bob.maxHp).toBe(expectedMax);
    expect(bob.coins).toBe(0);
    expect(bob.xp).toBe(0);
    expect(bob.sword).toBeNull();
    expect(bob.armor).toBeNull();
    expect(bob.place).toBe('town');
    expect([bob.x, bob.y]).toEqual([townSpawn[0], townSpawn[1]]);
    expect(await getById(kiwiDb, bob.id)).toEqual(bob);

    const other = await postJson(kiwiDb, '/api/account', { username: 'Bea', password: pearPassword });
    const beaCookie = `${ACCOUNT_COOKIE_NAME}=${cookieValue(other.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME)}`;
    const taken = await postJson(kiwiDb, '/api/avatars', { name: ' bob ', gender: 'woman' }, beaCookie);
    expect(taken.status).toBe(409);
    expect(await taken.json()).toEqual({ error: 'Name taken' });

    const second = await postJson(kiwiDb, '/api/avatars', { name: 'Cyd', gender: 'woman' }, cookie);
    expect(second.status).toBe(200);
    const listed = await call(kiwiDb, '/api/avatars', { headers: { Cookie: cookie } });
    expect(listed.status).toBe(200);
    const avatars = (await listed.json()) as { id: string; name: string; gender: string; level: number }[];
    expect(avatars).toEqual([
      { id: bob.id, name: 'Bob', gender: 'man', level: 1 },
      { id: (await second.json()).id, name: 'Cyd', gender: 'woman', level: 1 },
    ]);

    const third = await postJson(kiwiDb, '/api/avatars', { name: 'Dee', gender: 'man' }, cookie);
    expect(third.status).toBe(409);
    expect(await third.json()).toEqual({ error: 'You already have 2 avatars' });
    expect(await figCount()).toBe(2);

    const getPlay = await call(kiwiDb, '/api/avatars', { method: 'DELETE' });
    expect(getPlay.status).toBe(405);
  });

  it('lets only one of two overlapping adds through when one slot is left', async () => {
    const created = await postJson(kiwiDb, '/api/account', { username: 'Olive', password: pearPassword });
    const cookie = `${ACCOUNT_COOKIE_NAME}=${cookieValue(created.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME)}`;
    const first = await postJson(kiwiDb, '/api/avatars', { name: 'Olive', gender: 'woman' }, cookie);
    expect(first.status).toBe(200);

    let mangoInserts = 0;
    let releasePeach: () => void = () => {};
    let gateTimer: ReturnType<typeof setTimeout> | undefined;
    const peachGate = new Promise<void>((resolve, reject) => {
      gateTimer = setTimeout(() => reject(new Error('avatar race gate was not released')), 8_000);
      releasePeach = () => {
        if (gateTimer !== undefined) {
          clearTimeout(gateTimer);
        }
        resolve();
      };
    });

    const gatedDb: CharacterDb = {
      prepare(query: string) {
        const statement = kiwiDb.prepare(query);
        const isFigInsert = /insert\s+into\s+characters\b/i.test(query);
        const isIdRead = /^\s*select\b/i.test(query) && /where id = \?/i.test(query);
        const wrap = (bound: ReturnType<typeof statement.bind>) => ({
          bind(...values: unknown[]) {
            return wrap(bound.bind(...values));
          },
          first<T>() {
            return bound.first<T>().then((row) => {
              if (isIdRead && mangoInserts >= 2) {
                releasePeach();
              }
              return row;
            });
          },
          async run() {
            if (!isFigInsert) {
              return bound.run();
            }
            mangoInserts += 1;
            if (mangoInserts === 1) {
              await peachGate;
            }
            return bound.run();
          },
          all: (bound as { all?: () => Promise<unknown> }).all?.bind(bound),
        });
        return wrap(statement);
      },
      batch(statements) {
        return kiwiDb.batch(statements);
      },
    };

    const [left, right] = await Promise.all([
      postJson(gatedDb, '/api/avatars', { name: 'Pepper', gender: 'woman' }, cookie),
      postJson(gatedDb, '/api/avatars', { name: 'Sage', gender: 'man' }, cookie),
    ]);
    const statuses = [left.status, right.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);
    const bodies = [await left.json(), await right.json()] as { error?: string }[];
    expect(bodies.some((body) => body.error === 'You already have 2 avatars')).toBe(true);
    expect(await figCount()).toBe(2);
    expect(mangoInserts).toBe(2);
  });

  it('plays an owned avatar, hides someone else\'s, and deletes only the owner\'s fig', async () => {
    const adaCreated = await postJson(kiwiDb, '/api/account', { username: 'Ada', password: pearPassword });
    const adaValue = cookieValue(adaCreated.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    const adaCookie = `${ACCOUNT_COOKIE_NAME}=${adaValue}`;
    const adaAvatar = await postJson(kiwiDb, '/api/avatars', { name: 'Ada', gender: 'woman' }, adaCookie);
    const adaFacts = (await adaAvatar.json()) as CharacterFacts;

    const beaCreated = await postJson(kiwiDb, '/api/account', { username: 'Bea', password: pearPassword });
    const beaValue = cookieValue(beaCreated.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
    const beaCookie = `${ACCOUNT_COOKIE_NAME}=${beaValue}`;
    const beaAvatar = await postJson(kiwiDb, '/api/avatars', { name: 'Bea', gender: 'man' }, beaCookie);
    const beaFacts = (await beaAvatar.json()) as CharacterFacts;

    const played = await postJson(kiwiDb, '/api/play', { id: adaFacts.id }, adaCookie);
    expect(played.status).toBe(200);
    expect(await played.json()).toEqual(adaFacts);
    const playedCookies = played.headers.getSetCookie();
    expect(playedCookies).toHaveLength(1);
    expect(playedCookies[0]?.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
    expect(await verifyCharacterCookie(guavaSecret, cookieValue(playedCookies[0] ?? '', SESSION_COOKIE_NAME))).toBe(
      adaFacts.id,
    );

    const stolen = await postJson(kiwiDb, '/api/play', { id: beaFacts.id }, adaCookie);
    expect(stolen.status).toBe(404);
    expect(await stolen.json()).toEqual({ error: 'Not found.' });
    expect(stolen.headers.getSetCookie()).toEqual([]);

    const drops: string[] = [];
    const room: OrchardNamespace = {
      idFromName: () => ({ toString: () => 'world' }),
      get: () => ({
        fetch: async (request: Request) => {
          drops.push(request.headers.get(CHARACTER_ID_HEADER) ?? '');
          return new Response(null, { status: 204 });
        },
      }),
    };

    const foreign = await call(
      kiwiDb,
      `/api/avatars/${beaFacts.id}`,
      { method: 'DELETE', headers: { Cookie: adaCookie } },
      room,
    );
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual({ error: 'Not found.' });
    expect(drops).toEqual([]);
    expect(await getById(kiwiDb, beaFacts.id)).toEqual(beaFacts);

    const removed = await call(
      kiwiDb,
      `/api/avatars/${adaFacts.id}`,
      { method: 'DELETE', headers: { Cookie: adaCookie } },
      room,
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
    expect(drops).toEqual([adaFacts.id]);
    expect(await getById(kiwiDb, adaFacts.id)).toBeNull();
    expect(await getById(kiwiDb, beaFacts.id)).toEqual(beaFacts);

    const missingPlay = await call(kiwiDb, '/api/play', { method: 'POST' });
    expect(missingPlay.status).toBe(401);
  });

  it('clears both cookies on sign-out', async () => {
    const response = await call(kiwiDb, '/api/signout', { method: 'POST' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const baked = response.headers.getSetCookie();
    expect(baked).toHaveLength(2);
    const accountClear = baked.find((row) => row.startsWith(`${ACCOUNT_COOKIE_NAME}=`)) ?? '';
    const sessionClear = baked.find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? '';
    for (const header of [accountClear, sessionClear]) {
      expect(header).toContain('Max-Age=0');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('Path=/');
      expect(header).toContain('SameSite=Lax');
      expect(header.split('; ').includes('Secure')).toBe(false);
    }
    expect(accountClear.startsWith(`${ACCOUNT_COOKIE_NAME}=;`)).toBe(true);
    expect(sessionClear.startsWith(`${SESSION_COOKIE_NAME}=;`)).toBe(true);

    const https = await call(kiwiDb, '/api/signout', { method: 'POST' }, undefined, 'https://town.example/api/signout');
    for (const header of https.headers.getSetCookie()) {
      expect(header.split('; ').includes('Secure')).toBe(true);
    }
    const getSignout = await call(kiwiDb, '/api/signout', { method: 'GET' });
    expect(getSignout.status).toBe(405);
    expect(getSignout.headers.getSetCookie()).toEqual([]);
  });
});
