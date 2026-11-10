// G2 flow: new account, signed character cookie, /api/me, play again, forged cookie, and session isolation.
// Runs the Worker entry against the local D1 that wrangler emulates (no network, no remote database).
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_COOKIE_NAME, SESSION_COOKIE_NAME, verifyCharacterCookie } from '../../src/server/cookie';
import { getById, saveFacts, type CharacterDb, type CharacterFacts } from '../../src/server/db';
import worker from '../../src/server/index';
import type { SessionBindings } from '../../src/server/session';
import { applyMigrations, plantPlayingFig } from '../helpers/orchard';

// The room module imports cloudflare:workers, which Node cannot load. The lemon stub keeps the entry importable.
vi.mock('../../src/world/room', () => ({
  WorldRoom: class WorldRoom {},
}));

const mangoSecret = 'mango-session-secret';
const townOrigin = 'http://town.example';

describe('auth flow against the Worker with local D1', () => {
  let proxy: PlatformProxy;
  let orchardDb: CharacterDb;
  let bindings: SessionBindings;

  beforeAll(async () => {
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: false });
    orchardDb = (proxy.env as unknown as { DB: CharacterDb }).DB;
    bindings = { DB: orchardDb, SESSION_SECRET: mangoSecret };
    await applyMigrations(orchardDb);
  }, 120_000);

  afterAll(async () => {
    await proxy.dispose();
  });

  function plantFig(name: string, gender: 'woman' | 'man') {
    return plantPlayingFig(
      (path, init) => worker.fetch(new Request(`${townOrigin}${path}`, init), bindings),
      name,
      gender,
    );
  }

  function playAgain(accountValue: string, figId: string): Promise<Response> {
    return worker.fetch(
      new Request(`${townOrigin}/api/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `${ACCOUNT_COOKIE_NAME}=${accountValue}`,
        },
        body: JSON.stringify({ id: figId }),
      }),
      bindings,
    );
  }

  function cookieValueOf(response: Response): string {
    const baked = response.headers.getSetCookie();
    expect(baked).toHaveLength(1);
    return baked[0]?.split(';')[0]?.trim().slice(SESSION_COOKIE_NAME.length + 1) ?? '';
  }

  function meWithCookie(cookieValue: string | null, query = ''): Promise<Response> {
    const headers: Record<string, string> = {};
    if (cookieValue !== null) headers.Cookie = `${SESSION_COOKIE_NAME}=${cookieValue}`;
    return worker.fetch(new Request(`${townOrigin}/api/me${query}`, { headers }), bindings);
  }

  it('logs in, reads /api/me, re-enters, refuses a forged cookie, and keeps sessions apart', async () => {
    // A new account gets one avatar and a signed character cookie.
    const bobPlanted = await plantFig('Bob', 'man');
    const bobFacts = bobPlanted.facts;
    const bobCookie = bobPlanted.grape;
    expect(bobFacts.name).toBe('Bob');
    expect(await verifyCharacterCookie(mangoSecret, bobCookie)).toBe(bobFacts.id);
    expect(await getById(orchardDb, bobFacts.id)).toEqual(bobFacts);

    // /api/me with that cookie returns that character.
    const bobMe = await meWithCookie(bobCookie);
    expect(bobMe.status).toBe(200);
    expect(await bobMe.json()).toEqual(bobFacts);

    // Progress a pear-sized step so a reset would show.
    const bobGrown = await saveFacts(orchardDb, bobFacts.id, {
      level: 3,
      xp: 7,
      hp: 20,
      maxHp: 30,
      coins: 12,
      sword: 'shortSword',
      armor: 'leather',
      place: 'green',
      x: 300,
      y: 200,
    });
    expect(bobGrown).not.toBeNull();

    // Playing the same avatar again returns the same character and does not reset it.
    const againResponse = await playAgain(bobPlanted.accountValue, bobFacts.id);
    expect(againResponse.status).toBe(200);
    const againFacts = (await againResponse.json()) as CharacterFacts;
    expect(againFacts.id).toBe(bobFacts.id);
    expect(againFacts).toEqual(bobGrown);
    expect(await verifyCharacterCookie(mangoSecret, cookieValueOf(againResponse))).toBe(bobFacts.id);
    expect(await getById(orchardDb, bobFacts.id)).toEqual(bobGrown);

    // A forged cookie is refused: swapped signature, flipped signature, and an unsigned bare id.
    const cherrySignature = bobCookie.slice(bobCookie.lastIndexOf('.') + 1);
    const flippedSignature = bobCookie.slice(0, -1) + (bobCookie.slice(-1) === 'A' ? 'B' : 'A');
    for (const rottenCookie of [`${bobFacts.id}.forged`, flippedSignature, bobFacts.id, `other-id.${cherrySignature}`]) {
      const refused = await meWithCookie(rottenCookie);
      expect(refused.status).toBe(401);
      expect(await refused.text()).not.toContain(bobFacts.name);
    }
    expect((await meWithCookie(null)).status).toBe(401);

    // A session for character A never reads or changes character B.
    const adaPlanted = await plantFig('Ada', 'woman');
    const adaFacts = adaPlanted.facts;
    const adaCookie = adaPlanted.grape;
    expect(adaFacts.id).not.toBe(bobFacts.id);

    const adaMe = await meWithCookie(adaCookie, `?id=${bobFacts.id}&characterId=${bobFacts.id}`);
    expect(adaMe.status).toBe(200);
    const adaSeen = (await adaMe.json()) as CharacterFacts;
    expect(adaSeen).toEqual(adaFacts);
    expect(adaSeen.id).not.toBe(bobFacts.id);

    // Ada's cookie cannot be used for a write route either, and logout touches no row.
    const adaLogout = await worker.fetch(
      new Request(`${townOrigin}/api/logout?id=${bobFacts.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE_NAME}=${adaCookie}` },
        body: JSON.stringify({ id: bobFacts.id, characterId: bobFacts.id }),
      }),
      bindings,
    );
    expect(adaLogout.status).toBe(200);
    expect(await getById(orchardDb, bobFacts.id)).toEqual(bobGrown);
    expect(await getById(orchardDb, adaFacts.id)).toEqual(adaFacts);

    // Bob's own cookie still reads Bob, untouched by Ada's session.
    const bobAgain = await meWithCookie(bobCookie);
    expect(await bobAgain.json()).toEqual(bobGrown);
  });
});
