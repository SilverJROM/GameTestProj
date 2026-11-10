import { describe, expect, it } from 'vitest';
import { passwordOk, usernameKey } from '../../src/rules/accounts';
import { FAILED_SIGNIN_DELAY_MS, MAX_AVATARS_PER_ACCOUNT, PASSWORD_ITERATIONS, WORLD_EPOCH } from '../../src/rules/tables';

describe('account rules', () => {
  it('accepts a username of letters, digits, dash, and underscore, and lowercases the key', () => {
    expect(usernameKey('Ada')).toBe('ada');
    expect(usernameKey('bob_1-2')).toBe('bob_1-2');
    expect(usernameKey('a'.repeat(3))).toBe('aaa');
    expect(usernameKey('a'.repeat(20))).toBe('a'.repeat(20));
  });

  it('refuses a short, long, spaced, or punctuated username', () => {
    expect(usernameKey('ab')).toBeNull();
    expect(usernameKey('a'.repeat(21))).toBeNull();
    expect(usernameKey(' ada')).toBeNull();
    expect(usernameKey('ad a')).toBeNull();
    expect(usernameKey('ada.b')).toBeNull();
    expect(usernameKey('')).toBeNull();
  });

  it('accepts a password from 8 to 128 characters and refuses the edges outside that', () => {
    expect(passwordOk('a'.repeat(8))).toBe(true);
    expect(passwordOk('a'.repeat(128))).toBe(true);
    expect(passwordOk('a'.repeat(7))).toBe(false);
    expect(passwordOk('a'.repeat(129))).toBe(false);
    expect(passwordOk('')).toBe(false);
  });

  it('pins the account table constants', () => {
    expect(MAX_AVATARS_PER_ACCOUNT).toBe(2);
    expect(FAILED_SIGNIN_DELAY_MS).toBe(250);
    expect(PASSWORD_ITERATIONS).toBe(10000);
    expect(WORLD_EPOCH).toBe(2);
  });
});
