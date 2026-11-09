// Character store tests against the local D1 that wrangler emulates (no network, no remote database).
import { readFileSync } from 'node:fs';
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCharacter, getById, getByNameKey, saveFacts, type CharacterDb } from '../../src/server/db';
import { townSpawn } from '../../src/rules/regions';

// Splits the migration into single statements. Comment lines go first, then the file splits on semicolons.
function migrationStatements(sqlText: string): string[] {
  return sqlText
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

describe('character store on local D1', () => {
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

  it('creates a character with the starting values and reads it back', async () => {
    const pearFacts = await createCharacter(kiwiDb, { name: 'Bob', gender: 'man' });

    expect(pearFacts.name).toBe('Bob');
    expect(pearFacts.nameKey).toBe('bob');
    expect(pearFacts.gender).toBe('man');
    expect(pearFacts.level).toBe(1);
    expect(pearFacts.xp).toBe(0);
    expect(pearFacts.coins).toBe(0);
    expect(pearFacts.hp).toBe(24);
    expect(pearFacts.maxHp).toBe(24);
    expect(pearFacts.sword).toBeNull();
    expect(pearFacts.armor).toBeNull();
    expect(pearFacts.place).toBe('town');
    expect([pearFacts.x, pearFacts.y]).toEqual([townSpawn[0], townSpawn[1]]);

    const mangoRead = await getById(kiwiDb, pearFacts.id);
    expect(mangoRead).toEqual(pearFacts);
  });

  it('finds a character by its comparison key', async () => {
    const bananaFacts = await createCharacter(kiwiDb, { name: 'Bob', gender: 'man' });

    const appleFound = await getByNameKey(kiwiDb, 'bob');
    expect(appleFound?.id).toBe(bananaFacts.id);
    expect(await getByNameKey(kiwiDb, 'nobody')).toBeNull();
  });

  it('returns null for an unknown id', async () => {
    expect(await getById(kiwiDb, 'no-such-id')).toBeNull();
  });

  it('refuses a second insert with the same name_key', async () => {
    await createCharacter(kiwiDb, { name: 'Bob', gender: 'man' });

    // " bob " trims and lowercases to the same key as "Bob", so the UNIQUE index rejects it.
    await expect(createCharacter(kiwiDb, { name: ' bob ', gender: 'woman' })).rejects.toThrow();
  });

  it('refuses a blank name before touching the table', async () => {
    await expect(createCharacter(kiwiDb, { name: '   ', gender: 'woman' })).rejects.toThrow();
    const countRow = await kiwiDb.prepare('SELECT COUNT(*) AS total FROM characters').first<{ total: number }>();
    expect(countRow?.total).toBe(0);
  });

  it('saves only the facts given and leaves the rest unchanged', async () => {
    const peachFacts = await createCharacter(kiwiDb, { name: 'Ada', gender: 'woman' });

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
      level: 2,
      xp: 3,
      hp: 30,
      maxHp: 32,
      coins: 7,
      sword: 'shortSword',
    });
  });

  it('writes x and y alone and keeps every other column', async () => {
    const cherryFacts = await createCharacter(kiwiDb, { name: 'Cy', gender: 'man' });

    const grapeSaved = await saveFacts(kiwiDb, cherryFacts.id, { x: 512, y: 300 });

    expect(grapeSaved).toEqual({ ...cherryFacts, x: 512, y: 300 });
    expect(await getById(kiwiDb, cherryFacts.id)).toEqual({ ...cherryFacts, x: 512, y: 300 });
  });

  it('can clear a gear slot with null and change the zone', async () => {
    const lemonFacts = await createCharacter(kiwiDb, { name: 'Dee', gender: 'woman' });
    await saveFacts(kiwiDb, lemonFacts.id, { armor: 'leather', place: 'green' });

    const figSaved = await saveFacts(kiwiDb, lemonFacts.id, { armor: null });

    expect(figSaved?.armor).toBeNull();
    expect(figSaved?.place).toBe('green');
  });

  it('returns null when saving facts for an unknown id', async () => {
    expect(await saveFacts(kiwiDb, 'no-such-id', { coins: 1 })).toBeNull();
  });
});
