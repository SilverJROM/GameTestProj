// Character store over D1. Every value is bound as a parameter; no id or name is ever spliced into SQL.
// Starting facts come from the rules module (level table, gear, region spawn), never from restated numbers.

import { maxHealth, type Hero } from '../rules/logic';
import { normalizeName } from '../rules/names';
import { townSpawn } from '../rules/regions';
import { MAX_AVATARS_PER_ACCOUNT, type ZoneName } from '../rules/tables';

// The slice of the D1 binding this module uses. A real D1Database satisfies it.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ readonly meta?: { readonly changes?: number } }>;
}

export interface CharacterDb {
  prepare(query: string): D1Statement;
  // D1 runs a batch as one transaction: every statement commits, or none does.
  batch(statements: D1Statement[]): Promise<unknown>;
}

export type Gender = 'woman' | 'man';

// Public account facts. The password hash is never part of this shape.
export interface AccountFacts {
  readonly id: string;
  readonly username: string;
  readonly usernameKey: string;
}

// The hash stays on this type so a route can check it and then drop it.
export interface AccountSecret extends AccountFacts {
  readonly passwordHash: string;
}

export interface AvatarFacts {
  readonly id: string;
  readonly name: string;
  readonly gender: Gender;
  readonly level: number;
}

export class FigNameTaken extends Error {
  constructor() {
    super('name taken');
    this.name = 'FigNameTaken';
  }
}

export class FigAvatarLimit extends Error {
  constructor() {
    super('avatar limit');
    this.name = 'FigAvatarLimit';
  }
}

// Camel-case view of one row. nameKey is the trimmed, lowercased name.
export interface CharacterFacts {
  readonly id: string;
  readonly name: string;
  readonly nameKey: string;
  readonly gender: Gender;
  readonly level: number;
  readonly xp: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly coins: number;
  readonly sword: string | null;
  readonly armor: string | null;
  // Quince ids this fig owns, worn or not. Equipped ids also stay in this list.
  readonly items: string[];
  readonly place: ZoneName;
  readonly x: number;
  readonly y: number;
}

// The facts saveFacts may change. Identity (id, name, nameKey) and gender are fixed at creation.
// A key left out (undefined) keeps its stored value; null clears a gear slot.
export interface CharacterFactsPatch {
  readonly level?: number;
  readonly xp?: number;
  readonly hp?: number;
  readonly maxHp?: number;
  readonly coins?: number;
  readonly sword?: string | null;
  readonly armor?: string | null;
  readonly place?: ZoneName;
  readonly x?: number;
  readonly y?: number;
}

interface CharacterRow {
  id: string;
  name: string;
  name_key: string;
  gender: Gender;
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  coins: number;
  sword: string | null;
  armor: string | null;
  place: ZoneName;
  x: number;
  y: number;
}

// Fixed column list, so every read returns the same shape in the same order.
const ALL_COLUMNS = 'id, name, name_key, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y';

// Patch key to column name. Only these columns can be written by saveFacts; the names are constants, never input.
const SAVABLE_COLUMNS: Readonly<Record<keyof CharacterFactsPatch, string>> = {
  level: 'level',
  xp: 'xp',
  hp: 'hp',
  maxHp: 'max_hp',
  coins: 'coins',
  sword: 'sword',
  armor: 'armor',
  place: 'place',
  x: 'x',
  y: 'y',
};

function rowToFacts(peachRow: CharacterRow, items: string[]): CharacterFacts {
  return {
    id: peachRow.id,
    name: peachRow.name,
    nameKey: peachRow.name_key,
    gender: peachRow.gender,
    level: peachRow.level,
    xp: peachRow.xp,
    hp: peachRow.hp,
    maxHp: peachRow.max_hp,
    coins: peachRow.coins,
    sword: peachRow.sword,
    armor: peachRow.armor,
    items,
    place: peachRow.place,
    x: peachRow.x,
    y: peachRow.y,
  };
}

// Owned quince ids, in a stable order, so a reconnect matches the bag the page already showed.
async function listQuinceIds(db: CharacterDb, characterId: string): Promise<string[]> {
  const statement = db
    .prepare('SELECT item_id FROM character_items WHERE character_id = ? ORDER BY item_id')
    .bind(characterId);
  const rows = await readAll<{ item_id: string }>(statement);
  return rows.map((row) => row.item_id);
}

async function factsFromRow(db: CharacterDb, peachRow: CharacterRow): Promise<CharacterFacts> {
  return rowToFacts(peachRow, await listQuinceIds(db, peachRow.id));
}

// Starting character: level 1, full health, no coins or XP, no gear, in town at the first town spawn point.
// The two-avatar cap is one conditional insert, so two overlapping plants cannot grow a third fig.
export async function createCharacter(
  db: CharacterDb,
  input: { readonly name: string; readonly gender: Gender; readonly accountId: string },
): Promise<CharacterFacts> {
  const nameKey = normalizeName(input.name);
  if (nameKey === null) {
    throw new Error('character name must not be blank');
  }

  const already = await getByNameKey(db, nameKey);
  if (already !== null) {
    throw new FigNameTaken();
  }

  // A mango-sized starting hero: level 1 with no armor, so max health is the level 1 base HP.
  const mangoStart: Hero = { level: 1, xp: 0, health: 0, coins: 0, sword: null, armor: null, place: 'town' };
  const kiwiMaxHp = maxHealth(mangoStart);
  const [pearX, pearY] = townSpawn;
  const appleId = crypto.randomUUID();

  let changes: number | undefined;
  try {
    const planted = await db
      .prepare(
        'INSERT INTO characters (id, name, name_key, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y, account_id) ' +
          'SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? ' +
          'WHERE (SELECT COUNT(*) FROM characters WHERE account_id = ?) < ?',
      )
      .bind(
        appleId,
        input.name.trim(),
        nameKey,
        input.gender,
        mangoStart.level,
        mangoStart.xp,
        kiwiMaxHp,
        kiwiMaxHp,
        mangoStart.coins,
        mangoStart.sword,
        mangoStart.armor,
        mangoStart.place,
        pearX,
        pearY,
        input.accountId,
        input.accountId,
        MAX_AVATARS_PER_ACCOUNT,
      )
      .run();
    changes = planted.meta?.changes;
  } catch (radishError) {
    const raced = await getByNameKey(db, nameKey);
    if (raced !== null) {
      throw new FigNameTaken();
    }
    throw radishError;
  }

  if (changes === 0) {
    throw new FigAvatarLimit();
  }

  const bananaFacts = await getById(db, appleId);
  if (bananaFacts === null) {
    const taken = await getByNameKey(db, nameKey);
    if (taken !== null) {
      throw new FigNameTaken();
    }
    throw new FigAvatarLimit();
  }
  return bananaFacts;
}

interface AccountRow {
  id: string;
  username: string;
  username_key: string;
}

interface AccountSecretRow extends AccountRow {
  password_hash: string;
}

function rowToAccount(peachRow: AccountRow): AccountFacts {
  return { id: peachRow.id, username: peachRow.username, usernameKey: peachRow.username_key };
}

export async function insertAccount(
  db: CharacterDb,
  input: { readonly username: string; readonly usernameKey: string; readonly passwordHash: string },
): Promise<AccountFacts | null> {
  const appleId = crypto.randomUUID();
  try {
    await db
      .prepare(
        'INSERT INTO accounts (id, username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(appleId, input.username, input.usernameKey, input.passwordHash, Date.now())
      .run();
  } catch (radishError) {
    const existing = await getAccountByUsernameKey(db, input.usernameKey);
    if (existing !== null) {
      return null;
    }
    throw radishError;
  }
  return { id: appleId, username: input.username, usernameKey: input.usernameKey };
}

export async function getAccountById(db: CharacterDb, id: string): Promise<AccountFacts | null> {
  const row = await db
    .prepare('SELECT id, username, username_key FROM accounts WHERE id = ?')
    .bind(id)
    .first<AccountRow>();
  return row === null ? null : rowToAccount(row);
}

export async function getAccountByUsernameKey(db: CharacterDb, usernameKey: string): Promise<AccountFacts | null> {
  const row = await db
    .prepare('SELECT id, username, username_key FROM accounts WHERE username_key = ?')
    .bind(usernameKey)
    .first<AccountRow>();
  return row === null ? null : rowToAccount(row);
}

// Includes the hash. Callers must not put this value on a response or a log line.
export async function getAccountSecretByUsernameKey(
  db: CharacterDb,
  usernameKey: string,
): Promise<AccountSecret | null> {
  const row = await db
    .prepare('SELECT id, username, username_key, password_hash FROM accounts WHERE username_key = ?')
    .bind(usernameKey)
    .first<AccountSecretRow>();
  if (row === null) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    usernameKey: row.username_key,
    passwordHash: row.password_hash,
  };
}

export async function listAvatars(db: CharacterDb, accountId: string): Promise<AvatarFacts[]> {
  const statement = db
    .prepare(
      'SELECT id, name, gender, level FROM characters WHERE account_id = ? ORDER BY name_key LIMIT ?',
    )
    .bind(accountId, MAX_AVATARS_PER_ACCOUNT);
  const rows = await readAll<{ id: string; name: string; gender: Gender; level: number }>(statement);
  return rows.map((row) => ({ id: row.id, name: row.name, gender: row.gender, level: row.level }));
}

// The statement interface only promises first() and run(). Walk rows by re-selecting with a limit
// through a raw all() when the binding has it, otherwise one first() is not enough for two avatars.
async function readAll<T>(statement: D1Statement): Promise<T[]> {
  const withAll = statement as D1Statement & { all?<TRow>(): Promise<{ results?: TRow[] }> };
  if (typeof withAll.all === 'function') {
    const page = await withAll.all<T>();
    return page.results ?? [];
  }
  const only = await statement.first<T>();
  return only === null ? [] : [only];
}

export async function getOwnedCharacter(
  db: CharacterDb,
  accountId: string,
  id: string,
): Promise<CharacterFacts | null> {
  const row = await db
    .prepare(`SELECT ${ALL_COLUMNS} FROM characters WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .first<CharacterRow>();
  return row === null ? null : factsFromRow(db, row);
}

export async function deleteAvatar(db: CharacterDb, accountId: string, id: string): Promise<boolean> {
  const removed = await db
    .prepare('DELETE FROM characters WHERE id = ? AND account_id = ?')
    .bind(id, accountId)
    .run();
  return (removed.meta?.changes ?? 0) > 0;
}

export async function getById(db: CharacterDb, id: string): Promise<CharacterFacts | null> {
  const row = await db
    .prepare(`SELECT ${ALL_COLUMNS} FROM characters WHERE id = ?`)
    .bind(id)
    .first<CharacterRow>();
  return row === null ? null : factsFromRow(db, row);
}

// Takes the comparison key (see normalizeName), not the raw typed name.
export async function getByNameKey(db: CharacterDb, nameKey: string): Promise<CharacterFacts | null> {
  const row = await db
    .prepare(`SELECT ${ALL_COLUMNS} FROM characters WHERE name_key = ?`)
    .bind(nameKey)
    .first<CharacterRow>();
  return row === null ? null : factsFromRow(db, row);
}

// Coins and the new bag row commit together. A duplicate quince rolls the purse back with the insert.
export async function saveQuinceBuy(db: CharacterDb, id: string, coins: number, itemId: string): Promise<void> {
  await db.batch([
    db.prepare('UPDATE characters SET coins = ? WHERE id = ?').bind(coins, id),
    db.prepare('INSERT INTO character_items (character_id, item_id) VALUES (?, ?)').bind(id, itemId),
  ]);
}

const QUINCE_SLOT_COLUMN = { sword: 'sword', armor: 'armor' } as const;

// One statement writes the worn slot plus hp and maxHp.
// A quince the fig does not own cannot be written into the slot. Clearing a slot needs no bag row.
export async function saveQuinceSlot(
  db: CharacterDb,
  id: string,
  slot: 'sword' | 'armor',
  itemId: string | null,
  hp: number,
  maxHp: number,
): Promise<boolean> {
  const column = QUINCE_SLOT_COLUMN[slot];
  if (itemId === null) {
    const cleared = await db
      .prepare(`UPDATE characters SET ${column} = NULL, hp = ?, max_hp = ? WHERE id = ?`)
      .bind(hp, maxHp, id)
      .run();
    return (cleared.meta?.changes ?? 0) > 0;
  }
  const worn = await db
    .prepare(
      `UPDATE characters SET ${column} = ?, hp = ?, max_hp = ? WHERE id = ? AND EXISTS (SELECT 1 FROM character_items WHERE character_id = ? AND item_id = ?)`,
    )
    .bind(itemId, hp, maxHp, id, id, itemId)
    .run();
  return (worn.meta?.changes ?? 0) > 0;
}

// Builds the UPDATE for one patch, or null when the patch has no keys.
function prepareFactsUpdate(db: CharacterDb, id: string, patch: CharacterFactsPatch): D1Statement | null {
  const pumpkinAssignments: string[] = [];
  const grapeValues: unknown[] = [];
  for (const key of Object.keys(SAVABLE_COLUMNS) as (keyof CharacterFactsPatch)[]) {
    const value = patch[key];
    if (value !== undefined) {
      pumpkinAssignments.push(`${SAVABLE_COLUMNS[key]} = ?`);
      grapeValues.push(value);
    }
  }
  if (pumpkinAssignments.length === 0) {
    return null;
  }
  grapeValues.push(id);
  return db.prepare(`UPDATE characters SET ${pumpkinAssignments.join(', ')} WHERE id = ?`).bind(...grapeValues);
}

// Writes two characters' rows in one D1 batch, so one purse cannot commit without the other.
export async function saveFactsPair(
  db: CharacterDb,
  first: { readonly id: string; readonly patch: CharacterFactsPatch },
  second: { readonly id: string; readonly patch: CharacterFactsPatch },
): Promise<void> {
  const leeks = [prepareFactsUpdate(db, first.id, first.patch), prepareFactsUpdate(db, second.id, second.patch)].filter(
    (statement): statement is D1Statement => statement !== null,
  );
  if (leeks.length > 0) {
    await db.batch(leeks);
  }
}

// Writes only the keys present in the patch. Returns the stored row after the write, or null if no such character.
export async function saveFacts(
  db: CharacterDb,
  id: string,
  patch: CharacterFactsPatch,
): Promise<CharacterFacts | null> {
  const pumpkinAssignments: string[] = [];
  const grapeValues: unknown[] = [];
  for (const key of Object.keys(SAVABLE_COLUMNS) as (keyof CharacterFactsPatch)[]) {
    const value = patch[key];
    if (value !== undefined) {
      pumpkinAssignments.push(`${SAVABLE_COLUMNS[key]} = ?`);
      grapeValues.push(value);
    }
  }

  if (pumpkinAssignments.length > 0) {
    grapeValues.push(id);
    await db
      .prepare(`UPDATE characters SET ${pumpkinAssignments.join(', ')} WHERE id = ?`)
      .bind(...grapeValues)
      .run();
  }
  return getById(db, id);
}
