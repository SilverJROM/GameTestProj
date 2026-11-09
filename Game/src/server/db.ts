// Character store over D1. Every value is bound as a parameter; no id or name is ever spliced into SQL.
// Starting facts come from the rules module (level table, gear, region spawn), never from restated numbers.

import { maxHealth, type Hero } from '../rules/logic';
import { normalizeName } from '../rules/names';
import { townSpawn } from '../rules/regions';
import type { ZoneName } from '../rules/tables';

// The slice of the D1 binding this module uses. A real D1Database satisfies it.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface CharacterDb {
  prepare(query: string): D1Statement;
  // D1 runs a batch as one transaction: every statement commits, or none does.
  batch(statements: D1Statement[]): Promise<unknown>;
}

export type Gender = 'woman' | 'man';

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

function rowToFacts(peachRow: CharacterRow): CharacterFacts {
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
    place: peachRow.place,
    x: peachRow.x,
    y: peachRow.y,
  };
}

// Starting character: level 1, full health, no coins or XP, no gear, in town at the first town spawn point.
export async function createCharacter(
  db: CharacterDb,
  input: { readonly name: string; readonly gender: Gender },
): Promise<CharacterFacts> {
  const nameKey = normalizeName(input.name);
  if (nameKey === null) {
    throw new Error('character name must not be blank');
  }

  // A mango-sized starting hero: level 1 with no armor, so max health is the level 1 base HP.
  const mangoStart: Hero = { level: 1, xp: 0, health: 0, coins: 0, sword: null, armor: null, place: 'town' };
  const kiwiMaxHp = maxHealth(mangoStart);
  const [pearX, pearY] = townSpawn;
  const appleId = crypto.randomUUID();

  await db
    .prepare(
      'INSERT INTO characters (id, name, name_key, gender, level, xp, hp, max_hp, coins, sword, armor, place, x, y) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
    )
    .run();

  const bananaFacts = await getById(db, appleId);
  if (bananaFacts === null) {
    throw new Error('inserted character could not be read back');
  }
  return bananaFacts;
}

export async function getById(db: CharacterDb, id: string): Promise<CharacterFacts | null> {
  const row = await db
    .prepare(`SELECT ${ALL_COLUMNS} FROM characters WHERE id = ?`)
    .bind(id)
    .first<CharacterRow>();
  return row === null ? null : rowToFacts(row);
}

// Takes the comparison key (see normalizeName), not the raw typed name.
export async function getByNameKey(db: CharacterDb, nameKey: string): Promise<CharacterFacts | null> {
  const row = await db
    .prepare(`SELECT ${ALL_COLUMNS} FROM characters WHERE name_key = ?`)
    .bind(nameKey)
    .first<CharacterRow>();
  return row === null ? null : rowToFacts(row);
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
