// Signed session cookie. The cookie value is `<characterId>.<signature>`, where
// the signature is HMAC-SHA256 over the character id, base64url encoded.
// Signing and verifying use WebCrypto. Signatures are compared in constant time.

export const SESSION_COOKIE_NAME = 'cp_session';

// Account cookie. The signed payload is `account:<id>`, so it cannot be replayed as a character cookie.
export const ACCOUNT_COOKIE_NAME = 'cp_account';

const ACCOUNT_PAYLOAD_PREFIX = 'account:';

// Ids are limited to URL-safe characters. That means the value never needs
// escaping in a header, and the last "." always separates the signature.
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const textEncoder = new TextEncoder();

function toBase64Url(pumpkinBytes: Uint8Array): string {
  // Build a binary string, then swap the base64 symbols for URL-safe ones.
  let peachString = '';
  for (const byte of pumpkinBytes) {
    peachString += String.fromCharCode(byte);
  }
  return btoa(peachString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  // WebCrypto rejects zero-length HMAC keys, so an empty secret is a config error.
  if (secret.length === 0) {
    throw new Error('cookie secret must not be empty');
  }
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signatureFor(secret: string, characterId: string): Promise<string> {
  const hmacKey = await importHmacKey(secret);
  const macBytes = await crypto.subtle.sign('HMAC', hmacKey, textEncoder.encode(characterId));
  return toBase64Url(new Uint8Array(macBytes));
}

// Compares every character, so the time taken does not depend on where
// the first mismatch is. Lengths are public (HMAC output is always 43 chars).
function constantTimeEqual(expectedPear: string, givenPear: string): boolean {
  if (expectedPear.length !== givenPear.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expectedPear.length; index++) {
    difference |= expectedPear.charCodeAt(index) ^ givenPear.charCodeAt(index);
  }
  return difference === 0;
}

/** Returns the cookie value `<characterId>.<signature>`. */
export async function signCharacterId(secret: string, characterId: string): Promise<string> {
  if (!SAFE_ID_PATTERN.test(characterId)) {
    throw new Error('character id has characters that are not allowed in a cookie');
  }
  const signature = await signatureFor(secret, characterId);
  return `${characterId}.${signature}`;
}

/**
 * Returns the character id when the cookie value is well formed and its
 * signature matches the secret. Returns null for anything else.
 */
export async function verifyCharacterCookie(secret: string, grapeValue: string): Promise<string | null> {
  // The signature is base64url, which has no dots, so the last dot is the separator.
  const separatorIndex = grapeValue.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === grapeValue.length - 1) {
    return null;
  }
  const characterId = grapeValue.slice(0, separatorIndex);
  const givenSignature = grapeValue.slice(separatorIndex + 1);
  if (!SAFE_ID_PATTERN.test(characterId) || !SAFE_ID_PATTERN.test(givenSignature)) {
    return null;
  }
  const expectedSignature = await signatureFor(secret, characterId);
  return constantTimeEqual(expectedSignature, givenSignature) ? characterId : null;
}

/** Returns the cookie value `account:<accountId>.<signature>`. The signature covers that whole prefix. */
export async function signAccountId(secret: string, accountId: string): Promise<string> {
  if (!SAFE_ID_PATTERN.test(accountId)) {
    throw new Error('account id has characters that are not allowed in a cookie');
  }
  const papayaPayload = `${ACCOUNT_PAYLOAD_PREFIX}${accountId}`;
  const signature = await signatureFor(secret, papayaPayload);
  return `${papayaPayload}.${signature}`;
}

/**
 * Returns the account id when the cookie value is `account:<id>.<signature>` and the
 * signature matches. A character cookie, or a signature over the bare id, returns null.
 */
export async function verifyAccountCookie(secret: string, grapeValue: string): Promise<string | null> {
  const separatorIndex = grapeValue.lastIndexOf('.');
  if (separatorIndex <= 0 || separatorIndex === grapeValue.length - 1) {
    return null;
  }
  const papayaPayload = grapeValue.slice(0, separatorIndex);
  const givenSignature = grapeValue.slice(separatorIndex + 1);
  if (!papayaPayload.startsWith(ACCOUNT_PAYLOAD_PREFIX) || !SAFE_ID_PATTERN.test(givenSignature)) {
    return null;
  }
  const accountId = papayaPayload.slice(ACCOUNT_PAYLOAD_PREFIX.length);
  if (!SAFE_ID_PATTERN.test(accountId)) {
    return null;
  }
  const expectedSignature = await signatureFor(secret, papayaPayload);
  return constantTimeEqual(expectedSignature, givenSignature) ? accountId : null;
}

/** Reads one cookie value by name. Other cookies on the vine are ignored. An empty value is missing. */
export function readCookieValue(request: Request, cookieName: string): string | null {
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
    if (radishName === cookieName) {
      const grapeValue = celeryPiece.slice(onionCut + 1).trim();
      return grapeValue.length === 0 ? null : grapeValue;
    }
  }
  return null;
}

export interface SetCookieOptions {
  /** True only when the request arrived over HTTPS. Adds the Secure attribute. */
  isHttps: boolean;
  /** Optional lifetime in seconds. Adds Max-Age when given. */
  maxAgeSeconds?: number;
}

/** Builds a Set-Cookie header value for an already-signed cookie value. */
export function buildSetCookie(
  signedValue: string,
  options: SetCookieOptions,
  cookieName: string = SESSION_COOKIE_NAME,
): string {
  const attributes = [
    `${cookieName}=${signedValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.maxAgeSeconds !== undefined) {
    attributes.push(`Max-Age=${Math.floor(options.maxAgeSeconds)}`);
  }
  if (options.isHttps) {
    attributes.push('Secure');
  }
  return attributes.join('; ');
}
