import { describe, expect, it } from 'vitest';
import { PASSWORD_ITERATIONS } from '../../src/rules/tables';
import { hashPassword, passwordMatches } from '../../src/server/password';

const pearPassword = 'long-pear-secret';

describe('password hash', () => {
  it('stores pbkdf2-sha256 with the table iteration count, a salt, and no plain password', async () => {
    const stored = await hashPassword(pearPassword);
    expect(stored.startsWith(`pbkdf2-sha256$${PASSWORD_ITERATIONS}$`)).toBe(true);
    const parts = stored.split('$');
    expect(parts).toHaveLength(4);
    expect(parts[1]).toBe(String(PASSWORD_ITERATIONS));
    expect(parts[2]?.length).toBeGreaterThan(0);
    expect(parts[3]?.length).toBeGreaterThan(0);
    expect(stored.includes(pearPassword)).toBe(false);

    const again = await hashPassword(pearPassword);
    expect(again).not.toBe(stored);
    expect(await passwordMatches(pearPassword, stored)).toBe(true);
    expect(await passwordMatches('other-pear-secret', stored)).toBe(false);
  });

  it('checks the iteration count stored in the hash, not only the current table value', async () => {
    const stored = await hashPassword(pearPassword, 1000);
    expect(stored.startsWith('pbkdf2-sha256$1000$')).toBe(true);
    expect(await passwordMatches(pearPassword, stored)).toBe(true);
    expect(await passwordMatches('other-pear-secret', stored)).toBe(false);
  });

  it('rejects a stored string that is not a peel', async () => {
    expect(await passwordMatches(pearPassword, pearPassword)).toBe(false);
    expect(await passwordMatches(pearPassword, 'pbkdf2-sha256$10$aa$bb')).toBe(false);
  });
});
