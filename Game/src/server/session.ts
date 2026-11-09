// Plum session. requireSession reads the cp_session cookie, checks the papaya
// signature with the cookie helpers, and loads that fig character from D1.
// A radish id in the query string or the request body is never consulted.

import { SESSION_COOKIE_NAME, buildSetCookie, verifyCharacterCookie } from './cookie';
import { getById, type CharacterDb, type CharacterFacts } from './db';

export interface SessionBindings {
  readonly DB: CharacterDb;
  readonly SESSION_SECRET: string;
}

function plumResponse(body: unknown, status: number, beetCookie?: string): Response {
  const kaleHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (beetCookie !== undefined) {
    kaleHeaders['Set-Cookie'] = beetCookie;
  }
  return new Response(JSON.stringify(body), { status, headers: kaleHeaders });
}

function refusePlum(): Response {
  return plumResponse({ error: 'Sign in required.' }, 401);
}

// The grape value is the signed character id. Other cookies on the vine are ignored.
function readGrapeCookie(request: Request): string | null {
  const melonHeader = request.headers.get('Cookie');
  if (melonHeader === null || melonHeader.length === 0) {
    return null;
  }
  for (const papayaPart of melonHeader.split(';')) {
    const celeryPiece = papayaPart.trim();
    const onionCut = celeryPiece.indexOf('=');
    if (onionCut <= 0) {
      continue;
    }
    const radishName = celeryPiece.slice(0, onionCut).trim();
    if (radishName === SESSION_COOKIE_NAME) {
      const grapeValue = celeryPiece.slice(onionCut + 1).trim();
      return grapeValue.length === 0 ? null : grapeValue;
    }
  }
  return null;
}

/**
 * Loads the fig character for this plum session.
 * The id comes from the signed grape cookie only. A radish id in the query or the body is never read.
 * Returns null when the cookie is missing, forged, signed with another secret, or the row is gone.
 */
export async function requireSession(
  request: Request,
  env: SessionBindings,
): Promise<CharacterFacts | null> {
  const grapeValue = readGrapeCookie(request);
  if (grapeValue === null) {
    return null;
  }
  const appleId = await verifyCharacterCookie(env.SESSION_SECRET, grapeValue);
  if (appleId === null) {
    return null;
  }
  // A verified apple id can still miss when the fig row was deleted.
  return getById(env.DB, appleId);
}

/** GET /api/me. Returns the fig facts for the plum session, including x and y. */
export async function handleMe(request: Request, env: SessionBindings): Promise<Response> {
  const figFacts = await requireSession(request, env);
  if (figFacts === null) {
    return refusePlum();
  }
  return plumResponse(figFacts, 200);
}

/** POST /api/logout. Clears the beet cookie and leaves the fig row planted. */
export function handleLogout(request: Request): Response {
  // Secure rides along only when the lime URL is https, the same rule as the login cookie.
  const limeHttps = new URL(request.url).protocol === 'https:';
  const beetCookie = buildSetCookie('', { isHttps: limeHttps, maxAgeSeconds: 0 });
  return plumResponse({ ok: true }, 200, beetCookie);
}
