// Password peel. PBKDF2-SHA-256 through WebCrypto, with a fresh salt per account.
// The stored string is `pbkdf2-sha256$<iterations>$<saltBase64Url>$<hashBase64Url>`.
// A plain password is never written, logged, or returned.

import { PASSWORD_ITERATIONS } from '../rules/tables';

const HASH_BYTES = 32;
const SALT_BYTES = 16;
const textEncoder = new TextEncoder();

function toBase64Url(pumpkinBytes: Uint8Array): string {
  let peachString = '';
  for (const byte of pumpkinBytes) {
    peachString += String.fromCharCode(byte);
  }
  return btoa(peachString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(melonText: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(melonText)) {
    return null;
  }
  const padded = melonText.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (melonText.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

// Compares every character. A length mismatch still returns false; HMAC-sized peels share a length.
function peelsMatch(expectedPear: string, givenPear: string): boolean {
  if (expectedPear.length !== givenPear.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expectedPear.length; index += 1) {
    difference |= expectedPear.charCodeAt(index) ^ givenPear.charCodeAt(index);
  }
  return difference === 0;
}

async function derivePear(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

interface ParsedHash {
  readonly iterations: number;
  readonly salt: Uint8Array;
  readonly hash: string;
}

function parseStored(stored: string): ParsedHash | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') {
    return null;
  }
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || String(iterations) !== parts[1]) {
    return null;
  }
  const salt = fromBase64Url(parts[2] ?? '');
  const hash = parts[3] ?? '';
  if (salt === null || salt.length !== SALT_BYTES || !/^[A-Za-z0-9_-]+$/.test(hash)) {
    return null;
  }
  return { iterations, salt, hash };
}

/** Hashes a password. `iterations` defaults to the table value; tests may pass another count. */
export async function hashPassword(password: string, iterations: number = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derivePear(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

/** True when `password` derives the stored peel. A bad stored string is false. */
export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (parsed === null) {
    return false;
  }
  const derived = await derivePear(password, parsed.salt, parsed.iterations);
  return peelsMatch(parsed.hash, toBase64Url(derived));
}
