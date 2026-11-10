// Shared orchard setup for worker and integration tests.
// Plants an account, one avatar, and the character cookie the old /api/login used to return.

import { readdirSync, readFileSync } from 'node:fs';
import { ACCOUNT_COOKIE_NAME, SESSION_COOKIE_NAME } from '../../src/server/cookie';
import type { CharacterDb, CharacterFacts } from '../../src/server/db';

export const FIG_PASSWORD = 'pear-orchard-pass';

export interface PlantedFig {
  readonly facts: CharacterFacts;
  readonly grape: string;
  readonly accountValue: string;
  readonly username: string;
}

export type FigFetch = (path: string, init: RequestInit) => Promise<Response>;

// Splits a migration into single statements. Comment lines go first, then the file splits on semicolons.
export function migrationStatements(sqlText: string): string[] {
  return sqlText
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

export async function applyMigrations(db: CharacterDb): Promise<void> {
  const dir = new URL('../../migrations/', import.meta.url);
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sqlText = readFileSync(new URL(file, dir), 'utf8');
    for (const statement of migrationStatements(sqlText)) {
      await db.prepare(statement).run();
    }
  }
}

export async function clearOrchard(db: CharacterDb): Promise<void> {
  await db.prepare('DELETE FROM account_items').run();
  await db.prepare('DELETE FROM coin_lots').run();
  await db.prepare('DELETE FROM characters').run();
  await db.prepare('DELETE FROM accounts').run();
}

export function cookieValue(setCookie: string, name: string): string {
  const pair = setCookie.split(';')[0]?.trim() ?? '';
  const prefix = `${name}=`;
  return pair.startsWith(prefix) ? pair.slice(prefix.length) : '';
}

/** Creates an account, one avatar, and plays it. `grape` is the character cookie value. */
export async function plantPlayingFig(
  figFetch: FigFetch,
  name: string,
  gender: 'woman' | 'man' = 'woman',
): Promise<PlantedFig> {
  const username = name.trim();
  const accountResponse = await figFetch('/api/account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: FIG_PASSWORD }),
  });
  const accountText = await accountResponse.text();
  if (accountResponse.status !== 200) {
    throw new Error(`account ${username} -> ${accountResponse.status} ${accountText}`);
  }
  const accountValue = cookieValue(accountResponse.headers.getSetCookie()[0] ?? '', ACCOUNT_COOKIE_NAME);
  const avatarResponse = await figFetch('/api/avatars', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${ACCOUNT_COOKIE_NAME}=${accountValue}`,
    },
    body: JSON.stringify({ name, gender }),
  });
  const avatarText = await avatarResponse.text();
  if (avatarResponse.status !== 200) {
    throw new Error(`avatar ${name} -> ${avatarResponse.status} ${avatarText}`);
  }
  const avatar = JSON.parse(avatarText) as CharacterFacts;
  const playResponse = await figFetch('/api/play', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${ACCOUNT_COOKIE_NAME}=${accountValue}`,
    },
    body: JSON.stringify({ id: avatar.id }),
  });
  const playText = await playResponse.text();
  if (playResponse.status !== 200) {
    throw new Error(`play ${name} -> ${playResponse.status} ${playText}`);
  }
  const playCookies = playResponse.headers.getSetCookie();
  const sessionSet = playCookies.find((row) => row.startsWith(`${SESSION_COOKIE_NAME}=`)) ?? playCookies[0] ?? '';
  return {
    facts: JSON.parse(playText) as CharacterFacts,
    grape: cookieValue(sessionSet, SESSION_COOKIE_NAME),
    accountValue,
    username,
  };
}
