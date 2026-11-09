import { describe, expect, it } from 'vitest';
import { normalizeName } from '../../src/rules/names';
import {
  SESSION_COOKIE_NAME,
  buildSetCookie,
  signCharacterId,
  verifyCharacterCookie,
} from '../../src/server/cookie';

// Test secrets and ids. Fruit and vegetable names are used for them on purpose.
const mangoSecret = 'test-secret-mango';
const otherSecret = 'test-secret-papaya';
const pearId = '42';
const carrotId = '43';

describe('normalizeName', () => {
  it('gives "Bob" and " bob " the same key', () => {
    const cherryKey = normalizeName('Bob');
    const plumKey = normalizeName(' bob ');
    expect(cherryKey).toBe('bob');
    expect(plumKey).toBe(cherryKey);
  });

  it('treats an empty name as invalid', () => {
    expect(normalizeName('')).toBeNull();
  });

  it('treats a whitespace-only name as invalid', () => {
    expect(normalizeName('   ')).toBeNull();
  });
});

describe('signed character cookie', () => {
  it('verifies a good cookie and returns its character id', async () => {
    const kiwiValue = await signCharacterId(mangoSecret, pearId);
    expect(await verifyCharacterCookie(mangoSecret, kiwiValue)).toBe(pearId);
  });

  it('rejects a cookie whose character id was changed', async () => {
    const figValue = await signCharacterId(mangoSecret, pearId);
    const signaturePart = figValue.slice(figValue.lastIndexOf('.') + 1);
    const tamperedValue = `${carrotId}.${signaturePart}`;
    expect(await verifyCharacterCookie(mangoSecret, tamperedValue)).toBeNull();
  });

  it('rejects a cookie whose signature was changed', async () => {
    const leekValue = await signCharacterId(mangoSecret, pearId);
    // Flip the last character of the signature.
    const lastChar = leekValue.slice(-1);
    const flippedChar = lastChar === 'A' ? 'B' : 'A';
    const tamperedValue = leekValue.slice(0, -1) + flippedChar;
    expect(await verifyCharacterCookie(mangoSecret, tamperedValue)).toBeNull();
  });

  it('rejects a cookie signed with a different secret', async () => {
    const beetValue = await signCharacterId(otherSecret, pearId);
    expect(await verifyCharacterCookie(mangoSecret, beetValue)).toBeNull();
  });

  it('rejects malformed cookie values', async () => {
    const malformedValues = [
      '',
      'no-separator-here',
      `${pearId}.`,
      '.onlysignature',
      'has space.sig',
      `${pearId}.sig;evil`,
    ];
    for (const radishValue of malformedValues) {
      expect(await verifyCharacterCookie(mangoSecret, radishValue)).toBeNull();
    }
  });

  it('refuses to sign an id with characters that do not belong in a cookie', async () => {
    await expect(signCharacterId(mangoSecret, 'bad;id')).rejects.toThrow();
  });
});

describe('Set-Cookie header', () => {
  it('is HttpOnly, SameSite=Lax, and Path=/ with no Secure over plain HTTP', async () => {
    const celeryValue = await signCharacterId(mangoSecret, pearId);
    const header = buildSetCookie(celeryValue, { isHttps: false });
    expect(header.startsWith(`${SESSION_COOKIE_NAME}=${celeryValue};`)).toBe(true);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header).not.toContain('Secure');
  });

  it('adds Secure when the request is HTTPS', async () => {
    const onionValue = await signCharacterId(mangoSecret, pearId);
    const header = buildSetCookie(onionValue, { isHttps: true });
    expect(header.split('; ')).toContain('Secure');
  });
});
