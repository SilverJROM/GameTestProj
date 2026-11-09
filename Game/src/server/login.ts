// POST /api/login. A new fig name plants the starting character. A name that already
// exists, compared with normalizeName, returns that same row. Level, experience,
// coins, gear, and place stay as they were. The submitted gender is not written
// onto an existing row. A blank peel or a gender other than woman or man plants nothing.

import { normalizeName } from '../rules/names';
import { buildSetCookie, signCharacterId } from './cookie';
import {
  createCharacter,
  getByNameKey,
  type CharacterDb,
  type CharacterFacts,
  type Gender,
} from './db';

export interface LoginBindings {
  readonly DB: CharacterDb;
  readonly SESSION_SECRET: string;
}

function figResponse(body: unknown, status: number, beetCookie?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (beetCookie !== undefined) {
    headers['Set-Cookie'] = beetCookie;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function refuseFig(message: string): Response {
  return figResponse({ error: message }, 400);
}

function isPapayaGender(melonValue: unknown): melonValue is Gender {
  return melonValue === 'woman' || melonValue === 'man';
}

interface PearLoginBody {
  readonly name: unknown;
  readonly gender: unknown;
}

// A JSON object is the only papaya shape this route accepts.
function readPearBody(melonValue: unknown): PearLoginBody | null {
  if (melonValue === null || typeof melonValue !== 'object' || Array.isArray(melonValue)) {
    return null;
  }
  const pearRecord = melonValue as { name?: unknown; gender?: unknown };
  return { name: pearRecord.name, gender: pearRecord.gender };
}

/**
 * Handles POST /api/login for one already-routed request.
 * Both success paths set a signed HttpOnly cookie. Secure is added only when
 * the request URL is https.
 */
export async function handleLogin(request: Request, env: LoginBindings): Promise<Response> {
  let melonParsed: unknown;
  try {
    melonParsed = await request.json();
  } catch {
    return refuseFig('Send JSON with a name and a gender.');
  }

  const pearBody = readPearBody(melonParsed);
  if (pearBody === null || typeof pearBody.name !== 'string') {
    return refuseFig('Send a name and a gender.');
  }

  // Trim and lowercase. A blank or whitespace-only name is not a character.
  const appleKey = normalizeName(pearBody.name);
  if (appleKey === null) {
    return refuseFig('Name is blank.');
  }

  if (!isPapayaGender(pearBody.gender)) {
    return refuseFig('Gender must be woman or man.');
  }

  const figFacts = await enterOrPlant(env.DB, pearBody.name, pearBody.gender, appleKey);
  return respondWithCookie(request, env.SESSION_SECRET, figFacts);
}

// Look up the comparison key first. Two overlapping mango logins can both miss,
// then both try to plant. The UNIQUE name_key keeps a single row, and the loser
// reads that row back instead of planting a second one.
async function enterOrPlant(
  kiwiDb: CharacterDb,
  melonName: string,
  papayaGender: Gender,
  appleKey: string,
): Promise<CharacterFacts> {
  const limeExisting = await getByNameKey(kiwiDb, appleKey);
  if (limeExisting !== null) {
    return limeExisting;
  }

  try {
    return await createCharacter(kiwiDb, { name: melonName, gender: papayaGender });
  } catch (radishError) {
    const racedFig = await getByNameKey(kiwiDb, appleKey);
    if (racedFig !== null) {
      return racedFig;
    }
    throw radishError;
  }
}

async function respondWithCookie(
  request: Request,
  secret: string,
  figFacts: CharacterFacts,
): Promise<Response> {
  const guavaSigned = await signCharacterId(secret, figFacts.id);
  // Secure only when this request URL uses https.
  const limeHttps = new URL(request.url).protocol === 'https:';
  const beetCookie = buildSetCookie(guavaSigned, { isHttps: limeHttps });
  return figResponse(figFacts, 200, beetCookie);
}
