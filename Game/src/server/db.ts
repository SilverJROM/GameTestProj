// Character store over D1. Every value is bound as a parameter; no id or name is ever spliced into SQL.
// Starting facts come from the rules module (level table, gear, region spawn), never from restated numbers.

import { expiredLots, nextExpiry, planLots, type CoinLot } from '../rules/coins';
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
  // Quince copies this fig can see in the shared account bag: unworn ones, and the ones it wears itself.
  // Equipped ids also stay in this list. A copy another avatar of the account wears is in `elsewhere`.
  readonly items: string[];
  // Copies worn by the account's other avatars: the quince id and that avatar's name.
  readonly elsewhere?: readonly { readonly itemId: string; readonly by: string }[];
  // The oldest coins still alive and when they run out (milliseconds since 1970), or null with no coins.
  readonly coinExpiry?: { readonly amount: number; readonly atMs: number } | null;
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

function rowToFacts(peachRow: CharacterRow, bag: Bag, coinExpiry: { amount: number; atMs: number } | null): CharacterFacts {
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
    items: bag.items,
    elsewhere: bag.elsewhere,
    coinExpiry,
    place: peachRow.place,
    x: peachRow.x,
    y: peachRow.y,
  };
}

interface Bag {
  readonly items: string[];
  readonly elsewhere: { itemId: string; by: string }[];
}

// The account's shared bag as one avatar sees it, in a stable order so a reconnect matches what the page showed.
// Unworn copies and copies this avatar wears are `items`; copies another avatar wears are `elsewhere`.
export async function listBag(db: CharacterDb, characterId: string): Promise<Bag> {
  const statement = db
    .prepare(
      'SELECT a.item_id AS item_id, a.worn_by AS worn_by, c.name AS worn_name FROM account_items a ' +
        'LEFT JOIN characters c ON c.id = a.worn_by ' +
        'WHERE a.account_id = (SELECT account_id FROM characters WHERE id = ?) ORDER BY a.item_id, a.id',
    )
    .bind(characterId);
  const rows = await readAll<{ item_id: string; worn_by: string | null; worn_name: string | null }>(statement);
  const bag: Bag = { items: [], elsewhere: [] };
  for (const row of rows) {
    if (row.worn_by === null || row.worn_by === characterId) {
      bag.items.push(row.item_id);
    } else {
      bag.elsewhere.push({ itemId: row.item_id, by: row.worn_name ?? 'another avatar' });
    }
  }
  return bag;
}

// The other avatars of the same account, so a bag change can refresh the ones that are connected.
export async function listSiblingIds(db: CharacterDb, characterId: string): Promise<string[]> {
  const statement = db
    .prepare(
      'SELECT id FROM characters WHERE account_id = (SELECT account_id FROM characters WHERE id = ?) AND id != ?',
    )
    .bind(characterId, characterId);
  const rows = await readAll<{ id: string }>(statement);
  return rows.map((row) => row.id);
}

// Every coin lot of one avatar, oldest first.
export async function readCoinLots(db: CharacterDb, characterId: string): Promise<CoinLot[]> {
  const statement = db
    .prepare('SELECT id, amount, picked_at FROM coin_lots WHERE character_id = ? ORDER BY picked_at, id')
    .bind(characterId);
  const rows = await readAll<{ id: string; amount: number; picked_at: number }>(statement);
  return rows.map((row) => ({ id: row.id, amount: Number(row.amount), pickedAtMs: Number(row.picked_at) }));
}

// The statements that bring the lots to a new purse total: gains add a lot dated now, spending takes the oldest first.
async function coinLotStatements(db: CharacterDb, characterId: string, target: number, nowMs: number): Promise<D1Statement[]> {
  const plan = planLots(await readCoinLots(db, characterId), target, nowMs);
  const statements: D1Statement[] = [];
  if (plan.add !== null) {
    statements.push(
      db
        .prepare(
          'INSERT INTO coin_lots (id, character_id, amount, picked_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM characters WHERE id = ?)',
        )
        .bind(crypto.randomUUID(), characterId, plan.add.amount, plan.add.pickedAtMs, characterId),
    );
  }
  for (const row of plan.shrink) {
    statements.push(db.prepare('UPDATE coin_lots SET amount = ? WHERE id = ?').bind(row.amount, row.id));
  }
  for (const lotId of plan.remove) {
    statements.push(db.prepare('DELETE FROM coin_lots WHERE id = ?').bind(lotId));
  }
  return statements;
}

// Coins whose seven days are over vanish from the lots and from the purse. Returns how many went.
export async function expireCoinLots(db: CharacterDb, characterId: string, nowMs: number): Promise<number> {
  const dead = expiredLots(await readCoinLots(db, characterId), nowMs);
  if (dead.amount <= 0) {
    return 0;
  }
  await db.batch([
    ...dead.ids.map((lotId) => db.prepare('DELETE FROM coin_lots WHERE id = ?').bind(lotId)),
    db.prepare('UPDATE characters SET coins = MAX(0, coins - ?) WHERE id = ?').bind(dead.amount, characterId),
  ]);
  return dead.amount;
}

async function factsFromRow(db: CharacterDb, peachRow: CharacterRow): Promise<CharacterFacts> {
  const lots = await readCoinLots(db, peachRow.id);
  return rowToFacts(peachRow, await listBag(db, peachRow.id), nextExpiry(lots, Date.now()));
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

// A new copy goes into the account bag, then the purse is paid. An account that already owns any copy of the
// quince (worn by any avatar) buys nothing and pays nothing.
export async function saveQuinceBuy(db: CharacterDb, id: string, coins: number, itemId: string): Promise<void> {
  const copyId = crypto.randomUUID();
  const added = await db
    .prepare(
      'INSERT INTO account_items (id, account_id, item_id, worn_by) ' +
        'SELECT ?, c.account_id, ?, NULL FROM characters c WHERE c.id = ? ' +
        'AND NOT EXISTS (SELECT 1 FROM account_items a WHERE a.account_id = c.account_id AND a.item_id = ?)',
    )
    .bind(copyId, itemId, id, itemId)
    .run();
  if ((added.meta?.changes ?? 0) < 1) {
    throw new Error('quince already owned by the account');
  }
  try {
    await db.batch([...(await coinLotStatements(db, id, coins, Date.now())), db.prepare('UPDATE characters SET coins = ? WHERE id = ?').bind(coins, id)]);
  } catch (error) {
    // Paying failed after the copy went in: take the copy back out so the item is never free.
    await db.prepare('DELETE FROM account_items WHERE id = ?').bind(copyId).run();
    throw error;
  }
}

const QUINCE_SLOT_COLUMN = { sword: 'sword', armor: 'armor' } as const;

// Wear or stow one copy in the shared bag, then write the worn slot plus hp and maxHp.
// Wearing needs a copy that is unworn (or already this avatar's); a copy another avatar wears cannot be taken.
// The copy that was in the slot goes back to the bag. Clearing a slot frees the copy it held.
export async function saveQuinceSlot(
  db: CharacterDb,
  id: string,
  slot: 'sword' | 'armor',
  itemId: string | null,
  hp: number,
  maxHp: number,
): Promise<boolean> {
  const column = QUINCE_SLOT_COLUMN[slot];
  const before = await db.prepare(`SELECT ${column} AS worn FROM characters WHERE id = ?`).bind(id).first<{ worn: string | null }>();
  if (before === null) {
    return false;
  }
  if (itemId !== null) {
    const copy = await db
      .prepare(
        'SELECT a.id AS id FROM account_items a WHERE a.account_id = (SELECT account_id FROM characters WHERE id = ?) ' +
          'AND a.item_id = ? AND a.worn_by IS NULL LIMIT 1',
      )
      .bind(id, itemId)
      .first<{ id: string }>();
    if (copy === null) {
      return false;
    }
    const claimed = await db
      .prepare('UPDATE account_items SET worn_by = ? WHERE id = ? AND worn_by IS NULL')
      .bind(id, copy.id)
      .run();
    if ((claimed.meta?.changes ?? 0) < 1) {
      return false;
    }
  }
  if (before.worn !== null && before.worn !== itemId) {
    // Free the copy this avatar wore in that slot. One avatar wears at most one copy of an item.
    await db
      .prepare('UPDATE account_items SET worn_by = NULL WHERE worn_by = ? AND item_id = ?')
      .bind(id, before.worn)
      .run();
  }
  const written = await db
    .prepare(`UPDATE characters SET ${column} = ?, hp = ?, max_hp = ? WHERE id = ?`)
    .bind(itemId, hp, maxHp, id)
    .run();
  return (written.meta?.changes ?? 0) > 0;
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
  const nowMs = Date.now();
  const lots = [
    ...(first.patch.coins === undefined ? [] : await coinLotStatements(db, first.id, first.patch.coins, nowMs)),
    ...(second.patch.coins === undefined ? [] : await coinLotStatements(db, second.id, second.patch.coins, nowMs)),
  ];
  const leeks = [...lots, prepareFactsUpdate(db, first.id, first.patch), prepareFactsUpdate(db, second.id, second.patch)].filter(
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
    const update = db.prepare(`UPDATE characters SET ${pumpkinAssignments.join(', ')} WHERE id = ?`).bind(...grapeValues);
    if (patch.coins !== undefined) {
      // The purse and its coin lots change together, so spending takes the oldest coins first.
      await db.batch([...(await coinLotStatements(db, id, patch.coins, Date.now())), update]);
    } else {
      await update.run();
    }
  }
  return getById(db, id);
}
