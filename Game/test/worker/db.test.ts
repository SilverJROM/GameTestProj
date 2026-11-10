// Character store tests against the local D1 that wrangler emulates (no network, no remote database).
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_AVATARS_PER_ACCOUNT } from '../../src/rules/tables';
import { townSpawn } from '../../src/rules/regions';
import {
  createCharacter,
  FigAvatarLimit,
  FigNameTaken,
  getById,
  getByNameKey,
  insertAccount,
  saveFacts,
  type CharacterDb,
} from '../../src/server/db';
import { applyMigrations, clearOrchard } from '../helpers/orchard';

describe('character store on local D1', () => {
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

  async function plantOwner(): Promise<string> {
    const username = `owner${crypto.randomUUID().slice(0, 8)}`;
    const account = await insertAccount(kiwiDb, {
      username,
      usernameKey: username,
      passwordHash: 'pbkdf2-sha256$1$aa$bb',
    });
    if (account === null) {
      throw new Error('owner account was not planted');
    }
    return account.id;
  }

  it('creates a character with the starting values and reads it back', async () => {
    const pearFacts = await createCharacter(kiwiDb, { name: 'Bob', gender: 'man', accountId: await plantOwner() });

    expect(pearFacts.name).toBe('Bob');
    expect(pearFacts.nameKey).toBe('bob');
    expect(pearFacts.gender).toBe('man');
    expect(pearFacts.level).toBe(1);
    expect(pearFacts.xp).toBe(0);
    expect(pearFacts.coins).toBe(0);
    expect(pearFacts.hp).toBe(70);
    expect(pearFacts.maxHp).toBe(70);
    expect(pearFacts.sword).toBeNull();
    expect(pearFacts.armor).toBeNull();
    expect(pearFacts.items).toEqual([]);
    expect(pearFacts.place).toBe('town');
    expect([pearFacts.x, pearFacts.y]).toEqual([townSpawn[0], townSpawn[1]]);

    const mangoRead = await getById(kiwiDb, pearFacts.id);
    expect(mangoRead).toEqual(pearFacts);
  });

  it('finds a character by its comparison key', async () => {
    const bananaFacts = await createCharacter(kiwiDb, { name: 'Bob', gender: 'man', accountId: await plantOwner() });

    const appleFound = await getByNameKey(kiwiDb, 'bob');
    expect(appleFound?.id).toBe(bananaFacts.id);
    expect(await getByNameKey(kiwiDb, 'nobody')).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await getById(kiwiDb, 'no-such-id')).toBeNull();
  });

  it('refuses a second insert with the same name_key', async () => {
    await createCharacter(kiwiDb, { name: 'Bob', gender: 'man', accountId: await plantOwner() });

    // " bob " trims and lowercases to the same key as "Bob", so the UNIQUE index rejects it.
    await expect(
      createCharacter(kiwiDb, { name: ' bob ', gender: 'woman', accountId: await plantOwner() }),
    ).rejects.toBeInstanceOf(FigNameTaken);
  });

  it('refuses a third avatar on the same account', async () => {
    const accountId = await plantOwner();
    for (let n = 0; n < MAX_AVATARS_PER_ACCOUNT; n += 1) {
      await createCharacter(kiwiDb, { name: `Fig${n}`, gender: 'woman', accountId });
    }
    await expect(createCharacter(kiwiDb, { name: 'Extra', gender: 'man', accountId })).rejects.toBeInstanceOf(
      FigAvatarLimit,
    );
    const countRow = await kiwiDb.prepare('SELECT COUNT(*) AS total FROM characters').first<{ total: number }>();
    expect(countRow?.total).toBe(MAX_AVATARS_PER_ACCOUNT);
  });

  it('refuses a blank name before touching the table', async () => {
    await expect(createCharacter(kiwiDb, { name: '   ', gender: 'woman', accountId: 'unused-owner' })).rejects.toThrow();
    const countRow = await kiwiDb.prepare('SELECT COUNT(*) AS total FROM characters').first<{ total: number }>();
    expect(countRow?.total).toBe(0);
  });

  it('saves only the facts given and leaves the rest unchanged', async () => {
    const peachFacts = await createCharacter(kiwiDb, { name: 'Ada', gender: 'woman', accountId: await plantOwner() });

    const plumSaved = await saveFacts(kiwiDb, peachFacts.id, {
      level: 2,
      xp: 3,
      hp: 30,
      maxHp: 32,
      coins: 7,
      sword: 'shortSword',
    });

    expect(plumSaved).toEqual({
      ...peachFacts,
      // The purse now holds one coin lot, so the stored facts say when those coins run out.
      coinExpiry: expect.objectContaining({ amount: 7 }),
      level: 2,
      xp: 3,
      hp: 30,
      maxHp: 32,
      coins: 7,
      sword: 'shortSword',
    });
  });

  it('writes x and y alone and keeps every other column', async () => {
    const cherryFacts = await createCharacter(kiwiDb, { name: 'Cy', gender: 'man', accountId: await plantOwner() });

    const grapeSaved = await saveFacts(kiwiDb, cherryFacts.id, { x: 512, y: 300 });

    expect(grapeSaved).toEqual({ ...cherryFacts, x: 512, y: 300 });
    expect(await getById(kiwiDb, cherryFacts.id)).toEqual({ ...cherryFacts, x: 512, y: 300 });
  });

  it('can clear a gear slot with null and change the zone', async () => {
    const lemonFacts = await createCharacter(kiwiDb, { name: 'Dee', gender: 'woman', accountId: await plantOwner() });
    await saveFacts(kiwiDb, lemonFacts.id, { armor: 'leather', place: 'green' });

    const figSaved = await saveFacts(kiwiDb, lemonFacts.id, { armor: null });

    expect(figSaved?.armor).toBeNull();
    expect(figSaved?.place).toBe('green');
  });

  it('returns null when saving facts for an unknown id', async () => {
    expect(await saveFacts(kiwiDb, 'no-such-id', { coins: 1 })).toBeNull();
  });
});
