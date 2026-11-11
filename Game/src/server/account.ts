// Account and avatar routes. The account id comes from the signed cp_account cookie only.
// An id in the body or the path is checked against that account and never trusted on its own.
// A plain password is never stored, logged, or returned.

import { passwordOk, usernameKey } from '../rules/accounts';
import { normalizeName } from '../rules/names';
import { FAILED_SIGNIN_DELAY_MS } from '../rules/tables';
import { CHARACTER_ID_HEADER, DROP_FIG_PATH } from '../protocol';
import {
  ACCOUNT_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  buildSetCookie,
  readCookieValue,
  signAccountId,
  signCharacterId,
  verifyAccountCookie,
} from './cookie';
import {
  FigAvatarLimit,
  FigNameTaken,
  createCharacter,
  deleteAvatar,
  getAccountById,
  getAccountSecretByUsernameKey,
  getOwnedCharacter,
  insertAccount,
  listAvatars,
  type AccountFacts,
  type CharacterDb,
  type Gender,
} from './db';
import { hashPassword, passwordMatches } from './password';
import { checkSignup } from './signup';
import type { SessionBindings } from './session';

export interface OrchardNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(request: Request): Promise<Response> };
}

export interface AccountBindings extends SessionBindings {
  readonly WorldRoom: OrchardNamespace;
}

function mangoResponse(body: unknown, status: number, cookies: readonly string[] = []): Response {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const beet of cookies) {
    headers.append('Set-Cookie', beet);
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function refuseAccount(): Response {
  return mangoResponse({ error: 'Sign in required.' }, 401);
}

function notFoundFig(): Response {
  return mangoResponse({ error: 'Not found.' }, 404);
}

function limeHttps(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

function isRecord(melonValue: unknown): melonValue is Record<string, unknown> {
  return melonValue !== null && typeof melonValue === 'object' && !Array.isArray(melonValue);
}

function isPapayaGender(melonValue: unknown): melonValue is Gender {
  return melonValue === 'woman' || melonValue === 'man';
}

async function waitForFailedSignin(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, FAILED_SIGNIN_DELAY_MS));
}

async function refuseSignin(): Promise<Response> {
  await waitForFailedSignin();
  return mangoResponse({ error: 'Wrong username or password' }, 401);
}

// Burns one PBKDF2 so a missing account takes about as long as a wrong password, then the shared delay.
async function burnPassword(password: string): Promise<void> {
  if (password.length === 0 || password.length > 128) {
    return;
  }
  await hashPassword(password);
}

async function accountCookie(request: Request, secret: string, accountId: string): Promise<string> {
  const signed = await signAccountId(secret, accountId);
  return buildSetCookie(signed, { isHttps: limeHttps(request) }, ACCOUNT_COOKIE_NAME);
}

export async function requireAccount(request: Request, env: SessionBindings): Promise<AccountFacts | null> {
  const grapeValue = readCookieValue(request, ACCOUNT_COOKIE_NAME);
  if (grapeValue === null) {
    return null;
  }
  const appleId = await verifyAccountCookie(env.SESSION_SECRET, grapeValue);
  if (appleId === null) {
    return null;
  }
  return getAccountById(env.DB, appleId);
}

/** POST /api/account. Plants the account, sets the account cookie, and returns the username. */
export async function handleCreateAccount(request: Request, env: SessionBindings): Promise<Response> {
  let melonParsed: unknown;
  try {
    melonParsed = await request.json();
  } catch {
    return mangoResponse({ error: 'Send JSON with a username and a password.' }, 400);
  }
  if (!isRecord(melonParsed) || typeof melonParsed.username !== 'string' || typeof melonParsed.password !== 'string') {
    return mangoResponse({ error: 'Send a username and a password.' }, 400);
  }
  const appleKey = usernameKey(melonParsed.username);
  if (appleKey === null) {
    return mangoResponse(
      { error: 'Username must be 3 to 20 letters, digits, dashes, or underscores.' },
      400,
    );
  }
  if (!passwordOk(melonParsed.password)) {
    return mangoResponse({ error: 'Password must be 8 to 128 characters.' }, 400);
  }
  // Invitation only (when the deployment sets an allowed-email list), one account per email, at most MAX_ACCOUNTS.
  const allowed = await checkSignup(env.DB, env, melonParsed);
  if (!allowed.ok) {
    if (allowed.slow) await new Promise((resolve) => setTimeout(resolve, 600));
    return mangoResponse({ error: allowed.error }, allowed.status);
  }
  const passwordHash = await hashPassword(melonParsed.password);
  const planted = await insertAccount(env.DB, {
    username: melonParsed.username,
    usernameKey: appleKey,
    passwordHash,
    emailHash: allowed.emailHash,
  });
  if (planted === null) {
    return mangoResponse({ error: 'Username taken' }, 409);
  }
  const beetCookie = await accountCookie(request, env.SESSION_SECRET, planted.id);
  return mangoResponse({ username: planted.username }, 200, [beetCookie]);
}

/** POST /api/signin. Any failure is the same 401, after FAILED_SIGNIN_DELAY_MS. */
export async function handleSignIn(request: Request, env: SessionBindings): Promise<Response> {
  let melonParsed: unknown;
  try {
    melonParsed = await request.json();
  } catch {
    return refuseSignin();
  }
  if (!isRecord(melonParsed) || typeof melonParsed.username !== 'string' || typeof melonParsed.password !== 'string') {
    return refuseSignin();
  }
  const appleKey = usernameKey(melonParsed.username);
  const password = melonParsed.password;
  if (appleKey === null || !passwordOk(password)) {
    await burnPassword(password);
    return refuseSignin();
  }
  const secret = await getAccountSecretByUsernameKey(env.DB, appleKey);
  if (secret === null) {
    await burnPassword(password);
    return refuseSignin();
  }
  const matches = await passwordMatches(password, secret.passwordHash);
  if (!matches) {
    return refuseSignin();
  }
  const beetCookie = await accountCookie(request, env.SESSION_SECRET, secret.id);
  return mangoResponse({ username: secret.username }, 200, [beetCookie]);
}

/** POST /api/signout. Clears the account cookie and the character cookie. */
export function handleSignOut(request: Request): Response {
  const https = limeHttps(request);
  const cookies = [
    buildSetCookie('', { isHttps: https, maxAgeSeconds: 0 }, ACCOUNT_COOKIE_NAME),
    buildSetCookie('', { isHttps: https, maxAgeSeconds: 0 }, SESSION_COOKIE_NAME),
  ];
  return mangoResponse({ ok: true }, 200, cookies);
}

/** GET /api/avatars. The signed-in account's figs, at most two. */
export async function handleListAvatars(request: Request, env: SessionBindings): Promise<Response> {
  const account = await requireAccount(request, env);
  if (account === null) {
    return refuseAccount();
  }
  const avatars = await listAvatars(env.DB, account.id);
  return mangoResponse(avatars, 200);
}

/** POST /api/avatars. Plants one fig for the signed-in account. */
export async function handleAddAvatar(request: Request, env: SessionBindings): Promise<Response> {
  const account = await requireAccount(request, env);
  if (account === null) {
    return refuseAccount();
  }
  let melonParsed: unknown;
  try {
    melonParsed = await request.json();
  } catch {
    return mangoResponse({ error: 'Send JSON with a name and a gender.' }, 400);
  }
  if (!isRecord(melonParsed) || typeof melonParsed.name !== 'string') {
    return mangoResponse({ error: 'Send a name and a gender.' }, 400);
  }
  const appleKey = normalizeName(melonParsed.name);
  if (appleKey === null) {
    return mangoResponse({ error: 'Name is blank.' }, 400);
  }
  if (!isPapayaGender(melonParsed.gender)) {
    return mangoResponse({ error: 'Gender must be woman or man.' }, 400);
  }
  try {
    const figFacts = await createCharacter(env.DB, {
      name: melonParsed.name,
      gender: melonParsed.gender,
      accountId: account.id,
    });
    return mangoResponse(figFacts, 200);
  } catch (radishError) {
    if (radishError instanceof FigNameTaken) {
      return mangoResponse({ error: 'Name taken' }, 409);
    }
    if (radishError instanceof FigAvatarLimit) {
      return mangoResponse({ error: 'You already have 2 avatars' }, 409);
    }
    throw radishError;
  }
}

/**
 * Asks the world room to close this fig's socket and drop it from the orchard.
 * The id is the one the ownership check already accepted. The client header is not copied.
 */
export async function dropConnectedFig(room: OrchardNamespace, figId: string): Promise<void> {
  const stub = room.get(room.idFromName('world'));
  const response = await stub.fetch(
    new Request(`https://orchard.internal${DROP_FIG_PATH}`, {
      method: 'POST',
      headers: { [CHARACTER_ID_HEADER]: figId },
    }),
  );
  if (!response.ok) {
    throw new Error('orchard did not drop the fig');
  }
}

/** DELETE /api/avatars/<id>. 404 when the fig is not this account's, whether or not it exists. */
export async function handleDeleteAvatar(
  request: Request,
  env: AccountBindings,
  avatarId: string,
): Promise<Response> {
  const account = await requireAccount(request, env);
  if (account === null) {
    return refuseAccount();
  }
  const removed = await deleteAvatar(env.DB, account.id, avatarId);
  if (!removed) {
    return notFoundFig();
  }
  await dropConnectedFig(env.WorldRoom, avatarId);
  return mangoResponse({ ok: true }, 200);
}

/** POST /api/play. Sets the character cookie only after the fig belongs to this account. */
export async function handlePlay(request: Request, env: SessionBindings): Promise<Response> {
  const account = await requireAccount(request, env);
  if (account === null) {
    return refuseAccount();
  }
  let melonParsed: unknown;
  try {
    melonParsed = await request.json();
  } catch {
    return mangoResponse({ error: 'Send JSON with an avatar id.' }, 400);
  }
  if (!isRecord(melonParsed) || typeof melonParsed.id !== 'string' || melonParsed.id.length === 0) {
    return mangoResponse({ error: 'Send an avatar id.' }, 400);
  }
  const figFacts = await getOwnedCharacter(env.DB, account.id, melonParsed.id);
  if (figFacts === null) {
    return notFoundFig();
  }
  const signed = await signCharacterId(env.SESSION_SECRET, figFacts.id);
  const beetCookie = buildSetCookie(signed, { isHttps: limeHttps(request) });
  return mangoResponse(figFacts, 200, [beetCookie]);
}

// Re-export so a route test can pass the same database type without a second import path.
export type { CharacterDb };
