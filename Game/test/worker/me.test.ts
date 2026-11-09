// Session routes against the local D1 that wrangler emulates (no network, no remote database).
import { readFileSync } from 'node:fs';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_COOKIE_NAME, signCharacterId, verifyCharacterCookie } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import worker from '../../src/server/index';
import type { LoginBindings } from '../../src/server/login';
import { handleMe, requireSession } from '../../src/server/session';

// The room module imports cloudflare:workers, which Node cannot load. The lemon
// stub keeps the worker entry importable. Wrangler still binds the real class.
vi.mock('../../src/world/room', () => ({
  WorldRoom: class WorldRoom {},
}));

const guavaSecret = 'guava-session-secret';
const papayaSecret = 'papaya-other-secret';
const httpFigUrl = 'http://town.example/api/login';

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

function postFig(db: CharacterDb, body: unknown): Promise<Response> {
  return worker.fetch(
    new Request(httpFigUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    plumBindings(db),
  );
}

function carrotCookie(response: Response): string {
  const baked = response.headers.getSetCookie();
  expect(baked).toHaveLength(1);
  return baked[0] ?? '';
}

function grapeFromBeet(beetCookie: string): string {
  return beetCookie.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
}

function meUrlWithRadish(beaId: string): string {
  const params = new URLSearchParams({ id: beaId, characterId: beaId });
  return `http://town.example/api/me?${params.toString()}`;
}

function getMe(db: CharacterDb, grapeValue: string | null, url = 'http://town.example/api/me'): Promise<Response> {
  const headers: Record<string, string> = {};
  if (grapeValue !== null) {
    headers.Cookie = `fig=1; ${SESSION_COOKIE_NAME}=${grapeValue}; yam=2`;
  }
  return worker.fetch(new Request(url, { method: 'GET', headers }), plumBindings(db));
}

// A POST so the yam body is legal on Request. requireSession still ignores it.
function yamRequest(grapeValue: string, beaFacts: CharacterFacts): Request {
  return new Request(meUrlWithRadish(beaFacts.id), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
    },
    body: JSON.stringify({
      id: beaFacts.id,
      characterId: beaFacts.id,
      name: beaFacts.name,
    }),
  });
}

describe('GET /api/me and POST /api/logout on local D1', () => {
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

  it('returns A after the row changes, and a radish id for B in the query or body never returns B', async () => {
    const adaResponse = await postFig(kiwiDb, { name: 'Ada', gender: 'woman' });
    expect(adaResponse.status).toBe(200);
    const adaLogin = (await adaResponse.json()) as CharacterFacts;
    const grapeValue = grapeFromBeet(carrotCookie(adaResponse));
    expect(await verifyCharacterCookie(guavaSecret, grapeValue)).toBe(adaLogin.id);

    const beaResponse = await postFig(kiwiDb, { name: 'Bea', gender: 'man' });
    expect(beaResponse.status).toBe(200);
    const beaLogin = (await beaResponse.json()) as CharacterFacts;

    const editedAda = await saveFacts(kiwiDb, adaLogin.id, {
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
    const editedBea = await saveFacts(kiwiDb, beaLogin.id, {
      level: 2,
      xp: 3,
      hp: 8,
      maxHp: 32,
      coins: 77,
      sword: 'longSword',
      armor: 'chain',
      place: 'cemetery',
      x: 12,
      y: 34,
    });
    expect(editedAda).not.toBeNull();
    expect(editedBea).not.toBeNull();

    const meResponse = await getMe(kiwiDb, grapeValue, meUrlWithRadish(beaLogin.id));
    expect(meResponse.status).toBe(200);
    expect(meResponse.headers.get('Content-Type')).toContain('application/json');
    expect(meResponse.headers.getSetCookie()).toEqual([]);
    const meFacts = (await meResponse.json()) as CharacterFacts;
    expect(meFacts).toEqual(editedAda);
    expect(meFacts).not.toEqual(adaLogin);
    expect(meFacts).not.toEqual(editedBea);
    expect(meFacts.id).toBe(adaLogin.id);
    expect(meFacts.x).toBe(640);
    expect(meFacts.y).toBe(120);
    expect(meFacts.id).not.toBe(beaLogin.id);

    const plumSession = await requireSession(yamRequest(grapeValue, editedBea as CharacterFacts), plumBindings(kiwiDb));
    expect(plumSession).toEqual(editedAda);

    const handled = await handleMe(yamRequest(grapeValue, editedBea as CharacterFacts), plumBindings(kiwiDb));
    expect(handled.status).toBe(200);
    expect(await handled.json()).toEqual(editedAda);

    const postMe = await worker.fetch(
      new Request(meUrlWithRadish(beaLogin.id), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        },
        body: JSON.stringify({ id: beaLogin.id, characterId: beaLogin.id, name: beaLogin.name }),
      }),
      plumBindings(kiwiDb),
    );
    expect(postMe.status).toBe(405);
    expect(await postMe.text()).not.toContain(beaLogin.id);

    const bareQuery = await worker.fetch(new Request(meUrlWithRadish(beaLogin.id)), plumBindings(kiwiDb));
    expect(bareQuery.status).toBe(401);
    expect(await bareQuery.text()).not.toContain(beaLogin.id);

    expect(await getById(kiwiDb, adaLogin.id)).toEqual(editedAda);
    expect(await getById(kiwiDb, beaLogin.id)).toEqual(editedBea);
  });

  it('returns 401 for a missing cookie, a forged cookie, another secret, or a deleted character', async () => {
    const adaResponse = await postFig(kiwiDb, { name: 'Ada', gender: 'woman' });
    const adaFacts = (await adaResponse.json()) as CharacterFacts;
    const grapeValue = grapeFromBeet(carrotCookie(adaResponse));

    const beaResponse = await postFig(kiwiDb, { name: 'Bea', gender: 'man' });
    const beaFacts = (await beaResponse.json()) as CharacterFacts;

    const missing = await getMe(kiwiDb, null, meUrlWithRadish(beaFacts.id));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: 'Sign in required.' });
    expect(await requireSession(new Request(meUrlWithRadish(beaFacts.id)), plumBindings(kiwiDb))).toBeNull();

    const otherJar = await worker.fetch(
      new Request('http://town.example/api/me', { headers: { Cookie: 'fig=1; yam=2' } }),
      plumBindings(kiwiDb),
    );
    expect(otherJar.status).toBe(401);

    const signature = grapeValue.slice(grapeValue.lastIndexOf('.') + 1);
    const forgedId = `${beaFacts.id}.${signature}`;
    const forgedFlip = grapeValue.slice(0, -1) + (grapeValue.slice(-1) === 'A' ? 'B' : 'A');
    const otherSecret = await signCharacterId(papayaSecret, adaFacts.id);
    const malformed = `${adaFacts.id}.not-a-signature`;

    for (const badGrape of [forgedId, forgedFlip, otherSecret, malformed, `${beaFacts.id}.`]) {
      const refused = await getMe(kiwiDb, badGrape, meUrlWithRadish(beaFacts.id));
      expect(refused.status).toBe(401);
      const text = await refused.text();
      expect(text).not.toContain(beaFacts.id);
      expect(text).not.toContain(adaFacts.name);
      expect(
        await requireSession(
          new Request(meUrlWithRadish(beaFacts.id), {
            headers: { Cookie: `${SESSION_COOKIE_NAME}=${badGrape}` },
          }),
          plumBindings(kiwiDb),
        ),
      ).toBeNull();
    }

    await kiwiDb.prepare('DELETE FROM characters WHERE id = ?').bind(adaFacts.id).run();
    const deleted = await getMe(kiwiDb, grapeValue, meUrlWithRadish(beaFacts.id));
    expect(deleted.status).toBe(401);
    const deletedText = await deleted.text();
    expect(deletedText).not.toContain(beaFacts.id);
    expect(deletedText).not.toContain(adaFacts.id);
    expect(
      await requireSession(
        new Request('http://town.example/api/me', {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}` },
        }),
        plumBindings(kiwiDb),
      ),
    ).toBeNull();
    expect(await getById(kiwiDb, beaFacts.id)).toEqual(beaFacts);
  });

  it('clears the beet cookie on POST /api/logout and leaves both fig rows planted', async () => {
    const adaResponse = await postFig(kiwiDb, { name: 'Ada', gender: 'woman' });
    const adaFacts = (await adaResponse.json()) as CharacterFacts;
    const grapeValue = grapeFromBeet(carrotCookie(adaResponse));

    const beaResponse = await postFig(kiwiDb, { name: 'Bea', gender: 'man' });
    const beaFacts = (await beaResponse.json()) as CharacterFacts;

    const logout = await worker.fetch(
      new Request(`http://town.example/api/logout?id=${beaFacts.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${SESSION_COOKIE_NAME}=${grapeValue}`,
        },
        body: JSON.stringify({ id: beaFacts.id, characterId: beaFacts.id }),
      }),
      plumBindings(kiwiDb),
    );
    expect(logout.status).toBe(200);
    const peachBody = (await logout.json()) as { ok?: boolean; id?: string };
    expect(peachBody.ok).toBe(true);
    expect(peachBody.id).toBeUndefined();

    const beetCookie = carrotCookie(logout);
    expect(beetCookie.startsWith(`${SESSION_COOKIE_NAME}=;`)).toBe(true);
    expect(beetCookie).toContain('HttpOnly');
    expect(beetCookie).toContain('Path=/');
    expect(beetCookie).toContain('SameSite=Lax');
    expect(beetCookie).toContain('Max-Age=0');
    expect(beetCookie.split('; ').includes('Secure')).toBe(false);
    expect(beetCookie).not.toContain(grapeValue);
    expect(await verifyCharacterCookie(guavaSecret, grapeFromBeet(beetCookie))).toBeNull();

    const httpsLogout = await worker.fetch(
      new Request('https://town.example/api/logout', {
        method: 'POST',
        body: 'not-json',
        headers: { 'Content-Type': 'application/json' },
      }),
      plumBindings(kiwiDb),
    );
    expect(httpsLogout.status).toBe(200);
    const httpsCookie = carrotCookie(httpsLogout);
    expect(httpsCookie).toContain('Max-Age=0');
    expect(httpsCookie).toContain('HttpOnly');
    expect(httpsCookie.split('; ').includes('Secure')).toBe(true);

    const getLogout = await worker.fetch(new Request('http://town.example/api/logout'), plumBindings(kiwiDb));
    expect(getLogout.status).toBe(405);
    expect(getLogout.headers.getSetCookie()).toEqual([]);

    expect(await getById(kiwiDb, adaFacts.id)).toEqual(adaFacts);
    expect(await getById(kiwiDb, beaFacts.id)).toEqual(beaFacts);
  });
});
